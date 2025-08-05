import logging
import os
from flask import Flask
from waitress import serve
from flask_cors import CORS
from config.Config import Config
from util.Logger import initialize_logger, set_global_log_config
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher

# Set up logging
set_global_log_config(log_file="./logs/app.log", level=logging.INFO)
logger = initialize_logger(name=__name__, level=logging.INFO, log_file="./logs/app.log", use_colors=True)

# Global matcher instance - initialized once
global_matcher = None

def create_matcher():
    """Create and configure the global matcher instance"""
    global global_matcher
    
    if global_matcher is None:
        logger.info("🔧 Initializing global FeatureMatchingComicMatcher...")
        
        # Get config path from environment or use default
        config_path = os.environ.get('CONFIG_PATH', '/var/tmp/inferno-comics/config.yml')
        cache_dir = os.environ.get('COMIC_CACHE_IMAGE_PATH', '/var/tmp/inferno-comics/image_cache')
        db_path = os.environ.get('COMIC_CACHE_DB_PATH', '/var/tmp/inferno-comics/comic_cache.db')
        
        try:
            global_matcher = FeatureMatchingComicMatcher(
                config_path=config_path,
                cache_dir=cache_dir,
                db_path=db_path
            )
            logger.success("✅ Global matcher initialized successfully")
            global_matcher.print_config_summary()
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize global matcher: {e}")
            raise
    
    return global_matcher

def get_matcher():
    """Get the global matcher instance (thread-safe)"""
    if global_matcher is None:
        return create_matcher()
    return global_matcher

def create_app():
    """Application factory pattern for better testing and deployment"""
    logger.info("🚀 Creating Flask application...")
    app = Flask(__name__)
    app.config.from_object(Config)
    logger.success("✅ Flask app configuration loaded successfully")
    
    # Configure CORS
    CORS(app)
    logger.info("🔗 CORS configured")
    
    # Initialize the global matcher during app creation
    logger.info("🔧 Initializing application components...")
    try:
        create_matcher()
        logger.success("✅ All application components initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize application components: {e}")
        raise
    
    # Import and register blueprints AFTER matcher is initialized
    from routes.health.Health import health_bp
    from routes.evaluation.Evaluation import evaluation_bp
    from routes.image_matcher.ImageMatcher import image_matcher_bp
    
    # Pass the matcher getter function to blueprints
    app.config['GET_MATCHER'] = get_matcher
    
    app.register_blueprint(health_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"📋 Health blueprint registered at {app.config['API_URL_PREFIX']}")
    
    app.register_blueprint(image_matcher_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"🖼️ Image matcher blueprint registered at {app.config['API_URL_PREFIX']}")
    
    app.register_blueprint(evaluation_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"📊 Evaluation blueprint registered at {app.config['API_URL_PREFIX']}")
    
    logger.success("✅ All blueprints registered successfully")
    return app

def main():
    logger.info("🌟 Starting Inferno Comics Recognition Service...")
    try:
        app = create_app()
        
        # Get configuration from environment variables
        host = app.config.get('FLASK_HOST')
        port = app.config.get('FLASK_PORT')
        threads = app.config.get('FLASK_THREADS')
        url_prefix = app.config.get('API_URL_PREFIX')
        
        logger.info(f"🔧 Server configuration - Host: {host}, Port: {port}, Threads: {threads}")
        
        # Production environment check
        if app.config.get('FLASK_ENV') == 'production':
            logger.success(f"🚀 Starting production server on {host}:{port} with {threads} threads")
            logger.info("🔧 Production server configuration:")
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
            logger.warning("⚠️ Running in development mode!")
            logger.info(f"🌐 Server available at: http://{host}:{port}{url_prefix}")
            logger.info("🐛 Debug mode is enabled")
            app.run(host=host, port=port, debug=True)
            
    except Exception as e:
        logger.error(f"❌ Failed to start server: {e}")
        logger.critical("💥 Application startup failed!")
        raise

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.success("🔥 INFERNO COMICS RECOGNITION SERVICE 🔥")
    logger.info("=" * 60)
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("⏹️ Server stopped by user")
        if global_matcher:
            logger.info("🧹 Cleaning up global matcher resources...")
            global_matcher.print_cache_stats()
    except Exception as e:
        logger.critical(f"💥 Critical error: {e}")
        exit(1)