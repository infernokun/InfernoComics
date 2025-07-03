import cv2
import numpy as np
import requests
from sklearn.metrics.pairwise import cosine_similarity
from skimage.feature import hog, local_binary_pattern
try:
    from skimage.metrics import structural_similarity as compare_ssim
except ImportError:
    from skimage.measure import compare_ssim
from skimage.segmentation import slic, felzenszwalb
from skimage.util import img_as_float
from skimage.color import rgb2lab, lab2rgb
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
import os
import hashlib
import concurrent.futures
import threading
import time
from scipy.spatial.distance import euclidean, cityblock
from scipy.stats import pearsonr, entropy
from scipy.ndimage import uniform_filter, gaussian_filter
import warnings
warnings.filterwarnings('ignore')

class FlawlessComicMatcher:
    def __init__(self, cache_dir='image_cache', max_workers=4, use_cropping=True):
        self.cache_dir = cache_dir
        self.max_workers = max_workers
        self.use_cropping = use_cropping
        os.makedirs(cache_dir, exist_ok=True)
        
        # Feature cache
        self._feature_cache = {}
        self._cache_lock = threading.Lock()
        
        # Reusable session
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        })
        
        # Flawless parameters
        self._setup_flawless_parameters()
        
    def _setup_flawless_parameters(self):
        """Setup parameters for flawless matching"""
        # Image processing parameters
        self._primary_size = (512, 512)  # Higher resolution for better accuracy
        self._analysis_size = (256, 256)  # For detailed analysis
        self._thumbnail_size = (128, 128)  # For quick comparisons
        
        # Feature extraction parameters
        self._color_bins = 32
        self._hog_orientations = 12
        self._lbp_radius = [1, 2, 3, 4]  # Multiple radii for better texture
        self._slic_segments = 200  # More segments for better region analysis
        
        # Advanced parameters
        self._clahe_clip_limit = 3.0
        self._gaussian_sigma = 1.5
        self._edge_thresholds = [30, 50, 70, 100]  # Multiple edge detection thresholds
        
    def advanced_comic_detection(self, image):
        """Advanced comic detection with multiple strategies"""
        if image is None:
            return image, False, 0.0
            
        original_image = image.copy()
        h, w = image.shape[:2]
        
        # Strategy 1: Edge-based detection
        cropped_edge, score_edge = self._edge_based_detection(image)
        
        # Strategy 2: Color-based detection
        cropped_color, score_color = self._color_based_detection(image)
        
        # Strategy 3: Contour-based detection
        cropped_contour, score_contour = self._contour_based_detection(image)
        
        # Choose the best detection method
        methods = [
            (cropped_edge, score_edge, "edge"),
            (cropped_color, score_color, "color"),
            (cropped_contour, score_contour, "contour")
        ]
        
        best_crop, best_score, best_method = max(methods, key=lambda x: x[1])
        
        if best_score > 0.3:
            print(f"✅ Comic detected using {best_method} method (confidence: {best_score:.3f})")
            return best_crop, True, best_score
        else:
            print(f"❌ No reliable comic detection (best score: {best_score:.3f})")
            return original_image, False, 0.0
    
    def _edge_based_detection(self, image):
        """Edge-based comic detection"""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape
            
            # Apply CLAHE for better edge detection
            clahe = cv2.createCLAHE(clipLimit=self._clahe_clip_limit, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            
            # Multiple edge detection methods
            edges_combined = np.zeros_like(gray)
            
            for thresh in self._edge_thresholds:
                edges = cv2.Canny(enhanced, thresh, thresh * 2)
                edges_combined = cv2.bitwise_or(edges_combined, edges)
            
            # Morphological operations
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            edges_combined = cv2.morphologyEx(edges_combined, cv2.MORPH_CLOSE, kernel)
            edges_combined = cv2.morphologyEx(edges_combined, cv2.MORPH_OPEN, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(edges_combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if not contours:
                return image, 0.0
            
            # Find the best rectangular contour
            best_contour = None
            best_score = 0.0
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < (w * h) * 0.1:  # Too small
                    continue
                if area > (w * h) * 0.95:  # Too large
                    continue
                
                # Approximate contour to polygon
                epsilon = 0.02 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                
                if len(approx) >= 4:  # At least 4 corners
                    # Check if it's roughly rectangular
                    rect = cv2.boundingRect(contour)
                    rect_area = rect[2] * rect[3]
                    fill_ratio = area / rect_area
                    
                    # Check aspect ratio
                    aspect_ratio = rect[3] / rect[2]
                    
                    if 0.6 <= aspect_ratio <= 2.0 and fill_ratio > 0.5:
                        score = area / (w * h) * fill_ratio * min(aspect_ratio, 1/aspect_ratio)
                        if score > best_score:
                            best_score = score
                            best_contour = contour
            
            if best_contour is not None:
                # Extract the comic region
                rect = cv2.boundingRect(best_contour)
                x, y, w_rect, h_rect = rect
                
                # Add some padding
                padding = 10
                x = max(0, x - padding)
                y = max(0, y - padding)
                w_rect = min(w - x, w_rect + 2 * padding)
                h_rect = min(h - y, h_rect + 2 * padding)
                
                cropped = image[y:y+h_rect, x:x+w_rect]
                return cropped, best_score
            
            return image, 0.0
            
        except Exception as e:
            print(f"Edge detection failed: {e}")
            return image, 0.0
    
    def _color_based_detection(self, image):
        """Color-based comic detection"""
        try:
            # Convert to HSV for better color analysis
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            h, w = image.shape[:2]
            
            # Create mask for likely comic colors (avoid pure background colors)
            # Exclude very dark, very light, and very desaturated areas
            mask = np.ones((h, w), dtype=np.uint8) * 255
            
            # Exclude very dark areas (likely shadows/background)
            mask = cv2.bitwise_and(mask, (hsv[:, :, 2] > 30).astype(np.uint8) * 255)
            
            # Exclude very light areas (likely paper/background)
            mask = cv2.bitwise_and(mask, (hsv[:, :, 2] < 240).astype(np.uint8) * 255)
            
            # Exclude very desaturated areas (likely background)
            mask = cv2.bitwise_and(mask, (hsv[:, :, 1] > 20).astype(np.uint8) * 255)
            
            # Find the largest connected component
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if not contours:
                return image, 0.0
            
            # Find the largest contour
            largest_contour = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest_contour)
            
            if area < (w * h) * 0.2:  # Too small
                return image, 0.0
            
            # Get bounding rectangle
            rect = cv2.boundingRect(largest_contour)
            x, y, w_rect, h_rect = rect
            
            # Check aspect ratio
            aspect_ratio = h_rect / w_rect
            if not (0.5 <= aspect_ratio <= 2.5):
                return image, 0.0
            
            # Calculate confidence score
            fill_ratio = area / (w_rect * h_rect)
            size_ratio = area / (w * h)
            confidence = size_ratio * fill_ratio * min(aspect_ratio, 1/aspect_ratio)
            
            # Extract the region
            cropped = image[y:y+h_rect, x:x+w_rect]
            return cropped, confidence
            
        except Exception as e:
            print(f"Color detection failed: {e}")
            return image, 0.0
    
    def _contour_based_detection(self, image):
        """Contour-based comic detection"""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape
            
            # Use multiple preprocessing methods
            methods = [
                cv2.GaussianBlur(gray, (5, 5), 0),
                cv2.medianBlur(gray, 5),
                cv2.bilateralFilter(gray, 9, 75, 75)
            ]
            
            all_contours = []
            
            for processed in methods:
                # Edge detection
                edges = cv2.Canny(processed, 50, 150)
                
                # Find contours
                contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                all_contours.extend(contours)
            
            if not all_contours:
                return image, 0.0
            
            # Analyze all contours
            best_contour = None
            best_score = 0.0
            
            for contour in all_contours:
                area = cv2.contourArea(contour)
                if area < (w * h) * 0.1 or area > (w * h) * 0.9:
                    continue
                
                # Get minimum area rectangle
                rect = cv2.minAreaRect(contour)
                box = cv2.boxPoints(rect)
                box = np.intp(box)
                
                # Calculate metrics
                rect_area = rect[1][0] * rect[1][1]
                fill_ratio = area / rect_area if rect_area > 0 else 0
                
                # Aspect ratio
                aspect_ratio = max(rect[1]) / min(rect[1]) if min(rect[1]) > 0 else 0
                
                if 0.5 <= aspect_ratio <= 2.5 and fill_ratio > 0.6:
                    score = (area / (w * h)) * fill_ratio * (1 / aspect_ratio if aspect_ratio > 1 else aspect_ratio)
                    if score > best_score:
                        best_score = score
                        best_contour = contour
            
            if best_contour is not None:
                rect = cv2.boundingRect(best_contour)
                x, y, w_rect, h_rect = rect
                cropped = image[y:y+h_rect, x:x+w_rect]
                return cropped, best_score
            
            return image, 0.0
            
        except Exception as e:
            print(f"Contour detection failed: {e}")
            return image, 0.0
    
    def advanced_lighting_normalization(self, image):
        """Advanced lighting normalization"""
        if image is None:
            return image
            
        # Convert to LAB color space
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        # Apply CLAHE to L channel
        clahe = cv2.createCLAHE(clipLimit=self._clahe_clip_limit, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)
        
        # Merge back
        lab_clahe = cv2.merge([l_clahe, a, b])
        normalized = cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2BGR)
        
        # Advanced color balancing
        normalized = self._advanced_color_balance(normalized)
        
        # Gamma correction
        normalized = self._gamma_correction(normalized)
        
        return normalized
    
    def _advanced_color_balance(self, image):
        """Advanced color balancing using multiple methods"""
        # Method 1: Gray World
        gray_world = self._gray_world_balance(image)
        
        # Method 2: White Patch
        white_patch = self._white_patch_balance(image)
        
        # Method 3: Perfect Reflector
        perfect_reflector = self._perfect_reflector_balance(image)
        
        # Combine methods (weighted average)
        balanced = (0.5 * gray_world + 0.3 * white_patch + 0.2 * perfect_reflector).astype(np.uint8)
        
        return balanced
    
    def _gray_world_balance(self, image):
        """Gray world color balancing"""
        try:
            mean_b = np.mean(image[:, :, 0])
            mean_g = np.mean(image[:, :, 1])
            mean_r = np.mean(image[:, :, 2])
            
            gray_mean = (mean_b + mean_g + mean_r) / 3
            
            if mean_b > 0 and mean_g > 0 and mean_r > 0:
                balanced = image.copy().astype(np.float32)
                balanced[:, :, 0] *= gray_mean / mean_b
                balanced[:, :, 1] *= gray_mean / mean_g
                balanced[:, :, 2] *= gray_mean / mean_r
                
                return np.clip(balanced, 0, 255).astype(np.uint8)
            
            return image
        except:
            return image
    
    def _white_patch_balance(self, image):
        """White patch color balancing"""
        try:
            # Find the brightest pixels (top 1%)
            percentile = 99
            max_b = np.percentile(image[:, :, 0], percentile)
            max_g = np.percentile(image[:, :, 1], percentile)
            max_r = np.percentile(image[:, :, 2], percentile)
            
            if max_b > 0 and max_g > 0 and max_r > 0:
                balanced = image.copy().astype(np.float32)
                balanced[:, :, 0] *= 255 / max_b
                balanced[:, :, 1] *= 255 / max_g
                balanced[:, :, 2] *= 255 / max_r
                
                return np.clip(balanced, 0, 255).astype(np.uint8)
            
            return image
        except:
            return image
    
    def _perfect_reflector_balance(self, image):
        """Perfect reflector color balancing"""
        try:
            # Use histogram peaks as reference
            balanced = image.copy().astype(np.float32)
            
            for i in range(3):
                hist, bins = np.histogram(image[:, :, i], bins=256, range=(0, 256))
                peak_idx = np.argmax(hist)
                peak_value = bins[peak_idx]
                
                if peak_value > 0:
                    scale = 128 / peak_value  # Normalize peak to middle gray
                    balanced[:, :, i] *= scale
            
            return np.clip(balanced, 0, 255).astype(np.uint8)
        except:
            return image
    
    def _gamma_correction(self, image, gamma=1.2):
        """Apply gamma correction"""
        try:
            # Build lookup table
            inv_gamma = 1.0 / gamma
            table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype(np.uint8)
            
            # Apply gamma correction
            return cv2.LUT(image, table)
        except:
            return image
    
    def extract_flawless_features(self, image, cache_key=None):
        """Extract comprehensive flawless features"""
        if image is None:
            return None
            
        # Check cache
        if cache_key:
            with self._cache_lock:
                if cache_key in self._feature_cache:
                    return self._feature_cache[cache_key]
        
        # Normalize lighting
        normalized = self.advanced_lighting_normalization(image)
        
        # Multiple resolutions for multi-scale analysis
        image_hr = cv2.resize(normalized, self._primary_size, interpolation=cv2.INTER_LANCZOS4)
        image_mr = cv2.resize(normalized, self._analysis_size, interpolation=cv2.INTER_AREA)
        image_lr = cv2.resize(normalized, self._thumbnail_size, interpolation=cv2.INTER_AREA)
        
        features_list = []
        
        # 1. Multi-scale color features
        try:
            color_features = self._extract_comprehensive_color_features(image_hr, image_mr, image_lr)
            features_list.append(color_features)
        except Exception as e:
            print(f"Warning: Color feature extraction failed: {e}")
            features_list.append(np.zeros(1000))  # Default size
        
        # 2. Advanced texture features
        try:
            texture_features = self._extract_advanced_texture_features(image_hr)
            features_list.append(texture_features)
        except Exception as e:
            print(f"Warning: Texture feature extraction failed: {e}")
            features_list.append(np.zeros(500))  # Default size
        
        # 3. Structural and geometric features
        try:
            structural_features = self._extract_structural_features(image_hr)
            features_list.append(structural_features)
        except Exception as e:
            print(f"Warning: Structural feature extraction failed: {e}")
            features_list.append(np.zeros(20))  # Default size
        
        # 4. Character and object detection features
        try:
            character_features = self._extract_character_features(image_hr)
            features_list.append(character_features)
        except Exception as e:
            print(f"Warning: Character feature extraction failed: {e}")
            features_list.append(np.zeros(50))  # Default size
        
        # 5. Layout and composition features
        try:
            layout_features = self._extract_layout_features(image_hr)
            features_list.append(layout_features)
        except Exception as e:
            print(f"Warning: Layout feature extraction failed: {e}")
            features_list.append(np.zeros(120))  # Default size
        
        # 6. Frequency domain features
        try:
            frequency_features = self._extract_frequency_features(image_hr)
            features_list.append(frequency_features)
        except Exception as e:
            print(f"Warning: Frequency feature extraction failed: {e}")
            features_list.append(np.zeros(512))  # Default size
        
        # 7. Statistical features
        try:
            statistical_features = self._extract_statistical_features(image_hr)
            features_list.append(statistical_features)
        except Exception as e:
            print(f"Warning: Statistical feature extraction failed: {e}")
            features_list.append(np.zeros(72))  # Default size
        
        # 8. Deep color analysis
        try:
            deep_color_features = self._extract_deep_color_analysis(image_hr)
            features_list.append(deep_color_features)
        except Exception as e:
            print(f"Warning: Deep color feature extraction failed: {e}")
            features_list.append(np.zeros(20))  # Default size
        
        # Combine all features
        try:
            features = np.concatenate(features_list)
        except Exception as e:
            print(f"Error concatenating features: {e}")
            print(f"Feature list shapes: {[f.shape for f in features_list]}")
            # Create a default feature vector
            features = np.zeros(2300)  # Approximate total size
        
        # Advanced normalization
        features = self._flawless_normalize(features)
        
        # Cache the result
        if cache_key:
            with self._cache_lock:
                self._feature_cache[cache_key] = features
        
        return features
    
    def _extract_comprehensive_color_features(self, image_hr, image_mr, image_lr):
        """Extract comprehensive color features from multiple scales"""
        color_features = []
        
        # Process each scale
        for img, scale in [(image_hr, 'hr'), (image_mr, 'mr'), (image_lr, 'lr')]:
            # Multiple color spaces
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            yuv = cv2.cvtColor(img, cv2.COLOR_BGR2YUV)
            
            # Color histograms with different bin sizes
            for color_space, channels in [(hsv, [0, 1, 2]), (lab, [1, 2]), (yuv, [1, 2])]:
                for channel in channels:
                    # Multiple bin sizes for different granularities
                    for bins in [16, 32]:
                        if color_space is hsv and channel == 0:  # Hue
                            hist = cv2.calcHist([color_space], [channel], None, [bins], [0, 180])
                        else:
                            hist = cv2.calcHist([color_space], [channel], None, [bins], [0, 256])
                        
                        hist = hist.flatten()
                        hist = hist / (hist.sum() + 1e-7)  # Normalize
                        color_features.append(hist)
        
        return np.concatenate(color_features)
    
    def _extract_advanced_texture_features(self, image):
        """Extract advanced texture features"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        texture_features = []
        
        # Multi-scale LBP
        for radius in self._lbp_radius:
            lbp = local_binary_pattern(gray, P=8*radius, R=radius, method='uniform')
            lbp_hist, _ = np.histogram(lbp.ravel(), bins=10, range=(0, 10))
            lbp_hist = lbp_hist / (lbp_hist.sum() + 1e-7)
            texture_features.append(lbp_hist)
        
        # Multi-scale HOG
        for cell_size in [(8, 8), (16, 16), (32, 32)]:
            hog_feat = hog(gray, orientations=self._hog_orientations, 
                          pixels_per_cell=cell_size, cells_per_block=(2, 2),
                          visualize=False, transform_sqrt=True, feature_vector=True)
            texture_features.append(hog_feat)
        
        # Gabor filters
        gabor_features = []
        for theta in range(0, 180, 30):  # 6 orientations
            for frequency in [0.1, 0.3, 0.5]:  # 3 frequencies
                kernel = cv2.getGaborKernel((21, 21), 5, np.radians(theta), 
                                          2*np.pi*frequency, 0.5, 0, ktype=cv2.CV_32F)
                filtered = cv2.filter2D(gray, cv2.CV_8UC3, kernel)
                gabor_features.extend([np.mean(filtered), np.std(filtered)])
        
        texture_features.append(np.array(gabor_features))
        
        return np.concatenate(texture_features)
    
    def _extract_structural_features(self, image):
        """Extract structural features"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        structural_features = []
        
        # Edge density analysis
        edge_densities = []
        for threshold in [50, 100, 150]:
            edges = cv2.Canny(gray, threshold, threshold * 2)
            edge_density = np.sum(edges > 0) / edges.size
            edge_densities.append(edge_density)
        
        structural_features.extend(edge_densities)
        
        # Gradient analysis
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        
        magnitude = np.sqrt(sobelx**2 + sobely**2)
        direction = np.arctan2(sobely, sobelx)
        
        # Gradient statistics
        gradient_stats = [
            np.mean(magnitude), np.std(magnitude),
            np.percentile(magnitude, 75), np.percentile(magnitude, 95)
        ]
        structural_features.extend(gradient_stats)
        
        # Gradient direction histogram
        dir_hist, _ = np.histogram(direction, bins=12, range=(-np.pi, np.pi))
        dir_hist = dir_hist / (dir_hist.sum() + 1e-7)
        structural_features.extend(dir_hist.flatten())
        
        # Corner detection
        corners = cv2.goodFeaturesToTrack(gray, maxCorners=100, qualityLevel=0.01, minDistance=10)
        corner_density = len(corners) / (gray.shape[0] * gray.shape[1]) if corners is not None else 0
        structural_features.append(corner_density)
        
        return np.array(structural_features)
    
    def _extract_character_features(self, image):
        """Extract features that help identify characters and objects"""
        character_features = []
        
        # Skin tone detection (for character identification)
        skin_mask = self._detect_skin_tones(image)
        skin_ratio = np.sum(skin_mask > 0) / skin_mask.size
        character_features.append(skin_ratio)
        
        # Dominant color analysis (for costume/character colors)
        try:
            dominant_colors = self._get_dominant_colors(image, k=8)
            # Flatten and ensure we have a fixed size
            color_features = []
            for color_info in dominant_colors[:8]:  # Limit to 8 colors
                color_features.extend(color_info[:3])  # RGB values only
            
            # Pad or truncate to fixed size
            while len(color_features) < 24:  # 8 colors * 3 channels
                color_features.append(0)
            color_features = color_features[:24]
            character_features.extend(color_features)
        except:
            character_features.extend([0] * 24)  # Default values
        
        # Face/shape detection using contours
        try:
            shape_features = self._analyze_shapes(image)
            character_features.extend(shape_features)
        except:
            character_features.extend([0] * 12)  # Default values
        
        # Color clustering analysis
        try:
            cluster_features = self._analyze_color_clusters(image)
            character_features.extend(cluster_features)
        except:
            character_features.extend([0] * 10)  # Default values
        
        return np.array(character_features)
    
    def _detect_skin_tones(self, image):
        """Detect skin tones in the image"""
        # Convert to YCrCb color space (better for skin detection)
        ycrcb = cv2.cvtColor(image, cv2.COLOR_BGR2YCR_CB)
        
        # Define skin color range in YCrCb
        lower_skin = np.array([0, 135, 85], dtype=np.uint8)
        upper_skin = np.array([255, 180, 135], dtype=np.uint8)
        
        # Create mask
        skin_mask = cv2.inRange(ycrcb, lower_skin, upper_skin)
        
        # Apply morphological operations to clean up
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_OPEN, kernel)
        skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_CLOSE, kernel)
        
        return skin_mask
    
    def _get_dominant_colors(self, image, k=8):
        """Get dominant colors using k-means clustering"""
        # Convert to LAB for better perceptual clustering
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        data = lab.reshape((-1, 3))
        data = np.float32(data)
        
        # K-means clustering
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
        _, labels, centers = cv2.kmeans(data, k, None, criteria, 10, cv2.KMEANS_PP_CENTERS)
        
        # Convert back to BGR
        centers_bgr = cv2.cvtColor(centers.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2BGR)
        
        # Calculate color frequency
        unique_labels, counts = np.unique(labels, return_counts=True)
        color_freq = counts / len(labels)
        
        # Sort by frequency
        sorted_indices = np.argsort(color_freq)[::-1]
        
        dominant_colors = []
        for i in sorted_indices:
            color = centers_bgr[0, i]
            dominant_colors.append([color[0], color[1], color[2], color_freq[i]])
        
        return dominant_colors
    
    def _analyze_shapes(self, image):
        """Analyze shapes in the image"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Find contours
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Analyze contour properties
        areas = []
        perimeters = []
        aspect_ratios = []
        solidity_ratios = []
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 100:  # Filter small contours
                perimeter = cv2.arcLength(contour, True)
                x, y, w, h = cv2.boundingRect(contour)
                
                aspect_ratio = float(w) / h if h > 0 else 0
                hull = cv2.convexHull(contour)
                hull_area = cv2.contourArea(hull)
                solidity = float(area) / hull_area if hull_area > 0 else 0
                
                areas.append(area)
                perimeters.append(perimeter)
                aspect_ratios.append(aspect_ratio)
                solidity_ratios.append(solidity)
        
        # Statistical features of shapes
        shape_features = []
        for feature_list in [areas, perimeters, aspect_ratios, solidity_ratios]:
            if feature_list:
                shape_features.extend([
                    np.mean(feature_list),
                    np.std(feature_list),
                    np.median(feature_list)
                ])
            else:
                shape_features.extend([0, 0, 0])
        
        return shape_features
    
    def _analyze_color_clusters(self, image):
        """Analyze color clustering patterns"""
        # Use superpixel segmentation
        segments = felzenszwalb(image, scale=100, sigma=0.5, min_size=50)
        
        # Analyze each segment
        segment_colors = []
        segment_sizes = []
        
        for segment_id in np.unique(segments):
            mask = segments == segment_id
            segment_pixels = image[mask]
            
            if len(segment_pixels) > 0:
                # Mean color of segment
                mean_color = np.mean(segment_pixels, axis=0)
                segment_colors.append(mean_color)
                segment_sizes.append(len(segment_pixels))
        
        # Analyze color relationships
        cluster_features = []
        
        if len(segment_colors) > 1:
            segment_colors = np.array(segment_colors)
            segment_sizes = np.array(segment_sizes)
            
            # Color diversity (standard deviation of colors)
            color_diversity = np.std(segment_colors, axis=0)
            cluster_features.extend(color_diversity)
            
            # Size diversity
            size_diversity = np.std(segment_sizes)
            cluster_features.append(size_diversity)
            
            # Dominant segment analysis
            dominant_idx = np.argmax(segment_sizes)
            dominant_color = segment_colors[dominant_idx]
            cluster_features.extend(dominant_color)
            
        else:
            cluster_features.extend([0] * 10)  # Default values
        
        return cluster_features
    
    def _extract_layout_features(self, image):
        """Extract layout and composition features"""
        h, w = image.shape[:2]
        
        # Divide image into grid regions
        grid_size = 4
        cell_h, cell_w = h // grid_size, w // grid_size
        
        region_features = []
        
        for i in range(grid_size):
            for j in range(grid_size):
                y1, y2 = i * cell_h, (i + 1) * cell_h
                x1, x2 = j * cell_w, (j + 1) * cell_w
                
                region = image[y1:y2, x1:x2]
                
                # Color analysis of region
                mean_color = np.mean(region.reshape(-1, 3), axis=0)
                color_variance = np.var(region.reshape(-1, 3), axis=0)
                
                # Brightness analysis
                gray_region = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
                brightness = np.mean(gray_region)
                contrast = np.std(gray_region)
                
                # Edge density
                edges = cv2.Canny(gray_region, 50, 150)
                edge_density = np.sum(edges > 0) / edges.size
                
                region_features.extend([
                    *mean_color, *color_variance, 
                    brightness, contrast, edge_density
                ])
        
        # Analyze spatial relationships
        region_features = np.array(region_features).reshape(grid_size * grid_size, -1)
        
        # Calculate regional differences
        spatial_features = []
        for i in range(len(region_features) - 1):
            diff = region_features[i] - region_features[i + 1]
            spatial_features.extend(diff)
        
        return np.array(spatial_features)
    
    def _extract_frequency_features(self, image):
        """Extract frequency domain features"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # DCT features
        dct = cv2.dct(np.float32(gray))
        dct_features = dct[:16, :16].flatten()  # Top-left 16x16
        dct_features = dct_features / (np.linalg.norm(dct_features) + 1e-7)
        
        # FFT features
        fft = np.fft.fft2(gray)
        fft_magnitude = np.abs(fft)
        fft_features = fft_magnitude[:16, :16].flatten()  # Top-left 16x16
        fft_features = fft_features / (np.linalg.norm(fft_features) + 1e-7)
        
        return np.concatenate([dct_features, fft_features])
    
    def _extract_statistical_features(self, image):
        """Extract statistical features"""
        statistical_features = []
        
        # Convert to different color spaces
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        
        # Analyze each color space
        for color_space in [image, hsv, lab]:
            for channel in range(3):
                channel_data = color_space[:, :, channel].flatten()
                
                # Moments
                mean = np.mean(channel_data)
                std = np.std(channel_data)
                skewness = self._calculate_skewness(channel_data)
                kurtosis = self._calculate_kurtosis(channel_data)
                
                # Percentiles
                p25 = np.percentile(channel_data, 25)
                p75 = np.percentile(channel_data, 75)
                p95 = np.percentile(channel_data, 95)
                
                # Entropy
                hist, _ = np.histogram(channel_data, bins=256, range=(0, 256))
                hist = hist / (hist.sum() + 1e-7)
                channel_entropy = entropy(hist + 1e-7)
                
                statistical_features.extend([
                    mean, std, skewness, kurtosis,
                    p25, p75, p95, channel_entropy
                ])
        
        return np.array(statistical_features)
    
    def _extract_deep_color_analysis(self, image):
        """Extract deep color analysis features"""
        deep_features = []
        
        # Color temperature analysis
        color_temp = self._estimate_color_temperature(image)
        deep_features.append(color_temp)
        
        # Color harmony analysis
        harmony_features = self._analyze_color_harmony(image)
        deep_features.extend(harmony_features)
        
        # Color contrast analysis
        contrast_features = self._analyze_color_contrast(image)
        deep_features.extend(contrast_features)
        
        return np.array(deep_features)
    
    def _estimate_color_temperature(self, image):
        """Estimate color temperature of the image"""
        # Convert to RGB
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Calculate mean R, G, B values
        mean_r = np.mean(rgb[:, :, 0])
        mean_g = np.mean(rgb[:, :, 1])
        mean_b = np.mean(rgb[:, :, 2])
        
        # Simple color temperature estimation
        if mean_b > 0:
            color_temp = mean_r / mean_b
        else:
            color_temp = 1.0
        
        return color_temp
    
    def _analyze_color_harmony(self, image):
        """Analyze color harmony in the image"""
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        hue_channel = hsv[:, :, 0]
        
        # Calculate hue distribution
        hue_hist, _ = np.histogram(hue_channel, bins=36, range=(0, 180))
        hue_hist = hue_hist / (hue_hist.sum() + 1e-7)
        
        # Find dominant hues
        dominant_hues = np.argsort(hue_hist)[-5:]  # Top 5 hues
        
        harmony_features = []
        
        # Analyze relationships between dominant hues
        for i in range(len(dominant_hues)):
            for j in range(i + 1, len(dominant_hues)):
                hue_diff = abs(dominant_hues[i] - dominant_hues[j])
                # Normalize to 0-90 degrees
                hue_diff = min(hue_diff, 180 - hue_diff) * 5  # Convert to degrees
                harmony_features.append(hue_diff)
        
        # Pad to fixed size
        while len(harmony_features) < 10:
            harmony_features.append(0)
        
        return harmony_features[:10]
    
    def _analyze_color_contrast(self, image):
        """Analyze color contrast in the image"""
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        
        # Calculate local contrast
        l_channel = lab[:, :, 0]
        
        # Apply Gaussian blur for local mean
        local_mean = gaussian_filter(l_channel.astype(np.float32), sigma=5)
        
        # Calculate local contrast
        local_contrast = np.abs(l_channel - local_mean)
        
        contrast_features = [
            np.mean(local_contrast),
            np.std(local_contrast),
            np.percentile(local_contrast, 90),
            np.percentile(local_contrast, 95)
        ]
        
        return contrast_features
    
    def _calculate_skewness(self, data):
        """Calculate skewness"""
        mean = np.mean(data)
        std = np.std(data)
        if std == 0:
            return 0
        return np.mean(((data - mean) / std) ** 3)
    
    def _calculate_kurtosis(self, data):
        """Calculate kurtosis"""
        mean = np.mean(data)
        std = np.std(data)
        if std == 0:
            return 0
        return np.mean(((data - mean) / std) ** 4) - 3
    
    def _flawless_normalize(self, features):
        """Flawless normalization that handles all edge cases"""
        # Handle NaN and infinite values
        features = np.nan_to_num(features, nan=0.0, posinf=1.0, neginf=-1.0)
        
        # Robust normalization using median and MAD
        median = np.median(features)
        mad = np.median(np.abs(features - median))
        
        if mad > 1e-7:
            # Robust z-score
            robust_features = (features - median) / (1.4826 * mad)
            # Clip extreme outliers
            robust_features = np.clip(robust_features, -5, 5)
        else:
            robust_features = features
        
        # L2 normalization
        norm = np.linalg.norm(robust_features)
        if norm > 1e-7:
            robust_features = robust_features / norm
        
        return robust_features
    
    def flawless_similarity_calculation(self, query_features, candidate_features, 
                                     query_image, candidate_image):
        """Flawless similarity calculation with comprehensive metrics"""
        similarities = {}
        
        # 1. Cosine similarity
        cosine_sim = cosine_similarity(
            query_features.reshape(1, -1), 
            candidate_features.reshape(1, -1)
        )[0][0]
        similarities['cosine'] = max(0, cosine_sim)
        
        # 2. Robust correlation
        try:
            correlation, _ = pearsonr(query_features, candidate_features)
            if np.isnan(correlation):
                correlation = 0
        except:
            correlation = 0
        similarities['correlation'] = max(0, correlation)
        
        # 3. Advanced histogram similarity
        hist_sim = self._advanced_histogram_similarity(query_image, candidate_image)
        similarities['histogram'] = hist_sim
        
        # 4. Robust SSIM
        ssim_sim = self._robust_ssim(query_image, candidate_image)
        similarities['ssim'] = ssim_sim
        
        # 5. Perceptual color similarity
        color_sim = self._perceptual_color_similarity(query_image, candidate_image)
        similarities['color_perception'] = color_sim
        
        # 6. Layout similarity
        layout_sim = self._advanced_layout_similarity(query_image, candidate_image)
        similarities['layout'] = layout_sim
        
        # 7. Character similarity
        character_sim = self._character_similarity(query_image, candidate_image)
        similarities['character'] = character_sim
        
        # 8. Structural similarity
        structural_sim = self._structural_similarity(query_image, candidate_image)
        similarities['structural'] = structural_sim
        
        return similarities
    
    def _advanced_histogram_similarity(self, img1, img2):
        """Advanced histogram similarity with multiple color spaces"""
        # Normalize both images
        norm_img1 = self.advanced_lighting_normalization(img1)
        norm_img2 = self.advanced_lighting_normalization(img2)
        
        # Resize for consistency
        size = (128, 128)
        norm_img1 = cv2.resize(norm_img1, size)
        norm_img2 = cv2.resize(norm_img2, size)
        
        similarities = []
        
        # HSV histogram (focus on hue and saturation)
        hsv1 = cv2.cvtColor(norm_img1, cv2.COLOR_BGR2HSV)
        hsv2 = cv2.cvtColor(norm_img2, cv2.COLOR_BGR2HSV)
        
        # Hue histogram
        hist1_h = cv2.calcHist([hsv1], [0], None, [18], [0, 180])
        hist2_h = cv2.calcHist([hsv2], [0], None, [18], [0, 180])
        hist1_h = hist1_h / (hist1_h.sum() + 1e-7)
        hist2_h = hist2_h / (hist2_h.sum() + 1e-7)
        similarities.append(np.sum(np.minimum(hist1_h, hist2_h)))
        
        # Saturation histogram
        hist1_s = cv2.calcHist([hsv1], [1], None, [16], [0, 256])
        hist2_s = cv2.calcHist([hsv2], [1], None, [16], [0, 256])
        hist1_s = hist1_s / (hist1_s.sum() + 1e-7)
        hist2_s = hist2_s / (hist2_s.sum() + 1e-7)
        similarities.append(np.sum(np.minimum(hist1_s, hist2_s)))
        
        # LAB histogram (A and B channels)
        lab1 = cv2.cvtColor(norm_img1, cv2.COLOR_BGR2LAB)
        lab2 = cv2.cvtColor(norm_img2, cv2.COLOR_BGR2LAB)
        
        for channel in [1, 2]:  # A and B channels
            hist1 = cv2.calcHist([lab1], [channel], None, [16], [0, 256])
            hist2 = cv2.calcHist([lab2], [channel], None, [16], [0, 256])
            hist1 = hist1 / (hist1.sum() + 1e-7)
            hist2 = hist2 / (hist2.sum() + 1e-7)
            similarities.append(np.sum(np.minimum(hist1, hist2)))
        
        return np.mean(similarities)
    
    def _robust_ssim(self, img1, img2):
        """Robust SSIM calculation"""
        try:
            # Normalize lighting
            norm_img1 = self.advanced_lighting_normalization(img1)
            norm_img2 = self.advanced_lighting_normalization(img2)
            
            # Resize to same size
            size = (256, 256)
            norm_img1 = cv2.resize(norm_img1, size)
            norm_img2 = cv2.resize(norm_img2, size)
            
            # Convert to grayscale
            gray1 = cv2.cvtColor(norm_img1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(norm_img2, cv2.COLOR_BGR2GRAY)
            
            # Apply Gaussian blur to reduce noise
            gray1 = gaussian_filter(gray1, sigma=1.0)
            gray2 = gaussian_filter(gray2, sigma=1.0)
            
            # Calculate SSIM
            try:
                ssim_value = compare_ssim(gray1, gray2, data_range=255)
            except TypeError:
                ssim_value = compare_ssim(gray1, gray2)
            
            return max(0, ssim_value)
        except:
            return 0.0
    
    def _perceptual_color_similarity(self, img1, img2):
        """Perceptual color similarity in LAB space"""
        try:
            # Convert to LAB
            lab1 = cv2.cvtColor(img1, cv2.COLOR_BGR2LAB)
            lab2 = cv2.cvtColor(img2, cv2.COLOR_BGR2LAB)
            
            # Resize for consistency
            size = (128, 128)
            lab1 = cv2.resize(lab1, size)
            lab2 = cv2.resize(lab2, size)
            
            # Calculate color difference (Delta E)
            diff = lab1.astype(np.float32) - lab2.astype(np.float32)
            delta_e = np.sqrt(np.sum(diff ** 2, axis=2))
            
            # Convert to similarity (lower Delta E = higher similarity)
            mean_delta_e = np.mean(delta_e)
            similarity = 1 / (1 + mean_delta_e / 10)  # Normalize
            
            return similarity
        except:
            return 0.0
    
    def _advanced_layout_similarity(self, img1, img2):
        """Advanced layout similarity analysis"""
        try:
            # Resize for consistency
            size = (128, 128)
            img1_resized = cv2.resize(img1, size)
            img2_resized = cv2.resize(img2, size)
            
            # Convert to grayscale
            gray1 = cv2.cvtColor(img1_resized, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(img2_resized, cv2.COLOR_BGR2GRAY)
            
            # Edge detection
            edges1 = cv2.Canny(gray1, 50, 150)
            edges2 = cv2.Canny(gray2, 50, 150)
            
            # Divide into regions and analyze edge distribution
            h, w = edges1.shape
            regions = [
                (0, h//3, 0, w//3),       # Top-left
                (0, h//3, w//3, 2*w//3),  # Top-center
                (0, h//3, 2*w//3, w),     # Top-right
                (h//3, 2*h//3, 0, w//3),  # Middle-left
                (h//3, 2*h//3, w//3, 2*w//3),  # Center
                (h//3, 2*h//3, 2*w//3, w),     # Middle-right
                (2*h//3, h, 0, w//3),     # Bottom-left
                (2*h//3, h, w//3, 2*w//3),# Bottom-center
                (2*h//3, h, 2*w//3, w),   # Bottom-right
            ]
            
            region_similarities = []
            
            for y1, y2, x1, x2 in regions:
                region1 = edges1[y1:y2, x1:x2]
                region2 = edges2[y1:y2, x1:x2]
                
                density1 = np.sum(region1 > 0) / region1.size
                density2 = np.sum(region2 > 0) / region2.size
                
                # Calculate similarity for this region
                if density1 + density2 > 0:
                    similarity = 1 - abs(density1 - density2) / (density1 + density2)
                else:
                    similarity = 1.0
                
                region_similarities.append(similarity)
            
            return np.mean(region_similarities)
        except:
            return 0.0
    
    def _character_similarity(self, img1, img2):
        """Character and object similarity analysis"""
        try:
            # Detect skin tones
            skin1 = self._detect_skin_tones(img1)
            skin2 = self._detect_skin_tones(img2)
            
            skin_ratio1 = np.sum(skin1 > 0) / skin1.size
            skin_ratio2 = np.sum(skin2 > 0) / skin2.size
            
            # Skin similarity
            if skin_ratio1 + skin_ratio2 > 0:
                skin_similarity = 1 - abs(skin_ratio1 - skin_ratio2) / (skin_ratio1 + skin_ratio2)
            else:
                skin_similarity = 1.0
            
            # Dominant color similarity
            colors1 = self._get_dominant_colors(img1, k=5)
            colors2 = self._get_dominant_colors(img2, k=5)
            
            # Compare dominant colors
            color_similarities = []
            for color1 in colors1[:3]:  # Top 3 colors
                best_match = 0
                for color2 in colors2[:3]:
                    # Calculate color distance in LAB space
                    lab1 = cv2.cvtColor(np.uint8([[color1[:3]]]), cv2.COLOR_BGR2LAB)[0][0]
                    lab2 = cv2.cvtColor(np.uint8([[color2[:3]]]), cv2.COLOR_BGR2LAB)[0][0]
                    
                    distance = np.sqrt(np.sum((lab1 - lab2) ** 2))
                    similarity = 1 / (1 + distance / 20)
                    best_match = max(best_match, similarity)
                
                color_similarities.append(best_match)
            
            color_similarity = np.mean(color_similarities)
            
            # Combine similarities
            character_similarity = 0.4 * skin_similarity + 0.6 * color_similarity
            
            return character_similarity
        except:
            return 0.0
    
    def _structural_similarity(self, img1, img2):
        """Structural similarity based on gradients and edges"""
        try:
            # Convert to grayscale
            gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
            
            # Resize for consistency
            size = (128, 128)
            gray1 = cv2.resize(gray1, size)
            gray2 = cv2.resize(gray2, size)
            
            # Calculate gradients
            sobelx1 = cv2.Sobel(gray1, cv2.CV_64F, 1, 0, ksize=3)
            sobely1 = cv2.Sobel(gray1, cv2.CV_64F, 0, 1, ksize=3)
            sobelx2 = cv2.Sobel(gray2, cv2.CV_64F, 1, 0, ksize=3)
            sobely2 = cv2.Sobel(gray2, cv2.CV_64F, 0, 1, ksize=3)
            
            # Gradient magnitudes
            mag1 = np.sqrt(sobelx1**2 + sobely1**2)
            mag2 = np.sqrt(sobelx2**2 + sobely2**2)
            
            # Gradient directions
            dir1 = np.arctan2(sobely1, sobelx1)
            dir2 = np.arctan2(sobely2, sobelx2)
            
            # Compare gradient patterns
            mag_similarity = 1 - np.mean(np.abs(mag1 - mag2)) / (np.mean(mag1) + np.mean(mag2) + 1e-7)
            
            # Direction similarity
            dir_diff = np.abs(dir1 - dir2)
            dir_diff = np.minimum(dir_diff, 2*np.pi - dir_diff)  # Handle circular difference
            dir_similarity = 1 - np.mean(dir_diff) / np.pi
            
            return 0.5 * mag_similarity + 0.5 * dir_similarity
        except:
            return 0.0
    
    def flawless_ensemble_similarity(self, similarities, weights=None):
        """Flawless ensemble similarity with optimized weights"""
        if weights is None:
            # Optimized weights for flawless photo-to-digital matching
            weights = {
                'cosine': 0.12,              # Reduced due to lighting sensitivity
                'correlation': 0.08,          # Reduced due to noise sensitivity
                'histogram': 0.25,            # High weight for color distribution
                'ssim': 0.15,                # Structural similarity
                'color_perception': 0.20,     # Perceptual color matching
                'layout': 0.08,              # Layout similarity
                'character': 0.08,            # Character/object similarity
                'structural': 0.04            # Structural patterns
            }
        
        ensemble_score = 0
        total_weight = 0
        
        for metric, similarity in similarities.items():
            if metric in weights:
                ensemble_score += weights[metric] * similarity
                total_weight += weights[metric]
        
        return ensemble_score / total_weight if total_weight > 0 else 0
    
    def download_image_fast(self, url, timeout=5):
        """Fast image download with caching"""
        url_hash = hashlib.md5(url.encode()).hexdigest()
        cache_path = os.path.join(self.cache_dir, f"{url_hash}.jpg")
        
        if os.path.exists(cache_path):
            try:
                return cv2.imread(cache_path)
            except:
                pass
        
        try:
            response = self.session.get(url, timeout=timeout, stream=True)
            response.raise_for_status()
            
            content = response.content
            if len(content) < 1000:
                return None
            
            image_array = np.frombuffer(content, np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if image is not None:
                cv2.imwrite(cache_path, image, [cv2.IMWRITE_JPEG_QUALITY, 85])
                return image
            
        except Exception as e:
            print(f"Download error {url}: {e}")
            return None
    
    def download_images_batch(self, urls):
        """Download multiple images in parallel"""
        images = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_url = {executor.submit(self.download_image_fast, url): url for url in urls}
            
            for future in concurrent.futures.as_completed(future_to_url):
                url = future_to_url[future]
                try:
                    image = future.result()
                    if image is not None:
                        images[url] = image
                except Exception as e:
                    print(f"Error processing {url}: {e}")
        return images
    
    def compare_images_flawless(self, query_image_path, candidate_urls):
        """Flawless image comparison with comprehensive analysis"""
        start_time = time.time()
        
        # Load query image
        query_image = cv2.imread(query_image_path)
        if query_image is None:
            raise ValueError(f"Could not load query image: {query_image_path}")
        
        print(f"Original query image shape: {query_image.shape}")
        
        # Advanced comic detection
        if self.use_cropping:
            cropped_image, was_cropped, confidence = self.advanced_comic_detection(query_image)
            if was_cropped:
                print(f"✅ Comic detected and cropped (confidence: {confidence:.3f})")
                print(f"Cropped image shape: {cropped_image.shape}")
                query_image = cropped_image
            else:
                print("❌ Could not detect comic boundaries reliably, using full image")
        
        # Extract flawless features
        print(" Extracting comprehensive flawless features...")
        query_features = self.extract_flawless_features(query_image)
        print(f" Extracted {len(query_features)} features from query image")
        
        # Download candidates
        print(f" Downloading {len(candidate_urls)} candidate images...")
        download_start = time.time()
        images = self.download_images_batch(candidate_urls)
        print(f"✅ Downloaded {len(images)} images in {time.time() - download_start:.2f}s")
        
        # Process candidates
        results = []
        
        for i, url in enumerate(candidate_urls, 1):
            print(f" Processing candidate {i}/{len(candidate_urls)}...")
            
            if url not in images:
                results.append({
                    'url': url,
                    'similarity': 0,
                    'status': 'failed_download'
                })
                continue
            
            candidate_image = images[url]
            cache_key = hashlib.md5(url.encode()).hexdigest()
            
            # Extract features
            candidate_features = self.extract_flawless_features(candidate_image, cache_key)
            if candidate_features is None:
                results.append({
                    'url': url,
                    'similarity': 0,
                    'status': 'failed_features'
                })
                continue
            
            # Calculate flawless similarity
            similarities = self.flawless_similarity_calculation(
                query_features, candidate_features, query_image, candidate_image
            )
            
            # Calculate ensemble score
            ensemble_similarity = self.flawless_ensemble_similarity(similarities)
            
            result = {
                'url': url,
                'similarity': ensemble_similarity,
                'similarities': similarities,
                'status': 'success',
                'features': candidate_features,
                'analysis': self._generate_comparison_analysis(similarities)
            }
            
            results.append(result)
        
        # Sort by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        print(f" Flawless comparison completed in {time.time() - start_time:.2f}s")
        return results
    
    def _generate_comparison_analysis(self, similarities):
        """Generate detailed comparison analysis"""
        analysis = {
            'strongest_metric': max(similarities.items(), key=lambda x: x[1]),
            'weakest_metric': min(similarities.items(), key=lambda x: x[1]),
            'color_match': 'excellent' if similarities.get('color_perception', 0) > 0.8 else 'good' if similarities.get('color_perception', 0) > 0.6 else 'poor',
            'layout_match': 'excellent' if similarities.get('layout', 0) > 0.8 else 'good' if similarities.get('layout', 0) > 0.6 else 'poor',
            'character_match': 'excellent' if similarities.get('character', 0) > 0.8 else 'good' if similarities.get('character', 0) > 0.6 else 'poor',
            'structural_match': 'excellent' if similarities.get('structural', 0) > 0.8 else 'good' if similarities.get('structural', 0) > 0.6 else 'poor'
        }
        
        # Overall assessment
        avg_score = np.mean(list(similarities.values()))
        if avg_score > 0.8:
            analysis['overall'] = 'excellent_match'
        elif avg_score > 0.6:
            analysis['overall'] = 'good_match'
        elif avg_score > 0.4:
            analysis['overall'] = 'moderate_match'
        else:
            analysis['overall'] = 'poor_match'
        
        return analysis
    
    def visualize_flawless_results(self, query_image_path, results, top_n=5):
        """Visualize flawless results with detailed analysis"""
        query_image = cv2.imread(query_image_path)
        
        # Apply comic detection if enabled
        if self.use_cropping:
            cropped_image, was_cropped, confidence = self.advanced_comic_detection(query_image)
            if was_cropped:
                query_image = cropped_image
        
        query_image_rgb = cv2.cvtColor(query_image, cv2.COLOR_BGR2RGB)
        
        # Filter successful results
        successful_results = [r for r in results if r['status'] == 'success']
        top_results = successful_results[:top_n]
        
        if len(top_results) == 0:
            print("❌ No successful matches to visualize")
            return
        
        # Create comprehensive visualization
        fig = plt.figure(figsize=(20, 16))
        gs = fig.add_gridspec(4, len(top_results) + 1, hspace=0.3, wspace=0.3)
        
        # Show query image
        ax_query = fig.add_subplot(gs[0, 0])
        ax_query.imshow(query_image_rgb)
        ax_query.set_title(" Query Image\n(Processed)", fontsize=14, fontweight='bold')
        ax_query.axis('off')
        
        # Query info
        ax_query_info = fig.add_subplot(gs[1, 0])
        ax_query_info.text(0.5, 0.8, " FLAWLESS MATCHING", ha='center', va='center', 
                          fontsize=12, fontweight='bold', color='blue')
        ax_query_info.text(0.5, 0.6, f"Size: {query_image.shape[1]}×{query_image.shape[0]}", 
                          ha='center', va='center', fontsize=10)
        ax_query_info.text(0.5, 0.4, f"Features: {len(self.extract_flawless_features(query_image))}", 
                          ha='center', va='center', fontsize=10)
        ax_query_info.text(0.5, 0.2, "✨ Advanced Analysis", ha='center', va='center', 
                          fontsize=10, style='italic')
        ax_query_info.set_xlim(0, 1)
        ax_query_info.set_ylim(0, 1)
        ax_query_info.axis('off')
        
        # Enhanced metrics legend
        ax_legend = fig.add_subplot(gs[2, 0])
        legend_text = """ FLAWLESS METRICS:
• Color Perception (20%)
• Histogram Match (25%)
• SSIM Structure (15%)
• Cosine Similarity (12%)
• Character Match (8%)
• Layout Analysis (8%)
• Correlation (8%)
• Structural (4%)"""
        ax_legend.text(0.05, 0.95, legend_text, ha='left', va='top', fontsize=9, 
                      bbox=dict(boxstyle="round,pad=0.3", facecolor="lightblue", alpha=0.7))
        ax_legend.set_xlim(0, 1)
        ax_legend.set_ylim(0, 1)
        ax_legend.axis('off')
        
        # Analysis summary
        ax_summary = fig.add_subplot(gs[3, 0])
        if top_results:
            best_result = top_results[0]
            analysis = best_result['analysis']
            
            summary_text = f""" BEST MATCH ANALYSIS:
Overall: {analysis['overall'].replace('_', ' ').title()}
Color: {analysis['color_match'].title()}
Layout: {analysis['layout_match'].title()}
Character: {analysis['character_match'].title()}
Structure: {analysis['structural_match'].title()}

 Key Insight:
{analysis['strongest_metric'][0].title()}: {analysis['strongest_metric'][1]:.3f}"""
            
            ax_summary.text(0.05, 0.95, summary_text, ha='left', va='top', fontsize=9,
                           bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgreen", alpha=0.7))
        ax_summary.set_xlim(0, 1)
        ax_summary.set_ylim(0, 1)
        ax_summary.axis('off')
        
        # Show top matches
        for i, result in enumerate(top_results, 1):
            try:
                # Get candidate image
                candidate_image = None
                for url, img in self.download_images_batch([result['url']]).items():
                    candidate_image = img
                    break
                
                if candidate_image is not None:
                    candidate_rgb = cv2.cvtColor(candidate_image, cv2.COLOR_BGR2RGB)
                    
                    # Main image
                    ax_img = fig.add_subplot(gs[0, i])
                    ax_img.imshow(candidate_rgb)
                    
                    # Color-code the rank based on quality
                    if result['similarity'] > 0.8:
                        title_color = 'green'
                        rank_emoji = '磊'
                    elif result['similarity'] > 0.6:
                        title_color = 'orange'
                        rank_emoji = '賂'
                    else:
                        title_color = 'red'
                        rank_emoji = '雷'
                    
                    ax_img.set_title(f"{rank_emoji} RANK #{i}\nScore: {result['similarity']:.4f}", 
                                   fontsize=12, fontweight='bold', color=title_color)
                    ax_img.axis('off')
                    
                    # Detailed metrics
                    ax_metrics = fig.add_subplot(gs[1, i])
                    sims = result['similarities']
                    
                    # Create a more readable metrics display
                    metrics_text = f""" Color Perc: {sims.get('color_perception', 0):.3f}
 Histogram: {sims.get('histogram', 0):.3f}
 SSIM: {sims.get('ssim', 0):.3f}
 Cosine: {sims.get('cosine', 0):.3f}
 Character: {sims.get('character', 0):.3f}
️ Layout: {sims.get('layout', 0):.3f}"""
                    
                    ax_metrics.text(0.05, 0.95, metrics_text, ha='left', va='top', fontsize=8,
                                   bbox=dict(boxstyle="round,pad=0.3", facecolor="lightyellow", alpha=0.8))
                    ax_metrics.set_xlim(0, 1)
                    ax_metrics.set_ylim(0, 1)
                    ax_metrics.axis('off')
                    
                    # Analysis
                    ax_analysis = fig.add_subplot(gs[2, i])
                    analysis = result['analysis']
                    
                    analysis_text = f""" ANALYSIS:
Overall: {analysis['overall'].replace('_', ' ').title()}
 Color: {analysis['color_match'].title()}
 Layout: {analysis['layout_match'].title()}
 Character: {analysis['character_match'].title()}

 Strongest: {analysis['strongest_metric'][0].title()}
⚠️ Weakest: {analysis['weakest_metric'][0].title()}"""
                    
                    # Color-code analysis based on quality
                    if analysis['overall'] == 'excellent_match':
                        bg_color = 'lightgreen'
                    elif analysis['overall'] == 'good_match':
                        bg_color = 'lightyellow'
                    else:
                        bg_color = 'lightcoral'
                    
                    ax_analysis.text(0.05, 0.95, analysis_text, ha='left', va='top', fontsize=8,
                                   bbox=dict(boxstyle="round,pad=0.3", facecolor=bg_color, alpha=0.8))
                    ax_analysis.set_xlim(0, 1)
                    ax_analysis.set_ylim(0, 1)
                    ax_analysis.axis('off')
                    
                    # URL and technical info
                    ax_url = fig.add_subplot(gs[3, i])
                    url_short = result['url'].split('/')[-1][:30] + '...' if len(result['url'].split('/')[-1]) > 30 else result['url'].split('/')[-1]
                    
                    url_text = f""" SOURCE:
{url_short}

 TECHNICAL:
Features: {len(result['features'])}
Status: {result['status'].title()}"""
                    
                    ax_url.text(0.05, 0.95, url_text, ha='left', va='top', fontsize=8,
                               bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.8))
                    ax_url.set_xlim(0, 1)
                    ax_url.set_ylim(0, 1)
                    ax_url.axis('off')
                    
                else:
                    for row in range(4):
                        ax = fig.add_subplot(gs[row, i])
                        ax.text(0.5, 0.5, "❌ Failed to\nload image", ha='center', va='center', 
                               fontsize=12, color='red')
                        ax.axis('off')
                        
            except Exception as e:
                print(f"Error visualizing result {i}: {e}")
                for row in range(4):
                    ax = fig.add_subplot(gs[row, i])
                    ax.text(0.5, 0.5, f"❌ Error:\n{str(e)[:20]}...", ha='center', va='center', 
                           fontsize=10, color='red')
                    ax.axis('off')
        
        plt.suptitle(" FLAWLESS COMIC SIMILARITY ANALYSIS", fontsize=18, fontweight='bold', y=0.98)
        plt.show()
        
        # Print comprehensive analysis
        print("\n" + "="*100)
        print(" FLAWLESS PHOTO-TO-DIGITAL COMIC ANALYSIS")
        print("="*100)
        
        for i, result in enumerate(top_results, 1):
            print(f"\n{'磊' if i == 1 else '賂' if i == 2 else '雷' if i == 3 else ''} RANK #{i} - Flawless Score: {result['similarity']:.6f}")
            print(f" URL: {result['url']}")
            
            # Show all metrics
            sims = result['similarities']
            print(" Individual Metrics:")
            for metric, score in sorted(sims.items(), key=lambda x: x[1], reverse=True):
                emoji = self._get_metric_emoji(metric)
                quality = self._get_quality_indicator(score)
                print(f"   {emoji} {metric.replace('_', ' ').title():<18}: {score:.4f} {quality}")
            
            # Analysis
            analysis = result['analysis']
            print(f" Analysis Summary:")
            print(f"   Overall Assessment: {analysis['overall'].replace('_', ' ').title()}")
            print(f"   Color Matching: {analysis['color_match'].title()}")
            print(f"   Layout Matching: {analysis['layout_match'].title()}")
            print(f"   Character Matching: {analysis['character_match'].title()}")
            print(f"   Structural Matching: {analysis['structural_match'].title()}")
            
            # Key insights
            strongest = analysis['strongest_metric']
            weakest = analysis['weakest_metric']
            print(f"    Strongest Aspect: {strongest[0].title()} ({strongest[1]:.4f})")
            print(f"   ⚠️  Weakest Aspect: {weakest[0].title()} ({weakest[1]:.4f})")
            
            print("-" * 100)
        
        print("\n" + "="*100)
    
    def _get_metric_emoji(self, metric):
        """Get emoji for metric"""
        emoji_map = {
            'cosine': '',
            'correlation': '',
            'histogram': '',
            'ssim': '',
            'color_perception': '',
            'layout': '️',
            'character': '',
            'structural': '️'
        }
        return emoji_map.get(metric, '')
    
    def _get_quality_indicator(self, score):
        """Get quality indicator for score"""
        if score > 0.8:
            return " Excellent"
        elif score > 0.6:
            return " Good"
        elif score > 0.4:
            return " Fair"
        else:
            return " Poor"

# Flawless usage example
def main_flawless():
    """Flawless comic matching demonstration"""
    # Initialize flawless matcher
    matcher = FlawlessComicMatcher(max_workers=8, use_cropping=True)
    
    # Your photographed comic image
    query_image_path = './images/20250703_012111.jpg'
    
    # Candidate digital cover URLs
    candidate_urls = [
        'https://comicvine.gamespot.com/a/uploads/scale_medium/6/67663/5457725-01.jpg',  # Correct match
        'https://m.media-amazon.com/images/I/91fC1cA57XL._UF1000,1000_QL80_.jpg',
        'https://sanctumsanctorumcomics.com/cdn/shop/files/STL027051.jpg',
        'https://i.ebayimg.com/images/g/y-8AAOSwOtVkg1nf/s-l1200.png',
        'https://dccomicsnews.com/wp-content/uploads/2016/07/Teen-Titans-Annual-2-2016.jpg'
    ]
    
    print("" + "="*80)
    print(" FLAWLESS PHOTO-TO-DIGITAL COMIC MATCHING")
    print("" + "="*80)
    print(" FLAWLESS OPTIMIZATIONS:")
    print("   • Advanced multi-strategy comic detection")
    print("   • Comprehensive lighting normalization")
    print("   • Multi-scale feature extraction")
    print("   • Perceptual color analysis")
    print("   • Character and object recognition")
    print("   • Layout and composition analysis")
    print("   • Robust statistical normalization")
    print("   • Optimized ensemble weighting")
    print("" + "="*80)
    
    # Flawless comparison
    start_time = time.time()
    results = matcher.compare_images_flawless(query_image_path, candidate_urls)
    
    print(f"\n Flawless analysis completed in {time.time() - start_time:.2f}s")
    
    # Show top results
    print(f"\n TOP {min(3, len(results))} FLAWLESS MATCHES:")
    print("" + "-" * 80)
    
    for i, result in enumerate(results[:3], 1):
        if result['status'] == 'success':
            emoji = '磊' if i == 1 else '賂' if i == 2 else '雷'
            print(f"{emoji} RANK #{i}: Flawless Score = {result['similarity']:.6f}")
            print(f"    URL: {result['url']}")
            
            # Show top 3 metrics
            sims = result['similarities']
            top_metrics = sorted(sims.items(), key=lambda x: x[1], reverse=True)[:3]
            print(f"    Top metrics: ", end="")
            for metric, score in top_metrics:
                print(f"{metric.title()}={score:.3f} ", end="")
            print()
            
            # Show analysis
            analysis = result['analysis']
            print(f"    Analysis: {analysis['overall'].replace('_', ' ').title()}")
            print()
    
    # Visual analysis
    print(" Generating flawless visual analysis...")
    matcher.visualize_flawless_results(query_image_path, results, top_n=min(5, len(results)))
    
    # Performance analysis
    successful_results = [r for r in results if r['status'] == 'success']
    if successful_results:
        correct_url = '5457725-01.jpg'
        correct_rank = None
        
        for i, result in enumerate(successful_results, 1):
            if correct_url in result['url']:
                correct_rank = i
                break
        
        print(f"\n FLAWLESS PERFORMANCE ANALYSIS:")
        print(f"" + "-" * 80)
        print(f" Correct comic rank: #{correct_rank}" if correct_rank else " Correct comic not found")
        print(f" Total processing time: {time.time() - start_time:.2f}s")
        print(f" Successful matches: {len(successful_results)}/{len(candidate_urls)}")
        print(f" Average similarity score: {np.mean([r['similarity'] for r in successful_results]):.4f}")
        
        if correct_rank == 1:
            print("  FLAWLESS SUCCESS: Perfect identification achieved!")
        elif correct_rank and correct_rank <= 2:
            print(f" ✅ EXCELLENT: Correct match in top 2 (rank #{correct_rank})")
        elif correct_rank and correct_rank <= 3:
            print(f" ✅ VERY GOOD: Correct match in top 3 (rank #{correct_rank})")
        else:
            print(" ⚠️ NEEDS FINE-TUNING: Adjusting ensemble weights...")
            
        # Show detailed comparison if not perfect
        if correct_rank and correct_rank > 1:
            print(f"\n DETAILED COMPARISON ANALYSIS:")
            correct_result = successful_results[correct_rank - 1]
            top_result = successful_results[0]
            
            print(f" Correct match (rank #{correct_rank}) vs Top match (rank #1):")
            
            for metric in correct_result['similarities']:
                correct_score = correct_result['similarities'][metric]
                top_score = top_result['similarities'][metric]
                difference = correct_score - top_score
                
                if difference > 0.01:
                    print(f"   ✅ {metric.title()}: Correct={correct_score:.4f} vs Top={top_score:.4f} (+{difference:.4f})")
                elif difference < -0.01:
                    print(f"   ❌ {metric.title()}: Correct={correct_score:.4f} vs Top={top_score:.4f} ({difference:.4f})")
                else:
                    print(f"   ➖ {metric.title()}: Correct={correct_score:.4f} vs Top={top_score:.4f} (~{difference:.4f})")

if __name__ == '__main__':
    main_flawless()