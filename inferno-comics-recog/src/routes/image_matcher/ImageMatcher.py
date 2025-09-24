# routes/image_matcher_routes.py
import os
import cv2
import time
import json
import uuid
import queue
import traceback
import threading
import numpy as np
from util.Logger import get_logger
from concurrent.futures import ThreadPoolExecutor
from models.SSEProgressTracker import SSEProgressTracker
from models.JavaProgressReporter import JavaProgressReporter
from flask import Blueprint, jsonify, request, Response, current_app, render_template, send_file, abort
from util.ImageUtils import image_to_base64
from util.FileOperations import (
    load_image_matcher_result, 
    prepare_result_for_template,
    ensure_images_directory,
    migrate_existing_results_to_file_storage
)
from services.ImageMatcherService import get_service, get_global_matcher

logger = get_logger(__name__)

image_matcher_bp = Blueprint('imager-matcher', __name__)

# Thread pool for async processing
executor = ThreadPoolExecutor(max_workers=3)

@image_matcher_bp.route('/image-matcher', methods=['POST'])
def image_matcher_operation():
    """Enhanced image matching API that handles both regular and SSE progress reporting"""
    
    logger.debug(" Received image matcher request")
    
    # Check for image file in request
    if 'image' not in request.files:
        logger.warning("⚠️ No image file in request")
        return jsonify({'error': 'Missing image file in request'}), 400
    
    file = request.files['image']
    if file.filename == '':
        logger.warning("⚠️ Empty filename in request")
        return jsonify({'error': 'No selected file'}), 400
    
    # Get query filename for better result identification
    query_filename = file.filename
    logger.info(f" Processing image: {query_filename}")
    
    # Check if this is an SSE-enabled request (sent from Java with session_id)
    session_id = request.form.get('session_id')
    
    try:
        # Read image data as numpy array
        image_bytes = file.read()
        np_arr = np.frombuffer(image_bytes, np.uint8)
        query_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if query_image is None:
            raise ValueError("Image decoding failed")
        logger.debug(f"️ Successfully decoded image: {query_image.shape}")
    except Exception as e:
        logger.error(f"❌ Failed to process uploaded image: {e}")
        return jsonify({'error': f'Failed to process uploaded image: {str(e)}'}), 400

    # Parse candidate covers
    try:
        candidate_covers_json = request.form.get('candidate_covers')
        if not candidate_covers_json:
            raise ValueError("Missing candidate_covers field")
            
        candidate_covers = json.loads(candidate_covers_json)
        if not isinstance(candidate_covers, list):
            raise ValueError("candidate_covers must be a list")
        
        logger.info(f" Received {len(candidate_covers)} candidate covers")
            
    except Exception as e:
        traceback.print_exc()
        logger.error(f"❌ Invalid candidate covers: {e}")
        return jsonify({'error': f'Invalid candidate covers: {str(e)}'}), 400

    # Get the service instance
    service = get_service()

    # If session_id is provided, this is a CENTRALIZED progress request from Java
    if session_id:
        logger.info(f" Processing CENTRALIZED progress request for session: {session_id}")
        
        try:
            # Process with centralized progress reporting to Java AND save to JSON
            result = service.process_image_with_centralized_progress(session_id, query_image, candidate_covers, query_filename)
            
            # Return result immediately - Java handles the SSE side
            return jsonify(result)
            
        except Exception as e:
            error_msg = f'Processing failed: {str(e)}'
            logger.error(f"❌ Centralized processing failed: {error_msg}")
            # Send error to Java
            java_reporter = JavaProgressReporter(session_id)
            java_reporter.send_error(error_msg)
            return jsonify({'error': error_msg}), 500
    
    # Regular (non-SSE) processing - original behavior but now also saves to JSON
    logger.info(" Processing regular (non-SSE) request")
    
    # Generate session ID for regular requests too, so we can save results
    session_id = str(uuid.uuid4())
    
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
    
    logger.info(f" Extracted {len(candidate_urls)} URLs from covers")
    
    if not candidate_urls:
        logger.warning("⚠️ No valid URLs found in candidate covers")
        return jsonify({'error': 'No valid URLs found in candidate covers'}), 400

    # Initialize matcher
    matcher = get_global_matcher()
    logger.debug(" Initialized matcher for regular processing")

    try:
        # Run matching with the extracted URLs (no progress callback for regular requests)
        results, query_elements = matcher.find_matches_img(query_image, candidate_urls)

        # Enhance results with comic names and cover information
        enhanced_results = service._enhance_results(results, url_to_cover_map, session_id)
        
        # Return top 5 matches as JSON
        top_matches = enhanced_results[:5]
        
        # Log top matches for debugging
        logger.info(f" Top {len(top_matches)} matches for session {session_id}:")
        for i, match in enumerate(top_matches[:3], 1):
            logger.info(f"   {i}. {match['comic_name']} - Similarity: {match['similarity']:.3f}")
            
        matcher.print_cache_stats()
        
        result = {
            'top_matches': top_matches,
            'total_matches': len(enhanced_results),
            'total_covers_processed': len(candidate_covers),
            'total_urls_processed': len(candidate_urls),
            'session_id': session_id  # Include session_id in response
        }
        
        # SAVE RESULT TO JSON FILE for regular requests too!
        from util.FileOperations import save_image_matcher_result
        save_image_matcher_result(session_id, result, query_filename, query_image)
        logger.success(f"✅ Regular image processing completed and saved for session: {session_id}")
        
        return jsonify(result)
        
    except Exception as e:
        traceback.print_exc()
        logger.error(f"❌ Regular processing failed: {e}")
        
        # Save error state
        error_result = {
            'top_matches': [],
            'total_matches': 0,
            'total_covers_processed': len(candidate_covers),
            'total_urls_processed': len(candidate_urls),
            'session_id': session_id,
            'error': str(e)
        }
        from util.FileOperations import save_image_matcher_result
        save_image_matcher_result(session_id, error_result, query_filename, query_image)
        
        return jsonify({'error': f'Matching failed: {str(e)}', 'session_id': session_id}), 500

@image_matcher_bp.route('/image-matcher/start', methods=['POST'])
def start_image_processing():
    """Start image processing and return session ID for SSE tracking"""
    
    logger.debug(" Received SSE start request")
    
    # Check for image file in request
    if 'image' not in request.files:
        logger.warning("⚠️ No image file in SSE start request")
        return jsonify({'error': 'Missing image file in request'}), 400
    
    file = request.files['image']
    if file.filename == '':
        logger.warning("⚠️ Empty filename in SSE start request")
        return jsonify({'error': 'No selected file'}), 400
    
    # Get query filename
    query_filename = file.filename
    logger.info(f" Starting SSE processing for image: {query_filename}")
    
    try:
        # Read image data as numpy array
        image_bytes = file.read()
        np_arr = np.frombuffer(image_bytes, np.uint8)
        query_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if query_image is None:
            raise ValueError("Image decoding failed")
        logger.debug(f"️ Successfully decoded SSE image: {query_image.shape}")
    except Exception as e:
        logger.error(f"❌ Failed to process SSE uploaded image: {e}")
        return jsonify({'error': f'Failed to process uploaded image: {str(e)}'}), 400

    # Parse candidate covers
    try:
        candidate_covers_json = request.form.get('candidate_covers')
        if not candidate_covers_json:
            raise ValueError("Missing candidate_covers field")
            
        candidate_covers = json.loads(candidate_covers_json)
        if not isinstance(candidate_covers, list):
            raise ValueError("candidate_covers must be a list")
        
        logger.info(f" Received {len(candidate_covers)} candidate covers for SSE processing")
            
    except Exception as e:
        logger.error(f"❌ Invalid candidate covers in SSE request: {e}")
        return jsonify({'error': f'Invalid candidate covers: {str(e)}'}), 400

    # Generate session ID and set up tracking
    session_id = str(uuid.uuid4())
    tracker = SSEProgressTracker(session_id)
    
    # Get service and register session
    service = get_service()
    service.register_sse_session(session_id, tracker)
    
    # Start async processing
    executor.submit(service.process_image_with_progress, session_id, query_image, candidate_covers, query_filename)
    
    logger.info(f" Started SSE image processing session: {session_id}")
    
    return jsonify({'sessionId': session_id})

@image_matcher_bp.route('/image-matcher/progress', methods=['GET'])
def get_image_processing_progress():
    """SSE endpoint for real-time progress updates"""
    
    session_id = request.args.get('sessionId')
    if not session_id:
        logger.warning("⚠️ Missing sessionId in progress request")
        return jsonify({'error': 'Missing sessionId parameter'}), 400
    
    logger.info(f" Client connecting to SSE progress stream for session: {session_id}")
    
    def generate():
        # Check if session exists
        service = get_service()
        session_data = service.get_sse_session(session_id)
        
        if not session_data:
            error_event = {
                'type': 'error',
                'sessionId': session_id,
                'error': 'Session not found',
                'timestamp': int(time.time() * 1000)
            }
            logger.warning(f"⚠️ SSE session not found: {session_id}")
            yield f"data: {json.dumps(error_event)}\n\n"
            return
        
        tracker = session_data['tracker']
        
        # Send initial connection event
        initial_event = {
            'type': 'progress',
            'sessionId': session_id,
            'stage': 'initializing',
            'progress': 0,
            'message': 'Connected to progress stream',
            'timestamp': int(time.time() * 1000)
        }
        logger.debug(f" SSE stream initialized for session: {session_id}")
        yield f"data: {json.dumps(initial_event)}\n\n"
        
        # Stream progress events
        while tracker.is_active:
            try:
                # Get progress event with timeout
                event = tracker.progress_queue.get(timeout=1.0)
                yield f"data: {json.dumps(event)}\n\n"
                
                # Exit if complete or error
                if event['type'] in ['complete', 'error']:
                    logger.debug(f" SSE stream ending for session {session_id}: {event['type']}")
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
                logger.error(f"❌ Error in SSE stream for session {session_id}: {e}")
                break
        
        logger.debug(f" SSE stream closed for session: {session_id}")
    
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
        logger.warning("⚠️ Missing sessionId in status request")
        return jsonify({'error': 'Missing sessionId parameter'}), 400
    
    logger.debug(f" Status check for session: {session_id}")
    
    service = get_service()
    session_data = service.get_sse_session(session_id)
    
    if not session_data:
        logger.warning(f"⚠️ Session not found for status check: {session_id}")
        return jsonify({
            'sessionId': session_id,
            'status': 'not_found',
            'message': 'Session not found'
        }), 404
    
    tracker = session_data['tracker']
    
    status = {
        'sessionId': session_id,
        'isActive': tracker.is_active,
        'created': session_data['created'].isoformat(),
        'hasActiveConnection': not tracker.progress_queue.empty()
    }
    
    progress_data = service.get_progress_data(session_id)
    if progress_data:
        status.update(progress_data)
    
    return jsonify(status)

@image_matcher_bp.route('/image-matcher/<session_id>')
def view_image_matcher_result(session_id):
    """View a completed image matcher result using the existing evaluation template"""
    
    logger.info(f"️ Viewing result for session: {session_id}")
    
    result_data = load_image_matcher_result(session_id)
    
    if not result_data:
        logger.warning(f"⚠️ Result not found for session: {session_id}")
        return render_template('evaluation_error.html', 
                             error_message=f"Image matcher result not found for session: {session_id}",
                             config={'flask_host': current_app.config.get('FLASK_HOST'),
                                   'flask_port': current_app.config.get('FLASK_PORT'),
                                   'api_url_prefix': current_app.config.get('API_URL_PREFIX')})
    
    # Prepare result data with full image URLs for template
    result_with_urls = prepare_result_for_template(result_data, request)
    
    logger.success(f"✅ Successfully loaded result for session: {session_id}")
    config = {
        'flask_host': current_app.config.get('FLASK_HOST'),
        'flask_port': current_app.config.get('FLASK_PORT'),
        'api_url_prefix': current_app.config.get('API_URL_PREFIX')
    }
    return render_template('evaluation_result.html', result=result_with_urls, config=config)

@image_matcher_bp.route('/image-matcher/<session_id>/data')
def get_image_matcher_data(session_id):
    """Get image matcher result data as JSON"""
    logger.debug(f" API request for session data: {session_id}")
    
    result_data = load_image_matcher_result(session_id)
    
    if not result_data:
        logger.warning(f"⚠️ API data not found for session: {session_id}")
        return jsonify({'error': 'Image matcher result not found'}), 404
    
    logger.debug(f"✅ Successfully returned API data for session: {session_id}")
    return jsonify(result_data)

@image_matcher_bp.route('/image-matcher-multiple', methods=['POST'])
def image_matcher_multiple_operation():
    """Enhanced multiple images matching API that handles batch processing with centralized progress reporting"""
    
    logger.debug(" Received multiple images matcher request")
    
    # Check for multiple image files in request
    uploaded_files = []
    
    # Handle both indexed format (images[0], images[1], etc.) and regular format
    for key in request.files.keys():
        if key.startswith('images[') or key == 'images':
            files = request.files.getlist(key)
            uploaded_files.extend(files)
    
    # Also check for individually named files
    if not uploaded_files:
        # Fallback: look for any file inputs
        for key, file in request.files.items():
            if file.filename:
                uploaded_files.append(file)
    
    if not uploaded_files:
        logger.warning("⚠️ No image files in multiple images request")
        return jsonify({'error': 'No image files found in request'}), 400
    
    logger.info(f" Processing {len(uploaded_files)} images in batch request")
    
    # Get session_id (required for multiple images)
    session_id = request.form.get('session_id')
    if not session_id:
        logger.warning("⚠️ Missing session_id in multiple images request")
        return jsonify({'error': 'session_id is required for multiple images processing'}), 400
    
    # Process all uploaded images
    query_images_data = []
    
    for i, file in enumerate(uploaded_files):
        if file.filename == '':
            logger.warning(f"⚠️ Empty filename for image {i+1}")
            continue
        
        try:
            # Read image data as numpy array
            image_bytes = file.read()
            np_arr = np.frombuffer(image_bytes, np.uint8)
            query_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if query_image is None:
                raise ValueError(f"Image {i+1} decoding failed")
            
            # Convert to base64 for storage
            query_image_base64 = image_to_base64(query_image)
            
            query_images_data.append({
                'image': query_image,
                'filename': file.filename,
                'base64': query_image_base64,
                'index': i
            })
            
            logger.debug(f"️ Successfully decoded image {i+1}/{len(uploaded_files)}: {file.filename} - {query_image.shape}")
            
        except Exception as e:
            logger.error(f"❌ Failed to process uploaded image {i+1} ({file.filename}): {e}")
            # Continue with other images instead of failing completely
            continue
    
    if not query_images_data:
        logger.error("❌ No valid images could be processed")
        return jsonify({'error': 'No valid images could be processed'}), 400
    
    logger.info(f"✅ Successfully processed {len(query_images_data)} out of {len(uploaded_files)} uploaded images")
    
    # Parse candidate covers
    try:
        candidate_covers_json = request.form.get('candidate_covers')
        if not candidate_covers_json:
            raise ValueError("Missing candidate_covers field")
            
        candidate_covers = json.loads(candidate_covers_json)
        if not isinstance(candidate_covers, list):
            raise ValueError("candidate_covers must be a list")
        
        logger.info(f" Received {len(candidate_covers)} candidate covers for {len(query_images_data)} images")
            
    except Exception as e:
        traceback.print_exc()
        logger.error(f"❌ Invalid candidate covers in multiple images request: {e}")
        return jsonify({'error': f'Invalid candidate covers: {str(e)}'}), 400
    
    # Process with centralized progress reporting to Java
    logger.info(f" Processing CENTRALIZED multiple images progress request for session: {session_id}")
    
    try:
        # Get service and process with centralized progress reporting to Java AND save to JSON
        service = get_service()
        result = service.process_multiple_images_with_centralized_progress(session_id, query_images_data, candidate_covers)
        
        # Return result immediately - Java handles the SSE side
        return jsonify(result)
        
    except Exception as e:
        error_msg = f'Multiple images processing failed: {str(e)}'
        logger.error(f"❌ Centralized multiple images processing failed: {error_msg}")
        # Send error to Java
        java_reporter = JavaProgressReporter(session_id)
        java_reporter.send_error(error_msg)
        return jsonify({'error': error_msg}), 500

@image_matcher_bp.route('/stored_images/<session_id>/<filename>')
def serve_stored_image(session_id, filename):
    """Serve stored images from the server"""
    try:
        images_dir = ensure_images_directory()
        image_path = os.path.join(images_dir, session_id, filename)
        
        if not os.path.exists(image_path):
            logger.warning(f" Stored image not found: {image_path}")
            abort(404)
        
        # Security check - ensure the path is within our images directory
        if not os.path.abspath(image_path).startswith(os.path.abspath(images_dir)):
            logger.warning(f" Security violation - path traversal attempt: {image_path}")
            abort(403)
        
        return send_file(image_path)
        
    except Exception as e:
        logger.error(f"❌ Error serving stored image: {e}")
        abort(500)

@image_matcher_bp.route('/image-matcher/admin/migrate', methods=['POST'])
def admin_migrate():
    """Admin endpoint to migrate existing base64 results to file storage"""
    try:
        migrate_existing_results_to_file_storage()
        return jsonify({
            'status': 'success',
            'message': 'Migration to file storage completed successfully'
        })
    except Exception as e:
        logger.error(f"❌ Error during migration: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Migration failed: {str(e)}'
        }), 500

@image_matcher_bp.route('/json', methods=['GET'])
def get_json_by_session_id():
    # Validate session_id parameter
    session_id = request.args.get('sessionId')
    if not session_id:
        return jsonify({'error': 'sessionId parameter is required'}), 400
    
    # Sanitize session_id to prevent directory traversal attacks
    if not session_id.replace('-', '').replace('_', '').isalnum():
        return jsonify({'error': 'Invalid sessionId format'}), 400
    
    # Construct file path
    file_path = f"./results/{session_id}.json"
    
    # Check if file exists
    if not os.path.exists(file_path):
        return jsonify({'error': 'Session data not found'}), 404
    
    try:
        # Read and parse JSON file
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)  # Parse JSON instead of reading as string
        
        return jsonify(data)
    
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON file format'}), 500
    except IOError:
        return jsonify({'error': 'Unable to read session data'}), 500
    except Exception as e:
        # Log the actual error for debugging (consider using proper logging)
        logger.error(f"❌ Unexpected error reading session {session_id}: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
