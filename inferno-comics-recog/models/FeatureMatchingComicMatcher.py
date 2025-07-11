import os
# Set OpenCV to headless mode BEFORE importing cv2
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['OPENCV_LOG_LEVEL'] = 'ERROR'

import cv2
import numpy as np
import requests
import hashlib
import time
import concurrent.futures

# Force OpenCV to use headless backend
cv2.setNumThreads(1)

class FeatureMatchingComicMatcher:
    def __init__(self, cache_dir='image_cache', max_workers=4):
        self.cache_dir = cache_dir
        self.max_workers = max_workers
        os.makedirs(cache_dir, exist_ok=True)
        
        # Initialize feature detectors
        self.sift = cv2.SIFT_create(nfeatures=1000)  # More features for better matching
        self.orb = cv2.ORB_create(nfeatures=1000)
        
        # Matcher for SIFT features
        self.bf_matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        # Matcher for ORB features  
        self.orb_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        
        # Simple session for downloads
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def detect_comic_area(self, image):
        """Detect and crop comic area from photo"""
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
        """Preprocess image for better feature detection"""
        if image is None:
            return None
        
        # Resize to reasonable size for feature detection (speeds up processing)
        h, w = image.shape[:2]
        if max(h, w) > 800:
            scale = 800 / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        # Convert to grayscale for feature detection
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        # Apply histogram equalization to handle lighting differences
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Slight Gaussian blur to reduce noise
        processed = cv2.GaussianBlur(enhanced, (3, 3), 0)
        
        return processed
    
    def extract_features(self, image):
        """Extract features using both SIFT and ORB"""
        if image is None:
            return None
        
        processed = self.preprocess_image(image)
        if processed is None:
            return None
        
        features = {}
        
        try:
            # SIFT features (better for detailed matching)
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
            # ORB features (faster, good for basic matching)
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
    
    def match_features(self, query_features, candidate_features):
        """Match features between query and candidate images"""
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
                # Use KNN matching for better results
                matches = self.bf_matcher.knnMatch(
                    query_features['sift']['descriptors'], 
                    candidate_features['sift']['descriptors'], 
                    k=2
                )
                
                # Apply ratio test (Lowe's ratio test)
                good_matches = []
                for match_pair in matches:
                    if len(match_pair) == 2:
                        m, n = match_pair
                        if m.distance < 0.75 * n.distance:  # Stricter ratio for comics
                            good_matches.append(m)
                
                # Calculate similarity based on good matches
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
                
                # Apply ratio test
                good_matches = []
                for match_pair in matches:
                    if len(match_pair) == 2:
                        m, n = match_pair
                        if m.distance < 0.7 * n.distance:  # Slightly stricter for ORB
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
        
        # Combine similarities with weights (SIFT is generally better for detailed images)
        if sift_similarity > 0 and orb_similarity > 0:
            overall_similarity = 0.7 * sift_similarity + 0.3 * orb_similarity
        elif sift_similarity > 0:
            overall_similarity = sift_similarity
        elif orb_similarity > 0:
            overall_similarity = orb_similarity
        else:
            overall_similarity = 0.0
        
        return overall_similarity, match_results
    
    def download_image(self, url, timeout=10):
        """Download image with caching"""
        url_hash = hashlib.md5(url.encode()).hexdigest()
        cache_path = os.path.join(self.cache_dir, f"{url_hash}.jpg")
        
        if os.path.exists(cache_path):
            return cv2.imread(cache_path)
        
        try:
            response = self.session.get(url, timeout=timeout)
            response.raise_for_status()
            
            image_array = np.frombuffer(response.content, np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if image is not None:
                cv2.imwrite(cache_path, image)
            
            return image
        except Exception as e:
            print(f"Download error for {url}: {e}")
            return None
    
    def download_images_batch(self, urls):
        """Download multiple images in parallel"""
        images = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_url = {executor.submit(self.download_image, url): url for url in urls}
            
            for future in concurrent.futures.as_completed(future_to_url):
                url = future_to_url[future]
                try:
                    image = future.result()
                    if image is not None:
                        images[url] = image
                except Exception as e:
                    print(f"Error processing {url}: {e}")
        return images
    
    def find_matches(self, query_image_path, candidate_urls, threshold=0.1):
        """Main matching function using feature matching"""
        print("🚀 Starting Feature Matching Comic Search...")
        start_time = time.time()
        
        # Load and process query image
        query_image = cv2.imread(query_image_path)
        if query_image is None:
            raise ValueError(f"Could not load query image: {query_image_path}")
        
        print(f"📷 Loaded query image: {query_image.shape}")
        
        # Detect comic area
        query_image, was_cropped = self.detect_comic_area(query_image)
        
        # Extract features from query
        print("🔍 Extracting features from query image...")
        query_features = self.extract_features(query_image)
        
        if not query_features:
            raise ValueError("Could not extract features from query image")
        
        print(f"✅ Query features - SIFT: {query_features['sift']['count']}, ORB: {query_features['orb']['count']}")
        
        # Download candidate images
        print(f"⬇️ Downloading {len(candidate_urls)} candidate images...")
        candidate_images = self.download_images_batch(candidate_urls)
        print(f"✅ Downloaded {len(candidate_images)} images")
        
        # Process each candidate
        results = []
        
        for i, url in enumerate(candidate_urls, 1):
            print(f"🔄 Processing candidate {i}/{len(candidate_urls)}...")
            
            if url not in candidate_images:
                results.append({
                    'url': url,
                    'similarity': 0.0,
                    'status': 'failed_download',
                    'match_details': {}
                })
                continue
            
            # Extract features from candidate
            candidate_features = self.extract_features(candidate_images[url])
            
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
        
        print(f"✨ Feature matching completed in {time.time() - start_time:.2f}s")
        print(f"🎯 Found {len(good_matches)} matches above threshold ({threshold})")
        
        return results, query_features
    
    def find_matches_img(self, query_image, candidate_urls, threshold=0.1):
        """Main matching function where query_image is a loaded image"""
        print("🚀 Starting Feature Matching Comic Search...")
        start_time = time.time()
        
        if query_image is None:
            raise ValueError("Query image data is None")
        
        print(f"📷 Received query image: {query_image.shape}")
        
        # Detect comic area
        query_image, was_cropped = self.detect_comic_area(query_image)
        
        # Extract features from query
        print("🔍 Extracting features from query image...")
        query_features = self.extract_features(query_image)
        
        if not query_features:
            raise ValueError("Could not extract features from query image")
        
        print(f"✅ Query features - SIFT: {query_features['sift']['count']}, ORB: {query_features['orb']['count']}")
        
        # Download candidate images
        print(f"⬇️ Downloading {len(candidate_urls)} candidate images...")
        candidate_images = self.download_images_batch(candidate_urls)
        print(f"✅ Downloaded {len(candidate_images)} images")
        
        # Process each candidate
        results = []
        
        from tqdm import tqdm
        for i, url in enumerate(tqdm(candidate_urls, desc="Processing candidates", unit="url"), 1):
            
            if url not in candidate_images:
                results.append({
                    'url': url,
                    'similarity': 0.0,
                    'status': 'failed_download',
                    'match_details': {}
                })
                continue
            
            # Extract features from candidate
            candidate_features = self.extract_features(candidate_images[url])
            
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
        
        print(f"✨ Feature matching completed in {time.time() - start_time:.2f}s")
        print(f"🎯 Found {len(good_matches)} matches above threshold ({threshold})")
        
        return results, query_features

    def visualize_results(self, query_image_path, results, query_features, top_n=5):
        """Create visual comparison with proper display handling"""
        # Set matplotlib backend before importing pyplot
        import matplotlib
        matplotlib.use('Agg')  # Use non-interactive backend
        import matplotlib.pyplot as plt
        
        # Load query image (avoid any Qt-related OpenCV functions)
        query_image = cv2.imread(query_image_path, cv2.IMREAD_COLOR)
        query_image, _ = self.detect_comic_area(query_image)
        query_rgb = cv2.cvtColor(query_image, cv2.COLOR_BGR2RGB)
        
        # Filter successful results
        successful_results = [r for r in results if r['status'] == 'success']
        top_results = successful_results[:top_n]
        
        if not top_results:
            print("❌ No successful matches to visualize")
            return
        
        # Create figure with explicit backend
        plt.ioff()  # Turn off interactive mode
        fig = plt.figure(figsize=(20, 12))
        gs = fig.add_gridspec(3, len(top_results) + 1, hspace=0.3, wspace=0.2)
        
        # Query image section
        ax_query = fig.add_subplot(gs[:2, 0])
        ax_query.imshow(query_rgb)
        ax_query.set_title("📷 Query Image\n(Your Photo)", fontsize=14, fontweight='bold')
        ax_query.axis('off')
        
        # Query analysis
        ax_query_info = fig.add_subplot(gs[2, 0])
        info_text = f"""🔍 QUERY FEATURES:
🎯 SIFT: {query_features['sift']['count']} keypoints
⚡ ORB: {query_features['orb']['count']} keypoints
📐 Method: Feature Matching
🔬 Detection: Keypoint-based"""
        
        ax_query_info.text(0.05, 0.95, info_text, ha='left', va='top', fontsize=10,
                          bbox=dict(boxstyle="round,pad=0.3", facecolor="lightblue", alpha=0.8))
        ax_query_info.set_xlim(0, 1)
        ax_query_info.set_ylim(0, 1)
        ax_query_info.axis('off')
        
        # Show top matches
        for i, result in enumerate(top_results, 1):
            try:
                # Download candidate image for display
                candidate_image = self.download_image(result['url'])
                if candidate_image is not None:
                    candidate_rgb = cv2.cvtColor(candidate_image, cv2.COLOR_BGR2RGB)
                    
                    # Main image
                    ax_img = fig.add_subplot(gs[0, i])
                    ax_img.imshow(candidate_rgb)
                    
                    # Color-code based on similarity
                    if result['similarity'] > 0.15:
                        title_color = 'green'
                        emoji = '🏆'
                    elif result['similarity'] > 0.08:
                        title_color = 'orange'  
                        emoji = '🥈'
                    else:
                        title_color = 'red'
                        emoji = '🥉'
                    
                    ax_img.set_title(f"{emoji} RANK #{i}\nSimilarity: {result['similarity']:.4f}", 
                                   fontsize=12, fontweight='bold', color=title_color)
                    ax_img.axis('off')
                    
                    # Detailed metrics
                    ax_metrics = fig.add_subplot(gs[1, i])
                    details = result['match_details']
                    
                    metrics_text = f"""📊 FEATURE BREAKDOWN:
🎯 SIFT: {details.get('sift', {}).get('good_matches', 0)} good matches
⚡ ORB: {details.get('orb', {}).get('good_matches', 0)} good matches
🔍 SIFT Features: {result['candidate_features']['sift_count']}
⚡ ORB Features: {result['candidate_features']['orb_count']}
📐 SIFT Sim: {details.get('sift', {}).get('similarity', 0):.3f}
⚡ ORB Sim: {details.get('orb', {}).get('similarity', 0):.3f}"""
                    
                    # Color-code metrics box
                    if result['similarity'] > 0.15:
                        bg_color = 'lightgreen'
                    elif result['similarity'] > 0.08:
                        bg_color = 'lightyellow'
                    else:
                        bg_color = 'lightcoral'
                    
                    ax_metrics.text(0.05, 0.95, metrics_text, ha='left', va='top', fontsize=9,
                                   bbox=dict(boxstyle="round,pad=0.3", facecolor=bg_color, alpha=0.8))
                    ax_metrics.set_xlim(0, 1)
                    ax_metrics.set_ylim(0, 1)
                    ax_metrics.axis('off')
                    
                    # URL info
                    ax_url = fig.add_subplot(gs[2, i])
                    url_short = result['url'].split('/')[-1][:25] + '...' if len(result['url'].split('/')[-1]) > 25 else result['url'].split('/')[-1]
                    
                    # Analysis
                    sift_matches = details.get('sift', {}).get('good_matches', 0)
                    orb_matches = details.get('orb', {}).get('good_matches', 0)
                    
                    url_text = f"""🔗 SOURCE:
{url_short}

✅ Total Good Matches: {sift_matches + orb_matches}
🎯 Best Method: {'SIFT' if sift_matches > orb_matches else 'ORB'}
📊 Confidence: {'High' if result['similarity'] > 0.15 else 'Medium' if result['similarity'] > 0.08 else 'Low'}"""
                    
                    ax_url.text(0.05, 0.95, url_text, ha='left', va='top', fontsize=8,
                               bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.8))
                    ax_url.set_xlim(0, 1)
                    ax_url.set_ylim(0, 1)
                    ax_url.axis('off')
                    
                else:
                    # Handle failed image load
                    for row in range(3):
                        ax = fig.add_subplot(gs[row, i])
                        ax.text(0.5, 0.5, "❌ Failed to\nload image", ha='center', va='center', 
                               fontsize=12, color='red')
                        ax.axis('off')
                        
            except Exception as e:
                print(f"Error visualizing result {i}: {e}")
                for row in range(3):
                    ax = fig.add_subplot(gs[row, i])
                    ax.text(0.5, 0.5, f"❌ Error:\n{str(e)[:15]}...", ha='center', va='center', 
                           fontsize=10, color='red')
                    ax.axis('off')
        
        plt.suptitle("🎯 FEATURE MATCHING COMIC RESULTS", fontsize=16, fontweight='bold', y=0.98)
        plt.tight_layout()
        
        # Save the plot instead of showing (headless mode)
        save_path = 'feature_matching_results.png'
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"📊 Visualization saved to: {save_path}")
        plt.close('all')  # Close all figures
    
    def print_results(self, results, top_n=10):
        """Print results in a nice format"""
        print("\n" + "="*70)
        print("🎯 FEATURE MATCHING COMIC RESULTS")
        print("="*70)
        
        successful_results = [r for r in results if r['status'] == 'success']
        
        for i, result in enumerate(successful_results[:top_n], 1):
            emoji = '🏆' if i == 1 else '🥈' if i == 2 else '🥉' if i == 3 else '📄'
            print(f"\n{emoji} RANK #{i}")
            print(f"🔗 URL: {result['url']}")
            print(f"📊 Overall Similarity: {result['similarity']:.4f}")
            print(f"🔍 Features Found:")
            print(f"   SIFT: {result['candidate_features']['sift_count']} keypoints")
            print(f"   ORB:  {result['candidate_features']['orb_count']} keypoints")
            
            if 'match_details' in result:
                details = result['match_details']
                print(f"📋 Match Details:")
                
                if 'sift' in details:
                    sift = details['sift']
                    status = "✅ Excellent" if sift['good_matches'] > 50 else \
                            "🟢 Good" if sift['good_matches'] > 20 else \
                            "🟡 Fair" if sift['good_matches'] > 5 else "🔴 Poor"
                    print(f"   🎯 SIFT: {sift['good_matches']}/{sift['total_matches']} good matches (sim: {sift['similarity']:.4f}) {status}")
                
                if 'orb' in details:
                    orb = details['orb']
                    status = "✅ Excellent" if orb['good_matches'] > 30 else \
                            "🟢 Good" if orb['good_matches'] > 15 else \
                            "🟡 Fair" if orb['good_matches'] > 5 else "🔴 Poor"
                    print(f"   ⚡ ORB:  {orb['good_matches']}/{orb['total_matches']} good matches (sim: {orb['similarity']:.4f}) {status}")
        
        print(f"\n📈 Summary: {len(successful_results)} successful feature extractions")
        
        # Show the best match analysis
        if successful_results:
            best_result = successful_results[0]
            print(f"\n🔬 Best match analysis:")
            print(f"   URL: {best_result['url']}")
            print(f"   Similarity: {best_result['similarity']:.4f}")
            
            details = best_result['match_details']
            total_good_matches = 0
            if 'sift' in details:
                total_good_matches += details['sift']['good_matches']
            if 'orb' in details:
                total_good_matches += details['orb']['good_matches']
            
            confidence = "HIGH" if total_good_matches > 50 else \
                        "MEDIUM" if total_good_matches > 20 else \
                        "LOW"
            print(f"   Total Good Matches: {total_good_matches}")
            print(f"   Confidence Level: {confidence}")