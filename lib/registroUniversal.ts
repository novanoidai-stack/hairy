export type AccionRegistroUniversal = {
  id: string; // uuid
  negocio_id: string;
  usuario_id: string;
  funcion_ia: string; // ej. 'analizar_equipo', 'optimizar_config'
  cuando: string; // timestamp ISO
  entrada: unknown; // contexto con el que se llamó a la IA
  resultado: unknown; // bloques devueltos, o error
  por_que: string; // motivación o trigger de la llamada
};

import { supabase, IS_DEMO_MODE } from '@/lib/supabase';

export async function registrarEventoIA(evento: Omit<AccionRegistroUniversal, 'id' | 'cuando'>) {
  const safeId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  // Console log for local debugging
  console.log('[Registro Universal IA]', {
    id: safeId,
    cuando: new Date().toISOString(),
    ...evento
  });

  // Demo: tenant compartido entre visitantes; no acumulamos el registro de
  // cada visitante en el negocio de demostracion (constraint #8).
  if (IS_DEMO_MODE) return;

  // Guardar en la tabla eventos_negocio de supabase
  // Si los datos contienen info sensible, el caller deberia filtrarlos (S08 dicta sin datos de salud)
  try {
    const { error } = await supabase
      .from('eventos_negocio')
      .insert({
        negocio_id: evento.negocio_id,
        tipo: 'chispa_ia',
        entidad: 'funcion_ia',
        entidad_id: evento.funcion_ia,
        actor: evento.usuario_id || 'sistema',
        resumen: `Ejecutada la función IA: ${evento.funcion_ia}`,
        datos: evento.entrada,
        resultado: JSON.stringify(evento.resultado),
        motivo: evento.por_que
      });

    if (error) {
      console.error('[Registro Universal IA] Error insertando evento:', error);
    }
  } catch (err) {
    console.error('[Registro Universal IA] Exception:', err);
  }
}
