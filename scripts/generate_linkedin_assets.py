import os
from playwright.sync_api import sync_playwright

html_content = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #020306;
    display: flex;
    flex-direction: column;
    gap: 40px;
    padding: 40px;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }

  /* 1. LINKEDIN LOGO (400x400) */
  #linkedin-logo {
    width: 400px;
    height: 400px;
    background: #080B12;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .logo-glow {
    position: absolute;
    width: 250px;
    height: 250px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(244, 80, 30, 0.28) 0%, rgba(255, 122, 46, 0.08) 45%, transparent 70%);
    filter: blur(25px);
  }

  /* 2. LINKEDIN BANNER (2256 x 382 px for Retina 2x LinkedIn Banner) */
  #linkedin-banner {
    width: 2256px;
    height: 382px;
    background: #07090E;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 100px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .banner-glow-orange {
    position: absolute;
    top: -100px;
    right: 15%;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(244, 80, 30, 0.22) 0%, rgba(255, 122, 46, 0.06) 50%, transparent 75%);
    filter: blur(50px);
    pointer-events: none;
  }
  .banner-glow-purple {
    position: absolute;
    bottom: -150px;
    left: -50px;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(124, 108, 240, 0.18) 0%, transparent 65%);
    filter: blur(50px);
    pointer-events: none;
  }
  .banner-grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.4;
  }
  
  .banner-left {
    display: flex;
    align-items: center;
    gap: 40px;
    z-index: 5;
  }
  .banner-title-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .banner-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 56px;
    font-weight: 800;
    letter-spacing: -0.035em;
    color: #FFFFFF;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .banner-title span { color: #F4501E; }
  .banner-sub {
    font-size: 24px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.72);
    letter-spacing: -0.01em;
  }

  .banner-right {
    display: flex;
    align-items: center;
    gap: 20px;
    z-index: 5;
  }
  .pill-badge {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(16px);
    padding: 16px 28px;
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pill-num {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 28px;
    font-weight: 800;
    color: #FF8A3D;
    line-height: 1;
  }
  .pill-label {
    font-size: 15px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
</head>
<body>

<svg width="0" height="0" style="position:absolute">
  <defs>
    <linearGradient id="mechaLiGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#D82C0D"/>
      <stop offset="45%" stop-color="#F4501E"/>
      <stop offset="80%" stop-color="#FF8A3D"/>
      <stop offset="100%" stop-color="#FFD15C"/>
    </linearGradient>
  </defs>
</svg>

<!-- 1. LINKEDIN LOGO (400x400) -->
<div id="linkedin-logo">
  <div class="logo-glow"></div>
  <svg style="width:190px;height:190px;z-index:2;filter:drop-shadow(0 10px 24px rgba(244,80,30,0.45))" viewBox="0 0 40 40">
    <path fill="url(#mechaLiGrad)" d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z"/>
    <path fill="#FFFFFF" opacity="0.92" d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z"/>
  </svg>
</div>

<!-- 2. LINKEDIN COVER BANNER (2256 x 382 px) -->
<div id="linkedin-banner">
  <div class="banner-glow-orange"></div>
  <div class="banner-glow-purple"></div>
  <div class="banner-grid"></div>

  <div class="banner-left">
    <svg style="width:80px;height:80px;filter:drop-shadow(0 6px 18px rgba(244,80,30,0.5))" viewBox="0 0 40 40">
      <path fill="url(#mechaLiGrad)" d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z"/>
      <path fill="#FFFFFF" opacity="0.92" d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z"/>
    </svg>
    <div class="banner-title-box">
      <div class="banner-title">Mecha OS<span>.</span></div>
      <div class="banner-sub">El sistema operativo con IA para salones de peluquería y estética</div>
    </div>
  </div>

  <div class="banner-right">
    <div class="pill-badge">
      <div class="pill-num">0%</div>
      <div class="pill-label">Comisiones</div>
    </div>
    <div class="pill-badge">
      <div class="pill-num">24/7</div>
      <div class="pill-label">IA en WhatsApp</div>
    </div>
    <div class="pill-badge">
      <div class="pill-num">AEAT</div>
      <div class="pill-label">VeriFactu + Fichaje</div>
    </div>
  </div>
</div>

</body>
</html>
"""

os.makedirs("public/linkedin", exist_ok=True)
html_path = os.path.abspath("public/linkedin/render_linkedin.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 2400, "height": 1600})
    page.goto(f"file:///{html_path}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)

    # 1. Logo (400x400)
    el_logo = page.locator("#linkedin-logo")
    el_logo.screenshot(path="public/linkedin/mecha_linkedin_logo.png")
    print("mecha_linkedin_logo.png generated!")

    # 2. Banner (2256x382 Retina 2x)
    el_banner = page.locator("#linkedin-banner")
    el_banner.screenshot(path="public/linkedin/mecha_linkedin_banner.png")
    print("mecha_linkedin_banner.png generated!")

    browser.close()

print("All LinkedIn assets generated successfully!")
