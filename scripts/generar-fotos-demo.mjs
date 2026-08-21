// Genera las imagenes del salon de DEMO (web/demo-fotos/*.svg).
//
// Por que ilustraciones propias y no fotos de stock: presentar a personas
// reales identificables como empleadas de un salon que no existe es un
// problema de derechos de imagen, y las fotos de banco caducan, cambian de
// licencia o desaparecen. Estas son de la casa: cero dependencias externas,
// se versionan con el repo y van con los colores de marca.
//
// Un salon REAL sube las suyas desde Ajustes y Equipo; esto es solo el
// escaparate. Regenerar:  node scripts/generar-fotos-demo.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'web', 'demo-fotos');
mkdirSync(SALIDA, { recursive: true });

const FUEGO = '#f4501e';
const FUEGO_HONDO = '#c0260a';
const CREMA = '#f6f1ea';

const guardar = (nombre, svg) => {
  writeFileSync(join(SALIDA, nombre), svg.trim() + '\n', 'utf8');
  return nombre;
};

// --- Retratos del equipo ---------------------------------------------------
// Ilustracion plana: fondo con el color de la persona en la agenda, hombros,
// cara y un peinado distinto para cada una. Sin rasgos faciales marcados: se
// lee como avatar, no como el retrato de nadie en concreto.
function retrato({ fondo, piel, pelo, peinado }) {
  const cabello = {
    // Melena larga
    melena: `
      <path d="M96 96c0-34 25-58 64-58s64 24 64 58c0 22-4 40-8 62-3 15-6 34-6 46h-22c4-26 8-44 9-62-13 10-23 14-37 14s-24-4-37-14c1 18 5 36 9 62h-22c0-12-3-31-6-46-4-22-8-40-8-62z" fill="${pelo}"/>`,
    // Recogido con moño
    mono: `
      <circle cx="160" cy="34" r="20" fill="${pelo}"/>
      <path d="M100 100c0-32 27-54 60-54s60 22 60 54c0 8-1 14-3 20-6-18-25-30-57-30s-51 12-57 30c-2-6-3-12-3-20z" fill="${pelo}"/>`,
    // Corte corto degradado
    corto: `
      <path d="M102 100c0-33 26-56 58-56s58 23 58 56c0 6 0 11-1 16-5-16-9-28-16-34-10 8-24 12-41 12s-31-4-41-12c-7 6-11 18-16 34-1-5-1-10-1-16z" fill="${pelo}"/>`,
  }[peinado];

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="Retrato ilustrado">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${fondo}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${fondo}" stop-opacity="0.62"/>
    </linearGradient>
    <clipPath id="marco"><rect width="320" height="320" rx="0"/></clipPath>
  </defs>
  <g clip-path="url(#marco)">
    <rect width="320" height="320" fill="url(#bg)"/>
    <circle cx="160" cy="150" r="118" fill="#ffffff" opacity="0.10"/>
    <!-- hombros -->
    <path d="M40 320c0-58 54-92 120-92s120 34 120 92z" fill="${CREMA}"/>
    <path d="M40 320c0-58 54-92 120-92s120 34 120 92z" fill="#000" opacity="0.05"/>
    <!-- cuello -->
    <path d="M140 196h40v34c0 10-9 16-20 16s-20-6-20-16z" fill="${piel}"/>
    <!-- cara -->
    <ellipse cx="160" cy="140" rx="52" ry="60" fill="${piel}"/>
    ${cabello}
  </g>
</svg>`;
}

// --- Fotos de servicio -----------------------------------------------------
// Cada una una escena minimal reconocible del servicio, en paleta de marca.
function servicio({ titulo, fondoA, fondoB, escena }) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400" role="img" aria-label="${titulo}">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${fondoA}"/>
      <stop offset="1" stop-color="${fondoB}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#f)"/>
  <circle cx="530" cy="70" r="150" fill="#fff" opacity="0.09"/>
  <circle cx="90" cy="350" r="110" fill="#000" opacity="0.06"/>
  ${escena}
</svg>`;
}

const tijeras = `
  <g transform="translate(320 200)" stroke="#fffdfb" stroke-width="11" fill="none" stroke-linecap="round">
    <circle cx="-52" cy="62" r="26"/>
    <circle cx="52" cy="62" r="26"/>
    <path d="M-38 44 44-70"/>
    <path d="M38 44-44-70"/>
  </g>`;

const brocha = `
  <g transform="translate(320 200) rotate(-18)" stroke-linecap="round">
    <rect x="-14" y="-104" width="28" height="104" rx="14" fill="#fffdfb" opacity="0.92"/>
    <path d="M-30 0h60l-12 74a18 18 0 0 1-36 0z" fill="#fffdfb" opacity="0.75"/>
    <path d="M-22 40h44" stroke="${FUEGO_HONDO}" stroke-width="9" opacity="0.5"/>
  </g>`;

const secador = `
  <g transform="translate(300 210) rotate(-14)" fill="#fffdfb">
    <rect x="-110" y="-44" width="150" height="88" rx="44" opacity="0.92"/>
    <rect x="30" y="-24" width="42" height="48" rx="12" opacity="0.7"/>
    <rect x="-52" y="34" width="34" height="86" rx="16" opacity="0.85"/>
  </g>
  <g stroke="#fffdfb" stroke-width="9" stroke-linecap="round" opacity="0.55">
    <path d="M418 168h54"/><path d="M418 206h78"/><path d="M418 244h44"/>
  </g>`;

const navaja = `
  <g transform="translate(320 200) rotate(-24)">
    <rect x="-140" y="-16" width="200" height="32" rx="16" fill="#fffdfb" opacity="0.9"/>
    <rect x="52" y="-30" width="96" height="60" rx="14" fill="#fffdfb" opacity="0.6"/>
    <path d="M-140 0h190" stroke="${FUEGO_HONDO}" stroke-width="7" opacity="0.45" stroke-linecap="round"/>
  </g>`;

const mechas = `
  <g stroke-linecap="round" fill="none" stroke-width="20">
    <path d="M150 90c0 90 -22 130 -22 210" stroke="#fffdfb" opacity="0.85"/>
    <path d="M220 80c0 96 -14 140 -14 220" stroke="#ffd9a0" opacity="0.9"/>
    <path d="M290 86c0 92 -6 136 -6 214" stroke="#fffdfb" opacity="0.6"/>
    <path d="M360 80c0 96 6 140 6 220" stroke="#ffd9a0" opacity="0.75"/>
    <path d="M430 90c0 90 16 130 16 210" stroke="#fffdfb" opacity="0.85"/>
  </g>`;

const lavado = `
  <g transform="translate(320 210)">
    <path d="M-150 -10h300a150 150 0 0 1 -300 0z" fill="#fffdfb" opacity="0.85"/>
    <g fill="#fffdfb" opacity="0.7">
      <circle cx="-90" cy="-70" r="26"/><circle cx="-20" cy="-104" r="34"/>
      <circle cx="58" cy="-76" r="24"/><circle cx="112" cy="-108" r="18"/>
    </g>
  </g>`;

// --- Escritura -------------------------------------------------------------
const hechos = [];

hechos.push(guardar('equipo-maria.svg',  retrato({ fondo: '#ec4899', piel: '#f0c8a8', pelo: '#3b2417', peinado: 'melena' })));
hechos.push(guardar('equipo-carlos.svg', retrato({ fondo: '#3b82f6', piel: '#d9a377', pelo: '#1c1210', peinado: 'corto' })));
hechos.push(guardar('equipo-laura.svg',  retrato({ fondo: '#0f9d6b', piel: '#f6d5b8', pelo: '#8a4b22', peinado: 'mono' })));

hechos.push(guardar('servicio-mechas.svg',      servicio({ titulo: 'Mechas balayage', fondoA: '#c0260a', fondoB: '#f4501e', escena: mechas })));
hechos.push(guardar('servicio-color.svg',       servicio({ titulo: 'Color raiz', fondoA: '#7c2d12', fondoB: '#c0260a', escena: brocha })));
hechos.push(guardar('servicio-corte-cab.svg',   servicio({ titulo: 'Corte caballero', fondoA: '#1f2937', fondoB: '#3b4a5e', escena: tijeras })));
hechos.push(guardar('servicio-corte-sra.svg',   servicio({ titulo: 'Corte señora', fondoA: '#9d174d', fondoB: '#ec4899', escena: tijeras })));
hechos.push(guardar('servicio-lavado.svg',      servicio({ titulo: 'Lavado y peinado', fondoA: '#0e7490', fondoB: '#22a3c3', escena: lavado })));
hechos.push(guardar('servicio-barba.svg',       servicio({ titulo: 'Barba con navaja', fondoA: '#3f3f46', fondoB: '#6b7280', escena: navaja })));
hechos.push(guardar('servicio-secado.svg',      servicio({ titulo: 'Secado', fondoA: '#b45309', fondoB: '#f59e0b', escena: secador })));

// Logo del salon: la llama de Mecha sobre crema.
hechos.push(guardar('logo-salon.svg', `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Logo Salon Demo Mecha">
  <rect width="200" height="200" rx="44" fill="${CREMA}"/>
  <path d="M100 34c22 30 44 44 44 74a44 44 0 0 1-88 0c0-16 8-28 18-40 2 12 8 18 14 20-4-22 2-40 12-54z" fill="${FUEGO}"/>
  <path d="M100 96c10 14 18 20 18 32a18 18 0 0 1-36 0c0-8 6-16 18-32z" fill="#ffd9a0"/>
</svg>`));

// Fondo del portal: textura calida y suave, sin ruido que compita con el texto.
hechos.push(guardar('fondo-portal.svg', `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600" role="img" aria-label="Fondo del salon">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b1a12"/>
      <stop offset="0.55" stop-color="${FUEGO_HONDO}"/>
      <stop offset="1" stop-color="${FUEGO}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="600" fill="url(#g)"/>
  <g fill="#fff" opacity="0.07">
    <circle cx="980" cy="120" r="240"/>
    <circle cx="180" cy="520" r="200"/>
  </g>
  <g stroke="#fff" stroke-width="2" opacity="0.10" fill="none">
    <path d="M0 470c150-70 300-70 450 0s300 70 450 0 150-70 300 0"/>
    <path d="M0 520c150-70 300-70 450 0s300 70 450 0 150-70 300 0"/>
  </g>
</svg>`));

console.log(`Generadas ${hechos.length} imagenes en web/demo-fotos/:`);
hechos.forEach((h) => console.log('  ' + h));
