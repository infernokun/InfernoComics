import os
import logging
from flask import Flask
from flask_cors import CORS
from waitress import serve
from config.Config import Config
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher
from routes.health.Health import health_bp
from routes.image_matcher.ImageMatcher import image_matcher_bp
from routes.evaluation.Evaluation import evaluation_bp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_app():
    """Application factory pattern for better testing and deployment"""
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Configure CORS
    CORS(app)
    
    # Register blueprints
    app.register_blueprint(health_bp, url_prefix=app.config['API_URL_PREFIX'])
    app.register_blueprint(image_matcher_bp, url_prefix=app.config['API_URL_PREFIX'])
    app.register_blueprint(evaluation_bp, url_prefix=app.config['API_URL_PREFIX'])
    
    return app

def main():
    app = create_app()
    
    # Get configuration from environment variables
    host = app.config.get('FLASK_HOST')
    port = app.config.get('FLASK_PORT')
    threads = app.config.get('FLASK_THREADS')
    url_prefix = app.config.get('API_URL_PREFIX')
    
    # Production environment check
    if app.config.get('FLASK_ENV') == 'production':
        logger.info(f"Starting production server on {host}:{port} with {threads} threads")
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
        logger.warning(f"Running in development mode on: http://localhost:{port}/{url_prefix}")
        app.run(host=host, port=port, debug=True)

     
def main4():
    matcher = FeatureMatchingComicMatcher()
    
    query_image_path = './images/20250703_012111.jpg'
    
    # Candidate URLs
    candidate_urls = [
        'https://comicvine.gamespot.com/a/uploads/scale_medium/6/67663/5457725-01.jpg',  # Correct match
        'https://m.media-amazon.com/images/I/91fC1cA57XL._UF1000,1000_QL80_.jpg',
        'https://sanctumsanctorumcomics.com/cdn/shop/files/STL027051.jpg',
        'https://i.ebayimg.com/images/g/y-8AAOSwOtVkg1nf/s-l1200.png',
        'https://dccomicsnews.com/wp-content/uploads/2016/07/Teen-Titans-Annual-2-2016.jpg'
    ]
    
    try:
        results, query_features = matcher.find_matches(query_image_path, candidate_urls, threshold=0.02)
        
        # Show results
        matcher.print_results(results, top_n=5)
        
        # Create visualization
        matcher.visualize_results(query_image_path, results, query_features, top_n=5)
        
    except Exception as e:
        print(f"Error: {e}")
    except Exception as e:
        print(f"Error: {e}")
        
if __name__ == '__main__':
    main()
    