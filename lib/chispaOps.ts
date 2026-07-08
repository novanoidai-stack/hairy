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
      // Crea un servicio nuevo del catalogo (Sesion 3 V2: "actua con minima
      // info"). Complementa editar_servicio (que solo edita existentes).
      tipo: 'crear_servicio';
      negocio_id: string;
      nombre: string;
      precio: number;
      duracion_activa_min: number;
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
      movimientos: { cita_id: string; nuevo_inicio: string; nuevo_fin: string; cliente_nombre: string }[];
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
    };

export type EjecucionResultado =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

// --- Auditoria (falla #2): rastro en citas_historial, igual que el flujo manual
//     (AgendaCalendar.registrarHistorial) pero ahora sobre una tabla ya reparada.
//     Best-effort: si el registro falla, la operacion NO se revierte (la escritura
//     principal es lo que importa; el historial es una traza).
type CambioHist = { campo: string; anterior: string | null; nuevo: string | null };

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
 */
export async function ejecutarAccion(
  a: AccionPropuesta,
  userId: string,
): Promise<EjecucionResultado> {
  try {
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
        }
        return { ok: true, mensaje: `Cita creada: ${a.resumen}` };
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
        if (nid?.negocio_id) await registrarHistorialIA(nid.negocio_id as string, a.cita_id, cambios, 'Reagendada por Chispa (IA)');

        return { ok: true, mensaje: `Cita reagendada: ${a.resumen}` };
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
        }
        return { ok: true, mensaje: `Cita cancelada: ${a.resumen}` };
      }

      case 'bloquear_hueco': {
        if (new Date(a.inicio) >= new Date(a.fin)) {
          return { ok: false, error: 'El inicio no puede ser posterior al fin.' };
        }
        const { error } = await supabase.from('bloqueos_profesional').insert({
          negocio_id: a.negocio_id,
          profesional_id: a.profesional_id,
          inicio: a.inicio,
          fin: a.fin,
          tipo: 'otro',
          motivo: a.motivo,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Hueco bloqueado: ${a.resumen}` };
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
        return { ok: true, mensaje: `Servicio actualizado: ${a.resumen}` };
      }

      case 'crear_servicio': {
        const { error } = await supabase.from('servicios').insert({
          negocio_id: a.negocio_id,
          nombre: a.nombre,
          precio: a.precio,
          duracion_activa_min: a.duracion_activa_min,
          activo: true,
        });
        if (error) return { ok: false, error: error.message };
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
        return { ok: true, mensaje: `Horario actualizado: ${a.resumen}` };
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
        // Ejecutar los movimientos del tetris
        let exito = 0;
        for (const mov of a.movimientos) {
          const { error } = await supabase.from('citas').update({
            inicio: mov.nuevo_inicio,
            fin_activa: mov.nuevo_fin,
            fin: mov.nuevo_fin,
            confirmacion_enviada: false, // para que n8n vuelva a avisar
          }).eq('id', mov.cita_id);
          if (!error) exito++;
        }
        return { ok: true, mensaje: `Se han movido ${exito} citas correctamente. Se avisara a los clientes por WhatsApp.` };
      }

      case 'cambiar_config': {
        // Falla #4: merge ATOMICO por clave via RPC (no read-merge-write en cliente).
        const { error } = await supabase.rpc('set_negocio_config_key', {
          p_negocio_id: a.negocio_id,
          p_clave: a.clave,
          p_valor: a.valor,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Hecho: ${a.resumen}` };
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
        return { ok: true, mensaje: `Hecho: ${a.resumen}` };
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
        return { ok: true, mensaje: `Hecho: ${a.resumen}` };
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
        return { ok: true, mensaje: `Hecho: ${a.resumen}` };
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
