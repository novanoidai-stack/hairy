import os
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

MASTER_HTML_PATH = Path("neuronal_dynamics_master.html").resolve()
OUTPUT_PDF_PATH = Path("Neuronal_Dynamics_Book.pdf").resolve()
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def generate_pdf():
    if not MASTER_HTML_PATH.exists():
        raise FileNotFoundError(f"Master HTML file not found: {MASTER_HTML_PATH}")

    file_uri = MASTER_HTML_PATH.as_uri()
    print(f"Loading master HTML: {file_uri}...", flush=True)

    with sync_playwright() as p:
        print("Launching Edge browser via Playwright...", flush=True)
        browser = p.chromium.launch(
            executable_path=EDGE_PATH,
            headless=True,
            args=["--disable-gpu", "--no-sandbox", "--allow-file-access-from-files"]
        )
        
        context = browser.new_context(viewport={"width": 1200, "height": 1600})
        page = context.new_page()

        # Set a 3 minute timeout for loading and processing the heavy document
        page.set_default_timeout(180000)

        print("Navigating to file URI...", flush=True)
        page.goto(file_uri, wait_until="domcontentloaded")
        print("DOM Loaded! Waiting for assets and MathJax...", flush=True)

        # Wait for MathJax to complete if loaded
        try:
            page.wait_for_function(
                "typeof MathJax === 'undefined' || (MathJax.Hub && MathJax.Hub.queue.queue.length === 0)",
                timeout=45000
            )
            print("MathJax processing finished!", flush=True)
        except Exception as e:
            print(f"MathJax wait timeout (proceeding to render): {e}", flush=True)

        print("Waiting 10 seconds for layout settling...", flush=True)
        time.sleep(10)

        print(f"Generating PDF at {OUTPUT_PDF_PATH}...", flush=True)
        page.pdf(
            path=str(OUTPUT_PDF_PATH),
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
                    P&aacute;gina <span class="pageNumber"></span> de <span class="totalPages"></span>
                </div>
            ''',
            margin={
                "top": "22mm",
                "bottom": "22mm",
                "left": "15mm",
                "right": "15mm"
            }
        )

        browser.close()

    if OUTPUT_PDF_PATH.exists():
        size_mb = OUTPUT_PDF_PATH.stat().st_size / (1024 * 1024)
        print(f"SUCCESS: PDF generated successfully at '{OUTPUT_PDF_PATH}' ({size_mb:.2f} MB)", flush=True)
    else:
        raise Exception("PDF generation failed, file not found.")

if __name__ == "__main__":
    generate_pdf()
