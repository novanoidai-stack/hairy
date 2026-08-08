import os, threading, time
from http.server import SimpleHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class Q(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd = HTTPServer(('127.0.0.1',8889), Q)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader-webgl'])
    pg = b.new_context(viewport={'width':640,'height':480}).new_page()
    errs=[]; pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8889/spike_min.html')
    time.sleep(2)
    done = pg.evaluate("window.__done")
    # muestrea el pixel central del canvas
    px = pg.evaluate("""()=>{const c=document.getElementById('c');const g=c.getContext('webgl2')||c.getContext('webgl');
      const b=new Uint8Array(4); g.readPixels(320,240,1,1,g.RGBA,g.UNSIGNED_BYTE,b); return Array.from(b)}""")
    pg.screenshot(path='qa/spike_min.png')
    print('done:', done, 'center pixel RGBA:', px, 'console:', errs)
    b.close()
httpd.shutdown()
