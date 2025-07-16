import os
import requests
from time import time
from flask import current_app
from util.Logger import get_logger

logger = get_logger(__name__)

# Timeout settings for Java communication
JAVA_REQUEST_TIMEOUT = int(os.getenv('JAVA_REQUEST_TIMEOUT', '5'))  # seconds
JAVA_PROGRESS_TIMEOUT = int(os.getenv('JAVA_PROGRESS_TIMEOUT', '2'))  # seconds

# Progress reporting settings
PROGRESS_BATCH_SIZE = int(os.getenv('PROGRESS_BATCH_SIZE', '5'))  # Update every N candidates
MAX_PROGRESS_UPDATES = int(os.getenv('MAX_PROGRESS_UPDATES', '20'))  # Max updates during matching

class JavaProgressReporter:
    """Enhanced class to report progress back to Java's progress service"""
    
    def __init__(self, session_id):
        self.session_id = session_id
        self.last_progress_time = 0
        self.last_progress_value = -1
        self.last_stage = ""
        self.min_progress_interval = 0.2  # REDUCED from 0.5 to 0.2 seconds
        self.progress_update_count = 0
        self.stage_change_count = 0
        
        self.rest_api_url = current_app.config.get('REST_API')

        logger.info(f" Java Progress Service URL: {self.rest_api_url}")
        
        if self.check_java_service_health():
            logger.success("✅ Java progress service is available")
        else:
            logger.warning("⚠️ Java progress service is not available - progress updates will be logged only")
        
    def check_java_service_health(self):
        """Check if Java progress service is available"""
        try:
            response = requests.get(f"{self.rest_api_url}/health", timeout=2)
            is_healthy = response.status_code == 200
            if is_healthy:
                logger.debug(" Java service health check passed")
            else:
                logger.warning(f"⚠️ Java service health check failed: status {response.status_code}")
            return is_healthy
        except Exception as e:
            logger.warning(f"⚠️ Health check failed: {e}")
            return False

        
    def update_progress(self, stage, progress, message):
        """Send progress update to Java progress service with improved rate limiting for multiple images"""
        
        current_time = time()
        
        # CRITICAL: Never rate-limit completion, error, or important events
        is_important_event = (
            stage == 'complete' or 
            'complete' in stage.lower() or 
            stage == 'error' or
            progress >= 100
        )
        
        # CRITICAL: Never rate-limit significant progress jumps (3% or more for multi-image)
        is_significant_progress = abs(progress - self.last_progress_value) >= 3
        
        # CRITICAL: Never rate-limit stage changes
        is_stage_change = stage != self.last_stage
        
        # IMPROVED: Allow more frequent updates for multi-image processing
        is_frequent_update_allowed = (
            current_time - self.last_progress_time >= self.min_progress_interval or
            self.progress_update_count < 5  # Allow first 5 updates regardless of timing
        )
        
        # IMPROVED: Special handling for image processing messages
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
            logger.debug(f" Rate-limited progress update: {stage} {progress}% - {message[:50]}...")
            return
        
        try:
            payload = {
                'sessionId': self.session_id,
                'stage': stage,
                'progress': min(100, max(0, progress)),  # Clamp between 0-100
                'message': message[:300] if message else ""  # Increased message length for multi-image
            }
            
            if is_important_event or is_image_processing_update:
                logger.info(f" Sending IMPORTANT progress to Java: {stage} {progress}% - {message[:100]}...")
            else:
                logger.debug(f" Sending progress to Java: {stage} {progress}% - {message[:50]}...")
            
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
                    logger.success(f"✅ IMPORTANT progress sent to Java: {stage} {progress}% - {message[:100] if message else ''}")
                else:
                    logger.debug(f" Progress sent to Java: {stage} {progress}% - {message[:50] if message else ''}")
            else:
                logger.warning(f"⚠️ Java progress update failed: {response.status_code} - {response.text}")
                
        except requests.exceptions.Timeout:
            logger.warning(f"⏱️ Java progress update timed out for session {self.session_id}")
        except requests.exceptions.ConnectionError:
            logger.warning(f" Java progress service unavailable for session {self.session_id}")
        except Exception as e:
            logger.error(f"❌ Error sending progress to Java for session {self.session_id}: {e}")
    
    def send_complete(self, result):
        """Send completion to Java progress service - NEVER rate limited"""
        logger.info(f" Sending COMPLETION to Java for session {self.session_id} (bypassing all rate limits)")
        
        try:
            # Sanitize result for JSON serialization
            sanitized_result = self._sanitize_result(result)
            
            payload = {
                'sessionId': self.session_id,
                'result': sanitized_result
            }
            
            logger.info(f" Posting completion with results to Java for session {self.session_id}")
            
            # Log result summary for debugging
            if isinstance(sanitized_result, dict):
                if 'results' in sanitized_result:
                    logger.debug(f" Multi-image result summary: {len(sanitized_result.get('results', []))} image results")
                    if 'summary' in sanitized_result:
                        summary = sanitized_result['summary']
                        logger.debug(f" Summary: {summary.get('successful_images', 0)}/{summary.get('total_images_processed', 0)} successful, {summary.get('total_matches_all_images', 0)} total matches")
                elif 'top_matches' in sanitized_result:
                    logger.debug(f" Single image result: {len(sanitized_result.get('top_matches', []))} matches")
            
            response = requests.post(
                f"{self.rest_api_url}/progress/complete",
                json=payload,
                timeout=JAVA_REQUEST_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                logger.success(f"✅ COMPLETION with results sent successfully to Java for session {self.session_id}")
            else:
                logger.error(f"❌ CRITICAL: Java completion notification failed: {response.status_code} - {response.text}")
                
                # Try once more for completion events
                logger.info(f" Retrying completion send for session {self.session_id}")
                try:
                    retry_response = requests.post(
                        f"{self.rest_api_url}/progress/complete",
                        json=payload,
                        timeout=JAVA_REQUEST_TIMEOUT * 2,  # Double timeout for retry
                        headers={'Content-Type': 'application/json'}
                    )
                    if retry_response.status_code == 200:
                        logger.success(f"✅ COMPLETION sent on retry for session {self.session_id}")
                    else:
                        logger.error(f"❌ CRITICAL: Completion retry also failed: {retry_response.status_code}")
                except Exception as retry_error:
                    logger.error(f"❌ CRITICAL: Completion retry exception: {retry_error}")
                
        except Exception as e:
            logger.error(f"❌ CRITICAL: Error sending completion to Java for session {self.session_id}: {e}")
    
    def send_error(self, error_message):
        """Send error to Java progress service - NEVER rate limited"""
        logger.error(f" Sending ERROR to Java for session {self.session_id} (bypassing all rate limits)")
        
        try:
            payload = {
                'sessionId': self.session_id,
                'error': str(error_message)[:500]  # Limit error message length
            }
            
            logger.info(f" Posting error to Java for session {self.session_id}")
            
            response = requests.post(
                f"{self.rest_api_url}/progress/error",
                json=payload,
                timeout=JAVA_REQUEST_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                logger.error(f"✅ ERROR sent to Java for session {self.session_id}")
            else:
                logger.warning(f"⚠️ Java error notification failed: {response.status_code}")
                
        except Exception as e:
            logger.error(f"❌ Error sending error to Java for session {self.session_id}: {e}")
    
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
            'last_stage': self.last_stage
        }