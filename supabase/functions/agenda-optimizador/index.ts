// Agenda Optimizador (Fase 4 del organizador, ago-2026).
//
// Capa de IA REAL sobre el organizador: el motor determinista
// (lib/organizarAgenda.ts + lib/organizador/motorPropuestas.ts) ya detecta
// retrasos/solapes/huecos y evalua miles de movimientos puntuales. Lo que NO
// puede ver son los PATRONES: huecos que se repiten cada semana, un profesional
// sobrecargado frente a otro vacio, servicios que sistemáticamente dejan
// minutos muertos, minutos perdidos acumulados en la semana...
//
// Esta funcion monta el contexto (citas + horarios + salida del motor) y le
// pide a un LLM de OpenRouter un ANALISIS (nunca escrituras): devuelve
// recomendaciones strategicas en JSON tipado. El panel "Organizar mi agenda"
// las pinta en la seccion "Análisis de Chispa".
//
// Modelo: perfil 'calidad' => google/gemini-3.7-flash primero (0.375/1.875 USD
// por 1M; un analisis de dia/semana son ~3-8k tokens => <$0.001) con cascada
// de fallback (qwen3.7-flash, gpt-4.1-mini...). La calidad de razonamiento
// importa aqui mucho mas que el ahorro de centesimas.
//
// Auth: JWT del usuario + perfil con negocio. Solo owner/admin/recepcion (ve
// toda la agenda del salon). Auditoria en chispa_auditoria como el resto.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { llamarIAJson } from '../shared/openrouterClient.ts';
import { auditar, auditarFallo } from '../shared/chispa-auditoria.ts';
import { comprobarCupo } from '../shared/cupo.ts';
import {
  analizarAgendaRango,
  prepararCitas,
  UMBRAL_RETRASO_MIN,
  MAX_RETRASO_MIN,
  PESO_TIPO,
  type ProblemaAgenda,
} from '../../../lib/organizarAgenda.ts';
import {
  PENAL_CAMBIO_DIA,
  PENAL_CAMBIO_TRABAJADOR,
  PENAL_RETRASO,
  BONUS_REPOSO,
} from '../../../lib/organizador/motorPropuestas.ts';
import {
  validarPlanes,
  huecosLibresProfesional,
  refDeCliente,
  TOPE_MOVIMIENTOS_PLAN,
  TTL_PLAN_MIN,
  type PlanIABruto,
  type MovimientoPlanBruto,
} from '../../../lib/organizador/planIA.ts';
import {
  parseInstanteSalon,
  enHoraSalon,
  fechaSalon,
  horaSalon,
  horariosAlRelojDelRuntime,
  desfaseRuntimeMin,
} from '../shared/relojSalon.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ─── RELOJ DEL SALON ────────────────────────────────────────────────────────
// Las libs puras de agenda materializan las horas de apertura con setHours(),
// o sea en la zona LOCAL DEL RUNTIME. En el navegador eso es Madrid y cuadra;
// aqui el runtime es UTC, asi que "abre a las 09:00" acababa siendo 09:00Z =
// 11:00 de Madrid en verano. Dos horas de desfase en jornadas, tramos, huecos y
// fuera_jornada — es decir, en TODO lo que el motor determinista calcula dentro
// de esta funcion. Desplazando el horario ANTES de dársela a las libs, su
// aritmetica local acaba cayendo en la hora de Madrid correcta.
// Si algun dia el runtime pasa a ser Madrid, el desfase es 0 y esto no hace nada.
// (Ojo: `vigilar-agenda` tiene el mismo problema y NO lleva este arreglo.)
function alRelojDelSalon<T extends Record<string, unknown>>(
  filas: T[] | null | undefined,
  campos: (keyof T)[],
  referencia: Date,
): T[] {
  return horariosAlRelojDelRuntime(filas ?? [], campos, { referencia });
}

// --- Schema de salida del modelo (JSON estricto) ---
interface RecomendacionIA {
  tipo: 'patron' | 'carga' | 'rentabilidad' | 'prevencion' | 'otro';
  titulo: string;
  detalle: string;
  impacto_min?: number;
  confianza?: 'alta' | 'media' | 'baja';
  cita_ids?: string[];
}
interface AnalisisIA {
  resumen: string;
  metricas?: { nombre: string; valor: string }[];
  recomendaciones: RecomendacionIA[];
}

// "Entrenamiento maestro" (ago-2026): el system prompt condensa TODO lo que la
// IA necesita saber sobre como funciona la agenda de un salon Mecha, sacado del
// codigo real (lib/organizarAgenda.ts, lib/retrasos.ts, lib/propuestasCambio.ts,
// lib/reservaPublica.ts, useAvisos.ts). Los NUMEROS del motor se interpolan
// desde las constantes reales: si un umbral cambia en el codigo, el prompt
// cambia con el. Un modelo que "sabe" cosas falsas del salon es peor que uno
// que no sabe nada.
function construirSystemPrompt(): string {
  return `Eres Chispa, la IA de Mecha, software para salones de peluquería y estética en España. Eres una EXPERTA en gestión de agendas de salón: llevas años viendo cómo se llena, se rompe y se recupera una agenda real.

═══════════ 1. CÓMO ES UNA CITA (FILOSOFÍA DE FASES) ═══════════
Cada cita tiene CUATRO marcas temporales: inicio ≤ fin_activa ≤ fin_espera ≤ fin.
- [inicio, fin_activa): fase ACTIVA. El profesional trabaja con la clienta en la silla.
- [fin_activa, fin_espera): REPOSO o tiempo de espera (tinte, mecheros, aspirado...). La clienta sigue ocupando el hueco, pero el profesional está LIBRE.
- [fin_espera, fin): segunda fase activa (aclarado, peinado...).
CONSECUENCIA CLAVE: otra cita SÍ puede encajarse dentro del reposo de una anterior. Eso no es un error, es tiempo muerto bien aprovechado. Un solape solo existe si se pisan DOS fases ACTIVAS del mismo profesional.
"Tiempo muerto" = reposo sin ninguna otra cita dentro. Es el dinero más barato de recuperar: cabe otra clienta sin alargar la jornada de nadie.
La duración del reposo la fija el SERVICIO (duracion_activa_min / duracion_espera_min), no la clienta.

═══════════ 2. ESTADOS Y SU SIGNIFICADO EN NEGOCIO ═══════════
- pendiente: reservada pero el cliente NO ha confirmado. Bloquea hueco igual que una confirmada. Riesgo de ausencia.
- confirmada: en firme. Bloquea hueco.
- completada: terminada y cobrada (o pendiente de cobro). Ya no se toca.
- cancelada: liberó su hueco. No bloquea nada.
- no_presentada: la clienta reservó y NO VINO. Es la más cara: hueco perdido sin ingreso. El historial de no_presentadas es la mejor señal predictiva de futura ausencia que existe en estos datos.
Bloquean solape: pendiente, confirmada y completada.

═══════════ 3. CADENAS MULTIPROFESIONALES (grupo_id) ═══════════
Citas con el mismo grupo_id forman una CADENA: la misma clienta pasa por varios profesionales seguidos (color → corte → tratamiento). Reglas de oro:
- Una cadena NUNCA se rompe ni se mueve por piezas: si un eslabón se mueve, todos deben moverse en la misma dirección y magnitud.
- Un eslabón fuera de jornada o en hueco imposible arrastra a TODA la cadena: la urgencia se multiplica por el número de eslabones.
- Las cadenas son las citas de mayor valor del salón: protégelas en tus recomendaciones.

═══════════ 4. JORNADAS, BLOQUEOS Y CIERRES ═══════════
- horarios_profesional: jornada REAL de cada profesional, con VARIOS turnos/día (mañana y tarde); el hueco ENTRE turnos es la comida y NUNCA se ofrece como sitio para citas. OJO: aquí dia_semana 0=domingo.
- negocio_horarios: apertura/cierre del salón. OJO: aquí dia_semana 0=lunes (convención distinta, no es un error del contexto).
- bloqueos_profesional: vacaciones, descansos, baja, formación. Una cita dentro de un bloqueo es una bomba: se creó ANTES del bloqueo y hay que reubicarla o avisar al cliente.
- cierres_negocio: festivos/cierre colectivo. Todo el día es territorio prohibido para citas.
- Un profesional con jornada configurada y CERO citas es capacidad desaprovechada (no confundir con su día libre, que no tiene fila de horario).

═══════════ 5. PORTAL DE RESERVAS, SUGERIDOR Y CADENAS ═══════════
El portal público solo ofrece slots que respetan todo lo anterior (jornada, bloqueos, cierres, solapes activo-activo), incluidos slots DENTRO de reposos de citas existentes (con reposo_disponible_min suficiente para el servicio).
- reserva_temporal: cuando hay una propuesta de cambio pendiente de respuesta por WhatsApp, el hueco destino queda RETENIDO temporalmente. Ese hueco parece libre pero no lo está: no lo recomiendas como destino.
- Los servicios con prepago/senal filtran quién puede reservarlos: un hueco que solo servirá para servicios con prepago vale menos que uno genérico.
- El canal de la cita (canal: manual / web / whatsapp) dice de dónde vino: las citas web suelen ser de clientas nuevas sin historial de confianza.
- SUGERIDOR ("¿seguro que no te falta nada?"): tras elegir un servicio, el portal sugiere servicios que suelen ir juntos (configurados por el dueño o aprendidos del historial). Aceptarlos NO alarga la cita: crea una CADENA de varias citas seguidas con el mismo grupo_id y el MISMO profesional, cada tramo con su servicio y precio (máx. 4). Si ves en el contexto varias citas del mismo cliente seguidas y encadenadas, es una visita única: no propongas moverlas por separado ni contarlas como citas sueltas de baja ocupación.

═══════════ 6. LISTA DE ESPERA Y OFERTAS DE HUECOS ═══════════
- Las clientas en lista de espera se ordenan por prioridad de fidelidad. Cuando se libera un hueco (cancelación futura), el motor busca el mejor candidato compatible (servicio/profesional/franja) y le OFRECE el hueco por WhatsApp con una cita tentativa (es_oferta_espera=true, estado pendiente) y una ventana corta (unos 30 min). Si expira, pasa al siguiente de la cola.
- Una cita con es_oferta_espera=true es TENTATIVA: no la cuentes como ocupación firme en tus métricas de ocupación real.
- Los huecos_vacio que el motor reporta son candidatos naturales para la lista de espera: recomendar ofrecerlos va bien; recomendar "regalarlos" o rellenarlos con citas de servicios que el candidato no pidió, no.

═══════════ 7. AVISOS, CONFIRMACIONES Y EL LÍNEA ROJA ═══════════
- Las citas pendientes se confirman por WhatsApp con enlace; a partir de 48 h antes y sin confirmar, el riesgo crece (a <24 h es urgente).
- LÍNEA ROJA (nunca la cruces): una cita confirmada con una clienta NUNCA se mueve en frío. Cualquier cambio de hora/día/profesional que la afecte es una PROPUESTA que la clienta debe aceptar por WhatsApp, con tiempo de reacción (nunca moverla a menos del margen de reacción de "ahora", y cuanto más antelación, mejor). Las únicas reorganizaciones en caliente legítimas son las que NO afectan a la clienta: compactar huecos internos, encajar en reposos, adelantar a quien ya está en el salón.
- Si tu recomendación implica mover citas confirmadas (una o varias), formula la ACCIÓN como "proponer el cambio a las clientas por WhatsApp" y avisa de cuántas propuestas serían; nunca como "mover estas citas".
- Movimientos múltiples en cadena: si propones reorganizar varias citas a la vez, declara el orden y señala que cada clienta afectada debe confirmar; citaIds de todas las implicadas.

═══════════ 8. LÓGICA PURA DEL MOTOR DETERMINISTA (constantes reales del código) ═══════════
Estos son los números EXACTOS con los que el motor razona. Úsalos para calibrar tus recomendaciones y explicar el "por qué" con el mismo idioma que el salón ya ve en su panel:
- Un retraso cuenta a partir de ${UMBRAL_RETRASO_MIN} min de desfase; a partir de ${MAX_RETRASO_MIN / 60} h se da por olvidada, no por retrasada.
- El motor propone movimientos en slots de 15 min; puede adelantar una cita como máximo lo que el salón configure como "adelanto máximo" (agendaMaxAdelantoMin), y nunca a menos de un "margen de reacción" de la hora actual.
- Puntuación del motor (1 punto = 1 minuto de compactación): mover de día cuesta ${PENAL_CAMBIO_DIA} puntos, reasignar de profesional ${PENAL_CAMBIO_TRABAJADOR}, cada minuto de retraso propuesto resta ${PENAL_RETRASO}, encajar en un reposo libre suma ${BONUS_REPOSO}.
- Prioridad de problemas (mayor = más urgente): ${Object.entries(PESO_TIPO).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}.
- Un micro-movimiento que no gana al menos el umbral de hueco del salón (agendaUmbralHuecoMin) NO se propone.
Regla de coherencia: si sugieres mover algo, tu sugerencia debe superar el score de quedarse donde está bajo ESTA tabla. Si no lo supera, no lo sugieras.

═══════════ 9. ECONOMÍA DE UNA AGENDA DE SALÓN ═══════════
- Un hueco muerto cuesta lo que el servicio que cabría dentro (media típica: 30-60 €).
- Una no_presentada cuesta hueco + servicio perdido + posible daño a la lista de espera.
- Un retraso en cadena contamina TODO lo que viene detrás: 15 min a primera hora son a menudo 30-45 min de caos al mediodía (efecto bola de nieve), porque los reposos dejan de alinear.
- La carga ideal no es la máxima: es la que absorbe retrasos con reposos. Un 85-90% de ocupación con reposos alineados es más rentable que un 100% sin colchón.

═══════════ 10. TU TRABAJO ═══════════
El motor determinista YA detecta y corrige lo puntual (retrasos, solapes, huecos concretos, fuera de jornada, sin confirmar, riesgo de ausencia). NO repitas eso. Tu valor son los PATRONES y la ESTRATEGIA:
- Huecos/minutos muertos que se REPITEN (mismo día/hora/profesional semana a semana: la historia de 30 días del contexto está para eso).
- Descompensación de carga entre profesionales el mismo día.
- Servicios que sistemáticamente dejan tiempo muerto o se alargan.
- Tramos de máxima demanda sin cobertura y tramos muertos recurrentes.
- Riesgos prevenibles: cadenas frágiles, concentración de pendientes sin confirmar, clientas reincidentes en no_presentada con cita próxima.
Reglas de salida:
- Español de España, tono directo y útil, sin emojis, sin alarmismo.
- Máximo 5 recomendaciones, ordenadas por impacto. Solo accionables; nada de consejos genéricos de "mejoraría la ocupación".
- cita_ids SOLO de citas presentes en el contexto.
- impacto_min = minutos de agenda recuperables estimados (entero).
- Responde SOLO JSON: {"resumen": string, "metricas": [{"nombre": string, "valor": string}], "recomendaciones": [{"tipo": "patron"|"carga"|"rentabilidad"|"prevencion"|"otro", "titulo": string, "detalle": string, "impacto_min": number, "confianza": "alta"|"media"|"baja", "cita_ids": [string]}]}`;
}
const SYSTEM = construirSystemPrompt();

// --- Modo PLANES (F1 del motor generativo). Mismo dominio, otro encargo: en vez
//     de escribir recomendaciones, inventar SOLUCIONES EJECUTABLES.
//
//     La seccion 10 del prompt base ("tu trabajo") se reemplaza porque ahi el
//     encargo es el contrario: en analisis se le pide NO repetir lo puntual; en
//     planes se le pide justamente resolver lo que el motor determinista no
//     supo resolver. El resto del entrenamiento (fases, estados, cadenas,
//     jornadas, portal, linea roja, constantes del motor, economia) se
//     reaprovecha tal cual: es el mismo salon.
function construirSystemPromptPlanes(): string {
  const base = construirSystemPrompt().split('═══════════ 10. TU TRABAJO ═══════════')[0];
  return `${base}═══════════ 10. TU TRABAJO: INVENTAR PLANES EJECUTABLES ═══════════
El motor determinista solo sabe cuatro jugadas: compactar, encajar en un reposo, cambiar de dia y cambiar de profesional. Cuando el problema no se arregla con ninguna de esas cuatro, se calla y el salon se queda sin propuesta.
Tu trabajo es esa cuarta pared: proponer la jugada que NO esta programada. Un plan puede llamarse como quieras ('alinear los reposos de la manana', 'rescatar la cadena de las 17:00', 'blindar el viernes contra ausencias'). Lo que importa no es el nombre: es que sea una secuencia CONCRETA de movimientos de citas reales.

REGLAS DURAS (un plan que las incumpla se descarta entero en el servidor):
1. Solo puedes MOVER citas que existan, usando su referencia (#1, #2...) de la lista CITAS MOVIBLES. No inventes referencias.
2. Un movimiento es una REUBICACION: la cita entera se traslada conservando sus fases. No puedes acortar, alargar ni partir un servicio.
3. Maximo ${TOPE_MOVIMIENTOS_PLAN} movimientos por plan. Mas que eso nadie lo lee antes de pulsar "Aplicar".
4. Las horas van en hora del SALON, formato YYYY-MM-DDTHH:MM, sin Z ni offset, y siempre en un slot de 15 min (:00, :15, :30, :45).
5. Coloca las citas SOLO en tramos que aparezcan en HUECOS LIBRES. Esa lista ya descuenta jornada, turnos, comida, bloqueos, cierres y citas existentes: si un hueco no esta ahi, no existe.
6. Una CADENA (mismo grupo) se mueve entera y con el mismo desplazamiento en todos sus tramos, o no se toca.
7. No decidas tu quien necesita permiso de la clienta: el servidor lo clasifica solo. Tu limitate a proponer lo que mejora la agenda.

Cada plan tiene que explicar POR QUE (que ves tu que el motor no ve) y COMO llegaste. Un peluquero solo se fia de un plan inventado por una maquina si entiende el razonamiento.
Ejemplos del tipo de jugada que se busca: alinear reposos sueltos para que quepa otra cita en el pico de demanda; rescatar una cadena que acaba pisando el cierre moviendo solo su primer eslabon; vaciar la manana floja de un profesional pasando sus citas al que va sobrecargado; reordenar un dia para que las clientas con historial de ausencia no queden a primera hora.
Si la agenda esta bien y no hay nada que valga la pena mover, devuelve la lista de planes VACIA. Un plan flojo cuesta mas credibilidad de la que gana.

Responde SOLO JSON con esta forma exacta:
{"planes":[{"tipoProblema":string,"titulo":string,"diagnostico":string,"razonamiento":string,"confianza":"alta"|"media"|"baja","impactoMin":number,"riesgos":[string],"movimientos":[{"cita":"#N","tipo":string,"inicio":"YYYY-MM-DDTHH:MM","profesional":"pN"}]}]}
- "profesional" solo si el plan reasigna esa cita a otra persona; si no, omitelo.
- "tipoProblema" es libre: usa el nombre que mejor describa lo que has visto.
- Maximo 3 planes, ordenados por impacto.`;
}
const SYSTEM_PLANES = construirSystemPromptPlanes();

// Lo que se le pide al modelo. Deliberadamente distinto de PlanIABruto: aqui
// las citas y los profesionales van por REFERENCIA CORTA (#3, p2), no por uuid.
// Motivo: 400 uuids en el prompt cuestan dinero y, sobre todo, un uuid
// inventado es indistinguible de uno bueno, mientras que un "#47" que no existe
// se cae solo. La traduccion ref -> uuid la hace el servidor.
interface MovimientoModelo {
  cita?: string;
  citaId?: string;
  tipo?: string;
  inicio?: string;
  profesional?: string;
}
interface PlanesModelo {
  planes?: (Omit<PlanIABruto, 'movimientos'> & { movimientos?: MovimientoModelo[] })[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const t0 = Date.now();

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const apiKey = Deno.env.get('OPENROUTER_API_KEY') ?? '';
  if (!SUPABASE_URL || !apiKey) return json({ error: 'faltan secrets' }, 500);
  const svc = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  // Para la auditoria de fallo: se rellenan en cuanto resuelve el auth.
  let negocioAudit = 'desconocido';
  let usuarioAudit = 'desconocido';
  // Un fallo del generador de planes no debe contarse en la casilla del
  // analisis (ni al reves): el cupo se lleva por casilla.
  let funcionAudit = 'agenda-optimizador';

  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization') ?? '';

    // --- MODO "OJO" (ojos continuos, ago-2026): lo llaman los triggers de la
    //     BD en CADA movimiento de agenda (cita creada/movida/borrada, bloqueo,
    //     horario, cierre). Sin LLM: solo el motor determinista + hallazgos.
    //     Auth: service_role key (los triggers la sacan del vault, como los
    //     cron). Asi el panel y la pagina de Avisos ven los problemas en
    //     segundos, no a los 15 min del cron de vigilar-agenda. ---
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (body?.ojo === true && serviceKey && authHeader === `Bearer ${serviceKey}`) {
      const negocioId: string | undefined = body.negocio_id;
      if (!negocioId) return json({ error: 'falta negocio_id' }, 400);
      const hoy = new Date();
      const desde = new Date(hoy); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 1);

      const [citasRes2, profsRes2, srvRes2, bloqRes2, horRes2, horProfRes2] = await Promise.all([
        svc.from('citas')
          .select('id, profesional_id, cliente_id, servicio_id, estado, inicio, fin, fin_activa, fin_espera, grupo_id')
          .eq('negocio_id', negocioId)
          .in('estado', ['pendiente', 'confirmada'])
          .gte('inicio', desde.toISOString())
          .lt('inicio', hasta.toISOString()),
        svc.from('profesionales').select('id, nombre, categoria, activo').eq('negocio_id', negocioId),
        svc.from('servicios').select('id, nombre, categoria_minima, duracion_minima_min').eq('negocio_id', negocioId),
        svc.from('bloqueos_profesional').select('profesional_id, inicio, fin').eq('negocio_id', negocioId),
        svc.from('negocio_horarios').select('dia_semana, abierto, apertura, cierre').eq('negocio_id', negocioId),
        svc.from('horarios_profesional').select('profesional_id, dia_semana, hora_inicio, hora_fin, turno').eq('negocio_id', negocioId),
      ]);
      const citas2 = citasRes2.data ?? [];
      if (citas2.length === 0) return json({ ok: true, ojo: true, citas: 0, hallazgos: 0 });

      const problemasOjo: ProblemaAgenda[] = analizarAgendaRango(
        prepararCitas(citas2 as any, [], (srvRes2.data ?? []) as any),
        (profsRes2.data ?? []) as any,
        {
          ahoraMs: Date.now(),
          desdeMs: +desde,
          hastaMs: +hasta,
          bloqueos: (bloqRes2.data ?? []) as any,
          // Ver el bloque "RELOJ DEL SALON" del handler principal: sin este
          // desplazamiento la jornada se calcula en UTC y todo el analisis se
          // corre una o dos horas.
          horarios: alRelojDelSalon(horRes2.data, ['apertura', 'cierre'], desde) as any,
          horariosProfesional: alRelojDelSalon(horProfRes2.data, ['hora_inicio', 'hora_fin'], desde) as any,
        },
      );
      // Agregado por tipo, mismo contrato que vigilar-agenda (idempotente).
      const RESUMEN_OJO: Record<string, string> = {
        retraso: 'Retrasos en curso (tiempo real)',
        solape: 'Citas que se solapan (tiempo real)',
        fuera_jornada: 'Citas fuera de jornada (tiempo real)',
        hueco_muerto: 'Huecos muertos (tiempo real)',
        reposo_desaprovechado: 'Reposos sin aprovechar (tiempo real)',
      };
      let escritos = 0;
      for (const [tipo, resumen] of Object.entries(RESUMEN_OJO)) {
        const items = problemasOjo.filter((p) => p.tipo === tipo);
        const { error } = await svc.rpc('upsert_hallazgo_agenda', {
          p_negocio: negocioId,
          p_tipo: tipo,
          p_severidad: tipo === 'solape' || tipo === 'retraso' || tipo === 'fuera_jornada' ? 'alta' : 'baja',
          p_resumen: resumen,
          p_detalle: resumen,
          p_count: items.length,
          p_items: items.slice(0, 50).map((p) => ({
            profesional: p.profesionalNombre,
            titulo: p.titulo,
            descripcion: p.descripcion,
            cita_ids: p.citaIds,
          })),
        });
        if (!error) escritos++;
      }
      return json({ ok: true, ojo: true, citas: citas2.length, problemas: problemasOjo.length, hallazgos: escritos });
    }

    // --- Auth: JWT del usuario; el negocio sale del perfil (no del body). ---
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'No autenticado' }, 401);

    const { data: profile } = await svc
      .from('profiles')
      .select('negocio_id, role, ia_nivel')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.negocio_id) return json({ error: 'Sin negocio asignado' }, 403);
    const negocioId: string = profile.negocio_id;
    negocioAudit = negocioId;
    usuarioAudit = user.id;
    const role: string = profile.role ?? 'employee';
    if (!['owner', 'admin', 'recepcion'].includes(role)) {
      return json({ error: 'Solo dirección o recepción pueden analizar la agenda completa.' }, 403);
    }
    // Gate de addon, MISMO patrón que agenda-asistente: este endpoint gasta
    // tokens de verdad y esconder el boton no es un control de acceso. Chispa
    // (organizador con IA) requiere el addon whatsapp o completa; la demo va
    // exenta porque es el escaparate.
    const iaNivel = String((profile as any).ia_nivel ?? '').toLowerCase();
    const addonOk = iaNivel === 'whatsapp' || iaNivel === 'completa';
    if (!addonOk && negocioId !== 'demo_salon_001') {
      return json({ error: 'Chispa es el addon de IA por WhatsApp. Actívalo para usarla.', codigo: 'addon_ia_insuficiente' }, 402);
    }
    // Modo de trabajo. 'analisis' = recomendaciones de texto (lo de siempre).
    // 'planes' = motor generativo F1: planes EJECUTABLES ya validados.
    const modo: 'analisis' | 'planes' = body?.modo === 'planes' ? 'planes' : 'analisis';

    // Cuota por hora (mismo mecanismo que migracion-magica/vision: cuenta filas
    // de chispa_auditoria de esta funcion en la ultima hora).
    //
    // OJO, ARREGLO: el nombre tiene que ser EL MISMO con el que se audita, y no
    // lo era — se pedia cupo de 'agenda_optimizador' (guion bajo) y se auditaba
    // como 'agenda-optimizador' (guion), asi que el contador miraba una casilla
    // siempre vacia y el limite de 20/hora no se aplico nunca.
    //
    // Los planes tienen su propia casilla y su propio tope: cuestan bastante
    // mas que un analisis (mas contexto y mas razonamiento), asi que 10/hora.
    const MAX_ANALISIS_HORA = 20;
    const MAX_PLANES_HORA = 10;
    const funcionIA = modo === 'planes' ? 'agenda-optimizador-planes' : 'agenda-optimizador';
    funcionAudit = funcionIA;
    const maxHora = modo === 'planes' ? MAX_PLANES_HORA : MAX_ANALISIS_HORA;
    const cupo = await comprobarCupo(userClient, funcionIA, maxHora);
    if (!cupo.permitido) {
      return json({
        error: modo === 'planes'
          ? `Has llegado al limite de ${maxHora} generaciones de planes por hora. Espera un poco.`
          : `Has llegado al limite de ${maxHora} analisis por hora. Espera un poco.`,
        codigo: 'cupo_agotado',
      }, 429);
    }

    const dias: number = Math.min(14, Math.max(1, Number(body?.dias ?? 1)));
    const desde = body?.desde ? new Date(body.desde) : new Date();
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(desde);
    hasta.setDate(hasta.getDate() + dias);

    // --- Contexto: mismas tablas que vigilar-agenda + nombres de cliente. ---
    const [citasRes, profsRes, cliRes, srvRes, bloqRes, horRes, horProfRes, cierresRes, cfgRes, histRes] = await Promise.all([
      svc.from('citas')
        .select('id, profesional_id, cliente_id, servicio_id, estado, inicio, fin, fin_activa, fin_espera, grupo_id')
        .eq('negocio_id', negocioId)
        .in('estado', ['pendiente', 'confirmada', 'completada', 'no_presentada'])
        // Un poco de historia hacia atras (30 d) para que el modelo VEa patrones
        // y ausencias previas; el analisis determinista sigue acotado al rango.
        .gte('inicio', new Date(desde.getTime() - 30 * 86400000).toISOString())
        .lt('inicio', hasta.toISOString()),
      svc.from('profesionales').select('id, nombre, categoria, activo').eq('negocio_id', negocioId),
      svc.from('clientes').select('id, nombre').eq('negocio_id', negocioId).limit(500),
      svc.from('servicios').select('id, nombre, categoria_minima, duracion_minima_min').eq('negocio_id', negocioId),
      svc.from('bloqueos_profesional').select('profesional_id, inicio, fin').eq('negocio_id', negocioId),
      svc.from('negocio_horarios').select('dia_semana, abierto, apertura, cierre').eq('negocio_id', negocioId),
      svc.from('horarios_profesional').select('profesional_id, dia_semana, hora_inicio, hora_fin, turno').eq('negocio_id', negocioId),
      svc.from('cierres_negocio').select('fecha, motivo').eq('negocio_id', negocioId).gte('fecha', desde.toISOString().slice(0, 10)).lt('fecha', hasta.toISOString().slice(0, 10)),
      svc.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle(),
      // Movimientos reales de los ultimos 30 d: QUE se mueve en este salon y
      // POR QUE (drag&drop, edicion, anti-solape, Chispa...). Es el "como
      // trabaja esta agenda" que el modelo no puede deducir de las citas solas.
      svc.from('citas_historial')
        .select('campo, motivo, created_at')
        .eq('negocio_id', negocioId)
        .gte('created_at', new Date(desde.getTime() - 30 * 86400000).toISOString())
        .limit(3000),
    ]);
    const errQ = [citasRes.error, profsRes.error, srvRes.error, horRes.error].filter(Boolean);
    if (errQ.length) return json({ error: 'consulta fallida', errores: errQ.map((e: any) => e.message) }, 500);

    const citas = citasRes.data ?? [];
    if (citas.length === 0) return json({ error: 'No hay citas en el rango para analizar.' }, 400);

    // --- Motor determinista sobre el rango (fuente de verdad de problemas). ---
    const cfg = (cfgRes.data?.config ?? {}) as Record<string, number | undefined>;
    const citasOrg = prepararCitas(
      citas as any,
      (cliRes.data ?? []) as any,
      (srvRes.data ?? []) as any,
    );
    // Horarios en el reloj del runtime (ver alRelojDelSalon arriba). TODO lo
    // que se pase a las libs puras tiene que usar estos, no los crudos.
    const horariosReloj = alRelojDelSalon(horRes.data, ['apertura', 'cierre'], desde);
    const horProfReloj = alRelojDelSalon(horProfRes.data, ['hora_inicio', 'hora_fin'], desde);
    const geometria = {
      bloqueos: (bloqRes.data ?? []) as any,
      horarios: horariosReloj as any,
      horariosProfesional: horProfReloj as any,
      cierres: (cierresRes.data ?? []) as any,
    };
    const problemas: ProblemaAgenda[] = analizarAgendaRango(
      citasOrg,
      (profsRes.data ?? []) as any,
      {
        ahoraMs: Date.now(),
        desdeMs: +desde,
        hastaMs: +hasta,
        ...geometria,
        maxAdelantoMin: cfg.agendaMaxAdelantoMin,
        umbralHuecoMin: cfg.agendaUmbralHuecoMin,
      },
    );

    // --- Contexto compacto para el LLM: nombres, no ids crudos donde se pueda. ---
    const profPorId = new Map(((profsRes.data ?? []) as any[]).map((p) => [p.id, p.nombre]));
    const cliPorId = new Map(((cliRes.data ?? []) as any[]).map((c) => [c.id, c.nombre]));
    const srvPorId = new Map(((srvRes.data ?? []) as any[]).map((s) => [s.id, s.nombre]));
    // Las horas van SIEMPRE en el reloj del salon. Antes se cortaba el ISO en
    // crudo (`c.inicio.slice(0,16)`), que es UTC: el modelo leia "11:00" en una
    // cita que en la peluqueria es a las 13:00 y razonaba sobre otra agenda.
    const lineaCita = (c: any) => {
      const ini = enHoraSalon(c.inicio);
      const fin = horaSalon(c.fin);
      return `${ini}–${fin} | ${profPorId.get(c.profesional_id) ?? c.profesional_id} | ${
        cliPorId.get(c.cliente_id) ?? 'sin cliente'
      } | ${srvPorId.get(c.servicio_id) ?? c.servicio_id ?? 'sin servicio'} | ${c.estado}${c.grupo_id ? ' | cadena' : ''}`;
    };
    // --- Metricas precalculadas: el modelo razona mejor con numeros que con
    //     listas crudas. Ocupacion por profesional (solo rango), no_shows por
    //     clienta (historial 30 d), cadenas y minutos muertos por dia. ---
    const citasRango = citas.filter((c: any) => {
      const t = +new Date(c.inicio);
      return t >= +desde && t < +hasta && (c.estado === 'confirmada' || c.estado === 'pendiente');
    });
    const MIN_MS = 60000;
    const activasPorProf = new Map<string, number>();
    for (const c of citasRango) {
      const ini = +new Date(c.inicio);
      const finA = +new Date(c.fin_activa ?? c.fin);
      const finE = +new Date(c.fin_espera ?? finA);
      const fin = +new Date(c.fin);
      // Minutos de silla (activa) y de reposo potencialmente aprovechable.
      const activa = ((finA - ini) + (fin - finE)) / MIN_MS;
      const reposo = (finE - finA) / MIN_MS;
      const acc = activasPorProf.get(c.profesional_id) ?? 0;
      activasPorProf.set(c.profesional_id, acc + activa);
    }
    const jornadaPorProf = new Map<string, number>(); // minutos de jornada en el rango
    const fechasCerradas = new Set(
      ((cierresRes.data ?? []) as { fecha?: string }[]).map((x) => String(x.fecha)),
    );
    const diaCursor = new Date(desde);
    while (diaCursor < hasta) {
      const dow = diaCursor.getDay(); // 0=domingo como horarios_profesional
      const fecha = diaCursor.toISOString().slice(0, 10);
      const cerrado = fechasCerradas.has(fecha);
      for (const h of (horProfRes.data ?? []) as any[]) {
        if (h.profesional_id == null || cerrado) continue;
        if (h.dia_semana === dow) {
          const [hi, mi] = String(h.hora_inicio).split(':').map(Number);
          const [hf, mf] = String(h.hora_fin).split(':').map(Number);
          const mins = (hf * 60 + mf) - (hi * 60 + mi);
          if (mins > 0) jornadaPorProf.set(h.profesional_id, (jornadaPorProf.get(h.profesional_id) ?? 0) + mins);
        }
      }
      diaCursor.setDate(diaCursor.getDate() + 1);
    }
    const metricasProf = [...activasPorProf.entries()].map(([pid, act]) => {
      const jornada = jornadaPorProf.get(pid);
      const nombre = profPorId.get(pid) ?? pid;
      return jornada ? `${nombre}: ${Math.round(act)} min activos / ${jornada} min jornada (${Math.round((act / jornada) * 100)}%)` : `${nombre}: ${Math.round(act)} min activos (jornada no configurada)`;
    });
    const noShows = new Map<string, number>();
    for (const c of citas as any[]) {
      if (c.estado === 'no_presentada' && +new Date(c.inicio) < +desde) {
        const nombre = cliPorId.get(c.cliente_id) ?? 'sin nombre';
        noShows.set(nombre, (noShows.get(nombre) ?? 0) + 1);
      }
    }
    const cadenas = new Map<string, number>();
    for (const c of citasRango as any[]) {
      if (c.grupo_id) cadenas.set(c.grupo_id, (cadenas.get(c.grupo_id) ?? 1) + 1);
    }
    // Patrones de ESTE salon (30 d de historia): demanda por franja horaria,
    // dia de la semana y como se mueve la agenda (citas_historial).
    const porFranja = new Map<number, number>();
    const porDow = new Map<number, number>();
    for (const c of citas as any[]) {
      const d = new Date(c.inicio);
      if (+d < +desde - 30 * 86400000) continue;
      porFranja.set(d.getHours(), (porFranja.get(d.getHours()) ?? 0) + 1);
      porDow.set(d.getDay(), (porDow.get(d.getDay()) ?? 0) + 1);
    }
    const nombresDow = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const franjasTxt = [...porFranja.entries()].sort((a, b) => a[0] - b[0]).map(([h, n]) => `${String(h).padStart(2, '0')}:00=${n}`).join(', ');
    const dowTxt = [...porDow.entries()].filter(([d]) => d >= 1 && d <= 6).sort((a, b) => a[0] - b[0]).map(([d, n]) => `${nombresDow[d]}=${n}`).join(', ');
    const movPorMotivo = new Map<string, number>();
    const movPorCampo = new Map<string, number>();
    for (const h of (histRes.data ?? []) as any[]) {
      if (h.campo === 'inicio' || h.campo === 'profesional_id') {
        const m = (h.motivo ?? 'sin motivo').slice(0, 60);
        movPorMotivo.set(m, (movPorMotivo.get(m) ?? 0) + 1);
      }
      movPorCampo.set(h.campo, (movPorCampo.get(h.campo) ?? 0) + 1);
    }
    const movimientosTxt = movPorMotivo.size
      ? [...movPorMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} (${n})`).join(', ')
      : 'sin movimientos registrados';

    const contexto = [
      `SALON: ${negocioId}`,
      `RANGO ANALIZADO: ${fechaSalon(desde)} → ${fechaSalon(hasta)} (${dias} dia(s))`,
      // En hora del SALON, no del servidor: esta funcion corre en UTC y decirle
      // al modelo que "hoy son las 13:00" cuando en la peluqueria son las 15:00
      // envenena cualquier razonamiento sobre "lo que queda de tarde".
      `AHORA (hora del salon): ${enHoraSalon(new Date())}`,
      '',
      `PROFESIONALES: ${(profsRes.data ?? []).map((p: any) => `${p.nombre}${p.activo === false ? ' (inactivo)' : ''}`).join(', ')}`,
      '',
      `METRICAS PRECALCULADAS (rango):`,
      ...metricasProf.map((m) => `- ${m}`),
      `- Clientas con ausencias en los ultimos 30 dias: ${
        noShows.size ? [...noShows.entries()].map(([n, k]) => `${n} (${k})`).join(', ') : 'ninguna'}`,
      `- Cadenas multiprofesionales en el rango: ${cadenas.size}`,
      `- Pendientes sin confirmar en el rango: ${(citasRango as any[]).filter((c) => c.estado === 'pendiente').length}`,
      `- Demanda por hora de inicio (30 dias): ${franjasTxt || 'sin datos'}`,
      `- Demanda por dia de la semana (30 dias): ${dowTxt || 'sin datos'}`,
      `- Como se mueve esta agenda (reagendados 30 dias): ${movimientosTxt}`,
      '',
      `CITAS (incluye 30 dias de historia para detectar patrones y ausencias; formato: inicio–fin | profesional | clienta | servicio | estado | cadena?):`,
      ...citas.slice(-400).map(lineaCita), // tope defensivo: 400 lineas ~ 30k chars
      '',
      `HORARIO SALON (dia_semana 0=lunes): ${JSON.stringify(horRes.data ?? [])}`,
      `HORARIOS PROFESIONALES (dia_semana 0=domingo): ${JSON.stringify(horProfRes.data ?? [])}`,
      `CIERRES DEL SALON: ${JSON.stringify(cierresRes.data ?? [])}`,
      `BLOQUEOS: ${JSON.stringify(bloqRes.data ?? [])}`,
      '',
      `PROBLEMAS QUE EL MOTOR DETERMINISTA YA DETECTO EN EL RANGO (no los repitas, usa el contexto):`,
      ...problemas.slice(0, 60).map((p) => `- [${p.tipo}] ${p.titulo} (${p.profesionalNombre}): ${p.descripcion}`),
    ].join('\n');

    // ═══════════════════════════════════════════════════════════════════════
    // MODO PLANES (F1 del motor generativo)
    // ═══════════════════════════════════════════════════════════════════════
    if (modo === 'planes') {
      const limites = {
        maxAdelantoMin: cfg.agendaMaxAdelantoMin,
        margenReaccionMin: cfg.agendaMargenReaccionMin,
      };

      // --- Referencias cortas. El modelo trabaja con #3 y p2, nunca con uuids:
      //     mas barato en tokens y, sobre todo, una referencia inventada se cae
      //     sola mientras que un uuid inventado parece legitimo. ---
      const ahoraMs = Date.now();
      const movibles = citasOrg
        .filter((c) => (c.estado === 'confirmada' || c.estado === 'pendiente'))
        .filter((c) => {
          const t = +new Date(c.inicio);
          return t >= ahoraMs && t >= +desde && t < +hasta;
        })
        .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))
        .slice(0, 120);

      if (movibles.length === 0) {
        return json({ ok: true, planes: [], motivo: 'No hay citas futuras en el rango que se puedan mover.' });
      }

      const citaPorRef = new Map<string, string>();
      const refPorCita = new Map<string, string>();
      movibles.forEach((c, i) => {
        const ref = `#${i + 1}`;
        citaPorRef.set(ref, c.id);
        refPorCita.set(c.id, ref);
      });

      const profsActivos = ((profsRes.data ?? []) as any[]).filter((p) => p.activo !== false);
      const profPorRef = new Map<string, string>();
      const refPorProf = new Map<string, string>();
      profsActivos.forEach((p, i) => {
        const ref = `p${i + 1}`;
        profPorRef.set(ref, p.id);
        refPorProf.set(p.id, ref);
      });

      // --- Geometria PRECALCULADA: los huecos reales de cada profesional dia a
      //     dia. Es lo que evita que el modelo deduzca horas de una lista de
      //     citas, que es donde siempre se inventa la agenda. ---
      const lineasHuecos: string[] = [];
      for (let d = new Date(desde); d < hasta; d.setDate(d.getDate() + 1)) {
        const diaMs = d.getTime();
        for (const p of profsActivos) {
          const huecos = huecosLibresProfesional(p.id, diaMs, citasOrg, {
            ahoraMs,
            ...geometria,
            minMinutos: 15,
          });
          if (huecos.length === 0) continue;
          lineasHuecos.push(
            `- ${fechaSalon(diaMs)} | ${p.nombre} (${refPorProf.get(p.id)}): ` +
            huecos.map((h) => `${horaSalon(h.desde)}-${horaSalon(h.hasta)} (${h.minutos}min)`).join(', '),
          );
        }
      }

      const contextoPlanes = [
        contexto,
        '',
        `CITAS MOVIBLES (usa ESTAS referencias en tus movimientos; formato: ref | inicio-fin | profesional | clienta | servicio | estado | cadena):`,
        ...movibles.map((c) => {
          const prof = profPorId.get(c.profesional_id) ?? c.profesional_id;
          return `${refPorCita.get(c.id)} | ${enHoraSalon(c.inicio)}-${horaSalon(c.fin)} | ${prof} (${refPorProf.get(c.profesional_id) ?? '?'}) | ${c.cliente ?? 'sin ficha'} | ${c.servicio ?? 'sin servicio'} | ${c.estado}${c.grupoId ? ` | cadena ${c.grupoId.slice(0, 8)}` : ''}`;
        }),
        '',
        `PROFESIONALES (referencia | nombre | categoria):`,
        ...profsActivos.map((p) => `${refPorProf.get(p.id)} | ${p.nombre} | ${p.categoria ?? 'sin categoria'}`),
        '',
        `HUECOS LIBRES REALES (ya descuentan jornada, turnos, comida, bloqueos, cierres y citas; el reposo de una cita SI cuenta como hueco):`,
        ...(lineasHuecos.length ? lineasHuecos : ['- ninguno: la agenda esta llena en todo el rango']),
        '',
        `LIMITES DE ESTE SALON: adelanto maximo ${limites.maxAdelantoMin ?? 240} min · margen de reaccion de la clienta ${limites.margenReaccionMin ?? 120} min · umbral de hueco ${cfg.agendaUmbralHuecoMin ?? 30} min.`,
      ].join('\n');

      const resPlanes = await llamarIAJson<PlanesModelo>(apiKey, {
        funcion: funcionIA,
        mensajes: [
          { role: 'system', content: SYSTEM_PLANES },
          { role: 'user', content: contextoPlanes },
        ],
        maxTokens: 2400,
        perfil: 'calidad',
      });

      // --- Traduccion refs -> uuids y horas del salon -> instantes reales.
      //     Nada de esto confia en el modelo: lo que no resuelva se convierte en
      //     un movimiento invalido que el validador poda con su motivo. ---
      const brutos: PlanIABruto[] = (resPlanes.datos?.planes ?? []).slice(0, 3).map((p) => ({
        tipoProblema: String(p?.tipoProblema ?? 'otro'),
        titulo: String(p?.titulo ?? 'Plan de Chispa'),
        diagnostico: String(p?.diagnostico ?? ''),
        razonamiento: String(p?.razonamiento ?? ''),
        confianza: p?.confianza,
        impactoMin: p?.impactoMin,
        riesgos: Array.isArray(p?.riesgos) ? p.riesgos.map(String) : [],
        movimientos: (p?.movimientos ?? []).map((m): MovimientoPlanBruto => {
          const ref = String(m?.cita ?? m?.citaId ?? '').trim();
          const instante = parseInstanteSalon(String(m?.inicio ?? ''));
          return {
            // Ref desconocida -> citaId vacio -> poda 'cita_inexistente'.
            citaId: citaPorRef.get(ref) ?? citaPorRef.get(`#${ref.replace(/^#/, '')}`) ?? '',
            tipo: m?.tipo ? String(m.tipo) : 'mover',
            inicio: isNaN(instante.getTime()) ? '' : instante.toISOString(),
            profesionalId: m?.profesional ? (profPorRef.get(String(m.profesional).trim()) ?? '') : undefined,
          };
        }),
      }));

      // --- Anti-spam: propuestas de cambio ya enviadas en los ultimos 7 dias.
      //     Las deja proponer_cambio_cita en lista_espera_avisos. ---
      const { data: avisosPrev } = await svc
        .from('lista_espera_avisos')
        .select('telefono, nombre, created_at')
        .eq('negocio_id', negocioId)
        .eq('template', 'propuesta_cambio_cita')
        .gte('created_at', new Date(ahoraMs - 7 * 86400000).toISOString())
        .limit(500);
      const propuestasRecientes = ((avisosPrev ?? []) as any[]).map((a) => ({
        clienteRef: refDeCliente({ telefono: a.telefono, cliente: a.nombre, id: '' }),
        enviadaEn: a.created_at,
      }));

      // --- Citas que ya tiene comprometidas otro plan vivo: dos tarjetas no
      //     pueden dar ordenes distintas sobre la misma cita. ---
      const { data: planesVivos } = await svc
        .from('planes_ia')
        .select('movimientos')
        .eq('negocio_id', negocioId)
        .in('estado', ['propuesto', 'esperando_clientes'])
        .gt('expira_en', new Date().toISOString())
        .limit(50);
      const comprometidas = new Set<string>();
      for (const pv of (planesVivos ?? []) as any[]) {
        for (const m of (pv.movimientos ?? [])) if (m?.citaId) comprometidas.add(m.citaId);
      }

      const validados = validarPlanes(brutos, {
        ahoraMs,
        citas: citasOrg,
        profesionales: (profsRes.data ?? []) as any,
        ...geometria,
        maxAdelantoMin: limites.maxAdelantoMin,
        margenReaccionMin: limites.margenReaccionMin,
        citasComprometidas: comprometidas,
        propuestasRecientes,
      });

      // --- Persistencia. Best-effort: si la migracion no esta aplicada, el
      //     salon igual ve sus planes (no se le rompe el panel por eso), pero se
      //     avisa a gritos en los logs — un plan sin fila no se puede auditar. ---
      const expiraEn = new Date(ahoraMs + TTL_PLAN_MIN * 60000).toISOString();
      const filas = validados.map((v) => ({
        id: v.id,
        negocio_id: negocioId,
        generado_por: user.id,
        disparador: 'panel',
        tipo_problema: v.tipoProblema,
        titulo: v.titulo,
        diagnostico: v.diagnostico,
        razonamiento: v.razonamiento,
        confianza: v.confianza,
        impacto_min: v.impactoMin,
        impacto_declarado_min: v.impactoDeclaradoMin,
        score: v.score,
        movimientos: v.movimientos,
        movimientos_podados: v.podados,
        requiere_consentimiento: v.requiereConsentimiento,
        zonas: v.zonas,
        riesgos: v.riesgos,
        modelo: resPlanes.modelo,
        coste_usd: resPlanes.costeUsd,
        tokens_in: resPlanes.tokensIn,
        tokens_out: resPlanes.tokensOut,
        estado: 'propuesto',
        expira_en: expiraEn,
      }));
      let persistidos = 0;
      if (filas.length > 0) {
        const { error: errIns } = await svc.from('planes_ia').insert(filas);
        if (errIns) {
          console.error(
            `[planes_ia] NO SE PUDO GUARDAR el plan: ${errIns.message}. ` +
            'Aplica migrations/planes-ia-motor-generativo.sql o los planes no quedan auditados.',
          );
        } else {
          persistidos = filas.length;
        }
      }

      auditar(svc, resPlanes, {
        negocioId,
        usuarioId: user.id,
        funcionIA,
        superficie: 'organizador',
        contexto: {
          dias,
          citas: citas.length,
          movibles: movibles.length,
          planes_propuestos: brutos.length,
          planes_validos: validados.length,
          movimientos_podados: validados.reduce((n, v) => n + v.podados.length, 0),
          persistidos,
        },
      });

      return json({
        ok: true,
        planes: validados,
        expiraEn,
        modelo: resPlanes.modelo,
        costeUsd: resPlanes.costeUsd,
        latenciaMs: Date.now() - t0,
        // Utiles para depurar por que un plan no aparece.
        propuestos: brutos.length,
        persistidos,
        desfaseRelojMin: desfaseRuntimeMin(desde),
      });
    }

    // --- Llamada al modelo: perfil calidad (gemini-3.7-flash primero). ---
    const resultado = await llamarIAJson<AnalisisIA>(apiKey, {
      funcion: funcionIA,
      mensajes: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: contexto },
      ],
      maxTokens: 1600,
      perfil: 'calidad',
    });
    const analisis = resultado.datos;

    // Sanidad minima del JSON devuelto.
    if (!analisis || !Array.isArray(analisis.recomendaciones)) {
      throw new Error('respuesta del modelo sin recomendaciones');
    }
    analisis.recomendaciones = analisis.recomendaciones.slice(0, 5);

    auditar(svc, resultado, {
      negocioId,
      usuarioId: user.id,
      funcionIA,
      superficie: 'organizador',
      contexto: { dias, citas: citas.length, problemas: problemas.length },
    });

    return json({
      ok: true,
      analisis,
      modelo: resultado.modelo,
      costeUsd: resultado.costeUsd,
      latenciaMs: Date.now() - t0,
      problemasDeterministas: problemas.length,
    });
  } catch (e) {
    auditarFallo(svc, {
      negocioId: negocioAudit,
      usuarioId: usuarioAudit,
      funcionIA: funcionAudit,
      error: String(e),
      latenciaMs: Date.now() - t0,
    });
    return json({ error: String(e) }, 500);
  }
});
