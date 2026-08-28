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
//
// Importar el motor real tiene una letra pequeña (ago-2026): esas libs estan escritas
// para el NAVEGADOR, donde la hora local ya es la de Madrid. Aqui el runtime es UTC, asi
// que hay que darles el horario desplazado (ver alRelojDelSalon) o toda la geometria del
// dia sale corrida una o dos horas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  analizarAgendaDia,
  type CitaOrganizar,
  type ProblemaAgenda,
} from '../../../lib/organizarAgenda.ts';
import { horariosAlRelojDelRuntime } from '../shared/relojSalon.ts';
import { claveServicioOpcional, peticionDeServicio } from '../shared/claveServicio.ts';

const RESUMEN: Record<string, string> = {
  retraso: 'Retrasos en curso',
  solape: 'Citas que se solapan',
  hueco_muerto: 'Huecos muertos',
  reposo_desaprovechado: 'Tiempos muertos sin aprovechar',
  fuera_jornada: 'Citas fuera de jornada',
};
const DETALLE: Record<string, string> = {
  retraso: 'Citas que ya deberian haber acabado y siguen abiertas',
  solape: 'Dos citas del mismo profesional pisandose',
  hueco_muerto: 'Huecos que se pueden compactar adelantando citas',
  reposo_desaprovechado: 'Reposos en los que cabria atender a otra clienta',
  fuera_jornada: 'Citas en tramos que el profesional no trabaja, bloqueos o festivos',
};
// Un solape es un error de datos (dos clientas a la vez); el resto es optimizacion.
// Nunca 'urgente': eso mandaria un WhatsApp cada 15 min.
const SEVERIDAD: Record<string, string> = {
  solape: 'alta',
  retraso: 'alta',
  fuera_jornada: 'alta',
  hueco_muerto: 'baja',
  reposo_desaprovechado: 'baja',
};

// ─── RELOJ DEL SALON ────────────────────────────────────────────────────────
// Las libs puras de agenda materializan las horas de apertura con setHours(),
// o sea en la zona LOCAL DEL RUNTIME. En el navegador eso es Madrid y cuadra;
// aqui el runtime es UTC, asi que "abre a las 09:00" acababa siendo 09:00Z =
// 11:00 de Madrid en verano. Dos horas de desfase en jornadas, tramos, huecos y
// fuera_jornada — es decir, en TODO lo que este cron calcula. Desplazando el
// horario ANTES de dárselo a las libs, su aritmetica local acaba cayendo en la
// hora de Madrid correcta.
//
// El desfase se fija con `referencia` (el dia analizado) porque depende del
// horario de verano. Si algun dia el runtime pasa a ser Madrid, el desfase es 0
// y esto se vuelve la identidad: no hay que deshacer nada.
//
// OJO: NO se toca la ventana [desde, hasta] de citas ni el dia de la semana.
// Esos siguen en hora local del runtime a proposito, porque las libs filtran
// las citas por dia LOCAL (esMismoDiaLocal). Lo que se corrige es el horario,
// que es lo unico que venia en 'HH:MM' de Madrid sin zona. Mismo criterio que
// agenda-optimizador.
function alRelojDelSalon<T extends Record<string, unknown>>(
  filas: T[] | null | undefined,
  campos: (keyof T)[],
  referencia: Date,
): T[] {
  return horariosAlRelojDelRuntime(filas ?? [], campos, { referencia });
}

// Escribe el estado del dia en hallazgos_ia: un upsert AGREGADO por tipo con el
// conteo real (0 incluido — con count 0 la RPC auto-descarta los hallazgos
// abiertos de ese tipo). Los return tempranos de "dia sin citas" y "salon
// cerrado" se saltaban esta pasada y un hallazgo podia quedarse colgado para
// siempre si se borraba la ultima cita del dia; ahora tambien esos caminos
// pasan por aqui con el mapa vacio.
async function escribirHallazgos(
  // any deliberado: los genericos de SupabaseClient derivados de esm.sh no
  // casan entre la firma del helper y la instanciacion de abajo.
  supabase: any,
  negocioId: string,
  porTipo: Map<string, ProblemaAgenda[]>,
): Promise<number> {
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
    if (error) throw new Error(`${error.message} (${negocioId}/${tipo})`);
    nuevos += (data as number) ?? 0;
  }
  return nuevos;
}

Deno.serve(async (req) => {
  try {
    // Esta funcion NO comprobaba quien la llamaba: se apoyaba entera en el
    // `verify_jwt` de la plataforma. Al pasar a las claves nuevas hay que apagar
    // ese verificador (solo entiende JWT), asi que sin esto quedaria abierta a
    // cualquiera: recorre TODOS los negocios y escribe hallazgos.
    if (!peticionDeServicio(req)) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    }

    const url = Deno.env.get('SUPABASE_URL');
    // Opcional a proposito: esta funcion ya responde un 500 legible cuando falta
    // la clave, y eso se conserva. La version que lanza cambiaria ese error
    // claro por un stack trace.
    const serviceKey = claveServicioOpcional();
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
    // Un salon que falla NO puede llevarse por delante la pasada de los demas.
    // Antes cada error hacia `return` con un 500 desde DENTRO del bucle: el
    // primer negocio con una consulta rota dejaba sin vigilar a todos los que
    // venian detras, y encima el cron lo veia como una sola llamada fallida sin
    // decir a cuantos habia dejado ciegos.
    const fallos: Record<string, unknown>[] = [];

    for (const negocioId of negocios) {
      const hoy = new Date(ahoraMs);
      const desde = new Date(hoy); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 1);

      // NI horarios_profesional NI bloqueos_profesional llevan negocio_id (se
      // llega a ellas via profesional_id). Filtrarlas por negocio_id hacia que
      // PostgREST reventase con "column ... does not exist" y este cron llevaba
      // dias sin vigilar NADA. Ahora se resuelven en una SEGUNDA fase, cuando la
      // lista de profesionales del negocio ya existe.
      const [citasRes, profsRes, srvRes, horRes, cierresRes, cfgRes] = await Promise.all([
        supabase.from('citas')
          .select('id, profesional_id, cliente_id, servicio_id, estado, inicio, fin, fin_activa, fin_espera, grupo_id')
          .eq('negocio_id', negocioId)
          .in('estado', ['pendiente', 'confirmada'])
          .gte('inicio', desde.toISOString())
          .lt('inicio', hasta.toISOString()),
        supabase.from('profesionales').select('id, nombre, categoria, activo').eq('negocio_id', negocioId),
        supabase.from('servicios').select('id, nombre, categoria_minima, duracion_minima_min').eq('negocio_id', negocioId),
        supabase.from('negocio_horarios').select('dia_semana, abierto, apertura, cierre').eq('negocio_id', negocioId),
        // Festivos / cierre colectivo del dia analizado. Igual que en
        // agenda-optimizador: sin esto el organizador ignora la tabla y trata un
        // dia cerrado como un dia normal lleno de huecos que ofrecer.
        supabase.from('cierres_negocio').select('fecha, motivo')
          .eq('negocio_id', negocioId)
          .gte('fecha', desde.toISOString().slice(0, 10))
          .lt('fecha', hasta.toISOString().slice(0, 10)),
        supabase.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle(),
      ]);

      // Fallos ruidosos: sin esto, un error de permisos se veria como "0 citas" y la
      // vigilancia diria que todo va bien mientras esta ciega.
      const erroresFase1 = [citasRes.error, profsRes.error, srvRes.error, horRes.error, cierresRes.error]
        .filter(Boolean)
        .map((e) => e!.message);
      if (erroresFase1.length > 0) {
        fallos.push({ negocioId, fase: 1, errores: erroresFase1 });
        continue;
      }

      const profIds = ((profsRes.data ?? []) as { id: string }[]).map((p) => p.id);
      // Jornada REAL de cada profesional (turnos de mañana/tarde; el hueco de
      // en medio es la comida) y sus bloqueos. Sin la jornada la vigilancia
      // usaba la ventana del SALON para todos y marcaba huecos en horas que esa
      // persona no trabaja. Con cero profesionales no hay nada que pedir (un
      // .in() vacio es error de PostgREST, no lista vacia).
      type ResBloqueos = { data: { profesional_id: string; inicio: string; fin: string }[] | null; error: { message: string } | null };
      type ResJornadas = { data: { profesional_id: string; dia_semana: number; hora_inicio: string; hora_fin: string; turno: number }[] | null; error: { message: string } | null };
      let bloqRes: ResBloqueos = { data: [], error: null };
      let horProfRes: ResJornadas = { data: [], error: null };
      if (profIds.length > 0) {
        [bloqRes, horProfRes] = await Promise.all([
          supabase.from('bloqueos_profesional').select('profesional_id, inicio, fin').in('profesional_id', profIds),
          supabase.from('horarios_profesional').select('profesional_id, dia_semana, hora_inicio, hora_fin, turno').in('profesional_id', profIds),
        ]);
        const erroresFase2 = [bloqRes.error, horProfRes.error].filter(Boolean).map((e) => e!.message);
        if (erroresFase2.length > 0) {
          fallos.push({ negocioId, fase: 2, errores: erroresFase2 });
          continue;
        }
      }

      const citas = citasRes.data ?? [];
      // Sin citas (o salon cerrado, abajo) NO se salta la pasada de hallazgos:
      // se escribe con count 0 para que la RPC auto-descarte los que quedaran
      // abiertos de una pasada anterior (p.ej. se borro la ultima cita del dia).
      const sinCitas = citas.length === 0;

      // Solo con el salon abierto: analizar la agenda a las 4:00 no aporta nada.
      // Aqui se usan las filas CRUDAS a proposito: solo se miran dia_semana y
      // abierto, que no son horas y no hay que pasar por el reloj del salon.
      const horarios = horRes.data ?? [];
      const dia = (hoy.getDay() + 6) % 7; // OJO: dia_semana es 0=LUNES, getDay() es 0=domingo
      const fila = horarios.find((h: { dia_semana: number }) => h.dia_semana === dia);
      const cerrado = !!fila && !fila.abierto;
      if (sinCitas || cerrado) {
        try {
          const descartados = await escribirHallazgos(supabase, negocioId, new Map());
          salida.push({ negocioId, ...(sinCitas ? { citas: 0 } : { cerrado: true }), hallazgos: descartados });
        } catch (e) {
          fallos.push({ negocioId, fase: 'hallazgos', errores: [String(e)] });
        }
        continue;
      }

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
          // Horarios en el reloj del runtime (ver alRelojDelSalon arriba): TODO
          // lo que se pase a las libs puras tiene que ir desplazado, nunca crudo.
          horarios: alRelojDelSalon(horarios, ['apertura', 'cierre'], desde),
          horariosProfesional: alRelojDelSalon(horProfRes.data, ['hora_inicio', 'hora_fin'], desde),
          // Los cierres van por fecha ('YYYY-MM-DD'), no por hora: no hay nada
          // que desplazar.
          cierres: cierresRes.data ?? [],
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

      try {
        const nuevos = await escribirHallazgos(supabase, negocioId, porTipo);
        salida.push({ negocioId, citas: citas.length, problemas: problemas.length, hallazgosNuevos: nuevos });
      } catch (e) {
        fallos.push({ negocioId, fase: 'hallazgos', errores: [String(e)] });
      }
    }

    // 207 si alguno fallo: el cron y el panel tienen que poder distinguir "he
    // vigilado a todos" de "he vigilado a la mitad". Un 200 pelado en ese caso
    // seria el mismo canario mudo que ya nos ha mordido una vez.
    return new Response(
      JSON.stringify({ ok: fallos.length === 0, negocios: salida, ...(fallos.length > 0 ? { fallos } : {}) }),
      { status: fallos.length > 0 ? 207 : 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
