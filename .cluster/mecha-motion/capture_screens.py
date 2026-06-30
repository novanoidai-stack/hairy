#!/usr/bin/env python3
"""Capture screenshots of Mecha software using Selenium."""
import os, time, sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.edge.options import Options as EdgeOptions

OUT = r'C:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\.cluster\mecha-motion\screenshots'
os.makedirs(OUT, exist_ok=True)

# Find msedgedriver
import shutil
edgedriver = shutil.which('msedgedriver')
if not edgedriver:
    # Try common paths
    for p in [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedgedriver.exe',
        r'C:\Program Files\Microsoft\Edge\Application\msedgedriver.exe',
    ]:
        if os.path.exists(p):
            edgedriver = p
            break

opts = EdgeOptions()
opts.add_argument('--headless=New')
opts.add_argument('--window-size=1440,900')
opts.add_argument('--force-device-scale-factor=2')
opts.add_argument('--high-dpi-support=1')
opts.add_argument('--disable-gpu')
opts.add_argument('--no-sandbox')

print(f'Starting Edge WebDriver... driver={edgedriver}')
service = EdgeService(executable_path=edgedriver) if edgedriver else EdgeService()
driver = webdriver.Edge(service=service, options=opts)
wait = WebDriverWait(driver, 15)

BASE = 'http://localhost:8080'
SHOTS = [
    ('agenda', 'Agenda', None),
    ('clientes', 'Clientes', None),
    ('equipo', 'Equipo', None),
    ('informes', 'Informes', None),
    ('lista-espera', 'Lista de espera', None),
    ('resenas', 'Reseñas', None),
    ('configuracion', 'Configuracion', None),
]

try:
    # Navigate to the app
    print('Navigating to app...')
    driver.get(f'{BASE}/app')
    time.sleep(3)

    # Check if we need to login
    current_url = driver.current_url
    print(f'Current URL: {current_url}')

    # Try to find and fill login form if present
    try:
        # Look for email input
        email_inputs = driver.find_elements(By.CSS_SELECTOR, 'input[type="email"], input[name="email"], input[autocomplete="email"]')
        if email_inputs:
            print('Found login form, filling credentials...')
            email_inputs[0].clear()
            email_inputs[0].send_keys('demo.publico@mecha.app')
            time.sleep(0.5)

            # Find password input
            pass_inputs = driver.find_elements(By.CSS_SELECTOR, 'input[type="password"]')
            if pass_inputs:
                pass_inputs[0].clear()
                pass_inputs[0].send_keys('MechaDemoView_2026')
                time.sleep(0.5)

                # Find submit button
                buttons = driver.find_elements(By.CSS_SELECTOR, 'button[type="submit"], button:not([type])')
                for btn in buttons:
                    text = btn.text.lower()
                    if 'entrar' in text or 'login' in text or 'iniciar' in text or 'acceder' in text:
                        btn.click()
                        break
                else:
                    # Just press Enter
                    pass_inputs[0].send_keys(Keys.ENTER)

                time.sleep(5)
                print(f'After login URL: {driver.current_url}')
    except Exception as e:
        print(f'Login attempt: {e}')

    # Also try direct demo URL
    if 'login' in driver.current_url.lower() or 'acceso' in driver.current_url.lower():
        print('Trying demo URL directly...')
        driver.get(f'{BASE}/app?demo=1')
        time.sleep(5)

    # Take a screenshot of current state
    print(f'Ready for screenshots. URL: {driver.current_url}')

    # Take screenshot of whatever is showing (should be agenda)
    driver.save_screenshot(os.path.join(OUT, '01_main.png'))
    print('Saved 01_main.png')

    # Try to navigate to each tab
    for slug, name, _ in SHOTS:
        # Try clicking on tab links
        try:
            # Look for tab links by text
            tabs = driver.find_elements(By.CSS_SELECTOR, 'a, button, [role="tab"]')
            clicked = False
            for tab in tabs:
                text = tab.text.strip().lower()
                if name.lower() in text or slug.lower().replace('-', ' ') in text:
                    tab.click()
                    time.sleep(2)
                    clicked = True
                    break

            if not clicked:
                # Try direct URL navigation
                driver.get(f'{BASE}/app/{slug}')
                time.sleep(3)

            # Take screenshot
            fname = f'{slug}.png'
            driver.save_screenshot(os.path.join(OUT, fname))
            print(f'Saved {fname} (URL: {driver.current_url})')
        except Exception as e:
            print(f'Error capturing {name}: {e}')
            # Still try to save
            fname = f'{slug}.png'
            driver.save_screenshot(os.path.join(OUT, fname))

    # Also capture the portal de reserva
    driver.get(f'{BASE}/app/r/demo')
    time.sleep(3)
    driver.save_screenshot(os.path.join(OUT, 'portal_reserva.png'))
    print('Saved portal_reserva.png')

    # Capture the landing page
    driver.get(f'{BASE}/')
    time.sleep(3)
    driver.save_screenshot(os.path.join(OUT, 'landing.png'))
    print('Saved landing.png')

    print('\nAll screenshots saved to:', OUT)
    for f in sorted(os.listdir(OUT)):
        size = os.path.getsize(os.path.join(OUT, f))
        print(f'  {f} ({size:,} bytes)')

finally:
    driver.quit()
