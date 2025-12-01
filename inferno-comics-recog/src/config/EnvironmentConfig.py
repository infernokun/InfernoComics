import os

CACHE_DIR: str = os.getenv('COMIC_CACHE_IMAGE_PATH', '/var/tmp/inferno-comics/image_cache')
DB_PATH: str = os.getenv('COMIC_CACHE_DB_PATH', '/var/tmp/inferno-comics/comic_cache.db')
CONFIG_PATH: str = os.getenv('CONFIG_PATH', '/var/tmp/inferno-comics/config.yml')
ENV_LEVEL: str = os.getenv('PERFORMANCE_LEVEL', '')

JAVA_REQUEST_TIMEOUT: int = int(os.getenv('JAVA_REQUEST_TIMEOUT', '5'))  # seconds
JAVA_PROGRESS_TIMEOUT: int = int(os.getenv('JAVA_PROGRESS_TIMEOUT', '2'))  # seconds

PROGRESS_BATCH_SIZE: int = int(os.getenv('PROGRESS_BATCH_SIZE', '5'))  # Update every N candidates
MAX_PROGRESS_UPDATES: int = int(os.getenv('MAX_PROGRESS_UPDATES', '20'))  # Max updates during matching