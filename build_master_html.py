import os
import re
from bs4 import BeautifulSoup

PAGES_DIR = "html_pages"
ASSETS_DIR = "assets"
MASTER_HTML = "neuronal_dynamics_master.html"

# Order of pages as extracted from TOC
def get_page_list():
    if not os.path.exists(PAGES_DIR):
        return []
    # We load index.html to read the exact sequence
    index_path = os.path.join(PAGES_DIR, "index.html")
    if not os.path.exists(index_path):
        return []
        
    with open(index_path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")
        
    toc = soup.find("ul", class_="ltx_toclist")
    pages = ["index.html"]
    if toc:
        for a in toc.find_all("a", href=True):
            href = a["href"].split("#")[0]
            if href and href not in pages and not href.startswith("http") and not href.startswith("#"):
                pages.append(href)
                
    for extra in ["errata.html", "bib.html", "idx.html"]:
        if extra not in pages and os.path.exists(os.path.join(PAGES_DIR, extra)):
            pages.append(extra)
            
    return pages

def assemble_master_html():
    pages = get_page_list()
    print(f"Assembling {len(pages)} pages into master HTML...")
    
    combined_content = []
    
    # Custom CSS for PDF E-Book
    custom_css = """
    <style>
        @page {
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
            @bottom-right {
                content: counter(page);
                font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
                font-size: 9pt;
                color: #555;
            }
            @top-center {
                content: "Neuronal Dynamics - Gerstner et al.";
                font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
                font-size: 8pt;
                color: #777;
                border-bottom: 1px solid #ddd;
                width: 100%;
                padding-bottom: 3px;
            }
        }
        
        body {
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #111111;
            background: #ffffff;
            margin: 0;
            padding: 0;
        }

        /* Cover Page */
        .cover-page {
            page-break-before: always;
            page-break-after: always;
            text-align: center;
            padding-top: 100px;
            padding-bottom: 100px;
        }
        .cover-title {
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 34pt;
            font-weight: bold;
            color: #1a365d;
            margin-bottom: 10px;
            line-height: 1.2;
        }
        .cover-subtitle {
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 18pt;
            font-style: italic;
            color: #2b6cb0;
            margin-bottom: 40px;
        }
        .cover-authors {
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 14pt;
            font-weight: 500;
            color: #2d3748;
            margin-bottom: 60px;
            line-height: 1.8;
        }
        .cover-publisher {
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 11pt;
            color: #718096;
            margin-top: 80px;
        }

        /* Page Breaks */
        .page-part {
            page-break-before: always;
            margin-top: 50px;
            margin-bottom: 30px;
            border-bottom: 3px solid #2b6cb0;
            padding-bottom: 15px;
        }
        .page-chapter {
            page-break-before: always;
            margin-top: 40px;
            margin-bottom: 25px;
            border-bottom: 2px solid #4a5568;
            padding-bottom: 10px;
        }
        .page-section {
            margin-top: 30px;
            margin-bottom: 15px;
        }

        h1, h2, h3, h4, h5, h6 {
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            color: #1a202c;
            page-break-after: avoid;
        }
        h1 { font-size: 24pt; }
        h2 { font-size: 18pt; }
        h3 { font-size: 14pt; }
        h4 { font-size: 12pt; }

        p {
            text-align: justify;
            text-justify: inter-word;
            margin-bottom: 1em;
            orphans: 3;
            widows: 3;
        }

        /* Figures & Captions */
        figure, .ltx_figure {
            page-break-inside: avoid;
            text-align: center;
            margin: 20px auto;
            max-width: 95%;
        }
        img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto 10px auto;
        }
        figcaption, .ltx_caption {
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 9.5pt;
            color: #4a5568;
            margin-top: 8px;
            text-align: justify;
        }

        /* MathJax & Math formatting */
        .MathJax_Display, .ltx_equation {
            page-break-inside: avoid;
            margin: 1em 0 !important;
            overflow-x: auto;
        }
        .ltx_Math {
            font-family: serif;
        }

        /* Callouts, Notes & Panels */
        .panel, .ltx_theorem, .ltx_proof {
            background-color: #f7fafc;
            border-left: 4px solid #3182ce;
            padding: 12px 16px;
            margin: 18px 0;
            page-break-inside: avoid;
            border-radius: 4px;
        }
        .panel-danger {
            border-left-color: #e53e3e;
            background-color: #fff5f5;
        }
        .panel-warning {
            border-left-color: #dd6b20;
            background-color: #fffaf0;
        }

        /* Tables */
        table, .ltx_tabular {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            page-break-inside: avoid;
            font-size: 10pt;
        }
        th, td {
            border: 1px solid #cbd5e0;
            padding: 8px 12px;
            text-align: left;
        }
        th {
            background-color: #edf2f7;
            font-weight: bold;
        }

        /* TOC Links */
        .ltx_toclist {
            list-style: none;
            padding-left: 0;
        }
        .ltx_tocentry {
            margin-bottom: 6px;
        }
        .ltx_tocentry a {
            color: #2b6cb0;
            text-decoration: none;
        }
        .ltx_tocentry a:hover {
            text-decoration: underline;
        }

        /* Hide Web Navigation Bars in Print */
        .navbar, .navbar-default, .ltx_page_header, .ltx_page_footer, nav, .sr-only {
            display: none !important;
        }
    </style>
    """

    header_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Neuronal Dynamics - Full Book</title>
    {custom_css}
    <script type="text/x-mathjax-config">
      MathJax.Hub.Config({{
        tex2jax: {{
          inlineMath: [['$','$'], ['\\\\(','\\\\)']],
          displayMath: [['$$','$$'], ['\\\\[','\\\\]']],
          processEscapes: true
        }},
        CommonHTML: {{ matchFontHeight: false }},
        "HTML-CSS": {{ availableFonts: ["TeX"], matchFontHeight: false, imageFont: null }}
      }});
    </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js?config=TeX-AMS-MML_HTMLorMML"></script>
</head>
<body>

<!-- Front Cover Page -->
<div class="cover-page">
    <div class="cover-title">Neuronal Dynamics</div>
    <div class="cover-subtitle">From single neurons to networks and models of cognition</div>
    <div class="cover-authors">
        Wulfram Gerstner &bull; Werner M. Kistler<br>
        Richard Naud &bull; Liam Paninski
    </div>
    <div class="cover-publisher">
        © Cambridge University Press 2014<br>
        Online Edition - EPFL
    </div>
</div>

<div class="book-content">
"""

    footer_html = """
</div>
</body>
</html>
"""

    for page_name in pages:
        page_path = os.path.join(PAGES_DIR, page_name)
        if not os.path.exists(page_path):
            print(f"Skipping missing file: {page_name}")
            continue

        with open(page_path, "r", encoding="utf-8") as f:
            html = f.read()

        soup = BeautifulSoup(html, "html.parser")

        # Remove navigation headers/footers
        for nav in soup.find_all(["div", "header", "footer", "nav"], class_=lambda c: c and any(x in c for x in ["navbar", "ltx_page_header", "ltx_page_footer"])):
            nav.decompose()

        # Update image paths to local assets
        for img in soup.find_all("img"):
            src = img.get("src")
            if src and not src.startswith("data:"):
                img_name = os.path.basename(src.split("?")[0])
                if "../img/" in src or "/img/" in src:
                    clean_name = "img_" + img_name
                else:
                    clean_name = img_name
                img["src"] = f"assets/{clean_name}"

        # Extract main document content
        main_content = soup.find("div", class_="ltx_page_content")
        if not main_content:
            main_content = soup.find("section", class_=lambda c: c and "ltx_document" in c)
        if not main_content:
            main_content = soup.find("body")

        if main_content:
            content_str = str(main_content)
            
            # Wrap content with appropriate page break markers based on page type
            if page_name.startswith("Pt"):
                content_wrapper = f'<div class="page-part" id="{page_name}">{content_str}</div>'
            elif page_name.startswith("Ch") and ".S" not in page_name and ".Sx" not in page_name:
                content_wrapper = f'<div class="page-chapter" id="{page_name}">{content_str}</div>'
            else:
                content_wrapper = f'<div class="page-section" id="{page_name}">{content_str}</div>'
                
            combined_content.append(content_wrapper)

    master_html_str = header_html + "\n\n".join(combined_content) + footer_html

    with open(MASTER_HTML, "w", encoding="utf-8") as f:
        f.write(master_html_str)

    print(f"Master HTML created successfully: {MASTER_HTML}")

if __name__ == "__main__":
    assemble_master_html()
