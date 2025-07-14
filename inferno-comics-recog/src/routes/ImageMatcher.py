import cv2
import json
import numpy as np
from flask import Blueprint, jsonify, request
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher

image_matcher_bp = Blueprint('imager-matcher', __name__)

@image_matcher_bp.route('/image-matcher', methods=['POST'])
def image_matcher_operation():
    """Optimized comic matching API with image upload and candidate cover objects"""
    
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

    # Parse candidate covers (now expecting GCDCover objects as JSON)
    try:
        candidate_covers_json = request.form.get('candidate_covers')
        if not candidate_covers_json:
            raise ValueError("Missing candidate_covers field")
            
        candidate_covers = json.loads(candidate_covers_json)
        if not isinstance(candidate_covers, list):
            raise ValueError("candidate_covers must be a list")
        
        print(f" Received {len(candidate_covers)} candidate covers")
        
        # Extract URLs and create a mapping from URL to cover info
        candidate_urls = []
        url_to_cover_map = {}
        
        for cover in candidate_covers:
            if not isinstance(cover, dict):
                continue
                
            comic_name = cover.get('name', 'Unknown')
            issue_number = cover.get('issueNumber', 'Unknown')
            cover_urls = cover.get('urls', [])
            comic_vine_id = cover.get('comicVineId', None)
            parent_comic_vine_id = cover.get('parentComicVineId', None)
            
            # Handle both single URL and list of URLs
            if isinstance(cover_urls, str):
                cover_urls = [cover_urls]
            elif not isinstance(cover_urls, list):
                continue
                
            for url in cover_urls:
                if url and isinstance(url, str):
                    candidate_urls.append(url)
                    url_to_cover_map[url] = {
                        'comic_name': comic_name,
                        'issue_number': issue_number,
                        'comic_vine_id': comic_vine_id,
                        'error': cover.get('error', ''),
                        'parent_comic_vine_id': parent_comic_vine_id
                    }
        
        print(f" Extracted {len(candidate_urls)} URLs from covers")
        
        if not candidate_urls:
            raise ValueError("No valid URLs found in candidate covers")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Invalid candidate covers: {str(e)}'}), 400

    # Initialize matcher
    matcher = FeatureMatchingComicMatcher(max_workers=6)

    try:
        # Run matching with the extracted URLs
        results, query_elements = matcher.find_matches_img(query_image, candidate_urls)

        # Enhance results with comic names and cover information
        enhanced_results = []
        for result in results:
            url = result['url']
            cover_info = url_to_cover_map.get(url, {})
            
            enhanced_result = {
                'url': url,
                'similarity': result['similarity'],
                'status': result['status'],
                'match_details': result['match_details'],
                'candidate_features': result['candidate_features'],
                # Add comic information
                'comic_name': cover_info.get('comic_name', 'Unknown'),
                'issue_number': cover_info.get('issue_number', 'Unknown'),
                'comic_vine_id': cover_info.get('comic_vine_id', None),
                'cover_error': cover_info.get('error', ''),
                'parent_comic_vine_id': cover_info.get('parent_comic_vine_id', None)
            }
            enhanced_results.append(enhanced_result)
        
        # Return top 5 matches as JSON
        top_matches = enhanced_results[:5]
        
        # Log top matches for debugging
        print(f" Top {len(top_matches)} matches:")
        for i, match in enumerate(top_matches[:3], 1):
            print(f"   {i}. {match['comic_name']} - Similarity: {match['similarity']:.3f}")
            
        matcher.print_cache_stats()
        
        return jsonify({
            'top_matches': top_matches,
            'total_matches': len(enhanced_results),
            'total_covers_processed': len(candidate_covers),
            'total_urls_processed': len(candidate_urls)
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Matching failed: {str(e)}'}), 500