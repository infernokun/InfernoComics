import os

from flask import Flask
from waitress import serve
from flask_cors import CORS
from config.FlaskConfig import FlaskConfig
from config.ComicMatcherConfig import ComicMatcherConfig
from util.Logger import initialize_logger, set_global_log_config
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher

# Set up logging
set_global_log_config(log_file="./logs/app.log")
logger = initialize_logger(name=__name__, log_file="./logs/app.log", use_colors=True)

# Global matcher instance - initialized once
global_matcher = None
global_matcher_config = None

def create_matcher_config():
    global global_matcher_config

    if global_matcher_config is None:
        global_matcher_config = ComicMatcherConfig()
    return global_matcher_config

def get_matcher_config():
    return create_matcher_config()

def create_matcher():
    """Create and configure the global matcher instance"""
    global global_matcher
    
    if global_matcher is None:
        logger.info("🔧 Initializing global FeatureMatchingComicMatcher...")
        
        # Get config path from environment or use default
        cache_dir = os.environ.get('COMIC_CACHE_IMAGE_PATH', '/var/tmp/inferno-comics/image_cache')
        db_path = os.environ.get('COMIC_CACHE_DB_PATH', '/var/tmp/inferno-comics/comic_cache.db')
        
        try:
            global_matcher = FeatureMatchingComicMatcher(get_matcher_config(), cache_dir=cache_dir, db_path=db_path)
            global_matcher.print_config_summary()
            
        except Exception as e:
            logger.error(f"Failed to initialize global matcher: {e}")
            raise
    
    return global_matcher

def get_matcher():
    return create_matcher()

def create_app():
    """Application factory pattern for better testing and deployment"""
    logger.info("Creating Flask application...")
    app = Flask(__name__)
    app.config.from_object(FlaskConfig)
    
    CORS(app)
    
    # Initialize the global matcher during app creation
    logger.info("Initializing application components...")
    try:
        create_matcher()
    except Exception as e:
        logger.error(f"Failed to initialize application components: {e}")
        raise
    
    # Import and register blueprints AFTER matcher is initialized
    from routes.health.Health import health_bp
    from routes.evaluation.Evaluation import evaluation_bp
    from routes.image_matcher.ImageMatcher import image_matcher_bp
    from routes.config.Config import config_bp
    
    # Pass the matcher getter function to blueprints
    app.config['GET_MATCHER'] = get_matcher
    app.config['GET_MATCHER_CONFIG'] = get_matcher_config
    
    app.register_blueprint(health_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"Health blueprint registered at {app.config['API_URL_PREFIX']}")
    
    app.register_blueprint(image_matcher_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"Image matcher blueprint registered at {app.config['API_URL_PREFIX']}")
    
    app.register_blueprint(evaluation_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"Evaluation blueprint registered at {app.config['API_URL_PREFIX']}")

    app.register_blueprint(config_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"Config blueprint registered at {app.config['API_URL_PREFIX']}")
    
    return app

def main():
    logger.info("Starting Inferno Comics Recognition Service...")
    try:
        app = create_app()
        
        # Get configuration from environment variables
        host = app.config.get('FLASK_HOST')
        port = app.config.get('FLASK_PORT')
        threads = app.config.get('FLASK_THREADS')
        url_prefix = app.config.get('API_URL_PREFIX')

        logger.success("All application components initialized")
        logger.info(f"Server configuration - Host: {host}, Port: {port}, Threads: {threads}")
        
        # Production environment check
        if app.config.get('FLASK_ENV') == 'production':
            logger.success(f"Starting production server on {host}:{port} with {threads} threads")
            logger.info("Production server configuration:")
            serve(
                app,
                host=host,
                port=port,
                threads=threads,
                connection_limit=1000,
                cleanup_interval=30,
                channel_timeout=120
            )
        else:
            logger.warning("Running in development mode!")
            logger.info(f"Server available at: http://{host}:{port}{url_prefix}")
            logger.info("Debug mode is enabled")
            app.run(host=host, port=port, debug=True)
            
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        logger.critical("Application startup failed!")
        raise

if __name__ == '__main__':
    title = "INFERNO COMICS RECOGNITION SERVICE"
    logger.success("=" * len(title))
    logger.success("INFERNO COMICS RECOGNITION SERVICE")
    logger.success("=" * len(title))
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Server stopped by user")
        if global_matcher:
            logger.info("Cleaning up global matcher resources...")
            global_matcher.print_cache_stats()
    except Exception as e:
        logger.critical(f"Critical error: {e}")
        exit(1)