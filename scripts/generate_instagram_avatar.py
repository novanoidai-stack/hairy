import os
from playwright.sync_api import sync_playwright

html_content = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;800&family=Inter:wght@600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #000;
    display: flex;
    flex-direction: column;
    gap: 40px;
    padding: 40px;
  }
  .avatar-card {
    width: 1080px;
    height: 1080px;
    background: #090C15;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  /* Subtle radial glow */
  .glow {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(244, 80, 30, 0.22) 0%, rgba(255, 122, 46, 0.08) 45%, transparent 70%);
    filter: blur(40px);
    pointer-events: none;
  }
  .flame-svg {
    width: 480px;
    height: 480px;
    filter: drop-shadow(0 16px 40px rgba(244, 80, 30, 0.45));
    z-index: 2;
  }
  .flame-combo {
    width: 320px;
    height: 320px;
    filter: drop-shadow(0 12px 30px rgba(244, 80, 30, 0.4));
    z-index: 2;
    margin-bottom: 20px;
  }
  .brand-text {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 140px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #FFFFFF;
    z-index: 2;
    display: flex;
    align-items: baseline;
  }
  .dot {
    color: #F4501E;
  }
  .tagline {
    font-family: 'Inter', sans-serif;
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 14px;
    z-index: 2;
  }
</style>
</head>
<body>

<!-- SVG Gradients -->
<svg width="0" height="0" style="position:absolute">
  <defs>
    <linearGradient id="mechaFlameGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#D82C0D"/>
      <stop offset="45%" stop-color="#F4501E"/>
      <stop offset="80%" stop-color="#FF8A3D"/>
      <stop offset="100%" stop-color="#FFD15C"/>
    </linearGradient>
  </defs>
</svg>

<!-- 1. ISOTIPO FLAME (Icono puro centrado - Recomendado para Avatar) -->
<div id="avatar-flame" class="avatar-card">
  <div class="glow"></div>
  <svg class="flame-svg" viewBox="0 0 40 40">
    <path fill="url(#mechaFlameGrad)" d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z"/>
    <path fill="#FFFFFF" opacity="0.92" d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z"/>
  </svg>
</div>

<!-- 2. COMBO (Llama + Mecha.) -->
<div id="avatar-combo" class="avatar-card">
  <div class="glow" style="width:700px;height:700px"></div>
  <svg class="flame-combo" viewBox="0 0 40 40">
    <path fill="url(#mechaFlameGrad)" d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z"/>
    <path fill="#FFFFFF" opacity="0.92" d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z"/>
  </svg>
  <div class="brand-text">Mecha<span class="dot">.</span></div>
</div>

<!-- 3. WORDMARK PURO (Mecha. + OS) -->
<div id="avatar-wordmark" class="avatar-card">
  <div class="glow" style="width:750px;height:750px"></div>
  <div class="brand-text" style="font-size:180px">Mecha<span class="dot">.</span></div>
  <div class="tagline">SISTEMA OPERATIVO</div>
</div>

</body>
</html>
"""

os.makedirs("public/instagram", exist_ok=True)
html_path = os.path.abspath("public/instagram/render_avatars.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"HTML saved to {html_path}")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 3600})
    page.goto(f"file:///{html_path}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)

    # 1. Flame
    el_flame = page.locator("#avatar-flame")
    el_flame.screenshot(path="public/instagram/mecha_perfil_logo_llama.png")
    print("mecha_perfil_logo_llama.png saved!")

    # 2. Combo
    el_combo = page.locator("#avatar-combo")
    el_combo.screenshot(path="public/instagram/mecha_perfil_logo_combo.png")
    print("mecha_perfil_logo_combo.png saved!")

    # 3. Wordmark
    el_wordmark = page.locator("#avatar-wordmark")
    el_wordmark.screenshot(path="public/instagram/mecha_perfil_logo_texto.png")
    print("mecha_perfil_logo_texto.png saved!")

    browser.close()

print("All Instagram avatars generated successfully at 1080x1080px!")
