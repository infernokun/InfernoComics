#!/usr/bin/env python3
"""
Comic Book Identification Demo
Uses SerpAPI Google Reverse Image Search + Grand Comics Database (GCD) API
"""

import requests
import json
import os
import re
from urllib.parse import quote, urlparse
import time
import base64
import random
import glob
from PIL import Image
import io

class ComicIdentifier:
    def __init__(self, serpapi_key):
        """
        Initialize with SerpAPI key
        Get this from: https://serpapi.com/
        """
        self.serpapi_key = serpapi_key
        self.serpapi_base_url = "https://serpapi.com/search"
        self.gcd_base_url = "https://www.comics.org/api/"
        
    def compress_image(self, image_path, max_size_kb=500, max_dimension=1024):
        """
        Compress and resize image to reduce base64 size
        """
        try:
            with Image.open(image_path) as img:
                # Convert to RGB if necessary (for JPEG)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                
                # Calculate new dimensions while maintaining aspect ratio
                width, height = img.size
                if width > max_dimension or height > max_dimension:
                    if width > height:
                        new_width = max_dimension
                        new_height = int(height * max_dimension / width)
                    else:
                        new_height = max_dimension
                        new_width = int(width * max_dimension / height)
                    
                    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Try different quality settings to get under size limit
                for quality in [85, 70, 60, 50, 40, 30]:
                    buffer = io.BytesIO()
                    img.save(buffer, format='JPEG', quality=quality, optimize=True)
                    
                    # Check if under size limit
                    size_kb = len(buffer.getvalue()) / 1024
                    if size_kb <= max_size_kb:
                        print(f"Compressed image to {size_kb:.1f}KB (quality: {quality})")
                        return buffer.getvalue()
                
                # If still too large, return the smallest version
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=30, optimize=True)
                final_size = len(buffer.getvalue()) / 1024
                print(f"Warning: Could only compress to {final_size:.1f}KB")
                return buffer.getvalue()
                
        except Exception as e:
            print(f"Error compressing image: {e}")
            return None
        
    def search_google_images(self, image_path):
        """
        Search Google Images using reverse image search via SerpAPI
        """
        try:
            # Compress the image first
            compressed_image_data = self.compress_image(image_path)
            
            if not compressed_image_data:
                print("Failed to compress image")
                return None
            
            # Encode to base64
            image_data = base64.b64encode(compressed_image_data).decode('utf-8')
            
            # Check base64 size
            base64_size_kb = len(image_data) / 1024
            print(f"Base64 encoded size: {base64_size_kb:.1f}KB")
            
            if base64_size_kb > 1000:  # Still too large
                print("Image still too large after compression")
                return None
            
            params = {
                'api_key': self.serpapi_key,
                'engine': 'google_reverse_image',
                'image_data': image_data,
                'hl': 'en'
            }
            
            response = requests.get(self.serpapi_base_url, params=params)
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"SerpAPI Error: {response.status_code}")
                print(response.text)
                return None
                
        except Exception as e:
            print(f"Error searching Google Images: {e}")
            return None
    
    def extract_comic_info_from_results(self, search_results):
        """
        Extract comic information from Google reverse image search results
        """
        comic_candidates = []
        
        # Check inline images first (these are usually most relevant)
        if 'inline_images' in search_results:
            for img in search_results['inline_images'][:10]:  # Check top 10
                candidate = self.analyze_image_result(img)
                if candidate:
                    comic_candidates.append(candidate)
        
        # Check image results
        if 'image_results' in search_results:
            for img in search_results['image_results'][:10]:  # Check top 10
                candidate = self.analyze_image_result(img)
                if candidate:
                    comic_candidates.append(candidate)
        
        # Check text results that might mention comics
        if 'organic_results' in search_results:
            for result in search_results['organic_results'][:5]:
                candidate = self.analyze_text_result(result)
                if candidate:
                    comic_candidates.append(candidate)
        
        return comic_candidates
    
    def analyze_image_result(self, img_result):
        """
        Analyze individual image result for comic information
        """
        comic_info = {
            'title': None,
            'issue': None,
            'publisher': None,
            'year': None,
            'source_url': img_result.get('source'),
            'source_domain': None,
            'confidence': 0
        }
        
        if comic_info['source_url']:
            comic_info['source_domain'] = urlparse(comic_info['source_url']).netloc
        
        # Check if source is a known comic database
        if comic_info['source_domain']:
            if 'comics.org' in comic_info['source_domain']:
                comic_info['confidence'] += 40
                # Try to extract GCD issue ID
                if '/issue/' in comic_info['source_url']:
                    try:
                        issue_id = comic_info['source_url'].split('/issue/')[1].split('/')[0]
                        if issue_id.isdigit():
                            comic_info['gcd_issue_id'] = issue_id
                            comic_info['confidence'] += 30
                    except:
                        pass
            
            elif any(domain in comic_info['source_domain'] for domain in 
                    ['comicvine.com', 'marvel.com', 'dc.com', 'mycomicshop.com']):
                comic_info['confidence'] += 20
        
        # Extract info from title/snippet
        title_text = img_result.get('title', '')
        snippet_text = img_result.get('snippet', '')
        combined_text = f"{title_text} {snippet_text}".lower()
        
        # Look for comic-related keywords
        comic_keywords = ['comic', 'issue', 'vol', 'volume', '#', 'marvel', 'dc', 'image']
        if any(keyword in combined_text for keyword in comic_keywords):
            comic_info['confidence'] += 10
        
        # Try to extract title, issue number, etc.
        self.extract_text_details(combined_text, comic_info)
        
        return comic_info if comic_info['confidence'] > 0 else None
    
    def analyze_text_result(self, text_result):
        """
        Analyze text search results for comic information
        """
        comic_info = {
            'title': None,
            'issue': None,
            'publisher': None,
            'year': None,
            'source_url': text_result.get('link'),
            'source_domain': None,
            'confidence': 0
        }
        
        if comic_info['source_url']:
            comic_info['source_domain'] = urlparse(comic_info['source_url']).netloc
        
        # Check if source is a known comic database
        if comic_info['source_domain'] and 'comics.org' in comic_info['source_domain']:
            comic_info['confidence'] += 30
            if '/issue/' in comic_info['source_url']:
                try:
                    issue_id = comic_info['source_url'].split('/issue/')[1].split('/')[0]
                    if issue_id.isdigit():
                        comic_info['gcd_issue_id'] = issue_id
                        comic_info['confidence'] += 20
                except:
                    pass
        
        # Extract info from title and snippet
        title_text = text_result.get('title', '')
        snippet_text = text_result.get('snippet', '')
        combined_text = f"{title_text} {snippet_text}".lower()
        
        # Look for comic-related keywords
        comic_keywords = ['comic', 'issue', 'vol', 'volume', '#', 'marvel', 'dc']
        if any(keyword in combined_text for keyword in comic_keywords):
            comic_info['confidence'] += 10
        
        self.extract_text_details(combined_text, comic_info)
        
        return comic_info if comic_info['confidence'] > 0 else None
    
    def extract_text_details(self, text, comic_info):
        """
        Extract comic details from text using regex patterns
        """
        # Common comic title patterns
        title_patterns = [
            r'(amazing spider-man|spider-man|batman|superman|x-men|avengers|justice league)',
            r'([a-z\s]+)\s+#?\d+',
            r'([a-z\s]+)\s+vol\s+\d+',
            r'([a-z\s]+)\s+volume\s+\d+'
        ]
        
        for pattern in title_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match and not comic_info['title']:
                comic_info['title'] = match.group(1).strip().title()
                comic_info['confidence'] += 5
                break
        
        # Issue number patterns
        issue_patterns = [
            r'#(\d+)',
            r'issue\s+(\d+)',
            r'no\.\s*(\d+)'
        ]
        
        for pattern in issue_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match and not comic_info['issue']:
                comic_info['issue'] = match.group(1)
                comic_info['confidence'] += 5
                break
        
        # Publisher patterns
        publisher_patterns = [
            r'(marvel|dc|image|dark horse|idw|boom|dynamite)',
        ]
        
        for pattern in publisher_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match and not comic_info['publisher']:
                comic_info['publisher'] = match.group(1).title()
                comic_info['confidence'] += 5
                break
        
        # Year patterns
        year_patterns = [
            r'(19\d{2}|20\d{2})'
        ]
        
        for pattern in year_patterns:
            match = re.search(pattern, text)
            if match and not comic_info['year']:
                year = int(match.group(1))
                if 1930 <= year <= 2025:  # Reasonable comic book year range
                    comic_info['year'] = year
                    comic_info['confidence'] += 3
                break
    
    def search_gcd(self, title=None, issue=None, publisher=None, year=None):
        """
        Search the Grand Comics Database
        """
        try:
            url = f"{self.gcd_base_url}issue/"
            params = {}
            
            if title:
                params['series__name__icontains'] = title
            if issue:
                params['number'] = issue
            if publisher:
                params['series__publisher__name__icontains'] = publisher
            if year:
                params['series__year_began'] = year
            
            params['format'] = 'json'
            
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"GCD API Error: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Error searching GCD: {e}")
            return None
    
    def get_gcd_issue_details(self, issue_id):
        """
        Get detailed information about a specific issue from GCD
        """
        try:
            url = f"{self.gcd_base_url}issue/{issue_id}/"
            params = {'format': 'json'}
            
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"GCD API Error: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Error getting GCD issue details: {e}")
            return None
    
    def identify_comic(self, image_path):
        """
        Main function to identify a comic book from an image
        """
        print(f"Identifying comic from: {image_path}")
        print("-" * 50)
        
        # Step 1: Search Google Images via SerpAPI
        print("1. Searching Google Images for similar images...")
        search_results = self.search_google_images(image_path)
        
        if not search_results:
            print("No results from Google Images search.")
            return None
        
        print(f"Retrieved search results from Google Images")
        
        # Step 2: Extract comic information from results
        print("2. Analyzing search results...")
        comic_candidates = self.extract_comic_info_from_results(search_results)
        
        if not comic_candidates:
            print("No comic-related information found in search results.")
            return None
        
        # Sort by confidence score
        comic_candidates.sort(key=lambda x: x['confidence'], reverse=True)
        
        print(f"Found {len(comic_candidates)} potential comic matches")
        
        # Step 3: Process the best candidates
        for i, candidate in enumerate(comic_candidates[:3]):
            print(f"\nCandidate {i+1} (Confidence: {candidate['confidence']}):")
            print(f"  Source: {candidate['source_url']}")
            print(f"  Domain: {candidate['source_domain']}")
            
            if candidate.get('title'):
                print(f"  Detected Title: {candidate['title']}")
            if candidate.get('issue'):
                print(f"  Detected Issue: #{candidate['issue']}")
            if candidate.get('publisher'):
                print(f"  Detected Publisher: {candidate['publisher']}")
            if candidate.get('year'):
                print(f"  Detected Year: {candidate['year']}")
            
            # If we have a GCD issue ID, get detailed info
            if candidate.get('gcd_issue_id'):
                print(f"  GCD Issue ID: {candidate['gcd_issue_id']}")
                gcd_details = self.get_gcd_issue_details(candidate['gcd_issue_id'])
                
                if gcd_details:
                    print(f"  ✓ Verified Title: {gcd_details.get('series', {}).get('name', 'Unknown')}")
                    print(f"  ✓ Verified Issue: #{gcd_details.get('number', 'Unknown')}")
                    print(f"  ✓ Verified Publisher: {gcd_details.get('series', {}).get('publisher', {}).get('name', 'Unknown')}")
                    print(f"  ✓ Verified Year: {gcd_details.get('series', {}).get('year_began', 'Unknown')}")
                    
                    return gcd_details
            
            # Otherwise, try to search GCD with extracted info
            elif candidate.get('title') or candidate.get('publisher'):
                print("  Searching GCD for match...")
                gcd_results = self.search_gcd(
                    title=candidate.get('title'),
                    issue=candidate.get('issue'),
                    publisher=candidate.get('publisher'),
                    year=candidate.get('year')
                )
                
                if gcd_results and gcd_results.get('results'):
                    best_match = gcd_results['results'][0]
                    print(f"  ✓ GCD Match: {best_match.get('series', {}).get('name', 'Unknown')} #{best_match.get('number', 'Unknown')}")
                    return best_match
        
        print("\nNo definitive comic identification found.")
        return None

def select_random_image():
    """
    Select a random .jpg image from the ./images folder
    """
    images_folder = "./images"
    
    if not os.path.exists(images_folder):
        print(f"Images folder not found: {images_folder}")
        return None
    
    # Find all .jpg files in the images folder
    jpg_files = glob.glob(os.path.join(images_folder, "*.jpg"))
    jpg_files.extend(glob.glob(os.path.join(images_folder, "*.jpeg")))
    jpg_files.extend(glob.glob(os.path.join(images_folder, "*.JPG")))
    jpg_files.extend(glob.glob(os.path.join(images_folder, "*.JPEG")))
    
    if not jpg_files:
        print(f"No .jpg files found in {images_folder}")
        return None
    
    # Select a random image
    selected_image = random.choice(jpg_files)
    print(f"Randomly selected image: {selected_image}")
    return selected_image

def demo_with_sample_search():
    """
    Demo function that shows how to search GCD directly
    """
    print("\n" + "="*60)
    print("DEMO: Direct GCD Search")
    print("="*60)
    
    identifier = ComicIdentifier("dummy_key")
    
    # Search for a popular comic
    print("Searching GCD for 'Amazing Spider-Man' comics...")
    results = identifier.search_gcd(title="Amazing Spider-Man", publisher="Marvel")
    
    if results and results.get('results'):
        print(f"Found {len(results['results'])} results")
        
        # Show first few results
        for i, comic in enumerate(results['results'][:3]):
            print(f"\nResult {i+1}:")
            print(f"  Title: {comic.get('series', {}).get('name', 'Unknown')}")
            print(f"  Issue: #{comic.get('number', 'Unknown')}")
            print(f"  Publisher: {comic.get('series', {}).get('publisher', {}).get('name', 'Unknown')}")
            print(f"  Year: {comic.get('series', {}).get('year_began', 'Unknown')}")
            print(f"  Cover Date: {comic.get('cover_date', 'Unknown')}")
    else:
        print("No results found")

def main():
    """
    Main demo function
    """
    print("Comic Book Identification Demo")
    print("Using SerpAPI + Google Reverse Image Search + GCD")
    print("=" * 60)
    
    # Get SerpAPI key
    SERPAPI_KEY = os.getenv("SERPAPI_KEY")
    
    if SERPAPI_KEY is None or SERPAPI_KEY.strip() == "":
        print("⚠️  SerpAPI key not set!")
        print("Set environment variable: SERPAPI_KEY")
        print("Get your key from: https://serpapi.com/")
        print("\nShowing GCD-only demo instead...\n")
        demo_with_sample_search()
        return
    
    # Initialize the identifier
    identifier = ComicIdentifier(SERPAPI_KEY)
    
    # Select a random image from ./images folder
    image_path = select_random_image()
    
    if not image_path:
        print("No images found. Please add .jpg files to the ./images folder")
        print("Showing GCD-only demo instead...\n")
        demo_with_sample_search()
        return
    
    # Identify the comic
    result = identifier.identify_comic(image_path)
    
    if result:
        print("\n" + "="*60)
        print("IDENTIFICATION SUCCESSFUL!")
        print("="*60)
        print(json.dumps(result, indent=2))
    else:
        print("\n" + "="*60)
        print("Could not identify comic")
        print("="*60)
        print("Try with a clearer image or a more popular comic book cover")

if __name__ == "__main__":
    main()