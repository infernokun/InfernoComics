import os
import cv2
import json
import requests
import shutil
import hashlib
import base64
import numpy as np
from flask import jsonify
from util.Logger import get_logger
from datetime import datetime
from util.Util import get_full_image_url
from util.Globals import get_global_matcher_config
from models.JavaProgressReporter import JavaProgressReporter

logger = get_logger(__name__)

def ensure_images_directory():
    """Ensure the stored images directory exists"""
    # Get the parent directory of the src folder
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    images_dir = os.path.join(parent_dir, 'stored_images')

    if not os.path.exists(images_dir):
        os.makedirs(images_dir)
        logger.debug(f"Created stored images directory: {images_dir}")
    return images_dir

def save_image_to_storage(image_data, session_id, image_name, image_type='query', add=False):
    """
    Save image to server storage and return URL and hash info
    """
    try:
        images_dir = ensure_images_directory()
        session_dir = os.path.join(images_dir, session_id)
        if not os.path.exists(session_dir):
            os.makedirs(session_dir)
        
        # Handle different input types
        if isinstance(image_data, np.ndarray):
            _, buffer = cv2.imencode('.jpg', image_data, [cv2.IMWRITE_JPEG_QUALITY, 85])
            image_bytes = buffer.tobytes()
        elif isinstance(image_data, str) and image_data.startswith('data:image'):
            header, base64_data = image_data.split(',', 1)
            image_bytes = base64.b64decode(base64_data)
        elif isinstance(image_data, str):
            image_bytes = base64.b64decode(image_data)
        else:
            image_bytes = image_data
        
        # Generate hash from the ACTUAL bytes that will be saved
        saved_image_hash = hashlib.sha256(image_bytes).hexdigest()
        file_extension = os.path.splitext(image_name)[1] or '.jpg'
        stored_filename = f"{image_type}_{saved_image_hash}{file_extension}"
        stored_path = os.path.join(session_dir, stored_filename)
        
        # Save image if it doesn't already exist
        if not os.path.exists(stored_path):
            with open(stored_path, 'wb') as f:
                f.write(image_bytes)
            logger.debug(f"Saved image to {stored_path}")
        else:
            logger.debug(f"Image already exists at {stored_path}")

        process_file_data = {
            "file_hash": saved_image_hash,
            "stored_file_name": stored_filename,
            "original_file_name": image_name,
            "session_id": session_id
        }

        if not add:
            java_reporter = JavaProgressReporter(session_id)

            java_reporter.send_processed_file_info(process_file_data)
        
            return f"/inferno-comics-recognition/api/v1/stored_images/{session_id}/{stored_filename}"
        return f"{session_id}/{stored_filename}"
        
    except Exception as e:
        logger.error(f"Error saving image to storage: {e}")
        return None 

def copy_external_image_to_storage(image_url, session_id, comic_name, issue_number):
    """
    Download and store an external image (like ComicVine covers) locally
    FIXED to match Flask app URL structure and avoid duplicate downloads
    """
    try:
        # Try to reuse from matcher cache first (if available)
        try:
            # Check if we can access the global matcher's cache
            url_hash = hashlib.md5(image_url.encode()).hexdigest()
            cache_dir = os.environ.get('COMIC_CACHE_IMAGE_PATH', '/var/tmp/inferno-comics/image_cache')
            cache_file_path = os.path.join(cache_dir, f"{url_hash}.jpg")
            
            if os.path.exists(cache_file_path):
                logger.debug(f"Found in cache: {cache_file_path}")
                
                # Copy from cache to session directory
                images_dir = ensure_images_directory()
                session_dir = os.path.join(images_dir, session_id)
                if not os.path.exists(session_dir):
                    os.makedirs(session_dir)
                
                # Create safe filename
                safe_comic_name = "".join(c for c in comic_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
                safe_filename = f"candidate_{safe_comic_name}_{issue_number}"
                
                # Get file extension
                parsed_url = image_url.split('?')[0]
                file_extension = os.path.splitext(parsed_url)[1] or '.jpg'
                
                stored_filename = f"{safe_filename}_{url_hash[:8]}{file_extension}"
                session_file_path = os.path.join(session_dir, stored_filename)
                
                # Copy from cache to session if not already there
                if not os.path.exists(session_file_path):
                    shutil.copy2(cache_file_path, session_file_path)
                    logger.debug(f"Copied from cache to session: {session_file_path}")
                
                # CORRECT: Return URL that matches Flask app structure
                return f"/inferno-comics-recognition/api/v1/stored_images/{session_id}/{stored_filename}"
                
        except Exception as cache_error:
            logger.debug(f"Cache check failed: {cache_error}")
            # Continue with download fallback
        
        # Fallback: Download the image (if not in cache)
        safe_comic_name = "".join(c for c in comic_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
        safe_filename = f"candidate_{safe_comic_name}_{issue_number}"
        
        # Try to get file extension from URL
        parsed_url = image_url.split('?')[0]
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
        
        # CORRECT: Return URL that matches Flask app structure
        return f"/inferno-comics-recognition/api/v1/stored_images/{session_id}/{stored_filename}"
        
    except Exception as e:
        logger.warning(f"Failed to get external image {image_url}: {e}")
        # Return original URL as fallback
        return image_url
 
def prepare_result_for_template(result_data, request):
    """Prepare result data for template rendering with full image URLs"""
    if not result_data:
        return result_data
    
    # Create a copy to avoid modifying original
    result_copy = json.loads(json.dumps(result_data))
    
    # Convert relative URLs to full URLs
    for result in result_copy.get('results', []):
        if result.get('image_url'):
            result['image_url'] = get_full_image_url(result['image_url'], request)
        
        for match in result.get('matches', []):
            if match.get('local_url'):
                match['local_url'] = get_full_image_url(match['local_url'], request)
    
    return result_copy

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
                
                # Check for old base64 fields
                if data.get('query_image_base64'):
                    needs_migration = True
                
                for result in data.get('results', []):
                    if result.get('image_base64'):
                        needs_migration = True
                        break
                
                if not needs_migration:
                    continue
                
                logger.info(f" Migrating image matcher result {session_id} to file storage...")
                
                # Migrate query image if exists
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
                
                # Migrate result images
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
                
                # Save migrated data
                with open(result_file, 'w') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                logger.info(f"✅ Successfully migrated image matcher result {session_id}")
                
            except Exception as e:
                logger.error(f"❌ Failed to migrate {session_id}: {e}")
                continue
        
        logger.info("✅ Image matcher migration to file storage completed")
        
    except Exception as e:
        logger.error(f"❌ Error during image matcher migration: {e}")

def ensure_results_directory():
    """Ensure the results directory exists (same as evaluation system)"""
    results_dir = './results'
    if not os.path.exists(results_dir):
        os.makedirs(results_dir)
        logger.debug(f"Created results directory: {results_dir}")
    return results_dir

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
    
def save_image_matcher_result(session_id, result_data, query_filename=None, query_image_data=None):
    """Save image matcher result to JSON file with file-based image storage"""
    try:
        results_dir = ensure_results_directory()
        result_file = os.path.join(results_dir, f"{session_id}.json")
        
        # Save query image to storage and get URL
        query_image_url = None
        if query_image_data is not None:
            query_image_url = save_image_to_storage(
                query_image_data,
                session_id,
                query_filename or 'query_image.jpg',
                'query'
            )
        
        # Convert image matcher result to evaluation-compatible format
        total_matches = len(result_data.get('top_matches', []))
        successful_matches = sum(1 for match in result_data.get('top_matches', []) 
                               if match.get('similarity', 0) >= get_global_matcher_config().get_similarity_threshold())
        
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
            'similarity_threshold': float(get_global_matcher_config().get_similarity_threshold()),
            'total_covers_processed': int(result_data.get('total_covers_processed', 0)),
            'total_urls_processed': int(result_data.get('total_urls_processed', 0)),
            'query_type': 'image_search',  # Distinguish from folder evaluation
            'query_image_url': query_image_url,  # Store URL instead of base64
            'results': []
        }
        
        # Create a single result item representing the query image and its matches
        query_result_item = {
            'image_name': query_filename or 'Uploaded Query Image',
            'image_url': query_image_url,  # Use URL instead of base64
            'api_success': True,
            'match_success': successful_matches > 0,
            'best_similarity': float(evaluation_result['best_similarity']),
            'status_code': 200,
            'error': result_data.get('error'),
            'matches': [],
            'total_matches': total_matches,
            # Additional image matcher specific data
            'query_type': 'image_search'
        }
        
        # Add all matches to the single result item with proper type conversion and local storage
        for match in result_data.get('top_matches', []):
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
                'meets_threshold': bool(match.get('similarity', 0) >= get_global_matcher_config().get_similarity_threshold()),
                'comic_name': str(match.get('comic_name', 'Unknown')),
                'issue_number': str(match.get('issue_number', 'Unknown')),
                'comic_vine_id': match.get('comic_vine_id'),
                'parent_comic_vine_id': match.get('parent_comic_vine_id'),
                'match_details': sanitize_for_json(match.get('match_details', {})),
                'candidate_features': sanitize_for_json(match.get('candidate_features', {}))
            }
            query_result_item['matches'].append(match_item)
        
        evaluation_result['results'].append(query_result_item)
        
        # Sanitize the entire structure
        sanitized_result = sanitize_for_json(evaluation_result)
        
        # Save to JSON file
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(sanitized_result, f, indent=2, ensure_ascii=False)
        
        logger.info(f" Saved image matcher result to {result_file}")
        return result_file
        
    except Exception as e:
        logger.error(f"❌ Error saving image matcher result: {e}")
        return None

def load_image_matcher_result(session_id):
    """Load image matcher result from JSON file (reuse evaluation loader)"""
    try:
        results_dir = ensure_results_directory()
        result_file = os.path.join(results_dir, f"{session_id}.json")
        
        if not os.path.exists(result_file):
            logger.warning(f" Result file not found: {result_file}")
            return None
            
        with open(result_file, 'r') as f:
            data = json.load(f)
            logger.debug(f" Loaded image matcher result from {result_file}")
            return data
            
    except Exception as e:
        logger.error(f"❌ Error loading image matcher result: {e}")
        return None

def delete_session_data(session_id: str) -> dict:
    if not session_id:
        return {
            "session_id": session_id,
            "error": "session_id missing or empty",
            "status": "error"
        }

    results_dir = ensure_results_directory()
    images_dir = ensure_images_directory()

    json_path = os.path.join(results_dir, f"{session_id}.json")
    json_deleted = False
    if os.path.isfile(json_path):
        try:
            os.remove(json_path)
            json_deleted = True
        except OSError as exc:
            logger.error(
                f"Failed to delete JSON file {json_path}: {exc}"
            )
    else:
        json_deleted = True

    images_path = os.path.join(images_dir, session_id)
    images_deleted = False
    if os.path.isdir(images_path):
        try:
            shutil.rmtree(images_path)
            images_deleted = True
        except OSError as exc:
            logger.error(
                f"Failed to delete images folder {images_path}: {exc}"
            )
    else:
        images_deleted = True

    status = "ok" if json_deleted and images_deleted else "error"

    return {
        "session_id": session_id,
        "json_deleted": json_deleted,
        "images_deleted": images_deleted,
        "status": status,
    }