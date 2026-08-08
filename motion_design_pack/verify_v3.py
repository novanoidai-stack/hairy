#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verificacion VISUAL de MECHA_motion_v3.html con Chrome REAL (headed).
A diferencia de qa_video_v3.py (headless+swiftshader, que NO renderiza WebGL),
este lanza Chrome real con GPU -> WebGL se renderiza de verdad.

Uso:
  python verify_v3.py                # captura el set por defecto (7 escenas)
  python verify_v3.py 21.0 s3_test   # captura 1 frame en elapsed=21.0s -> qa/s3_test.png

Requiere el server estatico en 127.0.0.1:8889 (python -m http.server 8889).
"""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8889/MECHA_motion_v3.html"
OUT = Path(__file__).resolve().parent / "qa"
OUT.mkdir(exist_ok=True)
TOTAL = 71.1  # suma de SCENES[].d


def seek(pg, elapsed):
    """Seek via click en #bar al pct equivalente, luego pausa para congelar el frame."""
    pct = max(0.0, min(1.0, elapsed / TOTAL))
    pg.evaluate(
        """(pct) => {
          const bar = document.getElementById('bar');
          const r = bar.getBoundingClientRect();
          bar.dispatchEvent(new MouseEvent('click', {clientX: r.left + r.width * pct, bubbles: true}));
        }""",
        pct,
    )
    time.sleep(0.25)  # deja que enterScene() corra y la camara se estabilice
    pg.click('#btnPlay')  # pausa -> congela elapsed (loop sigue renderizando)
    time.sleep(0.25)


def main():
    starts = [0, 10.6, 19.3, 29.2, 38.7, 45.8, 62.7]
    offs = [2.5, 2.0, 2.0, 4.6, 2.0, 3.0, 2.5]
    if len(sys.argv) == 3:
        shots = [(sys.argv[2], float(sys.argv[1]))]
    else:
        shots = [(f"scene{i+1:02d}", starts[i] + offs[i]) for i in range(7)]

    with sync_playwright() as p:
        b = p.chromium.launch(
            headless=False,
            channel="chrome",
            args=[
                '--autoplay-policy=no-user-gesture-required',
                '--ignore-gpu-blocklist',
                '--enable-gpu-rasterization',
            ],
        )
        ctx = b.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
        pg = ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(URL)
        pg.wait_for_selector('#cover', timeout=20000)
        pg.click('#cover')  # arranca play() (gesto audio) y oculta la portada
        time.sleep(1.2)
        # silenciar voz/SFX para captura silenciosa
        pg.click('#tgVoz')
        pg.click('#tgSfx')
        time.sleep(0.3)
        for name, el in shots:
            seek(pg, el)
            pg.screenshot(path=str(OUT / f"{name}.png"))
            print(f"shot {name} @ {round(el,2)}s -> qa/{name}.png")
        qaok = pg.evaluate("window.__qa_ok")
        print("__qa_ok =", qaok, "| console errors:", errs[:5])
        b.close()
    print("DONE")


if __name__ == '__main__':
    main()
