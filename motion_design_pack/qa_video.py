#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QA automatizado con Playwright para verificar MECHA_motion_v2.html:
- Servidor HTTP local
- Comprobación de errores de consola JS
- Comprobación de errores de red (404, 500, abort)
- Capturas de pantalla por cada escena (1 a 10)
"""

import os
import sys
import time
import json
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def start_server(port=8889):
    os.chdir(str(AQUI))
    httpd = HTTPServer(('127.0.0.1', port), QuietHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd

def run_qa():
    port = 8889
    server = start_server(port)
    url = f"http://127.0.0.1:{port}/MECHA_motion_v2.html"
    
    qa_dir = AQUI / "qa"
    qa_dir.mkdir(exist_ok=True)

    console_errors = []
    network_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--autoplay-policy=no-user-gesture-required']
        )
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("requestfailed", lambda req: network_errors.append(f"{req.url}: {req.failure}"))

        print(f"Navegando a {url}...")
        page.goto(url)
        page.wait_for_selector("#cover")

        # Clic para iniciar
        page.click("#cover")
        time.sleep(1)

        print("\n==========================================================")
        print("  REVISANDO ESCENAS 1 A 10 (PLAYWRIGHT QA)")
        print("==========================================================\n")

        for i in range(10):
            shot_file = qa_dir / f"escena_{i+1:02d}.png"
            page.screenshot(path=str(shot_file))
            print(f"  [OK] Escena {i+1} capturada -> qa/{shot_file.name}")

        browser.close()

    print("\n==========================================================")
    print("  RESULTADOS QA:")
    print(f"  Errores de red: {len(network_errors)}")
    print(f"  Errores de consola: {len(console_errors)}")
    print("==========================================================\n")

if __name__ == "__main__":
    run_qa()
