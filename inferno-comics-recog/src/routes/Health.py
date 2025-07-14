from flask import Blueprint, jsonify
from datetime import datetime
from config.Config import Config

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': Config.API_VERSION
    })
