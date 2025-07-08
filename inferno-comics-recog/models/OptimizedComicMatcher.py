import cv2
import numpy as np
import requests
import os
import hashlib
import concurrent.futures
import time
import warnings
warnings.filterwarnings('ignore')

# Disable OpenCV's Qt backend to avoid display issues
os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '0'
cv2.setUseOptimized(True)

class OptimizedComicMatcher:
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
        """Improved comic detection with multiple strategies"""
        if image is None:
            return image, False
            
        original = image.copy()
        h, w = image.shape[:2]
        
        # Strategy 1: Edge-based detection
        comic1, score1 = self._detect_by_edges(image)
        
        # Strategy 2: Color-based detection  
        comic2, score2 = self._detect_by_color_contrast(image)
        
        # Strategy 3: Contour-based detection
        comic3, score3 = self._detect_by_contours(image)
        
        # Choose best detection
        candidates = [
            (comic1, score1, "edges"),
            (comic2, score2, "color"), 
            (comic3, score3, "contours")
        ]
        
        best_comic, best_score, method = max(candidates, key=lambda x: x[1])
        
        if best_score > 0.3:  # Confidence threshold
            print(f"✅ Comic detected using {method} method (confidence: {best_score:.3f})")
            print(f"   Cropped: {original.shape} -> {best_comic.shape}")
            return best_comic, True
        else:
            print(f"❌ No reliable comic detection (best: {method} = {best_score:.3f})")
            return original, False
    
    def _detect_by_edges(self, image):
        """Edge-based comic detection"""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape
            
            # Enhanced edge detection
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            edges = cv2.Canny(blurred, 30, 90)
            
            # Morphological operations to connect edges
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
            edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
            edges = cv2.morphologyEx(edges, cv2.MORPH_DILATE, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            best_contour = None
            best_score = 0
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < (w * h) * 0.2 or area > (w * h) * 0.9:  # Size filter
                    continue
                
                # Get bounding rectangle
                x, y, cw, ch = cv2.boundingRect(contour)
                rect_area = cw * ch
                fill_ratio = area / rect_area
                
                # Check aspect ratio (comics are usually taller than wide)
                aspect_ratio = ch / cw
                
                # Score based on size, fill ratio, and aspect ratio
                if 0.8 <= aspect_ratio <= 2.5 and fill_ratio > 0.6:
                    score = (area / (w * h)) * fill_ratio * min(aspect_ratio / 1.3, 1)
                    if score > best_score:
                        best_score = score
                        best_contour = contour
            
            if best_contour is not None:
                x, y, cw, ch = cv2.boundingRect(best_contour)
                # Add padding
                pad = 20
                x = max(0, x - pad)
                y = max(0, y - pad)
                cw = min(w - x, cw + 2 * pad)
                ch = min(h - y, ch + 2 * pad)
                
                cropped = image[y:y+ch, x:x+cw]
                return cropped, best_score
            
            return image, 0
        except:
            return image, 0
    
    def _detect_by_color_contrast(self, image):
        """Color contrast-based detection"""
        try:
            h, w = image.shape[:2]
            
            # Convert to LAB for better contrast analysis
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l_channel = lab[:, :, 0]
            
            # Calculate local contrast
            kernel = np.ones((15, 15), np.float32) / 225
            local_mean = cv2.filter2D(l_channel.astype(np.float32), -1, kernel)
            contrast = np.abs(l_channel.astype(np.float32) - local_mean)
            
            # Threshold high contrast areas
            _, high_contrast = cv2.threshold(contrast, np.percentile(contrast, 70), 255, cv2.THRESH_BINARY)
            high_contrast = high_contrast.astype(np.uint8)
            
            # Morphological operations
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
            high_contrast = cv2.morphologyEx(high_contrast, cv2.MORPH_CLOSE, kernel)
            
            # Find largest connected component
            contours, _ = cv2.findContours(high_contrast, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if contours:
                largest = max(contours, key=cv2.contourArea)
                area = cv2.contourArea(largest)
                
                if area > (w * h) * 0.2:
                    x, y, cw, ch = cv2.boundingRect(largest)
                    aspect_ratio = ch / cw
                    
                    if 0.8 <= aspect_ratio <= 2.5:
                        # Add padding
                        pad = 15
                        x = max(0, x - pad)
                        y = max(0, y - pad)
                        cw = min(w - x, cw + 2 * pad)
                        ch = min(h - y, ch + 2 * pad)
                        
                        cropped = image[y:y+ch, x:x+cw]
                        score = (area / (w * h)) * min(aspect_ratio / 1.3, 1)
                        return cropped, score
            
            return image, 0
        except:
            return image, 0
    
    def _detect_by_contours(self, image):
        """Contour-based detection with better preprocessing"""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape
            
            # Adaptive preprocessing
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            
            # Multiple edge detection approaches
            edges1 = cv2.Canny(enhanced, 50, 150)
            edges2 = cv2.Canny(cv2.GaussianBlur(enhanced, (3, 3), 0), 30, 90)
            
            # Combine edges
            combined_edges = cv2.bitwise_or(edges1, edges2)
            
            # Morphological operations
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            combined_edges = cv2.morphologyEx(combined_edges, cv2.MORPH_CLOSE, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(combined_edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            best_score = 0
            best_crop = image
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < (w * h) * 0.15 or area > (w * h) * 0.85:
                    continue
                
                # Approximate to polygon
                epsilon = 0.02 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                
                # Prefer rectangular shapes (4-8 vertices)
                if 4 <= len(approx) <= 8:
                    x, y, cw, ch = cv2.boundingRect(contour)
                    rect_area = cw * ch
                    fill_ratio = area / rect_area
                    aspect_ratio = ch / cw
                    
                    if 0.8 <= aspect_ratio <= 2.5 and fill_ratio > 0.5:
                        score = (area / (w * h)) * fill_ratio * min(aspect_ratio / 1.3, 1)
                        if score > best_score:
                            best_score = score
                            # Add padding
                            pad = 10
                            x = max(0, x - pad)
                            y = max(0, y - pad)
                            cw = min(w - x, cw + 2 * pad)
                            ch = min(h - y, ch + 2 * pad)
                            best_crop = image[y:y+ch, x:x+cw]
            
            return best_crop, best_score
        except:
            return image, 0
    
    def extract_key_elements(self, image):
        """Extract key visual elements from comic cover"""
        if image is None:
            return {}
        
        # Resize for consistent processing
        image = cv2.resize(image, (300, 400), interpolation=cv2.INTER_AREA)
        
        elements = {}
        
        # 1. Dominant Colors (simplified)
        elements['colors'] = self._get_dominant_colors(image)
        
        # 2. Text/Logo Detection (with spatial info)
        elements['text_areas'] = self._detect_text_areas(image)
        
        # 3. Character/Object Shapes
        elements['shapes'] = self._detect_main_shapes(image)
        
        # 4. Overall Composition
        elements['composition'] = self._analyze_composition(image)
        
        # 5. Visual Features
        elements['features'] = self._extract_visual_features(image)
        
        # 6. Structural patterns (for better photo matching)
        elements['structure'] = self._extract_structural_patterns(image)
        
        # 7. NEW: Logo/Title region analysis
        elements['title_region'] = self._analyze_title_region(image)
        
        return elements
    
    def _get_dominant_colors(self, image, k=5):
        """Get top K dominant colors"""
        # Reshape image to be a list of pixels
        data = image.reshape((-1, 3))
        data = np.float32(data)
        
        # Use k-means to find dominant colors
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
        _, labels, centers = cv2.kmeans(data, k, None, criteria, 10, cv2.KMEANS_PP_CENTERS)
        
        # Count frequency of each color
        unique, counts = np.unique(labels, return_counts=True)
        
        # Sort by frequency
        sorted_indices = np.argsort(counts)[::-1]
        dominant_colors = centers[sorted_indices].astype(int)
        frequencies = counts[sorted_indices] / len(labels)
        
        return list(zip(dominant_colors, frequencies))
    
    def _detect_text_areas(self, image):
        """Detect areas likely to contain text/logos with better spatial analysis"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        
        # Use morphological operations to find text-like regions
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        
        # Gradient to find edges
        grad_x = cv2.Sobel(gray, cv2.CV_8U, 1, 0, ksize=3)
        grad_y = cv2.Sobel(gray, cv2.CV_8U, 0, 1, ksize=3)
        gradient = cv2.addWeighted(grad_x, 0.5, grad_y, 0.5, 0)
        
        # Threshold and morphological operations
        _, thresh = cv2.threshold(gradient, 50, 255, cv2.THRESH_BINARY)
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        text_areas = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            aspect_ratio = w / h if h > 0 else 0
            
            # Calculate relative position (important for matching)
            rel_x = x / gray.shape[1]
            rel_y = y / gray.shape[0]
            rel_w = w / gray.shape[1]
            rel_h = h / gray.shape[0]
            
            # Filter for text-like properties
            if 50 < area < 5000 and 0.2 < aspect_ratio < 10:
                text_areas.append({
                    'bbox': (x, y, w, h),
                    'area': area,
                    'aspect_ratio': aspect_ratio,
                    'relative_pos': (rel_x, rel_y, rel_w, rel_h),
                    'position_score': rel_y  # Higher = lower on page
                })
        
        # Sort by area (importance)
        text_areas.sort(key=lambda x: x['area'], reverse=True)
        return text_areas[:10]  # Top 10 text areas
    
    def _detect_main_shapes(self, image):
        """Enhanced shape detection for better matching"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply adaptive threshold for better shape detection in photos
        adaptive_thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                               cv2.THRESH_BINARY, 11, 2)
        
        # Combine with Canny edges
        edges = cv2.Canny(gray, 30, 100)
        combined = cv2.bitwise_or(adaptive_thresh, edges)
        
        # Find contours
        contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        shapes = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 500:  # Significant shapes only
                # Get shape properties
                perimeter = cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
                x, y, w, h = cv2.boundingRect(contour)
                
                # Calculate moments for better shape characterization
                M = cv2.moments(contour)
                if M["m00"] != 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                else:
                    cx, cy = x + w//2, y + h//2
                
                # Calculate shape complexity
                hull = cv2.convexHull(contour)
                hull_area = cv2.contourArea(hull)
                solidity = area / hull_area if hull_area > 0 else 0
                
                # Calculate circularity
                circularity = 4 * np.pi * area / (perimeter ** 2) if perimeter > 0 else 0
                
                shape_info = {
                    'area': area,
                    'vertices': len(approx),
                    'aspect_ratio': w / h if h > 0 else 0,
                    'position': (cx, cy),  # Use centroid
                    'size': (w, h),
                    'solidity': solidity,  # Shape complexity measure
                    'perimeter': perimeter,
                    'circularity': circularity,  # NEW: roundness measure
                    'rel_position': (cx / gray.shape[1], cy / gray.shape[0])  # Normalized position
                }
                shapes.append(shape_info)
        
        # Sort by area (importance)
        shapes.sort(key=lambda x: x['area'], reverse=True)
        return shapes[:20]  # Top 20 shapes
    
    def _analyze_composition(self, image):
        """Analyze overall composition"""
        h, w = image.shape[:2]
        
        # Divide into 3x3 grid and analyze each region
        composition = {}
        
        for i in range(3):
            for j in range(3):
                y1, y2 = i * h // 3, (i + 1) * h // 3
                x1, x2 = j * w // 3, (j + 1) * w // 3
                
                region = image[y1:y2, x1:x2]
                
                # Calculate region properties
                mean_color = np.mean(region.reshape(-1, 3), axis=0)
                brightness = np.mean(cv2.cvtColor(region, cv2.COLOR_BGR2GRAY))
                
                # Add texture measure for region
                gray_region = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
                texture = np.std(gray_region)
                
                region_key = f"region_{i}_{j}"
                composition[region_key] = {
                    'mean_color': mean_color,
                    'brightness': brightness,
                    'texture': texture
                }
        
        return composition
    
    def _extract_visual_features(self, image):
        """Enhanced visual features extraction for better photo matching"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply some preprocessing to handle photo artifacts
        # Slight blur to reduce noise
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        
        # Simple histogram features (more bins for better discrimination)
        hist_gray = cv2.calcHist([gray], [0], None, [64], [0, 256])
        hist_gray = hist_gray.flatten() / (hist_gray.sum() + 1e-7)
        
        # Color histograms in HSV space (better for photos)
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        # Hue histogram (most important for color identity)
        hist_h = cv2.calcHist([hsv], [0], None, [32], [0, 180])
        hist_h = hist_h.flatten() / (hist_h.sum() + 1e-7)
        
        # Saturation histogram
        hist_s = cv2.calcHist([hsv], [1], None, [16], [0, 256])
        hist_s = hist_s.flatten() / (hist_s.sum() + 1e-7)
        
        # Value histogram
        hist_v = cv2.calcHist([hsv], [2], None, [16], [0, 256])
        hist_v = hist_v.flatten() / (hist_v.sum() + 1e-7)
        
        # Edge density with multiple thresholds
        edge_densities = []
        for thresh in [30, 50, 100]:
            edges = cv2.Canny(gray, thresh, thresh * 2)
            density = np.sum(edges > 0) / edges.size
            edge_densities.append(density)
        
        # Texture measure using local standard deviation
        kernel = np.ones((5, 5), np.float32) / 25
        mean_img = cv2.filter2D(gray.astype(np.float32), -1, kernel)
        sqr_img = cv2.filter2D((gray.astype(np.float32)) ** 2, -1, kernel)
        texture_measure = np.mean(np.sqrt(sqr_img - mean_img ** 2))
        
        # Gradient orientation histogram (robust to lighting)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        magnitude = np.sqrt(gx**2 + gy**2)
        orientation = np.arctan2(gy, gx)
        
        # Create orientation histogram
        orientation_hist, _ = np.histogram(orientation[magnitude > 10], bins=18, range=(-np.pi, np.pi))
        orientation_hist = orientation_hist.astype(float) / (orientation_hist.sum() + 1e-7)
        
        return {
            'gray_hist': hist_gray,
            'hue_hist': hist_h,
            'sat_hist': hist_s,
            'val_hist': hist_v,
            'edge_densities': np.array(edge_densities),
            'texture': texture_measure,
            'orientation_hist': orientation_hist
        }
    
    def _extract_structural_patterns(self, image):
        """Extract structural patterns that are robust to photo variations"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        
        # 1. Block-based structure (robust to local variations)
        block_size = 20
        blocks = []
        for i in range(0, h - block_size, block_size):
            for j in range(0, w - block_size, block_size):
                block = gray[i:i+block_size, j:j+block_size]
                blocks.append(np.mean(block))
        
        block_pattern = np.array(blocks)
        
        # 2. Vertical and horizontal projections (robust to perspective)
        vertical_proj = np.mean(gray, axis=1)
        horizontal_proj = np.mean(gray, axis=0)
        
        # Downsample projections for efficiency
        vertical_proj = cv2.resize(vertical_proj.reshape(-1, 1), (1, 50)).flatten()
        horizontal_proj = cv2.resize(horizontal_proj.reshape(1, -1), (50, 1)).flatten()
        
        # 3. Fourier descriptors of main contour (shape-invariant)
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        fourier_desc = []
        if contours:
            # Get the largest contour
            largest_contour = max(contours, key=cv2.contourArea)
            # Sample points uniformly
            if len(largest_contour) > 64:
                indices = np.linspace(0, len(largest_contour)-1, 64, dtype=int)
                sampled_contour = largest_contour[indices]
            else:
                sampled_contour = largest_contour
            
            # Calculate Fourier descriptors
            contour_complex = sampled_contour[:, 0, 0] + 1j * sampled_contour[:, 0, 1]
            fourier_desc = np.abs(np.fft.fft(contour_complex))[:32]  # Keep first 32 descriptors
            fourier_desc = fourier_desc / (fourier_desc[0] + 1e-7)  # Normalize
        
        return {
            'block_pattern': block_pattern,
            'vertical_proj': vertical_proj,
            'horizontal_proj': horizontal_proj,
            'fourier_desc': fourier_desc
        }
    
    def _analyze_title_region(self, image):
        """NEW: Analyze the title/logo region specifically"""
        h, w = image.shape[:2]
        
        # Focus on top 30% of image where title usually is
        title_region = image[:int(h*0.3), :]
        gray_title = cv2.cvtColor(title_region, cv2.COLOR_BGR2GRAY)
        
        # Calculate features specific to title region
        features = {}
        
        # 1. Edge density in title region
        edges = cv2.Canny(gray_title, 50, 150)
        features['edge_density'] = np.sum(edges > 0) / edges.size
        
        # 2. Contrast in title region
        features['contrast'] = np.std(gray_title)
        
        # 3. Dominant orientation in title region
        gx = cv2.Sobel(gray_title, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray_title, cv2.CV_32F, 0, 1, ksize=3)
        angles = np.arctan2(gy, gx)
        features['dominant_angle'] = np.median(angles)
        
        # 4. Text-like features (high frequency content)
        laplacian = cv2.Laplacian(gray_title, cv2.CV_64F)
        features['text_energy'] = np.var(laplacian)
        
        return features
    
    def compare_elements(self, query_elements, candidate_elements):
        """Compare extracted elements between images"""
        similarities = {}
        
        # 1. Color Similarity
        similarities['color'] = self._compare_colors(
            query_elements.get('colors', []), 
            candidate_elements.get('colors', [])
        )
        
        # 2. Text Area Similarity (improved spatial awareness)
        similarities['text'] = self._compare_text_areas_spatial(
            query_elements.get('text_areas', []), 
            candidate_elements.get('text_areas', [])
        )
        
        # 3. Shape Similarity (enhanced)
        similarities['shapes'] = self._compare_shapes_enhanced(
            query_elements.get('shapes', []), 
            candidate_elements.get('shapes', [])
        )
        
        # 4. Composition Similarity
        similarities['composition'] = self._compare_composition(
            query_elements.get('composition', {}), 
            candidate_elements.get('composition', {})
        )
        
        # 5. Visual Feature Similarity
        similarities['features'] = self._compare_visual_features(
            query_elements.get('features', {}), 
            candidate_elements.get('features', {})
        )
        
        # 6. Structural pattern similarity
        similarities['structure'] = self._compare_structural_patterns(
            query_elements.get('structure', {}), 
            candidate_elements.get('structure', {})
        )
        
        # 7. NEW: Title region similarity
        similarities['title'] = self._compare_title_regions(
            query_elements.get('title_region', {}), 
            candidate_elements.get('title_region', {})
        )
        
        return similarities
    
    def _compare_colors(self, colors1, colors2):
        """Improved color comparison for photographed comics"""
        if not colors1 or not colors2:
            return 0.0
        
        # Convert to HSV for better comparison (less sensitive to lighting)
        similarities = []
        
        for color1, freq1 in colors1[:5]:  # Top 5 colors
            best_match = 0
            # Convert BGR to HSV
            bgr1 = np.uint8([[color1]])
            hsv1 = cv2.cvtColor(bgr1, cv2.COLOR_BGR2HSV)[0][0]
            
            for color2, freq2 in colors2[:5]:
                bgr2 = np.uint8([[color2]])
                hsv2 = cv2.cvtColor(bgr2, cv2.COLOR_BGR2HSV)[0][0]
                
                # Compare hue (most important for color identity)
                hue_diff = min(abs(hsv1[0] - hsv2[0]), 180 - abs(hsv1[0] - hsv2[0]))
                hue_sim = max(0, 1 - hue_diff / 90)  # Normalize to 0-90 degrees
                
                # Compare saturation (less important)
                sat_sim = max(0, 1 - abs(hsv1[1] - hsv2[1]) / 255)
                
                # Value (brightness) is least important for photos
                val_sim = max(0, 1 - abs(hsv1[2] - hsv2[2]) / 255)
                
                # Weighted HSV similarity (prioritize hue)
                color_sim = 0.7 * hue_sim + 0.2 * sat_sim + 0.1 * val_sim
                best_match = max(best_match, color_sim)
            
            # Weight by frequency
            similarities.append(best_match * freq1)
        
        return np.mean(similarities) if similarities else 0.0
    
    def _compare_text_areas_spatial(self, areas1, areas2):
        """Compare text areas with better spatial awareness"""
        if not areas1 or not areas2:
            return 0.0
        
        similarities = []
        
        for area1 in areas1[:5]:  # Top 5 areas
            best_match = 0
            for area2 in areas2[:5]:
                # Compare relative positions (more robust)
                pos1 = area1['relative_pos']
                pos2 = area2['relative_pos']
                
                # Position similarity with emphasis on vertical position
                pos_dist_x = abs(pos1[0] - pos2[0])
                pos_dist_y = abs(pos1[1] - pos2[1])
                
                # Vertical position is more important for comic layouts
                pos_sim = max(0, 1 - (0.3 * pos_dist_x + 0.7 * pos_dist_y))
                
                # Size similarity (relative sizes)
                size_sim = min(pos1[2] * pos1[3], pos2[2] * pos2[3]) / (max(pos1[2] * pos1[3], pos2[2] * pos2[3]) + 1e-7)
                
                # Aspect ratio similarity
                ar_sim = 1 - abs(area1['aspect_ratio'] - area2['aspect_ratio']) / 5
                
                # Combined similarity with spatial awareness
                combined_sim = 0.5 * pos_sim + 0.3 * size_sim + 0.2 * ar_sim
                best_match = max(best_match, combined_sim)
            
            similarities.append(best_match)
        
        return np.mean(similarities) if similarities else 0.0
    
    def _compare_shapes_enhanced(self, shapes1, shapes2):
        """Enhanced shape comparison with better feature matching"""
        if not shapes1 or not shapes2:
            return 0.0
        
        similarities = []
        
        for shape1 in shapes1[:15]:  # Top 15 shapes
            best_match = 0
            
            for shape2 in shapes2[:15]:
                # Shape type similarity (vertices)
                vertex_diff = abs(shape1['vertices'] - shape2['vertices'])
                vertex_sim = 1 / (1 + vertex_diff)  # Smooth decay
                
                # Aspect ratio similarity
                ar_diff = abs(shape1['aspect_ratio'] - shape2['aspect_ratio'])
                aspect_sim = 1 / (1 + ar_diff)
                
                # Relative position similarity
                pos1 = shape1['rel_position']
                pos2 = shape2['rel_position']
                pos_dist = np.sqrt((pos1[0] - pos2[0])**2 + (pos1[1] - pos2[1])**2)
                pos_sim = max(0, 1 - pos_dist)
                
                # Size similarity (area-based)
                area_ratio = min(shape1['area'], shape2['area']) / (max(shape1['area'], shape2['area']) + 1e-7)
                
                # Solidity similarity (shape complexity)
                solidity_sim = 1 - abs(shape1['solidity'] - shape2['solidity'])
                
                # Circularity similarity (NEW)
                circ_sim = 1 - abs(shape1.get('circularity', 0) - shape2.get('circularity', 0))
                
                # Enhanced weighting for better discrimination
                combined_sim = (0.15 * vertex_sim + 
                               0.15 * aspect_sim + 
                               0.25 * pos_sim + 
                               0.2 * area_ratio + 
                               0.15 * solidity_sim +
                               0.1 * circ_sim)
                
                best_match = max(best_match, combined_sim)
            
            similarities.append(best_match)
        
        return np.mean(similarities) if similarities else 0.0
    
    def _compare_composition(self, comp1, comp2):
        """Enhanced composition comparison"""
        if not comp1 or not comp2:
            return 0.0
        
        similarities = []
        
        for region_key in comp1:
            if region_key in comp2:
                # Color similarity
                color1 = comp1[region_key]['mean_color']
                color2 = comp2[region_key]['mean_color']
                color_dist = np.linalg.norm(color1 - color2)
                color_sim = max(0, 1 - color_dist / 442)
                
                # Brightness similarity
                bright1 = comp1[region_key]['brightness']
                bright2 = comp2[region_key]['brightness']
                bright_sim = 1 - abs(bright1 - bright2) / 255
                
                # Texture similarity
                tex1 = comp1[region_key].get('texture', 0)
                tex2 = comp2[region_key].get('texture', 0)
                tex_sim = 1 - abs(tex1 - tex2) / (max(tex1, tex2) + 1e-7)
                
                region_sim = 0.4 * color_sim + 0.3 * bright_sim + 0.3 * tex_sim
                similarities.append(region_sim)
        
        return np.mean(similarities) if similarities else 0.0
    
    def _compare_visual_features(self, features1, features2):
        """Enhanced visual features comparison"""
        if not features1 or not features2:
            return 0.0
        
        similarities = []
        
        # Gray histogram similarity (robust to lighting)
        if 'gray_hist' in features1 and 'gray_hist' in features2:
            hist_sim = cv2.compareHist(features1['gray_hist'], features2['gray_hist'], cv2.HISTCMP_CORREL)
            similarities.append(max(0, hist_sim))
        
        # HSV histogram similarities (better for photos)
        for hist_type in ['hue_hist', 'sat_hist', 'val_hist']:
            if hist_type in features1 and hist_type in features2:
                hist_sim = cv2.compareHist(features1[hist_type], features2[hist_type], cv2.HISTCMP_CORREL)
                # Weight hue more heavily
                weight = 0.5 if hist_type == 'hue_hist' else 0.25
                similarities.append(max(0, hist_sim) * weight)
        
        # Edge density comparison
        if 'edge_densities' in features1 and 'edge_densities' in features2:
            edge1 = features1['edge_densities']
            edge2 = features2['edge_densities']
            edge_sim = 1 - np.mean(np.abs(edge1 - edge2))
            similarities.append(max(0, edge_sim))
        
        # Texture similarity
        if 'texture' in features1 and 'texture' in features2:
            tex1 = features1['texture']
            tex2 = features2['texture']
            if tex1 + tex2 > 0:
                tex_sim = 1 - abs(tex1 - tex2) / (tex1 + tex2)
                similarities.append(max(0, tex_sim))
        
        # Orientation histogram similarity
        if 'orientation_hist' in features1 and 'orientation_hist' in features2:
            orient_sim = np.dot(features1['orientation_hist'], features2['orientation_hist'])
            similarities.append(max(0, orient_sim))
        
        return np.mean(similarities) if similarities else 0.0
    
    def _compare_structural_patterns(self, struct1, struct2):
        """Compare structural patterns"""
        if not struct1 or not struct2:
            return 0.0
        
        similarities = []
        
        # Block pattern similarity
        if 'block_pattern' in struct1 and 'block_pattern' in struct2:
            bp1 = struct1['block_pattern']
            bp2 = struct2['block_pattern']
            if len(bp1) > 0 and len(bp2) > 0:
                # Resize to same length if needed
                min_len = min(len(bp1), len(bp2))
                bp1 = bp1[:min_len]
                bp2 = bp2[:min_len]
                # Normalize and compare
                bp1_norm = (bp1 - np.mean(bp1)) / (np.std(bp1) + 1e-7)
                bp2_norm = (bp2 - np.mean(bp2)) / (np.std(bp2) + 1e-7)
                block_sim = np.corrcoef(bp1_norm, bp2_norm)[0, 1]
                similarities.append(max(0, block_sim))
        
        # Projection similarities
        for proj_type in ['vertical_proj', 'horizontal_proj']:
            if proj_type in struct1 and proj_type in struct2:
                proj1 = struct1[proj_type]
                proj2 = struct2[proj_type]
                if len(proj1) > 0 and len(proj2) > 0:
                    # Normalize projections
                    proj1_norm = (proj1 - np.mean(proj1)) / (np.std(proj1) + 1e-7)
                    proj2_norm = (proj2 - np.mean(proj2)) / (np.std(proj2) + 1e-7)
                    proj_sim = np.corrcoef(proj1_norm, proj2_norm)[0, 1]
                    similarities.append(max(0, proj_sim))
        
        # Fourier descriptor similarity
        if 'fourier_desc' in struct1 and 'fourier_desc' in struct2:
            fd1 = struct1['fourier_desc']
            fd2 = struct2['fourier_desc']
            if len(fd1) > 0 and len(fd2) > 0:
                # Compare Fourier descriptors (shape-invariant)
                min_len = min(len(fd1), len(fd2))
                fd_sim = 1 - np.mean(np.abs(fd1[:min_len] - fd2[:min_len]))
                similarities.append(max(0, fd_sim))
        
        return np.mean(similarities) if similarities else 0.0
    
    def _compare_title_regions(self, title1, title2):
        """NEW: Compare title region features"""
        if not title1 or not title2:
            return 0.0
        
        similarities = []
        
        # Edge density similarity
        if 'edge_density' in title1 and 'edge_density' in title2:
            edge_sim = 1 - abs(title1['edge_density'] - title2['edge_density']) / 0.5
            similarities.append(max(0, edge_sim))
        
        # Contrast similarity
        if 'contrast' in title1 and 'contrast' in title2:
            contrast_sim = 1 - abs(title1['contrast'] - title2['contrast']) / (max(title1['contrast'], title2['contrast']) + 1e-7)
            similarities.append(max(0, contrast_sim))
        
        # Text energy similarity
        if 'text_energy' in title1 and 'text_energy' in title2:
            energy_ratio = min(title1['text_energy'], title2['text_energy']) / (max(title1['text_energy'], title2['text_energy']) + 1e-7)
            similarities.append(energy_ratio)
        
        return np.mean(similarities) if similarities else 0.0
    
    def calculate_overall_similarity(self, similarities):
        """Final optimized weights based on discriminative power"""
        # Dynamic weighting based on score distribution
        shape_score = similarities.get('shapes', 0)
        structure_score = similarities.get('structure', 0)
        text_score = similarities.get('text', 0)
        
        # Base weights
        weights = {
            'shapes': 0.40,      # Highest - best discriminator
            'structure': 0.25,   # Structural patterns
            'title': 0.10,       # Title region analysis
            'text': 0.10,        # Reduced - causing false positives
            'features': 0.10,    # Visual features
            'composition': 0.03, # Very low - too similar
            'color': 0.02        # Lowest - lighting issues
        }
        
        # Dynamic adjustment: if shapes score is very high (>0.9), boost its weight
        if shape_score > 0.9:
            weights['shapes'] = 0.45
            weights['text'] = 0.08  # Reduce text weight further
        
        # If structure score is good, it's likely a match
        if structure_score > 0.6:
            weights['structure'] = 0.30
        
        total_score = 0
        total_weight = 0
        
        for metric, score in similarities.items():
            if metric in weights:
                total_score += weights[metric] * score
                total_weight += weights[metric]
        
        # Consistency bonus
        high_scores = sum(1 for score in similarities.values() if score > 0.7)
        very_high_scores = sum(1 for score in similarities.values() if score > 0.85)
        
        if high_scores >= 3:
            total_score += 0.03
        if very_high_scores >= 2:
            total_score += 0.02
        
        # Penalty for low shape score when others are high (likely false positive)
        if shape_score < 0.5 and text_score > 0.8:
            total_score *= 0.9  # 10% penalty
        
        return total_score / total_weight if total_weight > 0 else 0
    
    def download_image(self, url, timeout=5):
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
    
    def find_matches(self, query_image_path, candidate_urls):
        """Main matching function"""
        print("🚀 Starting Optimized Comic Matching...")
        start_time = time.time()
        
        # Load and process query image
        query_image = cv2.imread(query_image_path)
        if query_image is None:
            raise ValueError(f"Could not load query image: {query_image_path}")
        
        print(f"📷 Loaded query image: {query_image.shape}")
        
        # Detect comic area
        query_image, was_cropped = self.detect_comic_area(query_image)
        
        # Extract elements from query
        print("🔬 Extracting optimized elements from query image...")
        query_elements = self.extract_key_elements(query_image)
        
        # Download cquery_image_pathandidate images
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
                    'status': 'failed_download'
                })
                continue
            
            # Extract elements from candidate
            candidate_elements = self.extract_key_elements(candidate_images[url])
            
            # Compare elements
            similarities = self.compare_elements(query_elements, candidate_elements)
            
            # Calculate overall similarity
            overall_similarity = self.calculate_overall_similarity(similarities)
            
            results.append({
                'url': url,
                'similarity': overall_similarity,
                'similarities': similarities,
                'status': 'success',
                'elements': candidate_elements
            })
        
        # Sort by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        print(f"✨ Matching completed in {time.time() - start_time:.2f}s")
        return results, query_elements
    
    def find_matches_img(self, query_image, candidate_urls):
        """Main matching function where query_image is a loaded image (e.g., NumPy array)"""
        print("🚀 Starting Optimized Comic Matching...")
        start_time = time.time()

        # Check if query_image is valid
        if query_image is None:
            raise ValueError("Query image data is None")

        print(f"📷 Received query image: {query_image.shape}")

        # Detect comic area
        query_image, was_cropped = self.detect_comic_area(query_image)

        # Extract elements from query
        print("🔬 Extracting optimized elements from query image...")
        query_elements = self.extract_key_elements(query_image)

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
                    'status': 'failed_download'
                })
                continue

            # Extract elements from candidate
            candidate_elements = self.extract_key_elements(candidate_images[url])

            # Compare elements
            similarities = self.compare_elements(query_elements, candidate_elements)

            # Calculate overall similarity
            overall_similarity = self.calculate_overall_similarity(similarities)

            results.append({
                'url': url,
                'similarity': overall_similarity,
                'similarities': similarities,
                'status': 'success',
                'elements': candidate_elements
            })

        # Sort by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)

        print(f"✨ Matching completed in {time.time() - start_time:.2f}s")
        return results, query_elements

    
    def visualize_results(self, query_image_path, results, query_elements, top_n=5):
        """Create visual comparison with proper display handling"""
        # Set matplotlib backend before importing pyplot
        import matplotlib
        matplotlib.use('TkAgg')  # Use TkAgg backend which is most compatible
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
        fig = plt.figure(figsize=(20, 14))
        gs = fig.add_gridspec(3, len(top_results) + 1, hspace=0.3, wspace=0.2)
        
        # Query image section
        ax_query = fig.add_subplot(gs[:2, 0])
        ax_query.imshow(query_rgb)
        ax_query.set_title("📷 Query Image\n(Your Photo)", fontsize=14, fontweight='bold')
        ax_query.axis('off')
        
        # Query analysis
        ax_query_info = fig.add_subplot(gs[2, 0])
        info_text = f"""🔍 DETECTED ELEMENTS:
🎨 Colors: {len(query_elements.get('colors', []))}
📝 Text Areas: {len(query_elements.get('text_areas', []))}
🔷 Shapes: {len(query_elements.get('shapes', []))}
📐 Composition: 9 regions
⚡ Features: Enhanced
🏗️ Structure: Pattern-based
🏷️ Title Region: Analyzed"""
        
        ax_query_info.text(0.05, 0.95, info_text, ha='left', va='top', fontsize=9,
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
                    if result['similarity'] > 0.75:
                        title_color = 'green'
                        emoji = '🏆'
                    elif result['similarity'] > 0.6:
                        title_color = 'orange'  
                        emoji = '🥈'
                    else:
                        title_color = 'red'
                        emoji = '🥉'
                    
                    ax_img.set_title(f"{emoji} RANK #{i}\nSimilarity: {result['similarity']:.3f}", 
                                   fontsize=12, fontweight='bold', color=title_color)
                    ax_img.axis('off')
                    
                    # Detailed metrics
                    ax_metrics = fig.add_subplot(gs[1, i])
                    sims = result['similarities']
                    
                    metrics_text = f"""📊 BREAKDOWN:
🔷 Shapes: {sims.get('shapes', 0):.3f}
🏗️ Structure: {sims.get('structure', 0):.3f}
🏷️ Title: {sims.get('title', 0):.3f}
📝 Text: {sims.get('text', 0):.3f}
⚡ Features: {sims.get('features', 0):.3f}
📐 Layout: {sims.get('composition', 0):.3f}
🎨 Color: {sims.get('color', 0):.3f}"""
                    
                    # Color-code metrics box
                    if result['similarity'] > 0.75:
                        bg_color = 'lightgreen'
                    elif result['similarity'] > 0.6:
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
                    
                    # Find best and worst metrics
                    best_metric = max(sims.items(), key=lambda x: x[1])
                    worst_metric = min(sims.items(), key=lambda x: x[1])
                    
                    url_text = f"""🔗 SOURCE:
{url_short}

✅ Best: {best_metric[0].title()} ({best_metric[1]:.3f})
⚠️ Worst: {worst_metric[0].title()} ({worst_metric[1]:.3f})"""
                    
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
        
        plt.suptitle("🎯 OPTIMIZED COMIC COVER MATCHING RESULTS", fontsize=16, fontweight='bold', y=0.98)
        plt.tight_layout()
        
        # Try to show the plot with proper error handling
        try:
            plt.ion()  # Turn on interactive mode for display
            plt.show(block=True)  # Block until window is closed
            print("📊 Visualization displayed successfully!")
        except Exception as e:
            print(f"⚠️ Display error: {e}")
            save_path = 'optimized_comic_matching_results.png'
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            print(f"📊 Visualization saved to: {save_path}")
        finally:
            plt.ioff()  # Turn off interactive mode
            plt.close('all')  # Close all figures
        
        # Print summary
        print("\n" + "="*60)
        print("🎯 OPTIMIZED MATCHING RESULTS")
        print("="*60)
        
        for i, result in enumerate(top_results[:3], 1):
            emoji = '🏆' if i == 1 else '🥈' if i == 2 else '🥉'
            print(f"\n{emoji} RANK #{i} - Similarity: {result['similarity']:.4f}")
            print(f"🔗 URL: {result['url']}")
            
            sims = result['similarities']
            print("📊 Breakdown:")
            for metric, score in sorted(sims.items(), key=lambda x: x[1], reverse=True):
                print(f"   {metric.title()}: {score:.3f}")
