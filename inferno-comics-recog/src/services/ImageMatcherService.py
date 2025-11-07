# services/ImageMatcherService.py
import os
import json
import traceback
import threading
from util.Logger import get_logger
from datetime import datetime
from models.JavaProgressReporter import JavaProgressReporter
from util.Globals import get_global_matcher, get_global_matcher_config
from util.FileOperations import sanitize_for_json, copy_external_image_to_storage, ensure_results_directory, save_image_to_storage

logger = get_logger(__name__)
    
class ImageMatcherService:
    """Service class to handle image matching operations with proper dependency management"""
    
    def __init__(self):
        self.session_lock = threading.Lock()
        self.sse_sessions = {}
        self.progress_data = {}

    def safe_progress_callback(self, callback, current_item, message=""):
        """Safely call progress callback, handling None case"""
        if callback is not None:
            try:
                callback(current_item, message)
            except Exception as e:
                logger.warning(f"Progress callback error: {e}")
                pass  # Continue execution even if progress fails

    def process_multiple_images_with_centralized_progress(self, session_id, query_images_data, candidate_covers):
        """Process multiple images matching with CENTRALIZED progress reporting to Java"""
        
        # Create Java progress reporter - this is the SINGLE source of truth
        java_reporter = JavaProgressReporter(session_id)
        logger.info(f" Starting centralized multiple images processing for session: {session_id} with {len(query_images_data)} images")
        
        try:
            # Continue from where Java left off (10%)
            java_reporter.update_progress('processing_data', 12, f'Processing {len(query_images_data)} uploaded images...')
            
            # Stage 1: Processing candidate data (12% -> 20%)
            java_reporter.update_progress('processing_data', 15, 'Processing candidate cover data...')
            
            # Extract URLs and create mapping (same as single image)
            candidate_urls, url_to_cover_map = self._prepare_candidates(candidate_covers)
            
            java_reporter.update_progress('processing_data', 20, f'Prepared {len(candidate_urls)} candidate images for {len(query_images_data)} query images')
            logger.info(f" Prepared {len(candidate_urls)} candidate URLs from {len(candidate_covers)} covers for {len(query_images_data)} query images")
            
            if not candidate_urls:
                raise ValueError("No valid URLs found in candidate covers")
            
            # Stage 2: Initializing image analysis (20% -> 25%)
            java_reporter.update_progress('initializing_matcher', 22, 'Initializing image matching engine for multiple images...')
            
            # Initialize matcher
            matcher = get_global_matcher()
            logger.debug(" Initialized FeatureMatchingComicMatcher with 6 workers for multiple images")
            
            java_reporter.update_progress('initializing_matcher', 25, 'Image matching engine ready for multiple images')
            
            # Stage 3: Process each image (25% -> 90%)
            all_results = []
            progress_per_image = 65 / len(query_images_data)  # 25% to 90% divided by number of images
            
            for image_index, image_data in enumerate(query_images_data):
                result = self._process_single_image_in_batch(
                    image_data, image_index, query_images_data, 
                    candidate_urls, url_to_cover_map, 
                    java_reporter, progress_per_image, session_id, matcher
                )
                all_results.append(result)
            
            # Stage 4: Finalizing results (90% -> 100%)
            final_result = self._finalize_multiple_images_result(
                all_results, query_images_data, candidate_covers, 
                candidate_urls, session_id, java_reporter
            )

            # Calculate stats for final message
            successful_images = final_result.get('summary', {}).get('successful_images', 0)
            total_matches_all_images = final_result.get('summary', {}).get('total_matches_all_images', 0)

            # Save result to JSON file
            sanitized_result = self.save_multiple_images_matcher_result(session_id, final_result, query_images_data, all_results)
            
            # Print cache stats
            matcher.print_cache_stats()
            
            # CONSISTENT: Final completion message
            final_msg = f'Analysis complete! Successfully processed {successful_images}/{len(query_images_data)} images with {total_matches_all_images} total matches'
            
            # Send completion at 100% to Java
            java_reporter.update_progress('complete', 100, final_msg)
            
            # Update final_result with image URLs from sanitized_result
            if sanitized_result:
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
            logger.error(f"Error in centralized multiple images processing for session {session_id}: {error_msg}")
            
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
                'error': error_msg,
                'percentageComplete': 0,
                'currentStage': 'error',
                'statusMessage': error_msg,
                'totalItems': len(query_images_data),
                'processedItems': 0,
                'successfulItems': 0,
                'failedItems': len(query_images_data)
            }
            self.save_multiple_images_matcher_result(session_id, error_result, query_images_data, [])
            
            raise

    def register_sse_session(self, session_id, tracker):
        """Register a new SSE session"""
        with self.session_lock:
            self.sse_sessions[session_id] = {
                'tracker': tracker,
                'created': datetime.now()
            }
            self.progress_data[session_id] = {
                'status': 'started',
                'stage': 'preparing',
                'progress': 0
            }

    def get_sse_session(self, session_id):
        """Get SSE session data"""
        with self.session_lock:
            return self.sse_sessions.get(session_id)

    def get_progress_data(self, session_id):
        """Get progress data for a session"""
        with self.session_lock:
            return self.progress_data.get(session_id)

    def update_progress_data(self, session_id, data):
        """Update progress data for a session"""
        with self.session_lock:
            if session_id in self.progress_data:
                self.progress_data[session_id].update(data)

    # Private helper methods
    def _prepare_candidates(self, candidate_covers):
        """Extract URLs and create mapping from candidate covers"""
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
        
        return candidate_urls, url_to_cover_map

    def _enhance_results(self, results, url_to_cover_map, session_id):
        """Enhance results with comic names and cover information"""
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
        
        return enhanced_results

    def _process_single_image_in_batch(self, image_data, image_index, query_images_data, 
                                     candidate_urls, url_to_cover_map, 
                                     java_reporter, progress_per_image, session_id, matcher):
        """Process a single image within a batch"""
        query_image = image_data['image']
        query_filename = image_data['filename']
        
        # Calculate progress range for this image
        start_progress = 25 + (image_index * progress_per_image)
        end_progress = 25 + ((image_index + 1) * progress_per_image)
        current_image_num = image_index + 1  # 1-based for display
        
        # Clear start message
        java_reporter.update_progress('comparing_images', int(start_progress), 
                                    f'Processing image {current_image_num}/{len(query_images_data)}: {query_filename}')
        
        logger.info(f"️Processing image {current_image_num}/{len(query_images_data)}: {query_filename}")
        
        # Create progress callback
        def create_image_progress_callback(img_num, total_imgs, filename, start_prog, end_prog):
            def image_progress_callback(current_item, message=""):
                try:
                    if len(candidate_urls) > 0:
                        item_progress = (current_item / len(candidate_urls)) * (end_prog - start_prog)
                        actual_progress = start_prog + item_progress
                        
                        if current_item == 0:
                            progress_msg = f'Image {img_num}/{total_imgs} ({filename}): Starting analysis'
                        elif current_item >= len(candidate_urls):
                            progress_msg = f'Image {img_num}/{total_imgs} ({filename}): Finalizing results'
                        else:
                            progress_msg = f'Image {img_num}/{total_imgs} ({filename}): Candidate {current_item}/{len(candidate_urls)}'
                        
                        if message:
                            progress_msg += f' - {message}'
                            
                        java_reporter.update_progress('comparing_images', int(actual_progress), progress_msg)
                except Exception as e:
                    logger.warning(f"⚠️ Progress callback error for image {img_num}: {e}")
            return image_progress_callback
        
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
            top_matches = enhanced_results[:get_global_matcher_config().get_result_batch()]
            
            # Create result for this image
            image_result = {
                'image_name': query_filename,
                'image_index': image_index,
                'top_matches': top_matches,
                'total_matches': len(enhanced_results),
                'session_id': session_id,
                'image_data': query_image
            }
            
            # Completion message
            completion_msg = f'Completed image {current_image_num}/{len(query_images_data)}: {query_filename} - {len(top_matches)} matches found'
            java_reporter.update_progress('comparing_images', int(end_progress), completion_msg)
            
            logger.info(f"✅ Completed image {current_image_num}/{len(query_images_data)}: {query_filename} - {len(top_matches)} top matches")
            
            return image_result
            
        except Exception as image_error:
            logger.error(f"Error processing image {current_image_num} ({query_filename}): {image_error}")
            
            # Error message format
            error_msg = f'Failed image {current_image_num}/{len(query_images_data)}: {query_filename} - {str(image_error)}'
            java_reporter.update_progress('comparing_images', int(end_progress), error_msg)
            
            # Create error result for this image
            return {
                'image_name': query_filename,
                'image_index': image_index,
                'top_matches': [],
                'total_matches': 0,
                'session_id': session_id,
                'error': str(image_error),
                'image_data': query_image
            }

    def _finalize_multiple_images_result(self, all_results, query_images_data, candidate_covers,
                                        candidate_urls, session_id, java_reporter):
        """Finalize multiple images processing result"""
        java_reporter.update_progress('finalizing', 95, f'Finalizing results for {len(query_images_data)} images...')
        
        # Calculate final statistics
        total_matches_all_images = sum(result.get('total_matches', 0) for result in all_results)
        successful_images = sum(1 for result in all_results if result.get('total_matches', 0) > 0)
        
        # Create a copy of results without numpy arrays for JSON serialization
        serializable_results = []
        for result in all_results:
            result_copy = result.copy()
            # Remove image_data to avoid numpy array serialization issues
            if 'image_data' in result_copy:
                del result_copy['image_data']
            serializable_results.append(result_copy)
        
        # Create final result structure with ALL required fields
        final_result = {
            'results': serializable_results,  # Array of individual image results (without numpy arrays)
            'summary': {
                'total_images_processed': len(query_images_data),
                'successful_images': successful_images,
                'failed_images': len(query_images_data) - successful_images,
                'total_matches_all_images': total_matches_all_images,
                'total_covers_processed': len(candidate_covers),
                'total_urls_processed': len(candidate_urls)
            },
            'session_id': session_id,
            'percentageComplete': 100,
            'currentStage': 'complete',
            'statusMessage': f'Analysis complete! Successfully processed {successful_images}/{len(query_images_data)} images with {total_matches_all_images} total matches',
            'totalItems': len(query_images_data),
            'processedItems': len(query_images_data),
            'successfulItems': successful_images,
            'failedItems': len(query_images_data) - successful_images
        }
        
        # Final completion message
        final_msg = f'Analysis complete! Successfully processed {successful_images}/{len(query_images_data)} images with {total_matches_all_images} total matches'
        java_reporter.update_progress('complete', 100, final_msg)
        
        return final_result

    def save_multiple_images_matcher_result(self, session_id, result_data, query_images_data, all_results_with_images):
        """Save multiple images matcher result to JSON file with file-based image storage"""
        try:
            results_dir = ensure_results_directory()
            result_file = os.path.join(results_dir, f"{session_id}.json")
            
            # Convert to evaluation-compatible format
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
                'similarity_threshold': float(get_global_matcher_config().get_similarity_threshold()),
                'total_covers_processed': int(result_data.get('summary', {}).get('total_covers_processed', 0)),
                'total_urls_processed': int(result_data.get('summary', {}).get('total_urls_processed', 0)),
                'query_type': 'multiple_images_search',
                'results': []
            }
            
            # Process each image result using the original results with image data
            best_similarity_overall = 0.0
            for image_result in all_results_with_images:
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
                
                # Create result item for this image (without image_data)
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
                        'meets_threshold': bool(match.get('similarity', 0) >= get_global_matcher_config().get_similarity_threshold()),
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
            
            logger.info(f" Saved multiple images matcher result to {result_file}")
            return sanitized_result
            
        except Exception as e:
            logger.error(f"Error saving multiple images matcher result: {e}")
            traceback.print_exc()
            return None

# Create a global instance to maintain backward compatibility
# This should be properly injected via dependency injection in a real application
_service_instance = None

def get_service():
    """Get the global service instance"""
    global _service_instance
    if _service_instance is None:
        _service_instance = ImageMatcherService()
    return _service_instance
