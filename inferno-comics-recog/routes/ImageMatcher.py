from flask import Blueprint, jsonify
from models.OptimizedComicMatcher import OptimizedComicMatcher
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher

image_matcher_bp = Blueprint('imager-matcher', __name__)

'''
@image_matcher_bp.route('/imager-matcher', methods=['GET'])
def image_matcher():
    pass'''
from flask import request, jsonify
import numpy as np
import cv2

@image_matcher_bp.route('/image-matcher', methods=['POST'])
def image_matcher_operation():
    """Optimized comic matching API with image upload and candidate URLs"""
    
    # Check for image file in request
    if 'image' not in request.files:
        return jsonify({'error': 'Missing image file in request'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    try:
        # Read image data as numpy array
        image_bytes = file.read()
        np_arr = np.frombuffer(image_bytes, np.uint8)
        query_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if query_image is None:
            raise ValueError("Image decoding failed")
    except Exception as e:
        return jsonify({'error': f'Failed to process uploaded image: {str(e)}'}), 400

    # Parse candidate URLs (assumes JSON body or form field)
    try:
        if request.is_json:
            data = request.get_json()
            candidate_urls = data.get('candidate_urls', [])
        else:
            candidate_urls = request.form.getlist('candidate_urls')
            
        if not candidate_urls or not isinstance(candidate_urls, list):
            raise ValueError("Invalid or missing candidate_urls")
    except Exception as e:
        return jsonify({'error': f'Invalid candidate URLs: {str(e)}'}), 400

    print(candidate_urls)
    # Initialize matcher
    matcher = FeatureMatchingComicMatcher(max_workers=6)

    try:
        # Run matching
        results, query_elements = matcher.find_matches_img(query_image, candidate_urls)

        # Return top 3 matches as JSON
        top_matches = results[:1] # Limit to top 1 match for performance
        
        return jsonify({
            'top_matches': [
                {
                    'url': r['url'],
                    'similarity': r['similarity'],
                    'status': r['status'],
                    'similarities': r.get('similarities')
                    # Do NOT include 'elements' if it contains ndarrays
                }
                for r in top_matches
            ],
            'total_matches': len(results)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()  # <--- LOG full stack trace
        return jsonify({'error': f'Matching failed: {str(e)}'}), 500
