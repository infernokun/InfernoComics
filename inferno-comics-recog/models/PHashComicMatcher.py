import cv2
import numpy as np
import requests
import hashlib
import os
import time
import concurrent.futures
import imagehash
from PIL import Image

class PHashComicMatcher:
    def __init__(self, cache_dir='image_cache', max_workers=4):
        self.cache_dir = cache_dir
        self.max_workers = max_workers
        os.makedirs(cache_dir, exist_ok=True)
        
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
        
        # Edge detection
        edges = cv2.Canny(blurred, 50, 150)
        
        # Morphological operations to connect edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        edges = cv2.morphologyEx(edges, cv2.MORPH_DILATE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return original, False
        
        # Find the largest rectangular contour
        best_contour = None
        best_score = 0
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < (w * h) * 0.1 or area > (w * h) * 0.9:  # Size filter
                continue
            
            # Get bounding rectangle
            x, y, cw, ch = cv2.boundingRect(contour)
            rect_area = cw * ch
            fill_ratio = area / rect_area
            
            # Check aspect ratio (comics are usually taller than wide)
            aspect_ratio = ch / cw
            
            # Score based on size, fill ratio, and aspect ratio
            if 0.7 <= aspect_ratio <= 3.0 and fill_ratio > 0.5:
                score = (area / (w * h)) * fill_ratio * min(aspect_ratio / 1.4, 1)
                if score > best_score:
                    best_score = score
                    best_contour = contour
        
        if best_contour is not None and best_score > 0.2:
            x, y, cw, ch = cv2.boundingRect(best_contour)
            # Add padding
            pad = 20
            x = max(0, x - pad)
            y = max(0, y - pad)
            cw = min(w - x, cw + 2 * pad)
            ch = min(h - y, ch + 2 * pad)
            
            cropped = image[y:y+ch, x:x+cw]
            print(f"✅ Comic detected and cropped: {original.shape} -> {cropped.shape}")
            return cropped, True
        
        print(f"❌ No reliable comic detection, using full image")
        return original, False
    
    def calculate_hashes(self, image):
        """Calculate multiple perceptual hashes for robust matching"""
        if image is None:
            return None
        
        # Convert OpenCV image to PIL
        if len(image.shape) == 3:
            # BGR to RGB
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb_image)
        else:
            pil_image = Image.fromarray(image)
        
        # Resize to standard size for consistent hashing
        pil_image = pil_image.resize((256, 256), Image.Resampling.LANCZOS)
        
        # Calculate multiple hash types
        hashes = {
            'phash': imagehash.phash(pil_image, hash_size=16),  # Larger hash for better accuracy
            'dhash': imagehash.dhash(pil_image, hash_size=16),
            'ahash': imagehash.average_hash(pil_image, hash_size=16),
            'whash': imagehash.whash(pil_image, hash_size=16)   # Wavelet hash
        }
        
        return hashes
    
    def calculate_similarity(self, query_hashes, candidate_hashes):
        """Calculate similarity between two hash sets"""
        if not query_hashes or not candidate_hashes:
            return 0.0
        
        similarities = []
        weights = {
            'phash': 0.4,   # Most important for perceptual similarity
            'dhash': 0.25,  # Good for detecting differences
            'ahash': 0.2,   # Basic average hash
            'whash': 0.15   # Wavelet-based
        }
        
        for hash_type in ['phash', 'dhash', 'ahash', 'whash']:
            if hash_type in query_hashes and hash_type in candidate_hashes:
                # Calculate Hamming distance
                distance = query_hashes[hash_type] - candidate_hashes[hash_type]
                
                # Convert to similarity (lower distance = higher similarity)
                # For 16x16 hashes, max distance is 256
                max_distance = 256
                similarity = max(0, 1 - (distance / max_distance))
                
                # Apply weight
                weighted_similarity = similarity * weights[hash_type]
                similarities.append(weighted_similarity)
        
        return sum(similarities) if similarities else 0.0
    
    def preprocess_for_hashing(self, image):
        """Preprocess image to improve hash consistency"""
        if image is None:
            return None
        
        # Apply slight Gaussian blur to reduce noise from photos
        blurred = cv2.GaussianBlur(image, (3, 3), 0)
        
        # Enhance contrast slightly
        lab = cv2.cvtColor(blurred, cv2.COLOR_BGR2LAB)
        l_channel = lab[:, :, 0]
        
        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_channel = clahe.apply(l_channel)
        lab[:, :, 0] = l_channel
        
        enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        
        return enhanced
    
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
    
    def find_matches(self, query_image_path, candidate_urls, threshold=0.6):
        """Main matching function using perceptual hashing"""
        print("🚀 Starting pHash Comic Matching...")
        start_time = time.time()
        
        # Load and process query image
        query_image = cv2.imread(query_image_path)
        if query_image is None:
            raise ValueError(f"Could not load query image: {query_image_path}")
        
        print(f"📷 Loaded query image: {query_image.shape}")
        
        # Detect comic area
        query_image, was_cropped = self.detect_comic_area(query_image)
        
        # Preprocess for better hashing
        query_processed = self.preprocess_for_hashing(query_image)
        
        # Calculate query hashes
        print("🔍 Calculating query image hashes...")
        query_hashes = self.calculate_hashes(query_processed)
        
        if not query_hashes:
            raise ValueError("Could not calculate hashes for query image")
        
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
                    'hash_distances': {}
                })
                continue
            
            # Preprocess candidate image
            candidate_processed = self.preprocess_for_hashing(candidate_images[url])
            
            # Calculate candidate hashes
            candidate_hashes = self.calculate_hashes(candidate_processed)
            
            if not candidate_hashes:
                results.append({
                    'url': url,
                    'similarity': 0.0,
                    'status': 'failed_hash',
                    'hash_distances': {}
                })
                continue
            
            # Calculate similarity
            similarity = self.calculate_similarity(query_hashes, candidate_hashes)
            
            # Calculate individual hash distances for debugging
            hash_distances = {}
            for hash_type in ['phash', 'dhash', 'ahash', 'whash']:
                if hash_type in query_hashes and hash_type in candidate_hashes:
                    distance = query_hashes[hash_type] - candidate_hashes[hash_type]
                    hash_distances[hash_type] = int(distance)
            
            results.append({
                'url': url,
                'similarity': similarity,
                'status': 'success',
                'hash_distances': hash_distances,
                'hashes': candidate_hashes
            })
        
        # Sort by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Filter by threshold
        good_matches = [r for r in results if r['similarity'] >= threshold]
        
        print(f"✨ Matching completed in {time.time() - start_time:.2f}s")
        print(f"🎯 Found {len(good_matches)} matches above threshold ({threshold})")
        
        return results, query_hashes
    
    def find_matches_img(self, query_image, candidate_urls, threshold=0.6):
        """Main matching function where query_image is a loaded image"""
        print("🚀 Starting pHash Comic Matching...")
        start_time = time.time()
        
        if query_image is None:
            raise ValueError("Query image data is None")
        
        print(f"📷 Received query image: {query_image.shape}")
        
        # Detect comic area
        query_image, was_cropped = self.detect_comic_area(query_image)
        
        # Preprocess for better hashing
        query_processed = self.preprocess_for_hashing(query_image)
        
        # Calculate query hashes
        print("🔍 Calculating query image hashes...")
        query_hashes = self.calculate_hashes(query_processed)
        
        if not query_hashes:
            raise ValueError("Could not calculate hashes for query image")
        
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
                    'hash_distances': {}
                })
                continue
            
            # Preprocess candidate image
            candidate_processed = self.preprocess_for_hashing(candidate_images[url])
            
            # Calculate candidate hashes
            candidate_hashes = self.calculate_hashes(candidate_processed)
            
            if not candidate_hashes:
                results.append({
                    'url': url,
                    'similarity': 0.0,
                    'status': 'failed_hash',
                    'hash_distances': {}
                })
                continue
            
            # Calculate similarity
            similarity = self.calculate_similarity(query_hashes, candidate_hashes)
            
            # Calculate individual hash distances for debugging
            hash_distances = {}
            for hash_type in ['phash', 'dhash', 'ahash', 'whash']:
                if hash_type in query_hashes and hash_type in candidate_hashes:
                    distance = query_hashes[hash_type] - candidate_hashes[hash_type]
                    hash_distances[hash_type] = int(distance)
            
            results.append({
                'url': url,
                'similarity': similarity,
                'status': 'success',
                'hash_distances': hash_distances,
                'hashes': candidate_hashes
            })
        
        # Sort by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Filter by threshold
        good_matches = [r for r in results if r['similarity'] >= threshold]
        
        print(f"✨ Matching completed in {time.time() - start_time:.2f}s")
        print(f"🎯 Found {len(good_matches)} matches above threshold ({threshold})")
        
        return results, query_hashes
    
    def visualize_results(self, query_image_path, results, query_hashes, top_n=5):
        """Create visual comparison of results"""
        try:
            import matplotlib
            matplotlib.use('TkAgg')
            import matplotlib.pyplot as plt
        except ImportError:
            print("❌ Matplotlib not available for visualization")
            self.print_results(results, top_n)
            return
        
        # Load query image
        query_image = cv2.imread(query_image_path, cv2.IMREAD_COLOR)
        query_image, _ = self.detect_comic_area(query_image)
        query_rgb = cv2.cvtColor(query_image, cv2.COLOR_BGR2RGB)
        
        # Filter successful results
        successful_results = [r for r in results if r['status'] == 'success']
        top_results = successful_results[:top_n]
        
        if not top_results:
            print("❌ No successful matches to visualize")
            return
        
        # Create figure
        fig, axes = plt.subplots(2, len(top_results) + 1, figsize=(4 * (len(top_results) + 1), 8))
        if len(top_results) == 0:
            axes = axes.reshape(2, 1)
        elif len(axes.shape) == 1:
            axes = axes.reshape(2, len(top_results) + 1)
        
        # Query image
        axes[0, 0].imshow(query_rgb)
        axes[0, 0].set_title("📷 Query Image", fontweight='bold')
        axes[0, 0].axis('off')
        
        # Query hash info
        hash_info = "🔍 Query Hashes:\n"
        for hash_type, hash_val in query_hashes.items():
            hash_info += f"{hash_type}: {str(hash_val)[:16]}...\n"
        
        axes[1, 0].text(0.1, 0.9, hash_info, ha='left', va='top', fontsize=8,
                       bbox=dict(boxstyle="round,pad=0.3", facecolor="lightblue"))
        axes[1, 0].set_xlim(0, 1)
        axes[1, 0].set_ylim(0, 1)
        axes[1, 0].axis('off')
        
        # Show top matches
        for i, result in enumerate(top_results, 1):
            try:
                candidate_image = self.download_image(result['url'])
                if candidate_image is not None:
                    candidate_rgb = cv2.cvtColor(candidate_image, cv2.COLOR_BGR2RGB)
                    
                    # Main image
                    axes[0, i].imshow(candidate_rgb)
                    
                    # Color-code based on similarity
                    if result['similarity'] > 0.8:
                        title_color = 'green'
                        emoji = '🏆'
                    elif result['similarity'] > 0.6:
                        title_color = 'orange'
                        emoji = '🥈'
                    else:
                        title_color = 'red'
                        emoji = '🥉'
                    
                    axes[0, i].set_title(f"{emoji} #{i}\nSimilarity: {result['similarity']:.3f}", 
                                       fontweight='bold', color=title_color)
                    axes[0, i].axis('off')
                    
                    # Hash distance info
                    hash_text = f"📊 Hash Distances:\n"
                    for hash_type, distance in result['hash_distances'].items():
                        # Lower distance = better match
                        status = "✅" if distance < 30 else "⚠️" if distance < 60 else "❌"
                        hash_text += f"{status} {hash_type}: {distance}\n"
                    
                    # Background color based on overall similarity
                    bg_color = 'lightgreen' if result['similarity'] > 0.8 else \
                              'lightyellow' if result['similarity'] > 0.6 else 'lightcoral'
                    
                    axes[1, i].text(0.1, 0.9, hash_text, ha='left', va='top', fontsize=8,
                                   bbox=dict(boxstyle="round,pad=0.3", facecolor=bg_color))
                    axes[1, i].set_xlim(0, 1)
                    axes[1, i].set_ylim(0, 1)
                    axes[1, i].axis('off')
                
            except Exception as e:
                print(f"Error visualizing result {i}: {e}")
                axes[0, i].text(0.5, 0.5, "❌ Error", ha='center', va='center')
                axes[0, i].axis('off')
                axes[1, i].axis('off')
        
        plt.suptitle("🎯 pHash Comic Matching Results", fontsize=16, fontweight='bold')
        plt.tight_layout()
        
        try:
            plt.show()
            print("📊 Visualization displayed!")
        except Exception as e:
            print(f"Display error: {e}")
            save_path = 'phash_comic_results.png'
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            print(f"📊 Saved to: {save_path}")
        finally:
            plt.close()
    
    def print_results(self, results, top_n=10):
        """Print results in a nice format"""
        print("\n" + "="*60)
        print("🎯 pHash COMIC MATCHING RESULTS")
        print("="*60)
        
        successful_results = [r for r in results if r['status'] == 'success']
        
        for i, result in enumerate(successful_results[:top_n], 1):
            emoji = '🏆' if i == 1 else '🥈' if i == 2 else '🥉' if i == 3 else '📄'
            print(f"\n{emoji} RANK #{i}")
            print(f"🔗 URL: {result['url']}")
            print(f"📊 Similarity: {result['similarity']:.4f}")
            print(f"📋 Hash Distances:")
            
            for hash_type, distance in result['hash_distances'].items():
                status = "✅ Excellent" if distance < 20 else \
                        "🟢 Good" if distance < 40 else \
                        "🟡 Fair" if distance < 60 else \
                        "🔴 Poor"
                print(f"   {hash_type}: {distance:3d} ({status})")
        
        print(f"\n📈 Summary: {len(successful_results)} successful matches")

