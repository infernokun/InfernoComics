import requests
from bs4 import BeautifulSoup
import urllib.parse
import urllib3
import os

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

searxng_url = os.getenv("SEARXNG_URL")

issues = [i for i in range(1, 10)]

for i in issues:
    search_query = f"absolute green lantern #{i} variant cover"
    
    encoded_query = urllib.parse.quote(search_query, safe='')
    url = f"https://{searxng_url}/search?q={encoded_query}&categories=images&language=auto&time_range=&safesearch=0&theme=simple#image-viewer"
    
    response = requests.get(url, verify=False)
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    anchor_tags = soup.find_all('a', class_='result-images-source')
    
    if anchor_tags:
        top_url = anchor_tags[0]['href']
        print(f"{search_query}: {top_url}")
    else:
        print(f"{search_query}: No images found")