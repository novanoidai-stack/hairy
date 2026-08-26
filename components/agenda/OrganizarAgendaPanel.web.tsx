import React, { useEffect, useMemo, useState } from 'react';
import { useGlobalSearchParams } from 'expo-router';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { ejecutarAccion } from '@/lib/chispaOps';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import {
  analizarAgendaDia,
  analizarAgendaRango,
  estrategiaAMovimientos,
  prepararCitas,
  type ProblemaAgenda,
  type CitaOrganizar,
  type HorarioProfesional,
  type CierreNegocio,
} from '@/lib/organizarAgenda';
import { toUpdate, type EstrategiaRetraso, type UpdateRetraso } from '@/lib/retrasos';
import { evaluarTodas, type MotorOpts } from '@/lib/organizador/motorPropuestas';
import type { MovimientoCandidato, PropuestasCita } from '@/lib/organizador/__types';
import {
  validarPlanes,
  rehidratarPlan,
  planAMovimientos,
  planAUpdates,
  type PlanIABruto,
  type PlanIAValidado,
  type ValidarPlanOpts,
} from '@/lib/organizador/planIA';
import { proponerCambioCita, avisoRiesgoPropuesta } from '@/lib/propuestasCambio';
import RetrasoEstrategiasModal from './RetrasoEstrategiasModal';
import CerebroIAIcon from './CerebroIAIcon';

// Panel "Organizar mi agenda" (Sesion 5, PLAN-IA-CHISPA-V2-REDISENO.md): analiza
// el dia de HOY (determinista, sin LLM: lib/organizarAgenda.ts) y ofrece un
// arreglo de un clic por cada retraso/solape/hueco/reposo detectado. Funciona
// sin usar el chatbot. Aplica escribiendo via chispaOps.ejecutarAccion con la
// MISMA accion 'optimizar_agenda' que usa Chispa (mismo camino de escritura +
// auditoria en citas_historial).
//
// Guardrail de demo: igual que ChispaPanel, en la demo compartida (IS_DEMO_MODE
// o negocio_id === 'demo_salon_001') las escrituras se SIMULAN — el visitante ve
// el flujo completo pero no se toca la fila real.

const T = {
  panel: DESIGN_TOKENS.bgPanel,
  card: DESIGN_TOKENS.bgCard,
  cardHi: DESIGN_TOKENS.bgCardHi,
  border: DESIGN_TOKENS.borderHi,
  text: DESIGN_TOKENS.text,
  textSec: DESIGN_TOKENS.textSecondary,
  textTer: DESIGN_TOKENS.textTertiary,
  primary: DESIGN_TOKENS.primary,
  primaryHi: DESIGN_TOKENS.primaryHi,
  primarySoft: DESIGN_TOKENS.primarySoft,
  amber: DESIGN_TOKENS.warning,
  amberSoft: DESIGN_TOKENS.warningSoft,
  success: DESIGN_TOKENS.success,
  successSoft: DESIGN_TOKENS.successSoft,
  danger: DESIGN_TOKENS.danger,
  dangerSoft: DESIGN_TOKENS.dangerSoft,
};
const FIRE = DESIGN_TOKENS.fireGradient;

interface CitaCruda {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string | null;
  fin_espera?: string | null;
  estado: string;
  profesional_id: string;
  servicio_id?: string | null;
  cliente_id?: string | null;
  grupo_id?: string | null;
}

export interface OrganizarAgendaPanelProps {
  citas: CitaCruda[];
  profesionales: { id: string; nombre: string; categoria?: string | null; activo?: boolean }[];
  clientes: { id: string; nombre: string; telefono?: string | null }[];
  servicios: { id: string; nombre: string; categoria_minima?: string | null; duracion_minima_min?: number | null }[];
  bloqueos?: { profesional_id: string; inicio: string; fin: string }[];
  horarios?: { dia_semana: number; abierto: boolean; apertura: string | null; cierre: string | null }[];
  // Jornada real de cada profesional (horarios_profesional). Sin esto el panel
  // usaba la ventana del SALON para todos y podia proponer horas en las que la
  // persona no trabaja. El badge de la rejilla ya lo pasaba; el panel no, y por
  // eso "el organizador no respeta los horarios del trabajador".
  horariosProfesional?: HorarioProfesional[];
  // Cierres del salon (festivos / cierres_negocio). Sin esto el panel no sabia
  // que un dia esta cerrado y trataba las citas de ese dia como validas.
  cierres?: CierreNegocio[];
  limites?: { maxAdelantoMin?: number; umbralHuecoMin?: number; margenReaccionMin?: number };
  negocioId: string;
  isMobile?: boolean;
  // Dia que se esta viendo en la agenda. Sin esto el panel analizaba siempre HOY
  // y el numero de problemas no cuadraba con lo que hay en pantalla.
  fechaVista?: Date;
  onClose: () => void;
  onAplicado: (updates: UpdateRetraso[]) => void;
  // Resalta el problema en la rejilla ("Enseñamelo"). Si no se pasa, no se ofrece.
  onEnsenar?: (problema: ProblemaAgenda) => void;
  // "Enséñamelo" de un PLAN de Chispa: la secuencia completa, un paso por
  // movimiento, para que el navegador de la rejilla los recorra en orden.
  onEnsenarPlan?: (pasos: ProblemaAgenda[], indice: number) => void;
}

function iconoTipo(tipo: ProblemaAgenda['tipo']) {
  switch (tipo) {
    case 'retraso':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case 'solape':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
    case 'fuera_jornada':
      // Triangulo de advertencia: una cita mal colocada que el salon tiene que
      // reubicar. Casi tan urgente como un solape (peso 3800 vs 4000).
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case 'hueco_vacio':
      // Verde, igual que la etiqueta "Hueco libre" de la rejilla: es una
      // oportunidad que llenar, no una averia que arreglar.
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" /></svg>;
    case 'sin_confirmar':
      // Reloj con interrogacion: la cita existe pero nadie la ha confirmado.
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case 'no_show_riesgo':
      // Usuario tachado: el cliente tiene ausencias previas.
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><line x1="17" y1="8" x2="22" y2="13" /><line x1="22" y1="8" x2="17" y2="13" /></svg>;
    case 'jornada_sin_cubrir':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    case 'config_faltante':
      // Engranaje: falta configuracion del salon.
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    default:
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>;
  }
}
function fondoTipo(tipo: ProblemaAgenda['tipo']): string {
  if (tipo === 'retraso') return T.amberSoft;
  if (tipo === 'solape') return T.dangerSoft;
  if (tipo === 'fuera_jornada') return T.dangerSoft;
  if (tipo === 'hueco_vacio') return T.successSoft;
  if (tipo === 'sin_confirmar' || tipo === 'no_show_riesgo' || tipo === 'config_faltante') return T.amberSoft;
  return T.primarySoft;
}

// Fase 2 — motor de propuestas. Un candidato es "directamente aplicable" si NO
// cambia de dia ni de profesional (compactar / aprovechar reposo): el salon se
// reorganiza a si mismo, igual que las estrategias existentes, y no afecta a la
// cita de la clienta. Los que cambian dia/profesional (cambiar_dia /
// cambiar_trabajador) SI la afectan y, por decision de diseno, NO se aplican en
// caliente: se muestran como sugerencia y su aplicacion queda para "Proponer al
// cliente" (Fase 3).
function esDirecto(c: MovimientoCandidato): boolean {
  return c.tipo === 'compactar' || c.tipo === 'aprovechar_reposo';
}
// YYYY-MM-DD en hora local del salon. Mismo patron que el inline de
// aplicarEstrategia, pero reutilizable: el motor opera sobre cualquier dia del
// rango (semana), asi que la fecha de la accion sale del destino del movimiento.
function fechaIsoLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function OrganizarAgendaPanel({
  citas, profesionales, clientes, servicios, bloqueos, horarios, horariosProfesional, cierres, limites, negocioId, isMobile,
  fechaVista, onClose, onAplicado, onEnsenar, onEnsenarPlan,
}: OrganizarAgendaPanelProps) {
  const esDemoCompartida = IS_DEMO_MODE || negocioId === 'demo_salon_001';
  // Arnes de pruebas SOLO con ?orgnow=<ISO> en la URL (mismo espiritu que
  // ?chispatest=1/?vozab=1 en ChispaPanel): fija la hora "ahora" del analisis
  // para poder verificar retrasos/huecos sin depender del reloj real ni de
  // que la hora de cierre del negocio ya haya pasado.
  const { orgnow } = useGlobalSearchParams<{ orgnow?: string }>();
  const ahoraOverrideMs = useMemo(() => {
    if (!orgnow) return undefined;
    const t = new Date(orgnow).getTime();
    return Number.isNaN(t) ? undefined : t;
  }, [orgnow]);
  const [userId, setUserId] = useState<string | null>(null);
  const [aplicandoId, setAplicandoId] = useState<string | null>(null);
  const [aplicandoTodo, setAplicandoTodo] = useState(false);
  const [resueltasDemo, setResueltasDemo] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [avisoDemo, setAvisoDemo] = useState('');
  const [retrasoAbierto, setRetrasoAbierto] = useState<ProblemaAgenda | null>(null);
  // Fase 2: vista multídia. 'dia' = el dia visible en la rejilla (comportamiento
  // historico); 'semana' = hoy + 7 dias, agrupado por fecha. Es la "vision
  // multídia" que pide el usuario: ver problemas futuros y poder mover a otro
  // dia, no solo reorganizar el dia actual.
  const [vista, setVista] = useState<'dia' | 'semana'>('dia');
  // Latido: contador que se incrementa cada 75 s para que el useMemo de
  // problemas recalcule con un "ahora" fresco. Asi el organizador "tiene
  // latidos constantes" (req. del usuario): reevalua aunque nadie pulse nada,
  // p.ej. cuando una cita se va quedando retrasada por el paso del tiempo.
  const [latidoTick, setLatidoTick] = useState(0);
  // Fase 4 — "Análisis de Chispa": capa de IA (edge agenda-optimizador) que
  // busca PATRONES que el motor determinista no ve (huecos recurrentes,
  // descompensacion de carga, servicios que dejan minutos muertos...). Se pide
  // al abrir el panel y al cambiar de vista; no en cada latido (gasta tokens).
  const [analizandoIA, setAnalizandoIA] = useState(false);
  const [analisisIA, setAnalisisIA] = useState<{
    resumen: string;
    metricas?: { nombre: string; valor: string }[];
    recomendaciones: {
      tipo: string;
      titulo: string;
      detalle: string;
      impacto_min?: number;
      confianza?: string;
    }[];
  } | null>(null);
  const [errorIA, setErrorIA] = useState('');
  // true para errores que no tiene sentido reintentar (sin addon, cupo agotado).
  const [errorIAPermanente, setErrorIAPermanente] = useState(false);

  const pedirAnalisisIA = async () => {
    if (esDemoCompartida) return; // la demo no gasta tokens del analisis real
    setAnalizandoIA(true);
    setErrorIA('');
    try {
      const { data, error } = await supabase.functions.invoke('agenda-optimizador', {
        body: { dias: vista === 'semana' ? 7 : 1, desde: (fechaVista ?? new Date()).toISOString() },
      });
      if (error || !data?.ok) {
        // 402 (sin addon de IA) y 429 (cupo por hora agotado): aviso claro, sin
        // boton de reintentar que solo llevaria al mismo error.
        if (data?.codigo === 'addon_ia_insuficiente') {
          setErrorIA('El análisis con IA es parte del addon de Chispa. Actívalo en Configuración para usarlo.');
          setErrorIAPermanente(true);
        } else if (data?.codigo === 'cupo_agotado') {
          setErrorIA('Has llegado al límite de análisis por hora. Espera un poco y vuelve a intentarlo.');
          setErrorIAPermanente(true);
        } else {
          setErrorIA(error?.message ?? data?.error ?? 'No se pudo analizar la agenda.');
          setErrorIAPermanente(false);
        }
        setAnalisisIA(null);
      } else {
        setAnalisisIA(data.analisis);
      }
    } catch (e) {
      setErrorIA('No se pudo analizar la agenda.');
    } finally {
      setAnalizandoIA(false);
    }
  };

  useEffect(() => {
    pedirAnalisisIA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, fechaVista?.toDateString()]);


  useEffect(() => {
    let cancel = false;
    getUserProfile().then((p) => { if (!cancel) setUserId(p?.id ?? null); });
    return () => { cancel = true; };
  }, []);

  // Latido proactivo: cada 75 s, mientras el panel este abierto, reevalua.
  // No reevaluamos mientras se esta aplicando algo (bloqueado) para no pisar.
  useEffect(() => {
    const id = setInterval(() => setLatidoTick((t) => t + 1), 75000);
    return () => clearInterval(id);
  }, []);

  // Mismo adaptador que usa el contador de la rejilla (lib/organizarAgenda.ts):
  // si divergen, el badge y este panel cuentan cosas distintas.
  const citasHoy: CitaOrganizar[] = useMemo(
    () => prepararCitas(citas, clientes, servicios),
    [citas, clientes, servicios],
  );

  const citasPorId = useMemo(() => new Map(citasHoy.map((c) => [c.id, c])), [citasHoy]);

  const diaMs = fechaVista ? +fechaVista : undefined;
  // Fase 2: en modo 'semana' se analiza hoy + 7 dias con analizarAgendaRango
  // (cada problema queda etiquetado con su fechaDia). En modo 'dia' sigue
  // usando analizarAgendaDia sobre el dia visible (comportamiento historico).
  // `latidoTick` entra en las deps para forzar el recálculo cada 75 s.
  const problemas = useMemo(
    () => {
      const ahora = ahoraOverrideMs ?? Date.now();
      const base = {
        ahoraMs: ahora,
        bloqueos,
        horarios,
        // Fixes Fase 1: horario real del profesional + cierres del salon. Sin
        // esto el panel divergia del badge de la rejilla y proponia horas en
        // tramos no laborables o dias cerrados.
        horariosProfesional,
        cierres,
        maxAdelantoMin: limites?.maxAdelantoMin,
        umbralHuecoMin: limites?.umbralHuecoMin,
        // Fase 4: avisos suaves (sin confirmar, riesgo de ausencia, jornada sin
        // cubrir, config faltante). El badge de la rejilla NO los pide: siguen
        // contando solo retrasos/solapes/huecos/fuera de jornada.
        detectarAvisos: true,
      };
      if (vista === 'semana') {
        const desde = new Date(ahora);
        desde.setHours(0, 0, 0, 0);
        const hasta = new Date(desde);
        hasta.setDate(hasta.getDate() + 7);
        return analizarAgendaRango(citasHoy, profesionales, { ...base, desdeMs: +desde, hastaMs: +hasta });
      }
      return analizarAgendaDia(citasHoy, profesionales, { ...base, diaMs });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [citasHoy, profesionales, ahoraOverrideMs, diaMs, bloqueos, horarios, horariosProfesional, cierres, limites, vista, latidoTick],
  );

  // Fase 2 — motor de propuestas. Para cada cita movible evalua miles de
  // movimientos (deltas de 15 min, cambio de trabajador, cambio de dia +/-7) y
  // los puntua. Es lo que el usuario pide con "deberias de poder evaluar miles
  // de posibles cambios". Comparte deps con `problemas` (mismo `ahora`, mismo
  // latido de 75 s) para que detector y motor no diverjan.
  const propuestasPorCita = useMemo(() => {
    if (!citasHoy.length) return new Map<string, PropuestasCita>();
    const ahora = ahoraOverrideMs ?? Date.now();
    let desdeMs: number;
    let hastaMs: number;
    if (vista === 'semana') {
      const d = new Date(ahora); d.setHours(0, 0, 0, 0);
      desdeMs = +d;
      const h = new Date(d); h.setDate(h.getDate() + 7);
      hastaMs = +h;
    } else {
      const d = fechaVista ? new Date(fechaVista) : new Date();
      d.setHours(0, 0, 0, 0);
      desdeMs = +d;
      const h = new Date(d); h.setDate(h.getDate() + 1);
      hastaMs = +h;
    }
    const motorOpts: MotorOpts = {
      ahoraMs: ahora, desdeMs, hastaMs,
      horarios, horariosProfesional, cierres, bloqueos,
      profesionales, maxAdelantoMin: limites?.maxAdelantoMin, umbralHuecoMin: limites?.umbralHuecoMin,
    };
    const lista = evaluarTodas(citasHoy, motorOpts);
    return new Map(lista.map((p) => [p.citaId, p] as const));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citasHoy, profesionales, ahoraOverrideMs, fechaVista, bloqueos, horarios, horariosProfesional, cierres, limites, vista, latidoTick]);

  // ── PLANES DE CHISPA (motor generativo, F1) ──────────────────────────────
  // El análisis describe patrones; un PLAN los resuelve: trae movimientos
  // concretos con botón. No se pide solo al abrir el panel (cuesta bastante más
  // que el análisis): lo dispara el usuario.
  const [planesCrudos, setPlanesCrudos] = useState<PlanIAValidado[]>([]);
  const [generandoPlanes, setGenerandoPlanes] = useState(false);
  const [errorPlanes, setErrorPlanes] = useState('');
  const [planesPedidos, setPlanesPedidos] = useState(false);
  const [planAplicado, setPlanAplicado] = useState<Set<string>>(new Set());
  const [porQueAbierto, setPorQueAbierto] = useState<string | null>(null);
  const [pasoPorPlan, setPasoPorPlan] = useState<Record<string, number>>({});

  // Opciones de validación construidas con un "ahora" FRESCO. Es una función y
  // no un useMemo a propósito: al pulsar "Aplicar" hay que revalidar contra el
  // instante del clic, no contra el del último render (§7 del informe: la
  // agenda puede haberse movido mientras la tarjeta estaba en pantalla).
  const opcionesValidacion = (): ValidarPlanOpts => ({
    ahoraMs: ahoraOverrideMs ?? Date.now(),
    citas: citasHoy,
    profesionales,
    horarios,
    horariosProfesional,
    cierres,
    bloqueos,
    maxAdelantoMin: limites?.maxAdelantoMin,
    margenReaccionMin: limites?.margenReaccionMin,
  });

  // Los planes se REVALIDAN aquí aunque el servidor ya los validara. Dos
  // motivos: el navegador tiene el estado más fresco (y el reloj del salón de
  // verdad, no el UTC del servidor), y entre generar y pintar la agenda ha
  // podido moverse. Lo que se pinta es siempre el resultado de esta pasada.
  const planes = useMemo(
    () => validarPlanes(planesCrudos.map(rehidratarPlan), opcionesValidacion())
      .filter((p) => !planAplicado.has(p.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planesCrudos, planAplicado, citasHoy, profesionales, horarios, horariosProfesional, cierres, bloqueos, limites, ahoraOverrideMs, latidoTick],
  );

  const pedirPlanes = async () => {
    setPlanesPedidos(true);
    setGenerandoPlanes(true);
    setErrorPlanes('');
    try {
      if (esDemoCompartida) {
        // La demo es el escaparate y tiene que enseñar la función entera, pero
        // sin gastar tokens. Solución: se arma un plan de EJEMPLO con los
        // mejores movimientos que el motor determinista ya ha calculado y se le
        // pasa por el MISMO validador. Todo lo que se ve —la geometría, el
        // reparto entre "aplicar" y "proponer", el score— es real; lo único de
        // atrezzo es el relato, y se dice.
        await new Promise((r) => setTimeout(r, 900));
        const mejores = [...propuestasPorCita.values()]
          .map((p) => p.candidatos.find(esDirecto) ?? p.candidatos[0])
          .filter((c): c is MovimientoCandidato => !!c)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        if (mejores.length === 0) {
          setPlanesCrudos([]);
          setErrorPlanes('Hoy la demo no tiene ningún hueco que reorganizar. En tu cuenta, Chispa buscaría aquí jugadas que el motor no sabe hacer.');
          return;
        }
        const ejemplo: PlanIABruto = {
          tipoProblema: 'reposo_alineable',
          titulo: 'Junta la mañana y libera el mediodía (ejemplo de demo)',
          diagnostico: 'Los huecos están repartidos en trozos pequeños por toda la mañana: ninguno da para una cita entera, pero juntos son casi una hora.',
          razonamiento: 'Moviendo estas citas hacia la apertura, los ratos sueltos se funden en un bloque continuo a mediodía, que es la franja de más demanda de este salón.',
          confianza: 'alta',
          impactoMin: mejores.reduce((n, c) => n + Math.max(0, c.gananciaMin), 0),
          riesgos: ['En tu cuenta este plan lo inventa la IA; aquí es un ejemplo montado con el motor para que veas cómo funciona.'],
          movimientos: mejores.map((c) => ({
            citaId: c.citaId,
            tipo: 'mover',
            inicio: new Date(c.fases.ini).toISOString(),
            profesionalId: c.cambioTrabajador ? c.profesionalId : undefined,
          })),
        };
        const validado = validarPlanes([ejemplo], opcionesValidacion());
        setPlanesCrudos(validado);
        if (validado.length === 0) {
          setErrorPlanes('Hoy la demo no tiene ningún hueco que reorganizar. En tu cuenta, Chispa buscaría aquí jugadas que el motor no sabe hacer.');
        }
        return;
      }
      const { data, error } = await supabase.functions.invoke('agenda-optimizador', {
        body: {
          modo: 'planes',
          dias: vista === 'semana' ? 7 : 1,
          desde: (fechaVista ?? new Date()).toISOString(),
        },
      });
      if (error || !data?.ok) {
        if (data?.codigo === 'addon_ia_insuficiente') {
          setErrorPlanes('Los planes de Chispa son parte del addon de IA. Actívalo en Configuración.');
        } else if (data?.codigo === 'cupo_agotado') {
          setErrorPlanes('Has llegado al límite de generaciones por hora. Espera un poco.');
        } else {
          setErrorPlanes(error?.message ?? data?.error ?? 'No se pudieron generar planes.');
        }
        setPlanesCrudos([]);
        return;
      }
      // Sin `planes` en la respuesta, el servidor NO conoce el modo: ha caído
      // al análisis de siempre. No es lo mismo que "no hay nada que proponer",
      // y decir lo segundo sería mentirle al salón.
      if (!Array.isArray(data.planes)) {
        setPlanesCrudos([]);
        setErrorPlanes('Esta parte de Chispa todavía no está activa en el servidor. Vuelve a intentarlo más tarde.');
        return;
      }
      setPlanesCrudos(data.planes as PlanIAValidado[]);
      if (data.planes.length === 0) {
        setErrorPlanes(data.motivo ?? 'Chispa no ve ninguna jugada que merezca la pena ahora mismo.');
      }
    } catch {
      setErrorPlanes('No se pudieron generar planes.');
      setPlanesCrudos([]);
    } finally {
      setGenerandoPlanes(false);
    }
  };

  // Convierte los movimientos de un plan en "problemas" sintéticos para poder
  // reutilizar tal cual el resalte de la rejilla (zona destino + zona origen +
  // flecha). Un paso por movimiento.
  const pasosDelPlan = (p: PlanIAValidado): ProblemaAgenda[] =>
    p.movimientos.map((m, i) => ({
      id: `plan:${p.id}:${i}`,
      tipo: 'hueco_muerto' as ProblemaAgenda['tipo'],
      profesionalId: m.profesionalId,
      profesionalNombre: profesionales.find((pr) => pr.id === m.profesionalId)?.nombre ?? '',
      titulo: `${p.titulo} · paso ${i + 1} de ${p.movimientos.length}`,
      descripcion: `${m.clienteNombre ?? 'La cita'} pasa a las ${new Date(m.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}${m.cambioProfesional ? ` con ${profesionales.find((pr) => pr.id === m.profesionalId)?.nombre ?? 'otra persona'}` : ''}.`,
      citaIds: [m.citaId],
      estrategias: [],
      zona: m.zona,
      zonaOrigen: m.zonaOrigen,
      accionCorta: m.desplazoMin > 0
        ? `Adelantar ${m.desplazoMin} min`
        : m.desplazoMin < 0
          ? `Retrasar ${-m.desplazoMin} min`
          : 'Reasignar',
      porQue: m.requiereConsentimiento
        ? `Necesita el visto bueno de la clienta: ${m.motivoConsentimiento}`
        : 'Se puede aplicar sin avisar a nadie: la clienta no cambia de hora, o ya está en el salón.',
      // Fecha LOCAL del salon, no el corte del ISO: `.slice(0,10)` sobre un ISO
      // en UTC devuelve el dia anterior en la madrugada española.
      fechaDia: fechaIsoLocal(+new Date(m.zona.desde)),
    }));

  async function aplicarPlan(plan: PlanIAValidado) {
    setError('');
    setAplicandoId(plan.id);
    try {
      // Revalidación contra el estado de ESTE instante (§7). Si la agenda se ha
      // movido, lo honesto es decirlo y regenerar, no aplicar a ciegas.
      const [fresco] = validarPlanes([rehidratarPlan(plan)], opcionesValidacion());
      if (!fresco || fresco.aplicablesEnCaliente === 0) {
        setError(
          fresco
            ? 'La agenda ha cambiado y ya no queda nada de este plan que se pueda aplicar sin avisar a las clientas.'
            : 'La agenda ha cambiado desde que se generó este plan. Vuelve a generarlo.',
        );
        return;
      }
      if (esDemoCompartida) {
        await new Promise((r) => setTimeout(r, 350));
        setPlanAplicado((prev) => new Set(prev).add(plan.id));
        setAvisoDemo('Hecho (demostracion). En tu cuenta esto se aplicaria de verdad; en la demo no se guardan cambios.');
        return;
      }
      if (!userId) {
        setError('No se pudo obtener tu perfil de usuario.');
        return;
      }
      const movimientos = planAMovimientos(fresco);
      const res = await ejecutarAccion(
        {
          tipo: 'optimizar_agenda',
          negocio_id: negocioId,
          fecha: fechaIsoLocal(+new Date(movimientos[0].nuevo_inicio)),
          movimientos,
          resumen: `Plan de Chispa: ${fresco.titulo}`,
        },
        userId,
      );
      if (!res.ok) {
        setError(res.error);
        // Deja rastro del intento fallido: un plan que se aplicó a medias o que
        // reventó es justo lo que hay que poder auditar después.
        supabase.rpc('planes_ia_marcar', { p_plan_id: plan.id, p_estado: 'fallido', p_resultado: res.error }).then(() => {}, () => {});
        return;
      }
      // El plan puede quedar 'parcial': lo aplicado es lo que no necesitaba
      // permiso; lo que sí lo necesita sigue pendiente de propuesta (F2).
      const parcial = fresco.requierenPropuesta > 0 || fresco.podados.length > 0;
      supabase.rpc('planes_ia_marcar', {
        p_plan_id: plan.id,
        p_estado: parcial ? 'parcial' : 'aplicado',
        p_resultado: `${movimientos.length} movimiento(s) aplicados${fresco.requierenPropuesta > 0 ? `, ${fresco.requierenPropuesta} pendiente(s) del visto bueno de la clienta` : ''}.`,
      }).then(() => {}, () => {});
      setPlanAplicado((prev) => new Set(prev).add(plan.id));
      onAplicado(planAUpdates(fresco));
    } finally {
      setAplicandoId(null);
    }
  }

  const pendientes = problemas.filter((p) => !resueltasDemo.has(p.id));

  // Que accion tendria cada problema: una estrategia (camino historico) o, si no
  // la hay (p.ej. fuera_jornada sin hueco mismo dia), el mejor candidato DIRECTO
  // del motor. Null = no hay nada aplicable de un clic (p.ej. hueco_vacio puro).
  // Asi el "Aplicar los N" tambien resuelve lo que el motor encuentre.
  const resolverProblema = (
    p: ProblemaAgenda,
  ): { kind: 'estrategia'; estrategia: EstrategiaRetraso } | { kind: 'motor'; cita: CitaOrganizar; cand: MovimientoCandidato } | null => {
    const recomendada = p.estrategias.find((e) => e.recomendada) ?? p.estrategias[0];
    if (recomendada) return { kind: 'estrategia', estrategia: recomendada };
    const citaPrincipal = p.citaIds
      .map((id) => citasPorId.get(id))
      .find((c): c is CitaOrganizar => !!c && propuestasPorCita.has(c.id));
    const cand = citaPrincipal ? propuestasPorCita.get(citaPrincipal.id)!.candidatos.find(esDirecto) : undefined;
    if (citaPrincipal && cand) return { kind: 'motor', cita: citaPrincipal, cand };
    return null;
  };
  const aplicables = pendientes.filter((p) => resolverProblema(p) !== null);

  // Oportunidades del motor: citas SIN problema donde aun cabe compactar/ganar
  // minutos. Es la prueba visible de que el organizador "evalua miles de
  // posibilidades" incluso en un dia sin retrasos ni solapes.
  const oportunidades = useMemo(() => {
    const enProblema = new Set(problemas.flatMap((p) => p.citaIds));
    const out: { cita: CitaOrganizar; cand: MovimientoCandidato }[] = [];
    for (const [id, prop] of propuestasPorCita) {
      if (enProblema.has(id)) continue;
      const cita = citasPorId.get(id);
      const cand = prop.candidatos.find(esDirecto);
      if (cita && cand) out.push({ cita, cand });
    }
    return out.sort((a, b) => b.cand.score - a.cand.score).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propuestasPorCita, citasPorId, problemas]);
  const esHoy = !fechaVista || new Date().toDateString() === fechaVista.toDateString();
  const cuandoTxt = esHoy
    ? 'hoy'
    : `el ${fechaVista!.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  async function aplicarEstrategia(problema: ProblemaAgenda, estrategia: EstrategiaRetraso) {
    setError('');
    setAplicandoId(problema.id);
    try {
      if (esDemoCompartida) {
        // Guardrail: la demo compartida nunca escribe de verdad (igual que ChispaPanel).
        await new Promise((r) => setTimeout(r, 350)); // da tiempo a ver el estado "Aplicando..."
        setResueltasDemo((prev) => new Set(prev).add(problema.id));
        setAvisoDemo('Hecho (demostracion). En tu cuenta esto se aplicaria de verdad; en la demo no se guardan cambios.');
        return true;
      }
      if (!userId) {
        setError('No se pudo obtener tu perfil de usuario.');
        return false;
      }
      const movimientos = estrategiaAMovimientos(estrategia, citasPorId);
      // La fecha de la accion es la del dia ANALIZADO, no la de hoy: el panel ya
      // puede organizar un dia futuro. En hora LOCAL del salon: con toISOString,
      // la madrugada española (UTC+1/+2) mandaba el dia anterior.
      const d = fechaVista ?? new Date();
      const fechaIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await ejecutarAccion(
        { tipo: 'optimizar_agenda', negocio_id: negocioId, fecha: fechaIso, movimientos, resumen: problema.titulo },
        userId,
      );
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      onAplicado(estrategia.updates);
      return true;
    } finally {
      setAplicandoId(null);
    }
  }

  async function aplicarRecomendada(problema: ProblemaAgenda) {
    const recomendada = problema.estrategias.find((e) => e.recomendada) ?? problema.estrategias[0];
    await aplicarEstrategia(problema, recomendada);
  }

  // Aplica un candidato DIRECTO del motor (compactar / aprovechar reposo; mismo
  // dia y mismo profesional). Mismo camino de escritura que las estrategias
  // (accion 'optimizar_agenda') => misma auditoria en citas_historial y misma
  // reversibilidad. `estadoId` es la clave del spinner: el id del problema en las
  // tarjetas, o el id de la cita en las oportunidades.
  async function aplicarCandidato(estadoId: string, cita: CitaOrganizar, cand: MovimientoCandidato) {
    setError('');
    setAplicandoId(estadoId);
    try {
      if (esDemoCompartida) {
        await new Promise((r) => setTimeout(r, 350)); // da tiempo a ver "Aplicando..."
        setResueltasDemo((prev) => new Set(prev).add(estadoId));
        setAvisoDemo('Hecho (demostracion). En tu cuenta esto se aplicaria de verdad; en la demo no se guardan cambios.');
        return true;
      }
      if (!userId) {
        setError('No se pudo obtener tu perfil de usuario.');
        return false;
      }
      const f = cand.fases;
      const mov = {
        cita_id: cita.id,
        nuevo_inicio: new Date(f.ini).toISOString(),
        nuevo_fin: new Date(f.fin).toISOString(),
        nuevo_fin_activa: cita.fin_activa ? new Date(f.finA).toISOString() : undefined,
        nuevo_fin_espera: cita.fin_espera ? new Date(f.finE).toISOString() : undefined,
        nuevo_profesional_id: cand.cambioTrabajador ? cand.profesionalId : undefined,
        cliente_nombre: cita.cliente ?? '',
      };
      const res = await ejecutarAccion(
        { tipo: 'optimizar_agenda', negocio_id: negocioId, fecha: fechaIsoLocal(f.ini), movimientos: [mov], resumen: `Motor: ${cand.razonScore}` },
        userId,
      );
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      onAplicado([toUpdate(cita, f)]);
      return true;
    } finally {
      setAplicandoId(null);
    }
  }

  // Dispatch unificado: resuelve si el problema se ataca con estrategia o con el
  // motor, y lo aplica. Lo usa tanto el boton de tarjeta como "Aplicar los N".
  async function aplicarResolver(problema: ProblemaAgenda) {
    const r = resolverProblema(problema);
    if (!r) return false;
    if (r.kind === 'estrategia') return aplicarEstrategia(problema, r.estrategia);
    return aplicarCandidato(problema.id, r.cita, r.cand);
  }

  async function aplicarTodos() {
    setAplicandoTodo(true);
    setError('');
    for (const p of aplicables) {
      const ok = await aplicarResolver(p);
      if (!ok) break; // se detiene y muestra el error; lo ya aplicado queda aplicado
    }
    setAplicandoTodo(false);
  }

  // Fase 3 — Proponer al cliente un ADELANTO en vez de aplicarlo en caliente.
  // Reutiliza proponer_cambio_cita (RPC existente): envia WhatsApp, retiene el
  // hueco con reserva_temporal y NO mueve la cita hasta que la clienta conteste
  // en /app/cita/[id]?propuesta=... . La RPC solo admite horas ANTERIORES a la
  // actual de la cita, por eso el boton solo aparece cuando el candidato del
  // motor es anterior (el caller ya lo garantiza; aqui no se revalida).
  async function proponerAlCliente(estadoId: string, cita: CitaOrganizar, cand: MovimientoCandidato) {
    setError('');
    setAvisoDemo('');
    setAplicandoId(estadoId);
    try {
      if (esDemoCompartida) {
        await new Promise((r) => setTimeout(r, 350));
        setAvisoDemo('Hecho (demostracion). En tu cuenta se enviaria el WhatsApp y se reservaria el hueco hasta que conteste.');
        return;
      }
      if (!userId) {
        setError('No se pudo obtener tu perfil de usuario.');
        return;
      }
      const inicioPropuesto = new Date(cand.fases.ini).toISOString();
      const res = await proponerCambioCita(cita.id, inicioPropuesto, limites?.margenReaccionMin);
      if (!res.ok) {
        setError(
          res.sinTelefono
            ? 'Esta clienta no tiene telefono en ficha: no se le puede avisar por WhatsApp.'
            : (res.error || 'No se pudo proponer el cambio. Quiza la hora ya no es valida.'),
        );
        return;
      }
      setAvisoDemo(`Propuesta enviada por WhatsApp. ${avisoRiesgoPropuesta(res.expiraAt)}`);
    } finally {
      setAplicandoId(null);
    }
  }

  const bloqueado = aplicandoTodo || aplicandoId !== null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,6,4,0.42)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: isMobile ? '86vh' : '85vh', overflowY: 'auto',
          background: T.panel, borderRadius: isMobile ? '20px 20px 0 0' : 20, border: `1px solid ${T.border}`,
          boxShadow: '0 24px 60px rgba(40,30,24,0.22)', fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, background: T.panel, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: 10, background: T.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CerebroIAIcon size={22} variant={analizandoIA ? 'thinking' : pendientes.length > 0 ? 'alerta' : 'idle'} />
            </span>
            <div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: T.text }}>Organizar mi agenda</div>
              <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 2 }}>
                {pendientes.length === 0
                  ? `Tu agenda de ${vista === 'semana' ? 'la semana' : cuandoTxt} esta en orden`
                  : `${pendientes.length} problema${pendientes.length > 1 ? 's' : ''} detectado${pendientes.length > 1 ? 's' : ''} ${vista === 'semana' ? 'esta semana' : cuandoTxt}`}
              </div>
              {propuestasPorCita.size > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, padding: '3px 9px', borderRadius: 999, background: T.primarySoft, color: T.primaryHi, fontSize: 11, fontWeight: 700, alignSelf: 'flex-start' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  Motor activo · {propuestasPorCita.size} cita{propuestasPorCita.size > 1 ? 's' : ''} analizadas
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ padding: 6, background: 'transparent', border: 'none', color: T.textTer, cursor: 'pointer', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Segmentos de vista: día (lo visible en la rejilla) vs semana (hoy+7).
            La semana deja ver problemas futuros y citas fuera de jornada de los
            próximos días, no solo el día actual. */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 20px 0' }}>
          {(['dia', 'semana'] as const).map((v) => {
            const activo = vista === v;
            return (
              <button
                key={v}
                onClick={() => setVista(v)}
                disabled={bloqueado}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer',
                  background: activo ? T.primarySoft : T.card,
                  color: activo ? T.primaryHi : T.textSec,
                  border: `1px solid ${activo ? T.primaryHi : T.border}`,
                }}
              >
                {v === 'dia' ? (esHoy ? 'Hoy' : 'Este día') : 'Esta semana'}
              </button>
            );
          })}
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '14px 20px 20px' }}>
          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: T.dangerSoft, color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}
          {avisoDemo && !error && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: T.successSoft, color: T.success, fontSize: 13, marginBottom: 12 }}>{avisoDemo}</div>
          )}

          {/* `planesPedidos` entra en la condicion para que el dia limpio no se
              coma la seccion de planes: en cuanto se pulsa "Buscar planes" hay
              que pasar a la vista de contenido para poder pintarlos. */}
          {pendientes.length === 0 && oportunidades.length === 0 && !analizandoIA && !analisisIA && !planesPedidos ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 10px', textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 999, background: T.successSoft, alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <div style={{ fontSize: 14, color: T.textSec, maxWidth: 320 }}>
                Sin retrasos, solapes ni huecos muertos por resolver. Vuelve a pulsar este boton si algo cambia durante el dia.
              </div>
              {/* Que no haya averias no significa que no haya nada que ganar:
                  los planes buscan justo lo que el motor no sabe ver. */}
              <button
                onClick={pedirPlanes}
                disabled={bloqueado}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.card, color: T.textSec, fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer' }}
              >
                <CerebroIAIcon size={15} variant="idle" />
                Buscar planes de Chispa
              </button>
              {esDemoCompartida && (
                <div style={{ fontSize: 12.5, color: T.textTer, maxWidth: 340, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CerebroIAIcon size={16} variant="idle" />
                  En tu cuenta, aquí Chispa analiza tu agenda con IA buscando patrones y optimizaciones.
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                // En modo semana agrupamos por fechaDia con una cabecera por dia;
                // en modo dia listamos plano (como antes).
                type Cabecera = { key: string; fecha?: string; problemas: ProblemaAgenda[] };
                const grupos: Cabecera[] = vista === 'semana'
                  ? Object.values(
                      pendientes.reduce<Record<string, Cabecera>>((acc, p) => {
                        const k = p.fechaDia ?? 'sindia';
                        (acc[k] ??= { key: k, fecha: p.fechaDia, problemas: [] }).problemas.push(p);
                        return acc;
                      }, {}),
                    ).sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))
                  : [{ key: 'unico', problemas: pendientes }];

                const fmtFecha = (ymd: string) => {
                  const d = new Date(`${ymd}T00:00:00`);
                  const hoy = new Date();
                  const manana = new Date(); manana.setDate(hoy.getDate() + 1);
                  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
                  if (d.toDateString() === manana.toDateString()) return 'Mañana';
                  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                };

                return grupos.flatMap((g) => {
                  const elems: React.ReactElement[] = [];
                  if (g.fecha && vista === 'semana') {
                    elems.push(
                      <div key={`h-${g.key}`} style={{ fontSize: 11.5, fontWeight: 800, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6, marginBottom: 2, paddingLeft: 2 }}>
                        {fmtFecha(g.fecha)} · {g.problemas.length}
                      </div>,
                    );
                  }
                  for (const p of g.problemas) {
                    const recomendada = p.estrategias.find((e) => e.recomendada) ?? p.estrategias[0] ?? null;
                    // Fase 2: propuesta del motor para la cita principal del problema.
                    // 'directo' = compactar/reposo mismo dia (aplicable ya); 'cruzado'
                    // = cambia dia/profesional (solo sugerencia: Fase 3 lo aplicara
                    // via "Proponer al cliente", no en caliente).
                    const citaPrincipal = p.citaIds
                      .map((id) => citasPorId.get(id))
                      .find((c): c is CitaOrganizar => !!c && propuestasPorCita.has(c.id));
                    const candProp = citaPrincipal ? propuestasPorCita.get(citaPrincipal.id) : undefined;
                    const motorDirecto = !recomendada ? candProp?.candidatos.find(esDirecto) : undefined;
                    const motorCruzado = candProp?.candidatos.find((c) => c.tipo === 'cambiar_dia' || c.tipo === 'cambiar_trabajador');
                    const aplicandoEsta = aplicandoId === p.id;
                    elems.push((
                  <div key={p.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, background: fondoTipo(p.tipo), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {iconoTipo(p.tipo)}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text, flex: 1, minWidth: 0 }}>{p.titulo}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.textTer, whiteSpace: 'nowrap' }}>{p.profesionalNombre}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.45, marginLeft: 34 }}>{p.descripcion}</div>
                    {recomendada ? (
                      <div style={{ fontSize: 12.5, color: T.primaryHi, lineHeight: 1.4, marginLeft: 34, fontWeight: 600 }}>→ {recomendada.resumen}</div>
                    ) : motorDirecto ? (
                      <div style={{ fontSize: 12.5, color: T.primaryHi, lineHeight: 1.4, marginLeft: 34, fontWeight: 600 }}>→ {motorDirecto.razonScore}</div>
                    ) : null}
                    {/* Por que esa hora y no otra. Sin esto la propuesta parece un
                        capricho ("¿por que a las 14:30 y no a las 14:00?"): casi
                        siempre la respuesta es el tope de adelanto del salon. */}
                    {p.porQue && (
                      <div style={{ display: 'flex', gap: 6, marginLeft: 34, alignItems: 'flex-start' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textTer} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}>
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span style={{ fontSize: 11.5, color: T.textTer, lineHeight: 1.4 }}>{p.porQue}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginLeft: 34, marginTop: 2, flexWrap: 'wrap' }}>
                      {recomendada ? (
                        <button
                          onClick={() => aplicarRecomendada(p)}
                          disabled={bloqueado}
                          style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: aplicandoEsta ? T.primarySoft : FIRE, color: aplicandoEsta ? T.primaryHi : '#fff', fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado && !aplicandoEsta ? 0.5 : 1 }}
                        >
                          {aplicandoEsta ? 'Aplicando...' : 'Aplicar'}
                        </button>
                      ) : motorDirecto && citaPrincipal ? (
                        <button
                          onClick={() => aplicarCandidato(p.id, citaPrincipal, motorDirecto)}
                          disabled={bloqueado}
                          style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: aplicandoEsta ? T.primarySoft : FIRE, color: aplicandoEsta ? T.primaryHi : '#fff', fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado && !aplicandoEsta ? 0.5 : 1 }}
                        >
                          {aplicandoEsta ? 'Aplicando...' : 'Aplicar'}
                        </button>
                      ) : motorCruzado ? (
                        <span style={{ padding: '7px 0', fontSize: 11.5, color: T.textTer, fontWeight: 600, lineHeight: 1.4 }}>
                          El motor no encuentra hueco hoy. {motorCruzado.razonScore} — requiere avisar al cliente (próxima fase).
                        </span>
                      ) : (
                        <span style={{ padding: '7px 0', fontSize: 11.5, color: T.textTer, fontWeight: 600 }}>
                          Nada que mover: es un aviso para llenarlo tu.
                        </span>
                      )}
                      {/* Proponer al cliente: solo cuando hay candidato directo del
                          motor (mismo dia/profesional) Y es un adelanto (la RPC
                          proponer_cambio_cita rechaza horas posteriores). Es la
                          alternativa "pregunta antes de mover" al Aplicar en frio. */}
                      {motorDirecto && citaPrincipal && motorDirecto.fases.ini < +new Date(citaPrincipal.inicio) && (
                        <button
                          onClick={() => proponerAlCliente(p.id, citaPrincipal, motorDirecto)}
                          disabled={bloqueado}
                          style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.primaryHi}`, background: 'transparent', color: T.primaryHi, fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado ? 0.5 : 1 }}
                        >
                          Proponer al cliente
                        </button>
                      )}
                      {onEnsenar && (
                        <button
                          onClick={() => onEnsenar(p)}
                          style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSec, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Enséñamelo
                        </button>
                      )}
                      {p.tipo === 'retraso' && p.estrategias.length > 1 && (
                        <button
                          onClick={() => setRetrasoAbierto(p)}
                          disabled={bloqueado}
                          style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSec, fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado ? 0.5 : 1 }}
                        >
                          Ver opciones
                        </button>
                      )}
                    </div>
                    {recomendada && motorCruzado && (
                      <div style={{ fontSize: 11.5, color: T.textTer, lineHeight: 1.4, marginLeft: 34 }}>
                        El motor también ve: {motorCruzado.razonScore} (requiere avisar al cliente).
                      </div>
                    )}
                  </div>
                    ));
                  }
                  return elems;
                });
              })()}
              {/* Planes de Chispa (motor generativo, F1). Va ENCIMA del
                  análisis a propósito: un plan es accionable y el análisis no.
                  Cada tarjeta es una solución inventada por la IA que ya ha
                  pasado por el validador determinista (mismas fases, mismos
                  horarios, mismos topes que el motor barato). */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: pendientes.length > 0 || oportunidades.length > 0 ? 6 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                  <CerebroIAIcon size={16} variant={generandoPlanes ? 'thinking' : planes.length > 0 ? 'alerta' : 'idle'} />
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 }}>
                    Planes de Chispa{planes.length > 0 ? ` · ${planes.length}` : ''}
                  </span>
                  {!generandoPlanes && (
                    <button
                      onClick={pedirPlanes}
                      disabled={bloqueado}
                      style={{ padding: '3px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSec, fontSize: 11, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer' }}
                    >
                      {planesPedidos ? 'Volver a buscar' : 'Buscar planes'}
                    </button>
                  )}
                </div>

                {generandoPlanes ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.textSec }}>
                    <CerebroIAIcon size={20} variant="thinking" />
                    Buscando jugadas que el motor no sabe hacer...
                  </div>
                ) : !planesPedidos ? (
                  <div style={{ padding: '12px 14px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.textSec, lineHeight: 1.5 }}>
                    Cuando el motor no encuentra arreglo, Chispa puede inventar uno: una secuencia de movimientos concreta, con su porqué y su botón. Pulsa <strong>Buscar planes</strong>.
                  </div>
                ) : planes.length === 0 ? (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, fontSize: 12, color: T.textSec }}>
                    {errorPlanes || 'Chispa no ve ninguna jugada que merezca la pena ahora mismo.'}
                  </div>
                ) : (
                  planes.map((p) => {
                    const aplicandoEste = aplicandoId === p.id;
                    const pasos = pasosDelPlan(p);
                    const paso = pasoPorPlan[p.id] ?? 0;
                    const abierto = porQueAbierto === p.id;
                    const tonoConfianza = p.confianza === 'alta' ? T.success : p.confianza === 'media' ? T.amber : T.textTer;
                    const fondoConfianza = p.confianza === 'alta' ? T.successSoft : p.confianza === 'media' ? T.amberSoft : T.cardHi;
                    return (
                      <div key={p.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, background: T.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <CerebroIAIcon size={15} variant="idle" glow={0.5} />
                          </span>
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text, flex: 1, minWidth: 0 }}>{p.titulo}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 999, background: fondoConfianza, color: tonoConfianza, fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                            {p.confianza}
                          </span>
                        </div>

                        <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.45, marginLeft: 34 }}>{p.diagnostico}</div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 34 }}>
                          {p.impactoMin > 0 && (
                            <span style={{ padding: '3px 9px', borderRadius: 999, background: T.successSoft, color: T.success, fontSize: 11, fontWeight: 700 }}>
                              +{p.impactoMin} min de agenda
                            </span>
                          )}
                          <span style={{ padding: '3px 9px', borderRadius: 999, background: T.primarySoft, color: T.primaryHi, fontSize: 11, fontWeight: 700 }}>
                            {p.movimientos.length} movimiento{p.movimientos.length > 1 ? 's' : ''}
                          </span>
                          {p.requierenPropuesta > 0 && (
                            <span style={{ padding: '3px 9px', borderRadius: 999, background: T.amberSoft, color: T.amber, fontSize: 11, fontWeight: 700 }}>
                              {p.requierenPropuesta} necesita{p.requierenPropuesta > 1 ? 'n' : ''} el visto bueno de la clienta
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginLeft: 34, marginTop: 2, flexWrap: 'wrap' }}>
                          {p.aplicablesEnCaliente > 0 ? (
                            <button
                              onClick={() => aplicarPlan(p)}
                              disabled={bloqueado}
                              style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: aplicandoEste ? T.primarySoft : FIRE, color: aplicandoEste ? T.primaryHi : '#fff', fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado && !aplicandoEste ? 0.5 : 1 }}
                            >
                              {aplicandoEste ? 'Aplicando...' : `Aplicar ${p.aplicablesEnCaliente}`}
                            </button>
                          ) : (
                            <span style={{ padding: '7px 0', fontSize: 11.5, color: T.textTer, fontWeight: 600, lineHeight: 1.4, maxWidth: 300 }}>
                              Todo este plan afecta a la hora de alguna clienta, así que no se aplica en frío: hay que proponérselo.
                            </span>
                          )}
                          {onEnsenarPlan && pasos.length > 0 && (
                            <button
                              onClick={() => {
                                onEnsenarPlan(pasos, paso);
                                setPasoPorPlan((prev) => ({ ...prev, [p.id]: (paso + 1) % pasos.length }));
                              }}
                              style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSec, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {pasos.length > 1 ? `Enséñamelo (${pasos.length} pasos)` : 'Enséñamelo'}
                            </button>
                          )}
                          <button
                            onClick={() => setPorQueAbierto(abierto ? null : p.id)}
                            style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.border}`, background: abierto ? T.cardHi : 'transparent', color: T.textSec, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                          >
                            ¿Por qué?
                          </button>
                        </div>

                        {/* La explicabilidad es lo que hace que un peluquero se
                            fíe de un plan inventado por una máquina. Aquí va
                            todo: el razonamiento, los riesgos que la propia IA
                            declara, y lo que el validador tuvo que podar. */}
                        {abierto && (
                          <div style={{ marginLeft: 34, marginTop: 2, padding: '10px 12px', borderRadius: 10, background: T.cardHi, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {p.razonamiento && (
                              <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>{p.razonamiento}</div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {p.movimientos.map((m, i) => (
                                <div key={m.citaId} style={{ fontSize: 11.5, color: T.textSec, lineHeight: 1.4 }}>
                                  <strong>{i + 1}.</strong> {m.clienteNombre ?? 'Cita'} · {new Date(m.zonaOrigen.desde).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} → {new Date(m.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                  {m.cambioProfesional ? ` · pasa a ${profesionales.find((pr) => pr.id === m.profesionalId)?.nombre ?? 'otra persona'}` : ''}
                                  {m.requiereConsentimiento ? ` · ${m.motivoConsentimiento}` : ' · no hace falta avisar'}
                                </div>
                              ))}
                            </div>
                            {p.riesgos.length > 0 && (
                              <div style={{ fontSize: 11.5, color: T.amber, lineHeight: 1.4 }}>
                                Riesgos: {p.riesgos.join(' · ')}
                              </div>
                            )}
                            {p.podados.length > 0 && (
                              <div style={{ fontSize: 11.5, color: T.textTer, lineHeight: 1.4 }}>
                                Descartado por el validador: {p.podados.map((d) => d.detalle).join(' ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Análisis de Chispa (Fase 4): recomendaciones estrategicas del
                  modelo. El cerebro animado en modo 'thinking' mientras razona. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: pendientes.length > 0 || oportunidades.length > 0 ? 6 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                  <CerebroIAIcon size={16} variant={analizandoIA ? 'thinking' : 'idle'} />
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 }}>
                    Análisis de Chispa
                  </span>
                  {!analizandoIA && (
                    <button
                      onClick={pedirAnalisisIA}
                      disabled={bloqueado}
                      style={{ padding: '3px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSec, fontSize: 11, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer' }}
                    >
                      Re-analizar
                    </button>
                  )}
                </div>
                {analizandoIA ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.textSec }}>
                    <CerebroIAIcon size={20} variant="thinking" />
                    Mirando tu agenda en busca de patrones y optimizaciones...
                  </div>
                ) : errorIA ? (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, fontSize: 12, color: T.textSec }}>
                    {errorIA}{' '}
                    {!errorIAPermanente && (
                      <button onClick={pedirAnalisisIA} style={{ background: 'none', border: 'none', color: T.primaryHi, fontWeight: 700, cursor: 'pointer', fontSize: 12, padding: 0 }}>
                        Reintentar
                      </button>
                    )}
                  </div>
                ) : analisisIA ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ padding: '12px 14px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.textSec, lineHeight: 1.5 }}>
                      {analisisIA.resumen}
                      {analisisIA.metricas && analisisIA.metricas.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {analisisIA.metricas.slice(0, 5).map((m, i) => (
                            <span key={i} style={{ padding: '3px 9px', borderRadius: 999, background: T.primarySoft, color: T.primaryHi, fontSize: 11, fontWeight: 700 }}>
                              {m.nombre}: {m.valor}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {analisisIA.recomendaciones.map((r, i) => (
                      <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CerebroIAIcon size={14} variant="idle" glow={0.4} />
                          <span style={{ fontSize: 13, fontWeight: 800, color: T.text, flex: 1 }}>{r.titulo}</span>
                          {typeof r.impacto_min === 'number' && r.impacto_min > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.success, whiteSpace: 'nowrap' }}>~{r.impacto_min} min</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.45, marginLeft: 22 }}>{r.detalle}</div>
                        {r.confianza && (
                          <div style={{ fontSize: 11, color: T.textTer, marginLeft: 22 }}>
                            Confianza: {r.confianza} · tipo: {r.tipo}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {oportunidades.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: pendientes.length > 0 ? 6 : 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4, paddingLeft: 2 }}>
                    Oportunidades del motor · {oportunidades.length}
                  </div>
                  {oportunidades.map(({ cita, cand }) => {
                    const prof = profesionales.find((pp) => pp.id === cita.profesional_id);
                    const aplicandoEsta = aplicandoId === cita.id;
                    return (
                      <div key={`op-${cita.id}`} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, background: T.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.primaryHi} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                          </span>
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text, flex: 1, minWidth: 0 }}>{cita.cliente || 'Cita'}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.textTer, whiteSpace: 'nowrap' }}>{prof?.nombre ?? ''}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: T.primaryHi, lineHeight: 1.4, marginLeft: 34, fontWeight: 600 }}>→ {cand.razonScore}</div>
                        <div style={{ display: 'flex', gap: 8, marginLeft: 34, marginTop: 2, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => aplicarCandidato(cita.id, cita, cand)}
                            disabled={bloqueado}
                            style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: aplicandoEsta ? T.primarySoft : FIRE, color: aplicandoEsta ? T.primaryHi : '#fff', fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado && !aplicandoEsta ? 0.5 : 1 }}
                          >
                            {aplicandoEsta ? 'Aplicando...' : 'Aplicar'}
                          </button>
                          {cand.fases.ini < +new Date(cita.inicio) && (
                            <button
                              onClick={() => proponerAlCliente(cita.id, cita, cand)}
                              disabled={bloqueado}
                              style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.primaryHi}`, background: 'transparent', color: T.primaryHi, fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado ? 0.5 : 1 }}
                            >
                              Proponer al cliente
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, padding: isMobile ? '4px 20px 88px' : '4px 20px 20px' }}>
          <button onClick={onClose} disabled={bloqueado} style={{ flex: 1, padding: '13px', borderRadius: 13, border: `1.5px solid ${T.border}`, background: T.card, color: T.textSec, fontSize: 14.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer' }}>
            Cerrar
          </button>
          {aplicables.length > 1 && (
            <button
              onClick={aplicarTodos}
              disabled={bloqueado}
              style={{ flex: 2, padding: '13px', borderRadius: 13, border: 'none', background: FIRE, color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado ? 0.7 : 1, boxShadow: '0 10px 26px rgba(192,38,10,0.25)' }}
            >
              {aplicandoTodo ? 'Aplicando todo...' : `Aplicar los ${aplicables.length}`}
            </button>
          )}
        </div>
      </div>

      {retrasoAbierto && (
        <RetrasoEstrategiasModal
          estrategias={retrasoAbierto.estrategias}
          minutos={retrasoAbierto.minutos ?? 0}
          profesionalNombre={retrasoAbierto.profesionalNombre}
          avisarDisponible={false}
          enviando={aplicandoId === retrasoAbierto.id}
          onConfirmar={async (estrategia: EstrategiaRetraso) => {
            const problema = retrasoAbierto;
            const ok = await aplicarEstrategia(problema, estrategia);
            if (ok) setRetrasoAbierto(null);
          }}
          onCancelar={() => setRetrasoAbierto(null)}
        />
      )}
    </div>
  );
}
