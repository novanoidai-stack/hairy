import os
import re
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://neuronaldynamics.epfl.ch/online/"
PAGES_DIR = "html_pages"
ASSETS_DIR = "assets"

os.makedirs(PAGES_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
})

def fetch_page(url, retries=5):
    for i in range(retries):
        try:
            r = session.get(url, timeout=20)
            if r.status_code == 200:
                return r.text
        except Exception as e:
            print(f"Retry {i+1}/{retries} for {url} due to error: {e}")
            time.sleep(2)
    raise Exception(f"Failed to fetch {url}")

def download_asset(asset_url, target_path, retries=3):
    if os.path.exists(target_path) and os.path.getsize(target_path) > 0:
        return
    for i in range(retries):
        try:
            r = session.get(asset_url, timeout=20)
            if r.status_code == 200:
                with open(target_path, "wb") as f:
                    f.write(r.content)
                return
        except Exception as e:
            print(f"Retry asset {i+1} for {asset_url}: {e}")
            time.sleep(1)
    print(f"Warning: could not download asset {asset_url}")

def get_all_page_urls():
    index_html = fetch_page(BASE_URL + "index.html")
    soup = BeautifulSoup(index_html, "html.parser")
    toc = soup.find("ul", class_="ltx_toclist")
    
    pages = ["index.html"]
    if toc:
        for a in toc.find_all("a", href=True):
            href = a["href"].split("#")[0]
            if href and href not in pages and not href.startswith("http") and not href.startswith("#"):
                pages.append(href)
                
    # Also ensure errata, bib, idx are included if present
    for extra in ["errata.html", "bib.html", "idx.html"]:
        if extra not in pages:
            pages.append(extra)
            
    return pages

def scrape_book():
    pages = get_all_page_urls()
    print(f"Found {len(pages)} pages to scrape.")
    
    for idx, page_name in enumerate(pages, 1):
        page_url = BASE_URL + page_name
        local_html_path = os.path.join(PAGES_DIR, page_name)
        
        print(f"[{idx}/{len(pages)}] Fetching {page_name}...")
        html_content = fetch_page(page_url)
        
        soup = BeautifulSoup(html_content, "html.parser")
        
        # Download images
        for img in soup.find_all("img"):
            src = img.get("src")
            if src and not src.startswith("data:"):
                # Handle relative paths like ../img/icon.png or x1.png
                full_img_url = urljoin(page_url, src)
                img_name = os.path.basename(src.split("?")[0])
                # To avoid collisions, prepend subfolder if needed or use unique clean name
                if "../img/" in src or "/img/" in src:
                    clean_name = "img_" + img_name
                else:
                    clean_name = img_name
                
                target_asset_path = os.path.join(ASSETS_DIR, clean_name)
                download_asset(full_img_url, target_asset_path)
                
        with open(local_html_path, "w", encoding="utf-8") as f:
            f.write(html_content)
            
    print("Scraping completed successfully!")

if __name__ == "__main__":
    scrape_book()
