#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QA que ASSERTA sobre MECHA_motion_v3.html:
- window.__qa_ok === true (la escena se inicializo sin tirar)
- 0 errores de consola
- 0 errores de red (404/500)
- 7 capturas (una por escena) en qa/v3_escena_NN.png

Nota: las capturas headless (swiftshader) pueden salir oscuras; este QA
verifica estructura/init, no fidelidad visual. La fidelidad se revisa con
Chrome real (chrome-devtools MCP).
"""
import os, time, threading, sys
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def start_server(port=8889):
    os.chdir(str(AQUI))
    httpd = HTTPServer(('127.0.0.1', port), QuietHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def run():
    start_server()
    url = "http://127.0.0.1:8889/MECHA_motion_v3.html"
    qa = AQUI / "qa"; qa.mkdir(exist_ok=True)
    errs, nets = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader-webgl'])
        pg = b.new_context(viewport={'width':1920,'height':1080}).new_page()
        pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        pg.on("requestfailed", lambda r: nets.append(f"{r.url} :: {r.failure}"))
        pg.on("response", lambda r: nets.append(f"{r.status} {r.url}") if r.status>=400 else None)
        pg.goto(url)
        try:
            pg.wait_for_selector("#cover", timeout=10000)
        except Exception as e:
            print(f"FAIL: no #cover: {e}"); b.close(); sys.exit(1)
        pg.click("#cover"); time.sleep(1)
        qaok = pg.evaluate("window.__qa_ok")
        qaerr = pg.evaluate("window.__qa_err")
        if qaok is not True:
            print(f"FAIL: __qa_ok != true  (err: {qaerr})"); b.close(); sys.exit(1)
        if errs:
            print(f"FAIL: errores de consola: {errs[:8]}"); b.close(); sys.exit(1)
        if nets:
            # ignorar 404 de favicon
            real=[n for n in nets if 'favicon' not in n]
            if real:
                print(f"FAIL: errores de red: {real[:8]}"); b.close(); sys.exit(1)
        for i in range(7):
            pg.screenshot(path=str(qa / f"v3_escena_{i+1:02d}.png"))
            time.sleep(1.2)
        b.close()
    print("QA v3 OK — __qa_ok=true, 0 errores consola, 0 errores red, 7 frames.")

if __name__ == "__main__":
    run()
