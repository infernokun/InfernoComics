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
from pathlib import Path
from enum import Enum, auto
from datetime import datetime
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import (
    Dict, Optional, Tuple, List, Any, 
    Callable
)
from concurrent.futures import ThreadPoolExecutor, as_completed
from curl_cffi.requests import Session as CurlSession
from util.Logger import get_logger

logger = get_logger(__name__)

# ============================================================================
# Environment Configuration
# ============================================================================

# Set OpenCV to headless mode
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
os.environ.setdefault('OPENCV_LOG_LEVEL', 'ERROR')
cv2.setNumThreads(1)

# Default paths
DEFAULT_DB_PATH = os.environ.get(
    'COMIC_CACHE_DB_PATH', 
    '/var/tmp/inferno-comics/comic_cache.db'
)
DEFAULT_CACHE_DIR = os.environ.get(
    'COMIC_CACHE_IMAGE_PATH', 
    '/var/tmp/inferno-comics/image_cache'
)


# ============================================================================
# Custom Exceptions
# ============================================================================

class ComicMatcherError(Exception):
    """Base exception for comic matcher errors."""
    pass


class FeatureExtractionError(ComicMatcherError):
    """Raised when feature extraction fails."""
    pass


class ImageDownloadError(ComicMatcherError):
    """Raised when image download fails."""
    pass


class CacheError(ComicMatcherError):
    """Raised when cache operations fail."""
    pass


# ============================================================================
# Enums and Constants
# ============================================================================

class DetectorType(Enum):
    """Supported feature detector types."""
    SIFT = auto()
    ORB = auto()
    AKAZE = auto()
    KAZE = auto()
    
    @property
    def name_lower(self) -> str:
        return self.name.lower()


class MatchStatus(Enum):
    """Status of a match operation."""
    SUCCESS = "success"
    FAILED_FEATURES = "failed_features"
    FAILED_DOWNLOAD = "failed_download"
    PROCESSING_ERROR = "processing_error"
    CACHE_ONLY_SKIP = "cache_only_skip"


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
class FeatureData:
    """Container for extracted features from a single detector."""
    keypoints: List[cv2.KeyPoint] = field(default_factory=list)
    descriptors: Optional[np.ndarray] = None
    count: int = 0
    
    @classmethod
    def empty(cls) -> FeatureData:
        """Create an empty feature data container."""
        return cls(keypoints=[], descriptors=None, count=0)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'keypoints': self.keypoints,
            'descriptors': self.descriptors,
            'count': self.count
        }


@dataclass
class MatchResult:
    """Result of matching a query against a candidate."""
    url: str
    similarity: float
    status: MatchStatus
    match_details: Dict[str, Any] = field(default_factory=dict)
    candidate_features: Dict[str, int] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'url': self.url,
            'similarity': self.similarity,
            'status': self.status.value,
            'match_details': self.match_details,
            'candidate_features': self.candidate_features
        }


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


def serialize_keypoints(keypoints: List[cv2.KeyPoint]) -> bytes:
    """Serialize OpenCV keypoints to bytes."""
    if not keypoints:
        return b''
    
    kp_data = [
        {
            'pt': kp.pt,
            'angle': kp.angle,
            'class_id': kp.class_id,
            'octave': kp.octave,
            'response': kp.response,
            'size': kp.size
        }
        for kp in keypoints
    ]
    return pickle.dumps(kp_data)


def deserialize_keypoints(data: bytes) -> List[cv2.KeyPoint]:
    """Deserialize bytes back to OpenCV keypoints."""
    if not data:
        return []
    
    try:
        kp_data = pickle.loads(data)
        return [
            cv2.KeyPoint(
                x=kp['pt'][0],
                y=kp['pt'][1],
                size=kp['size'],
                angle=kp['angle'],
                response=kp['response'],
                octave=kp['octave'],
                class_id=kp['class_id']
            )
            for kp in kp_data
        ]
    except Exception:
        return []


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
            # Try to get from pool
            try:
                conn = self._pool.get_nowait()
            except queue.Empty:
                conn = self._create_connection()
            
            yield conn
            conn.commit()
            
            # Return to pool if not full
            try:
                self._pool.put_nowait(conn)
                conn = None  # Don't close if returned to pool
            except queue.Full:
                pass  # Will be closed below
                
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
# Fast Cache Manager
# ============================================================================

class FastCacheManager:
    """High-performance cache manager with in-memory storage and async persistence."""
    
    # Column indices for feature row deserialization
    _FEATURE_COLS = {
        'url_hash': 0, 'url': 1,
        'sift_kp': 2, 'sift_desc': 3, 'sift_count': 4,
        'orb_kp': 5, 'orb_desc': 6, 'orb_count': 7,
        'akaze_kp': 8, 'akaze_desc': 9, 'akaze_count': 10,
        'kaze_kp': 11, 'kaze_desc': 12, 'kaze_count': 13,
        'processing_time': 14, 'image_shape': 15, 
        'was_cropped': 16, 'last_accessed': 17
    }
    
    def __init__(self, db_path: str, max_memory_items: int = 1000):
        self.db_path = db_path
        self.max_memory_items = max_memory_items
        self.db_manager = DatabaseManager(db_path)
        
        # In-memory caches with RLock for reentrant access
        self._image_cache: Dict[str, CacheItem] = {}
        self._feature_cache: Dict[str, CacheItem] = {}
        self._image_lock = threading.RLock()
        self._feature_lock = threading.RLock()
        
        # Async write queue
        self._write_queue: queue.Queue = queue.Queue()
        self._write_worker_running = True
        self._write_worker = threading.Thread(
            target=self._async_writer, 
            daemon=True,
            name="CacheWriter"
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
                    SELECT url_hash, url, sift_keypoints, sift_descriptors, sift_count,
                           orb_keypoints, orb_descriptors, orb_count,
                           akaze_keypoints, akaze_descriptors, akaze_count,
                           kaze_keypoints, kaze_descriptors, kaze_count,
                           processing_time, image_shape, was_cropped, last_accessed
                    FROM cached_features 
                    ORDER BY last_accessed DESC 
                    LIMIT ?
                ''', (self.max_memory_items // 2,))
                
                rows = cursor.fetchall()
            
            loaded_count = 0
            for row in rows:
                try:
                    url_hash = row[0]
                    features = self._deserialize_features_from_row(row)
                    if features:
                        last_accessed = row[self._FEATURE_COLS['last_accessed']]
                        cache_item = CacheItem(
                            data=features,
                            last_accessed=datetime.fromisoformat(last_accessed) if last_accessed else datetime.now()
                        )
                        with self._feature_lock:
                            self._feature_cache[url_hash] = cache_item
                        loaded_count += 1
                except Exception as e:
                    logger.debug(f"Failed to load cache entry: {e}")
            
            logger.info(f"Warmed cache with {loaded_count} feature entries from {len(rows)} database rows")
            
        except Exception as e:
            logger.warning(f"Failed to warm cache from database: {e}")
    
    def _deserialize_features_from_row(self, row: Tuple) -> Optional[Dict[str, Any]]:
        """Deserialize features from database row."""
        try:
            cols = self._FEATURE_COLS
            return {
                'sift': {
                    'keypoints': deserialize_keypoints(row[cols['sift_kp']]) if row[cols['sift_kp']] else [],
                    'descriptors': pickle.loads(row[cols['sift_desc']]) if row[cols['sift_desc']] else None,
                    'count': row[cols['sift_count']] or 0
                },
                'orb': {
                    'keypoints': deserialize_keypoints(row[cols['orb_kp']]) if row[cols['orb_kp']] else [],
                    'descriptors': pickle.loads(row[cols['orb_desc']]) if row[cols['orb_desc']] else None,
                    'count': row[cols['orb_count']] or 0
                },
                'akaze': {
                    'keypoints': deserialize_keypoints(row[cols['akaze_kp']]) if row[cols['akaze_kp']] else [],
                    'descriptors': pickle.loads(row[cols['akaze_desc']]) if row[cols['akaze_desc']] else None,
                    'count': row[cols['akaze_count']] or 0
                },
                'kaze': {
                    'keypoints': deserialize_keypoints(row[cols['kaze_kp']]) if row[cols['kaze_kp']] else [],
                    'descriptors': pickle.loads(row[cols['kaze_desc']]) if row[cols['kaze_desc']] else None,
                    'count': row[cols['kaze_count']] or 0
                },
                'processing_time': row[cols['processing_time']] or 0.0,
                'image_shape': json.loads(row[cols['image_shape']]) if row[cols['image_shape']] else None,
                'was_cropped': bool(row[cols['was_cropped']]) if row[cols['was_cropped']] is not None else False
            }
        except Exception as e:
            logger.debug(f"Failed to deserialize features: {e}")
            return None
    
    def _async_writer(self) -> None:
        """Background thread that handles database writes in batches."""
        batch: List[Tuple[str, Tuple]] = []
        last_write = time.time()
        batch_size = 10
        batch_timeout = 2.0
        
        while self._write_worker_running:
            try:
                # Calculate remaining timeout
                timeout = max(0.1, batch_timeout - (time.time() - last_write))
                
                # Collect items for batching
                try:
                    item = self._write_queue.get(timeout=timeout)
                    batch.append(item)
                    
                    # Continue collecting until batch full
                    while len(batch) < batch_size:
                        try:
                            item = self._write_queue.get_nowait()
                            batch.append(item)
                        except queue.Empty:
                            break
                except queue.Empty:
                    pass
                
                # Write if batch ready
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
        feature_inserts = []
        
        for item_type, data in batch:
            if item_type == 'image':
                image_inserts.append(data)
            elif item_type == 'features':
                feature_inserts.append(data)
        
        try:
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                
                if image_inserts:
                    cursor.executemany('''
                        INSERT OR REPLACE INTO cached_images 
                        (url_hash, url, file_path, file_size, created_at, last_accessed)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', image_inserts)
                
                if feature_inserts:
                    cursor.executemany('''
                        INSERT OR REPLACE INTO cached_features 
                        (url_hash, url, sift_keypoints, sift_descriptors, sift_count,
                         orb_keypoints, orb_descriptors, orb_count, 
                         akaze_keypoints, akaze_descriptors, akaze_count,
                         kaze_keypoints, kaze_descriptors, kaze_count,
                         processing_time, image_shape, was_cropped, created_at, last_accessed)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', feature_inserts)
            
            logger.debug(f"Batch wrote {len(image_inserts)} images, {len(feature_inserts)} features")
            
        except Exception as e:
            logger.error(f"Batch write failed: {e}")
    
    def _evict_lru(self, cache: Dict[str, CacheItem]) -> None:
        """Evict least recently used items from cache."""
        if len(cache) <= self.max_memory_items:
            return
        
        # Sort by last accessed and remove oldest 10%
        sorted_items = sorted(cache.items(), key=lambda x: x[1].last_accessed)
        evict_count = max(1, len(sorted_items) // 10)
        
        for i in range(evict_count):
            del cache[sorted_items[i][0]]
            self.stats.evictions += 1
    
    # --- Public API ---
    
    def get_image(self, url_hash: str) -> Optional[np.ndarray]:
        """Get image from cache (memory first, then database)."""
        # Check memory
        with self._image_lock:
            if url_hash in self._image_cache:
                item = self._image_cache[url_hash]
                item.touch()
                self.stats.memory_hits += 1
                return item.data
        
        # Check database
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
                    # Promote to memory cache
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
        
        # Store in memory
        with self._image_lock:
            self._image_cache[url_hash] = CacheItem(data=image)
            self._evict_lru(self._image_cache)
        
        # Queue for async database write
        now = datetime.now()
        write_data = (url_hash, url, file_path, file_size, now, now)
        self._write_queue.put(('image', write_data))
        self.stats.writes_queued += 1
    
    def get_features(self, url_hash: str) -> Optional[Dict[str, Any]]:
        """Get features from cache (memory first, then database)."""
        # Check memory
        with self._feature_lock:
            if url_hash in self._feature_cache:
                item = self._feature_cache[url_hash]
                item.touch()
                self.stats.memory_hits += 1
                
                processing_time = item.data.get('processing_time', 0.0)
                self.stats.processing_time_saved += processing_time
                logger.debug(f"Memory cache hit for {url_hash[:8]}... (saved {processing_time:.2f}s)")
                return item.data
        
        self.stats.memory_misses += 1
        
        # Check database
        try:
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT url_hash, url, sift_keypoints, sift_descriptors, sift_count,
                           orb_keypoints, orb_descriptors, orb_count,
                           akaze_keypoints, akaze_descriptors, akaze_count,
                           kaze_keypoints, kaze_descriptors, kaze_count,
                           processing_time, image_shape, was_cropped, last_accessed
                    FROM cached_features WHERE url_hash = ?
                ''', (url_hash,))
                result = cursor.fetchone()
            
            if result:
                features = self._deserialize_features_from_row(result)
                if features:
                    # Promote to memory cache
                    with self._feature_lock:
                        self._feature_cache[url_hash] = CacheItem(data=features)
                        self._evict_lru(self._feature_cache)
                    
                    self.stats.db_hits += 1
                    processing_time = features.get('processing_time', 0.0)
                    self.stats.processing_time_saved += processing_time
                    logger.debug(f"Database cache hit for {url_hash[:8]}... (saved {processing_time:.2f}s)")
                    return features
                    
        except Exception as e:
            logger.debug(f"Database feature lookup failed: {e}")
        
        self.stats.db_misses += 1
        return None
    
    def cache_features(
        self,
        url_hash: str,
        url: str,
        features: Dict[str, Any],
        processing_time: float,
        image_shape: Tuple[int, ...],
        was_cropped: bool
    ) -> None:
        """Cache features to memory and queue for database write."""
        # Add metadata to features
        features_with_meta = {
            **features,
            'processing_time': processing_time,
            'image_shape': image_shape,
            'was_cropped': was_cropped
        }
        
        # Store in memory
        with self._feature_lock:
            self._feature_cache[url_hash] = CacheItem(data=features_with_meta)
            self._evict_lru(self._feature_cache)
        
        # Prepare serialized data for database
        now = datetime.now()
        write_data = (
            url_hash, url,
            serialize_keypoints(features['sift']['keypoints']),
            pickle.dumps(features['sift']['descriptors']) if features['sift']['descriptors'] is not None else b'',
            features['sift']['count'],
            serialize_keypoints(features['orb']['keypoints']),
            pickle.dumps(features['orb']['descriptors']) if features['orb']['descriptors'] is not None else b'',
            features['orb']['count'],
            serialize_keypoints(features['akaze']['keypoints']),
            pickle.dumps(features['akaze']['descriptors']) if features['akaze']['descriptors'] is not None else b'',
            features['akaze']['count'],
            serialize_keypoints(features['kaze']['keypoints']),
            pickle.dumps(features['kaze']['descriptors']) if features['kaze']['descriptors'] is not None else b'',
            features['kaze']['count'],
            processing_time,
            json.dumps(image_shape),
            was_cropped,
            now, now
        )
        
        self._write_queue.put(('features', write_data))
        self.stats.writes_queued += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics."""
        with self._image_lock, self._feature_lock:
            return {
                'memory_hits': self.stats.memory_hits,
                'memory_misses': self.stats.memory_misses,
                'db_hits': self.stats.db_hits,
                'db_misses': self.stats.db_misses,
                'evictions': self.stats.evictions,
                'writes_queued': self.stats.writes_queued,
                'processing_time_saved': self.stats.processing_time_saved,
                'memory_image_count': len(self._image_cache),
                'memory_feature_count': len(self._feature_cache),
                'total_hit_rate': self.stats.hit_rate,
                'memory_hit_rate': self.stats.memory_hit_rate,
                'queue_size': self._write_queue.qsize()
            }
    
    def shutdown(self) -> None:
        """Gracefully shutdown the cache manager."""
        logger.info("Shutting down cache manager...")
        self._write_worker_running = False
        
        # Wait for queue to drain
        timeout = 10
        start = time.time()
        while not self._write_queue.empty() and time.time() - start < timeout:
            time.sleep(0.1)
        
        self._write_worker.join(timeout=5.0)
        self.db_manager.close_all()
        logger.info("Cache manager shutdown complete")


# ============================================================================
# Comic Detection Strategies
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
        
        # Multi-scale edge detection
        edges_combined = np.zeros_like(gray)
        for blur_size in [3, 5, 7]:
            blurred = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)
            edges = cv2.Canny(blurred, 30, 90)
            edges_combined = np.maximum(edges_combined, edges)
        
        # Morphological operations
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
                # Penalize off-center detections
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
# Feature Matchers
# ============================================================================

class FeatureMatcher:
    """Handles feature matching between images."""
    
    def __init__(self, detectors: Dict[str, Any], weights: Dict[str, float]):
        self.detectors = detectors
        self.weights = weights
        self.matchers = self._setup_matchers()
    
    def _setup_matchers(self) -> Dict[str, cv2.DescriptorMatcher]:
        """Initialize descriptor matchers for each detector type."""
        matchers = {}
        
        if 'sift' in self.detectors:
            index_params = dict(algorithm=1, trees=5)  # FLANN_INDEX_KDTREE
            search_params = dict(checks=50)
            matchers['sift'] = cv2.FlannBasedMatcher(index_params, search_params)
        
        for name in ['orb', 'akaze']:
            if name in self.detectors:
                matchers[name] = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        
        if 'kaze' in self.detectors:
            matchers['kaze'] = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        
        return matchers
    
    def match_simple(
        self, 
        query_features: Dict[str, Any], 
        candidate_features: Dict[str, Any]
    ) -> Tuple[float, Dict[str, Any]]:
        """Simple and fast feature matching."""
        similarities = []
        match_results = {}
        
        for detector_name in self.detectors:
            query = query_features.get(detector_name, {})
            candidate = candidate_features.get(detector_name, {})
            
            if query.get('descriptors') is None or candidate.get('descriptors') is None:
                continue
            
            try:
                matcher = self.matchers.get(detector_name)
                if not matcher:
                    continue
                
                matches = matcher.match(query['descriptors'], candidate['descriptors'])
                good_matches = [m for m in matches if m.distance < 50]
                
                total = min(query['count'], candidate['count'])
                if total > 0:
                    similarity = len(good_matches) / total
                    weight = self.weights.get(detector_name, 0.25)
                    similarities.append((similarity, weight))
                    
                    match_results[detector_name] = {
                        'matches': len(good_matches),
                        'similarity': similarity
                    }
                    
            except Exception as e:
                logger.debug(f"{detector_name} matching failed: {e}")
        
        if not similarities:
            return 0.0, match_results
        
        weighted_sum = sum(s * w for s, w in similarities)
        total_weight = sum(w for _, w in similarities)
        return weighted_sum / total_weight if total_weight > 0 else 0.0, match_results
    
    def match_advanced(
        self, 
        query_features: Dict[str, Any], 
        candidate_features: Dict[str, Any]
    ) -> Tuple[float, Dict[str, Any]]:
        """Advanced feature matching with geometric verification."""
        match_results = {}
        similarities = []
        geometric_scores = []
        
        params = {
            'similarity_boost': 1.3,
            'geometric_weight': 0.15,
            'multi_detector_bonus': 0.08,
            'quality_threshold': 0.15
        }
        
        for detector_name in ['sift', 'orb', 'akaze', 'kaze']:
            if detector_name not in self.detectors:
                continue
            
            similarity, geometric = self._match_detector_enhanced(
                detector_name, query_features, candidate_features, match_results
            )
            
            if similarity > 0:
                weight = self.weights.get(detector_name, 0.25)
                similarities.append((detector_name, similarity, weight))
                geometric_scores.append(geometric)
        
        if not similarities:
            return 0.0, match_results
        
        # Calculate weighted base similarity
        weighted_sum = sum(s * w for _, s, w in similarities)
        total_weight = sum(w for _, _, w in similarities)
        base_similarity = weighted_sum / total_weight if total_weight > 0 else 0.0
        
        # Apply boosts
        boosted = base_similarity
        if base_similarity > params['quality_threshold']:
            boosted *= params['similarity_boost']
        
        if geometric_scores:
            avg_geo = sum(geometric_scores) / len(geometric_scores)
            boosted += avg_geo * params['geometric_weight']
        
        if len(similarities) > 1:
            boosted += params['multi_detector_bonus'] * (len(similarities) - 1)
        
        overall = min(0.95, boosted)
        logger.debug(f"Advanced matching: {overall:.3f} (base: {base_similarity:.3f}, {len(similarities)} detectors)")
        
        return overall, match_results
    
    def _match_detector_enhanced(
        self,
        detector_name: str,
        query_features: Dict[str, Any],
        candidate_features: Dict[str, Any],
        match_results: Dict[str, Any]
    ) -> Tuple[float, float]:
        """Enhanced matching for a specific detector with geometric verification."""
        query = query_features.get(detector_name, {})
        candidate = candidate_features.get(detector_name, {})
        
        if query.get('descriptors') is None or candidate.get('descriptors') is None:
            return 0.0, 0.0
        
        query_desc = query['descriptors']
        candidate_desc = candidate['descriptors']
        
        min_features = 8 if detector_name in ['sift', 'orb', 'kaze'] else 5
        if len(query_desc) < min_features or len(candidate_desc) < min_features:
            return 0.0, 0.0
        
        try:
            matcher = self.matchers.get(detector_name)
            if not matcher:
                return 0.0, 0.0
            
            matches = matcher.knnMatch(query_desc, candidate_desc, k=2)
            
            # Lowe's ratio test
            good_matches = []
            distances = []
            for match_pair in matches:
                if len(match_pair) >= 2:
                    m, n = match_pair[0], match_pair[1]
                    if m.distance < 0.75 * n.distance:
                        good_matches.append(m)
                        distances.append(m.distance)
            
            # Geometric verification
            geometric_score = 0.0
            if len(good_matches) >= 8 and detector_name in ['sift', 'orb', 'kaze']:
                geometric_score = self._compute_geometric_score(
                    query['keypoints'], candidate['keypoints'], good_matches
                )
            elif detector_name == 'akaze':
                geometric_score = min(1.0, len(good_matches) / 20.0) if good_matches else 0.0
            
            # Calculate similarity
            total = min(query['count'], candidate['count'])
            if total > 0:
                match_ratio = len(good_matches) / total
                
                # Quality bonus based on distance
                quality_bonus = 0.0
                if distances and detector_name in ['sift', 'kaze']:
                    avg_dist = sum(distances) / len(distances)
                    threshold = 200 if detector_name == 'sift' else 150
                    quality_bonus = max(0, (threshold - avg_dist) / threshold) * 0.2
                
                # Combine scores
                if detector_name in ['sift', 'kaze']:
                    similarity = match_ratio + quality_bonus + (geometric_score * 0.1)
                elif detector_name == 'orb':
                    similarity = match_ratio + (geometric_score * 0.15)
                else:
                    similarity = match_ratio
            else:
                similarity = 0.0
            
            match_results[detector_name] = {
                'total_matches': len(matches),
                'good_matches': len(good_matches),
                'geometric_score': geometric_score,
                'similarity': similarity
            }
            
            logger.debug(
                f"Enhanced {detector_name.upper()}: {len(good_matches)}/{len(matches)} matches, "
                f"geo: {geometric_score:.3f}, sim: {similarity:.3f}"
            )
            
            return similarity, geometric_score
            
        except Exception as e:
            logger.warning(f"Enhanced {detector_name.upper()} matching error: {e}")
            match_results[detector_name] = {
                'total_matches': 0, 'good_matches': 0,
                'geometric_score': 0.0, 'similarity': 0.0
            }
            return 0.0, 0.0
    
    def _compute_geometric_score(
        self,
        query_kpts: List[cv2.KeyPoint],
        candidate_kpts: List[cv2.KeyPoint],
        matches: List[cv2.DMatch]
    ) -> float:
        """Compute geometric consistency score using homography."""
        try:
            query_pts = np.float32([query_kpts[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
            candidate_pts = np.float32([candidate_kpts[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
            
            M, mask = cv2.findHomography(query_pts, candidate_pts, cv2.RANSAC, 5.0)
            
            if M is not None and mask is not None:
                inliers = int(np.sum(mask))
                return inliers / len(matches)
        except Exception:
            pass
        
        return 0.4  # Default score on failure


# ============================================================================
# Main Matcher Class
# ============================================================================

class FeatureMatchingComicMatcher:
    """High-performance comic image matcher with caching and parallel processing."""
    
    def __init__(
        self, 
        config: Any,
        cache_dir: str = DEFAULT_CACHE_DIR,
        db_path: str = DEFAULT_DB_PATH
    ):
        self.config = config
        self.cache_dir = cache_dir
        self.db_path = db_path
        self.max_workers = config.get('max_workers', 4)
        
        logger.info("Initializing Fast Comic Matcher")
        logger.debug(f"Cache directory: {cache_dir}")
        logger.debug(f"Database path: {db_path}")
        logger.debug(f"Workers: {self.max_workers}")
        
        # Ensure directories exist
        Path(cache_dir).mkdir(parents=True, exist_ok=True)
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize components
        self._init_database()
        self._setup_detectors()
        self._setup_settings()
        
        # Initialize cache manager
        self.cache_manager = FastCacheManager(db_path, max_memory_items=2000)
        
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
        
        # Initialize feature matcher
        self.feature_matcher = FeatureMatcher(self.detectors, self.feature_weights)
        
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
        
        # Cached images table
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
        
        # Cached features table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cached_features (
                url_hash TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                sift_keypoints BLOB,
                sift_descriptors BLOB,
                sift_count INTEGER,
                orb_keypoints BLOB,
                orb_descriptors BLOB,
                orb_count INTEGER,
                akaze_keypoints BLOB,
                akaze_descriptors BLOB,
                akaze_count INTEGER,
                kaze_keypoints BLOB,
                kaze_descriptors BLOB,
                kaze_count INTEGER,
                processing_time REAL,
                image_shape TEXT,
                was_cropped BOOLEAN,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (url_hash) REFERENCES cached_images (url_hash)
            )
        ''')
        
        # Add KAZE columns for backwards compatibility
        for col in ['kaze_keypoints BLOB', 'kaze_descriptors BLOB', 'kaze_count INTEGER']:
            try:
                cursor.execute(f'ALTER TABLE cached_features ADD COLUMN {col}')
            except sqlite3.OperationalError:
                pass
        
        # Create indexes
        for table, col in [('images', 'url'), ('features', 'url'), 
                           ('images', 'last_accessed'), ('features', 'last_accessed')]:
            cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_{col} ON cached_{table}({col})')
        
        conn.commit()
        conn.close()
    
    def _setup_detectors(self) -> None:
        """Initialize feature detectors based on configuration."""
        self.detectors: Dict[str, Any] = {}
        self.feature_weights: Dict[str, float] = {}
        
        detector_config = self.config.get('detectors', {})
        weights_config = self.config.get('feature_weights', {})
        
        detector_specs = [
            ('sift', lambda n: cv2.SIFT_create(nfeatures=n), 0.25),
            ('orb', lambda n: cv2.ORB_create(nfeatures=n), 0.25),
            ('akaze', lambda _: cv2.AKAZE_create(), 0.40),
            ('kaze', lambda _: cv2.KAZE_create(), 0.10),
        ]
        
        for name, factory, default_weight in detector_specs:
            count = detector_config.get(name, 0)
            if count > 0 or (name in ['akaze', 'kaze'] and detector_config.get(name)):
                self.detectors[name] = factory(count)
                self.feature_weights[name] = weights_config.get(name, default_weight)
                
                label = f"{count} features" if name in ['sift', 'orb'] else "enabled"
                extra = " - star performer!" if name == 'akaze' else ""
                logger.info(f"{name.upper()}: {label} (weight: {self.feature_weights[name]:.2f}{extra})")
        
        # Normalize weights
        if self.feature_weights:
            total = sum(self.feature_weights.values())
            if total > 0:
                self.feature_weights = {k: v/total for k, v in self.feature_weights.items()}
                weights_str = ', '.join(f'{k}:{v:.2f}' for k, v in self.feature_weights.items())
                logger.info(f"Normalized weights: {weights_str}")
    
    def _setup_settings(self) -> None:
        """Initialize operational settings from configuration."""
        options = self.config.get('options', {})
        
        self.use_comic_detection = options.get('use_comic_detection', True)
        self.use_advanced_matching = options.get('use_advanced_matching', True)
        self.cache_only = options.get('cache_only', False)
        
        logger.info(f"Comic detection: {self.use_comic_detection}")
        logger.info(f"Advanced matching: {self.use_advanced_matching}")
        logger.info(f"Cache only: {self.cache_only}")
    
    # --- Image Processing ---
    
    def download_image(self, url: str, timeout: int = 10) -> Optional[np.ndarray]:
        """Download image with caching support."""
        url_hash = compute_url_hash(url)
        
        # Check cache first
        cached = self.cache_manager.get_image(url_hash)
        if cached is not None:
            return cached
        
        # Download using curl_cffi
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
        
        if self.use_advanced_matching:
            return ComicDetector.detect_enhanced(image)
        return ComicDetector.detect_simple(image)
    
    def preprocess_image(self, image: np.ndarray) -> Optional[np.ndarray]:
        """Preprocess image for feature extraction."""
        if image is None:
            return None
        
        h, w = image.shape[:2]
        target_size = self.config.get('image_size', 800)
        
        # Resize if needed
        if max(h, w) > target_size:
            scale = target_size / max(h, w)
            new_size = (int(w * scale), int(h * scale))
            interp = cv2.INTER_LANCZOS4 if self.use_advanced_matching else cv2.INTER_LINEAR
            image = cv2.resize(image, new_size, interpolation=interp)
            logger.debug(f"Resized: {w}x{h} -> {new_size[0]}x{new_size[1]}")
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        if self.use_advanced_matching:
            # Enhanced preprocessing
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(12, 12))
            enhanced = clahe.apply(gray)
            denoised = cv2.bilateralFilter(enhanced, 5, 50, 50)
            
            kernel = np.array([[-0.5]*3, [-0.5, 5.0, -0.5], [-0.5]*3])
            sharpened = cv2.filter2D(denoised, -1, kernel)
            processed = cv2.addWeighted(sharpened, 0.7, denoised, 0.3, 0)
            logger.debug("Applied advanced preprocessing")
        else:
            processed = cv2.equalizeHist(gray)
            logger.debug("Applied fast preprocessing")
        
        return processed
    
    def extract_features(self, image: np.ndarray) -> Optional[Dict[str, Any]]:
        """Extract features from image using configured detectors."""
        if image is None:
            return None
        
        processed = self.preprocess_image(image)
        if processed is None:
            return None
        
        features = {}
        
        for name, detector in self.detectors.items():
            try:
                kp, desc = detector.detectAndCompute(processed, None)
                features[name] = {
                    'keypoints': kp or [],
                    'descriptors': desc,
                    'count': len(kp) if kp else 0
                }
                logger.debug(f"{name.upper()} features: {features[name]['count']}")
                
                # Early termination for fast mode
                if (not self.use_advanced_matching and name == 'orb' and 
                    features[name]['count'] < 10):
                    logger.debug(f"Early termination: only {features[name]['count']} ORB features")
                    break
                    
            except Exception as e:
                logger.warning(f"{name.upper()} extraction failed: {e}")
                features[name] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        # Ensure all detector types have entries
        for name in ['sift', 'orb', 'akaze', 'kaze']:
            if name not in features:
                features[name] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        return features
    
    def extract_features_cached(self, url: str) -> Optional[Dict[str, Any]]:
        """Extract features with caching support."""
        url_hash = compute_url_hash(url)
        
        # Check cache
        cached = self.cache_manager.get_features(url_hash)
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
        features = self.extract_features(cropped)
        processing_time = time.time() - start_time
        
        logger.debug(f"Feature extraction took {processing_time:.2f}s")
        
        if features:
            self.cache_manager.cache_features(
                url_hash, url, features, processing_time,
                cropped.shape, was_cropped
            )
        
        return features
    
    # --- Matching ---
    
    def match_features(
        self, 
        query_features: Dict[str, Any], 
        candidate_features: Dict[str, Any]
    ) -> Tuple[float, Dict[str, Any]]:
        """Match features between query and candidate."""
        if not query_features or not candidate_features:
            return 0.0, {}
        
        if self.use_advanced_matching:
            return self.feature_matcher.match_advanced(query_features, candidate_features)
        return self.feature_matcher.match_simple(query_features, candidate_features)
    
    def find_matches_img(
        self,
        query_image: np.ndarray,
        candidate_urls: List[str],
        threshold: float = 0.1,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Find matching comics from candidate URLs."""
        logger.info("Starting Fast Feature Matching Comic Search...")
        start_time = time.time()
        
        if query_image is None:
            raise ValueError("Query image is None")
        
        logger.info(f"Query image shape: {query_image.shape}")
        safe_progress_callback(progress_callback, 0, "Processing query image...")
        
        # Process query
        query_image, _ = self.detect_comic_area(query_image)
        query_features = self.extract_features(query_image)
        
        if not query_features:
            raise FeatureExtractionError("Could not extract features from query image")
        
        # Log feature counts
        enabled = [n for n in ['sift', 'orb', 'akaze', 'kaze'] if n in self.detectors]
        counts = {n: query_features[n]['count'] for n in enabled}
        counts_str = ', '.join(f'{n.upper()}: {c}' for n, c in counts.items())
        logger.success(f"Query features - {counts_str}")
        
        safe_progress_callback(progress_callback, 1, f"Query features extracted - {counts_str}")
        
        total = len(candidate_urls)
        logger.info(f"Processing {total} candidates with fast caching...")
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
                executor.submit(self._process_candidate, query_features, url): (url, i)
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
                    
                    # Progress update
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
        query_features: Dict[str, Any], 
        url: str
    ) -> Dict[str, Any]:
        """Process a single candidate URL."""
        try:
            candidate_features = self.extract_features_cached(url)
            
            if not candidate_features:
                return {
                    'url': url,
                    'similarity': 0.0,
                    'status': MatchStatus.FAILED_FEATURES.value,
                    'match_details': {'error': 'Failed to extract features'},
                    'candidate_features': {}
                }
            
            similarity, match_details = self.match_features(query_features, candidate_features)
            
            return {
                'url': url,
                'similarity': similarity,
                'status': MatchStatus.SUCCESS.value,
                'match_details': match_details,
                'candidate_features': {
                    f'{n}_count': candidate_features[n]['count']
                    for n in ['sift', 'orb', 'akaze', 'kaze']
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
            
            cursor.execute('SELECT COUNT(*) FROM cached_features')
            stats['cached_features_count'] = cursor.fetchone()[0]
            
            cursor.execute('SELECT SUM(file_size) FROM cached_images')
            total_size = cursor.fetchone()[0] or 0
            stats['total_disk_usage_mb'] = total_size / (1024 * 1024)
            
            for detector in ['sift', 'orb', 'akaze', 'kaze']:
                try:
                    cursor.execute(f'SELECT COUNT(*) FROM cached_features WHERE {detector}_count > 0')
                    stats[f'{detector}_features_count'] = cursor.fetchone()[0]
                except sqlite3.OperationalError:
                    stats[f'{detector}_features_count'] = 0
            
            conn.close()
            
        except Exception as e:
            logger.warning(f"Failed to get database stats: {e}")
            stats.update({
                'cached_images_count': 0,
                'cached_features_count': 0,
                'total_disk_usage_mb': 0
            })
        
        return stats
    
    def print_cache_stats(self) -> None:
        """Print cache statistics."""
        stats = self.get_cache_stats()
        
        logger.info("\n" + "=" * 60)
        logger.info("FAST CACHE PERFORMANCE STATISTICS")
        logger.info("=" * 60)
        logger.info(f"Memory Images: {stats.get('memory_image_count', 0)}")
        logger.info(f"Memory Features: {stats.get('memory_feature_count', 0)}")
        logger.info(f"Database Images: {stats.get('cached_images_count', 0)}")
        logger.info(f"Database Features: {stats.get('cached_features_count', 0)}")
        logger.info(f"Disk Usage: {stats.get('total_disk_usage_mb', 0):.1f} MB")
        logger.info(f"Memory Hit Rate: {stats.get('memory_hit_rate', 0):.1f}%")
        logger.info(f"Total Hit Rate: {stats.get('total_hit_rate', 0):.1f}%")
        logger.info(f"Processing Time Saved: {stats.get('processing_time_saved', 0):.2f}s")
        logger.info(f"Memory Hits: {stats.get('memory_hits', 0)}")
        logger.info(f"Memory Misses: {stats.get('memory_misses', 0)}")
        logger.info(f"DB Hits: {stats.get('db_hits', 0)}")
        logger.info(f"DB Misses: {stats.get('db_misses', 0)}")
        logger.info(f"Cache Evictions: {stats.get('evictions', 0)}")
        logger.info(f"Async Writes Queued: {stats.get('writes_queued', 0)}")
        logger.info(f"Queue Size: {stats.get('queue_size', 0)}")
        
        for detector in ['sift', 'orb', 'akaze', 'kaze']:
            count = stats.get(f'{detector}_features_count', 0)
            logger.info(f"{detector.upper()} Features in DB: {count}")
        
        saved = stats.get('processing_time_saved', 0)
        if saved > 0:
            logger.success(f"Efficiency Gained: {saved:.1f}s saved with fast caching!")
        
        logger.info("=" * 60)
    
    def get_config_summary(self) -> Dict[str, Any]:
        """Get configuration summary."""
        enabled = list(self.detectors.keys())
        return {
            'performance_level': self.config.get('performance_level', 'custom'),
            'image_size': self.config.get('image_size'),
            'result_batch': self.config.get('result_batch'),
            'max_workers': self.max_workers,
            'enabled_detectors': enabled,
            'detector_feature_counts': {
                n: self.config.get('detectors', {}).get(n, 0) for n in enabled
            },
            'use_comic_detection': self.use_comic_detection,
            'use_advanced_matching': self.use_advanced_matching,
            'cache_only': self.cache_only,
            'feature_weights': self.feature_weights,
            'cache_manager_stats': self.cache_manager.get_stats()
        }
    
    def print_config_summary(self) -> None:
        """Print configuration summary."""
        summary = self.get_config_summary()
        title = "COMIC MATCHER CONFIGURATION"
        
        logger.success("=" * len(title))
        logger.success(title)
        logger.success("=" * len(title))
        logger.info(f"Performance Level: {summary['performance_level']}")
        logger.info(f"Image Size: {summary['image_size']}")
        logger.info(f"Max Workers: {summary['max_workers']}")
        logger.info(f"Result Batch Size: {summary['result_batch']}")
        logger.info(f"Enabled Detectors: {', '.join(summary['enabled_detectors'])}")
        
        for detector, count in summary['detector_feature_counts'].items():
            logger.info(f"   {detector.upper()}: {count} features")
        
        logger.info(f"Comic Detection: {summary['use_comic_detection']}")
        logger.info(f"Advanced Matching: {summary['use_advanced_matching']}")
        logger.info(f"Cache Only: {summary['cache_only']}")
        
        weights_str = ', '.join(f'{k}:{v:.2f}' for k, v in summary['feature_weights'].items())
        logger.info(f"Feature Weights: {weights_str}")
        
        cache = summary['cache_manager_stats']
        logger.info(f"Memory Cache: {cache.get('memory_image_count', 0)} images, {cache.get('memory_feature_count', 0)} features")
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
                
                cursor.execute('DELETE FROM cached_features WHERE url_hash = ?', (url_hash,))
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
    
    def debug_cache_lookup(self, url: str) -> str:
        """Debug cache lookup for a URL."""
        url_hash = compute_url_hash(url)
        logger.info(f"DEBUG: Looking up: {url[:50]}...")
        logger.info(f"DEBUG: Hash: {url_hash}")
        
        # Check memory
        with self.cache_manager._feature_lock:
            if url_hash in self.cache_manager._feature_cache:
                item = self.cache_manager._feature_cache[url_hash]
                logger.info(f"DEBUG: Found in memory, last accessed: {item.last_accessed}")
                logger.info(f"DEBUG: Processing time: {item.data.get('processing_time', 0):.2f}s")
                return "memory"
        
        # Check database
        try:
            conn = sqlite3.connect(self.db_path, timeout=5.0)
            cursor = conn.cursor()
            cursor.execute(
                'SELECT url, processing_time, last_accessed FROM cached_features WHERE url_hash = ?',
                (url_hash,)
            )
            result = cursor.fetchone()
            conn.close()
            
            if result:
                logger.info(f"DEBUG: Found in DB: {result[0][:50]}...")
                logger.info(f"DEBUG: Processing time: {result[1]:.2f}s")
                logger.info(f"DEBUG: Last accessed: {result[2]}")
                return "database"
            
            logger.info("DEBUG: Not found in database")
            return "not_found"
            
        except Exception as e:
            logger.error(f"DEBUG: Lookup failed: {e}")
            return "error"
    
    # Backward compatibility aliases
    def _get_url_hash(self, url: str) -> str:
        return compute_url_hash(url)
    
    def _serialize_keypoints(self, keypoints: List[cv2.KeyPoint]) -> bytes:
        return serialize_keypoints(keypoints)
    
    def _deserialize_keypoints(self, data: bytes) -> List[cv2.KeyPoint]:
        return deserialize_keypoints(data)
    
    def __del__(self):
        """Cleanup on destruction."""
        if hasattr(self, 'cache_manager'):
            self.cache_manager.shutdown()


# ============================================================================
# Testing Utilities
# ============================================================================

def performance_comparison_test(
    matcher: FeatureMatchingComicMatcher,
    test_urls: List[str],
    query_image: np.ndarray
) -> None:
    """Compare performance with cold vs warm cache."""
    logger.info("\n" + "=" * 30)
    logger.info("PERFORMANCE COMPARISON TEST")
    logger.info("=" * 30)
    
    # Cold cache
    logger.info("Cold cache run...")
    start = time.time()
    results1, _ = matcher.find_matches_img(query_image, test_urls[:10], threshold=0.1)
    cold_time = time.time() - start
    
    # Warm cache
    logger.info("Warm cache run...")
    start = time.time()
    results2, _ = matcher.find_matches_img(query_image, test_urls[:10], threshold=0.1)
    warm_time = time.time() - start
    
    logger.info(f"Cold cache: {cold_time:.2f}s")
    logger.info(f"Warm cache: {warm_time:.2f}s")
    logger.info(f"Speedup: {cold_time/warm_time:.1f}x")
    
    matcher.print_cache_stats()


def stress_test(
    matcher: FeatureMatchingComicMatcher,
    test_urls: List[str],
    query_image: np.ndarray,
    worker_counts: List[int] = [1, 2, 4, 8]
) -> None:
    """Test performance with different worker counts."""
    logger.info("\n" + "=" * 30)
    logger.info("CONCURRENCY STRESS TEST")
    logger.info("=" * 30)
    
    original_workers = matcher.max_workers
    
    for workers in worker_counts:
        logger.info(f"\nTesting with {workers} workers...")
        matcher.max_workers = workers
        
        start = time.time()
        results, _ = matcher.find_matches_img(query_image, test_urls, threshold=0.1)
        elapsed = time.time() - start
        
        logger.info(f"Workers: {workers}, Time: {elapsed:.2f}s, Results: {len(results)}")
    
    matcher.max_workers = original_workers
    matcher.print_cache_stats()