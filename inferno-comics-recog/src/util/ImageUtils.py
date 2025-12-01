import cv2
import base64
import hashlib
import numpy as np
from util.Logger import get_logger

logger = get_logger(__name__)

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
