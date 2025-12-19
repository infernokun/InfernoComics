import re
import requests

from time import time
from flask import current_app
from util.Logger import get_logger
from config.EnvironmentConfig import JAVA_REQUEST_TIMEOUT, JAVA_PROGRESS_TIMEOUT

logger = get_logger(__name__)

class JavaProgressReporter:
    """Enhanced class to report progress back to Java's progress service"""
    
    def __init__(self, session_id):
        self.session_id = session_id
        self.last_progress_time = 0
        self.last_progress_value = -1
        self.last_stage = ""
        self.min_progress_interval = 0.2
        self.progress_update_count = 0
        self.stage_change_count = 0
        
        # Track process metadata
        self.process_type = None
        self.total_items = None
        self.processed_items = 0
        self.successful_items = 0
        self.failed_items = 0
        
        self.rest_api_url = current_app.config.get('REST_API')

        logger.info(f" Java Progress Service URL: {self.rest_api_url}")
        
        if self.check_java_service_health():
            logger.success("Java progress service is available")
        else:
            logger.warning("Java progress service is not available - progress updates will be logged only")
        
    def check_java_service_health(self):
        """Check if Java progress service is available"""
        try:
            response = requests.get(f"{self.rest_api_url}/health", timeout=2)
            is_healthy = response.status_code == 200
            if is_healthy:
                logger.debug(" Java service health check passed")
            else:
                logger.warning(f"Java service health check failed: status {response.status_code}")
            return is_healthy
        except Exception as e:
            logger.warning(f"Health check failed: {e}")
            return False

    def _extract_process_info_from_message(self, message, stage):
        """Extract process information from progress messages"""
        if not message:
            return {}
        
        extracted_info = {}
        
        # Extract total items from messages like "Processing 5 uploaded images" or "Image 2/10"
        total_match = re.search(r'(\d+)\s+(?:uploaded\s+)?images?|Image\s+\d+/(\d+)', message)
        if total_match:
            total = total_match.group(1) or total_match.group(2)
            if total and self.total_items is None:
                self.total_items = int(total)
                extracted_info['totalItems'] = self.total_items
        
        # Extract current item from messages like "Image 3/10" or "Processing candidate 45/200"
        current_match = re.search(r'Image\s+(\d+)/\d+|candidate\s+(\d+)/\d+|Processing\s+(\d+)', message)
        if current_match:
            current = current_match.group(1) or current_match.group(2) or current_match.group(3)
            if current:
                current_item = int(current)
                # Only update if it's actually progressing forward
                if current_item > self.processed_items:
                    self.processed_items = current_item
                    extracted_info['processedItems'] = self.processed_items
        
        # Track successful/failed items from completion messages
        if 'complete' in message.lower() or 'completed' in message.lower():
            if 'error' not in message.lower() and 'failed' not in message.lower():
                # Successful completion
                success_match = re.search(r'Successfully processed (\d+)/(\d+)', message)
                if success_match:
                    self.successful_items = int(success_match.group(1))
                    total_processed = int(success_match.group(2))
                    self.failed_items = total_processed - self.successful_items
                    extracted_info['successfulItems'] = self.successful_items
                    extracted_info['failedItems'] = self.failed_items
                elif 'image ' in message.lower():
                    # Single image completion
                    self.successful_items += 1
                    extracted_info['successfulItems'] = self.successful_items
        
        if 'failed' in message.lower() or 'error' in message.lower():
            if 'image ' in message.lower():
                self.failed_items += 1
                extracted_info['failedItems'] = self.failed_items
        
        # Set current stage based on stage parameter
        stage_mapping = {
            'processing_data': 'Processing Data',
            'initializing_matcher': 'Initializing Matcher',
            'extracting_features': 'Extracting Features',
            'comparing_images': 'Comparing Images',
            'processing_results': 'Processing Results',
            'finalizing': 'Finalizing Results',
            'completed': 'Completed'
        }
        
        if stage in stage_mapping:
            extracted_info['currentStage'] = stage_mapping[stage]
        elif stage:
            extracted_info['currentStage'] = stage.replace('_', ' ').title()
        
        # Add total items if we have it
        if self.total_items is not None:
            extracted_info['totalItems'] = self.total_items
            
        # Add processed items if we have it
        if self.processed_items > 0:
            extracted_info['processedItems'] = self.processed_items
            
        # Add successful/failed items if we have them
        if self.successful_items > 0:
            extracted_info['successfulItems'] = self.successful_items
        if self.failed_items > 0:
            extracted_info['failedItems'] = self.failed_items
        
        return extracted_info
        
    def update_progress(self, stage, progress, message):
        """Send progress update to Java progress service with enhanced field extraction"""
        
        current_time = time()
        
        is_important_event = (
            stage == 'completed' or 
            'completed' in stage.lower() or 
            stage == 'error' or
            progress >= 100
        )
        
        # CRITICAL: Never rate-limit significant progress jumps (3% or more for multi-image)
        is_significant_progress = abs(progress - self.last_progress_value) >= 3
        
        # CRITICAL: Never rate-limit stage changes
        is_stage_change = stage != self.last_stage
        
        # Allow more frequent updates for multi-image processing
        is_frequent_update_allowed = (
            current_time - self.last_progress_time >= self.min_progress_interval or
            self.progress_update_count < 5
        )
        
        is_image_processing_update = (
            message and (
                'Image ' in message or 
                'image ' in message or 
                'Processing' in message or
                'Completed' in message or
                'Failed' in message
            )
        )
        
        # Rate limit ONLY minor progress updates that aren't image-specific
        should_send_update = (
            is_important_event or 
            is_significant_progress or 
            is_stage_change or 
            is_image_processing_update or
            is_frequent_update_allowed
        )
        
        if not should_send_update:
            logger.debug(f" Rate-limited progress update: {stage} {progress}% - {message[:50]}...")
            return
        
        try:
            # Extract additional information from the message
            extracted_info = self._extract_process_info_from_message(message, stage)
            
            payload = {
                'sessionId': self.session_id,
                'stage': stage,
                'progress': min(100, max(0, progress)), 
                'message': message[:300] if message else "",  # Increased message length for multi-image
                'statusMessage': message[:1000] if message else "",  # Full message for status
                **extracted_info  # Add extracted fields
            }
            
            if is_important_event or is_image_processing_update:
                logger.info(f" Sending IMPORTANT progress to Java: {stage} {progress}% - {message[:100]}...")
                if extracted_info:
                    logger.debug(f" Extracted info: {extracted_info}")
            else:
                logger.debug(f" Sending progress to Java: {stage} {progress}% - {message[:50]}...")
            
            # Send to Java progress service
            response = requests.post(
                f"{self.rest_api_url}/progress/update",
                json=payload,
                timeout=JAVA_PROGRESS_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                # Update tracking variables ONLY after successful send
                self.last_progress_time = current_time
                self.last_progress_value = progress
                self.last_stage = stage
                self.progress_update_count += 1
                
                if is_stage_change:
                    self.stage_change_count += 1
                
                if is_important_event or is_image_processing_update:
                    logger.success(f"IMPORTANT progress sent to Java: {stage} {progress}% - {message[:100] if message else ''}")
                else:
                    logger.debug(f" Progress sent to Java: {stage} {progress}% - {message[:50] if message else ''}")
            else:
                logger.warning(f"Java progress update failed: {response.status_code} - {response.text}")
                
        except requests.exceptions.Timeout:
            logger.warning(f"⏱️ Java progress update timed out for session {self.session_id}")
        except requests.exceptions.ConnectionError:
            logger.warning(f" Java progress service unavailable for session {self.session_id}")
        except Exception as e:
            logger.error(f"Error sending progress to Java for session {self.session_id}: {e}")
    
    def send_complete(self, result):
        """Send completion to Java progress service with final statistics"""
        logger.info(f" Sending COMPLETION to Java for session {self.session_id} (bypassing all rate limits)")
        
        try:
            # Sanitize result for JSON serialization
            sanitized_result = self._sanitize_result(result)
            
            # Extract final statistics from result
            final_stats = self._extract_final_stats_from_result(sanitized_result)
            
            payload = {
                'sessionId': self.session_id,
                'result': sanitized_result,
                **final_stats  # Add final statistics
            }
            
            logger.info(f" Posting completion with results to Java for session {self.session_id}")

            # Log result summary for debugging
            if isinstance(sanitized_result, dict):
                if 'results' in sanitized_result:
                    logger.debug(f" Multi-image result summary: {len(sanitized_result.get('results', []))} image results")
                    if 'summary' in sanitized_result:
                        summary = sanitized_result['summary']
                        logger.debug(f" Summary: {summary.get('successful_images', 0)}/{summary.get('total_images_processed', 0)} successful, {summary.get('total_matches_all_images', 0)} total matches")
                elif 'top_matches' in sanitized_result:
                    logger.debug(f" Single image result: {len(sanitized_result.get('top_matches', []))} matches")
            
            response = requests.post(
                f"{self.rest_api_url}/progress/complete",
                json=payload,
                timeout=JAVA_REQUEST_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                logger.success(f"COMPLETION with results sent successfully to Java for session {self.session_id}")
            else:
                logger.error(f"CRITICAL: Java completion notification failed: {response.status_code} - {response.text}")
                
                # Try once more for completion events
                logger.info(f" Retrying completion send for session {self.session_id}")
                try:
                    retry_response = requests.post(
                        f"{self.rest_api_url}/progress/complete",
                        json=payload,
                        timeout=JAVA_REQUEST_TIMEOUT * 2,
                        headers={'Content-Type': 'application/json'}
                    )
                    if retry_response.status_code == 200:
                        logger.success(f"COMPLETION sent on retry for session {self.session_id}")
                    else:
                        logger.error(f"CRITICAL: Completion retry also failed: {retry_response.status_code}")
                except Exception as retry_error:
                    logger.error(f"CRITICAL: Completion retry exception: {retry_error}")
                
        except Exception as e:
            logger.error(f"CRITICAL: Error sending completion to Java for session {self.session_id}: {e}")
    
    def send_processed_file_info(self, data):
        response = requests.post(
            f"{self.rest_api_url}/progress/processed-file",
            json=data,
            timeout=JAVA_REQUEST_TIMEOUT,
            headers={'Content-Type': 'application/json'}
        )

        if response.status_code == 200:
            logger.success(f"Processed file info sent to Java for session {self.session_id} image: {data['stored_file_name']}")
        else:
            logger.error(f"CRITICAL: Java processed file info notification failed: {response.status_code} - {response.text}")

    def _extract_final_stats_from_result(self, result):
        """Extract final statistics from the result for the completion payload"""
        stats = {}
        
        if isinstance(result, dict):
            # Multi-image results
            if 'summary' in result:
                summary = result['summary']
                stats['totalItems'] = summary.get('total_images_processed', self.total_items)
                stats['successfulItems'] = summary.get('successful_images', self.successful_items)
                stats['failedItems'] = summary.get('failed_images', self.failed_items)
                stats['processedItems'] = summary.get('total_images_processed', self.processed_items)
                
            # Single image results
            elif 'top_matches' in result:
                stats['totalItems'] = 1
                stats['successfulItems'] = 1 if len(result.get('top_matches', [])) > 0 else 0
                stats['failedItems'] = 0 if len(result.get('top_matches', [])) > 0 else 1
                stats['processedItems'] = 1
        
        # Use tracked values as fallback
        if 'totalItems' not in stats and self.total_items:
            stats['totalItems'] = self.total_items
        if 'successfulItems' not in stats and self.successful_items:
            stats['successfulItems'] = self.successful_items
        if 'failedItems' not in stats and self.failed_items:
            stats['failedItems'] = self.failed_items
        if 'processedItems' not in stats and self.processed_items:
            stats['processedItems'] = self.processed_items
        
        # Final completion data
        stats['percentageComplete'] = 100
        stats['currentStage'] = 'Completed'
        stats['statusMessage'] = 'Processing completed successfully'
        
        return stats
    
    def send_error(self, error_message):
        """Send error to Java progress service with error details"""
        logger.error(f" Sending ERROR to Java for session {self.session_id} (bypassing all rate limits)")
        
        try:
            # Include process stats in error payload
            error_stats = {
                'percentageComplete': self.last_progress_value if self.last_progress_value > 0 else 0,
                'currentStage': 'Error',
                'errorMessage': str(error_message)[:2000],  # Longer error message field
                'statusMessage': f'Processing failed: {str(error_message)[:500]}'
            }
            
            if self.total_items:
                error_stats['totalItems'] = self.total_items
            if self.processed_items:
                error_stats['processedItems'] = self.processed_items
            if self.successful_items:
                error_stats['successfulItems'] = self.successful_items
            if self.failed_items:
                error_stats['failedItems'] = self.failed_items
            
            payload = {
                'sessionId': self.session_id,
                'error': str(error_message)[:500],  # Limit error message length
                **error_stats
            }
            
            logger.info(f" Posting error to Java for session {self.session_id}")
            
            response = requests.post(
                f"{self.rest_api_url}/progress/error",
                json=payload,
                timeout=JAVA_REQUEST_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                logger.error(f"ERROR sent to Java for session {self.session_id}")
            else:
                logger.warning(f"Java error notification failed: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error sending error to Java for session {self.session_id}: {e}")
    
    def _sanitize_result(self, result):
        """Sanitize result object for JSON serialization"""
        if isinstance(result, dict):
            sanitized = {}
            for key, value in result.items():
                if isinstance(value, (dict, list)):
                    sanitized[key] = self._sanitize_result(value)
                elif isinstance(value, (str, int, float, bool)) or value is None:
                    sanitized[key] = value
                else:
                    sanitized[key] = str(value)  # Convert complex objects to string
            return sanitized
        elif isinstance(result, list):
            return [self._sanitize_result(item) for item in result]
        else:
            return result
    
    def get_progress_stats(self):
        """Get progress reporting statistics for debugging"""
        return {
            'session_id': self.session_id,
            'total_updates_sent': self.progress_update_count,
            'stage_changes': self.stage_change_count,
            'last_progress': self.last_progress_value,
            'last_stage': self.last_stage,
            'process_type': self.process_type,
            'total_items': self.total_items,
            'processed_items': self.processed_items,
            'successful_items': self.successful_items,
            'failed_items': self.failed_items
        }