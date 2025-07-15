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
        self.min_progress_interval = 0.5  # Minimum seconds between progress updates
        
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
        """Send progress update to Java progress service with rate limiting"""
        
        # Rate limit progress updates to avoid overwhelming Java
        current_time = time()
        if current_time - self.last_progress_time < self.min_progress_interval:
            logger.debug(f" Rate-limited progress update: {stage} {progress}%")
            return
        
        try:
            payload = {
                'sessionId': self.session_id,
                'stage': stage,
                'progress': min(100, max(0, progress)),  # Clamp between 0-100
                'message': message[:200] if message else ""  # Limit message length
            }
            
            logger.debug(f" Sending progress to Java: {stage} {progress}% - {message[:50]}...")
            
            # Send to Java progress service
            response = requests.post(
                f"{self.rest_api_url}/progress/update",
                json=payload,
                timeout=JAVA_PROGRESS_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                self.last_progress_time = current_time
                logger.success(f" Sent progress to Java: {stage} {progress}% - {message}")
            else:
                logger.warning(f"⚠️ Java progress update failed: {response.status_code} - {response.text}")
                
        except requests.exceptions.Timeout:
            logger.warning(f"⏱️ Java progress update timed out for session {self.session_id}")
        except requests.exceptions.ConnectionError:
            logger.warning(f" Java progress service unavailable for session {self.session_id}")
        except Exception as e:
            logger.error(f"❌ Error sending progress to Java for session {self.session_id}: {e}")
    
    def send_complete(self, result):
        """Send completion to Java progress service"""
        try:
            # Sanitize result for JSON serialization
            sanitized_result = self._sanitize_result(result)
            
            payload = {
                'sessionId': self.session_id,
                'result': sanitized_result
            }
            
            logger.debug(f" Sending completion to Java for session {self.session_id}")
            
            response = requests.post(
                f"{self.rest_api_url}/progress/complete",
                json=payload,
                timeout=JAVA_REQUEST_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                logger.success(f"✅ Sent completion to Java for session {self.session_id}")
            else:
                logger.warning(f"⚠️ Java completion notification failed: {response.status_code}")
                
        except Exception as e:
            logger.error(f"❌ Error sending completion to Java for session {self.session_id}: {e}")
    
    def send_error(self, error_message):
        """Send error to Java progress service"""
        try:
            payload = {
                'sessionId': self.session_id,
                'error': str(error_message)[:500]  # Limit error message length
            }
            
            logger.debug(f" Sending error to Java for session {self.session_id}")
            
            response = requests.post(
                f"{self.rest_api_url}/progress/error",
                json=payload,
                timeout=JAVA_REQUEST_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                logger.error(f"❌ Sent error to Java for session {self.session_id}")
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