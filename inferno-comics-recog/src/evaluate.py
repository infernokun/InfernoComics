import os
import re
import requests
import base64
from datetime import datetime

SIMILARITY_THRESHOLD = 0.25

def extract_name_and_year(folder_path):
    """Extract series name and year from folder name like 'Green Lanterns (2016)'"""
    folder_name = os.path.basename(folder_path.rstrip('/\\'))
    print(f"DEBUG: Folder name extracted: '{folder_name}'")
    
    # Extract year from parentheses
    year_match = re.search(r'\((\d{4})\)', folder_name)
    year = int(year_match.group(1)) if year_match else None
    
    # Extract name by removing year and parentheses
    name = re.sub(r'\s*\(\d{4}\)\s*', '', folder_name).strip()
    
    print(f"DEBUG: Extracted name: '{name}', year: {year}")
    return name, year

def get_image_files(folder_path):
    """Get all image files from the folder"""
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    image_files = []
    
    for file in os.listdir(folder_path):
        if any(file.lower().endswith(ext) for ext in image_extensions):
            image_files.append(os.path.join(folder_path, file))
    
    return sorted(image_files)

def image_to_base64(image_path):
    """Convert image to base64 for embedding in HTML"""
    try:
        with open(image_path, 'rb') as image_file:
            encoded = base64.b64encode(image_file.read()).decode()
            ext = os.path.splitext(image_path)[1].lower()
            mime_type = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.bmp': 'image/bmp',
                '.webp': 'image/webp'
            }.get(ext, 'image/jpeg')
            return f"data:{mime_type};base64,{encoded}"
    except Exception as e:
        print(f"Error converting image to base64: {e}")
        return None

def check_match_success(response_data, threshold=SIMILARITY_THRESHOLD):
    """Check if any match meets the similarity threshold"""
    if not response_data or 'top_matches' not in response_data:
        return False, 0.0
    
    best_similarity = 0.0
    for match in response_data['top_matches']:
        similarity = match.get('similarity', 0)
        if similarity > best_similarity:
            best_similarity = similarity
    
    return best_similarity >= threshold, best_similarity

def upload_comic_image(series_id, image_path, name, year):
    """Upload a single comic image to the API"""
    url = f"http://localhost:8080/inferno-comics-rest/api/series/{series_id}/add-comic-by-image"
    
    try:
        with open(image_path, 'rb') as image_file:
            files = {'image': (os.path.basename(image_path), image_file, 'image/jpeg')}
            data = {
                'name': name,
                'year': str(year) if year else ''
            }
            
            print(f"DEBUG: Uploading {os.path.basename(image_path)} to {url}")
            response = requests.post(url, files=files, data=data)
            print(f"DEBUG: Response status: {response.status_code}")
            
            # Try to parse JSON response
            response_data = None
            try:
                raw_response = response.json()
                print(f"DEBUG: Successfully parsed JSON response")
                
                # Handle the case where server returns an array directly
                if isinstance(raw_response, list):
                    # Convert array format to expected dictionary format
                    response_data = {
                        'top_matches': raw_response,
                        'total_matches': len(raw_response)
                    }
                    print(f"DEBUG: Converted array response to dict format - {len(raw_response)} matches")
                elif isinstance(raw_response, dict):
                    # Server already returns expected format
                    response_data = raw_response
                    print(f"DEBUG: Response already in dict format")
                else:
                    print(f"DEBUG: Unexpected response type: {type(raw_response)}")
                    
            except ValueError as json_error:
                print(f"DEBUG: Failed to parse JSON: {json_error}")
                print(f"DEBUG: Raw response text: {response.text[:500]}...")
            
            # Check if this constitutes a successful match based on similarity threshold
            api_success = response.status_code == 200
            match_success = False
            best_similarity = 0.0
            
            if api_success and response_data:
                match_success, best_similarity = check_match_success(response_data)
            
            return {
                'status_code': response.status_code,
                'api_success': api_success,  # API call succeeded
                'match_success': match_success,
                'best_similarity': best_similarity,
                'response_data': response_data,
                'response_text': response.text,
                'error': None
            }
    
    except requests.exceptions.RequestException as e:
        print(f"DEBUG: Request exception: {e}")
        return {
            'status_code': None,
            'api_success': False,
            'match_success': False,
            'best_similarity': 0.0,
            'response_data': None,
            'response_text': None,
            'error': str(e)
        }
    except Exception as e:
        print(f"DEBUG: Unexpected exception: {e}")
        return {
            'status_code': None,
            'api_success': False,
            'match_success': False,
            'best_similarity': 0.0,
            'response_data': None,
            'response_text': None,
            'error': f"Unexpected error: {str(e)}"
        }

def generate_visual_report(results, folder_path, series_name, year):
    """Generate a visual HTML report"""
    # Calculate statistics
    total_images = len(results)
    api_successful_uploads = sum(1 for r in results if r['api_success'])
    match_successful_uploads = sum(1 for r in results if r['match_success'])
    failed_uploads = sum(1 for r in results if not r['api_success'])
    no_match_uploads = sum(1 for r in results if r['api_success'] and not r['match_success'])
    
    # Overall iteration success: at least one image has a match
    overall_success = any(r['match_success'] for r in results)
    
    # Calculate average similarity for all processed images
    all_similarities = []
    for result in results:
        if result['api_success'] and result['response_data'] and 'top_matches' in result['response_data']:
            for match in result['response_data']['top_matches']:
                if match.get('similarity'):
                    all_similarities.append(match['similarity'])
    
    avg_similarity = sum(all_similarities) / len(all_similarities) if all_similarities else 0
    
    # Get best overall match
    best_overall_similarity = max((r['best_similarity'] for r in results), default=0.0)
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Comic Upload Report - {series_name} ({year})</title>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f5f5f5;
                color: #333;
            }}
            .header {{
                background: linear-gradient(135deg, {'#28a745' if overall_success else '#dc3545'} 0%, {'#20c997' if overall_success else '#c82333'} 100%);
                color: white;
                padding: 30px;
                border-radius: 10px;
                margin-bottom: 30px;
                text-align: center;
            }}
            .overall-status {{
                font-size: 1.5em;
                font-weight: bold;
                margin-bottom: 10px;
            }}
            .stats {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }}
            .stat-card {{
                background: white;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
            }}
            .stat-value {{
                font-size: 2em;
                font-weight: bold;
                color: #667eea;
            }}
            .stat-value.success {{
                color: #28a745;
            }}
            .stat-value.warning {{
                color: #ffc107;
            }}
            .stat-value.danger {{
                color: #dc3545;
            }}
            .stat-label {{
                color: #666;
                margin-top: 5px;
            }}
            .results-container {{
                max-height: 80vh;
                overflow-y: auto;
                background: white;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }}
            .result-item {{
                display: flex;
                margin-bottom: 30px;
                padding: 20px;
                border: 1px solid #e0e0e0;
                border-radius: 10px;
                background: #fafafa;
            }}
            .result-item.match-success {{
                border-left: 5px solid #28a745;
                background: #f8fff9;
            }}
            .result-item.no-match {{
                border-left: 5px solid #ffc107;
                background: #fffcf0;
            }}
            .result-item.error {{
                border-left: 5px solid #dc3545;
                background: #fff5f5;
            }}
            .result-item:hover {{
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                transform: translateY(-2px);
                transition: all 0.3s ease;
            }}
            .uploaded-image {{
                flex: 0 0 200px;
                margin-right: 20px;
            }}
            .uploaded-image img {{
                width: 100%;
                height: 280px;
                object-fit: cover;
                border-radius: 8px;
                border: 2px solid #ddd;
            }}
            .image-info {{
                text-align: center;
                margin-top: 10px;
                font-size: 0.9em;
                color: #666;
            }}
            .matches-container {{
                flex: 1;
                padding-left: 20px;
            }}
            .status-badge {{
                display: inline-block;
                padding: 5px 15px;
                border-radius: 20px;
                font-size: 0.8em;
                font-weight: bold;
                margin-bottom: 15px;
            }}
            .match-found {{
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }}
            .no-match-found {{
                background: #fff3cd;
                color: #856404;
                border: 1px solid #ffeaa7;
            }}
            .api-failure {{
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }}
            .similarity-highlight {{
                background: #e7f3ff;
                border: 1px solid #b3d9ff;
                border-radius: 5px;
                padding: 8px;
                margin: 10px 0;
                font-weight: bold;
            }}
            .similarity-highlight.good {{
                background: #d4edda;
                border-color: #c3e6cb;
                color: #155724;
            }}
            .similarity-highlight.poor {{
                background: #fff3cd;
                border-color: #ffeaa7;
                color: #856404;
            }}
            .matches-grid {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }}
            .match-item {{
                text-align: center;
                padding: 10px;
                background: white;
                border-radius: 8px;
                border: 1px solid #e0e0e0;
            }}
            .match-item.threshold-met {{
                border: 2px solid #28a745;
                background: #f8fff9;
            }}
            .match-item img {{
                width: 100%;
                height: 150px;
                object-fit: cover;
                border-radius: 5px;
                margin-bottom: 8px;
            }}
            .similarity-score {{
                font-weight: bold;
                margin-bottom: 5px;
            }}
            .match-status {{
                font-size: 0.8em;
                color: #666;
                background: #f0f0f0;
                padding: 2px 6px;
                border-radius: 4px;
            }}
            .match-status.success {{
                background: #d4edda;
                color: #155724;
            }}
            .error-message {{
                color: #721c24;
                background: #f8d7da;
                padding: 10px;
                border-radius: 5px;
                margin-top: 10px;
            }}
            .no-matches {{
                text-align: center;
                color: #666;
                font-style: italic;
                padding: 20px;
            }}
            .debug-info {{
                background: #e7f3ff;
                border: 1px solid #b3d9ff;
                border-radius: 5px;
                padding: 10px;
                margin-top: 10px;
                font-size: 0.9em;
                color: #0066cc;
            }}
            .scrollbar-custom {{
                scrollbar-width: thin;
                scrollbar-color: #667eea #f0f0f0;
            }}
            .scrollbar-custom::-webkit-scrollbar {{
                width: 8px;
            }}
            .scrollbar-custom::-webkit-scrollbar-track {{
                background: #f0f0f0;
                border-radius: 4px;
            }}
            .scrollbar-custom::-webkit-scrollbar-thumb {{
                background: #667eea;
                border-radius: 4px;
            }}
            .scrollbar-custom::-webkit-scrollbar-thumb:hover {{
                background: #5a67d8;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <div class="overall-status">
                {'🎯 OVERALL SUCCESS' if overall_success else '❌ NO MATCHES FOUND'}
            </div>
            <h1>Comic Upload Report</h1>
            <h2>{series_name} ({year})</h2>
            <p>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            <p>Threshold: ≥ {SIMILARITY_THRESHOLD} similarity for successful match</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">{total_images}</div>
                <div class="stat-label">Total Images</div>
            </div>
            <div class="stat-card">
                <div class="stat-value success">{match_successful_uploads}</div>
                <div class="stat-label">Successful Matches (≥{SIMILARITY_THRESHOLD})</div>
            </div>
            <div class="stat-card">
                <div class="stat-value warning">{no_match_uploads}</div>
                <div class="stat-label">No Matches Found</div>
            </div>
            <div class="stat-card">
                <div class="stat-value danger">{failed_uploads}</div>
                <div class="stat-label">API Failures</div>
            </div>
            <div class="stat-card">
                <div class="stat-value {'success' if overall_success else 'danger'}">{('YES' if overall_success else 'NO')}</div>
                <div class="stat-label">Overall Success</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{best_overall_similarity:.3f}</div>
                <div class="stat-label">Best Match Found</div>
            </div>
        </div>
        
        <div class="results-container scrollbar-custom">
            <h3>Individual Results</h3>
    """
    
    # Add each result
    for i, result in enumerate(results, 1):
        image_name = os.path.basename(result['image_path'])
        image_base64 = image_to_base64(result['image_path'])
        
        # Determine result class for styling
        if not result['api_success']:
            result_class = "error"
        elif result['match_success']:
            result_class = "match-success"
        else:
            result_class = "no-match"
        
        html_content += f"""
            <div class="result-item {result_class}">
                <div class="uploaded-image">
                    <img src="{image_base64}" alt="{image_name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI4MCIgdmlld0JveD0iMCAwIDIwMCAyODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjgwIiBmaWxsPSIjRjBGMEYwIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTQwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjY2IiBmb250LXNpemU9IjE0Ij5JbWFnZSBub3QgZm91bmQ8L3RleHQ+Cjwvc3ZnPgo='">
                    <div class="image-info">
                        <strong>{image_name}</strong>
                    </div>
                </div>
                
                <div class="matches-container">
        """
        
        # Status badge
        if not result['api_success']:
            html_content += '<div class="status-badge api-failure">❌ API FAILURE</div>'
        elif result['match_success']:
            html_content += '<div class="status-badge match-found">✅ MATCH FOUND</div>'
        else:
            html_content += '<div class="status-badge no-match-found">⚠️ NO MATCH</div>'
        
        # Best similarity highlight
        if result['api_success']:
            similarity_class = "good" if result['best_similarity'] >= SIMILARITY_THRESHOLD else "poor"
            html_content += f"""
                <div class="similarity-highlight {similarity_class}">
                    Best Similarity: {result['best_similarity']:.4f} 
                    {'(Threshold Met ✓)' if result['best_similarity'] >= SIMILARITY_THRESHOLD else '(Below Threshold)'}
                </div>
            """
        
        if result['api_success']:
            response_data = result['response_data']
            if response_data and 'top_matches' in response_data:
                total_matches = response_data.get('total_matches', 0)
                top_matches = response_data['top_matches'][:6]  # Show top 6 matches
                
                html_content += f"<p><strong>Total matches found:</strong> {total_matches}</p>"
                
                if top_matches:
                    html_content += '<div class="matches-grid">'
                    for j, match in enumerate(top_matches, 1):
                        similarity = match.get('similarity', 0)
                        url = match.get('url', '')
                        meets_threshold = similarity >= SIMILARITY_THRESHOLD
                        
                        # Create a color-coded similarity score
                        if similarity >= SIMILARITY_THRESHOLD:
                            score_color = '#28a745'  # Green
                        elif similarity >= 0.10:
                            score_color = '#ffc107'  # Yellow
                        elif similarity >= 0.05:
                            score_color = '#fd7e14'  # Orange
                        else:
                            score_color = '#dc3545'  # Red
                        
                        match_class = "threshold-met" if meets_threshold else ""
                        status_class = "success" if meets_threshold else ""
                        
                        html_content += f"""
                            <div class="match-item {match_class}">
                                <img src="{url}" alt="Match {j}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgdmlld0JveD0iMCAwIDE1MCAxNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxNTAiIGhlaWdodD0iMTUwIiBmaWxsPSIjRjBGMEYwIi8+Cjx0ZXh0IHg9Ijc1IiB5PSI3NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzY2NiIgZm9udC1zaXplPSIxMiI+Tm8gSW1hZ2U8L3RleHQ+Cjwvc3ZnPgo='">
                                <div class="similarity-score" style="color: {score_color};">
                                    {similarity:.4f}
                                </div>
                                <div class="match-status {status_class}">
                                    {'✅ SUCCESS' if meets_threshold else '❌ BELOW THRESHOLD'}
                                </div>
                            </div>
                        """
                    html_content += '</div>'
                    
                    # Add debug info showing raw response data
                    html_content += f'''
                        <div class="debug-info">
                            <strong>Debug:</strong> Found {len(response_data['top_matches'])} total matches. 
                            Best similarity: {result['best_similarity']:.4f}. 
                            Response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dict'}
                        </div>
                    '''
                else:
                    html_content += '<div class="no-matches">No matches found</div>'
            else:
                html_content += '<p>Success, but no detailed match data available</p>'
                # Add debug info to see what we actually got
                if response_data:
                    html_content += f'''
                        <div class="debug-info">
                            <strong>Debug:</strong> Response data type: {type(response_data)}<br>
                            Response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dict'}<br>
                            Raw response sample: {str(response_data)[:200]}...
                        </div>
                    '''
        else:
            # Show error information
            error_msg = result['error'] or result.get('response_text', 'Unknown error')
            html_content += f'<div class="error-message"><strong>Error:</strong> {error_msg}</div>'
            if result['status_code']:
                html_content += f'<p><strong>HTTP Status:</strong> {result["status_code"]}</p>'
        
        html_content += """
                </div>
            </div>
        """
    
    html_content += """
        </div>
    </body>
    </html>
    """
    
    return html_content

def main():
    # Configuration
    SERIES_ID = 3
    FOLDER_PATH = "./images/Green Lanterns (2016)/"
    
    print(f"DEBUG: Looking for folder: {FOLDER_PATH}")
    print(f"DEBUG: Absolute path: {os.path.abspath(FOLDER_PATH)}")
    print(f"DEBUG: Folder exists: {os.path.exists(FOLDER_PATH)}")
    print(f"DEBUG: Using similarity threshold: {SIMILARITY_THRESHOLD}")
    
    # If the exact folder doesn't exist, let's see what folders are available
    if not os.path.exists(FOLDER_PATH):
        print("Available folders in current directory:")
        for item in os.listdir('.'):
            if os.path.isdir(item):
                print(f"  - {item}")
        
        # Try to find a folder that contains "Green Lanterns"
        for item in os.listdir('.'):
            if os.path.isdir(item) and 'Green Lanterns' in item:
                FOLDER_PATH = item
                print(f"Found matching folder: {FOLDER_PATH}")
                break
        else:
            print(f"Error: No folder containing 'Green Lanterns' found!")
            return
    
    # Extract series information
    series_name, year = extract_name_and_year(FOLDER_PATH)
    print(f"Processing series: '{series_name}' ({year})")
    
    # Validate we have both name and year
    if not series_name or not year:
        print("Error: Could not extract series name and year from folder name")
        print("Expected format: 'Series Name (YYYY)'")
        return
    
    # Get all image files
    image_files = get_image_files(FOLDER_PATH)[:10]
    if not image_files:
        print("No image files found in the folder!")
        return
    
    print(f"Found {len(image_files)} image files")
    
    # Process each image
    results = []
    for i, image_path in enumerate(image_files, 1):
        image_name = os.path.basename(image_path)
        print(f"Processing {i}/{len(image_files)}: {image_name}")
        
        # Upload image
        result = upload_comic_image(SERIES_ID, image_path, series_name, year)
        result['image_path'] = image_path
        results.append(result)
        
        # Print immediate result
        if result['api_success']:
            if result['match_success']:
                print(f"  🎯 SUCCESS - Best similarity: {result['best_similarity']:.4f} (≥{SIMILARITY_THRESHOLD})")
            else:
                print(f"  ⚠️  NO MATCH - Best similarity: {result['best_similarity']:.4f} (<{SIMILARITY_THRESHOLD})")
        else:
            error_msg = result['error'] or result.get('response_text', 'Unknown error')
            print(f"  ❌ API FAILED - {error_msg}")
        
        # Add a small delay to avoid overwhelming the server
        # time.sleep(0.1)
    
    # Calculate overall success
    overall_success = any(r['match_success'] for r in results)
    successful_matches = sum(1 for r in results if r['match_success'])
    api_failures = sum(1 for r in results if not r['api_success'])
    no_matches = sum(1 for r in results if r['api_success'] and not r['match_success'])
    
    # Generate and save visual report
    print("\nGenerating visual report...")
    html_report = generate_visual_report(results, FOLDER_PATH, series_name, year)
    
    # Save report to file
    report_filename = f"comic_upload_report_{series_name.replace(' ', '_')}_{year}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    with open(report_filename, 'w', encoding='utf-8') as f:
        f.write(html_report)
    
    print(f"Visual report saved to: {report_filename}")
    print("Open this file in your web browser to view the results!")
    print("\n" + "="*60)
    print("FINAL SUMMARY:")
    print(f"Overall Result: {'🎯 SUCCESS' if overall_success else '❌ NO MATCHES FOUND'}")
    print(f"Successful matches (≥{SIMILARITY_THRESHOLD}): {successful_matches}/{len(results)}")
    print(f"No matches found: {no_matches}")
    print(f"API failures: {api_failures}")
    if overall_success:
        best_match = max(results, key=lambda x: x['best_similarity'])
        print(f"Best match: {best_match['best_similarity']:.4f} from {os.path.basename(best_match['image_path'])}")
    print("="*60)

if __name__ == "__main__":
    main()