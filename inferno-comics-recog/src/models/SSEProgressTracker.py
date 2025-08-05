import time
import queue
from util.Logger import get_logger

logger = get_logger(__name__)

class SSEProgressTracker:
    """Class to track and send progress updates via SSE (for fallback when no session_id)"""
    
    def __init__(self, session_id):
        self.session_id = session_id
        self.progress_queue = queue.Queue()
        self.is_active = True
        logger.debug(f" Created SSE progress tracker for session {session_id}")
        
    def send_progress(self, stage, progress, message):
        """Send progress update"""
        if not self.is_active:
            return
            
        progress_event = {
            'type': 'progress',
            'sessionId': self.session_id,
            'stage': stage,
            'progress': progress,
            'message': message,
            'timestamp': int(time.time() * 1000)
        }
        
        try:
            self.progress_queue.put(progress_event, timeout=1.0)
            logger.debug(f" Progress {progress}%: {message}")
        except queue.Full:
            logger.warning(f"⚠️ Progress queue full for session {self.session_id}")
    
    def send_complete(self, result):
        """Send completion event with results"""
        if not self.is_active:
            return
            
        complete_event = {
            'type': 'complete',
            'sessionId': self.session_id,
            'stage': 'complete',
            'progress': 100,
            'message': 'Image processing completed successfully',
            'result': result,
            'timestamp': int(time.time() * 1000)
        }
        
        try:
            self.progress_queue.put(complete_event, timeout=1.0)
            logger.success(f"✅ Processing completed for session {self.session_id}")
        except queue.Full:
            logger.warning(f"⚠️ Progress queue full for session {self.session_id}")
    
    def send_error(self, error_message):
        """Send error event"""
        if not self.is_active:
            return
            
        error_event = {
            'type': 'error',
            'sessionId': self.session_id,
            'error': error_message,
            'timestamp': int(time.time() * 1000)
        }
        
        try:
            self.progress_queue.put(error_event, timeout=1.0)
            logger.error(f"❌ Error sent to session {self.session_id}: {error_message}")
        except queue.Full:
            logger.warning(f"⚠️ Progress queue full for session {self.session_id}")
    
    def close(self):
        """Close the progress tracker"""
        self.is_active = False
        logger.debug(f" Closed progress tracker for session {self.session_id}")
