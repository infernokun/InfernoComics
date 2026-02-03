import os

from flask import Flask
from waitress import serve
from flask_cors import CORS
from config.FlaskConfig import FlaskConfig
from config.EnvironmentConfig import CACHE_DIR, DB_PATH
from config.ComicMatcherConfig import ComicMatcherConfig
from util.Logger import set_global_log_config, get_logger

set_global_log_config(
    log_file="./logs/app.log",
    level=os.getenv('FLASK_ENV', 'development') == 'production' and "INFO" or "DEBUG",
    use_colors=True,
)

logger = get_logger(__name__)

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
    """Create and configure the global matcher instance based on config"""
    global global_matcher

    if global_matcher is None:
        config = get_matcher_config()
        matcher_type = config.get_matcher_type()

        logger.info(f"Initializing {matcher_type} matcher...")

        try:
            if matcher_type == 'embedding':
                from models.EmbeddingComicMatcher import EmbeddingComicMatcher
                global_matcher = EmbeddingComicMatcher(
                    config,
                    cache_dir=CACHE_DIR,
                    db_path=DB_PATH
                )
                logger.success("EmbeddingComicMatcher initialized successfully")
            else:
                from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher
                global_matcher = FeatureMatchingComicMatcher(
                    config,
                    cache_dir=CACHE_DIR,
                    db_path=DB_PATH
                )
                logger.success("FeatureMatchingComicMatcher initialized successfully")

        except ImportError as e:
            logger.error(f"Failed to import matcher: {e}")
            if matcher_type == 'embedding':
                logger.warning("Falling back to FeatureMatchingComicMatcher")
                logger.info("To use EmbeddingComicMatcher, install: pip install torch open-clip-torch")
                from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher
                global_matcher = FeatureMatchingComicMatcher(
                    config,
                    cache_dir=CACHE_DIR,
                    db_path=DB_PATH
                )
            else:
                raise
        except Exception as e:
            logger.error(f"Failed to initialize matcher: {e}")
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

    url_prefix = app.config['API_URL_PREFIX']

    app.register_blueprint(health_bp, url_prefix=url_prefix)
    logger.debug(f"Health blueprint registered at {url_prefix}")

    app.register_blueprint(image_matcher_bp, url_prefix=url_prefix)
    logger.debug(f"Image matcher blueprint registered at {url_prefix}")

    app.register_blueprint(evaluation_bp, url_prefix=url_prefix)
    logger.debug(f"Evaluation blueprint registered at {url_prefix}")

    app.register_blueprint(config_bp, url_prefix=url_prefix)
    logger.debug(f"Config blueprint registered at {url_prefix}")

    return app


def main():
    logger.info("Starting Inferno Comics Recognition Service...")
    try:
        app = create_app()

        host = app.config.get('FLASK_HOST')
        port = app.config.get('FLASK_PORT')
        threads = app.config.get('FLASK_THREADS')
        url_prefix = app.config.get('API_URL_PREFIX')

        logger.success("All application components initialized")
        logger.info(f"Server configuration - Host: {host}, Port: {port}, Threads: {threads}")

        if app.config.get('FLASK_ENV') == 'production':
            logger.success(f"Starting production server on {host}:{port} with {threads} threads")
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
            logger.debug("Debug mode is enabled")
            app.run(host=host, port=port, debug=True)

    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        logger.critical("Application startup failed!")
        raise


if __name__ == '__main__':
    title = "INFERNO COMICS RECOGNITION SERVICE"
    logger.success("=" * len(title))
    logger.success(title)
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
