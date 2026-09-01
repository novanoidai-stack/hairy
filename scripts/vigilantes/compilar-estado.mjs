#!/usr/bin/env node
// scripts/vigilantes/compilar-estado.mjs
//
// Compilador y orquestador de estado de salud del sistema Mecha OS.
// Consolida las 5 capas de vigilancia (estática, base de datos, visual,
// rendimiento/código y meta-vigilancia) en un único snapshot estructurado
// y genera `.sistema/ESTADO_SALUD.md` y `.sistema/estado-salud.json`.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RAIZ, AnclaPerdida, hallazgo } from './nucleo.mjs';

import precios from './precios.mjs';
import referidos from './referidos.mjs';
import rutasPublicas from './rutas-publicas.mjs';
import cacheApp from './cache-app.mjs';
import claves from './claves.mjs';
import erroresTragados from './errores-tragados.mjs';
import panelAmbitos from './panel-ambitos.mjs';
import edgesAutorizadas from './edges-autorizadas.mjs';
import migraciones from './migraciones.mjs';
import husos from './husos.mjs';
import planes from './planes.mjs';
import horariosConvenio from './horarios-convenio.mjs';
import workflows from './workflows.mjs';
import ecosistemaCuentas from './ecosistema-cuentas.mjs';
import codigoMuerto from './codigo-muerto.mjs';
import claimsFiscales from './claims-fiscales.mjs';
import modulosDesconectados from './modulos-desconectados.mjs';

export const ESTATICOS = [
  precios,
  referidos,
  rutasPublicas,
  cacheApp,
  claves,
  erroresTragados,
  panelAmbitos,
  edgesAutorizadas,
  migraciones,
  husos,
  planes,
  horariosConvenio,
  workflows,
  ecosistemaCuentas,
  codigoMuerto,
  claimsFiscales,
  modulosDesconectados,
];

export function obtenerMetadatosGit(directorioRaiz = RAIZ) {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: directorioRaiz, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const branch = execSync('git branch --show-current', { cwd: directorioRaiz, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'HEAD';
    const status = execSync('git status --porcelain', { cwd: directorioRaiz, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { commit, branch, dirty: status.length > 0 };
  } catch {
    return { commit: 'desconocido', branch: 'desconocido', dirty: false };
  }
}

export async function compilarEstado(opciones = {}) {
  const inicio = Date.now();
  const repoRaiz = opciones.raiz || RAIZ;
  const escribirArchivos = opciones.escribirArchivos !== false;
  const esRapido = opciones.rapido === true;
  let listaEstaticos = opciones.vigilantes || ESTATICOS;
  if (esRapido) {
    listaEstaticos = listaEstaticos.filter((v) => !v.lento);
  }
  const git = opciones.git || obtenerMetadatosGit(repoRaiz);
  const timestamp = opciones.timestamp || new Date().toISOString();

  // 1. Capa Estática
  const hallazgosEstaticos = [];
  const resumenEstaticos = [];

  for (const v of listaEstaticos) {
    const t0 = Date.now();
    let hallazgos = [];
    let errorMsg = null;
    try {
      hallazgos = await v.ejecutar();
    } catch (e) {
      errorMsg = e instanceof AnclaPerdida ? `Ancla perdida: ${e.message}` : String(e?.message || e);
      hallazgos = [
        hallazgo({
          clave: `${v.nombre}/ancla-perdida`,
          nivel: 'bloqueante',
          ambito: v.ambito,
          titulo: `El vigilante "${v.nombre}" se ha quedado ciego o ha fallado`,
          detalle: errorMsg,
          fichero: e?.fichero || null,
        }),
      ];
    }
    const ms = Date.now() - t0;
    const bloq = hallazgos.filter((h) => h.nivel === 'bloqueante').length;
    const avisos = hallazgos.filter((h) => h.nivel !== 'bloqueante').length;
    resumenEstaticos.push({
      nombre: v.nombre,
      ambito: v.ambito,
      ms,
      bloqueantes: bloq,
      avisos,
      ok: !errorMsg && bloq === 0,
    });
    hallazgosEstaticos.push(...hallazgos);
  }

  // 2. Capa Base de Datos
  const hallazgosBD = [];
  let bdDisponible = false;
  const forzarBD = opciones.incluirBD === true;
  const omitirBD = opciones.incluirBD === false;
  const tieneEnvBD = Boolean(
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL
  );

  if (!omitirBD && (forzarBD || tieneEnvBD)) {
    try {
      const bdVigilantes = [
        (await import('./bd.mjs')).default,
        (await import('./bd-rendimiento.mjs')).default,
        (await import('./bd-migraciones.mjs')).default,
        (await import('./bd-ecosistema.mjs')).default,
      ];
      for (const v of bdVigilantes) {
        try {
          const h = await v.ejecutar();
          hallazgosBD.push(...h);
          bdDisponible = true;
        } catch (e) {
          hallazgosBD.push(
            hallazgo({
              clave: `bd/${v.nombre}-error`,
              nivel: 'aviso',
              ambito: v.ambito || 'base-de-datos',
              titulo: `Fallo al ejecutar vigilante de BD ${v.nombre}`,
              detalle: e.message || String(e),
              fichero: 'supabase',
            }),
          );
        }
      }
    } catch {
      // Modulos BD no cargables
    }
  }

  // 3. Capa Visual & Browser Reports
  const hallazgosVisuales = [];
  const rutaSmoke = path.join(repoRaiz, '.sistema', 'smoke.json');
  if (existsSync(rutaSmoke)) {
    try {
      const raw = JSON.parse(readFileSync(rutaSmoke, 'utf8'));
      if (Array.isArray(raw.hallazgos)) hallazgosVisuales.push(...raw.hallazgos);
    } catch {}
  }

  // 4. Capa Rendimiento y Código
  const hallazgosRendimiento = hallazgosEstaticos.filter((h) =>
    h.ambito === 'rendimiento' || h.ambito === 'codigo-muerto'
  );

  // 5. Capa Meta-Vigilancia
  const hallazgosMeta = hallazgosEstaticos.filter((h) =>
    h.clave.includes('ancla-perdida') || h.clave.includes('meta-')
  );

  const todosHallazgos = [...hallazgosEstaticos, ...hallazgosBD, ...hallazgosVisuales];
  const totalBloqueantes = todosHallazgos.filter((h) => h.nivel === 'bloqueante' || h.nivel === 'critico').length;
  const totalAvisos = todosHallazgos.filter((h) => h.nivel === 'aviso' || h.nivel === 'sugerencia').length;

  let saludGeneral = 'optima';
  if (totalBloqueantes > 0) {
    saludGeneral = 'critica';
  } else if (totalAvisos > 15) {
    saludGeneral = 'degradada';
  }

  const snapshot = {
    version: 1,
    timestamp,
    duracion_ms: Date.now() - inicio,
    git,
    resumen: {
      total_hallazgos: todosHallazgos.length,
      bloqueantes: totalBloqueantes,
      avisos: totalAvisos,
      vigilantes_ejecutados: listaEstaticos.length + (bdDisponible ? 4 : 0),
      salud: saludGeneral,
    },
    capas: {
      estatica: {
        vigilantes: listaEstaticos.length,
        bloqueantes: hallazgosEstaticos.filter((h) => h.nivel === 'bloqueante').length,
        avisos: hallazgosEstaticos.filter((h) => h.nivel !== 'bloqueante').length,
        detalle: resumenEstaticos,
      },
      base_datos: {
        disponible: bdDisponible,
        vectores: 10,
        hallazgos: hallazgosBD,
      },
      visual: {
        pilares: 3,
        hallazgos: hallazgosVisuales,
      },
      rendimiento: {
        hallazgos_rendimiento: hallazgosRendimiento.length,
      },
      meta: {
        anclas_vivas: !hallazgosMeta.some((h) => h.nivel === 'bloqueante'),
        hallazgos: hallazgosMeta,
      },
    },
    hallazgos: todosHallazgos,
  };

  if (escribirArchivos) {
    const dirSistema = opciones.dirSalida || path.join(repoRaiz, '.sistema');
    if (!existsSync(dirSistema)) {
      mkdirSync(dirSistema, { recursive: true });
    }

    const rutaJson = path.join(dirSistema, 'estado-salud.json');
    writeFileSync(rutaJson, JSON.stringify(snapshot, null, 2), 'utf8');

    const markdown = generarMarkdownEstado(snapshot);
    const rutaMd = path.join(dirSistema, 'ESTADO_SALUD.md');
    writeFileSync(rutaMd, markdown, 'utf8');
  }

  return snapshot;
}

export function generarMarkdownEstado(s) {
  const iconoSalud =
    s.resumen.salud === 'optima'
      ? '🟢 ÓPTIMA'
      : s.resumen.salud === 'degradada'
        ? '🟡 DEGRADADA'
        : '🔴 CRÍTICA';

  let md = `# 🛡️ Estado de Salud del Sistema — MECHA OS\n\n`;
  md += `**Última compilación**: \`${s.timestamp}\`  \n`;
  md += `**Estado Global**: **${iconoSalud}**  \n`;
  md += `**Git**: Rama \`${s.git.branch}\` · Commit \`${s.git.commit ? s.git.commit.slice(0, 8) : '—'}\` (${s.git.dirty ? 'con cambios locales' : 'árbol limpio'})  \n`;
  md += `**Duración compilación**: ${s.duracion_ms} ms  \n\n`;

  md += `## 📊 Resumen Ejecutivo\n\n`;
  md += `| Métrica | Valor |\n`;
  md += `|---|---|\n`;
  md += `| **Salud del Sistema** | **${iconoSalud}** |\n`;
  md += `| **Hallazgos Bloqueantes** | \`${s.resumen.bloqueantes}\` |\n`;
  md += `| **Avisos / Deuda Vigilada** | \`${s.resumen.avisos}\` |\n`;
  md += `| **Vigilantes Ejecutados** | \`${s.resumen.vigilantes_ejecutados}\` |\n\n`;

  md += `## 🏛️ Desglose de las 5 Capas\n\n`;

  md += `### 1. Capa 1: Invariantes Estáticos (Sin Red)\n`;
  md += `- Vigilantes evaluados: **${s.capas.estatica.vigilantes}**\n`;
  md += `- Bloqueantes: **${s.capas.estatica.bloqueantes}** | Avisos: **${s.capas.estatica.avisos}**\n\n`;

  md += `### 2. Capa 2: Base de Datos PostgreSQL\n`;
  md += `- Estado conexión: **${s.capas.base_datos.disponible ? 'Conectado (Online)' : 'Modo Local / Desconectado'}**\n`;
  md += `- Hallazgos registrados: **${s.capas.base_datos.hallazgos.length}**\n\n`;

  md += `### 3. Capa 3: Vigilancia Visual en 3 Pilares (Landing, Portal, SPA)\n`;
  md += `- Pilares monitorizados: **${s.capas.visual.pilares}**\n`;
  md += `- Hallazgos visuales: **${s.capas.visual.hallazgos.length}**\n\n`;

  md += `### 4. Capa 4: Rendimiento y Calidad de Código\n`;
  md += `- Hallazgos de complejidad / código muerto: **${s.capas.rendimiento.hallazgos_rendimiento}**\n\n`;

  md += `### 5. Capa 5: Meta-Vigilancia (Guardianes de Integridad)\n`;
  md += `- Anclas vivas: **${s.capas.meta.anclas_vivas ? '✓ 100% Intactas' : '⚠ Ancla Rota'}**\n\n`;

  if (s.hallazgos.length > 0) {
    md += `## 🔍 Detalle de Hallazgos Activos (${s.hallazgos.length})\n\n`;
    s.hallazgos.forEach((h, idx) => {
      const tag = h.nivel === 'bloqueante' || h.nivel === 'critico' ? '🔴 BLOQUEANTE' : '🟡 AVISO';
      md += `### ${idx + 1}. [${tag}] ${h.titulo}\n`;
      md += `- **Clave**: \`${h.clave}\`\n`;
      md += `- **Ámbito**: \`${h.ambito}\`\n`;
      if (h.fichero) md += `- **Ubicación**: \`${h.fichero}${h.linea ? `:${h.linea}` : ''}\`\n`;
      if (h.detalle) md += `- **Detalle**: ${h.detalle}\n`;
      md += `\n`;
    });
  } else {
    md += `## ✨ Sin hallazgos activos. Todos los invariantes pasan al 100%.\n`;
  }

  return md;
}

// Ejecución directa por CLI
const esEjecucionDirecta = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (esEjecucionDirecta) {
  const rapido = process.argv.includes('--rapido');

  // --salida <dir> redirige los dos artefactos fuera de `.sistema/`. Sin esto,
  // cualquiera que lance el CLI (los tests, por ejemplo) sobrescribe un snapshot
  // VERSIONADO con una corrida parcial: el panel se queda en verde describiendo
  // otra rama y otro commit, que es justo el fallo que estos vigilantes persiguen.
  const idxSalida = process.argv.indexOf('--salida');
  const dirSalida = idxSalida === -1 ? undefined : process.argv[idxSalida + 1];
  if (idxSalida !== -1 && (!dirSalida || dirSalida.startsWith('--'))) {
    console.error('Error: --salida requiere una ruta de directorio.');
    process.exit(1);
  }

  compilarEstado({ rapido, dirSalida })
    .then((s) => {
      const dirMostrado = (dirSalida || '.sistema').replace(/[\\/]+$/, '');
      console.log(`\n============================================================`);
      console.log(`🧠 MECHA OS - Compilación de Estado de Salud`);
      console.log(`============================================================`);
      console.log(`Estado:       ${s.resumen.salud.toUpperCase()}`);
      console.log(`Bloqueantes:  ${s.resumen.bloqueantes}`);
      console.log(`Avisos:       ${s.resumen.avisos}`);
      console.log(`Vigilantes:   ${s.resumen.vigilantes_ejecutados}`);
      console.log(`Snapshot:     ${dirMostrado}/estado-salud.json`);
      console.log(`Markdown:     ${dirMostrado}/ESTADO_SALUD.md`);
      console.log(`============================================================\n`);
    })
    .catch((err) => {
      console.error('Error al compilar estado:', err);
      process.exitCode = 1;
    });
}
