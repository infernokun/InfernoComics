import os
import cv2
import json
import time
import sqlite3
import pickle
import requests
import hashlib
import numpy as np
from datetime import datetime
from util.Logger import get_logger
from typing import Dict, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = get_logger(__name__)

# Set OpenCV to headless mode BEFORE importing cv2
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['OPENCV_LOG_LEVEL'] = 'ERROR'

cv2.setNumThreads(1)

DB_PATH = os.environ.get('COMIC_CACHE_DB_PATH', '/var/tmp/inferno-comics/comic_cache.db')
DB_IMAGE_CACHE = os.environ.get('COMIC_CACHE_IMAGE_PATH', '/var/tmp/inferno-comics/image_cache')

def safe_progress_callback(callback, current_item, message=""):
    """Safely call progress callback, handling None case"""
    if callback is not None:
        try:
            callback(current_item, message)
        except Exception as e:
            logger.warning(f"⚠️ Progress callback error: {e}")
            pass

class FeatureMatchingComicMatcher:
    def __init__(self, cache_dir=DB_IMAGE_CACHE, db_path=DB_PATH, max_workers=4):
        self.cache_dir = cache_dir
        self.db_path = db_path
        self.max_workers = max_workers
        
        logger.info(f" Initializing Enhanced 4-Detector FeatureMatchingComicMatcher")
        logger.debug(f" Cache directory: {cache_dir}")
        logger.debug(f"️ Database path: {db_path}")
        logger.debug(f" Max workers: {max_workers}")
        
        os.makedirs(cache_dir, exist_ok=True)
        self._init_database()
        
        # Optimized SIFT parameters for maximum feature extraction
        self.sift = cv2.SIFT_create(
            nfeatures=2500,      # Increased for more features
            nOctaveLayers=3,     # Optimized for comic images
            contrastThreshold=0.03,  # Lower for more features
            edgeThreshold=15,    # Balanced edge detection
            sigma=1.2            # Slightly sharper for comic details
        )
        
        # Enhanced ORB parameters
        self.orb = cv2.ORB_create(
            nfeatures=2000,      # Increased
            scaleFactor=1.15,    # Finer scale steps
            nlevels=12,          # More pyramid levels
            edgeThreshold=15,    # Balanced
            firstLevel=0,
            WTA_K=2,
            scoreType=cv2.ORB_HARRIS_SCORE,
            patchSize=31,
            fastThreshold=15     # More sensitive
        )
        
        # Optimized AKAZE parameters
        self.akaze = cv2.AKAZE_create(
            descriptor_type=cv2.AKAZE_DESCRIPTOR_MLDB,
            descriptor_size=0,
            descriptor_channels=3,
            threshold=0.0005,    # Lower for more features
            nOctaves=5,          # More octaves
            nOctaveLayers=4,
            diffusivity=cv2.KAZE_DIFF_PM_G2
        )



        # KAZE parameters
        self.kaze = cv2.KAZE_create(
            extended=False,           # Use basic descriptors
            upright=False,           # Enable rotation invariance
            threshold=0.001,         # Detection threshold
            nOctaves=4,             # Number of octaves
            nOctaveLayers=4,        # Layers per octave
            diffusivity=cv2.KAZE_DIFF_PM_G2
        )
        
        # Enhanced matchers with FLANN for SIFT
        FLANN_INDEX_KDTREE = 1
        index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=8)
        search_params = dict(checks=100)
        self.flann_matcher = cv2.FlannBasedMatcher(index_params, search_params)
        
        self.bf_matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        self.orb_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        self.akaze_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        self.kaze_matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        
        # Optimized 4-detector feature weighting
        self.feature_weights = { 
            'sift': 0.25,    # Keep stable
            'orb': 0.25,     # Keep stable
            'akaze': 0.4,    # Keep dominant (proven performer)
            'kaze': 0.1      # Increased from 5% - KAZE earned it!
        }
        
        # Enhanced scoring parameters
        self.scoring_params = {
            'similarity_boost': 1.3,        # Boost factor for good matches
            'geometric_weight': 0.15,       # Weight for geometric consistency
            'multi_detector_bonus': 0.08,   # Bonus for multiple detector agreement
            'quality_threshold': 0.15       # Minimum quality for boosting
        }
        
        # Session for downloads
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Cache statistics
        self.cache_stats = {
            'image_cache_hits': 0,
            'image_cache_misses': 0,
            'feature_cache_hits': 0,
            'feature_cache_misses': 0,
            'processing_time_saved': 0.0
        }
        
        logger.success("✅ Enhanced 4-Detector FeatureMatchingComicMatcher initialization complete")

    def _init_database(self):
        """Initialize SQLite database with proper schema including KAZE"""
        logger.debug("️ Initializing SQLite database...")
        
        conn = sqlite3.connect(self.db_path)
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
            logger.debug("✅ Added KAZE columns to existing database")
        except sqlite3.OperationalError:
            # Columns already exist
            pass
        
        # Table for match results cache
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cached_matches (
                query_hash TEXT,
                candidate_hash TEXT,
                similarity REAL,
                match_details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (query_hash, candidate_hash)
            )
        ''')
        
        # Create indexes for performance
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_url ON cached_images(url)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_features_url ON cached_features(url)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_accessed ON cached_images(last_accessed)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_features_accessed ON cached_features(last_accessed)')
        
        conn.commit()
        conn.close()
        
        logger.success("✅ Database initialization complete")

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
    
    def _get_cached_image(self, url: str) -> Optional[np.ndarray]:
        """Get cached image from database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        url_hash = self._get_url_hash(url)
        cursor.execute('''
            SELECT file_path FROM cached_images 
            WHERE url_hash = ?
        ''', (url_hash,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result and os.path.exists(result[0]):
            # Update last accessed time
            self._update_access_time('cached_images', url_hash)
            self.cache_stats['image_cache_hits'] += 1
            logger.debug(f"✅ Cache hit for image: {url[:50]}...")
            return cv2.imread(result[0])
        
        self.cache_stats['image_cache_misses'] += 1
        logger.debug(f"❌ Cache miss for image: {url[:50]}...")
        return None
    
    def _cache_image(self, url: str, image: np.ndarray) -> str:
        """Cache image to database and filesystem"""
        url_hash = self._get_url_hash(url)
        file_path = os.path.join(self.cache_dir, f"{url_hash}.jpg")
        
        # Save image to filesystem
        cv2.imwrite(file_path, image)
        file_size = os.path.getsize(file_path)
        
        # Save metadata to database
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO cached_images 
            (url_hash, url, file_path, file_size, created_at, last_accessed)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (url_hash, url, file_path, file_size, datetime.now(), datetime.now()))
        
        conn.commit()
        conn.close()
        
        logger.debug(f" Cached image: {file_size} bytes at {file_path}")
        return file_path
    
    def _get_cached_features(self, url: str) -> Optional[Dict]:
        """Get cached features from database - handles all 4 detectors"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        url_hash = self._get_url_hash(url)
        
        # Try to get full 4-detector features first
        try:
            cursor.execute('''
                SELECT sift_keypoints, sift_descriptors, sift_count,
                    orb_keypoints, orb_descriptors, orb_count,
                    akaze_keypoints, akaze_descriptors, akaze_count,
                    kaze_keypoints, kaze_descriptors, kaze_count,
                    processing_time, image_shape, was_cropped
                FROM cached_features 
                WHERE url_hash = ?
            ''', (url_hash,))
            
            result = cursor.fetchone()
            
            if result and len(result) >= 15:  # Full 4-detector result
                self._update_access_time('cached_features', url_hash)
                self.cache_stats['feature_cache_hits'] += 1
                self.cache_stats['processing_time_saved'] += result[12]  # processing_time
                
                logger.debug(f"✅ 4-detector cache hit: {url[:50]}... (saved {result[12]:.2f}s)")
                
                # Deserialize all features
                features = {
                    'sift': {
                        'keypoints': self._deserialize_keypoints(result[0]),
                        'descriptors': pickle.loads(result[1]) if result[1] else None,
                        'count': result[2] or 0
                    },
                    'orb': {
                        'keypoints': self._deserialize_keypoints(result[3]),
                        'descriptors': pickle.loads(result[4]) if result[4] else None,
                        'count': result[5] or 0
                    },
                    'akaze': {
                        'keypoints': self._deserialize_keypoints(result[6]),
                        'descriptors': pickle.loads(result[7]) if result[7] else None,
                        'count': result[8] or 0
                    },
                    'kaze': {
                        'keypoints': self._deserialize_keypoints(result[9]),
                        'descriptors': pickle.loads(result[10]) if result[10] else None,
                        'count': result[11] or 0
                    },
                    'processing_time': result[12],
                    'image_shape': json.loads(result[13]) if result[13] else None,
                    'was_cropped': bool(result[14])
                }
                
                conn.close()
                return features
                
        except sqlite3.OperationalError:
            # KAZE columns don't exist yet
            pass
        
        # Fallback: try to get legacy 3-detector features
        try:
            cursor.execute('''
                SELECT sift_keypoints, sift_descriptors, sift_count,
                    orb_keypoints, orb_descriptors, orb_count,
                    akaze_keypoints, akaze_descriptors, akaze_count,
                    processing_time, image_shape, was_cropped
                FROM cached_features 
                WHERE url_hash = ?
            ''', (url_hash,))
            
            result = cursor.fetchone()
            
            if result:
                self._update_access_time('cached_features', url_hash)
                self.cache_stats['feature_cache_hits'] += 1
                self.cache_stats['processing_time_saved'] += result[9]  # processing_time
                
                logger.debug(f"✅ Legacy 3-detector cache hit: {url[:50]}... (saved {result[9]:.2f}s)")
                
                features = {
                    'sift': {
                        'keypoints': self._deserialize_keypoints(result[0]),
                        'descriptors': pickle.loads(result[1]) if result[1] else None,
                        'count': result[2] or 0
                    },
                    'orb': {
                        'keypoints': self._deserialize_keypoints(result[3]),
                        'descriptors': pickle.loads(result[4]) if result[4] else None,
                        'count': result[5] or 0
                    },
                    'akaze': {
                        'keypoints': self._deserialize_keypoints(result[6]),
                        'descriptors': pickle.loads(result[7]) if result[7] else None,
                        'count': result[8] or 0
                    },
                    'kaze': {
                        'keypoints': [],
                        'descriptors': None,
                        'count': 0
                    },
                    'processing_time': result[9],
                    'image_shape': json.loads(result[10]) if result[10] else None,
                    'was_cropped': bool(result[11])
                }
                
                conn.close()
                return features
                
        except sqlite3.OperationalError:
            pass
        
        conn.close()
        self.cache_stats['feature_cache_misses'] += 1
        logger.debug(f"❌ Feature cache miss: {url[:50]}...")
        return None

    def _cache_features(self, url: str, features: Dict, processing_time: float, 
                       image_shape: Tuple, was_cropped: bool):
        """Cache features to database including all 4 detectors"""
        url_hash = self._get_url_hash(url)
        
        # Serialize all features
        sift_kp_data = self._serialize_keypoints(features['sift']['keypoints'])
        sift_desc_data = pickle.dumps(features['sift']['descriptors']) if features['sift']['descriptors'] is not None else b''
        orb_kp_data = self._serialize_keypoints(features['orb']['keypoints'])
        orb_desc_data = pickle.dumps(features['orb']['descriptors']) if features['orb']['descriptors'] is not None else b''
        akaze_kp_data = self._serialize_keypoints(features['akaze']['keypoints'])
        akaze_desc_data = pickle.dumps(features['akaze']['descriptors']) if features['akaze']['descriptors'] is not None else b''
        kaze_kp_data = self._serialize_keypoints(features['kaze']['keypoints'])
        kaze_desc_data = pickle.dumps(features['kaze']['descriptors']) if features['kaze']['descriptors'] is not None else b''
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO cached_features 
            (url_hash, url, sift_keypoints, sift_descriptors, sift_count,
            orb_keypoints, orb_descriptors, orb_count, 
            akaze_keypoints, akaze_descriptors, akaze_count,
            kaze_keypoints, kaze_descriptors, kaze_count,
            processing_time, image_shape, was_cropped, created_at, last_accessed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            url_hash, url, 
            sift_kp_data, sift_desc_data, features['sift']['count'],
            orb_kp_data, orb_desc_data, features['orb']['count'],
            akaze_kp_data, akaze_desc_data, features['akaze']['count'],
            kaze_kp_data, kaze_desc_data, features['kaze']['count'],
            processing_time, json.dumps(image_shape), was_cropped, 
            datetime.now(), datetime.now()
        ))
        
        conn.commit()
        conn.close()
        
        logger.debug(f" Cached 4-detector features: SIFT={features['sift']['count']}, ORB={features['orb']['count']}, AKAZE={features['akaze']['count']}, KAZE={features['kaze']['count']} ({processing_time:.2f}s)")
    
    def _update_access_time(self, table: str, url_hash: str):
        """Update last accessed time for cache entry"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(f'''
            UPDATE {table} 
            SET last_accessed = ? 
            WHERE url_hash = ?
        ''', (datetime.now(), url_hash))
        
        conn.commit()
        conn.close()
    
    def download_image(self, url: str, timeout: int = 10) -> Optional[np.ndarray]:
        """Download image with caching support"""
        # Check cache first
        cached_image = self._get_cached_image(url)
        if cached_image is not None:
            return cached_image
        
        # Download if not cached
        try:
            logger.debug(f"⬇️ Downloading image: {url[:50]}...")
            response = self.session.get(url, timeout=timeout)
            response.raise_for_status()
            
            image_array = np.frombuffer(response.content, np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if image is not None:
                # Cache the downloaded image
                self._cache_image(url, image)
                logger.success(f"✅ Downloaded and cached: {url[:50]}...")
            else:
                logger.warning(f"⚠️ Failed to decode image: {url[:50]}...")
            
            return image
            
        except Exception as e:
            logger.error(f"❌ Download error for {url[:50]}...: {e}")
            return None
    
    def detect_comic_area(self, image):
        """Enhanced comic detection with multiple approaches"""
        if image is None:
            return image, False
            
        original = image.copy()
        h, w = image.shape[:2]
        
        logger.debug(f" Enhanced comic detection in image: {w}x{h}")
        
        # Multi-approach comic detection
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
            logger.success(f"✅ Enhanced comic detected: {original.shape} -> {best_crop.shape} (score: {best_score:.3f})")
            return best_crop, True
        
        logger.debug(" No reliable comic detection, using full image")
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
        
        # Combine edges
        combined_edges = np.maximum.reduce(edges_list)
        
        # Enhanced morphological operations
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
            
            # Enhanced scoring with position consideration
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
        
        # Convert to HSV for better color analysis
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        # Create mask for likely comic colors (avoid pure white backgrounds)
        lower_bound = np.array([0, 20, 20])
        upper_bound = np.array([180, 255, 255])
        color_mask = cv2.inRange(hsv, lower_bound, upper_bound)
        
        # Find the largest connected component
        contours, _ = cv2.findContours(color_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return image, 0.0
        
        largest_contour = max(contours, key=cv2.contourArea)
        x, y, cw, ch = cv2.boundingRect(largest_contour)
        
        # Score based on size and aspect ratio
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
        
        # Adaptive threshold
        adaptive_thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        # Find contours
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
        """Enhanced preprocessing with adaptive techniques for better feature extraction"""
        if image is None:
            return None
        
        # Resize strategically - larger size for feature extraction
        h, w = image.shape[:2]
        target_size = 1000  # Increased from 800 for better feature detection
        if max(h, w) > target_size:
            scale = target_size / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
            logger.debug(f" Resized image from {w}x{h} to {new_w}x{new_h}")
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        # Adaptive histogram equalization with optimized parameters
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(12, 12))
        enhanced = clahe.apply(gray)
        
        # Edge-preserving denoising
        denoised = cv2.bilateralFilter(enhanced, 5, 50, 50)
        
        # Subtle sharpening for better feature detection
        kernel = np.array([[-0.5, -0.5, -0.5],
                        [-0.5,  5.0, -0.5],
                        [-0.5, -0.5, -0.5]])
        sharpened = cv2.filter2D(denoised, -1, kernel)
        
        # Blend original and sharpened (70% sharpened, 30% original)
        processed = cv2.addWeighted(sharpened, 0.7, denoised, 0.3, 0)
        
        return processed

    def extract_features(self, image):
        """Extract features using 4 detectors: SIFT, ORB, AKAZE, and KAZE"""
        if image is None:
            return None
        
        processed = self.preprocess_image(image)
        if processed is None:
            return None
        
        features = {}
        
        # SIFT features (most reliable)
        try:
            sift_kp, sift_desc = self.sift.detectAndCompute(processed, None)
            features['sift'] = {
                'keypoints': sift_kp,
                'descriptors': sift_desc,
                'count': len(sift_kp) if sift_kp else 0
            }
            logger.debug(f" SIFT features extracted: {features['sift']['count']}")
        except Exception as e:
            logger.warning(f"⚠️ SIFT feature extraction failed: {e}")
            features['sift'] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        # ORB features (fast and efficient)
        try:
            orb_kp, orb_desc = self.orb.detectAndCompute(processed, None)
            features['orb'] = {
                'keypoints': orb_kp,
                'descriptors': orb_desc,
                'count': len(orb_kp) if orb_kp else 0
            }
            logger.debug(f" ORB features extracted: {features['orb']['count']}")
        except Exception as e:
            logger.warning(f"⚠️ ORB feature extraction failed: {e}")
            features['orb'] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        # AKAZE features (robust to scale and rotation)
        try:
            akaze_kp, akaze_desc = self.akaze.detectAndCompute(processed, None)
            features['akaze'] = {
                'keypoints': akaze_kp,
                'descriptors': akaze_desc,
                'count': len(akaze_kp) if akaze_kp else 0
            }
            logger.debug(f" AKAZE features extracted: {features['akaze']['count']}")
        except Exception as e:
            logger.warning(f"⚠️ AKAZE feature extraction failed: {e}")
            features['akaze'] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        # KAZE features (Non-linear diffusion) - The new star performer!
        try:
            kaze_kp, kaze_desc = self.kaze.detectAndCompute(processed, None)
            features['kaze'] = {
                'keypoints': kaze_kp,
                'descriptors': kaze_desc,
                'count': len(kaze_kp) if kaze_kp else 0
            }
            logger.debug(f" KAZE features extracted: {features['kaze']['count']}")
        except Exception as e:
            logger.warning(f"⚠️ KAZE feature extraction failed: {e}")
            features['kaze'] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        return features
    
    def extract_features_cached(self, url: str) -> Optional[Dict]:
        """Extract features with caching support"""
        # Check cache first
        cached_features = self._get_cached_features(url)
        if cached_features is not None:
            return cached_features
        
        # Download image
        image = self.download_image(url)
        if image is None:
            return None
        
        # Process image
        start_time = time.time()
        cropped_image, was_cropped = self.detect_comic_area(image)
        features = self.extract_features(cropped_image)
        processing_time = time.time() - start_time
        
        logger.debug(f"⏱️ Feature extraction took {processing_time:.2f}s")
        
        if features is not None:
            # Cache the features
            self._cache_features(url, features, processing_time, 
                               cropped_image.shape, was_cropped)
        
        return features
    
    def match_features(self, query_features, candidate_features):
        """Enhanced feature matching with 4 detectors and geometric verification"""
        if not query_features or not candidate_features:
            return 0.0, {}
        
        match_results = {}
        similarities = []
        geometric_scores = []
        
        # SIFT matching with FLANN and geometric verification
        sift_similarity, sift_geometric = self._match_sift_enhanced(query_features, candidate_features, match_results)
        if sift_similarity > 0:
            similarities.append(('sift', sift_similarity, self.feature_weights['sift']))
            geometric_scores.append(sift_geometric)
        
        # Enhanced ORB matching
        orb_similarity, orb_geometric = self._match_orb_enhanced(query_features, candidate_features, match_results)
        if orb_similarity > 0:
            similarities.append(('orb', orb_similarity, self.feature_weights['orb']))
            geometric_scores.append(orb_geometric)
        
        # Enhanced AKAZE matching
        akaze_similarity, akaze_geometric = self._match_akaze_enhanced(query_features, candidate_features, match_results)
        if akaze_similarity > 0:
            similarities.append(('akaze', akaze_similarity, self.feature_weights['akaze']))
            geometric_scores.append(akaze_geometric)
        
        # KAZE matching - The new star performer!
        kaze_similarity, kaze_geometric = self._match_kaze_enhanced(query_features, candidate_features, match_results)
        if kaze_similarity > 0:
            similarities.append(('kaze', kaze_similarity, self.feature_weights['kaze']))
            geometric_scores.append(kaze_geometric)
        
        # Enhanced combination with geometric consistency
        if similarities:
            # Calculate weighted average
            weighted_sum = sum(sim * weight for _, sim, weight in similarities)
            total_weight = sum(weight for _, _, weight in similarities)
            
            if total_weight > 0:
                base_similarity = weighted_sum / total_weight
                
                # Apply similarity boost for good matches
                if base_similarity > self.scoring_params['quality_threshold']:
                    boosted_similarity = base_similarity * self.scoring_params['similarity_boost']
                else:
                    boosted_similarity = base_similarity
                
                # Add geometric consistency bonus
                if geometric_scores:
                    avg_geometric = sum(geometric_scores) / len(geometric_scores)
                    geometric_bonus = avg_geometric * self.scoring_params['geometric_weight']
                    boosted_similarity += geometric_bonus
                
                # Multi-detector agreement bonus
                if len(similarities) > 1:
                    agreement_bonus = self.scoring_params['multi_detector_bonus'] * (len(similarities) - 1)
                    boosted_similarity += agreement_bonus
                
                # Ensure we don't exceed 1.0 but allow high scores
                overall_similarity = min(0.95, boosted_similarity)  # Cap at 95% to be realistic
                
                logger.debug(f" Enhanced 4-detector similarity: {overall_similarity:.3f} (base: {base_similarity:.3f}, {len(similarities)} detectors)")
            else:
                overall_similarity = 0.0
        else:
            overall_similarity = 0.0
        
        return overall_similarity, match_results

    def _match_sift_enhanced(self, query_features, candidate_features, match_results):
        """Enhanced SIFT matching with FLANN matcher and geometric verification"""
        if (query_features.get('sift', {}).get('descriptors') is None or 
            candidate_features.get('sift', {}).get('descriptors') is None or
            len(query_features['sift']['descriptors']) < 8 or
            len(candidate_features['sift']['descriptors']) < 8):
            return 0.0, 0.0
        
        try:
            # Use FLANN matcher for better performance and accuracy
            matches = self.flann_matcher.knnMatch(
                query_features['sift']['descriptors'], 
                candidate_features['sift']['descriptors'], 
                k=2
            )
            
            # Enhanced ratio test with adaptive threshold
            good_matches = []
            distances = []
            for match_pair in matches:
                if len(match_pair) >= 2:
                    m, n = match_pair[0], match_pair[1]
                    ratio_threshold = 0.75  # Balanced threshold
                    if m.distance < ratio_threshold * n.distance:
                        good_matches.append(m)
                        distances.append(m.distance)
            
            geometric_score = 0.0
            
            # Geometric verification if we have enough matches
            if len(good_matches) >= 8:
                # Extract keypoint coordinates properly
                query_kpts = query_features['sift']['keypoints']
                candidate_kpts = candidate_features['sift']['keypoints']
                
                query_pts = np.float32([query_kpts[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                candidate_pts = np.float32([candidate_kpts[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                
                try:
                    # Find homography
                    M, mask = cv2.findHomography(query_pts, candidate_pts, cv2.RANSAC, 5.0)
                    if M is not None and mask is not None:
                        inliers = int(np.sum(mask))  # Convert to int for JSON serialization
                        geometric_score = float(inliers / len(good_matches))  # Ensure float
                        logger.debug(f" SIFT geometric verification: {inliers}/{len(good_matches)} inliers")
                except Exception as geo_e:
                    geometric_score = 0.5  # Default modest score if homography fails
                    logger.debug(f"Geometric verification failed: {geo_e}")
            
            # Enhanced similarity calculation
            total_features = min(query_features['sift']['count'], candidate_features['sift']['count'])
            if total_features > 0:
                # Base similarity from match ratio
                match_ratio = len(good_matches) / total_features
                
                # Quality bonus based on average distance
                if distances:
                    avg_distance = sum(distances) / len(distances)
                    distance_quality = max(0, (200 - avg_distance) / 200)
                    quality_bonus = distance_quality * 0.2
                else:
                    quality_bonus = 0
                
                # Combine with geometric score
                similarity = match_ratio + quality_bonus + (geometric_score * 0.1)
            else:
                similarity = 0.0
            
            match_results['sift'] = {
                'total_matches': int(len(matches)),
                'good_matches': int(len(good_matches)),
                'geometric_score': float(geometric_score),
                'similarity': float(similarity)
            }
            
            logger.debug(f" Enhanced SIFT: {len(good_matches)}/{len(matches)} matches, geo: {geometric_score:.3f}, sim: {similarity:.3f}")
            return similarity, geometric_score
            
        except Exception as e:
            logger.warning(f"⚠️ Enhanced SIFT matching error: {e}")
            match_results['sift'] = {'total_matches': 0, 'good_matches': 0, 'geometric_score': 0.0, 'similarity': 0.0}
            return 0.0, 0.0

    def _match_orb_enhanced(self, query_features, candidate_features, match_results):
        """Enhanced ORB matching with geometric verification"""
        if (query_features.get('orb', {}).get('descriptors') is None or 
            candidate_features.get('orb', {}).get('descriptors') is None or
            len(query_features['orb']['descriptors']) < 8 or
            len(candidate_features['orb']['descriptors']) < 8):
            return 0.0, 0.0
        
        try:
            matches = self.orb_matcher.knnMatch(
                query_features['orb']['descriptors'], 
                candidate_features['orb']['descriptors'], 
                k=2
            )
            
            good_matches = []
            for match_pair in matches:
                if len(match_pair) >= 2:
                    m, n = match_pair[0], match_pair[1]
                    if m.distance < 0.75 * n.distance:  # Standard ratio test
                        good_matches.append(m)
            
            geometric_score = 0.0
            
            # Geometric verification for ORB
            if len(good_matches) >= 8:
                # Extract keypoint coordinates properly
                query_kpts = query_features['orb']['keypoints']
                candidate_kpts = candidate_features['orb']['keypoints']
                
                query_pts = np.float32([query_kpts[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                candidate_pts = np.float32([candidate_kpts[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                
                try:
                    M, mask = cv2.findHomography(query_pts, candidate_pts, cv2.RANSAC, 5.0)
                    if M is not None and mask is not None:
                        inliers = int(np.sum(mask))  # Convert to int for JSON serialization
                        geometric_score = float(inliers / len(good_matches))  # Ensure float
                except Exception as geo_e:
                    geometric_score = 0.3
                    logger.debug(f"ORB geometric verification failed: {geo_e}")
            
            # Enhanced ORB similarity calculation
            total_features = min(query_features['orb']['count'], candidate_features['orb']['count'])
            if total_features > 0:
                match_ratio = len(good_matches) / total_features
                similarity = match_ratio + (geometric_score * 0.15)  # Smaller geometric bonus for ORB
            else:
                similarity = 0.0
            
            match_results['orb'] = {
                'total_matches': int(len(matches)),
                'good_matches': int(len(good_matches)),
                'geometric_score': float(geometric_score),
                'similarity': float(similarity)
            }
            
            logger.debug(f" Enhanced ORB: {len(good_matches)}/{len(matches)} matches, geo: {geometric_score:.3f}, sim: {similarity:.3f}")
            return similarity, geometric_score
            
        except Exception as e:
            logger.warning(f"⚠️ Enhanced ORB matching error: {e}")
            match_results['orb'] = {'total_matches': 0, 'good_matches': 0, 'geometric_score': 0.0, 'similarity': 0.0}
            return 0.0, 0.0

    def _match_akaze_enhanced(self, query_features, candidate_features, match_results):
        """Enhanced AKAZE matching with improved scoring"""
        if (query_features.get('akaze', {}).get('descriptors') is None or 
            candidate_features.get('akaze', {}).get('descriptors') is None or
            len(query_features['akaze']['descriptors']) < 5 or
            len(candidate_features['akaze']['descriptors']) < 5):
            return 0.0, 0.0
        
        try:
            matches = self.akaze_matcher.knnMatch(
                query_features['akaze']['descriptors'], 
                candidate_features['akaze']['descriptors'], 
                k=2
            )
            
            good_matches = []
            for match_pair in matches:
                if len(match_pair) >= 2:
                    m, n = match_pair[0], match_pair[1]
                    if m.distance < 0.75 * n.distance:
                        good_matches.append(m)
            
            # Simple geometric check for AKAZE
            geometric_score = min(1.0, len(good_matches) / 20.0) if good_matches else 0.0
            
            # AKAZE similarity calculation
            total_features = min(query_features['akaze']['count'], candidate_features['akaze']['count'])
            if total_features > 0:
                similarity = len(good_matches) / total_features
            else:
                similarity = 0.0
            
            match_results['akaze'] = {
                'total_matches': int(len(matches)),
                'good_matches': int(len(good_matches)),
                'geometric_score': float(geometric_score),
                'similarity': float(similarity)
            }
            
            logger.debug(f" Enhanced AKAZE: {len(good_matches)}/{len(matches)} matches, sim: {similarity:.3f}")
            return similarity, geometric_score
            
        except Exception as e:
            logger.warning(f"⚠️ Enhanced AKAZE matching error: {e}")
            match_results['akaze'] = {'total_matches': 0, 'good_matches': 0, 'geometric_score': 0.0, 'similarity': 0.0}
            return 0.0, 0.0
    
    def _match_kaze_enhanced(self, query_features, candidate_features, match_results):
        """Enhanced KAZE matching with geometric verification"""
        if (query_features.get('kaze', {}).get('descriptors') is None or 
            candidate_features.get('kaze', {}).get('descriptors') is None or
            len(query_features['kaze']['descriptors']) < 8 or
            len(candidate_features['kaze']['descriptors']) < 8):
            return 0.0, 0.0
        
        try:
            matches = self.kaze_matcher.knnMatch(
                query_features['kaze']['descriptors'], 
                candidate_features['kaze']['descriptors'], 
                k=2
            )
            
            good_matches = []
            distances = []
            for match_pair in matches:
                if len(match_pair) >= 2:
                    m, n = match_pair[0], match_pair[1]
                    ratio_threshold = 0.75  # Standard threshold for KAZE
                    if m.distance < ratio_threshold * n.distance:
                        good_matches.append(m)
                        distances.append(m.distance)
            
            geometric_score = 0.0
            
            # Geometric verification for KAZE
            if len(good_matches) >= 8:
                # Extract keypoint coordinates properly
                query_kpts = query_features['kaze']['keypoints']
                candidate_kpts = candidate_features['kaze']['keypoints']
                
                query_pts = np.float32([query_kpts[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                candidate_pts = np.float32([candidate_kpts[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                
                try:
                    M, mask = cv2.findHomography(query_pts, candidate_pts, cv2.RANSAC, 5.0)
                    if M is not None and mask is not None:
                        inliers = int(np.sum(mask))
                        geometric_score = float(inliers / len(good_matches))
                except Exception as geo_e:
                    geometric_score = 0.4
                    logger.debug(f"KAZE geometric verification failed: {geo_e}")
            
            # KAZE similarity calculation with quality bonus
            total_features = min(query_features['kaze']['count'], candidate_features['kaze']['count'])
            if total_features > 0:
                match_ratio = len(good_matches) / total_features
                
                # Quality bonus based on average distance (similar to SIFT)
                if distances:
                    avg_distance = sum(distances) / len(distances)
                    distance_quality = max(0, (150 - avg_distance) / 150)  # Adjusted for KAZE distances
                    quality_bonus = distance_quality * 0.15
                else:
                    quality_bonus = 0
                
                similarity = match_ratio + quality_bonus + (geometric_score * 0.1)
            else:
                similarity = 0.0
            
            match_results['kaze'] = {
                'total_matches': int(len(matches)),
                'good_matches': int(len(good_matches)),
                'geometric_score': float(geometric_score),
                'similarity': float(similarity)
            }
            
            logger.debug(f" Enhanced KAZE: {len(good_matches)}/{len(matches)} matches, geo: {geometric_score:.3f}, sim: {similarity:.3f}")
            return similarity, geometric_score
            
        except Exception as e:
            logger.warning(f"⚠️ Enhanced KAZE matching error: {e}")
            match_results['kaze'] = {'total_matches': 0, 'good_matches': 0, 'geometric_score': 0.0, 'similarity': 0.0}
            return 0.0, 0.0

    def find_matches_img(self, query_image, candidate_urls, threshold=0.1, progress_callback=None):
        """Main matching function with caching support and progress callback"""
        logger.info(" Starting Cached 4-Detector Feature Matching Comic Search...")
        start_time = time.time()
        
        if query_image is None:
            raise ValueError("Query image data is None")
        
        logger.info(f"️ Received query image: {query_image.shape}")
        
        # Process query image (not cached since it's user input)
        # Use safe progress callback for initial processing
        safe_progress_callback(progress_callback, 0, "Processing query image...")
        
        query_image, was_cropped = self.detect_comic_area(query_image)
        query_features = self.extract_features(query_image)
        
        if not query_features:
            raise ValueError("Could not extract features from query image")
        
        logger.success(f"✅ Query features - SIFT: {query_features['sift']['count']}, ORB: {query_features['orb']['count']}, AKAZE: {query_features['akaze']['count']}, KAZE: {query_features['kaze']['count']}")
        
        # Use safe progress callback for feature extraction completion
        safe_progress_callback(progress_callback, 1, f"Query features extracted - SIFT: {query_features['sift']['count']}, ORB: {query_features['orb']['count']}, AKAZE: {query_features['akaze']['count']}, KAZE: {query_features['kaze']['count']}")
        
        # Process candidates with caching
        logger.info(f"⬇️ Processing {len(candidate_urls)} candidate images (with caching)...")
        
        # Use safe progress callback for starting candidate analysis
        safe_progress_callback(progress_callback, 2, f"Starting analysis of {len(candidate_urls)} candidates...")
        
        results = []
        total_candidates = len(candidate_urls)
        
        if total_candidates == 0:
            logger.warning("⚠️ No candidate URLs provided")
            return results, query_features
        
        # Determine batch size for progress updates
        batch_size = max(1, total_candidates // 20)  # Max 20 progress updates
        logger.debug(f" Progress batch size: {batch_size}")
        
        # Use ThreadPoolExecutor for parallel processing with progress tracking
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            logger.debug(f" Using {self.max_workers} worker threads")
            
            # Submit all jobs
            future_to_url = {}
            for i, url in enumerate(candidate_urls):
                future = executor.submit(self._process_single_candidate_cached, query_features, url, i)
                future_to_url[future] = (url, i)
            
            # Collect results with progress updates
            completed = 0
            for future in as_completed(future_to_url):
                url, index = future_to_url[future]
                completed += 1
                
                try:
                    result = future.result()
                    if result:
                        results.append(result)
                        if result.get('similarity', 0) >= threshold:
                            logger.debug(f"✅ Good match found: {url[:50]}... (similarity: {result['similarity']:.3f})")
                    
                    # Send progress update every batch_size completions or for the last few
                    if completed % batch_size == 0 or completed >= total_candidates - 5:
                        message = f"Analyzed {completed}/{total_candidates} candidates"
                        if result and 'similarity' in result:
                            message += f" (latest: {result['similarity']:.3f})"
                        # Use safe progress callback - map completed items to progress
                        # Add 3 to account for initial processing steps (0, 1, 2)
                        safe_progress_callback(progress_callback, completed + 3, message)
                        
                except Exception as e:
                    logger.error(f"❌ Error processing candidate {url[:50]}...: {e}")
                    # Still add a failed result
                    results.append({
                        'url': url,
                        'similarity': 0.0,
                        'status': 'processing_error',
                        'match_details': {'error': str(e)},
                        'candidate_features': {}
                    })
                    continue
        
        # Sort results by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Filter by threshold
        good_matches = [r for r in results if r['similarity'] >= threshold]
        
        # Final progress update
        # Add 3 to account for initial processing steps
        safe_progress_callback(progress_callback, total_candidates + 3, f"Completed analysis - found {len(good_matches)} matches above threshold")
        
        total_time = time.time() - start_time
        logger.success(f"✨ Cached 4-detector feature matching completed in {total_time:.2f}s")
        logger.info(f" Found {len(good_matches)} matches above threshold ({threshold})")
        
        if good_matches:
            logger.info(f" Top match: {good_matches[0]['url'][:50]}... (similarity: {good_matches[0]['similarity']:.3f})")
        
        return results, query_features

    def _process_single_candidate_cached(self, query_features, candidate_url, index):
        """Process a single candidate URL with caching and return result"""
        try:
            # Extract features (cached)
            candidate_features = self.extract_features_cached(candidate_url)
            
            if not candidate_features:
                logger.debug(f"❌ Failed to extract features for: {candidate_url[:50]}...")
                return {
                    'url': candidate_url,
                    'similarity': 0.0,
                    'status': 'failed_features',
                    'match_details': {'error': 'Failed to extract features'},
                    'candidate_features': {}
                }
            
            # Match features
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
            logger.error(f"❌ Processing failed for {candidate_url[:50]}...: {e}")
            return {
                'url': candidate_url,
                'similarity': 0.0,
                'status': 'processing_failed',
                'match_details': {'error': str(e)},
                'candidate_features': {}
            }
        
    def get_cache_stats(self) -> Dict:
        """Get cache performance statistics including all 4 detectors"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get database stats
        cursor.execute('SELECT COUNT(*) FROM cached_images')
        cached_images_count = cursor.fetchone()[0]
        
        cursor.execute('SELECT COUNT(*) FROM cached_features')
        cached_features_count = cursor.fetchone()[0]
        
        cursor.execute('SELECT SUM(file_size) FROM cached_images')
        total_disk_usage = cursor.fetchone()[0] or 0
        
        cursor.execute('SELECT SUM(processing_time) FROM cached_features')
        total_processing_time = cursor.fetchone()[0] or 0
        
        # Get detector-specific statistics
        detector_stats = {}
        for detector in ['akaze', 'kaze']:
            try:
                cursor.execute(f'SELECT COUNT(*) FROM cached_features WHERE {detector}_count > 0')
                detector_stats[f'{detector}_features_count'] = cursor.fetchone()[0]
            except sqlite3.OperationalError:
                detector_stats[f'{detector}_features_count'] = 0
        
        conn.close()
        
        # Calculate cache hit rates
        total_image_requests = self.cache_stats['image_cache_hits'] + self.cache_stats['image_cache_misses']
        total_feature_requests = self.cache_stats['feature_cache_hits'] + self.cache_stats['feature_cache_misses']
        
        image_hit_rate = (self.cache_stats['image_cache_hits'] / total_image_requests * 100) if total_image_requests > 0 else 0
        feature_hit_rate = (self.cache_stats['feature_cache_hits'] / total_feature_requests * 100) if total_feature_requests > 0 else 0
        
        stats = {
            'cached_images_count': cached_images_count,
            'cached_features_count': cached_features_count,
            'total_disk_usage_mb': total_disk_usage / (1024 * 1024),
            'total_processing_time_saved': self.cache_stats['processing_time_saved'],
            'image_cache_hit_rate': image_hit_rate,
            'feature_cache_hit_rate': feature_hit_rate,
            'image_cache_hits': self.cache_stats['image_cache_hits'],
            'image_cache_misses': self.cache_stats['image_cache_misses'],
            'feature_cache_hits': self.cache_stats['feature_cache_hits'],
            'feature_cache_misses': self.cache_stats['feature_cache_misses']
        }
        
        # Add detector-specific stats
        stats.update(detector_stats)
        
        return stats
    
    def print_cache_stats(self):
        """Print cache statistics for all 4 detectors"""
        stats = self.get_cache_stats()
        
        logger.info("\n" + "="*60)
        logger.info(" 4-DETECTOR OPTIMIZED CACHE PERFORMANCE STATISTICS")
        logger.info("="*60)
        logger.info(f" Cached Images: {stats['cached_images_count']}")
        logger.info(f" Cached Features: {stats['cached_features_count']}")
        logger.info(f"⚡ AKAZE Features: {stats.get('akaze_features_count', 0)}")
        logger.info(f" KAZE Features: {stats.get('kaze_features_count', 0)}")
        logger.info(f" Disk Usage: {stats['total_disk_usage_mb']:.1f} MB")
        logger.info(f"⏱️ Processing Time Saved: {stats['total_processing_time_saved']:.2f} seconds")
        logger.info(f" Image Cache Hit Rate: {stats['image_cache_hit_rate']:.1f}%")
        logger.info(f" Feature Cache Hit Rate: {stats['feature_cache_hit_rate']:.1f}%")
        logger.info(f"✅ Image Cache Hits: {stats['image_cache_hits']}")
        logger.info(f"❌ Image Cache Misses: {stats['image_cache_misses']}")
        logger.info(f"✅ Feature Cache Hits: {stats['feature_cache_hits']}")
        logger.info(f"❌ Feature Cache Misses: {stats['feature_cache_misses']}")
        
        if stats['total_processing_time_saved'] > 0:
            logger.success(f" Efficiency Gained: {stats['total_processing_time_saved']:.1f}s saved with optimized 4-detector system!")
    
    def cleanup_old_cache(self, days_old: int = 30):
        """Remove cache entries older than specified days"""
        logger.info(f"粒 Starting cache cleanup for entries older than {days_old} days...")
        
        conn = sqlite3.connect(self.db_path)
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
                logger.debug(f"️ Removed file: {file_path}")
            
            cursor.execute('DELETE FROM cached_features WHERE url_hash = ?', (url_hash,))
            cursor.execute('DELETE FROM cached_images WHERE url_hash = ?', (url_hash,))
            cleaned_count += 1
        
        conn.commit()
        conn.close()
        
        if cleaned_count > 0:
            logger.success(f"粒 Cleaned up {cleaned_count} old cache entries")
        else:
            logger.info("粒 No old cache entries found to clean")