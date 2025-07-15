# Enhanced Evaluation System - Flask Blueprint with Result Persistence
# Add these imports to the top of your Flask app file
from flask import Blueprint, render_template, request, jsonify, Response, current_app
import os
import re
import requests
import base64
import json
import time
import threading
from queue import Queue
import uuid
from datetime import datetime

evaluation_bp = Blueprint('evaluation', __name__)

# Global variables for progress tracking
progress_queues = {}  # Dictionary to store progress queues by session
active_evaluations = {}  # Dictionary to store active evaluations by session

# Your existing constants
SIMILARITY_THRESHOLD = 0.25
SERIES_ID = 3 # You might want to make this configurable

def ensure_results_directory():
    """Ensure the results directory exists"""
    results_dir = './results'
    if not os.path.exists(results_dir):
        os.makedirs(results_dir)
    return results_dir

def save_evaluation_result(session_id, evaluation_state):
    """Save complete evaluation result to JSON file"""
    try:
        results_dir = ensure_results_directory()
        result_file = os.path.join(results_dir, f"{session_id}.json")
        
        # Create complete result structure
        result_data = {
            'session_id': session_id,
            'timestamp': datetime.now().isoformat(),
            'status': evaluation_state.get('status', 'unknown'),
            'series_name': evaluation_state.get('series_name'),
            'year': evaluation_state.get('year'),
            'total_images': evaluation_state.get('total_images', 0),
            'processed': evaluation_state.get('processed', 0),
            'successful_matches': evaluation_state.get('successful_matches', 0),
            'failed_uploads': evaluation_state.get('failed_uploads', 0),
            'no_matches': evaluation_state.get('no_matches', 0),
            'overall_success': evaluation_state.get('overall_success', False),
            'best_similarity': evaluation_state.get('best_similarity', 0.0),
            'similarity_threshold': SIMILARITY_THRESHOLD,
            'results': []
        }
        
        # Process each result with full details
        for result in evaluation_state.get('results', []):
            image_name = os.path.basename(result.get('image_path', ''))
            
            result_item = {
                'image_name': image_name,
                'image_base64': result.get('image_base64'),
                'api_success': result.get('api_success', False),
                'match_success': result.get('match_success', False),
                'best_similarity': result.get('best_similarity', 0.0),
                'status_code': result.get('status_code'),
                'error': result.get('error'),
                'matches': [],
                'total_matches': 0
            }
            
            # Include match details if available
            if result.get('api_success') and result.get('response_data') and 'top_matches' in result['response_data']:
                top_matches = result['response_data']['top_matches']
                for match in top_matches:
                    result_item['matches'].append({
                        'similarity': match.get('similarity', 0),
                        'url': match.get('url', ''),
                        'meets_threshold': match.get('similarity', 0) >= SIMILARITY_THRESHOLD
                    })
                result_item['total_matches'] = result['response_data'].get('total_matches', 0)
            
            result_data['results'].append(result_item)
        
        # Save to JSON file
        with open(result_file, 'w') as f:
            json.dump(result_data, f, indent=2)
        
        print(f"Saved evaluation result to {result_file}")
        return result_file
        
    except Exception as e:
        print(f"Error saving evaluation result: {e}")
        return None

def load_evaluation_result(session_id):
    """Load evaluation result from JSON file"""
    try:
        results_dir = ensure_results_directory()
        result_file = os.path.join(results_dir, f"{session_id}.json")
        
        if not os.path.exists(result_file):
            return None
            
        with open(result_file, 'r') as f:
            return json.load(f)
            
    except Exception as e:
        print(f"Error loading evaluation result: {e}")
        return None

def extract_name_and_year(folder_path):
    """Extract series name and year from folder name like 'Green Lanterns (2016)'"""
    folder_name = os.path.basename(folder_path.rstrip('/\\'))
    print(f"DEBUG: Folder name extracted: '{folder_name}'")
    
    # Extract year from parentheses
    year_match = re.search(r'\((\d{4})\)', folder_name)
    year = int(year_match.group(1)) if year_match else None
    
    # Extract name by removing year and parentheses
    name = re.sub(r'\s*\(\d{4}\)\s*', '', folder_name).strip()
    
    print(f"DEBUG: Extracted name: '{name}', year: {year}")
    return name, year

def get_image_files(folder_path):
    """Get all image files from the folder"""
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    image_files = []
    
    for file in os.listdir(folder_path):
        if any(file.lower().endswith(ext) for ext in image_extensions):
            image_files.append(os.path.join(folder_path, file))
    
    return sorted(image_files)

def image_to_base64(image_path):
    """Convert image to base64 for embedding in HTML"""
    try:
        with open(image_path, 'rb') as image_file:
            encoded = base64.b64encode(image_file.read()).decode()
            ext = os.path.splitext(image_path)[1].lower()
            mime_type = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.bmp': 'image/bmp',
                '.webp': 'image/webp'
            }.get(ext, 'image/jpeg')
            return f"data:{mime_type};base64,{encoded}"
    except Exception as e:
        print(f"Error converting image to base64: {e}")
        return None

def check_match_success(response_data, threshold=SIMILARITY_THRESHOLD):
    """Check if any match meets the similarity threshold"""
    if not response_data or 'top_matches' not in response_data:
        return False, 0.0
    
    best_similarity = 0.0
    for match in response_data['top_matches']:
        similarity = match.get('similarity', 0)
        if similarity > best_similarity:
            best_similarity = similarity
    
    return best_similarity >= threshold, best_similarity

def upload_comic_image(series_id, image_path, name, year):
    """Upload a single comic image to the API"""
    url = f"http://localhost:8080/inferno-comics-rest/api/series/{series_id}/add-comic-by-image"
    
    try:
        with open(image_path, 'rb') as image_file:
            files = {'image': (os.path.basename(image_path), image_file, 'image/jpeg')}
            data = {
                'name': name,
                'year': str(year) if year else ''
            }
            
            print(f"DEBUG: Uploading {os.path.basename(image_path)} to {url}")
            response = requests.post(url, files=files, data=data)
            print(f"DEBUG: Response status: {response.status_code}")
            
            # Try to parse JSON response
            response_data = None
            try:
                raw_response = response.json()
                print(f"DEBUG: Successfully parsed JSON response")
                
                # Handle the case where server returns an array directly
                if isinstance(raw_response, list):
                    # Convert array format to expected dictionary format
                    response_data = {
                        'top_matches': raw_response,
                        'total_matches': len(raw_response)
                    }
                    print(f"DEBUG: Converted array response to dict format - {len(raw_response)} matches")
                elif isinstance(raw_response, dict):
                    # Server already returns expected format
                    response_data = raw_response
                    print(f"DEBUG: Response already in dict format")
                else:
                    print(f"DEBUG: Unexpected response type: {type(raw_response)}")
                    
            except ValueError as json_error:
                print(f"DEBUG: Failed to parse JSON: {json_error}")
                print(f"DEBUG: Raw response text: {response.text[:500]}...")
            
            # Check if this constitutes a successful match based on similarity threshold
            api_success = response.status_code == 200
            match_success = False
            best_similarity = 0.0
            
            if api_success and response_data:
                match_success, best_similarity = check_match_success(response_data)
            
            return {
                'status_code': response.status_code,
                'api_success': api_success,  # API call succeeded
                'match_success': match_success,
                'best_similarity': best_similarity,
                'response_data': response_data,
                'response_text': response.text,
                'error': None
            }
    
    except requests.exceptions.RequestException as e:
        print(f"DEBUG: Request exception: {e}")
        return {
            'status_code': None,
            'api_success': False,
            'match_success': False,
            'best_similarity': 0.0,
            'response_data': None,
            'response_text': None,
            'error': str(e)
        }
    except Exception as e:
        print(f"DEBUG: Unexpected exception: {e}")
        return {
            'status_code': None,
            'api_success': False,
            'match_success': False,
            'best_similarity': 0.0,
            'response_data': None,
            'response_text': None,
            'error': f"Unexpected error: {str(e)}"
        }

def run_evaluation(folder_path, session_id, series_id):
    """Run the evaluation process with progress updates"""

    print(f"Starting evaluation for session {session_id} with folder {folder_path}")

    # Initialize progress queue for this session if it doesn't exist
    if session_id not in progress_queues:
        progress_queues[session_id] = Queue()

    progress_queue = progress_queues[session_id]

    # Initialize evaluation state
    evaluation_state = {
        'status': 'running',
        'progress': 0,
        'total_images': 0,
        'processed': 0,
        'successful_matches': 0,
        'failed_uploads': 0,
        'no_matches': 0,
        'results': [],
        'current_image': None,
        'overall_success': False,
        'best_similarity': 0.0,
        'series_name': None,
        'year': None,
        'session_id': session_id
    }

    active_evaluations[session_id] = evaluation_state

    try:
        # Send initial status
        progress_queue.put({
            'type': 'status',
            'message': 'Starting evaluation...',
            'progress': 0,
            'session_id': session_id
        })

        print(f"Checking folder path: {folder_path}")
        print(f"Folder exists: {os.path.exists(folder_path)}")

        # Check if folder exists
        if not os.path.exists(folder_path):
            # Try to find a matching folder
            base_dir = os.path.dirname(folder_path)
            folder_name = os.path.basename(folder_path)

            print(f"Folder not found, searching in: {base_dir}")

            if os.path.exists(base_dir):
                available_folders = []
                for item in os.listdir(base_dir):
                    item_path = os.path.join(base_dir, item)
                    if os.path.isdir(item_path):
                        available_folders.append(item)
                        if folder_name.lower() in item.lower():
                            folder_path = item_path
                            print(f"Found matching folder: {folder_path}")
                            break
                else:
                    progress_queue.put({
                        'type': 'error',
                        'message': f'Folder not found: {folder_name}. Available folders: {", ".join(available_folders[:5])}'
                    })
                    return
            else:
                progress_queue.put({
                    'type': 'error',
                    'message': f'Images directory not found: {base_dir}'
                })
                return

        # Extract series information
        series_name, year = extract_name_and_year(folder_path)
        evaluation_state['series_name'] = series_name
        evaluation_state['year'] = year

        print(f"Extracted series: {series_name} ({year})")

        if not series_name or not year:
            progress_queue.put({
                'type': 'error',
                'message': 'Could not extract series name and year from folder name. Expected format: "Series Name (YYYY)"'
            })
            return

        progress_queue.put({
            'type': 'status',
            'message': f'Processing series: {series_name} ({year})',
            'progress': 5
        })

        # Get image files
        image_files = get_image_files(folder_path)
        print(f"Found {len(image_files)} image files")

        if not image_files:
            progress_queue.put({
                'type': 'error',
                'message': 'No image files found in the folder!'
            })
            return

        evaluation_state['total_images'] = len(image_files)

        progress_queue.put({
            'type': 'status',
            'message': f'Found {len(image_files)} image files',
            'progress': 10,
            'total_images': len(image_files)
        })

        # Process each image
        for i, image_path in enumerate(image_files):
            # Check if evaluation was stopped
            if evaluation_state.get('status') == 'stopped':
                print(f"Evaluation stopped for session {session_id}")
                break

            image_name = os.path.basename(image_path)
            evaluation_state['current_image'] = image_name

            print(f"Processing image {i+1}/{len(image_files)}: {image_name}")

            # Send processing update with image preview
            image_base64 = image_to_base64(image_path)
            
            progress_queue.put({
                'type': 'processing',
                'message': f'Processing {i+1}/{len(image_files)}: {image_name}',
                'progress': 10 + (i * 80 / len(image_files)),
                'current_image': image_name,
                'current_image_preview': image_base64,
                'processed': i,
                'total_images': len(image_files)
            })

            # Upload image
            result = upload_comic_image(series_id, image_path, series_name, year)
            result['image_path'] = image_path
            result['image_base64'] = image_base64  # Store base64 for later use
            evaluation_state['results'].append(result)
            evaluation_state['processed'] = i + 1

            # Update counters
            if result['api_success']:
                if result['match_success']:
                    evaluation_state['successful_matches'] += 1
                    if result['best_similarity'] > evaluation_state['best_similarity']:
                        evaluation_state['best_similarity'] = result['best_similarity']
                else:
                    evaluation_state['no_matches'] += 1
            else:
                evaluation_state['failed_uploads'] += 1

            # Prepare detailed result for UI
            detailed_result = {
                'image_name': image_name,
                'image_base64': image_base64,
                'api_success': result['api_success'],
                'match_success': result['match_success'],
                'best_similarity': result['best_similarity'],
                'error': result['error'],
                'matches': []
            }

            # Include match details if available
            if result['api_success'] and result['response_data'] and 'top_matches' in result['response_data']:
                top_matches = result['response_data']['top_matches'][:6]  # Top 6 matches
                for match in top_matches:
                    detailed_result['matches'].append({
                        'similarity': match.get('similarity', 0),
                        'url': match.get('url', ''),
                        'meets_threshold': match.get('similarity', 0) >= SIMILARITY_THRESHOLD
                    })
                detailed_result['total_matches'] = result['response_data'].get('total_matches', 0)

            # Send detailed result update
            if result['api_success']:
                if result['match_success']:
                    status = 'success'
                    message = f"✅ SUCCESS - Best similarity: {result['best_similarity']:.4f}"
                else:
                    status = 'warning'
                    message = f"⚠️ NO MATCH - Best similarity: {result['best_similarity']:.4f}"
            else:
                status = 'error'
                message = f"❌ API FAILED - {result['error']}"

            progress_queue.put({
                'type': 'detailed_result',
                'message': message,
                'status': status,
                'progress': 10 + ((i + 1) * 80 / len(image_files)),
                'processed': i + 1,
                'successful_matches': evaluation_state['successful_matches'],
                'no_matches': evaluation_state['no_matches'],
                'failed_uploads': evaluation_state['failed_uploads'],
                'detailed_result': detailed_result
            })

            # Small delay to avoid overwhelming the server
            time.sleep(0.1)

        # Calculate final results
        evaluation_state['overall_success'] = evaluation_state['successful_matches'] > 0
        evaluation_state['status'] = 'completed'

        # Save the complete evaluation result to file
        save_evaluation_result(session_id, evaluation_state)

        print(f"Evaluation completed for session {session_id}")

        progress_queue.put({
            'type': 'complete',
            'message': 'Evaluation completed!',
            'progress': 100,
            'overall_success': evaluation_state['overall_success'],
            'successful_matches': evaluation_state['successful_matches'],
            'no_matches': evaluation_state['no_matches'],
            'failed_uploads': evaluation_state['failed_uploads'],
            'best_similarity': evaluation_state['best_similarity'],
            'total_images': evaluation_state['total_images'],
            'series_name': series_name,
            'year': year,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })

    except Exception as e:
        print(f"Evaluation error for session {session_id}: {e}")
        import traceback
        traceback.print_exc()
        progress_queue.put({
            'type': 'error',
            'message': f'Evaluation failed: {str(e)}'
        })
        evaluation_state['status'] = 'error'
        # Save error state as well
        save_evaluation_result(session_id, evaluation_state)

@evaluation_bp.route('/evaluation', methods=['GET', 'POST'])
def evaluation():
    if request.method == 'GET':
        # Pass configuration to template
        config = {
            'flask_host': current_app.config.get('FLASK_HOST'),
            'flask_port': current_app.config.get('FLASK_PORT'),
            'api_url_prefix': current_app.config.get('API_URL_PREFIX')
        }
        return render_template('evaluation.html', config=config)
    
    elif request.method == 'POST':
        folder = None
        series_id = None
        if request.is_json:
            folder = request.json.get('folder')
            series_id = request.json.get('seriesId')
        else:
            folder = request.form.get('folder')
            series_id = request.form.get('seriesId')
            
        if not folder:
            return jsonify({'error': 'Folder parameter is required'}), 400
        
        if not series_id:
            return jsonify({'error': 'Series ID parameter is required'}), 400
        
        session_id = str(uuid.uuid4())
        folder_path = os.path.join("./images", folder)
        
        evaluation_thread = threading.Thread(target=run_evaluation, args=(folder_path, session_id, series_id))
        evaluation_thread.daemon = True
        evaluation_thread.start()
        
        return jsonify({
            'status': 'started', 
            'message': 'Evaluation started',
            'session_id': session_id
        })

@evaluation_bp.route('/evaluation/<session_id>')
def view_evaluation_result(session_id):
    """View a completed evaluation result"""
    result_data = load_evaluation_result(session_id)
    
    if not result_data:
        return render_template('evaluation_error.html', 
                             error_message=f"Evaluation result not found for session: {session_id}",
                             config={'flask_host': current_app.config.get('FLASK_HOST'), 'flask_port': current_app.config.get('FLASK_PORT'),
                                   'api_url_prefix': current_app.config.get('API_URL_PREFIX'),})
    
    config = {
        'flask_host': current_app.config.get('FLASK_HOST'),
        'flask_port': current_app.config.get('FLASK_PORT'),
        'api_url_prefix': current_app.config.get('API_URL_PREFIX'),
    }
    return render_template('evaluation_result.html', result=result_data, config=config)

@evaluation_bp.route('/evaluation/<session_id>/data')
def get_evaluation_data(session_id):
    """Get evaluation result data as JSON"""
    result_data = load_evaluation_result(session_id)
    
    if not result_data:
        return jsonify({'error': 'Evaluation result not found'}), 404
    
    return jsonify(result_data)

@evaluation_bp.route('/evaluation/list')
def list_evaluations():
    """List all available evaluation results"""
    try:
        results_dir = ensure_results_directory()
        evaluations = []
        
        for filename in os.listdir(results_dir):
            if filename.endswith('.json'):
                session_id = filename[:-5]  # Remove .json extension
                try:
                    result_data = load_evaluation_result(session_id)
                    if result_data:
                        evaluations.append({
                            'session_id': session_id,
                            'timestamp': result_data.get('timestamp'),
                            'series_name': result_data.get('series_name'),
                            'year': result_data.get('year'),
                            'total_images': result_data.get('total_images', 0),
                            'successful_matches': result_data.get('successful_matches', 0),
                            'overall_success': result_data.get('overall_success', False),
                            'status': result_data.get('status', 'unknown')
                        })
                except Exception as e:
                    print(f"Error loading evaluation {session_id}: {e}")
        
        # Sort by timestamp, newest first
        evaluations.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        config = {
            'flask_host': current_app.config.get('FLASK_HOST'),
            'flask_port': current_app.config.get('FLASK_PORT'),
            'api_url_prefix': current_app.config.get('API_URL_PREFIX'),
        }
        return render_template('evaluation_list.html', evaluations=evaluations, config=config)
        
    except Exception as e:
        config = {
            'flask_host': current_app.config.get('FLASK_HOST'),
            'flask_port': current_app.config.get('FLASK_PORT'),
            'api_url_prefix': current_app.config.get('API_URL_PREFIX'),
        }
        return render_template('evaluation_error.html', 
                             error_message=f"Error loading evaluation list: {str(e)}",
                             config=config)

@evaluation_bp.route('/evaluation/progress')
def evaluation_progress():
    """Server-sent events endpoint for real-time progress updates"""
    try:
        session_id = request.args.get('session_id')
        
        if not session_id:
            return jsonify({'error': 'Session ID is required'}), 400
        
        if session_id not in progress_queues:
            progress_queues[session_id] = Queue()
            progress_queues[session_id].put({
                'type': 'status',
                'message': 'Connecting to evaluation...',
                'progress': 0
            })
        
        def generate():
            progress_queue = progress_queues[session_id]
            
            try:
                while True:
                    try:
                        progress_data = progress_queue.get(timeout=1)
                        yield f"data: {json.dumps(progress_data)}\n\n"
                        
                        if progress_data.get('type') in ['complete', 'error', 'stopped']:
                            break
                            
                    except:
                        heartbeat = {'type': 'heartbeat', 'timestamp': time.time()}
                        yield f"data: {json.dumps(heartbeat)}\n\n"
                        
                        if session_id in active_evaluations:
                            eval_state = active_evaluations[session_id]
                            if eval_state.get('status') not in ['running']:
                                break
            
            except Exception as e:
                print(f"Error in SSE generator: {e}")
            
            finally:
                if session_id in progress_queues:
                    del progress_queues[session_id]
                if session_id in active_evaluations:
                    del active_evaluations[session_id]
        
        response = Response(generate(), mimetype='text/event-stream')
        response.headers['Cache-Control'] = 'no-cache'
        response.headers['Connection'] = 'keep-alive'
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
        
    except Exception as e:
        print(f"Error in evaluation_progress route: {e}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@evaluation_bp.route('/evaluation/status')
def evaluation_status():
    """Get current evaluation status"""
    try:
        session_id = request.args.get('session_id')
        
        if session_id and session_id in active_evaluations:
            return jsonify(active_evaluations[session_id])
        else:
            return jsonify({'status': 'idle', 'message': 'No active evaluation'})
    except Exception as e:
        print(f"Error in evaluation_status route: {e}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@evaluation_bp.route('/evaluation/stop', methods=['POST'])
def stop_evaluation():
    """Stop current evaluation"""
    try:
        session_id = None
        if request.is_json:
            session_id = request.json.get('session_id')
        else:
            session_id = request.form.get('session_id')
        
        if session_id and session_id in active_evaluations:
            active_evaluations[session_id]['status'] = 'stopped'
            if session_id in progress_queues:
                progress_queues[session_id].put({
                    'type': 'stopped',
                    'message': 'Evaluation stopped by user'
                })
            return jsonify({'status': 'stopped'})
        else:
            return jsonify({'error': 'No active evaluation found'}), 404
    except Exception as e:
        print(f"Error in stop_evaluation route: {e}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@evaluation_bp.route('/evaluation/<folder_name>/<id>')
def evaluation_with_folder(folder_name, id):
    """Alternative endpoint using URL parameter"""
    session_id = str(uuid.uuid4())
    folder_path = os.path.join("./images", folder_name)
    
    evaluation_thread = threading.Thread(target=run_evaluation, args=(folder_path, session_id, id))
    evaluation_thread.daemon = True
    evaluation_thread.start()
    
    return jsonify({
        'status': 'started', 
        'message': f'Evaluation started for {folder_name}',
        'session_id': session_id
    })