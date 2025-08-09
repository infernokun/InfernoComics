import os

class Config:
    API_VERSION = "v1"
    API_URL_PREFIX = f"/inferno-comics-recognition/api/{API_VERSION}"
    REST_API = os.getenv('REST_API', 'http://localhost:8080/inferno-comics-rest/api')
    FLASK_HOST = os.getenv('RECOGNITION_HOST', '0.0.0.0')
    FLASK_PORT = int(os.getenv('RECOGNITION_PORT', 5000))
    FLASK_THREADS = int(os.getenv('API_THREADS', 4))
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')