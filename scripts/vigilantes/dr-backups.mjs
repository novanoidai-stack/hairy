#!/usr/bin/env node
// Vigilante de continuidad (DR): el backup que NO se prueba es una esperanza.
//
//   node scripts/vigilantes/dr-backups.mjs [--json salida.json]
//
// POR QUE EXISTE (30 ago 2026)
// El riesgo existencial unico de este negocio es la base de datos de Supabase,
// y nada comprobaba ni que haya backups ni que el PITR este activo. Un auditor
// de verdad pregunta "cuando restauro el ultimo backup y cuanto tardo", no
// "tienes backups".
//
// Usa la Management API (token personal sbp_... en SUPABASE_ACCESS_TOKEN) y
// comprueba:
//   1. Que haya backups diarios y que el mas reciente no sea viejo.
//   2. Que el PITR (Point-In-Time Recovery) este activo: sin el, un desastre
//      de las 15:28 solo se recupera hasta el backup de la madrugada.
//   3. PUBLICA un recordatorio de que la prueba de restauracion mensual (a un
//      proyecto efimero) esta pendiente: eso no se puede automatizar desde
//      aqui, pero se puede no dejar olvidar.
//
// Regla de exito: si SUPABASE_ACCESS_TOKEN no esta, AVISA y sale 1 en CI
// (VIGILAR_DR=1) o 0 en local — un vigilante de continuidad que nunca corre
// porque falta el token es exactamente el canario mudo.

import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { hallazgo } from './nucleo.mjs';

const PROYECTO = process.env.SUPABASE_PROJECT_REF || 'vtrggiogjrhqtwbhbgia';

async function ejecutar() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    return [
      hallazgo({
        clave: 'dr/sin-token',
        nivel: process.env.VIGILAR_DR === '1' ? 'bloqueante' : 'aviso',
        ambito: 'continuidad',
        titulo: 'Vigilancia de DR sin ejecutar: falta SUPABASE_ACCESS_TOKEN',
        detalle:
          'Sin el token de la Management API no se puede comprobar ni el estado de los ' +
          'backups ni el PITR del proyecto. Configurarlo como secret del workflow mensual ' +
          '(dr-mensual.yml). Un vigilante de continuidad que no corre es el canario mudo.',
        fichero: '.github/workflows/dr-mensual.yml',
      }),
    ];
  }

  const api = async (ruta) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}${ruta}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return { ok: r.ok, status: r.status, cuerpo: await r.json().catch(() => ({})) };
  };

  const hallazgos = [];

  // 1. Backups diarios
  const backups = await api('/database/backups');
  if (!backups.ok) {
    hallazgos.push(
      hallazgo({
        clave: 'dr/backups-sin-comprobar',
        nivel: 'bloqueante',
        ambito: 'continuidad',
        titulo: `No se ha podido leer el estado de los backups (${backups.status})`,
        detalle:
          'La Management API ha rechazado la consulta. O el token no tiene alcance, o el ' +
          'proyecto no es el que se cree. La continuidad queda sin verificar: eso, en un ' +
          'vigilante de DR, es bloqueante.',
        fichero: 'scripts/vigilantes/dr-backups.mjs',
      }),
    );
    return hallazgos;
  }

  const lista = Array.isArray(backups.cuerpo) ? backups.cuerpo : [];
  if (lista.length === 0) {
    hallazgos.push(
      hallazgo({
        clave: 'dr/sin-backups',
        nivel: 'bloqueante',
        ambito: 'continuidad',
        titulo: 'El proyecto NO tiene ningun backup diario',
        detalle:
          'La lista de backups de la Management API viene vacia. Con un SaaS multi-tenant ' +
          'con dinero real dentro, esto es el riesgo existencial en estado puro: revisar ' +
          'el plan del proyecto en Supabase YA.',
        fichero: 'scripts/vigilantes/dr-backups.mjs',
      }),
    );
  } else {
    const masReciente = lista
      .map((b) => new Date(b.inserted_at ?? 0).getTime())
      .sort((a, b) => b - a)[0];
    const horas = masReciente ? (Date.now() - masReciente) / 3_600_000 : Infinity;
    if (horas > 36) {
      hallazgos.push(
        hallazgo({
          clave: 'dr/backup-viejo',
          nivel: 'bloqueante',
          ambito: 'continuidad',
          titulo: `El backup mas reciente tiene ${Math.round(horas)} h`,
          detalle:
            'Hay backups, pero el ultimo es demasiado viejo. La perdida maxima tolerable ' +
            '(RPO) se mide en horas y esto la incumple: mirar si el job diario fallo.',
          fichero: 'scripts/vigilantes/dr-backups.mjs',
        }),
      );
    }
  }

  // 2. PITR activo (viene en la misma respuesta: pitr_enabled)
  if (backups.cuerpo?.pitr_enabled !== true) {
    hallazgos.push(
      hallazgo({
        clave: 'dr/pitr-inactivo',
        nivel: 'aviso',
        ambito: 'continuidad',
        titulo: 'PITR no activo en el proyecto',
        detalle:
          'Sin Point-In-Time Recovery, un desastre a media tarde solo se recupera hasta el ' +
          'backup de la madrugada: se pierde el dia entero de citas, cobros y fichas. Es un ' +
          'add-on de pago: decision de coste, pero tiene que ser CONSCIENTE y estar escrita, ' +
          'no ser el estado por defecto.',
        fichero: 'scripts/vigilantes/dr-backups.mjs',
      }),
    );
  }

  // 3. La prueba de restauracion: recordatorio permanente hasta que exista
  const mes = new Date().toISOString().slice(0, 7);
  hallazgos.push(
    hallazgo({
      clave: `dr/prueba-restauracion-pendiente:${mes}`,
      nivel: 'aviso',
      ambito: 'continuidad',
      titulo: `Prueba de restauracion PITR de ${mes}: PENDIENTE`,
      detalle:
        'Restaurar el ultimo backup a un proyecto efimero y correr contra el una consulta ' +
        'de integridad (por ejemplo vigilancia_bd_invariantes()). Un backup no probado es ' +
        'una esperanza, no un backup. Este aviso se emite todos los meses hasta que la ' +
        'prueba quede automatizada; cerrar el issue solo tras haber hecho la restauracion.',
      fichero: 'scripts/vigilantes/dr-backups.mjs',
    }),
  );

  return hallazgos;
}

// CLI: --json salida.json escribe el informe en el formato del runner.
if (process.argv[1]?.endsWith('dr-backups.mjs')) {
  const destino = process.argv.includes('--json')
    ? process.argv[process.argv.indexOf('--json') + 1]
    : null;

  let hs = [];
  try {
    hs = await ejecutar();
  } catch (e) {
    hs = [
      hallazgo({
        clave: 'dr/reventado',
        nivel: 'bloqueante',
        ambito: 'continuidad',
        titulo: 'El vigilante de DR ha reventado',
        detalle: e.message,
        fichero: 'scripts/vigilantes/dr-backups.mjs',
      }),
    ];
  }

  for (const h of hs) {
    console.log(`[dr] ${h.nivel.toUpperCase()} ${h.titulo}`);
  }
  if (destino) {
    writeFileSync(
      destino,
      JSON.stringify({
        version: 1,
        origen: process.env.GITHUB_ACTIONS ? 'dr' : 'local',
        commit: process.env.GITHUB_SHA || null,
        rama: process.env.GITHUB_REF_NAME || null,
        ejecutado_en: new Date().toISOString(),
        vigilantes: [{ nombre: 'dr-backups', ambito: 'continuidad', ms: 0, ok: hs.length === 0, bloqueantes: hs.filter((h) => h.nivel === 'bloqueante').length, avisos: hs.filter((h) => h.nivel !== 'bloqueante').length }],
        hallazgos: hs,
      }, null, 2),
      'utf8',
    );
  }
  process.exitCode = hs.some((h) => h.nivel === 'bloqueante') ? 1 : 0;
}

export default { nombre: 'dr-backups', ambito: 'continuidad', descripcion: 'Backups diarios, PITR activo y prueba de restauracion pendiente', ejecutar };
