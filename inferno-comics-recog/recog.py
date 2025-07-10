from flask import Flask
from flask_cors import CORS
from config.Config import Config
from models.OptimizedComicMatcher import OptimizedComicMatcher
from models.PHashComicMatcher import PHashComicMatcher
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher

from routes.Health import health_bp
from routes.ImageMatcher import image_matcher_bp

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

URL_PREFIX = Config.API_URL_PREFIX

app.register_blueprint(health_bp,  url_prefix=URL_PREFIX)
app.register_blueprint(image_matcher_bp, url_prefix=URL_PREFIX)

def main():
    app.run(debug=True)

# Final usage example
def main2():
    """Optimized comic matching demo"""
    # Initialize optimized matcher
    matcher = OptimizedComicMatcher(max_workers=6)
    
    # Your photo
    query_image_path = './images/20250703_012111.jpg'
    
    # Candidate URLs
    candidate_urls = [
        'https://comicvine.gamespot.com/a/uploads/scale_medium/6/67663/5457725-01.jpg',  # Correct match
        'https://m.media-amazon.com/images/I/91fC1cA57XL._UF1000,1000_QL80_.jpg',
        'https://sanctumsanctorumcomics.com/cdn/shop/files/STL027051.jpg',
        'https://i.ebayimg.com/images/g/y-8AAOSwOtVkg1nf/s-l1200.png',
        'https://dccomicsnews.com/wp-content/uploads/2016/07/Teen-Titans-Annual-2-2016.jpg'
    ]
    
    print("🎯 OPTIMIZED COMIC COVER MATCHING")
    print("="*50)
    print("📋 FINAL APPROACH:")
    print("   • Dynamic weight adjustment")
    print("   • Enhanced shape discrimination:")
    print("     - Circularity measure")
    print("     - Better position normalization")
    print("   • Title region analysis")
    print("   • Spatial text comparison")
    print("   • Consistency bonuses")
    print("   • False positive penalties")
    print("="*50)
    
    # Run matching
    results, query_elements = matcher.find_matches(query_image_path, candidate_urls)
    
    # Show results
    print(f"\n🏆 TOP 3 MATCHES:")
    for i, result in enumerate(results[:3], 1):
        if result['status'] == 'success':
            emoji = '🏆' if i == 1 else '🥈' if i == 2 else '🥉'
            print(f"{emoji} #{i}: {result['similarity']:.4f} - {result['url'].split('/')[-1]}")
    
    # Visual results
    print("\n📊 Creating visual comparison...")
    matcher.visualize_results(query_image_path, results, query_elements, top_n=5)
    
    # Show detailed breakdown of top 2 results
    print(f"\n🔍 DETAILED COMPARISON:")
    print("="*50)
    for i, result in enumerate(results[:2], 1):
        if result['status'] == 'success':
            print(f"\n🏆 RANK #{i} - {result['url'].split('/')[-1]}")
            print(f"Overall Score: {result['similarity']:.4f}")
            print("Individual Metrics:")
            sims = result['similarities']
            for metric, score in sorted(sims.items(), key=lambda x: x[1], reverse=True):
                print(f"  {metric.title()}: {score:.3f}")
    
    # Performance check
    successful = [r for r in results if r['status'] == 'success']
    if successful:
        correct_url = '5457725-01.jpg'
        correct_rank = None
        
        for i, result in enumerate(successful, 1):
            if correct_url in result['url']:
                correct_rank = i
                break
        
        print(f"\n🎯 PERFORMANCE:")
        if correct_rank == 1:
            print("🎉 SUCCESS: Correct match found in rank #1!")
        elif correct_rank and correct_rank <= 3:
            print(f"✅ GOOD: Correct match found in rank #{correct_rank}")
        else:
            print("⚠️ NEEDS TUNING: Correct match not in top 3")

def main3(): 
    matcher = PHashComicMatcher()
    
    query_image_path = './images/20250703_012111.jpg'
    
    # Candidate URLs
    candidate_urls = [
        'https://comicvine.gamespot.com/a/uploads/scale_medium/6/67663/5457725-01.jpg',  # Correct match
        'https://m.media-amazon.com/images/I/91fC1cA57XL._UF1000,1000_QL80_.jpg',
        'https://sanctumsanctorumcomics.com/cdn/shop/files/STL027051.jpg',
        'https://i.ebayimg.com/images/g/y-8AAOSwOtVkg1nf/s-l1200.png',
        'https://dccomicsnews.com/wp-content/uploads/2016/07/Teen-Titans-Annual-2-2016.jpg'
    ]
    
    # Find matches
    try:
        results, query_hashes = matcher.find_matches(query_image_path, candidate_urls, threshold=0.6)
        
        # Show results
        matcher.print_results(results, top_n=5)
        
        # Visualize if matplotlib is available
        matcher.visualize_results(query_image_path, results, query_hashes, top_n=5)
        
    except Exception as e:
        print(f"Error: {e}")
        
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
    