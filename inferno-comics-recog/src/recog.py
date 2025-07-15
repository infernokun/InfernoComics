import logging
from flask import Flask
from waitress import serve
from flask_cors import CORS
from config.Config import Config
from util.Logger import initialize_logger
from routes.health.Health import health_bp
from routes.evaluation.Evaluation import evaluation_bp
from routes.image_matcher.ImageMatcher import image_matcher_bp
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher

logger = initialize_logger(
    name=__name__,
    level=logging.DEBUG,
    log_file="./logs/app.log",
    use_colors=True
)

def create_app():
    """Application factory pattern for better testing and deployment"""
    logger.info("Creating Flask application...")
    
    app = Flask(__name__)
    app.config.from_object(Config)
    
    logger.success("Flask app configuration loaded successfully")
    
    # Configure CORS
    CORS(app)
    logger.info("CORS configured")
    
    # Register blueprints
    app.register_blueprint(health_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"Health blueprint registered at {app.config['API_URL_PREFIX']}")
    
    app.register_blueprint(image_matcher_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"Image matcher blueprint registered at {app.config['API_URL_PREFIX']}")
    
    app.register_blueprint(evaluation_bp, url_prefix=app.config['API_URL_PREFIX'])
    logger.debug(f"Evaluation blueprint registered at {app.config['API_URL_PREFIX']}")
    
    logger.success("All blueprints registered successfully")
    
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
        
        logger.info(f"Server configuration - Host: {host}, Port: {port}, Threads: {threads}")
        
        # Production environment check
        if app.config.get('FLASK_ENV') == 'production':
            logger.success(f" Starting production server on {host}:{port} with {threads} threads")
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
            logger.warning("⚠️  Running in development mode!")
            logger.info(f" Server available at: http://{host}:{port}{url_prefix}")
            logger.info(" Debug mode is enabled")
            
            app.run(host=host, port=port, debug=True)
            
    except Exception as e:
        logger.error(f"❌ Failed to start server: {e}")
        logger.critical("Application startup failed!")
        raise

def main4():
    """Testing function for comic matching"""
    logger.info("離 Starting comic matching test...")
    
    try:
        matcher = FeatureMatchingComicMatcher()
        logger.success("✅ FeatureMatchingComicMatcher initialized")
        
        query_image_path = './images/20250703_012111.jpg'
        logger.info(f" Query image: {query_image_path}")
        
        # Candidate URLs
        candidate_urls = [
            'https://comicvine.gamespot.com/a/uploads/scale_medium/6/67663/5457725-01.jpg',  # Correct match
            'https://m.media-amazon.com/images/I/91fC1cA57XL._UF1000,1000_QL80_.jpg',
            'https://sanctumsanctorumcomics.com/cdn/shop/files/STL027051.jpg',
            'https://i.ebayimg.com/images/g/y-8AAOSwOtVkg1nf/s-l1200.png',
            'https://dccomicsnews.com/wp-content/uploads/2016/07/Teen-Titans-Annual-2-2016.jpg'
        ]
        
        logger.info(f" Processing {len(candidate_urls)} candidate images...")
        
        results, query_features = matcher.find_matches(query_image_path, candidate_urls, threshold=0.02)
        logger.success(f"✅ Matching completed! Found {len(results)} results")
        
        # Show results
        logger.info(" Displaying results...")
        matcher.print_results(results, top_n=5)
        
        # Create visualization
        logger.info(" Creating visualization...")
        matcher.visualize_results(query_image_path, results, query_features, top_n=5)
        logger.success("✅ Visualization created successfully!")
        
    except FileNotFoundError as e:
        logger.error(f" File not found: {e}")
    except Exception as e:
        logger.error(f"❌ Error during comic matching: {e}")
        logger.debug("Full error details:", exc_info=True)

if __name__ == '__main__':
    # Add some startup art
    logger.info("=" * 60)
    logger.success(" INFERNO COMICS RECOGNITION SERVICE ")
    logger.info("=" * 60)
    
    try:
        main()
    except KeyboardInterrupt:
        logger.warning(" Server stopped by user")
    except Exception as e:
        logger.critical(f" Critical error: {e}")
        exit(1)