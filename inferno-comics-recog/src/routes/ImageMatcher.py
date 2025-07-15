import cv2
import json
import numpy as np
import uuid
import time
import threading
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, Response
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

def create_progress_callback(java_reporter, start_progress, end_progress, total_items):
    """Create a progress callback for the matcher that maps to the correct range"""
    def progress_callback(current_item, message=""):
        if total_items == 0:
            return
        
        # Map current_item (0 to total_items) to progress range (start_progress to end_progress)
        progress_range = end_progress - start_progress
        item_progress = (current_item / total_items) * progress_range
        actual_progress = start_progress + item_progress
        
        java_reporter.update_progress('comparing_images', int(actual_progress), 
                                    f"Processing candidate {current_item}/{total_items}... {message}")
    
    return progress_callback

def process_image_with_centralized_progress(session_id, query_image, candidate_covers):
    """Process image matching with CENTRALIZED progress reporting to Java"""
    
    # Create Java progress reporter - this is the SINGLE source of truth
    java_reporter = JavaProgressReporter(session_id)
    
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
        
        java_reporter.update_progress('initializing_matcher', 25, 'Image matching engine ready')
        
        # Stage 3: Feature extraction from query image (25% -> 35%)
        java_reporter.update_progress('extracting_features', 30, 'Extracting features from uploaded image...')
        
        # Stage 4: Heavy image comparison work (35% -> 85%)
        java_reporter.update_progress('comparing_images', 35, 'Starting image feature comparison...')
        
        # Create progress callback for the matcher
        progress_callback = create_progress_callback(java_reporter, 35, 85, len(candidate_urls))
        
        # Run matching with progress callback - this is the time-consuming part
        results, query_elements = matcher.find_matches_img(
            query_image, 
            candidate_urls, 
            progress_callback=progress_callback
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
                'parent_comic_vine_id': cover_info.get('parent_comic_vine_id', None)
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
            'total_urls_processed': len(candidate_urls)
        }
        
        # Send completion at 100% to Java
        java_reporter.send_complete(result)
        print(f"✅ Centralized image processing completed for session: {session_id}")
        
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        error_msg = f'Image matching failed: {str(e)}'
        java_reporter.send_error(error_msg)
        print(f"❌ Error in centralized image processing for session {session_id}: {error_msg}")
        raise

def process_image_with_progress(session_id, query_image, candidate_covers):
    """Process image matching with progress updates via SSE (fallback for /start endpoint)"""
    
    with session_lock:
        if session_id not in sse_sessions:
            return
        tracker = sse_sessions[session_id]['tracker']
    
    try:
        # Use the centralized processing but also send to SSE tracker
        result = process_image_with_centralized_progress(session_id, query_image, candidate_covers)
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
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Invalid candidate covers: {str(e)}'}), 400

    # If session_id is provided, this is a CENTRALIZED progress request from Java
    if session_id:
        print(f"🚀 Processing CENTRALIZED progress request for session: {session_id}")
        
        try:
            # Process with centralized progress reporting to Java
            result = process_image_with_centralized_progress(session_id, query_image, candidate_covers)
            
            # Return result immediately - Java handles the SSE side
            return jsonify(result)
            
        except Exception as e:
            error_msg = f'Processing failed: {str(e)}'
            # Send error to Java
            java_reporter = JavaProgressReporter(session_id)
            java_reporter.send_error(error_msg)
            return jsonify({'error': error_msg}), 500
    
    # Regular (non-SSE) processing - original behavior
    print(f"Processing regular (non-SSE) request")
    
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
                'parent_comic_vine_id': cover_info.get('parent_comic_vine_id', None)
            }
            enhanced_results.append(enhanced_result)
        
        # Return top 5 matches as JSON
        top_matches = enhanced_results[:5]
        
        # Log top matches for debugging
        print(f"Top {len(top_matches)} matches:")
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
    executor.submit(process_image_with_progress, session_id, query_image, candidate_covers)
    
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

# Cleanup task - run this periodically (could be implemented with a scheduler)
def run_cleanup():
    """Run cleanup periodically"""
    import threading
    def cleanup_task():
        while True:
            time.sleep(30 * 60)  # 30 minutes
            cleanup_old_sessions()
    
    cleanup_thread = threading.Thread(target=cleanup_task, daemon=True)
    cleanup_thread.start()

# Initialize cleanup when module loads
run_cleanup()