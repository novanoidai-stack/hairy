#!/usr/bin/env python3
"""Capture screenshots of Mecha software using Selenium via demo.html iframe."""
import os, time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.edge.options import Options as EdgeOptions

OUT = r'C:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\.cluster\mecha-motion\screenshots'
os.makedirs(OUT, exist_ok=True)

opts = EdgeOptions()
opts.add_argument('--headless=New')
opts.add_argument('--window-size=1440,900')
opts.add_argument('--force-device-scale-factor=2')
opts.add_argument('--high-dpi-support=1')
opts.add_argument('--disable-gpu')

print('Starting Edge WebDriver...')
service = EdgeService()
driver = webdriver.Edge(service=service, options=opts)
wait = WebDriverWait(driver, 20)

BASE = 'http://localhost:8080'

try:
    # 1. Capture landing page first
    print('Capturing landing page...')
    driver.get(f'{BASE}/')
    time.sleep(4)
    driver.save_screenshot(os.path.join(OUT, 'landing.png'))
    print('  Saved landing.png')

    # 2. Go to demo.html which embeds the app in an iframe
    print('Navigating to demo.html...')
    driver.get(f'{BASE}/demo.html')
    time.sleep(6)  # Wait for iframe to load and auto-login

    # Find the iframe
    iframes = driver.find_elements(By.TAG_NAME, 'iframe')
    print(f'Found {len(iframes)} iframes')
    
    iframe = None
    for i, f in enumerate(iframes):
        src = f.get_attribute('src') or ''
        print(f'  iframe[{i}] src={src}')
        if 'app' in src or 'demo' in src:
            iframe = f
            break
    
    if not iframe and iframes:
        iframe = iframes[0]
    
    if iframe:
        print('Switching to iframe...')
        driver.switch_to.frame(iframe)
        time.sleep(4)
        print(f'In iframe. URL: {driver.current_url}')
        
        # Take screenshot of current view (should be agenda/main view)
        driver.save_screenshot(os.path.join(OUT, 'agenda.png'))
        print('  Saved agenda.png')
        
        # Try to find tab navigation - look for links/buttons with tab names
        tabs_to_capture = [
            ('clientes', ['Clientes', 'clientes']),
            ('equipo', ['Equipo', 'equipo']),
            ('informes', ['Informes', 'informes']),
            ('lista-espera', ['Lista', 'espera', 'lista-espera']),
            ('resenas', ['Reseñas', 'Resenas', 'resenas', 'reseñas']),
            ('configuracion', ['Configuración', 'Configuracion', 'configuracion', 'config', 'ajustes']),
        ]
        
        for slug, names in tabs_to_capture:
            try:
                # Switch back to main content to find tab links
                driver.switch_to.default_content()
                time.sleep(0.5)
                
                # Try clicking tab by text
                clicked = False
                all_links = driver.find_elements(By.CSS_SELECTOR, 'a, button, [role="tab"], [role="link"], nav a')
                for link in all_links:
                    text = link.text.strip()
                    for name in names:
                        if name.lower() in text.lower():
                            try:
                                link.click()
                                time.sleep(2)
                                clicked = True
                                break
                            except:
                                continue
                    if clicked:
                        break
                
                # If we didn't click, try switching to iframe and looking there
                if not clicked and iframe:
                    driver.switch_to.frame(iframe)
                    all_links = driver.find_elements(By.CSS_SELECTOR, 'a, button, [role="tab"], [role="link"], nav a')
                    for link in all_links:
                        text = link.text.strip()
                        for name in names:
                            if name.lower() in text.lower():
                                try:
                                    link.click()
                                    time.sleep(2)
                                    clicked = True
                                    break
                                except:
                                    continue
                        if clicked:
                            break
                
                if not clicked and iframe:
                    # Try direct URL in iframe
                    driver.switch_to.frame(iframe)
                    driver.get(f'{BASE}/app/(tabs)/{slug}')
                    time.sleep(3)
                
                # Take screenshot from iframe
                if iframe:
                    try:
                        driver.switch_to.frame(iframe)
                    except:
                        pass
                driver.save_screenshot(os.path.join(OUT, f'{slug}.png'))
                print(f'  Saved {slug}.png')
                
            except Exception as e:
                print(f'  Error with {slug}: {e}')
                # Still try to save
                try:
                    driver.save_screenshot(os.path.join(OUT, f'{slug}.png'))
                except:
                    pass
        
        # Switch back to main content
        driver.switch_to.default_content()
    
    # 3. Capture portal de reserva
    print('Capturing portal de reserva...')
    driver.get(f'{BASE}/app/r/demo')
    time.sleep(4)
    driver.save_screenshot(os.path.join(OUT, 'portal_reserva.png'))
    print('  Saved portal_reserva.png')
    
    # 4. Capture acceso/login page
    print('Capturing login page...')
    driver.get(f'{BASE}/acceso.html')
    time.sleep(3)
    driver.save_screenshot(os.path.join(OUT, 'login.png'))
    print('  Saved login.png')

    print('\n=== Screenshots saved ===')
    for f in sorted(os.listdir(OUT)):
        size = os.path.getsize(os.path.join(OUT, f))
        print(f'  {f} ({size:,} bytes)')

finally:
    driver.quit()
