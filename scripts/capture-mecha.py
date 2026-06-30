"""
Captura pantallas reales de Mecha para el motion design
"""
import asyncio
from playwright.async_api import async_playwright
import os
from pathlib import Path

# Crear carpeta de capturas
CAPTURES_DIR = Path("DELIVERY/captures")
CAPTURES_DIR.mkdir(exist_ok=True, parents=True)

async def capture_mecha_screens():
    async with async_playwright() as p:
        # Lanzar navegador
        browser = await p.chromium.launch(
            headless=False,  # Ver el navegador
            args=['--window-size=1280,800']
        )

        page = await browser.new_page(viewport={'width': 1280, 'height': 800})

        # Ir a la demo
        print("[CAP] Navegando a la demo de Mecha...")
        await page.goto("http://localhost:8080/demo.html?share=1")

        # Esperar a que cargue el iframe
        await asyncio.sleep(3)

        # Buscar el iframe de la demo
        try:
            iframe = page.frame_locator('iframe[src*="demo"]')
            print("[OK] Iframe de demo encontrado")
        except:
            print("[WARN] No se encontro iframe, intentando directa...")
            # Si no hay iframe, navegar directo
            await page.goto("http://localhost:8080/app?demo=1")
            await asyncio.sleep(5)
            iframe = page

        # Lista de capturas a tomar
        captures = [
            {"name": "01-agenda-overview", "wait": 2, "desc": "Agenda general"},
            {"name": "02-agenda-day", "wait": 1, "desc": "Vista de día"},
            {"name": "03-clientes-list", "wait": 2, "desc": "Lista de clientes"},
            {"name": "04-cliente-ficha", "wait": 2, "desc": "Ficha de cliente"},
            {"name": "05-servicios", "wait": 2, "desc": "Servicios"},
            {"name": "06-informes", "wait": 2, "desc": "Informes"},
            {"name": "07-caja", "wait": 2, "desc": "Caja"},
        ]

        # Si no hay iframe, usar la página directa
        if iframe == page:
            print("[CAP] Capturando pantalla principal...")
            await page.screenshot(path=str(CAPTURES_DIR / "00-loading.png"), full_page=False)
            await asyncio.sleep(2)

            # Capturas de diferentes estados
            for i, cap in enumerate(captures[:3]):  # Limitar a 3 por ahora
                print(f"[CAP] Capturando: {cap['desc']}")
                await page.screenshot(
                    path=str(CAPTURES_DIR / f"{cap['name']}.png"),
                    full_page=False
                )
                await asyncio.sleep(cap['wait'])

                # Simular scroll o interacción
                if i == 1:
                    # Intentar hacer scroll
                    await page.mouse.wheel(0, 300)
                    await asyncio.sleep(1)
        else:
            print("[CAP] Capturando desde iframe...")
            # Capturar el iframe
            frame_element = await page.query_selector('iframe')
            if frame_element:
                box = await frame_element.bounding_box()
                if box:
                    # Capturar solo el área del iframe
                    await page.screenshot(
                        path=str(CAPTURES_DIR / "00-demo-iframe.png"),
                        clip=box,
                        full_page=False
                    )

        await asyncio.sleep(2)

        # Capturas adicionales
        print("[CAP] Capturando estados adicionales...")

        # Intentar capturar con diferentes themes/sizes
        await page.set_viewport_size({'width': 390, 'height': 844})  # Mobile
        await asyncio.sleep(2)
        await page.screenshot(path=str(CAPTURES_DIR / "10-mobile.png"))

        await page.set_viewport_size({'width': 1280, 'height': 800})  # Desktop
        await asyncio.sleep(2)

        print(f"[OK] Capturas guardadas en {CAPTURES_DIR}")

        await asyncio.sleep(5)  # Mantener abierto un momento
        await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_mecha_screens())
