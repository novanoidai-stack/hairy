#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Diagnostico de framing: captura con/sin FX y vuelca posiciones de camara/grupos."""
import sys, time, json
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8889/MECHA_motion_v3.html"
OUT = Path(__file__).resolve().parent / "qa"
OUT.mkdir(exist_ok=True)

def main():
    # (nombre, elapsed, ocultar_fx)
    shots = [
        ("s1_3",   3.0, False),
        ("s1_6",   6.0, False),
        ("s4_32",  32.0, False),
        ("s5_42",  42.0, False),
        ("s3_21",  21.3, False),
        ("s2_14",  14.0, False),
        ("s7_66",  66.0, False),
    ]
    with sync_playwright() as p:
        b = p.chromium.launch(headless=False, channel="chrome",
            args=['--autoplay-policy=no-user-gesture-required','--ignore-gpu-blocklist','--enable-gpu-rasterization'])
        ctx = b.new_context(viewport={'width':1920,'height':1080})
        pg = ctx.new_page()
        pg.goto(URL); pg.wait_for_selector('#cover', timeout=20000)
        pg.click('#cover'); time.sleep(1.0)
        pg.click('#tgVoz'); pg.click('#tgSfx'); time.sleep(0.3)
        for name, el, nofx in shots:
            pg.evaluate("window.__mecha.seek(%f)" % el)
            time.sleep(0.3)
            pg.evaluate("window.__mecha.hideFx(%s)" % ('true' if nofx else 'false'))
            pg.click('#btnPlay')  # pausa -> congela
            time.sleep(1.1)       # dejar que el lookAt suavizado converja
            pg.screenshot(path=str(OUT / f"{name}.png"))
            print("shot", name, "@", round(el,2))
        # dump diagnostico
        pg.evaluate("window.__mecha.seek(%f)" % 0.6); time.sleep(0.2)
        print("CAM@S1", pg.evaluate("window.__mecha.cam()"))
        print("GROUPS", json.dumps(pg.evaluate("window.__mecha.groups()")))
        pg.evaluate("window.__mecha.seek(%f)" % 30.2); time.sleep(0.2)
        print("CAM@S4", pg.evaluate("window.__mecha.cam()"))
        b.close()
    print("DONE")

if __name__=='__main__':
    main()
