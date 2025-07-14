import os
import cv2
import numpy as np
import requests
import hashlib
import time
import sqlite3
import pickle
import json
from datetime import datetime
from typing import Dict, Optional, Tuple

# Set OpenCV to headless mode BEFORE importing cv2
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['OPENCV_LOG_LEVEL'] = 'ERROR'

cv2.setNumThreads(1)

DB_PATH = os.environ.get('COMIC_CACHE_DB_PATH', '/var/tmp/inferno-comics/comic_cache.db')
DB_IMAGE_CACHE = os.environ.get('COMIC_CACHE_IMAGE_PATH', '/var/tmp/inferno-comics/image_cache')

class FeatureMatchingComicMatcher:
    def __init__(self, cache_dir=DB_IMAGE_CACHE, db_path=DB_PATH, max_workers=4):
        self.cache_dir = cache_dir
        self.db_path = db_path
        self.max_workers = max_workers
        
        # Create directories
        os.makedirs(cache_dir, exist_ok=True)
        
        # Initialize database
        self._init_database()
        
        # Initialize feature detectors
        self.sift = cv2.SIFT_create(nfeatures=1000)
        self.orb = cv2.ORB_create(nfeatures=1000)
        
        # Matchers
        self.bf_matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        self.orb_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        
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
    
    def _init_database(self):
        """Initialize SQLite database with proper schema"""
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
        
        # Table for cached features
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
                processing_time REAL,
                image_shape TEXT,
                was_cropped BOOLEAN,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (url_hash) REFERENCES cached_images (url_hash)
            )
        ''')
        
        # Table for match results cache (optional - for repeated queries)
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
            return cv2.imread(result[0])
        
        self.cache_stats['image_cache_misses'] += 1
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
        
        return file_path
    
    def _get_cached_features(self, url: str) -> Optional[Dict]:
        """Get cached features from database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        url_hash = self._get_url_hash(url)
        cursor.execute('''
            SELECT sift_keypoints, sift_descriptors, sift_count,
                   orb_keypoints, orb_descriptors, orb_count,
                   processing_time, image_shape, was_cropped
            FROM cached_features 
            WHERE url_hash = ?
        ''', (url_hash,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            # Update last accessed time
            self._update_access_time('cached_features', url_hash)
            self.cache_stats['feature_cache_hits'] += 1
            self.cache_stats['processing_time_saved'] += result[6]  # processing_time
            
            # Deserialize features
            sift_kp = self._deserialize_keypoints(result[0])
            sift_desc = pickle.loads(result[1]) if result[1] else None
            orb_kp = self._deserialize_keypoints(result[3])
            orb_desc = pickle.loads(result[4]) if result[4] else None
            
            return {
                'sift': {
                    'keypoints': sift_kp,
                    'descriptors': sift_desc,
                    'count': result[2]
                },
                'orb': {
                    'keypoints': orb_kp,
                    'descriptors': orb_desc,
                    'count': result[5]
                },
                'processing_time': result[6],
                'image_shape': json.loads(result[7]) if result[7] else None,
                'was_cropped': bool(result[8])
            }
        
        self.cache_stats['feature_cache_misses'] += 1
        return None
    
    def _cache_features(self, url: str, features: Dict, processing_time: float, 
                       image_shape: Tuple, was_cropped: bool):
        """Cache features to database"""
        url_hash = self._get_url_hash(url)
        
        # Serialize features
        sift_kp_data = self._serialize_keypoints(features['sift']['keypoints'])
        sift_desc_data = pickle.dumps(features['sift']['descriptors']) if features['sift']['descriptors'] is not None else b''
        orb_kp_data = self._serialize_keypoints(features['orb']['keypoints'])
        orb_desc_data = pickle.dumps(features['orb']['descriptors']) if features['orb']['descriptors'] is not None else b''
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO cached_features 
            (url_hash, url, sift_keypoints, sift_descriptors, sift_count,
             orb_keypoints, orb_descriptors, orb_count, processing_time,
             image_shape, was_cropped, created_at, last_accessed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            url_hash, url, sift_kp_data, sift_desc_data, features['sift']['count'],
            orb_kp_data, orb_desc_data, features['orb']['count'], processing_time,
            json.dumps(image_shape), was_cropped, datetime.now(), datetime.now()
        ))
        
        conn.commit()
        conn.close()
    
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
            response = self.session.get(url, timeout=timeout)
            response.raise_for_status()
            
            image_array = np.frombuffer(response.content, np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if image is not None:
                # Cache the downloaded image
                self._cache_image(url, image)
            
            return image
            
        except Exception as e:
            print(f"Download error for {url}: {e}")
            return None
    
    def detect_comic_area(self, image):
        """Detect and crop comic area from photo (same as original)"""
        if image is None:
            return image, False
            
        original = image.copy()
        h, w = image.shape[:2]
        
        # Convert to grayscale for edge detection
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Edge detection with multiple thresholds
        edges1 = cv2.Canny(blurred, 30, 90)
        edges2 = cv2.Canny(blurred, 50, 150)
        edges = cv2.bitwise_or(edges1, edges2)
        
        # Morphological operations to connect edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        edges = cv2.morphologyEx(edges, cv2.MORPH_DILATE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return original, False
        
        # Find the best rectangular contour
        best_contour = None
        best_score = 0
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < (w * h) * 0.05 or area > (w * h) * 0.95:  # Size filter
                continue
            
            # Get bounding rectangle
            x, y, cw, ch = cv2.boundingRect(contour)
            rect_area = cw * ch
            fill_ratio = area / rect_area
            
            # Check aspect ratio (comics are usually taller than wide)
            aspect_ratio = ch / cw if cw > 0 else 0
            
            # Score based on size, fill ratio, and aspect ratio
            if 0.6 <= aspect_ratio <= 3.5 and fill_ratio > 0.4:
                score = (area / (w * h)) * fill_ratio * min(aspect_ratio / 1.4, 1)
                if score > best_score:
                    best_score = score
                    best_contour = contour
        
        if best_contour is not None and best_score > 0.15:
            x, y, cw, ch = cv2.boundingRect(best_contour)
            # Add padding
            pad = 15
            x = max(0, x - pad)
            y = max(0, y - pad)
            cw = min(w - x, cw + 2 * pad)
            ch = min(h - y, ch + 2 * pad)
            
            cropped = image[y:y+ch, x:x+cw]
            print(f"✅ Comic detected and cropped: {original.shape} -> {cropped.shape}")
            return cropped, True
        
        print(f"❌ No reliable comic detection, using full image")
        return original, False
    
    def preprocess_image(self, image):
        """Preprocess image for better feature detection (same as original)"""
        if image is None:
            return None
        
        # Resize to reasonable size for feature detection
        h, w = image.shape[:2]
        if max(h, w) > 800:
            scale = 800 / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        # Apply histogram equalization
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Slight Gaussian blur
        processed = cv2.GaussianBlur(enhanced, (3, 3), 0)
        
        return processed
    
    def extract_features(self, image):
        """Extract features using both SIFT and ORB (same as original)"""
        if image is None:
            return None
        
        processed = self.preprocess_image(image)
        if processed is None:
            return None
        
        features = {}
        
        try:
            # SIFT features
            sift_kp, sift_desc = self.sift.detectAndCompute(processed, None)
            features['sift'] = {
                'keypoints': sift_kp,
                'descriptors': sift_desc,
                'count': len(sift_kp) if sift_kp else 0
            }
        except Exception as e:
            print(f"SIFT feature extraction failed: {e}")
            features['sift'] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
        try:
            # ORB features
            orb_kp, orb_desc = self.orb.detectAndCompute(processed, None)
            features['orb'] = {
                'keypoints': orb_kp,
                'descriptors': orb_desc,
                'count': len(orb_kp) if orb_kp else 0
            }
        except Exception as e:
            print(f"ORB feature extraction failed: {e}")
            features['orb'] = {'keypoints': [], 'descriptors': None, 'count': 0}
        
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
        
        if features is not None:
            # Cache the features
            self._cache_features(url, features, processing_time, 
                               cropped_image.shape, was_cropped)
        
        return features
    
    def match_features(self, query_features, candidate_features):
        """Match features between query and candidate images (same as original)"""
        if not query_features or not candidate_features:
            return 0.0, {}
        
        match_results = {}
        similarities = []
        
        # SIFT matching
        sift_similarity = 0.0
        if (query_features['sift']['descriptors'] is not None and 
            candidate_features['sift']['descriptors'] is not None and
            len(query_features['sift']['descriptors']) > 10 and
            len(candidate_features['sift']['descriptors']) > 10):
            
            try:
                matches = self.bf_matcher.knnMatch(
                    query_features['sift']['descriptors'], 
                    candidate_features['sift']['descriptors'], 
                    k=2
                )
                
                good_matches = []
                for match_pair in matches:
                    if len(match_pair) == 2:
                        m, n = match_pair
                        if m.distance < 0.75 * n.distance:
                            good_matches.append(m)
                
                max_features = max(query_features['sift']['count'], candidate_features['sift']['count'])
                if max_features > 0:
                    sift_similarity = len(good_matches) / max_features
                
                match_results['sift'] = {
                    'total_matches': len(matches),
                    'good_matches': len(good_matches),
                    'similarity': sift_similarity
                }
                
            except Exception as e:
                print(f"SIFT matching error: {e}")
                match_results['sift'] = {'total_matches': 0, 'good_matches': 0, 'similarity': 0.0}
        
        # ORB matching
        orb_similarity = 0.0
        if (query_features['orb']['descriptors'] is not None and 
            candidate_features['orb']['descriptors'] is not None and
            len(query_features['orb']['descriptors']) > 10 and
            len(candidate_features['orb']['descriptors']) > 10):
            
            try:
                matches = self.orb_matcher.knnMatch(
                    query_features['orb']['descriptors'], 
                    candidate_features['orb']['descriptors'], 
                    k=2
                )
                
                good_matches = []
                for match_pair in matches:
                    if len(match_pair) == 2:
                        m, n = match_pair
                        if m.distance < 0.7 * n.distance:
                            good_matches.append(m)
                
                max_features = max(query_features['orb']['count'], candidate_features['orb']['count'])
                if max_features > 0:
                    orb_similarity = len(good_matches) / max_features
                
                match_results['orb'] = {
                    'total_matches': len(matches),
                    'good_matches': len(good_matches),
                    'similarity': orb_similarity
                }
                
            except Exception as e:
                print(f"ORB matching error: {e}")
                match_results['orb'] = {'total_matches': 0, 'good_matches': 0, 'similarity': 0.0}
        
        # Combine similarities
        if sift_similarity > 0 and orb_similarity > 0:
            overall_similarity = 0.7 * sift_similarity + 0.3 * orb_similarity
        elif sift_similarity > 0:
            overall_similarity = sift_similarity
        elif orb_similarity > 0:
            overall_similarity = orb_similarity
        else:
            overall_similarity = 0.0
        
        return overall_similarity, match_results
    
    def find_matches_img(self, query_image, candidate_urls, threshold=0.1):
        """Main matching function with caching support"""
        print("🚀 Starting Cached Feature Matching Comic Search...")
        start_time = time.time()
        
        if query_image is None:
            raise ValueError("Query image data is None")
        
        print(f"📷 Received query image: {query_image.shape}")
        
        # Process query image (not cached since it's user input)
        query_image, was_cropped = self.detect_comic_area(query_image)
        query_features = self.extract_features(query_image)
        
        if not query_features:
            raise ValueError("Could not extract features from query image")
        
        print(f"✅ Query features - SIFT: {query_features['sift']['count']}, ORB: {query_features['orb']['count']}")
        
        # Process candidates with caching
        print(f"⬇️ Processing {len(candidate_urls)} candidate images (with caching)...")
        
        results = []
        
        from tqdm import tqdm
        for i, url in enumerate(tqdm(candidate_urls, desc="Processing candidates", unit="url"), 1):
            
            # Extract features (cached)
            candidate_features = self.extract_features_cached(url)
            
            if not candidate_features:
                results.append({
                    'url': url,
                    'similarity': 0.0,
                    'status': 'failed_features',
                    'match_details': {}
                })
                continue
            
            # Match features
            similarity, match_details = self.match_features(query_features, candidate_features)
            
            results.append({
                'url': url,
                'similarity': similarity,
                'status': 'success',
                'match_details': match_details,
                'candidate_features': {
                    'sift_count': candidate_features['sift']['count'],
                    'orb_count': candidate_features['orb']['count']
                }
            })
        
        # Sort by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Filter by threshold
        good_matches = [r for r in results if r['similarity'] >= threshold]
        
        print(f"✨ Cached feature matching completed in {time.time() - start_time:.2f}s")
        print(f"🎯 Found {len(good_matches)} matches above threshold ({threshold})")
        
        return results, query_features
    
    def get_cache_stats(self) -> Dict:
        """Get cache performance statistics"""
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
        
        conn.close()
        
        # Calculate cache hit rates
        total_image_requests = self.cache_stats['image_cache_hits'] + self.cache_stats['image_cache_misses']
        total_feature_requests = self.cache_stats['feature_cache_hits'] + self.cache_stats['feature_cache_misses']
        
        image_hit_rate = (self.cache_stats['image_cache_hits'] / total_image_requests * 100) if total_image_requests > 0 else 0
        feature_hit_rate = (self.cache_stats['feature_cache_hits'] / total_feature_requests * 100) if total_feature_requests > 0 else 0
        
        return {
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
    
    def print_cache_stats(self):
        """Print cache statistics in a nice format"""
        stats = self.get_cache_stats()
        
        print("\n" + "="*50)
        print("📊 CACHE PERFORMANCE STATISTICS")
        print("="*50)
        print(f"💾 Cached Images: {stats['cached_images_count']}")
        print(f"🔍 Cached Features: {stats['cached_features_count']}")
        print(f"💿 Disk Usage: {stats['total_disk_usage_mb']:.1f} MB")
        print(f"⏱️ Processing Time Saved: {stats['total_processing_time_saved']:.2f} seconds")
        print(f"📈 Image Cache Hit Rate: {stats['image_cache_hit_rate']:.1f}%")
        print(f"🎯 Feature Cache Hit Rate: {stats['feature_cache_hit_rate']:.1f}%")
        print(f"✅ Image Cache Hits: {stats['image_cache_hits']}")
        print(f"❌ Image Cache Misses: {stats['image_cache_misses']}")
        print(f"✅ Feature Cache Hits: {stats['feature_cache_hits']}")
        print(f"❌ Feature Cache Misses: {stats['feature_cache_misses']}")
        
        if stats['total_processing_time_saved'] > 0:
            print(f"🚀 Efficiency Gained: {stats['total_processing_time_saved']:.1f}s saved!")
    
    def cleanup_old_cache(self, days_old: int = 30):
        """Remove cache entries older than specified days"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get old entries
        cursor.execute('''
            SELECT url_hash, file_path FROM cached_images 
            WHERE last_accessed < datetime('now', '-{} days')
        '''.format(days_old))
        
        old_entries = cursor.fetchall()
        
        # Delete old files and database entries
        for url_hash, file_path in old_entries:
            if os.path.exists(file_path):
                os.remove(file_path)
            
            cursor.execute('DELETE FROM cached_features WHERE url_hash = ?', (url_hash,))
            cursor.execute('DELETE FROM cached_images WHERE url_hash = ?', (url_hash,))
        
        conn.commit()
        conn.close()
        
        print(f"🧹 Cleaned up {len(old_entries)} old cache entries")
