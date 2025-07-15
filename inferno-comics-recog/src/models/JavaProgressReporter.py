import os
from config.Config import Config
import requests
from time import time

# Configuration for Java progress service integration
JAVA_PROGRESS_SERVICE_URL = os.getenv(
    'JAVA_PROGRESS_SERVICE_URL', 
    'http://localhost:8080/inferno-comics-rest/api/v1/progress'
)

# Timeout settings for Java communication
JAVA_REQUEST_TIMEOUT = int(os.getenv('JAVA_REQUEST_TIMEOUT', '5'))  # seconds
JAVA_PROGRESS_TIMEOUT = int(os.getenv('JAVA_PROGRESS_TIMEOUT', '2'))  # seconds

# Progress reporting settings
PROGRESS_BATCH_SIZE = int(os.getenv('PROGRESS_BATCH_SIZE', '5'))  # Update every N candidates
MAX_PROGRESS_UPDATES = int(os.getenv('MAX_PROGRESS_UPDATES', '20'))  # Max updates during matching

# Enhanced JavaProgressReporter with configuration
class JavaProgressReporter:
    """Enhanced class to report progress back to Java's progress service"""
    
    def __init__(self, session_id):
        self.session_id = session_id
        self.last_progress_time = 0
        self.min_progress_interval = 0.5  # Minimum seconds between progress updates
        
    def update_progress(self, stage, progress, message):
        """Send progress update to Java progress service with rate limiting"""
        
        # Rate limit progress updates to avoid overwhelming Java
        current_time = time()
        if current_time - self.last_progress_time < self.min_progress_interval:
            return
        
        try:
            payload = {
                'sessionId': self.session_id,
                'stage': stage,
                'progress': min(100, max(0, progress)),  # Clamp between 0-100
                'message': message[:200] if message else ""  # Limit message length
            }
            
            # Send to Java progress service
            response = requests.post(
                f"{JAVA_PROGRESS_SERVICE_URL}/update",
                json=payload,
                timeout=JAVA_PROGRESS_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                self.last_progress_time = current_time
                print(f"📊 Sent progress to Java: {stage} {progress}% - {message}")
            else:
                print(f"⚠️ Java progress update failed: {response.status_code} - {response.text}")
                
        except requests.exceptions.Timeout:
            print(f"⏱️ Java progress update timed out for session {self.session_id}")
        except requests.exceptions.ConnectionError:
            print(f"🔌 Java progress service unavailable for session {self.session_id}")
        except Exception as e:
            print(f"❌ Error sending progress to Java for session {self.session_id}: {e}")
    
    def send_complete(self, result):
        """Send completion to Java progress service"""
        try:
            # Sanitize result for JSON serialization
            sanitized_result = self._sanitize_result(result)
            
            payload = {
                'sessionId': self.session_id,
                'result': sanitized_result
            }
            
            response = requests.post(
                f"{JAVA_PROGRESS_SERVICE_URL}/complete",
                json=payload,
                timeout=JAVA_REQUEST_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                print(f"✅ Sent completion to Java for session {self.session_id}")
            else:
                print(f"⚠️ Java completion notification failed: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Error sending completion to Java for session {self.session_id}: {e}")
    
    def send_error(self, error_message):
        """Send error to Java progress service"""
        try:
            payload = {
                'sessionId': self.session_id,
                'error': str(error_message)[:500]  # Limit error message length
            }
            
            response = requests.post(
                f"{JAVA_PROGRESS_SERVICE_URL}/error",
                json=payload,
                timeout=JAVA_REQUEST_TIMEOUT,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                print(f"❌ Sent error to Java for session {self.session_id}")
            else:
                print(f"⚠️ Java error notification failed: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Error sending error to Java for session {self.session_id}: {e}")
    
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

# Health check function
def check_java_service_health():
    """Check if Java progress service is available"""
    try:
        response = requests.get(
            f"{JAVA_PROGRESS_SERVICE_URL}/health",
            timeout=2
        )
        return response.status_code == 200
    except:
        return False

# Initialize health check on startup
print(f"🔗 Java Progress Service URL: {JAVA_PROGRESS_SERVICE_URL}")
if check_java_service_health():
    print("✅ Java progress service is available")
else:
    print("⚠️ Java progress service is not available - progress updates will be logged only")