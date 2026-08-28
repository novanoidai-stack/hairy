import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  memo,
  useDeferredValue,
} from "react";
import { TimelineNowIndicator } from "./TimelineNowIndicator.web";
import { ChainFlowOverlay, CHAIN_GUTTER } from "./ChainFlowOverlay.web";
import { WeekView, MonthView, ClienteHistorialModal } from "./views/VistasSemanaMes.web";
import { Icon } from "./ui/Icon.web";
import { createPortal } from "react-dom";
import { ChispaMascota } from "@/components/chispa/ChispaMascota.web";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase, IS_DEMO_MODE } from "@/lib/supabase";
import { resolverSenalStaff } from "@/lib/senalStaff";
import {
  validarHorarioLaboral,
  slotsQueCaben,
  cabeEnAlgunaFranja,
  franjasTexto,
} from "@/lib/horarios";
import { getUserProfile } from "@/lib/auth";
import { TimeDrumPicker } from "@/components/ui/Pickers";
import { DemoSpotlight } from "@/components/ui/DemoSpotlight";
import { traerAlFoco } from "@/lib/demoScroll";
import { useCalendarRefresh } from "@/lib/calendarContext";
import { syncAlergiasACliente } from "@/lib/syncAlergias";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import {
  bloqueDeCita,
  BLOQUEO_COLORS,
  BLOQUEO_LABELS,
  progresoCita,
  minutosRestantes,
} from "@/lib/agendaBloqueUi";
import { categoryColorHex } from "@/lib/categoryColors";
import { useResponsive } from "@/lib/hooks/useResponsive";
import { useCitasRealtime } from "@/lib/hooks/useCitasRealtime";
import { avisoDeRecurso, type Recurso } from "@/lib/recursos";
import { mensajeDeError } from "@/lib/errores";
import { ejecutarAccion, type AccionPropuesta } from "@/lib/chispaOps";
import {
  proponerRetrasoPorCita,
  calcularCascada,
  construirUpdatesRetraso,
  calcularEstrategiasRetraso,
  mejorAlternativaSlot,
  duracionRealAprendida,
  type EstrategiaRetraso,
  type CitaRetraso,
  type CitaTiempos,
  type CitaHistorial,
} from "@/lib/retrasos";
import {
  PILA_VACIA,
  registrar as registrarPaso,
  deshacer as deshacerPaso,
  rehacer as rehacerPaso,
  snapshotDe,
  type PilaAgenda,
  type PasoAgenda,
} from "@/lib/agendaUndo";
import RetrasoEstrategiasModal from "./RetrasoEstrategiasModal";
import OrganizarAgendaPanel from "./OrganizarAgendaPanel.web";
import CerebroIAIcon from "./CerebroIAIcon";
import {
  analizarAgendaDia,
  ordenarPorPrioridad,
  prepararCitas,
  tramosDelProfesional,
  type ProblemaAgenda,
  type HorarioProfesional,
} from "@/lib/organizarAgenda";
import ListaEsperaPropuestaModal, {
  type CandidataListaEspera,
  type CitaOrigen,
} from "./ListaEsperaPropuestaModal.web";
import {
  RiesgoNoShowIndicator,
  type RiesgoNoShow,
} from "@/components/clientes/RiesgoNoShowIndicator.web";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { CobroSheet } from "@/components/pos/CobroSheet";
import { useOnboardingStatus } from "@/lib/hooks/useOnboardingStatus";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard.web";
import OnboardingPanel from "@/components/onboarding/OnboardingPanel.web";
import AsistentePuestaEnMarcha from "@/components/onboarding/AsistentePuestaEnMarcha.web";
import { ONBOARDING_STEPS, type OnboardingStepId } from "@/lib/onboarding";
import {
  CHISPA_CONFIG_GUIADA_EVENT,
  CHISPA_ORGANIZAR_EVENT,
  CHISPA_ORGANIZAR_FLAG,
} from "@/lib/chispaBloques";
import { contarSinLeer } from "@/lib/bandeja";
import { usePaginaManualVista } from "@/lib/hooks/usePaginaManualVista";
import { manualAgenda } from "@/lib/manuals/agenda";
import { AvisoPrimeraVisita } from "@/components/manuals/AvisoPrimeraVisita.web";
import { ManualPanel } from "@/components/manuals/ManualPanel.web";
import { useChispaVoz } from "@/lib/hooks/useChispaVoz.web";
import { FichaColorModal } from "@/app/(tabs)/clientes.web";
import { obtenerNivelCliente } from "@/lib/fidelizacion";
import { AvisosBell } from "@/components/avisos/AvisosBell.web";
import { ListaEsperaDropdown } from "./ListaEsperaDropdown.web";
import { useDebounce } from "@/lib/hooks/useDebounce";

import {
  NEGOCIO_ID_FALLBACK,
  HORARIO_APERTURA,
  HORARIO_CIERRE,
  INTERVALO_MINUTOS,
  CITA_CARD_DETAILS_MIN_HEIGHT,
  CITA_STATUS,
  CITA_STATUS_BLOQUEAN_SOLAPE,
  sigueViva,
  sinCarrilPropio,
  LOCALE,
  OCUPACION_MAX_PER_MES,
  TAG_RESENO_SALON,
  TAG_RESENO_MECHA,
} from "@/lib/constants";
import {
  cuentaComoConfirmada,
  esActiva,
  esCanceladaONoShow,
  esSinConfirmar48h,
} from "@/lib/citasMetrics";
import {
  isTimeSlotOccupied,
  citaSolapaOcupacion,
} from "@/lib/utils/appointment";
import { useQueryClient } from "@tanstack/react-query";
import { claves, FRESCURA } from "@/lib/datos/queryClient";
import { listarServicios, listarProfesionales } from "@/lib/datos/catalogo";
import { useAgendaStore } from "./store/useAgendaStore";
import type { Cita, Profesional } from "./tipos";
import { DetalleCitaModal } from "./modals/DetalleCitaModal.web";
import NewCitaModal from "./modals/NewCitaModal.web";
import {
  Avatar,
  DropdownItem,
  FormulaInput,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconClose,
  IconSearch,
  IconTrash,
  Label,
  Pill,
  SearchDropdown,
  SequenceBar,
  SummaryCell,
  TimeSlider,
  norm,
} from "./ui/atomos.web";
import { cacheado } from "@/lib/datos/cacheado";
import {
  clavesConfig,
  leerNegocioConfig,
  listarBloqueos,
  listarCategorias,
  listarCierres,
  listarDuracionesProfesional,
  listarHorariosProfesional,
  listarNegocioHorarios,
  listarOverridesServicio,
  listarRecursos,
} from "@/lib/datos/configuracionSalon";
import { pisaOtraCitaAlSoltar } from "@/lib/agenda/solapeAlSoltar";
import {
  eslabonesParaOperar,
  eslabonesParaPintar,
  estaEnCadenaVisible,
} from "@/lib/agenda/cadena";
import { ESTADO_CITA_UI, metaEstadoCita } from "@/lib/citasEstadoUi";

const ANIMATIONS = `
  input::placeholder, textarea::placeholder {
    color: var(--color-text-tertiary) !important;
  }
  input, select, textarea {
    background-color: var(--color-bg-card) !important;
    color: var(--color-text) !important;
  }
  input:disabled, textarea:disabled {
    color: var(--color-text-muted) !important;
  }
  option {
    background-color: var(--color-bg-card) !important;
    color: var(--color-text) !important;
  }
  @keyframes slideInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  /* Modo "Enseñamelo": late el marco de la zona con problema para que el ojo
     la encuentre sin taparla. Respeta prefers-reduced-motion. */
  @keyframes pulseZona {
    0%, 100% { opacity: 0.95; }
    50% { opacity: 0.45; }
  }
  /* La "caja viajera": una copia fantasma de la cita que recorre el camino
     desde donde esta hasta donde deberia ir. Es lo que hace entender de un
     golpe que ESA cita se mueve HASTA AHI, sin tener que leer la etiqueta.
     El recorrido en px se pasa por la variable --viaje. */
  @keyframes viajeZona {
    0%      { transform: translateY(0);        opacity: 0; }
    12%     { transform: translateY(0);        opacity: 0.85; }
    78%     { transform: translateY(var(--viaje)); opacity: 0.85; }
    100%    { transform: translateY(var(--viaje)); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    [style*="pulseZona"] { animation: none !important; }
    [style*="viajeZona"] { animation: none !important; opacity: 0.5 !important; }
  }
  @keyframes shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 8px rgba(244,80,30,0.3); }
    50% { box-shadow: 0 0 16px rgba(244,80,30,0.6); }
  }
  .mecha-pulse-focus {
    animation: mechaPulseGlow 1.5s ease-in-out infinite !important;
    z-index: 120 !important;
    outline: 2.5px solid #f4501e !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 24px rgba(244,80,30,0.75) !important;
  }
  @keyframes mechaPulseGlow {
    0%, 100% { outline-color: #f4501e; box-shadow: 0 0 20px rgba(244,80,30,0.8); }
    50% { outline-color: #ff8a3d; box-shadow: 0 0 36px rgba(255,138,61,0.95); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }
  @keyframes bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* =================================================================
     Fondo IA Aurora / Mesh por columna de profesional:
     Ultra-fluido, cero lag (sin filtros pesados), degradados nativos
     de alta precisión y movimiento etéreo orgánico.
     ================================================================= */
  .ia-prof-col-track {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    contain: layout paint;
  }
  .ia-prof-col-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    will-change: transform, opacity;
    animation: iaAuroraWave var(--ia-dur, 32s) ease-in-out infinite alternate;
    animation-delay: var(--ia-delay, 0s);
  }
  .ia-prof-col-beam {
    position: absolute;
    top: -15%;
    left: -15%;
    right: -15%;
    height: 60%;
    pointer-events: none;
    will-change: transform, opacity;
    animation: iaBeamFloat calc(var(--ia-dur, 32s) * 0.85) ease-in-out infinite alternate;
    animation-delay: calc(var(--ia-delay, 0s) - 5s);
  }
  @keyframes iaAuroraWave {
    0% {
      transform: translate3d(0, 0, 0) scale(1);
      opacity: 0.85;
    }
    50% {
      transform: translate3d(0, -32px, 0) scale(1.03);
      opacity: 1;
    }
    100% {
      transform: translate3d(0, 24px, 0) scale(0.98);
      opacity: 0.78;
    }
  }
  @keyframes iaBeamFloat {
    0% {
      transform: translate3d(0, 0, 0);
      opacity: 0.5;
    }
    50% {
      transform: translate3d(0, 40px, 0);
      opacity: 0.9;
    }
    100% {
      transform: translate3d(0, -25px, 0);
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ia-prof-col-glow,
    .ia-prof-col-beam {
      animation: none !important;
      transform: none !important;
    }
  }
`;

function hexToRgba(hex: string | undefined | null, alpha: number): string {
  if (!hex) return `rgba(244, 80, 30, ${alpha})`;
  let clean = String(hex).replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

// Cita y Profesional viven ahora en ./tipos (ver el porque alli: evita el
// ciclo de imports al extraer los modales).

// Normalizar texto: quitar tildes y pasar a minusculas para busquedas sin discriminar acentos

// Iconos SVG simples



function fmtHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const ReposoFreeGapInteractive = memo(
  ({
    ini,
    fin,
    gapMin,
    gapTop,
    gapH,
    cita,
    clienteMap,
    servicioMap,
    onSelectReposo,
    dragging,
  }: {
    ini: number;
    fin: number;
    gapMin: number;
    gapTop: number;
    gapH: number;
    cita: any;
    clienteMap: any;
    servicioMap: any;
    onSelectReposo: (info: {
      horaStr: string;
      profId: string;
      reposoContext: any;
    }) => void;
    // Mientras se arrastra una cita el fantasma tiene pointerEvents:none, asi
    // que el cursor "pasa" por debajo y encendia/apagaba el hover de cada franja
    // libre que cruzaba. Se congela el hover durante el arrastre (fuera de el,
    // el hover sigue igual: es util).
    dragging?: boolean;
  }) => {
    const [hovered, setHovered] = useState(false);
    const iniDate = new Date(ini);
    const finDate = new Date(fin);
    const iniStr = fmtHHMM(iniDate);
    const finStr = fmtHHMM(finDate);
    const clienteNombre = clienteMap?.get(cita.cliente_id)?.nombre || "Clienta";
    const servicioNombre =
      servicioMap?.get(cita.servicio_id)?.nombre || "Servicio";

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const ratio = gapH > 0 ? Math.max(0, Math.min(1, offsetY / gapH)) : 0;
      const clickMs = ini + ratio * (fin - ini);
      const clickDate = new Date(clickMs);
      const mins = Math.floor(clickDate.getMinutes() / 5) * 5;
      clickDate.setMinutes(mins, 0, 0);
      const horaStr = fmtHHMM(clickDate);

      onSelectReposo({
        horaStr,
        profId: cita.profesional_id,
        reposoContext: {
          hostCitaId: cita.id,
          hostClienteNombre: clienteNombre,
          hostServicioNombre: servicioNombre,
          reposoInicio: iniDate,
          reposoFin: finDate,
          duracionReposoMin: gapMin,
        },
      });
    };

    const hov = hovered && !dragging;
    return (
      <div
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`Reposo de ${clienteNombre} (${iniStr} - ${finStr}, ${gapMin}′ libre) · Haz clic para agendar cita en este reposo`}
        style={{
          position: "absolute",
          top: gapTop,
          left: 0,
          right: 0,
          height: gapH,
          pointerEvents: dragging ? "none" : "auto",
          // Verde = "puedes meter a alguien aqui". Es el unico verde del hueco
          // de reposo: la franja rayada de alrededor va en neutro a proposito,
          // porque el reposo no es un estado, es estructura de la cita.
          background: hov
            ? "rgba(15,157,107,0.26)"
            : "rgba(15,157,107,0.10)",
          boxShadow: hov
            ? "inset 0 0 12px rgba(15,157,107,0.45), 0 0 10px rgba(15,157,107,0.28)"
            : "none",
          border: hov ? `1.5px solid ${TOKENS.success}` : "none",
          borderRadius: hov ? 6 : 0,
          display: "flex",
          alignItems: gapTop < 15 && gapH < 45 ? "flex-end" : "center",
          justifyContent: "center",
          paddingBottom: gapTop < 15 && gapH < 45 ? 4 : 0,
          cursor: "pointer",
          zIndex: hov ? 10 : 2,
          transition: "all 0.15s ease",
        }}
      >
        {gapH >= 15 && (
          <span
            style={{
              padding: hov ? "3px 10px" : "2px 8px",
              borderRadius: 999,
              background: hov ? TOKENS.successHi : TOKENS.success,
              fontSize: hov ? 10 : 9.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "#ffffff",
              whiteSpace: "nowrap",
              boxShadow: hov
                ? "0 2px 8px rgba(15,157,107,0.45)"
                : "0 1px 3px rgba(28,24,20,0.15)",
              transform: hov ? "scale(1.05)" : "scale(1)",
              transition: "all 0.15s ease",
              pointerEvents: "none",
            }}
          >
            + LIBRE {gapMin}′
          </span>
        )}
      </div>
    );
  },
);

export default function AgendaCalendar() {
  const { refreshTrigger, triggerRefresh } = useCalendarRefresh();
  const { isMobile, isTablet } = useResponsive();
  const router = useRouter();
  // Cache compartida de datos del servidor (lib/datos/queryClient.ts).
  const qc = useQueryClient();
  const cacheadoAgenda = useCallback(
    <T,>(clave: readonly unknown[], fn: () => Promise<T>) =>
      cacheado(qc, clave, fn, FRESCURA.referencia),
    [qc],
  );
  const [citas, setCitas] = useState<Cita[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth()),
  );

  // Estado VISUAL en el store (components/agenda/store/useAgendaStore.ts).
  //
  // Se leen con selector, no con `useAgendaStore()` a pelo: suscribirse al
  // store entero repintaria este componente -- y con el, toda la rejilla -- cada
  // vez que cambiase cualquier otra cosa del store.
  //
  // Los nombres locales se conservan (`view`, `setView`, `selectedProf`,
  // `setSelectedProf`) para que los ~140 puntos de uso repartidos por el fichero
  // no se toquen. El cambio es de DONDE sale el dato, no de que hace nadie con
  // el: asi el diff es revisable y no se cuela una regresion escondida en un
  // reemplazo masivo. (Cuidado al buscar: hay otros dos `selectedProf`
  // distintos en este mismo fichero, dentro de NewCitaModal y DetalleCitaModal,
  // que NO son este y no deben tocarse.)
  const view = useAgendaStore((s) => s.vista);
  const setView = useAgendaStore((s) => s.setVista);
  const selectedProf = useAgendaStore((s) => s.profesionalFiltrado);
  const setSelectedProf = useAgendaStore((s) => s.setProfesionalFiltrado);
  // Repasar lo cancelado: apagado por defecto (el dia se lee mejor sin ruido).
  const [verCanceladas, setVerCanceladas] = useState(false);
  const [loading, setLoading] = useState(true);
  // Ventana de citas cargada (arranque rapido): en vez de traer TODAS las citas
  // del negocio (miles en un salon real), se carga -60/+120 dias alrededor del
  // dia visible y se recarga si el usuario navega fuera. El historico completo
  // vive en la pagina Citas.
  const selectedDateRef = useRef<Date>(new Date());
  const loadedRangeRef = useRef<{ desde: Date; hasta: Date } | null>(null);
  const [showNewCita, setShowNewCita] = useState(false);
  const [showEditCita, setShowEditCita] = useState(false);
  const [selectedCitaEdit, setSelectedCitaEdit] = useState<any>(null);
  // Prellenado al crear cita desde un clic en un hueco de la rejilla o en un reposo
  const [newCitaPrefill, setNewCitaPrefill] = useState<{
    hora?: string;
    profId?: string;
    clienteId?: string;
    servicioId?: string;
    notas?: string;
    waitlistId?: string;
    reposoContext?: {
      hostCitaId: string;
      hostClienteNombre: string;
      hostServicioNombre: string;
      reposoInicio: Date;
      reposoFin: Date;
      duracionReposoMin: number;
    };
  } | null>(null);
  const [showNotif, setShowNotif] = useState(false);
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista("agenda");
  // Demo guiada: enfoque tipo spotlight sobre una zona (p.ej. el panel de avisos).
  const [demoFocus, setDemoFocus] = useState<string | null>(null);
  const notifPanelRef = useRef<HTMLElement | null>(null);
  // Citas (y catalogos) frescos accesibles desde el listener de demo (que se
  // registra una vez, asi que capturaria estado obsoleto sin estas refs).
  const citasRef = useRef<Cita[]>([]);
  citasRef.current = citas;
  const clientesRef = useRef<any[]>([]);
  clientesRef.current = clientes;
  const serviciosRef = useRef<any[]>([]);
  serviciosRef.current = servicios;
  const profesionalesRef = useRef<Profesional[]>([]);
  profesionalesRef.current = profesionales;
  const [bloqueos, setBloqueos] = useState<any[]>([]);
  const [horarios, setHorarios] = useState<any[]>([]);
  // Jornada propia de cada profesional (horarios_profesional). Un profesional
  // puede acabar antes que el salon o partir el dia en dos turnos; sin esto la
  // rejilla pintaba a todos con la ventana del negocio.
  const [horariosProf, setHorariosProf] = useState<HorarioProfesional[]>([]);
  // Pila de deshacer/rehacer de movimientos de citas (solo esta sesion).
  const [pilaAgenda, setPilaAgenda] = useState<PilaAgenda>(PILA_VACIA);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  // Limites del organizador configurables por salon (undefined = usar los defaults).
  const [limitesAgenda, setLimitesAgenda] = useState<{
    maxAdelantoMin?: number;
    umbralHuecoMin?: number;
    margenReaccionMin?: number;
  }>({});
  // Cierres del salon completo (festivos/vacaciones): la agenda pinta el dia cerrado.
  const [cierres, setCierres] = useState<
    { fecha: string; motivo: string | null }[]
  >([]);
  const [citaAddonsMap, setCitaAddonsMap] = useState<Record<string, any[]>>({});
  // Propuestas de cambio de cita PENDIENTES (citas_propuestas_cambio). Cada una
  // retiene un hueco (bloqueos_profesional.tipo='reserva_temporal') a la espera
  // de que la clienta confirme el adelanto por WhatsApp. Sin cargarlas, la
  // rejilla no sabia que una cita tiene un cambio propuesto (sin badge) y el
  // hueco retenido se pintaba con el gris por defecto al no existir la entrada
  // 'reserva_temporal' en BLOQUEO_COLORS. Es el bug "no se ve que esta pendiente
  // de confirmarse".
  const [propuestas, setPropuestas] = useState<any[]>([]);
  const propuestaPorCitaId = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of propuestas) {
      if (p && p.estado === "pendiente" && p.cita_id) m.set(p.cita_id, p);
    }
    return m;
  }, [propuestas]);
  const [citasVencidas, setCitasVencidas] = useState<Cita[]>([]);
  const [hideCitasVencidas, setHideCitasVencidas] = useState(false);
  useEffect(() => {
    setHideCitasVencidas(false);
  }, [citasVencidas.length]);
  const [showRetrasoProf, setShowRetrasoProf] = useState<string | null>(null);
  // Estrategias calculadas al declarar "este profesional llega X min tarde".
  // Vivian en el scope de DayTimeline, asi que el modal de retraso llamaba a
  // setters inexistentes y reventaba al pulsar los minutos.
  const [retrasoProf, setRetrasoProf] = useState<{
    minutos: number;
    estrategias: EstrategiaRetraso[];
    profNombre: string;
  } | null>(null);
  const [aplicandoRetrasoProf, setAplicandoRetrasoProf] = useState(false);
  const [showClientaTarde, setShowClientaTarde] = useState<Cita | null>(null);
  const [showCierreSalon, setShowCierreSalon] = useState(false);
  const [cierreLoading, setCierreLoading] = useState(false);
  // Fase 8: filtros, buscador, vistas
  const [filterServicio, setFilterServicio] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 200);
  const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showClienteHistorial, setShowClienteHistorial] = useState<any>(null);
  const [recolocarRetraso, setRecolocarRetraso] = useState(true); // toggle de Configuracion (negocio_config.config)
  const [avisarRetraso, setAvisarRetraso] = useState(true); // notifRetrasoActiva (negocio_config.config)
  const [completarManual, setCompletarManual] = useState(false); // completarManual (negocio_config); false = autocompletar + sin boton
  const [capturaHoldAuto, setCapturaHoldAuto] = useState(true); // depositoNoShowCapturaAuto: capturar la fianza retenida al marcar no-show
  const [negocioId, setNegocioId] = useState(NEGOCIO_ID_FALLBACK);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  // null = todavia no sabemos si este salon ya vio la bienvenida (negocio_config).
  // Mientras sea null no se pinta nada: es preferible a que aparezca y se quite.
  const [bienvenidaVista, setBienvenidaVista] = useState<boolean | null>(null);
  const [dayViewType, setDayViewType] = useState<"grid" | "list">("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // userId (extracted explicitly for event tracking)
  const userId = userProfile?.id || "";

  const roleTheme = useMemo(() => {
    const role = userProfile?.role;
    switch (role) {
      case "admin":
        return {
          primary: "#4f46e5",
          primaryHi: "#3730a3",
          primaryGlow: "rgba(79,70,229,0.3)",
          primarySoft: "rgba(79,70,229,0.1)",
          bgHeader: "linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)",
          bgCard: "#ffffff",
          borderHeader: "rgba(79,70,229,0.22)",
          badgeColor: "#4f46e5",
          badgeBg: "rgba(79,70,229,0.12)",
        };
      case "recepcion":
        return {
          primary: "#0d9488",
          primaryHi: "#115e59",
          primaryGlow: "rgba(13,148,136,0.3)",
          primarySoft: "rgba(13,148,136,0.1)",
          bgHeader: "linear-gradient(180deg, #f0fdfa 0%, #ccfbf1 100%)",
          bgCard: "#ffffff",
          borderHeader: "rgba(13,148,136,0.22)",
          badgeColor: "#0d9488",
          badgeBg: "rgba(13,148,136,0.12)",
        };
      case "employee":
        return {
          primary: "#d97706",
          primaryHi: "#92400e",
          primaryGlow: "rgba(217,119,6,0.3)",
          primarySoft: "rgba(217,119,6,0.1)",
          bgHeader: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)",
          bgCard: "#ffffff",
          borderHeader: "rgba(217,119,6,0.22)",
          badgeColor: "#d97706",
          badgeBg: "rgba(217,119,6,0.12)",
        };
      case "owner":
      default:
        return {
          primary: "#f4501e",
          primaryHi: "#c0260a",
          primaryGlow: "rgba(244,80,30,0.3)",
          primarySoft: "rgba(244,80,30,0.1)",
          bgHeader: "linear-gradient(180deg, #fff5ef 0%, #fdede4 100%)",
          bgCard: "#ffffff",
          borderHeader: "rgba(244,80,30,0.22)",
          badgeColor: "#f4501e",
          badgeBg: "rgba(244,80,30,0.12)",
        };
    }
  }, [userProfile?.role]);

  const roleLabelText = (role?: string | null) => {
    if (!role) return "";
    switch (role) {
      case "owner":
        return "Propietario";
      case "admin":
        return "Dirección";
      case "recepcion":
        return "Recepción";
      case "employee":
        return "Profesional";
      default:
        return role;
    }
  };

  const [mensajesSinLeer, setMensajesSinLeer] = useState(0);
  const [clientesFugaCount, setClientesFugaCount] = useState(0);

  // --- Onboarding: checklist de puesta en marcha del salon ---
  // Solo para gestores (owner/admin) en su negocio propio; nunca en la demo ni para
  // prospectos free (que viven en demo_salon_001).
  const obParams = useLocalSearchParams<{
    onboarding?: string;
    cita?: string;
    fecha?: string;
    // Arnes de pruebas: fija la hora "ahora" del analisis de agenda. Ya lo leia
    // OrganizarAgendaPanel; el badge y "Enseñamelo" tienen que usar el MISMO
    // valor o el panel y la rejilla cuentan cosas distintas.
    orgnow?: string;
  }>();
  const ahoraOverrideMs = useMemo(() => {
    if (!obParams?.orgnow) return undefined;
    const t = new Date(obParams.orgnow).getTime();
    return Number.isNaN(t) ? undefined : t;
  }, [obParams?.orgnow]);
  const esGestor =
    userProfile?.role === "owner" || userProfile?.role === "admin";
  const onboardingEligible =
    !!userProfile &&
    esGestor &&
    !IS_DEMO_MODE &&
    negocioId !== "demo_salon_001";
  const onboarding = useOnboardingStatus(
    onboardingEligible ? negocioId : null,
    onboardingEligible,
  );
  const [showOnboardingPanel, setShowOnboardingPanel] = useState(false);
  const [obSkipped, setObSkipped] = useState<OnboardingStepId[]>([]);
  const [obHidden, setObHidden] = useState(false);
  const obKey = negocioId ? `mecha-onboarding:${negocioId}` : "";

  // Preferencias locales (omitidos / ocultar) por negocio. localStorage: onboarding unico,
  // normalmente en el mismo dispositivo. No necesita backend.
  useEffect(() => {
    if (!onboardingEligible || !obKey) {
      setObSkipped([]);
      setObHidden(false);
      return;
    }
    try {
      const raw =
        typeof localStorage !== "undefined"
          ? localStorage.getItem(obKey)
          : null;
      const v = raw ? JSON.parse(raw) : null;
      setObSkipped(v && Array.isArray(v.skipped) ? v.skipped : []);
    } catch {
      setObSkipped([]);
    }
    // "Ahora no" oculta solo en esta sesion: reaparece al volver mientras falte el nucleo.
    setObHidden(false);
  }, [obKey, onboardingEligible]);

  const persistSkipped = useCallback(
    (skippedNext: OnboardingStepId[]) => {
      try {
        if (typeof localStorage !== "undefined" && obKey) {
          localStorage.setItem(obKey, JSON.stringify({ skipped: skippedNext }));
        }
      } catch {
        /* sin persistencia si el navegador la bloquea */
      }
    },
    [obKey],
  );

  const skipStep = useCallback(
    (id: OnboardingStepId) => {
      setObSkipped((prev) => {
        const next = prev.includes(id) ? prev : [...prev, id];
        persistSkipped(next);
        return next;
      });
    },
    [persistSkipped],
  );
  const unskipStep = useCallback(
    (id: OnboardingStepId) => {
      setObSkipped((prev) => {
        const next = prev.filter((x) => x !== id);
        persistSkipped(next);
        return next;
      });
    },
    [persistSkipped],
  );
  const hideOnboarding = useCallback(() => setObHidden(true), []);

  // Re-comprobar el estado al volver a la agenda (p.ej. tras configurar algo).
  useFocusEffect(
    useCallback(() => {
      if (onboardingEligible) onboarding.refresh();
    }, [onboardingEligible, onboarding.refresh]),
  );

  // Mensajes sin leer de la Bandeja (rechazos/cambios de presupuestos, contacto).
  // Solo visibilidad rapida aqui: la gestion completa vive en la pestana Bandeja.
  const refreshMensajesSinLeer = useCallback(() => {
    if (!negocioId) return;
    contarSinLeer(negocioId)
      .then(setMensajesSinLeer)
      .catch(() => {});
  }, [negocioId]);
  // Solo useFocusEffect: ya se dispara al montar con la agenda enfocada. El
  // useEffect que habia aqui ademas hacia que cada montaje pidiera la cuenta
  // DOS veces (dos viajes identicos a la base de datos, uno por cada efecto).
  useFocusEffect(
    useCallback(() => {
      refreshMensajesSinLeer();
    }, [refreshMensajesSinLeer]),
  );

  // Clientas en riesgo de fuga (solo gestores, nunca en la demo): mismo gate que onboarding.
  const refreshClientesFuga = useCallback(() => {
    if (!onboardingEligible) {
      setClientesFugaCount(0);
      return;
    }
    supabase.rpc("clientes_en_riesgo_fuga").then(({ data, error }) => {
      if (!error) setClientesFugaCount((data ?? []).length);
    });
  }, [onboardingEligible]);
  // Igual que arriba: useFocusEffect ya cubre el montaje, el useEffect solo
  // duplicaba la llamada al RPC de riesgo de fuga.
  useFocusEffect(
    useCallback(() => {
      refreshClientesFuga();
    }, [refreshClientesFuga]),
  );

  // ¿Este salon ya vio el asistente de puesta en marcha? Se consulta SOLO, con su
  // propia peticion, y no dentro del cargador general de la agenda: ese carga
  // citas y clientes, asi que va detras del muro de consentimiento de privacidad
  // y de mas datos. El asistente no ensena datos de clientes (pregunta la
  // configuracion del salon), asi que debe poder salir antes que todo eso.
  useEffect(() => {
    if (!onboardingEligible || !negocioId) return;
    let vivo = true;
    // Misma clave que el cargador general: si ya se pidio la config, esto no
    // abre otra peticion.
    cacheadoAgenda(clavesConfig.negocioConfig(negocioId), () => leerNegocioConfig(negocioId))
      .then(({ data }) => {
        if (!vivo) return;
        setBienvenidaVista((data as Record<string, unknown>)?.bienvenidaVista === true);
      });
    return () => { vivo = false; };
  }, [negocioId, onboardingEligible, cacheadoAgenda]);

  // Reapertura del panel desde Ajustes (navega con ?onboarding=1).
  useEffect(() => {
    if (obParams?.onboarding === "1" && onboardingEligible)
      setShowOnboardingPanel(true);
  }, [obParams?.onboarding, onboardingEligible]);

  // Deep-link ?cita=<id> (desde la campana de avisos global): situa el calendario
  // en el dia de la cita y abre su ficha para gestionarla (confirmar/cancelar).
  const citaParamConsumida = useRef<string | null>(null);
  useEffect(() => {
    const citaId = obParams?.cita as string | undefined;
    if (!citaId || citas.length === 0 || citaParamConsumida.current === citaId)
      return;
    const pick = citas.find((c: any) => c.id === citaId);
    if (!pick) return;
    citaParamConsumida.current = citaId;
    const d = new Date(pick.inicio);
    setSelectedDate(d.getDate());
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth()));
    setView("day");
    setSelectedCitaEdit(pick);
    setShowEditCita(true);
  }, [obParams?.cita, citas]);

  const fechaParamConsumida = useRef<string | null>(null);
  useEffect(() => {
    const fecha = obParams?.fecha as string | undefined;
    if (!fecha || fechaParamConsumida.current === fecha) return;
    fechaParamConsumida.current = fecha;
    const d = new Date(fecha + "T00:00:00");
    if (!isNaN(d.getTime())) {
      setSelectedDate(d.getDate());
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth()));
      setView("day");
    }
  }, [obParams?.fecha]);

  // Completitud "al 100%" (S18): mas alla del nucleo, la tarjeta sigue guiando
  // hasta completar TODOS los pasos, contando solo los no omitidos por el gestor
  // (los recomendados omitidos no cuentan como pendientes). Los esenciales no
  // tienen "Omitir", asi que siempre mantienen viva la tarjeta hasta hacerlos.
  const obPendientes = ONBOARDING_STEPS.filter(
    (s) => !onboarding.done[s.id] && !obSkipped.includes(s.id),
  ).length;
  const obConsiderados =
    ONBOARDING_STEPS.length -
    obSkipped.filter((id) => !onboarding.done[id]).length;
  const obCompletados = ONBOARDING_STEPS.filter(
    (s) => onboarding.done[s.id],
  ).length;
  // La tarjeta aparece mientras quede algun paso pendiente (no omitido) y no se
  // haya ocultado en esta sesion.
  const onboardingPending =
    onboardingEligible && onboarding.ready && obPendientes > 0 && !obHidden;
  const [dropServicioOpen, setDropServicioOpen] = useState(false);
  const [dropEstadoOpen, setDropEstadoOpen] = useState(false);
  // Modo pantalla completa para la vista de dia (estilo Booksy): oculta el panel lateral.
  // Arranca SIEMPRE plegado: al entrar al software la agenda es lo unico que importa y
  // el rail (mini-calendario + KPIs) robaba 340px de rejilla. El usuario lo abre/cierra
  // con el boton "Pantalla completa / Salir de pantalla completa" de la cabecera.
  const [railCollapsed, setRailCollapsed] = useState<boolean>(true);
  // Pantalla completa en MOVIL: esconde la barra de titulo y la de controles.
  // Arranca apagada (al contrario que railCollapsed) porque esa barra es la que
  // trae "Nueva cita", los avisos y la lista de espera.
  const [movilFullscreenOn, setMovilFullscreenOn] = useState(false);
  // (Retirado toolbarCollapsed: el chip "Filtros" que lo accionaba se elimino hace
  // tiempo y el estado quedo huerfano. La barra ya no se pliega, se envuelve.)
  // Modo de rejilla del dia (desktop): true = "Juntos" (todos los profesionales a la
  // vista sin scroll, las columnas se reparten el ancho); false = "Scroll" (columnas
  // anchas con scroll horizontal). El usuario alterna con el segmented del toolbar y
  // se recuerda (localStorage). Ambos modos deben verse bien.
  const [agendaFit, setAgendaFit] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("mecha-agenda-layout");
    return v ? v === "fit" : true;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "mecha-agenda-layout",
        agendaFit ? "fit" : "scroll",
      );
    } catch {}
  }, [agendaFit]);
  // Tarjeta de "Optimización de Agenda" (IA): en movil ocupaba media pantalla
  // encima de la rejilla (queja de ruido visual). Arranca plegada tras un chip
  // compacto y solo se despliega si el usuario la pide; en escritorio sigue abierta.
  // Colapso independiente de los bloques del rail lateral (KPIs y mini-calendario)
  const [kpisCollapsed, setKpisCollapsed] = useState(false);
  const [miniCalCollapsed, setMiniCalCollapsed] = useState(false);
  // Profesionales arranca DESPLEGADO: es el filtro que mas se usa y, plegado y al
  // fondo del rail, era invisible en la practica.
  const [profsCollapsed, setProfsCollapsed] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState<
    "hoy" | "confirmadas" | "mes" | "canceladas" | null
  >(null);
  // Modal del calendario en movil
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);
  // (Retirada la hoja selectora de profesional en movil: ahora se elige en la
  // tira de avatares, la misma cuadricula que en escritorio.)
  // Chispa (IA) se monta globalmente en app/_layout.tsx (ChispaLauncher); la
  // agenda se refresca via useCalendarRefresh cuando aplica una accion.
  // Panel "Organizar mi agenda" (Sesion 5, IA por pagina): detecta retrasos,
  // solapes y huecos del DIA VISIBLE y los arregla de un clic. lib/organizarAgenda.ts.
  const [showOrganizar, setShowOrganizar] = useState(false);
  // Modo "Enseñamelo": interruptor. Mientras esta encendido, la rejilla resalta
  // con animacion la zona de cada problema detectado, sin tocar nada. Es el
  // complemento visual del panel (que es el que aplica).
  const [ensenar, setEnsenar] = useState(false);
  // Problema concreto al que se ha hecho zoom desde el panel (null = todos).
  const [problemaEnfocado, setProblemaEnfocado] = useState<string | null>(null);
  // "Enséñamelo" de un PLAN de Chispa (motor generativo F1). Un plan no esta en
  // la lista determinista `problemasAgenda`: es una secuencia inventada por la
  // IA, con un paso por movimiento. Por eso viaja aparte y el navegador de
  // abajo pasa a recorrer SUS pasos (1/3, 2/3...) en vez de los problemas.
  const [pasosPlan, setPasosPlan] = useState<ProblemaAgenda[]>([]);
  // Toast flotante de confirmación (p.ej. cobro efectuado)
  const [toastMensaje, setToastMensaje] = useState<string | null>(null);

  const mostrarToast = useCallback((msg: string) => {
    setToastMensaje(msg);
    setTimeout(() => setToastMensaje(null), 4000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onToast = (e: CustomEvent<{ text: string }>) => {
      if (e.detail?.text) mostrarToast(e.detail.text);
    };
    window.addEventListener("mecha-toast" as any, onToast as any);
    return () =>
      window.removeEventListener("mecha-toast" as any, onToast as any);
  }, [mostrarToast]);

  // Puente chat->panel: mientras la Agenda esta montada, avisa a Chispa de que
  // el organizador determinista (con varias estrategias visuales) esta
  // disponible y escucha su evento para abrirlo. Asi "optimiza mi agenda" en el
  // chat abre este panel en vez de una propuesta unica de texto del LLM.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as Record<string, boolean>)[CHISPA_ORGANIZAR_FLAG] =
      true;
    const abrir = () => setShowOrganizar(true);
    window.addEventListener(CHISPA_ORGANIZAR_EVENT, abrir);
    return () => {
      (window as unknown as Record<string, boolean>)[CHISPA_ORGANIZAR_FLAG] =
        false;
      window.removeEventListener(CHISPA_ORGANIZAR_EVENT, abrir);
    };
  }, []);

  useEffect(() => {
    async function cargar() {
      try {
        let negocioId = NEGOCIO_ID_FALLBACK;
        const profile = await getUserProfile();
        if (profile?.negocio_id) {
          negocioId = profile.negocio_id;
        }

        // Ventana de carga alrededor del dia visible (y siempre incluyendo hoy).
        const centro = selectedDateRef.current || new Date();
        const ahoraW = new Date();
        const desdeW = new Date(Math.min(centro.getTime(), ahoraW.getTime()));
        desdeW.setDate(desdeW.getDate() - 60);
        desdeW.setHours(0, 0, 0, 0);
        const hastaW = new Date(Math.max(centro.getTime(), ahoraW.getTime()));
        hastaW.setDate(hastaW.getDate() + 120);
        hastaW.setHours(23, 59, 59, 999);
        // La ventana nunca ENCOGE: se une con la ya cargada. Antes, al pasar de
        // mes en mes la ventana se recentraba y la consulta dejaba fuera meses
        // que ya se habian visto: al volver atras el calendario repintaba con
        // menos citas (los puntos parpadeaban y los contadores cambiaban solos).
        const previo = loadedRangeRef.current;
        if (previo) {
          if (previo.desde < desdeW) desdeW.setTime(previo.desde.getTime());
          if (previo.hasta > hastaW) hastaW.setTime(previo.hasta.getTime());
        }
        loadedRangeRef.current = { desde: desdeW, hasta: hastaW };

        const [
          profResult,
          citaResult,
          srvResult,
          cltResult,
          bloqueoResult,
          addonsResult,
          cfgResult,
          catResult,
          cierreResult,
          horarioResult,
          horarioProfResult,
          propuestasResult,
        ] = await Promise.all([
          // Catalogo por cache compartida: la pantalla de clientes (y las que
          // se vayan migrando) piden EXACTAMENTE esto mismo. Al volver de una a
          // otra ya no se vuelve a descargar. Ver lib/datos/catalogo.ts.
          cacheadoAgenda(claves.profesionales(negocioId), () =>
            listarProfesionales(negocioId),
          ),
          (async () => {
            let allData: any[] = [];
            let from = 0;
            const step = 1000;
            while (true) {
              let q = supabase
                .from("citas")
                .select(
                  // cobrada/cobro_id son imprescindibles: sin ellos el detalle de
                  // la cita no sabe que ya se cobro y ofrece cobrarla otra vez
                  // hasta que se refresca a mano.
                  "id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id, notas, confirmada_cliente, confirmada_at, formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas, oculta_en_calendario, grupo_id, orden_en_grupo, serie_id, cobrada, cobro_id",
                )
                .eq("negocio_id", negocioId);
              // Las canceladas se ocultan por defecto (es lo que quiere ver el
              // salon), pero con el interruptor de la barra se pueden repasar.
              if (!verCanceladas) q = q.eq("oculta_en_calendario", false);
              const { data, error } = await q
                .gte("inicio", desdeW.toISOString())
                .lte("inicio", hastaW.toISOString())
                .range(from, from + step - 1);
              if (error) return { error };
              if (!data || data.length === 0) break;
              allData = allData.concat(data);
              if (data.length < step) break;
              from += step;
            }
            return { data: allData };
          })(),
          cacheadoAgenda(claves.servicios(negocioId), () => listarServicios(negocioId)),
          supabase
            .from("clientes")
            .select(
              "id, nombre, telefono, alergias, fecha_nacimiento, etiquetas",
            )
            .eq("negocio_id", negocioId),
          cacheadoAgenda(clavesConfig.bloqueos(negocioId), () => listarBloqueos(negocioId)),
          supabase
            .from("cita_addons")
            .select("cita_id, service_addons(nombre)"),
          // Configuracion del salon: cache compartida (lib/datos/configuracionSalon.ts).
          // Bajo esta clave se guarda el OBJETO de config ya desenvuelto, no la
          // fila. Cualquier otro sitio que lea esta misma clave tiene que
          // esperar esa forma: dos formas distintas bajo la misma clave y gana
          // la que llegue primero.
          cacheadoAgenda(clavesConfig.negocioConfig(negocioId), () =>
            leerNegocioConfig(negocioId),
          ),
          cacheadoAgenda(clavesConfig.categorias(negocioId), () => listarCategorias(negocioId)),
          cacheadoAgenda(clavesConfig.cierres(negocioId), () => listarCierres(negocioId)),
          cacheadoAgenda(clavesConfig.negocioHorarios(negocioId), () =>
            listarNegocioHorarios(negocioId),
          ),
          // Jornada propia de cada profesional. OJO: aqui dia_semana es
          // 0=DOMINGO (extract(dow) de Postgres), a diferencia de
          // negocio_horarios, que usa 0=lunes.
          // OJO: horarios_profesional NO tiene columna negocio_id (solo
          // profesional_id). Se acota por los profesionales del salon, igual que
          // hace lib/hooks/useOnboardingStatus.ts. dia_semana aqui es 0=DOMINGO.
          cacheadoAgenda(clavesConfig.horariosProfesional(negocioId), () =>
            listarHorariosProfesional(negocioId),
          ),
          // Propuestas de cambio de cita pendientes (Fase 3): alimentan el badge
          // "Cambio propuesto" en la cita original y pintan el hueco retenido
          // (reserva_temporal) en violeta en vez del gris por defecto. RLS deja
          // leer solo las del propio negocio (propuestas_read_own_negocio).
          supabase
            .from("citas_propuestas_cambio")
            .select("*")
            .eq("negocio_id", negocioId),
        ]);
        // `data` es ya el objeto de config (leerNegocioConfig lo desenvuelve).
        const cfg = ((cfgResult as any)?.data ?? {}) as any;
        setRecolocarRetraso(cfg.recolocarRetraso !== false);
        setAvisarRetraso(cfg.notifRetrasoActiva !== false);
        setCompletarManual(cfg.completarManual === true);
        setCapturaHoldAuto(cfg.depositoNoShowCapturaAuto !== false);
        setLimitesAgenda({
          maxAdelantoMin: cfg.agendaMaxAdelantoMin,
          umbralHuecoMin: cfg.agendaUmbralHuecoMin,
          // Cuanto margen debe quedarle a la clienta entre el aviso y la hora
          // nueva. Es lo que de verdad limita el adelanto.
          margenReaccionMin: cfg.agendaMargenReaccionMin,
        });
        setNegocioId(negocioId);
        setUserProfile(profile || null);

        if (profResult.error) console.error("Prof error:", profResult.error);
        if (citaResult.error) console.error("Cita error:", citaResult.error);

        // Con el orden de columnas que este salon guardo en localStorage (su
        // orden es personal, no global). Se aplica aqui, con el negocioId local
        // recien resuelto, para que ni recargas ni re-fetches lo pisen.
        setProfesionales(
          aplicarOrdenGuardado(profResult.data ?? [], negocioId),
        );
        setCitas(citaResult.data ?? []);
        setServicios(srvResult.data ?? []);
        setCategorias(catResult.data ?? []);
        setClientes(cltResult.data ?? []);
        setBloqueos(bloqueoResult.data ?? []);
        setHorarios(horarioResult.data ?? []);
        setHorariosProf((horarioProfResult as any)?.data ?? []);
        setCierres((cierreResult as any)?.data ?? []);
        setPropuestas((propuestasResult as any)?.data ?? []);
        const addonMap: Record<string, any[]> = {};
        for (const row of addonsResult.data ?? []) {
          if (!addonMap[row.cita_id]) addonMap[row.cita_id] = [];
          addonMap[row.cita_id].push(row);
        }
        setCitaAddonsMap(addonMap);
        setLoading(false);
      } catch (error) {
        console.error("Error cargando datos:", error);
        setLoading(false);
      }
    }
    cargar();
    // verCanceladas entra en las dependencias porque cambia la CONSULTA (las
    // ocultas se filtran en servidor), no solo lo que se pinta.
  }, [refreshTrigger, verCanceladas]);

  // DEMO: si hoy el salon cierra, la agenda abre en el proximo dia que trabaja.
  //
  // El escaparate no puede empezar en una pantalla vacia. La resiembra
  // (`resembrar_demo`) ya siembra el dia que toca —hoy si abre y, si no, el
  // siguiente dia abierto— y esto la sigue: un domingo el visitante aterriza en
  // el lunes, con su dia lleno. El domingo sigue ahi, a un clic de la flecha, y
  // se ve como lo que es: cerrado y vacio.
  //
  // Solo en la demo. En un salon de verdad "hoy" es siempre hoy, aunque este
  // cerrado: es justo lo que el propietario espera ver al abrir la agenda.
  const saltoDemoHecho = useRef(false);
  useEffect(() => {
    if (!IS_DEMO_MODE || saltoDemoHecho.current) return;
    if (horarios.length === 0) return; // aun sin cargar
    const cerrado = (d: Date) => {
      // negocio_horarios usa 0 = LUNES; Date.getDay() es 0 = domingo.
      const fila = (horarios as any[]).find(
        (h: any) => h.dia_semana === (d.getDay() + 6) % 7,
      );
      if (fila && fila.abierto === false) return true;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return (cierres as any[]).some((c: any) => c.fecha === key);
    };
    const hoy = new Date();
    if (!cerrado(hoy)) {
      saltoDemoHecho.current = true;
      return;
    }
    for (let i = 1; i <= 14; i++) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() + i);
      if (!cerrado(d)) {
        saltoDemoHecho.current = true;
        setCurrentMonth(new Date(d.getFullYear(), d.getMonth()));
        setSelectedDate(d.getDate());
        return;
      }
    }
    saltoDemoHecho.current = true; // ningun dia abierto en dos semanas: se deja hoy
  }, [horarios, cierres]);

  // Lo que reserva una clienta por el portal, o lo que agenda el asistente de
  // WhatsApp, aparece en la pantalla de recepcion sin tocar nada. Antes solo se
  // veia al recargar o al cambiar de dia.
  useCitasRealtime({
    negocioId,
    verCanceladas,
    dentroDeVentana: useCallback((inicioISO: string | null | undefined) => {
      const r = loadedRangeRef.current;
      if (!r || !inicioISO) return false;
      const t = new Date(inicioISO).getTime();
      return t >= r.desde.getTime() && t <= r.hasta.getTime();
    }, []),
    onCambio: setCitas,
  });

  // Demo guiada: la guia de demo.html pide abrir paneles reales (nueva cita,
  // notificaciones) via CustomEvent reemitido por _layout. Cerramos lo anterior
  // antes de abrir lo nuevo para que los paneles no se amontonen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // El tour explica una cita bloque a bloque (estado, secuencia activa->reposo->
    // activa, formula). Si el tenant demo no tiene una cita con esa estructura, los
    // pasos salian VACIOS. Sintetizamos una cita de ejemplo completa (no se guarda)
    // usando un cliente/servicio/profesional reales de la demo, para que el detalle
    // SIEMPRE tenga reposo y formula que ensenar.
    const buildDemoCita = (): any => {
      const pool = citasRef.current || [];
      const profs = profesionalesRef.current || [];
      const clts = clientesRef.current || [];
      const srvs = serviciosRef.current || [];
      const prof = profs.find((p: any) => p.activo !== false) || profs[0];
      const cliente = clts[0];
      const srv =
        srvs.find((s: any) => (s.duracion_espera_min || 0) > 0) || srvs[0];
      // Sin catalogos cargados no podemos sintetizar: usamos una cita real cualquiera.
      if (!prof || !cliente || !srv) {
        return (
          pool.find((c: any) => c.estado === CITA_STATUS.CONFIRMADA) ||
          pool[0] ||
          null
        );
      }
      const inicio = new Date();
      inicio.setHours(11, 0, 0, 0);
      const finActiva = new Date(inicio.getTime() + 40 * 60000); // tinte aplicado
      const finEspera = new Date(finActiva.getTime() + 35 * 60000); // reposo (procesa)
      const fin = new Date(finEspera.getTime() + 20 * 60000); // lavado + peinado
      return {
        id: "demo-ejemplo-cita",
        inicio: inicio.toISOString(),
        fin_activa: finActiva.toISOString(),
        fin_espera: finEspera.toISOString(),
        fin: fin.toISOString(),
        estado: CITA_STATUS.CONFIRMADA,
        profesional_id: prof.id,
        servicio_id: srv.id,
        cliente_id: cliente.id,
        confirmada_cliente: true,
        confirmada_at: new Date().toISOString(),
        notas: "",
        formula_producto: "Wella Koleston Perfect 7/0",
        formula_tono: "Rubio medio + oxidante 9% (30 vol)",
        formula_tiempo_min: 35,
        formula_resultado: "Cobertura completa de canas, tono uniforme",
        formula_notas:
          "Cuero cabelludo sensible: vigilar el tiempo de exposicion",
        oculta_en_calendario: false,
        grupo_id: null,
        orden_en_grupo: null,
      };
    };

    const onAgendaNuevaCita = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setNewCitaPrefill({
        clienteId: d.clienteId,
        servicioId: d.servicioId,
        notas: d.notas,
        profId: d.profId,
        waitlistId: d.waitlistId,
      });
      setShowNewCita(true);
    };
    window.addEventListener("agenda-nueva-cita", onAgendaNuevaCita);

    const onDemo = (e: Event) => {
      const action = (e as CustomEvent).detail?.action;
      // 'nueva-cita' abre el modal; las sub-acciones del recorrido guiado
      // (cita-cliente / cita-servicio / cita-hora / cita-reposo) las gestiona el
      // propio NewCitaModal (auto-seleccion + spotlight de su zona), por eso aqui
      // solo nos aseguramos de que el modal este abierto y sin avisos por encima.
      if (
        action === "cita-detalle" ||
        (typeof action === "string" && action.indexOf("detalle-") === 0)
      ) {
        // El recorrido abre una cita YA creada y la explica bloque a bloque
        // (servicio, estado, secuencia de tiempos, formula). El DetalleCitaModal
        // escucha las sub-acciones 'detalle-*' y enfoca cada zona con spotlight.
        setShowNotif(false);
        setShowNewCita(false);
        setDemoFocus(null);
        if (action === "cita-detalle") {
          const pool = citasRef.current || [];
          const conReposo = (c: any) =>
            c.fin_activa &&
            c.fin_espera &&
            new Date(c.fin_espera).getTime() > new Date(c.fin_activa).getTime();
          const conFormula = (c: any) =>
            c.formula_producto || c.formula_tono || c.formula_resultado;
          // Lo ideal para el tour: una cita real con reposo Y formula (cuenta toda
          // la historia). Si no la hay, sintetizamos una de ejemplo para que estado,
          // secuencia y formula nunca queden vacios.
          // Del DIA QUE SE ESTA VIENDO, ademas. La agenda carga tambien citas de
          // otros dias, asi que el recorrido acababa abriendo una del mes pasado:
          // se veia una fecha vieja en la cabecera y le faltaba lo que el paso
          // siguiente promete (los productos que se lleva, que solo tiene la cita
          // preparada de hoy).
          const hoyKey = new Date().toDateString();
          const esDeHoy = (c: any) =>
            c?.inicio && new Date(c.inicio).toDateString() === hoyKey;
          const mejor = (filtro: (c: any) => boolean) =>
            pool.find((c: any) => esDeHoy(c) && filtro(c)) || pool.find(filtro);
          const pick =
            mejor((c: any) => conReposo(c) && conFormula(c)) ||
            mejor(conReposo) ||
            mejor(conFormula) ||
            buildDemoCita();
          if (pick) {
            setSelectedCitaEdit(pick);
            setShowEditCita(true);
          }
        }
      } else if (
        action === "nueva-cita" ||
        (typeof action === "string" && action.indexOf("cita-") === 0)
      ) {
        setShowNotif(false);
        setShowEditCita(false);
        setDemoFocus(null);
        if (action === "nueva-cita") setNewCitaPrefill(null);
        setShowNewCita(true);
      } else if (action === "notificaciones") {
        setShowNewCita(false);
        setShowEditCita(false);
        setShowNotif(true);
        setDemoFocus("avisos");
      } else if (action === "cerrar") {
        setShowNewCita(false);
        setShowNotif(false);
        setShowEditCita(false);
        setSelectedCitaEdit(null);
        setNewCitaPrefill(null);
        setDemoFocus(null);
      }
    };
    window.addEventListener("mecha-demo", onDemo);
    return () => {
      window.removeEventListener("mecha-demo", onDemo);
      window.removeEventListener("agenda-nueva-cita", onAgendaNuevaCita);
    };
  }, []);

  useEffect(() => {
    function checkVencidas() {
      const ahora = new Date();
      const hoyStr = ahora.toDateString();
      const vencidas = citas.filter((c) => {
        // Pendiente cuenta: una cita que se ha pasado sin confirmar es
        // justamente la que hay que resolver (completar o marcar no-show).
        // Aqui va `sigueViva` y no `bloqueaSolape`: una completada ocupa su
        // hueco pero ya esta resuelta, no hay nada que reclamar.
        if (!sigueViva(c.estado)) return false;
        const inicio = new Date(c.inicio);
        return inicio < ahora && inicio.toDateString() === hoyStr;
      });
      setCitasVencidas((prev) => {
        if (
          prev.length === vencidas.length &&
          prev.every((p, idx) => p.id === vencidas[idx]?.id)
        ) {
          return prev;
        }
        return vencidas;
      });
    }
    checkVencidas();
    const interval = setInterval(checkVencidas, 60000);
    return () => clearInterval(interval);
  }, [citas]);

  const registrarHistorial = useCallback(
    async (
      citaId: string,
      negocioId: string,
      cambios: { campo: string; anterior: string; nuevo: string }[],
      motivo?: string,
    ) => {
      const rows = cambios.map((c) => ({
        cita_id: citaId,
        negocio_id: negocioId,
        campo: c.campo,
        valor_anterior: c.anterior,
        valor_nuevo: c.nuevo,
        motivo: motivo || null,
      }));
      if (rows.length > 0) await supabase.from("citas_historial").insert(rows);
    },
    [],
  );
  // Callbacks estables para poder memoizar DayTimeline: sin esto la agenda
  // entera se re-renderiza al abrir modales o cambiar cualquier estado del
  // padre (causa del lag al crear cita). Solo usan setters, deps [].
  const dtEditCita = useCallback((cita: any) => {
    setSelectedCitaEdit(cita);
    setShowEditCita(true);
  }, []);
  const dtCreateSlot = useCallback(
    ({
      hora,
      profId,
      reposoContext,
    }: {
      hora: string;
      profId: string;
      reposoContext?: any;
    }) => {
      setNewCitaPrefill({ hora, profId, reposoContext });
      setShowNewCita(true);
    },
    [],
  );
  const dtCitaUpdated = useCallback((updated: any) => {
    setCitas((prev) =>
      prev.map((c: any) => (c.id === updated.id ? { ...c, ...updated } : c)),
    );
  }, []);
  const dtMovimientoCita = useCallback((paso: PasoAgenda) => {
    setPilaAgenda((prev) => registrarPaso(prev, paso));
  }, []);
  const dtClienteHistorial = useCallback((cli: any) => {
    setShowClienteHistorial(cli);
  }, []);

  // Aplica un lote de movimientos (deshacer o rehacer) usando el snapshot indicado.
  // Solo mueve marcas horarias y profesional: no toca estado, cobros ni notificaciones.
  async function aplicarPasoAgenda(
    paso: PasoAgenda,
    sentido: "antes" | "despues",
  ) {
    setUndoBusy(true);
    try {
      const profile = await getUserProfile();
      const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
      for (const cambio of paso) {
        const destino = cambio[sentido];
        const origen = sentido === "antes" ? cambio.despues : cambio.antes;
        const payload = {
          inicio: destino.inicio,
          fin: destino.fin,
          fin_activa: destino.fin_activa,
          fin_espera: destino.fin_espera,
          profesional_id: destino.profesional_id,
        };
        const { error } = await supabase
          .from("citas")
          .update(payload)
          .eq("id", cambio.citaId);
        if (error) {
          setUndoError(
            "No se ha podido " +
              (sentido === "antes" ? "deshacer" : "rehacer") +
              ": " +
              error.message,
          );
          setTimeout(() => setUndoError(null), 3000);
          return false;
        }
        setCitas((prev: any[]) =>
          prev.map((c) => (c.id === cambio.citaId ? { ...c, ...payload } : c)),
        );
        const cambios = [
          { campo: "inicio", anterior: origen.inicio, nuevo: destino.inicio },
          { campo: "fin", anterior: origen.fin, nuevo: destino.fin },
        ];
        if (origen.profesional_id !== destino.profesional_id) {
          cambios.push({
            campo: "profesional_id",
            anterior: origen.profesional_id,
            nuevo: destino.profesional_id,
          });
        }
        await registrarHistorial(
          cambio.citaId,
          nId,
          cambios,
          sentido === "antes" ? "Deshacer movimiento" : "Rehacer movimiento",
        );
      }
      return true;
    } finally {
      setUndoBusy(false);
    }
  }

  async function handleDeshacer() {
    const r = deshacerPaso(pilaAgenda);
    if (!r) return;
    if (await aplicarPasoAgenda(r.aplicar, "antes")) setPilaAgenda(r.pila);
  }

  async function handleRehacer() {
    const r = rehacerPaso(pilaAgenda);
    if (!r) return;
    if (await aplicarPasoAgenda(r.aplicar, "despues")) setPilaAgenda(r.pila);
  }

  async function cierreMasivoSalon() {
    setCierreLoading(true);
    const profile = await getUserProfile();
    const negocioId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    const citasACancelar = citasHoy.filter(
      (c) => c.estado === CITA_STATUS.CONFIRMADA,
    );
    for (const c of citasACancelar) {
      await supabase
        .from("citas")
        .update({ estado: CITA_STATUS.CANCELADA })
        .eq("id", c.id);
      await registrarHistorial(
        c.id,
        negocioId,
        [
          {
            campo: "estado",
            anterior: CITA_STATUS.CONFIRMADA,
            nuevo: CITA_STATUS.CANCELADA,
          },
        ],
        "Cierre inesperado del salon",
      );
    }
    setCitas((prev) =>
      prev.map((c) =>
        citasACancelar.some((ca) => ca.id === c.id)
          ? { ...c, estado: CITA_STATUS.CANCELADA }
          : c,
      ),
    );
    setCierreLoading(false);
    setShowCierreSalon(false);
  }

  const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const offset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellsArray: (number | null)[] = [];
    for (let i = 0; i < offset; i++) cellsArray.push(null);
    for (let d = 1; d <= daysInMonth; d++) cellsArray.push(d);
    while (cellsArray.length % 7) cellsArray.push(null);
    return cellsArray;
  }, [year, month]);

  const counts = useMemo(() => {
    const countsMap: Record<number, number> = {};
    citas.forEach((cita) => {
      const citaDate = new Date(cita.inicio);
      if (citaDate.getMonth() === month && citaDate.getFullYear() === year) {
        const day = citaDate.getDate();
        countsMap[day] = (countsMap[day] || 0) + 1;
      }
    });
    return countsMap;
  }, [citas, month, year]);

  const selectedDateObj = useMemo(
    () =>
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        selectedDate,
      ),
    [currentMonth, selectedDate],
  );
  selectedDateRef.current = selectedDateObj;

  // Si el usuario navega fuera de la ventana de citas cargada (-60/+120 dias),
  // recargamos centrando la ventana en el nuevo dia. Margen de 7 dias para
  // recargar ANTES de llegar al borde y no ensenar un hueco vacio.
  useEffect(() => {
    const r = loadedRangeRef.current;
    if (!r) return;
    const margenMs = 7 * 86400000;
    const t = selectedDateObj.getTime();
    if (t < r.desde.getTime() + margenMs || t > r.hasta.getTime() - margenMs) {
      triggerRefresh();
    }
  }, [selectedDateObj, triggerRefresh]);

  // Cierre del salon completo para el dia visible (festivo/vacaciones). Comparamos por
  // fecha local YYYY-MM-DD (cierres_negocio guarda date, sin hora).
  const cierreHoy = useMemo(() => {
    const y = selectedDateObj.getFullYear();
    const m = String(selectedDateObj.getMonth() + 1).padStart(2, "0");
    const d = String(selectedDateObj.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    return cierres.find((c) => c.fecha === key) || null;
  }, [cierres, selectedDate, currentMonth]);

  const citasHoy = useMemo(() => {
    return citas.filter((c) => {
      const citaDate = new Date(c.inicio);
      return citaDate.toDateString() === selectedDateObj.toDateString();
    });
  }, [citas, selectedDate, currentMonth]);

  const visibleProfs = useMemo(
    () => profesionales.filter((p) => p.activo),
    [profesionales],
  );

  // Profesionales de VACACIONES el dia seleccionado (bloqueo tipo 'vacaciones'
  // que cubre el dia completo). Su columna no se pinta en la rejilla: arriba
  // queda su avatar en gris para que se sepa que existen pero no trabajan, y
  // la agenda se encoge al haber menos columnas.
  const vacacionesHoySet = useMemo(() => {
    const dayStart = new Date(selectedDateObj);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDateObj);
    dayEnd.setHours(23, 59, 59, 999);
    const set = new Set<string>();
    for (const b of bloqueos as any[]) {
      if (b?.tipo !== "vacaciones" || !b.profesional_id) continue;
      if (new Date(b.inicio) <= dayEnd && new Date(b.fin) >= dayStart)
        set.add(b.profesional_id);
    }
    return set;
  }, [bloqueos, selectedDateObj]);

  // Aqui se calculaba `bloqueoTiposHoy`, los tipos de bloqueo presentes en el dia
  // para pintar la leyenda de la cabecera. Se va con ella (25 ago 2026): recorria
  // todos los bloqueos y todos los horarios de cada profesional en cada cambio de
  // dia solo para decidir que puntos de colores mostrar.

  // Analisis del dia VISIBLE (retrasos, solapes, huecos aprovechables y huecos
  // vacios). Alimenta dos cosas: el contador del boton de organizar (badge, como
  // las notificaciones) y el resalte del modo "Enseñamelo". Es el MISMO calculo
  // que usa el panel, asi que el numero del badge y el del panel coinciden.
  // Ordenados por prioridad: primero lo que rompe el dia (solapes), luego los
  // retrasos por tamaño y al final las oportunidades de adelantar. Todo lo que
  // consume esta lista (el panel, las flechas de "Enseñamelo", el resalte de la
  // rejilla) hereda ese orden, asi que el n.1 siempre es lo que mas duele.
  const problemasAgenda = useMemo<ProblemaAgenda[]>(() => {
    if (profesionales.length === 0 || citas.length === 0) return [];
    try {
      return ordenarPorPrioridad(
        analizarAgendaDia(
          prepararCitas(citas as any, clientes as any, servicios as any),
          profesionales,
          {
            ahoraMs: ahoraOverrideMs,
            diaMs: selectedDateObj.getTime(),
            bloqueos,
            horarios,
            horariosProfesional: horariosProf,
            maxAdelantoMin: limitesAgenda?.maxAdelantoMin,
            umbralHuecoMin: limitesAgenda?.umbralHuecoMin,
            margenReaccionMin: limitesAgenda?.margenReaccionMin,
          },
        ),
      );
    } catch (e) {
      // El badge nunca debe tumbar la agenda: sin analisis, sin badge. Pero
      // antes este catch era MUDO y un bug del analizador hacia desaparecer el
      // contador sin dejar rastro; ahora al menos queda en consola.
      console.warn("[organizador] fallo el analisis del badge:", e);
      return [];
    }
  }, [
    citas,
    clientes,
    servicios,
    profesionales,
    selectedDateObj,
    bloqueos,
    horarios,
    horariosProf,
    limitesAgenda,
    ahoraOverrideMs,
  ]);

  // Aplica en la agenda (estado local + pila de deshacer) un lote de updates ya
  // escrito en BD. Lo comparten el panel "Organizar mi agenda" y el modal de
  // "profesional llega tarde": los dos producen cascadas que deben deshacerse
  // como UN paso (a medias dejarian la agenda peor de lo que estaba).
  const aplicarUpdatesEnAgenda = useCallback(
    (
      updates: {
        id: string;
        inicio: string;
        fin: string;
        fin_activa?: string;
        fin_espera?: string;
        profesional_id?: string;
      }[],
    ) => {
      const paso: PasoAgenda = [];
      for (const u of updates) {
        const orig = (citas as any[]).find((c) => c.id === u.id);
        if (!orig) continue;
        paso.push({
          citaId: u.id,
          antes: snapshotDe(orig),
          despues: snapshotDe({
            inicio: u.inicio,
            fin: u.fin,
            fin_activa: u.fin_activa ?? orig.fin_activa,
            fin_espera: u.fin_espera ?? orig.fin_espera,
            profesional_id: u.profesional_id ?? orig.profesional_id,
          }),
        });
      }
      if (paso.length > 0) setPilaAgenda((prev) => registrarPaso(prev, paso));
      setCitas((prev: any[]) =>
        prev.map((c) => {
          const u = updates.find((x) => x.id === c.id);
          return u
            ? {
                ...c,
                inicio: u.inicio,
                fin: u.fin,
                fin_activa: u.fin_activa ?? c.fin_activa,
                fin_espera: u.fin_espera ?? c.fin_espera,
                // Sin esto, una estrategia que cambia de profesional (reasignar /
                // mover_reasignar) no movia la cita de columna hasta recargar.
                profesional_id: u.profesional_id ?? c.profesional_id,
              }
            : c;
        }),
      );
    },
    [citas],
  );

  // Lo que se resalta en la rejilla: SIEMPRE uno solo, el que se esta mirando.
  //
  // Antes, con el interruptor encendido se devolvian TODOS los problemas del dia
  // y el enfocado solo mandaba el scroll: la rejilla se encendia entera y no se
  // distinguia una propuesta de otra. El navegador de "Anterior / N de M /
  // Siguiente" ya existia; lo que faltaba era que el resalte le hiciera caso.
  const zonasResaltadas = useMemo(() => {
    // Un plan de Chispa manda sobre todo lo demas: si se esta enseñando un
    // plan, la rejilla resalta SU paso, no los problemas deterministas.
    if (pasosPlan.length > 0) {
      const paso = pasosPlan.find((x) => x.id === problemaEnfocado);
      return [paso ?? pasosPlan[0]];
    }
    if (!ensenar && !problemaEnfocado) return [];
    const p = problemaEnfocado
      ? problemasAgenda.find((x) => x.id === problemaEnfocado)
      : null;
    if (p) return [p];
    // Encendido pero sin foco valido (p.ej. el problema enfocado se resolvio y
    // desaparecio de la lista): se cae al primero en vez de dejar la rejilla
    // apagada, que pareceria que el interruptor no hace nada.
    return ensenar && problemasAgenda.length > 0 ? [problemasAgenda[0]] : [];
  }, [ensenar, problemaEnfocado, problemasAgenda, pasosPlan]);

  const idxEnfocado = problemaEnfocado
    ? problemasAgenda.findIndex((p) => p.id === problemaEnfocado)
    : -1;

  // Lleva la vista al paso n de un plan de Chispa. Espeja enfocarProblema pero
  // sobre `pasosPlan`, que no vive en la lista determinista.
  const enfocarPasoPlan = useCallback(
    (pasos: ProblemaAgenda[], i: number) => {
      const p = pasos[i];
      if (!p) return;
      setPasosPlan(pasos);
      setProblemaEnfocado(p.id);
      if (selectedProf !== "todos" && selectedProf !== p.zona.profesionalId) {
        setSelectedProf(p.zona.profesionalId);
      }
    },
    [selectedProf],
  );

  // Lleva la vista al problema n. Es lo que hace util a "Enseñamelo": antes te
  // decia "2 problemas" y te tocaba buscarlos scrolleando, y en movil ni eso
  // (solo se monta la columna del profesional elegido, asi que los problemas de
  // los demas no se pintaban en ningun sitio).
  const enfocarProblema = useCallback(
    (i: number) => {
      const p = problemasAgenda[i];
      if (!p) return;
      setProblemaEnfocado(p.id);
      if (selectedProf !== "todos" && selectedProf !== p.zona.profesionalId) {
        setSelectedProf(p.zona.profesionalId);
      }
    },
    [problemasAgenda, selectedProf],
  );

  // Scroll a la zona enfocada + latido para que el ojo la encuentre.
  //
  // Antes esto era UN solo intento a ciegas a los 160 ms: si la columna del
  // profesional aun no se habia montado (enfocarProblema cambia selectedProf, y
  // en movil solo existe la columna del elegido), querySelector devolvia null y
  // no pasaba absolutamente nada — ni scroll ni latido, sin ningun aviso. Eso es
  // lo que hacia parecer que "Enseñamelo" no funcionaba: acertaba o no segun lo
  // que tardase el render.
  //
  // Ahora se reintenta por frame hasta que el nodo existe, con tope de ~2 s.
  useEffect(() => {
    if (!problemaEnfocado || typeof document === "undefined") return;

    let rafId = 0;
    let quitarLatido: ReturnType<typeof setTimeout> | undefined;
    let nodoConLatido: HTMLElement | null = null;
    const limite = Date.now() + 2000;

    const intentar = () => {
      const nodo = document.querySelector(
        `[data-mecha-zona="${problemaEnfocado}"]`,
      ) as HTMLElement | null;

      if (!nodo) {
        if (Date.now() < limite) rafId = requestAnimationFrame(intentar);
        return;
      }

      nodo.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      });
      nodo.classList.add("mecha-pulse-focus");
      nodoConLatido = nodo;
      quitarLatido = setTimeout(() => {
        nodo.classList.remove("mecha-pulse-focus");
        nodoConLatido = null;
      }, 5000);
    };

    rafId = requestAnimationFrame(intentar);

    return () => {
      cancelAnimationFrame(rafId);
      // Sin esto el latido de la zona anterior se quedaba encendido al saltar al
      // problema siguiente: dos zonas resaltadas a la vez.
      if (quitarLatido) clearTimeout(quitarLatido);
      if (nodoConLatido) nodoConLatido.classList.remove("mecha-pulse-focus");
    };
  }, [problemaEnfocado, selectedProf, zonasResaltadas]);

  // El rail se colapsa si railCollapsed=true o si estamos en movil. En tablet ya no
  // se fuerza: lo controla railCollapsed (arranca plegado) via el boton de la cabecera.
  const isReallyCollapsed = railCollapsed || isMobile;

  // En movil el rail lateral NO existe, asi que railCollapsed no cambiaba nada y
  // el boton de "Pantalla completa" era decorativo. En movil significa otra cosa:
  // esconder el cromo de arriba (barra de titulo + barra de controles + subtitulo)
  // y dejarle esos ~140 px a la rejilla. Estado APARTE de railCollapsed, que
  // arranca en true (escritorio abre sin rail a proposito): reutilizarlo dejaria
  // el movil sin barra de titulo -y sin "Nueva cita"- nada mas entrar.
  const movilFullscreen = isMobile && movilFullscreenOn;
  const alternarPantallaCompleta = () => {
    if (isMobile) setMovilFullscreenOn((v) => !v);
    else setRailCollapsed((v) => !v);
  };
  const pantallaCompletaActiva = isMobile ? movilFullscreenOn : railCollapsed;

  // En movil arrancamos mostrando UN profesional a la vez (columna a ancho completo);
  // "todos" repartiria el ancho y se ve apretado. Solo forzamos el primer profesional
  // en la PRIMERA carga: si despues el usuario elige "Ver todos" a proposito, se respeta
  // (la rejilla ya scrollea en horizontal con varias columnas a 160px).
  const didAutoPickProf = useRef(false);
  useEffect(() => {
    if (
      isMobile &&
      selectedProf === "todos" &&
      visibleProfs.length > 0 &&
      !didAutoPickProf.current
    ) {
      didAutoPickProf.current = true;
      setSelectedProf(visibleProfs[0].id);
    }
  }, [isMobile, visibleProfs, selectedProf]);

  const timelineProfs = useMemo(() => {
    const base =
      selectedProf === "todos"
        ? visibleProfs
        : visibleProfs.filter((p) => p.id === selectedProf);
    // Los de vacaciones no llevan columna hoy.
    return base.filter((p: any) => !vacacionesHoySet.has(p.id));
  }, [visibleProfs, selectedProf, vacacionesHoySet]);

  // Avatares de vacaciones para la fila superior de la rejilla (solo en "todos":
  // si filtraste por una persona, la de vacaciones no pinta nada).
  const profsVacacionesHoy = useMemo(
    () =>
      (selectedProf === "todos" ? visibleProfs : []).filter((p: any) =>
        vacacionesHoySet.has(p.id),
      ),
    [visibleProfs, selectedProf, vacacionesHoySet],
  );

  // ── Orden de columnas con el raton ─────────────────────────────────────
  // El orden elegido se guarda en localStorage POR NEGOCIO (la cuenta de cada
  // salon: no es un orden global) y se reaplica al cargar. Se aplica en el
  // momento en que llegan los datos de la BD, no en un efecto posterior: asi
  // cualquier recarga (refreshTrigger, verCanceladas, re-entrar a la app)
  // vuelve a traer el orden guardado en vez de resetearlo.
  const ordenProfKey = (negId: string) => `agenda:ordenProf:${negId}`;
  const aplicarOrdenGuardado = (lista: any[], negId: string) => {
    try {
      const saved: string[] = JSON.parse(
        localStorage.getItem(ordenProfKey(negId)) || "[]",
      );
      if (!Array.isArray(saved) || saved.length < 2) return lista;
      const rank = (id: string) => {
        const i = saved.indexOf(id);
        return i === -1 ? saved.length : i;
      };
      return [...lista].sort(
        (a: any, b: any) => rank(a.id) - rank(b.id),
      );
    } catch {
      return lista;
    }
  };

  const reorderProfs = (idsPagina: string[]) => {
    setProfesionales((prev) => {
      const map = new Map(prev.map((p: any) => [p.id, p]));
      const pagina = idsPagina.filter((id) => map.has(id));
      const enPagina = new Set(pagina);
      let k = 0;
      const result: any[] = [];
      for (const p of prev) {
        result.push(enPagina.has(p.id) ? map.get(pagina[k++]) : p);
      }
      try {
        localStorage.setItem(
          ordenProfKey(negocioId),
          JSON.stringify(result.map((p: any) => p.id)),
        );
      } catch {
        /* localStorage no disponible */
      }
      return result;
    });
  };

  const filtered = useMemo(() => {
    let result =
      selectedProf === "todos"
        ? citasHoy
        : citasHoy.filter((c) => c.profesional_id === selectedProf);
    if (filterServicio !== "todos")
      result = result.filter((c) => c.servicio_id === filterServicio);
    if (filterEstado === "cobradas") {
      result = result.filter((c) => !!c.cobrada);
    } else if (filterEstado === "sin_cobrar") {
      result = result.filter(
        (c) => !c.cobrada && c.estado !== CITA_STATUS.CANCELADA,
      );
    } else if (filterEstado !== "todos") {
      result = result.filter((c) => c.estado === filterEstado);
    }
    return result;
  }, [citasHoy, selectedProf, filterServicio, filterEstado]);

  // Citas de hoy REALES (ni canceladas ni no-show). Es la base del KPI "HOY" y
  // del "de N hoy" de Confirmadas, para que no cuenten lo que ya no va a pasar.
  const citasActivasHoy = useMemo(() => citasHoy.filter(esActiva), [citasHoy]);
  const totalActivasHoy = citasActivasHoy.length;

  // 8.4: buscador global (optimizado con useDeferredValue para evitar stutter)
  const searchResults = useMemo(() => {
    if (!deferredSearchQuery || deferredSearchQuery.length < 2) return [];
    const q = norm(deferredSearchQuery);
    return citas
      .filter((c) => {
        const cli = clientes.find((cl: any) => cl.id === c.cliente_id);
        const srv = servicios.find((s: any) => s.id === c.servicio_id);
        const prof = profesionales.find((p: any) => p.id === c.profesional_id);
        return (
          norm(cli?.nombre || "").includes(q) ||
          (cli?.telefono || "").includes(q) ||
          norm(srv?.nombre || "").includes(q) ||
          norm(prof?.nombre || "").includes(q)
        );
      })
      .slice(0, 12);
  }, [deferredSearchQuery, citas, clientes, servicios, profesionales]);

  // Citas sin confirmar por el cliente: MISMA definicion canonica que la campana
  // de avisos y la pagina de Citas (esSinConfirmar48h en lib/citasMetrics).
  const sinConfirmarList = useMemo(() => {
    const ahora = Date.now();
    return citas
      .filter((c: any) => esSinConfirmar48h(c, ahora))
      .sort(
        (a: any, b: any) =>
          new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
      );
  }, [citas]);
  const sinConfirmar48h = sinConfirmarList.length;

  // Cumpleanos en los proximos 7 dias (misma logica que la ficha de cliente).
  // Cada cliente con fecha_nacimiento valida cuenta una vez, ordenado por cercania.
  const cumplesProximos = useMemo(() => {
    const hoy = new Date();
    const hoy0 = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate(),
    ).getTime();
    const out: any[] = [];
    clientes.forEach((cl: any) => {
      if (!cl.fecha_nacimiento) return;
      const fn = new Date(cl.fecha_nacimiento);
      if (isNaN(fn.getTime())) return;
      let next = new Date(hoy.getFullYear(), fn.getMonth(), fn.getDate());
      let diff = Math.ceil((next.getTime() - hoy0) / 86400000);
      if (diff < 0) {
        next = new Date(hoy.getFullYear() + 1, fn.getMonth(), fn.getDate());
        diff = Math.ceil((next.getTime() - hoy0) / 86400000);
      }
      if (diff >= 0 && diff <= 7)
        out.push({ id: cl.id, nombre: cl.nombre, fecha: next, diff });
    });
    return out.sort((a, b) => a.diff - b.diff);
  }, [clientes]);
  const totalAvisos =
    sinConfirmar48h +
    cumplesProximos.length +
    mensajesSinLeer +
    clientesFugaCount;

  const servicioMap = useMemo(() => {
    const map = new Map(servicios.map((s) => [s.id, s]));
    return map;
  }, [servicios]);

  const clienteMap = useMemo(() => {
    const map = new Map(clientes.map((c) => [c.id, c]));
    return map;
  }, [clientes]);

  const profesionalMap = useMemo(() => {
    const map = new Map(profesionales.map((p) => [p.id, p]));
    return map;
  }, [profesionales]);

  // "Confirmadas" cuenta tambien las completadas: una cita completada SI estuvo confirmada,
  // asi que marcarla como completada no debe restar del contador.
  const confirmadasHoy = useMemo(
    () => citasHoy.filter(cuentaComoConfirmada).length,
    [citasHoy],
  );

  // RN-AG-073-074: metricas de aprovechamiento de tiempos muertos por profesional
  const reposoUtilMap = useMemo(() => {
    const map: Record<string, { totalMin: number; usedMin: number }> = {};
    const byProf: Record<string, any[]> = {};
    citasHoy.forEach((c: any) => {
      if (c.estado !== CITA_STATUS.CONFIRMADA) return;
      if (!byProf[c.profesional_id]) byProf[c.profesional_id] = [];
      byProf[c.profesional_id].push(c);
    });
    Object.entries(byProf).forEach(([profId, profCitas]) => {
      let totalMin = 0;
      let usedMin = 0;
      profCitas.forEach((c: any) => {
        if (!c.fin_activa || !c.fin_espera) return;
        const restStart = new Date(c.fin_activa).getTime();
        const restEnd = new Date(c.fin_espera).getTime();
        if (restEnd <= restStart) return;
        // Excluir reposos de citas anidadas (su inicio cae dentro del reposo de otra)
        const esAnidada = profCitas.some((host: any) => {
          if (host.id === c.id || !host.fin_activa || !host.fin_espera)
            return false;
          const hRestStart = new Date(host.fin_activa).getTime();
          const hRestEnd = new Date(host.fin_espera).getTime();
          return (
            new Date(c.inicio).getTime() >= hRestStart &&
            new Date(c.inicio).getTime() < hRestEnd
          );
        });
        if (esAnidada) return;
        totalMin += (restEnd - restStart) / 60000;
        // Overlap: span completo de otra cita (inicio→fin) dentro de este reposo
        profCitas.forEach((d: any) => {
          if (d.id === c.id) return;
          const dStart = new Date(d.inicio).getTime();
          const dFin = new Date(d.fin).getTime();
          const ov = Math.max(
            0,
            Math.min(dFin, restEnd) - Math.max(dStart, restStart),
          );
          usedMin += ov / 60000;
        });
      });
      if (totalMin > 0)
        map[profId] = { totalMin, usedMin: Math.min(usedMin, totalMin) };
    });
    return map;
  }, [citasHoy]);

  const citasMes = useMemo(() => {
    return citas.filter((c) => {
      const d = new Date(c.inicio);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [citas, month, year]);
  const totalCitasMes = citasMes.length;

  const ocupacionMes = useMemo(() => {
    return Math.round((totalCitasMes / OCUPACION_MAX_PER_MES) * 100);
  }, [totalCitasMes]);

  // RN-AG-073-074: resumen global de aprovechamiento de reposo del dia
  const reposoGlobal = useMemo(() => {
    let total = 0,
      used = 0;
    Object.values(reposoUtilMap).forEach((v) => {
      total += v.totalMin;
      used += v.usedMin;
    });
    return total > 0
      ? {
          totalMin: total,
          usedMin: used,
          pct: Math.round((used / total) * 100),
        }
      : null;
  }, [reposoUtilMap]);

  const handlePrevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1),
    );
  };

  const handleToday = () => {
    setSelectedDate(today.getDate());
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth()));
    setView("day");
  };

  // Las flechas mueven el PERIODO que estas viendo, no siempre un dia: en
  // Semana saltan una semana y en Mes un mes. Antes iban de dia en dia en las
  // tres vistas, asi que en Mes habia que pulsar treinta veces para pasar de mes.
  const moverPeriodo = (dir: -1 | 1) => {
    const d = new Date(selectedDateObj);
    if (view === "week") {
      d.setDate(d.getDate() + 7 * dir);
    } else if (view === "month") {
      // Ojo al 31: pasar de mes desde un dia que el mes destino no tiene se
      // desbordaria al siguiente (31 ene + 1 mes = 3 mar). Se ancla al dia 1 y
      // luego se recupera el dia, recortado al ultimo del mes.
      const diaOriginal = d.getDate();
      const destino = new Date(d.getFullYear(), d.getMonth() + dir, 1);
      const ultimoDia = new Date(
        destino.getFullYear(),
        destino.getMonth() + 1,
        0,
      ).getDate();
      destino.setDate(Math.min(diaOriginal, ultimoDia));
      d.setTime(destino.getTime());
    } else {
      d.setDate(d.getDate() + dir);
    }
    setSelectedDate(d.getDate());
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth()));
  };

  // "semana" es femenino: sin esto las etiquetas decian "Ir al semana anterior".
  const etiquetaPeriodo =
    view === "week" ? "semana" : view === "month" ? "mes" : "día";
  const etiquetaPeriodoCorta =
    view === "week" ? "Semana" : view === "month" ? "Mes" : "Día";
  const irA = (cuando: "anterior" | "siguiente") =>
    view === "week"
      ? `Ir a la semana ${cuando}`
      : `Ir al ${etiquetaPeriodo} ${cuando}`;

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh / var(--mecha-zoom, 1))",
          background: TOKENS.bg,
          color: TOKENS.text,
        }}
      >
        Cargando...
      </div>
    );

  const monthName = currentMonth.toLocaleDateString(LOCALE, {
    month: "long",
    year: "numeric",
  });

  // Barra de controles de la agenda (vista dia/semana/mes, Hoy, organizar,
  // Enseñamelo, filtros de servicio/estado, buscador y avatares de acceso
  // rapido). Se extrae a variable porque se monta en DOS sitios distintos:
  // en escritorio va junto al titulo, y en movil baja a su propia linea a
  // ancho completo (dentro de la columna del titulo solo tenia 195px y se
  // partia en cuatro filas, comiendo un tercio de la pantalla).
  // flexWrap es obligatorio: sin el, la barra era un unico item de flex de ~720px
  // que su padre (que si envuelve) no podia partir, y la agenda acababa con scroll
  // lateral en movil. Con wrap + minWidth:0 cae en dos filas y no desborda.
  const barraControlesAgenda = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        rowGap: 8,
        flexWrap: "wrap",
        minWidth: 0,
        marginLeft: isMobile ? 0 : 12,
      }}
    >
      <div
        style={{
          display: "flex",
          background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {(["day", "week", "month"] as const).map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v);
              // if (v !== "day") setRailCollapsed(false);
            }}
            style={{
              padding: isMobile ? "6px 12px" : "7px 14px",
              fontSize: isMobile ? 12 : 13,
              fontWeight: view === v ? 700 : 500,
              background: view === v ? roleTheme.primarySoft : "transparent",
              color: view === v ? roleTheme.primaryHi : TOKENS.textSec,
              border: "none",
              cursor: "pointer",
              borderRight:
                v !== "month" ? `1px solid ${TOKENS.border}` : "none",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (view !== v)
                e.currentTarget.style.background = roleTheme.primarySoft;
            }}
            onMouseLeave={(e) => {
              if (view !== v) e.currentTarget.style.background = "transparent";
            }}
          >
            {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mes"}
          </button>
        ))}
      </div>
      <button
        className="m-btn-secondary"
        onClick={handleToday}
        title="Ir a hoy"
        style={{
          padding: isMobile ? "6px 10px" : "8px 14px",
          background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text,
          borderRadius: 10,
          cursor: "pointer",
          fontSize: isMobile ? 12 : 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon name="calendar" size={isMobile ? 12 : 14} color={TOKENS.text} />
        {!isMobile && "Hoy"}
      </button>
      {/* Repasar lo cancelado sin ensuciar el dia a diario. */}
      <button
        className="m-btn-secondary"
        onClick={() => setVerCanceladas((v) => !v)}
        title={
          verCanceladas
            ? "Ocultar las citas canceladas"
            : "Ver tambien las citas canceladas"
        }
        aria-pressed={verCanceladas}
        style={{
          padding: isMobile ? "6px 10px" : "8px 14px",
          background: verCanceladas ? TOKENS.dangerSoft : TOKENS.bgCard,
          border: `1px solid ${verCanceladas ? TOKENS.danger : TOKENS.border}`,
          color: verCanceladas ? TOKENS.danger : TOKENS.text,
          borderRadius: 10,
          cursor: "pointer",
          fontSize: isMobile ? 12 : 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon
          name={verCanceladas ? "eye" : "eyeOff"}
          size={isMobile ? 12 : 14}
          color={verCanceladas ? TOKENS.danger : TOKENS.text}
        />
        {!isMobile && "Canceladas"}
      </button>
      {/* Organizar: abre el panel que APLICA los arreglos. El badge
          cuenta los problemas del dia visible, como las notificaciones. */}
      <button
        onClick={() => setShowOrganizar(true)}
        title={
          problemasAgenda.length === 0
            ? "Organizar la agenda (sin problemas detectados)"
            : `Organizar la agenda · ${problemasAgenda.length} problema${problemasAgenda.length > 1 ? "s" : ""} detectado${problemasAgenda.length > 1 ? "s" : ""}`
        }
        aria-label="Organizar mi agenda"
        className="m-btn-ai-glow"
        style={{
          position: "relative",
          padding: isMobile ? "6px 10px" : "8px 14px",
          background: `linear-gradient(135deg, ${TOKENS.bgCard} 0%, rgba(244,80,30,0.1) 100%)`,
          border: `1px solid rgba(244,80,30,0.3)`,
          color: TOKENS.text,
          borderRadius: 10,
          cursor: "pointer",
          fontSize: isMobile ? 12 : 13,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.12)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        <CerebroIAIcon size={isMobile ? 15 : 17} variant={problemasAgenda.length > 0 ? 'alerta' : 'idle'} />
        {problemasAgenda.length > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 17,
              height: 17,
              padding: "0 4px",
              borderRadius: 999,
              background: TOKENS.primary,
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: "17px",
              textAlign: "center",
              border: `1.5px solid ${TOKENS.bg}`,
              boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
              pointerEvents: "none",
            }}
          >
            {problemasAgenda.length > 9 ? "9+" : problemasAgenda.length}
          </span>
        )}
      </button>
      {/* Enseñamelo: interruptor de PREVISUALIZACION. Encendido, la
          rejilla resalta con animacion cada problema en su sitio. No
          escribe nada. Antes este boton decia "Organizar mi agenda" y
          abria un modal de "Profesional llega tarde" que no tenia nada
          que ver (ese sigue accesible desde la fila del profesional). */}
      <button
        onClick={() => {
          if (ensenar) {
            setEnsenar(false);
            setProblemaEnfocado(null);
            return;
          }
          setEnsenar(true);
          // Al encender lleva ya al primer problema en vez de dejarte
          // buscandolo por la rejilla (en movil ni siquiera era visible: solo
          // se monta la columna del profesional elegido).
          enfocarProblema(0);
        }}
        aria-pressed={ensenar}
        title={
          ensenar
            ? "Dejar de resaltar los problemas en la agenda"
            : "Enséñamelo: resalta en la agenda los huecos, solapes y retrasos detectados"
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          background: ensenar ? TOKENS.primary : "rgba(244,80,30,0.12)",
          border: `1px solid ${ensenar ? TOKENS.primary : "rgba(244,80,30,0.45)"}`,
          borderRadius: 10,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          color: ensenar ? "#fff" : TOKENS.primary,
          whiteSpace: "nowrap",
          boxShadow: ensenar
            ? "0 2px 10px rgba(244,80,30,0.45)"
            : "0 2px 6px rgba(244,80,30,0.15)",
          transition: "all 0.15s ease",
        }}
      >
        <Icon name="zap" size={13} color={ensenar ? "#fff" : TOKENS.primary} />
        {!isMobile && <span>{ensenar ? "Ocultar" : "Enséñamelo"}</span>}
      </button>
      {/* Retirado el boton del "Optimizador de la agenda" (tarjeta de IA con
          prompt de texto libre): duplicaba "Organizar mi agenda", que hace lo
          mismo de forma determinista y con propuestas aplicables a un clic. */}
      {/* El separador no pinta nada en movil, donde la barra ya
          va en varias filas y solo suma ruido. */}
      {!isMobile && (
        <div
          style={{
            width: 1,
            height: 20,
            background: TOKENS.border,
            opacity: 0.5,
            marginLeft: 4,
            marginRight: 4,
          }}
        />
      )}
      {/* Los dos filtros se reparten el ancho en movil (minWidth:0 para que
    de verdad puedan encogerse) en vez de forzar 120px cada uno. */}
      <div
        style={{
          position: "relative",
          minWidth: 0,
          flex: isMobile ? "1 1 120px" : undefined,
        }}
      >
        <button
          onClick={() => {
            setDropServicioOpen(!dropServicioOpen);
            setDropEstadoOpen(false);
          }}
          onBlur={() => setTimeout(() => setDropServicioOpen(false), 150)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            background:
              filterServicio !== "todos"
                ? "rgba(244,80,30,0.10)"
                : TOKENS.bgCard,
            border: `1px solid ${dropServicioOpen ? TOKENS.primary : filterServicio !== "todos" ? "rgba(244,80,30,0.30)" : TOKENS.border}`,
            borderRadius: 10,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            color:
              filterServicio !== "todos" ? TOKENS.primaryHi : TOKENS.textSec,
            transition: "all 0.2s ease",
            minWidth: isMobile ? 0 : 120,
            width: isMobile ? "100%" : undefined,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = TOKENS.primary;
          }}
          onMouseLeave={(e) => {
            if (!dropServicioOpen)
              e.currentTarget.style.borderColor =
                filterServicio !== "todos"
                  ? "rgba(244,80,30,0.30)"
                  : TOKENS.border;
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <span
            style={{
              flex: 1,
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {filterServicio === "todos"
              ? "Servicio"
              : servicios.find((s) => s.id === filterServicio)?.nombre ||
                "Servicio"}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: dropServicioOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.2s ease",
              flexShrink: 0,
              opacity: 0.5,
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {dropServicioOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              minWidth: 200,
              maxHeight: 260,
              overflowY: "auto",
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              zIndex: 200,
              padding: 4,
              animation: "fadeIn 0.15s ease",
            }}
          >
            <div
              onMouseDown={() => {
                setFilterServicio("todos");
                setDropServicioOpen(false);
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: filterServicio === "todos" ? 700 : 500,
                color:
                  filterServicio === "todos"
                    ? TOKENS.primaryHi
                    : TOKENS.textSec,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(244,80,30,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              Todos los servicios
            </div>
            {servicios.map((s) => (
              <div
                key={s.id}
                onMouseDown={() => {
                  setFilterServicio(s.id);
                  setDropServicioOpen(false);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: filterServicio === s.id ? 700 : 500,
                  color:
                    filterServicio === s.id ? TOKENS.primaryHi : TOKENS.text,
                  transition: "background 0.1s",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(244,80,30,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span>{s.nombre}</span>
                {s.precio != null && (
                  <span style={{ fontSize: 10, color: TOKENS.textTer }}>
                    {s.precio}EUR
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          position: "relative",
          minWidth: 0,
          flex: isMobile ? "1 1 120px" : undefined,
        }}
      >
        <button
          onClick={() => {
            setDropEstadoOpen(!dropEstadoOpen);
            setDropServicioOpen(false);
          }}
          onBlur={() => setTimeout(() => setDropEstadoOpen(false), 150)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            background:
              filterEstado !== "todos" ? "rgba(244,80,30,0.10)" : TOKENS.bgCard,
            border: `1px solid ${dropEstadoOpen ? TOKENS.primary : filterEstado !== "todos" ? "rgba(244,80,30,0.30)" : TOKENS.border}`,
            borderRadius: 10,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            color: filterEstado !== "todos" ? TOKENS.primaryHi : TOKENS.textSec,
            transition: "all 0.2s ease",
            minWidth: isMobile ? 0 : 110,
            width: isMobile ? "100%" : undefined,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = TOKENS.primary;
          }}
          onMouseLeave={(e) => {
            if (!dropEstadoOpen)
              e.currentTarget.style.borderColor =
                filterEstado !== "todos"
                  ? "rgba(244,80,30,0.30)"
                  : TOKENS.border;
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12l2.5 2.5L16 9" />
          </svg>
          <span style={{ flex: 1, textAlign: "left" }}>
            {filterEstado === "todos"
              ? "Estado"
              : filterEstado === "cobradas"
                ? "Cobradas"
                : filterEstado === "sin_cobrar"
                  ? "Pendientes de cobro"
                  : filterEstado === "no_presentada"
                    ? "No presentada"
                    : filterEstado.charAt(0).toUpperCase() + filterEstado.slice(1)}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: dropEstadoOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.2s ease",
              flexShrink: 0,
              opacity: 0.5,
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {dropEstadoOpen &&
          (() => {
            const estados = [
              {
                value: "todos",
                label: "Todos los estados",
                dot: TOKENS.textTer,
              },
              {
                value: "cobradas",
                label: "✓ Cobradas (Pagadas)",
                dot: "#10b981",
              },
              {
                value: "sin_cobrar",
                label: "⚠️ Pendientes de cobro",
                dot: "#f59e0b",
              },
              {
                value: CITA_STATUS.CONFIRMADA,
                label: "Confirmada",
                dot: TOKENS.primaryHi,
              },
              {
                value: CITA_STATUS.PENDIENTE,
                label: "Pendiente",
                dot: "#e08a00",
              },
              {
                value: CITA_STATUS.COMPLETADA,
                label: "Completada",
                dot: "#0f9d6b",
              },
              {
                value: CITA_STATUS.CANCELADA,
                label: "Cancelada",
                dot: "#e23b34",
              },
              {
                value: CITA_STATUS.NO_PRESENTADA,
                label: "No presentada",
                dot: "#e23b34",
              },
            ];
            return (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  minWidth: 180,
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 12,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                  zIndex: 200,
                  padding: 4,
                  animation: "fadeIn 0.15s ease",
                }}
              >
                {estados.map((e) => (
                  <div
                    key={e.value}
                    onMouseDown={() => {
                      setFilterEstado(e.value);
                      setDropEstadoOpen(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: filterEstado === e.value ? 700 : 500,
                      color: filterEstado === e.value ? e.dot : TOKENS.text,
                      transition: "background 0.1s",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onMouseEnter={(ev) => {
                      ev.currentTarget.style.background =
                        "rgba(244,80,30,0.08)";
                    }}
                    onMouseLeave={(ev) => {
                      ev.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: e.dot,
                        flexShrink: 0,
                      }}
                    />
                    {e.label}
                  </div>
                ))}
              </div>
            );
          })()}
      </div>

      {(filterServicio !== "todos" || filterEstado !== "todos") && (
        <button
          onClick={() => {
            setFilterServicio("todos");
            setFilterEstado("todos");
          }}
          style={{
            padding: "5px 10px",
            fontSize: 11,
            fontWeight: 600,
            background: "rgba(226,59,52,0.08)",
            border: "1px solid rgba(226,59,52,0.20)",
            borderRadius: 8,
            color: "#e23b34",
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: 4,
            animation: "fadeIn 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(226,59,52,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(226,59,52,0.08)";
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          Limpiar
        </button>
      )}

      <div style={{ position: "relative" }}>
        {!searchOpen ? (
          <button
            onClick={() => setSearchOpen(true)}
            title="Buscar cita"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 10,
              color: TOKENS.textSec,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.primary;
              e.currentTarget.style.color = TOKENS.primaryHi;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
              e.currentTarget.style.color = TOKENS.textSec;
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: TOKENS.bgCard,
                border: `1px solid ${searchOpen ? TOKENS.primary : TOKENS.border}`,
                borderRadius: 10,
                padding: "7px 12px",
                transition: "all 0.25s ease",
                width: searchOpen ? 280 : 36,
                boxShadow: searchOpen
                  ? `0 0 0 3px rgba(244,80,30,0.10)`
                  : "none",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={searchOpen ? TOKENS.primaryHi : TOKENS.textTer}
                strokeWidth="2"
                style={{ transition: "stroke 0.2s ease", flexShrink: 0 }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  setSearchOpen(true);
                  setDropServicioOpen(false);
                  setDropEstadoOpen(false);
                }}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                placeholder={searchOpen ? "Buscar cita..." : ""}
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: TOKENS.text,
                  fontSize: 12,
                  width: "100%",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: TOKENS.textTer,
                    padding: 2,
                    display: "flex",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = TOKENS.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = TOKENS.textTer;
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div
                onWheel={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 6,
                  width: 360,
                  maxHeight: 340,
                  overflowY: "auto",
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 14,
                  boxShadow: "0 16px 50px rgba(0,0,0,0.55)",
                  zIndex: 200,
                  padding: 6,
                  animation: "slideInUp 0.2s ease",
                  overscrollBehavior: "contain",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: TOKENS.textTer,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  {searchResults.length} resultado
                  {searchResults.length !== 1 ? "s" : ""}
                </div>
                {searchResults.map((c: any) => {
                  const cli = clientes.find(
                    (cl: any) => cl.id === c.cliente_id,
                  );
                  const srv = servicios.find(
                    (s: any) => s.id === c.servicio_id,
                  );
                  const prof = profesionales.find(
                    (p: any) => p.id === c.profesional_id,
                  );
                  const fecha = new Date(c.inicio);
                  return (
                    <div
                      key={c.id}
                      onMouseDown={() => {
                        const citaDate = new Date(c.inicio);
                        setSelectedDate(citaDate.getDate());
                        setCurrentMonth(
                          new Date(citaDate.getFullYear(), citaDate.getMonth()),
                        );
                        setView("day");
                        setSearchQuery("");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(244,80,30,0.08)";
                        e.currentTarget.style.transform = "none";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          height: 32,
                          borderRadius: 2,
                          background: prof?.color || TOKENS.primary,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: TOKENS.text,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {cli?.nombre || "Sin cliente"}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: TOKENS.textTer,
                            marginTop: 1,
                          }}
                        >
                          {srv?.nombre} - {prof?.nombre?.split(" ")[0]}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: TOKENS.textSec,
                          }}
                        >
                          {fecha.toLocaleDateString("es-ES", {
                            day: "numeric",
                            month: "short",
                          })}
                        </div>
                        <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                          {fecha.toLocaleTimeString("es-ES", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <button
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setShowClienteHistorial(cli);
                        }}
                        style={{
                          padding: "4px 8px",
                          fontSize: 10,
                          fontWeight: 600,
                          background: "rgba(244,80,30,0.10)",
                          border: "1px solid rgba(244,80,30,0.25)",
                          borderRadius: 6,
                          color: TOKENS.primaryHi,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "rgba(244,80,30,0.20)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            "rgba(244,80,30,0.10)";
                        }}
                      >
                        Historial
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Acceso rapido por profesional, junto a la lupa. Aisla la columna de un
    estilista sin tener que salir de pantalla completa para llegar al filtro
    del rail. Pulsar el que ya esta activo vuelve a "Todos". */}
      {!isMobile && visibleProfs.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            paddingLeft: 8,
            marginLeft: 4,
            borderLeft: `1px solid ${TOKENS.border}`,
          }}
        >
          <button
            onClick={() => setSelectedProf("todos")}
            title="Ver todos los profesionales"
            aria-pressed={selectedProf === "todos"}
            style={{
              height: 28,
              padding: "0 9px",
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.3,
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.15s ease",
              background:
                selectedProf === "todos"
                  ? "rgba(244,80,30,0.12)"
                  : TOKENS.bgCard,
              border: `1px solid ${selectedProf === "todos" ? TOKENS.primary : TOKENS.border}`,
              color:
                selectedProf === "todos" ? TOKENS.primaryHi : TOKENS.textTer,
            }}
          >
            Todos
          </button>
          {visibleProfs.map((p) => {
            const activo = selectedProf === p.id;
            const ini =
              (p.nombre || "?")
                .split(/\s+/)
                .map((w: string) => w[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase() || "?";
            const nCitas = citasHoy.filter(
              (c: any) => c.profesional_id === p.id,
            ).length;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProf(activo ? "todos" : p.id)}
                title={
                  activo
                    ? `${p.nombre} · ${nCitas} cita${nCitas === 1 ? "" : "s"} hoy (pulsa para ver a todos)`
                    : `Ver solo la agenda de ${p.nombre} · ${nCitas} cita${nCitas === 1 ? "" : "s"} hoy`
                }
                aria-label={`Ver solo la agenda de ${p.nombre}`}
                aria-pressed={activo}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  padding: 0,
                  overflow: "hidden",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: p.color,
                  border: `2px solid ${activo ? p.color : "transparent"}`,
                  boxShadow: activo
                    ? `0 0 0 2px ${TOKENS.bg}, 0 0 0 3.5px ${p.color}`
                    : "0 1px 2px rgba(0,0,0,0.15)",
                  opacity: activo || selectedProf === "todos" ? 1 : 0.45,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.transform = "scale(1.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity =
                    activo || selectedProf === "todos" ? "1" : "0.45";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {p.foto_perfil ? (
                  <img
                    src={p.foto_perfil}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#ffffff",
                      lineHeight: 1,
                    }}
                  >
                    {ini}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const numFiltrosActivos =
    (filterServicio !== "todos" ? 1 : 0) +
    (filterEstado !== "todos" ? 1 : 0) +
    (verCanceladas ? 1 : 0) +
    (ensenar ? 1 : 0) +
    (searchQuery.trim().length > 0 ? 1 : 0);

  // Mini-barra de controles ultracompacta para móvil (1 sola línea limpia)
  const miniBarraAgendaMobile = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        width: "100%",
        marginTop: 2,
        marginBottom: 8,
      }}
    >
      {/* Selector vista Día / Semana */}
      <div
        style={{
          display: "flex",
          background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 9,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {/* Mes tambien en movil: la barra de escritorio (barraControlesAgenda) no
            se pinta aqui, asi que sin este tercer segmento la vista de mes era
            sencillamente inalcanzable desde el telefono. Etiquetas cortas para
            que los tres quepan en 375 px junto al resto de controles. */}
        {(["day", "week", "month"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "5px 9px",
              fontSize: 12,
              fontWeight: view === v ? 700 : 500,
              background: view === v ? roleTheme.primarySoft : "transparent",
              color: view === v ? roleTheme.primaryHi : TOKENS.textSec,
              border: "none",
              cursor: "pointer",
              borderRight: v !== "month" ? `1px solid ${TOKENS.border}` : "none",
            }}
          >
            {v === "day" ? "Día" : v === "week" ? "Sem." : "Mes"}
          </button>
        ))}
      </div>

      {/* Boton rapido Hoy. Solo icono: los cinco controles de esta fila mas el
          recuento suman 39 px mas de los 351 disponibles a 375 px, y el rotulo
          "Hoy" es lo que menos falta hace (el icono de calendario ya lo dice, y
          queda el aria-label). Con el texto, el recuento se cortaba a "6.". */}
      <button
        onClick={handleToday}
        title="Ir a hoy"
        aria-label="Ir a hoy"
        style={{
          display: "grid",
          placeItems: "center",
          width: 29,
          height: 27,
          background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text,
          borderRadius: 9,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Icon name="calendar" size={14} color={TOKENS.text} />
      </button>

      {/* Botón Filtros con Badge de activos */}
      <button
        onClick={() => setMobileFiltersOpen(true)}
        title="Abrir filtros de agenda"
        aria-label="Filtros de agenda"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 9px",
          background: numFiltrosActivos > 0 ? "rgba(244,80,30,0.12)" : TOKENS.bgCard,
          border: `1px solid ${numFiltrosActivos > 0 ? TOKENS.primary : TOKENS.border}`,
          color: numFiltrosActivos > 0 ? TOKENS.primaryHi : TOKENS.textSec,
          borderRadius: 9,
          cursor: "pointer",
          fontSize: 11.5,
          fontWeight: numFiltrosActivos > 0 ? 700 : 600,
          position: "relative",
          flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
        <span>Filtros</span>
        {numFiltrosActivos > 0 && (
          <span
            style={{
              minWidth: 15,
              height: 15,
              padding: "0 3px",
              borderRadius: 999,
              background: TOKENS.primary,
              color: "#fff",
              fontSize: 9.5,
              fontWeight: 800,
              lineHeight: "15px",
              textAlign: "center",
            }}
          >
            {numFiltrosActivos}
          </span>
        )}
      </button>

      {/* Botón Organizar / Auto */}
      <button
        onClick={() => setShowOrganizar(true)}
        title="Organizar la agenda"
        aria-label="Organizar la agenda"
        style={{
          position: "relative",
          padding: "5px 8px",
          background: `linear-gradient(135deg, ${TOKENS.bgCard} 0%, rgba(244,80,30,0.1) 100%)`,
          border: "1px solid rgba(244,80,30,0.3)",
          color: TOKENS.text,
          borderRadius: 9,
          cursor: "pointer",
          fontSize: 11.5,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <CerebroIAIcon size={14} variant={problemasAgenda.length > 0 ? 'alerta' : 'idle'} />
        <span>Auto</span>
        {problemasAgenda.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 15,
              height: 15,
              padding: "0 3px",
              borderRadius: 999,
              background: TOKENS.primary,
              color: "#fff",
              fontSize: 9,
              fontWeight: 800,
              lineHeight: "15px",
              textAlign: "center",
            }}
          >
            {problemasAgenda.length > 9 ? "9+" : problemasAgenda.length}
          </span>
        )}
      </button>

      {/* La lupa suelta se retiro: abria exactamente la misma hoja que "Filtros",
          que ya lleva el buscador como primer campo. Ocupaba ancho sin anadir
          nada, y la busqueda activa ya cuenta en el badge de filtros.
          El hueco que deja lo ocupa el recuento del dia, que antes vivia en una
          linea propia bajo la fecha. */}
      <span
        title={`${totalActivasHoy} citas · ${confirmadasHoy} confirmadas`}
        style={{
          fontSize: 11,
          color: TOKENS.textSec,
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {confirmadasHoy}/{totalActivasHoy}
      </span>
    </div>
  );

  // Panel Bottom Sheet de Filtros para Móvil
  const modalFiltrosMovil = isMobile && mobileFiltersOpen && (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        animation: "fadeIn 0.2s ease",
      }}
      onClick={() => setMobileFiltersOpen(false)}
    >
      <div
        style={{
          background: TOKENS.bgCard,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderTop: `1px solid ${TOKENS.border}`,
          padding: "18px 18px calc(env(safe-area-inset-bottom, 0px) + 18px)",
          maxHeight: "85vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 -10px 40px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <b style={{ fontSize: 16, color: TOKENS.text }}>Filtros de la agenda</b>
            {numFiltrosActivos > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.primaryHi, background: roleTheme.primarySoft, padding: "2px 7px", borderRadius: 6 }}>
                {numFiltrosActivos} activo{numFiltrosActivos > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={() => setMobileFiltersOpen(false)}
            style={{
              border: "none",
              background: "transparent",
              color: TOKENS.textSec,
              fontSize: 20,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Buscador de citas en móvil */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TOKENS.textSec, marginBottom: 6 }}>
            Buscar cliente, servicio o notas
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: TOKENS.bg,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 10,
              padding: "8px 12px",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.textSec} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Escribe para buscar..."
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                color: TOKENS.text,
                fontSize: 14,
                outline: "none",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ border: "none", background: "transparent", color: TOKENS.textSec, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            )}
          </div>
          {/* Si hay resultados de búsqueda */}
          {searchResults.length > 0 && searchQuery && (
            <div style={{ marginTop: 8, maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {searchResults.map((c: any) => {
                const fecha = new Date(c.inicio);
                const cli = clientes.find((cl: any) => cl.id === c.cliente_id);
                const srv = servicios.find((s: any) => s.id === c.servicio_id);
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedDate(fecha.getDate());
                      setCurrentMonth(new Date(fecha.getFullYear(), fecha.getMonth()));
                      setView("day");
                      setMobileFiltersOpen(false);
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: TOKENS.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12.5,
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <b style={{ color: TOKENS.text }}>{cli?.nombre || "Cita"}</b>
                      <div style={{ fontSize: 11, color: TOKENS.textSec }}>{srv?.nombre}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.primary }}>
                      {fecha.toLocaleDateString(LOCALE, { day: "numeric", month: "short" })} {fmtHHMM(fecha)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selector de Servicio */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TOKENS.textSec, marginBottom: 6 }}>
            Filtrar por Servicio
          </label>
          <select
            value={filterServicio}
            onChange={(e) => setFilterServicio(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              background: TOKENS.bg,
              border: `1px solid ${filterServicio !== "todos" ? TOKENS.primary : TOKENS.border}`,
              color: TOKENS.text,
              fontSize: 13.5,
              outline: "none",
            }}
          >
            <option value="todos">Todos los servicios</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} {s.precio != null ? `(${s.precio} €)` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Selector de Estado */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TOKENS.textSec, marginBottom: 6 }}>
            Filtrar por Estado
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { value: "todos", label: "Todos" },
              { value: "cobradas", label: "✓ Cobradas" },
              { value: "sin_cobrar", label: "⚠️ Sin cobrar" },
              { value: CITA_STATUS.CONFIRMADA, label: "Confirmadas" },
              { value: CITA_STATUS.PENDIENTE, label: "Pendientes" },
              { value: CITA_STATUS.COMPLETADA, label: "Completadas" },
              { value: CITA_STATUS.NO_PRESENTADA, label: "No presentadas" },
            ].map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setFilterEstado(st.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${filterEstado === st.value ? TOKENS.primary : TOKENS.border}`,
                  background: filterEstado === st.value ? roleTheme.primarySoft : TOKENS.bg,
                  color: filterEstado === st.value ? roleTheme.primaryHi : TOKENS.text,
                  fontSize: 12,
                  fontWeight: filterEstado === st.value ? 700 : 500,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles: Citas canceladas y Modo Enséñamelo */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            onClick={() => setVerCanceladas((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: 10,
              background: verCanceladas ? TOKENS.dangerSoft : TOKENS.bg,
              border: `1px solid ${verCanceladas ? TOKENS.danger : TOKENS.border}`,
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: verCanceladas ? TOKENS.danger : TOKENS.text }}>
                Mostrar citas canceladas
              </div>
              <div style={{ fontSize: 11, color: TOKENS.textSec }}>Ver huecos cancelados en la línea temporal</div>
            </div>
            <Icon name={verCanceladas ? "eye" : "eyeOff"} size={16} color={verCanceladas ? TOKENS.danger : TOKENS.textSec} />
          </div>

          <div
            onClick={() => {
              if (ensenar) {
                setEnsenar(false);
                setProblemaEnfocado(null);
              } else {
                setEnsenar(true);
                enfocarProblema(0);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: 10,
              background: ensenar ? roleTheme.primarySoft : TOKENS.bg,
              border: `1px solid ${ensenar ? TOKENS.primary : TOKENS.border}`,
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: ensenar ? roleTheme.primaryHi : TOKENS.text }}>
                Modo Enséñamelo
              </div>
              <div style={{ fontSize: 11, color: TOKENS.textSec }}>Resaltar solapes, huecos y retrasos en directo</div>
            </div>
            <Icon name="zap" size={16} color={ensenar ? TOKENS.primary : TOKENS.textSec} />
          </div>

          {/* Cerrar el salon: en escritorio es un boton de la barra de titulo;
              en movil esa fila no da para mas, asi que la accion vive aqui. */}
          <div
            onClick={() => {
              setMobileFiltersOpen(false);
              setShowCierreSalon(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(226,59,52,0.08)",
              border: "1px solid rgba(226,59,52,0.25)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e23b34" }}>
                Cerrar el salón
              </div>
              <div style={{ fontSize: 11, color: TOKENS.textSec }}>Festivo, obras o cierre puntual</div>
            </div>
            <Icon name="x" size={16} color="#e23b34" />
          </div>
        </div>

        {/* Botones inferiores */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {numFiltrosActivos > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterServicio("todos");
                setFilterEstado("todos");
                setVerCanceladas(false);
                setEnsenar(false);
                setSearchQuery("");
              }}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: 10,
                border: `1px solid ${TOKENS.border}`,
                background: TOKENS.bg,
                color: TOKENS.danger,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Limpiar
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
            style={{
              flex: 2,
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background: `linear-gradient(120deg, ${TOKENS.primary}, ${roleTheme.primaryHi})`,
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: `0 4px 14px ${roleTheme.primaryGlow}`,
            }}
          >
            Ver agenda
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <style>{ANIMATIONS}</style>
      {/* Topbar — en movil: fila compacta (titulo + campana + acciones), sin la
          fecha larga (ya se ve en la cabecera del dia) y sin pills informativas
          (su contenido vive en el panel de avisos). Antes la campana y los
          botones se montaban encima del titulo. */}
      <div
        className="m-fade-in"
        style={{
          // En movil "pantalla completa" SI hace algo: esconde esta barra y la
          // de controles para dejarle el alto a la rejilla. Se vuelve con el
          // boton de minimizar que queda junto a las flechas de dia.
          display: movilFullscreen ? "none" : "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: isMobile ? 8 : 12,
          // Con el ancho justo (ventana estrecha, rail abierto o zoom de texto
          // grande) "Agenda" + el badge de rol + los indicadores de la derecha
          // no caben en una fila. Todos llevan flexShrink:0/nowrap, asi que en
          // vez de encogerse DESBORDABAN y se solapaban ("PROPIETARIO" encima
          // de "% reposo"). Con wrap, lo que no cabe baja de linea.
          flexWrap: "wrap",
          rowGap: 8,
          padding: isMobile ? "10px 14px" : "11px 28px",
          borderBottom: `1px solid ${roleTheme.borderHeader}`,
          position: "relative",
          zIndex: 60,
        }}
      >
        <div
          style={{
            // En movil esto es una COLUMNA, no una fila: el aviso de cierre y la
            // leyenda cuelgan debajo del titulo (por eso llevan marginTop). Como
            // fila se sentaban al lado de "Agenda" y, con los cinco controles de
            // la derecha, acababan tapandolo.
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "flex-start" : "center",
            gap: isMobile ? 0 : 12,
            minWidth: 0,
            flex: isMobile ? "1 1 0" : undefined,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap", rowGap: 4 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: -0.3,
                flexShrink: 0,
              }}
            >
              Agenda
            </h1>
            {/* Badge de rol solo en escritorio: en movil no cabe junto al titulo y
                los botones de accion, y acababa tapado por ellos. El rol sigue
                visible en la hoja de cuenta ("Mas"). */}
            {!isMobile && userProfile?.role && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: roleTheme.badgeColor,
                  background: roleTheme.badgeBg,
                  padding: "2px 8px",
                  borderRadius: 20,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {roleLabelText(userProfile.role)}
              </span>
            )}
          </div>
          {/* Fecha y estadisticas eliminadas del banner por redundancia */}
          {cierreHoy && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
                padding: "4px 10px",
                background: "rgba(226,59,52,0.10)",
                border: "1px solid rgba(226,59,52,0.30)",
                color: "#e23b34",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "#e23b34",
                }}
              />
              Salon cerrado{cierreHoy.motivo ? ` · ${cierreHoy.motivo}` : ""}
            </div>
          )}
          {/* Aqui vivia la leyenda de tipos de bloqueo. RETIRADA (25 ago 2026).
              Primero se quito de movil porque robaba una o dos lineas enteras de
              la cabecera; ahora se retira tambien de escritorio. La razon por la
              que se puso —distinguir "fuera de turno" de "salon cerrado"— ya la
              cubren la propia rejilla (cada bloque lleva su etiqueta dentro y su
              color) y el aviso de "Salon cerrado" que hay justo encima. Explicar
              con una fila de puntos de colores unos colores que ya estan
              explicados en su sitio era ruido en la parte mas mirada de la app.
              BLOQUEO_LABELS y BLOQUEO_COLORS siguen usandose para pintar los
              bloques: no se toca la fuente de verdad. */}
        </div>
        <div
          style={{
            display: "flex",
            gap: isMobile ? 6 : 10,
            alignItems: "center",
            flexShrink: 0,
            // Igual que el resto de la barra: si no cabe, baja de linea en
            // vez de montarse encima del badge de rol.
            flexWrap: "wrap",
            rowGap: 6,
            justifyContent: "flex-end",
          }}
        >
          {!isMobile && reposoGlobal && (
            <div
              title={`${reposoGlobal.usedMin} de ${reposoGlobal.totalMin} min de reposo aprovechados hoy`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "#f59e0b",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Icon name="zap" size={16} color="#f59e0b" />
              {reposoGlobal.pct}% reposo
            </div>
          )}
          {!isMobile && sinConfirmar48h >= 0 && (
            <div
              title={`${sinConfirmar48h} cita${sinConfirmar48h === 1 ? "" : "s"} de las proximas 48h que la clienta aun no ha confirmado`}
              // Solo alarma si hay algo pendiente: en 0 se queda neutro.
              className={sinConfirmar48h > 0 ? "m-pulse-red" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: sinConfirmar48h > 0 ? "#e23b34" : TOKENS.textTer,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Icon
                name="alert"
                size={16}
                color={sinConfirmar48h > 0 ? "#e23b34" : TOKENS.textTer}
              />
              {sinConfirmar48h} sin confirmar
            </div>
          )}
          {!isMobile && (
            <button
              onClick={() => setShowManualPanel(true)}
              title="Manual de esta pagina"
              className="m-btn-icon"
              style={{
                padding: 7,
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 9,
                color: TOKENS.textSec,
                cursor: "pointer",
                width: 33,
                height: 33,
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          )}
          <ListaEsperaDropdown negocioId={negocioId} />
          <div
            style={{ position: "relative" }}
            ref={(el) => {
              notifPanelRef.current = el;
            }}
          >
            <AvisosBell mode="header">
              {onboardingPending && (
                <OnboardingCard
                  coreCompletados={onboarding.coreCompletados}
                  coreTotal={onboarding.coreTotal}
                  coreDone={onboarding.coreDone}
                  completados={obCompletados}
                  total={obConsiderados}
                  isMobile={isMobile}
                  onOpen={() => {
                    onboarding.refresh();
                    setShowOnboardingPanel(true);
                  }}
                  onHide={hideOnboarding}
                  onAbrirChispa={() => {
                    window.dispatchEvent(
                      new CustomEvent(CHISPA_CONFIG_GUIADA_EVENT),
                    );
                  }}
                />
              )}
              {reposoGlobal && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.22)",
                    borderRadius: 10,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "#f59e0b",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "#f59e0b",
                      fontWeight: 600,
                    }}
                  >
                    {reposoGlobal.pct}% del reposo aprovechado hoy
                  </span>
                </div>
              )}
            </AvisosBell>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: isMobile ? 6 : 10,
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {/* Boton Ocultar Filtros eliminado. En movil no pliega ningun rail
              (no lo hay): apaga la barra de titulo y la de controles.
              En MOVIL no se pinta aqui: habia dos botones identicos de pantalla
              completa, este y el de la fila de la fecha. El de abajo es el que
              manda, porque es el unico que sigue visible una vez esta barra se
              oculta. */}
          {!isMobile && (
          <button
            onClick={alternarPantallaCompleta}
            title={
              pantallaCompletaActiva
                ? isMobile
                  ? "Salir de pantalla completa (mostrar cabecera y filtros)"
                  : "Salir de pantalla completa (mostrar profesionales, calendario y resumen)"
                : isMobile
                  ? "Pantalla completa (ocultar cabecera y filtros)"
                  : "Pantalla completa (ocultar el panel lateral)"
            }
            aria-label={
              pantallaCompletaActiva
                ? "Salir de pantalla completa"
                : "Pantalla completa"
            }
            aria-pressed={pantallaCompletaActiva}
            style={{
              padding: isMobile ? "6px 10px" : isTablet ? 7 : "7px 12px",
              background: pantallaCompletaActiva
                ? roleTheme.primarySoft
                : TOKENS.bgCard,
              border: `1px solid ${pantallaCompletaActiva ? roleTheme.primary + "40" : TOKENS.border}`,
              color: pantallaCompletaActiva
                ? roleTheme.primaryHi
                : TOKENS.textSec,
              borderRadius: 9,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              minHeight: 33,
              transition: "all 0.15s ease",
            }}
          >
            <Icon
              name={pantallaCompletaActiva ? "minimize" : "maximize"}
              size={15}
              color={
                pantallaCompletaActiva ? roleTheme.primaryHi : TOKENS.textSec
              }
            />
            {/* La etiqueta larga solo cabe en escritorio; en movil/tablet manda el icono
                (el estado tambien se lee por el color de fondo del boton). */}
            {!isMobile && !isTablet && (
              <span>
                {pantallaCompletaActiva
                  ? "Salir de pantalla completa"
                  : "Pantalla completa"}
              </span>
            )}
          </button>
          )}
          {/* Boton Organizar movido abajo */}
          {/* Boton Hoy movido abajo */}
          {/* "Cerrar salon" no cabe en la fila de movil junto al titulo, la
              campana, la lista de espera y "Cita": vive en la hoja de filtros. */}
          {!isMobile && (
          <button
            onClick={() => setShowCierreSalon(true)}
            title="Cerrar salon"
            aria-label="Cerrar salon"
            style={{
              padding: isMobile ? "7px 8px" : "7px 12px",
              background: "rgba(226,59,52,0.10)",
              border: "1px solid rgba(226,59,52,0.25)",
              color: "#e23b34",
              borderRadius: 9,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
              minHeight: 33,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(226,59,52,0.20)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(226,59,52,0.10)";
            }}
          >
            <Icon name="x" size={15} color="#e23b34" />
            {!isMobile && "Cerrar salon"}
          </button>
          )}
          <button
            className="m-btn-primary"
            onClick={() => {
              setNewCitaPrefill(null);
              setShowNewCita(true);
            }}
            style={{
              padding: isMobile ? "7px 10px" : "7px 13px",
              background: `linear-gradient(180deg, ${roleTheme.primary === "#f4501e" ? "#ff7a2e" : roleTheme.primary} 0%, ${roleTheme.primaryHi} 100%)`,
              color: "#fff",
              border: "none",
              borderRadius: 9,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              boxShadow: `0 6px 20px ${roleTheme.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              minHeight: 33,
            }}
          >
            <Icon name="plus" size={15} color="#fff" />
            {isMobile ? "Cita" : "Nueva cita"}
          </button>
        </div>
      </div>

      {!paginaManual.loading && !paginaManual.visto && (
        <AvisoPrimeraVisita
          content={manualAgenda}
          isMobile={isMobile}
          onVerManual={() => {
            paginaManual.marcarVisto();
            setShowManualPanel(true);
          }}
          onCerrar={paginaManual.marcarVisto}
        />
      )}

      {/* AlertBar: citas vencidas */}
      {citasVencidas.length > 0 &&
        !hideCitasVencidas &&
        (() => {
          // En movil la cinta pasa a una fila propia a lo ancho; si hay varias, se
          // desplaza sola (marquesina) para no obligar a scroll horizontal a mano.
          // Se pausa al tocar/pasar el raton y cada chip sigue siendo clicable.
          const vencChips = citasVencidas.slice(0, isMobile ? 12 : 5);
          const marquee = isMobile && vencChips.length > 1;
          const chipList = marquee ? [...vencChips, ...vencChips] : vencChips;
          const renderChip = (c: Cita, k: number) => {
            const prof = profesionales.find((p) => p.id === c.profesional_id);
            const cli = clientes.find((cl) => cl.id === c.cliente_id);
            const ini = new Date(c.inicio);
            const minutosRetraso = Math.round(
              (Date.now() - ini.getTime()) / 60000,
            );
            return (
              <button
                key={`${c.id}-${k}`}
                onClick={() => setShowClientaTarde(c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: isMobile ? 4 : 6,
                  padding: isMobile ? "3px 8px" : "5px 10px",
                  background: "rgba(226,59,52,0.12)",
                  border: "1px solid rgba(226,59,52,0.25)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: isMobile ? 10.5 : 11,
                  fontWeight: 600,
                  color: TOKENS.text,
                  whiteSpace: "nowrap",
                  transition: "background 0.15s ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(226,59,52,0.20)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(226,59,52,0.12)";
                }}
              >
                {prof && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: prof.color,
                    }}
                  />
                )}
                <span>{cli?.nombre ?? "Cliente"}</span>
                <span style={{ color: "#e23b34" }}>+{minutosRetraso}min</span>
              </button>
            );
          };
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: isMobile ? 6 : 12,
                padding: isMobile ? "5px 8px" : "10px 32px",
                background: "rgba(226,59,52,0.08)",
                borderBottom: "1px solid rgba(226,59,52,0.20)",
                animation: "fadeIn 0.3s ease",
                // En movil la cinta es UNA sola fila fina: reloj + nombres que
                // giran + cruz. Antes envolvia (el rotulo "N retrasos" y la cruz
                // se comian una linea entera y los chips bajaban a otra), asi que
                // dos retrasos ocupaban el doble de alto que uno.
                flexWrap: "nowrap",
              }}
            >
              <style>{`@keyframes mechaVencMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}} .venc-marquee-track:hover,.venc-marquee-track:active{animation-play-state:paused}`}</style>
              <span
                title={`${citasVencidas.length} retraso${citasVencidas.length > 1 ? "s" : ""}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: isMobile ? 3 : 6,
                  fontSize: isMobile ? 11.5 : 13,
                  fontWeight: 700,
                  color: "#e23b34",
                  flexShrink: 0,
                }}
              >
                <Icon name="clock" size={isMobile ? 13 : 15} color="#e23b34" />
                {/* En movil solo la cifra: el rotulo "retrasos" no cabe sin
                    robarle el ancho a los nombres, que es lo util. */}
                {isMobile
                  ? citasVencidas.length
                  : `${citasVencidas.length} retraso${citasVencidas.length > 1 ? "s" : ""}`}
              </span>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <div
                  className={marquee ? "venc-marquee-track" : undefined}
                  style={
                    marquee
                      ? {
                          display: "inline-flex",
                          gap: 6,
                          whiteSpace: "nowrap",
                          animation: `mechaVencMarquee ${Math.max(10, vencChips.length * 3.5)}s linear infinite`,
                          willChange: "transform",
                        }
                      : { display: "flex", gap: 6, overflowX: "auto" }
                  }
                >
                  {chipList.map((c, k) => renderChip(c, k))}
                </div>
              </div>
              {!isMobile && citasVencidas.length > 5 && (
                <span
                  style={{
                    fontSize: 11,
                    color: TOKENS.textTer,
                    whiteSpace: "nowrap",
                  }}
                >
                  +{citasVencidas.length - 5} mas
                </span>
              )}
              <button
                onClick={() => setHideCitasVencidas(true)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#e23b34",
                  opacity: 0.6,
                  padding: isMobile ? 2 : 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "opacity 0.15s ease",
                  marginLeft: isMobile ? 2 : 8,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.6";
                }}
                title="Ocultar aviso"
              >
                <svg
                  width={isMobile ? 14 : 16}
                  height={isMobile ? 14 : 16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          );
        })()}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: isReallyCollapsed ? "1fr" : "340px 1fr",
          overflow: "hidden",
        }}
      >
        {/* Left rail */}
        {!isReallyCollapsed && (
          <div
            style={{
              borderRight: `1px solid ${TOKENS.border}`,
              padding: 20,
              overflowY: "auto",
              overscrollBehavior: "contain",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {/* Profesionales — filtro de columnas. Va PRIMERO en el rail: es lo
                que mas se toca durante el dia (ver quien tiene hueco, aislar una
                columna). El mini-calendario y el resumen quedan debajo. */}
            <div style={{ flexShrink: 0 }}>
              <button
                onClick={() => setProfsCollapsed((v) => !v)}
                title={
                  profsCollapsed
                    ? "Mostrar profesionales"
                    : "Ocultar profesionales"
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  marginBottom: profsCollapsed ? 0 : 10,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: TOKENS.textTer,
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Profesionales
                </span>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    transform: profsCollapsed
                      ? "rotate(0deg)"
                      : "rotate(90deg)",
                    transition: "transform 0.18s ease",
                  }}
                >
                  <Icon name="chevronRight" size={14} color={TOKENS.textTer} />
                </span>
              </button>
              {!profsCollapsed && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    // Con plantillas grandes la lista empujaba el calendario y el
                    // resumen fuera del rail. A partir de 8 profesionales scrollea
                    // ella sola; por debajo manda el scroll unico del rail.
                    ...(visibleProfs.length > 8
                      ? {
                          maxHeight: 320,
                          overflowY: "auto" as const,
                          overscrollBehavior: "contain" as const,
                          paddingRight: 4,
                        }
                      : null),
                  }}
                >
                  <ProfRow
                    id="todos"
                    name="Todos"
                    color={TOKENS.primary}
                    count={citasHoy.length}
                    selected={selectedProf === "todos"}
                    onSel={() => setSelectedProf("todos")}
                  />
                  {visibleProfs.map((p) => (
                    <ProfRow
                      key={p.id}
                      id={p.id}
                      name={p.nombre}
                      role={p.rol}
                      color={p.color}
                      count={
                        citasHoy.filter((c) => c.profesional_id === p.id).length
                      }
                      selected={selectedProf === p.id}
                      onSel={() => setSelectedProf(p.id)}
                      reposoUtil={reposoUtilMap[p.id]}
                      onRetraso={
                        recolocarRetraso
                          ? () => setShowRetrasoProf(p.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Mini-calendario — colapsable de forma independiente */}
            <div style={{ flexShrink: 0 }}>
              <button
                onClick={() => setMiniCalCollapsed((v) => !v)}
                title={
                  miniCalCollapsed ? "Mostrar calendario" : "Ocultar calendario"
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  marginBottom: miniCalCollapsed ? 0 : 10,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: TOKENS.textTer,
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Calendario
                </span>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    transform: miniCalCollapsed
                      ? "rotate(0deg)"
                      : "rotate(90deg)",
                    transition: "transform 0.18s ease",
                  }}
                >
                  <Icon name="chevronRight" size={14} color={TOKENS.textTer} />
                </span>
              </button>
              {!miniCalCollapsed && (
                <div
                  style={{
                    background: TOKENS.bgCard,
                    border: `1px solid ${TOKENS.border}`,
                    borderRadius: 14,
                    padding: 14,
                    animation: "slideInUp 0.3s ease both",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <button
                      className="m-btn-icon m-btn-icon-rotate-l"
                      onClick={handlePrevMonth}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: TOKENS.bg,
                        border: `1px solid ${TOKENS.border}`,
                        color: TOKENS.textSec,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        padding: 0,
                      }}
                    >
                      <Icon
                        name="chevronLeft"
                        size={18}
                        color={TOKENS.textSec}
                      />
                    </button>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: TOKENS.text,
                        textTransform: "capitalize",
                        letterSpacing: -0.2,
                      }}
                    >
                      {monthName}
                    </div>
                    <button
                      className="m-btn-icon m-btn-icon-rotate-r"
                      onClick={handleNextMonth}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: TOKENS.bg,
                        border: `1px solid ${TOKENS.border}`,
                        color: TOKENS.textSec,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        padding: 0,
                      }}
                    >
                      <Icon
                        name="chevronRight"
                        size={18}
                        color={TOKENS.textSec}
                      />
                    </button>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7,1fr)",
                      gap: 2,
                      marginBottom: 4,
                    }}
                  >
                    {DAY_NAMES.map((d) => (
                      <div
                        key={d}
                        style={{
                          textAlign: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: TOKENS.textTer,
                          letterSpacing: 0.3,
                          padding: "2px 0",
                        }}
                      >
                        {d.charAt(0)}
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7,1fr)",
                      gap: 2,
                    }}
                  >
                    {cells.map((d, i) => {
                      if (!d) return <div key={i} style={{ height: 34 }} />;
                      const isSel = d === selectedDate;
                      const isToday =
                        d === today.getDate() &&
                        month === today.getMonth() &&
                        year === today.getFullYear();
                      const cnt = counts[d] || 0;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedDate(d)}
                          style={{
                            height: 34,
                            borderRadius: 9,
                            background: isToday
                              ? "linear-gradient(180deg,#ff7a2e,#f4501e)"
                              : isSel
                                ? "rgba(244,80,30,0.14)"
                                : "transparent",
                            border:
                              isSel && !isToday
                                ? `1px solid ${TOKENS.primary}`
                                : "1px solid transparent",
                            color: isToday
                              ? "#fff"
                              : isSel
                                ? TOKENS.primaryHi
                                : TOKENS.textSec,
                            fontSize: 12.5,
                            fontWeight: isToday || isSel ? 700 : 500,
                            cursor: "pointer",
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: isToday
                              ? `0 4px 12px ${TOKENS.primaryGlow}`
                              : "none",
                            transition:
                              "background 0.15s ease, border-color 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!isToday && !isSel)
                              e.currentTarget.style.background =
                                "rgba(244,80,30,0.08)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isToday && !isSel)
                              e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <span>{d}</span>
                          {cnt > 0 && (
                            <span
                              style={{
                                position: "absolute",
                                bottom: 4,
                                left: "50%",
                                transform: "translateX(-50%)",
                                height: cnt > 5 ? 4 : cnt > 2 ? 3 : 2,
                                width: cnt > 5 ? 16 : cnt > 2 ? 10 : 5,
                                borderRadius: 999,
                                background: isToday
                                  ? "rgba(255,255,255,0.85)"
                                  : cnt > 5
                                    ? TOKENS.danger
                                    : cnt > 2
                                      ? TOKENS.warning
                                      : TOKENS.success,
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* KPIs — colapsable de forma independiente */}
            <div style={{ flexShrink: 0 }}>
              <button
                onClick={() => setKpisCollapsed((v) => !v)}
                title={kpisCollapsed ? "Mostrar resumen" : "Ocultar resumen"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  marginBottom: kpisCollapsed ? 0 : 10,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: TOKENS.textTer,
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Resumen
                </span>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    transform: kpisCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                    transition: "transform 0.18s ease",
                  }}
                >
                  <Icon name="chevronRight" size={14} color={TOKENS.textTer} />
                </span>
              </button>
              {!kpisCollapsed && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    animation: "slideInUp 0.3s ease both",
                  }}
                >
                  <div style={{ animation: "slideInUp 0.5s ease 0.1s both" }}>
                    <StatCard
                      label="HOY"
                      value={totalActivasHoy}
                      sub="citas"
                      tone={TOKENS.primary}
                      onClick={() => setShowStatsModal("hoy")}
                    />
                  </div>
                  <div style={{ animation: "slideInUp 0.5s ease 0.2s both" }}>
                    <StatCard
                      label="CONFIRMADAS"
                      value={confirmadasHoy}
                      sub={`de ${totalActivasHoy} hoy`}
                      tone={TOKENS.success}
                      onClick={() => setShowStatsModal("confirmadas")}
                    />
                  </div>
                  <div style={{ animation: "slideInUp 0.5s ease 0.3s both" }}>
                    <StatCard
                      label="MES"
                      value={`${totalCitasMes}`}
                      sub="citas este mes"
                      tone={TOKENS.warning}
                      onClick={() => setShowStatsModal("mes")}
                    />
                  </div>
                  <div style={{ animation: "slideInUp 0.5s ease 0.4s both" }}>
                    <StatCard
                      label="CANCELADAS"
                      value={`${citasMes.filter(esCanceladaONoShow).length}`}
                      sub="este mes"
                      tone={TOKENS.violet}
                      onClick={() => setShowStatsModal("canceladas")}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main content area */}
        <div
          style={{
            minWidth: 0,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: isMobile
              ? "0 12px 90px"
              : isReallyCollapsed
                ? "0 28px"
                : "0 24px",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              // La cabecera es pegajosa: cada pixel que ocupa se lo quita a la
              // rejilla durante todo el scroll. En movil va al minimo y en
              // escritorio va compacta (14/10): la cabecera ya reune varias
              // filas (titulo, controles, filtros, subtitulo) y cada pixel de
              // padding aqui es espacio que la agenda no recupera nunca.
              padding: isMobile ? "8px 0 8px 0" : "14px 0 10px 0",
              marginBottom: isMobile ? 8 : 10,
              background: TOKENS.bg,
              zIndex: 100,
              borderBottom: `1px solid ${TOKENS.borderHi}`,
            }}
          >
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: isMobile ? 8 : 10,
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: isMobile ? 8 : 12,
                    minWidth: 0,
                    // En movil NO envuelve: la fecha se recorta con puntos
                    // suspensivos antes que llevarse una fila entera de alto.
                    flexWrap: "nowrap",
                    rowGap: 0,
                    flex: isMobile ? 1 : undefined,
                  }}
                >
                  {/* Navegacion anterior/siguiente (estilo Booksy). Mueve el
                      periodo de la vista activa: dia, semana o mes. */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <button
                      className="m-btn-icon"
                      onClick={() => moverPeriodo(-1)}
                      title={`${etiquetaPeriodoCorta} anterior`}
                      aria-label={irA("anterior")}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        color: TOKENS.textSec,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icon
                        name="chevronLeft"
                        size={17}
                        color={TOKENS.textSec}
                      />
                    </button>
                    <button
                      className="m-btn-icon"
                      onClick={() => moverPeriodo(1)}
                      title={`${etiquetaPeriodoCorta} siguiente`}
                      aria-label={irA("siguiente")}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        color: TOKENS.textSec,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icon
                        name="chevronRight"
                        size={17}
                        color={TOKENS.textSec}
                      />
                    </button>
                    {/* Boton de calendario en movil */}
                    {(isMobile || (isTablet && isReallyCollapsed)) && (
                      <button
                        className="m-btn-icon"
                        onClick={() => setShowMobileCalendar(true)}
                        title="Ir a fecha"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: TOKENS.bgCard,
                          border: `1px solid ${TOKENS.border}`,
                          color: TOKENS.textSec,
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <path d="M16 2v4" />
                          <path d="M8 2v4" />
                          <path d="M3 10h18" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      minWidth: 0,
                      cursor: "default",
                      // En movil comparte fila con las flechas de dia: la barra de
                      // controles ya no cuelga de aqui, asi que el titulo cabe.
                      flex: isMobile ? "1 1 auto" : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: isMobile ? 6 : 8,
                        marginBottom: 0,
                        flexWrap: isMobile ? "nowrap" : "wrap",
                        minWidth: 0,
                      }}
                    >
                      <h2
                        style={{
                          margin: 0,
                          fontSize: isMobile ? 16 : 21,
                          fontWeight: 700,
                          letterSpacing: -0.3,
                          textTransform: "capitalize",
                          // La fecha es el dato que da sentido a toda la pantalla:
                          // si algo tiene que encogerse en esta fila, no es ella.
                          ...(isMobile
                            ? { whiteSpace: "nowrap" as const, flexShrink: 0 }
                            : null),
                        }}
                      >
                        {view === "month"
                          ? currentMonth.toLocaleDateString(LOCALE, {
                              month: "long",
                              year: "numeric",
                            })
                          : selectedDateObj.toLocaleDateString(LOCALE, {
                              // En movil el dia de la semana va abreviado: con el
                              // nombre largo la fecha no cabia junto a las flechas
                              // y bajaba de linea, gastando una fila entera.
                              weekday: isMobile ? "short" : "long",
                              day: "numeric",
                              month: "short",
                            })}
                      </h2>
                      {selectedDateObj.toDateString() ===
                        today.toDateString() && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: TOKENS.warning,
                          }}
                        >
                          HOY
                        </span>
                      )}

                      {/* En movil el contador NO va aqui: viaja a la mini-barra
                          de controles. Puesto en esta fila le robaba el ancho a
                          la fecha, que acababa recortada ("Jue, 20 A..."). */}
                      {!isMobile && barraControlesAgenda}
                    </div>
                    {!isMobile && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: TOKENS.textSec,
                          marginTop: 0,
                        }}
                      >
                        {totalActivasHoy} citas · {confirmadasHoy} confirmadas
                        {view === "day" && timelineProfs.length > 4
                          ? ` · ${timelineProfs.length} columnas: desliza ↔`
                          : ""}
                      </div>
                    )}
                  </div>
                </div>
                {/* Toggle de la barra de filtros (vista/servicio/estado/buscador).
                    Tambien en movil/tablet: alli la barra arranca plegada porque ocupa
                    mucho alto, y este chip la despliega/recoge. */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  {/* Pantalla completa en movil. Vive aqui (y no solo en la
                      barra de titulo) porque al entrar esa barra desaparece: sin
                      este boton no habria forma de volver. */}
                  {isMobile && (
                    <button
                      onClick={alternarPantallaCompleta}
                      title={
                        movilFullscreen
                          ? "Salir de pantalla completa"
                          : "Pantalla completa (ocultar cabecera y filtros)"
                      }
                      aria-label={
                        movilFullscreen
                          ? "Salir de pantalla completa"
                          : "Pantalla completa"
                      }
                      aria-pressed={movilFullscreen}
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 33,
                        height: 33,
                        background: movilFullscreen
                          ? roleTheme.primarySoft
                          : TOKENS.bgCard,
                        border: `1px solid ${movilFullscreen ? roleTheme.primary + "40" : TOKENS.border}`,
                        color: movilFullscreen
                          ? roleTheme.primaryHi
                          : TOKENS.textSec,
                        borderRadius: 9,
                        cursor: "pointer",
                      }}
                    >
                      <Icon
                        name={movilFullscreen ? "minimize" : "maximize"}
                        size={15}
                        color="currentColor"
                      />
                    </button>
                  )}
                  {isMobile && (
                    <button
                      onClick={() =>
                        setDayViewType((t) => (t === "grid" ? "list" : "grid"))
                      }
                      title={
                        dayViewType === "grid"
                          ? "Ver vista lista (Booksy)"
                          : "Ver vista rejilla"
                      }
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 33,
                        height: 33,
                        background:
                          dayViewType === "list"
                            ? roleTheme.primarySoft
                            : TOKENS.bgCard,
                        border: `1px solid ${dayViewType === "list" ? roleTheme.primary + "40" : TOKENS.border}`,
                        color:
                          dayViewType === "list"
                            ? roleTheme.primaryHi
                            : TOKENS.textSec,
                        borderRadius: 9,
                        cursor: "pointer",
                      }}
                    >
                      {dayViewType === "grid" ? (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="8" y1="6" x2="21" y2="6" />
                          <line x1="8" y1="12" x2="21" y2="12" />
                          <line x1="8" y1="18" x2="21" y2="18" />
                          <line x1="3" y1="6" x2="3.01" y2="6" />
                          <line x1="3" y1="12" x2="3.01" y2="12" />
                          <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="14" y="14" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Móvil: Mini-barra de navegación ultracompacta (1 sola línea limpia) */}
              {isMobile && !movilFullscreen && miniBarraAgendaMobile}
              {modalFiltrosMovil}

              {/* Selector de profesional en movil: la MISMA cuadricula de
                  avatares que en escritorio, en una tira que se desliza en
                  horizontal. Antes era una tarjeta de dos lineas con flechas
                  para ir pasando de uno en uno: ocupaba el triple de alto, se
                  tardaba en llegar al cuarto estilista y no se parecia en nada
                  a lo que el mismo salon ve en el ordenador. */}
              {isMobile && visibleProfs.length > 0 && (
                <div
                  className="m-prof-strip"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    overflowX: "auto",
                    overflowY: "hidden",
                    WebkitOverflowScrolling: "touch",
                    marginBottom: 8,
                    paddingBottom: 2,
                  }}
                >
                  <button
                    onClick={() => setSelectedProf("todos")}
                    title="Ver a todo el equipo (la rejilla se desliza en horizontal)"
                    aria-pressed={selectedProf === "todos"}
                    style={{
                      height: 30,
                      padding: "0 11px",
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      background:
                        selectedProf === "todos"
                          ? "rgba(244,80,30,0.12)"
                          : TOKENS.bgCard,
                      border: `1px solid ${selectedProf === "todos" ? TOKENS.primary : TOKENS.border}`,
                      color:
                        selectedProf === "todos"
                          ? TOKENS.primaryHi
                          : TOKENS.textSec,
                    }}
                  >
                    Todos
                  </button>
                  {visibleProfs.map((p) => {
                    const activo = selectedProf === p.id;
                    const ini =
                      (p.nombre || "?")
                        .split(/\s+/)
                        .map((w: string) => w[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "?";
                    const nCitas = citasHoy.filter(
                      (c: any) => c.profesional_id === p.id,
                    ).length;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProf(p.id)}
                        title={`${p.nombre} · ${nCitas} cita${nCitas === 1 ? "" : "s"} hoy`}
                        aria-label={`Ver la agenda de ${p.nombre}`}
                        aria-pressed={activo}
                        style={{
                          position: "relative",
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          padding: 0,
                          flexShrink: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: p.color,
                          border: `2px solid ${activo ? p.color : "transparent"}`,
                          boxShadow: activo
                            ? `0 0 0 2px ${TOKENS.bg}, 0 0 0 3.5px ${p.color}`
                            : "0 1px 2px rgba(0,0,0,0.15)",
                          opacity:
                            activo || selectedProf === "todos" ? 1 : 0.45,
                          cursor: "pointer",
                          transition: "opacity 0.15s ease",
                        }}
                      >
                        <span
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 999,
                            overflow: "hidden",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          {p.foto_perfil ? (
                            <img
                              src={p.foto_perfil}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#ffffff",
                                lineHeight: 1,
                              }}
                            >
                              {ini}
                            </span>
                          )}
                        </span>
                        {/* Cuantas citas lleva hoy. Es el dato que daba la
                            tarjeta antigua; aqui cabe en una esquina. */}
                        {nCitas > 0 && (
                          <span
                            aria-hidden
                            style={{
                              position: "absolute",
                              top: -4,
                              right: -4,
                              minWidth: 15,
                              height: 15,
                              padding: "0 3px",
                              borderRadius: 999,
                              background: TOKENS.bg,
                              border: `1px solid ${TOKENS.borderHi}`,
                              color: TOKENS.textSec,
                              fontSize: 9,
                              fontWeight: 800,
                              lineHeight: "13px",
                              textAlign: "center",
                            }}
                          >
                            {nCitas}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* En tablet, con el rail plegado, los chips de profesional sustituyen a la
                  lista del panel lateral. Con el rail abierto se ocultan (el rail ya los trae). */}
              {isTablet && isReallyCollapsed && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    overflowX: "auto",
                    paddingBottom: 12,
                    marginBottom: 12,
                    width: "100%",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  <button
                    onClick={() => setSelectedProf("todos")}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      background:
                        selectedProf === "todos"
                          ? TOKENS.primary
                          : TOKENS.bgCard,
                      border: `1px solid ${selectedProf === "todos" ? TOKENS.primary : TOKENS.border}`,
                      color: selectedProf === "todos" ? "#fff" : TOKENS.textSec,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Todos
                  </button>
                  {visibleProfs.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProf(p.id)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        background:
                          selectedProf === p.id ? p.color : TOKENS.bgCard,
                        border: `1px solid ${selectedProf === p.id ? p.color : TOKENS.border}`,
                        color: selectedProf === p.id ? "#fff" : TOKENS.textSec,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: selectedProf === p.id ? "#fff" : p.color,
                        }}
                      />
                      {(() => {
                        const parts = p.nombre.split(" ");
                        const isDupe =
                          visibleProfs.filter(
                            (x) => x.nombre.split(" ")[0] === parts[0],
                          ).length > 1;
                        if (isDupe && parts[1])
                          return `${parts[0]} ${parts[1].charAt(0)}.`;
                        if (isDupe && p.rol)
                          return `${parts[0]} (${p.rol.split(" ")[0]})`;
                        return parts[0];
                      })()}
                    </button>
                  ))}
                </div>
              )}
            </>
          </div>
          {view === "day" && (
            <>
              {/* (Antes habia aqui una fila entera con el hint de "desliza la
                  rejilla": ahora va pegado al subtitulo de citas para no
                  robarle alto a la rejilla.) */}
              {dayViewType === "list" && isMobile ? (
                <DayListView
                  citas={filtered}
                  profesionales={timelineProfs}
                  servicios={servicios}
                  clientes={clientes}
                  servicioMap={servicioMap}
                  clienteMap={clienteMap}
                  profesionalMap={profesionalMap}
                  onEditCita={(cita: any) => {
                    setSelectedCitaEdit(cita);
                    setShowEditCita(true);
                  }}
                  onCreateSlot={({
                    hora,
                    profId,
                    reposoContext,
                  }: {
                    hora: string;
                    profId: string;
                    reposoContext?: any;
                  }) => {
                    setNewCitaPrefill({ hora, profId, reposoContext });
                    setShowNewCita(true);
                  }}
                  selectedDateObj={selectedDateObj}
                  theme={roleTheme}
                />
              ) : (
                <DayTimelineMemo
                  citas={filtered}
                  profesionales={timelineProfs}
                  onReorderProfs={reorderProfs}
                  profsVacaciones={profsVacacionesHoy}
                  servicios={servicios}
                  clientes={clientes}
                  servicioMap={servicioMap}
                  clienteMap={clienteMap}
                  profesionalMap={profesionalMap}
                  citaAddonsMap={citaAddonsMap}
                  onEditCita={dtEditCita}
                  onCitaUpdated={dtCitaUpdated}
                  bloqueos={bloqueos}
                  selectedDateObj={selectedDateObj}
                  registrarHistorial={registrarHistorial}
                  onMovimientoCita={dtMovimientoCita}
                  onClienteHistorial={dtClienteHistorial}
                  vivid={isReallyCollapsed}
                  completarManual={completarManual}
                  onCreateSlot={dtCreateSlot}
                  theme={roleTheme}
                  categorias={categorias}
                  horarios={horarios}
                  cierres={cierres}
                  agendaFit={agendaFit}
                  zonasResaltadas={zonasResaltadas}
                  horariosProf={horariosProf}
                  propuestaPorCitaId={propuestaPorCitaId}
                />
              )}
            </>
          )}
          {view === "week" && (
            <WeekView
              citas={citas}
              bloqueos={bloqueos}
              profesionales={visibleProfs}
              servicios={servicios}
              clientes={clientes}
              servicioMap={servicioMap}
              clienteMap={clienteMap}
              selectedDateObj={selectedDateObj}
              filterServicio={filterServicio}
              filterEstado={filterEstado}
              selectedProf={selectedProf}
              onSelectDay={(d: Date) => {
                setSelectedDate(d.getDate());
                setCurrentMonth(new Date(d.getFullYear(), d.getMonth()));
                setView("day");
              }}
              onEditCita={(cita: any) => {
                setSelectedCitaEdit(cita);
                setShowEditCita(true);
              }}
              categorias={categorias}
              onMoveCita={async (citaId: string, newDateStr: string) => {
                const cita = citas.find((c: any) => c.id === citaId);
                if (!cita) return;
                const oldInicio = new Date(cita.inicio);
                const targetDate = new Date(newDateStr);
                const newInicio = new Date(targetDate);
                newInicio.setHours(
                  oldInicio.getHours(),
                  oldInicio.getMinutes(),
                  0,
                  0,
                );

                const diffMs = newInicio.getTime() - oldInicio.getTime();
                if (diffMs === 0) return; // Same day

                const payload: any = {
                  inicio: newInicio.toISOString(),
                  fin: new Date(
                    new Date(cita.fin).getTime() + diffMs,
                  ).toISOString(),
                };
                if (cita.fin_activa)
                  payload.fin_activa = new Date(
                    new Date(cita.fin_activa).getTime() + diffMs,
                  ).toISOString();
                if (cita.fin_espera)
                  payload.fin_espera = new Date(
                    new Date(cita.fin_espera).getTime() + diffMs,
                  ).toISOString();

                // Optimistic update
                setCitas((prev) =>
                  prev.map((c: any) =>
                    c.id === citaId ? { ...c, ...payload } : c,
                  ),
                );
                await supabase.from("citas").update(payload).eq("id", citaId);
                const profile = await getUserProfile();
                registrarHistorial(
                  citaId,
                  profile?.negocio_id || NEGOCIO_ID_FALLBACK,
                  [
                    {
                      campo: "fecha",
                      anterior: oldInicio.toLocaleDateString(),
                      nuevo: newInicio.toLocaleDateString(),
                    },
                  ],
                  "Movido a otro día desde vista semanal",
                );
              }}
            />
          )}
          {view === "month" && (
            <MonthView
              citas={citas}
              bloqueos={bloqueos}
              cierres={cierres}
              profesionales={visibleProfs}
              servicios={servicios}
              clientes={clientes}
              servicioMap={servicioMap}
              clienteMap={clienteMap}
              currentMonth={currentMonth}
              filterServicio={filterServicio}
              filterEstado={filterEstado}
              selectedProf={selectedProf}
              onSelectDay={(d: Date) => {
                setSelectedDate(d.getDate());
                setCurrentMonth(new Date(d.getFullYear(), d.getMonth()));
                setView("day");
              }}
            />
          )}
        </div>
      </div>

      {showNewCita && (
        <NewCitaModal
          negocioIdIni={negocioId}
          userIdIni={userProfile?.id ?? null}
          clientesIni={clientes}
          serviciosIni={servicios}
          profesionalesIni={profesionales}
          categoriasIni={categorias}
          horariosProfIni={horariosProf}
          cierresIni={cierres}
          onClose={() => {
            setShowNewCita(false);
            setNewCitaPrefill(null);
          }}
          onSaved={(nuevaCita: any) => {
            if (nuevaCita) setCitas((prev) => [...prev, nuevaCita]);
            setShowNewCita(false);
            setNewCitaPrefill(null);
          }}
          selectedDate={selectedDateObj}
          prefillHora={newCitaPrefill?.hora}
          prefillProf={newCitaPrefill?.profId}
          prefillClienteId={newCitaPrefill?.clienteId}
          prefillServicioId={newCitaPrefill?.servicioId}
          prefillNotas={newCitaPrefill?.notas}
          prefillWaitlistId={newCitaPrefill?.waitlistId}
          prefillReposoContext={newCitaPrefill?.reposoContext}
        />
      )}

      {undoError && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(226,59,52,0.95)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(226,59,52,0.4)",
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          {undoError}
        </div>
      )}

      {/* Aviso flotante del modo "Enseñamelo". Da salida al resalte (sobre todo
          cuando viene del panel con un solo problema enfocado) y evita que el
          interruptor parezca roto en un dia sin problemas. */}
      {(ensenar || problemaEnfocado || pasosPlan.length > 0) && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: isMobile ? 96 : 24,
            zIndex: 190,
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 6 : 10,
            padding: isMobile ? "7px 8px" : "9px 12px 9px 14px",
            borderRadius: isMobile ? 14 : 999,
            background: TOKENS.bgPanel,
            border: `1px solid ${TOKENS.borderHi}`,
            boxShadow: "0 10px 30px rgba(40,30,24,0.22)",
            fontSize: 12.5,
            fontWeight: 600,
            color: TOKENS.textSec,
            // En movil ocupa el ancho util: el navegador lleva flechas, contador,
            // dos lineas de texto y dos botones, y en una pildora estrecha se
            // amontonaba todo.
            width: isMobile ? "calc(100vw - 24px)" : undefined,
            maxWidth: isMobile ? undefined : "92vw",
          }}
        >
          {(() => {
            // Dos modos en el mismo navegador: recorrer los problemas del dia,
            // o recorrer los PASOS de un plan de Chispa. En modo plan la lista
            // determinista no pinta nada: los pasos son los del plan.
            const modoPlan = pasosPlan.length > 0;
            const idxPaso = modoPlan
              ? Math.max(0, pasosPlan.findIndex((p) => p.id === problemaEnfocado))
              : -1;
            const enfocado = modoPlan
              ? pasosPlan[idxPaso]
              : idxEnfocado >= 0
                ? problemasAgenda[idxEnfocado]
                : null;
            const n = modoPlan ? pasosPlan.length : problemasAgenda.length;
            const idx = modoPlan ? idxPaso : idxEnfocado;
            const ir = (destino: number) =>
              modoPlan ? enfocarPasoPlan(pasosPlan, destino) : enfocarProblema(destino);
            const flecha = (dir: -1 | 1, etiqueta: string) => (
              <button
                onClick={() => ir((idx + dir + n) % n)}
                aria-label={etiqueta}
                title={etiqueta}
                disabled={n < 2}
                style={{
                  display: "inline-flex",
                  padding: 5,
                  borderRadius: 999,
                  border: `1px solid ${TOKENS.border}`,
                  background: TOKENS.bgCard,
                  color: TOKENS.textSec,
                  cursor: n < 2 ? "default" : "pointer",
                  opacity: n < 2 ? 0.35 : 1,
                  flexShrink: 0,
                }}
              >
                <Icon
                  name={dir === -1 ? "chevronLeft" : "chevronRight"}
                  size={13}
                  color={TOKENS.textSec}
                />
              </button>
            );
            if (n === 0) {
              return (
                <>
                  <Icon name="zap" size={14} color={TOKENS.primary} />
                  <span>Nada que resaltar: este día está en orden</span>
                </>
              );
            }
            return (
              <>
                {flecha(-1, modoPlan ? "Paso anterior" : "Problema anterior")}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: TOKENS.textTer,
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums" as any,
                  }}
                >
                  {modoPlan ? `Paso ${idxPaso + 1}` : idxEnfocado >= 0 ? idxEnfocado + 1 : "–"}/{n}
                </span>
                {flecha(1, modoPlan ? "Paso siguiente" : "Problema siguiente")}
                <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: TOKENS.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {enfocado ? enfocado.accionCorta : `${n} problemas`}
                  </div>
                  {enfocado && (
                    <div
                      style={{
                        fontSize: 11,
                        color: TOKENS.textTer,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {enfocado.profesionalNombre} · {enfocado.titulo}
                    </div>
                  )}
                </div>
                {/* "Arreglar" solo si hay algo que aplicar. Un 'hueco_vacio'
                    llega con estrategias vacia a proposito (es informativo: te
                    ensena que ese rato esta libre, no hay nada roto), y ofrecer
                    ahi un boton de arreglar prometia una accion inexistente.
                    La regla la marca el propio tipo en lib/organizarAgenda.ts. */}
                {(modoPlan || !enfocado || enfocado.estrategias.length > 0) && (
                  <button
                    onClick={() => {
                      setProblemaEnfocado(null);
                      setPasosPlan([]);
                      setShowOrganizar(true);
                    }}
                    style={{
                      padding: "5px 11px",
                      borderRadius: 999,
                      border: "none",
                      background: TOKENS.primary,
                      color: "#fff",
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Arreglar
                  </button>
                )}
              </>
            );
          })()}
          <button
            onClick={() => {
              setEnsenar(false);
              setProblemaEnfocado(null);
              setPasosPlan([]);
            }}
            aria-label="Dejar de resaltar"
            style={{
              display: "inline-flex",
              padding: 4,
              border: "none",
              background: "transparent",
              color: TOKENS.textTer,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Icon name="x" size={14} color={TOKENS.textTer} />
          </button>
        </div>
      )}

      {showOrganizar && (
        <OrganizarAgendaPanel
          citas={citas}
          profesionales={profesionales}
          clientes={clientes}
          servicios={servicios}
          bloqueos={bloqueos}
          horarios={horarios}
          // Fase 1: el panel hereda la jornada real de cada profesional y los
          // cierres del salon que YA tiene cargados la rejilla. Sin esto el
          // organizador proponia horas fuera del horario del trabajador y no
          // avisaba de citas en dias cerrados.
          horariosProfesional={horariosProf}
          cierres={cierres}
          limites={limitesAgenda}
          negocioId={negocioId}
          isMobile={isMobile}
          fechaVista={selectedDateObj}
          onEnsenar={(p) => {
            // Cierra el panel, resalta SOLO ese problema, cambia al profesional
            // que toque (en movil solo hay una columna montada) y hace scroll.
            setShowOrganizar(false);
            setEnsenar(false);
            setPasosPlan([]);
            enfocarProblema(problemasAgenda.findIndex((x) => x.id === p.id));
          }}
          // Plan de Chispa: llega la secuencia entera y el navegador de abajo
          // pasa a recorrer sus pasos (origen → destino de cada movimiento).
          onEnsenarPlan={(pasos, i) => {
            setShowOrganizar(false);
            setEnsenar(false);
            enfocarPasoPlan(pasos, i);
          }}
          onClose={() => setShowOrganizar(false)}
          onAplicado={aplicarUpdatesEnAgenda}
        />
      )}
      {showManualPanel && (
        <ManualPanel
          content={manualAgenda}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
      {/* Demo guiada: spotlight sobre el panel de avisos (no la campana ni "Cerrar salon") */}
      <DemoSpotlight
        targetRef={notifPanelRef}
        active={demoFocus === "avisos"}
        label="Avisos"
        padding={8}
        radius={16}
      />
      {/* Bienvenida de primera vez. Solo al duenio de un salon real, solo si este
          salon no la ha visto nunca y aun no esta operativo: a un salon ya montado
          (los que preconfiguramos nosotros) no se le interrumpe con esto. */}
      {onboardingEligible
        && bienvenidaVista === false
        && onboarding.ready
        && !onboarding.coreDone && (
        <AsistentePuestaEnMarcha
          isMobile={isMobile}
          negocioId={negocioId}
          nombre={userProfile?.nombre ?? ""}
          nombreSalon={userProfile?.nombre_negocio ?? ""}
          trialEndsAt={userProfile?.trial_ends_at ?? null}
          onCerrar={(abrirChecklist) => {
            setBienvenidaVista(true);
            if (abrirChecklist) {
              setShowOnboardingPanel(true);
              onboarding.refresh();
            }
          }}
        />
      )}
      {showOnboardingPanel && (
        <OnboardingPanel
          isMobile={isMobile}
          done={onboarding.done}
          coreCompletados={onboarding.coreCompletados}
          coreTotal={onboarding.coreTotal}
          skipped={obSkipped}
          onSkip={skipStep}
          onUnskip={unskipStep}
          onNavigate={(step) => {
            setShowOnboardingPanel(false);
            router.push({
              pathname: step.pathname,
              params: step.params,
            } as any);
          }}
          onClose={() => setShowOnboardingPanel(false)}
        />
      )}
      {showClienteHistorial && (
        <ClienteHistorialModal
          cliente={showClienteHistorial}
          onClose={() => setShowClienteHistorial(null)}
          citas={citas}
          servicioMap={servicioMap}
          profesionalMap={profesionalMap}
        />
      )}
      {showEditCita && selectedCitaEdit && (
        <DetalleCitaModal
          // key por cita: al saltar a otro eslabon de la cadena el modal se
          // vuelve a montar y sus campos se reinicializan con la nueva cita.
          key={selectedCitaEdit.id}
          onAbrirCita={(c: any) => setSelectedCitaEdit(c)}
          bloqueos={bloqueos}
          onDuplicate={() => {
            setShowEditCita(false);
            setNewCitaPrefill({
              clienteId: selectedCitaEdit.cliente_id,
              servicioId: selectedCitaEdit.servicio_id,
              profId: selectedCitaEdit.profesional_id,
              notas: selectedCitaEdit.notas || "",
            });
            setShowNewCita(true);
          }}
          onClose={() => {
            setShowEditCita(false);
            router.replace("/(tabs)/" as never);
            citaParamConsumida.current = null;
          }}
          onSaved={(updatedFields: any) => {
            setCitas((prev) =>
              prev.map((c) =>
                c.id === selectedCitaEdit.id ? { ...c, ...updatedFields } : c,
              ),
            );
            setShowEditCita(false);
            router.replace("/(tabs)/" as never);
            citaParamConsumida.current = null;
          }}
          cita={selectedCitaEdit}
          retrasosActivo={recolocarRetraso}
          avisarRetrasoActivo={avisarRetraso}
          servicios={servicios}
          categorias={categorias}
          clientes={clientes}
          profesionales={profesionales}
          citasHoy={citasHoy}
          allCitas={citas}
        />
      )}

      {/* Modal: Cierre inesperado del salon (6.4) */}
      {showCierreSalon &&
        (() => {
          const citasConfirmadasHoy = citasHoy.filter(
            (c) => c.estado === CITA_STATUS.CONFIRMADA,
          );
          const count = citasConfirmadasHoy.length;
          return (
            <div
              onClick={() => setShowCierreSalon(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                display: "grid",
                placeItems: "center",
                zIndex: 9999,
                animation: "fadeIn 0.2s ease",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: isMobile ? "90%" : 440,
                  maxWidth: 440,
                  background: TOKENS.bgPanel,
                  border: `1px solid rgba(226,59,52,0.30)`,
                  borderRadius: 16,
                  padding: isMobile ? 18 : 28,
                  animation: "scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    marginBottom: 6,
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#e23b34",
                  }}
                >
                  Cerrar salon hoy
                </h3>
                <p
                  style={{
                    margin: 0,
                    marginBottom: 18,
                    fontSize: 13,
                    color: TOKENS.textSec,
                    lineHeight: 1.5,
                  }}
                >
                  Se cancelaran{" "}
                  <strong style={{ color: TOKENS.text }}>
                    {count} cita{count !== 1 ? "s" : ""} confirmada
                    {count !== 1 ? "s" : ""}
                  </strong>{" "}
                  del{" "}
                  {selectedDateObj.toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  . Esta accion no se puede deshacer.
                </p>

                {count > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      marginBottom: 18,
                      maxHeight: 200,
                      overflowY: "auto",
                    }}
                  >
                    {citasConfirmadasHoy.map((c) => {
                      const cli = clientes.find((cl) => cl.id === c.cliente_id);
                      const srv = servicios.find((s) => s.id === c.servicio_id);
                      const ini = new Date(c.inicio);
                      return (
                        <div
                          key={c.id}
                          style={{
                            padding: 10,
                            background: TOKENS.bgCard,
                            border: `1px solid ${TOKENS.border}`,
                            borderRadius: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: TOKENS.textTer,
                              flexShrink: 0,
                            }}
                          >
                            {ini.toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: TOKENS.text,
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {cli?.nombre ?? "Cliente"}
                          </span>
                          <span style={{ fontSize: 11, color: TOKENS.textSec }}>
                            {srv?.nombre ?? ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowCierreSalon(false)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      background: "transparent",
                      color: TOKENS.textSec,
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={cierreMasivoSalon}
                    disabled={count === 0 || cierreLoading}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      background:
                        count === 0
                          ? "rgba(226,59,52,0.08)"
                          : "rgba(226,59,52,0.15)",
                      color: count === 0 ? TOKENS.textTer : "#e23b34",
                      border: "1px solid rgba(226,59,52,0.30)",
                      borderRadius: 10,
                      cursor: count === 0 ? "not-allowed" : "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (count > 0)
                        e.currentTarget.style.background =
                          "rgba(226,59,52,0.25)";
                    }}
                    onMouseLeave={(e) => {
                      if (count > 0)
                        e.currentTarget.style.background =
                          "rgba(226,59,52,0.15)";
                    }}
                  >
                    {cierreLoading
                      ? "Cancelando..."
                      : count === 0
                        ? "Sin citas"
                        : `Cancelar ${count} cita${count !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Modal: Clienta llega tarde (6.3) */}
      {showClientaTarde &&
        (() => {
          const c = showClientaTarde;
          const cli = clientes.find((cl) => cl.id === c.cliente_id);
          const prof = profesionales.find((p) => p.id === c.profesional_id);
          const srv = servicios.find((s) => s.id === c.servicio_id);
          const ini = new Date(c.inicio);
          const minutosRetraso = Math.round(
            (Date.now() - ini.getTime()) / 60000,
          );

          async function marcarNoShow() {
            let idsToUpdate = [c.id];
            const citaAny = c as any;
            if (citaAny.grupo_id && citaAny.cliente_id && citas) {
              const chain = eslabonesParaOperar(citaAny, citas as any);
              if (chain.length > 0 && chain[0].id === c.id) {
                idsToUpdate = chain.map((x: any) => x.id);
              }
            }
            await supabase
              .from("citas")
              .update({ estado: "no_presentada" })
              .in("id", idsToUpdate);
            setCitas((prev) =>
              prev.map((x) =>
                idsToUpdate.includes(x.id) ? { ...x, estado: "no_presentada" } : x,
              ),
            );
            // Fianza en modo hold: si el negocio captura en auto, capturar la retencion (no-op si no hay hold).
            if (capturaHoldAuto) {
              supabase.functions
                .invoke("capturar-hold", { body: { cita_id: c.id } })
                .catch(() => {});
            }
            setShowClientaTarde(null);
            triggerRefresh();
          }

          async function marcarCompletada() {
            let idsToUpdate = [c.id];
            const citaAny = c as any;
            if (citaAny.grupo_id && citaAny.cliente_id && citas) {
              const chain = eslabonesParaOperar(citaAny, citas as any);
              if (chain.length > 0 && chain[0].id === c.id) {
                idsToUpdate = chain.map((x: any) => x.id);
              }
            }
            await supabase
              .from("citas")
              .update({ estado: CITA_STATUS.COMPLETADA })
              .in("id", idsToUpdate);
            setCitas((prev) =>
              prev.map((x) =>
                idsToUpdate.includes(x.id) ? { ...x, estado: CITA_STATUS.COMPLETADA } : x,
              ),
            );
            setShowClientaTarde(null);
            triggerRefresh();
          }

          async function esperarMas(minutos: number) {
            const deltaMs = minutos * 60000;
            const nuevoInicio = new Date(ini.getTime() + deltaMs);
            const nuevoFin = new Date(new Date(c.fin).getTime() + deltaMs);
            const payload: any = {
              inicio: nuevoInicio.toISOString(),
              fin: nuevoFin.toISOString(),
            };
            const updated: any = {
              ...c,
              inicio: nuevoInicio.toISOString(),
              fin: nuevoFin.toISOString(),
            };
            if (c.fin_activa) {
              payload.fin_activa = new Date(
                new Date(c.fin_activa).getTime() + deltaMs,
              ).toISOString();
              updated.fin_activa = payload.fin_activa;
            }
            if (c.fin_espera) {
              payload.fin_espera = new Date(
                new Date(c.fin_espera).getTime() + deltaMs,
              ).toISOString();
              updated.fin_espera = payload.fin_espera;
            }
            await supabase.from("citas").update(payload).eq("id", c.id);
            const profile = await getUserProfile();
            const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
            await registrarHistorial(
              c.id,
              nId,
              [
                { campo: "inicio", anterior: c.inicio, nuevo: payload.inicio },
                { campo: "fin", anterior: c.fin, nuevo: payload.fin },
              ],
              `Cliente llega tarde (+${minutos} min)`,
            );
            setCitas((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
            setShowClientaTarde(null);
          }

          return (
            <div
              onClick={() => setShowClientaTarde(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                display: "grid",
                placeItems: "center",
                zIndex: 9999,
                animation: "fadeIn 0.2s ease",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: isMobile ? "90%" : 420,
                  maxWidth: 420,
                  background: TOKENS.bgPanel,
                  border: `1px solid ${TOKENS.borderHi}`,
                  borderRadius: 16,
                  padding: isMobile ? 18 : 28,
                  animation: "scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    marginBottom: 6,
                    fontSize: 18,
                    fontWeight: 700,
                    color: TOKENS.text,
                  }}
                >
                  Cliente no ha llegado
                </h3>
                <p
                  style={{
                    margin: 0,
                    marginBottom: 18,
                    fontSize: 12,
                    color: TOKENS.textSec,
                  }}
                >
                  La cita deberia haber empezado hace {minutosRetraso} minutos.
                </p>

                <div
                  style={{
                    padding: 14,
                    background: TOKENS.bgCard,
                    border: `1px solid ${TOKENS.border}`,
                    borderRadius: 12,
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    {prof && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: prof.color,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: TOKENS.text,
                      }}
                    >
                      {cli?.nombre ?? "Cliente"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textSec }}>
                    {srv?.nombre ?? "Servicio"}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: TOKENS.textTer,
                      marginTop: 4,
                    }}
                  >
                    {ini.toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    -{" "}
                    {new Date(c.fin).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {prof && <span> · {prof.nombre}</span>}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginBottom: 18,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: TOKENS.textSec,
                      marginBottom: 2,
                    }}
                  >
                    Esperar un poco mas
                  </span>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 6,
                    }}
                  >
                    {[5, 10, 15, 30].map((min) => (
                      <button
                        key={min}
                        onClick={() => esperarMas(min)}
                        style={{
                          padding: "8px 0",
                          borderRadius: 8,
                          border: `1px solid ${TOKENS.border}`,
                          background: TOKENS.bgCard,
                          color: TOKENS.text,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = TOKENS.primary;
                          e.currentTarget.style.background = TOKENS.primarySoft;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = TOKENS.border;
                          e.currentTarget.style.background = TOKENS.bgCard;
                        }}
                      >
                        +{min} min
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={marcarCompletada}
                  style={{
                    width: "100%",
                    padding: "12px 0",
                    background: "linear-gradient(180deg, #10b981, #059669)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    marginBottom: 12,
                    boxShadow: "0 4px 12px rgba(16,185,129,0.25)",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 6px 16px rgba(16,185,129,0.35)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(16,185,129,0.25)";
                  }}
                >
                  Marcar como completada (Cliente asistió)
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowClientaTarde(null)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      background: "transparent",
                      color: TOKENS.textSec,
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={marcarNoShow}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      background: "rgba(226,59,52,0.12)",
                      color: "#e23b34",
                      border: "1px solid rgba(226,59,52,0.30)",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(226,59,52,0.22)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(226,59,52,0.12)";
                    }}
                  >
                    Marcar no presentada
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Estrategias del retraso declarado a mano ("llega X min tarde"). Se
          escribe en BD y se refleja en la agenda por el mismo camino que el
          organizador, para que Deshacer trate la cascada como un solo paso. */}
      {retrasoProf && (
        <RetrasoEstrategiasModal
          estrategias={retrasoProf.estrategias}
          minutos={retrasoProf.minutos}
          profesionalNombre={retrasoProf.profNombre}
          avisarDisponible={false}
          enviando={aplicandoRetrasoProf}
          onConfirmar={async (estrategia: EstrategiaRetraso) => {
            setAplicandoRetrasoProf(true);
            try {
              for (const u of estrategia.updates) {
                const payload: any = {
                  inicio: u.inicio,
                  fin: u.fin,
                };
                if (u.fin_activa) payload.fin_activa = u.fin_activa;
                if (u.fin_espera) payload.fin_espera = u.fin_espera;
                if (u.profesional_id) payload.profesional_id = u.profesional_id;
                const { error } = await supabase
                  .from("citas")
                  .update(payload)
                  .eq("id", u.id);
                if (error) {
                  setUndoError(mensajeDeError(error));
                  setTimeout(() => setUndoError(null), 3000);
                  return;
                }
              }
              aplicarUpdatesEnAgenda(estrategia.updates);
              setRetrasoProf(null);
            } finally {
              setAplicandoRetrasoProf(false);
            }
          }}
          onCancelar={() => setRetrasoProf(null)}
        />
      )}

      {/* Modal: Profesional llega tarde (6.1) */}
      {showRetrasoProf &&
        (() => {
          const prof = profesionales.find((p) => p.id === showRetrasoProf);
          if (!prof) return null;
          const citasProf = citasHoy.filter(
            (c) =>
              c.profesional_id === showRetrasoProf &&
              // Si vamos con retraso hay que mover TODA la cola del dia, no solo
              // lo confirmado: las pendientes tambien ocupan su hora. Las ya
              // completadas no se tocan, que esas ya pasaron.
              sigueViva(c.estado),
          );

          function retrasarTodas(minutos: number) {
            const citasMapped = citasProf.map((c: any) => ({
              id: c.id,
              inicio: c.inicio,
              fin: c.fin,
              fin_activa: c.fin_activa,
              fin_espera: c.fin_espera,
              cliente:
                clientes.find((cl: any) => cl.id === c.cliente_id)?.nombre ??
                null,
              servicio:
                servicios.find((s: any) => s.id === c.servicio_id)?.nombre ??
                null,
            }));
            const ahora = Date.now();
            const primera = citasMapped
              .filter((c) => +new Date(c.fin) > ahora)
              .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))[0];
            if (!primera) {
              setShowRetrasoProf(null);
              return;
            }
            const ests = calcularEstrategiasRetraso(
              citasMapped as any,
              primera.id,
              minutos,
            );
            setRetrasoProf({
              minutos,
              estrategias: ests,
              profNombre: prof!.nombre,
            });
            setShowRetrasoProf(null);
          }

          return (
            <div
              onClick={() => setShowRetrasoProf(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                display: "grid",
                placeItems: "center",
                zIndex: 9999,
                animation: "fadeIn 0.2s ease",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 420,
                  background: TOKENS.bgPanel,
                  border: `1px solid ${TOKENS.borderHi}`,
                  borderRadius: 16,
                  padding: 28,
                  animation: "scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    marginBottom: 6,
                    fontSize: 18,
                    fontWeight: 700,
                    color: TOKENS.text,
                  }}
                >
                  Profesional llega tarde
                </h3>
                <p
                  style={{
                    margin: 0,
                    marginBottom: 18,
                    fontSize: 12,
                    color: TOKENS.textSec,
                  }}
                >
                  {prof.nombre} tiene {citasProf.length} cita
                  {citasProf.length > 1 ? "s" : ""} pendiente
                  {citasProf.length > 1 ? "s" : ""}. Recoloca su dia absorbiendo
                  los huecos.
                </p>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginBottom: 18,
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {citasProf.map((c) => {
                    const cli = clientes.find((cl) => cl.id === c.cliente_id);
                    const ini = new Date(c.inicio);
                    return (
                      <div
                        key={c.id}
                        style={{
                          padding: 10,
                          background: TOKENS.bgCard,
                          border: `1px solid ${TOKENS.border}`,
                          borderRadius: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            background: prof.color,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: TOKENS.text,
                          }}
                        >
                          {cli?.nombre ?? "Cliente"}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: TOKENS.textTer,
                            marginLeft: "auto",
                          }}
                        >
                          {ini.toLocaleTimeString("es-ES", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: TOKENS.textSec,
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  Recolocar a partir de la cita en curso
                </span>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 6,
                    marginBottom: 18,
                  }}
                >
                  {[10, 15, 20, 30].map((min) => (
                    <button
                      key={min}
                      onClick={() => retrasarTodas(min)}
                      style={{
                        padding: "8px 0",
                        borderRadius: 8,
                        border: `1px solid ${TOKENS.border}`,
                        background: TOKENS.bgCard,
                        color: TOKENS.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = TOKENS.primary;
                        e.currentTarget.style.background = TOKENS.primarySoft;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = TOKENS.border;
                        e.currentTarget.style.background = TOKENS.bgCard;
                      }}
                    >
                      +{min} min
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowRetrasoProf(null)}
                  style={{
                    width: "100%",
                    padding: "10px 0",
                    background: "transparent",
                    color: TOKENS.textSec,
                    border: `1px solid ${TOKENS.border}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          );
        })()}
      {/* Modal del calendario en movil */}
      {showMobileCalendar && (
        <div
          onClick={() => setShowMobileCalendar(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            animation: "fadeIn 0.2s ease",
            padding: 16,
          }}
        >
          {/* maxHeight + overflow: en pantallas bajas (movil apaisado, SE) el calendario
              no debe cortarse; scrollea dentro de la tarjeta en vez de salirse. */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: 340,
              maxHeight: "calc((100dvh - 32px) / var(--mecha-zoom, 1))",
              overflowY: "auto",
              background: TOKENS.bgPanel,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 16,
              padding: 20,
              animation: "scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: TOKENS.text,
                }}
              >
                Ir a fecha
              </h3>
              <button
                onClick={() => setShowMobileCalendar(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: TOKENS.textTer,
                  cursor: "pointer",
                  padding: 4,
                  borderRadius: 6,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div
              style={{
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <button
                  className="m-btn-icon m-btn-icon-rotate-l"
                  onClick={handlePrevMonth}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: TOKENS.bg,
                    border: `1px solid ${TOKENS.border}`,
                    color: TOKENS.textSec,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                  }}
                >
                  <Icon name="chevronLeft" size={18} color={TOKENS.textSec} />
                </button>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: TOKENS.text,
                    textTransform: "capitalize",
                    letterSpacing: -0.2,
                  }}
                >
                  {monthName}
                </div>
                <button
                  className="m-btn-icon m-btn-icon-rotate-r"
                  onClick={handleNextMonth}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: TOKENS.bg,
                    border: `1px solid ${TOKENS.border}`,
                    color: TOKENS.textSec,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                  }}
                >
                  <Icon name="chevronRight" size={18} color={TOKENS.textSec} />
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7,1fr)",
                  gap: 2,
                  marginBottom: 4,
                }}
              >
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    style={{
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: TOKENS.textTer,
                      letterSpacing: 0.3,
                      padding: "2px 0",
                    }}
                  >
                    {d.charAt(0)}
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7,1fr)",
                  gap: 2,
                }}
              >
                {cells.map((d, i) => {
                  if (!d) return <div key={i} style={{ height: 34 }} />;
                  const isSel = d === selectedDate;
                  const isToday =
                    d === today.getDate() &&
                    month === today.getMonth() &&
                    year === today.getFullYear();
                  const cnt = counts[d] || 0;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedDate(d);
                        setShowMobileCalendar(false);
                      }}
                      style={{
                        height: 34,
                        borderRadius: 9,
                        background: isToday
                          ? "linear-gradient(180deg,#ff7a2e,#f4501e)"
                          : isSel
                            ? "rgba(244,80,30,0.14)"
                            : "transparent",
                        border:
                          isSel && !isToday
                            ? `1px solid ${TOKENS.primary}`
                            : "1px solid transparent",
                        color: isToday
                          ? "#fff"
                          : isSel
                            ? TOKENS.primaryHi
                            : TOKENS.textSec,
                        fontSize: 12.5,
                        fontWeight: isToday || isSel ? 700 : 500,
                        cursor: "pointer",
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: isToday
                          ? `0 4px 12px ${TOKENS.primaryGlow}`
                          : "none",
                        transition:
                          "background 0.15s ease, border-color 0.15s ease",
                      }}
                    >
                      <span>{d}</span>
                      {cnt > 0 && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: 4,
                            left: "50%",
                            transform: "translateX(-50%)",
                            height: 3,
                            width: cnt > 5 ? 14 : cnt > 2 ? 9 : 4,
                            borderRadius: 999,
                            background: isToday
                              ? "rgba(255,255,255,0.85)"
                              : cnt > 5
                                ? TOKENS.danger
                                : cnt > 2
                                  ? TOKENS.warning
                                  : TOKENS.success,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => {
                  setSelectedDate(today.getDate());
                  setCurrentMonth(
                    new Date(today.getFullYear(), today.getMonth()),
                  );
                  setShowMobileCalendar(false);
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "rgba(244,80,30,0.10)",
                  border: "1px solid rgba(244,80,30,0.25)",
                  borderRadius: 8,
                  color: TOKENS.primaryHi,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                Hoy
              </button>
            </div>
          </div>
        </div>
      )}

      {showStatsModal && (
        <div
          className="m-overlay-enter"
          onClick={() => setShowStatsModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11,18,32,0.65)",
            backdropFilter: "blur(8px)",
            display: "grid",
            placeItems: "center",
            zIndex: 10000,
            padding: 24,
          }}
        >
          <div
            className="m-modal-enter"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 440,
              maxWidth: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              background: TOKENS.bgPanel,
              border: `1px solid ${TOKENS.borderHi}`,
              borderRadius: 18,
              padding: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${TOKENS.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: TOKENS.bgCard,
              }}
            >
              <div
                style={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}
              >
                {showStatsModal === "hoy"
                  ? "Citas de Hoy"
                  : showStatsModal === "confirmadas"
                    ? "Citas Confirmadas de Hoy"
                    : showStatsModal === "mes"
                      ? "Citas del Mes"
                      : "Canceladas / No presentadas (Mes)"}
              </div>
              <button
                className="m-btn-icon-close"
                onClick={() => setShowStatsModal(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "transparent",
                  border: "none",
                  color: TOKENS.textSec,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="x" size={16} color={TOKENS.textSec} />
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {(() => {
                let list: any[] = [];
                if (showStatsModal === "hoy") list = citasHoy;
                else if (showStatsModal === "confirmadas")
                  list = citasHoy.filter(cuentaComoConfirmada);
                else if (showStatsModal === "mes") list = citasMes;
                else list = citasMes.filter(esCanceladaONoShow);

                if (list.length === 0)
                  return (
                    <div
                      style={{
                        fontSize: 13,
                        color: TOKENS.textTer,
                        textAlign: "center",
                        padding: 20,
                      }}
                    >
                      No hay citas en esta categoría.
                    </div>
                  );

                return list.map((c) => {
                  const ini = new Date(c.inicio);
                  const cli = clienteMap?.get(c.cliente_id);
                  const srv = servicioMap?.get(c.servicio_id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        const d = new Date(c.inicio);
                        setSelectedDate(d.getDate());
                        setCurrentMonth(
                          new Date(d.getFullYear(), d.getMonth()),
                        );
                        setView("day");
                        setShowStatsModal(null);
                        setSelectedCitaEdit(c);
                        setShowEditCita(true);
                      }}
                      style={{
                        textAlign: "left",
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: TOKENS.text,
                          }}
                        >
                          {cli?.nombre || "Cliente"}
                        </span>
                        <span style={{ fontSize: 11, color: TOKENS.textSec }}>
                          {ini.toLocaleDateString(LOCALE, {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          ·{" "}
                          {ini.toLocaleTimeString(LOCALE, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: TOKENS.textSec }}>
                        {srv?.nombre || "Servicio"}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Toast flotante de confirmación (p.ej. cobro efectuado) */}
      {toastMensaje && (
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            zIndex: 999999,
            background: "#0f9d6b",
            color: "#ffffff",
            padding: "14px 22px",
            borderRadius: 12,
            boxShadow: "0 12px 36px rgba(15,157,107,0.35)",
            fontSize: 14,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 10,
            animation: "slideInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {toastMensaje}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, tone, progress, onClick }: any) {
  return (
    <div
      onClick={onClick}
      style={{
        background: TOKENS.bgCard,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 14,
        padding: 14,
        position: "relative",
        overflow: "hidden",
        transition: "all 0.3s ease",
        transform: "scale(1)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = TOKENS.borderHi;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.borderColor = TOKENS.border;
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          color: TOKENS.textTer,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: TOKENS.text,
          marginTop: 4,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: TOKENS.textSec, marginTop: 2 }}>
        {sub}
      </div>
      {progress != null && (
        <div
          style={{
            marginTop: 8,
            height: 3,
            borderRadius: 99,
            background: "rgba(148,163,184,0.12)",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              borderRadius: 99,
              background: tone,
            }}
          />
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 6,
          height: 6,
          borderRadius: 999,
          background: tone,
          boxShadow: `0 0 10px ${tone}`,
        }}
      />
    </div>
  );
}

function ProfRow({
  id,
  name,
  role,
  color,
  count,
  selected,
  onSel,
  reposoUtil,
  onRetraso,
}: any) {
  return (
    <button
      onClick={onSel}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: selected ? "rgba(244,80,30,0.10)" : "transparent",
        border: `1px solid ${selected ? "rgba(244,80,30,0.25)" : "transparent"}`,
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.2s ease",
        transform: "translateX(0)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = selected
          ? "rgba(244,80,30,0.15)"
          : "rgba(244,80,30,0.05)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = selected
          ? "rgba(244,80,30,0.10)"
          : "transparent";
        e.currentTarget.style.transform = "translateX(0)";
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.06)`,
        }}
      >
        {id === "todos" ? (
          <svg width="13" height="13" viewBox="0 0 12 12" fill="#fff">
            <rect x="0" y="0" width="5" height="5" rx="1" />
            <rect x="7" y="0" width="5" height="5" rx="1" />
            <rect x="0" y="7" width="5" height="5" rx="1" />
            <rect x="7" y="7" width="5" height="5" rx="1" />
          </svg>
        ) : (
          name
            .split(" ")
            .map((n: string) => n[0])
            .slice(0, 2)
            .join("")
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: selected ? TOKENS.text : TOKENS.textSec,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        {role && (
          <div style={{ fontSize: 11, color: TOKENS.textTer }}>{role}</div>
        )}
        {reposoUtil && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: "rgba(245,158,11,0.15)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.round((reposoUtil.usedMin / reposoUtil.totalMin) * 100)}%`,
                  height: "100%",
                  borderRadius: 2,
                  background: "#f59e0b",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 9,
                color: "#f59e0b",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {Math.round((reposoUtil.usedMin / reposoUtil.totalMin) * 100)}%
            </span>
          </div>
        )}
      </div>
      {onRetraso && (
        <div
          title="Profesional llega tarde"
          onClick={(e) => {
            e.stopPropagation();
            onRetraso();
          }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            background: "transparent",
            transition: "background 0.15s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(245,158,11,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: TOKENS.textSec,
          padding: "2px 7px",
          borderRadius: 6,
          background: "rgba(148,163,184,0.10)",
        }}
      >
        {count}
      </div>
    </button>
  );
}

function ViewTab({ children, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        fontSize: 12,
        fontWeight: 600,
        background: active ? TOKENS.bgCard : "transparent",
        border: `1px solid ${active ? TOKENS.borderHi : TOKENS.border}`,
        borderRadius: 8,
        color: active ? TOKENS.text : TOKENS.textSec,
        cursor: "pointer",
        transition: "all 0.2s ease",
        transform: "scale(1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.borderColor = TOKENS.primary;
        if (!active) {
          e.currentTarget.style.background = "rgba(244,80,30,0.05)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.borderColor = active
          ? TOKENS.borderHi
          : TOKENS.border;
        e.currentTarget.style.background = active
          ? TOKENS.bgCard
          : "transparent";
      }}
    >
      {children}
    </button>
  );
}

interface DayTimelineAppointmentCardProps {
  cita: any;
  prof: any;
  profColor: string;
  citaBg: string;
  citaBorder: string;
  citaBorderHover: string;
  citaShadow: string;
  citaShadowHover: string;
  profCitas: any[];
  citasWithLanes: any[];
  clienteMap: any;
  servicioMap: any;
  categorias: any[];
  citaAddonsMap: any;
  propuestaPorCitaId: any;
  START_H: number;
  ROW_H: number;
  isDragging: boolean;
  isBeingDragged: boolean;
  profesionalesLength: number;
  completarManual: boolean;
  clientes: any[];
  profesionales?: any[];
  startDrag: (cita: any, e: React.MouseEvent<HTMLDivElement>) => void;
  toggleCompletada: (citaId: string, estado: string) => void;
  onCreateSlot?: (data: { hora: string; profId: string; reposoContext?: any }) => void;
  onClienteHistorial?: ((cli: any) => void) | null;
}

function areCardPropsEqual(
  prev: DayTimelineAppointmentCardProps,
  next: DayTimelineAppointmentCardProps,
): boolean {
  if (prev.cita?.id !== next.cita?.id) return false;
  if (prev.cita?.estado !== next.cita?.estado) return false;
  if (prev.cita?.cobrada !== next.cita?.cobrada) return false;
  if (prev.cita?.cobro_id !== next.cita?.cobro_id) return false;
  if (prev.cita?.inicio !== next.cita?.inicio) return false;
  if (prev.cita?.fin !== next.cita?.fin) return false;
  if (prev.cita?._lane !== next.cita?._lane) return false;
  if (prev.cita?._totalLanes !== next.cita?._totalLanes) return false;
  if (prev.cita?._nested !== next.cita?._nested) return false;
  if (prev.cita?._nestedLane !== next.cita?._nestedLane) return false;
  if (prev.cita?._nestedTotal !== next.cita?._nestedTotal) return false;
  if (prev.cita?._desbordaMin !== next.cita?._desbordaMin) return false;
  if (prev.cita?.cliente_id !== next.cita?.cliente_id) return false;
  if (prev.cita?.servicio_id !== next.cita?.servicio_id) return false;
  if (prev.cita?.precio !== next.cita?.precio) return false;
  if (prev.cita?.importe_final !== next.cita?.importe_final) return false;
  if (prev.cita?.notas !== next.cita?.notas) return false;
  if (prev.cita?.updated_at !== next.cita?.updated_at) return false;
  if (prev.isBeingDragged !== next.isBeingDragged) return false;
  if (prev.isDragging !== next.isDragging) return false;
  if (prev.START_H !== next.START_H) return false;
  if (prev.ROW_H !== next.ROW_H) return false;
  if (prev.profColor !== next.profColor) return false;
  if (prev.citaBg !== next.citaBg) return false;
  if (prev.citaBorder !== next.citaBorder) return false;
  if (prev.profesionalesLength !== next.profesionalesLength) return false;
  if (prev.completarManual !== next.completarManual) return false;
  if (prev.clienteMap !== next.clienteMap) return false;
  if (prev.servicioMap !== next.servicioMap) return false;
  if (prev.categorias !== next.categorias) return false;
  if (prev.profesionales !== next.profesionales) return false;

  const prevProp = prev.propuestaPorCitaId?.get?.(prev.cita?.id);
  const nextProp = next.propuestaPorCitaId?.get?.(next.cita?.id);
  if (prevProp !== nextProp) return false;

  const prevAddons = prev.citaAddonsMap?.[prev.cita?.id];
  const nextAddons = next.citaAddonsMap?.[next.cita?.id];
  if (prevAddons !== nextAddons) {
    if (JSON.stringify(prevAddons) !== JSON.stringify(nextAddons)) return false;
  }

  return true;
}

export const DayTimelineAppointmentCard = memo(function DayTimelineAppointmentCard({
  cita,
  prof,
  profColor,
  citaBg,
  citaBorder,
  citaBorderHover,
  citaShadow,
  citaShadowHover,
  profCitas,
  citasWithLanes,
  clienteMap,
  servicioMap,
  categorias,
  citaAddonsMap,
  propuestaPorCitaId,
  START_H,
  ROW_H,
  isDragging,
  isBeingDragged,
  profesionalesLength,
  completarManual,
  clientes,
  profesionales = [],
  startDrag,
  toggleCompletada,
  onCreateSlot,
  onClienteHistorial,
}: DayTimelineAppointmentCardProps) {
  const start = new Date(cita.inicio);
  const end = new Date(cita.fin);
  const startH = start.getHours() + start.getMinutes() / 60;
  const durH = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const top = (startH - START_H) * ROW_H;
  const height = Math.max(16, durH * ROW_H);
  const lane = cita._lane ?? 0;
  const totalLanes = cita._totalLanes ?? 1;
  const nested = !!cita._nested;
  const hostCita = nested
    ? profCitas.find((h: any) => h.id === cita._hostId)
    : null;
  const hostLane = hostCita?._lane ?? 0;
  const hostTotalLanes = hostCita?._totalLanes ?? 1;
  const hostL = (hostLane / hostTotalLanes) * 100;
  const hostW = 100 / hostTotalLanes;
  const NEST_INSET_L = 6,
    NEST_INSET_R = 6;
  const nArea = 100 - NEST_INSET_L - NEST_INSET_R;
  const nLane = cita._nestedLane ?? 0;
  const nTotal = cita._nestedTotal ?? 1;
  const nW = nArea / nTotal;
  const nestL = hostL + ((NEST_INSET_L + nLane * nW) * hostW) / 100;
  const nestR =
    100 -
    (hostL +
      ((NEST_INSET_L + (nLane + 1) * nW) * hostW) / 100);
  const nestedLeft = `calc(${Math.max(0, nestL)}% + 2px)`;
  const nestedRight = `calc(${Math.max(0, nestR)}% + 2px)`;
  const cancelada = cita.estado === CITA_STATUS.CANCELADA;
  const isChained = !!cita.grupo_id;
  // Los eslabones cancelados salen de la cuenta: si no, una cadena de tres con
  // uno anulado decia "2/4" y saltaba del 2 al 4, y el riel (que si los quita,
  // ver ChainFlowOverlay) dibujaba otra cosa distinta.
  const chainSiblings = eslabonesParaPintar(
    cita.grupo_id,
    citasWithLanes as any,
    (e) => e === CITA_STATUS.CANCELADA,
  );
  const chainTotal = chainSiblings.length;
  const chainPos =
    chainSiblings.findIndex((c: any) => c.id === cita.id) + 1;
  // Una cadena de un solo eslabon no es una cadena: ni reserva carril para el
  // riel ni pinta indice.
  const enCadena = isChained && chainTotal > 1 && chainPos > 0 && !nested && !cancelada;
  const finActiva = cita.fin_activa ? new Date(cita.fin_activa) : null;
  const finEspera = cita.fin_espera ? new Date(cita.fin_espera) : null;
  const activaPx = finActiva
    ? ((finActiva.getTime() - start.getTime()) / (1000 * 60 * 60)) * ROW_H
    : height;
  const esperaPx =
    finActiva && finEspera
      ? ((finEspera.getTime() - finActiva.getTime()) / (1000 * 60 * 60)) * ROW_H
      : 0;
  const hasEspera = esperaPx > 2;
  const srv = servicioMap?.get(cita.servicio_id);
  const cat = srv
    ? (categorias || []).find((cc: any) => cc.id === srv.categoria_id)
    : null;
  // La categoria de servicio NO pinta el bloque (eso es del estado, canal 1):
  // se dice con un punto de 6px delante del servicio, y nada mas. Cuando era
  // un borde superior de 3px competia con el borde del estado y con la barra
  // del profesional, y una cita acababa teniendo tres colores.
  const catColor = cat ? categoryColorHex(cat.color) : null;
  const catName = cat?.nombre || "";

  // --- Canal 1 de 4: el ESTADO (lib/agendaBloqueUi.ts) --------------------
  // TODO el color del bloque sale de aqui y de ningun otro sitio.
  // La hora actual vive DENTRO de la card (tick por minuto): asi "en curso" y
  // "sin cerrar" se derivan sin re-renderizar la rejilla entera en cada tick.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const bloque = bloqueDeCita(cita, nowTick);
  const enCurso = bloque.clave === "curso";
  const progreso = enCurso ? progresoCita(cita, nowTick) : 0;
  const restantes = enCurso ? minutosRestantes(cita, nowTick) : 0;

  // Densidad en tres niveles. Un bloque de 15 minutos no puede llevar lo mismo
  // que uno de dos horas: forzarlo es justo lo que produce los solapes.
  //
  // Los umbrales son la suma real de lo que hay dentro, no numeros redondos:
  //   dos filas = 14 (padding) + 15 (nombre) + 4 (hueco) + 17 (chip) = 50px
  //   tres filas = + 15 del servicio = 65px
  // Con el umbral en 34 una cita de 15 minutos (40px) entraba en dos filas y el
  // chip salia cortado por la mitad.
  //
  // Y la altura que cuenta no es la del bloque, es la del tramo ACTIVO: en una
  // cita de una hora con cincuenta minutos de reposo, el texto solo dispone de
  // los diez primeros minutos. Midiendo el bloque entero se colaba el layout
  // completo en una franja de 27px.
  const altoUtil =
    hasEspera && !nested && !cancelada ? Math.max(20, activaPx) : height;
  const compacto = altoUtil <= 50;
  const medio = !compacto && altoUtil <= 64;
  // En una tira de 16px un barrido no se lee, solo parpadea.
  const conMotion = !nested && height > 28;
  const rootCls = conMotion
    ? [bloque.loop, bloque.entrada].filter(Boolean).join(" ")
    : "";

  const nombreCliente = clienteMap?.get(cita.cliente_id)?.nombre || "-";
  const nombreServicio = srv?.nombre || "";
  const horaIni = start.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const duracionMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const colorTexto = cancelada ? TOKENS.textTer : TOKENS.text;
  const propuesta = propuestaPorCitaId.get(cita.id);
  const desbordaMin = nested && !cancelada ? cita._desbordaMin || 0 : 0;

  const profIni =
    (prof?.nombre || "?")
      .split(/\s+/)
      .map((w: string) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const stylistAvatar = (
    <span
      title={`Estilista: ${prof?.nombre || ""}`}
      style={{
        width: 15,
        height: 15,
        borderRadius: 999,
        overflow: "hidden",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: profColor,
        border: "1px solid rgba(255,255,255,0.9)",
      }}
    >
      {prof?.foto_perfil ? (
        <img
          src={prof.foto_perfil}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ fontSize: 7, fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>
          {profIni}
        </span>
      )}
    </span>
  );

  const puntoCategoria = catColor ? (
    <span
      title={catName}
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        background: catColor,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  ) : null;

  const candado = (
    <svg width="10" height="10" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <rect
        className="m-st-cobrada-body"
        x="4"
        y="10"
        width="16"
        height="11"
        rx="2.5"
        fill={TOKENS.successHi}
      />
      <path
        className="m-st-cobrada-arc"
        d="M8 10 V7a4 4 0 0 1 8 0 v3"
        fill="none"
        stroke={TOKENS.successHi}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );

  // Un chip, un mensaje. Nunca dos chips diciendo lo mismo ni el mismo estado
  // repetido arriba junto a la hora: la esquina superior derecha es de la hora
  // y de nadie mas.
  const chipEstado =
    bloque.label && bloque.chipBg ? (
      <span
        title={bloque.label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          minWidth: 0,
          maxWidth: "100%",
          padding: "2px 7px",
          borderRadius: 999,
          background: bloque.chipBg,
          color: bloque.acentoTexto || TOKENS.textSec,
          fontSize: 9.5,
          fontWeight: 700,
          lineHeight: 1.4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {bloque.clave === "cobrada" ? candado : null}
        {bloque.label}
      </span>
    ) : null;

  const indiceCadena = enCadena ? (
    <span
      title={`Servicio ${chainPos} de ${chainTotal} de una cadena`}
      style={{
        flexShrink: 0,
        padding: "1.5px 6px",
        borderRadius: 999,
        background: TOKENS.chainRailSoft,
        color: TOKENS.chainRail,
        fontSize: 8.5,
        fontWeight: 800,
        letterSpacing: "0.03em",
        lineHeight: 1.5,
        whiteSpace: "nowrap",
      }}
    >
      {chainPos}/{chainTotal}
    </span>
  ) : null;

  return (
    <div
      key={cita.id}
      className={rootCls}
      // Ganchos para los tests de caracterizacion (tests/agenda-demo.spec.ts).
      // Son atributos y ya: no entran en ninguna decision de render. Estan aqui
      // para que las pruebas no dependan del texto de la demo (que se resiembra
      // cada 2 h) ni de estilos, y sobre todo para que SIGAN VALIENDO cuando
      // esta tarjeta se extraiga a su propio archivo.
      data-mecha-cita={cita.id}
      data-mecha-estado={cita.estado}
      data-mecha-fase={hasEspera ? "con-reposo" : "solo-activa"}
      data-mecha-encadenada={enCadena ? "si" : "no"}
      style={{
        position: "absolute",
        top,
        // Una cita encadenada se aparta para dejarle sitio al riel; ese hueco
        // es lo que hace que la linea de la cadena nunca pise el texto.
        left: nested
          ? nestedLeft
          : `calc(${(lane / totalLanes) * 100}% + ${enCadena ? 4 + CHAIN_GUTTER : 4}px)`,
        right: nested
          ? nestedRight
          : `calc(${((totalLanes - lane - 1) / totalLanes) * 100}% + 4px)`,
        height,
        boxSizing: "border-box",
        pointerEvents: "auto",
        zIndex: nested ? 15 : 10,
        // Un solo lenguaje de color: fondo, borde y barra izquierda salen del
        // estado. El tinte se pinta SOBRE blanco para que no transparente la
        // rejilla ni la franja de reposo de debajo.
        backgroundColor: TOKENS.bgCard,
        backgroundImage: `linear-gradient(${bloque.fondo}, ${bloque.fondo})`,
        border: `1px solid ${bloque.borde}`,
        borderLeft: bloque.acento
          ? `3px solid ${bloque.acento}`
          : `1px solid ${bloque.borde}`,
        // El radio lo manda el bloque real, no el tramo activo: una cita larga
        // con el activo corto sigue siendo una tarjeta grande.
        borderRadius: height <= 50 ? 7 : 10,
        padding: compacto
          ? "0 7px"
          : hasEspera && activaPx <= 45
            ? "3px 8px"
            : "7px 9px",
        overflow: "hidden",
        cursor: isDragging ? "grabbing" : "grab",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        boxShadow: bloque.sombra,
        // Solo sombra y brillo en el hover: nada que desplace el bloque ni
        // empuje a los vecinos.
        transition: isBeingDragged
          ? "none"
          : "box-shadow 0.18s ease, filter 0.18s ease",
        // 0.25 dejaba la cita practicamente invisible sobre el rayado del
        // reposo y parecia que "desaparecia" al arrastrarla encima.
        opacity: bloque.atenuado ? 0.5 : isBeingDragged ? 0.45 : 1,
      }}
      onMouseDown={(e) => {
        if (!cancelada) startDrag(cita, e);
      }}
      onMouseEnter={(e) => {
        if (isDragging) return;
        e.currentTarget.style.filter = "brightness(1.03)";
        e.currentTarget.style.zIndex = nested ? "25" : "20";
        e.currentTarget.style.boxShadow = cancelada
          ? "none"
          : "0 8px 20px rgba(28,24,20,0.14)";
      }}
      onMouseLeave={(e) => {
        if (isDragging) return;
        e.currentTarget.style.filter = "";
        e.currentTarget.style.zIndex = nested ? "15" : "10";
        e.currentTarget.style.boxShadow = bloque.sombra;
      }}
    >
      {conMotion && cancelada && <span className="m-st-cancelada-strike" aria-hidden />}
      {conMotion && enCurso && (
        <div
          className="m-st-curso-progress"
          style={{ "--p": `${progreso}%` } as any}
          aria-hidden
        />
      )}

      {hasEspera &&
        !cancelada &&
        (() => {
          const reposoIniMs = finActiva!.getTime();
          const reposoFinMs = finEspera!.getTime();
          const hayActiva2 = !(finEspera && finEspera < end);
          const ocupados = profCitas
            .filter(
              (c: any) =>
                c._hostId === cita.id && c.estado !== CITA_STATUS.CANCELADA,
            )
            .map(
              (c: any) =>
                [new Date(c.inicio).getTime(), new Date(c.fin).getTime()] as [
                  number,
                  number,
                ],
            )
            .sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
          const libres: [number, number][] = [];
          let cursor = reposoIniMs;
          for (const [ini, fin] of ocupados) {
            if (ini > cursor) libres.push([cursor, Math.min(ini, reposoFinMs)]);
            cursor = Math.max(cursor, fin);
          }
          if (cursor < reposoFinMs) libres.push([cursor, reposoFinMs]);
          const msToPx = (ms: number) => (ms / 3600000) * ROW_H;
          return (
            <div
              title="Reposo: el producto actua solo y el profesional queda libre"
              style={{
                position: "absolute",
                top: activaPx,
                left: 0,
                right: 0,
                height: esperaPx,
                pointerEvents: "auto",
                zIndex: 4,
                // Canal 3: las fases son ESTRUCTURA, no estado. Rayado neutro
                // calido; el verde se reserva para el hueco aprovechable, que
                // si es una accion.
                background:
                  "repeating-linear-gradient(135deg, rgba(115,102,88,0.13) 0px, rgba(115,102,88,0.13) 5px, rgba(255,253,251,0.60) 5px, rgba(255,253,251,0.60) 11px)",
                borderTop: "1.5px dashed rgba(115,102,88,0.40)",
                borderBottom: hayActiva2
                  ? "1.5px dashed rgba(115,102,88,0.40)"
                  : "none",
                overflow: "hidden",
              }}
            >
              {libres.map(([ini, fin], i) => {
                const gapMin = Math.round((fin - ini) / 60000);
                if (gapMin < 5) return null;
                const gapTop = msToPx(ini - reposoIniMs);
                const gapH = msToPx(fin - ini);
                return (
                  <ReposoFreeGapInteractive
                    key={i}
                    ini={ini}
                    fin={fin}
                    gapMin={gapMin}
                    gapTop={gapTop}
                    gapH={gapH}
                    cita={cita}
                    clienteMap={clienteMap}
                    servicioMap={servicioMap}
                    dragging={isDragging}
                    onSelectReposo={({ horaStr, profId, reposoContext }) => {
                      if (onCreateSlot) {
                        onCreateSlot({ hora: horaStr, profId, reposoContext });
                      }
                    }}
                  />
                );
              })}
            </div>
          );
        })()}

      <div
        style={
          hasEspera && !nested && !cancelada
            ? {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: Math.max(20, activaPx),
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: activaPx <= 45 ? "3px 8px" : "6px 9px",
                boxSizing: "border-box",
                zIndex: 6,
              }
            : {
                position: "relative",
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                height: "100%",
                width: "100%",
                minWidth: 0,
                overflow: "hidden",
              }
        }
      >
        {compacto ? (
          // Densidad 1: una sola linea. Cabe la hora, el nombre y una senal.
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              width: "100%",
              minWidth: 0,
              height: "100%",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: colorTexto,
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {horaIni}
            </span>
            {puntoCategoria}
            <span
              title={`${nombreCliente}${nombreServicio ? ` · ${nombreServicio}` : ""}`}
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: colorTexto,
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                textDecoration: bloque.tachado ? "line-through" : "none",
              }}
            >
              {nombreCliente}
            </span>
            {bloque.acento && (
              <span
                title={bloque.label}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: bloque.acento,
                  flexShrink: 0,
                }}
              />
            )}
            {indiceCadena}
          </div>
        ) : (
          <>
            {/* Arriba a la izquierda, quien y que. Arriba a la derecha, la
                hora y solo la hora. */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 6,
                minWidth: 0,
              }}
            >
              <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                <div
                  onClick={(e) => {
                    if (onClienteHistorial) {
                      e.stopPropagation();
                      const cli = clientes.find(
                        (cl: any) => cl.id === cita.cliente_id,
                      );
                      if (cli) onClienteHistorial(cli);
                    }
                  }}
                  title={nombreCliente}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: colorTexto,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: onClienteHistorial ? "pointer" : "default",
                    textDecoration: bloque.tachado ? "line-through" : "none",
                  }}
                >
                  {nombreCliente}
                </div>
                {!medio && nombreServicio && (
                  <div
                    title={catName ? `${nombreServicio} · ${catName}` : nombreServicio}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 2,
                      minWidth: 0,
                    }}
                  >
                    {puntoCategoria}
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 500,
                        color: TOKENS.textTer,
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {nombreServicio}
                    </span>
                  </div>
                )}
              </div>

              <div
                style={{
                  flexShrink: 0,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: colorTexto }}>
                  {horaIni}
                </div>
                {altoUtil > 78 && (
                  <div
                    style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 1 }}
                  >
                    {enCurso ? `quedan ${restantes}'` : `${duracionMin} min`}
                  </div>
                )}
              </div>
            </div>

            {/* Abajo a la izquierda, el estado. Abajo a la derecha, la cadena.
                Esquinas opuestas: no se pueden solapar. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                minWidth: 0,
                marginTop: "auto",
                paddingTop: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                {chipEstado}
                {stylistAvatar}
                {propuesta && !cancelada && (
                  <span
                    title={`Cambio propuesto a las ${new Date(propuesta.inicio_propuesto).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })} — pendiente de que lo confirme la clienta`}
                    style={{
                      flexShrink: 0,
                      padding: "1.5px 6px",
                      borderRadius: 999,
                      background: "rgba(124,58,237,0.12)",
                      color: "#6d28d9",
                      fontSize: 8.5,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(propuesta.inicio_propuesto).toLocaleTimeString(
                      LOCALE,
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </span>
                )}
                {desbordaMin > 0 && (
                  <span
                    title={`Esta cita se sale ${desbordaMin} min del hueco de reposo`}
                    style={{
                      flexShrink: 0,
                      padding: "1.5px 6px",
                      borderRadius: 999,
                      background: TOKENS.warningSoft,
                      color: TOKENS.warningHi,
                      fontSize: 8.5,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    +{desbordaMin}'
                  </span>
                )}
              </div>
              {indiceCadena}
            </div>
          </>
        )}
      </div>
    </div>
  );
}, areCardPropsEqual);

interface DayTimelineProfessionalColumnProps {
  prof: any;
  profColor: string;
  profCitas: any[];
  citasWithLanes: any[];
  selectedDateObj: Date;
  START_H: number;
  ROW_H: number;
  horariosProf: any[];
  horarioSalonHoy: any;
  festivoHoy: any;
  salonCerradoTodoElDia: boolean;
  bloqueos: any[];
  clienteMap: any;
  servicioMap: any;
  categorias: any[];
  citaAddonsMap: any;
  propuestaPorCitaId: any;
  isDragging: boolean;
  dragCitaId: string | null | undefined;
  profesionalesLength: number;
  completarManual: boolean;
  clientes: any[];
  startDrag: (cita: any, e: React.MouseEvent<HTMLDivElement>) => void;
  toggleCompletada: (citaId: string, estado: string) => void;
  onCreateSlot?: (data: { hora: string; profId: string; reposoContext?: any }) => void;
  onClienteHistorial?: ((cli: any) => void) | null;
  zonasResaltadas: ProblemaAgenda[];
  profesionales: any[];
}

export const DayTimelineProfessionalColumn = memo(function DayTimelineProfessionalColumn({
  prof,
  profColor,
  profCitas,
  citasWithLanes,
  selectedDateObj,
  START_H,
  ROW_H,
  horariosProf,
  horarioSalonHoy,
  festivoHoy,
  salonCerradoTodoElDia,
  bloqueos,
  clienteMap,
  servicioMap,
  categorias,
  citaAddonsMap,
  propuestaPorCitaId,
  isDragging,
  dragCitaId,
  profesionalesLength,
  completarManual,
  clientes,
  startDrag,
  toggleCompletada,
  onCreateSlot,
  onClienteHistorial,
  zonasResaltadas,
  profesionales,
}: DayTimelineProfessionalColumnProps) {
  const citaBg = `${profColor}2b`;
  const citaBorder = `${profColor}45`;
  const citaBorderHover = `${profColor}77`;
  const citaShadow = `0 4px 12px -2px rgba(0,0,0,0.04), 0 2px 4px -2px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px ${profColor}1a`;
  const citaShadowHover = `0 12px 20px -4px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6), 0 0 0 1px ${profColor}33`;

  return (
    <div key={prof.id} style={{ position: "relative", pointerEvents: "none" }}>
      {(() => {
        const dayStart = new Date(selectedDateObj);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDateObj);
        dayEnd.setHours(23, 59, 59, 999);

        const dbDia = selectedDateObj.getDay();
        const profHorarios = (horariosProf as any[])
          .filter(
            (h: any) =>
              h.profesional_id === prof.id &&
              h.dia_semana === dbDia,
          )
          .sort(
            (a: any, b: any) => (a.turno ?? 1) - (b.turno ?? 1),
          );

        const alDia = (hhmm: string) => {
          const [h, m] = String(hhmm).split(":").map(Number);
          const d = new Date(selectedDateObj);
          d.setHours(h, m || 0, 0, 0);
          return d;
        };
        const salonCerrado: any[] = [];
        const rejillaIniSalon = new Date(selectedDateObj);
        rejillaIniSalon.setHours(START_H, 0, 0, 0);
        const rejillaFinSalon = new Date(selectedDateObj);
        rejillaFinSalon.setHours(HORARIO_CIERRE.horas, 0, 0, 0);

        let abreSalon: Date | null = null;
        let cierraSalon: Date | null = null;

        if (salonCerradoTodoElDia) {
          const diaIni = new Date(selectedDateObj);
          diaIni.setHours(START_H, 0, 0, 0);
          const diaFin = new Date(selectedDateObj);
          diaFin.setHours(HORARIO_CIERRE.horas, 0, 0, 0);
          salonCerrado.push({
            id: `salon-cerrado-${prof.id}`,
            profesional_id: prof.id,
            inicio: diaIni.toISOString(),
            fin: diaFin.toISOString(),
            tipo: "salon_cerrado",
            motivo: festivoHoy
              ? festivoHoy.motivo || "Festivo"
              : "El salón no abre este día",
          });
        } else if (
          horarioSalonHoy &&
          horarioSalonHoy.apertura &&
          horarioSalonHoy.cierre
        ) {
          abreSalon = alDia(horarioSalonHoy.apertura);
          cierraSalon = alDia(horarioSalonHoy.cierre);
          if (abreSalon > rejillaIniSalon) {
            salonCerrado.push({
              id: `salon-antes-${prof.id}`,
              profesional_id: prof.id,
              inicio: rejillaIniSalon.toISOString(),
              fin: abreSalon.toISOString(),
              tipo: "salon_cerrado",
              motivo: `El salón abre a las ${String(horarioSalonHoy.apertura).slice(0, 5)}`,
            });
          }
          if (cierraSalon < rejillaFinSalon) {
            salonCerrado.push({
              id: `salon-despues-${prof.id}`,
              profesional_id: prof.id,
              inicio: cierraSalon.toISOString(),
              fin: rejillaFinSalon.toISOString(),
              tipo: "salon_cerrado",
              motivo: `El salón cierra a las ${String(horarioSalonHoy.cierre).slice(0, 5)}`,
            });
          }
        }
        const virtualPauses = [];
        if (profHorarios.length > 1) {
          for (let i = 0; i < profHorarios.length - 1; i++) {
            const h1 = profHorarios[i];
            const h2 = profHorarios[i + 1];
            const vStart = new Date(selectedDateObj);
            const [sH, sM] = h1.hora_fin.split(":").map(Number);
            vStart.setHours(sH, sM, 0, 0);
            const vEnd = new Date(selectedDateObj);
            const [eH, eM] = h2.hora_inicio
              .split(":")
              .map(Number);
            vEnd.setHours(eH, eM, 0, 0);
            if (vEnd > vStart) {
              virtualPauses.push({
                id: `pause-${prof.id}-${i}`,
                profesional_id: prof.id,
                inicio: vStart.toISOString(),
                fin: vEnd.toISOString(),
                tipo: "descanso",
                motivo: "Pausa de comida",
              });
            }
          }
        }

        const tieneAlgunHorario = (horariosProf as any[]).some(
          (h: any) => h.profesional_id === prof.id,
        );
        const fueraJornada: any[] = [];

        // Ventana en la que el salón está abierto hoy (para no duplicar bloqueos antes de que el salón abra o después de que cierre)
        const salonAbreEfectivo = abreSalon && abreSalon > rejillaIniSalon ? abreSalon : rejillaIniSalon;
        const salonCierraEfectivo = cierraSalon && cierraSalon < rejillaFinSalon ? cierraSalon : rejillaFinSalon;

        if (
          tieneAlgunHorario &&
          profHorarios.length === 0 &&
          !salonCerradoTodoElDia
        ) {
          if (salonCierraEfectivo > salonAbreEfectivo) {
            fueraJornada.push({
              id: `jornada-libra-${prof.id}`,
              profesional_id: prof.id,
              inicio: salonAbreEfectivo.toISOString(),
              fin: salonCierraEfectivo.toISOString(),
              tipo: "fuera_jornada",
              motivo: "No trabaja este día",
            });
          }
        }
        if (profHorarios.length > 0 && !salonCerradoTodoElDia) {
          const entra = alDia(profHorarios[0].hora_inicio);
          const sale = alDia(
            profHorarios[profHorarios.length - 1].hora_fin,
          );
          if (entra > salonAbreEfectivo) {
            fueraJornada.push({
              id: `jornada-ini-${prof.id}`,
              profesional_id: prof.id,
              inicio: salonAbreEfectivo.toISOString(),
              fin: entra.toISOString(),
              tipo: "fuera_jornada",
              motivo: `Entra a las ${profHorarios[0].hora_inicio.slice(0, 5)}`,
            });
          }
          if (sale < salonCierraEfectivo) {
            fueraJornada.push({
              id: `jornada-fin-${prof.id}`,
              profesional_id: prof.id,
              inicio: sale.toISOString(),
              fin: salonCierraEfectivo.toISOString(),
              tipo: "fuera_jornada",
              motivo: `Termina a las ${profHorarios[profHorarios.length - 1].hora_fin.slice(0, 5)}`,
            });
          }
        }

        return [
          ...(bloqueos as any[]),
          ...virtualPauses,
          ...fueraJornada,
          ...salonCerrado,
        ]
          .filter((b: any) => {
            if (b.profesional_id !== prof.id) return false;
            return (
              new Date(b.inicio) <= dayEnd &&
              new Date(b.fin) >= dayStart
            );
          })
          .sort(
            (a: any, b: any) =>
              new Date(a.inicio).getTime() -
              new Date(b.inicio).getTime(),
          )
          .map((b: any, idx: number, arr: any[]) => {
            const bIniMs = new Date(b.inicio).getTime();
            const bFinMs = new Date(b.fin).getTime();
            const labelRow = arr
              .slice(0, idx)
              .filter(
                (o: any) =>
                  new Date(o.inicio).getTime() < bFinMs &&
                  new Date(o.fin).getTime() > bIniMs,
              ).length;
            const labelOffset = labelRow * 32;
            const bloqueoDayStart = new Date(selectedDateObj);
            bloqueoDayStart.setHours(START_H, 0, 0, 0);
            const bloqueoDayEnd = new Date(selectedDateObj);
            bloqueoDayEnd.setHours(HORARIO_CIERRE.horas, 0, 0, 0);
            const bStart = new Date(
              Math.max(
                new Date(b.inicio).getTime(),
                bloqueoDayStart.getTime(),
              ),
            );
            const bEnd = new Date(
              Math.min(
                new Date(b.fin).getTime(),
                bloqueoDayEnd.getTime(),
              ),
            );
            const blockTop =
              (bStart.getHours() +
                bStart.getMinutes() / 60 -
                START_H) *
              ROW_H;
            const blockHeight =
              (bEnd.getHours() +
                bEnd.getMinutes() / 60 -
                (bStart.getHours() + bStart.getMinutes() / 60)) *
              ROW_H;
            if (blockHeight <= 0) return null;
            const bColor = BLOQUEO_COLORS[b.tipo] || "#94a3b8";
            const cabeEtiqueta =
              blockHeight > labelOffset + 16;
            // "Fuera de jornada" y "salon cerrado" son los negativos del día
            const isSalonCerrado = b.tipo === "salon_cerrado";
            const isFueraJornada = b.tipo === "fuera_jornada";
            const isDescanso = b.tipo === "descanso";

            let bgStyle = `${bColor}18`;
            let borderLeftStyle = `3.5px solid ${bColor}`;
            let borderBoxStyle = `1px solid ${bColor}35`;
            let boxShadowStyle = `0 1px 4px ${bColor}18`;

            if (isSalonCerrado) {
              bgStyle = "linear-gradient(180deg, rgba(20, 16, 14, 0.46) 0%, rgba(20, 16, 14, 0.38) 100%)";
              borderLeftStyle = "3.5px solid #ef4444";
              borderBoxStyle = "1px solid rgba(255, 255, 255, 0.08)";
              boxShadowStyle = "0 2px 6px rgba(0,0,0,0.14)";
            } else if (isFueraJornada) {
              bgStyle = "linear-gradient(180deg, rgba(30, 24, 20, 0.22) 0%, rgba(30, 24, 20, 0.17) 100%)";
              borderLeftStyle = "2px solid rgba(120, 113, 108, 0.35)";
              borderBoxStyle = "1px solid rgba(0, 0, 0, 0.04)";
              boxShadowStyle = "none";
            } else if (isDescanso) {
              // Descansos / Pausas de comida: ámbar cálido destacado con alto contraste y visibilidad
              bgStyle = "linear-gradient(180deg, rgba(245, 158, 11, 0.24) 0%, rgba(245, 158, 11, 0.14) 100%)";
              borderLeftStyle = "3.5px solid #d97706";
              borderBoxStyle = "1px solid rgba(217, 119, 6, 0.35)";
              boxShadowStyle = "0 2px 6px rgba(217, 119, 6, 0.15), inset 0 0 12px rgba(245, 158, 11, 0.08)";
            } else {
              bgStyle = `linear-gradient(180deg, ${bColor}28 0%, ${bColor}16 100%)`;
              borderLeftStyle = `3.5px solid ${bColor}`;
              borderBoxStyle = `1px solid ${bColor}44`;
              boxShadowStyle = `0 1px 5px ${bColor}25`;
            }

            return (
              <div
                key={b.id}
                className={
                  b.tipo === "reserva_temporal"
                    ? "m-st-reservatemp"
                    : undefined
                }
                style={{
                  position: "absolute",
                  top: blockTop,
                  left: 2,
                  right: 2,
                  height: blockHeight,
                  background: bgStyle,
                  borderLeft: borderLeftStyle,
                  borderRight: borderBoxStyle,
                  borderTop: borderBoxStyle,
                  borderBottom: borderBoxStyle,
                  borderRadius: 6,
                  pointerEvents: "none",
                  zIndex: 1 + labelRow,
                  padding: "5px 7px",
                  overflow: "hidden",
                  boxShadow: boxShadowStyle,
                  // Las hormigas de 'reserva_temporal' se animan en motion.tsx
                  // pero el color lo manda BLOQUEO_COLORS, no el CSS.
                  ["--bloqueo" as any]: `${bColor}8c`,
                  boxSizing: "border-box",
                }}
              >
                {cabeEtiqueta && (
                  <div
                    style={{
                      fontSize: 10,
                      color: isFueraJornada ? "#f5f5f4" : "#ffffff",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      marginTop: labelOffset,
                      background: isSalonCerrado
                        ? "rgba(18, 14, 12, 0.90)"
                        : isFueraJornada
                          ? "rgba(35, 28, 24, 0.85)"
                          : isDescanso
                            ? "#d97706"
                            : bColor,
                      border: isSalonCerrado
                        ? "1px solid rgba(255, 255, 255, 0.16)"
                        : isFueraJornada
                          ? "1px solid rgba(255, 255, 255, 0.10)"
                          : isDescanso
                            ? "1px solid #b45309"
                            : `1px solid ${bColor}`,
                      borderRadius: 5,
                      padding: isSalonCerrado ? "2px 8px" : "2px 7px",
                      width: "fit-content",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      lineHeight: "14px",
                      boxShadow: isSalonCerrado
                        ? "0 1px 4px rgba(0,0,0,0.25)"
                        : isDescanso
                          ? "0 1px 4px rgba(180, 83, 9, 0.40)"
                          : `0 1px 3px ${bColor}40`,
                    }}
                  >
                    {isSalonCerrado && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: "#ef4444",
                          display: "inline-block",
                        }}
                      />
                    )}
                    {isDescanso && (
                      <span style={{ fontSize: 10, lineHeight: 1 }}>☕</span>
                    )}
                    {BLOQUEO_LABELS[b.tipo] || b.tipo}
                  </div>
                )}
                {b.motivo &&
                  blockHeight > labelOffset + 32 && (
                    <div
                      style={{
                        fontSize: 9.5,
                        color: isSalonCerrado
                          ? "#e7e5e4"
                          : isFueraJornada
                            ? "#d6d3d1"
                            : isDescanso
                              ? "#92400e"
                              : TOKENS.text,
                        fontWeight: isSalonCerrado || isDescanso ? 700 : 600,
                        marginTop: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        paddingLeft: 3,
                        lineHeight: "14px",
                      }}
                    >
                      {b.motivo}
                    </div>
                  )}
              </div>
            );
          });
      })()}
      {[...profCitas]
        .sort(
          (a: any, b: any) =>
            new Date(b.inicio).getTime() -
            new Date(a.inicio).getTime(),
        )
        .map((cita: any) => (
          <DayTimelineAppointmentCard
            key={cita.id}
            cita={cita}
            prof={prof}
            profColor={profColor}
            citaBg={citaBg}
            citaBorder={citaBorder}
            citaBorderHover={citaBorderHover}
            citaShadow={citaShadow}
            citaShadowHover={citaShadowHover}
            profCitas={profCitas}
            citasWithLanes={citasWithLanes}
            clienteMap={clienteMap}
            servicioMap={servicioMap}
            categorias={categorias}
            citaAddonsMap={citaAddonsMap}
            propuestaPorCitaId={propuestaPorCitaId}
            START_H={START_H}
            ROW_H={ROW_H}
            isDragging={isDragging}
            isBeingDragged={dragCitaId === cita.id}
            profesionalesLength={profesionalesLength}
            completarManual={completarManual}
            clientes={clientes}
            profesionales={profesionales}
            startDrag={startDrag}
            toggleCompletada={toggleCompletada}
            onCreateSlot={onCreateSlot}
            onClienteHistorial={onClienteHistorial}
          />
        ))}

      {(zonasResaltadas as ProblemaAgenda[])
        .filter(
          (p) =>
            p.zona.profesionalId === prof.id ||
            p.zonaOrigen?.profesionalId === prof.id,
        )
        .map((p) => {
          const aY = (iso: string) => {
            const d = new Date(iso);
            return (
              (d.getHours() + d.getMinutes() / 60 - START_H) *
              ROW_H
            );
          };
          const zTop = aY(p.zona.desde);
          const zH = aY(p.zona.hasta) - zTop;
          if (zH <= 0) return null;
          const rango = (
            zonasResaltadas as ProblemaAgenda[]
          ).findIndex((x) => x.id === p.id);
          const principal = rango >= 0 && rango < 3;
          const cambiaDeProfesional =
            !!p.zonaOrigen &&
            p.zonaOrigen.profesionalId !== p.zona.profesionalId;
          const colorDe = (id: string) =>
            (profesionales as any[]).find((x) => x.id === id)
              ?.color || TOKENS.primary;
          const tono = cambiaDeProfesional
            ? colorDe(p.zona.profesionalId)
            : p.tipo === "solape"
              ? "#e23b34"
              : p.tipo === "retraso"
                ? "#f59e0b"
                : "#10b981";
          const tonoOrigen = cambiaDeProfesional
            ? colorDe(p.zonaOrigen!.profesionalId)
            : tono;
          const opacidad = principal ? 1 : 0.42;
          const oTop = p.zonaOrigen
            ? aY(p.zonaOrigen.desde)
            : null;
          const oH =
            p.zonaOrigen && oTop != null
              ? aY(p.zonaOrigen.hasta) - oTop
              : 0;
          const flechaDesde =
            oTop != null ? Math.min(oTop, zTop + zH) : null;
          const flechaHasta =
            oTop != null ? Math.max(zTop + zH, oTop) : null;
          const viaje =
            principal &&
            !cambiaDeProfesional &&
            oTop != null &&
            oH > 0 &&
            Math.abs(zTop - oTop) > 8
              ? zTop - oTop
              : null;

          return (
            <div
              key={`prob-${p.id}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: "none",
                zIndex: 35,
              }}
            >
              {p.zonaOrigen &&
                oTop != null &&
                oH > 0 &&
                p.zonaOrigen.profesionalId === prof.id && (
                  <div
                    style={{
                      position: "absolute",
                      top: oTop,
                      left: 2,
                      right: 2,
                      height: oH,
                      borderRadius: 8,
                      border: `1.5px dashed ${tonoOrigen}`,
                      background: `${tonoOrigen}10`,
                      pointerEvents: "none",
                      zIndex: 39,
                      opacity: opacidad,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        bottom: 4,
                        right: 6,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: tonoOrigen,
                        color: "#fff",
                        fontSize: 8.5,
                        fontWeight: 800,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                      }}
                    >
                      Mover
                    </span>
                  </div>
                )}

              {viaje != null && oTop != null && (
                <div
                  style={
                    {
                      position: "absolute",
                      top: oTop,
                      left: 2,
                      right: 2,
                      height: oH,
                      borderRadius: 8,
                      border: `1.5px solid ${tono}`,
                      pointerEvents: "none",
                      zIndex: 42,
                      ["--viaje" as any]: `${viaje}px`,
                      animation:
                        "viajeZona 2.4s ease-in-out infinite",
                    } as React.CSSProperties
                  }
                />
              )}

              {flechaDesde != null &&
                flechaHasta != null &&
                flechaHasta - flechaDesde > 16 && (
                  <div
                    style={{
                      position: "absolute",
                      top: flechaDesde,
                      height: flechaHasta - flechaDesde,
                      left: "50%",
                      width: 2,
                      marginLeft: -1,
                      background: tono,
                      opacity: 0.85,
                      pointerEvents: "none",
                      zIndex: 41,
                      animation: principal
                        ? "pulseZona 1.6s ease-in-out infinite"
                        : undefined,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: -1,
                        left: -4,
                        width: 0,
                        height: 0,
                        borderLeft: "5px solid transparent",
                        borderRight: "5px solid transparent",
                        borderBottom: `6px solid ${tono}`,
                      }}
                    />
                  </div>
                )}

              {p.zona.profesionalId === prof.id && (
                <div
                  data-mecha-zona={p.id}
                  title={`${rango >= 0 ? `#${rango + 1} · ` : ""}${p.titulo} — ${p.descripcion}${p.porQue ? ` (${p.porQue})` : ""}`}
                  style={{
                    position: "absolute",
                    top: zTop,
                    left: 2,
                    right: 2,
                    height: zH,
                    borderRadius: 8,
                    border: `2px solid ${tono}`,
                    background: `${tono}1f`,
                    boxShadow: principal
                      ? `0 0 0 3px ${tono}22`
                      : "none",
                    pointerEvents: "none",
                    zIndex: 40,
                    animation: principal
                      ? "pulseZona 1.6s ease-in-out infinite"
                      : undefined,
                  }}
                >
                  {rango >= 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: -9,
                        right: 6,
                        minWidth: 16,
                        height: 16,
                        padding: "0 4px",
                        borderRadius: 999,
                        background: "#fff",
                        border: `1.5px solid ${tono}`,
                        color: tono,
                        fontSize: 9,
                        fontWeight: 900,
                        lineHeight: "13px",
                        textAlign: "center",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                      }}
                    >
                      {rango + 1}
                    </span>
                  )}
                  <span
                    style={{
                      position: "absolute",
                      top: -9,
                      left: 8,
                      right: 8,
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: tono,
                      color: "#fff",
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                      paddingRight: 22,
                    }}
                  >
                    {p.accionCorta || p.titulo}
                  </span>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
});

// Memoizado: no re-renderiza la agenda entera cuando el padre cambia estado
// no relacionado (abrir modales, hover, etc.). Sus props ya son estables
// (useMemo en maps/filtered + useCallback en las callbacks).
const DayTimelineMemo = memo(DayTimeline);

function DayTimeline({
  citas,
  profesionales,
  servicios,
  clientes,
  servicioMap,
  clienteMap,
  profesionalMap,
  citaAddonsMap = {},
  onEditCita,
  onCitaUpdated,
  bloqueos = [],
  selectedDateObj = new Date(),
  registrarHistorial,
  onMovimientoCita,
  onClienteHistorial,
  vivid = false,
  completarManual = false,
  onCreateSlot,
  theme,
  categorias = [],
  horarios = [],
  // Festivos/vacaciones puntuales del salon (cierres_negocio): fecha exacta,
  // no un patron semanal como `horarios`.
  cierres = [],
  // Jornada propia por profesional (horarios_profesional). dia_semana 0=DOMINGO.
  horariosProf = [],
  agendaFit = true,
  // Zonas a resaltar en modo "Enseñamelo" (ProblemaAgenda[]). Vacio = nada.
  zonasResaltadas = [],
  // Map cita_id -> propuesta de cambio pendiente (Fase 3). Pinta el badge
  // "Cambio propuesto HH:MM" en la cita original.
  propuestaPorCitaId = new Map(),
  // Reordenar columnas arrastrando la cabecera con el raton.
  onReorderProfs,
  // Profesionales de vacaciones hoy: sin columna, pero con avatar inactivo arriba.
  profsVacaciones = [],
}: any) {
  const { isMobile, isTablet } = useResponsive();
  // Para recargar la rejilla cuando al soltar una cita descubrimos que el hueco
  // ya no esta libre (la foto local se habia quedado vieja).
  const { triggerRefresh } = useCalendarRefresh();
  // Rango horario base = apertura..cierre. Si alguna cita del día seleccionado
  // termina DESPUÉS del cierre (overtime, p.ej. 17:45-21:20 con cierre 20:00),
  // ampliamos el rango hasta cubrirla. Sin esto, la cita rebasa la última fila
  // del grid, la tarjeta del timeline se vuelve scroller vertical anidado dentro
  // del pane principal (overflowY:auto) y aparece un DOBLE SCROLL. Ampliando
  // HOURS, la tarjeta crece, la cita queda contenida y solo scrollea el pane.
  // Días sin overtime: rango = base (sin filas vacías extra).
  const overtimeEnd = citas.reduce((mx: number, c: any) => {
    const f = c?.fin ? new Date(c.fin) : null;
    if (!f) return mx;
    const sd = selectedDateObj;
    if (
      f.getFullYear() === sd.getFullYear() &&
      f.getMonth() === sd.getMonth() &&
      f.getDate() === sd.getDate()
    ) {
      const eh = f.getHours() + f.getMinutes() / 60;
      return eh > mx ? eh : mx;
    }
    return mx;
  }, HORARIO_CIERRE.horas);
  const hoursEnd = Math.max(HORARIO_CIERRE.horas, Math.ceil(overtimeEnd));
  const HOURS = [];
  for (let h = HORARIO_APERTURA.horas; h < hoursEnd; h++) HOURS.push(h);
  const ROW_H = 160;
  // Ancho mínimo de cada columna de profesional en el timeline. La columna
  // nunca es más estrecha que como si en pantalla solo hubiera 4 profesionales
  // (3 en tablet): con 6+ columnas NO se compactan — cada una mantiene ese
  // ancho, que es el que deja ver toda la información de la cita (nombre,
  // servicio, precio, avatar), y la rejilla scrollea en horizontal. Como piso:
  // 200px, que ya es cómodo en móvil.
  const COLS_OBJETIVO = isTablet ? 3 : 4;
  const lienzoRef = useRef<HTMLDivElement>(null);
  const [anchoLienzo, setAnchoLienzo] = useState(0);
  useEffect(() => {
    const el = lienzoRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setAnchoLienzo(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const MIN_COL_W =
    anchoLienzo > 0
      ? Math.max(200, Math.floor((anchoLienzo - 56) / COLS_OBJETIVO))
      : 200;
  // ── Posicion manual de columnas ────────────────────────────────────────
  // Cada cabecera lleva un numerito: escribes 1 y esa persona pasa a ser la
  // primera columna. Sin drag&drop: mas directo y funciona tambien en tactil.
  const fijarPosProf = (id: string, pos: number) => {
    if (!onReorderProfs) return;
    const ids: string[] = profesionales.map((p: any) => p.id);
    const from = ids.indexOf(id);
    if (from < 0) return;
    const to = Math.max(0, Math.min(ids.length - 1, Math.round(pos) - 1));
    if (to === from) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorderProfs(ids);
  };
  const START_H = HORARIO_APERTURA.horas;
  // Al abrir la agenda del dia de HOY, llevar la vista a la hora actual. Antes
  // arrancaba siempre en la hora de apertura: por la tarde el salon veia la
  // rejilla vacia de la manana y tenia que bajar a mano cada vez.
  const yaAutoScroll = useRef(false);
  const esMismoDiaQueHoy =
    selectedDateObj instanceof Date &&
    selectedDateObj.toDateString() === new Date().toDateString();
  useEffect(() => {
    if (yaAutoScroll.current || !esMismoDiaQueHoy) return;
    const grid = gridRef.current;
    if (!grid) return;
    const nowInit = new Date();
    const currentH = nowInit.getHours();
    if (currentH < START_H || currentH >= START_H + HOURS.length) return;
    // Contenedor con scroll vertical mas cercano (la rejilla vive dentro de el).
    let cont: HTMLElement | null = grid.parentElement;
    while (cont && cont.scrollHeight <= cont.clientHeight + 8)
      cont = cont.parentElement;
    if (!cont) return;
    const topAhora = (currentH - START_H + nowInit.getMinutes() / 60) * ROW_H;
    // Un tercio por encima: se ve lo que acaba de pasar y lo que viene.
    cont.scrollTop = Math.max(0, topAhora - cont.clientHeight / 3);
    yaAutoScroll.current = true;
  }, [esMismoDiaQueHoy, citas.length]);

  const toggleCompletada = useCallback(
    async (citaId: string, estadoActual: string) => {
      const nuevoEstado =
        estadoActual === CITA_STATUS.COMPLETADA
          ? CITA_STATUS.CONFIRMADA
          : CITA_STATUS.COMPLETADA;
      let idsToUpdate = [citaId];
      const citaObj = (citas || []).find((x: any) => x.id === citaId);
      if (citaObj && citaObj.grupo_id && citaObj.cliente_id) {
        const chain = eslabonesParaOperar(citaObj as any, (citas || []) as any);
        if (chain.length > 0 && chain[0].id === citaId) {
          idsToUpdate = chain.map((x: any) => x.id);
        }
      }
      await supabase
        .from("citas")
        .update({ estado: nuevoEstado })
        .in("id", idsToUpdate);
      idsToUpdate.forEach((id) => {
        onCitaUpdated?.({ id, estado: nuevoEstado });
      });
    },
    [citas, onCitaUpdated],
  );

  // ---- DRAG & DROP ----
  const [isDragging, setIsDragging] = useState(false);
  const [drag, setDrag] = useState<any>(null);
  const [dropSlot, setDropSlot] = useState<any>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  // Anti-solape inteligente: al soltar en conflicto, propone el hueco valido mas cercano.
  const [dragAlt, setDragAlt] = useState<{
    profNombre: string;
    horaTxt: string;
    payload: any;
    citaOrig: any;
  } | null>(null);
  const [aplicandoAlt, setAplicandoAlt] = useState(false);
  // Encaje en reposo que NO cabe por poco: se avisa cuanto se pasa y se ofrece
  // asumir el riesgo (colocarla igual, al lado, aprovechando el tiempo muerto).
  const [dragRiesgo, setDragRiesgo] = useState<{
    overflowMin: number;
    hostNombre: string;
    horaTxt: string;
    payload: any;
    citaOrig: any;
  } | null>(null);
  const [aplicandoRiesgo, setAplicandoRiesgo] = useState(false);
  // Soltar sobre un profesional con vacaciones/ausencia ese rato: NO se bloquea de
  // golpe; se pregunta (feedback Jose) y se deja mover asumiendo el aviso.
  const [dragAusencia, setDragAusencia] = useState<{
    profNombre: string;
    horaTxt: string;
    motivo: string;
    payload: any;
    citaOrig: any;
  } | null>(null);
  const [aplicandoAusencia, setAplicandoAusencia] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<any>(null);
  const dropRef = useRef<any>(null);
  // Nodo del fantasma de arrastre y frame pendiente. Arrastrar hacia un setState
  // por cada mousemove re-renderizaba TODA la agenda (rail, toolbar y las ~N
  // citas) decenas de veces por segundo: era la causa real de que arrastrar
  // fuese a tirones. Ahora el fantasma se mueve escribiendo su transform en el
  // DOM dentro de un requestAnimationFrame, sin pasar por React.
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const ghostFrameRef = useRef<number | null>(null);
  const ghostPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const _profRef = useRef(profesionales);
  _profRef.current = profesionales;
  const _citasRef = useRef(citas);
  _citasRef.current = citas;
  const _dateRef = useRef(selectedDateObj);
  _dateRef.current = selectedDateObj;

  const startDrag = useCallback(
    (cita: any, e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      // DOS SISTEMAS DE COORDENADAS, y hay que elegir uno.
      //
      // Con zoom de pagina en el navegador, getBoundingClientRect() y
      // clientX/clientY devuelven pixeles ESCALADOS, mientras que lo que se
      // escribe en un `style` (o se compara con ROW_H y con los 56px de la
      // columna de horas) son pixeles CSS. Mezclarlos descuadra el arrastre
      // entero y ademas de forma acumulativa: con el zoom al 108% el fantasma
      // salia un 8% mas grande y corrido, la hora de suelta se desviaba un 8%
      // (mas de veinte minutos a ultima hora de la tarde) y la previa de suelta
      // se plantaba a mas de cien pixeles de la columna en el lado derecho.
      //
      // offsetWidth NO se escala, asi que el cociente da el factor exacto.
      // Desde aqui todo se guarda ya en pixeles CSS.
      const escala = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
      const d = {
        cita,
        escala,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: (e.clientX - rect.left) / escala,
        offsetY: (e.clientY - rect.top) / escala,
        ghostX: rect.left / escala,
        ghostY: rect.top / escala,
        blockWidth: rect.width / escala,
        blockHeight: rect.height / escala,
        // Rect de la rejilla cacheado (se rellena justo debajo y se refresca
        // en onScroll): leerlo en cada mousemove forzaba un reflow por evento.
        gridRect: undefined as
          | { left: number; top: number; width: number }
          | undefined,
      };
      // Rect de la rejilla cacheado: leerlo en cada mousemove forzaba un
      // reflow por evento y el arrastre iba a tirones. Se refresca solo
      // cuando la pagina se desplaza durante el arrastre (ver onScroll).
      const grid = gridRef.current;
      if (grid) {
        const gr = grid.getBoundingClientRect();
        d.gridRect = {
          left: gr.left / (escala || 1),
          top: gr.top / (escala || 1),
          width: gr.width / (escala || 1),
        };
      }
      dragRef.current = d;
      // El fantasma se monta YA (antes aparecia en el primer mousemove). A partir
      // de aqui su posicion se actualiza escribiendo el transform sobre el nodo,
      // no con setState: ver onMove.
      ghostPosRef.current = { x: d.ghostX, y: d.ghostY };
      setDrag(d);
      setIsDragging(true);
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved =
        Math.abs(e.clientX - d.startX) > 5 ||
        Math.abs(e.clientY - d.startY) > 5;
      if (!moved) return;

      // clientX/clientY vienen escalados; offsetX/offsetY ya estan en px CSS,
      // que es lo que entiende el translate3d del fantasma.
      const k = d.escala || 1;
      const upd = {
        ...d,
        ghostX: e.clientX / k - d.offsetX,
        ghostY: e.clientY / k - d.offsetY,
      };
      dragRef.current = upd;
      // Sin setState: el fantasma se coloca por transform en el proximo frame.
      ghostPosRef.current = { x: upd.ghostX, y: upd.ghostY };
      if (ghostFrameRef.current == null) {
        ghostFrameRef.current = requestAnimationFrame(() => {
          ghostFrameRef.current = null;
          const nodo = ghostRef.current;
          if (!nodo) return;
          const { x, y } = ghostPosRef.current;
          nodo.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.02)`;
        });
      }

      const grid = gridRef.current;
      const r = d.gridRect;
      if (!grid || !r) return;
      // Todo lo que sigue va en pixeles CSS: es lo unico que se puede comparar
      // con ROW_H y con los 56px de la columna de horas, y lo unico que se
      // puede volcar despues en un `style` (ver el comentario de startDrag).
      // El factor es el del zoom de pagina, o sea el mismo para todo el
      // documento: se reaprovecha el que se midio al empezar a arrastrar en vez
      // de leer offsetWidth en cada mousemove, que fuerza un reflujo por frame.
      const anchoCss = r.width;
      const relY = e.clientY / k - r.top;
      const relX = e.clientX / k - r.left - 56;
      const profs = _profRef.current;
      if (
        relY < 0 ||
        relY >= HOURS.length * ROW_H ||
        relX < 0 ||
        relX > anchoCss - 56 ||
        !profs.length
      ) {
        dropRef.current = null;
        setDropSlot(null);
        return;
      }
      const colW = (anchoCss - 56) / profs.length;
      const profIndex = Math.min(Math.floor(relX / colW), profs.length - 1);
      let minutesFromStart = Math.max(
        0,
        Math.round((((relY - d.offsetY) / ROW_H) * 60) / 15) * 15,
      );
      // Encaje en reposo: si el punto de suelta cae DENTRO del reposo de otra cita,
      // el snap pasa a 5 minutos y se ajusta para que la fase activa QUEPA en el
      // hueco (clamp al inicio del reposo y, si se pasa por el final, se retrasa
      // el inicio para que encaje justo). Antes el snap de 15' dejaba la cita
      // descolgada del hueco y "no encajaba".
      const targetProf = profs[profIndex];
      const dCita = d.cita;
      if (targetProf && dCita) {
        const fineMin = Math.max(
          0,
          Math.round((((relY - d.offsetY) / ROW_H) * 60) / 5) * 5,
        );
        const dayStart0 = new Date(_dateRef.current);
        dayStart0.setHours(START_H, 0, 0, 0);
        const fineMs = dayStart0.getTime() + fineMin * 60000;
        const activaMsDrag = dCita.fin_activa
          ? new Date(dCita.fin_activa).getTime() -
            new Date(dCita.inicio).getTime()
          : new Date(dCita.fin).getTime() - new Date(dCita.inicio).getTime();
        const hostRep = _citasRef.current.find(
          (c: any) =>
            c.id !== dCita.id &&
            c.profesional_id === targetProf.id &&
            c.estado !== "cancelada" &&
            c.fin_activa &&
            c.fin_espera &&
            fineMs >= new Date(c.fin_activa).getTime() &&
            fineMs < new Date(c.fin_espera).getTime(),
        );
        if (hostRep) {
          const repIni = new Date(hostRep.fin_activa).getTime();
          const repFin = new Date(hostRep.fin_espera).getTime();
          let startMs = fineMs;
          if (
            startMs + activaMsDrag > repFin &&
            repFin - activaMsDrag >= repIni
          )
            startMs = repFin - activaMsDrag;
          if (startMs < repIni) startMs = repIni;
          minutesFromStart = Math.round(
            (startMs - dayStart0.getTime()) / 60000,
          );
        }
      }
      const sl = { profIndex, minutesFromStart, colW };
      const ant = dropRef.current;
      dropRef.current = sl;
      // El slot solo cambia cada 5-15 min de recorrido: re-renderizar la previa
      // de suelta en cada pixel era trabajo tirado.
      if (
        !ant ||
        ant.profIndex !== sl.profIndex ||
        ant.minutesFromStart !== sl.minutesFromStart ||
        ant.colW !== sl.colW
      ) {
        setDropSlot(sl);
      }
    };

    const onUp = async (e: MouseEvent) => {
      const d = dragRef.current;
      const sl = dropRef.current;
      dragRef.current = null;
      dropRef.current = null;
      setDrag(null);
      setDropSlot(null);
      setIsDragging(false);

      if (!d) return;

      const moved =
        Math.abs(e.clientX - d.startX) > 5 ||
        Math.abs(e.clientY - d.startY) > 5;
      if (!moved) {
        onEditCita?.(d.cita);
        return;
      }
      if (!sl) return;

      const profs = _profRef.current;
      const currentCitas = _citasRef.current;
      const dateObj = _dateRef.current;
      const targetProf = profs[sl.profIndex];
      if (!targetProf) return;

      const cita = d.cita;
      const durMs =
        new Date(cita.fin).getTime() - new Date(cita.inicio).getTime();
      const activaMs = cita.fin_activa
        ? new Date(cita.fin_activa).getTime() - new Date(cita.inicio).getTime()
        : durMs;
      const esperaMs =
        cita.fin_activa && cita.fin_espera
          ? new Date(cita.fin_espera).getTime() -
            new Date(cita.fin_activa).getTime()
          : 0;

      const h = START_H + Math.floor(sl.minutesFromStart / 60);
      const m = sl.minutesFromStart % 60;
      let nuevoInicio = new Date(dateObj);
      nuevoInicio.setHours(h, m, 0, 0);
      let nuevoFinActiva = new Date(nuevoInicio.getTime() + activaMs);
      let nuevoFinEspera = new Date(nuevoFinActiva.getTime() + esperaMs);
      let nuevoFin = new Date(nuevoInicio.getTime() + durMs);

      if (
        nuevoInicio.getTime() === new Date(cita.inicio).getTime() &&
        targetProf.id === cita.profesional_id
      )
        return;

      if (
        cita.encadenadoId &&
        nuevoInicio.getTime() !== new Date(cita.inicio).getTime()
      ) {
        const confirmMsg =
          "Esta cita pertenece a un servicio encadenado. Si cambias su hora, puedes desincronizar la cadena. ¿Estás seguro de moverla?";
        if (!window.confirm(confirmMsg)) {
          return;
        }
      }

      const limFin = new Date(dateObj);
      limFin.setHours(HORARIO_CIERRE.horas, 0, 0, 0);
      if (nuevoFin > limFin) {
        setDragError("La cita excede el horario de cierre");
        setTimeout(() => setDragError(null), 2500);
        return;
      }

      const activo2Ms = cita.fin_espera
        ? new Date(cita.fin).getTime() - new Date(cita.fin_espera).getTime()
        : 0;

      // Verificar si choca con un bloqueo del profesional (descanso, vacaciones,
      // bajas, etc.). NO se bloquea: se avisa y el gestor decide si la coloca
      // igual (feedback del cliente: un descanso no debe impedir mover la cita).
      const bloqueoChoca = (rango: [Date, Date]) =>
        bloqueos.find(
          (b: any) =>
            b.profesional_id === targetProf.id &&
            new Date(b.inicio) < rango[1] &&
            new Date(b.fin) > rango[0],
        );
      const bloqueoB1 = bloqueoChoca([nuevoInicio, nuevoFinActiva]);
      const bloqueoB2 =
        activo2Ms > 0 ? bloqueoChoca([nuevoFinEspera, nuevoFin]) : undefined;

      if (bloqueoB1 || bloqueoB2) {
        // Aviso NO bloqueante: capturamos el bloqueo concreto (para decir si es
        // descanso, vacaciones...) y dejamos colocar la cita asumiendo el aviso.
        const bloqueo = bloqueoB1 || bloqueoB2;
        setDragAusencia({
          profNombre: targetProf.nombre,
          horaTxt: nuevoInicio.toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          motivo:
            bloqueo?.motivo || BLOQUEO_LABELS[bloqueo?.tipo] || "un bloqueo",
          payload: {
            inicio: nuevoInicio.toISOString(),
            fin: nuevoFin.toISOString(),
            fin_activa: cita.fin_activa ? nuevoFinActiva.toISOString() : null,
            fin_espera: cita.fin_espera ? nuevoFinEspera.toISOString() : null,
            profesional_id: targetProf.id,
          },
          citaOrig: cita,
        });
        return;
      }

      let c1 = isTimeSlotOccupied(
        nuevoInicio,
        nuevoFinActiva,
        currentCitas,
        targetProf.id,
        cita.id,
      );
      let c2 =
        activo2Ms > 0 &&
        isTimeSlotOccupied(
          nuevoFinEspera,
          nuevoFin,
          currentCitas,
          targetProf.id,
          cita.id,
        );

      // Si choca por solapamiento pero se solto cerca del inicio de un hueco libre donde la cita cabe perfectamente:
      if (c1 || c2) {
        const prevCita = currentCitas.find(
          (c: any) =>
            c.id !== cita.id &&
            c.profesional_id === targetProf.id &&
            c.estado !== "cancelada" &&
            new Date(c.fin).getTime() <=
              nuevoInicio.getTime() + 25 * 60 * 1000 &&
            new Date(c.fin).getTime() > nuevoInicio.getTime() - 45 * 60 * 1000,
        );
        if (prevCita) {
          const adjStart = new Date(prevCita.fin);
          const adjFinActiva = new Date(adjStart.getTime() + activaMs);
          const adjFinEspera = new Date(adjFinActiva.getTime() + esperaMs);
          const adjFin = new Date(adjStart.getTime() + durMs);
          const fitsCleanly =
            !isTimeSlotOccupied(
              adjStart,
              adjFinActiva,
              currentCitas,
              targetProf.id,
              cita.id,
            ) &&
            !(
              activo2Ms > 0 &&
              isTimeSlotOccupied(
                adjFinEspera,
                adjFin,
                currentCitas,
                targetProf.id,
                cita.id,
              )
            ) &&
            adjFin <= limFin;
          if (fitsCleanly) {
            nuevoInicio = adjStart;
            nuevoFinActiva = adjFinActiva;
            nuevoFinEspera = adjFinEspera;
            nuevoFin = adjFin;
            c1 = false;
            c2 = false;
          }
        }
      }

      // Encaje en reposo: si el conflicto es solo que la cita se pasa un poco del
      // reposo de OTRA cita (empieza dentro de su reposo pero su fase activa lo
      // rebasa), no bloqueamos: avisamos cuanto se pasa y dejamos asumir el riesgo.
      if (c1 || c2) {
        const reposoHost = currentCitas.find(
          (c: any) =>
            c.id !== cita.id &&
            c.profesional_id === targetProf.id &&
            c.fin_activa &&
            c.fin_espera &&
            nuevoInicio.getTime() >= new Date(c.fin_activa).getTime() &&
            nuevoInicio.getTime() < new Date(c.fin_espera).getTime(),
        );
        if (reposoHost) {
          const overflowMin = Math.ceil(
            (nuevoFinActiva.getTime() -
              new Date(reposoHost.fin_espera).getTime()) /
              60000,
          );
          if (overflowMin > 0) {
            // ¿El unico problema es rebasar el reposo del host? (sin el host, no hay otro solape)
            const citasSinHost = currentCitas.filter(
              (c: any) => c.id !== reposoHost.id,
            );
            const otro1 = isTimeSlotOccupied(
              nuevoInicio,
              nuevoFinActiva,
              citasSinHost,
              targetProf.id,
              cita.id,
            );
            const otro2 =
              activo2Ms > 0 &&
              isTimeSlotOccupied(
                nuevoFinEspera,
                nuevoFin,
                citasSinHost,
                targetProf.id,
                cita.id,
              );
            if (!otro1 && !otro2) {
              setDragRiesgo({
                overflowMin,
                hostNombre:
                  clienteMap?.get(reposoHost.cliente_id)?.nombre ||
                  "la otra cita",
                horaTxt: nuevoInicio.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                payload: {
                  inicio: nuevoInicio.toISOString(),
                  fin: nuevoFin.toISOString(),
                  fin_activa: cita.fin_activa
                    ? nuevoFinActiva.toISOString()
                    : null,
                  fin_espera: cita.fin_espera
                    ? nuevoFinEspera.toISOString()
                    : null,
                  profesional_id: targetProf.id,
                },
                citaOrig: cita,
              });
              return;
            }
          }
        }
      }

      if (c1 || c2) {
        // Anti-solape inteligente (Sesion 4): en vez de solo bloquear, busca el hueco valido
        // mas cercano en esa columna (respeta activa-sobre-reposo) y lo propone.
        const citaRet: CitaRetraso = {
          id: cita.id,
          inicio: nuevoInicio.toISOString(),
          fin: nuevoFin.toISOString(),
          fin_activa: cita.fin_activa ? nuevoFinActiva.toISOString() : null,
          fin_espera: cita.fin_espera ? nuevoFinEspera.toISOString() : null,
        };
        const destino: CitaRetraso[] = currentCitas
          .filter(
            (c: any) =>
              c.profesional_id === targetProf.id &&
              c.id !== cita.id &&
              (c.estado === "confirmada" ||
                c.estado === "pendiente" ||
                c.estado === "completada"),
          )
          .map((c: any) => ({
            id: c.id,
            inicio: c.inicio,
            fin: c.fin,
            fin_activa: c.fin_activa,
            fin_espera: c.fin_espera,
          }));
        const apertura = new Date(dateObj);
        apertura.setHours(
          HORARIO_APERTURA.horas,
          HORARIO_APERTURA.minutos,
          0,
          0,
        );
        const cierre = new Date(dateObj);
        cierre.setHours(HORARIO_CIERRE.horas, HORARIO_CIERRE.minutos, 0, 0);
        const altIso = mejorAlternativaSlot(
          citaRet,
          nuevoInicio.getTime(),
          destino,
          { aperturaMs: apertura.getTime(), cierreMs: cierre.getTime() },
        );
        if (altIso) {
          const altIni = new Date(altIso);
          const altFinActiva = new Date(altIni.getTime() + activaMs);
          const altFinEspera = new Date(altFinActiva.getTime() + esperaMs);
          const altFin = new Date(altIni.getTime() + durMs);
          setDragAlt({
            profNombre: targetProf.nombre,
            horaTxt: altIni.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            payload: {
              inicio: altIni.toISOString(),
              fin: altFin.toISOString(),
              fin_activa: cita.fin_activa ? altFinActiva.toISOString() : null,
              fin_espera: cita.fin_espera ? altFinEspera.toISOString() : null,
              profesional_id: targetProf.id,
            },
            citaOrig: cita,
          });
        } else {
          setDragError(
            "Conflicto: la fase activa se solapa con otra cita activa",
          );
          setTimeout(() => setDragError(null), 2500);
        }
        return;
      }

      const payload: any = {
        inicio: nuevoInicio.toISOString(),
        fin: nuevoFin.toISOString(),
        fin_activa: cita.fin_activa ? nuevoFinActiva.toISOString() : null,
        fin_espera: cita.fin_espera ? nuevoFinEspera.toISOString() : null,
        profesional_id: targetProf.id,
      };

      // Ultimo control contra la BD antes de guardar. Todo lo de arriba se ha
      // decidido con `currentCitas`, que es una FOTO local: si mientras se
      // arrastraba entro una cita en ese hueco (otro dispositivo, el portal
      // publico o el agente de WhatsApp), el array no se ha enterado y estariamos
      // colocando la cita encima de una real.
      const { data: choque } = await supabase
        .from("citas")
        .select("id, inicio, fin_activa, fin_espera, fin")
        .eq("profesional_id", targetProf.id)
        .in("estado", CITA_STATUS_BLOQUEAN_SOLAPE)
        .neq("id", cita.id)
        .lt("inicio", nuevoFin.toISOString())
        .gt("fin", nuevoInicio.toISOString());
      // Solo cuentan las fases ACTIVAS: caer dentro del reposo de otra cita es
      // justamente lo que se quiere permitir (citas encajadas).
      //
      // La comparacion la hace pisaOtraCitaAlSoltar, que delega en la regla de
      // la casa (citaSolapaOcupacion) igual que el control principal de mas
      // arriba. Aqui estuvo escrita a mano y decia algo distinto: se dejaba sin
      // mirar la SEGUNDA fase activa de la cita que se mueve, y con fin_espera
      // a NULL daba por libre la cola de la otra cita. Ver lib/agenda/solapeAlSoltar.ts.
      //
      // Las marcas de la candidata se construyen como las leera `fasesDe` de la
      // fila ya guardada: si la cita no tiene fin_activa/fin_espera, el payload
      // los guarda a null y entonces ocupa entera.
      const pisaOtraCita = pisaOtraCitaAlSoltar(
        {
          inicio: nuevoInicio,
          finActiva: cita.fin_activa ? nuevoFinActiva : nuevoFin,
          finEspera: cita.fin_espera
            ? nuevoFinEspera
            : cita.fin_activa
              ? nuevoFinActiva
              : nuevoFin,
          fin: nuevoFin,
        },
        choque,
        targetProf.id,
        cita.id,
      );
      if (pisaOtraCita) {
        setDragError(
          "Ese hueco lo acaba de ocupar otra cita. Se ha recargado la agenda.",
        );
        setTimeout(() => setDragError(null), 3500);
        triggerRefresh();
        return;
      }

      const { error } = await supabase
        .from("citas")
        .update(payload)
        .eq("id", cita.id);
      if (!error) {
        onCitaUpdated?.({ id: cita.id, ...payload });
        const profile = await getUserProfile();
        const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
        const cambios: { campo: string; anterior: string; nuevo: string }[] = [
          { campo: "inicio", anterior: cita.inicio, nuevo: payload.inicio },
          { campo: "fin", anterior: cita.fin, nuevo: payload.fin },
        ];
        if (targetProf.id !== cita.profesional_id) {
          cambios.push({
            campo: "profesional_id",
            anterior: cita.profesional_id,
            nuevo: targetProf.id,
          });
        }
        registrarHistorial(cita.id, nId, cambios, "Reagendado (drag & drop)");
        onMovimientoCita?.([
          {
            citaId: cita.id,
            antes: snapshotDe(cita),
            despues: snapshotDe({ ...cita, ...payload }),
          },
        ]);
      }
    };

    // Si el usuario desplaza la agenda mientras arrastra, el rect cacheado de
    // la rejilla queda viejo: se refresca aqui (y solo aqui, no por mousemove).
    const onScroll = () => {
      const d = dragRef.current;
      const grid = gridRef.current;
      if (!d || !grid) return;
      const gr = grid.getBoundingClientRect();
      const k = d.escala || 1;
      d.gridRect = {
        left: gr.left / k,
        top: gr.top / k,
        width: gr.width / k,
      };
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("mouseup", onUp);
      // El frame pendiente escribiria sobre un nodo ya desmontado.
      if (ghostFrameRef.current != null) {
        cancelAnimationFrame(ghostFrameRef.current);
        ghostFrameRef.current = null;
      }
    };
  }, [isDragging]);
  // ---- END DRAG & DROP ----

  const { citasWithLanes, citasByProf } = useMemo(() => {
    const result = citas.map((c: any) => ({ ...c }));
    const byProf: Record<string, any[]> = {};
    result.forEach((c: any) => {
      if (!byProf[c.profesional_id]) byProf[c.profesional_id] = [];
      byProf[c.profesional_id].push(c);
    });
    Object.values(byProf).forEach((profCitas: any[]) => {
      // Citas ANIDADAS: caben enteras dentro del reposo de otra cita del mismo
      // profesional (aprovechan el tiempo muerto). NO deben partir la columna en
      // dos carriles ("al lado"); se pintan ENCAJADAS dentro del reposo del host.
      // Una cita cuenta como anidada cuando SOLAPA con el reposo de otra, no
      // solo cuando empieza justo dentro. Antes bastaba con arrastrarla un
      // minuto por delante de fin_activa para que dejara de ser anidada, pasara
      // a ser una cita normal que choca con el host y el repartidor de carriles
      // partiera la columna: ese era el bug de "se me va a la derecha".
      // Se elige el host con el que MAS se solapa, por si hay varios reposos.
      profCitas.forEach((c: any) => {
        if (sinCarrilPropio(c.estado)) {
          c._nested = false;
          c._hostId = null;
          c._desbordaMin = 0;
          return;
        }
        const cIni = new Date(c.inicio).getTime();
        const cFin = new Date(c.fin).getTime();
        let mejor: any = null;
        let mejorSolape = 0;
        for (const h of profCitas) {
          if (h.id === c.id) continue;
          // Una cita cancelada o con no-show no tiene reposo que aprovechar:
          // su cliente no esta, asi que no puede alojar a nadie dentro.
          if (sinCarrilPropio(h.estado)) continue;
          if (!h.fin_activa || !h.fin_espera) continue;
          const rIni = new Date(h.fin_activa).getTime();
          const rFin = new Date(h.fin_espera).getTime();
          if (rFin <= rIni) continue;
          const solape = Math.min(cFin, rFin) - Math.max(cIni, rIni);
          if (solape <= 0) continue;
          // El grueso de la cita cae dentro del reposo (o empieza dentro de el).
          // Se anida visualmente dentro del host, aprovechando el hueco y sobresaliendo si dura mas.
          if (solape * 2 < cFin - cIni && (cIni < rIni || cIni >= rFin)) continue;
          if (solape > mejorSolape) {
            mejorSolape = solape;
            mejor = h;
          }
        }
        c._nested = !!mejor;
        c._hostId = mejor ? mejor.id : null;
        c._desbordaMin = mejor
          ? Math.max(
              0,
              Math.round((cFin - new Date(mejor.fin_espera).getTime()) / 60000),
            ) +
            Math.max(
              0,
              Math.round((new Date(mejor.fin_activa).getTime() - cIni) / 60000),
            )
          : 0;
      });

      // Lanes/solapes SOLO entre las citas normales (las anidadas van encima).
      //
      // Las canceladas y los no-shows quedan FUERA del reparto: no compiten por
      // espacio, porque su hueco esta libre de verdad. Si entraran, una cita
      // cancelada partiria la columna en dos y las citas vivas se pintarian
      // estrechas y "al lado" de un hueco que ya no existe. Normalmente ni se
      // ven (se ocultan al cancelar), pero el repartidor no debe depender de eso.
      const compitePorCarril = (c: any) =>
        !c._nested && !sinCarrilPropio(c.estado);
      const normales = profCitas.filter(compitePorCarril);
      // Ancho completo explicito para las que no reparten (el render usa
      // `?? 0` / `?? 1`, pero dejarlo escrito evita sorpresas si eso cambia).
      profCitas
        .filter((c: any) => !c._nested && !compitePorCarril(c))
        .forEach((c: any) => {
          c._lane = 0;
          c._totalLanes = 1;
        });
      normales.sort(
        (a: any, b: any) =>
          new Date(a.inicio).getTime() - new Date(b.inicio).getTime() ||
          new Date(b.fin).getTime() - new Date(a.fin).getTime(),
      );

      let currentColumns: any[][] = [];
      let lastEventEnding: number | null = null;
      let currentGroup: any[] = [];

      normales.forEach((cita: any) => {
        const start = new Date(cita.inicio).getTime();
        const end = new Date(cita.fin).getTime();

        if (lastEventEnding !== null && start >= lastEventEnding) {
          // Finish the current overlapping group
          currentGroup.forEach((ev: any) => {
            ev._totalLanes = currentColumns.length;
          });
          currentColumns = [];
          lastEventEnding = null;
          currentGroup = [];
        }

        let placed = false;
        for (let i = 0; i < currentColumns.length; i++) {
          const col = currentColumns[i];
          const lastInCol = col[col.length - 1];
          if (new Date(lastInCol.fin).getTime() <= start) {
            col.push(cita);
            cita._lane = i;
            placed = true;
            break;
          }
        }

        if (!placed) {
          cita._lane = currentColumns.length;
          currentColumns.push([cita]);
        }

        currentGroup.push(cita);
        if (lastEventEnding === null || end > lastEventEnding) {
          lastEventEnding = end;
        }
      });

      if (currentGroup.length > 0) {
        currentGroup.forEach((ev: any) => {
          ev._totalLanes = currentColumns.length;
        });
      }
      // Anidadas: sub-carriles POR HOST, para que varias citas en el mismo reposo
      // se repartan lado a lado (dentro del hueco) en vez de solaparse entre si.
      const porHost: Record<string, any[]> = {};
      profCitas
        .filter((c: any) => c._nested)
        .forEach((c: any) => {
          (porHost[c._hostId] ||= []).push(c);
        });
      Object.values(porHost).forEach((grupo: any[]) => {
        grupo.sort(
          (a: any, b: any) =>
            new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
        );
        const nlanes: any[][] = [];
        grupo.forEach((c: any) => {
          let placed = false;
          for (let i = 0; i < nlanes.length; i++) {
            if (
              new Date(nlanes[i][nlanes[i].length - 1].fin).getTime() <=
              new Date(c.inicio).getTime()
            ) {
              nlanes[i].push(c);
              c._nestedLane = i;
              placed = true;
              break;
            }
          }
          if (!placed) {
            nlanes.push([c]);
            c._nestedLane = nlanes.length - 1;
          }
        });
        grupo.forEach((c: any) => {
          c._lane = 0;
          c._totalLanes = 1;
          c._nestedTotal = nlanes.length;
        });
      });
    });
    const map = new Map<string, any[]>();
    Object.entries(byProf).forEach(([profId, arr]) => {
      map.set(profId, arr);
    });
    return { citasWithLanes: result, citasByProf: map };
  }, [citas]);

  // Horario general del salon y festivo del dia: no dependen del profesional,
  // asi que se calculan una vez para toda la rejilla en vez de una vez por
  // cada columna (antes se repetia el mismo `.find()` por profesional).
  // dia_semana en negocio_horarios usa 0=LUNES (a diferencia de
  // horarios_profesional, 0=DOMINGO): hay que convertir el getDay() de JS.
  const { horarioSalonHoy, festivoHoy, salonCerradoTodoElDia } = useMemo(() => {
    const dbDiaNegocio = (selectedDateObj.getDay() + 6) % 7;
    const hSalon = (horarios as any[]).find(
      (h: any) => h.dia_semana === dbDiaNegocio,
    );
    const keyFecha = `${selectedDateObj.getFullYear()}-${String(selectedDateObj.getMonth() + 1).padStart(2, "0")}-${String(selectedDateObj.getDate()).padStart(2, "0")}`;
    const fest =
      (cierres as any[]).find((c: any) => c.fecha === keyFecha) || null;
    return {
      horarioSalonHoy: hSalon,
      festivoHoy: fest,
      salonCerradoTodoElDia: (!!hSalon && hSalon.abierto === false) || !!fest,
    };
  }, [horarios, cierres, selectedDateObj]);

  return (
    <>
      <div
        ref={lienzoRef}
        style={{
          // Lienzo blanco ELEVADO: destaca claramente sobre el lienzo crema de la app
          // (sombra + borde) y la marca se nota en cabecera/líneas, sin verse "dorado".
          background: "#ffffff",
          border: `1px solid ${TOKENS.borderHi}`,
          borderRadius: 16,
          // Scroll lateral automático: las columnas mantienen un ancho mínimo
          // cómodo (MIN_COL_W) y solo aparece scroll horizontal cuando no caben.
          // Antes esto dependía de `agendaFit` (modo "Juntos"), pero el toggle
          // ya no existe y el estado quedaba siempre en true, con overflow
          // oculto => las citas se aplastaban con muchos profesionales.
          overflowX: "auto",
          width: "100%",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Profesionales de vacaciones hoy: sin columna, pero visibles como
            avatares inactivos para que se sepa que no trabajan. */}
        {profsVacaciones.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "8px 12px",
              borderBottom: `1px dashed ${TOKENS.border}`,
              background: "#fafaf8",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: TOKENS.textSec,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              De vacaciones
            </span>
            {profsVacaciones.map((p: any) => (
              <span
                key={p.id}
                title={`${p.nombre} — de vacaciones (sin columna hoy)`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 10px 3px 4px",
                  borderRadius: 99,
                  background: "#f1efec",
                  border: `1px solid ${TOKENS.border}`,
                  opacity: 0.65,
                }}
              >
                {p.foto_perfil ? (
                  <img
                    src={p.foto_perfil}
                    alt={p.nombre}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      objectFit: "cover",
                      filter: "grayscale(1)",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      background: "#c9c4bd",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {p.nombre.charAt(0).toUpperCase()}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: TOKENS.textSec,
                    textDecoration: "line-through",
                  }}
                >
                  {p.nombre.split(" ")[0]}
                </span>
              </span>
            ))}
          </div>
        )}
        <div
          // El aura fuego recorre el perimetro cada 7s (lib/motion.tsx). Es el
          // gesto que separa "producto con IA detras" de "tabla de cuaderno";
          // por eso el borde fijo se queda en el tono suave y el que llama la
          // atencion es el halo.
          className="m-agenda-aura"
          style={{
            // Ancho mínimo del lienzo: N columnas * MIN_COL_W + columna de
            // horas (56px). Garantiza que la cita nunca se deforme.
            minWidth: `${(profesionales.length || 1) * MIN_COL_W + 56}px`,
            position: "relative",
            borderRadius: 16,
            border: `1px solid ${TOKENS.border}`,
            boxShadow: "0 6px 24px rgba(40,30,24,0.07)",
            background: "#ffffff",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `56px repeat(${profesionales.length || 1}, minmax(${MIN_COL_W}px, 1fr))`,
              borderBottom: `1px solid ${TOKENS.borderHi}`,
              background: "#ffffff",
            }}
          >
            <div
              style={{
                position: "sticky",
                left: 0,
                zIndex: 50,
                background: "#ffffff",
              }}
            />
            {profesionales.map((p: any, idx: number) => {
              const pColor = p.color || TOKENS.primary;
              return (
                <div
                  key={p.id}
                  title={onReorderProfs ? `${p.nombre} — cambia el numerito para mover su posición` : p.nombre}
                  style={{
                    padding: "12px 14px",
                    borderLeft: `1px solid ${TOKENS.border}`,
                    borderTop: `2px solid ${pColor}`,
                    background: `linear-gradient(180deg, ${hexToRgba(pColor, 0.06)} 0%, ${hexToRgba(pColor, 0.012)} 65%, rgba(255,255,255,0.95) 100%)`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "background 0.25s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      `linear-gradient(180deg, ${hexToRgba(pColor, 0.12)} 0%, ${hexToRgba(pColor, 0.03)} 65%, rgba(255,255,255,0.98) 100%)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      `linear-gradient(180deg, ${hexToRgba(pColor, 0.06)} 0%, ${hexToRgba(pColor, 0.012)} 65%, rgba(255,255,255,0.95) 100%)`;
                  }}
                >
                {p.foto_perfil ? (
                  <img
                    src={p.foto_perfil}
                    alt={p.nombre}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      objectFit: "cover",
                      boxShadow: `0 0 0 2px ${p.color}`,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      background: p.color,
                      boxShadow: `0 0 0 2px ${p.color}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {p.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: TOKENS.text,
                    // Sin esto, un nombre largo + el numerito de posicion
                    // desbordaban la cabecera y se SOLAPABAN con la columna
                    // vecina en cuanto la rejilla se quedaba estrecha.
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {(() => {
                    const parts = p.nombre.split(" ");
                    const isDupe =
                      profesionales.filter(
                        (x: any) => x.nombre.split(" ")[0] === parts[0],
                      ).length > 1;
                    if (isDupe && parts[1])
                      return `${parts[0]} ${parts[1].charAt(0)}.`;
                    if (isDupe && p.rol)
                      return `${parts[0]} (${p.rol.split(" ")[0]})`;
                    return parts[0];
                  })()}
                </div>
                {/* §2.3 Mecha: contador de carga — N citas · X% ocupada */}
                {(() => {
                  const pc = (citasByProf.get(p.id) || []).filter(
                    (c: any) => c.estado !== CITA_STATUS.CANCELADA,
                  );
                  if (!pc.length) return null;
                  const occ = Math.min(
                    100,
                    Math.round(
                      (pc.reduce(
                        (s: number, c: any) =>
                          s +
                          (new Date(c.fin).getTime() -
                            new Date(c.inicio).getTime()) /
                            60000,
                        0,
                      ) /
                        (HOURS.length * 60)) *
                        100,
                    ),
                  );
                  return (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: TOKENS.primaryHi,
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                        opacity: 0.9,
                      }}
                    >
                      {pc.length} {pc.length === 1 ? "cita" : "citas"} · {occ}%
                    </span>
                  );
                })()}
                {/* Posicion de la columna: escribe 1 y pasa a ser la primera. */}
                {onReorderProfs && (
                  <input
                    key={`${p.id}:${idx}`}
                    type="number"
                    min={1}
                    max={profesionales.length}
                    defaultValue={idx + 1}
                    title="Posición en la agenda (1 = primera columna)"
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) fijarPosProf(p.id, v);
                      e.target.value = String(
                        profesionales.findIndex((x: any) => x.id === p.id) + 1,
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    style={{
                      width: 30,
                      padding: "2px 2px",
                      textAlign: "center",
                      background: "#fafaf8",
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 6,
                      color: TOKENS.textSec,
                      fontSize: 11,
                      fontWeight: 700,
                      boxSizing: "border-box",
                      cursor: "pointer",
                      flexShrink: 0,
                      appearance: "textfield",
                      MozAppearance: "textfield",
                    }}
                  />
                )}
              </div>
            );
          })}
          </div>
          <div
            ref={gridRef}
            style={{
              position: "relative",
              height: HOURS.length * ROW_H,
              cursor: isDragging ? "grabbing" : "default",
            }}
          >
            {/* Fondo degradado suave IA por columna de profesional con movimiento ultra lento */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 56,
                right: 0,
                bottom: 0,
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(1, profesionales.length)}, 1fr)`,
                pointerEvents: "none",
                zIndex: 0,
                overflow: "hidden",
                opacity: salonCerradoTodoElDia ? 0.35 : 1,
                transition: "opacity 0.3s ease",
              }}
            >
              {profesionales.map((p: any, idx: number) => {
                const profColor = p.color || TOKENS.primary;
                const dur = 28 + (idx % 4) * 4;
                const delay = idx * -5.5;

                const glowGrad = `
                  radial-gradient(ellipse 130% 45% at 20% 4%, ${hexToRgba(profColor, 0.12)} 0%, ${hexToRgba(profColor, 0.04)} 45%, transparent 75%),
                  radial-gradient(ellipse 110% 50% at 85% 45%, ${hexToRgba(profColor, 0.10)} 0%, ${hexToRgba(profColor, 0.03)} 50%, transparent 72%),
                  radial-gradient(ellipse 120% 50% at 25% 85%, ${hexToRgba(profColor, 0.09)} 0%, ${hexToRgba(profColor, 0.025)} 55%, transparent 75%),
                  radial-gradient(circle at 50% 25%, rgba(255, 246, 238, 0.4) 0%, transparent 60%),
                  linear-gradient(180deg, ${hexToRgba(profColor, 0.05)} 0%, ${hexToRgba(profColor, 0.012)} 28%, ${hexToRgba(profColor, 0.035)} 68%, transparent 100%)
                `.trim();

                const beamGrad = `
                  radial-gradient(ellipse 90% 45% at 50% 30%, ${hexToRgba(profColor, 0.09)} 0%, transparent 70%),
                  radial-gradient(circle at 50% 20%, rgba(255, 245, 235, 0.4) 0%, transparent 60%)
                `.trim();

                return (
                  <div
                    key={`ia-bg-${p.id}`}
                    className="ia-prof-col-track"
                    style={{
                      borderLeft: idx > 0 ? "1px solid rgba(40,30,24,0.04)" : "none",
                    }}
                  >
                    <div
                      className="ia-prof-col-glow"
                      style={{
                        backgroundImage: glowGrad,
                        ["--ia-dur" as any]: `${dur}s`,
                        ["--ia-delay" as any]: `${delay}s`,
                      }}
                    />
                    <div
                      className="ia-prof-col-beam"
                      style={{
                        backgroundImage: beamGrad,
                        ["--ia-dur" as any]: `${dur}s`,
                        ["--ia-delay" as any]: `${delay}s`,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* §5 Mecha: línea de flujo única por cadena (debajo de los
                bloques, zIndex 2 vs 3 del contenedor de citas) */}
            <ChainFlowOverlay
              citas={citasWithLanes || []}
              profesionales={profesionales}
              START_H={START_H}
              ROW_H={ROW_H}
              height={HOURS.length * ROW_H}
            />
            <TimelineNowIndicator
              selectedDate={selectedDateObj}
              startHour={START_H}
              rowHeight={ROW_H}
              totalHours={HOURS.length}
            />
            {dropSlot &&
              drag &&
              (() => {
                const dropProf = profesionales[dropSlot.profIndex];
                const dropColor = dropProf?.color || TOKENS.primary;
                const dropTop = (dropSlot.minutesFromStart / 60) * ROW_H;
                // La previa tiene que caer EXACTAMENTE donde va a quedar la
                // cita, no aproximadamente: la tarjeta arranca a 4px del borde
                // de la columna (y a 4 + CHAIN_GUTTER si es un eslabon de una
                // cadena, porque deja carril al riel). Sin esos dos sumandos la
                // previa iba corrida y daba la sensacion de que no encaja.
                const dragEnCadena =
                  estaEnCadenaVisible(
                    drag.cita.grupo_id,
                    (citasWithLanes || []) as any,
                    (e) => e === CITA_STATUS.CANCELADA,
                  );
                const dropInset = 4 + (dragEnCadena ? CHAIN_GUTTER : 0);
                const dropLeft =
                  56 + dropSlot.profIndex * dropSlot.colW + dropInset;
                const dropH = drag.blockHeight;
                // Si el punto de suelta cae dentro del REPOSO de otra cita, resaltamos ese
                // hueco con fuerza (aprovechar tiempo muerto) e indicamos si la cita cabe.
                const dayStart = new Date(selectedDateObj);
                dayStart.setHours(START_H, 0, 0, 0);
                const dropStartMs =
                  dayStart.getTime() + dropSlot.minutesFromStart * 60000;
                const dragActivaMs = drag.cita.fin_activa
                  ? new Date(drag.cita.fin_activa).getTime() -
                    new Date(drag.cita.inicio).getTime()
                  : new Date(drag.cita.fin).getTime() -
                    new Date(drag.cita.inicio).getTime();
                const host = dropProf
                  ? citas.find(
                      (c: any) =>
                        c.id !== drag.cita.id &&
                        c.profesional_id === dropProf.id &&
                        c.fin_activa &&
                        c.fin_espera &&
                        dropStartMs >= new Date(c.fin_activa).getTime() &&
                        dropStartMs < new Date(c.fin_espera).getTime(),
                    )
                  : null;
                let hostBand = null;
                let finalLeft = dropLeft;
                let finalWidth = dropSlot.colW - 8 - (dragEnCadena ? CHAIN_GUTTER : 0);

                if (host) {
                  // Find host's lane and totalLanes
                  const hostLane = host._lane ?? 0;
                  const hostTotalLanes = host._totalLanes ?? 1;

                  // Host bounds in percent of the column
                  const hostL = (hostLane / hostTotalLanes) * dropSlot.colW;
                  const hostW = dropSlot.colW / hostTotalLanes;

                  // Nested bounds inside the host (insets simetricos, igual que el render real)
                  const NEST_INSET_L = 6,
                    NEST_INSET_R = 6;
                  const nLane = 0; // assume first lane for preview
                  const nTotal = 1; // assume 1 total nested for preview
                  const nArea = 100 - NEST_INSET_L - NEST_INSET_R;
                  const nW = nArea / nTotal;

                  const nestL =
                    hostL + ((NEST_INSET_L + nLane * nW) * hostW) / 100;
                  const nestW = (hostW * nArea) / 100 / nTotal;

                  // La cita encajada real va a `calc(nestL% + 2px)` por cada
                  // lado, o sea 2px de margen y 4px menos de ancho.
                  finalLeft =
                    56 + dropSlot.profIndex * dropSlot.colW + nestL + 2;
                  finalWidth = nestW - 4;

                  const hostRepTop =
                    ((new Date(host.fin_activa).getTime() -
                      dayStart.getTime()) /
                      3600000) *
                    ROW_H;
                  const hostRepH =
                    ((new Date(host.fin_espera).getTime() -
                      new Date(host.fin_activa).getTime()) /
                      3600000) *
                    ROW_H;
                  const overflowMin = Math.ceil(
                    (dropStartMs +
                      dragActivaMs -
                      new Date(host.fin_espera).getTime()) /
                      60000,
                  );
                  const cabe = overflowMin <= 0;
                  const bandColor = cabe ? "#0f9d6b" : "#e08a00";
                  hostBand = (
                    <div
                      style={{
                        position: "absolute",
                        top: hostRepTop,
                        left: 56 + dropSlot.profIndex * dropSlot.colW + hostL,
                        width: hostW - 8,
                        height: Math.max(16, hostRepH),
                        borderRadius: 8,
                        pointerEvents: "none",
                        // Por encima de los bloques de cita (zIndex 10/15):
                        // antes iba a 5 y el aviso quedaba tapado.
                        zIndex: 9997,
                        transition: "top 0.09s ease, left 0.09s ease",
                        background: `${bandColor}1a`,
                        border: `2px dashed ${bandColor}`,
                        boxShadow: `0 0 12px ${bandColor}33`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          color: bandColor,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          textAlign: "center",
                          padding: "0 6px",
                        }}
                      >
                        {cabe ? "Aprovecha" : `Excede ${overflowMin} min`}
                      </span>
                    </div>
                  );
                }
                return (
                  <>
                    {hostBand}
                    <div
                      style={{
                        position: "absolute",
                        top: dropTop,
                        left: finalLeft,
                        width: finalWidth,
                        height: dropH,
                        borderRadius: 12,
                        border: `2px dashed ${dropColor}`,
                        backgroundColor: `${dropColor}10`,
                        zIndex: 9998,
                        // La previa se desliza entre snaps en vez de tele-
                        // transportarse cada 5-15 min de recorrido.
                        transition: "top 0.09s ease, left 0.09s ease, width 0.09s ease",
                        pointerEvents: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: dropColor,
                          background: "rgba(255,255,255,0.8)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {String(
                          START_H + Math.floor(dropSlot.minutesFromStart / 60),
                        ).padStart(2, "0")}
                        :
                        {String(dropSlot.minutesFromStart % 60).padStart(
                          2,
                          "0",
                        )}
                      </span>
                    </div>
                  </>
                );
              })()}
            {HOURS.map((h, idx) => (
              <div
                key={h}
                style={{
                  display: "grid",
                  gridTemplateColumns: `56px repeat(${profesionales.length || 1}, minmax(${MIN_COL_W}px, 1fr))`,
                  borderBottom: `1px solid rgba(40,30,24,0.045)`,
                  height: ROW_H,
                  boxSizing: "border-box",
                  background: "transparent",
                }}
              >
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 50,
                    background: idx % 2 === 0 ? "#ffffff" : "#fdfaf6",
                    borderRight: `1px solid rgba(40,30,24,0.06)`,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      left: 0,
                      right: 7,
                      textAlign: "right",
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: TOKENS.textSec,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: -0.2,
                    }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                  {[15, 30, 45].map((mm) => (
                    <div
                      key={mm}
                      style={{
                        position: "absolute",
                        top: (mm / 60) * ROW_H,
                        left: 0,
                        right: 0,
                        height: 0,
                      }}
                    >
                      <div
                        style={{
                          // Las lineas de cuarto de hora estan para orientar,
                          // no para dibujar una cuadricula: al 40% de lo que
                          // eran siguen guiando el ojo sin pautar la hoja.
                          borderTop:
                            mm === 30
                              ? `1px solid rgba(40,30,24,0.026)`
                              : `1px solid rgba(40,30,24,0.013)`,
                          marginLeft: 24,
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          top: -6,
                          right: 7,
                          fontSize: 9,
                          fontWeight: 600,
                          color: TOKENS.textTer,
                          fontVariantNumeric: "tabular-nums",
                          pointerEvents: "none",
                          opacity: mm === 30 ? 1 : 0,
                        }}
                      >
                        {String(h).padStart(2, "0")}:{mm}
                      </span>
                    </div>
                  ))}
                </div>
                {profesionales.map((p: any) => {
                  const profColor = p.color || TOKENS.primary;
                  return (
                    <div
                      key={`${h}-${p.id}`}
                      style={{
                        // La separacion entre profesionales ya la da la cabecera:
                        // aqui basta una linea de pelo.
                        borderLeft: `1px solid rgba(40,30,24,0.07)`,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {[0, 15, 30, 45].map((minute) => {
                        const horaSlot = `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
                        return (
                          <div
                            key={minute}
                            onClick={() => {
                              if (onCreateSlot)
                                onCreateSlot({ hora: horaSlot, profId: p.id });
                            }}
                            onTouchStart={(e) => {
                              const touch = e.touches[0];
                              e.currentTarget.dataset.startX = String(
                                touch.clientX,
                              );
                              e.currentTarget.dataset.startY = String(
                                touch.clientY,
                              );
                              e.currentTarget.dataset.startTime = String(
                                Date.now(),
                              );
                            }}
                            onTouchEnd={(e) => {
                              const startX = parseFloat(
                                e.currentTarget.dataset.startX || "0",
                              );
                              const startY = parseFloat(
                                e.currentTarget.dataset.startY || "0",
                              );
                              const startTime = parseFloat(
                                e.currentTarget.dataset.startTime || "0",
                              );
                              const touch = e.changedTouches[0];
                              if (touch) {
                                const diffX = Math.abs(touch.clientX - startX);
                                const diffY = Math.abs(touch.clientY - startY);
                                const diffTime = Date.now() - startTime;
                                if (diffX < 10 && diffY < 10 && diffTime < 300) {
                                  e.preventDefault();
                                  if (onCreateSlot)
                                    onCreateSlot({
                                      hora: horaSlot,
                                      profId: p.id,
                                    });
                                }
                              }
                            }}
                            title={`Crear cita a las ${horaSlot}`}
                            style={{
                              flex: 1,
                              borderTop:
                                minute !== 0
                                  ? minute === 30
                                    ? `1.5px dashed rgba(40,30,24,0.14)`
                                    : `1px dashed rgba(40,30,24,0.06)`
                                  : "none",
                              cursor: onCreateSlot ? "pointer" : "default",
                              transition: "background-color 0.12s ease",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              padding: "0 7px",
                            }}
                            onMouseEnter={(e) => {
                              if (!onCreateSlot) return;
                              e.currentTarget.style.backgroundColor =
                                hexToRgba(profColor, 0.12);
                              const lbl = e.currentTarget.querySelector(
                                "span",
                              ) as HTMLElement | null;
                              if (lbl) lbl.style.opacity = "1";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                              const lbl = e.currentTarget.querySelector(
                                "span",
                              ) as HTMLElement | null;
                              if (lbl) lbl.style.opacity = "0";
                            }}
                          >
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                color: profColor,
                                opacity: 0,
                                transition: "opacity 0.12s ease",
                                pointerEvents: "none",
                              }}
                            >
                              {horaSlot}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 56,
                right: 0,
                height: HOURS.length * ROW_H,
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(1, profesionales.length)}, 1fr)`,
                pointerEvents: "none",
                zIndex: 3,
              }}
            >
              {profesionales.map((prof: any) => {
                const profColor = prof.color || TOKENS.primary;
                const profCitas = citasByProf.get(prof.id) || [];
                return (
                  <DayTimelineProfessionalColumn
                    key={prof.id}
                    prof={prof}
                    profColor={profColor}
                    profCitas={profCitas}
                    citasWithLanes={citasWithLanes}
                    selectedDateObj={selectedDateObj}
                    START_H={START_H}
                    ROW_H={ROW_H}
                    horariosProf={horariosProf}
                    horarioSalonHoy={horarioSalonHoy}
                    festivoHoy={festivoHoy}
                    salonCerradoTodoElDia={salonCerradoTodoElDia}
                    bloqueos={bloqueos}
                    clienteMap={clienteMap}
                    servicioMap={servicioMap}
                    categorias={categorias}
                    citaAddonsMap={citaAddonsMap}
                    propuestaPorCitaId={propuestaPorCitaId}
                    isDragging={isDragging}
                    dragCitaId={drag?.cita?.id}
                    profesionalesLength={profesionales?.length || 1}
                    completarManual={completarManual}
                    clientes={clientes}
                    startDrag={startDrag}
                    toggleCompletada={toggleCompletada}
                    onCreateSlot={onCreateSlot}
                    onClienteHistorial={onClienteHistorial}
                    zonasResaltadas={zonasResaltadas}
                    profesionales={profesionales}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Ghost element — sigue al cursor durante el arrastre.
          Se ancla en 0,0 y se desplaza por transform: el movimiento lo escribe
          onMove directamente sobre este nodo (via ghostRef + rAF), sin pasar
          por React. Por eso `drag` ya no cambia durante el arrastre. */}
      {drag && (
        <div
          // El transform NO puede vivir en el style de React: cualquier
          // re-render (p.ej. al cambiar el slot de suelta) lo repintaria con la
          // posicion INICIAL y el fantasma daba un salto atras. Se escribe
          // siempre desde ghostPosRef: aqui al montar/re-montar la ref, y en
          // cada frame desde onMove.
          ref={(n) => {
            ghostRef.current = n;
            if (n) {
              const { x, y } = ghostPosRef.current;
              n.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.02)`;
            }
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            willChange: "transform",
            width: drag.blockWidth,
            height: drag.blockHeight,
            pointerEvents: "none",
            zIndex: 9999,
            background: `linear-gradient(180deg, ${profesionales.find((p: any) => p.id === drag.cita.profesional_id)?.color || TOKENS.primary}50, ${profesionales.find((p: any) => p.id === drag.cita.profesional_id)?.color || TOKENS.primary}30)`,
            border: `2px solid ${profesionales.find((p: any) => p.id === drag.cita.profesional_id)?.color || TOKENS.primary}`,
            borderLeft: `4px solid ${profesionales.find((p: any) => p.id === drag.cita.profesional_id)?.color || TOKENS.primary}`,
            borderRadius: 8,
            padding: "5px 8px",
            boxShadow: `0 12px 32px rgba(0,0,0,0.4)`,
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 10, color: TOKENS.textTer, fontWeight: 600 }}>
            {String(new Date(drag.cita.inicio).getHours()).padStart(2, "0")}:
            {String(new Date(drag.cita.inicio).getMinutes()).padStart(2, "0")}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: TOKENS.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {clienteMap?.get(drag.cita.cliente_id)?.nombre || "-"}
          </div>
        </div>
      )}

      {/* Toast de error al soltar en posicion invalida */}
      {dragError && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(226,59,52,0.95)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(226,59,52,0.4)",
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          {dragError}
        </div>
      )}

      {/* Anti-solape inteligente: propuesta del hueco valido mas cercano al soltar en conflicto */}
      {dragAlt && (
        <div
          onClick={() => !aplicandoAlt && setDragAlt(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(8,6,4,0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              background: TOKENS.bgPanel,
              border: `1px solid ${TOKENS.borderHi}`,
              borderRadius: 18,
              padding: 22,
              boxShadow: "0 24px 60px rgba(40,30,24,0.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: TOKENS.warningSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                dangerouslySetInnerHTML={{
                  __html: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${TOKENS.warning}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
                }}
              />
              <div
                style={{ fontSize: 15.5, fontWeight: 800, color: TOKENS.text }}
              >
                Ahi no cabe
              </div>
            </div>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 13,
                color: TOKENS.textSec,
                lineHeight: 1.5,
              }}
            >
              Esa hora se solapa con otra cita activa. El hueco valido mas
              cercano en {dragAlt.profNombre?.split(" ")[0]} es las{" "}
              <b style={{ color: TOKENS.primaryHi }}>{dragAlt.horaTxt}</b>. ¿La
              muevo ahi?
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDragAlt(null)}
                disabled={aplicandoAlt}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  border: `1.5px solid ${TOKENS.border}`,
                  background: TOKENS.bgCard,
                  color: TOKENS.textSec,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                disabled={aplicandoAlt}
                onClick={async () => {
                  const alt = dragAlt;
                  setAplicandoAlt(true);
                  try {
                    const { error } = await supabase
                      .from("citas")
                      .update(alt.payload)
                      .eq("id", alt.citaOrig.id);
                    if (!error) {
                      onCitaUpdated?.({ id: alt.citaOrig.id, ...alt.payload });
                      const profile = await getUserProfile();
                      const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
                      const cambios = [
                        {
                          campo: "inicio",
                          anterior: alt.citaOrig.inicio,
                          nuevo: alt.payload.inicio,
                        },
                        {
                          campo: "fin",
                          anterior: alt.citaOrig.fin,
                          nuevo: alt.payload.fin,
                        },
                      ];
                      if (
                        alt.payload.profesional_id !==
                        alt.citaOrig.profesional_id
                      ) {
                        cambios.push({
                          campo: "profesional_id",
                          anterior: alt.citaOrig.profesional_id,
                          nuevo: alt.payload.profesional_id,
                        });
                      }
                      registrarHistorial(
                        alt.citaOrig.id,
                        nId,
                        cambios,
                        "Reagendado (anti-solape sugerido)",
                      );
                    }
                    setDragAlt(null);
                  } finally {
                    setAplicandoAlt(false);
                  }
                }}
                style={{
                  flex: 1.6,
                  padding: "12px",
                  borderRadius: 12,
                  border: "none",
                  background: TOKENS.fireGradient,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: aplicandoAlt ? "default" : "pointer",
                  opacity: aplicandoAlt ? 0.7 : 1,
                }}
              >
                {aplicandoAlt ? "Moviendo…" : `Mover a las ${dragAlt.horaTxt}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Encaje en reposo que se pasa por poco: avisar y dejar asumir el riesgo. */}
      {dragRiesgo && (
        <div
          onClick={() => !aplicandoRiesgo && setDragRiesgo(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(8,6,4,0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 400,
              background: TOKENS.bgPanel,
              border: `1px solid ${TOKENS.borderHi}`,
              borderRadius: 18,
              padding: 22,
              boxShadow: "0 24px 60px rgba(40,30,24,0.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 8,
              }}
            >
              <ChispaMascota size={30} mood="think" />
              <div
                style={{ fontSize: 15.5, fontWeight: 800, color: TOKENS.text }}
              >
                Chispa te avisa: no cabe del todo
              </div>
            </div>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 13,
                color: TOKENS.textSec,
                lineHeight: 1.5,
              }}
            >
              A las{" "}
              <b style={{ color: TOKENS.primaryHi }}>{dragRiesgo.horaTxt}</b>{" "}
              esta cita aprovecha el reposo de{" "}
              {dragRiesgo.hostNombre?.split(" ")[0]}, pero su parte activa se
              pasa{" "}
              <b style={{ color: "#b26a00" }}>{dragRiesgo.overflowMin} min</b>{" "}
              del tiempo de reposo. Puedes colocarla igual y asumir el riesgo de
              ir algo justo.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDragRiesgo(null)}
                disabled={aplicandoRiesgo}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  border: `1.5px solid ${TOKENS.border}`,
                  background: TOKENS.bgCard,
                  color: TOKENS.textSec,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                disabled={aplicandoRiesgo}
                onClick={async () => {
                  const r = dragRiesgo;
                  setAplicandoRiesgo(true);
                  try {
                    const { error } = await supabase
                      .from("citas")
                      .update(r.payload)
                      .eq("id", r.citaOrig.id);
                    if (!error) {
                      onCitaUpdated?.({ id: r.citaOrig.id, ...r.payload });
                      const profile = await getUserProfile();
                      const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
                      const cambios = [
                        {
                          campo: "inicio",
                          anterior: r.citaOrig.inicio,
                          nuevo: r.payload.inicio,
                        },
                        {
                          campo: "fin",
                          anterior: r.citaOrig.fin,
                          nuevo: r.payload.fin,
                        },
                      ];
                      if (
                        r.payload.profesional_id !== r.citaOrig.profesional_id
                      ) {
                        cambios.push({
                          campo: "profesional_id",
                          anterior: r.citaOrig.profesional_id,
                          nuevo: r.payload.profesional_id,
                        });
                      }
                      registrarHistorial(
                        r.citaOrig.id,
                        nId,
                        cambios,
                        `Encajada en reposo (se pasa ${r.overflowMin} min, riesgo asumido)`,
                      );
                    }
                    setDragRiesgo(null);
                  } finally {
                    setAplicandoRiesgo(false);
                  }
                }}
                style={{
                  flex: 1.6,
                  padding: "12px",
                  borderRadius: 12,
                  border: "none",
                  background: TOKENS.fireGradient,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: aplicandoRiesgo ? "default" : "pointer",
                  opacity: aplicandoRiesgo ? 0.7 : 1,
                }}
              >
                {aplicandoRiesgo ? "Colocando…" : "Colocar igualmente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dragAusencia && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(8,6,4,0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            className="m-bounce-in"
            style={{
              background: TOKENS.bgPanel,
              borderRadius: 18,
              width: 340,
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              border: `1px solid ${TOKENS.borderHi}`,
            }}
          >
            <div
              style={{
                background: "#fffbeb",
                padding: "18px 24px",
                borderBottom: `1px solid #fef3c7`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b26a00",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div
                  style={{
                    fontSize: 15.5,
                    fontWeight: 800,
                    color: "#b26a00",
                  }}
                >
                  Esa franja tiene {dragAusencia.motivo.toLowerCase()}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: 24,
                fontSize: 13.5,
                color: TOKENS.textSec,
                lineHeight: 1.5,
              }}
            >
              A las <b style={{ color: TOKENS.text }}>{dragAusencia.horaTxt}</b>{" "}
              {dragAusencia.profNombre?.split(" ")[0]} tiene{" "}
              <b>{dragAusencia.motivo.toLowerCase()}</b>. Es solo un aviso: si
              quieres, colocas la cita ahí igualmente.
            </div>
            <div
              style={{
                padding: "16px 24px",
                background: TOKENS.bgCard,
                borderTop: `1px solid ${TOKENS.border}`,
                display: "flex",
                gap: 10,
              }}
            >
              <button
                onClick={() => !aplicandoAusencia && setDragAusencia(null)}
                disabled={aplicandoAusencia}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  border: `1.5px solid ${TOKENS.border}`,
                  background: TOKENS.bgCard,
                  color: TOKENS.textSec,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: aplicandoAusencia ? "default" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                disabled={aplicandoAusencia}
                onClick={async () => {
                  const a = dragAusencia;
                  setAplicandoAusencia(true);
                  try {
                    const { error } = await supabase
                      .from("citas")
                      .update(a.payload)
                      .eq("id", a.citaOrig.id);
                    if (!error) {
                      onCitaUpdated?.({ id: a.citaOrig.id, ...a.payload });
                      onMovimientoCita?.([
                        {
                          citaId: a.citaOrig.id,
                          antes: snapshotDe(a.citaOrig),
                          despues: snapshotDe({ ...a.citaOrig, ...a.payload }),
                        },
                      ]);
                      const profile = await getUserProfile();
                      const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
                      const cambios: { campo: string; anterior: string; nuevo: string }[] = [
                        { campo: "inicio", anterior: a.citaOrig.inicio, nuevo: a.payload.inicio },
                        { campo: "fin", anterior: a.citaOrig.fin, nuevo: a.payload.fin },
                      ];
                      if (a.payload.profesional_id !== a.citaOrig.profesional_id) {
                        cambios.push({
                          campo: "profesional_id",
                          anterior: a.citaOrig.profesional_id,
                          nuevo: a.payload.profesional_id,
                        });
                      }
                      registrarHistorial(
                        a.citaOrig.id,
                        nId,
                        cambios,
                        `Reagendado sobre ${a.motivo} (drag & drop, aviso aceptado)`,
                      );
                    }
                    setDragAusencia(null);
                  } finally {
                    setAplicandoAusencia(false);
                  }
                }}
                style={{
                  flex: 1.6,
                  padding: "12px",
                  borderRadius: 12,
                  border: "none",
                  background: TOKENS.fireGradient,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: aplicandoAusencia ? "default" : "pointer",
                  opacity: aplicandoAusencia ? 0.7 : 1,
                }}
              >
                {aplicandoAusencia ? "Colocando…" : "Mover igualmente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CitaEstadoBadge({ estado }: { estado: string }) {
  const m = metaEstadoCita(estado);
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color: m.color,
        background: m.soft,
        padding: "2px 6px",
        borderRadius: 6,
      }}
    >
      {m.label}
    </span>
  );
}

function DayListView({
  citas,
  profesionales,
  servicios,
  clientes,
  servicioMap,
  clienteMap,
  profesionalMap,
  onEditCita,
  onCreateSlot,
  selectedDateObj,
  theme,
}: any) {
  const sortedCitas = useMemo(() => {
    return [...citas].sort(
      (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
    );
  }, [citas]);

  const timelineItems = useMemo(() => {
    const items: any[] = [];
    const START_H = HORARIO_APERTURA.horas;
    const CLOSE_H = HORARIO_CIERRE.horas;

    const dayStart = new Date(selectedDateObj);
    dayStart.setHours(START_H, 0, 0, 0);
    const dayEnd = new Date(selectedDateObj);
    dayEnd.setHours(CLOSE_H, 0, 0, 0);

    let lastTime = dayStart.getTime();

    sortedCitas.forEach((cita) => {
      const citaStart = cita.inicio
        ? new Date(cita.inicio).getTime()
        : lastTime;
      const citaEnd = cita.fin
        ? new Date(cita.fin).getTime()
        : citaStart + 15 * 60000;

      if (!isNaN(citaStart) && !isNaN(citaEnd)) {
        if (citaStart - lastTime >= 15 * 60 * 1000) {
          items.push({
            type: "gap",
            start: new Date(lastTime),
            end: new Date(citaStart),
          });
        }

        items.push({
          type: "cita",
          cita,
          start: new Date(citaStart),
          end: new Date(citaEnd),
        });

        lastTime = Math.max(lastTime, citaEnd);
      }
    });

    if (dayEnd.getTime() - lastTime >= 15 * 60 * 1000) {
      items.push({
        type: "gap",
        start: new Date(lastTime),
        end: new Date(dayEnd.getTime()),
      });
    }

    return items;
  }, [sortedCitas, selectedDateObj]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        animation: "fadeIn 0.25s ease",
      }}
    >
      {timelineItems.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            background: "#fff",
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 16,
            color: TOKENS.textTer,
          }}
        >
          Sin citas programadas para hoy
        </div>
      ) : (
        timelineItems.map((item, idx) => {
          if (item.type === "gap") {
            const durationMin = Math.round(
              (item.end.getTime() - item.start.getTime()) / (60 * 1000),
            );
            const startStr = item.start.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const endStr = item.end.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const defaultProfId = profesionales[0]?.id || "";

            return (
              <button
                key={`gap-${idx}`}
                onClick={() =>
                  onCreateSlot({ hora: startStr, profId: defaultProfId })
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "rgba(244,80,30,0.02)",
                  border: `1.5px dashed ${theme.primary}33`,
                  borderRadius: 12,
                  cursor: "pointer",
                  color: theme.primary,
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.primarySoft;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(244,80,30,0.02)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Hueco libre ({startStr} - {endStr})
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    opacity: 0.8,
                  }}
                >
                  {durationMin} min
                </span>
              </button>
            );
          } else {
            const { cita } = item;
            const startStr = item.start.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const durationMin = Math.round(
              (item.end.getTime() - item.start.getTime()) / (60 * 1000),
            );
            const cli = clienteMap?.get(cita.cliente_id);
            const srv = servicioMap?.get(cita.servicio_id);
            const prof = profesionalMap?.get(cita.profesional_id);
            const profColor = prof?.color || TOKENS.primary;
            const cancelada = cita.estado === "cancelada";

            return (
              <div
                key={cita.id}
                onClick={() => onEditCita(cita)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  background: "#ffffff",
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 14,
                  boxShadow: "0 2px 8px rgba(40,30,24,0.04)",
                  cursor: "pointer",
                  opacity: cancelada ? 0.6 : 1,
                  transition: "transform 0.15s ease, border-color 0.15s ease",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = theme.primary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = TOKENS.border;
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: 4,
                    background: profColor,
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 50,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: TOKENS.text,
                    }}
                  >
                    {startStr}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: TOKENS.textTer,
                      marginTop: 2,
                    }}
                  >
                    {durationMin} min
                  </span>
                </div>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: TOKENS.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cli?.nombre ?? "Cliente"}
                    </span>
                    <CitaEstadoBadge estado={cita.estado} />
                    {cita.cobrada && !cancelada && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          color: "#059669",
                          background: "rgba(16,185,129,0.16)",
                          border: "1px solid rgba(16,185,129,0.4)",
                          padding: "2px 6px",
                          borderRadius: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        ✓ Cobrada
                      </span>
                    )}
                    {!cita.cobrada && cita.estado === "completada" && !cancelada && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          color: "#b45309",
                          background: "rgba(245,158,11,0.18)",
                          border: "1px solid rgba(245,158,11,0.5)",
                          padding: "2px 6px",
                          borderRadius: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        ⚠️ Sin cobrar
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{
                        color: TOKENS.textSec,
                        background: TOKENS.bg,
                        padding: "2px 6px",
                        borderRadius: 6,
                        fontWeight: 600,
                      }}
                    >
                      {srv?.nombre ?? "Servicio"}
                    </span>
                    {prof && (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          color: TOKENS.textTer,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: profColor,
                          }}
                        />
                        {String(prof.nombre ?? "").split(" ")[0]}
                      </span>
                    )}
                  </div>
                </div>

                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    color: TOKENS.textTer,
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </div>
            );
          }
        })
      )}
    </div>
  );
}

