export type AccionRegistroUniversal = {
  id: string; // uuid
  negocio_id: string;
  usuario_id: string;
  funcion_ia: string; // ej. 'analizar_equipo', 'optimizar_config'
  cuando: string; // timestamp ISO
  entrada: any; // contexto con el que se llamó a la IA
  resultado: any; // bloques devueltos, o error
  por_que: string; // motivación o trigger de la llamada
};

export async function registrarEventoIA(evento: Omit<AccionRegistroUniversal, 'id' | 'cuando'>) {
  // S08: Aquí se insertará en supabase la tabla de registro universal
  // Por ahora, solo es el contrato y loggueo por consola para verificación
  console.log('[Registro Universal IA]', {
    id: crypto.randomUUID(),
    cuando: new Date().toISOString(),
    ...evento
  });
}
