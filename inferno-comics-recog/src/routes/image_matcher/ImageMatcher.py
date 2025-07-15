import cv2
import json
import numpy as np
import uuid
import time
import threading
import os
import traceback
import base64
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, Response, current_app, render_template
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher
from concurrent.futures import ThreadPoolExecutor
import queue

from models.JavaProgressReporter import JavaProgressReporter

image_matcher_bp = Blueprint('imager-matcher', __name__)

# Global storage for SSE sessions and progress
sse_sessions = {}
progress_data = {}
session_lock = threading.Lock()

# Thread pool for async processing
executor = ThreadPoolExecutor(max_workers=3)

# Constants
SIMILARITY_THRESHOLD = 0.25

def ensure_results_directory():
    """Ensure the results directory exists (same as evaluation system)"""
    results_dir = './results'
    if not os.path.exists(results_dir):
        os.makedirs(results_dir)
    return results_dir

def save_image_matcher_result(session_id, result_data, query_filename=None, query_image_base64=None):
    """Save image matcher result to JSON file in same format as evaluation system"""
    try:
        results_dir = ensure_results_directory()
        result_file = os.path.join(results_dir, f"{session_id}.json")
        
        # Convert image matcher result to evaluation-compatible format
        total_matches = len(result_data.get('top_matches', []))
        successful_matches = sum(1 for match in result_data.get('top_matches', []) 
                               if match.get('similarity', 0) >= SIMILARITY_THRESHOLD)
        
        # Create evaluation-compatible result structure
        evaluation_result = {
            'session_id': session_id,
            'timestamp': datetime.now().isoformat(),
            'status': 'completed',
            'series_name': query_filename or 'Image Search Query',
            'year': None,  # Not applicable for image search
            'total_images': 1,  # Single query image
            'processed': 1,
            'successful_matches': successful_matches,
            'failed_uploads': 0,
            'no_matches': total_matches - successful_matches,
            'overall_success': successful_matches > 0,
            'best_similarity': max((match.get('similarity', 0) for match in result_data.get('top_matches', [])), default=0.0),
            'similarity_threshold': SIMILARITY_THRESHOLD,
            'total_covers_processed': result_data.get('total_covers_processed', 0),
            'total_urls_processed': result_data.get('total_urls_processed', 0),
            'query_type': 'image_search',  # Distinguish from folder evaluation
            'query_image_base64': query_image_base64,  # Store the query image
            'results': []
        }
        
        # Create a single result item representing the query image and its matches
        query_result_item = {
            'image_name': query_filename or 'Uploaded Query Image',
            'image_base64': query_image_base64,  # Use the query image base64
            'api_success': True,
            'match_success': successful_matches > 0,
            'best_similarity': evaluation_result['best_similarity'],
            'status_code': 200,
            'error': result_data.get('error'),
            'matches': [],
            'total_matches': total_matches,
            # Additional image matcher specific data
            'query_type': 'image_search'
        }
        
        # Add all matches to the single result item
        for match in result_data.get('top_matches', []):
            match_item = {
                'similarity': match.get('similarity', 0),
                'url': match.get('url', ''),
                'meets_threshold': match.get('similarity', 0) >= SIMILARITY_THRESHOLD,
                'comic_name': match.get('comic_name', 'Unknown'),
                'issue_number': match.get('issue_number', 'Unknown'),
                'comic_vine_id': match.get('comic_vine_id'),
                'parent_comic_vine_id': match.get('parent_comic_vine_id'),
                'match_details': match.get('match_details', {}),
                'candidate_features': match.get('candidate_features', {})
            }
            query_result_item['matches'].append(match_item)
        
        evaluation_result['results'].append(query_result_item)
        
        # Save to JSON file
        with open(result_file, 'w') as f:
            json.dump(evaluation_result, f, indent=2)
        
        print(f"Saved image matcher result to {result_file}")
        return result_file
        
    except Exception as e:
        print(f"Error saving image matcher result: {e}")
        return None

def load_image_matcher_result(session_id):
    """Load image matcher result from JSON file (reuse evaluation loader)"""
    try:
        results_dir = ensure_results_directory()
        result_file = os.path.join(results_dir, f"{session_id}.json")
        
        if not os.path.exists(result_file):
            return None
            
        with open(result_file, 'r') as f:
            return json.load(f)
            
    except Exception as e:
        print(f"Error loading image matcher result: {e}")
        return None

class SSEProgressTracker:
    """Class to track and send progress updates via SSE (for fallback when no session_id)"""
    
    def __init__(self, session_id):
        self.session_id = session_id
        self.progress_queue = queue.Queue()
        self.is_active = True
        
    def send_progress(self, stage, progress, message):
        """Send progress update"""
        if not self.is_active:
            return
            
        progress_event = {
            'type': 'progress',
            'sessionId': self.session_id,
            'stage': stage,
            'progress': progress,
            'message': message,
            'timestamp': int(time.time() * 1000)
        }
        
        try:
            self.progress_queue.put(progress_event, timeout=1.0)
        except queue.Full:
            print(f"Progress queue full for session {self.session_id}")
    
    def send_complete(self, result):
        """Send completion event with results"""
        if not self.is_active:
            return
            
        complete_event = {
            'type': 'complete',
            'sessionId': self.session_id,
            'stage': 'complete',
            'progress': 100,
            'message': 'Image processing completed successfully',
            'result': result,
            'timestamp': int(time.time() * 1000)
        }
        
        try:
            self.progress_queue.put(complete_event, timeout=1.0)
        except queue.Full:
            print(f"Progress queue full for session {self.session_id}")
    
    def send_error(self, error_message):
        """Send error event"""
        if not self.is_active:
            return
            
        error_event = {
            'type': 'error',
            'sessionId': self.session_id,
            'error': error_message,
            'timestamp': int(time.time() * 1000)
        }
        
        try:
            self.progress_queue.put(error_event, timeout=1.0)
        except queue.Full:
            print(f"Progress queue full for session {self.session_id}")
    
    def close(self):
        """Close the progress tracker"""
        self.is_active = False

def safe_progress_callback(callback, current_item, message=""):
    """Safely call progress callback, handling None case"""
    if callback is not None:
        try:
            callback(current_item, message)
        except Exception as e:
            print(f"Progress callback error: {e}")
            pass  # Continue execution even if progress fails

def image_to_base64(image_array):
    """Convert OpenCV image array to base64 data URL"""
    try:
        # Encode image as JPEG
        _, buffer = cv2.imencode('.jpg', image_array)
        # Convert to base64
        image_base64 = base64.b64encode(buffer).decode('utf-8')
        return f"data:image/jpeg;base64,{image_base64}"
    except Exception as e:
        print(f"Error converting image to base64: {e}")
        return None

def process_image_with_centralized_progress(session_id, query_image, candidate_covers, query_filename=None):
    """Process image matching with CENTRALIZED progress reporting to Java"""
    
    # Create Java progress reporter - this is the SINGLE source of truth
    java_reporter = JavaProgressReporter(session_id)
    
    # Convert query image to base64 for storage
    query_image_base64 = image_to_base64(query_image)
    
    try:
        # Continue from where Java left off (10%)
        java_reporter.update_progress('processing_data', 12, 'Decoding uploaded image...')
        
        # Stage 1: Processing candidate data (12% -> 20%)
        java_reporter.update_progress('processing_data', 15, 'Processing candidate cover data...')
        
        # Extract URLs and create mapping
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
        
        java_reporter.update_progress('processing_data', 20, f'Prepared {len(candidate_urls)} candidate images for comparison')
        
        if not candidate_urls:
            raise ValueError("No valid URLs found in candidate covers")
        
        # Stage 2: Initializing image analysis (20% -> 25%)
        java_reporter.update_progress('initializing_matcher', 22, 'Initializing image matching engine...')
        
        # Initialize matcher
        matcher = FeatureMatchingComicMatcher(max_workers=6)
        
        # Create a safe progress callback wrapper for the matcher
        def safe_matcher_progress(current_item, message=""):
            # Remove the undefined progress_callback check
            try:
                # Map the matcher's progress (0 to total_items) to our range (35 to 85)
                progress_range = 85 - 35
                if len(candidate_urls) > 0:
                    item_progress = (current_item / len(candidate_urls)) * progress_range
                    actual_progress = 35 + item_progress
                    java_reporter.update_progress('comparing_images', int(actual_progress), 
                                                f"Processing candidate {current_item}/{len(candidate_urls)}... {message}")
            except Exception as e:
                print(f"Progress callback error: {e}")
        
        java_reporter.update_progress('initializing_matcher', 25, 'Image matching engine ready')
        
        # Stage 3: Feature extraction from query image (25% -> 35%)
        java_reporter.update_progress('extracting_features', 30, 'Extracting features from uploaded image...')
        
        # Stage 4: Heavy image comparison work (35% -> 85%)
        java_reporter.update_progress('comparing_images', 35, 'Starting image feature comparison...')
        
        # Run matching with progress callback - this is the time-consuming part
        results, query_elements = matcher.find_matches_img(
            query_image, 
            candidate_urls, 
            progress_callback=safe_matcher_progress  # Use our safe wrapper
        )
        
        java_reporter.update_progress('comparing_images', 85, 'Image comparison complete')
        
        # Stage 5: Processing and ranking results (85% -> 95%)
        java_reporter.update_progress('processing_results', 90, 'Processing and ranking match results...')
        
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
                'parent_comic_vine_id': cover_info.get('parent_comic_vine_id', None),
                'session_id': session_id
            }
            enhanced_results.append(enhanced_result)
        
        # Stage 6: Finalizing results (95% -> 100%)
        java_reporter.update_progress('finalizing', 95, f'Finalizing top {min(5, len(enhanced_results))} matches...')
        
        # Return top 5 matches as JSON
        top_matches = enhanced_results[:5]
        
        # Log top matches for debugging
        print(f"✅ Top {len(top_matches)} matches for session {session_id}:")
        for i, match in enumerate(top_matches[:3], 1):
            print(f"   {i}. {match['comic_name']} #{match['issue_number']} - Similarity: {match['similarity']:.3f}")
            
        matcher.print_cache_stats()
        
        result = {
            'top_matches': top_matches,
            'total_matches': len(enhanced_results),
            'total_covers_processed': len(candidate_covers),
            'total_urls_processed': len(candidate_urls),
            'session_id': session_id
        }
        
        # SAVE RESULT TO JSON FILE - this is the key addition!
        save_image_matcher_result(session_id, result, query_filename, query_image_base64)
        
        # Send completion at 100% to Java
        java_reporter.send_complete(result)
        print(f"✅ Centralized image processing completed and saved for session: {session_id}")
        
        return result
        
    except Exception as e:
        traceback.print_exc()
        error_msg = f'Image matching failed: {str(e)}'
        java_reporter.send_error(error_msg)
        print(f"❌ Error in centralized image processing for session {session_id}: {error_msg}")
        
        # Save error state as well
        error_result = {
            'top_matches': [],
            'total_matches': 0,
            'total_covers_processed': len(candidate_covers) if candidate_covers else 0,
            'total_urls_processed': 0,
            'session_id': session_id,
            'error': error_msg
        }
        save_image_matcher_result(session_id, error_result, query_filename, query_image_base64)
        
        raise

def process_image_with_progress(session_id, query_image, candidate_covers, query_filename=None):
    """Process image matching with progress updates via SSE (fallback for /start endpoint)"""
    
    with session_lock:
        if session_id not in sse_sessions:
            return
        tracker = sse_sessions[session_id]['tracker']
    
    try:
        # Use the centralized processing but also send to SSE tracker
        result = process_image_with_centralized_progress(session_id, query_image, candidate_covers, query_filename)
        tracker.send_complete(result)
        
    except Exception as e:
        tracker.send_error(str(e))

def cleanup_old_sessions():
    """Clean up sessions older than 2 hours"""
    with session_lock:
        current_time = datetime.now()
        sessions_to_remove = []
        
        for session_id, session_data in sse_sessions.items():
            if current_time - session_data['created'] > timedelta(hours=2):
                sessions_to_remove.append(session_id)
        
        for session_id in sessions_to_remove:
            if session_id in sse_sessions:
                sse_sessions[session_id]['tracker'].close()
                del sse_sessions[session_id]
            if session_id in progress_data:
                del progress_data[session_id]
        
        if sessions_to_remove:
            print(f"Cleaned up {len(sessions_to_remove)} old sessions")

@image_matcher_bp.route('/image-matcher', methods=['POST'])
def image_matcher_operation():
    """Enhanced image matching API that handles both regular and SSE progress reporting"""
    
    # Check for image file in request
    if 'image' not in request.files:
        return jsonify({'error': 'Missing image file in request'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    # Get query filename for better result identification
    query_filename = file.filename
    
    # Check if this is an SSE-enabled request (sent from Java with session_id)
    session_id = request.form.get('session_id')
    
    try:
        # Read image data as numpy array
        image_bytes = file.read()
        np_arr = np.frombuffer(image_bytes, np.uint8)
        query_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if query_image is None:
            raise ValueError("Image decoding failed")
    except Exception as e:
        return jsonify({'error': f'Failed to process uploaded image: {str(e)}'}), 400

    # Parse candidate covers
    try:
        candidate_covers_json = request.form.get('candidate_covers')
        if not candidate_covers_json:
            raise ValueError("Missing candidate_covers field")
            
        candidate_covers = json.loads(candidate_covers_json)
        if not isinstance(candidate_covers, list):
            raise ValueError("candidate_covers must be a list")
        
        print(f"Received {len(candidate_covers)} candidate covers")
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Invalid candidate covers: {str(e)}'}), 400

    # If session_id is provided, this is a CENTRALIZED progress request from Java
    if session_id:
        print(f"🚀 Processing CENTRALIZED progress request for session: {session_id}")
        
        try:
            # Process with centralized progress reporting to Java AND save to JSON
            result = process_image_with_centralized_progress(session_id, query_image, candidate_covers, query_filename)
            
            # Return result immediately - Java handles the SSE side
            return jsonify(result)
            
        except Exception as e:
            error_msg = f'Processing failed: {str(e)}'
            # Send error to Java
            java_reporter = JavaProgressReporter(session_id)
            java_reporter.send_error(error_msg)
            return jsonify({'error': error_msg}), 500
    
    # Regular (non-SSE) processing - original behavior but now also saves to JSON
    print(f"Processing regular (non-SSE) request")
    
    # Generate session ID for regular requests too, so we can save results
    session_id = str(uuid.uuid4())
    
    # Convert query image to base64 for storage
    query_image_base64 = image_to_base64(query_image)
    
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
    
    print(f"Extracted {len(candidate_urls)} URLs from covers")
    
    if not candidate_urls:
        return jsonify({'error': 'No valid URLs found in candidate covers'}), 400

    # Initialize matcher
    matcher = FeatureMatchingComicMatcher(max_workers=6)

    try:
        # Run matching with the extracted URLs (no progress callback for regular requests)
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
                'parent_comic_vine_id': cover_info.get('parent_comic_vine_id', None),
                'session_id': session_id
            }
            enhanced_results.append(enhanced_result)
        
        # Return top 5 matches as JSON
        top_matches = enhanced_results[:5]
        
        # Log top matches for debugging
        print(f"Top {len(top_matches)} matches for session {session_id}:")
        for i, match in enumerate(top_matches[:3], 1):
            print(f"   {i}. {match['comic_name']} - Similarity: {match['similarity']:.3f}")
            
        matcher.print_cache_stats()
        
        result = {
            'top_matches': top_matches,
            'total_matches': len(enhanced_results),
            'total_covers_processed': len(candidate_covers),
            'total_urls_processed': len(candidate_urls),
            'session_id': session_id  # Include session_id in response
        }
        
        # SAVE RESULT TO JSON FILE for regular requests too!
        save_image_matcher_result(session_id, result, query_filename, query_image_base64)
        print(f"✅ Regular image processing completed and saved for session: {session_id}")
        
        return jsonify(result)
        
    except Exception as e:
        traceback.print_exc()
        
        # Save error state
        error_result = {
            'top_matches': [],
            'total_matches': 0,
            'total_covers_processed': len(candidate_covers),
            'total_urls_processed': len(candidate_urls),
            'session_id': session_id,
            'error': str(e)
        }
        save_image_matcher_result(session_id, error_result, query_filename, query_image_base64)
        
        return jsonify({'error': f'Matching failed: {str(e)}'}, {'session_id': session_id}), 500

# SSE ENDPOINTS (for backward compatibility)

@image_matcher_bp.route('/image-matcher/start', methods=['POST'])
def start_image_processing():
    """Start image processing and return session ID for SSE tracking"""
    
    # Check for image file in request
    if 'image' not in request.files:
        return jsonify({'error': 'Missing image file in request'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    # Get query filename
    query_filename = file.filename
    
    try:
        # Read image data as numpy array
        image_bytes = file.read()
        np_arr = np.frombuffer(image_bytes, np.uint8)
        query_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if query_image is None:
            raise ValueError("Image decoding failed")
    except Exception as e:
        return jsonify({'error': f'Failed to process uploaded image: {str(e)}'}), 400

    # Parse candidate covers
    try:
        candidate_covers_json = request.form.get('candidate_covers')
        if not candidate_covers_json:
            raise ValueError("Missing candidate_covers field")
            
        candidate_covers = json.loads(candidate_covers_json)
        if not isinstance(candidate_covers, list):
            raise ValueError("candidate_covers must be a list")
        
        print(f"Received {len(candidate_covers)} candidate covers for SSE processing")
            
    except Exception as e:
        return jsonify({'error': f'Invalid candidate covers: {str(e)}'}), 400

    # Generate session ID and set up tracking
    session_id = str(uuid.uuid4())
    tracker = SSEProgressTracker(session_id)
    
    with session_lock:
        sse_sessions[session_id] = {
            'tracker': tracker,
            'created': datetime.now()
        }
        progress_data[session_id] = {
            'status': 'started',
            'stage': 'preparing',
            'progress': 0
        }
    
    # Start async processing
    executor.submit(process_image_with_progress, session_id, query_image, candidate_covers, query_filename)
    
    print(f"🚀 Started SSE image processing session: {session_id}")
    
    return jsonify({'sessionId': session_id})

@image_matcher_bp.route('/image-matcher/progress', methods=['GET'])
def get_image_processing_progress():
    """SSE endpoint for real-time progress updates"""
    
    session_id = request.args.get('sessionId')
    if not session_id:
        return jsonify({'error': 'Missing sessionId parameter'}), 400
    
    print(f"Client connecting to SSE progress stream for session: {session_id}")
    
    def generate():
        # Check if session exists
        with session_lock:
            if session_id not in sse_sessions:
                error_event = {
                    'type': 'error',
                    'sessionId': session_id,
                    'error': 'Session not found',
                    'timestamp': int(time.time() * 1000)
                }
                yield f"data: {json.dumps(error_event)}\n\n"
                return
            
            tracker = sse_sessions[session_id]['tracker']
        
        # Send initial connection event
        initial_event = {
            'type': 'progress',
            'sessionId': session_id,
            'stage': 'initializing',
            'progress': 0,
            'message': 'Connected to progress stream',
            'timestamp': int(time.time() * 1000)
        }
        yield f"data: {json.dumps(initial_event)}\n\n"
        
        # Stream progress events
        while tracker.is_active:
            try:
                # Get progress event with timeout
                event = tracker.progress_queue.get(timeout=1.0)
                yield f"data: {json.dumps(event)}\n\n"
                
                # Exit if complete or error
                if event['type'] in ['complete', 'error']:
                    break
                    
            except queue.Empty:
                # Send heartbeat
                heartbeat = {
                    'type': 'heartbeat',
                    'sessionId': session_id,
                    'timestamp': int(time.time() * 1000)
                }
                yield f"data: {json.dumps(heartbeat)}\n\n"
                continue
            except Exception as e:
                print(f"Error in SSE stream for session {session_id}: {e}")
                break
        
        print(f"SSE stream closed for session: {session_id}")
    
    response = Response(generate(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

@image_matcher_bp.route('/image-matcher/status', methods=['GET'])
def get_image_processing_status():
    """Get current status of image processing session"""
    
    session_id = request.args.get('sessionId')
    if not session_id:
        return jsonify({'error': 'Missing sessionId parameter'}), 400
    
    with session_lock:
        if session_id not in sse_sessions:
            return jsonify({
                'sessionId': session_id,
                'status': 'not_found',
                'message': 'Session not found'
            }), 404
        
        session_data = sse_sessions[session_id]
        tracker = session_data['tracker']
        
        status = {
            'sessionId': session_id,
            'isActive': tracker.is_active,
            'created': session_data['created'].isoformat(),
            'hasActiveConnection': not tracker.progress_queue.empty()
        }
        
        if session_id in progress_data:
            status.update(progress_data[session_id])
    
    return jsonify(status)

# NEW ENDPOINTS FOR RESULT VIEWING (compatible with evaluation system)

@image_matcher_bp.route('/image-matcher/<session_id>')
def view_image_matcher_result(session_id):
    """View a completed image matcher result using the existing evaluation template"""
    
    result_data = load_image_matcher_result(session_id)
    
    if not result_data:
        return render_template('evaluation_error.html', 
                             error_message=f"Image matcher result not found for session: {session_id}",
                             config={'flask_host': current_app.config.get('FLASK_HOST'),
                                   'flask_port': current_app.config.get('FLASK_PORT'),
                                   'api_url_prefix': current_app.config.get('API_URL_PREFIX')})
    
    config = {
        'flask_host': current_app.config.get('FLASK_HOST'),
        'flask_port': current_app.config.get('FLASK_PORT'),
        'api_url_prefix': current_app.config.get('API_URL_PREFIX')
    }
    return render_template('evaluation_result.html', result=result_data, config=config)

@image_matcher_bp.route('/image-matcher/<session_id>/data')
def get_image_matcher_data(session_id):
    """Get image matcher result data as JSON"""
    result_data = load_image_matcher_result(session_id)
    
    if not result_data:
        return jsonify({'error': 'Image matcher result not found'}), 404
    
    return jsonify(result_data)

# Cleanup task - run this periodically (could be implemented with a scheduler)
def run_cleanup():
    """Run cleanup periodically"""
    def cleanup_task():
        while True:
            time.sleep(30 * 60)  # 30 minutes
            cleanup_old_sessions()
    
    cleanup_thread = threading.Thread(target=cleanup_task, daemon=True)
    cleanup_thread.start()

# Initialize cleanup when module loads
run_cleanup()