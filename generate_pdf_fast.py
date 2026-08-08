import os
import sys
import time
import fitz # PyMuPDF
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

PAGES_DIR = Path("html_pages").resolve()
ASSETS_DIR = Path("assets").resolve()
TEMP_HTML_DIR = Path("temp_html").resolve()
TEMP_PDF_DIR = Path("temp_pdf").resolve()
OUTPUT_PDF = Path("Neuronal_Dynamics_Book.pdf").resolve()
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

TEMP_HTML_DIR.mkdir(exist_ok=True)
TEMP_PDF_DIR.mkdir(exist_ok=True)

CUSTOM_CSS = """
<style>
    @page {
        size: A4;
        margin: 20mm 15mm 20mm 15mm;
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
    .cover-page {
        page-break-before: always;
        page-break-after: always;
        text-align: center;
        padding-top: 120px;
        padding-bottom: 120px;
    }
    .cover-title {
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 36pt;
        font-weight: bold;
        color: #1a365d;
        margin-bottom: 12px;
        line-height: 1.2;
    }
    .cover-subtitle {
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 18pt;
        font-style: italic;
        color: #2b6cb0;
        margin-bottom: 50px;
    }
    .cover-authors {
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 14pt;
        font-weight: 500;
        color: #2d3748;
        margin-bottom: 80px;
        line-height: 1.8;
    }
    .cover-publisher {
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 11pt;
        color: #718096;
    }
    .page-part {
        page-break-before: always;
        margin-top: 40px;
        margin-bottom: 30px;
        border-bottom: 3px solid #2b6cb0;
        padding-bottom: 15px;
    }
    .page-chapter {
        page-break-before: always;
        margin-top: 30px;
        margin-bottom: 25px;
        border-bottom: 2px solid #4a5568;
        padding-bottom: 10px;
    }
    .page-section {
        margin-top: 25px;
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
    .MathJax_Display, .ltx_equation {
        page-break-inside: avoid;
        margin: 1em 0 !important;
    }
    .panel, .ltx_theorem, .ltx_proof {
        background-color: #f7fafc;
        border-left: 4px solid #3182ce;
        padding: 12px 16px;
        margin: 18px 0;
        page-break-inside: avoid;
        border-radius: 4px;
    }
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
    .navbar, .navbar-default, .ltx_page_header, .ltx_page_footer, nav, .sr-only {
        display: none !important;
    }
</style>
"""

HEADER_TEMPLATE = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    {CUSTOM_CSS}
    <script type="text/x-mathjax-config">
      MathJax.Hub.Config({{
        tex2jax: {{
          inlineMath: [['$','$'], ['\\\\(','\\\\)']],
          displayMath: [['$$','$$'], ['\\\\[','\\\\]']],
          processEscapes: true
        }},
        CommonHTML: {{ matchFontHeight: false }},
        "HTML-CSS": {{ availableFonts: ["TeX"], matchFontHeight: false }}
      }});
    </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js?config=TeX-AMS-MML_HTMLorMML"></script>
</head>
<body>
"""

FOOTER_TEMPLATE = """
</body>
</html>
"""

def group_pages_by_chapter():
    index_path = PAGES_DIR / "index.html"
    with open(index_path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")
    
    pages = ["index.html"]
    toc = soup.find("ul", class_="ltx_toclist")
    if toc:
        for a in toc.find_all("a", href=True):
            href = a["href"].split("#")[0]
            if href and href not in pages and not href.startswith("http") and not href.startswith("#"):
                pages.append(href)
    
    for extra in ["errata.html", "bib.html", "idx.html"]:
        if extra not in pages and (PAGES_DIR / extra).exists():
            pages.append(extra)
            
    # Group into logical units
    units = []
    
    # 0. Cover Page
    units.append(("00_Cover", ["COVER"]))
    
    current_unit_name = None
    current_unit_pages = []
    
    for p in pages:
        if p.startswith("Pt") or (p.startswith("Ch") and ".S" not in p and ".Sx" not in p) or p in ["index.html", "errata.html", "bib.html", "idx.html"]:
            if current_unit_pages:
                units.append((current_unit_name, current_unit_pages))
                current_unit_pages = []
            current_unit_name = p.replace(".html", "")
            current_unit_pages.append(p)
        else:
            if current_unit_name is None:
                current_unit_name = "Intro"
            current_unit_pages.append(p)
            
    if current_unit_pages:
        units.append((current_unit_name, current_unit_pages))
        
    return units

def prepare_chapter_html(unit_name, page_list):
    content_blocks = []
    
    if unit_name == "00_Cover":
        cover_html = """
        <div class="cover-page">
            <div class="cover-title">Neuronal Dynamics</div>
            <div class="cover-subtitle">From single neurons to networks and models of cognition</div>
            <div class="cover-authors">
                Wulfram Gerstner &bull; Werner M. Kistler<br>
                Richard Naud &bull; Liam Paninski
            </div>
            <div class="cover-publisher">
                &copy; Cambridge University Press 2014<br>
                Online Edition - EPFL
            </div>
        </div>
        """
        content_blocks.append(cover_html)
    else:
        for p in page_list:
            p_path = PAGES_DIR / p
            if not p_path.exists():
                continue
            with open(p_path, "r", encoding="utf-8") as f:
                soup = BeautifulSoup(f.read(), "html.parser")
                
            for nav in soup.find_all(["div", "header", "footer", "nav"], class_=lambda c: c and any(x in c for x in ["navbar", "ltx_page_header", "ltx_page_footer"])):
                nav.decompose()
                
            for img in soup.find_all("img"):
                src = img.get("src")
                if src and not src.startswith("data:"):
                    img_name = os.path.basename(src.split("?")[0])
                    clean_name = ("img_" + img_name) if ("../img/" in src or "/img/" in src) else img_name
                    abs_asset = ASSETS_DIR / clean_name
                    img["src"] = abs_asset.as_uri()
                    
            main = soup.find("div", class_="ltx_page_content") or soup.find("section", class_=lambda c: c and "ltx_document" in c) or soup.find("body")
            if main:
                content_blocks.append(str(main))
                
    full_html = HEADER_TEMPLATE + "\n".join(content_blocks) + FOOTER_TEMPLATE
    out_path = TEMP_HTML_DIR / f"{unit_name}.html"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(full_html)
    return out_path

def build_all_pdfs():
    units = group_pages_by_chapter()
    print(f"Divided book into {len(units)} chapter units for ultra-fast generation.", flush=True)
    
    pdf_files = []
    
    with sync_playwright() as p:
        print("Launching Edge browser...", flush=True)
        browser = p.chromium.launch(executable_path=EDGE_PATH, headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = browser.new_context()
        
        for idx, (unit_name, page_list) in enumerate(units, 1):
            html_file = prepare_chapter_html(unit_name, page_list)
            pdf_file = TEMP_PDF_DIR / f"{unit_name}.pdf"
            print(f"[{idx}/{len(units)}] Rendering {unit_name} to PDF...", flush=True)
            
            page = context.new_page()
            page.goto(html_file.as_uri(), wait_until="domcontentloaded")
            
            # Short wait for MathJax render
            try:
                page.wait_for_function("typeof MathJax === 'undefined' || (MathJax.Hub && MathJax.Hub.queue.queue.length === 0)", timeout=15000)
            except Exception:
                pass
                
            page.pdf(
                path=str(pdf_file),
                format="A4",
                print_background=True,
                display_header_footer=True,
                header_template='''
                    <div style="font-size: 8pt; font-family: Helvetica, Arial, sans-serif; color: #718096; width: 100%; text-align: center; border-bottom: 1px solid #cbd5e0; margin: 0 15mm; padding-bottom: 2px;">
                        Neuronal Dynamics &mdash; Gerstner, Kistler, Naud & Paninski
                    </div>
                ''',
                footer_template='''
                    <div style="font-size: 8pt; font-family: Helvetica, Arial, sans-serif; color: #718096; width: 100%; text-align: right; padding-right: 15mm;">
                        P&aacute;gina <span class="pageNumber"></span>
                    </div>
                ''',
                margin={"top": "22mm", "bottom": "22mm", "left": "15mm", "right": "15mm"}
            )
            page.close()
            pdf_files.append((unit_name, pdf_file))
            
        browser.close()
        
    print("\nMerging all chapter PDFs into final master PDF with PyMuPDF...", flush=True)
    merged_doc = fitz.open()
    toc_entries = [] # [level, title, page]
    current_page = 1
    
    for unit_name, pdf_path in pdf_files:
        if not pdf_path.exists():
            continue
        doc = fitz.open(pdf_path)
        page_count = len(doc)
        
        # Format bookmark title
        if unit_name == "00_Cover":
            title = "Cover Page"
            level = 1
        elif unit_name.startswith("Pt"):
            title = f"Part {unit_name[2:]}"
            level = 1
        elif unit_name.startswith("Ch"):
            title = f"Chapter {unit_name[2:]}"
            level = 2
        elif unit_name == "index":
            title = "Table of Contents"
            level = 1
        elif unit_name == "bib":
            title = "Bibliography"
            level = 1
        elif unit_name == "idx":
            title = "Index"
            level = 1
        elif unit_name == "errata":
            title = "Errata"
            level = 1
        else:
            title = unit_name
            level = 2
            
        toc_entries.append([level, title, current_page])
        merged_doc.insert_pdf(doc)
        current_page += page_count
        doc.close()
        
    merged_doc.set_toc(toc_entries)
    merged_doc.save(str(OUTPUT_PDF))
    merged_doc.close()
    
    size_mb = OUTPUT_PDF.stat().st_size / (1024 * 1024)
    print(f"\nSUCCESS: Complete e-book PDF generated at: '{OUTPUT_PDF}' ({size_mb:.2f} MB, {current_page-1} pages)", flush=True)

if __name__ == "__main__":
    build_all_pdfs()
