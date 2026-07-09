// S15 · Próxima mejor acción (iniciativa de Chispa).
// Selector DETERMINISTA: dado la página actual y los hallazgos del escaneo 24/7
// (S13), elige la acción más valiosa y oportuna para ese contexto. El LLM NO
// interviene: la sugerencia se evalúa en cada carga de página, así que no puede
// depender de una llamada al modelo (coste/latencia/spam). El copy es determinista.
import type { Hallazgo, SeveridadHallazgo } from '@/lib/hallazgos';

export interface SugerenciaProxima {
  clave: string; // estable por tipo, para silenciar ("ahora no")
  titulo: string;
  cuerpo: string;
  cta: string;
  ruta: string; // a dónde lleva "Hacer"
  severidad: SeveridadHallazgo;
}

// Qué tipos de hallazgo son relevantes en cada página (clave = 2º segmento de la
// ruta de (tabs); 'index' = agenda). Solo se sugiere lo que encaja con lo que el
// usuario está mirando ("te sigue por la página").
const RELEVANCIA_POR_PAGINA: Record<string, string[]> = {
  index: ['cita_sin_confirmar', 'senal_sin_pagar'],
  clientes: ['fuga_clienta'],
  presupuestos: ['presupuesto_sin_respuesta'],
  inventario: ['stock_bajo'],
  bandeja: ['bandeja_sin_responder'],
  caja: ['senal_sin_pagar'],
};

const RUTA_POR_TIPO: Record<string, string> = {
  cita_sin_confirmar: '/(tabs)/',
  senal_sin_pagar: '/(tabs)/',
  fuga_clienta: '/(tabs)/clientes?filtro=fuga',
  presupuesto_sin_respuesta: '/(tabs)/presupuestos',
  stock_bajo: '/(tabs)/inventario',
  bandeja_sin_responder: '/(tabs)/bandeja',
};

const SEV_ORDEN: Record<SeveridadHallazgo, number> = { urgente: 0, alta: 1, media: 2, baja: 3 };

// Copy determinista y con tacto por tipo de hallazgo.
function copyDe(tipo: string, count: number): { titulo: string; cuerpo: string; cta: string } {
  switch (tipo) {
    case 'fuga_clienta':
      return {
        titulo: 'Recupera a quien no vuelve',
        cuerpo: count === 1
          ? 'Una clienta lleva tiempo sin venir. Un mensaje a tiempo la trae de vuelta.'
          : `${count} clientas llevan tiempo sin venir. Un mensaje a tiempo las trae de vuelta.`,
        cta: 'Ver y recuperar',
      };
    case 'cita_sin_confirmar':
      return {
        titulo: 'Confirma las citas de mañana',
        cuerpo: count === 1
          ? 'Hay una cita próxima sin confirmar. Refuerza el recordatorio para evitar el hueco.'
          : `Hay ${count} citas próximas sin confirmar. Refuerza el recordatorio para evitar huecos.`,
        cta: 'Ver agenda',
      };
    case 'senal_sin_pagar':
      return {
        titulo: 'Asegura las señales pendientes',
        cuerpo: count === 1
          ? 'Una cita tiene el depósito sin pagar. Reenvía el enlace para no perder el hueco.'
          : `${count} citas tienen el depósito sin pagar. Reenvía el enlace para no perder huecos.`,
        cta: 'Ver citas',
      };
    case 'presupuesto_sin_respuesta':
      return {
        titulo: 'Da un empujón a tus presupuestos',
        cuerpo: count === 1
          ? 'Un presupuesto lleva días sin respuesta. Un recordatorio suele cerrar la venta.'
          : `${count} presupuestos llevan días sin respuesta. Un recordatorio suele cerrar la venta.`,
        cta: 'Ver presupuestos',
      };
    case 'stock_bajo':
      return {
        titulo: 'Repón antes de quedarte sin stock',
        cuerpo: count === 1
          ? 'Un producto está por debajo de su mínimo. Mejor pedirlo antes de que se agote.'
          : `${count} productos están por debajo de su mínimo. Mejor pedirlos antes de que se agoten.`,
        cta: 'Ver inventario',
      };
    case 'bandeja_sin_responder':
      return {
        titulo: 'Tienes mensajes esperando',
        cuerpo: count === 1
          ? 'Hay una conversación abierta sin responder. Contestar rápido capta más reservas.'
          : `Hay ${count} conversaciones abiertas sin responder. Contestar rápido capta más reservas.`,
        cta: 'Ir a Bandeja',
      };
    default:
      return { titulo: 'Chispa tiene una sugerencia', cuerpo: 'Hay algo que puedes atender ahora.', cta: 'Ver' };
  }
}

// Elige la mejor sugerencia para la página actual, o null si no hay ninguna
// relevante. `silenciadas` = claves que el usuario dijo "ahora no" (se saltan).
export function elegirProximaAccion(
  pagina: string,
  hallazgos: Hallazgo[],
  silenciadas: Set<string> = new Set(),
): SugerenciaProxima | null {
  const relevantes = RELEVANCIA_POR_PAGINA[pagina];
  if (!relevantes) return null;

  const candidatos = hallazgos
    .filter((h) => relevantes.includes(h.tipo) && (h.datos?.count ?? 0) > 0 && !silenciadas.has(h.tipo))
    .sort((a, b) => SEV_ORDEN[a.severidad] - SEV_ORDEN[b.severidad]);

  const top = candidatos[0];
  if (!top) return null;

  const count = top.datos?.count ?? 0;
  const c = copyDe(top.tipo, count);
  return {
    clave: top.tipo,
    titulo: c.titulo,
    cuerpo: c.cuerpo,
    cta: c.cta,
    ruta: RUTA_POR_TIPO[top.tipo] ?? '/(tabs)/',
    severidad: top.severidad,
  };
}
