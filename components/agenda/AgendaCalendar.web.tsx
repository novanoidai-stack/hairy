import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  useDeferredValue,
} from "react";
import { WeekView, MonthView, ClienteHistorialModal } from "./views/VistasSemanaMes.web";
import { DayListView } from "./views/VistaDiaLista.web";
import { DayTimelineMemo } from "./views/timeline/Timeline.web";
import { Icon } from "./ui/Icon.web";
import { StatCard, ProfRow } from "./ui/atomosAgenda.web";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase, IS_DEMO_MODE } from "@/lib/supabase";
import { getUserProfile } from "@/lib/auth";
import { DemoSpotlight } from "@/components/ui/DemoSpotlight";
import { useCalendarRefresh } from "@/lib/calendarContext";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { useResponsive } from "@/lib/hooks/useResponsive";
import { useCitasRealtime } from "@/lib/hooks/useCitasRealtime";
import { mensajeDeError } from "@/lib/errores";
import {
  calcularEstrategiasRetraso,
  type EstrategiaRetraso,
} from "@/lib/retrasos";
import {
  PILA_VACIA,
  registrar as registrarPaso,
  deshacer as deshacerPaso,
  rehacer as rehacerPaso,
  descartar as descartarPaso,
  snapshotDe,
  mismoSitioInstante,
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
  type ProblemaAgenda,
  type HorarioProfesional,
} from "@/lib/organizarAgenda";
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
import { AvisosBell } from "@/components/avisos/AvisosBell.web";
import { ListaEsperaDropdown } from "./ListaEsperaDropdown.web";
import { useDebounce } from "@/lib/hooks/useDebounce";

import {
  NEGOCIO_ID_FALLBACK,
  CITA_STATUS,
  CITA_STATUS_BLOQUEAN_SOLAPE,
  sigueViva,
  LOCALE,
  OCUPACION_MAX_PER_MES,
} from "@/lib/constants";
import { pisaOtraCitaAlSoltar } from "@/lib/agenda/solapeAlSoltar";
import {
  cuentaComoConfirmada,
  esActiva,
  esCanceladaONoShow,
  esSinConfirmar48h,
} from "@/lib/citasMetrics";
import { useQueryClient } from "@tanstack/react-query";
import { claves, FRESCURA } from "@/lib/datos/queryClient";
import { listarServicios, listarProfesionales } from "@/lib/datos/catalogo";
import { useAgendaStore } from "./store/useAgendaStore";
import type { Cita, Profesional } from "./tipos";
import { DetalleCitaModal } from "./modals/DetalleCitaModal.web";
import NewCitaModal from "./modals/NewCitaModal.web";
import { ColaDiaPanel } from "@/components/cola/ColaDiaPanel.web";
import { ReservaGrupoModal } from "./modals/ReservaGrupoModal.web";
import { norm, fmtHHMM } from "./ui/atomos.web";
import { cacheado } from "@/lib/datos/cacheado";
import {
  clavesConfig,
  leerNegocioConfig,
  listarBloqueos,
  listarCategorias,
  listarCierres,
  listarHorariosProfesional,
  listarNegocioHorarios,
} from "@/lib/datos/configuracionSalon";
import { eslabonesParaOperar } from "@/lib/agenda/cadena";

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

// Cita y Profesional viven ahora en ./tipos (ver el porque alli: evita el
// ciclo de imports al extraer los modales).

// Normalizar texto: quitar tildes y pasar a minusculas para busquedas sin discriminar acentos

// Iconos SVG simples




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
  const [showColaDia, setShowColaDia] = useState(false);
  const [showReservaGrupo, setShowReservaGrupo] = useState(false);
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
                  "id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id, notas, confirmada_cliente, confirmada_at, formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas, oculta_en_calendario, grupo_id, orden_en_grupo, serie_id, cobrada, cobro_id, cita_fases(id, orden, tipo, inicio, fin, profesional_id, recurso_tipo, etiqueta, iniciada_at, cerrada_at)",
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
  //
  // "obsoleto" = el paso ya no se puede aplicar nunca (la cita se movio por otro
  // lado, se cerro o desaparecio); el llamador lo tira de la pila. "fallo" = algo
  // transitorio (la red, la BD), asi que el paso se queda donde esta y se reintenta.
  async function aplicarPasoAgenda(
    paso: PasoAgenda,
    sentido: "antes" | "despues",
  ): Promise<"aplicado" | "obsoleto" | "fallo"> {
    const verbo = sentido === "antes" ? "deshacer" : "rehacer";
    const avisar = (msg: string) => {
      setUndoError(msg);
      setTimeout(() => setUndoError(null), 3000);
    };
    setUndoBusy(true);
    try {
      const profile = await getUserProfile();
      const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;

      // Guarda de snapshot rancio. La pila vive en memoria de ESTA sesion, pero la
      // cita es compartida: otra persona del salon ha podido moverla, cancelarla o
      // cerrarla desde que se apilo el paso. Escribir el snapshot a ciegas pisaria
      // ese cambio ajeno sin avisar.
      //
      // Se comprueba el lote ENTERO antes de escribir nada: la cascada del
      // organizador es un solo paso y aplicarla a medias deja la agenda peor que
      // antes (mismo motivo por el que `registrar` apila el lote junto).
      const { data: actuales, error: errorLectura } = await supabase
        .from("citas")
        .select("id, estado, inicio, fin, fin_activa, fin_espera, profesional_id")
        .in(
          "id",
          paso.map((c) => c.citaId),
        );
      if (errorLectura) {
        avisar("No se ha podido comprobar el estado de las citas: " + errorLectura.message);
        return "fallo";
      }
      for (const cambio of paso) {
        const actual = actuales?.find((c: any) => c.id === cambio.citaId);
        if (!actual) {
          avisar("No se puede " + verbo + ": la cita ya no existe.");
          return "obsoleto";
        }
        // Misma regla que el arrastre, que solo se niega con las canceladas
        // (AppointmentCard). Con `sigueViva` esto era MAS estricto que la accion
        // que lo genera: el cron autocompleta las citas en cuanto pasan de hora,
        // asi que mover una de la manana se dejaba hacer y luego no se podia
        // deshacer. Deshacer tiene que alcanzar a todo lo que se puede mover.
        if (actual.estado === CITA_STATUS.CANCELADA) {
          avisar("No se puede " + verbo + ": la cita esta cancelada.");
          return "obsoleto";
        }
        // Donde deberia estar la cita AHORA para que este paso tenga sentido.
        // Por instante y no por texto: un lado viene de la BD y el otro se
        // construyo en el navegador (ver `mismoSitioInstante`).
        const origen = sentido === "antes" ? cambio.despues : cambio.antes;
        if (!mismoSitioInstante(snapshotDe(actual), origen)) {
          avisar("No se puede " + verbo + ": la cita se ha movido por otro lado.");
          return "obsoleto";
        }
      }

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
          avisar("No se ha podido " + verbo + ": " + error.message);
          return "fallo";
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
      return "aplicado";
    } finally {
      setUndoBusy(false);
    }
  }

  async function handleDeshacer() {
    const r = deshacerPaso(pilaAgenda);
    if (!r) return;
    const res = await aplicarPasoAgenda(r.aplicar, "antes");
    if (res === "aplicado") setPilaAgenda(r.pila);
    // Un paso obsoleto no vuelve a valer: se tira en vez de dejarlo arriba
    // atascando el atajo (ver `descartar` en lib/agendaUndo).
    else if (res === "obsoleto")
      setPilaAgenda((prev) => descartarPaso(prev, "deshacer"));
  }

  async function handleRehacer() {
    const r = rehacerPaso(pilaAgenda);
    if (!r) return;
    const res = await aplicarPasoAgenda(r.aplicar, "despues");
    if (res === "aplicado") setPilaAgenda(r.pila);
    else if (res === "obsoleto")
      setPilaAgenda((prev) => descartarPaso(prev, "rehacer"));
  }

  // Capas que tapan la rejilla. Con una abierta, el atajo de deshacer no dispara:
  // moveria una cita por detras del modal, a ciegas y sin que se vea.
  const hayCapaEncima =
    showNewCita ||
    showEditCita ||
    showNotif ||
    showManualPanel ||
    showOrganizar ||
    showCierreSalon ||
    showMobileCalendar ||
    showOnboardingPanel ||
    !!showRetrasoProf ||
    !!showClientaTarde ||
    !!showClienteHistorial ||
    !!showStatsModal;

  // Deshacer/rehacer por teclado. La maquinaria (pila, snapshots, historial) ya
  // estaba entera y probada desde jul 2026, pero se quedo sin puerta: los botones
  // de la cabecera se retiraron y nadie llamaba a los handlers. Se devuelve por
  // atajo y no por botones para no volver a cargar la barra de la agenda.
  useEffect(() => {
    const escribiendoEnUnCampo = (destino: EventTarget | null) => {
      const el = destino as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      // Dentro de un campo, Ctrl+Z es el deshacer del TEXTO. No se toca.
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    };
    const alPulsar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla !== "z" && tecla !== "y") return;
      if (hayCapaEncima || undoBusy || escribiendoEnUnCampo(e.target)) return;
      // Ctrl+Y es el rehacer de siempre en Windows; Ctrl/Cmd+Shift+Z, el del resto.
      const esRehacer = tecla === "y" || e.shiftKey;
      const pendientes = esRehacer ? pilaAgenda.rehacer : pilaAgenda.deshacer;
      // Sin nada que hacer se deja pasar la pulsacion en vez de tragarsela.
      if (pendientes.length === 0) return;
      e.preventDefault();
      void (esRehacer ? handleRehacer() : handleDeshacer());
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [hayCapaEncima, undoBusy, pilaAgenda]);

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
            onClick={() => setShowColaDia(true)}
            style={{
              padding: isMobile ? "7px 10px" : "7px 12px",
              background: "rgba(244,80,30,0.10)",
              color: roleTheme.primary,
              border: "1px solid rgba(244,80,30,0.25)",
              borderRadius: 9,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              minHeight: 33,
            }}
          >
            <span>💈</span>
            {!isMobile && "Cola del día"}
          </button>
          <button
            onClick={() => setShowReservaGrupo(true)}
            style={{
              padding: isMobile ? "7px 10px" : "7px 12px",
              background: "rgba(124,58,237,0.10)",
              color: "#7c3aed",
              border: "1px solid rgba(124,58,237,0.25)",
              borderRadius: 9,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              minHeight: 33,
            }}
          >
            <span>👰</span>
            {!isMobile && "Grupo / Boda"}
          </button>
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

                // Ultimo control contra la BD antes de guardar: todo lo de
                // arriba se decide con la foto local de `citas`. Si mientras se
                // arrastraba entro otra cita en ese hueco (otro dispositivo, el
                // portal publico, WhatsApp), aqui se descubriria... si se
                // mirara. Este era el unico camino de arrastre sin revalidar
                // (P3 del informe de auditoria del 31 ago 2026); la regla es la
                // misma del Timeline: pisaOtraCitaAlSoltar ->
                // citaSolapaOcupacion, contando solo fases ACTIVAS.
                const nuevoFin = new Date(
                  new Date(cita.fin).getTime() + diffMs,
                );
                const { data: choqueSem } = await supabase
                  .from("citas")
                  .select("id, inicio, fin, fin_activa, fin_espera")
                  .eq("profesional_id", cita.profesional_id)
                  .in("estado", CITA_STATUS_BLOQUEAN_SOLAPE)
                  .neq("id", cita.id)
                  .lt("inicio", nuevoFin.toISOString())
                  .gt("fin", newInicio.toISOString());
                const pisaEnSemana = pisaOtraCitaAlSoltar(
                  {
                    inicio: newInicio,
                    finActiva: cita.fin_activa
                      ? new Date(new Date(cita.fin_activa).getTime() + diffMs)
                      : nuevoFin,
                    finEspera: cita.fin_espera
                      ? new Date(new Date(cita.fin_espera).getTime() + diffMs)
                      : cita.fin_activa
                        ? new Date(
                            new Date(cita.fin_activa).getTime() + diffMs,
                          )
                        : nuevoFin,
                    fin: nuevoFin,
                  },
                  choqueSem,
                  cita.profesional_id,
                  cita.id,
                );
                if (pisaEnSemana) {
                  mostrarToast(
                    "Ese hueco lo acaba de ocupar otra cita. Se ha recargado la agenda.",
                  );
                  triggerRefresh();
                  return;
                }

                // Optimistic update
                setCitas((prev) =>
                  prev.map((c: any) =>
                    c.id === citaId ? { ...c, ...payload } : c,
                  ),
                );
                const { error: errUpdate } = await supabase
                  .from("citas")
                  .update(payload)
                  .eq("id", citaId);
                if (errUpdate) {
                  // El candado de BD (citas_solape_profesional_excl) es la
                  // ultima linea de defensa; esto es la educacion de la UI.
                  mostrarToast(mensajeDeError(errUpdate));
                  triggerRefresh();
                  return;
                }
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

      {showColaDia && (
        <div
          onClick={() => setShowColaDia(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.60)",
            zIndex: 9999,
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
              maxWidth: 700,
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: -32,
                paddingRight: 10,
                position: "relative",
                zIndex: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setShowColaDia(false)}
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "none",
                  borderRadius: 99,
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
            <ColaDiaPanel
              negocioId={negocioId!}
              profesionales={profesionales}
              servicios={servicios}
              onCobrar={() => {
                setShowColaDia(false);
                router.push("/(tabs)/caja" as never);
              }}
            />
          </div>
        </div>
      )}

      {showReservaGrupo && (
        <ReservaGrupoModal
          negocioId={negocioId!}
          profesionales={profesionales}
          servicios={servicios}
          clientes={clientes}
          selectedDate={selectedDateObj}
          onClose={() => setShowReservaGrupo(false)}
          onSaved={() => {
            setShowReservaGrupo(false);
          }}
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
