// Vigilancia de la agenda en segundo plano (informe #1, "Deteccion Omnipresente").
//
// El barrido pg_cron `procesar_hallazgos_todos` corre cada 15 min y detecta 6 cosas
// (senales sin pagar, citas sin confirmar, bandeja, presupuestos, stock, fuga), pero es
// CIEGO a la agenda: no ve retrasos, solapes, huecos muertos ni reposos desaprovechados.
// El motivo es que aquel barrido es plpgsql y el motor de agenda es TypeScript.
//
// Este edge cierra ese hueco IMPORTANDO EL MOTOR REAL (lib/organizarAgenda.ts, 57 tests).
// No reimplementa el analisis: un segundo motor divergiendo del primero contradiria el
// frente #4 del informe ("la agenda es fuente de verdad perfecta").
//
// Idempotente: _upsert_hallazgo (via upsert_hallazgo_agenda) no duplica en cada pasada.
// Nunca dispara WhatsApp: la RPC acota la severidad a 'alta' (solo 'urgente' entra en la
// cola de avisos).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  analizarAgendaDia,
  type CitaOrganizar,
  type ProblemaAgenda,
} from '../../../lib/organizarAgenda.ts';

const RESUMEN: Record<string, string> = {
  retraso: 'Retrasos en curso',
  solape: 'Citas que se solapan',
  hueco_muerto: 'Huecos muertos',
  reposo_desaprovechado: 'Tiempos muertos sin aprovechar',
};
const DETALLE: Record<string, string> = {
  retraso: 'Citas que ya deberian haber acabado y siguen abiertas',
  solape: 'Dos citas del mismo profesional pisandose',
  hueco_muerto: 'Huecos que se pueden compactar adelantando citas',
  reposo_desaprovechado: 'Reposos en los que cabria atender a otra clienta',
};
// Un solape es un error de datos (dos clientas a la vez); el resto es optimizacion.
// Nunca 'urgente': eso mandaria un WhatsApp cada 15 min.
const SEVERIDAD: Record<string, string> = {
  solape: 'alta',
  retraso: 'alta',
  hueco_muerto: 'baja',
  reposo_desaprovechado: 'baja',
};

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) {
      return new Response(
        JSON.stringify({ error: 'faltan secrets', url: !!url, serviceKey: !!serviceKey }),
        { status: 500 },
      );
    }
    const supabase = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const soloNegocio: string | null = body?.negocio_id ?? null;
    const ahoraMs: number = body?.ahora_ms ?? Date.now();

    // Negocios a vigilar: los que tienen horarios configurados (= dados de alta de verdad).
    // La demo compartida nunca (sus datos son de escaparate).
    let negocios: string[];
    if (soloNegocio) {
      negocios = [soloNegocio];
    } else {
      const { data } = await supabase.from('negocio_horarios').select('negocio_id');
      negocios = [...new Set((data ?? []).map((r: { negocio_id: string }) => r.negocio_id))];
    }
    negocios = negocios.filter((n) => n !== 'demo_salon_001');

    const salida: Record<string, unknown>[] = [];

    for (const negocioId of negocios) {
      const hoy = new Date(ahoraMs);
      const desde = new Date(hoy); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 1);

      const [citasRes, profsRes, srvRes, bloqRes, horRes, cfgRes] = await Promise.all([
        supabase.from('citas')
          .select('id, profesional_id, cliente_id, servicio_id, estado, inicio, fin, fin_activa, fin_espera, grupo_id')
          .eq('negocio_id', negocioId)
          .in('estado', ['pendiente', 'confirmada'])
          .gte('inicio', desde.toISOString())
          .lt('inicio', hasta.toISOString()),
        supabase.from('profesionales').select('id, nombre, categoria, activo').eq('negocio_id', negocioId),
        supabase.from('servicios').select('id, nombre, categoria_minima, duracion_minima_min').eq('negocio_id', negocioId),
        supabase.from('bloqueos_profesional').select('profesional_id, inicio, fin').eq('negocio_id', negocioId),
        supabase.from('negocio_horarios').select('dia_semana, abierto, apertura, cierre').eq('negocio_id', negocioId),
        supabase.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle(),
      ]);

      // Fallos ruidosos: sin esto, un error de permisos se veria como "0 citas" y la
      // vigilancia diria que todo va bien mientras esta ciega.
      const errores = [citasRes.error, profsRes.error, srvRes.error, bloqRes.error, horRes.error]
        .filter(Boolean)
        .map((e) => e!.message);
      if (errores.length > 0) {
        return new Response(JSON.stringify({ error: 'consulta fallida', negocioId, errores }), { status: 500 });
      }

      const citas = citasRes.data ?? [];
      if (citas.length === 0) { salida.push({ negocioId, citas: 0, hallazgos: 0 }); continue; }

      // Solo con el salon abierto: analizar la agenda a las 4:00 no aporta nada.
      const horarios = horRes.data ?? [];
      const dia = (hoy.getDay() + 6) % 7; // OJO: dia_semana es 0=LUNES, getDay() es 0=domingo
      const fila = horarios.find((h: { dia_semana: number }) => h.dia_semana === dia);
      if (fila && !fila.abierto) { salida.push({ negocioId, cerrado: true }); continue; }

      const srvMap = new Map(
        (srvRes.data ?? []).map(
          (s: { id: string; nombre: string; categoria_minima: string | null; duracion_minima_min: number | null }) => [s.id, s],
        ),
      );
      const citasOrg: CitaOrganizar[] = citas.map((c: Record<string, unknown>) => {
        const srv = c.servicio_id ? srvMap.get(c.servicio_id as string) : undefined;
        return {
          id: c.id as string,
          profesional_id: c.profesional_id as string,
          estado: c.estado as string,
          inicio: c.inicio as string,
          fin: c.fin as string,
          fin_activa: (c.fin_activa as string) ?? null,
          fin_espera: (c.fin_espera as string) ?? null,
          grupoId: (c.grupo_id as string) ?? null,
          cliente: null,   // la vigilancia no necesita nombres: solo cuenta y enlaza
          telefono: null,  // sin telefono no se generan avisos a clientas desde aqui
          servicio: srv?.nombre ?? null,
          categoriaMinima: srv?.categoria_minima ?? null,
          duracionMinimaMin: srv?.duracion_minima_min ?? null,
        };
      });

      const cfg = (cfgRes.data?.config ?? {}) as Record<string, number | undefined>;
      const problemas: ProblemaAgenda[] = analizarAgendaDia(
        citasOrg,
        (profsRes.data ?? []) as { id: string; nombre: string; categoria?: string | null; activo?: boolean }[],
        {
          ahoraMs,
          bloqueos: bloqRes.data ?? [],
          horarios,
          maxAdelantoMin: cfg.agendaMaxAdelantoMin,
          umbralHuecoMin: cfg.agendaUmbralHuecoMin,
        },
      );

      // Un hallazgo AGREGADO por tipo, no uno por profesional: el organizador razona por
      // profesional, pero al salon le interesa "hay 3 solapes hoy", no tres avisos sueltos.
      const porTipo = new Map<string, ProblemaAgenda[]>();
      for (const p of problemas) {
        porTipo.set(p.tipo, [...(porTipo.get(p.tipo) ?? []), p]);
      }

      let nuevos = 0;
      for (const tipo of Object.keys(RESUMEN)) {
        const items = porTipo.get(tipo) ?? [];
        const { data, error } = await supabase.rpc('upsert_hallazgo_agenda', {
          p_negocio: negocioId,
          p_tipo: tipo,
          p_severidad: SEVERIDAD[tipo],
          p_resumen: RESUMEN[tipo],
          p_detalle: DETALLE[tipo],
          p_count: items.length,
          p_items: items.slice(0, 50).map((p) => ({
            profesional: p.profesionalNombre,
            titulo: p.titulo,
            descripcion: p.descripcion,
            cita_ids: p.citaIds,
          })),
        });
        if (error) return new Response(JSON.stringify({ error: error.message, negocioId, tipo }), { status: 500 });
        nuevos += (data as number) ?? 0;
      }
      salida.push({ negocioId, citas: citas.length, problemas: problemas.length, hallazgosNuevos: nuevos });
    }

    return new Response(JSON.stringify({ ok: true, negocios: salida }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
