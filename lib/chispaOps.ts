// Ejecutor GENERAL de acciones de Chispa (la capa de IA transversal de Mecha).
//
// Evoluciona el antiguo lib/agendaOps.ts: ademas de las acciones de agenda
// (crear/reagendar/cancelar cita, bloquear/liberar hueco, cambiar config) suma
// las acciones "de gestion" de la Sesion 3 del PLAN-IA-CHISPA:
//   - confirmar_citas   (batch: citas pendientes -> confirmadas, con reenvio)
//   - editar_servicio   (precio/nombre/duracion/activo del catalogo)
//   - editar_horario    (turno de un profesional en un dia)
//   - crear_presupuesto (reutiliza el backend de Presupuestos ya existente)
//   - enviar_mensaje_bandeja (registra el borrador en la Bandeja; el envio real
//     por WhatsApp es de Alexandro -> stub explicito, NO se dispara ningun envio)
//
// PR-12 (IA propone, el profesional dispone): el LLM NUNCA ejecuta. El edge solo
// devuelve una AccionPropuesta validada; esta funcion la aplica con la sesion
// autenticada del usuario (RLS + can() del edge = defensa en profundidad).
//
// Fallas de coherencia que cierra esta Sesion 3:
//   #2 auditoria: cada escritura de cita deja rastro en citas_historial (antes la
//      tabla estaba rota y no grababa nada; ver migracion chispa-acciones-historial-config).
//   #3 aviso al reagendar: reagendar_cita resetea confirmacion_enviada/recordatorio_enviado
//      para que el motor n8n (cron-pull) reenvie la confirmacion con la nueva fecha.
//   #4 cambiar_config atomico: usa la RPC set_negocio_config_key (merge por clave),
//      no el read-merge-write que pisaba cambios de sesiones concurrentes.

import { supabase } from '@/lib/supabase';
import { CITA_STATUS, CITA_CANAL } from '@/lib/constants';
import { guardarPresupuesto } from '@/lib/presupuestos';

// --- Tipos ---

export type AccionPropuesta =
  | {
      tipo: 'crear_cita';
      negocio_id: string;
      profesional_id: string;
      profesional_nombre: string;
      servicio_id: string;
      servicio_nombre: string;
      cliente_id: string | null;
      cliente_nombre: string | null;
      inicio: string;
      fin: string;
      fin_activa: string;
      fin_espera: string;
      resumen: string;
      solapa: boolean;
    }
  | {
      tipo: 'reagendar_cita';
      cita_id: string;
      nuevo_inicio: string;
      nuevo_fin: string;
      nuevo_fin_activa: string;
      nuevo_fin_espera: string;
      nuevo_profesional_id?: string;
      resumen: string;
      solapa: boolean;
    }
  | {
      tipo: 'cancelar_cita';
      cita_id: string;
      motivo: string | null;
      resumen: string;
    }
  | {
      tipo: 'bloquear_hueco';
      negocio_id: string;
      profesional_id: string;
      profesional_nombre: string;
      inicio: string;
      fin: string;
      motivo: string | null;
      resumen: string;
      solapa: boolean;
    }
  | {
      tipo: 'liberar_hueco';
      bloqueo_id: string;
      resumen: string;
    }
  | {
      tipo: 'cambiar_config';
      negocio_id: string;
      clave: string;
      label: string;
      valor: boolean | number | string;
      valor_actual: boolean | number | string | null;
      resumen: string;
    }
  | {
      // Cambia VARIOS ajustes de negocio_config a la vez (Sesion 3 V2: p.ej.
      // "activa el recordatorio con 48h de antelacion" = 2 claves relacionadas
      // en una sola confirmacion). Cada clave se aplica con set_negocio_config_key.
      tipo: 'cambiar_config_multiple';
      negocio_id: string;
      cambios: { clave: string; label: string; valor: boolean | number | string; valor_actual: boolean | number | string | null }[];
      resumen: string;
    }
  | {
      // Idioma del PORTAL PUBLICO de reserva (negocio_portal.idioma). Distinto
      // de negocio_config: fuera del alcance de set_negocio_config_key.
      tipo: 'cambiar_idioma_portal';
      negocio_id: string;
      idioma: string;
      idioma_actual: string | null;
      resumen: string;
    }
  | {
      // Festivo/cierre de dia completo a nivel de todo el negocio (tabla
      // cierres_negocio, Sesion 15). Insercion, no cambio de config.
      tipo: 'crear_cierre_negocio';
      negocio_id: string;
      fecha: string;
      motivo: string | null;
      resumen: string;
    }
  // --- Acciones de gestion (Sesion 3) ---
  | {
      // Batch: confirma varias citas pendientes de una sola vez ("confirmame las
      // citas de manana"). Lleva la lista de afectadas para pintarla en la tarjeta.
      tipo: 'confirmar_citas';
      negocio_id: string;
      citas: { id: string; label: string }[];
      resumen: string;
    }
  | {
      // Reenvia el recordatorio a citas ya confirmadas por el salon pero que el
      // CLIENTE aun no ha confirmado (resetea flags -> el motor n8n reavisa).
      tipo: 'reenviar_confirmacion';
      negocio_id: string;
      citas: { id: string; label: string }[];
      resumen: string;
    }
  | {
      tipo: 'editar_servicio';
      negocio_id: string;
      servicio_id: string;
      servicio_nombre: string;
      // Solo los campos que cambian (validados en el edge).
      cambios: {
        precio?: number;
        nombre?: string;
        duracion_activa_min?: number;
        activo?: boolean;
        // Señal/deposito del servicio (Sesion 3 V2): cantidad fija en euros.
        prepago_requerido?: boolean;
        prepago_cantidad_fija?: number;
      };
      resumen: string;
    }
  | {
      // S22: Macros (I+D). Cambia estado a aprobado
      tipo: 'aprobar_macro';
      negocio_id: string;
      macro_id: string;
      nombre: string;
      descripcion: string;
      resumen: string;
    }
  | {
      // Crea un servicio nuevo (Sesion 3 V2: "actua con minima info").
      tipo: 'crear_servicio';
      negocio_id: string; nombre: string; precio: number; duracion_activa_min: number;
      resumen: string;
    }
  | {
      // Fija el turno de un profesional en un dia de la semana (0=domingo..6=sabado)
      // reemplazando lo que hubiera ese dia por un unico turno inicio-fin.
      tipo: 'editar_horario';
      negocio_id: string;
      profesional_id: string;
      profesional_nombre: string;
      dia_semana: number;
      hora_inicio: string; // HH:MM
      hora_fin: string; // HH:MM
      resumen: string;
    }
  | {
      tipo: 'crear_presupuesto';
      negocio_id: string;
      cliente_id: string | null;
      cliente_nombre: string | null;
      titulo: string | null;
      lineas: { nombre: string; precio_cents: number; cantidad: number }[];
      total_cents: number;
      resumen: string;
    }
  | {
      // Registra el borrador de un mensaje saliente en la Bandeja (hilo existente
      // con la clienta). El envio real por WhatsApp lo hace el equipo (Alexandro):
      // aqui NO se dispara ningun envio (stub explicito).
      tipo: 'enviar_mensaje_bandeja';
      negocio_id: string;
      conversacion_id: string;
      contacto_nombre: string | null;
      cuerpo: string;
      resumen: string;
    }
  | {
      // Recuperacion de clienta en fuga (Sesion 7): deja el REGISTRO/borrador de
      // "propuesta de vuelta" (fuga_clientas_avisos) para el motor de envio. El
      // envio real por WhatsApp es de Alexandro: aqui NO se dispara ningun envio.
      tipo: 'recuperar_cliente';
      negocio_id: string;
      cliente_id: string;
      cliente_nombre: string | null;
      dias_sin_venir: number;
      resumen: string;
    }
  | {
      tipo: 'optimizar_agenda';
      negocio_id: string;
      fecha: string;
      // nuevo_fin_activa/nuevo_fin_espera son opcionales: el boton "Organizar
      // mi agenda" (Sesion 5) siempre las manda (desplaza las 4 marcas juntas,
      // ver lib/organizarAgenda.ts); el chatbot (Modo Tetris) solo da
      // inicio/fin, y el ejecutor completa fin_activa por compatibilidad.
      movimientos: { cita_id: string; nuevo_inicio: string; nuevo_fin: string; nuevo_fin_activa?: string; nuevo_fin_espera?: string; cliente_nombre: string }[];
      resumen: string;
    }
  // --- Lista de espera (Sesion 8-B) ---
  | {
      // Aviso a candidata de lista de espera tras cancelar una cita: deja el
      // REGISTRO/borrador (lista_espera_avisos) para el motor de envio (Alexandro).
      // La RPC crea la cita tentativa, marca la lista como avisada y encola el aviso.
      tipo: 'avisar_lista_espera_match';
      negocio_id: string;
      lista_espera_id: string;
      cita_origen_id: string;
      cliente_nombre: string;
      servicio_nombre: string;
      profesional_nombre: string;
      inicio: string;
      fidelidad_citas: number;
      resumen: string;
    }
  | {
      tipo: 'bulk_editar_horarios';
      negocio_id: string;
      dia: string;
      dia_semana: number;
      hora_inicio: string;
      hora_fin: string;
      profesionales: { id: string; nombre: string }[];
      resumen: string;
    }
  | {
      tipo: 'bulk_editar_comisiones';
      negocio_id: string;
      comision_pct: number;
      profesionales: { id: string; nombre: string }[];
      resumen: string;
    };

export type EjecucionResultado =
  | { ok: true; mensaje: string; accion_id?: string }
  | { ok: false; error: string };

// Tipo para representar una accion registrada (leida desde chispa_acciones)
export type AccionRegistrada = {
  id: string;
  negocio_id: string;
  usuario_id: string;
  tipo_accion: string;
  estado_previo: unknown;
  reversible: boolean;
  deshecha: boolean;
  target_id: string | null;
  target_label: string | null;
};

// --- Auditoria (falla #2): rastro en citas_historial, igual que el flujo manual
//     (AgendaCalendar.registrarHistorial) pero ahora sobre una tabla ya reparada.
//     Best-effort: si el registro falla, la operacion NO se revierte (la escritura
//     principal es lo que importa; el historial es una traza).
type CambioHist = { campo: string; anterior: string | null; nuevo: string | null };

// --- Captura de estado previo (para deshacer) ---

/**
 * Captura el estado previo necesario para revertir una accion.
 * Segun el tipo, consulta las tablas correspondientes antes de que la accion modifique nada.
 */
async function capturarEstadoPrevio(
  a: AccionPropuesta,
  userId: string,
): Promise<unknown> {
  switch (a.tipo) {
    case 'crear_cita':
      // No hay estado previo (crear → borrar la cita creada)
      return null;
      
    case 'aprobar_macro':
      // El estado previo es revision
      return { estado_previo: 'revision' };

    case 'reagendar_cita': {
      // Necesitamos: inicio, fin, fin_activa, fin_espera, profesional_id previos
      const { data } = await supabase
        .from('citas')
        .select('inicio, fin, fin_activa, fin_espera, profesional_id, negocio_id')
        .eq('id', a.cita_id)
        .maybeSingle();
      return data;
    }

    case 'cancelar_cita': {
      // Necesitamos: estado previo (para volver de cancelada a ese estado)
      const { data } = await supabase
        .from('citas')
        .select('estado, motivo_cancelacion, negocio_id')
        .eq('id', a.cita_id)
        .maybeSingle();
      return data;
    }

    case 'bloquear_hueco':
      // El estado previo guarda los datos del bloqueo para poder recrearlo
      // al deshacer; el target_id se rellena despues del insert (ver ejecutarAccion).
      return { profesional_id: a.profesional_id, inicio: a.inicio, fin: a.fin, motivo: a.motivo };

    case 'liberar_hueco': {
      // Necesitamos: bloqueo_id (para recrearlo si se deshace)
      const { data } = await supabase
        .from('bloqueos_profesional')
        .select('id, inicio, fin, motivo, profesional_id, negocio_id')
        .eq('id', a.bloqueo_id)
        .maybeSingle();
      return data;
    }

    case 'cambiar_config':
      // Valor actual ya viaja en la propuesta (valor_actual)
      return { valor_actual: a.valor_actual };

    case 'cambiar_config_multiple':
      // Para multiple, guardamos los valores actuales de cada clave
      return { valores_actuales: a.cambios.map((c) => ({ clave: c.clave, valor_actual: c.valor_actual })) };

    case 'cambiar_idioma_portal':
      return { idioma_actual: a.idioma_actual };

    case 'editar_servicio': {
      // Necesitamos: estado previo de los campos que se van a cambiar
      const campos = Object.keys(a.cambios);
      const { data } = await supabase
        .from('servicios')
        .select(campos.join(','))
        .eq('id', a.servicio_id)
        .eq('negocio_id', a.negocio_id)
        .maybeSingle();
      return data;
    }

    case 'crear_servicio':
      // No hay estado previo (crear → borrar el servicio creado)
      return null;

    case 'editar_horario': {
      // Necesitamos: turno(s) previos de ese dia (para restaurarlos)
      const { data } = await supabase
        .from('horarios_profesional')
        .select('*')
        .eq('profesional_id', a.profesional_id)
        .eq('dia_semana', a.dia_semana);
      return data ?? [];
    }

    case 'crear_presupuesto':
      // No hay estado previo (crear → borrar el presupuesto creado)
      return null;

    case 'enviar_mensaje_bandeja':
      // No reversible (envio real es de Alexandro)
      return null;

    case 'recuperar_cliente':
      // No reversible (registro de aviso, el envio es de Alexandro)
      return null;

    case 'optimizar_agenda': {
      // Necesitamos: estado previo de cada cita (inicio, fin, fin_activa, fin_espera)
      const ids = a.movimientos.map((m) => m.cita_id);
      const { data } = await supabase
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera')
        .in('id', ids);
      return data ?? [];
    }

    case 'crear_cierre_negocio':
      // No hay estado previo (crear → borrar el cierre creado)
      return null;

    case 'avisar_lista_espera_match':
      // No reversible (registro de aviso, el envio es de Alexandro)
      return null;

    default:
      return null;
  }
}

async function registrarHistorialIA(
  negocioId: string,
  citaId: string,
  cambios: CambioHist[],
  motivo: string,
): Promise<void> {
  const rows = cambios
    .filter((c) => c.anterior !== c.nuevo)
    .map((c) => ({
      cita_id: citaId,
      negocio_id: negocioId,
      campo: c.campo,
      valor_anterior: c.anterior,
      valor_nuevo: c.nuevo,
      motivo,
    }));
  if (rows.length === 0) return;
  try {
    await supabase.from('citas_historial').insert(rows);
  } catch {
    // Silencioso: la traza no debe tumbar la accion ya aplicada.
  }
}

// --- Ejecutor ---

/**
 * Aplica una accion propuesta por Chispa usando la sesion autenticada del
 * usuario (RLS activo: los permisos son los mismos que una accion manual).
 * Devuelve, ademas del resultado, el ID de la accion registrada (si es reversible).
 */
export async function ejecutarAccion(
  a: AccionPropuesta,
  userId: string,
): Promise<EjecucionResultado> {
  try {
    // 0. Capturar estado previo ANTES de ejecutar (para poder deshacer)
    const estadoPrevio = await capturarEstadoPrevio(a, userId);
    const negocioId = 'negocio_id' in a ? a.negocio_id : null;
    const targetLabel = 'resumen' in a ? a.resumen : null;
    switch (a.tipo) {
      case 'crear_cita': {
        if (new Date(a.inicio) >= new Date(a.fin)) {
          return { ok: false, error: 'El inicio no puede ser posterior al fin.' };
        }
        const { data, error } = await supabase
          .from('citas')
          .insert({
            negocio_id: a.negocio_id,
            profesional_id: a.profesional_id,
            servicio_id: a.servicio_id,
            cliente_id: a.cliente_id,
            inicio: a.inicio,
            fin: a.fin,
            fin_activa: a.fin_activa,
            fin_espera: a.fin_espera,
            estado: CITA_STATUS.CONFIRMADA,
            canal: CITA_CANAL.ASISTENTE_IA,
            creado_por: userId,
          })
          .select('id')
          .single();
        if (error) return { ok: false, error: error.message };
        if (data?.id) {
          await registrarHistorialIA(a.negocio_id, data.id as string, [
            { campo: 'estado', anterior: null, nuevo: CITA_STATUS.CONFIRMADA },
          ], 'Creada por Chispa (IA)');
          // Registrar accion reversible (crear → borrar)
          const accionId = await registrarAccionChispa(
            a.negocio_id,
            userId,
            'crear_cita',
            estadoPrevio,
            true, // reversible
            data.id as string, // target_id = cita_id para poder borrar
            targetLabel,
          );
          return { ok: true, mensaje: `Cita creada: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
        }
        return { ok: true, mensaje: 'Cita creada y confirmada correctamente.' };
      }

      case 'aprobar_macro': {
        const { error } = await supabase
          .from('chispa_macros')
          .update({ estado: 'aprobado' })
          .eq('id', a.macro_id);
        if (error) return { ok: false, error: error.message };
        
        await registrarAccionChispa(
          a.negocio_id,
          userId,
          'aprobar_macro',
          estadoPrevio,
          true, // reversible a revision
          a.macro_id, 
          targetLabel
        );
        return { ok: true, mensaje: `Macro "${a.nombre}" aprobada y lista para usarse.` };
      }

      case 'reagendar_cita': {
        if (new Date(a.nuevo_inicio) >= new Date(a.nuevo_fin)) {
          return { ok: false, error: 'El inicio no puede ser posterior al fin.' };
        }
        // Estado previo para la traza (inicio/profesional).
        const { data: prev } = await supabase
          .from('citas')
          .select('inicio, profesional_id')
          .eq('id', a.cita_id)
          .maybeSingle();

        const payload: Record<string, string> = {
          inicio: a.nuevo_inicio,
          fin: a.nuevo_fin,
          fin_activa: a.nuevo_fin_activa,
          fin_espera: a.nuevo_fin_espera,
        };
        if (a.nuevo_profesional_id) {
          payload.profesional_id = a.nuevo_profesional_id;
        }
        // Falla #3: al reagendar, resetear los flags de notificacion para que el
        // motor n8n (cron-pull sobre confirmacion_enviada=false) reenvie la
        // confirmacion con la NUEVA fecha y reprograme el recordatorio.
        const { error } = await supabase
          .from('citas')
          .update({ ...payload, confirmacion_enviada: false, recordatorio_enviado: false })
          .eq('id', a.cita_id);
        if (error) return { ok: false, error: error.message };

        const cambios: CambioHist[] = [
          { campo: 'inicio', anterior: (prev?.inicio as string) ?? null, nuevo: a.nuevo_inicio },
        ];
        if (a.nuevo_profesional_id) {
          cambios.push({ campo: 'profesional_id', anterior: (prev?.profesional_id as string) ?? null, nuevo: a.nuevo_profesional_id });
        }
        // negocio_id no viaja en la propuesta de reagendar; se resuelve del propio registro.
        const { data: nid } = await supabase.from('citas').select('negocio_id').eq('id', a.cita_id).maybeSingle();
        const nidStr = nid?.negocio_id as string | undefined;
        if (nidStr) await registrarHistorialIA(nidStr, a.cita_id, cambios, 'Reagendada por Chispa (IA)');

        // Registrar accion reversible (reagendar → volver a marcas previas)
        const accionId = await registrarAccionChispa(
          nidStr ?? (estadoPrevio as { negocio_id?: string })?.negocio_id ?? '',
          userId,
          'reagendar_cita',
          estadoPrevio,
          true, // reversible
          a.cita_id, // target_id = cita_id
          targetLabel,
        );
        return { ok: true, mensaje: `Cita reagendada: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'cancelar_cita': {
        const { data: prev } = await supabase
          .from('citas')
          .select('estado, negocio_id')
          .eq('id', a.cita_id)
          .maybeSingle();

        const { error } = await supabase
          .from('citas')
          .update({
            estado: CITA_STATUS.CANCELADA,
            motivo_cancelacion: a.motivo,
            cancelado_por: CITA_CANAL.ASISTENTE_IA,
          })
          .eq('id', a.cita_id);
        if (error) return { ok: false, error: error.message };

        if (prev?.negocio_id) {
          await registrarHistorialIA(prev.negocio_id as string, a.cita_id, [
            { campo: 'estado', anterior: (prev.estado as string) ?? null, nuevo: CITA_STATUS.CANCELADA },
          ], 'Cancelada por Chispa (IA)');
          // Registrar accion reversible (cancelar → volver a estado previo)
          const accionId = await registrarAccionChispa(
            prev.negocio_id as string,
            userId,
            'cancelar_cita',
            estadoPrevio,
            true, // reversible
            a.cita_id, // target_id = cita_id
            targetLabel,
          );
          return { ok: true, mensaje: `Cita cancelada: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
        }
        return { ok: true, mensaje: `Cita cancelada: ${a.resumen}` };
      }

      case 'bloquear_hueco': {
        if (new Date(a.inicio) >= new Date(a.fin)) {
          return { ok: false, error: 'El inicio no puede ser posterior al fin.' };
        }
        const { data: bloqCreado, error } = await supabase.from('bloqueos_profesional').insert({
          negocio_id: a.negocio_id,
          profesional_id: a.profesional_id,
          inicio: a.inicio,
          fin: a.fin,
          tipo: 'otro',
          motivo: a.motivo,
        }).select('id').single();
        if (error) return { ok: false, error: error.message };
        // Registrar accion reversible (bloquear → borrar el bloqueo)
        const accionId = await registrarAccionChispa(
          a.negocio_id,
          userId,
          'bloquear_hueco',
          estadoPrevio,
          true, // reversible
          bloqCreado?.id as string ?? null, // target_id = bloqueo_id
          targetLabel,
        );
        return { ok: true, mensaje: `Hueco bloqueado: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'liberar_hueco': {
        const { error } = await supabase
          .from('bloqueos_profesional')
          .delete()
          .eq('id', a.bloqueo_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Hueco liberado: ${a.resumen}` };
      }

      case 'confirmar_citas': {
        const ids = a.citas.map((c) => c.id);
        if (ids.length === 0) return { ok: false, error: 'No hay citas que confirmar.' };

        // Solo se confirman las que siguen en pendiente (idempotente y seguro si
        // otra sesion ya toco alguna). confirmacion_enviada=false para que el
        // motor de avisos mande la confirmacion al cliente.
        const { data: actualizadas, error } = await supabase
          .from('citas')
          .update({ estado: CITA_STATUS.CONFIRMADA, confirmacion_enviada: false })
          .in('id', ids)
          .eq('estado', 'pendiente')
          .select('id');
        if (error) return { ok: false, error: error.message };

        const n = actualizadas?.length ?? 0;
        // Traza por cada cita confirmada.
        for (const row of (actualizadas ?? []) as { id: string }[]) {
          await registrarHistorialIA(a.negocio_id, row.id, [
            { campo: 'estado', anterior: 'pendiente', nuevo: CITA_STATUS.CONFIRMADA },
          ], 'Confirmada por Chispa (IA)');
        }
        if (n === 0) return { ok: true, mensaje: 'No habia citas pendientes por confirmar (ya estaban confirmadas).' };
        return { ok: true, mensaje: `${n} cita${n === 1 ? '' : 's'} confirmada${n === 1 ? '' : 's'}.` };
      }

      case 'reenviar_confirmacion': {
        const ids = a.citas.map((c) => c.id);
        if (ids.length === 0) return { ok: false, error: 'No hay citas a las que reenviar el recordatorio.' };

        // Solo las que siguen confirmadas por el salon y sin confirmar por el
        // cliente (idempotente). Resetear los flags hace que el motor n8n reavise;
        // el envio real del WhatsApp lo hace ese motor (reparto Alexandro).
        const { data: actualizadas, error } = await supabase
          .from('citas')
          .update({ confirmacion_enviada: false, recordatorio_enviado: false })
          .in('id', ids)
          .eq('estado', CITA_STATUS.CONFIRMADA)
          .eq('confirmada_cliente', false)
          .select('id');
        if (error) return { ok: false, error: error.message };

        const n = actualizadas?.length ?? 0;
        for (const row of (actualizadas ?? []) as { id: string }[]) {
          await registrarHistorialIA(a.negocio_id, row.id, [
            { campo: 'recordatorio', anterior: 'enviado', nuevo: 'reenviar' },
          ], 'Recordatorio de confirmacion reenviado por Chispa (IA)');
        }
        if (n === 0) return { ok: true, mensaje: 'Ninguna seguia pendiente de confirmar por el cliente.' };
        return { ok: true, mensaje: `Se reenviara el recordatorio a ${n} cliente${n === 1 ? '' : 's'} (lo envia el motor del salon).` };
      }

      case 'editar_servicio': {
        const patch: Record<string, unknown> = {};
        if (a.cambios.precio != null) patch.precio = a.cambios.precio;
        if (a.cambios.nombre != null) patch.nombre = a.cambios.nombre;
        if (a.cambios.duracion_activa_min != null) patch.duracion_activa_min = a.cambios.duracion_activa_min;
        if (a.cambios.activo != null) patch.activo = a.cambios.activo;
        if (a.cambios.prepago_requerido != null) patch.prepago_requerido = a.cambios.prepago_requerido;
        if (a.cambios.prepago_cantidad_fija != null) patch.prepago_cantidad_fija = a.cambios.prepago_cantidad_fija;
        if (Object.keys(patch).length === 0) return { ok: false, error: 'No hay cambios que aplicar al servicio.' };

        const { error } = await supabase
          .from('servicios')
          .update(patch)
          .eq('id', a.servicio_id)
          .eq('negocio_id', a.negocio_id);
        if (error) return { ok: false, error: error.message };

        // Registrar accion reversible (editar → restaurar campos previos)
        const accionId = await registrarAccionChispa(
          a.negocio_id,
          userId,
          'editar_servicio',
          estadoPrevio,
          true, // reversible
          a.servicio_id, // target_id = servicio_id
          targetLabel,
        );
        return { ok: true, mensaje: `Servicio actualizado: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'crear_servicio': {
        const { data, error } = await supabase.from('servicios').insert({
          negocio_id: a.negocio_id,
          nombre: a.nombre,
          precio: a.precio,
          duracion_activa_min: a.duracion_activa_min,
          activo: true,
        })
        .select('id')
        .single();
        if (error) return { ok: false, error: error.message };
        if (data?.id) {
          // Registrar accion reversible (crear → borrar)
          const accionId = await registrarAccionChispa(
            a.negocio_id,
            userId,
            'crear_servicio',
            estadoPrevio,
            true, // reversible
            data.id as string, // target_id = servicio_id
            targetLabel,
          );
          return { ok: true, mensaje: `Servicio creado: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
        }
        return { ok: true, mensaje: `Servicio creado: ${a.resumen}` };
      }

      case 'editar_horario': {
        // Reemplaza el/los turno(s) de ese profesional ese dia por un unico turno.
        // Borrado + insercion (no transaccional en el cliente; si el insert fallara
        // se devuelve el error y el usuario reintenta).
        const { error: eDel } = await supabase
          .from('horarios_profesional')
          .delete()
          .eq('profesional_id', a.profesional_id)
          .eq('dia_semana', a.dia_semana);
        if (eDel) return { ok: false, error: eDel.message };

        const { error: eIns } = await supabase
          .from('horarios_profesional')
          .insert({
            profesional_id: a.profesional_id,
            dia_semana: a.dia_semana,
            hora_inicio: a.hora_inicio,
            hora_fin: a.hora_fin,
            turno: 0,
          });
        if (eIns) return { ok: false, error: eIns.message };

        // Registrar accion reversible (editar → restaurar turnos previos)
        const accionId = await registrarAccionChispa(
          a.negocio_id,
          userId,
          'editar_horario',
          estadoPrevio,
          true, // reversible
          a.profesional_id, // target_id = profesional_id (no es un ID de turno, pero suficiente para identificar)
          targetLabel,
        );
        return { ok: true, mensaje: `Horario actualizado: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'bulk_editar_horarios': {
        const profs = a.profesionales;
        if (!profs || profs.length === 0) return { ok: false, error: 'No hay profesionales a los que cambiar el horario.' };

        for (const p of profs) {
          const { error: eDel } = await supabase
            .from('horarios_profesional')
            .delete()
            .eq('profesional_id', p.id)
            .eq('dia_semana', a.dia_semana);
          if (eDel) return { ok: false, error: `Error al limpiar horario previo de ${p.nombre}: ${eDel.message}` };

          const { error: eIns } = await supabase
            .from('horarios_profesional')
            .insert({
              profesional_id: p.id,
              dia_semana: a.dia_semana,
              hora_inicio: a.hora_inicio,
              hora_fin: a.hora_fin,
              turno: 0,
            });
          if (eIns) return { ok: false, error: `Error al guardar nuevo horario de ${p.nombre}: ${eIns.message}` };
        }

        return { ok: true, mensaje: `Horarios establecidos correctamente para ${profs.length} profesionales.` };
      }

      case 'bulk_editar_comisiones': {
        const profs = a.profesionales;
        if (!profs || profs.length === 0) return { ok: false, error: 'No hay profesionales a los que cambiar la comision.' };

        for (const p of profs) {
          const { error } = await supabase
            .from('profesionales')
            .update({ comision_pct: a.comision_pct })
            .eq('id', p.id)
            .eq('negocio_id', a.negocio_id);
          if (error) return { ok: false, error: `Error al actualizar comision de ${p.nombre}: ${error.message}` };
        }

        return { ok: true, mensaje: `Comisiones base actualizadas al ${a.comision_pct}% para ${profs.length} profesionales.` };
      }

      case 'crear_presupuesto': {
        const hayNegativos = a.lineas.some((l) => l.precio_cents < 0 || l.cantidad < 0);
        if (hayNegativos || a.total_cents < 0) {
          return { ok: false, error: 'No se permiten precios o cantidades negativas.' };
        }
        // Reutiliza el backend de Presupuestos (RLS + numeracion + total).
        const p = await guardarPresupuesto({
          negocioId: a.negocio_id,
          estado: 'borrador',
          clienteId: a.cliente_id,
          contactoNombre: a.cliente_nombre,
          titulo: a.titulo,
          lineas: a.lineas.map((l, i) => ({
            nombre: l.nombre,
            precio_cents: l.precio_cents,
            cantidad: l.cantidad,
            orden: i,
          })),
        });
        if (p.id) {
          // Registrar accion reversible (crear → cancelar)
          const accionId = await registrarAccionChispa(
            a.negocio_id,
            userId,
            'crear_presupuesto',
            estadoPrevio,
            true, // reversible
            p.id, // target_id = presupuesto_id
            targetLabel,
          );
          return { ok: true, mensaje: `Presupuesto creado (borrador${p.numero ? ` nº ${p.numero}` : ''}): ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
        }
        return { ok: true, mensaje: `Presupuesto creado (borrador${p.numero ? ` nº ${p.numero}` : ''}): ${a.resumen}` };
      }

      case 'enviar_mensaje_bandeja': {
        // STUB de envio: se GUARDA el borrador como mensaje del salon en el hilo de
        // la Bandeja (registro real), pero NO se dispara ningun envio de WhatsApp
        // ni correo: la mensajeria real saliente es de Alexandro (motor n8n).
        const { error } = await supabase
          .from('mensajes_conversacion')
          .insert({
            conversacion_id: a.conversacion_id,
            autor: 'salon',
            tipo: 'mensaje',
            cuerpo: a.cuerpo,
          });
        if (error) return { ok: false, error: error.message };
        return {
          ok: true,
          mensaje: `Mensaje guardado en la Bandeja${a.contacto_nombre ? ` para ${a.contacto_nombre}` : ''}. El envio por WhatsApp lo gestiona el equipo.`,
        };
      }

      case 'recuperar_cliente': {
        // Registra el borrador de "propuesta de vuelta" via RPC security definer
        // (RLS de fuga_clientas_avisos no permite INSERT directo). El motor de
        // Alexandro recoge el registro 'pendiente' y hace el envio real. La RPC es
        // idempotente (si ya hay un aviso pendiente para la clienta, lo reutiliza).
        const { data, error } = await supabase.rpc('registrar_aviso_fuga', {
          p_cliente_id: a.cliente_id,
        });
        if (error) return { ok: false, error: error.message };
        const res = (data ?? {}) as { ok?: boolean; error?: string; ya_existia?: boolean };
        if (!res.ok) return { ok: false, error: res.error ?? 'No se pudo registrar la propuesta de vuelta.' };
        return {
          ok: true,
          mensaje: res.ya_existia
            ? `Ya habia una propuesta de vuelta pendiente para ${a.cliente_nombre ?? 'la clienta'}. El equipo la gestiona.`
            : `Propuesta de vuelta registrada para ${a.cliente_nombre ?? 'la clienta'}. El envio lo gestiona el equipo.`,
        };
      }

      case 'optimizar_agenda': {
        // Ejecutar los movimientos (boton "Organizar mi agenda" o Modo Tetris
        // del chatbot). Mueve las 4 marcas juntas cuando se dan (regla dura de
        // fases activa/reposo); si el chatbot solo da inicio/fin, se mantiene
        // el comportamiento previo (fin_activa = fin) para no romper ese camino.
        let exito = 0;
        for (const mov of a.movimientos) {
          const { data: prev } = await supabase.from('citas').select('inicio').eq('id', mov.cita_id).maybeSingle();
          const patch: Record<string, string | boolean> = {
            inicio: mov.nuevo_inicio,
            fin: mov.nuevo_fin,
            fin_activa: mov.nuevo_fin_activa ?? mov.nuevo_fin,
            confirmacion_enviada: false, // para que n8n vuelva a avisar
          };
          if (mov.nuevo_fin_espera) patch.fin_espera = mov.nuevo_fin_espera;
          const { error } = await supabase.from('citas').update(patch).eq('id', mov.cita_id);
          if (!error) {
            exito++;
            await registrarHistorialIA(a.negocio_id, mov.cita_id, [
              { campo: 'inicio', anterior: (prev?.inicio as string) ?? null, nuevo: mov.nuevo_inicio },
            ], 'Reorganizada por Chispa');
          }
        }
        // Registrar accion reversible (optimizar → volver a marcas previas)
        const accionId = await registrarAccionChispa(
          a.negocio_id,
          userId,
          'optimizar_agenda',
          estadoPrevio,
          true, // reversible
          a.fecha, // target_id = fecha (no es un ID, pero suficiente para identificar el lote)
          targetLabel,
        );
        return { ok: true, mensaje: `Se han movido ${exito} citas correctamente. Se avisara a los clientes por WhatsApp.`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'cambiar_config': {
        // Falla #4: merge ATOMICO por clave via RPC (no read-merge-write en cliente).
        const { error } = await supabase.rpc('set_negocio_config_key', {
          p_negocio_id: a.negocio_id,
          p_clave: a.clave,
          p_valor: a.valor,
        });
        if (error) return { ok: false, error: error.message };

        // Registrar accion reversible (cambiar → restaurar valor previo)
        const accionId = await registrarAccionChispa(
          a.negocio_id,
          userId,
          'cambiar_config',
          estadoPrevio,
          true, // reversible
          a.clave, // target_id = clave de config
          targetLabel,
        );
        return { ok: true, mensaje: `Hecho: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'cambiar_config_multiple': {
        // Igual que 'cambiar_config' pero para VARIAS claves relacionadas a la
        // vez. set_negocio_config_key ya es un merge atomico por clave; aqui
        // simplemente se llama una vez por clave (no transaccional entre si,
        // igual que editar_horario: si una falla, se informa y las anteriores
        // ya aplicadas quedan aplicadas).
        for (const c of a.cambios) {
          const { error } = await supabase.rpc('set_negocio_config_key', {
            p_negocio_id: a.negocio_id,
            p_clave: c.clave,
            p_valor: c.valor,
          });
          if (error) return { ok: false, error: `${c.label}: ${error.message}` };
        }
        // Registrar accion reversible (cambiar_multiple → restaurar valores previos)
        const accionId = await registrarAccionChispa(
          a.negocio_id,
          userId,
          'cambiar_config_multiple',
          estadoPrevio,
          true, // reversible
          a.cambios[0]?.clave ?? null, // target_id = primera clave (suficiente para identificar)
          targetLabel,
        );
        return { ok: true, mensaje: `Hecho: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'cambiar_idioma_portal': {
        const { data: portal } = await supabase
          .from('negocio_portal')
          .select('negocio_id')
          .eq('negocio_id', a.negocio_id)
          .maybeSingle();
        if (!portal) {
          return { ok: false, error: 'Activa primero el portal de reserva en Configuracion -> Reserva online.' };
        }
        const { error } = await supabase
          .from('negocio_portal')
          .update({ idioma: a.idioma })
          .eq('negocio_id', a.negocio_id);
        if (error) return { ok: false, error: error.message };

        // Registrar accion reversible (cambiar → restaurar idioma previo)
        const accionId = await registrarAccionChispa(
          a.negocio_id,
          userId,
          'cambiar_idioma_portal',
          estadoPrevio,
          true, // reversible
          'idioma_portal', // target_id fijo para identificar
          targetLabel,
        );
        return { ok: true, mensaje: `Hecho: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'crear_cierre_negocio': {
        const { error } = await supabase.from('cierres_negocio').insert({
          negocio_id: a.negocio_id,
          fecha: a.fecha,
          motivo: a.motivo,
        });
        if (error) {
          if ((error as { code?: string }).code === '23505') {
            return { ok: false, error: 'Ese dia ya estaba marcado como cierre.' };
          }
          return { ok: false, error: error.message };
        }
        // Registrar accion reversible (crear → borrar)
        const accionId = await registrarAccionChispa(
          a.negocio_id,
          userId,
          'crear_cierre_negocio',
          estadoPrevio,
          true, // reversible
          a.fecha, // target_id = fecha para identificar
          targetLabel,
        );
        return { ok: true, mensaje: `Hecho: ${a.resumen}`, accion_id: accionId === '00000000-0000-0000-0000-000000000000' ? undefined : accionId };
      }

      case 'avisar_lista_espera_match': {
        // Aviso a candidata de lista de espera (Sesion 8-B): llama a la RPC
        // avisar_lista_espera_candidata que crea la cita tentativa, marca la lista
        // como avisada y encola el aviso para el motor n8n de Alexandro.
        const { data, error } = await supabase.rpc('avisar_lista_espera_candidata', {
          p_lista_espera_id: a.lista_espera_id,
          p_cita_origen_id: a.cita_origen_id,
        });
        if (error) return { ok: false, error: error.message };
        const res = (data ?? {}) as { ok?: boolean; error?: string; mensaje?: string };
        if (!res.ok) return { ok: false, error: res.error ?? 'No se pudo avisar a la candidata de lista de espera.' };
        return {
          ok: true,
          mensaje: `Aviso encolado para ${a.cliente_nombre} (${a.servicio_nombre} con ${a.profesional_nombre}). El envio por WhatsApp lo gestiona el equipo.`,
        };
      }

      default: {
        // Exhaustividad garantizada por TypeScript
        const _exhaustive: never = a;
        return { ok: false, error: `Tipo de accion desconocido: ${(_exhaustive as AccionPropuesta).tipo}` };
      }
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// --- Registro de accion (para deshacer) ---

/**
 * Registra una accion ejecutada en chispa_acciones para poder deshacerla.
 * Devuelve el ID de la accion registrada (o un ID falso en demo).
 */
async function registrarAccionChispa(
  negocioId: string,
  userId: string,
  tipoAccion: string,
  estadoPrevio: unknown,
  reversible: boolean,
  targetId: string | null,
  targetLabel: string | null,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('registrar_accion_chispa', {
      p_negocio_id: negocioId,
      p_usuario_id: userId,
      p_tipo_accion: tipoAccion,
      p_estado_previo: estadoPrevio,
      p_reversible: reversible,
      p_target_id: targetId,
      p_target_label: targetLabel,
    });
    if (error) throw error;
    return (data as string) ?? '00000000-0000-0000-0000-000000000000';
  } catch {
    // Si falla el registro, la accion ya se aplico; devolvemos ID falso.
    return '00000000-0000-0000-0000-000000000000';
  }
}

// --- Deshacer accion ---

/**
 * Deshace una accion previamente ejecutada por Chispa.
 * Lee la accion registrada, ejecuta la operacion inversa y marca como deshecha.
 */
export async function deshacerAccion(accionId: string, userId: string): Promise<EjecucionResultado> {
  try {
    // 1. Leer la accion registrada
    const { data: accion, error: eRead } = await supabase
      .from('chispa_acciones')
      .select('*')
      .eq('id', accionId)
      .eq('usuario_id', userId)
      .maybeSingle();
    if (eRead) return { ok: false, error: eRead.message };
    if (!accion) return { ok: false, error: 'Accion no encontrada o no pertenece al usuario.' };
    if (accion.deshecha) return { ok: false, error: 'Esta accion ya fue deshecha.' };
    if (!accion.reversible) return { ok: false, error: 'Esta accion no se puede deshacer.' };

    const previo = accion.estado_previo as Record<string, unknown>;
    const negocioId = accion.negocio_id as string;
    const targetId = accion.target_id as string | null;

    // 2. Ejecutar la operacion inversa segun tipo
    switch (accion.tipo_accion) {
      case 'crear_cita': {
        // Inversa: borrar la cita creada (target_id = cita_id)
        if (!targetId) return { ok: false, error: 'No se puede identificar la cita a borrar.' };
        const { error: eDel } = await supabase.from('citas').delete().eq('id', targetId);
        if (eDel) return { ok: false, error: eDel.message };
        // Registrar en citas_historial
        await registrarHistorialIA(negocioId, targetId, [
          { campo: 'estado', anterior: CITA_STATUS.CONFIRMADA, nuevo: null },
        ], 'Deshacer: cita borrada por Chispa');
        break;
      }

      case 'reagendar_cita': {
        // Inversa: volver a las marcas previas (inicio, fin, fin_activa, fin_espera, profesional_id)
        if (!targetId) return { ok: false, error: 'No se puede identificar la cita a restaurar.' };
        if (!previo?.inicio || !previo?.fin) {
          return { ok: false, error: 'No hay estado previo suficiente para revertir.' };
        }
        const patch: Record<string, string | boolean> = {
          inicio: previo.inicio as string,
          fin: previo.fin as string,
          fin_activa: (previo.fin_activa as string) ?? previo.fin as string,
          fin_espera: (previo.fin_espera as string) ?? previo.fin as string,
          confirmacion_enviada: false,
          recordatorio_enviado: false,
        };
        if (previo.profesional_id) {
          patch.profesional_id = previo.profesional_id as string;
        }
        const { error: eUpd } = await supabase.from('citas').update(patch).eq('id', targetId);
        if (eUpd) return { ok: false, error: eUpd.message };
        await registrarHistorialIA(negocioId, targetId, [
          { campo: 'inicio', anterior: (previo.inicio as string), nuevo: previo.inicio as string }, // truco: marcamos que se volvio al estado anterior
        ], 'Deshacer: cita reagendada restaurada por Chispa');
        break;
      }

      case 'cancelar_cita': {
        // Inversa: volver al estado previo (des-cancelar)
        if (!targetId) return { ok: false, error: 'No se puede identificar la cita a restaurar.' };
        if (!previo?.estado) return { ok: false, error: 'No hay estado previo suficiente para revertir.' };
        const { error: eUpd } = await supabase
          .from('citas')
          .update({
            estado: previo.estado as string,
            motivo_cancelacion: previo.motivo_cancelacion as string | null,
            cancelado_por: null,
          })
          .eq('id', targetId);
        if (eUpd) return { ok: false, error: eUpd.message };
        await registrarHistorialIA(negocioId, targetId, [
          { campo: 'estado', anterior: CITA_STATUS.CANCELADA, nuevo: previo.estado as string },
        ], 'Deshacer: cancelacion revertida por Chispa');
        break;
      }

      case 'bloquear_hueco': {
        // Inversa: borrar el bloqueo creado (target_id = bloqueo_id)
        if (!targetId) return { ok: false, error: 'No se puede identificar el bloqueo a eliminar.' };
        const { error: eDel } = await supabase.from('bloqueos_profesional').delete().eq('id', targetId);
        if (eDel) return { ok: false, error: eDel.message };
        break;
      }

      case 'liberar_hueco': {
        // Inversa: recrear el bloqueo liberado
        if (!previo || !previo.id) return { ok: false, error: 'No hay estado previo para recrear el bloqueo.' };
        const { error: eIns } = await supabase.from('bloqueos_profesional').insert({
          id: previo.id as string,
          profesional_id: previo.profesional_id as string,
          inicio: previo.inicio as string,
          fin: previo.fin as string,
          tipo: 'otro',
          motivo: previo.motivo as string | null,
          negocio_id: negocioId,
        });
        if (eIns) return { ok: false, error: eIns.message };
        break;
      }

      case 'cambiar_config':
      case 'cambiar_config_multiple': {
        // Inversa: restaurar valor previo
        const clave = accion.tipo_accion === 'cambiar_config'
          ? (previo as { clave?: string }).clave
          : null; // TODO: multiple necesita iterar
        if (!clave) return { ok: false, error: 'No se puede identificar la config a restaurar.' };
        const valorPrevio = (previo as { valor_actual?: unknown }).valor_actual;
        const { error: eRpc } = await supabase.rpc('set_negocio_config_key', {
          p_negocio_id: negocioId,
          p_clave: clave,
          p_valor: valorPrevio,
        });
        if (eRpc) return { ok: false, error: eRpc.message };
        break;
      }

      case 'cambiar_idioma_portal': {
        // Inversa: restaurar idioma previo
        const idiomaPrevio = (previo as { idioma_actual?: string | null }).idioma_actual;
        if (idiomaPrevio === null) return { ok: false, error: 'No hay idioma previo para restaurar.' };
        const { error: eUpd } = await supabase
          .from('negocio_portal')
          .update({ idioma: idiomaPrevio })
          .eq('negocio_id', negocioId);
        if (eUpd) return { ok: false, error: eUpd.message };
        break;
      }

      case 'editar_servicio': {
        // Inversa: restaurar campos previos
        if (!targetId) return { ok: false, error: 'No se puede identificar el servicio a restaurar.' };
        if (!previo) return { ok: false, error: 'No hay estado previo para restaurar el servicio.' };
        // Solo restauramos los campos que tiene el estado previo
        const patch: Record<string, unknown> = {};
        if (previo.precio != null) patch.precio = previo.precio;
        if (previo.nombre != null) patch.nombre = previo.nombre;
        if (previo.duracion_activa_min != null) patch.duracion_activa_min = previo.duracion_activa_min;
        if (previo.activo != null) patch.activo = previo.activo;
        if (previo.prepago_requerido != null) patch.prepago_requerido = previo.prepago_requerido;
        if (previo.prepago_cantidad_fija != null) patch.prepago_cantidad_fija = previo.prepago_cantidad_fija;
        const { error: eUpd } = await supabase
          .from('servicios')
          .update(patch)
          .eq('id', targetId)
          .eq('negocio_id', negocioId);
        if (eUpd) return { ok: false, error: eUpd.message };
        break;
      }

      case 'crear_servicio': {
        // Inversa: borrar el servicio creado (target_id = servicio_id?)
        if (!targetId) return { ok: false, error: 'No se puede identificar el servicio a borrar.' };
        const { error: eDel } = await supabase
          .from('servicios')
          .delete()
          .eq('id', targetId)
          .eq('negocio_id', negocioId);
        if (eDel) return { ok: false, error: eDel.message };
        break;
      }
      
      case 'aprobar_macro': {
        if (!targetId) return { ok: false, error: 'No se puede identificar la macro a revertir.' };
        const { error: eUpd } = await supabase
          .from('chispa_macros')
          .update({ estado: 'revision' })
          .eq('id', targetId)
          .eq('negocio_id', negocioId);
        if (eUpd) return { ok: false, error: eUpd.message };
        break;
      }

      case 'editar_horario': {
        // Inversa: restaurar turno(s) previos (borrar actual, insertar previo(s))
        if (!previo || !Array.isArray(previo)) return { ok: false, error: 'No hay turnos previos para restaurar.' };
        const profesionalId = (previo[0] as { profesional_id?: string })?.profesional_id;
        const diaSemana = (previo[0] as { dia_semana?: number })?.dia_semana;
        if (!profesionalId || diaSemana === undefined) return { ok: false, error: 'Datos previos incompletos.' };
        // Borrar turno actual
        await supabase
          .from('horarios_profesional')
          .delete()
          .eq('profesional_id', profesionalId)
          .eq('dia_semana', diaSemana);
        // Restaurar previo(s)
        for (const turno of previo as Record<string, unknown>[]) {
          await supabase.from('horarios_profesional').insert({
            profesional_id: turno.profesional_id as string,
            dia_semana: turno.dia_semana as number,
            hora_inicio: turno.hora_inicio as string,
            hora_fin: turno.hora_fin as string,
            turno: turno.turno as number,
          });
        }
        break;
      }

      case 'crear_presupuesto': {
        // Inversa: borrar el presupuesto creado (o marcar como cancelado)
        if (!targetId) return { ok: false, error: 'No se puede identificar el presupuesto a borrar.' };
        const { error: eDel } = await supabase
          .from('presupuestos')
          .update({ estado: 'cancelado' })
          .eq('id', targetId)
          .eq('negocio_id', negocioId);
        if (eDel) return { ok: false, error: eDel.message };
        break;
      }

      case 'crear_cierre_negocio': {
        // Inversa: borrar el cierre creado
        if (!targetId) return { ok: false, error: 'No se puede identificar el cierre a borrar.' };
        // target_id en este caso seria la fecha, no un ID
        const { error: eDel } = await supabase
          .from('cierres_negocio')
          .delete()
          .eq('negocio_id', negocioId)
          .eq('fecha', targetId);
        if (eDel) return { ok: false, error: eDel.message };
        break;
      }

      case 'optimizar_agenda': {
        // Inversa: volver al estado previo de cada cita movida
        if (!previo || !Array.isArray(previo)) return { ok: false, error: 'No hay estado previo para restaurar las citas.' };
        for (const cita of previo as Array<{ id: string; inicio: string; fin: string; fin_activa?: string; fin_espera?: string }>) {
          await supabase
            .from('citas')
            .update({
              inicio: cita.inicio,
              fin: cita.fin,
              fin_activa: cita.fin_activa ?? cita.fin,
              fin_espera: cita.fin_espera ?? cita.fin,
              confirmacion_enviada: false,
            })
            .eq('id', cita.id);
          await registrarHistorialIA(negocioId, cita.id, [
            { campo: 'inicio', anterior: cita.inicio, nuevo: cita.inicio },
          ], 'Deshacer: optimizacion revertida por Chispa');
        }
        break;
      }

      case 'enviar_mensaje_bandeja':
      case 'recuperar_cliente':
      case 'avisar_lista_espera_match':
        return { ok: false, error: 'Esta accion no se puede deshacer (envio real o registro externo).' };

      default:
        return { ok: false, error: `Tipo de accion desconocido: ${accion.tipo_accion}` };
    }

    // 3. Marcar como deshecha
    const { error: eMark } = await supabase
      .from('chispa_acciones')
      .update({ deshecha: true, deshecha_en: new Date().toISOString() })
      .eq('id', accionId)
      .eq('usuario_id', userId);
    if (eMark) return { ok: false, error: eMark.message };

    return { ok: true, mensaje: 'Accion deshecha correctamente.' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
