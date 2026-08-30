#!/usr/bin/env node
// Canal de SALIDA de la vigilancia: un issue de GitHub por bloqueante, con su
// prompt de arreglo listo para pegar a cualquier IA.
//
//   node scripts/vigilantes/issues.mjs <informe.json>
//
// POR QUE EXISTE (30 ago 2026)
// El orquestador IA redacta diagnosticos con causa raiz y prompt de
// auto-reparacion... y ahi se quedan. La deteccion sin cola de trabajo es
// vigilancia decorativa. Un issue por hallazgo convierte cada bloqueante en
// una tarea con dueno, historico y cierre visible.
//
// Reglas:
// - Solo BLOQUEANTES (los avisos son deuda de panel, no tickets).
// - Deduplicacion: si ya hay un issue ABIERTO con el mismo titulo, se comenta
//   "sigue vivo" con la fecha en vez de duplicarlo.
// - Requiere GITHUB_TOKEN y GITHUB_REPOSITORY (los da Actions).
// - Sin token: avisa y sale 0, como enviar.mjs. Con token y error de la API:
//   sale 1 — un canal configurado y mudo es peor que no tenerlo.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ } from './nucleo.mjs';

const ficheroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

const destino = process.argv[2];
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;

if (!destino || !existsSync(destino)) {
  console.log('[issues] no existe el informe: no hay nada que escalar.');
  process.exit(0);
}
if (!token || !repo) {
  console.log('[issues] sin GITHUB_TOKEN / GITHUB_REPOSITORY: no se escalan issues.');
  process.exit(0);
}

let informe;
try {
  informe = JSON.parse(readFileSync(destino, 'utf8'));
} catch (e) {
  console.error(`[issues] ${destino} no es JSON valido: ${e.message}`);
  process.exit(0);
}

const bloqueantes = (informe.hallazgos ?? []).filter((h) => h.nivel === 'bloqueante');
if (bloqueantes.length === 0) {
  console.log('[issues] sin bloqueantes: nada que escalar.');
  process.exit(0);
}

const api = async (url, init = {}) => {
  const r = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  return { ok: r.ok, status: r.status, cuerpo: await r.json().catch(() => ({})) };
};

// Deduplicar por clave: el titulo lleva la clave para que el match sea exacto.
const porClave = new Map();
for (const h of bloqueantes) {
  const previo = porClave.get(h.clave) ?? { clave: h.clave, n: 0, titulo: h.titulo, detalle: h.detalle, fichero: h.fichero };
  previo.n += 1;
  porClave.set(h.clave, previo);
}

let abiertos = 0;
let comentados = 0;
let fallos = 0;

for (const hall of porClave.values()) {
  const titulo = `[vigilancia] ${hall.titulo}`.slice(0, 250);

  // Buscar issue abierto con el mismo titulo (state=open en la busqueda).
  const busqueda = await api(
    `/search/issues?q=${encodeURIComponent(`repo:${repo} is:issue is:open in:title "${hall.titulo}"`)}`,
  );
  if (!busqueda.ok) {
    console.error(`[issues] busqueda fallida ${busqueda.status}: ${JSON.stringify(busqueda.cuerpo).slice(0, 200)}`);
    fallos += 1;
    continue;
  }

  const existente = (busqueda.cuerpo.items ?? [])[0];
  const cuerpo =
    `**Hallazgo bloqueante de vigilancia** (clave: \`${hall.clave}\`)` +
    (informe.commit ? `\nCommit: ${informe.commit}` : '') +
    (informe.rama ? ` · Rama: ${informe.rama}` : '') +
    (hall.fichero ? `\nFichero: \`${hall.fichero}\`` : '') +
    `\n\n${hall.detalle ?? ''}` +
    (hall.n > 1 ? `\n\n(${hall.n} apariciones en esta corrida)` : '') +
    '\n\n---\n_Creado automáticamente por `scripts/vigilantes/issues.mjs`._';

  if (existente) {
    const c = await api(`/repos/${repo}/issues/${existente.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Sigue vivo en la corrida del ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.` }),
    });
    if (c.ok) comentados += 1; else fallos += 1;
    continue;
  }

  const creado = await api(`/repos/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: titulo,
      body: cuerpo,
      labels: ['vigilancia', 'bloqueante'],
    }),
  });
  // Las labels pueden fallar si no existen en el repo: reintentar sin labels.
  if (!creado.ok && creado.cuerpo?.errors?.some((e) => e.resource === 'Label')) {
    const reintento = await api(`/repos/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: titulo, body: cuerpo }),
    });
    if (reintento.ok) abiertos += 1; else fallos += 1;
    continue;
  }
  if (creado.ok) abiertos += 1; else {
    console.error(`[issues] creacion fallida ${creado.status}: ${JSON.stringify(creado.cuerpo).slice(0, 200)}`);
    fallos += 1;
  }
}

console.log(`[issues] ${abiertos} abierto(s), ${comentados} comentado(s), ${fallos} fallo(s).`);
process.exit(fallos > 0 ? 1 : 0);
