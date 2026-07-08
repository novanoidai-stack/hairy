// lib/onboardingAgent.ts
// Cliente del asistente de onboarding con IA: orquesta la secuencia FIJA de
// temas (el modelo solo redacta/interpreta, nunca decide el orden), llama a la
// Edge Function con timeout defensivo, y ejecuta las escrituras reales via
// supabase-js bajo el mismo RLS que ya usan Ajustes/Equipo. Si la IA falla o
// tarda, todo tiene un fallback deterministico: el asistente nunca se bloquea.

import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';

export type TemaId =
  | 'datos_negocio'
  | 'servicios'
  | 'equipo'
  | 'horario_salon'
  | 'reserva_online'
  | 'fotos_servicios'
  | 'notificaciones';

// Orden fijo: lo decide el cliente, no el modelo. horarios_profesional del
// checklist no es un tema aparte: se aplica solo al fijar horario_salon.
export const TEMA_ORDEN: TemaId[] = [
  'datos_negocio', 'servicios', 'equipo', 'horario_salon', 'reserva_online', 'fotos_servicios', 'notificaciones',
];

export const TEMA_TITULO_SECCION: Record<TemaId, string> = {
  datos_negocio: 'Los datos de tu negocio',
  servicios: 'Tus servicios',
  equipo: 'Tu equipo',
  horario_salon: 'El horario del salon',
  reserva_online: 'La reserva online',
  fotos_servicios: 'Fotos de tus servicios',
  notificaciones: 'Recordatorios por WhatsApp',
};

// Pregunta de reserva por si la IA no responde a tiempo (funciona SIEMPRE).
// reserva_online/notificaciones son 'botones': un si/no no necesita IA para
// interpretarse, asi que ni siquiera se llama al modelo para esos dos temas.
export const TEMA_FALLBACK: Record<TemaId, { titulo: string; placeholder_ejemplo?: string; modoInput: 'texto' | 'foto' | 'botones' }> = {
  datos_negocio: { titulo: 'Cuentanos el nombre, direccion y telefono de tu negocio', placeholder_ejemplo: 'p. ej. "Salon Ana, Calle Mayor 12, 600111222"', modoInput: 'texto' },
  servicios: { titulo: 'Que servicio ofreces primero?', placeholder_ejemplo: 'p. ej. "Corte de caballero, 15 euros, 30 min"', modoInput: 'texto' },
  equipo: { titulo: 'Quien es el primer profesional de tu equipo?', placeholder_ejemplo: 'p. ej. "Marta, oficial, marta@email.com"', modoInput: 'texto' },
  horario_salon: { titulo: 'Que dias y horas abre tu salon?', placeholder_ejemplo: 'p. ej. "Lunes a viernes de 9 a 20, sabado de 9 a 14, domingo cerrado"', modoInput: 'texto' },
  reserva_online: { titulo: 'Activamos ya la reserva online publica?', modoInput: 'botones' },
  fotos_servicios: { titulo: 'Sube una foto de alguno de tus servicios', modoInput: 'foto' },
  notificaciones: { titulo: 'Activamos los recordatorios automaticos por WhatsApp?', modoInput: 'botones' },
};

// Donde configurarlo despues si se salta el paso. Se muestra SIEMPRE junto al
// boton "Saltar este paso" (no solo tras pulsarlo) — criterio de aceptacion 5
// del spec. Mismos destinos que ya usa el checklist manual (lib/onboarding.ts).
export const TEMA_DESTINO_MANUAL: Record<TemaId, string> = {
  datos_negocio: 'Mas tarde en: Ajustes -> General',
  servicios: 'Mas tarde en: Ajustes -> Servicios',
  equipo: 'Mas tarde en: Equipo',
  horario_salon: 'Mas tarde en: Ajustes -> Horarios',
  reserva_online: 'Mas tarde en: Ajustes -> Reserva online',
  fotos_servicios: 'Mas tarde en: Ajustes -> Servicios',
  notificaciones: 'Mas tarde en: Ajustes -> Notificaciones',
};

// Atajos deterministicos (SIN IA) para horario_salon: visibles siempre junto
// al campo de texto libre, no solo como fallback de fallo.
export const HORARIO_PRESETS: { label: string; dias: { dia_semana: number; abierto: boolean; apertura?: string; cierre?: string }[] }[] = [
  {
    label: 'Lunes a viernes 9-20, sabado 9-14',
    dias: [
      { dia_semana: 0, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 1, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 2, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 3, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 4, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 5, abierto: true, apertura: '09:00', cierre: '14:00' },
      { dia_semana: 6, abierto: false },
    ],
  },
  {
    label: 'Martes a sabado 10-20',
    dias: [
      { dia_semana: 0, abierto: false },
      { dia_semana: 1, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 2, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 3, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 4, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 5, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 6, abierto: false },
    ],
  },
];

// Formulario minimo determinista al que cae el fotograma de pregunta si
// interpretarRespuesta devuelve null (fallo/timeout) en un tema de texto
// libre. Requisito de robustez del spec (seccion 6): "cae a un input simple
// y predecible (nombre/precio/duracion en campos normales)". Solo se define
// para los temas cuya interpretacion puede fallar; horario_salon usa los
// presets de arriba en su lugar, y los 'botones' no llaman nunca a la IA.
export const TEMA_CAMPOS_SIMPLES: Partial<Record<TemaId, { key: string; label: string; tipo: 'texto' | 'numero' }[]>> = {
  datos_negocio: [
    { key: 'nombre', label: 'Nombre del negocio', tipo: 'texto' },
    { key: 'direccion', label: 'Direccion', tipo: 'texto' },
    { key: 'telefono', label: 'Telefono', tipo: 'texto' },
  ],
  servicios: [
    { key: 'nombre', label: 'Nombre del servicio', tipo: 'texto' },
    { key: 'precio', label: 'Precio (EUR)', tipo: 'numero' },
    { key: 'duracion_min', label: 'Duracion (min)', tipo: 'numero' },
  ],
  equipo: [
    { key: 'nombre', label: 'Nombre del profesional', tipo: 'texto' },
  ],
};

export interface ResultadoAccion {
  ok: boolean;
  resumen: string;
}

function slugifyNombreImpl(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
export const slugifyNombre = slugifyNombreImpl;

// Carrera contra un timeout: nunca deja al asistente colgado si OpenRouter
// tarda o falla (requisito de robustez del spec, seccion 6).
async function conTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.then((v) => v),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]).catch(() => null);
}

export interface PerfilAgente {
  codigoPostal?: string;
  nombreNegocio?: string;
}

export async function pedirPregunta(
  tema: TemaId,
  estado: Record<TemaId, boolean>,
  perfil: PerfilAgente,
): Promise<{ titulo: string; subtitulo?: string; placeholder_ejemplo?: string }> {
  const fallback = TEMA_FALLBACK[tema];
  if (tema === 'fotos_servicios') return fallback; // no hace falta la IA para este tema
  const call = supabase.functions.invoke('onboarding-agent', {
    body: { modo: 'enriquecer_pregunta', tema, estado, perfil },
  }).then(({ data, error }) => {
    if (error || !data?.pregunta?.titulo) return null;
    return data.pregunta as { titulo: string; subtitulo?: string; placeholder_ejemplo?: string };
  });
  const result = await conTimeout(call, 6000);
  return result ?? fallback;
}

export async function interpretarRespuesta(
  tema: TemaId,
  texto: string,
  estado: Record<TemaId, boolean>,
  perfil: PerfilAgente,
): Promise<{ tipo: string; args: Record<string, any> } | null> {
  const call = supabase.functions.invoke('onboarding-agent', {
    body: { modo: 'interpretar_respuesta', tema, texto, estado, perfil },
  }).then(({ data, error }) => {
    if (error || !data?.accion?.tipo) return null;
    return data.accion as { tipo: string; args: Record<string, any> };
  });
  return conTimeout(call, 6000);
}

export interface ContextoEjecucion {
  negocioId: string;
  profesionalesCreados: { id: string; nombre: string }[];
  serviciosCreados: string[];
  datosNegocioSesion?: { nombre: string; direccion: string; telefono: string };
}

export async function ejecutarAccion(
  tipo: string,
  args: Record<string, any>,
  ctx: ContextoEjecucion,
): Promise<ResultadoAccion> {
  try {
    switch (tipo) {
      case 'completar_datos_negocio': {
        const nombre = String(args.nombre ?? '').trim();
        const direccion = String(args.direccion ?? '').trim();
        const telefono = String(args.telefono ?? '').trim();
        if (!nombre || !direccion || !telefono) return { ok: false, resumen: 'Falta nombre, direccion o telefono.' };
        const { data: cfgRow } = await supabase.from('negocio_config').select('config').eq('negocio_id', ctx.negocioId).maybeSingle();
        const config = { ...(cfgRow?.config ?? {}), nombre, direccion, telefono };
        const { error } = await supabase.from('negocio_config').upsert(
          { negocio_id: ctx.negocioId, config, updated_at: new Date().toISOString() },
          { onConflict: 'negocio_id' },
        );
        if (error) throw error;
        return { ok: true, resumen: `${nombre} · ${direccion} · ${telefono}` };
      }

      case 'crear_servicio': {
        const nombre = String(args.nombre ?? '').trim();
        const precio = Number(args.precio);
        const duracion_min = Number(args.duracion_min);
        if (!nombre || !(precio > 0) || !(duracion_min > 0)) {
          return { ok: false, resumen: 'Necesito nombre, precio y duracion validos.' };
        }
        const { error } = await supabase.from('servicios').insert({
          negocio_id: ctx.negocioId,
          nombre,
          precio,
          duracion_activa_min: duracion_min,
          activo: true,
        });
        if (error) throw error;
        return { ok: true, resumen: `${nombre} · ${precio.toFixed(2)} € · ${duracion_min} min` };
      }

      case 'crear_servicios': {
        // Borrar servicios creados previamente en esta sesión para permitir edición limpia
        if (ctx.serviciosCreados && ctx.serviciosCreados.length > 0) {
          await supabase.from('servicios').delete().in('id', ctx.serviciosCreados);
          ctx.serviciosCreados = [];
        }
        const servicios = Array.isArray(args.servicios) ? args.servicios : [];
        if (servicios.length === 0) return { ok: false, resumen: 'No he encontrado ningún servicio válido.' };
        let creados = [];
        for (const s of servicios) {
          const nombre = String(s.nombre ?? '').trim();
          const precio = Number(s.precio);
          const duracion_min = Number(s.duracion_min);
          if (nombre && precio > 0 && duracion_min > 0) {
            const { data: inserted, error } = await supabase.from('servicios').insert({
              negocio_id: ctx.negocioId,
              nombre,
              precio,
              duracion_activa_min: duracion_min,
              activo: true,
            }).select('id').single();
            if (error) throw error;
            if (inserted) {
              if (!ctx.serviciosCreados) ctx.serviciosCreados = [];
              ctx.serviciosCreados.push(inserted.id);
            }
            creados.push(`${nombre} (${precio.toFixed(2)} €)`);
          }
        }
        if (creados.length === 0) return { ok: false, resumen: 'No se pudo crear ningún servicio.' };
        return { ok: true, resumen: `Servicios creados: ${creados.join(', ')}` };
      }

      case 'crear_profesional': {
        const nombre = String(args.nombre ?? '').trim();
        const categoriasValidas = ['auxiliar', 'oficial', 'oficial_mayor', 'estilista_senior', 'direccion'];
        const categoria = categoriasValidas.includes(args.categoria) ? args.categoria : 'oficial';
        if (!nombre) return { ok: false, resumen: 'Necesito el nombre del profesional.' };
        const { data: inserted, error } = await supabase.from('profesionales').insert({
          negocio_id: ctx.negocioId,
          nombre,
          categoria,
          color: '#f4501e',
          activo: true,
        }).select('id').single();
        if (error) throw error;
        ctx.profesionalesCreados.push({ id: inserted.id, nombre });
        return { ok: true, resumen: `${nombre} · ${categoria.replace('_', ' ')}` };
      }

      case 'crear_profesionales': {
        // Borrar profesionales creados previamente en esta sesión para permitir edición limpia
        if (ctx.profesionalesCreados && ctx.profesionalesCreados.length > 0) {
          const ids = ctx.profesionalesCreados.map(p => p.id);
          await supabase.from('profesionales').delete().in('id', ids);
          ctx.profesionalesCreados = [];
        }
        const profesionales = Array.isArray(args.profesionales) ? args.profesionales : [];
        if (profesionales.length === 0) return { ok: false, resumen: 'No he encontrado profesionales en la respuesta.' };
        let creados = [];
        const categoriasValidas = ['auxiliar', 'oficial', 'oficial_mayor', 'estilista_senior', 'direccion'];
        for (const p of profesionales) {
          const nombre = String(p.nombre ?? '').trim();
          const categoria = categoriasValidas.includes(p.categoria) ? p.categoria : 'oficial';
          if (!nombre) continue;
          const { data: inserted, error } = await supabase.from('profesionales').insert({
            negocio_id: ctx.negocioId,
            nombre,
            categoria,
            color: '#f4501e',
            activo: true,
          }).select('id').single();
          if (error) throw error;
          ctx.profesionalesCreados.push({ id: inserted.id, nombre });
          creados.push(nombre);
        }
        if (creados.length === 0) return { ok: false, resumen: 'No se pudo dar de alta a ningún profesional.' };
        return { ok: true, resumen: `Profesionales creados: ${creados.join(', ')}` };
      }

      // Invitar por email es la parte RIESGOSA de crear_profesional: la UI la
      // ejecuta como una segunda accion aparte, solo tras confirmacion
      // explicita, reutilizando la Edge Function ya existente crear-acceso-empleado.
      case 'invitar_profesional_email': {
        const email = String(args.email ?? '').trim().toLowerCase();
        const nombre = String(args.profesional_nombre ?? '').trim();
        const profesionalId = String(args.profesional_id ?? '');
        if (!email || !nombre) return { ok: false, resumen: 'Falta email o nombre para invitar.' };
        const { data, error } = await supabase.functions.invoke('crear-acceso-empleado', {
          body: { email, nombre, rol: 'employee' },
        });
        if (error || (data && (data as any).error)) {
          const code = (data && (data as any).error) || 'error';
          return { ok: false, resumen: code === 'email_exists' ? 'Ya existe una cuenta con ese email.' : 'No se pudo invitar por email.' };
        }
        const userId = (data as any).user_id as string | undefined;
        if (userId && profesionalId) {
          await supabase.from('profesionales').update({ profile_id: userId, email }).eq('id', profesionalId);
        }
        return { ok: true, resumen: `Invitacion enviada a ${email}` };
      }

      case 'fijar_horario_salon': {
        const dias = Array.isArray(args.dias) ? args.dias : [];
        if (dias.length !== 7) return { ok: false, resumen: 'No he entendido el horario completo de la semana.' };
        const rows = dias.map((d: any) => ({
          negocio_id: ctx.negocioId,
          dia_semana: Number(d.dia_semana),
          abierto: !!d.abierto,
          apertura: d.abierto ? (d.apertura || null) : null,
          cierre: d.abierto ? (d.cierre || null) : null,
          pausa_inicio: null,
          pausa_fin: null,
        }));
        const { error } = await supabase.from('negocio_horarios').upsert(rows, { onConflict: 'negocio_id,dia_semana' });
        if (error) throw error;
        // Aplica el mismo horario a cada profesional creado en ESTA sesion
        const abiertos = rows.filter((r) => r.abierto && r.apertura && r.cierre);
        if (ctx.profesionalesCreados.length > 0 && abiertos.length > 0) {
          const horarioRows = ctx.profesionalesCreados.flatMap((p) =>
            abiertos.map((d) => ({ profesional_id: p.id, dia_semana: d.dia_semana, turno: 1, hora_inicio: d.apertura, hora_fin: d.cierre })),
          );
          // Borrar horarios de profesionales previos de esta sesión para soportar edición
          const profIds = ctx.profesionalesCreados.map(p => p.id);
          await supabase.from('horarios_profesional').delete().in('profesional_id', profIds);
          await supabase.from('horarios_profesional').insert(horarioRows);
        }
        
        // Crear un resumen descriptivo del horario guardado
        const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const soloAbiertos = rows.filter(r => r.abierto);
        if (soloAbiertos.length === 0) return { ok: true, resumen: 'Horario: Cerrado todos los días' };
        
        // Formato agrupado corto
        const resumenAbiertos = soloAbiertos.map(r => {
          const diaCorto = nombresDias[r.dia_semana].slice(0, 3);
          return `${diaCorto} (${r.apertura}-${r.cierre})`;
        }).join(', ');
        return { ok: true, resumen: `Horario establecido: ${resumenAbiertos}` };
      }

      case 'activar_reserva_online': {
        if (args.activar !== true) return { ok: true, resumen: 'Reserva online sin activar por ahora.' };
        const datos = ctx.datosNegocioSesion;
        if (!datos) {
          const { data: cfgRow } = await supabase.from('negocio_config').select('config').eq('negocio_id', ctx.negocioId).maybeSingle();
          const cfg = (cfgRow?.config ?? {}) as any;
          if (!cfg.nombre) return { ok: false, resumen: 'Completa antes los datos del negocio.' };
          ctx.datosNegocioSesion = { nombre: cfg.nombre, direccion: cfg.direccion ?? '', telefono: cfg.telefono ?? '' };
        }
        const d = ctx.datosNegocioSesion!;
        const slug = slugifyNombre(d.nombre);
        // Quitar la columna captcha_activo que no existe en negocio_portal!
        const { error } = await supabase.from('negocio_portal').upsert({
          negocio_id: ctx.negocioId,
          slug,
          nombre_publico: d.nombre,
          direccion: d.direccion || null,
          telefono: d.telefono || null,
          portal_activo: true,
          idioma: 'es',
          mostrar_precios: 'catalogo',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'negocio_id' });
        if (error) throw error;

        // Fusión segura de config para no borrar datos del negocio!
        const { data: cfgRow } = await supabase.from('negocio_config').select('config').eq('negocio_id', ctx.negocioId).maybeSingle();
        const config = { ...(cfgRow?.config ?? {}), reserva_online_activa: true };
        const { error: cfgErr } = await supabase.from('negocio_config').upsert(
          { negocio_id: ctx.negocioId, config, updated_at: new Date().toISOString() },
          { onConflict: 'negocio_id' },
        );
        if (cfgErr) throw cfgErr;

        return { ok: true, resumen: `Reserva online activada: /r/${slug}` };
      }

      case 'activar_notificaciones': {
        if (args.activar !== true) return { ok: true, resumen: 'Recordatorios sin activar por ahora.' };
        const { data: cfgRow } = await supabase.from('negocio_config').select('config').eq('negocio_id', ctx.negocioId).maybeSingle();
        const config = { ...(cfgRow?.config ?? {}), notifRecordatorioActiva: true };
        const { error } = await supabase.from('negocio_config').upsert(
          { negocio_id: ctx.negocioId, config, updated_at: new Date().toISOString() },
          { onConflict: 'negocio_id' },
        );
        if (error) throw error;
        return { ok: true, resumen: 'Recordatorios por WhatsApp activados' };
      }

      default:
        return { ok: false, resumen: `Accion desconocida: ${tipo}` };
    }
  } catch (e) {
    return { ok: false, resumen: mensajeDeError(e, 'No se pudo guardar.') };
  }
}
