from flask import Blueprint, jsonify, request
from datetime import datetime
import time
import psutil
import platform
from config.Config import Config
import os
import json

health_bp = Blueprint('health', __name__)

# Store the application start time
start_time = time.time()

def get_system_info():
    """Get basic system information"""
    return {
        'platform': platform.system(),
        'platform_version': platform.release(),
        'python_version': platform.python_version(),
        'architecture': platform.machine()
    }

def get_resource_usage():
    """Get current resource usage"""
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        return {
            'cpu_usage_percent': cpu_percent,
            'memory': {
                'total': memory.total,
                'available': memory.available,
                'used': memory.used,
                'percent': memory.percent
            },
            'disk': {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': (disk.used / disk.total) * 100
            }
        }
    except Exception as e:
        return {'error': f'Unable to get resource usage: {str(e)}'}

def get_uptime():
    """Calculate application uptime"""
    uptime_seconds = time.time() - start_time
    
    days = int(uptime_seconds // 86400)
    hours = int((uptime_seconds % 86400) // 3600)
    minutes = int((uptime_seconds % 3600) // 60)
    seconds = int(uptime_seconds % 60)
    
    return {
        'uptime_seconds': uptime_seconds,
        'uptime_formatted': f"{days}d {hours}h {minutes}m {seconds}s",
        'started_at': datetime.fromtimestamp(start_time).isoformat()
    }

@health_bp.route('/health', methods=['GET'])
def health():
    """Basic health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': get_version_from_package_json(),
        'uptime': get_uptime()
    })

@health_bp.route('/health/detailed', methods=['GET'])
def detailed_health():
    """Detailed health check with system information"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': get_version_from_package_json(),
        'uptime': get_uptime(),
        'system': get_system_info(),
        'resources': get_resource_usage(),
        'request_info': {
            'remote_addr': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', 'Unknown')
        }
    })

@health_bp.route('/health/liveness', methods=['GET'])
def liveness():
    """Kubernetes liveness probe endpoint"""
    return jsonify({
        'status': 'alive',
        'timestamp': datetime.now().isoformat()
    })

@health_bp.route('/health/metrics', methods=['GET'])
def metrics():
    """Prometheus-style metrics endpoint"""
    uptime_info = get_uptime()
    resources = get_resource_usage()
    
    metrics_data = {
        'uptime_seconds': uptime_info['uptime_seconds'],
        'cpu_usage_percent': resources.get('cpu_usage_percent', 0),
        'memory_usage_percent': resources.get('memory', {}).get('percent', 0),
        'disk_usage_percent': resources.get('disk', {}).get('percent', 0),
        'timestamp': datetime.now().isoformat()
    }
    
    return jsonify(metrics_data)

def get_version_from_package_json():
    try:
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
        package_json_path = os.path.join(project_root, 'package.json')
        
        with open(package_json_path, 'r') as f:
            package_data = json.load(f)
            return package_data.get('version', 'unknown')
    except Exception as e:
        print(f"Could not read package.json: {e}")
        return 'unknown'