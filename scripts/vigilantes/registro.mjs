// EL REGISTRO: la unica lista de que vigilantes existen y en que orden corren.
//
// POR QUE EXISTE (4 sep 2026)
// La lista estaba escrita DOS veces, y las dos no decian lo mismo:
//
//   index.mjs           -> 32 vigilantes (el runner de `npm run vigilar` y de la CI)
//   compilar-estado.mjs -> 17 vigilantes (quien escribe .sistema/estado-salud.json)
//
// Y ese segundo fichero escribe .sistema/estado-salud.json y ESTADO_SALUD.md: el
// informe de salud VERSIONADO del repo, del que vive la linea base del trinquete
// de deuda. (La pestana Salud del panel de staff NO sale de ahi: la alimenta el
// runner via `index.mjs --json` + enviar.mjs, y esa siempre vio los 32 -- cuando
// el runner no estaba muerto.) O sea que el trinquete llevaba midiendo poco mas
// de la mitad del sistema: 39 avisos donde el runner ve 301. Los 15 que faltaban
// no eran menores -- `calidad-codigo` (141 avisos), `peso-componentes` (80),
// `rendimiento` (25), `inmutabilidad-cobros` (ambito fiscal) y TODOS los
// `meta-*`, incluido el propio `meta-trinquete`, que vive de ese snapshot.
//
// El sintoma que lo delata sin contar nada: la cabecera de compilar-estado dice
// que consolida "las 5 capas (... y meta-vigilancia)" y su capa 5 filtra los
// hallazgos cuya clave contiene `meta-`. Como ningun `meta-*` estaba en su lista,
// esa capa salia SIEMPRE vacia y `anclas_vivas` SIEMPRE true. Un panel que
// afirma que las anclas estan vivas sin haber corrido un solo meta-vigilante.
//
// Es la misma enfermedad que tumbo el runner tres dias antes (dos copias de la
// lista de exclusion, una vieja): el invariante repartido de la decision 10 del
// CLAUDE.md. Por eso ahora la lista esta AQUI y nadie mas la escribe.
//
// COMO ANADIR UN VIGILANTE: importalo abajo y metelo en ESTATICOS. Con eso entra
// a la vez en el runner, en la CI (y por tanto en el panel) y en el informe de
// salud del repo. Si es de red (bd-*), va ademas
// en DE_RED, y `meta-registro` comprueba que este tambien en la edge que los
// dispara cada 6 h.

import { DE_RED } from './nucleo.mjs';

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
import inmutabilidadCobros from './inmutabilidad-cobros.mjs';
import workflows from './workflows.mjs';
import ecosistemaCuentas from './ecosistema-cuentas.mjs';
import codigoMuerto from './codigo-muerto.mjs';
import claimsFiscales from './claims-fiscales.mjs';
import modulosDesconectados from './modulos-desconectados.mjs';
import metaAnclas from './meta-anclas.mjs';
import metaCobertura from './meta-cobertura.mjs';
import pesoComponentes from './peso-componentes.mjs';
import rendimiento from './rendimiento.mjs';
import calidadCodigo from './calidad-codigo.mjs';
import ciCadenaRota from './ci-cadena-rota.mjs';
import triggerCadenas from './trigger-cadenas.mjs';
import metaRegistro from './meta-registro.mjs';
import metaContrato from './meta-contrato.mjs';
import metaMutaciones from './meta-mutaciones.mjs';
import metaTrinquete from './meta-trinquete.mjs';
import guardrailIA from './guardrail-ia.mjs';
import fugasListeners from './fugas-listeners.mjs';
import modalesFantasma from './modales-fantasma.mjs';

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
  inmutabilidadCobros,
  workflows,
  ecosistemaCuentas,
  codigoMuerto,
  claimsFiscales,
  modulosDesconectados,
  metaAnclas,
  metaCobertura,
  pesoComponentes,
  rendimiento,
  calidadCodigo,
  ciCadenaRota,
  triggerCadenas,
  metaRegistro,
  metaContrato,
  metaMutaciones,
  metaTrinquete,
  guardrailIA,
  fugasListeners,
  modalesFantasma,
];

// La lista de red vive en nucleo.mjs (meta-registro tambien la pregunta, y
// registro importa a meta-registro: tenerla aqui era un ciclo). Se reexporta
// para que quien use el registro no tenga que saber eso.
export { DE_RED };

/**
 * Carga los vigilantes de red. Se hace a peticion, no al importar el registro.
 * @param {string[]} rutas
 * @returns {Promise<object[]>}
 */
export async function cargarDeRed(rutas = DE_RED) {
  const cargados = [];
  for (const ruta of rutas) {
    cargados.push((await import(ruta)).default);
  }
  return cargados;
}
