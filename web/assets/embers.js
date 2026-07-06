(function(){
  const cvs = document.getElementById('embers');
  if (!cvs) return;
  const ctx = cvs.getContext('2d', { alpha: true });

  let W, H;
  const rocks = [];
  const sparks = []; // sparks dinámicos
  // En movil las particulas abruman (y cargan la GPU): reducimos densidad bajo 768px.
  var IS_MOBILE = (window.matchMedia && window.matchMedia('(max-width:767px)').matches) || window.innerWidth < 768;
  var MAX_EMBERS = IS_MOBILE ? 26 : 80; // menos particulas = mas fluido
  var MAX_SPARKS = IS_MOBILE ? 12 : 36;
  var embers = new Array(MAX_EMBERS);

  // Chispas de fuego: del gradiente Mecha (rojo/naranja/oro vivos). Flotan sobre
  // un fondo ceniza oscuro (efecto agua/espacio), pero las brasas SI son calidas.
  const COLORS = [
    { r:255, g:218, b:80  }, // amarillo oro brillante
    { r:255, g:152, b:46  }, // naranja claro
    { r:255, g:102, b:25  }, // naranja Mecha
    { r:230, g:40,  b:10  }, // rojo profundo
    { r:255, g:75,  b:20  }, // naranja rojizo
    { r:190, g:25,  b:5   }, // rojo oscuro brasa
  ];

  // Pre-render glow textures
  const GLOW_SIZE = 64;
  const glowTextures = COLORS.map(c => {
    const off = document.createElement('canvas');
    off.width = GLOW_SIZE; off.height = GLOW_SIZE;
    const oc = off.getContext('2d');
    const cx = GLOW_SIZE / 2;
    const g = oc.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0,   `rgba(${c.r},${c.g},${c.b},1)`);
    g.addColorStop(0.18,`rgba(${c.r},${c.g},${c.b},.75)`);
    g.addColorStop(0.45,`rgba(${c.r},${c.g},${c.b},.25)`);
    g.addColorStop(1,   `rgba(${c.r},${c.g},${c.b},0)`);
    oc.fillStyle = g;
    oc.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    return off;
  });

  // Generador de polígono irregular cracelado
  function generateRockPolygon(centerX, centerY, rx, ry, numPoints) {
    const points = [];
    const angleStep = (Math.PI * 2) / numPoints;
    for (let i = 0; i < numPoints; i++) {
      const angle = i * angleStep;
      const radX = rx * (0.75 + Math.random() * 0.4);
      const radY = ry * (0.65 + Math.random() * 0.4);
      points.push({
        x: centerX + Math.cos(angle) * radX,
        y: centerY + Math.sin(angle) * radY
      });
    }
    return points;
  }

  function generateRocks(rw, rh) {
    rocks.length = 0;
    
    // Capa de fondo (carbones más pequeños y profundos)
    const bgCount = 28;
    const bgSegment = rw / bgCount;
    for (let i = 0; i < bgCount; i++) {
      const rx = 16 + Math.random() * 18;
      const ry = 10 + Math.random() * 12;
      const cx = i * bgSegment + (Math.random() - 0.5) * bgSegment;
      const cy = rh - 5 + Math.random() * 12;
      const heat = 0.2 + Math.random() * 0.4;
      const phase = Math.random() * Math.PI * 2;
      const numPoints = 5 + Math.floor(Math.random() * 3);
      
      rocks.push({
        x: cx,
        y: cy,
        size: Math.max(rx, ry),
        heat,
        phase,
        layer: 0,
        points: generateRockPolygon(cx, cy, rx, ry, numPoints)
      });
    }

    // Capa del frente (carbones grandes, muy calientes, superpuestos)
    const fgCount = 20;
    const fgSegment = rw / fgCount;
    for (let i = 0; i < fgCount; i++) {
      const rx = 28 + Math.random() * 26;
      const ry = 16 + Math.random() * 18;
      const cx = i * fgSegment + (Math.random() - 0.5) * fgSegment;
      const cy = rh + Math.random() * 10;
      const heat = 0.4 + Math.random() * 0.6;
      const phase = Math.random() * Math.PI * 2;
      const numPoints = 6 + Math.floor(Math.random() * 3);
      
      rocks.push({
        x: cx,
        y: cy,
        size: Math.max(rx, ry),
        heat,
        phase,
        layer: 1,
        points: generateRockPolygon(cx, cy, rx, ry, numPoints)
      });
    }

    rocks.sort((a, b) => a.layer - b.layer);
  }

  // RENDIMIENTO: el lecho de rocas era lo más caro (recreaba decenas de gradientes
  // por frame). Ahora se pre-renderiza UNA vez a un canvas offscreen (renderRocksOffscreen)
  // y cada frame solo se "blitea" con un brillo global barato (drawRocks). Cero gradientes
  // por frame; el shimmer se simula con un overlay global muy ligero.
  let rocksOff = null;     // canvas offscreen con el lecho ya pintado
  let rocksOffW = 0, rocksOffH = 0, rocksDpr = 1;

  function renderRocksOffscreen(rw, rh, dpr) {
    rocksDpr = dpr;
    rocksOffW = rw; rocksOffH = rh;
    if (!rocksOff) rocksOff = document.createElement('canvas');
    rocksOff.width = Math.ceil(rw * dpr);
    rocksOff.height = Math.ceil(rh * dpr);
    const o = rocksOff.getContext('2d');
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.clearRect(0, 0, rw, rh);

    // 1. Magma/fuego de fondo (luz que asoma por las grietas)
    const magmaGrad = o.createLinearGradient(0, rh - 70, 0, rh);
    magmaGrad.addColorStop(0, 'transparent');
    magmaGrad.addColorStop(0.3, 'rgba(190, 30, 5, 0.18)');
    magmaGrad.addColorStop(0.7, 'rgba(255, 95, 15, 0.45)');
    magmaGrad.addColorStop(1, 'rgba(255, 185, 30, 0.75)');
    o.fillStyle = magmaGrad;
    o.fillRect(0, rh - 85, rw, 85);

    // 2. Rocas (heat fijo representativo: ya no depende del tiempo)
    o.globalCompositeOperation = 'source-over';
    for (const r of rocks) {
      const currentHeat = r.heat * 0.35 + 0.62 * 0.65;
      o.beginPath();
      o.moveTo(r.points[0].x, r.points[0].y);
      for (let i = 1; i < r.points.length; i++) o.lineTo(r.points[i].x, r.points[i].y);
      o.closePath();
      o.fillStyle = `rgb(${Math.floor(14 + currentHeat * 24)}, ${Math.floor(10 + currentHeat * 12)}, ${Math.floor(10 + currentHeat * 6)})`;
      o.fill();
      o.lineWidth = 1.2 + currentHeat * 1.6;
      o.strokeStyle = `rgba(255, ${Math.floor(80 + currentHeat * 140)}, ${Math.floor(15 + currentHeat * 60)}, ${0.25 + currentHeat * 0.75})`;
      o.stroke();
      if (currentHeat > 0.35) {
        const radG = o.createRadialGradient(r.x, r.y - r.size*0.1, 0, r.x, r.y - r.size*0.1, r.size * 0.7);
        radG.addColorStop(0, `rgba(255, 195, 55, ${(currentHeat - 0.35) * 1.35})`);
        radG.addColorStop(0.35, `rgba(255, 65, 10, ${(currentHeat - 0.35) * 0.85})`);
        radG.addColorStop(1, 'transparent');
        o.fillStyle = radG;
        o.fill();
      }
    }
  }

  function drawRocks(t) {
    const rocksCvs = document.getElementById('rocksCanvas');
    if (!rocksCvs || !rocksOff) return;
    const rCtx = rocksCvs.getContext('2d');
    rCtx.clearRect(0, 0, rocksOffW, rocksOffH);
    // Blit barato del lecho pre-renderizado, con un breathing global muy ligero.
    rCtx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 0.0012);
    rCtx.drawImage(rocksOff, 0, 0, rocksOffW, rocksOffH);
    rCtx.globalAlpha = 1;
  }

  function createEmber(scatter) {
    // Focos de procedencia correspondientes a las rocas calientes
    const originXs = [0.15, 0.3, 0.48, 0.65, 0.8, 0.92];
    const targetOrigin = originXs[Math.floor(Math.random() * originXs.length)];
    const x = W * targetOrigin + (Math.random() - 0.5) * (W * 0.12);
    const maxLife = 200 + Math.random() * 350;
    return {
      x,
      y: scatter ? Math.random() * H : H + 15 + Math.random() * 35,
      vy: -(0.24 + Math.random() * 0.96), // 20% de reducción de velocidad (inicio original: 0.3 a 1.5)
      vx: (Math.random() - 0.5) * 0.32,   // 20% de reducción
      swayAmp: 0.24 + Math.random() * 0.96, // 20% de reducción
      swayFreq: 0.0064 + Math.random() * 0.012, // 20% de reducción
      swayPhase: Math.random() * Math.PI * 2,
      baseSize: 1.2 + Math.random() * 2.8,
      maxLife,
      life: scatter ? Math.random() * maxLife : maxLife,
      flickerSpeed: 0.05 + Math.random() * 0.12,
      flickerPhase: Math.random() * Math.PI * 2,
      colorIdx: Math.floor(Math.random() * COLORS.length),
      glowBase: 8 + Math.random() * 12,
      windDrift: (Math.random() - 0.5) * 0.003,
      t: 0,
      canSpark: true
    };
  }

  function createSpark(x, y) {
    const count = 2 + Math.floor(Math.random() * 3);
    const pattern = Math.random();
    const weight = Math.random();
    const newSparks = [];
    for (let i = 0; i < count; i++) {
      const size = 0.3 + Math.random() * 0.6;
      const baseAngle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 1.5;
      const speed = (0.4 + weight * 1.2) * (0.8 + Math.random() * 0.8); // 20% de reducción (original: 0.5 + weight * 1.5)

      newSparks.push({
        x, y,
        vx: Math.cos(baseAngle) * speed * 0.5 + (Math.random() - 0.5) * 0.20, // 20% de reducción
        vy: Math.sin(baseAngle) * speed - 0.12 - Math.random() * 0.20,       // 20% de reducción
        maxLife: 45 + Math.random() * 55,
        life: 45 + Math.random() * 55,
        baseSize: size * (0.8 + weight * 0.4),
        colorIdx: 1 + Math.floor(Math.random() * 4),
        glowBase: 4 + Math.random() * 5,
        flickerSpeed: 0.14 + Math.random() * 0.18,
        flickerPhase: Math.random() * Math.PI * 2,
        t: 0,
        pattern,
        weight,
        zigzagPhase: Math.random() * Math.PI * 2,
        zigzagAmp: (0.16 + Math.random() * 0.48) * (1 - weight * 0.5) // 20% de reducción
      });
    }
    return newSparks;
  }

  function resetEmber(p) {
    const originXs = [0.15, 0.3, 0.48, 0.65, 0.8, 0.92];
    const targetOrigin = originXs[Math.floor(Math.random() * originXs.length)];
    p.x = W * targetOrigin + (Math.random() - 0.5) * (W * 0.12);
    p.y = H + 15 + Math.random() * 35;
    p.vy = -(0.24 + Math.random() * 0.96);
    p.vx = (Math.random() - 0.5) * 0.32;
    p.swayAmp = 0.24 + Math.random() * 0.96;
    p.swayFreq = 0.0064 + Math.random() * 0.012;
    p.swayPhase = Math.random() * Math.PI * 2;
    p.baseSize = 1.2 + Math.random() * 2.8;
    p.maxLife = 200 + Math.random() * 350;
    p.life = p.maxLife;
    p.flickerSpeed = 0.05 + Math.random() * 0.12;
    p.flickerPhase = Math.random() * Math.PI * 2;
    p.colorIdx = Math.floor(Math.random() * COLORS.length);
    p.glowBase = 8 + Math.random() * 12;
    p.windDrift = (Math.random() - 0.5) * 0.003;
    p.t = 0;
    p.canSpark = true;
  }

  // Physics a 60fps fijo
  const STEP = 1000 / 60;
  let lastTime = 0;
  let accumulator = 0;

  function physicsTick() {
    // Update embers
    for (let i = 0; i < MAX_EMBERS; i++) {
      const p = embers[i];
      p.t++;
      p.life--;

      p.y += p.vy;
      p.vy -= 0.0008; // 20% de reducción en aceleración ascendente (original 0.001)
      p.vx += p.windDrift;
      p.x += p.vx + Math.sin(p.t * p.swayFreq + p.swayPhase) * p.swayAmp;

      // Probabilidad de división de chispas
      if (p.canSpark && sparks.length < MAX_SPARKS) {
        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio > 0.35 && lifeRatio < 0.65 && Math.random() < 0.02) {
          p.canSpark = false;
          sparks.push(...createSpark(p.x, p.y));
        }
      }

      if (p.life <= 0 || p.y < -25 || p.x < -50 || p.x > W + 50) {
        resetEmber(p);
      }
    }

    // Update sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.t++;
      s.life--;

      if (s.pattern < 0.17) {
        s.zigzagPhase += 0.12;
        s.x += s.vx + Math.sin(s.zigzagPhase) * s.zigzagAmp * 0.4 * (1 - s.weight * 0.4);
        s.y += s.vy;
      } else if (s.pattern < 0.33) {
        s.x += s.vx * 1.25;
        s.y += s.vy * 1.1;
      } else if (s.pattern < 0.5) {
        s.zigzagPhase += 0.35;
        s.x += s.vx + Math.sin(s.zigzagPhase) * s.zigzagAmp * 0.8;
        s.y += s.vy * 0.9;
      } else if (s.pattern < 0.67) {
        s.x += s.vx + Math.sin(s.t * 0.08) * 0.25;
        s.y += s.vy;
      } else if (s.pattern < 0.83) {
        s.zigzagPhase += 0.22;
        s.x += s.vx + Math.cos(s.zigzagPhase) * 0.3;
        s.y += s.vy + Math.sin(s.zigzagPhase) * 0.2;
      } else {
        s.x += s.vx * 0.6;
        s.y += s.vy;
      }

      s.vy -= 0.0096 * (0.5 + s.weight * 0.5); // 20% de reducción en aceleración de gravedad (original 0.012)

      if (s.life <= 0 || s.y < -12) {
        sparks.splice(i, 1);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';

    // Dibujar embers (ascuas flotantes)
    for (let i = 0; i < MAX_EMBERS; i++) {
      const p = embers[i];
      const lifeRatio = p.life / p.maxLife;
      const flicker = Math.sin(p.t * p.flickerSpeed + p.flickerPhase);

      let alpha = lifeRatio < 0.2 ? lifeRatio / 0.2 : lifeRatio > 0.85 ? (1 - lifeRatio) / 0.15 : 1;
      alpha *= (0.7 + 0.3 * (flicker * 0.5 + 0.5));
      alpha *= 0.80; // 20% de reducción de brillo para un aspecto más sutil
      if (alpha < 0.02) continue;

      const size = p.baseSize * (0.65 + 0.35 * (flicker * 0.5 + 0.5)) * (0.45 + 0.55 * lifeRatio);
      const drawSize = size * (p.glowBase * 0.5);

      ctx.globalAlpha = Math.min(alpha, 1);
      ctx.drawImage(
        glowTextures[p.colorIdx],
        p.x - drawSize * 0.5,
        p.y - drawSize * 0.5,
        drawSize,
        drawSize
      );
    }

    // Dibujar chispas rápidas
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      const lifeRatio = s.life / s.maxLife;
      const flicker = Math.sin(s.t * s.flickerSpeed + s.flickerPhase);

      let alpha = lifeRatio * (0.75 + 0.25 * (flicker * 0.5 + 0.5));
      alpha *= 0.80; // 20% de reducción de brillo
      if (alpha < 0.05) continue;

      const size = s.baseSize * (0.4 + 0.6 * lifeRatio) * (0.75 + 0.25 * (flicker * 0.5 + 0.5));
      const drawSize = size * s.glowBase * 1.0;

      ctx.globalAlpha = Math.min(alpha, 1);
      ctx.drawImage(
        glowTextures[s.colorIdx],
        s.x - drawSize * 0.5,
        s.y - drawSize * 0.5,
        drawSize,
        drawSize
      );

      // Núcleo blanco caliente
      if (alpha > 0.5 && Math.random() < 0.65) {
        const coreSize = drawSize * 0.32;
        ctx.globalAlpha = Math.min(alpha * 1.2, 1);
        ctx.drawImage(
          glowTextures[s.colorIdx],
          s.x - coreSize * 0.5,
          s.y - coreSize * 0.5,
          coreSize,
          coreSize
        );
      }
    }

    ctx.globalAlpha = 1;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    cvs.width  = W * dpr;
    cvs.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rocksCvs = document.getElementById('rocksCanvas');
    if (rocksCvs) {
      rocksCvs.width = W * dpr;
      rocksCvs.height = 120 * dpr;
      const rCtx = rocksCvs.getContext('2d');
      rCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      generateRocks(W, 120);
      renderRocksOffscreen(W, 120, dpr); // pre-render una sola vez (no por frame)
    }
  }

  // Cap de FPS: el efecto es sutil, no necesita 60fps. Limitar el render baja
  // mucho el coste de GPU/CPU sin que se note. El lecho rocoso (pulso lento) se
  // refresca aun mas despacio.
  const FRAME_MS = 1000 / 36;   // ~36fps para particulas
  const ROCKS_MS = 1000 / 18;   // ~18fps para el lecho (pulso lento)
  let lastFrame = 0;
  let lastRocks = 0;

  function animate(now) {
    requestAnimationFrame(animate);
    if (now - lastFrame < FRAME_MS) return; // throttle de FPS

    if (!lastTime) lastTime = now;
    const dt = now - lastTime;
    lastTime = now;
    lastFrame = now;

    accumulator += Math.min(dt, 100);
    while (accumulator >= STEP) {
      physicsTick();
      accumulator -= STEP;
    }

    render();
    if (now - lastRocks >= ROCKS_MS) { drawRocks(now); lastRocks = now; }
  }

  // Inicializar eventos y redimensionamiento
  window.addEventListener('resize', resize);
  resize(); // Establece W, H y genera las rocas y configura los transforms

  // Poblar el sistema de brasas con las dimensiones correctas de W y H
  for (let i = 0; i < MAX_EMBERS; i++) {
    embers[i] = createEmber(true);
  }

  // Arrancar el ciclo de animación
  requestAnimationFrame(animate);
})();
