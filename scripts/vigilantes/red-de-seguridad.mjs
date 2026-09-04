// Red de seguridad del runner: terminar sin veredicto NO puede parecer un verde.
//
// QUE PASO (1 sep -> 4 sep 2026)
// meta-contrato importaba dinamicamente todos los .mjs del directorio para
// inspeccionar sus exports. Uno de ellos, peso-bundle.mjs, tiene `process.exit(0)`
// a nivel de modulo -- legitimo, corre suelto en el job e2e. Importar es
// ejecutar: ese exit mato al runner entero. `npm run vigilar` tardaba 43 s,
// imprimia una linea y salia CERO sin haber ejecutado un solo vigilante, y con el
// se quedaron mudos tres dias la puerta de la CI, la pestana Salud, el aviso de
// Telegram y la apertura de issues. La forense completa esta en nucleo.mjs.
//
// POR QUE ES UN FICHERO APARTE Y NO CUATRO LINEAS EN index.mjs
// Porque ahi llega tarde, y esto se midio. Los imports estaticos de un modulo ES
// se evaluan ANTES que su propio cuerpo: un vigilante de la lista ESTATICOS con
// un exit a nivel de modulo mata el proceso antes de que index.mjs haya podido
// registrar nada. Comprobado el 4 sep 2026 anadiendo `process.exit(0)` al final
// de precios.mjs: sin salida y exit 0, igual que el fallo original.
//
// Node evalua los modulos importados en el orden en que aparecen las
// declaraciones de import, asi que basta con que index.mjs importe ESTE el
// primero: cuando le toque el turno al primer vigilante, el guardia ya esta.
//
// Que NO hace: impedir la muerte. Un `process.exit()` ajeno no se puede vetar.
// Lo que hace es que se OIGA y que el codigo de salida deje de mentir.

let veredicto = false;

/**
 * La llama el runner cuando ya ha dicho lo que tenia que decir. A partir de ahi
 * salir es legitimo, con el codigo que sea.
 */
export function marcarVeredictoEmitido() {
  veredicto = true;
}

// Reasignar `process.exitCode` dentro de 'exit' SI gana a un `process.exit(0)`
// ajeno. Comprobado en Node 24.14:
//   node -e "process.on('exit',()=>{process.exitCode=2}); process.exit(0)"  -> 2
process.on('exit', (codigo) => {
  if (veredicto) return;
  console.error(
    `\nEl runner de vigilantes ha terminado SIN emitir veredicto (codigo original ${codigo}).\n` +
      'Algo ha matado el proceso a media pasada: casi seguro un modulo con process.exit()\n' +
      'a nivel de modulo, que se ejecuta con solo importarlo.\n' +
      'ESTO NO ES UN VERDE: no se ha comprobado nada. Se sale con 2 a proposito.\n' +
      'Forense del caso que lo estreno: scripts/vigilantes/nucleo.mjs.',
  );
  process.exitCode = 2;
});
