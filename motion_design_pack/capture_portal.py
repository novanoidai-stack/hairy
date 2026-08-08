#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Captura el portal publico de reserva (movil) desde produccion. Anonimo, sin login."""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "capturas_recortadas" / "portal_mobile_clean.png"

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=False, channel="chrome",
            args=['--autoplay-policy=no-user-gesture-required','--ignore-gpu-blocklist'])
        ctx = b.new_context(viewport={'width':412,'height':892}, device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")
        pg = ctx.new_page()
        pg.goto("https://www.mechaa.es/app/r/demo", wait_until="domcontentloaded", timeout=45000)
        # el portal es SPA: dar tiempo a pintar servicios/slots
        time.sleep(6)
        try:
            pg.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        time.sleep(1)
        # quitar el banner de cookies para una captura limpia
        for sel in ["text=Aceptar", "text=Aceptar todo", "button:has-text('Aceptar')"]:
            try:
                pg.locator(sel).first.click(timeout=2500)
                time.sleep(0.8)
                break
            except Exception:
                pass
        time.sleep(1)
        pg.screenshot(path=str(OUT), full_page=False)
        print("saved", OUT, OUT.stat().st_size if OUT.exists() else "MISSING")
        b.close()

if __name__=='__main__':
    main()
