import os
import cv2
import json
import time
import sqlite3
import pickle
import requests
import hashlib
import numpy as np
import threading
import queue
from datetime import datetime
from dataclasses import dataclass
from util.Logger import get_logger
from typing import Dict, Optional, Tuple, List
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = get_logger(__name__)

# Set OpenCV to headless mode BEFORE importing cv2
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['OPENCV_LOG_LEVEL'] = 'ERROR'

cv2.setNumThreads(1)

DB_PATH = os.environ.get('COMIC_CACHE_DB_PATH', '/var/tmp/inferno-comics/comic_cache.db')
DB_IMAGE_CACHE = os.environ.get('COMIC_CACHE_IMAGE_PATH', '/var/tmp/inferno-comics/image_cache')

@dataclass
class CacheItem:
    """Represents a cache item with metadata"""
    data: any
    created_at: datetime
    last_accessed: datetime
    access_count: int = 0

def safe_progress_callback(callback, current_item, message=""):
    """Safely call progress callback, handling None case"""
    if callback is not None:
        try:
            callback(current_item, message)
        except Exception as e:
            logger.warning(f"Progress callback error: {e}")
            pass

class FastCacheManager:
    """High-performance cache manager with in-memory storage and async persistence"""
    
    def __init__(self, db_path: str, max_memory_items: int = 1000):
        self.db_path = db_path
        self.max_memory_items = max_memory_items
        
        # In-memory caches
        self.image_cache: Dict[str, CacheItem] = {}
        self.feature_cache: Dict[str, CacheItem] = {}
        
        # Thread-safe locks
        self.image_lock = threading.RLock()
        self.feature_lock = threading.RLock()
        
        # Async write queue and worker
        self.write_queue = queue.Queue()
        self.write_worker_running = True
        self.write_worker = threading.Thread(target=self._async_writer, daemon=True)
        self.write_worker.start()
        
        # Cache statistics
        self.stats = {
            'memory_hits': 0,
            'memory_misses': 0,
            'db_hits': 0,
            'db_misses': 0,
            'evictions': 0,
            'writes_queued': 0,
            'processing_time_saved': 0.0
        }
        
        # Load existing cache from database on startup
        self._warm_cache_from_db()
        
    def _warm_cache_from_db(self):
        """Load most recent items from database into memory on startup"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=10.0)
            cursor = conn.cursor()
            
            # Load recent feature cache entries
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
            conn.close()
            
            loaded_count = 0
            for row in rows:
                try:
                    url_hash = row[0]
                    features = self._deserialize_features_from_row_simple(row)
                    if features:
                        cache_item = CacheItem(
                            data=features,
                            created_at=datetime.now(),
                            last_accessed=datetime.fromisoformat(row[17]) if row[17] else datetime.now()
                        )
                        with self.feature_lock:
                            self.feature_cache[url_hash] = cache_item
                        loaded_count += 1
                except Exception as e:
                    logger.debug(f"Failed to load cache entry: {e}")
                    continue
            
            logger.info(f"Warmed cache with {loaded_count} feature entries from {len(rows)} database entries")
            
        except Exception as e:
            logger.warning(f"Failed to warm cache from database: {e}")
    
    def _deserialize_features_from_row_simple(self, row) -> Optional[Dict]:
        """Simplified deserialization that doesn't cause circular imports"""
        try:
            features = {
                'sift': {
                    'keypoints': self._deserialize_keypoints_simple(row[2]) if row[2] else [],
                    'descriptors': pickle.loads(row[3]) if row[3] else None,
                    'count': row[4] or 0
                },
                'orb': {
                    'keypoints': self._deserialize_keypoints_simple(row[5]) if row[5] else [],
                    'descriptors': pickle.loads(row[6]) if row[6] else None,
                    'count': row[7] or 0
                },
                'akaze': {
                    'keypoints': self._deserialize_keypoints_simple(row[8]) if row[8] else [],
                    'descriptors': pickle.loads(row[9]) if row[9] else None,
                    'count': row[10] or 0
                },
                'kaze': {
                    'keypoints': self._deserialize_keypoints_simple(row[11]) if row[11] else [],
                    'descriptors': pickle.loads(row[12]) if row[12] else None,
                    'count': row[13] or 0
                },
                'processing_time': row[14] or 0.0,
                'image_shape': json.loads(row[15]) if row[15] else None,
                'was_cropped': bool(row[16]) if row[16] is not None else False
            }
            return features
        except Exception as e:
            logger.debug(f"Failed to deserialize features: {e}")
            return None
    
    def _deserialize_keypoints_simple(self, data: bytes):
        """Simple keypoint deserialization"""
        if not data:
            return []
        
        try:
            kp_data = pickle.loads(data)
            keypoints = []
            for kp_dict in kp_data:
                kp = cv2.KeyPoint(
                    x=kp_dict['pt'][0],
                    y=kp_dict['pt'][1],
                    size=kp_dict['size'],
                    angle=kp_dict['angle'],
                    response=kp_dict['response'],
                    octave=kp_dict['octave'],
                    class_id=kp_dict['class_id']
                )
                keypoints.append(kp)
            return keypoints
        except Exception:
            return []
    
    def _deserialize_features_from_row(self, row) -> Optional[Dict]:
        """Helper to deserialize features from database row"""
        try:
            from FeatureMatchingComicMatcher import FeatureMatchingComicMatcher
            matcher = FeatureMatchingComicMatcher()
            
            features = {
                'sift': {
                    'keypoints': matcher._deserialize_keypoints(row[2]) if row[2] else [],
                    'descriptors': pickle.loads(row[3]) if row[3] else None,
                    'count': row[4] or 0
                },
                'orb': {
                    'keypoints': matcher._deserialize_keypoints(row[5]) if row[5] else [],
                    'descriptors': pickle.loads(row[6]) if row[6] else None,
                    'count': row[7] or 0
                },
                'akaze': {
                    'keypoints': matcher._deserialize_keypoints(row[8]) if row[8] else [],
                    'descriptors': pickle.loads(row[9]) if row[9] else None,
                    'count': row[10] or 0
                },
                'kaze': {
                    'keypoints': matcher._deserialize_keypoints(row[11]) if row[11] else [],
                    'descriptors': pickle.loads(row[12]) if row[12] else None,
                    'count': row[13] or 0
                },
                'processing_time': row[14],
                'image_shape': json.loads(row[15]) if row[15] else None,
                'was_cropped': bool(row[16])
            }
            return features
        except Exception as e:
            logger.debug(f"Failed to deserialize features: {e}")
            return None
    
    def _async_writer(self):
        """Background thread that handles database writes"""
        batch = []
        last_write = time.time()
        
        while self.write_worker_running:
            try:
                # Collect items for batching (max 10 items or 2 seconds)
                timeout = max(0.1, 2.0 - (time.time() - last_write))
                
                try:
                    item = self.write_queue.get(timeout=timeout)
                    batch.append(item)
                    
                    # Continue collecting until batch full or timeout
                    while len(batch) < 10:
                        try:
                            item = self.write_queue.get(timeout=0.1)
                            batch.append(item)
                        except queue.Empty:
                            break
                            
                except queue.Empty:
                    pass
                
                # Write batch if we have items and enough time has passed
                if batch and (len(batch) >= 10 or time.time() - last_write >= 2.0):
                    self._write_batch_to_db(batch)
                    batch.clear()
                    last_write = time.time()
                    
            except Exception as e:
                logger.error(f"Async writer error: {e}")
                time.sleep(1)
    
    def _write_batch_to_db(self, batch: List[Tuple]):
        """Write a batch of items to database efficiently"""
        if not batch:
            return
            
        try:
            conn = sqlite3.connect(self.db_path, timeout=30.0)
            conn.execute('PRAGMA journal_mode=WAL')
            conn.execute('PRAGMA synchronous=NORMAL')
            cursor = conn.cursor()
            
            # Group by operation type
            image_inserts = []
            feature_inserts = []
            
            for item_type, data in batch:
                if item_type == 'image':
                    image_inserts.append(data)
                elif item_type == 'features':
                    feature_inserts.append(data)
            
            # Batch insert images
            if image_inserts:
                cursor.executemany('''
                    INSERT OR REPLACE INTO cached_images 
                    (url_hash, url, file_path, file_size, created_at, last_accessed)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', image_inserts)
            
            # Batch insert features
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
            
            conn.commit()
            conn.close()
            
            logger.debug(f"Batch wrote {len(image_inserts)} images, {len(feature_inserts)} features")
            
        except Exception as e:
            logger.error(f"Batch write failed: {e}")
    
    def get_image(self, url_hash: str) -> Optional[np.ndarray]:
        """Get image from cache (memory first, then database)"""
        # Check memory cache first
        with self.image_lock:
            if url_hash in self.image_cache:
                item = self.image_cache[url_hash]
                item.last_accessed = datetime.now()
                item.access_count += 1
                self.stats['memory_hits'] += 1
                return item.data
        
        # Check database
        try:
            conn = sqlite3.connect(self.db_path, timeout=5.0)
            cursor = conn.cursor()
            cursor.execute('SELECT file_path FROM cached_images WHERE url_hash = ?', (url_hash,))
            result = cursor.fetchone()
            conn.close()
            
            if result and os.path.exists(result[0]):
                image = cv2.imread(result[0])
                if image is not None:
                    # Store in memory for future access
                    cache_item = CacheItem(
                        data=image,
                        created_at=datetime.now(),
                        last_accessed=datetime.now()
                    )
                    with self.image_lock:
                        self._add_to_memory_cache(self.image_cache, url_hash, cache_item, self.image_lock)
                    
                    self.stats['db_hits'] += 1
                    return image
        except Exception as e:
            logger.debug(f"Database image lookup failed: {e}")
        
        self.stats['db_misses'] += 1
        return None
    
    def cache_image(self, url_hash: str, url: str, image: np.ndarray, file_path: str):
        """Cache image to memory and queue for database write"""
        file_size = os.path.getsize(file_path)
        
        # Store in memory immediately
        cache_item = CacheItem(
            data=image,
            created_at=datetime.now(),
            last_accessed=datetime.now()
        )
        
        with self.image_lock:
            self._add_to_memory_cache(self.image_cache, url_hash, cache_item, self.image_lock)
        
        # Queue for database write
        write_data = (url_hash, url, file_path, file_size, datetime.now(), datetime.now())
        self.write_queue.put(('image', write_data))
        self.stats['writes_queued'] += 1
    
    def get_features(self, url_hash: str) -> Optional[Dict]:
        """Get features from cache (memory first, then database)"""
        # Check memory cache first
        with self.feature_lock:
            if url_hash in self.feature_cache:
                item = self.feature_cache[url_hash]
                item.last_accessed = datetime.now()
                item.access_count += 1
                self.stats['memory_hits'] += 1
                # Track processing time saved from cached features
                processing_time = item.data.get('processing_time', 0.0)
                self.stats['processing_time_saved'] += processing_time
                logger.debug(f"Memory cache hit for {url_hash[:8]}... (saved {processing_time:.2f}s)")
                return item.data
        
        self.stats['memory_misses'] += 1
        
        # Check database
        try:
            conn = sqlite3.connect(self.db_path, timeout=5.0)
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
            conn.close()
            
            if result:
                features = self._deserialize_features_from_row_simple(result)
                if features:
                    # Store in memory for future access
                    cache_item = CacheItem(
                        data=features,
                        created_at=datetime.now(),
                        last_accessed=datetime.now()
                    )
                    
                    with self.feature_lock:
                        self._add_to_memory_cache(self.feature_cache, url_hash, cache_item, self.feature_lock)
                    
                    self.stats['db_hits'] += 1
                    # Track processing time saved from database features
                    processing_time = features.get('processing_time', 0.0)
                    self.stats['processing_time_saved'] += processing_time
                    logger.debug(f"Database cache hit for {url_hash[:8]}... (saved {processing_time:.2f}s)")
                    return features
        except Exception as e:
            logger.debug(f"Database feature lookup failed: {e}")
        
        self.stats['db_misses'] += 1
        return None
    
    def cache_features(self, url_hash: str, url: str, features: Dict, processing_time: float, 
                      image_shape: Tuple, was_cropped: bool, serializer_func):
        """Cache features to memory and queue for database write"""
        # Store in memory immediately
        cache_item = CacheItem(
            data=features,
            created_at=datetime.now(),
            last_accessed=datetime.now()
        )
        
        with self.feature_lock:
            self._add_to_memory_cache(self.feature_cache, url_hash, cache_item, self.feature_lock)
        
        # Prepare serialized data for database write
        sift_kp_data = serializer_func(features['sift']['keypoints'])
        sift_desc_data = pickle.dumps(features['sift']['descriptors']) if features['sift']['descriptors'] is not None else b''
        orb_kp_data = serializer_func(features['orb']['keypoints'])
        orb_desc_data = pickle.dumps(features['orb']['descriptors']) if features['orb']['descriptors'] is not None else b''
        akaze_kp_data = serializer_func(features['akaze']['keypoints'])
        akaze_desc_data = pickle.dumps(features['akaze']['descriptors']) if features['akaze']['descriptors'] is not None else b''
        kaze_kp_data = serializer_func(features['kaze']['keypoints'])
        kaze_desc_data = pickle.dumps(features['kaze']['descriptors']) if features['kaze']['descriptors'] is not None else b''
        
        write_data = (
            url_hash, url,
            sift_kp_data, sift_desc_data, features['sift']['count'],
            orb_kp_data, orb_desc_data, features['orb']['count'],
            akaze_kp_data, akaze_desc_data, features['akaze']['count'],
            kaze_kp_data, kaze_desc_data, features['kaze']['count'],
            processing_time, json.dumps(image_shape), was_cropped,
            datetime.now(), datetime.now()
        )
        
        self.write_queue.put(('features', write_data))
        self.stats['writes_queued'] += 1
    
    def _add_to_memory_cache(self, cache_dict: Dict, key: str, item: CacheItem, lock):
        """Add item to memory cache with LRU eviction"""
        cache_dict[key] = item
        
        # Evict least recently used items if cache is full
        if len(cache_dict) > self.max_memory_items:
            # Sort by last_accessed and remove oldest 10%
            sorted_items = sorted(cache_dict.items(), key=lambda x: x[1].last_accessed)
            evict_count = max(1, len(sorted_items) // 10)
            
            for i in range(evict_count):
                del cache_dict[sorted_items[i][0]]
                self.stats['evictions'] += 1
    
    def get_stats(self) -> Dict:
        """Get comprehensive cache statistics"""
        with self.image_lock, self.feature_lock:
            total_requests = (self.stats['memory_hits'] + self.stats['memory_misses'] + 
                            self.stats['db_hits'] + self.stats['db_misses'])
            hit_rate = ((self.stats['memory_hits'] + self.stats['db_hits']) / total_requests * 100) if total_requests > 0 else 0
            memory_hit_rate = (self.stats['memory_hits'] / total_requests * 100) if total_requests > 0 else 0
            
            return {
                **self.stats,
                'memory_image_count': len(self.image_cache),
                'memory_feature_count': len(self.feature_cache),
                'total_hit_rate': hit_rate,
                'memory_hit_rate': memory_hit_rate,
                'queue_size': self.write_queue.qsize()
            }
    
    def shutdown(self):
        """Gracefully shutdown the cache manager"""
        logger.info("Shutting down cache manager...")
        self.write_worker_running = False
        
        # Wait for queue to empty
        while not self.write_queue.empty():
            time.sleep(0.1)
        
        self.write_worker.join(timeout=5.0)
        logger.info("Cache manager shutdown complete")

class FeatureMatchingComicMatcher:
    def __init__(self, config, cache_dir=DB_IMAGE_CACHE, db_path=DB_PATH):
        self.config = config
        self.cache_dir = cache_dir
        self.db_path = db_path
        self.max_workers = self.config.get('max_workers', 4)
        
        logger.info(f"Initializing Fast Comic Matcher")
        logger.debug(f"Cache directory: {cache_dir}")
        logger.debug(f"Database path: {db_path}")
        #logger.debug(f"Image size: {self.config.get('image_size')}")
        logger.debug(f"Workers: {self.max_workers}")
        
        os.makedirs(cache_dir, exist_ok=True)
        self._init_database()
        self._setup_detectors()
        self._setup_settings()
        
        # Initialize fast cache manager
        self.cache_manager = FastCacheManager(db_path, max_memory_items=2000)
        
        # Initialize session for downloads
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

        self.print_config_summary()
        
    def _setup_detectors(self):
        """Setup feature detectors based on config with configurable weights"""
        self.detectors = {}
        self.feature_weights = {}
        detector_config = self.config.get('detectors', {})
        weights_config = self.config.get('feature_weights', {})
        
        # SIFT
        sift_features = detector_config.get('sift', 0)
        if sift_features > 0:
            self.detectors['sift'] = cv2.SIFT_create(nfeatures=sift_features)
            self.feature_weights['sift'] = weights_config.get('sift', 0.25)
            logger.info(f"SIFT: {sift_features} features (weight: {self.feature_weights['sift']:.2f})")
        
        # ORB  
        orb_features = detector_config.get('orb', 0)
        if orb_features > 0:
            self.detectors['orb'] = cv2.ORB_create(nfeatures=orb_features)
            self.feature_weights['orb'] = weights_config.get('orb', 0.25)
            logger.info(f"ORB: {orb_features} features (weight: {self.feature_weights['orb']:.2f})")
        
        # AKAZE - The star performer!
        akaze_features = detector_config.get('akaze', 0)
        if akaze_features > 0:
            self.detectors['akaze'] = cv2.AKAZE_create()
            self.feature_weights['akaze'] = weights_config.get('akaze', 0.40)
            logger.info(f"AKAZE: enabled (weight: {self.feature_weights['akaze']:.2f} - star performer!)")
        
        # KAZE
        kaze_features = detector_config.get('kaze', 0)
        if kaze_features > 0:
            self.detectors['kaze'] = cv2.KAZE_create()
            self.feature_weights['kaze'] = weights_config.get('kaze', 0.10)
            logger.info(f"KAZE: enabled (weight: {self.feature_weights['kaze']:.2f})")
        
        # Normalize weights to ensure they sum to 1.0
        if self.feature_weights:
            total = sum(self.feature_weights.values())
            if total > 0:
                self.feature_weights = {k: v/total for k, v in self.feature_weights.items()}
                logger.info(f"Normalized weights: {', '.join([f'{k}:{v:.2f}' for k, v in self.feature_weights.items()])}")
            else:
                logger.warning("All feature weights are zero!")
        
        # Setup matchers
        self.matchers = {}
        if 'sift' in self.detectors:
            FLANN_INDEX_KDTREE = 1
            index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
            search_params = dict(checks=50)
            self.matchers['sift'] = cv2.FlannBasedMatcher(index_params, search_params)
        
        for detector in ['orb', 'akaze']:
            if detector in self.detectors:
                self.matchers[detector] = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        
        if 'kaze' in self.detectors:
            self.matchers['kaze'] = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
     
    def _setup_settings(self):
        """Setup other settings from config"""
        options = self.config.get('options', {})
        
        self.use_comic_detection = options.get('use_comic_detection', True)
        self.use_advanced_matching = options.get('use_advanced_matching', True)
        self.cache_only = options.get('cache_only', False)
        
        logger.info(f"Comic detection: {self.use_comic_detection}")
        logger.info(f"Advanced matching: {self.use_advanced_matching}")
        logger.info(f"Cache only: {self.cache_only}")

    def _init_database(self):
        """Initialize SQLite database with WAL mode for better concurrency"""
        logger.debug("Initializing SQLite database...")
        
        conn = sqlite3.connect(self.db_path)
        
        # Enable WAL mode for better concurrent access
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA synchronous=NORMAL') 
        conn.execute('PRAGMA cache_size=10000')
        conn.execute('PRAGMA temp_store=MEMORY')
        
        cursor = conn.cursor()
        
        # Table for cached images
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
        
        # Table for cached features (updated with KAZE)
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
        
        # Add KAZE columns to existing table if they don't exist (backwards compatibility)
        try:
            cursor.execute('ALTER TABLE cached_features ADD COLUMN kaze_keypoints BLOB')
            cursor.execute('ALTER TABLE cached_features ADD COLUMN kaze_descriptors BLOB')
            cursor.execute('ALTER TABLE cached_features ADD COLUMN kaze_count INTEGER')
            logger.debug("Added KAZE columns to existing database")
        except sqlite3.OperationalError:
            # Columns already exist
            pass
        
        # Create indexes for performance
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_url ON cached_images(url)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_features_url ON cached_features(url)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_accessed ON cached_images(last_accessed)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_features_accessed ON cached_features(last_accessed)')
        
        conn.commit()
        conn.close()

    def _get_url_hash(self, url: str) -> str:
        """Generate consistent hash for URL"""
        return hashlib.md5(url.encode()).hexdigest()
    
    def _serialize_keypoints(self, keypoints) -> bytes:
        """Serialize OpenCV keypoints to bytes"""
        if not keypoints:
            return b''
        
        # Convert keypoints to serializable format
        kp_data = []
        for kp in keypoints:
            kp_data.append({
                'pt': kp.pt,
                'angle': kp.angle,
                'class_id': kp.class_id,
                'octave': kp.octave,
                'response': kp.response,
                'size': kp.size
            })
        return pickle.dumps(kp_data)
    
    def _deserialize_keypoints(self, data: bytes):
        """Deserialize bytes back to OpenCV keypoints"""
        if not data:
            return []
        
        kp_data = pickle.loads(data)
        keypoints = []
        for kp_dict in kp_data:
            kp = cv2.KeyPoint(
                x=kp_dict['pt'][0],
                y=kp_dict['pt'][1],
                size=kp_dict['size'],
                angle=kp_dict['angle'],
                response=kp_dict['response'],
                octave=kp_dict['octave'],
                class_id=kp_dict['class_id']
            )
            keypoints.append(kp)
        return keypoints
    
    def download_image(self, url: str, timeout: int = 10) -> Optional[np.ndarray]:
        """Download image with fast caching support"""
        url_hash = self._get_url_hash(url)
        
        # Check fast cache first
        cached_image = self.cache_manager.get_image(url_hash)
        if cached_image is not None:
            return cached_image
        
        # Download if not cached
        try:
            logger.debug(f"Downloading image: {url[:50]}...")
            response = self.session.get(url, timeout=timeout)
            response.raise_for_status()
            
            image_array = np.frombuffer(response.content, np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if image is not None:
                # Save to filesystem and cache
                file_path = os.path.join(self.cache_dir, f"{url_hash}.jpg")
                cv2.imwrite(file_path, image)
                
                # Cache using fast cache manager
                self.cache_manager.cache_image(url_hash, url, image, file_path)
                logger.success(f"Downloaded and cached: {url[:50]}...")
            else:
                logger.warning(f"Failed to decode image: {url[:50]}...")
            
            return image
            
        except Exception as e:
            logger.error(f"Download error for {url[:50]}...: {e}")
            return None
    
    def extract_features_cached(self, url: str) -> Optional[Dict]:
        """Extract features with fast caching support"""
        url_hash = self._get_url_hash(url)
        
        # Check fast cache first
        cached_features = self.cache_manager.get_features(url_hash)
        if cached_features is not None:
            return cached_features
        
        # If cache-only mode, return None instead of processing
        if self.cache_only:
            logger.debug(f"Cache-only mode: skipping processing for {url[:50]}...")
            return None
        
        # Download image
        image = self.download_image(url)
        if image is None:
            return None
        
        # Process image
        start_time = time.time()
        cropped_image, was_cropped = self.detect_comic_area(image)
        features = self.extract_features(cropped_image)
        processing_time = time.time() - start_time
        
        logger.debug(f"Feature extraction took {processing_time:.2f}s")
        
        if features is not None:
            # Cache using fast cache manager
            self.cache_manager.cache_features(
                url_hash, url, features, processing_time, 
                cropped_image.shape, was_cropped, self._serialize_keypoints
            )
        
        return features
    
    def detect_comic_area(self, image):
        """Simple or enhanced comic detection based on config"""
        if not self.use_comic_detection or image is None:
            return image, False
            
        if self.use_advanced_matching:
            return self._detect_comic_enhanced(image)
        else:
            return self._detect_comic_simple(image)
    
    def _detect_comic_simple(self, image):
        """Simple and fast comic detection"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        edges = cv2.Canny(gray, 50, 150)
        
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if contours:
            largest = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest)
            h, w = image.shape[:2]
            
            if area > (w * h * 0.1):
                x, y, cw, ch = cv2.boundingRect(largest)
                pad = 20
                x = max(0, x - pad)
                y = max(0, y - pad)
                cw = min(w - x, cw + 2 * pad)
                ch = min(h - y, ch + 2 * pad)
                
                cropped = image[y:y+ch, x:x+cw]
                return cropped, True
        
        return image, False
    
    def _detect_comic_enhanced(self, image):
        """Enhanced comic detection with multiple approaches"""
        original = image.copy()
        h, w = image.shape[:2]
        
        approaches = [
            self._detect_comic_contour_based,
            self._detect_comic_color_based,
            self._detect_comic_adaptive_threshold
        ]
        
        best_crop = None
        best_score = 0
        
        for approach in approaches:
            try:
                crop, score = approach(image)
                if score > best_score:
                    best_score = score
                    best_crop = crop
            except Exception as e:
                logger.debug(f"Comic detection approach failed: {e}")
                continue
        
        if best_crop is not None and best_score > 0.15:
            logger.success(f"Enhanced comic detected: {original.shape} -> {best_crop.shape} (score: {best_score:.3f})")
            return best_crop, True
        
        return original, False
    
    def _detect_comic_contour_based(self, image):
        """Enhanced contour-based detection"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        
        # Multi-scale edge detection
        edges_list = []
        for blur_size in [3, 5, 7]:
            blurred = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)
            edges = cv2.Canny(blurred, 30, 90)
            edges_list.append(edges)
        
        combined_edges = np.maximum.reduce(edges_list)
        
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (8, 8))
        combined_edges = cv2.morphologyEx(combined_edges, cv2.MORPH_CLOSE, kernel)
        combined_edges = cv2.morphologyEx(combined_edges, cv2.MORPH_DILATE, kernel)
        
        contours, _ = cv2.findContours(combined_edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return image, 0.0
        
        best_contour = None
        best_score = 0
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < (w * h) * 0.05 or area > (w * h) * 0.95:
                continue
            
            x, y, cw, ch = cv2.boundingRect(contour)
            rect_area = cw * ch
            fill_ratio = area / rect_area if rect_area > 0 else 0
            aspect_ratio = ch / cw if cw > 0 else 0
            
            if 0.6 <= aspect_ratio <= 3.5 and fill_ratio > 0.4:
                center_x, center_y = x + cw/2, y + ch/2
                image_center_x, image_center_y = w/2, h/2
                center_distance = np.sqrt((center_x - image_center_x)**2 + (center_y - image_center_y)**2)
                center_penalty = center_distance / (w + h)
                
                score = (area / (w * h)) * fill_ratio * min(aspect_ratio / 1.4, 1) * (1 - center_penalty * 0.3)
                
                if score > best_score:
                    best_score = score
                    best_contour = contour
        
        if best_contour is not None:
            x, y, cw, ch = cv2.boundingRect(best_contour)
            pad = 20
            x = max(0, x - pad)
            y = max(0, y - pad)
            cw = min(w - x, cw + 2 * pad)
            ch = min(h - y, ch + 2 * pad)
            
            return image[y:y+ch, x:x+cw], best_score
        
        return image, 0.0

    def _detect_comic_color_based(self, image):
        """Color-based comic detection"""
        h, w = image.shape[:2]
        
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        lower_bound = np.array([0, 20, 20])
        upper_bound = np.array([180, 255, 255])
        color_mask = cv2.inRange(hsv, lower_bound, upper_bound)
        
        contours, _ = cv2.findContours(color_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return image, 0.0
        
        largest_contour = max(contours, key=cv2.contourArea)
        x, y, cw, ch = cv2.boundingRect(largest_contour)
        
        area_ratio = (cw * ch) / (w * h)
        aspect_ratio = ch / cw if cw > 0 else 0
        
        if 0.6 <= aspect_ratio <= 3.5 and area_ratio > 0.3:
            score = area_ratio * min(aspect_ratio / 1.4, 1) * 0.8
            pad = 15
            x = max(0, x - pad)
            y = max(0, y - pad)
            cw = min(w - x, cw + 2 * pad)
            ch = min(h - y, ch + 2 * pad)
            
            return image[y:y+ch, x:x+cw], score
        
        return image, 0.0
    
    def _detect_comic_adaptive_threshold(self, image):
        """Adaptive threshold-based detection"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        
        adaptive_thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        contours, _ = cv2.findContours(adaptive_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return image, 0.0
        
        best_score = 0
        best_bbox = None
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < (w * h) * 0.1 or area > (w * h) * 0.9:
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
            x = max(0, x - pad)
            y = max(0, y - pad)
            cw = min(w - x, cw + 2 * pad)
            ch = min(h - y, ch + 2 * pad)
            
            return image[y:y+ch, x:x+cw], best_score
        
        return image, 0.0
   
    def preprocess_image(self, image):
        """Configurable image preprocessing based on settings"""
        if image is None:
            return None
        
        h, w = image.shape[:2]
        target_size = self.config.get('image_size')
        
        if max(h, w) > target_size:
            scale = target_size / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            interpolation = cv2.INTER_LINEAR if not self.use_advanced_matching else cv2.INTER_LANCZOS4
            image = cv2.resize(image, (new_w, new_h), interpolation=interpolation)
            logger.debug(f"Resized image from {w}x{h} to {new_w}x{new_h}")
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        if self.use_advanced_matching:
            # High quality preprocessing
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(12, 12))
            enhanced = clahe.apply(gray)
            
            denoised = cv2.bilateralFilter(enhanced, 5, 50, 50)
            
            kernel = np.array([[-0.5, -0.5, -0.5],
                            [-0.5,  5.0, -0.5],
                            [-0.5, -0.5, -0.5]])
            sharpened = cv2.filter2D(denoised, -1, kernel)
            
            processed = cv2.addWeighted(sharpened, 0.7, denoised, 0.3, 0)
            logger.debug("Applied advanced preprocessing")
        else:
            processed = cv2.equalizeHist(gray)
            logger.debug("Applied fast preprocessing")
        
        return processed

    def extract_features(self, image):
        """Extract features using configured detectors with early termination"""
        if image is None:
            return None
        
        processed = self.preprocess_image(image)
        if processed is None:
            return None
        
        features = {}
        
        for detector_name, detector in self.detectors.items():
            try:
                kp, desc = detector.detectAndCompute(processed, None)
                features[detector_name] = {
                    'keypoints': kp,
                    'descriptors': desc,
                    'count': len(kp) if kp else 0
                }
                logger.debug(f"{detector_name.upper()} features: {features[detector_name]['count']}")
                
                if (not self.use_advanced_matching and detector_name == 'orb' and 
                    features[detector_name]['count'] < 10):
                    logger.debug(f"Early termination: Only {features[detector_name]['count']} ORB features found")
                    for other_detector in ['sift', 'akaze', 'kaze']:
                        if other_detector not in features:
                            features[other_detector] = {'keypoints': [], 'descriptors': None, 'count': 0}
                    break
                    
            except Exception as e:
                logger.warning(f"{detector_name.upper()} extraction failed: {e}")
                features[detector_name] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        # Ensure all detector types have entries for compatibility
        for detector_type in ['sift', 'orb', 'akaze', 'kaze']:
            if detector_type not in features:
                features[detector_type] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        return features
    
    def match_features(self, query_features, candidate_features):
        """Configurable feature matching - simple or advanced based on settings"""
        if not query_features or not candidate_features:
            return 0.0, {}
        
        if self.use_advanced_matching:
            return self._match_features_advanced(query_features, candidate_features)
        else:
            return self._match_features_simple(query_features, candidate_features)
    
    def _match_features_simple(self, query_features, candidate_features):
        """Simple and fast feature matching"""
        similarities = []
        match_results = {}
        
        for detector_name in self.detectors.keys():
            if (query_features.get(detector_name, {}).get('descriptors') is not None and 
                candidate_features.get(detector_name, {}).get('descriptors') is not None):
                
                try:
                    if detector_name in self.matchers:
                        matches = self.matchers[detector_name].match(
                            query_features[detector_name]['descriptors'], 
                            candidate_features[detector_name]['descriptors']
                        )
                        good_matches = [m for m in matches if m.distance < 50]
                    else:
                        good_matches = []
                    
                    total_features = min(
                        query_features[detector_name]['count'], 
                        candidate_features[detector_name]['count']
                    )
                    
                    if total_features > 0:
                        similarity = len(good_matches) / total_features
                        weight = self.feature_weights.get(detector_name, 0.25)
                        similarities.append((similarity, weight))
                        
                        match_results[detector_name] = {
                            'matches': len(good_matches),
                            'similarity': similarity
                        }
                
                except Exception as e:
                    logger.debug(f"{detector_name} matching failed: {e}")
        
        if similarities:
            weighted_sum = sum(sim * weight for sim, weight in similarities)
            total_weight = sum(weight for _, weight in similarities)
            overall_similarity = weighted_sum / total_weight if total_weight > 0 else 0.0
        else:
            overall_similarity = 0.0
        
        return overall_similarity, match_results
    
    def _match_features_advanced(self, query_features, candidate_features):
        """Advanced feature matching with geometric verification"""
        match_results = {}
        similarities = []
        geometric_scores = []
        
        scoring_params = {
            'similarity_boost': 1.3,
            'geometric_weight': 0.15,
            'multi_detector_bonus': 0.08,
            'quality_threshold': 0.15
        }
        
        # Match each detector type
        for detector_name in ['sift', 'orb', 'akaze', 'kaze']:
            if detector_name in self.detectors:
                similarity, geometric = self._match_detector_enhanced(
                    detector_name, query_features, candidate_features, match_results
                )
                if similarity > 0:
                    weight = self.feature_weights.get(detector_name, 0.25)
                    similarities.append((detector_name, similarity, weight))
                    geometric_scores.append(geometric)
        
        if similarities:
            weighted_sum = sum(sim * weight for _, sim, weight in similarities)
            total_weight = sum(weight for _, _, weight in similarities)
            
            if total_weight > 0:
                base_similarity = weighted_sum / total_weight
                
                if base_similarity > scoring_params['quality_threshold']:
                    boosted_similarity = base_similarity * scoring_params['similarity_boost']
                else:
                    boosted_similarity = base_similarity
                
                if geometric_scores:
                    avg_geometric = sum(geometric_scores) / len(geometric_scores)
                    geometric_bonus = avg_geometric * scoring_params['geometric_weight']
                    boosted_similarity += geometric_bonus
                
                if len(similarities) > 1:
                    agreement_bonus = scoring_params['multi_detector_bonus'] * (len(similarities) - 1)
                    boosted_similarity += agreement_bonus
                
                overall_similarity = min(0.95, boosted_similarity)
                
                logger.debug(f"Advanced matching similarity: {overall_similarity:.3f} (base: {base_similarity:.3f}, {len(similarities)} detectors)")
            else:
                overall_similarity = 0.0
        else:
            overall_similarity = 0.0
        
        return overall_similarity, match_results

    def _match_detector_enhanced(self, detector_name, query_features, candidate_features, match_results):
        """Enhanced matching for a specific detector"""
        if (query_features.get(detector_name, {}).get('descriptors') is None or 
            candidate_features.get(detector_name, {}).get('descriptors') is None):
            return 0.0, 0.0
        
        query_desc = query_features[detector_name]['descriptors']
        candidate_desc = candidate_features[detector_name]['descriptors']
        
        min_features = 8 if detector_name in ['sift', 'orb', 'kaze'] else 5
        if len(query_desc) < min_features or len(candidate_desc) < min_features:
            return 0.0, 0.0
        
        try:
            if detector_name in self.matchers:
                matches = self.matchers[detector_name].knnMatch(query_desc, candidate_desc, k=2)
            else:
                return 0.0, 0.0
            
            good_matches = []
            distances = []
            for match_pair in matches:
                if len(match_pair) >= 2:
                    m, n = match_pair[0], match_pair[1]
                    if m.distance < 0.75 * n.distance:
                        good_matches.append(m)
                        distances.append(m.distance)
            
            geometric_score = 0.0
            
            # Geometric verification for SIFT, ORB, and KAZE
            if len(good_matches) >= 8 and detector_name in ['sift', 'orb', 'kaze']:
                query_kpts = query_features[detector_name]['keypoints']
                candidate_kpts = candidate_features[detector_name]['keypoints']
                
                query_pts = np.float32([query_kpts[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                candidate_pts = np.float32([candidate_kpts[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                
                try:
                    M, mask = cv2.findHomography(query_pts, candidate_pts, cv2.RANSAC, 5.0)
                    if M is not None and mask is not None:
                        inliers = int(np.sum(mask))
                        geometric_score = float(inliers / len(good_matches))
                except Exception:
                    geometric_score = 0.4
            elif detector_name == 'akaze':
                geometric_score = min(1.0, len(good_matches) / 20.0) if good_matches else 0.0
            
            # Calculate similarity
            total_features = min(
                query_features[detector_name]['count'], 
                candidate_features[detector_name]['count']
            )
            
            if total_features > 0:
                match_ratio = len(good_matches) / total_features
                
                # Quality bonus for SIFT and KAZE based on distance
                if distances and detector_name in ['sift', 'kaze']:
                    avg_distance = sum(distances) / len(distances)
                    threshold = 200 if detector_name == 'sift' else 150
                    distance_quality = max(0, (threshold - avg_distance) / threshold)
                    quality_bonus = distance_quality * 0.2
                else:
                    quality_bonus = 0
                
                # Combine with geometric score
                if detector_name in ['sift', 'kaze']:
                    similarity = match_ratio + quality_bonus + (geometric_score * 0.1)
                elif detector_name == 'orb':
                    similarity = match_ratio + (geometric_score * 0.15)
                else:  # akaze
                    similarity = match_ratio
            else:
                similarity = 0.0
            
            match_results[detector_name] = {
                'total_matches': int(len(matches)),
                'good_matches': int(len(good_matches)),
                'geometric_score': float(geometric_score),
                'similarity': float(similarity)
            }
            
            logger.debug(f"Enhanced {detector_name.upper()}: {len(good_matches)}/{len(matches)} matches, geo: {geometric_score:.3f}, sim: {similarity:.3f}")
            return similarity, geometric_score
            
        except Exception as e:
            logger.warning(f"Enhanced {detector_name.upper()} matching error: {e}")
            match_results[detector_name] = {'total_matches': 0, 'good_matches': 0, 'geometric_score': 0.0, 'similarity': 0.0}
            return 0.0, 0.0

    def find_matches_img(self, query_image, candidate_urls, threshold=0.1, progress_callback=None):
        """Main matching function with fast caching support and progress callback"""
        logger.info("Starting Fast Feature Matching Comic Search...")
        start_time = time.time()
        
        if query_image is None:
            raise ValueError("Query image data is None")
        
        logger.info(f"Received query image: {query_image.shape}")
        
        safe_progress_callback(progress_callback, 0, "Processing query image...")
        
        query_image, was_cropped = self.detect_comic_area(query_image)
        query_features = self.extract_features(query_image)
        
        if not query_features:
            raise ValueError("Could not extract features from query image")
        
        enabled_detectors = [name for name in ['sift', 'orb', 'akaze', 'kaze'] if name in self.detectors]
        feature_counts = {name: query_features[name]['count'] for name in enabled_detectors}
        
        logger.success(f"Query features - {', '.join([f'{name.upper()}: {count}' for name, count in feature_counts.items()])}")
        
        safe_progress_callback(progress_callback, 1, f"Query features extracted - {', '.join([f'{name.upper()}: {count}' for name, count in feature_counts.items()])}")
        
        logger.info(f"Processing {len(candidate_urls)} candidate images (with fast caching)...")
        
        safe_progress_callback(progress_callback, 2, f"Starting analysis of {len(candidate_urls)} candidates...")
        
        results = []
        total_candidates = len(candidate_urls)
        
        if total_candidates == 0:
            logger.warning("No candidate URLs provided")
            return results, query_features
        
        batch_size = max(1, total_candidates // 20)
        logger.debug(f"Progress batch size: {batch_size}")
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            logger.debug(f"Using {self.max_workers} worker threads")
            
            future_to_url = {}
            for i, url in enumerate(candidate_urls):
                future = executor.submit(self._process_single_candidate_cached, query_features, url, i)
                future_to_url[future] = (url, i)
            
            completed = 0
            for future in as_completed(future_to_url):
                url, index = future_to_url[future]
                completed += 1
                
                try:
                    result = future.result()
                    if result:
                        results.append(result)
                        if result.get('similarity', 0) >= threshold:
                            logger.debug(f"Good match found: {url[:50]}... (similarity: {result['similarity']:.3f})")
                    
                    if completed % batch_size == 0 or completed >= total_candidates - 5:
                        message = f"Analyzed {completed}/{total_candidates} candidates"
                        if result and 'similarity' in result:
                            message += f" (latest: {result['similarity']:.3f})"
                        safe_progress_callback(progress_callback, completed + 3, message)
                        
                except Exception as e:
                    logger.error(f"Error processing candidate {url[:50]}...: {e}")
                    results.append({
                        'url': url,
                        'similarity': 0.0,
                        'status': 'processing_error',
                        'match_details': {'error': str(e)},
                        'candidate_features': {}
                    })
                    continue
        
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        good_matches = [r for r in results if r['similarity'] >= threshold]
        
        safe_progress_callback(progress_callback, total_candidates + 3, f"Completed analysis - found {len(good_matches)} matches above threshold")
        
        total_time = time.time() - start_time
        logger.success(f"Fast feature matching completed in {total_time:.2f}s")
        logger.info(f"Found {len(good_matches)} matches above threshold ({threshold})")
        
        if good_matches:
            logger.info(f"Top match: {good_matches[0]['url'][:50]}... (similarity: {good_matches[0]['similarity']:.3f})")
        
        return results, query_features

    def _process_single_candidate_cached(self, query_features, candidate_url, index):
        """Process a single candidate URL with fast caching and return result"""
        try:
            candidate_features = self.extract_features_cached(candidate_url)
            
            if not candidate_features:
                logger.debug(f"Failed to extract features for: {candidate_url[:50]}...")
                return {
                    'url': candidate_url,
                    'similarity': 0.0,
                    'status': 'failed_features',
                    'match_details': {'error': 'Failed to extract features'},
                    'candidate_features': {}
                }
            
            similarity, match_details = self.match_features(query_features, candidate_features)
            
            return {
                'url': candidate_url,
                'similarity': similarity,
                'status': 'success',
                'match_details': match_details,
                'candidate_features': {
                    'sift_count': candidate_features['sift']['count'],
                    'orb_count': candidate_features['orb']['count'],
                    'akaze_count': candidate_features['akaze']['count'],
                    'kaze_count': candidate_features['kaze']['count']
                }
            }
            
        except Exception as e:
            logger.error(f"Processing failed for {candidate_url[:50]}...: {e}")
            return {
                'url': candidate_url,
                'similarity': 0.0,
                'status': 'processing_failed',
                'match_details': {'error': str(e)},
                'candidate_features': {}
            }
        
    def get_cache_stats(self) -> Dict:
        """Get comprehensive cache performance statistics"""
        cache_stats = self.cache_manager.get_stats()
        
        try:
            conn = sqlite3.connect(self.db_path, timeout=5.0)
            cursor = conn.cursor()
            
            cursor.execute('SELECT COUNT(*) FROM cached_images')
            cached_images_count = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM cached_features')
            cached_features_count = cursor.fetchone()[0]
            
            cursor.execute('SELECT SUM(file_size) FROM cached_images')
            total_disk_usage = cursor.fetchone()[0] or 0
            
            detector_stats = {}
            for detector in ['sift', 'orb', 'akaze', 'kaze']:
                try:
                    cursor.execute(f'SELECT COUNT(*) FROM cached_features WHERE {detector}_count > 0')
                    detector_stats[f'{detector}_features_count'] = cursor.fetchone()[0]
                except sqlite3.OperationalError:
                    detector_stats[f'{detector}_features_count'] = 0
            
            conn.close()
            
        except Exception as e:
            logger.warning(f"Failed to get database stats: {e}")
            cached_images_count = 0
            cached_features_count = 0
            total_disk_usage = 0
            detector_stats = {}
        
        stats = {
            **cache_stats,
            'cached_images_count': cached_images_count,
            'cached_features_count': cached_features_count,
            'total_disk_usage_mb': total_disk_usage / (1024 * 1024),
            **detector_stats
        }
        
        return stats
    
    def print_cache_stats(self):
        """Print comprehensive cache statistics"""
        stats = self.get_cache_stats()
        
        logger.info("\n" + "="*60)
        logger.info("FAST CACHE PERFORMANCE STATISTICS")
        logger.info("="*60)
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
        
        # Detector-specific stats
        for detector in ['sift', 'orb', 'akaze', 'kaze']:
            count = stats.get(f'{detector}_features_count', 0)
            logger.info(f"{detector.upper()} Features in DB: {count}")
        
        if stats.get('processing_time_saved', 0) > 0:
            logger.success(f"Efficiency Gained: {stats.get('processing_time_saved', 0):.1f}s saved with fast caching!")
        
        logger.info("="*60)
    
    def cleanup_old_cache(self, days_old: int = 30):
        """Remove cache entries older than specified days"""
        logger.info(f"Starting cache cleanup for entries older than {days_old} days...")
        
        try:
            conn = sqlite3.connect(self.db_path, timeout=30.0)
            cursor = conn.cursor()
            
            # Get old entries
            cursor.execute('''
                SELECT url_hash, file_path FROM cached_images 
                WHERE last_accessed < datetime('now', '-{} days')
            '''.format(days_old))
            
            old_entries = cursor.fetchall()
            
            # Delete old files and database entries
            cleaned_count = 0
            for url_hash, file_path in old_entries:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.debug(f"Removed file: {file_path}")
                
                cursor.execute('DELETE FROM cached_features WHERE url_hash = ?', (url_hash,))
                cursor.execute('DELETE FROM cached_images WHERE url_hash = ?', (url_hash,))
                cleaned_count += 1
            
            conn.commit()
            conn.close()
            
            if cleaned_count > 0:
                logger.success(f"Cleaned up {cleaned_count} old cache entries")
            else:
                logger.info("No old cache entries found to clean")
                
        except Exception as e:
            logger.error(f"Cache cleanup failed: {e}")

    def debug_cache_lookup(self, url: str):
        """Debug method to trace cache lookup behavior"""
        url_hash = self._get_url_hash(url)
        logger.info(f"DEBUG: Looking up cache for URL: {url[:50]}...")
        logger.info(f"DEBUG: URL hash: {url_hash}")
        
        # Check memory
        with self.feature_lock:
            if url_hash in self.feature_cache:
                item = self.feature_cache[url_hash]
                logger.info(f"DEBUG: Found in memory cache, last accessed: {item.last_accessed}")
                logger.info(f"DEBUG: Processing time: {item.data.get('processing_time', 0):.2f}s")
                return "memory"
        
        # Check database
        try:
            conn = sqlite3.connect(self.db_path, timeout=5.0)
            cursor = conn.cursor()
            cursor.execute('SELECT url, processing_time, last_accessed FROM cached_features WHERE url_hash = ?', (url_hash,))
            result = cursor.fetchone()
            conn.close()
            
            if result:
                logger.info(f"DEBUG: Found in database: {result[0][:50]}...")
                logger.info(f"DEBUG: DB processing time: {result[1]:.2f}s")
                logger.info(f"DEBUG: DB last accessed: {result[2]}")
                return "database"
            else:
                logger.info("DEBUG: Not found in database")
                return "not_found"
        except Exception as e:
            logger.error(f"DEBUG: Database lookup failed: {e}")
            return "error"
    
    def get_config_summary(self):
        """Get a summary of current configuration"""
        enabled_detectors = list(self.detectors.keys())
        detector_counts = {name: self.config.get('detectors', {}).get(name, 0) for name in enabled_detectors}
        
        summary = {
            'performance_level': self.config.get('performance_level', 'custom'),
            'image_size': self.config.get('image_size'),
            'result_batch': self.config.get('result_batch'),
            'max_workers': self.max_workers,
            'enabled_detectors': enabled_detectors,
            'detector_feature_counts': detector_counts,
            'use_comic_detection': self.use_comic_detection,
            'use_advanced_matching': self.use_advanced_matching,
            'cache_only': self.cache_only,
            'feature_weights': self.feature_weights,
            'cache_manager_stats': self.cache_manager.get_stats()
        }
        
        return summary
    
    def print_config_summary(self):
        """Print current configuration summary"""
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
        logger.info(f"Feature Weights: {', '.join([f'{k}:{v:.2f}' for k, v in summary['feature_weights'].items()])}")
        
        cache_stats = summary['cache_manager_stats']
        logger.info(f"Memory Cache: {cache_stats.get('memory_image_count', 0)} images, {cache_stats.get('memory_feature_count', 0)} features")
        logger.info(f"Memory Hit Rate: {cache_stats.get('memory_hit_rate', 0):.1f}%")
    
    def __del__(self):
        """Cleanup when object is destroyed"""
        if hasattr(self, 'cache_manager'):
            self.cache_manager.shutdown()

def performance_comparison_test(matcher, test_urls, query_image):
    """Compare performance with and without fast caching"""
    logger.info("\n" + "="*30)
    logger.info("PERFORMANCE COMPARISON TEST")
    logger.info("="*30)
    
    # First run (cold cache)
    logger.info("Cold cache run...")
    start_time = time.time()
    results1, _ = matcher.find_matches_img(query_image, test_urls[:10], threshold=0.1)
    cold_time = time.time() - start_time
    
    # Second run (warm cache)
    logger.info("Warm cache run...")
    start_time = time.time()
    results2, _ = matcher.find_matches_img(query_image, test_urls[:10], threshold=0.1)
    warm_time = time.time() - start_time
    
    # Print comparison
    logger.info(f"Cold cache time: {cold_time:.2f}s")
    logger.info(f"Warm cache time: {warm_time:.2f}s")
    logger.info(f"Speed improvement: {cold_time/warm_time:.1f}x faster")
    
    matcher.print_cache_stats()

def stress_test(matcher, test_urls, query_image, num_workers_list=[1, 2, 4, 8]):
    """Test concurrency performance with different worker counts"""
    logger.info("\n" + "="*30)
    logger.info("CONCURRENCY STRESS TEST")
    logger.info("="*30)
    
    for workers in num_workers_list:
        logger.info(f"\nTesting with {workers} workers...")
        matcher.max_workers = workers
        
        start_time = time.time()
        results, _ = matcher.find_matches_img(query_image, test_urls, threshold=0.1)
        elapsed_time = time.time() - start_time
        
        logger.info(f"Workers: {workers}, Time: {elapsed_time:.2f}s, Results: {len(results)}")
    
    matcher.print_cache_stats()
