import os
import re
import json
import time
import uuid
import base64
import hashlib
import shutil
import requests
import threading
from queue import Queue
from datetime import datetime, timedelta
from urllib.parse import urljoin
from util.Logger import get_logger
from flask import Blueprint, render_template, request, jsonify, Response, current_app, send_file, abort

logger = get_logger(__name__)

evaluation_bp = Blueprint('evaluation', __name__)

# Global variables for progress tracking
progress_queues = {}  # Dictionary to store progress queues by session
active_evaluations = {}  # Dictionary to store active evaluations by session

# Your existing constants
SIMILARITY_THRESHOLD = 0.55

def ensure_results_directory():
    """Ensure the results directory exists"""
    results_dir = './results'
    if not os.path.exists(results_dir):
        os.makedirs(results_dir)
        logger.debug(f"Created results directory: {results_dir}")
    return results_dir

def ensure_images_directory():
    """Ensure the stored images directory exists"""
    images_dir = './stored_images'
    if not os.path.exists(images_dir):
        os.makedirs(images_dir)
        logger.debug(f"Created stored images directory: {images_dir}")
    return images_dir

def get_image_hash(image_data):
    """Generate a hash for the image data to avoid duplicates"""
    return hashlib.md5(image_data).hexdigest()

def save_image_to_storage(image_data, session_id, image_name, image_type='query'):
    """
    Save image to server storage and return URL
    
    Args:
        image_data: Raw image bytes or base64 string
        session_id: Session identifier
        image_name: Original image filename
        image_type: 'query' for uploaded images, 'candidate' for matched images
    
    Returns:
        str: URL path to access the stored image
    """
    try:
        images_dir = ensure_images_directory()
        
        # Create session subdirectory
        session_dir = os.path.join(images_dir, session_id)
        if not os.path.exists(session_dir):
            os.makedirs(session_dir)
        
        # Handle both raw bytes and base64 data
        if isinstance(image_data, str) and image_data.startswith('data:image'):
            # Extract base64 data
            header, base64_data = image_data.split(',', 1)
            image_bytes = base64.b64decode(base64_data)
        elif isinstance(image_data, str):
            # Assume it's already base64 without header
            image_bytes = base64.b64decode(image_data)
        else:
            # Raw bytes
            image_bytes = image_data
        
        # Generate unique filename with hash to avoid duplicates
        image_hash = get_image_hash(image_bytes)
        file_extension = os.path.splitext(image_name)[1] or '.jpg'
        stored_filename = f"{image_type}_{image_hash}{file_extension}"
        stored_path = os.path.join(session_dir, stored_filename)
        
        # Save image if it doesn't already exist
        if not os.path.exists(stored_path):
            with open(stored_path, 'wb') as f:
                f.write(image_bytes)
            logger.debug(f"Saved image to {stored_path}")
        else:
            logger.debug(f"Image already exists at {stored_path}")
        
        # Return URL path (relative to the web server)
        return f"/stored_images/{session_id}/{stored_filename}"
        
    except Exception as e:
        logger.error(f"Error saving image to storage: {e}")
        return None

def copy_external_image_to_storage(image_url, session_id, comic_name, issue_number):
    """
    Download and store an external image (like ComicVine covers) locally
    
    Args:
        image_url: URL of the external image
        session_id: Session identifier  
        comic_name: Name of the comic
        issue_number: Issue number
    
    Returns:
        str: Local URL path to the stored image, or original URL if failed
    """
    try:
        # Create a safe filename
        safe_comic_name = "".join(c for c in comic_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
        safe_filename = f"candidate_{safe_comic_name}_{issue_number}"
        
        # Try to get file extension from URL
        parsed_url = image_url.split('?')[0]  # Remove query parameters
        file_extension = os.path.splitext(parsed_url)[1] or '.jpg'
        
        images_dir = ensure_images_directory()
        session_dir = os.path.join(images_dir, session_id)
        if not os.path.exists(session_dir):
            os.makedirs(session_dir)
        
        stored_filename = f"{safe_filename}{file_extension}"
        stored_path = os.path.join(session_dir, stored_filename)
        
        # Download and save image if it doesn't exist
        if not os.path.exists(stored_path):
            response = requests.get(image_url, timeout=10, stream=True)
            response.raise_for_status()
            
            with open(stored_path, 'wb') as f:
                shutil.copyfileobj(response.raw, f)
            
            logger.debug(f"Downloaded and saved external image to {stored_path}")
        
        return f"/stored_images/{session_id}/{stored_filename}"
        
    except Exception as e:
        logger.warning(f"Failed to download external image {image_url}: {e}")
        # Return original URL as fallback
        return image_url

def sanitize_for_json(data):
    """Recursively sanitize data to ensure JSON serializability"""
    if isinstance(data, dict):
        return {key: sanitize_for_json(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [sanitize_for_json(item) for item in data]
    elif isinstance(data, (int, float, str, bool, type(None))):
        return data
    elif hasattr(data, 'item'):
        return data.item()
    elif hasattr(data, 'tolist'):
        return data.tolist()
    else:
        # Convert unknown types to string
        return str(data)
    
def save_evaluation_result(session_id, evaluation_state):
    """Save complete evaluation result to JSON file with image storage"""
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
            'total_images': int(evaluation_state.get('total_images', 0)),
            'processed': int(evaluation_state.get('processed', 0)),
            'successful_matches': int(evaluation_state.get('successful_matches', 0)),
            'failed_uploads': int(evaluation_state.get('failed_uploads', 0)),
            'no_matches': int(evaluation_state.get('no_matches', 0)),
            'overall_success': bool(evaluation_state.get('overall_success', False)),
            'best_similarity': float(evaluation_state.get('best_similarity', 0.0)),
            'similarity_threshold': float(SIMILARITY_THRESHOLD),
            'results': []
        }
        
        # Process each result with file-based image storage
        for result in evaluation_state.get('results', []):
            image_name = os.path.basename(result.get('image_path', ''))
            
            # Use stored image URL instead of base64
            image_url = result.get('image_url')
            
            result_item = {
                'image_name': image_name,
                'image_url': image_url,  # URL instead of base64
                'api_success': bool(result.get('api_success', False)),
                'match_success': bool(result.get('match_success', False)),
                'best_similarity': float(result.get('best_similarity', 0.0)),
                'status_code': int(result.get('status_code', 0)) if result.get('status_code') is not None else None,
                'error': str(result.get('error')) if result.get('error') is not None else None,
                'matches': [],
                'total_matches': 0
            }
            
            # Include match details with stored candidate images
            if result.get('api_success') and result.get('response_data') and 'top_matches' in result['response_data']:
                top_matches = result['response_data']['top_matches']
                for match in top_matches:
                    # Store candidate image locally for reliability
                    candidate_url = match.get('url', '')
                    local_candidate_url = copy_external_image_to_storage(
                        candidate_url,
                        session_id,
                        match.get('comic_name', 'Unknown'),
                        match.get('issue_number', 'Unknown')
                    )
                    
                    match_item = {
                        'similarity': float(match.get('similarity', 0)),
                        'url': candidate_url,  # Keep original URL
                        'local_url': local_candidate_url,  # Add local stored URL
                        'meets_threshold': bool(match.get('similarity', 0) >= SIMILARITY_THRESHOLD)
                    }
                    result_item['matches'].append(match_item)
                result_item['total_matches'] = int(result['response_data'].get('total_matches', 0))
            
            result_data['results'].append(result_item)
        
        # Sanitize the entire structure to ensure JSON compatibility
        sanitized_data = sanitize_for_json(result_data)
        
        # Save to JSON file with error handling
        try:
            with open(result_file, 'w') as f:
                json.dump(sanitized_data, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved evaluation result to {result_file}")
            return result_file
        except (TypeError, ValueError) as json_error:
            logger.error(f"❌ JSON serialization error: {json_error}")
            # Try to save without problematic data
            minimal_data = {
                'session_id': session_id,
                'timestamp': datetime.now().isoformat(),
                'status': 'error',
                'series_name': evaluation_state.get('series_name', 'Unknown'),
                'year': evaluation_state.get('year'),
                'total_images': int(evaluation_state.get('total_images', 0)),
                'error': f'JSON serialization failed: {str(json_error)}',
                'results': []
            }
            with open(result_file, 'w') as f:
                json.dump(minimal_data, f, indent=2)
            logger.warning(f"⚠️ Saved minimal result due to serialization error")
            return result_file
        
    except Exception as e:
        logger.error(f"❌ Error saving evaluation result: {e}")
        return None

def load_evaluation_result(session_id):
    """Load evaluation result from JSON file with improved error handling"""
    try:
        results_dir = ensure_results_directory()
        result_file = os.path.join(results_dir, f"{session_id}.json")
        
        if not os.path.exists(result_file):
            logger.warning(f"⚠️ Evaluation result file not found: {result_file}")
            return None
        
        # Try to load the JSON file
        try:
            with open(result_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logger.debug(f"✅ Loaded evaluation result from {result_file}")
            return data
        except json.JSONDecodeError as json_error:
            logger.error(f"❌ JSON decode error in {result_file}: {json_error}")
            
            # Try to repair the file by reading line by line and finding the corruption point
            try:
                with open(result_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Look for common corruption patterns and try to fix them
                # Remove any null bytes or other binary data
                cleaned_content = content.replace('\x00', '').replace('\ufffd', '')
                
                # Try to parse the cleaned content
                data = json.loads(cleaned_content)
                logger.info(f"✅ Successfully repaired and loaded {result_file}")
                
                # Save the repaired version
                backup_file = result_file.replace('.json', '_backup.json')
                os.rename(result_file, backup_file)
                with open(result_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                logger.info(f"Saved repaired file, backup at {backup_file}")
                
                return data
                
            except Exception as repair_error:
                logger.error(f"❌ Could not repair {result_file}: {repair_error}")
                
                # Create a minimal error result
                error_result = {
                    'session_id': session_id,
                    'timestamp': datetime.now().isoformat(),
                    'status': 'corrupted',
                    'series_name': 'Unknown (Corrupted Data)',
                    'year': None,
                    'total_images': 0,
                    'processed': 0,
                    'successful_matches': 0,
                    'failed_uploads': 0,
                    'no_matches': 0,
                    'overall_success': False,
                    'best_similarity': 0.0,
                    'similarity_threshold': SIMILARITY_THRESHOLD,
                    'error': f'Original file corrupted: {str(json_error)}',
                    'results': []
                }
                
                # Save the error result
                error_file = result_file.replace('.json', '_error.json')
                with open(error_file, 'w') as f:
                    json.dump(error_result, f, indent=2)
                
                logger.info(f"Created error placeholder at {error_file}")
                return error_result
                
    except Exception as e:
        logger.error(f"❌ Error loading evaluation result: {e}")
        return None

def prepare_result_for_template(result_data, request):
    """Prepare result data for template rendering with full image URLs"""
    if not result_data:
        return result_data
    
    # Create a copy to avoid modifying original
    result_copy = json.loads(json.dumps(result_data))
    
    # Convert relative URLs to full URLs
    if result_copy.get('query_image_url'):
        result_copy['query_image_url'] = get_full_image_url(result_copy['query_image_url'], request)
    
    for result in result_copy.get('results', []):
        if result.get('image_url'):
            result['image_url'] = get_full_image_url(result['image_url'], request)
        
        for match in result.get('matches', []):
            if match.get('local_url'):
                match['local_url'] = get_full_image_url(match['local_url'], request)
    
    return result_copy

def get_full_image_url(relative_url, request):
    """Convert relative image URLs to full URLs for frontend"""
    if not relative_url:
        return None
    
    if relative_url.startswith('http'):
        return relative_url  # Already a full URL
    
    # Build full URL using Flask request context
    return urljoin(request.url_root, relative_url.lstrip('/'))

def cleanup_old_stored_images():
    """Clean up stored images older than 7 days"""
    try:
        images_dir = ensure_images_directory()
        current_time = datetime.now()
        cutoff_time = current_time - timedelta(days=7)
        
        cleaned_count = 0
        for session_dir in os.listdir(images_dir):
            session_path = os.path.join(images_dir, session_dir)
            if os.path.isdir(session_path):
                # Check if directory is older than cutoff
                dir_modified = datetime.fromtimestamp(os.path.getmtime(session_path))
                if dir_modified < cutoff_time:
                    try:
                        shutil.rmtree(session_path)
                        cleaned_count += 1
                        logger.info(f"Cleaned up old image directory: {session_path}")
                    except Exception as e:
                        logger.warning(f"Failed to clean up {session_path}: {e}")
        
        if cleaned_count > 0:
            logger.info(f"Cleaned up {cleaned_count} old image directories")
            
    except Exception as e:
        logger.error(f"Error during image cleanup: {e}")

def migrate_existing_results_to_file_storage():
    """Migrate existing JSON results from base64 to file storage"""
    try:
        results_dir = ensure_results_directory()
        
        for filename in os.listdir(results_dir):
            if not filename.endswith('.json'):
                continue
                
            session_id = filename[:-5]  # Remove .json extension
            result_file = os.path.join(results_dir, filename)
            
            try:
                with open(result_file, 'r') as f:
                    data = json.load(f)
                
                # Check if this result needs migration (has base64 data)
                needs_migration = False
                
                for result in data.get('results', []):
                    if result.get('image_base64'):
                        needs_migration = True
                        break
                
                if not needs_migration:
                    continue
                
                logger.info(f"Migrating result {session_id} to file storage...")
                
                # Migrate query images
                for result in data.get('results', []):
                    if result.get('image_base64'):
                        # Save base64 image to file storage
                        image_url = save_image_to_storage(
                            result['image_base64'],
                            session_id,
                            result.get('image_name', 'migrated_image.jpg'),
                            'query'
                        )
                        
                        if image_url:
                            result['image_url'] = image_url
                            # Remove base64 data
                            del result['image_base64']
                
                # Update global query image if exists
                if data.get('query_image_base64'):
                    query_image_url = save_image_to_storage(
                        data['query_image_base64'],
                        session_id,
                        'query_image.jpg',
                        'query'
                    )
                    if query_image_url:
                        data['query_image_url'] = query_image_url
                        del data['query_image_base64']
                
                # Save migrated data
                with open(result_file, 'w') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                logger.info(f"Successfully migrated {session_id}")
                
            except Exception as e:
                logger.error(f"Failed to migrate {session_id}: {e}")
                continue
        
        logger.info("Migration to file storage completed")
        
    except Exception as e:
        logger.error(f"Error during migration: {e}")

def extract_name_and_year(folder_path):
    """Extract series name and year from folder name like 'Green Lanterns (2016)'"""
    folder_name = os.path.basename(folder_path.rstrip('/\\'))
    logger.debug(f"Extracting from folder name: '{folder_name}'")
    
    # Extract year from parentheses
    year_match = re.search(r'\((\d{4})\)', folder_name)
    year = int(year_match.group(1)) if year_match else None
    
    # Extract name by removing year and parentheses
    name = re.sub(r'\s*\(\d{4}\)\s*', '', folder_name).strip()
    
    logger.info(f"Extracted series: '{name}' ({year})")
    return name, year

def get_image_files(folder_path):
    """Get all image files from the folder"""
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    image_files = []
    
    for file in os.listdir(folder_path):
        if any(file.lower().endswith(ext) for ext in image_extensions):
            image_files.append(os.path.join(folder_path, file))
    
    logger.debug(f"Found {len(image_files)} image files in {folder_path}")
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
            logger.debug(f"Converted {os.path.basename(image_path)} to base64")
            return f"data:{mime_type};base64,{encoded}"
    except Exception as e:
        logger.error(f"❌ Error converting image to base64: {e}")
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
    
    meets_threshold = best_similarity >= threshold
    logger.debug(f"Match check: best={best_similarity:.3f}, threshold={threshold}, meets={meets_threshold}")
    return meets_threshold, best_similarity

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
            
            image_name = os.path.basename(image_path)
            logger.debug(f"Uploading {image_name} to API...")
            response = requests.post(url, files=files, data=data)
            logger.debug(f"API response status: {response.status_code}")
            
            # Try to parse JSON response
            response_data = None
            try:
                raw_response = response.json()
                logger.debug(f"✅ Successfully parsed JSON response")
                
                # Handle the case where server returns an array directly
                if isinstance(raw_response, list):
                    # Convert array format to expected dictionary format
                    response_data = {
                        'top_matches': raw_response,
                        'total_matches': len(raw_response)
                    }
                    logger.debug(f"Converted array response to dict format - {len(raw_response)} matches")
                elif isinstance(raw_response, dict):
                    # Server already returns expected format
                    response_data = raw_response
                    logger.debug(f"✅ Response already in dict format")
                else:
                    logger.warning(f"⚠️ Unexpected response type: {type(raw_response)}")
                    
            except ValueError as json_error:
                logger.warning(f"⚠️ Failed to parse JSON: {json_error}")
                logger.debug(f"Raw response: {response.text[:500]}...")
            
            # Check if this constitutes a successful match based on similarity threshold
            api_success = response.status_code == 200
            match_success = False
            best_similarity = 0.0
            
            if api_success and response_data:
                match_success, best_similarity = check_match_success(response_data)
            
            # Log result
            if api_success:
                if match_success:
                    logger.success(f"✅ {image_name}: Match found (similarity: {best_similarity:.3f})")
                else:
                    logger.warning(f"⚠️ {image_name}: No match (best: {best_similarity:.3f})")
            else:
                logger.error(f"❌ {image_name}: API failed (status: {response.status_code})")
            
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
        logger.error(f"Request exception for {os.path.basename(image_path)}: {e}")
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
        logger.error(f"Unexpected exception for {os.path.basename(image_path)}: {e}")
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
    """Run the evaluation process with progress updates and image storage"""

    logger.info(f"Starting evaluation for session {session_id} with folder {folder_path}")

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

        logger.debug(f"Checking folder path: {folder_path}")
        logger.debug(f"Folder exists: {os.path.exists(folder_path)}")

        # Check if folder exists
        if not os.path.exists(folder_path):
            # Try to find a matching folder
            base_dir = os.path.dirname(folder_path)
            folder_name = os.path.basename(folder_path)

            logger.warning(f"⚠️ Folder not found, searching in: {base_dir}")

            if os.path.exists(base_dir):
                available_folders = []
                for item in os.listdir(base_dir):
                    item_path = os.path.join(base_dir, item)
                    if os.path.isdir(item_path):
                        available_folders.append(item)
                        if folder_name.lower() in item.lower():
                            folder_path = item_path
                            logger.info(f"Found matching folder: {folder_path}")
                            break
                else:
                    error_msg = f'Folder not found: {folder_name}. Available folders: {", ".join(available_folders[:5])}'
                    logger.error(f"❌ {error_msg}")
                    progress_queue.put({
                        'type': 'error',
                        'message': error_msg
                    })
                    return
            else:
                error_msg = f'Images directory not found: {base_dir}'
                logger.error(f"❌ {error_msg}")
                progress_queue.put({
                    'type': 'error',
                    'message': error_msg
                })
                return

        # Extract series information
        series_name, year = extract_name_and_year(folder_path)
        evaluation_state['series_name'] = series_name
        evaluation_state['year'] = year

        if not series_name or not year:
            error_msg = 'Could not extract series name and year from folder name. Expected format: "Series Name (YYYY)"'
            logger.error(f"❌ {error_msg}")
            progress_queue.put({
                'type': 'error',
                'message': error_msg
            })
            return

        progress_queue.put({
            'type': 'status',
            'message': f'Processing series: {series_name} ({year})',
            'progress': 5
        })

        # Get image files
        image_files = get_image_files(folder_path)

        if not image_files:
            error_msg = 'No image files found in the folder!'
            logger.error(f"❌ {error_msg}")
            progress_queue.put({
                'type': 'error',
                'message': error_msg
            })
            return

        evaluation_state['total_images'] = len(image_files)
        logger.info(f"Found {len(image_files)} images to process")

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
                logger.warning(f"Evaluation stopped for session {session_id}")
                break

            image_name = os.path.basename(image_path)
            evaluation_state['current_image'] = image_name

            logger.info(f"Processing image {i+1}/{len(image_files)}: {image_name}")

            # Read image and save to storage
            with open(image_path, 'rb') as f:
                image_data = f.read()
            
            # Save image to storage and get URL
            image_url = save_image_to_storage(
                image_data, 
                session_id, 
                image_name, 
                'query'
            )

            # Send processing update with image URL
            progress_queue.put({
                'type': 'processing',
                'message': f'Processing {i+1}/{len(image_files)}: {image_name}',
                'progress': 10 + (i * 80 / len(image_files)),
                'current_image': image_name,
                'current_image_url': image_url,  # Use URL instead of base64
                'processed': i,
                'total_images': len(image_files)
            })

            # Upload image
            result = upload_comic_image(series_id, image_path, series_name, year)
            result['image_path'] = image_path
            result['image_url'] = image_url  # Store URL instead of base64
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
                'image_url': image_url,  # Use URL instead of base64
                'api_success': result['api_success'],
                'match_success': result['match_success'],
                'best_similarity': result['best_similarity'],
                'error': result['error'],
                'matches': []
            }

            # Include match details with stored candidate images
            if result['api_success'] and result['response_data'] and 'top_matches' in result['response_data']:
                top_matches = result['response_data']['top_matches'][:6]  # Top 6 matches
                for match in top_matches:
                    # Store candidate image locally
                    original_url = match.get('url', '')
                    local_candidate_url = copy_external_image_to_storage(
                        original_url,
                        session_id,
                        match.get('comic_name', 'Unknown'),
                        match.get('issue_number', 'Unknown')
                    )
                    
                    detailed_result['matches'].append({
                        'similarity': match.get('similarity', 0),
                        'url': original_url,  # Keep original URL
                        'local_url': local_candidate_url,  # Add local stored URL
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

        # Save the complete evaluation result to file with image storage
        save_evaluation_result(session_id, evaluation_state)

        logger.success(f"✅ Evaluation completed for session {session_id}")
        logger.info(f"Final stats: {evaluation_state['successful_matches']} successes, {evaluation_state['no_matches']} no matches, {evaluation_state['failed_uploads']} failures")

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
        logger.error(f"❌ Evaluation error for session {session_id}: {e}")
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
        logger.debug("GET request for evaluation page")
        # Pass configuration to template
        config = {
            'flask_host': current_app.config.get('FLASK_HOST'),
            'flask_port': current_app.config.get('FLASK_PORT'),
            'api_url_prefix': current_app.config.get('API_URL_PREFIX')
        }
        return render_template('evaluation.html', config=config)
    
    elif request.method == 'POST':
        logger.debug("POST request to start evaluation")
        folder = None
        series_id = None
        if request.is_json:
            folder = request.json.get('folder')
            series_id = request.json.get('seriesId')
        else:
            folder = request.form.get('folder')
            series_id = request.form.get('seriesId')
            
        if not folder:
            logger.warning("⚠️ Missing folder parameter in evaluation request")
            return jsonify({'error': 'Folder parameter is required'}), 400
        
        if not series_id:
            logger.warning("⚠️ Missing series ID parameter in evaluation request")
            return jsonify({'error': 'Series ID parameter is required'}), 400
        
        session_id = str(uuid.uuid4())
        folder_path = os.path.join("./images", folder)
        
        logger.info(f"Starting evaluation thread for session {session_id} with folder: {folder}")
        
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
    """View a completed evaluation result with image URLs"""
    logger.info(f"Viewing evaluation result for session: {session_id}")
    
    result_data = load_evaluation_result(session_id)
    
    if not result_data:
        logger.warning(f"⚠️ Evaluation result not found for session: {session_id}")
        return render_template('evaluation_error.html', 
                             error_message=f"Evaluation result not found for session: {session_id}",
                             config={'flask_host': current_app.config.get('FLASK_HOST'), 
                                   'flask_port': current_app.config.get('FLASK_PORT'),
                                   'api_url_prefix': current_app.config.get('API_URL_PREFIX')})
    
    # Prepare result data with full image URLs for template
    result_with_urls = prepare_result_for_template(result_data, request)
    
    logger.success(f"✅ Successfully loaded evaluation result for session: {session_id}")
    config = {
        'flask_host': current_app.config.get('FLASK_HOST'),
        'flask_port': current_app.config.get('FLASK_PORT'),
        'api_url_prefix': current_app.config.get('API_URL_PREFIX')
    }
    return render_template('evaluation_result.html', result=result_with_urls, config=config)

@evaluation_bp.route('/evaluation/<session_id>/data')
def get_evaluation_data(session_id):
    """Get evaluation result data as JSON"""
    logger.debug(f"API request for evaluation data: {session_id}")
    
    result_data = load_evaluation_result(session_id)
    
    if not result_data:
        logger.warning(f"⚠️ Evaluation data not found for session: {session_id}")
        return jsonify({'error': 'Evaluation result not found'}), 404
    
    logger.debug(f"✅ Successfully returned evaluation data for session: {session_id}")
    return jsonify(result_data)

@evaluation_bp.route('/evaluation/list')
def list_evaluations():
    """List all available evaluation results"""
    logger.info("Listing all evaluation results")
    
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
                    logger.warning(f"⚠️ Error loading evaluation {session_id}: {e}")
        
        # Sort by timestamp, newest first
        evaluations.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        logger.info(f"Found {len(evaluations)} evaluation results")
        
        config = {
            'flask_host': current_app.config.get('FLASK_HOST'),
            'flask_port': current_app.config.get('FLASK_PORT'),
            'api_url_prefix': current_app.config.get('API_URL_PREFIX'),
        }
        return render_template('evaluation_list.html', evaluations=evaluations, config=config)
        
    except Exception as e:
        logger.error(f"❌ Error loading evaluation list: {e}")
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
            logger.warning("⚠️ Missing session ID in progress request")
            return jsonify({'error': 'Session ID is required'}), 400
        
        logger.info(f"Client connecting to evaluation progress stream for session: {session_id}")
        
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
                            logger.debug(f"SSE stream ending for evaluation session {session_id}: {progress_data.get('type')}")
                            break
                            
                    except:
                        heartbeat = {'type': 'heartbeat', 'timestamp': time.time()}
                        yield f"data: {json.dumps(heartbeat)}\n\n"
                        
                        if session_id in active_evaluations:
                            eval_state = active_evaluations[session_id]
                            if eval_state.get('status') not in ['running']:
                                break
            
            except Exception as e:
                logger.error(f"❌ Error in SSE generator for evaluation: {e}")
            
            finally:
                logger.debug(f"Cleaning up SSE session: {session_id}")
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
        logger.error(f"❌ Error in evaluation_progress route: {e}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@evaluation_bp.route('/evaluation/status')
def evaluation_status():
    """Get current evaluation status"""
    try:
        session_id = request.args.get('session_id')
        
        if session_id and session_id in active_evaluations:
            logger.debug(f"Status check for active evaluation: {session_id}")
            return jsonify(active_evaluations[session_id])
        else:
            logger.debug("No active evaluation found")
            return jsonify({'status': 'idle', 'message': 'No active evaluation'})
    except Exception as e:
        logger.error(f"❌ Error in evaluation_status route: {e}")
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
            logger.warning(f"Stopping evaluation for session: {session_id}")
            active_evaluations[session_id]['status'] = 'stopped'
            if session_id in progress_queues:
                progress_queues[session_id].put({
                    'type': 'stopped',
                    'message': 'Evaluation stopped by user'
                })
            return jsonify({'status': 'stopped'})
        else:
            logger.warning(f"⚠️ No active evaluation found to stop for session: {session_id}")
            return jsonify({'error': 'No active evaluation found'}), 404
    except Exception as e:
        logger.error(f"❌ Error in stop_evaluation route: {e}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@evaluation_bp.route('/evaluation/<folder_name>/<id>')
def evaluation_with_folder(folder_name, id):
    """Alternative endpoint using URL parameter"""
    logger.info(f"Starting evaluation via URL parameters - folder: {folder_name}, id: {id}")
    
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

# Flask route to serve stored images
@evaluation_bp.route('/stored_images/<session_id>/<filename>')
def serve_stored_image(session_id, filename):
    """Serve stored images from the server"""
    try:
        images_dir = ensure_images_directory()
        image_path = os.path.join(images_dir, session_id, filename)
        
        if not os.path.exists(image_path):
            logger.warning(f"Stored image not found: {image_path}")
            abort(404)
        
        # Security check - ensure the path is within our images directory
        if not os.path.abspath(image_path).startswith(os.path.abspath(images_dir)):
            logger.warning(f"Security violation - path traversal attempt: {image_path}")
            abort(403)
        
        return send_file(image_path)
        
    except Exception as e:
        logger.error(f"Error serving stored image: {e}")
        abort(500)

# Admin endpoints for cleanup and migration
@evaluation_bp.route('/evaluation/admin/cleanup', methods=['POST'])
def admin_cleanup():
    """Admin endpoint to trigger cleanup of old images and sessions"""
    try:
        # Check for admin authentication if needed
        # ... add your admin auth logic here ...
        
        cleanup_old_stored_images()
        
        return jsonify({
            'status': 'success',
            'message': 'Cleanup completed successfully'
        })
        
    except Exception as e:
        logger.error(f"Error during admin cleanup: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Cleanup failed: {str(e)}'
        }), 500

@evaluation_bp.route('/evaluation/admin/migrate', methods=['POST'])
def admin_migrate():
    """Admin endpoint to migrate existing base64 results to file storage"""
    try:
        # Check for admin authentication if needed
        # ... add your admin auth logic here ...
        
        migrate_existing_results_to_file_storage()
        
        return jsonify({
            'status': 'success',
            'message': 'Migration to file storage completed successfully'
        })
        
    except Exception as e:
        logger.error(f"Error during migration: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Migration failed: {str(e)}'
        }), 500
    