from urllib.parse import urljoin

def get_full_image_url(relative_url, request):
    """Convert relative image URLs to full URLs for frontend"""
    if not relative_url:
        return None
    
    if relative_url.startswith('http'):
        return relative_url  # Already a full URL
    
    # Build full URL using Flask request context
    return urljoin(request.url_root, relative_url.lstrip('/'))