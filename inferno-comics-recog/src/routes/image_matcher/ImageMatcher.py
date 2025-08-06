import os
import cv2
import time
import json
import uuid
from urllib.parse import urljoin
import requests
import shutil
import hashlib
import queue
import base64
import traceback
import threading
import numpy as np
from util.Logger import get_logger
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from models.SSEProgressTracker import SSEProgressTracker
from models.JavaProgressReporter import JavaProgressReporter
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher
from flask import Blueprint, jsonify, request, Response, current_app, render_template, send_file, abort

logger = get_logger(__name__)

image_matcher_bp = Blueprint('imager-matcher', __name__)

# Global storage for SSE sessions and progress
sse_sessions = {}
progress_data = {}
session_lock = threading.Lock()

# Thread pool for async processing
executor = ThreadPoolExecutor(max_workers=3)

# Constants
SIMILARITY_THRESHOLD = 0.55

def get_global_matcher():
    """Get the global matcher instance from Flask app config"""
    try:
        from flask import current_app
        get_matcher_func = current_app.config.get('GET_MATCHER')
        if get_matcher_func:
            return get_matcher_func()
        else:
            # Fallback: create a new instance (should not happen in production)
            logger.warning("⚠️ Global matcher not found, creating new instance")
            return FeatureMatchingComicMatcher()
    except Exception as e:
        logger.error(f"❌ Error getting global matcher: {e}")
        # Fallback: create a new instance
        return FeatureMatchingComicMatcher()

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

def get_image_hash(image_data):
    """Generate a hash for the image data to avoid duplicates"""
    if isinstance(image_data, np.ndarray):
        # For numpy arrays, encode as PNG first
        _, buffer = cv2.imencode('.png', image_data)
        image_bytes = buffer.tobytes()
    elif isinstance(image_data, str) and image_data.startswith('data:image'):
        # Extract base64 data
        header, base64_data = image_data.split(',', 1)
        image_bytes = base64.b64decode(base64_data)
    elif isinstance(image_data, str):
        # Assume it's already base64 without header
        image_bytes = base64.b64decode(image_data)
    else:
        # Raw bytes
        image_bytes = image_data
    
    return hashlib.md5(image_bytes).hexdigest()

def save_image_to_storage(image_data, session_id, image_name, image_type='query'):
    """
    Save image to server storage and return URL
    FIXED to match Flask app URL structure
    """
    try:
        images_dir = ensure_images_directory()
        
        # Create session subdirectory
        session_dir = os.path.join(images_dir, session_id)
        if not os.path.exists(session_dir):
            os.makedirs(session_dir)
        
        # Handle different input types
        if isinstance(image_data, np.ndarray):
            # OpenCV image array - encode as JPEG
            _, buffer = cv2.imencode('.jpg', image_data, [cv2.IMWRITE_JPEG_QUALITY, 85])
            image_bytes = buffer.tobytes()
        elif isinstance(image_data, str) and image_data.startswith('data:image'):
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
        image_hash = get_image_hash(image_data)
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
        
        # CORRECT: Return URL path that matches your Flask app structure
        # Since all blueprints are registered with /inferno-comics-recognition/api/v1
        return f"/inferno-comics-recognition/api/v1/stored_images/{session_id}/{stored_filename}"
        
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
 
def get_full_image_url(relative_url, request):
    """Convert relative image URLs to full URLs for frontend"""
    if not relative_url:
        return None
    
    if relative_url.startswith('http'):
        return relative_url  # Already a full URL
    
    # Build full URL using Flask request context
    return urljoin(request.url_root, relative_url.lstrip('/'))

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
            'similarity_threshold': float(SIMILARITY_THRESHOLD),
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
                'meets_threshold': bool(match.get('similarity', 0) >= SIMILARITY_THRESHOLD),
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

def safe_progress_callback(callback, current_item, message=""):
    """Safely call progress callback, handling None case"""
    if callback is not None:
        try:
            callback(current_item, message)
        except Exception as e:
            logger.warning(f"⚠️ Progress callback error: {e}")
            pass  # Continue execution even if progress fails

def image_to_base64(image_array):
    """Convert OpenCV image array to base64 data URL"""
    try:
        # Encode image as JPEG
        _, buffer = cv2.imencode('.jpg', image_array)
        # Convert to base64
        image_base64 = base64.b64encode(buffer).decode('utf-8')
        logger.debug("️ Successfully converted image to base64")
        return f"data:image/jpeg;base64,{image_base64}"
    except Exception as e:
        logger.error(f"❌ Error converting image to base64: {e}")
        return None

def process_image_with_centralized_progress(session_id, query_image, candidate_covers, query_filename=None):
    """Process image matching with CENTRALIZED progress reporting to Java"""
    
    # Create Java progress reporter - this is the SINGLE source of truth
    java_reporter = JavaProgressReporter(session_id)
    logger.info(f"🎯 Starting centralized image processing for session: {session_id}")
    
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
        logger.info(f"📋 Prepared {len(candidate_urls)} candidate URLs from {len(candidate_covers)} covers")
        
        if not candidate_urls:
            raise ValueError("No valid URLs found in candidate covers")
        
        # Stage 2: Initializing image analysis (20% -> 25%)
        java_reporter.update_progress('initializing_matcher', 22, 'Initializing image matching engine...')
        
        # Initialize matcher
        matcher = get_global_matcher()
        logger.debug("🔧 Initialized FeatureMatchingComicMatcher with 6 workers")
        
        # Create a safe progress callback wrapper for the matcher
        def safe_matcher_progress(current_item, message=""):
            try:
                # Map the matcher's progress (0 to total_items) to our range (35 to 85)
                progress_range = 85 - 35
                if len(candidate_urls) > 0:
                    item_progress = (current_item / len(candidate_urls)) * progress_range
                    actual_progress = 35 + item_progress
                    java_reporter.update_progress('comparing_images', int(actual_progress), 
                                                f"Processing candidate {current_item}/{len(candidate_urls)}... {message}")
            except Exception as e:
                logger.warning(f"⚠️ Progress callback error: {e}")
        
        java_reporter.update_progress('initializing_matcher', 25, 'Image matching engine ready')
        
        # Stage 3: Feature extraction from query image (25% -> 35%)
        java_reporter.update_progress('extracting_features', 30, 'Extracting features from uploaded image...')
        logger.debug("🔍 Extracting features from query image...")
        
        # Stage 4: Heavy image comparison work (35% -> 85%)
        java_reporter.update_progress('comparing_images', 35, 'Starting image feature comparison...')
        logger.info("⚡ Starting intensive image comparison process...")
        
        # Run matching with progress callback - this is the time-consuming part
        results, query_elements = matcher.find_matches_img(
            query_image, 
            candidate_urls, 
            progress_callback=safe_matcher_progress
        )
        
        java_reporter.update_progress('comparing_images', 85, 'Image comparison complete')
        logger.success("✅ Image comparison completed successfully")
        
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
        
        # Stage 6: Finalizing results (95% -> 98%)
        java_reporter.update_progress('finalizing', 95, f'Finalizing top {min(5, len(enhanced_results))} matches...')
        
        # Return top 5 matches as JSON
        top_matches = enhanced_results[:5]
        
        # Log top matches for debugging
        logger.info(f"📊 Top {len(top_matches)} matches for session {session_id}:")
        for i, match in enumerate(top_matches[:3], 1):
            logger.info(f"   {i}. {match['comic_name']} #{match['issue_number']} - Similarity: {match['similarity']:.3f}")
        
        result = {
            'top_matches': top_matches,
            'total_matches': len(enhanced_results),
            'total_covers_processed': len(candidate_covers),
            'total_urls_processed': len(candidate_urls),
            'session_id': session_id
        }
        
        # Save result to JSON file
        save_image_matcher_result(session_id, result, query_filename, query_image)
        
        java_reporter.send_complete(result)
        logger.success(f"✅ Centralized image processing completed and saved for session: {session_id}")
        
        return result
        
    except Exception as e:
        traceback.print_exc()
        error_msg = f'Image matching failed: {str(e)}'
        java_reporter.send_error(error_msg)
        logger.error(f"❌ Error in centralized image processing for session {session_id}: {error_msg}")
        
        # Save error state as well
        error_result = {
            'top_matches': [],
            'total_matches': 0,
            'total_covers_processed': len(candidate_covers) if candidate_covers else 0,
            'total_urls_processed': 0,
            'session_id': session_id,
            'error': error_msg
        }
        save_image_matcher_result(session_id, error_result, query_filename, query_image)
        
        raise
    
def process_image_with_progress(session_id, query_image, candidate_covers, query_filename=None):
    """Process image matching with progress updates via SSE (fallback for /start endpoint)"""
    
    with session_lock:
        if session_id not in sse_sessions:
            logger.warning(f"⚠️ Session {session_id} not found in SSE sessions")
            return
        tracker = sse_sessions[session_id]['tracker']
    
    logger.info(f" Starting SSE image processing for session: {session_id}")
    
    try:
        # Use the centralized processing but also send to SSE tracker
        result = process_image_with_centralized_progress(session_id, query_image, candidate_covers, query_filename)
        tracker.send_complete(result)
        
    except Exception as e:
        logger.error(f"❌ SSE processing failed for session {session_id}: {e}")
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
            logger.info(f"粒 Cleaned up {len(sessions_to_remove)} old sessions")
      
def process_multiple_images_with_centralized_progress(session_id, query_images_data, candidate_covers):
    """Process multiple images matching with CENTRALIZED progress reporting to Java"""
    
    # Create Java progress reporter - this is the SINGLE source of truth
    java_reporter = JavaProgressReporter(session_id)
    logger.info(f" Starting centralized multiple images processing for session: {session_id} with {len(query_images_data)} images")
    
    try:
        # Continue from where Java left off (10%)
        java_reporter.update_progress('processing_data', 12, f'Processing {len(query_images_data)} uploaded images...')
        
        # Stage 1: Processing candidate data (12% -> 20%)
        java_reporter.update_progress('processing_data', 15, 'Processing candidate cover data...')
        
        # Extract URLs and create mapping (same as single image)
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
        
        java_reporter.update_progress('processing_data', 20, f'Prepared {len(candidate_urls)} candidate images for {len(query_images_data)} query images')
        logger.info(f" Prepared {len(candidate_urls)} candidate URLs from {len(candidate_covers)} covers for {len(query_images_data)} query images")
        
        if not candidate_urls:
            raise ValueError("No valid URLs found in candidate covers")
        
        # Stage 2: Initializing image analysis (20% -> 25%)
        java_reporter.update_progress('initializing_matcher', 22, 'Initializing image matching engine for multiple images...')
        
        # Initialize matcher
        matcher = get_global_matcher()
        logger.debug(" Initialized FeatureMatchingComicMatcher with 6 workers for multiple images")
        
        java_reporter.update_progress('initializing_matcher', 25, 'Image matching engine ready for multiple images')
        
        # Stage 3: Process each image (25% -> 90%)
        all_results = []
        progress_per_image = 65 / len(query_images_data)  # 25% to 90% divided by number of images
        
        for image_index, image_data in enumerate(query_images_data):
            query_image = image_data['image']
            query_filename = image_data['filename']
            query_image_base64 = image_data['base64']
            
            # Calculate progress range for this image
            start_progress = 25 + (image_index * progress_per_image)
            end_progress = 25 + ((image_index + 1) * progress_per_image)
            current_image_num = image_index + 1  # 1-based for display
            
            # CONSISTENT: Clear start message
            java_reporter.update_progress('comparing_images', int(start_progress), 
                                        f'Processing image {current_image_num}/{len(query_images_data)}: {query_filename}')
            
            logger.info(f"️ Processing image {current_image_num}/{len(query_images_data)}: {query_filename}")
            
            # Create progress callback that maintains consistency
            def create_image_progress_callback(img_num, total_imgs, filename, start_prog, end_prog):
                def image_progress_callback(current_item, message=""):
                    try:
                        # Calculate progress within this image's allocated range
                        if len(candidate_urls) > 0:
                            item_progress = (current_item / len(candidate_urls)) * (end_prog - start_prog)
                            actual_progress = start_prog + item_progress
                            
                            # CONSISTENT: Always show image number and filename with clear formatting
                            if current_item == 0:
                                # Starting this image
                                progress_msg = f'Image {img_num}/{total_imgs} ({filename}): Starting analysis'
                            elif current_item >= len(candidate_urls):
                                # Completing this image
                                progress_msg = f'Image {img_num}/{total_imgs} ({filename}): Finalizing results'
                            else:
                                # Processing candidates
                                progress_msg = f'Image {img_num}/{total_imgs} ({filename}): Candidate {current_item}/{len(candidate_urls)}'
                            
                            # Add extra message if provided
                            if message:
                                progress_msg += f' - {message}'
                                
                            java_reporter.update_progress('comparing_images', int(actual_progress), progress_msg)
                    except Exception as e:
                        logger.warning(f"⚠️ Progress callback error for image {img_num}: {e}")
                return image_progress_callback
            
            # Create the callback with captured variables
            progress_callback = create_image_progress_callback(
                current_image_num, len(query_images_data), query_filename, start_progress, end_progress
            )
            
            try:
                # Run matching for this image
                results, query_elements = matcher.find_matches_img(
                    query_image, 
                    candidate_urls, 
                    progress_callback=progress_callback
                )
                
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
                        'session_id': session_id,
                        'source_image_index': image_index,
                        'source_image_name': query_filename
                    }
                    enhanced_results.append(enhanced_result)
                
                # Get top 5 matches for this image
                top_matches = enhanced_results[:5]
                
                # Create result for this image
                image_result = {
                    'image_name': query_filename,
                    'image_index': image_index,
                    'top_matches': top_matches,
                    'total_matches': len(enhanced_results),
                    'session_id': session_id,
                    'image_data': query_image
                }
                
                all_results.append(image_result)
                
                # CONSISTENT: Completion message - clear and informative
                completion_msg = f'Completed image {current_image_num}/{len(query_images_data)}: {query_filename} - {len(top_matches)} matches found'
                java_reporter.update_progress('comparing_images', int(end_progress), completion_msg)
                
                logger.info(f"✅ Completed image {current_image_num}/{len(query_images_data)}: {query_filename} - {len(top_matches)} top matches")
                
                # Log top matches for this image
                if top_matches:
                    logger.info(f" Top matches for {query_filename}:")
                    for i, match in enumerate(top_matches[:3], 1):
                        logger.info(f"   {i}. {match['comic_name']} #{match['issue_number']} - Similarity: {match['similarity']:.3f}")
                
            except Exception as image_error:
                logger.error(f"❌ Error processing image {current_image_num} ({query_filename}): {image_error}")
                
                # CONSISTENT: Error message format
                error_msg = f'Failed image {current_image_num}/{len(query_images_data)}: {query_filename} - {str(image_error)}'
                java_reporter.update_progress('comparing_images', int(end_progress), error_msg)
                
                # Create error result for this image
                error_result = {
                    'image_name': query_filename,
                    'image_index': image_index,
                    'top_matches': [],
                    'total_matches': 0,
                    'session_id': session_id,
                    'error': str(image_error),
                    'image_data': query_image
                }
                all_results.append(error_result)
        
        # Stage 4: Finalizing results (90% -> 100%)
        java_reporter.update_progress('finalizing', 95, f'Finalizing results for {len(query_images_data)} images...')
        
        # Calculate final statistics
        total_matches_all_images = sum(result.get('total_matches', 0) for result in all_results)
        successful_images = sum(1 for result in all_results if result.get('total_matches', 0) > 0)
        
        # Create final result structure
        final_result = {
            'results': all_results,  # Array of individual image results
            'summary': {
                'total_images_processed': len(query_images_data),
                'successful_images': successful_images,
                'failed_images': len(query_images_data) - successful_images,
                'total_matches_all_images': total_matches_all_images,
                'total_covers_processed': len(candidate_covers),
                'total_urls_processed': len(candidate_urls)
            },
            'session_id': session_id
        }
        
        # Save result to JSON file
        sanitized_result = save_multiple_images_matcher_result(session_id, final_result, query_images_data)
        
        # Print cache stats
        matcher.print_cache_stats()
        
        # CONSISTENT: Final completion message
        final_msg = f'Analysis complete! Successfully processed {successful_images}/{len(query_images_data)} images with {total_matches_all_images} total matches'
        
        # Send completion at 100% to Java
        java_reporter.update_progress('complete', 100, final_msg)
        
        for i, result in enumerate(final_result['results']):
            if i < len(sanitized_result['results']):
                result['image_url'] = sanitized_result['results'][i]['image_url']
                        
        # IMPORTANT: Send the complete result to Java
        java_reporter.send_complete(final_result)
        
        logger.success(f"✅ Centralized multiple images processing completed and saved for session: {session_id}")
        
        return final_result
        
    except Exception as e:
        traceback.print_exc()
        error_msg = f'Multiple images matching failed: {str(e)}'
        java_reporter.send_error(error_msg)
        logger.error(f"❌ Error in centralized multiple images processing for session {session_id}: {error_msg}")
        
        # Save error state
        error_result = {
            'results': [],
            'summary': {
                'total_images_processed': len(query_images_data),
                'successful_images': 0,
                'failed_images': len(query_images_data),
                'total_matches_all_images': 0,
                'total_covers_processed': len(candidate_covers) if candidate_covers else 0,
                'total_urls_processed': 0
            },
            'session_id': session_id,
            'error': error_msg
        }
        save_multiple_images_matcher_result(session_id, error_result, query_images_data)
        
        raise

def save_multiple_images_matcher_result(session_id, result_data, query_images_data):
    """Save multiple images matcher result to JSON file with file-based image storage"""
    try:
        results_dir = ensure_results_directory()
        result_file = os.path.join(results_dir, f"{session_id}.json")
        
        # Convert to evaluation-compatible format
        total_matches = result_data.get('summary', {}).get('total_matches_all_images', 0)
        successful_images = result_data.get('summary', {}).get('successful_images', 0)
        
        # Create evaluation-compatible result structure
        evaluation_result = {
            'session_id': session_id,
            'timestamp': datetime.now().isoformat(),
            'status': 'completed',
            'series_name': 'Multiple Images Search',
            'year': None,
            'total_images': len(query_images_data),
            'processed': len(query_images_data),
            'successful_matches': successful_images,
            'failed_uploads': len(query_images_data) - successful_images,
            'no_matches': len(query_images_data) - successful_images,
            'overall_success': successful_images > 0,
            'best_similarity': 0.0,  # Will be calculated below
            'similarity_threshold': float(SIMILARITY_THRESHOLD),
            'total_covers_processed': int(result_data.get('summary', {}).get('total_covers_processed', 0)),
            'total_urls_processed': int(result_data.get('summary', {}).get('total_urls_processed', 0)),
            'query_type': 'multiple_images_search',
            'results': []
        }
        
        # Process each image result
        best_similarity_overall = 0.0
        for image_result in result_data.get('results', []):
            best_similarity_this_image = 0.0
            if image_result.get('top_matches'):
                best_similarity_this_image = max((match.get('similarity', 0) for match in image_result['top_matches']), default=0.0)
                best_similarity_overall = max(best_similarity_overall, best_similarity_this_image)
            
            # Save this image to storage and get URL
            image_url = None
            if 'image_data' in image_result:
                image_url = save_image_to_storage(
                    image_result['image_data'],
                    session_id,
                    image_result.get('image_name', f"Image {image_result.get('image_index', 0) + 1}"),
                    'query'
                )

            del image_result['image_data']
            
            # Create result item for this image
            result_item = {
                'image_name': image_result.get('image_name', f"Image {image_result.get('image_index', 0) + 1}"),
                'image_url': image_url,  # Use URL instead of base64
                'api_success': 'error' not in image_result,
                'match_success': len(image_result.get('top_matches', [])) > 0,
                'best_similarity': float(best_similarity_this_image),
                'status_code': 200 if 'error' not in image_result else 500,
                'error': str(image_result.get('error')) if image_result.get('error') else None,
                'matches': [],
                'total_matches': int(image_result.get('total_matches', 0)),
                'query_type': 'multiple_images_search',
                'source_image_index': int(image_result.get('image_index', 0))
            }
            
            # Add matches for this image with proper type conversion and local storage
            for match in image_result.get('top_matches', []):
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
                    'meets_threshold': bool(match.get('similarity', 0) >= SIMILARITY_THRESHOLD),
                    'comic_name': str(match.get('comic_name', 'Unknown')),
                    'issue_number': str(match.get('issue_number', 'Unknown')),
                    'comic_vine_id': match.get('comic_vine_id'),
                    'parent_comic_vine_id': match.get('parent_comic_vine_id'),
                    'match_details': sanitize_for_json(match.get('match_details', {})),
                    'candidate_features': sanitize_for_json(match.get('candidate_features', {})),
                    'source_image_index': int(match.get('source_image_index', 0)),
                    'source_image_name': str(match.get('source_image_name', ''))
                }
                result_item['matches'].append(match_item)
            
            evaluation_result['results'].append(result_item)
        
        evaluation_result['best_similarity'] = float(best_similarity_overall)
        
        # Sanitize the entire structure
        sanitized_result = sanitize_for_json(evaluation_result)
        
        # Save to JSON file
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(sanitized_result, f, indent=2, ensure_ascii=False)
        
        logger.info(f" Saved multiple images matcher result to {result_file}")
        return sanitized_result
        
    except Exception as e:
        logger.error(f"❌ Error saving multiple images matcher result: {e}")
        return None

@image_matcher_bp.route('/image-matcher', methods=['POST'])
def image_matcher_operation():
    """Enhanced image matching API that handles both regular and SSE progress reporting"""
    
    logger.debug(" Received image matcher request")
    
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
    logger.info(f" Processing image: {query_filename}")
    
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

    # If session_id is provided, this is a CENTRALIZED progress request from Java
    if session_id:
        logger.info(f" Processing CENTRALIZED progress request for session: {session_id}")
        
        try:
            # Process with centralized progress reporting to Java AND save to JSON
            result = process_image_with_centralized_progress(session_id, query_image, candidate_covers, query_filename)
            
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
    logger.info(" Processing regular (non-SSE) request")
    
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
        logger.info(f" Top {len(top_matches)} matches for session {session_id}:")
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
        save_image_matcher_result(session_id, error_result, query_filename, query_image_base64)
        
        return jsonify({'error': f'Matching failed: {str(e)}'}, {'session_id': session_id}), 500

@image_matcher_bp.route('/image-matcher/start', methods=['POST'])
def start_image_processing():
    """Start image processing and return session ID for SSE tracking"""
    
    logger.debug(" Received SSE start request")
    
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
    logger.info(f" Starting SSE processing for image: {query_filename}")
    
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
    
    logger.info(f" Started SSE image processing session: {session_id}")
    
    return jsonify({'sessionId': session_id})

@image_matcher_bp.route('/image-matcher/progress', methods=['GET'])
def get_image_processing_progress():
    """SSE endpoint for real-time progress updates"""
    
    session_id = request.args.get('sessionId')
    if not session_id:
        logger.warning("⚠️ Missing sessionId in progress request")
        return jsonify({'error': 'Missing sessionId parameter'}), 400
    
    logger.info(f" Client connecting to SSE progress stream for session: {session_id}")
    
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
                logger.warning(f"⚠️ SSE session not found: {session_id}")
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
        
        logger.debug(f" SSE stream closed for session: {session_id}")
    
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
    
    logger.debug(f" Status check for session: {session_id}")
    
    with session_lock:
        if session_id not in sse_sessions:
            logger.warning(f"⚠️ Session not found for status check: {session_id}")
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

@image_matcher_bp.route('/image-matcher/<session_id>')
def view_image_matcher_result(session_id):
    """View a completed image matcher result using the existing evaluation template"""
    
    logger.info(f" Viewing result for session: {session_id}")
    
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
    
    logger.debug("🚀 Received multiple images matcher request")
    
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
    
    logger.info(f"📥 Processing {len(uploaded_files)} images in batch request")
    
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
            
            logger.debug(f"🖼️ Successfully decoded image {i+1}/{len(uploaded_files)}: {file.filename} - {query_image.shape}")
            
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
        
        logger.info(f"📋 Received {len(candidate_covers)} candidate covers for {len(query_images_data)} images")
            
    except Exception as e:
        traceback.print_exc()
        logger.error(f"❌ Invalid candidate covers in multiple images request: {e}")
        return jsonify({'error': f'Invalid candidate covers: {str(e)}'}), 400
    
    # Process with centralized progress reporting to Java
    logger.info(f"🔄 Processing CENTRALIZED multiple images progress request for session: {session_id}")
    
    try:
        # Process with centralized progress reporting to Java AND save to JSON
        result = process_multiple_images_with_centralized_progress(session_id, query_images_data, candidate_covers)
        
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

@image_matcher_bp.route('/image-matcher/admin/cleanup', methods=['POST'])
def admin_cleanup():
    """Admin endpoint to trigger cleanup of old images and sessions"""
    try:
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
        logger.error(f"Error during migration: {e}")
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
        print(f"Unexpected error reading session {session_id}: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

def run_cleanup():
    """Run cleanup periodically"""
    def cleanup_task():
        logger.info("粒 Starting cleanup task thread")
        while True:
            time.sleep(30 * 60)  # 30 minutes
            cleanup_old_sessions()
            cleanup_old_stored_images()  # ADD THIS LINE
    
    cleanup_thread = threading.Thread(target=cleanup_task, daemon=True)
    cleanup_thread.start()
    logger.info("粒 Cleanup task initialized")

run_cleanup()