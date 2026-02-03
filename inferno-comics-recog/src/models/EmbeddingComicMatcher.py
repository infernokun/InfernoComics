from __future__ import annotations

import os
import cv2
import json
import time
import queue
import pickle
import sqlite3
import hashlib
import threading
import numpy as np

from enum import Enum
from pathlib import Path
from datetime import datetime
from util.Logger import get_logger
from contextlib import contextmanager
from dataclasses import dataclass, field
from curl_cffi.requests import Session as CurlSession
from config.EnvironmentConfig import CACHE_DIR, DB_PATH
from typing import Dict, Optional, Tuple, List, Any, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = get_logger(__name__)

# ============================================================================
# Environment Configuration
# ============================================================================

os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
os.environ.setdefault('OPENCV_LOG_LEVEL', 'ERROR')
cv2.setNumThreads(1)

# ============================================================================
# Custom Exceptions
# ============================================================================

class ComicMatcherError(Exception):
    """Base exception for comic matcher errors."""
    pass


class EmbeddingExtractionError(ComicMatcherError):
    """Raised when embedding extraction fails."""
    pass


class ImageDownloadError(ComicMatcherError):
    """Raised when image download fails."""
    pass


class CacheError(ComicMatcherError):
    """Raised when cache operations fail."""
    pass


class ModelLoadError(ComicMatcherError):
    """Raised when model loading fails."""
    pass


# ============================================================================
# Enums and Constants
# ============================================================================

class MatchStatus(Enum):
    """Status of a match operation."""
    SUCCESS = "success"
    FAILED_EMBEDDING = "failed_features"  # Keep same name for API compatibility
    FAILED_DOWNLOAD = "failed_download"
    PROCESSING_ERROR = "processing_error"
    CACHE_ONLY_SKIP = "cache_only_skip"


# Model configurations - lightweight models that work well on CPU
MODEL_CONFIGS = {
    'ViT-B-32': {
        'name': 'ViT-B-32',
        'pretrained': 'openai',
        'embedding_dim': 512,
        'description': 'Balanced model - good accuracy and speed on CPU'
    },
    'ViT-B-16': {
        'name': 'ViT-B-16',
        'pretrained': 'openai',
        'embedding_dim': 512,
        'description': 'Higher accuracy, slower on CPU'
    },
    'RN50': {
        'name': 'RN50',
        'pretrained': 'openai',
        'embedding_dim': 1024,
        'description': 'ResNet-based, efficient on CPU'
    },
    'ViT-L-14': {
        'name': 'ViT-L-14',
        'pretrained': 'openai',
        'embedding_dim': 768,
        'description': 'Large model - best accuracy, slowest'
    }
}

DEFAULT_MODEL = 'ViT-B-32'


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class CacheItem:
    """Represents a cache item with metadata."""
    data: Any
    created_at: datetime = field(default_factory=datetime.now)
    last_accessed: datetime = field(default_factory=datetime.now)
    access_count: int = 0

    def touch(self) -> None:
        """Update last accessed time and increment count."""
        self.last_accessed = datetime.now()
        self.access_count += 1


@dataclass
class CacheStats:
    """Statistics for cache performance."""
    memory_hits: int = 0
    memory_misses: int = 0
    db_hits: int = 0
    db_misses: int = 0
    evictions: int = 0
    writes_queued: int = 0
    processing_time_saved: float = 0.0

    @property
    def total_requests(self) -> int:
        return self.memory_hits + self.memory_misses + self.db_hits + self.db_misses

    @property
    def hit_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return (self.memory_hits + self.db_hits) / self.total_requests * 100

    @property
    def memory_hit_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.memory_hits / self.total_requests * 100


# ============================================================================
# Utility Functions
# ============================================================================

def safe_progress_callback(
    callback: Optional[Callable[[int, str], None]],
    current_item: int,
    message: str = ""
) -> None:
    """Safely call progress callback, handling None case."""
    if callback is not None:
        try:
            callback(current_item, message)
        except Exception as e:
            logger.warning(f"Progress callback error: {e}")


def compute_url_hash(url: str) -> str:
    """Generate consistent hash for URL."""
    return hashlib.md5(url.encode()).hexdigest()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    a = a.flatten()
    b = b.flatten()
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# ============================================================================
# Database Connection Manager
# ============================================================================

class DatabaseManager:
    """Thread-safe database connection manager with connection pooling."""

    def __init__(self, db_path: str, pool_size: int = 5):
        self.db_path = db_path
        self.pool_size = pool_size
        self._pool: queue.Queue[sqlite3.Connection] = queue.Queue(maxsize=pool_size)
        self._lock = threading.Lock()
        self._initialized = False

    def _create_connection(self) -> sqlite3.Connection:
        """Create a new database connection with optimal settings."""
        conn = sqlite3.connect(self.db_path, timeout=30.0, check_same_thread=False)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA synchronous=NORMAL')
        conn.execute('PRAGMA cache_size=10000')
        conn.execute('PRAGMA temp_store=MEMORY')
        return conn

    @contextmanager
    def get_connection(self):
        """Get a connection from the pool (context manager)."""
        conn = None
        try:
            try:
                conn = self._pool.get_nowait()
            except queue.Empty:
                conn = self._create_connection()

            yield conn
            conn.commit()

            try:
                self._pool.put_nowait(conn)
                conn = None
            except queue.Full:
                pass

        except Exception as e:
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                conn.close()

    def close_all(self):
        """Close all connections in the pool."""
        while True:
            try:
                conn = self._pool.get_nowait()
                conn.close()
            except queue.Empty:
                break


# ============================================================================
# Embedding Cache Manager
# ============================================================================

class EmbeddingCacheManager:
    """High-performance cache manager for embeddings with in-memory storage and async persistence."""

    def __init__(self, db_path: str, max_memory_items: int = 1000):
        self.db_path = db_path
        self.max_memory_items = max_memory_items
        self.db_manager = DatabaseManager(db_path)

        # In-memory caches with RLock for reentrant access
        self._image_cache: Dict[str, CacheItem] = {}
        self._embedding_cache: Dict[str, CacheItem] = {}
        self._image_lock = threading.RLock()
        self._embedding_lock = threading.RLock()

        # Async write queue
        self._write_queue: queue.Queue = queue.Queue()
        self._write_worker_running = True
        self._write_worker = threading.Thread(
            target=self._async_writer,
            daemon=True,
            name="EmbeddingCacheWriter"
        )
        self._write_worker.start()

        # Statistics
        self.stats = CacheStats()

        # Warm cache from database
        self._warm_cache_from_db()

    def _warm_cache_from_db(self) -> None:
        """Load most recent items from database into memory on startup."""
        try:
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT url_hash, url, embedding, embedding_dim, model_name,
                           processing_time, image_shape, was_cropped, last_accessed
                    FROM cached_embeddings
                    ORDER BY last_accessed DESC
                    LIMIT ?
                ''', (self.max_memory_items // 2,))

                rows = cursor.fetchall()

            loaded_count = 0
            for row in rows:
                try:
                    url_hash = row[0]
                    embedding_data = self._deserialize_embedding_from_row(row)
                    if embedding_data:
                        last_accessed = row[8]
                        cache_item = CacheItem(
                            data=embedding_data,
                            last_accessed=datetime.fromisoformat(last_accessed) if last_accessed else datetime.now()
                        )
                        with self._embedding_lock:
                            self._embedding_cache[url_hash] = cache_item
                        loaded_count += 1
                except Exception as e:
                    logger.debug(f"Failed to load cache entry: {e}")

            logger.info(f"Warmed cache with {loaded_count} embedding entries from {len(rows)} database rows")

        except Exception as e:
            logger.warning(f"Failed to warm cache from database: {e}")

    def _deserialize_embedding_from_row(self, row: Tuple) -> Optional[Dict[str, Any]]:
        """Deserialize embedding from database row."""
        try:
            embedding_blob = row[2]
            if not embedding_blob:
                return None

            embedding = pickle.loads(embedding_blob)

            return {
                'embedding': embedding,
                'embedding_dim': row[3],
                'model_name': row[4],
                'processing_time': row[5] or 0.0,
                'image_shape': json.loads(row[6]) if row[6] else None,
                'was_cropped': bool(row[7]) if row[7] is not None else False
            }
        except Exception as e:
            logger.debug(f"Failed to deserialize embedding: {e}")
            return None

    def _async_writer(self) -> None:
        """Background thread that handles database writes in batches."""
        batch: List[Tuple[str, Tuple]] = []
        last_write = time.time()
        batch_size = 10
        batch_timeout = 2.0

        while self._write_worker_running:
            try:
                timeout = max(0.1, batch_timeout - (time.time() - last_write))

                try:
                    item = self._write_queue.get(timeout=timeout)
                    batch.append(item)

                    while len(batch) < batch_size:
                        try:
                            item = self._write_queue.get_nowait()
                            batch.append(item)
                        except queue.Empty:
                            break
                except queue.Empty:
                    pass

                if batch and (len(batch) >= batch_size or time.time() - last_write >= batch_timeout):
                    self._write_batch_to_db(batch)
                    batch.clear()
                    last_write = time.time()

            except Exception as e:
                logger.error(f"Async writer error: {e}")
                time.sleep(1)

    def _write_batch_to_db(self, batch: List[Tuple[str, Tuple]]) -> None:
        """Write a batch of items to database efficiently."""
        if not batch:
            return

        image_inserts = []
        embedding_inserts = []

        for item_type, data in batch:
            if item_type == 'image':
                image_inserts.append(data)
            elif item_type == 'embedding':
                embedding_inserts.append(data)

        try:
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()

                if image_inserts:
                    cursor.executemany('''
                        INSERT OR REPLACE INTO cached_images
                        (url_hash, url, file_path, file_size, created_at, last_accessed)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', image_inserts)

                if embedding_inserts:
                    cursor.executemany('''
                        INSERT OR REPLACE INTO cached_embeddings
                        (url_hash, url, embedding, embedding_dim, model_name,
                         processing_time, image_shape, was_cropped, created_at, last_accessed)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', embedding_inserts)

            logger.debug(f"Batch wrote {len(image_inserts)} images, {len(embedding_inserts)} embeddings")

        except Exception as e:
            logger.error(f"Batch write failed: {e}")

    def _evict_lru(self, cache: Dict[str, CacheItem]) -> None:
        """Evict least recently used items from cache."""
        if len(cache) <= self.max_memory_items:
            return

        sorted_items = sorted(cache.items(), key=lambda x: x[1].last_accessed)
        evict_count = max(1, len(sorted_items) // 10)

        for i in range(evict_count):
            del cache[sorted_items[i][0]]
            self.stats.evictions += 1

    # --- Public API ---

    def get_image(self, url_hash: str) -> Optional[np.ndarray]:
        """Get image from cache (memory first, then database)."""
        with self._image_lock:
            if url_hash in self._image_cache:
                item = self._image_cache[url_hash]
                item.touch()
                self.stats.memory_hits += 1
                return item.data

        try:
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'SELECT file_path FROM cached_images WHERE url_hash = ?',
                    (url_hash,)
                )
                result = cursor.fetchone()

            if result and os.path.exists(result[0]):
                image = cv2.imread(result[0])
                if image is not None:
                    with self._image_lock:
                        self._image_cache[url_hash] = CacheItem(data=image)
                        self._evict_lru(self._image_cache)

                    self.stats.db_hits += 1
                    return image

        except Exception as e:
            logger.debug(f"Database image lookup failed: {e}")

        self.stats.db_misses += 1
        return None

    def cache_image(
        self,
        url_hash: str,
        url: str,
        image: np.ndarray,
        file_path: str
    ) -> None:
        """Cache image to memory and queue for database write."""
        file_size = os.path.getsize(file_path)

        with self._image_lock:
            self._image_cache[url_hash] = CacheItem(data=image)
            self._evict_lru(self._image_cache)

        now = datetime.now()
        write_data = (url_hash, url, file_path, file_size, now, now)
        self._write_queue.put(('image', write_data))
        self.stats.writes_queued += 1

    def get_embedding(self, url_hash: str, model_name: str = None) -> Optional[Dict[str, Any]]:
        """Get embedding from cache (memory first, then database)."""
        with self._embedding_lock:
            if url_hash in self._embedding_cache:
                item = self._embedding_cache[url_hash]
                # Check model compatibility if specified
                if model_name and item.data.get('model_name') != model_name:
                    logger.debug(f"Cache model mismatch: {item.data.get('model_name')} vs {model_name}")
                    return None
                item.touch()
                self.stats.memory_hits += 1

                processing_time = item.data.get('processing_time', 0.0)
                self.stats.processing_time_saved += processing_time
                logger.debug(f"Memory cache hit for {url_hash[:8]}... (saved {processing_time:.2f}s)")
                return item.data

        self.stats.memory_misses += 1

        try:
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                query = '''
                    SELECT url_hash, url, embedding, embedding_dim, model_name,
                           processing_time, image_shape, was_cropped, last_accessed
                    FROM cached_embeddings WHERE url_hash = ?
                '''
                if model_name:
                    query += ' AND model_name = ?'
                    cursor.execute(query, (url_hash, model_name))
                else:
                    cursor.execute(query, (url_hash,))
                result = cursor.fetchone()

            if result:
                embedding_data = self._deserialize_embedding_from_row(result)
                if embedding_data:
                    with self._embedding_lock:
                        self._embedding_cache[url_hash] = CacheItem(data=embedding_data)
                        self._evict_lru(self._embedding_cache)

                    self.stats.db_hits += 1
                    processing_time = embedding_data.get('processing_time', 0.0)
                    self.stats.processing_time_saved += processing_time
                    logger.debug(f"Database cache hit for {url_hash[:8]}... (saved {processing_time:.2f}s)")
                    return embedding_data

        except Exception as e:
            logger.debug(f"Database embedding lookup failed: {e}")

        self.stats.db_misses += 1
        return None

    def cache_embedding(
        self,
        url_hash: str,
        url: str,
        embedding: np.ndarray,
        model_name: str,
        processing_time: float,
        image_shape: Tuple[int, ...],
        was_cropped: bool
    ) -> None:
        """Cache embedding to memory and queue for database write."""
        embedding_data = {
            'embedding': embedding,
            'embedding_dim': embedding.shape[-1] if embedding is not None else 0,
            'model_name': model_name,
            'processing_time': processing_time,
            'image_shape': image_shape,
            'was_cropped': was_cropped
        }

        with self._embedding_lock:
            self._embedding_cache[url_hash] = CacheItem(data=embedding_data)
            self._evict_lru(self._embedding_cache)

        now = datetime.now()
        write_data = (
            url_hash, url,
            pickle.dumps(embedding),
            embedding.shape[-1] if embedding is not None else 0,
            model_name,
            processing_time,
            json.dumps(image_shape),
            was_cropped,
            now, now
        )

        self._write_queue.put(('embedding', write_data))
        self.stats.writes_queued += 1

    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics."""
        with self._image_lock, self._embedding_lock:
            return {
                'memory_hits': self.stats.memory_hits,
                'memory_misses': self.stats.memory_misses,
                'db_hits': self.stats.db_hits,
                'db_misses': self.stats.db_misses,
                'evictions': self.stats.evictions,
                'writes_queued': self.stats.writes_queued,
                'processing_time_saved': self.stats.processing_time_saved,
                'memory_image_count': len(self._image_cache),
                'memory_embedding_count': len(self._embedding_cache),
                'total_hit_rate': self.stats.hit_rate,
                'memory_hit_rate': self.stats.memory_hit_rate,
                'queue_size': self._write_queue.qsize()
            }

    def shutdown(self) -> None:
        """Gracefully shutdown the cache manager."""
        logger.info("Shutting down embedding cache manager...")
        self._write_worker_running = False

        timeout = 10
        start = time.time()
        while not self._write_queue.empty() and time.time() - start < timeout:
            time.sleep(0.1)

        self._write_worker.join(timeout=5.0)
        self.db_manager.close_all()
        logger.info("Embedding cache manager shutdown complete")


# ============================================================================
# Comic Detection (reused from original)
# ============================================================================

class ComicDetector:
    """Handles comic area detection using multiple strategies."""

    @staticmethod
    def detect_simple(image: np.ndarray) -> Tuple[np.ndarray, bool]:
        """Simple and fast comic detection using edge detection."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return image, False

        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)
        h, w = image.shape[:2]

        if area > (w * h * 0.1):
            x, y, cw, ch = cv2.boundingRect(largest)
            pad = 20
            x, y = max(0, x - pad), max(0, y - pad)
            cw, ch = min(w - x, cw + 2 * pad), min(h - y, ch + 2 * pad)
            return image[y:y+ch, x:x+cw], True

        return image, False

    @staticmethod
    def detect_enhanced(image: np.ndarray) -> Tuple[np.ndarray, bool]:
        """Enhanced comic detection with multiple approaches."""
        original = image.copy()
        h, w = image.shape[:2]

        approaches = [
            ComicDetector._detect_contour_based,
            ComicDetector._detect_color_based,
            ComicDetector._detect_adaptive_threshold
        ]

        best_crop = None
        best_score = 0.0

        for approach in approaches:
            try:
                crop, score = approach(image)
                if score > best_score:
                    best_score = score
                    best_crop = crop
            except Exception as e:
                logger.debug(f"Comic detection approach failed: {e}")

        if best_crop is not None and best_score > 0.15:
            logger.debug(f"Enhanced comic detected: {original.shape} -> {best_crop.shape} (score: {best_score:.3f})")
            return best_crop, True

        return original, False

    @staticmethod
    def _detect_contour_based(image: np.ndarray) -> Tuple[np.ndarray, float]:
        """Enhanced contour-based detection with multi-scale edge detection."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        edges_combined = np.zeros_like(gray)
        for blur_size in [3, 5, 7]:
            blurred = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)
            edges = cv2.Canny(blurred, 30, 90)
            edges_combined = np.maximum(edges_combined, edges)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (8, 8))
        edges_combined = cv2.morphologyEx(edges_combined, cv2.MORPH_CLOSE, kernel)
        edges_combined = cv2.morphologyEx(edges_combined, cv2.MORPH_DILATE, kernel)

        contours, _ = cv2.findContours(edges_combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return image, 0.0

        best_contour = None
        best_score = 0.0

        for contour in contours:
            area = cv2.contourArea(contour)
            if not (0.05 < area / (w * h) < 0.95):
                continue

            x, y, cw, ch = cv2.boundingRect(contour)
            rect_area = cw * ch
            fill_ratio = area / rect_area if rect_area > 0 else 0
            aspect_ratio = ch / cw if cw > 0 else 0

            if 0.6 <= aspect_ratio <= 3.5 and fill_ratio > 0.4:
                center_x, center_y = x + cw / 2, y + ch / 2
                center_dist = np.sqrt((center_x - w/2)**2 + (center_y - h/2)**2)
                center_penalty = center_dist / (w + h)

                score = (area / (w * h)) * fill_ratio * min(aspect_ratio / 1.4, 1) * (1 - center_penalty * 0.3)

                if score > best_score:
                    best_score = score
                    best_contour = contour

        if best_contour is not None:
            x, y, cw, ch = cv2.boundingRect(best_contour)
            pad = 20
            x, y = max(0, x - pad), max(0, y - pad)
            cw, ch = min(w - x, cw + 2 * pad), min(h - y, ch + 2 * pad)
            return image[y:y+ch, x:x+cw], best_score

        return image, 0.0

    @staticmethod
    def _detect_color_based(image: np.ndarray) -> Tuple[np.ndarray, float]:
        """Color-based comic detection using HSV color space."""
        h, w = image.shape[:2]
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

        lower_bound = np.array([0, 20, 20])
        upper_bound = np.array([180, 255, 255])
        mask = cv2.inRange(hsv, lower_bound, upper_bound)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return image, 0.0

        largest = max(contours, key=cv2.contourArea)
        x, y, cw, ch = cv2.boundingRect(largest)

        area_ratio = (cw * ch) / (w * h)
        aspect_ratio = ch / cw if cw > 0 else 0

        if 0.6 <= aspect_ratio <= 3.5 and area_ratio > 0.3:
            score = area_ratio * min(aspect_ratio / 1.4, 1) * 0.8
            pad = 15
            x, y = max(0, x - pad), max(0, y - pad)
            cw, ch = min(w - x, cw + 2 * pad), min(h - y, ch + 2 * pad)
            return image[y:y+ch, x:x+cw], score

        return image, 0.0

    @staticmethod
    def _detect_adaptive_threshold(image: np.ndarray) -> Tuple[np.ndarray, float]:
        """Adaptive threshold-based detection."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return image, 0.0

        best_score = 0.0
        best_bbox = None

        for contour in contours:
            area = cv2.contourArea(contour)
            if not (0.1 < area / (w * h) < 0.9):
                continue

            x, y, cw, ch = cv2.boundingRect(contour)
            aspect_ratio = ch / cw if cw > 0 else 0

            if 0.7 <= aspect_ratio <= 3.0:
                score = (area / (w * h)) * min(aspect_ratio / 1.4, 1) * 0.7
                if score > best_score:
                    best_score = score
                    best_bbox = (x, y, cw, ch)

        if best_bbox:
            x, y, cw, ch = best_bbox
            pad = 10
            x, y = max(0, x - pad), max(0, y - pad)
            cw, ch = min(w - x, cw + 2 * pad), min(h - y, ch + 2 * pad)
            return image[y:y+ch, x:x+cw], best_score

        return image, 0.0


# ============================================================================
# Embedding Model Wrapper
# ============================================================================

class EmbeddingModel:
    """Wrapper for CLIP-based embedding extraction."""

    def __init__(self, model_name: str = DEFAULT_MODEL, device: str = 'cpu'):
        self.model_name = model_name
        self.device = device
        self.model = None
        self.preprocess = None
        self.tokenizer = None
        self._lock = threading.Lock()

        self._load_model()

    def _load_model(self) -> None:
        """Load the CLIP model."""
        try:
            import torch
            import open_clip

            config = MODEL_CONFIGS.get(self.model_name, MODEL_CONFIGS[DEFAULT_MODEL])

            logger.info(f"Loading CLIP model: {config['name']} ({config['description']})")

            self.model, _, self.preprocess = open_clip.create_model_and_transforms(
                config['name'],
                pretrained=config['pretrained'],
                device=self.device
            )
            self.model.eval()

            self.embedding_dim = config['embedding_dim']
            logger.success(f"Model loaded successfully: {self.model_name} (dim: {self.embedding_dim})")

        except ImportError as e:
            raise ModelLoadError(
                f"Required packages not installed. Run: pip install torch open-clip-torch\n"
                f"Original error: {e}"
            )
        except Exception as e:
            raise ModelLoadError(f"Failed to load model {self.model_name}: {e}")

    def extract_embedding(self, image: np.ndarray) -> Optional[np.ndarray]:
        """Extract embedding from an image."""
        if image is None:
            return None

        try:
            import torch
            from PIL import Image

            # Convert BGR (OpenCV) to RGB (PIL)
            if len(image.shape) == 3 and image.shape[2] == 3:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            else:
                image_rgb = image

            # Convert to PIL Image
            pil_image = Image.fromarray(image_rgb)

            # Preprocess and extract embedding
            with self._lock:
                image_tensor = self.preprocess(pil_image).unsqueeze(0).to(self.device)

                with torch.no_grad():
                    embedding = self.model.encode_image(image_tensor)
                    # Normalize the embedding
                    embedding = embedding / embedding.norm(dim=-1, keepdim=True)

                return embedding.cpu().numpy().flatten()

        except Exception as e:
            logger.error(f"Embedding extraction failed: {e}")
            return None

    def compute_similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """Compute cosine similarity between two embeddings."""
        return cosine_similarity(embedding1, embedding2)


# ============================================================================
# Main Matcher Class
# ============================================================================

class EmbeddingComicMatcher:
    """High-performance comic image matcher using CLIP embeddings."""

    def __init__(
        self,
        config: Any,
        cache_dir: str = CACHE_DIR,
        db_path: str = DB_PATH
    ):
        self.config = config
        self.cache_dir = cache_dir
        self.db_path = db_path
        self.max_workers = config.get('max_workers', 4)

        # Get embedding model settings from config
        embedding_config = config.get('embedding', {})
        self.model_name = embedding_config.get('model', DEFAULT_MODEL)
        self.device = embedding_config.get('device', 'cpu')

        logger.info("Initializing Embedding-based Comic Matcher")
        logger.debug(f"Cache directory: {cache_dir}")
        logger.debug(f"Database path: {db_path}")
        logger.debug(f"Workers: {self.max_workers}")
        logger.debug(f"Model: {self.model_name}")
        logger.debug(f"Device: {self.device}")

        # Ensure directories exist
        Path(cache_dir).mkdir(parents=True, exist_ok=True)
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        # Initialize components
        self._init_database()
        self._setup_settings()

        # Initialize cache manager
        self.cache_manager = EmbeddingCacheManager(db_path, max_memory_items=2000)

        # Initialize HTTP session using curl_cffi
        self.session = CurlSession(impersonate="chrome120")
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://comicvine.gamespot.com/',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
        })

        # Initialize embedding model
        self.embedding_model = EmbeddingModel(self.model_name, self.device)

        self.print_config_summary()

    def _init_database(self) -> None:
        """Initialize SQLite database schema."""
        logger.debug("Initializing SQLite database...")

        conn = sqlite3.connect(self.db_path)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA synchronous=NORMAL')
        conn.execute('PRAGMA cache_size=10000')
        conn.execute('PRAGMA temp_store=MEMORY')

        cursor = conn.cursor()

        # Cached images table (same as before)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cached_images (
                url_hash TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Cached embeddings table (new structure for embeddings)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cached_embeddings (
                url_hash TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                embedding BLOB,
                embedding_dim INTEGER,
                model_name TEXT,
                processing_time REAL,
                image_shape TEXT,
                was_cropped BOOLEAN,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (url_hash) REFERENCES cached_images (url_hash)
            )
        ''')

        # Create indexes
        for table, col in [('images', 'url'), ('embeddings', 'url'),
                           ('images', 'last_accessed'), ('embeddings', 'last_accessed'),
                           ('embeddings', 'model_name')]:
            try:
                cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_{col} ON cached_{table}({col})')
            except sqlite3.OperationalError:
                pass

        conn.commit()
        conn.close()

    def _setup_settings(self) -> None:
        """Initialize operational settings from configuration."""
        options = self.config.get('options', {})

        self.use_comic_detection = options.get('use_comic_detection', True)
        self.use_advanced_detection = options.get('use_advanced_matching', True)
        self.cache_only = options.get('cache_only', False)

        logger.info(f"Comic detection: {self.use_comic_detection}")
        logger.info(f"Advanced detection: {self.use_advanced_detection}")
        logger.info(f"Cache only: {self.cache_only}")

    # --- Image Processing ---

    def download_image(self, url: str, timeout: int = 10) -> Optional[np.ndarray]:
        """Download image with caching support."""
        url_hash = compute_url_hash(url)

        cached = self.cache_manager.get_image(url_hash)
        if cached is not None:
            return cached

        try:
            logger.debug(f"Downloading: {url[:50]}...")
            response = self.session.get(url, timeout=timeout)
            response.raise_for_status()

            image_array = np.frombuffer(response.content, np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

            if image is not None:
                file_path = os.path.join(self.cache_dir, f"{url_hash}.jpg")
                cv2.imwrite(file_path, image)
                self.cache_manager.cache_image(url_hash, url, image, file_path)
                logger.debug(f"Downloaded and cached: {url[:50]}...")
            else:
                logger.warning(f"Failed to decode: {url[:50]}...")

            return image

        except Exception as e:
            logger.error(f"Download error for {url[:50]}...: {e}")
            return None

    def detect_comic_area(self, image: np.ndarray) -> Tuple[np.ndarray, bool]:
        """Detect and crop comic area from image."""
        if not self.use_comic_detection or image is None:
            return image, False

        if self.use_advanced_detection:
            return ComicDetector.detect_enhanced(image)
        return ComicDetector.detect_simple(image)

    def preprocess_image(self, image: np.ndarray) -> Optional[np.ndarray]:
        """Preprocess image for embedding extraction."""
        if image is None:
            return None

        h, w = image.shape[:2]
        target_size = self.config.get('image_size', 800)

        # Resize if too large (for memory efficiency, model handles its own resizing)
        if max(h, w) > target_size:
            scale = target_size / max(h, w)
            new_size = (int(w * scale), int(h * scale))
            image = cv2.resize(image, new_size, interpolation=cv2.INTER_LANCZOS4)
            logger.debug(f"Resized: {w}x{h} -> {new_size[0]}x{new_size[1]}")

        return image

    def extract_embedding(self, image: np.ndarray) -> Optional[np.ndarray]:
        """Extract CLIP embedding from image."""
        if image is None:
            return None

        processed = self.preprocess_image(image)
        if processed is None:
            return None

        return self.embedding_model.extract_embedding(processed)

    def extract_embedding_cached(self, url: str) -> Optional[Dict[str, Any]]:
        """Extract embedding with caching support."""
        url_hash = compute_url_hash(url)

        # Check cache
        cached = self.cache_manager.get_embedding(url_hash, self.model_name)
        if cached is not None:
            return cached

        # Skip processing in cache-only mode
        if self.cache_only:
            logger.debug(f"Cache-only mode: skipping {url[:50]}...")
            return None

        # Download and process
        image = self.download_image(url)
        if image is None:
            return None

        start_time = time.time()
        cropped, was_cropped = self.detect_comic_area(image)
        embedding = self.extract_embedding(cropped)
        processing_time = time.time() - start_time

        logger.debug(f"Embedding extraction took {processing_time:.2f}s")

        if embedding is not None:
            self.cache_manager.cache_embedding(
                url_hash, url, embedding, self.model_name,
                processing_time, cropped.shape, was_cropped
            )

            return {
                'embedding': embedding,
                'embedding_dim': embedding.shape[-1],
                'model_name': self.model_name,
                'processing_time': processing_time,
                'image_shape': cropped.shape,
                'was_cropped': was_cropped
            }

        return None

    # --- Matching ---

    def match_embeddings(
        self,
        query_embedding: np.ndarray,
        candidate_embedding: np.ndarray
    ) -> Tuple[float, Dict[str, Any]]:
        """Match embeddings and return similarity with details."""
        if query_embedding is None or candidate_embedding is None:
            return 0.0, {}

        similarity = self.embedding_model.compute_similarity(query_embedding, candidate_embedding)

        # Scale similarity to be more intuitive (CLIP similarities are often in 0.1-0.4 range for good matches)
        # Apply a transformation to spread out the scores
        scaled_similarity = self._scale_similarity(similarity)

        match_details = {
            'clip': {
                'raw_similarity': float(similarity),
                'scaled_similarity': float(scaled_similarity),
                'model': self.model_name,
                'embedding_dim': int(query_embedding.shape[-1])
            }
        }

        return scaled_similarity, match_details

    def _scale_similarity(self, raw_similarity: float) -> float:
        """Scale raw cosine similarity to a more intuitive range.

        CLIP similarities tend to be in a narrow range (0.1-0.5 for most matches).
        This function spreads them out to use more of the 0-1 range while
        preserving relative ordering.
        """
        # Typical CLIP similarity thresholds:
        # < 0.15: Very different images
        # 0.15-0.25: Somewhat similar
        # 0.25-0.35: Similar
        # 0.35-0.50: Very similar
        # > 0.50: Near identical

        # Apply sigmoid-like scaling centered around 0.25
        import math

        # Shift and scale to center around 0.25, expand range
        shifted = (raw_similarity - 0.20) * 6.0
        scaled = 1.0 / (1.0 + math.exp(-shifted))

        # Ensure we stay in 0-1 range
        return max(0.0, min(1.0, scaled))

    def find_matches_img(
        self,
        query_image: np.ndarray,
        candidate_urls: List[str],
        threshold: float = 0.1,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Find matching comics from candidate URLs.

        Returns the same structure as FeatureMatchingComicMatcher for compatibility.
        """
        logger.info("Starting Embedding-based Comic Search...")
        start_time = time.time()

        if query_image is None:
            raise ValueError("Query image is None")

        logger.info(f"Query image shape: {query_image.shape}")
        safe_progress_callback(progress_callback, 0, "Processing query image...")

        # Process query
        query_image, _ = self.detect_comic_area(query_image)
        query_embedding = self.extract_embedding(query_image)

        if query_embedding is None:
            raise EmbeddingExtractionError("Could not extract embedding from query image")

        logger.success(f"Query embedding extracted - dim: {query_embedding.shape[-1]}, model: {self.model_name}")

        # Build query_features dict for API compatibility
        query_features = {
            'embedding': query_embedding,
            'embedding_dim': query_embedding.shape[-1],
            'model_name': self.model_name,
            # Include legacy keys for backward compatibility
            'sift': {'keypoints': [], 'descriptors': None, 'count': 0},
            'orb': {'keypoints': [], 'descriptors': None, 'count': 0},
            'akaze': {'keypoints': [], 'descriptors': None, 'count': 0},
            'kaze': {'keypoints': [], 'descriptors': None, 'count': 0}
        }

        safe_progress_callback(progress_callback, 1, f"Query embedding extracted (dim: {query_embedding.shape[-1]})")

        total = len(candidate_urls)
        logger.info(f"Processing {total} candidates...")
        safe_progress_callback(progress_callback, 2, f"Starting analysis of {total} candidates...")

        if total == 0:
            logger.warning("No candidate URLs provided")
            return [], query_features

        # Process candidates in parallel
        results = []
        batch_size = max(1, total // 20)

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            logger.debug(f"Using {self.max_workers} worker threads")

            futures = {
                executor.submit(self._process_candidate, query_embedding, url): (url, i)
                for i, url in enumerate(candidate_urls)
            }

            completed = 0
            for future in as_completed(futures):
                url, idx = futures[future]
                completed += 1

                try:
                    result = future.result()
                    if result:
                        results.append(result)
                        if result.get('similarity', 0) >= threshold:
                            logger.debug(f"Match: {url[:50]}... (sim: {result['similarity']:.3f})")

                    if completed % batch_size == 0 or completed >= total - 5:
                        msg = f"Analyzed {completed}/{total} candidates"
                        if result and 'similarity' in result:
                            msg += f" (latest: {result['similarity']:.3f})"
                        safe_progress_callback(progress_callback, completed + 3, msg)

                except Exception as e:
                    logger.error(f"Error processing {url[:50]}...: {e}")
                    results.append({
                        'url': url,
                        'similarity': 0.0,
                        'status': MatchStatus.PROCESSING_ERROR.value,
                        'match_details': {'error': str(e)},
                        'candidate_features': {}
                    })

        # Sort by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)
        good_matches = [r for r in results if r['similarity'] >= threshold]

        safe_progress_callback(
            progress_callback, total + 3,
            f"Completed - found {len(good_matches)} matches above threshold"
        )

        elapsed = time.time() - start_time
        logger.success(f"Matching completed in {elapsed:.2f}s")
        logger.info(f"Found {len(good_matches)} matches above threshold ({threshold})")

        if good_matches:
            logger.info(f"Top match: {good_matches[0]['url'][:50]}... (sim: {good_matches[0]['similarity']:.3f})")

        return results, query_features

    def _process_candidate(
        self,
        query_embedding: np.ndarray,
        url: str
    ) -> Dict[str, Any]:
        """Process a single candidate URL."""
        try:
            candidate_data = self.extract_embedding_cached(url)

            if not candidate_data or candidate_data.get('embedding') is None:
                return {
                    'url': url,
                    'similarity': 0.0,
                    'status': MatchStatus.FAILED_EMBEDDING.value,
                    'match_details': {'error': 'Failed to extract embedding'},
                    'candidate_features': {}
                }

            candidate_embedding = candidate_data['embedding']
            similarity, match_details = self.match_embeddings(query_embedding, candidate_embedding)

            # Build response with backward-compatible structure
            return {
                'url': url,
                'similarity': similarity,
                'status': MatchStatus.SUCCESS.value,
                'match_details': match_details,
                'candidate_features': {
                    'embedding_dim': candidate_data.get('embedding_dim', 0),
                    'model_name': candidate_data.get('model_name', ''),
                    # Include legacy keys for backward compatibility
                    'sift_count': 0,
                    'orb_count': 0,
                    'akaze_count': 0,
                    'kaze_count': 0
                }
            }

        except Exception as e:
            logger.error(f"Processing failed for {url[:50]}...: {e}")
            return {
                'url': url,
                'similarity': 0.0,
                'status': MatchStatus.PROCESSING_ERROR.value,
                'match_details': {'error': str(e)},
                'candidate_features': {}
            }

    # --- Utility Methods ---

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics."""
        stats = self.cache_manager.get_stats()

        try:
            conn = sqlite3.connect(self.db_path, timeout=5.0)
            cursor = conn.cursor()

            cursor.execute('SELECT COUNT(*) FROM cached_images')
            stats['cached_images_count'] = cursor.fetchone()[0]

            cursor.execute('SELECT COUNT(*) FROM cached_embeddings')
            stats['cached_embeddings_count'] = cursor.fetchone()[0]

            cursor.execute('SELECT SUM(file_size) FROM cached_images')
            total_size = cursor.fetchone()[0] or 0
            stats['total_disk_usage_mb'] = total_size / (1024 * 1024)

            cursor.execute('SELECT COUNT(*) FROM cached_embeddings WHERE model_name = ?', (self.model_name,))
            stats['model_specific_embeddings'] = cursor.fetchone()[0]

            conn.close()

        except Exception as e:
            logger.warning(f"Failed to get database stats: {e}")
            stats.update({
                'cached_images_count': 0,
                'cached_embeddings_count': 0,
                'total_disk_usage_mb': 0
            })

        return stats

    def print_cache_stats(self) -> None:
        """Print cache statistics."""
        stats = self.get_cache_stats()

        logger.info("\n" + "=" * 60)
        logger.info("EMBEDDING CACHE PERFORMANCE STATISTICS")
        logger.info("=" * 60)
        logger.info(f"Memory Images: {stats.get('memory_image_count', 0)}")
        logger.info(f"Memory Embeddings: {stats.get('memory_embedding_count', 0)}")
        logger.info(f"Database Images: {stats.get('cached_images_count', 0)}")
        logger.info(f"Database Embeddings: {stats.get('cached_embeddings_count', 0)}")
        logger.info(f"Model-specific Embeddings ({self.model_name}): {stats.get('model_specific_embeddings', 0)}")
        logger.info(f"Disk Usage: {stats.get('total_disk_usage_mb', 0):.1f} MB")
        logger.info(f"Memory Hit Rate: {stats.get('memory_hit_rate', 0):.1f}%")
        logger.info(f"Total Hit Rate: {stats.get('total_hit_rate', 0):.1f}%")
        logger.info(f"Processing Time Saved: {stats.get('processing_time_saved', 0):.2f}s")
        logger.info("=" * 60)

    def get_config_summary(self) -> Dict[str, Any]:
        """Get configuration summary."""
        return {
            'matcher_type': 'embedding',
            'model_name': self.model_name,
            'model_config': MODEL_CONFIGS.get(self.model_name, {}),
            'device': self.device,
            'performance_level': self.config.get('performance_level', 'custom'),
            'image_size': self.config.get('image_size'),
            'result_batch': self.config.get('result_batch'),
            'max_workers': self.max_workers,
            'use_comic_detection': self.use_comic_detection,
            'use_advanced_detection': self.use_advanced_detection,
            'cache_only': self.cache_only,
            'cache_manager_stats': self.cache_manager.get_stats()
        }

    def print_config_summary(self) -> None:
        """Print configuration summary."""
        summary = self.get_config_summary()
        title = "EMBEDDING COMIC MATCHER CONFIGURATION"

        logger.success("=" * len(title))
        logger.success(title)
        logger.success("=" * len(title))
        logger.info(f"Matcher Type: {summary['matcher_type']}")
        logger.info(f"Model: {summary['model_name']}")
        logger.info(f"Device: {summary['device']}")

        model_config = summary.get('model_config', {})
        if model_config:
            logger.info(f"Embedding Dimension: {model_config.get('embedding_dim', 'N/A')}")
            logger.info(f"Model Description: {model_config.get('description', 'N/A')}")

        logger.info(f"Performance Level: {summary['performance_level']}")
        logger.info(f"Image Size: {summary['image_size']}")
        logger.info(f"Max Workers: {summary['max_workers']}")
        logger.info(f"Result Batch Size: {summary['result_batch']}")
        logger.info(f"Comic Detection: {summary['use_comic_detection']}")
        logger.info(f"Advanced Detection: {summary['use_advanced_detection']}")
        logger.info(f"Cache Only: {summary['cache_only']}")

        cache = summary['cache_manager_stats']
        logger.info(f"Memory Cache: {cache.get('memory_image_count', 0)} images, {cache.get('memory_embedding_count', 0)} embeddings")
        logger.info(f"Memory Hit Rate: {cache.get('memory_hit_rate', 0):.1f}%")

    def cleanup_old_cache(self, days_old: int = 30) -> None:
        """Remove cache entries older than specified days."""
        logger.info(f"Cleaning cache entries older than {days_old} days...")

        try:
            conn = sqlite3.connect(self.db_path, timeout=30.0)
            cursor = conn.cursor()

            cursor.execute(f'''
                SELECT url_hash, file_path FROM cached_images
                WHERE last_accessed < datetime('now', '-{days_old} days')
            ''')

            old_entries = cursor.fetchall()
            cleaned = 0

            for url_hash, file_path in old_entries:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.debug(f"Removed: {file_path}")

                cursor.execute('DELETE FROM cached_embeddings WHERE url_hash = ?', (url_hash,))
                cursor.execute('DELETE FROM cached_images WHERE url_hash = ?', (url_hash,))
                cleaned += 1

            conn.commit()
            conn.close()

            if cleaned > 0:
                logger.success(f"Cleaned {cleaned} old cache entries")
            else:
                logger.info("No old cache entries to clean")

        except Exception as e:
            logger.error(f"Cache cleanup failed: {e}")

    # Backward compatibility alias
    def _get_url_hash(self, url: str) -> str:
        return compute_url_hash(url)

    def __del__(self):
        """Cleanup on destruction."""
        if hasattr(self, 'cache_manager'):
            self.cache_manager.shutdown()


# ============================================================================
# Available Models Info
# ============================================================================

def get_available_models() -> Dict[str, Dict[str, Any]]:
    """Get information about available models."""
    return MODEL_CONFIGS.copy()


def print_available_models() -> None:
    """Print information about available models."""
    print("\nAvailable CLIP Models for Comic Matching:")
    print("=" * 60)
    for name, config in MODEL_CONFIGS.items():
        default = " (default)" if name == DEFAULT_MODEL else ""
        print(f"\n{name}{default}:")
        print(f"  Embedding Dimension: {config['embedding_dim']}")
        print(f"  Description: {config['description']}")
    print("\n" + "=" * 60)
