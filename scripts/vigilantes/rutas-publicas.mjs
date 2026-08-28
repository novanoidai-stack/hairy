// app/_layout.tsx exime a unas rutas de los guards de auth: son las que usa el
// cliente final sin cuenta (portal de reserva, resena, gestion de su cita, pago
// de la senal, presupuesto, contacto). Todo lo que se meta ahi queda abierto al
// mundo, y no lo canta ningun tipo ni ningun test.
//
// Este vigilante NO decide que rutas son legitimas: fija la lista de hoy y
// obliga a que cualquier cambio pase por aqui. Anadir una ruta publica sin tocar
// este fichero tumba la CI, y eso es exactamente lo que se busca.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, capturar, hallazgo } from './nucleo.mjs';

const LAYOUT = 'app/_layout.tsx';

export const RUTAS_PUBLICAS_ESPERADAS = new Set([
  'r', // app/r/[slug]       portal publico de reserva
  'resena', // app/resena/[slug]  dejar valoracion
  'cita', // app/cita/[id]      el cliente ve / cambia / cancela su cita
  'pago', // app/pago/[ref]     pagar la senal (Stripe)
  'pagar', // app/pagar/...      cobro en el local
  'presupuesto', // app/presupuesto/   aceptar un presupuesto
  'contacto', // app/contacto/      formulario publico
]);

async function ejecutar() {
  const texto = leer(LAYOUT);
  const { valor, linea } = capturar(
    texto,
    /const isPublicRoute = \[([^\]]*)\]\.includes\(String\(segments\[0\]\)\)/,
    { fichero: LAYOUT, ancla: 'isPublicRoute' },
  );

  const encontradas = new Set(
    valor
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean),
  );

  const hallazgos = [];

  for (const r of encontradas) {
    if (RUTAS_PUBLICAS_ESPERADAS.has(r)) continue;
    hallazgos.push(
      hallazgo({
        clave: `rutas-publicas/nueva-${r}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `La ruta /${r} se ha abierto sin sesion y no estaba en la lista`,
        detalle:
          `${LAYOUT} exime a "${r}" de los guards de auth: cualquiera puede abrirla sin ` +
          'cuenta. Si es a proposito, anadela a RUTAS_PUBLICAS_ESPERADAS en ' +
          'scripts/vigilantes/rutas-publicas.mjs con un comentario de por que. Si no lo ' +
          'es, quitala de isPublicRoute.',
        fichero: LAYOUT,
        linea,
      }),
    );
  }

  for (const r of RUTAS_PUBLICAS_ESPERADAS) {
    if (!encontradas.has(r)) {
      hallazgos.push(
        hallazgo({
          clave: `rutas-publicas/desaparecida-${r}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `La ruta publica /${r} ha dejado de estar exenta de auth`,
          detalle:
            'Si era intencionado, quitala de RUTAS_PUBLICAS_ESPERADAS. Si no, el cliente ' +
            `final se va a encontrar la pantalla de login en /${r}.`,
          fichero: LAYOUT,
          linea,
        }),
      );
    }
    // Una exencion que ya no corresponde a ninguna pantalla es un agujero muerto.
    if (!existsSync(path.join(RAIZ, 'app', r))) {
      hallazgos.push(
        hallazgo({
          clave: `rutas-publicas/sin-carpeta-${r}`,
          nivel: 'aviso',
          ambito: 'seguridad',
          titulo: `/${r} esta exenta de auth pero no existe app/${r}/`,
          detalle: 'Exencion muerta: quitala de isPublicRoute y de este vigilante.',
          fichero: LAYOUT,
          linea,
        }),
      );
    }
  }

  return hallazgos;
}

export default {
  nombre: 'rutas-publicas',
  ambito: 'seguridad',
  descripcion: 'Solo las rutas del cliente final estan exentas de los guards de auth',
  ejecutar,
};
