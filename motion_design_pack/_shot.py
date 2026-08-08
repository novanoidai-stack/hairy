import os, threading, time
from http.server import SimpleHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class Q(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd = HTTPServer(('127.0.0.1',8889), Q)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader-webgl'])
    pg = b.new_context(viewport={'width':1920,'height':1080}).new_page()
    errs=[]; nets=[]
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.on('requestfailed', lambda r: nets.append(f"{r.url} :: {r.failure}"))
    pg.on('response', lambda r: nets.append(f"RESP {r.status} {r.url}") if r.status>=400 else None)
    pg.goto('http://127.0.0.1:8889/spike_look.html')
    time.sleep(5)
    st = pg.evaluate("window.__texStatus")
    pg.screenshot(path='qa/spike.png')
    print('texStatus:', st)
    print('console errors:', errs)
    print('net (>=400 / failed):', [n for n in nets if 'RESP' in n or 'failed' in n][:10])
    b.close()
httpd.shutdown()
