import { useEffect, useState, useMemo, useRef, useCallback, memo } from "react";
import { ChispaMascota } from "@/components/chispa/ChispaMascota.web";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase, IS_DEMO_MODE } from "@/lib/supabase";
import { resolverSenalStaff } from "@/lib/senalStaff";
import { validarHorarioLaboral } from "@/lib/horarios";
import { getUserProfile } from "@/lib/auth";
import { TimeDrumPicker } from "@/components/ui/Pickers";
import { DemoSpotlight } from "@/components/ui/DemoSpotlight";
import { useCalendarRefresh } from "@/lib/calendarContext";
import { syncAlergiasACliente } from "@/lib/syncAlergias";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { categoryColorHex } from "@/lib/categoryColors";
import { useResponsive } from "@/lib/hooks/useResponsive";
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

import {
  NEGOCIO_ID_FALLBACK,
  HORARIO_APERTURA,
  HORARIO_CIERRE,
  INTERVALO_MINUTOS,
  CITA_CARD_DETAILS_MIN_HEIGHT,
  CITA_STATUS,
  LOCALE,
  OCUPACION_MAX_PER_MES,
  TAG_RESENO_SALON,
  TAG_RESENO_MECHA,
} from "@/lib/constants";
import { cuentaComoConfirmada, esCanceladaONoShow } from "@/lib/citasMetrics";
import { isTimeSlotOccupied } from "@/lib/utils/appointment";

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
  @keyframes shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 8px rgba(244,80,30,0.3); }
    50% { box-shadow: 0 0 16px rgba(244,80,30,0.6); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-3px); }
  }
  @keyframes bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

interface Cita {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string;
  fin_espera?: string;
  estado: string;
  profesional_id: string;
  servicio_id?: string;
  cliente_id?: string;
  profesionales?: { nombre: string; color: string };
  servicios?: { nombre: string };
  clientes?: { nombre: string };
}

interface Profesional {
  id: string;
  nombre: string;
  color: string;
  activo: boolean;
  rol?: string;
  foto_perfil?: string;
}

// Normalizar texto: quitar tildes y pasar a minusculas para busquedas sin discriminar acentos
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Generar slots de tiempo dinámicamente
const generarSlotsHorarios = () => {
  const slots: string[] = [];
  let h = HORARIO_APERTURA.horas;
  let m = HORARIO_APERTURA.minutos;

  while (
    h < HORARIO_CIERRE.horas ||
    (h === HORARIO_CIERRE.horas && m < HORARIO_CIERRE.minutos)
  ) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += INTERVALO_MINUTOS;
    if (m >= 60) {
      m -= 60;
      h += 1;
    }
  }
  return slots;
};

// Iconos SVG simples
const Icon = ({ name, size = 24, color = "#f8fafc" }: any) => {
  const icons: any = {
    search: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    filter: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    chevronDown: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    maximize: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    minimize: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    clock: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    chevronLeft: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevronRight: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    bell: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    cake: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 11h16M12 2v4M12 6a1.5 1.5 0 0 0 0-3M16 6a1.5 1.5 0 0 0 0-3M8 6a1.5 1.5 0 0 0 0-3"/></svg>`,
    list: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    zap: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,

    sparkle: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
    mic: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v4M8 23h8"/></svg>`,
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  };
  return (
    <div
      style={{
        display: "inline-flex",
        color,
        alignItems: "center",
        justifyContent: "center",
      }}
      dangerouslySetInnerHTML={{ __html: icons[name] || "" }}
    />
  );
};

const CATEGORY_ICONS: Record<
  string,
  (color: string, size?: number) => React.ReactNode
> = {
  general: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  scissors: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="9.8" y1="8.2" x2="21" y2="19" />
      <line x1="9.8" y1="15.8" x2="21" y2="5" />
    </svg>
  ),
  brush: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 11-8-8H6v4l8 8Z" />
      <path d="m6 7 1-1" />
      <path d="m9 10 1-1" />
      <path d="m14 15 4 4a2 2 0 0 0 2.8-2.8l-4-4Z" />
    </svg>
  ),
  droplet: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z" />
    </svg>
  ),
  sparkles: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
  razor: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7h18M6 7V3h12v4M12 7v14M9 21h6" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  ),
  spa: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 12c2 0 4-1 5-3a6 6 0 0 0-10 0c1 2 3 3 5 3Z" />
      <path d="M12 12c-2 0-4 1-5 3a6 6 0 0 0 10 0c-1-2-3-3-5-3Z" />
      <path d="M12 2a15 15 0 0 0-3 10 15 15 0 0 0 3 10 15 15 0 0 0 3-10A15 15 0 0 0 12 2Z" />
    </svg>
  ),
  star: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
};

function getCategoryIcon(icono: string, color: string, size = 14) {
  const iconFn = CATEGORY_ICONS[icono || "general"];
  if (iconFn) return iconFn(color, size);
  return CATEGORY_ICONS.general(color, size);
}

export default function AgendaCalendar() {
  const { refreshTrigger, triggerRefresh } = useCalendarRefresh();
  const { isMobile, isTablet } = useResponsive();
  const router = useRouter();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [selectedProf, setSelectedProf] = useState("todos");
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth()),
  );
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [loading, setLoading] = useState(true);
  const [showNewCita, setShowNewCita] = useState(false);
  const [showEditCita, setShowEditCita] = useState(false);
  const [selectedCitaEdit, setSelectedCitaEdit] = useState<any>(null);
  // Prellenado al crear cita desde un clic en un hueco de la rejilla (hora + profesional)
  const [newCitaPrefill, setNewCitaPrefill] = useState<{
    hora?: string;
    profId?: string;
    clienteId?: string;
    servicioId?: string;
    notas?: string;
    waitlistId?: string;
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
  // Pila de deshacer/rehacer de movimientos de citas (solo esta sesion).
  const [pilaAgenda, setPilaAgenda] = useState<PilaAgenda>(PILA_VACIA);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  // Limites del organizador configurables por salon (undefined = usar los defaults).
  const [limitesAgenda, setLimitesAgenda] = useState<{ maxAdelantoMin?: number; umbralHuecoMin?: number }>({});
  // Cierres del salon completo (festivos/vacaciones): la agenda pinta el dia cerrado.
  const [cierres, setCierres] = useState<
    { fecha: string; motivo: string | null }[]
  >([]);
  const [citaAddonsMap, setCitaAddonsMap] = useState<Record<string, any[]>>({});
  const [citasVencidas, setCitasVencidas] = useState<Cita[]>([]);
  const [hideCitasVencidas, setHideCitasVencidas] = useState(false);
  useEffect(() => {
    setHideCitasVencidas(false);
  }, [citasVencidas.length]);
  const [showRetrasoProf, setShowRetrasoProf] = useState<string | null>(null);
  const [showClientaTarde, setShowClientaTarde] = useState<Cita | null>(null);
  const [showCierreSalon, setShowCierreSalon] = useState(false);
  const [cierreLoading, setCierreLoading] = useState(false);
  // Fase 8: filtros, buscador, vistas
  const [filterServicio, setFilterServicio] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showClienteHistorial, setShowClienteHistorial] = useState<any>(null);
  const [recolocarRetraso, setRecolocarRetraso] = useState(true); // toggle de Configuracion (negocio_config.config)
  const [avisarRetraso, setAvisarRetraso] = useState(true); // notifRetrasoActiva (negocio_config.config)
  const [completarManual, setCompletarManual] = useState(false); // completarManual (negocio_config); false = autocompletar + sin boton
  const [capturaHoldAuto, setCapturaHoldAuto] = useState(true); // depositoNoShowCapturaAuto: capturar la fianza retenida al marcar no-show
  const [negocioId, setNegocioId] = useState(NEGOCIO_ID_FALLBACK);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [dayViewType, setDayViewType] = useState<"grid" | "list">("grid");

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
  }>();
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
  useEffect(() => {
    refreshMensajesSinLeer();
  }, [refreshMensajesSinLeer]);
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
  useEffect(() => {
    refreshClientesFuga();
  }, [refreshClientesFuga]);
  useFocusEffect(
    useCallback(() => {
      refreshClientesFuga();
    }, [refreshClientesFuga]),
  );

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
  // En tablet arranca plegado (el dia es lo principal y el espacio es justo), pero el
  // usuario lo abre/cierra con el boton "Mostrar lateral / Pantalla completa".
  const [railCollapsed, setRailCollapsed] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );
  // Colapso de la barra de filtros (vista/servicio/estado). En movil arranca plegada:
  // ocupa demasiado alto y el dia es la vista principal; se despliega con el chip "Filtros".
  const [toolbarCollapsed, setToolbarCollapsed] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
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
  const [profsCollapsed, setProfsCollapsed] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState<
    "hoy" | "confirmadas" | "mes" | "canceladas" | null
  >(null);
  // Modal del calendario en movil
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);
  // Hoja selectora de profesional en movil (un profesional a la vez)
  const [showProfPicker, setShowProfPicker] = useState(false);
  // Panel "Organizar mi agenda" (Sesion 5, IA por pagina): detecta retrasos,
  // solapes y huecos de HOY y los arregla de un clic. lib/organizarAgenda.ts.
  const [showOrganizar, setShowOrganizar] = useState(false);

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
        ] = await Promise.all([
          supabase
            .from("profesionales")
            .select("id, nombre, color, activo, foto_perfil, categoria")
            .eq("negocio_id", negocioId),
          supabase
            .from("citas")
            .select(
              "id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id, notas, confirmada_cliente, confirmada_at, formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas, oculta_en_calendario, grupo_id, orden_en_grupo, serie_id",
            )
            .eq("negocio_id", negocioId)
            .eq("oculta_en_calendario", false),
          supabase
            .from("servicios")
            .select(
              "id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, categoria_id, categoria_minima, duracion_minima_min",
            )
            .eq("negocio_id", negocioId),
          supabase
            .from("clientes")
            .select(
              "id, nombre, telefono, alergias, fecha_nacimiento, etiquetas",
            )
            .eq("negocio_id", negocioId),
          supabase
            .from("bloqueos_profesional")
            .select("*")
            .eq("negocio_id", negocioId),
          supabase
            .from("cita_addons")
            .select("cita_id, service_addons(nombre)"),
          supabase
            .from("negocio_config")
            .select("config")
            .eq("negocio_id", negocioId)
            .maybeSingle(),
          supabase
            .from("categorias_servicio")
            .select("id, nombre, color, orden, icono")
            .eq("negocio_id", negocioId)
            .eq("activo", true)
            .order("orden"),
          supabase
            .from("cierres_negocio")
            .select("fecha, motivo")
            .eq("negocio_id", negocioId),
          supabase
            .from("negocio_horarios")
            .select("dia_semana, abierto, apertura, cierre")
            .eq("negocio_id", negocioId),
        ]);
        const cfg = ((cfgResult as any)?.data?.config ?? {}) as any;
        setRecolocarRetraso(cfg.recolocarRetraso !== false);
        setAvisarRetraso(cfg.notifRetrasoActiva !== false);
        setCompletarManual(cfg.completarManual === true);
        setCapturaHoldAuto(cfg.depositoNoShowCapturaAuto !== false);
        setLimitesAgenda({
          maxAdelantoMin: cfg.agendaMaxAdelantoMin,
          umbralHuecoMin: cfg.agendaUmbralHuecoMin,
        });
        setNegocioId(negocioId);
        setUserProfile(profile || null);

        if (profResult.error) console.error("Prof error:", profResult.error);
        if (citaResult.error) console.error("Cita error:", citaResult.error);
        console.log("Prof data:", profResult.data);
        console.log("Cita data:", citaResult.data);

        setProfesionales(profResult.data ?? []);
        setCitas(citaResult.data ?? []);
        setServicios(srvResult.data ?? []);
        setCategorias(catResult.data ?? []);
        setClientes(cltResult.data ?? []);
        setBloqueos(bloqueoResult.data ?? []);
        setHorarios(horarioResult.data ?? []);
        setCierres((cierreResult as any)?.data ?? []);
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
  }, [refreshTrigger]);

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
          const pick =
            pool.find((c: any) => conReposo(c) && conFormula(c)) ||
            pool.find(conReposo) ||
            pool.find(conFormula) ||
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
        if (c.estado !== "confirmada") return false;
        const inicio = new Date(c.inicio);
        return inicio < ahora && inicio.toDateString() === hoyStr;
      });
      setCitasVencidas(vencidas);
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
    ({ hora, profId }: { hora: string; profId: string }) => {
      setNewCitaPrefill({ hora, profId });
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
  async function aplicarPasoAgenda(paso: PasoAgenda, sentido: "antes" | "despues") {
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
            "No se ha podido " + (sentido === "antes" ? "deshacer" : "rehacer") + ": " + error.message,
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

  // El rail se colapsa si railCollapsed=true o si estamos en movil. En tablet ya no
  // se fuerza: lo controla railCollapsed (arranca plegado) via el boton de la cabecera.
  const isReallyCollapsed = railCollapsed || isMobile;

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
    if (selectedProf === "todos") return visibleProfs;
    return visibleProfs.filter((p) => p.id === selectedProf);
  }, [visibleProfs, selectedProf]);

  // Paginacion de columnas en la vista Dia: con "Todos" y muchos profesionales, las
  // columnas se aprietan. Se muestran de PROF_PAGE_SIZE en PROF_PAGE_SIZE con un pager.
  // En tablet caben menos columnas comodas -> 3; en escritorio 4.
  const PROF_PAGE_SIZE = isTablet ? 3 : 4;
  const [profPage, setProfPage] = useState(0);
  const profPageCount = Math.max(
    1,
    Math.ceil(timelineProfs.length / PROF_PAGE_SIZE),
  );
  // Volver a la primera pagina si el conjunto cambia (cambio de profesional/dia/filtro)
  // o si cambia el tamano de pagina al pasar tablet<->escritorio, para no quedarse en
  // una pagina que ya no existe.
  useEffect(() => {
    setProfPage(0);
  }, [selectedProf, selectedDate, currentMonth, PROF_PAGE_SIZE]);
  useEffect(() => {
    if (profPage > profPageCount - 1) setProfPage(0);
  }, [profPageCount, profPage]);
  const pagedTimelineProfs = useMemo(() => {
    if (timelineProfs.length <= PROF_PAGE_SIZE) return timelineProfs;
    const start = profPage * PROF_PAGE_SIZE;
    return timelineProfs.slice(start, start + PROF_PAGE_SIZE);
  }, [timelineProfs, profPage]);

  const filtered = useMemo(() => {
    let result =
      selectedProf === "todos"
        ? citasHoy
        : citasHoy.filter((c) => c.profesional_id === selectedProf);
    if (filterServicio !== "todos")
      result = result.filter((c) => c.servicio_id === filterServicio);
    if (filterEstado !== "todos")
      result = result.filter((c) => c.estado === filterEstado);
    return result;
  }, [citasHoy, selectedProf, filterServicio, filterEstado]);

  const totalCitasHoy = citasHoy.length;

  // 8.4: buscador global
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = norm(searchQuery);
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
  }, [searchQuery, citas, clientes, servicios, profesionales]);

  // Citas en proximas 48h sin confirmar por el cliente (excluye canceladas)
  const sinConfirmarList = useMemo(() => {
    const ahora = Date.now();
    return citas
      .filter((c: any) => {
        const ts = new Date(c.inicio).getTime();
        const horas = (ts - ahora) / 3600000;
        return (
          horas > 0 &&
          horas <= 48 &&
          !c.confirmada_cliente &&
          c.estado === CITA_STATUS.CONFIRMADA
        );
      })
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

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: isMobile ? 8 : 12,
          padding: isMobile ? "10px 14px" : "11px 28px",
          borderBottom: `1px solid ${roleTheme.borderHeader}`,
          position: "relative",
          zIndex: 60,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.30)",
                color: "#ef4444",
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
                  background: "#ef4444",
                }}
              />
              Salon cerrado{cierreHoy.motivo ? ` · ${cierreHoy.motivo}` : ""}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: isMobile ? 6 : 10,
            alignItems: "center",
            flexShrink: 0,
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
                color: sinConfirmar48h > 0 ? "#ef4444" : TOKENS.textTer,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Icon
                name="alert"
                size={16}
                color={sinConfirmar48h > 0 ? "#ef4444" : TOKENS.textTer}
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
          {/* Boton Ocultar Filtros eliminado */}
          {!isMobile && (
            <button
              onClick={() => setRailCollapsed((v) => !v)}
              title={
                railCollapsed ? "Mostrar panel lateral" : "Pantalla completa"
              }
              style={{
                padding: isTablet ? 7 : "7px 12px",
                background: railCollapsed
                  ? roleTheme.primarySoft
                  : TOKENS.bgCard,
                border: `1px solid ${railCollapsed ? roleTheme.primary + "40" : TOKENS.border}`,
                color: railCollapsed ? roleTheme.primaryHi : TOKENS.textSec,
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
                name={railCollapsed ? "minimize" : "maximize"}
                size={15}
                color={railCollapsed ? roleTheme.primaryHi : TOKENS.textSec}
              />
              {!isTablet &&
                (railCollapsed ? "Mostrar lateral" : "Pantalla completa")}
            </button>
          )}
          {/* Boton Organizar movido abajo */}
          {/* Boton Hoy movido abajo */}
          <button
            onClick={() => setShowCierreSalon(true)}
            title="Cerrar salon"
            aria-label="Cerrar salon"
            style={{
              padding: isMobile ? "7px 8px" : "7px 12px",
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#ef4444",
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
              e.currentTarget.style.background = "rgba(239,68,68,0.20)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(239,68,68,0.10)";
            }}
          >
            <Icon name="x" size={15} color="#ef4444" />
            {!isMobile && "Cerrar salon"}
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
          const marquee = isMobile && vencChips.length > 2;
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
                  gap: 6,
                  padding: "5px 10px",
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  color: TOKENS.text,
                  whiteSpace: "nowrap",
                  transition: "background 0.15s ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(239,68,68,0.20)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(239,68,68,0.12)";
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
                <span style={{ color: "#ef4444" }}>+{minutosRetraso}min</span>
              </button>
            );
          };
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: isMobile ? "8px 14px" : "10px 32px",
                background: "rgba(239,68,68,0.08)",
                borderBottom: "1px solid rgba(239,68,68,0.20)",
                animation: "fadeIn 0.3s ease",
                flexWrap: isMobile ? "wrap" : "nowrap",
              }}
            >
              <style>{`@keyframes mechaVencMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}} .venc-marquee-track:hover,.venc-marquee-track:active{animation-play-state:paused}`}</style>
              <ChispaMascota size={20} mood="think" />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#ef4444",
                  flexShrink: 0,
                }}
              >
                Chispa te avisa que tienes {citasVencidas.length} cita{citasVencidas.length > 1 ? "s" : ""}{" "}
                sin atender
              </span>
              <div
                style={{
                  order: isMobile ? 3 : 0,
                  flexBasis: isMobile ? "100%" : "auto",
                  flex: isMobile ? undefined : 1,
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
                  color: "#ef4444",
                  opacity: 0.6,
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "opacity 0.15s ease",
                  marginLeft: 8,
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
                  width="16"
                  height="16"
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
            {/* KPIs — colapsable de forma independiente */}
            <div>
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
                      value={totalCitasHoy}
                      sub="citas"
                      tone={TOKENS.primary}
                      onClick={() => setShowStatsModal("hoy")}
                    />
                  </div>
                  <div style={{ animation: "slideInUp 0.5s ease 0.2s both" }}>
                    <StatCard
                      label="CONFIRMADAS"
                      value={confirmadasHoy}
                      sub={`de ${totalCitasHoy} hoy`}
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

            {/* Mini-calendario — colapsable de forma independiente */}
            <div>
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

            <div>
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
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
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
            padding: isMobile ? "12px 0 16px 0" : (isReallyCollapsed ? "20px 0 16px 0" : "24px 0 16px 0"),
            marginBottom: 16,
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
                  marginBottom: 16,
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                  {/* Navegacion de dia anterior/siguiente (estilo Booksy) */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <button
                      className="m-btn-icon"
                      onClick={() => {
                        const d = new Date(selectedDateObj);
                        d.setDate(d.getDate() - 1);
                        setSelectedDate(d.getDate());
                        setCurrentMonth(
                          new Date(d.getFullYear(), d.getMonth()),
                        );
                      }}
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
                      onClick={() => {
                        const d = new Date(selectedDateObj);
                        d.setDate(d.getDate() + 1);
                        setSelectedDate(d.getDate());
                        setCurrentMonth(
                          new Date(d.getFullYear(), d.getMonth()),
                        );
                      }}
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
                  <div style={{ minWidth: 0, cursor: "default" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 0,
                        flexWrap: "wrap",
                      }}
                    >
                      <h2
                        style={{
                          margin: 0,
                          fontSize: isMobile ? 16 : 21,
                          fontWeight: 700,
                          letterSpacing: -0.3,
                          textTransform: "capitalize",
                        }}
                      >
                        {view === "month" ? 
                          currentMonth.toLocaleDateString(LOCALE, { month: "long", year: "numeric" })
                        :
                          selectedDateObj.toLocaleDateString(LOCALE, {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                          })
                        }
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: isMobile ? 0 : 12 }}>
                        <div style={{ display: "flex", background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, overflow: "hidden" }}>
                          {(["day", "week", "month"] as const).map((v) => (
                            <button
                              key={v}
                              onClick={() => {
                                setView(v);
                                // if (v !== "day") setRailCollapsed(false);
                              }}
                              style={{
                                padding: isMobile ? "6px 12px" : "8px 18px",
                                fontSize: isMobile ? 12 : 13,
                                fontWeight: view === v ? 700 : 500,
                                background: view === v ? roleTheme.primarySoft : "transparent",
                                color: view === v ? roleTheme.primaryHi : TOKENS.textSec,
                                border: "none",
                                cursor: "pointer",
                                borderRight: v !== "month" ? `1px solid ${TOKENS.border}` : "none",
                                transition: "all 0.2s ease",
                              }}
                              onMouseEnter={(e) => { if (view !== v) e.currentTarget.style.background = roleTheme.primarySoft; }}
                              onMouseLeave={(e) => { if (view !== v) e.currentTarget.style.background = "transparent"; }}
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
                        <button
                          onClick={() => setShowOrganizar(true)}
                          title="Organizar la agenda"
                          className="m-btn-ai-glow"
                          style={{
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
                            transition: "all 0.2s ease"
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                        >
                          <Icon name="list" size={isMobile ? 12 : 14} color={TOKENS.text} />
                        </button>
                        {/* Retirado el boton del "Optimizador de la agenda" (tarjeta de IA con
                            prompt de texto libre): duplicaba "Organizar mi agenda", que hace lo
                            mismo de forma determinista y con propuestas aplicables a un clic. */}
                        <div style={{ width: 1, height: 20, background: TOKENS.border, opacity: 0.5, marginLeft: 4, marginRight: 4 }} />
          <div style={{ position: "relative" }}>
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
                  filterServicio !== "todos"
                    ? TOKENS.primaryHi
                    : TOKENS.textSec,
                transition: "all 0.2s ease",
                minWidth: 120,
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
                        filterServicio === s.id
                          ? TOKENS.primaryHi
                          : TOKENS.text,
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


          <div style={{ position: "relative" }}>
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
                  filterEstado !== "todos"
                    ? "rgba(244,80,30,0.10)"
                    : TOKENS.bgCard,
                border: `1px solid ${dropEstadoOpen ? TOKENS.primary : filterEstado !== "todos" ? "rgba(244,80,30,0.30)" : TOKENS.border}`,
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color:
                  filterEstado !== "todos" ? TOKENS.primaryHi : TOKENS.textSec,
                transition: "all 0.2s ease",
                minWidth: 110,
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
                  : filterEstado === "no_presentada"
                    ? "No presentada"
                    : filterEstado.charAt(0).toUpperCase() +
                      filterEstado.slice(1)}
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
                    value: CITA_STATUS.CONFIRMADA,
                    label: "Confirmada",
                    dot: TOKENS.primaryHi,
                  },
                  {
                    value: CITA_STATUS.COMPLETADA,
                    label: "Completada",
                    dot: "#22c55e",
                  },
                  {
                    value: CITA_STATUS.CANCELADA,
                    label: "Cancelada",
                    dot: "#ef4444",
                  },
                  {
                    value: CITA_STATUS.NO_PRESENTADA,
                    label: "No presentada",
                    dot: "#f59e0b",
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
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.20)",
                borderRadius: 8,
                color: "#ef4444",
                cursor: "pointer",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: 4,
                animation: "fadeIn 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(239,68,68,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(239,68,68,0.08)";
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
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; e.currentTarget.style.color = TOKENS.primaryHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textSec; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        e.currentTarget.style.transform = "translateX(2px)";
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

                      </div>

                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: TOKENS.textSec,
                        marginTop: 2,
                      }}
                    >
                      {totalCitasHoy} citas · {confirmadasHoy} confirmadas
                    </div>
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

              
              {/* Selector de profesional en movil: UNO a la vez (switcher con flechas
                  + toque para elegir de una lista). Evita las columnas aplastadas. */}
              {isMobile &&
                visibleProfs.length > 0 &&
                (() => {
                  // "Ver todos": barra distinta (icono cuadricula + nº de columnas); el
                  // toque reabre el selector para volver a un solo profesional.
                  if (selectedProf === "todos") {
                    return (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: TOKENS.bgCard,
                          border: `1.5px solid ${TOKENS.primary}`,
                          borderRadius: 13,
                          padding: "8px 10px",
                          marginBottom: 12,
                        }}
                      >
                        <button
                          onClick={() => setShowProfPicker(true)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 9,
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            textAlign: "left",
                            padding: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 9,
                              background: TOKENS.primary,
                              color: "#fff",
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                            }}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 12 12"
                              fill="#fff"
                            >
                              <rect x="0" y="0" width="5" height="5" rx="1" />
                              <rect x="7" y="0" width="5" height="5" rx="1" />
                              <rect x="0" y="7" width="5" height="5" rx="1" />
                              <rect x="7" y="7" width="5" height="5" rx="1" />
                            </svg>
                          </span>
                          <span
                            style={{
                              minWidth: 0,
                              display: "flex",
                              flexDirection: "column",
                              gap: 1,
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 14.5,
                                fontWeight: 700,
                                color: TOKENS.text,
                              }}
                            >
                              Todos los profesionales
                              <Icon
                                name="chevronDown"
                                size={14}
                                color={TOKENS.textTer}
                              />
                            </span>
                            <span
                              style={{ fontSize: 11.5, color: TOKENS.textSec }}
                            >
                              {visibleProfs.length} columnas · desliza en
                              horizontal
                            </span>
                          </span>
                        </button>
                      </div>
                    );
                  }
                  const idx = Math.max(
                    0,
                    visibleProfs.findIndex((p) => p.id === selectedProf),
                  );
                  const curr = visibleProfs[idx] || visibleProfs[0];
                  const count = citasHoy.filter(
                    (c: any) => c.profesional_id === curr.id,
                  ).length;
                  const conf = citasHoy.filter(
                    (c: any) =>
                      c.profesional_id === curr.id &&
                      (c.estado === CITA_STATUS.CONFIRMADA ||
                        c.estado === CITA_STATUS.COMPLETADA),
                  ).length;
                  const multi = visibleProfs.length > 1;
                  const go = (dir: number) => {
                    const n =
                      (idx + dir + visibleProfs.length) % visibleProfs.length;
                    setSelectedProf(visibleProfs[n].id);
                  };
                  const iniciales = curr.nombre
                    .split(" ")
                    .map((s: string) => s[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
                  return (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: TOKENS.bgCard,
                        border: `1.5px solid ${curr.color}`,
                        borderRadius: 13,
                        padding: "8px 10px",
                        marginBottom: 12,
                      }}
                    >
                      <button
                        onClick={() => {
                          if (multi) setShowProfPicker(true);
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          background: "none",
                          border: "none",
                          cursor: multi ? "pointer" : "default",
                          textAlign: "left",
                          padding: 0,
                        }}
                      >
                        {curr.foto_perfil ? (
                          <img
                            src={curr.foto_perfil}
                            alt=""
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 9,
                              objectFit: "cover",
                              flexShrink: 0,
                              border: `1px solid rgba(255,255,255,0.15)`,
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 9,
                              background: curr.color,
                              color: "#fff",
                              fontSize: 13,
                              fontWeight: 700,
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                            }}
                          >
                            {iniciales}
                          </span>
                        )}
                        <span
                          style={{
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 14.5,
                              fontWeight: 700,
                              color: TOKENS.text,
                            }}
                          >
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 150,
                              }}
                            >
                              {curr.nombre}
                            </span>
                            {multi && (
                              <Icon
                                name="chevronDown"
                                size={14}
                                color={TOKENS.textTer}
                              />
                            )}
                          </span>
                          <span
                            style={{ fontSize: 11.5, color: TOKENS.textSec }}
                          >
                            {count} cita{count !== 1 ? "s" : ""} hoy · {conf}{" "}
                            confirmada{conf !== 1 ? "s" : ""}
                          </span>
                        </span>
                      </button>
                      {multi && (
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => go(-1)}
                            aria-label="Profesional anterior"
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              background: TOKENS.bg,
                              border: `1px solid ${TOKENS.border}`,
                              color: TOKENS.textSec,
                              display: "grid",
                              placeItems: "center",
                              cursor: "pointer",
                            }}
                          >
                            <Icon
                              name="chevronLeft"
                              size={16}
                              color={TOKENS.textSec}
                            />
                          </button>
                          <button
                            onClick={() => go(1)}
                            aria-label="Profesional siguiente"
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              background: TOKENS.bg,
                              border: `1px solid ${TOKENS.border}`,
                              color: TOKENS.textSec,
                              display: "grid",
                              placeItems: "center",
                              cursor: "pointer",
                            }}
                          >
                            <Icon
                              name="chevronRight"
                              size={16}
                              color={TOKENS.textSec}
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

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
              {timelineProfs.length > PROF_PAGE_SIZE && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 4px 6px",
                    position: "sticky",
                    top: 0,
                    zIndex: 30,
                    background: TOKENS.bg,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: TOKENS.textSec,
                      fontWeight: 600,
                    }}
                  >
                    {`${profPage * PROF_PAGE_SIZE + 1}–${Math.min(
                      (profPage + 1) * PROF_PAGE_SIZE,
                      timelineProfs.length,
                    )} de ${timelineProfs.length}`}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 10,
                      overflow: "hidden",
                    }}
                  >
                    {([
                      { k: "prev", dis: profPage <= 0, icon: "chevronLeft", d: -1, t: "Profesionales anteriores" },
                      { k: "next", dis: profPage >= profPageCount - 1, icon: "chevronRight", d: 1, t: "Siguientes profesionales" },
                    ] as const).map((b) => (
                      <button
                        key={b.k}
                        onClick={() =>
                          setProfPage((p) =>
                            Math.min(Math.max(p + b.d, 0), profPageCount - 1),
                          )
                        }
                        disabled={b.dis}
                        title={b.t}
                        style={{
                          padding: "6px 11px",
                          background: "transparent",
                          border: "none",
                          borderRight:
                            b.k === "prev" ? `1px solid ${TOKENS.border}` : "none",
                          color: b.dis ? TOKENS.textTer : TOKENS.text,
                          cursor: b.dis ? "default" : "pointer",
                          opacity: b.dis ? 0.4 : 1,
                          display: "flex",
                          alignItems: "center",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!b.dis)
                            e.currentTarget.style.background = roleTheme.primarySoft;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <Icon name={b.icon} size={16} color="currentColor" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {dayViewType === "list" && isMobile ? (
                <DayListView
                  citas={filtered}
                  profesionales={pagedTimelineProfs}
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
                  }: {
                    hora: string;
                    profId: string;
                  }) => {
                    setNewCitaPrefill({ hora, profId });
                    setShowNewCita(true);
                  }}
                  selectedDateObj={selectedDateObj}
                  theme={roleTheme}
                />
              ) : (
                <DayTimelineMemo
                  citas={filtered}
                  profesionales={pagedTimelineProfs}
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
                  selectedProf={selectedProf}
                  agendaFit={agendaFit}
                />
              )}
            </>
          )}
          {view === "week" && (
            <WeekView
              citas={citas}
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
        />
      )}
      

      {undoError && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(239,68,68,0.95)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(239,68,68,0.4)",
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          {undoError}
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
          limites={limitesAgenda}
          negocioId={negocioId}
          isMobile={isMobile}
          onClose={() => setShowOrganizar(false)}
          onAplicado={(updates) => {
            // La cascada del organizador es UN paso: deshacerla a medias dejaria la agenda peor.
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
          }}
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
          bloqueos={bloqueos}
          onDuplicate={() => {
            setShowEditCita(false);
            setNewCitaPrefill({
              clienteId: selectedCitaEdit.cliente_id,
              servicioId: selectedCitaEdit.servicio_id,
              profId: selectedCitaEdit.profesional_id,
              notas: selectedCitaEdit.notas || ""
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
                  border: `1px solid rgba(239,68,68,0.30)`,
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
                    color: "#ef4444",
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
                          ? "rgba(239,68,68,0.08)"
                          : "rgba(239,68,68,0.15)",
                      color: count === 0 ? TOKENS.textTer : "#ef4444",
                      border: "1px solid rgba(239,68,68,0.30)",
                      borderRadius: 10,
                      cursor: count === 0 ? "not-allowed" : "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (count > 0)
                        e.currentTarget.style.background =
                          "rgba(239,68,68,0.25)";
                    }}
                    onMouseLeave={(e) => {
                      if (count > 0)
                        e.currentTarget.style.background =
                          "rgba(239,68,68,0.15)";
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
            await supabase
              .from("citas")
              .update({ estado: "no_presentada" })
              .eq("id", c.id);
            setCitas((prev) =>
              prev.map((x) =>
                x.id === c.id ? { ...x, estado: "no_presentada" } : x,
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
            await supabase
              .from("citas")
              .update({ estado: CITA_STATUS.COMPLETADA })
              .eq("id", c.id);
            setCitas((prev) =>
              prev.map((x) =>
                x.id === c.id ? { ...x, estado: CITA_STATUS.COMPLETADA } : x,
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
                      background: "rgba(239,68,68,0.12)",
                      color: "#ef4444",
                      border: "1px solid rgba(239,68,68,0.30)",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.22)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.12)";
                    }}
                  >
                    Marcar no presentada
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Modal: Profesional llega tarde (6.1) */}
      {showRetrasoProf &&
        (() => {
          const prof = profesionales.find((p) => p.id === showRetrasoProf);
          if (!prof) return null;
          const citasProf = citasHoy.filter(
            (c) =>
              c.profesional_id === showRetrasoProf && c.estado === "confirmada",
          );

          async function retrasarTodas(minutos: number) {
            // Cascada inteligente (misma logica que el retraso por cita): el profesional llega
            // X tarde -> su primera cita aun no terminada se retrasa X y las siguientes se
            // recolocan ABSORBIENDO los huecos (no se desplazan todas a ciegas).
            const citasMapped = citasProf.map((c: any) => ({
              id: c.id,
              inicio: c.inicio,
              fin: c.fin,
              fin_activa: c.fin_activa,
              fin_espera: c.fin_espera,
            }));
            const ahora = Date.now();
            const primera = citasMapped
              .filter((c) => +new Date(c.fin) > ahora)
              .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))[0];
            if (!primera) {
              setShowRetrasoProf(null);
              return;
            }
            const prop = proponerRetrasoPorCita(
              citasMapped,
              primera.id,
              minutos,
            );
            const updates = construirUpdatesRetraso(prop, citasMapped);
            if (updates.length === 0) {
              setShowRetrasoProf(null);
              return;
            }
            const profile = await getUserProfile();
            const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
            for (const u of updates) {
              const orig = citasProf.find((c: any) => c.id === u.id);
              const { id, ...campos } = u;
              await supabase.from("citas").update(campos).eq("id", id);
              if (orig)
                await registrarHistorial(
                  id,
                  nId,
                  [
                    {
                      campo: "inicio",
                      anterior: orig.inicio,
                      nuevo: campos.inicio,
                    },
                    { campo: "fin", anterior: orig.fin, nuevo: campos.fin },
                  ],
                  `Profesional llega tarde (+${minutos} min)`,
                );
            }
            setCitas((prev) =>
              prev.map((c) => {
                const u = updates.find((x) => x.id === c.id);
                return u ? { ...c, ...u } : c;
              }),
            );
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
              maxHeight: "calc(100dvh - 32px)",
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

      {/* Hoja selectora de profesional (movil): elegir a quien ver de un toque */}
      {/* Chispa (IA) se monta globalmente en app/_layout.tsx (ChispaLauncher);
          la agenda se refresca via useCalendarRefresh cuando aplica una accion. */}
      {showProfPicker && (
        <div
          onClick={() => setShowProfPicker(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8,6,4,0.55)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 9999,
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "70vh",
              overflowY: "auto",
              background: TOKENS.bgPanel,
              borderRadius: "20px 20px 0 0",
              border: `1px solid ${TOKENS.border}`,
              borderBottom: "none",
              padding: "16px 16px 28px",
              animation: "slideInUp 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 999,
                background: TOKENS.border,
                margin: "0 auto 14px",
              }}
            />
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: TOKENS.text,
                marginBottom: 12,
              }}
            >
              Ver profesional
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Ver todos: muestra todas las columnas a la vez (scroll horizontal) */}
              <button
                onClick={() => {
                  setSelectedProf("todos");
                  setShowProfPicker(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background:
                    selectedProf === "todos"
                      ? "rgba(244,80,30,0.10)"
                      : TOKENS.bgCard,
                  border: `1px solid ${selectedProf === "todos" ? TOKENS.primary : TOKENS.border}`,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: TOKENS.primary,
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 12 12" fill="#fff">
                    <rect x="0" y="0" width="5" height="5" rx="1" />
                    <rect x="7" y="0" width="5" height="5" rx="1" />
                    <rect x="0" y="7" width="5" height="5" rx="1" />
                    <rect x="7" y="7" width="5" height="5" rx="1" />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 14,
                      fontWeight: 700,
                      color: TOKENS.text,
                    }}
                  >
                    Todos los profesionales
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      color: TOKENS.textSec,
                    }}
                  >
                    Ver todas las columnas (desliza en horizontal)
                  </span>
                </span>
                {selectedProf === "todos" && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: TOKENS.primaryHi,
                      flexShrink: 0,
                    }}
                  >
                    Viendo
                  </span>
                )}
              </button>
              {visibleProfs.map((p) => {
                const sel = p.id === selectedProf;
                const n = citasHoy.filter(
                  (c: any) => c.profesional_id === p.id,
                ).length;
                const iniciales = p.nombre
                  .split(" ")
                  .map((s: string) => s[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProf(p.id);
                      setShowProfPicker(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: sel ? "rgba(244,80,30,0.10)" : TOKENS.bgCard,
                      border: `1px solid ${sel ? p.color : TOKENS.border}`,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {p.foto_perfil ? (
                      <img
                        src={p.foto_perfil}
                        alt=""
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          objectFit: "cover",
                          flexShrink: 0,
                          border: `1px solid rgba(255,255,255,0.15)`,
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          background: p.color,
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 700,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        {iniciales}
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 14,
                          fontWeight: 700,
                          color: TOKENS.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.nombre}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 11.5,
                          color: TOKENS.textSec,
                        }}
                      >
                        {n} cita{n !== 1 ? "s" : ""} hoy
                      </span>
                    </span>
                    {sel && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: TOKENS.primaryHi,
                          flexShrink: 0,
                        }}
                      >
                        Viendo
                      </span>
                    )}
                  </button>
                );
              })}
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
        e.currentTarget.style.transform = "scale(1.02)";
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
        e.currentTarget.style.transform = "translateX(4px)";
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
        e.currentTarget.style.transform = "scale(1.05)";
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

const BLOQUEO_COLORS: Record<string, string> = {
  vacaciones: "#0f9d6b",
  reunion: "#3b82f6",
  baja: "#e23b34",
  formacion: "#c0260a",
  descanso: "#e08a00",
};
const BLOQUEO_LABELS: Record<string, string> = {
  vacaciones: "Vacaciones",
  reunion: "Reunión",
  baja: "Baja",
  formacion: "Formación",
  descanso: "Descanso",
};

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
  selectedProf,
  agendaFit = true,
}: any) {
  const { isMobile, isTablet } = useResponsive();
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
  const START_H = HORARIO_APERTURA.horas;
  // Reloj propio: al estar memoizado, DayTimeline no re-renderiza con el padre,
  // asi que la linea AHORA necesita su propio tick para seguir viva.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const currentHourPercent =
    (now.getHours() - START_H + now.getMinutes() / 60) / HOURS.length;
  const isToday =
    now.getHours() >= START_H && now.getHours() < START_H + HOURS.length;

  async function toggleCompletada(citaId: string, estadoActual: string) {
    const nuevoEstado =
      estadoActual === CITA_STATUS.COMPLETADA
        ? CITA_STATUS.CONFIRMADA
        : CITA_STATUS.COMPLETADA;
    await supabase
      .from("citas")
      .update({ estado: nuevoEstado })
      .eq("id", citaId);
    onCitaUpdated?.({ id: citaId, estado: nuevoEstado });
  }

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
    payload: any;
    citaOrig: any;
  } | null>(null);
  const [aplicandoAusencia, setAplicandoAusencia] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<any>(null);
  const dropRef = useRef<any>(null);
  const _profRef = useRef(profesionales);
  _profRef.current = profesionales;
  const _citasRef = useRef(citas);
  _citasRef.current = citas;
  const _dateRef = useRef(selectedDateObj);
  _dateRef.current = selectedDateObj;

  const startDrag = (cita: any, e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const d = {
      cita,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      ghostX: rect.left,
      ghostY: rect.top,
      blockWidth: rect.width,
      blockHeight: rect.height,
    };
    dragRef.current = d;
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved =
        Math.abs(e.clientX - d.startX) > 5 ||
        Math.abs(e.clientY - d.startY) > 5;
      if (!moved) return;

      const upd = {
        ...d,
        ghostX: e.clientX - d.offsetX,
        ghostY: e.clientY - d.offsetY,
      };
      dragRef.current = upd;
      setDrag(upd);

      const grid = gridRef.current;
      if (!grid) return;
      const r = grid.getBoundingClientRect();
      const relY = e.clientY - r.top;
      const relX = e.clientX - r.left - 56;
      const profs = _profRef.current;
      if (
        relY < 0 ||
        relY >= HOURS.length * ROW_H ||
        relX < 0 ||
        relX > r.width - 56 ||
        !profs.length
      ) {
        dropRef.current = null;
        setDropSlot(null);
        return;
      }
      const colW = (r.width - 56) / profs.length;
      const profIndex = Math.min(Math.floor(relX / colW), profs.length - 1);
      let minutesFromStart = Math.max(
        0,
        Math.round((((relY - d.offsetY) / ROW_H) * 60) / 15) * 15,
      );
      // Encaje en reposo: si el punto de suelta cae DENTRO del reposo de otra cita,
      // permitimos que el usuario lo coloque en fracciones de 15 minutos (no forzamos alineación al tope).
      const targetProf = profs[profIndex];
      const sl = { profIndex, minutesFromStart, colW };
      dropRef.current = sl;
      setDropSlot(sl);
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
      const nuevoInicio = new Date(dateObj);
      nuevoInicio.setHours(h, m, 0, 0);
      const nuevoFinActiva = new Date(nuevoInicio.getTime() + activaMs);
      const nuevoFinEspera = new Date(nuevoFinActiva.getTime() + esperaMs);
      const nuevoFin = new Date(nuevoInicio.getTime() + durMs);

      if (
        nuevoInicio.getTime() === new Date(cita.inicio).getTime() &&
        targetProf.id === cita.profesional_id
      )
        return;

      if (cita.encadenadoId && nuevoInicio.getTime() !== new Date(cita.inicio).getTime()) {
        const confirmMsg = "Esta cita pertenece a un servicio encadenado. Si cambias su hora, puedes desincronizar la cadena. ¿Estás seguro de moverla?";
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

      // Verificar si choca con ausencias del profesional (vacaciones, bajas, etc.)
      // Evita solapar "primer tiempo activo" o "segundo tiempo activo" con bloqueos
      const b1 = bloqueos.some(
        (b: any) =>
          b.profesional_id === targetProf.id &&
          new Date(b.inicio) < nuevoFinActiva &&
          new Date(b.fin) > nuevoInicio,
      );
      const b2 =
        activo2Ms > 0 &&
        bloqueos.some(
          (b: any) =>
            b.profesional_id === targetProf.id &&
            new Date(b.inicio) < nuevoFin &&
            new Date(b.fin) > nuevoFinEspera,
        );

      if (b1 || b2) {
        // No bloquear: preguntar. El gestor puede querer mover igualmente (turno
        // extra, ausencia que se cancela, etc.). Se aplica el mismo payload de mover.
        setDragAusencia({
          profNombre: targetProf.nombre,
          horaTxt: nuevoInicio.toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          }),
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

      const c1 = isTimeSlotOccupied(
        nuevoInicio,
        nuevoFinActiva,
        currentCitas,
        targetProf.id,
        cita.id,
      );
      const c2 =
        activo2Ms > 0 &&
        isTimeSlotOccupied(
          nuevoFinEspera,
          nuevoFin,
          currentCitas,
          targetProf.id,
          cita.id,
        );

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
                  fin_activa: cita.fin_activa ? nuevoFinActiva.toISOString() : null,
                  fin_espera: cita.fin_espera ? nuevoFinEspera.toISOString() : null,
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

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);
  // ---- END DRAG & DROP ----

  const citasWithLanes = useMemo(() => {
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
      profCitas.forEach((c: any) => {
        const host = profCitas.find(
          (h: any) =>
            h.id !== c.id &&
            h.estado !== CITA_STATUS.CANCELADA &&
            c.estado !== CITA_STATUS.CANCELADA &&
            h.fin_activa &&
            h.fin_espera &&
            new Date(h.fin_espera).getTime() >
              new Date(h.fin_activa).getTime() &&
            new Date(c.inicio).getTime() >= new Date(h.fin_activa).getTime() &&
            new Date(c.fin).getTime() <= new Date(h.fin_espera).getTime(),
        );
        c._nested = !!host;
        c._hostId = host ? host.id : null;
      });

      // Lanes/solapes SOLO entre las citas normales (las anidadas van encima).
      const normales = profCitas.filter((c: any) => !c._nested);
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
    return result;
  }, [citas]);

  return (
    <>
      <div
        style={{
          // Lienzo blanco ELEVADO: destaca claramente sobre el lienzo crema de la app
          // (sombra + borde) y la marca se nota en cabecera/líneas, sin verse "dorado".
          background: "#ffffff",
          border: `1px solid ${TOKENS.borderHi}`,
          borderRadius: 16,
          overflowX: agendaFit ? "hidden" : "auto",
          width: "100%",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            minWidth:
              !agendaFit && profesionales.length > 3
                ? profesionales.length * 220 + 56
                : "100%",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `56px repeat(${profesionales.length || 1}, 1fr)`,
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
            {profesionales.map((p: any) => (
              <div
                key={p.id}
                style={{
                  padding: "12px 14px",
                  borderLeft: `1px solid ${TOKENS.border}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
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
                    }}
                  >
                    {p.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
                <div
                  style={{ fontSize: 12, fontWeight: 700, color: TOKENS.text }}
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
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            style={{
              position: "relative",
              height: HOURS.length * ROW_H,
              cursor: isDragging ? "grabbing" : "default",
            }}
          >
            {isToday && (
              <div
                style={{
                  position: "absolute",
                  left: 56,
                  right: 0,
                  top:
                    (now.getHours() - START_H + now.getMinutes() / 60) * ROW_H,
                  height: 0,
                  borderTop: `2px dashed ${TOKENS.danger}`,
                  pointerEvents: "none",
                  zIndex: 60,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -8,
                    top: -7,
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: TOKENS.danger,
                    boxShadow: `0 0 12px ${TOKENS.danger}`,
                  }}
                />
                {/* Hora "ahora" en la columna de horas (gutter), no sobre las citas:
                antes iba a left:8 dentro de la rejilla y tapaba la esquina de la
                cita en curso. La linea discontinua + el punto rojo ya marcan el
                ahora; aqui solo la hora, alineada a la derecha del gutter. */}
                <div
                  style={{
                    position: "absolute",
                    left: -56,
                    top: -8,
                    width: 50,
                    textAlign: "right",
                    fontSize: 9.5,
                    fontWeight: 800,
                    color: TOKENS.danger,
                    background: TOKENS.bg,
                    padding: "1px 4px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {now.getHours().toString().padStart(2, "0")}:
                  {now.getMinutes().toString().padStart(2, "0")}
                </div>
              </div>
            )}
            {dropSlot &&
              drag &&
              (() => {
                const dropProf = profesionales[dropSlot.profIndex];
                const dropColor = dropProf?.color || TOKENS.primary;
                const dropTop = (dropSlot.minutesFromStart / 60) * ROW_H;
                const dropLeft = 56 + dropSlot.profIndex * dropSlot.colW;
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
                let finalWidth = dropSlot.colW - 8;

                if (host) {
                  // Find host's lane and totalLanes
                  const hostLane = host._lane ?? 0;
                  const hostTotalLanes = host._totalLanes ?? 1;

                  // Host bounds in percent of the column
                  const hostL = (hostLane / hostTotalLanes) * dropSlot.colW;
                  const hostW = dropSlot.colW / hostTotalLanes;

                  // Nested bounds inside the host (insets simetricos, igual que el render real)
                  const NEST_INSET_L = 13,
                    NEST_INSET_R = 13;
                  const nLane = 0; // assume first lane for preview
                  const nTotal = 1; // assume 1 total nested for preview
                  const nArea = 100 - NEST_INSET_L - NEST_INSET_R;
                  const nW = nArea / nTotal;

                  const nestL =
                    hostL + ((NEST_INSET_L + nLane * nW) * hostW) / 100;
                  const nestW = (hostW * nArea) / 100 / nTotal;

                  finalLeft = 56 + dropSlot.profIndex * dropSlot.colW + nestL;
                  finalWidth = nestW - 6;

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
                  const bandColor = cabe ? "#22c55e" : "#f59e0b";
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
                        zIndex: 5,
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
                        {String(START_H + Math.floor(dropSlot.minutesFromStart / 60)).padStart(2, "0")}:
                        {String(dropSlot.minutesFromStart % 60).padStart(2, "0")}
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
                  gridTemplateColumns: `56px repeat(${profesionales.length || 1}, 1fr)`,
                  borderBottom: `1px solid rgba(0,0,0,0.04)`,
                  height: ROW_H,
                  boxSizing: "border-box",
                  background: idx % 2 === 0 ? "#ffffff" : "#fafafa",
                }}
              >
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 50,
                    background: idx % 2 === 0 ? "#ffffff" : "#fafafa",
                    borderRight: `1px solid rgba(0,0,0,0.06)`,
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
                          borderTop:
                            mm === 30
                              ? `1px solid rgba(0,0,0,0.04)`
                              : `1px solid rgba(0,0,0,0.02)`,
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
                {profesionales.map((p: any) => (
                  <div
                    key={`${h}-${p.id}`}
                    style={{
                      borderLeft: `1px solid rgba(40,30,24,0.14)`,
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
                              theme?.primarySoft
                                ? theme.primarySoft
                                : "rgba(244,80,30,0.09)";
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
                              color: theme?.primary ? theme.primary : "#e0340e",
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
                ))}
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
              }}
            >
              {profesionales.map((prof: any) => {
                const profColor = prof.color || TOKENS.primary;
                // IMPORTANTE: color SOLIDO, no gradiente. Abajo se usa como parada
                // de color dentro de otro linear-gradient (bloques con reposo);
                // si aqui hubiera un gradiente, ese CSS es invalido y el bloque
                // se queda sin fondo (se veia "sin color").
                const citaBg = `${profColor}1f`;
                const citaBorder = `${profColor}33`;
                const citaBorderHover = `${profColor}66`;
                const citaShadow = `0 4px 12px -2px rgba(0,0,0,0.04), 0 2px 4px -2px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px ${profColor}1a`;
                const citaShadowHover = `0 12px 20px -4px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6), 0 0 0 1px ${profColor}33`;
                const profCitas = citasWithLanes.filter(
                  (c: any) => c.profesional_id === prof.id,
                );
                return (
                  <div
                    key={prof.id}
                    style={{ position: "relative", pointerEvents: "none" }}
                  >
                    {(bloqueos as any[])
                      .filter((b: any) => {
                        if (b.profesional_id !== prof.id) return false;
                        const dayStart = new Date(selectedDateObj);
                        dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(selectedDateObj);
                        dayEnd.setHours(23, 59, 59, 999);
                        return (
                          new Date(b.inicio) <= dayEnd &&
                          new Date(b.fin) >= dayStart
                        );
                      })
                      .map((b: any) => {
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
                        return (
                          <div
                            key={b.id}
                            style={{
                              position: "absolute",
                              top: blockTop,
                              left: 2,
                              right: 2,
                              height: blockHeight,
                              background: `repeating-linear-gradient(45deg, ${bColor}14, ${bColor}14 4px, transparent 4px, transparent 10px)`,
                              backgroundColor: `${bColor}0a`,
                              borderLeft: `3px solid ${bColor}99`,
                              borderRadius: 6,
                              pointerEvents: "none",
                              zIndex: 1,
                              padding: "4px 6px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                color: TOKENS.text,
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {BLOQUEO_LABELS[b.tipo] || b.tipo}
                            </div>
                            {b.motivo && blockHeight > 32 && (
                              <div
                                style={{
                                  fontSize: 9,
                                  color: TOKENS.textSec,
                                  marginTop: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {b.motivo}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {[...profCitas]
                      .sort(
                        (a: any, b: any) =>
                          new Date(b.inicio).getTime() -
                          new Date(a.inicio).getTime(),
                      )
                      .map((cita: any) => {
                        const start = new Date(cita.inicio);
                        const end = new Date(cita.fin);
                        const startH =
                          start.getHours() + start.getMinutes() / 60;
                        const durH =
                          (end.getTime() - start.getTime()) / (1000 * 60 * 60);
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
                        const NEST_INSET_L = 13,
                          NEST_INSET_R = 13;
                        const nArea = 100 - NEST_INSET_L - NEST_INSET_R;
                        const nLane = cita._nestedLane ?? 0;
                        const nTotal = cita._nestedTotal ?? 1;
                        const nW = nArea / nTotal;
                        const nestL =
                          hostL + ((NEST_INSET_L + nLane * nW) * hostW) / 100;
                        const nestR =
                          100 -
                          (hostL +
                            ((NEST_INSET_L + (nLane + 1) * nW) * hostW) / 100);
                        const nestedLeft = `calc(${nestL}% + 6px)`;
                        const nestedRight = `calc(${nestR}% + 6px)`;
                        const cancelada = cita.estado === CITA_STATUS.CANCELADA;
                        // El fondo del bloque lleva SIEMPRE el color del
                        // profesional, tenga reposo o no. Antes los estados
                        // completada/no-presentada lo pisaban (verde/ambar) y las
                        // citas terminadas salian todas verdes. El estado se
                        // distingue por el borde y la etiqueta, no tinendo el bloque.
                        const actualCitaBg = cancelada
                          ? "rgba(226,59,52,0.04)"
                          : nested
                            ? "#ffffff"
                            : citaBg;
                        const actualCitaBorder = nested
                          ? "rgba(34,197,94,0.45)"
                          : cita.estado === "confirmada"
                            ? "#fb923c"
                            : citaBorder;
                        const actualCitaBorderHover = nested
                          ? "rgba(34,197,94,0.85)"
                          : cita.estado === "confirmada"
                            ? "#ea580c"
                            : citaBorderHover;
                        const actualCitaShadow = nested
                          ? "0 6px 16px rgba(40,30,24,0.16), 0 1px 3px rgba(40,30,24,0.08)"
                          : citaShadow;
                        const actualCitaShadowHover = nested
                          ? "0 10px 22px rgba(40,30,24,0.24), 0 2px 6px rgba(40,30,24,0.12)"
                          : citaShadowHover;
                        const isChained = !!cita.grupo_id;
                        const chainSiblings = isChained
                          ? citasWithLanes.filter(
                              (c: any) => c.grupo_id === cita.grupo_id,
                            )
                          : [];
                        const chainTotal = chainSiblings.length;
                        const chainPos = isChained
                          ? (cita.orden_en_grupo ?? 0) + 1
                          : 0;
                        const finActiva = cita.fin_activa
                          ? new Date(cita.fin_activa)
                          : null;
                        const finEspera = cita.fin_espera
                          ? new Date(cita.fin_espera)
                          : null;
                        const activaPx = finActiva
                          ? ((finActiva.getTime() - start.getTime()) /
                              (1000 * 60 * 60)) *
                            ROW_H
                          : height;
                        const esperaPx =
                          finActiva && finEspera
                            ? ((finEspera.getTime() - finActiva.getTime()) /
                                (1000 * 60 * 60)) *
                              ROW_H
                            : 0;
                        const hasEspera = esperaPx > 2;
                        const srv = servicioMap?.get(cita.servicio_id);
                        const cat = srv
                          ? (categorias || []).find(
                              (cc: any) => cc.id === srv.categoria_id,
                            )
                          : null;
                        const catColor = cat
                          ? categoryColorHex(cat.color)
                          : null;
                        const catName = cat?.nombre || "";
                        const stripeColor = catColor || profColor;
                        return (
                          <div
                            key={cita.id}
                            style={{
                              position: "absolute",
                              top,
                              left: nested
                                ? nestedLeft
                                : `calc(${(lane / totalLanes) * 100}% + 4px)`,
                              right: nested
                                ? nestedRight
                                : `calc(${((totalLanes - lane - 1) / totalLanes) * 100}% + 4px)`,
                              height,
                              boxSizing: "border-box",
                              pointerEvents: "auto",
                              zIndex: nested ? 15 : 10,
                              background: cancelada
                                ? "linear-gradient(180deg, #3a3a3a18, #2a2a2a10)"
                                : (hasEspera && !nested)
                                  ? `linear-gradient(to bottom, ${actualCitaBg} 0px, ${actualCitaBg} ${activaPx}px, transparent ${activaPx}px, transparent ${activaPx + esperaPx}px, ${actualCitaBg} ${activaPx + esperaPx}px, ${actualCitaBg} 100%)`
                                  : actualCitaBg,
                              borderWidth: 1,
                              borderStyle: "solid",
                              borderColor: cancelada
                                ? "#55555540"
                                : actualCitaBorder,
                              borderLeft: cancelada
                                ? `${totalLanes > 1 || (profesionales?.length || 1) >= 2 ? 2 : 4}px solid #66666660`
                                : `${totalLanes > 1 || (profesionales?.length || 1) >= 2 ? 2 : 4}px solid ${stripeColor}`,
                              borderTop:
                                isChained && !cancelada
                                  ? `2px solid #e0340e`
                                  : undefined,
                              borderRadius: height <= 32 ? 6 : 12,
                              padding: height <= 16 ? "0px 4px" : height <= 32 ? "2px 4px" : "6px 8px",
                              overflow: "hidden",
                              cursor: isDragging ? "grabbing" : "grab",
                              display: "flex",
                              flexDirection: "column",
                              gap: height <= 32 ? 0 : height < 60 ? 1 : 2,
                              boxShadow: cancelada ? "none" : actualCitaShadow,
                              transition:
                                drag?.cita.id === cita.id
                                  ? "none"
                                  : "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                              transform: "scale(1)",
                              opacity: cancelada
                                ? 0.45
                                : drag?.cita.id === cita.id
                                  ? 0.25
                                  : 1,
                            }}
                            onMouseDown={(e) => {
                              if (!cancelada) startDrag(cita, e);
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "scale(1.05)";
                              e.currentTarget.style.boxShadow = cancelada
                                ? "none"
                                : actualCitaShadowHover;
                              e.currentTarget.style.borderColor = cancelada
                                ? "#77777770"
                                : actualCitaBorderHover;
                              e.currentTarget.style.borderLeftColor = cancelada
                                ? "#66666660"
                                : stripeColor;
                              if (isChained && !cancelada)
                                e.currentTarget.style.borderTop =
                                  "2px solid #e0340e";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "scale(1)";
                              e.currentTarget.style.boxShadow = cancelada
                                ? "none"
                                : actualCitaShadow;
                              e.currentTarget.style.borderColor = cancelada
                                ? "#55555540"
                                : actualCitaBorder;
                              e.currentTarget.style.borderLeftColor = cancelada
                                ? "#66666660"
                                : stripeColor;
                              if (isChained && !cancelada)
                                e.currentTarget.style.borderTop =
                                  "2px solid #e0340e";
                            }}
                          >
                            {hasEspera &&
                              !cancelada &&
                              (() => {
                                const reposoMin = Math.round(
                                  (esperaPx / ROW_H) * 60,
                                );
                                const hayActiva2 = !!(
                                  finEspera && finEspera < end
                                );
                                const hasNested = profCitas.some(
                                  (c: any) =>
                                    c._hostId === cita.id &&
                                    c.estado !== CITA_STATUS.CANCELADA,
                                );
                                return (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: activaPx,
                                      left: 0,
                                      right: 0,
                                      height: esperaPx,
                                      pointerEvents: "none",
                                      zIndex: 1,
                                      background: "transparent",
                                      borderTop: `1px dashed ${stripeColor}`,
                                      borderBottom: hayActiva2
                                        ? `1px dashed ${stripeColor}`
                                        : "none",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {!hasNested && esperaPx >= 16 && (
                                      <span
                                        style={{
                                          padding: "1px 8px",
                                          borderRadius: 999,
                                          background: "rgba(255,255,255,0.72)",
                                          fontSize: 9,
                                          fontWeight: 600,
                                          letterSpacing: 0.4,
                                          textTransform: "uppercase",
                                          color: TOKENS.textTer,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        Libre {reposoMin}′
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            {(() => {
                              const narrow = height < 50;
                              const nombreCliente =
                                clienteMap?.get(cita.cliente_id)?.nombre || "-";
                              const nombreServicio =
                                servicioMap?.get(cita.servicio_id)?.nombre ||
                                "";
                              const timeStr = `${start.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}`;
                              const timeStrCompact =
                                totalLanes > 1 || height <= 32
                                  ? start.toLocaleTimeString(LOCALE, {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : timeStr;
                              const badgeColor = catColor || profColor;
                              const catIconChip = cat?.icono
                                ? getCategoryIcon(
                                    cat.icono,
                                    badgeColor,
                                    narrow ? 11 : 12,
                                  )
                                : null;
                              const iniciales =
                                nombreCliente
                                  .split(/\s+/)
                                  .map((w: string) => w[0])
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase() || "·";
                              const estrecho =
                                totalLanes > 1 ||
                                (selectedProf === "todos" &&
                                  (profesionales?.length || 1) >= 2) ||
                                (profesionales?.length || 1) >= 5;
                              const isSmallOrNarrow = height <= 32 || estrecho;
                              const identidad = isSmallOrNarrow ? iniciales : nombreCliente;

                              const esCompletada =
                                cita.estado === CITA_STATUS.COMPLETADA;
                              const esNoShow =
                                cita.estado === CITA_STATUS.NO_PRESENTADA;
                              let icon: any = null;
                              if (!cancelada && !esNoShow && completarManual) {
                                if (esCompletada) {
                                  icon = (
                                    <div
                                      title="Desmarcar completada"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleCompletada(cita.id, cita.estado);
                                      }}
                                      style={{
                                        width: 44,
                                        height: 44,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                        margin: "-14px",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: 16,
                                          height: 16,
                                          borderRadius: 999,
                                          background: "#0f9d6b",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          color: "#fff",
                                          flexShrink: 0,
                                          transition: "all 0.15s ease",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background =
                                            "#0c7d55";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background =
                                            "#0f9d6b";
                                        }}
                                      >
                                        <svg
                                          width="10"
                                          height="10"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="3.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      </div>
                                    </div>
                                  );
                                } else {
                                  icon = (
                                    <div
                                      title="Marcar como completada"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleCompletada(cita.id, cita.estado);
                                      }}
                                      style={{
                                        width: 44,
                                        height: 44,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                        margin: "-14px",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: 16,
                                          height: 16,
                                          borderRadius: 999,
                                          border: `2px solid ${TOKENS.borderHi}`,
                                          background: "transparent",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          flexShrink: 0,
                                          transition: "all 0.15s ease",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.borderColor =
                                            "#0f9d6b";
                                          e.currentTarget.style.background =
                                            "rgba(15,157,107,0.15)";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.borderColor =
                                            TOKENS.borderHi;
                                          e.currentTarget.style.background =
                                            "transparent";
                                        }}
                                      />
                                    </div>
                                  );
                                }
                              }

                              const chainBadge = isChained ? (
                                <span
                                  style={{
                                    fontSize: 8,
                                    fontWeight: 700,
                                    background: "rgba(192,38,10,0.25)",
                                    color: "#e0340e",
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                    flexShrink: 0,
                                    letterSpacing: 0.3,
                                  }}
                                >
                                  {chainPos}/{chainTotal}
                                </span>
                              ) : null;

                              const addonsNames = (citaAddonsMap[cita.id] || [])
                                .map((ca: any) => ca.service_addons?.nombre)
                                .filter(Boolean);
                              const addonsStr = addonsNames.length > 0 ? '+ ' + addonsNames.join(', ') : '';

                              if (narrow || estrecho || height <= 32) {
                                const effectiveLanes = nested
                                  ? cita._nestedTotal || 1
                                  : totalLanes;
                                const superNarrow =
                                  height <= 24 || effectiveLanes >= 3;
                                const badgePx = superNarrow
                                  ? 15
                                  : estrecho
                                    ? 24
                                    : 18;
                                const isCol = estrecho && !narrow;
                                return (
                                  <div
                                    style={{
                                      position: "relative",
                                      zIndex: 2,
                                      display: "flex",
                                      flexDirection: isCol ? "column" : "row",
                                      alignItems: isCol
                                        ? "flex-start"
                                        : "center",
                                      // En columna el contenido va arriba. El "center" de antes no
                                      // se notaba porque el nombre llevaba flex:1 y llenaba el alto.
                                      justifyContent: "flex-start",
                                      gap: isCol ? 2 : 5,
                                      overflow: "hidden",
                                      height: "100%",
                                      padding: isCol ? "0 2px" : 0,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                    >
                                      {/* Removed initials badge as requested */}
                                      {catIconChip && !superNarrow && (
                                        <span
                                          style={{
                                            display: "inline-flex",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {catIconChip}
                                        </span>
                                      )}
                                    </div>
                                    {!superNarrow && (
                                      <span
                                        style={{
                                          fontSize: estrecho ? 9.5 : 10,
                                          fontWeight: 700,
                                          color: cancelada
                                            ? TOKENS.textTer
                                            : TOKENS.textSec,
                                          flexShrink: 0,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {timeStrCompact}
                                      </span>
                                    )}
                                      <span
                                        style={{
                                          fontSize: 11,
                                          fontWeight: 700,
                                          color: cancelada
                                            ? TOKENS.textTer
                                            : TOKENS.text,
                                          // En fila, flex:1 le da el ancho sobrante (para el ellipsis).
                                          // En columna crecia en ALTURA y estiraba el fondo blanco
                                          // hasta el fondo del bloque: ahi se cine al contenido.
                                          flex: isCol ? "0 1 auto" : 1,
                                          maxWidth: isCol ? "100%" : undefined,
                                          minWidth: 0,
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          display: "-webkit-box",
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: "vertical",
                                          whiteSpace: "normal",
                                          wordBreak: "break-word",
                                          textDecoration: cancelada
                                            ? "line-through"
                                            : "none",
                                          background: cancelada
                                            ? "transparent"
                                            : TOKENS.bgCard,
                                          border: cancelada
                                            ? "none"
                                            : `1px solid ${TOKENS.borderHi}`,
                                          padding: cancelada ? 0 : "2px 5px",
                                          borderRadius: 6,
                                          boxShadow: cancelada ? "none" : "0 1px 3px rgba(0,0,0,0.08)",
                                        }}
                                      >
                                        {`${nombreCliente}${nombreServicio ? ` · ${nombreServicio}` : ""}`}
                                      </span>
                                    {isCol && (
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: 4,
                                          alignItems: "center",
                                        }}
                                      >
                                        {cita.estado === "Confirmada" && (
                                          <Icon name="check" size={10} color={TOKENS.success} />
                                        )}
                                        {clienteMap?.get(cita.cliente_id)?.tag === "VIP" && (
                                          <Icon name="star" size={10} color={TOKENS.warning} />
                                        )}
                                        {clienteMap?.get(cita.cliente_id)?.tag === "Habitual" && (
                                          <Icon name="star" size={10} color={TOKENS.primary} />
                                        )}
                                        {chainBadge}
                                        {icon}
                                      </div>
                                    )}
                                    {!isCol && (
                                      <>
                                        {chainBadge}
                                        {icon}
                                      </>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <div
                                  style={{
                                    position: "relative",
                                    zIndex: 6,
                                    minWidth: 0,
                                    display: "flex",
                                    gap: 7,
                                    height: "100%",
                                    overflow: "hidden",
                                  }}
                                >
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      background: cancelada
                                        ? "#99999955"
                                        : badgeColor,
                                      display: "grid",
                                      placeItems: "center",
                                      color: "#fff",
                                      fontSize: 11,
                                      fontWeight: 800,
                                      marginTop: 1,
                                    }}
                                    title={
                                      catName
                                        ? `${catName} · ${nombreCliente}`
                                        : nombreCliente
                                    }
                                  >
                                    {iniciales}
                                  </span>
                                  <div
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: height < 64 ? 0 : 1,
                                      position: "relative",
                                      zIndex: 6,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 6,
                                      }}
                                    >
                                      {height > 24 && (
                                        <span
                                          style={{
                                            fontSize: 11.5,
                                            color: cancelada
                                              ? TOKENS.textTer
                                              : TOKENS.textSec,
                                            fontWeight: 700,
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {height <= 32 ? timeStrCompact : timeStr}
                                        </span>
                                      )}
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 4,
                                          flexShrink: 0,
                                        }}
                                      >
                                        {chainBadge}
                                        {icon}
                                      </div>
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: height < 30 ? 0 : 2,
                                        width: "100%",
                                        overflow: "hidden"
                                      }}
                                    >
                                      <div
                                        onMouseDown={(e) => {
                                          if (onClienteHistorial) e.stopPropagation();
                                        }}
                                        onClick={(e) => {
                                          if (onClienteHistorial) {
                                            e.stopPropagation();
                                            const cli = clientes.find((cl: any) => cl.id === cita.cliente_id);
                                            if (cli) onClienteHistorial(cli);
                                          }
                                        }}
                                        style={{
                                          background: cancelada ? "transparent" : TOKENS.bgCard,
                                          border: cancelada ? "none" : `1px solid ${badgeColor}60`,
                                          borderLeft: cancelada ? "none" : `4px solid ${badgeColor}`,
                                          padding: height < 30 ? "1px 4px" : "3px 6px",
                                          borderRadius: 6,
                                          boxShadow: cancelada ? "none" : "0 1px 3px rgba(0,0,0,0.08)",
                                          width: "fit-content",
                                          maxWidth: "100%",
                                          fontSize: height < 30 ? 11 : 12,
                                          lineHeight: height < 30 ? "1.1" : "1.2",
                                          fontWeight: 700,
                                          color: cancelada ? TOKENS.textTer : TOKENS.text,
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          textDecoration: cancelada ? "line-through" : "none",
                                          cursor: onClienteHistorial ? "pointer" : "default",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 4,
                                        }}
                                        title="Ver historial de este cliente"
                                      >
                                        {identidad}
                                        {cita.encadenadoId && !cancelada && (
                                          <Icon name="link" size={12} color={TOKENS.primary} />
                                        )}
                                        {(cita.fin_activa || cita.fin_espera) && !cancelada && (
                                          <Icon name="coffee" size={12} color="#f59e0b" />
                                        )}
                                      </div>
                                      {height > 32 && (
                                        <div
                                          style={{
                                            fontSize: 10,
                                            color: TOKENS.textSec,
                                            whiteSpace: "normal",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            display: "flex",
                                            alignItems: "flex-start",
                                            gap: 4,
                                          }}
                                        >
                                          {catIconChip ? (
                                            <span style={{ display: "inline-flex", flexShrink: 0, marginTop: 2 }} title={catName}>
                                              {catIconChip}
                                            </span>
                                          ) : (
                                            catColor && (
                                              <span style={{ width: 6, height: 6, borderRadius: 999, background: catColor, flexShrink: 0, marginTop: 4 }} title={catName} />
                                            )
                                          )}
                                          <span
                                            style={{
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              display: "-webkit-box",
                                              WebkitLineClamp: 2,
                                              WebkitBoxOrient: "vertical",
                                              wordBreak: "break-word",
                                            }}
                                          >
                                            {nombreServicio || (cita.servicio_id ? "Servicio eliminado" : "Sin servicio")}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    {addonsStr && height >= 64 && (
                                      <div
                                        style={{
                                          fontSize: 9,
                                          color: "#10b981",
                                          fontWeight: 600,
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                        }}
                                      >
                                        {addonsStr}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Ghost element — sigue al cursor durante el arrastre */}
      {drag && (
        <div
          style={{
            position: "fixed",
            top: drag.ghostY,
            left: drag.ghostX,
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
            background: "rgba(239,68,68,0.95)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(239,68,68,0.4)",
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
                background: "#fef2f2",
                padding: "18px 24px",
                borderBottom: `1px solid #fee2e2`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: TOKENS.danger,
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
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div
                  style={{
                    fontSize: 15.5,
                    fontWeight: 800,
                    color: TOKENS.danger,
                  }}
                >
                  Ausencia Detectada
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
              A las{" "}
              <b style={{ color: TOKENS.danger }}>{dragAusencia.horaTxt}</b>,{" "}
              {dragAusencia.profNombre?.split(" ")[0]} figura con vacaciones o
              un bloqueo.
              <br />
              <br />
              No puedes agendar citas durante este periodo.
            </div>
            <div
              style={{
                padding: "16px 24px",
                background: TOKENS.bgCard,
                borderTop: `1px solid ${TOKENS.border}`,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setDragAusencia(null)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: TOKENS.danger,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CitaEstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { label: string; color: string; soft: string }> = {
    confirmada: {
      label: "Confirmada",
      color: TOKENS.success,
      soft: "rgba(15,157,107,0.12)",
    },
    completada: {
      label: "Completada",
      color: "#22c55e",
      soft: "rgba(34,197,94,0.12)",
    },
    cancelada: {
      label: "Cancelada",
      color: TOKENS.danger,
      soft: "rgba(226,59,52,0.12)",
    },
    no_presentada: {
      label: "No presentada",
      color: "#f59e0b",
      soft: "rgba(245,158,11,0.15)",
    },
  };
  const m = map[estado] || {
    label: estado,
    color: TOKENS.textTer,
    soft: TOKENS.border,
  };
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
      const citaStart = new Date(cita.inicio).getTime();
      const citaEnd = new Date(cita.fin).getTime();

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
                      {srv ?? "Servicio"}
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
                        {prof.nombre.split(" ")[0]}
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

function NewCitaModal({
  onClose,
  onSaved,
  selectedDate,
  prefillHora,
  prefillProf,
  prefillClienteId,
  prefillServicioId,
  prefillNotas,
  prefillWaitlistId,
}: any) {
  const { triggerRefresh } = useCalendarRefresh();
  const { isMobile, isTablet } = useResponsive();
  const [clientes, setClientes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [citasHoy, setCitasHoy] = useState<any[]>([]);
  const [selectedCliente, setSelectedCliente] = useState(
    prefillClienteId || "",
  );
  const [selectedServicio, setSelectedServicio] = useState(
    prefillServicioId || "",
  );
  const [selectedProf, setSelectedProf] = useState(prefillProf || "");
  const [selectedHora, setSelectedHora] = useState<string>("");
  // Hueco elegido con un clic en la rejilla: se respeta hasta que la cita queda definida
  const prefillRef = useRef<{ hora?: string } | null>(
    prefillHora ? { hora: prefillHora } : null,
  );
  const [horaPersonalizada, setHoraPersonalizada] = useState<string>("");
  const [useCustomHora, setUseCustomHora] = useState(false);
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [duracionOverride, setDuracionOverride] = useState<any>(null);

  // States para la búsqueda visual (Sesión 13 B)
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState("");
  const fileVisionRef = useRef<HTMLInputElement | null>(null);
  const [duracionActivaCustom, setDuracionActivaCustom] = useState<
    number | null
  >(null);
  const [duracionEsperaCustom, setDuracionEsperaCustom] = useState<
    number | null
  >(null);
  const [duracionActivaExtraCustom, setDuracionActivaExtraCustom] = useState<
    number | null
  >(null);
  // Duracion real aprendida por clienta+servicio (Sesion 4): sugerencia derivada del
  // historial, no imposicion. Se rellena al elegir clienta y servicio.
  const [durSugerida, setDurSugerida] = useState<
    import("@/lib/retrasos").DuracionAprendida | null
  >(null);
  const [durSugAplicada, setDurSugAplicada] = useState(false);
  const [profOverrides, setProfOverrides] = useState<any[]>([]);
  // Al elegir clienta + servicio, aprende su duracion real del historial y la sugiere.
  useEffect(() => {
    let cancel = false;
    setDurSugerida(null);
    setDurSugAplicada(false);
    if (!selectedCliente || !selectedServicio) return;
    const srv = servicios.find((s: any) => s.id === selectedServicio);
    if (!srv) return;
    const catTotal =
      (srv.duracion_activa_min || 0) +
      (srv.duracion_espera_min || 0) +
      (srv.duracion_activa_extra_min || 0);
    (async () => {
      let q = supabase
        .from("citas")
        .select("inicio, fin, estado, servicio_id")
        .eq("cliente_id", selectedCliente)
        .eq("servicio_id", selectedServicio)
        .in("estado", ["completada", "confirmada"])
        .order("inicio", { ascending: false })
        .limit(20);
      if (negocioId) q = q.eq("negocio_id", negocioId);
      const { data } = await q;
      if (cancel) return;
      const hist: CitaHistorial[] = (data || []).map((c: any) => ({
        servicio_id: c.servicio_id,
        inicio: c.inicio,
        fin: c.fin,
        estado: c.estado,
      }));
      setDurSugerida(
        duracionRealAprendida(hist, selectedServicio, catTotal || 30),
      );
    })();
    return () => {
      cancel = true;
    };
  }, [selectedCliente, selectedServicio, servicios, negocioId]);
  const [errMsg, setErrMsg] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Cita recurrente: repetir cada N semanas, M veces (serie). Solo para reserva simple
  // (1 servicio, sin encadenar, sin senal): las cadenas multiprofesional quedan fuera.
  const [repetir, setRepetir] = useState(false);
  const [repetirCada, setRepetirCada] = useState(1); // cada N semanas
  const [repetirVeces, setRepetirVeces] = useState(4); // total de citas de la serie
  const [bloqueosProfHoy, setBloqueosProfHoy] = useState<any[]>([]);
  const [showCreateCliente, setShowCreateCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState("");
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [clienteSearch, setClienteSearch] = useState("");
  const [servicioSearch, setServicioSearch] = useState("");
  const [historialClienteServicios, setHistorialClienteServicios] = useState<{top: string[], last: string[]}>({top: [], last: []});

  // Buscar servicios más frecuentes del cliente
  useEffect(() => {
    let cancel = false;
    setHistorialClienteServicios({top: [], last: []});
    if (!selectedCliente) return;
    (async () => {
      let q = supabase
        .from("citas")
        .select("servicio_id")
        .eq("cliente_id", selectedCliente)
        .in("estado", ["completada", "confirmada"])
        .order("inicio", { ascending: false })
        .limit(50);
      if (negocioId) q = q.eq("negocio_id", negocioId);
      const { data } = await q;
      if (cancel || !data) return;
      
      const counts: Record<string, number> = {};
      data.forEach((c: any) => {
        if (c.servicio_id) {
          counts[c.servicio_id] = (counts[c.servicio_id] || 0) + 1;
        }
      });
      const topServices = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);
      
      const lastServices = Array.from(new Set(data.map((c: any) => c.servicio_id).filter(Boolean))).slice(0, 3) as string[];
      
      setHistorialClienteServicios({ top: topServices, last: lastServices });
    })();
    return () => {
      cancel = true;
    };
  }, [selectedCliente, negocioId]);

  // Cita anonima ("invitado"): permite guardar sin ficha de cliente. Es opt-in
  // explicito para no crear citas sin cliente por descuido.
  const [sinCliente, setSinCliente] = useState(false);
  const [citasConfirmadas, setCitasConfirmadas] = useState<any[]>([]);
  const citasConfirmadasRef = useRef<any[]>([]);
  citasConfirmadasRef.current = citasConfirmadas;
  const [allDurOverrides, setAllDurOverrides] = useState<any[]>([]);
  const [addonsDisponibles, setAddonsDisponibles] = useState<any[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [allProfSrvOverrides, setAllProfSrvOverrides] = useState<any[]>([]);
  // Servicio puntual: crear al vuelo un servicio rápido para un caso extraordinario
  // (p. ej. cuando el responsable no está) sin salir de la cita. Se guarda en el
  // catálogo marcado como es_puntual para poder listarlo aparte en Configuración.
  const [showPuntual, setShowPuntual] = useState(false);
  const [puntualNombre, setPuntualNombre] = useState("");
  const [puntualPrecio, setPuntualPrecio] = useState("");
  const [puntualDuracion, setPuntualDuracion] = useState("30");
  const [guardandoPuntual, setGuardandoPuntual] = useState(false);
  const [puntualErr, setPuntualErr] = useState("");
  const today = selectedDate || new Date();

  // --- Demo guiada: el recorrido de demo.html pide rellenar el formulario paso a
  // paso (cliente -> servicio -> hora) y enfocar cada zona con un spotlight. El
  // modal escucha las sub-acciones (cita-cliente / cita-servicio / cita-hora /
  // cita-reposo), auto-selecciona valores de ejemplo y marca la zona a iluminar.
  const [demoZone, setDemoZone] = useState<
    "cliente" | "servicio" | "hora" | "reposo" | null
  >(null);
  const clienteZoneRef = useRef<HTMLElement | null>(null);
  const servicioZoneRef = useRef<HTMLElement | null>(null);
  const horaZoneRef = useRef<HTMLElement | null>(null);
  const pendingDemoRef = useRef<string | null>(null);
  const dataRef = useRef<{
    clientes: any[];
    servicios: any[];
    profesionales: any[];
  }>({ clientes: [], servicios: [], profesionales: [] });
  dataRef.current = { clientes, servicios, profesionales };

  // Elige un hueco del grid de horas (normal o de reposo) cuando ya esta pintado;
  // reintenta un poco porque el grid aparece tras cargar las duraciones.
  const pickDemoSlot = (kind: "hora" | "reposo") => {
    let tries = 0;
    const tryPick = () => {
      tries++;
      const zone = horaZoneRef.current;
      const btn = zone
        ? kind === "reposo"
          ? (zone.querySelector(
              'button[data-slot][data-reposo="1"]',
            ) as HTMLButtonElement | null) ||
            (zone.querySelector(
              "button[data-slot]",
            ) as HTMLButtonElement | null)
          : (zone.querySelector(
              'button[data-slot][data-reposo="0"]',
            ) as HTMLButtonElement | null) ||
            (zone.querySelector(
              "button[data-slot]",
            ) as HTMLButtonElement | null)
        : null;
      if (btn) {
        btn.click();
        return;
      }
      if (tries < 14) setTimeout(tryPick, 170);
    };
    setTimeout(tryPick, 220);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyZone = (action: string) => {
      const d = dataRef.current;
      if (action === "cita-cliente") {
        if (d.clientes[0]) setSelectedCliente(d.clientes[0].id);
        setDemoZone("cliente");
      } else if (action === "cita-servicio") {
        if (d.clientes[0])
          setSelectedCliente((p: any) => p || d.clientes[0].id);
        if (d.servicios[0]) setSelectedServicio(d.servicios[0].id);
        setDemoZone("servicio");
      } else if (action === "cita-hora") {
        if (d.servicios[0])
          setSelectedServicio((p: any) => p || d.servicios[0].id);
        if (d.profesionales[0])
          setSelectedProf((p: string) => p || d.profesionales[0].id);
        setDemoZone("hora");
        pickDemoSlot("hora");
      } else if (action === "cita-reposo") {
        if (d.servicios[0])
          setSelectedServicio((p: any) => p || d.servicios[0].id);
        if (d.profesionales[0])
          setSelectedProf((p: string) => p || d.profesionales[0].id);
        setDemoZone("reposo");
        pickDemoSlot("reposo");
      } else if (action === "cerrar") {
        setDemoZone(null);
      }
    };
    const onDemo = (e: Event) => {
      const action = (e as CustomEvent).detail?.action;
      if (typeof action !== "string") return;
      if (action !== "cerrar" && action.indexOf("cita-") !== 0) return;
      if (action !== "cerrar" && dataRef.current.clientes.length === 0) {
        pendingDemoRef.current = action; // aun cargando: se aplica al llegar los datos
        return;
      }
      applyZone(action);
    };
    window.addEventListener("mecha-demo", onDemo);
    return () => window.removeEventListener("mecha-demo", onDemo);
  }, []);

  // Reaplica la accion guiada que llego antes de tener datos cargados.
  useEffect(() => {
    if (pendingDemoRef.current && clientes.length > 0) {
      const a = pendingDemoRef.current;
      pendingDemoRef.current = null;
      window.dispatchEvent(
        new CustomEvent("mecha-demo", { detail: { action: a } }),
      );
    }
  }, [clientes, servicios, profesionales]);

  // Centra la zona enfocada dentro del modal para que el spotlight la recorte bien.
  useEffect(() => {
    if (!demoZone) return;
    const ref =
      demoZone === "cliente"
        ? clienteZoneRef
        : demoZone === "servicio"
          ? servicioZoneRef
          : horaZoneRef;
    const el = ref.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [demoZone]);

  // Reloj en vivo: muestra la hora actual arriba del formulario como referencia
  // rapida al crear la cita. Se refresca cada 30 s.
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const ahoraStr = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;

  useEffect(() => {
    async function cargar() {
      let negocioId = "prueba_46980";
      const profile = await getUserProfile();
      if (profile?.negocio_id) {
        negocioId = profile.negocio_id;
      }
      setNegocioId(negocioId);
      if (profile?.id) setUserId(profile.id);

      // Construir fecha local sin conversión a UTC
      const todayStr =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(today.getDate()).padStart(2, "0");
      const tomorrow = new Date(today.getTime() + 86400000);
      const tomorrowStr =
        tomorrow.getFullYear() +
        "-" +
        String(tomorrow.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(tomorrow.getDate()).padStart(2, "0");

      const [
        { data: clts, error: cltsErr },
        { data: srvs, error: srvsErr },
        { data: prfs, error: prfsErr },
        { data: cits, error: citsErr },
        { data: durOverrides },
        { data: profSrvOverrides },
        { data: cats },
      ] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, nombre, telefono, alergias")
          .eq("negocio_id", negocioId)
          .order("nombre"),
        supabase
          .from("servicios")
          .select(
            "id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, min_antelacion_min, categoria_id",
          )
          .eq("negocio_id", negocioId)
          .order("nombre"),
        supabase
          .from("profesionales")
          .select("id, nombre, color")
          .eq("negocio_id", negocioId)
          .eq("activo", true),
        supabase
          .from("citas")
          .select(
            "id, inicio, fin, fin_activa, fin_espera, profesional_id, grupo_id, orden_en_grupo",
          )
          .eq("negocio_id", negocioId)
          .gte("inicio", `${todayStr}T00:00:00`)
          .lt("inicio", `${tomorrowStr}T00:00:00`)
          .eq("estado", CITA_STATUS.CONFIRMADA),
        supabase
          .from("duraciones_profesional")
          .select(
            "profesional_id, servicio_id, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min",
          ),
        supabase
          .from("professional_service_overrides")
          .select(
            "professional_id, service_id, duracion, duracion_espera_min, duracion_activa_extra_min, precio, activo",
          ),
        supabase
          .from("categorias_servicio")
          .select("id, nombre, color, orden, icono")
          .eq("negocio_id", negocioId)
          .eq("activo", true)
          .order("orden"),
      ]);

      if (srvsErr) console.error("Servicios error:", srvsErr);
      if (cltsErr) console.error("Clientes error:", cltsErr);
      if (prfsErr) console.error("Profesionales error:", prfsErr);
      if (citsErr) console.error("Citas error:", citsErr);

      setClientes(clts ?? []);
      setServicios(srvs ?? []);
      setCategorias(cats ?? []);
      setProfesionales(prfs ?? []);
      setCitasHoy(cits ?? []);
      setAllDurOverrides(durOverrides ?? []);
      setAllProfSrvOverrides(profSrvOverrides ?? []);
      setLoading(false);
    }
    cargar();
  }, [selectedDate]);

  // Load per-professional duration override when both prof + service are selected
  useEffect(() => {
    const pre = prefillRef.current;
    if (pre?.hora) {
      // Hueco elegido con un clic: lo fijamos como hora personalizada y lo mantenemos
      // hasta que el usuario haya elegido tambien servicio (cita ya definida).
      setUseCustomHora(true);
      setHoraPersonalizada(pre.hora);
      setSelectedHora("");
      if (selectedServicio) prefillRef.current = null;
    } else {
      // Pre-select suggested hora if chaining, otherwise clear
      const confirmed = citasConfirmadasRef.current;
      if (confirmed.length > 0) {
        const lastFin = confirmed[confirmed.length - 1].fin as Date;
        setSelectedHora(
          `${String(lastFin.getHours()).padStart(2, "0")}:${String(lastFin.getMinutes()).padStart(2, "0")}`,
        );
      } else {
        setSelectedHora("");
      }
      setHoraPersonalizada("");
      setUseCustomHora(false);
    }
    if (!selectedProf || !selectedServicio) {
      setDuracionOverride(null);
      setDuracionActivaCustom(null);
      setDuracionEsperaCustom(null);
      setDuracionActivaExtraCustom(null);
      return;
    }
    supabase
      .from("duraciones_profesional")
      .select(
        "duracion_activa_min, duracion_espera_min, duracion_activa_extra_min",
      )
      .eq("profesional_id", selectedProf)
      .eq("servicio_id", selectedServicio)
      .maybeSingle()
      .then(({ data }) => {
        setDuracionOverride(data ?? null);
        setDuracionActivaCustom(null);
        setDuracionEsperaCustom(null);
        setDuracionActivaExtraCustom(null);
      });
  }, [selectedProf, selectedServicio]);

  // Reset confirmed chain when client changes
  useEffect(() => {
    setCitasConfirmadas([]);
  }, [selectedCliente]);

  // Fetch add-ons for the selected service
  useEffect(() => {
    setSelectedAddons([]);
    if (!selectedServicio) {
      setAddonsDisponibles([]);
      return;
    }
    supabase
      .from("service_addons")
      .select("id, nombre, duracion_min, precio")
      .eq("servicio_id", selectedServicio)
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setAddonsDisponibles(data ?? []));
  }, [selectedServicio]);

  useEffect(() => {
    if (!selectedProf) {
      setProfOverrides([]);
      return;
    }
    supabase
      .from("professional_service_overrides")
      .select("*")
      .eq("professional_id", selectedProf)
      .then(({ data }) => {
        const ovs = data ?? [];
        setProfOverrides(ovs);
        setSelectedServicio((prev: any) => {
          if (!prev) return prev;
          const ov = ovs.find((o: any) => o.service_id === prev);
          return ov?.activo === false ? "" : prev;
        });
      });
  }, [selectedProf]);

  useEffect(() => {
    if (!selectedProf || !negocioId) {
      setBloqueosProfHoy([]);
      return;
    }
    const todayStr =
      today.getFullYear() +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");
    const tomorrow = new Date(today.getTime() + 86400000);
    const tomorrowStr =
      tomorrow.getFullYear() +
      "-" +
      String(tomorrow.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(tomorrow.getDate()).padStart(2, "0");
    supabase
      .from("bloqueos_profesional")
      .select("inicio, fin, tipo, motivo")
      .eq("profesional_id", selectedProf)
      .lt("inicio", `${tomorrowStr}T00:00:00`)
      .gt("fin", `${todayStr}T00:00:00`)
      .then(({ data }) => setBloqueosProfHoy(data ?? []));
  }, [selectedProf, negocioId]);

  const servicioActual = servicios.find((s) => s.id === selectedServicio);
  const profServicioOverride = profOverrides.find(
    (o) => o.service_id === selectedServicio,
  );

  const serviciosFiltrados = useMemo(
    () =>
      servicios.filter((s) => {
        const ov = profOverrides.find((o: any) => o.service_id === s.id);
        return ov?.activo !== false;
      }),
    [servicios, profOverrides],
  );

  // Agrupa el selector de servicios por categoria (color de cabecera), orden = categorias_servicio.orden.
  const gruposServicio = useMemo(() => {
    let baseList = selectedProf ? serviciosFiltrados : servicios;
    if (servicioSearch.trim()) {
      baseList = baseList.filter((s: any) =>
        norm(s?.nombre || "").includes(norm(servicioSearch))
      );
    }
    const grupos = categorias
      .map((cat: any) => ({
        key: cat.id,
        nombre: cat.nombre,
        color: cat.color as string | null,
        items: baseList.filter((s: any) => s.categoria_id === cat.id),
      }))
      .filter((g) => g.items.length > 0);
    const sinCategoria = baseList.filter((s: any) => !s.categoria_id);
    if (sinCategoria.length > 0) {
      grupos.push({
        key: "__sin_categoria__",
        nombre: "Sin categoria",
        color: null,
        items: sinCategoria,
      });
    }
    return grupos;
  }, [categorias, selectedProf, serviciosFiltrados, servicios, servicioSearch]);

  // Duration resolution: manual → prof service override → duraciones_profesional → service default
  const duracionActiva =
    duracionActivaCustom ??
    profServicioOverride?.duracion ??
    duracionOverride?.duracion_activa_min ??
    servicioActual?.duracion_activa_min ??
    30;
  const duracionEspera =
    duracionEsperaCustom ??
    profServicioOverride?.duracion_espera_min ??
    duracionOverride?.duracion_espera_min ??
    servicioActual?.duracion_espera_min ??
    0;
  const duracionActivaExtra =
    duracionActivaExtraCustom ??
    profServicioOverride?.duracion_activa_extra_min ??
    duracionOverride?.duracion_activa_extra_min ??
    servicioActual?.duracion_activa_extra_min ??
    0;
  const addonsDuracion = selectedAddons.reduce((sum, aid) => {
    const a = addonsDisponibles.find((x: any) => x.id === aid);
    return sum + (a?.duracion_min ?? 0);
  }, 0);
  const duracionTotal =
    duracionActiva + duracionEspera + duracionActivaExtra + addonsDuracion;

  const horaActual = (useCustomHora && horaPersonalizada) || selectedHora;
  let inicio: Date | null = null;
  let finActiva: Date | null = null;
  let finEspera: Date | null = null;
  let fin: Date | null = null;

  if (horaActual) {
    const [hh, mm] = horaActual.split(":").map(Number);
    inicio = new Date(today);
    inicio.setHours(hh, mm, 0, 0);
    finActiva = new Date(inicio.getTime() + duracionActiva * 60000);
    finEspera = new Date(finActiva.getTime() + duracionEspera * 60000);
    fin = new Date(
      finEspera.getTime() + (duracionActivaExtra + addonsDuracion) * 60000,
    );
  }

  // RN-AG-072: detectar si la hora seleccionada aprovecha un reposo existente
  const citaHostReposo =
    inicio && finActiva && selectedProf
      ? citasHoy.find((c: any) => {
          if (
            c.profesional_id !== selectedProf ||
            !c.fin_activa ||
            !c.fin_espera
          )
            return false;
          const cFinActiva = new Date(c.fin_activa);
          const cFinEspera = new Date(c.fin_espera);
          const cFin = new Date(c.fin);
          const hasSegundaFase = cFinEspera.getTime() < cFin.getTime();
          return (
            inicio! >= cFinActiva &&
            (hasSegundaFase
              ? finActiva! < cFinEspera
              : finActiva! <= cFinEspera)
          );
        })
      : null;

  // Hora sugerida: fin del ultimo servicio confirmado
  const horaSugerida =
    citasConfirmadas.length > 0
      ? (() => {
          const lastFin = citasConfirmadas[citasConfirmadas.length - 1]
            .fin as Date;
          return `${String(lastFin.getHours()).padStart(2, "0")}:${String(lastFin.getMinutes()).padStart(2, "0")}`;
        })()
      : null;

  // Totales agregados (confirmadas + actual)
  const totalPrecioEncadenado = useMemo(() => {
    let total = servicioActual?.precio ?? 0;
    for (const c of citasConfirmadas) {
      total += c.precio ?? 0;
    }
    return total;
  }, [citasConfirmadas, servicioActual]);

  const totalDuracionEncadenado = useMemo(() => {
    let total = duracionTotal;
    for (const c of citasConfirmadas) {
      total +=
        c.durActiva + c.durEspera + c.durActivaExtra + (c.addonsDuracion ?? 0);
    }
    return total;
  }, [citasConfirmadas, duracionTotal]);

  const handleEncadenarServicio = () => {
    if (
      !selectedServicio ||
      !selectedProf ||
      !horaActual ||
      !inicio ||
      !fin ||
      !finActiva ||
      !finEspera
    )
      return;
    const srv = servicios.find((s: any) => s.id === selectedServicio);
    const prof = profesionales.find((p: any) => p.id === selectedProf);
    const nuevaCita = {
      servicioId: selectedServicio,
      profId: selectedProf,
      hora: horaActual,
      servicioNombre: srv?.nombre || "",
      profNombre: prof?.nombre || "",
      profColor: prof?.color || "",
      precio: srv?.precio ?? 0,
      durActiva: duracionActiva,
      durEspera: duracionEspera,
      durActivaExtra: duracionActivaExtra,
      addonsDuracion,
      addons: [...selectedAddons],
      inicio: new Date(inicio),
      finActiva: new Date(finActiva),
      finEspera: new Date(finEspera),
      fin: new Date(fin),
    };
    setCitasConfirmadas([...citasConfirmadas, nuevaCita]);
    // Reset form para siguiente servicio (mantener cliente)
    setSelectedServicio("");
    setSelectedProf("");
    setSelectedHora("");
    setHoraPersonalizada("");
    setUseCustomHora(false);
    setSelectedAddons([]);
    setDuracionOverride(null);
    setDuracionActivaCustom(null);
    setDuracionEsperaCustom(null);
    setDuracionActivaExtraCustom(null);
  };

  const handleGuardar = async () => {
    // Determinar si el form actual tiene un servicio completo
    const formCompleto = !!(
      selectedServicio &&
      selectedProf &&
      horaActual &&
      inicio &&
      fin &&
      finActiva &&
      finEspera
    );
    const totalCitas = citasConfirmadas.length + (formCompleto ? 1 : 0);

    if (totalCitas === 0) {
      setErrMsg("Por favor completa todos los campos");
      return;
    }
    if (!selectedCliente && !sinCliente) {
      setErrMsg('Selecciona un cliente o marca "Sin cliente"');
      return;
    }

    setErrMsg("");
    setGuardando(true);

    try {
      // Construir lista de todas las citas a guardar
      const grupoId = totalCitas > 1 ? crypto.randomUUID() : null;
      const citasAGuardar: any[] = [];
      let ordenIdx = 0;

      // Primero: citas confirmadas
      for (const confirmed of citasConfirmadas) {
        citasAGuardar.push({
          negocio_id: negocioId,
          profesional_id: confirmed.profId,
          servicio_id: confirmed.servicioId,
          cliente_id: selectedCliente || null,
          inicio: confirmed.inicio.toISOString(),
          fin: confirmed.fin.toISOString(),
          fin_activa: confirmed.finActiva.toISOString(),
          fin_espera: confirmed.finEspera.toISOString(),
          estado: CITA_STATUS.CONFIRMADA,
          canal: "manual",
          creado_por: userId,
          ...(grupoId && { grupo_id: grupoId, orden_en_grupo: ordenIdx }),
          _addons: confirmed.addons || [],
        });
        ordenIdx++;
      }

      // Luego: servicio actual del form (si esta completo)
      if (formCompleto) {
        citasAGuardar.push({
          negocio_id: negocioId,
          profesional_id: selectedProf,
          servicio_id: selectedServicio,
          cliente_id: selectedCliente || null,
          inicio: inicio!.toISOString(),
          fin: fin!.toISOString(),
          fin_activa: finActiva!.toISOString(),
          fin_espera: finEspera!.toISOString(),
          estado: CITA_STATUS.CONFIRMADA,
          canal: "manual",
          creado_por: userId,
          ...(grupoId && { grupo_id: grupoId, orden_en_grupo: ordenIdx }),
          _addons: [...selectedAddons],
        });
      }

      // Deposito en reservas del staff: solo en reserva simple (1 cita) con cliente.
      // Si el salon lo exige y el cliente debe senal, pregunta y deja la cita pendiente de pago.
      if (citasAGuardar.length === 1 && selectedCliente) {
        const senalOv = await resolverSenalStaff(
          negocioId,
          selectedCliente,
          citasAGuardar[0].servicio_id,
        );
        if (senalOv) {
          citasAGuardar[0].estado = senalOv.estado;
          citasAGuardar[0].deposito_requerido = true;
          citasAGuardar[0].deposito_importe = senalOv.deposito_importe;
          citasAGuardar[0].senal_enviada = false;
        }
      }

      // Serie recurrente: solo reserva simple (1 cita, sin grupo/encadenado ni senal).
      // La cita base lleva el serie_id; las repeticiones se generan tras el insert base.
      const esRecurrente =
        repetir &&
        repetirVeces > 1 &&
        citasAGuardar.length === 1 &&
        !grupoId &&
        !citasAGuardar[0].deposito_requerido;
      const serieId = esRecurrente ? crypto.randomUUID() : null;
      if (esRecurrente) citasAGuardar[0].serie_id = serieId;

      // Validar cada cita contra DB y entre si
      for (let i = 0; i < citasAGuardar.length; i++) {
        const cita = citasAGuardar[i];
        const cInicio = new Date(cita.inicio);
        const cFinActiva = new Date(cita.fin_activa);
        const cFinEspera = new Date(cita.fin_espera);
        const cFin = new Date(cita.fin);

        // Check bloqueos
        const { data: bloqueos } = await supabase
          .from("bloqueos_profesional")
          .select("tipo, motivo")
          .eq("profesional_id", cita.profesional_id)
          .lt("inicio", cita.fin)
          .gt("fin", cita.inicio);

        if (bloqueos && bloqueos.length > 0) {
          const profName =
            profesionales.find((p: any) => p.id === cita.profesional_id)
              ?.nombre || "Profesional";
          setErrMsg(
            `${profName} no disponible (servicio ${i + 1}): ${bloqueos[0].motivo || bloqueos[0].tipo}`,
          );
          setGuardando(false);
          return;
        }

        // Check horario laboral del profesional (respeta turnos / horario partido)
        const errHorario = await validarHorarioLaboral(
          cita.profesional_id,
          cInicio,
          cFin,
        );
        if (errHorario) {
          const profName =
            profesionales.find((p: any) => p.id === cita.profesional_id)
              ?.nombre || "Profesional";
          setErrMsg(`${profName} (servicio ${i + 1}): ${errHorario}`);
          setGuardando(false);
          return;
        }

        // Check overlap contra DB (ambas fases activas)
        const { data: candidatas } = await supabase
          .from("citas")
          .select("id, inicio, fin_activa, fin_espera, fin")
          .eq("profesional_id", cita.profesional_id)
          .eq("estado", CITA_STATUS.CONFIRMADA)
          .lt("inicio", cita.fin)
          .gt("fin", cita.inicio);

        const solapadas = (candidatas || []).filter((c: any) => {
          const ci = new Date(c.inicio);
          const cfa = new Date(c.fin_activa);
          const cfe = c.fin_espera ? new Date(c.fin_espera) : null;
          const cf = new Date(c.fin);
          if (ci < cFinActiva && cfa > cInicio) return true;
          if (
            cfe &&
            cf.getTime() > cfe.getTime() &&
            cfe < cFinActiva &&
            cf > cInicio
          )
            return true;
          return false;
        });

        if (solapadas.length > 0) {
          const profName =
            profesionales.find((p: any) => p.id === cita.profesional_id)
              ?.nombre || "Profesional";
          setErrMsg(
            `Conflicto: servicio ${i + 1} con ${profName} se solapa con otra cita activa.`,
          );
          setGuardando(false);
          return;
        }

        // Check intra-group overlap (same prof doing multiple services in chain)
        const intraConflict = citasAGuardar.some((prev: any, j: number) => {
          if (j >= i || prev.profesional_id !== cita.profesional_id)
            return false;
          const prevInicio = new Date(prev.inicio);
          const prevFinActiva = new Date(prev.fin_activa);
          return cInicio < prevFinActiva && cFinActiva > prevInicio;
        });
        if (intraConflict) {
          const profName =
            profesionales.find((p: any) => p.id === cita.profesional_id)
              ?.nombre || "Profesional";
          setErrMsg(
            `Conflicto interno: servicio ${i + 1} con ${profName} se solapa con otro servicio del encadenado.`,
          );
          setGuardando(false);
          return;
        }
      }

      // Extraer addons antes de insertar (no es columna de DB)
      const addonsPerCita = citasAGuardar.map((c) => c._addons || []);
      const citasParaDB = citasAGuardar.map(({ _addons, ...rest }) => rest);

      // Insert all citas
      const { data: citasInsertadas, error } = await supabase
        .from("citas")
        .insert(citasParaDB)
        .select();

      setGuardando(false);
      if (error) {
        setErrMsg(mensajeDeError(error, "No se pudo crear la cita."));
        if (grupoId) {
          await supabase.from("citas").delete().eq("grupo_id", grupoId);
        }
        return;
      }

      // Insert add-ons for each cita
      if (citasInsertadas) {
        for (let i = 0; i < citasInsertadas.length; i++) {
          const addons = addonsPerCita[i];
          if (addons.length > 0 && citasInsertadas[i]?.id) {
            await supabase
              .from("cita_addons")
              .insert(
                addons.map((aid: string) => ({
                  cita_id: citasInsertadas[i].id,
                  addon_id: aid,
                })),
              );
          }
        }
      }

      // Serie recurrente: genera las repeticiones (occ 2..M) desplazando la cita base
      // repetirCada semanas cada vez. Cada ocurrencia se valida igual que la base
      // (bloqueo + horario laboral + solape activa-activa en DB); las que chocan se
      // OMITEN y se reportan (no se mueven de hueco: el gestor las coloca a mano).
      if (esRecurrente && citasInsertadas && citasInsertadas.length > 0) {
        const base = citasAGuardar[0];
        const addonsBase: string[] = base._addons || [];
        const bInicio = new Date(base.inicio);
        const bFin = new Date(base.fin);
        const bFinActiva = new Date(base.fin_activa);
        const bFinEspera = new Date(base.fin_espera);
        const durMs = bFin.getTime() - bInicio.getTime();
        const filasSerie: any[] = [];
        const omitidas: string[] = [];

        for (let k = 1; k < repetirVeces; k++) {
          const shift = k * repetirCada * 7 * 86400000;
          const oInicio = new Date(bInicio.getTime() + shift);
          const oFin = new Date(oInicio.getTime() + durMs);
          const oFinActiva = new Date(bFinActiva.getTime() + shift);
          const oFinEspera = new Date(bFinEspera.getTime() + shift);
          const fechaTxt = oInicio.toLocaleDateString(LOCALE, {
            day: "numeric",
            month: "short",
          });

          // Bloqueo del profesional en ese hueco
          const { data: bloq } = await supabase
            .from("bloqueos_profesional")
            .select("id")
            .eq("profesional_id", base.profesional_id)
            .lt("inicio", oFin.toISOString())
            .gt("fin", oInicio.toISOString());
          if (bloq && bloq.length > 0) {
            omitidas.push(fechaTxt);
            continue;
          }

          // Horario laboral (turnos / horario partido)
          const errH = await validarHorarioLaboral(
            base.profesional_id,
            oInicio,
            oFin,
          );
          if (errH) {
            omitidas.push(fechaTxt);
            continue;
          }

          // Solape activa-activa contra citas confirmadas en DB
          const { data: cand } = await supabase
            .from("citas")
            .select("inicio, fin_activa, fin_espera, fin")
            .eq("profesional_id", base.profesional_id)
            .eq("estado", CITA_STATUS.CONFIRMADA)
            .lt("inicio", oFin.toISOString())
            .gt("fin", oInicio.toISOString());
          const choca = (cand || []).some((c: any) => {
            const ci = new Date(c.inicio);
            const cfa = new Date(c.fin_activa);
            return ci < oFinActiva && cfa > oInicio;
          });
          if (choca) {
            omitidas.push(fechaTxt);
            continue;
          }

          filasSerie.push({
            negocio_id: base.negocio_id,
            profesional_id: base.profesional_id,
            servicio_id: base.servicio_id,
            cliente_id: base.cliente_id,
            inicio: oInicio.toISOString(),
            fin: oFin.toISOString(),
            fin_activa: oFinActiva.toISOString(),
            fin_espera: oFinEspera.toISOString(),
            estado: CITA_STATUS.CONFIRMADA,
            canal: "manual",
            creado_por: userId,
            serie_id: serieId,
          });
        }

        if (filasSerie.length > 0) {
          const { data: serieInsertadas } = await supabase
            .from("citas")
            .insert(filasSerie)
            .select();
          if (serieInsertadas && addonsBase.length > 0) {
            for (const s of serieInsertadas) {
              if (s?.id)
                await supabase
                  .from("cita_addons")
                  .insert(
                    addonsBase.map((aid: string) => ({
                      cita_id: s.id,
                      addon_id: aid,
                    })),
                  );
            }
          }
          if (serieInsertadas)
            for (const s of serieInsertadas) citasInsertadas.push(s);
        }

        const creadas = 1 + filasSerie.length;
        if (omitidas.length > 0) {
          alert(
            `Serie creada: ${creadas} de ${repetirVeces} citas.\nOmitidas por conflicto de horario/hueco: ${omitidas.join(", ")}.\nColocalas a mano si lo necesitas.`,
          );
        }
      }

      if (prefillWaitlistId && citasInsertadas && citasInsertadas.length > 0) {
        await supabase
          .from("lista_espera")
          .update({ estado: "resuelta", cita_id: citasInsertadas[0].id })
          .eq("id", prefillWaitlistId);
      }

      triggerRefresh();
      onSaved?.(citasInsertadas?.[0] ?? null) ?? onClose();
    } catch (e: any) {
      setErrMsg(mensajeDeError(e, "No se pudo crear la cita."));
      setGuardando(false);
    }
  };

  const handleVisionSearch = async (files: FileList | null) => {
    if (!files || files.length === 0 || !negocioId) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setVisionError("El archivo debe ser una imagen");
      return;
    }

    const cSelected = clientes.find((c) => c.id === selectedCliente);
    if (!cSelected?.consiente_ia) {
      alert(
        "Para sugerir servicios con IA, marca la casilla de consentimiento de IA en la ficha de la clienta.",
      );
      if (fileVisionRef.current) fileVisionRef.current.value = "";
      return;
    }

    setVisionLoading(true);
    setVisionError("");

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${negocioId}/${selectedCliente}/vision_temp_${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from("cliente-fotos")
        .upload(path, file, { contentType: file.type });
      if (up.error) throw new Error("Error al subir la imagen");

      const { data: signed } = await supabase.storage
        .from("cliente-fotos")
        .createSignedUrl(path, 60);
      if (!signed?.signedUrl) throw new Error("Error al generar URL temporal");

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chispa-vision-corte`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            imageUrl: signed.signedUrl,
            catalogo: servicios,
          }),
        },
      );

      if (!res.ok) throw new Error("Error en la llamada a la IA");
      const result = await res.json();

      if (result.error) throw new Error(result.error);
      if (result.servicio_ids && result.servicio_ids.length > 0) {
        setSelectedServicio(result.servicio_ids[0]);
        alert(`Sugerencia de IA: ${result.razonamiento}`);
      } else {
        setVisionError("La IA no pudo mapear la foto a ningún servicio.");
      }

      await supabase.storage.from("cliente-fotos").remove([path]);
    } catch (e) {
      setVisionError((e as Error).message || "Error en la búsqueda visual");
    } finally {
      setVisionLoading(false);
      if (fileVisionRef.current) fileVisionRef.current.value = "";
    }
  };

  const handleCreateCliente = async () => {
    if (!nuevoClienteNombre.trim()) {
      alert("Por favor ingresa el nombre del cliente");
      return;
    }
    setCreandoCliente(true);
    try {
      const { data, error } = await supabase
        .from("clientes")
        .insert({
          negocio_id: negocioId,
          nombre: nuevoClienteNombre.trim(),
          telefono: nuevoClienteTelefono.trim() || null,
        })
        .select();
      if (error) throw error;
      const nuevoCliente = data?.[0];
      if (nuevoCliente) {
        setClientes([...clientes, nuevoCliente]);
        setSelectedCliente(nuevoCliente.id);
        setNuevoClienteNombre("");
        setNuevoClienteTelefono("");
        setShowCreateCliente(false);
      }
    } catch (e: any) {
      alert(mensajeDeError(e, "No se pudo crear la clienta."));
    } finally {
      setCreandoCliente(false);
    }
  };

  const crearServicioPuntual = async () => {
    const nombre = puntualNombre.trim();
    if (!nombre) {
      setPuntualErr("Ponle un nombre al servicio.");
      return;
    }
    const precioNum = parseFloat(puntualPrecio.replace(",", ".")) || 0;
    if (precioNum <= 0) {
      setPuntualErr("El precio debe ser mayor que 0.");
      return;
    }
    const duracionNum = parseInt(puntualDuracion, 10) || 30;
    setPuntualErr("");
    setGuardandoPuntual(true);
    try {
      const { data, error } = await supabase
        .from("servicios")
        .insert({
          negocio_id: negocioId,
          nombre,
          precio: precioNum,
          duracion_activa_min: duracionNum,
          duracion_espera_min: 0,
          duracion_activa_extra_min: 0,
          min_antelacion_min: 0,
          activo: true,
          es_puntual: true,
        })
        .select(
          "id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, min_antelacion_min",
        )
        .single();
      if (error || !data) {
        setPuntualErr(
          mensajeDeError(error, "No se pudo crear el servicio puntual."),
        );
        setGuardandoPuntual(false);
        return;
      }
      // Lo añadimos al catálogo local y lo dejamos seleccionado en la cita
      setServicios((prev) => [...prev, data]);
      setSelectedServicio(data.id);
      setShowPuntual(false);
      setPuntualNombre("");
      setPuntualPrecio("");
      setPuntualDuracion("30");
    } catch (e: any) {
      setPuntualErr(mensajeDeError(e, "No se pudo crear el servicio puntual."));
    } finally {
      setGuardandoPuntual(false);
    }
  };

  // Mientras carga, mostramos el MISMO fondo difuminado del modal (no una pantalla
  // negra a pantalla completa, que provocaba un parpadeo en negro al abrir la cita).
  if (loading)
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,18,32,0.65)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          display: "grid",
          placeItems: "center",
          zIndex: 100,
          animation: "fadeIn 0.25s ease",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: "3px solid rgba(255,255,255,0.14)",
            borderTopColor: "#f4501e",
            animation: "spin 0.9s linear infinite",
          }}
        />
      </div>
    );

  const clienteSeleccionado = clientes.find((c) => c.id === selectedCliente);
  const demoZoneRef =
    demoZone === "cliente"
      ? clienteZoneRef
      : demoZone === "servicio"
        ? servicioZoneRef
        : horaZoneRef;
  const demoZoneLabel =
    demoZone === "cliente"
      ? "Elige cliente"
      : demoZone === "servicio"
        ? "Elige servicio"
        : demoZone === "hora"
          ? "Elige la hora"
          : demoZone === "reposo"
            ? "Tiempos muertos"
            : "";

  const isMobileOrTablet = isMobile || isTablet;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,18,32,0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: isMobileOrTablet ? "flex-end" : "center",
        justifyContent: "center",
        zIndex: 100,
        padding: isMobileOrTablet ? 0 : 24,
        animation: "fadeIn 0.3s ease",
      }}
    >
      <DemoSpotlight
        targetRef={demoZoneRef}
        active={!!demoZone}
        label={demoZoneLabel}
        padding={10}
        radius={14}
      />
      <div
        style={{
          width: "100%",
          maxWidth: isMobileOrTablet ? "100%" : 580,
          // dvh (no vh): en movil el alto de la barra del navegador NO se descuenta
          // con vh, y el fondo del modal (con el boton Reservar) quedaba cortado.
          height: isMobileOrTablet ? "92dvh" : "auto",
          maxHeight: isMobileOrTablet ? "92dvh" : "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: TOKENS.bgPanel,
          border: isMobileOrTablet ? "none" : `1px solid ${TOKENS.borderHi}`,
          borderRadius: isMobileOrTablet ? "24px 24px 0 0" : 18,
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(244,80,30,0.15)",
          animation: isMobileOrTablet
            ? "slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            : "scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            zIndex: 4,
            background: TOKENS.bgPanel,
            padding: isMobileOrTablet ? "16px 20px" : "20px 24px 14px",
            borderBottom: `1px solid ${TOKENS.border}`,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: isMobileOrTablet ? 18 : 20,
              fontWeight: 700,
              color: TOKENS.text,
            }}
          >
            Nueva cita
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: isMobileOrTablet ? 38 : 32,
              height: isMobileOrTablet ? 38 : 32,
              borderRadius: 8,
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              fontSize: 18,
              transition: "all 0.2s ease",
              transform: "scale(1) rotate(0deg)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = TOKENS.border;
              e.currentTarget.style.color = TOKENS.text;
              e.currentTarget.style.transform = "scale(1.1) rotate(90deg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = TOKENS.bgCard;
              e.currentTarget.style.color = TOKENS.textSec;
              e.currentTarget.style.transform = "scale(1) rotate(0deg)";
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: isMobileOrTablet ? "16px 20px" : "20px 24px",
          }}
        >
          {/* Reloj actual + hora elegida: referencia rapida al crear la cita */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 13px",
                borderRadius: 11,
                background: "rgba(148,163,184,0.08)",
                border: `1px solid ${TOKENS.border}`,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: "#16a34a",
                  boxShadow: "0 0 0 3px rgba(22,163,74,0.18)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600 }}
              >
                Ahora
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: TOKENS.text,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {ahoraStr}
              </span>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 13px",
                borderRadius: 11,
                background: horaActual
                  ? "rgba(244,80,30,0.10)"
                  : "rgba(148,163,184,0.06)",
                border: `1px solid ${horaActual ? "rgba(244,80,30,0.38)" : TOKENS.border}`,
                transition: "all 0.2s ease",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke={horaActual ? "#e0340e" : TOKENS.textTer}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
              <span
                style={{
                  fontSize: 11,
                  color: horaActual ? "#e0340e" : TOKENS.textTer,
                  fontWeight: 600,
                }}
              >
                Hora de la cita
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: horaActual ? "#e0340e" : TOKENS.textTer,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {horaActual || "--:--"}
              </span>
            </div>
          </div>

          {/* Tarjetas de servicios confirmados (encadenados) */}
          {citasConfirmadas.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#e0340e",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 8,
                }}
              >
                Servicios confirmados ({citasConfirmadas.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {citasConfirmadas.map((cita: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 12px",
                      background: "rgba(192,38,10,0.06)",
                      border: "1px solid rgba(192,38,10,0.2)",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            background: cita.profColor || TOKENS.primary,
                            color: "#fff",
                            fontSize: 9,
                            fontWeight: 700,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: TOKENS.text,
                          }}
                        >
                          {cita.servicioNombre}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: TOKENS.textSec,
                          marginTop: 3,
                          marginLeft: 24,
                        }}
                      >
                        {cita.profNombre} --{" "}
                        {cita.inicio.toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        a{" "}
                        {cita.fin.toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: TOKENS.success,
                        marginRight: 8,
                      }}
                    >
                      {cita.precio}
                      {"€"}
                    </div>
                    <button
                      onClick={() =>
                        setCitasConfirmadas(
                          citasConfirmadas.filter(
                            (_: any, i: number) => i !== idx,
                          ),
                        )
                      }
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        color: TOKENS.danger,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "grid",
                        placeItems: "center",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(239,68,68,0.18)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "rgba(239,68,68,0.08)";
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
              {!selectedServicio && (
                <div
                  style={{
                    fontSize: 10,
                    color: TOKENS.textTer,
                    marginTop: 6,
                    fontStyle: "italic",
                  }}
                >
                  Selecciona el siguiente servicio o pulsa Reservar para guardar
                </div>
              )}
            </div>
          )}

          {/* Stepper with dividers */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 22,
            }}
          >
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flex: n < 3 ? 1 : undefined,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    borderRadius: 999,
                    background:
                      (n === 1 && (selectedCliente || sinCliente)) ||
                      (n === 2 && selectedServicio) ||
                      (n === 3 && selectedHora)
                        ? "rgba(244,80,30,0.18)"
                        : "rgba(148,163,184,0.06)",
                    border: `1px solid ${(n === 1 && (selectedCliente || sinCliente)) || (n === 2 && selectedServicio) || (n === 3 && selectedHora) ? "rgba(244,80,30,0.4)" : TOKENS.border}`,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background:
                        (n === 1 && (selectedCliente || sinCliente)) ||
                        (n === 2 && selectedServicio) ||
                        (n === 3 && selectedHora)
                          ? TOKENS.primary
                          : "rgba(148,163,184,0.18)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {n}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color:
                        (n === 1 && (selectedCliente || sinCliente)) ||
                        (n === 2 && selectedServicio) ||
                        (n === 3 && selectedHora)
                          ? TOKENS.primaryHi
                          : TOKENS.textSec,
                    }}
                  >
                    {["Cliente", "Servicio", "Hora"][n - 1]}
                  </span>
                </div>
                {n < 3 && (
                  <div
                    style={{ flex: 1, height: 1, background: TOKENS.border }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* FormField Cliente */}
          {citasConfirmadas.length > 0 ? (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 14px",
                background: "rgba(244,80,30,0.06)",
                border: `1px solid rgba(244,80,30,0.2)`,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: TOKENS.textTer,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Cliente:
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: TOKENS.primaryHi,
                }}
              >
                {clientes.find((c: any) => c.id === selectedCliente)?.nombre ||
                  (sinCliente ? "Sin cliente" : "")}
              </div>
            </div>
          ) : (
            <div
              ref={(el) => {
                clienteZoneRef.current = el;
              }}
              style={{ marginBottom: 14 }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: TOKENS.textTer,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                Cliente
              </div>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={clienteSearch}
                onChange={(e) => setClienteSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 8,
                  color: TOKENS.text,
                  fontSize: 12,
                  marginBottom: 10,
                  boxSizing: "border-box",
                  transition: "all 0.2s ease",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = TOKENS.primary;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${TOKENS.primarySoft}`;
                  e.currentTarget.style.background = TOKENS.bgCard;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = TOKENS.border;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  maxHeight: 150,
                  overflowY: "auto",
                }}
              >
                {clientes
                  .filter((c) => norm(c.nombre).includes(norm(clienteSearch)))
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCliente(c.id);
                        setSinCliente(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        background:
                          selectedCliente === c.id
                            ? "rgba(244,80,30,0.18)"
                            : TOKENS.bgCard,
                        border: `1px solid ${selectedCliente === c.id ? "rgba(244,80,30,0.4)" : TOKENS.border}`,
                        borderRadius: 8,
                        color:
                          selectedCliente === c.id
                            ? TOKENS.primaryHi
                            : TOKENS.textSec,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: selectedCliente === c.id ? 600 : 500,
                        whiteSpace: "nowrap",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = `0 4px 12px rgba(244,80,30,0.2)`;
                        e.currentTarget.style.borderColor =
                          "rgba(244,80,30,0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.borderColor =
                          selectedCliente === c.id
                            ? "rgba(244,80,30,0.4)"
                            : TOKENS.border;
                      }}
                    >
                      {c.nombre}
                    </button>
                  ))}
                <button
                  onClick={() => setShowCreateCliente(true)}
                  style={{
                    padding: "8px 12px",
                    background: "rgba(16,185,129,0.1)",
                    border: `1px dashed rgba(16,185,129,0.35)`,
                    borderRadius: 8,
                    color: TOKENS.success,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(16,185,129,0.18)";
                    e.currentTarget.style.borderColor = "rgba(16,185,129,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(16,185,129,0.1)";
                    e.currentTarget.style.borderColor = "rgba(16,185,129,0.35)";
                  }}
                >
                  + Crear
                </button>
                {/* Cita anonima / invitado: guardar sin ficha de cliente */}
                <button
                  onClick={() => {
                    setSinCliente((v) => {
                      const nv = !v;
                      if (nv) setSelectedCliente("");
                      return nv;
                    });
                  }}
                  title="Crear la cita sin asignar un cliente"
                  style={{
                    padding: "8px 12px",
                    background: sinCliente
                      ? "rgba(244,80,30,0.18)"
                      : TOKENS.bgCard,
                    border: `1px dashed ${sinCliente ? "rgba(244,80,30,0.45)" : TOKENS.borderHi}`,
                    borderRadius: 8,
                    color: sinCliente ? TOKENS.primaryHi : TOKENS.textSec,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  Sin cliente
                </button>
              </div>
            </div>
          )}

          {/* Selected client card */}
          {selectedCliente &&
            clienteSeleccionado &&
            citasConfirmadas.length === 0 && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(244,80,30,0.08)",
                  border: `1px solid rgba(244,80,30,0.30)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: `linear-gradient(135deg, ${TOKENS.primary}, ${TOKENS.primaryHi})`,
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {clienteSeleccionado.nombre.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: TOKENS.text,
                    }}
                  >
                    {clienteSeleccionado.nombre}
                  </div>
                  <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                    {clienteSeleccionado.telefono || "Sin teléfono"}
                  </div>
                </div>
                <div
                  style={{
                    background: TOKENS.warning,
                    color: TOKENS.bg,
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  VIP
                </div>
              </div>
            )}

          {/* FormField Servicio */}
          <div
            ref={(el) => {
              servicioZoneRef.current = el;
            }}
            style={{ marginBottom: 14 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: TOKENS.textTer,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Servicio
              </div>
              {selectedCliente && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    ref={fileVisionRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) =>
                      handleVisionSearch((e.target as HTMLInputElement).files)
                    }
                  />
                  <button
                    onClick={() => {
                      const cSelected = clientes.find(
                        (c) => c.id === selectedCliente,
                      );
                      if (!cSelected?.consiente_ia) {
                        alert(
                          "Para sugerir servicios con IA, la clienta debe tener el consentimiento de IA marcado.",
                        );
                        return;
                      }
                      fileVisionRef.current?.click();
                    }}
                    disabled={visionLoading}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: `1px solid ${TOKENS.primary}`,
                      background: TOKENS.primarySoft,
                      color: TOKENS.primaryHi,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: visionLoading ? "default" : "pointer",
                      opacity: visionLoading ? 0.6 : 1,
                    }}
                  >
                    <Icon name="sparkle" size={12} color={TOKENS.primaryHi} />
                    {visionLoading ? "Analizando..." : "Sugerir por foto"}
                  </button>
                </div>
              )}
            </div>
            {visionError && (
              <div
                style={{ fontSize: 11, color: TOKENS.danger, marginBottom: 8 }}
              >
                {visionError}
              </div>
            )}
            
            <input
              type="text"
              placeholder="Buscar servicio..."
              value={servicioSearch}
              onChange={(e) => setServicioSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 8,
                color: TOKENS.text,
                fontSize: 12,
                marginBottom: 10,
                boxSizing: "border-box",
                transition: "all 0.2s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = TOKENS.primary;
                e.currentTarget.style.boxShadow = `0 0 0 3px ${TOKENS.primarySoft}`;
                e.currentTarget.style.background = TOKENS.bgCard;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = TOKENS.border;
                e.currentTarget.style.boxShadow = "none";
              }}
            />

            {(historialClienteServicios.top.length > 0 || historialClienteServicios.last.length > 0) && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {historialClienteServicios.last.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: TOKENS.textTer, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Últimos servicios</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {historialClienteServicios.last.map(sid => {
                        const s = servicios.find((sv: any) => sv.id === sid);
                        if (!s) return null;
                        const sel = selectedServicio === s.id;
                        return (
                          <button
                            key={`last-${s.id}`}
                            onClick={() => setSelectedServicio(s.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              background: sel ? "rgba(244,80,30,0.18)" : TOKENS.bgCard,
                              border: `1px solid ${sel ? "rgba(244,80,30,0.4)" : TOKENS.border}`,
                              color: sel ? TOKENS.primaryHi : TOKENS.textSec,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                          >
                            {s.nombre}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {historialClienteServicios.top.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: TOKENS.textTer, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Más habituales</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {historialClienteServicios.top.map(sid => {
                        const s = servicios.find((sv: any) => sv.id === sid);
                        if (!s) return null;
                        const sel = selectedServicio === s.id;
                        return (
                          <button
                            key={`top-${s.id}`}
                            onClick={() => setSelectedServicio(s.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              background: sel ? "rgba(244,80,30,0.18)" : TOKENS.bgCard,
                              border: `1px solid ${sel ? "rgba(244,80,30,0.4)" : TOKENS.border}`,
                              color: sel ? TOKENS.primaryHi : TOKENS.textSec,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                          >
                            {s.nombre}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {gruposServicio.map((grupo) => (
              <div key={grupo.key} style={{ marginBottom: 10 }}>
                {!(
                  gruposServicio.length === 1 &&
                  grupo.key === "__sin_categoria__"
                ) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 6,
                    }}
                  >
                    {grupo.color && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 99,
                          background: categoryColorHex(grupo.color),
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: TOKENS.textTer,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {grupo.nombre}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  {grupo.items.map((s: any) => {
                    const ov = profOverrides.find(
                      (o: any) => o.service_id === s.id,
                    );
                    const catalogDur =
                      (s.duracion_activa_min || 0) +
                      (s.duracion_espera_min || 0) +
                      (s.duracion_activa_extra_min || 0);
                    const efectivoDur =
                      selectedProf && ov?.duracion != null
                        ? ov.duracion +
                          (ov.duracion_espera_min ??
                            s.duracion_espera_min ??
                            0) +
                          (ov.duracion_activa_extra_min ??
                            s.duracion_activa_extra_min ??
                            0)
                        : catalogDur || 30;
                    const efectivoPrecio =
                      selectedProf && ov?.precio != null ? ov.precio : s.precio;
                    return (
                      <button
                        key={s.id}
                        // Toggle: si ya esta elegido, un segundo clic lo deselecciona
                        // (antes quedaba "pegado" y no se podia quitar el servicio elegido).
                        onClick={() =>
                          setSelectedServicio(
                            selectedServicio === s.id ? "" : s.id,
                          )
                        }
                        style={{
                          padding: "12px",
                          background:
                            selectedServicio === s.id
                              ? "rgba(244,80,30,0.12)"
                              : TOKENS.bgCard,
                          border: `1px solid ${selectedServicio === s.id ? "rgba(244,80,30,0.4)" : TOKENS.border}`,
                          borderRadius: 10,
                          color: TOKENS.text,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          textAlign: "left",
                          transition: "all 0.2s ease",
                          transform: "translateY(0)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.borderColor = TOKENS.primary;
                          e.currentTarget.style.boxShadow = `0 4px 16px rgba(244,80,30,0.15)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.borderColor =
                            selectedServicio === s.id
                              ? "rgba(244,80,30,0.4)"
                              : TOKENS.border;
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <div>{s.nombre}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: TOKENS.textTer }}>
                            {efectivoDur} min
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: TOKENS.success,
                              fontWeight: 700,
                            }}
                          >
                            {efectivoPrecio}€
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Crear servicio puntual: caso extraordinario, lo más rápido posible */}
            <button
              type="button"
              onClick={() => {
                setPuntualErr("");
                setShowPuntual(true);
              }}
              style={{
                marginTop: 8,
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 14px",
                background: "rgba(245,158,11,0.10)",
                border: "1.5px dashed rgba(245,158,11,0.45)",
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.18s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(245,158,11,0.18)";
                e.currentTarget.style.borderColor = "rgba(245,158,11,0.7)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(245,158,11,0.10)";
                e.currentTarget.style.borderColor = "rgba(245,158,11,0.45)";
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "rgba(245,158,11,0.18)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={2.3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ fontSize: 12.5, fontWeight: 700, color: "#f59e0b" }}
                >
                  Crear servicio puntual
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: TOKENS.textTer,
                    marginTop: 1,
                  }}
                >
                  Caso especial · rápido, sin tenerlo en el catálogo
                </div>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Add-ons opcionales (5.6) */}
          {selectedServicio && addonsDisponibles.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: TOKENS.textTer,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                Add-ons
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {addonsDisponibles.map((a: any) => {
                  const sel = selectedAddons.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() =>
                        setSelectedAddons(
                          sel
                            ? selectedAddons.filter((x) => x !== a.id)
                            : [...selectedAddons, a.id],
                        )
                      }
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        background: sel
                          ? "rgba(16,185,129,0.12)"
                          : TOKENS.bgCard,
                        border: `1px solid ${sel ? "rgba(16,185,129,0.5)" : TOKENS.border}`,
                        color: sel ? TOKENS.success : TOKENS.textSec,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {a.nombre}{" "}
                      <span
                        style={{
                          fontSize: 9,
                          color: TOKENS.textTer,
                          fontWeight: 400,
                        }}
                      >
                        +{a.duracion_min}min · {a.precio}€
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Duracion real aprendida (Sesion 4): sugerencia visible, no imposicion */}
          {durSugerida && !durSugAplicada && (
            <div
              style={{
                marginBottom: 14,
                padding: "11px 13px",
                background: "rgba(244,80,30,0.06)",
                border: `1px solid rgba(244,80,30,0.28)`,
                borderRadius: 11,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: "rgba(244,80,30,0.12)",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                dangerouslySetInnerHTML={{
                  __html: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${TOKENS.primaryHi}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>`,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: TOKENS.text,
                  }}
                >
                  Con esta clienta suele durar ~{durSugerida.minutos} min
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: TOKENS.textTer,
                    marginTop: 1,
                  }}
                >
                  {durSugerida.difMin > 0
                    ? `${durSugerida.difMin} min mas`
                    : `${-durSugerida.difMin} min menos`}{" "}
                  que el catalogo ({durSugerida.catalogoMin} min) ·{" "}
                  {durSugerida.muestras} citas
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nuevaActiva = Math.max(
                    15,
                    durSugerida.minutos - duracionEspera - duracionActivaExtra,
                  );
                  setDuracionActivaCustom(nuevaActiva);
                  setDurSugAplicada(true);
                }}
                style={{
                  flexShrink: 0,
                  padding: "7px 12px",
                  background: TOKENS.fireGradient,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Usar {durSugerida.minutos} min
              </button>
            </div>
          )}

          {/* FormField Profesional */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: TOKENS.textTer,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Profesional
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {profesionales.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProf(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 12px",
                    borderRadius: 999,
                    background:
                      selectedProf === p.id
                        ? `${p.color}22`
                        : "rgba(148,163,184,0.06)",
                    border: `1px solid ${selectedProf === p.id ? `${p.color}66` : TOKENS.border}`,
                    color: selectedProf === p.id ? p.color : TOKENS.textSec,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    transform: "scale(1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.08)";
                    e.currentTarget.style.background = `${p.color}2a`;
                    e.currentTarget.style.boxShadow = `0 4px 12px ${p.color}33`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background =
                      selectedProf === p.id
                        ? `${p.color}22`
                        : "rgba(148,163,184,0.06)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {p.foto_perfil ? (
                    <img
                      src={p.foto_perfil}
                      alt={p.nombre}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        objectFit: "cover",
                        boxShadow: `0 0 0 1px ${p.color}`,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        background: p.color,
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "grid",
                        placeItems: "center",
                        boxShadow: `0 0 0 1px ${p.color}`,
                      }}
                    >
                      {p.nombre.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {p.nombre.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* FormField Hora - 5 columns, 10 slots */}
          {selectedProf && selectedServicio && (
            <div
              ref={(el) => {
                horaZoneRef.current = el;
              }}
              style={{ marginBottom: 18 }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: TOKENS.textTer,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                Hora ·{" "}
                {today.toLocaleDateString(LOCALE, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </div>
              {(() => {
                const slots = generarSlotsHorarios();
                // RN-AG-070/071: añadir fin_activa exacto como slot extra si no es múltiplo de 15
                const slotsSet = new Set(slots);
                const extraSlots: string[] = [];
                citasHoy.forEach((c: any) => {
                  if (
                    c.profesional_id !== selectedProf ||
                    !c.fin_activa ||
                    !c.fin_espera
                  )
                    return;
                  const cFinActiva = new Date(c.fin_activa);
                  const cFinEspera = new Date(c.fin_espera);
                  const cFin = new Date(c.fin);
                  const hasSegundaFase = cFinEspera.getTime() < cFin.getTime();
                  const slotFinActiva = new Date(
                    cFinActiva.getTime() + duracionActiva * 60000,
                  );
                  // Si hay segunda fase activa, la activa debe terminar ANTES del fin del reposo (no justo al límite)
                  if (
                    hasSegundaFase
                      ? slotFinActiva >= cFinEspera
                      : slotFinActiva > cFinEspera
                  )
                    return;
                  const timeStr = `${String(cFinActiva.getHours()).padStart(2, "0")}:${String(cFinActiva.getMinutes()).padStart(2, "0")}`;
                  if (!slotsSet.has(timeStr)) extraSlots.push(timeStr);
                });
                const allSlots = [...slots, ...extraSlots].sort();

                // pre-calculate which slots fit within a rest phase
                const reposaSlots = new Set<string>();
                allSlots.forEach((time) => {
                  const [h, m] = time.split(":").map(Number);
                  const slotInicio = new Date(today);
                  slotInicio.setHours(h, m, 0, 0);
                  const slotFinActiva = new Date(
                    slotInicio.getTime() + duracionActiva * 60000,
                  );
                  const encajaEnReposo = citasHoy.some((c: any) => {
                    if (
                      c.profesional_id !== selectedProf ||
                      !c.fin_activa ||
                      !c.fin_espera
                    )
                      return false;
                    const cFinActiva = new Date(c.fin_activa);
                    const cFinEspera = new Date(c.fin_espera);
                    const cFin = new Date(c.fin);
                    const hasSegundaFase =
                      cFinEspera.getTime() < cFin.getTime();
                    // Si hay segunda fase activa, la nueva activa debe terminar ANTES del reposo (no justo al límite)
                    return (
                      slotInicio >= cFinActiva &&
                      (hasSegundaFase
                        ? slotFinActiva < cFinEspera
                        : slotFinActiva <= cFinEspera)
                    );
                  });
                  if (encajaEnReposo) reposaSlots.add(time);
                });
                const primerReposo = allSlots.find((t) => reposaSlots.has(t));

                // Count only reposo slots that are actually available (not occupied)
                let visibleReposoCount = 0;
                reposaSlots.forEach((time) => {
                  const [rh, rm] = time.split(":").map(Number);
                  const rInicio = new Date(today);
                  rInicio.setHours(rh, rm, 0, 0);
                  const rFinActiva = new Date(
                    rInicio.getTime() + duracionActiva * 60000,
                  );
                  const rOcc1 = isTimeSlotOccupied(
                    rInicio,
                    rFinActiva,
                    citasHoy,
                    selectedProf,
                  );
                  const rOcc2 =
                    duracionActivaExtra > 0 &&
                    isTimeSlotOccupied(
                      new Date(
                        rInicio.getTime() +
                          (duracionActiva + duracionEspera) * 60000,
                      ),
                      new Date(rInicio.getTime() + duracionTotal * 60000),
                      citasHoy,
                      selectedProf,
                    );
                  const rFin = new Date(
                    rInicio.getTime() + duracionTotal * 60000,
                  );
                  const rBlocked = bloqueosProfHoy.some(
                    (b: any) =>
                      new Date(b.inicio) < rFin && new Date(b.fin) > rInicio,
                  );
                  if (!rOcc1 && !rOcc2 && !rBlocked) visibleReposoCount++;
                });

                return (
                  <>
                    {visibleReposoCount > 0 && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "#f59e0b",
                          fontWeight: 600,
                          marginBottom: 6,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: "#f59e0b",
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                        {visibleReposoCount} hueco
                        {visibleReposoCount > 1 ? "s" : ""} aprovecha
                        {visibleReposoCount === 1 ? "" : "n"} tiempo de reposo
                      </div>
                    )}
                    {horaSugerida && (
                      <div style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            color: "#e0340e",
                            letterSpacing: 0.5,
                            marginBottom: 4,
                            textTransform: "uppercase",
                          }}
                        >
                          Hora sugerida (fin servicio anterior)
                        </div>
                        <button
                          onClick={() => {
                            setHoraPersonalizada("");
                            setUseCustomHora(false);
                            selectedHora === horaSugerida
                              ? setSelectedHora("")
                              : setSelectedHora(horaSugerida);
                          }}
                          style={{
                            padding: "7px 16px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            border: `1.5px solid ${selectedHora === horaSugerida && !horaPersonalizada ? "#e0340e" : "rgba(167,139,250,0.4)"}`,
                            background:
                              selectedHora === horaSugerida &&
                              !horaPersonalizada
                                ? "rgba(192,38,10,0.2)"
                                : "rgba(192,38,10,0.06)",
                            color: "#e0340e",
                            transition: "all 0.2s ease",
                          }}
                        >
                          {horaSugerida}
                        </button>
                      </div>
                    )}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(5, 1fr)",
                        gap: 6,
                        marginBottom: 12,
                      }}
                    >
                      {allSlots.map((time) => {
                        const [h, m] = time.split(":").map(Number);
                        const testInicio = new Date(today);
                        testInicio.setHours(h, m, 0, 0);
                        const testFinActiva = new Date(
                          testInicio.getTime() + duracionActiva * 60000,
                        );
                        const occupied1 = isTimeSlotOccupied(
                          testInicio,
                          testFinActiva,
                          citasHoy,
                          selectedProf,
                        );
                        const occupied2 =
                          duracionActivaExtra > 0 &&
                          isTimeSlotOccupied(
                            new Date(
                              testInicio.getTime() +
                                (duracionActiva + duracionEspera) * 60000,
                            ),
                            new Date(
                              testInicio.getTime() + duracionTotal * 60000,
                            ),
                            citasHoy,
                            selectedProf,
                          );
                        const testFin = new Date(
                          testInicio.getTime() + duracionTotal * 60000,
                        );
                        const blockedByAusencia = bloqueosProfHoy.some(
                          (b: any) =>
                            new Date(b.inicio) < testFin &&
                            new Date(b.fin) > testInicio,
                        );

                        if (occupied1 || occupied2 || blockedByAusencia)
                          return null;

                        // Resaltar en naranja tambien el hueco prellenado al clicar en la rejilla
                        const selected =
                          (selectedHora === time && !horaPersonalizada) ||
                          (useCustomHora && horaPersonalizada === time);
                        const esReposo = reposaSlots.has(time);

                        return (
                          <button
                            key={time}
                            data-slot={time}
                            data-reposo={esReposo ? "1" : "0"}
                            onClick={() => {
                              setHoraPersonalizada("");
                              selected
                                ? setSelectedHora("")
                                : setSelectedHora(time);
                            }}
                            style={{
                              width: "100%",
                              padding: esReposo ? "5px 0 4px" : "8px 0",
                              borderRadius: 8,
                              background: selected
                                ? `linear-gradient(180deg,#ff7a2e,#f4501e)`
                                : esReposo
                                  ? "rgba(245,158,11,0.08)"
                                  : TOKENS.bgCard,
                              border: `1px solid ${selected ? "#f4501e" : esReposo ? "rgba(245,158,11,0.45)" : TOKENS.border}`,
                              color: selected
                                ? "#fff"
                                : esReposo
                                  ? "#f59e0b"
                                  : TOKENS.textSec,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              transition:
                                "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                              transform: "scale(1)",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 1,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "scale(1.08)";
                              if (!selected) {
                                e.currentTarget.style.borderColor = esReposo
                                  ? "#f59e0b"
                                  : TOKENS.primary;
                                e.currentTarget.style.boxShadow = esReposo
                                  ? `0 4px 12px rgba(245,158,11,0.25)`
                                  : `0 4px 12px rgba(244,80,30,0.2)`;
                              } else {
                                e.currentTarget.style.boxShadow = `0 6px 20px rgba(244,80,30,0.4)`;
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "scale(1)";
                              e.currentTarget.style.borderColor = selected
                                ? "#f4501e"
                                : esReposo
                                  ? "rgba(245,158,11,0.45)"
                                  : TOKENS.border;
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            <span>{time}</span>
                            {esReposo && (
                              <span
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  letterSpacing: 0.4,
                                  opacity: selected ? 0.8 : 1,
                                  color: selected ? "#fff" : "#f59e0b",
                                }}
                              >
                                espera
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {!useCustomHora ? (
                  <button
                    onClick={() => {
                      setUseCustomHora(true);
                      setSelectedHora("");
                      setHoraPersonalizada("09:00");
                    }}
                    style={{
                      background: "none",
                      border: `1px dashed ${TOKENS.border}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      color: TOKENS.textTer,
                      fontSize: 11,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = TOKENS.primary;
                      e.currentTarget.style.color = TOKENS.primaryHi;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = TOKENS.border;
                      e.currentTarget.style.color = TOKENS.textTer;
                    }}
                  >
                    + Hora personalizada
                  </button>
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontSize: 11, color: TOKENS.textSec }}>
                        Hora personalizada:
                      </span>
                      <button
                        onClick={() => {
                          setUseCustomHora(false);
                          setHoraPersonalizada("");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: TOKENS.textTer,
                          fontSize: 11,
                          cursor: "pointer",
                          padding: "2px 6px",
                        }}
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <TimeDrumPicker
                        value={horaPersonalizada}
                        onChange={(v) => {
                          setHoraPersonalizada(v);
                          setSelectedHora("");
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RN-AG-072: info banner cuando la hora aprovecha un reposo */}
          {citaHostReposo && horaActual && (
            <div
              style={{
                padding: "10px 12px",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: 10,
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
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
                style={{ fontSize: 11, color: "#f59e0b", lineHeight: "1.4" }}
              >
                Esta hora aprovecha el tiempo de reposo de otra cita. El
                profesional atendera este servicio mientras la cita anterior
                reposa.
              </span>
            </div>
          )}

          {/* Total estimado */}
          {selectedCliente &&
            selectedServicio &&
            selectedProf &&
            horaActual && (
              <div
                style={{
                  marginTop: 0,
                  padding: 12,
                  background: "rgba(16,185,129,0.08)",
                  border: `1px solid rgba(16,185,129,0.25)`,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 18,
                }}
              >
                <div style={{ fontSize: 12, color: TOKENS.textSec }}>
                  Total estimado{" "}
                  {citasConfirmadas.length > 0 &&
                    `(${citasConfirmadas.length + 1} servicios)`}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: TOKENS.success,
                  }}
                >
                  {totalPrecioEncadenado}
                  {"€"}
                </div>
              </div>
            )}

          {errMsg && (
            <div
              style={{
                background: "rgba(239,68,68,0.12)",
                border: `1px solid rgba(239,68,68,0.3)`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
              }}
            >
              <div style={{ fontSize: 12, color: TOKENS.danger }}>{errMsg}</div>
            </div>
          )}

          {/* Modal crear cliente */}
          {showCreateCliente && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                display: "grid",
                placeItems: "center",
                zIndex: 200,
              }}
            >
              <div
                style={{
                  background: TOKENS.bgPanel,
                  border: `1px solid ${TOKENS.borderHi}`,
                  borderRadius: 14,
                  padding: 24,
                  width: "90%",
                  maxWidth: 400,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: 16,
                    fontWeight: 700,
                    color: TOKENS.text,
                  }}
                >
                  Nuevo cliente
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: TOKENS.textSec,
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={nuevoClienteNombre}
                      onChange={(e) => setNuevoClienteNombre(e.target.value)}
                      placeholder="Ej: Juan García"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        borderRadius: 8,
                        color: TOKENS.text,
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: TOKENS.textSec,
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Teléfono (opcional)
                    </label>
                    <PhoneInput
                      value={nuevoClienteTelefono}
                      onChange={(e164) => setNuevoClienteTelefono(e164)}
                      placeholder="666 123 456"
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={() => setShowCreateCliente(false)}
                    disabled={creandoCliente}
                    style={{
                      padding: "9px 18px",
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      color: TOKENS.text,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateCliente}
                    disabled={creandoCliente}
                    style={{
                      padding: "9px 18px",
                      background: TOKENS.success,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      cursor: creandoCliente ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      opacity: creandoCliente ? 0.7 : 1,
                    }}
                  >
                    {creandoCliente ? "..." : "Crear"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: crear servicio puntual (rápido) */}
          {showPuntual && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                display: "grid",
                placeItems: "center",
                zIndex: 210,
                padding: 16,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget && !guardandoPuntual)
                  setShowPuntual(false);
              }}
            >
              <div
                style={{
                  background: TOKENS.bgPanel,
                  border: "1px solid rgba(245,158,11,0.4)",
                  borderRadius: 16,
                  padding: 22,
                  width: "100%",
                  maxWidth: 400,
                  boxShadow: "0 24px 70px rgba(0,0,0,0.8)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: "rgba(245,158,11,0.15)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </div>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 700,
                      color: TOKENS.text,
                    }}
                  >
                    Servicio puntual
                  </h4>
                </div>
                <p
                  style={{
                    margin: "0 0 16px 42px",
                    fontSize: 12,
                    color: TOKENS.textSec,
                    lineHeight: 1.5,
                  }}
                >
                  Para un caso extraordinario: ponle nombre y precio y queda
                  listo al instante.
                </p>

                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: TOKENS.textSec,
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Nombre del servicio
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={puntualNombre}
                    onChange={(e) => setPuntualNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") crearServicioPuntual();
                    }}
                    placeholder="Ej: Retoque rápido"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 8,
                      color: TOKENS.text,
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: TOKENS.textSec,
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Precio (€)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={puntualPrecio}
                      onChange={(e) => setPuntualPrecio(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") crearServicioPuntual();
                      }}
                      placeholder="15"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        borderRadius: 8,
                        color: TOKENS.text,
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: TOKENS.textSec,
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Duración (min)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={puntualDuracion}
                      onChange={(e) => setPuntualDuracion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") crearServicioPuntual();
                      }}
                      placeholder="30"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        borderRadius: 8,
                        color: TOKENS.text,
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                {/* Atajos de duración para que sea aún más rápido */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {["15", "30", "45", "60"].map((d) => {
                    const activo = puntualDuracion === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPuntualDuracion(d)}
                        style={{
                          flex: 1,
                          padding: "7px 0",
                          borderRadius: 8,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          background: activo
                            ? "rgba(245,158,11,0.18)"
                            : TOKENS.bgCard,
                          border: `1px solid ${activo ? "rgba(245,158,11,0.55)" : TOKENS.border}`,
                          color: activo ? "#f59e0b" : TOKENS.textSec,
                        }}
                      >
                        {d} min
                      </button>
                    );
                  })}
                </div>

                {puntualErr && (
                  <div
                    style={{
                      fontSize: 12,
                      color: TOKENS.danger,
                      marginBottom: 12,
                    }}
                  >
                    {puntualErr}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={() => setShowPuntual(false)}
                    disabled={guardandoPuntual}
                    style={{
                      padding: "9px 18px",
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      color: TOKENS.text,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={crearServicioPuntual}
                    disabled={guardandoPuntual}
                    style={{
                      padding: "9px 18px",
                      background: "#f59e0b",
                      color: "#1a1206",
                      border: "none",
                      borderRadius: 8,
                      cursor: guardandoPuntual ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                      opacity: guardandoPuntual ? 0.7 : 1,
                    }}
                  >
                    {guardandoPuntual ? "Creando…" : "Crear y seleccionar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cita recurrente: solo en reserva simple (sin encadenar). */}
        {citasConfirmadas.length === 0 &&
          selectedCliente &&
          selectedServicio &&
          selectedProf &&
          horaActual && (
            <div
              style={{
                flexShrink: 0,
                padding: isMobileOrTablet ? "0 20px 6px" : "0 24px 6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "10px 12px",
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 10,
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: TOKENS.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={repetir}
                    onChange={(e) => setRepetir(e.target.checked)}
                    style={{ accentColor: "#f4501e", width: 15, height: 15 }}
                  />
                  Repetir cita
                </label>
                {repetir && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                      fontSize: 12,
                      color: TOKENS.textSec,
                    }}
                  >
                    <span>cada</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={repetirCada}
                      onChange={(e) =>
                        setRepetirCada(
                          Math.max(
                            1,
                            Math.min(12, parseInt(e.target.value) || 1),
                          ),
                        )
                      }
                      style={{
                        width: 50,
                        height: 32,
                        textAlign: "center",
                        background: TOKENS.bg,
                        border: `1px solid ${TOKENS.border}`,
                        borderRadius: 8,
                        color: TOKENS.text,
                        fontSize: 13,
                      }}
                    />
                    <span>{repetirCada === 1 ? "semana" : "semanas"},</span>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={repetirVeces}
                      onChange={(e) =>
                        setRepetirVeces(
                          Math.max(
                            2,
                            Math.min(12, parseInt(e.target.value) || 2),
                          ),
                        )
                      }
                      style={{
                        width: 50,
                        height: 32,
                        textAlign: "center",
                        background: TOKENS.bg,
                        border: `1px solid ${TOKENS.border}`,
                        borderRadius: 8,
                        color: TOKENS.text,
                        fontSize: 13,
                      }}
                    />
                    <span>citas en total</span>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* Bottom buttons — barra fija inferior: siempre visible y alcanzable */}
        {(() => {
          const formCompleto = !!(
            selectedCliente &&
            selectedServicio &&
            selectedProf &&
            horaActual
          );
          const totalCitas = citasConfirmadas.length + (formCompleto ? 1 : 0);
          const puedeGuardar = totalCitas > 0 && selectedCliente && !guardando;
          const puedeEncadenar = formCompleto && !guardando;
          return (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                flexShrink: 0,
                padding: isMobileOrTablet
                  ? "14px 20px calc(18px + env(safe-area-inset-bottom, 0px))"
                  : "16px 24px",
                borderTop: `1px solid ${TOKENS.border}`,
                background: TOKENS.bgPanel,
              }}
            >
              <button
                onClick={onClose}
                style={{
                  padding: "9px 18px",
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  color: TOKENS.text,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = TOKENS.borderHi;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = TOKENS.border;
                }}
              >
                Cancelar
              </button>
              {puedeEncadenar && (
                <button
                  onClick={handleEncadenarServicio}
                  style={{
                    padding: "9px 18px",
                    background: "rgba(192,38,10,0.1)",
                    border: "1px solid rgba(192,38,10,0.35)",
                    color: "#e0340e",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(192,38,10,0.18)";
                    e.currentTarget.style.borderColor = "#e0340e";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(192,38,10,0.1)";
                    e.currentTarget.style.borderColor = "rgba(192,38,10,0.35)";
                  }}
                >
                  + Encadenar otro
                </button>
              )}
              <button
                onClick={handleGuardar}
                disabled={!puedeGuardar}
                style={{
                  flex: isMobileOrTablet ? 1 : undefined,
                  padding: isMobileOrTablet ? "12px 18px" : "9px 18px",
                  background: !puedeGuardar
                    ? "rgba(244,80,30,0.5)"
                    : `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: !puedeGuardar ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: !puedeGuardar
                    ? "none"
                    : `0 4px 12px rgba(244,80,30,0.4)`,
                  transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  transform: "translateY(0)",
                }}
                onMouseEnter={(e) => {
                  if (puedeGuardar) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = `0 8px 24px rgba(244,80,30,0.6)`;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = puedeGuardar
                    ? `0 4px 12px rgba(244,80,30,0.4)`
                    : "none";
                }}
              >
                {guardando
                  ? "..."
                  : totalCitas > 1
                    ? `Reservar ${totalCitas} citas`
                    : "Reservar cita"}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function TimeBtn({ onClick, plus }: { onClick: () => void; plus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        background: "rgba(148,163,184,0.08)",
        border: `1px solid ${TOKENS.border}`,
        color: TOKENS.textSec,
        cursor: "pointer",
        fontSize: 16,
        fontWeight: 700,
        display: "grid",
        placeItems: "center",
        fontFamily: "inherit",
        flexShrink: 0,
      }}
    >
      {plus ? "+" : "−"}
    </button>
  );
}

function TimeNumBox({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 2,
        padding: "5px 10px",
        borderRadius: 8,
        background: "rgba(244,80,30,0.13)",
        border: "1px solid rgba(244,80,30,0.22)",
        minWidth: label === "h" ? 46 : 52,
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: TOKENS.primary,
          fontFamily: "inherit",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: TOKENS.primary,
          fontFamily: "inherit",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// --- Rail de secciones del DetalleCitaModal (patron maestro-detalle, estilo Booksy) ---
type SeccionCita =
  | "resumen"
  | "cliente"
  | "servicio"
  | "color"
  | "notas"
  | "productos"
  | "pagos"
  | "historial";

const RAIL_ICONS: Record<SeccionCita, (c: string) => React.ReactNode> = {
  resumen: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  cliente: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  ),
  servicio: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />
    </svg>
  ),
  color: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z" />
    </svg>
  ),
  notas: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l3.5-1L18 8.5a1.5 1.5 0 0 0 0-2.1l-.4-.4a1.5 1.5 0 0 0-2.1 0L5 16.5 4 20z" />
    </svg>
  ),
  pagos: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  productos: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.3 7 12 12 20.7 7" /><line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  ),
  historial: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" />
    </svg>
  ),
};

const RAIL_ITEMS: { id: SeccionCita; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "cliente", label: "Cliente" },
  { id: "servicio", label: "Servicio y tiempos" },
  { id: "color", label: "Ficha de color" },
  { id: "productos", label: "Productos" },
  { id: "pagos", label: "Pagos" },
  { id: "historial", label: "Historial" },
];

function SeccionRailItem({
  id,
  label,
  active,
  onClick,
  vertical,
}: {
  id: SeccionCita;
  label: string;
  active: boolean;
  onClick: () => void;
  vertical: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: vertical ? "100%" : "auto",
        padding: vertical ? "10px 14px" : "8px 14px",
        borderRadius: 10,
        border: "none",
        background: active ? "rgba(244,80,30,0.10)" : "transparent",
        color: active ? TOKENS.primaryHi : TOKENS.textSec,
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        textAlign: "left",
        transition:
          "background 0.15s ease, color 0.15s ease, transform 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(244,80,30,0.06)";
        e.currentTarget.style.transform = vertical
          ? "translateX(3px)"
          : "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
        e.currentTarget.style.transform = "none";
      }}
    >
      {RAIL_ICONS[id](active ? TOKENS.primaryHi : TOKENS.textTer)}
      {label}
    </button>
  );
}

export function DetalleCitaModal({
  onClose,
  onSaved,
  onDuplicate,
  cita,
  servicios,
  categorias,
  clientes,
  profesionales,
  citasHoy,
  allCitas,
  retrasosActivo,
  avisarRetrasoActivo,
  bloqueos,
}: any) {
  const router = useRouter();
  const { triggerRefresh } = useCalendarRefresh();
  const { isMobile, isTablet } = useResponsive();
  const cliente = clientes.find((c: any) => c.id === cita.cliente_id);
  const servicio = servicios.find((s: any) => s.id === cita.servicio_id);
  const prof = profesionales.find((p: any) => p.id === cita.profesional_id);

  const [selectedCliente, setSelectedCliente] = useState(cliente);
  const [selectedServicio, setSelectedServicio] = useState(servicio);
  const selectedServicioCategoria = (categorias || []).find(
    (cc: any) => cc.id === selectedServicio?.categoria_id,
  );
  const selectedServicioColor = selectedServicioCategoria
    ? categoryColorHex(selectedServicioCategoria.color)
    : null;
  const [selectedProf, setSelectedProf] = useState(prof);
  const [estado, setEstado] = useState(cita.estado);
  const [qCli, setQCli] = useState("");
  const [qSrv, setQSrv] = useState("");
  const [openCli, setOpenCli] = useState(false);
  const [openSrv, setOpenSrv] = useState(false);
  const [openEst, setOpenEst] = useState(false);

  const [showFichaColor, setShowFichaColor] = useState(false);
  // Seccion activa del rail (patron maestro-detalle estilo Booksy)
  const [seccionActiva, setSeccionActiva] = useState<SeccionCita>("resumen");
  const {
    estado: estadoVoz,
    errorVoz,
    iniciarEscucha,
    detenerEscucha,
  } = useChispaVoz();
  const [loadingDictado, setLoadingDictado] = useState(false);

  async function procesarDictadoNotas(texto: string) {
    if (!texto.trim()) return;
    setLoadingDictado(true);
    setNotasCita((prev: string) => (prev ? `${prev}\n${texto}` : texto));
    setLoadingDictado(false);
  }

  const [activo, setActivo] = useState(
    cita.fin_activa
      ? Math.round(
          (new Date(cita.fin_activa).getTime() -
            new Date(cita.inicio).getTime()) /
            60000,
        )
      : 30,
  );
  const [espera, setEspera] = useState(
    cita.fin_espera
      ? Math.round(
          (new Date(cita.fin_espera).getTime() -
            new Date(cita.fin_activa).getTime()) /
            60000,
        )
      : 0,
  );
  const [activo2, setActivo2] = useState(
    cita.fin
      ? Math.round(
          (new Date(cita.fin).getTime() - new Date(cita.fin_espera).getTime()) /
            60000,
        )
      : 0,
  );
  const [guardando, setGuardando] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [canceladoPor, setCanceladoPor] = useState<"clienta" | "negocio">(
    "negocio",
  );
  // Cita de una serie recurrente: cancelar solo esta o esta y las siguientes.
  const [cancelarSerie, setCancelarSerie] = useState(false);
  // Lista de espera: candidatos compatibles con el hueco liberado al cancelar
  const [candidatosHueco, setCandidatosHueco] = useState<any[] | null>(null);
  const [asignandoCand, setAsignandoCand] = useState<string | null>(null);
  // Sesion 8-B: candidata de Chispa (mejor opcion de lista de espera)
  const [candidataChispa, setCandidataChispa] =
    useState<CandidataListaEspera | null>(null);
  const [citaOrigenParaChispa, setCitaOrigenParaChispa] =
    useState<CitaOrigen | null>(null);
  const [avisandoChispa, setAvisandoChispa] = useState(false);
  // --- Retrasos encadenados con estrategias (IA de agenda, Sesion 4) ---
  const [retrasoPickerOpen, setRetrasoPickerOpen] = useState(false);
  const [estrategiasRetraso, setEstrategiasRetraso] = useState<
    EstrategiaRetraso[] | null
  >(null);
  const [retrasoMin, setRetrasoMin] = useState(0);
  const [aplicandoRetraso, setAplicandoRetraso] = useState(false);
  // --- Cobro (POS-0/1): motor compartido con Caja, ver components/pos/CobroSheet. ---
  const [cobrada, setCobrada] = useState<boolean>(!!cita.cobrada);
  const [showCobro, setShowCobro] = useState(false);
  const [cobroSenalCents, setCobroSenalCents] = useState(0);
  // Inventario del salon (pestaña Productos)
  const [inventarioProductos, setInventarioProductos] = useState<any[]>([]);
  // Productos gastados en esta cita: persistidos en cita_productos. Al anadir
  // se descuenta stock (RPC atomica) y su precio entra en el cobro.
  const [productosCita, setProductosCita] = useState<
    Array<{ id: string; nombre: string; precio: number; cantidad: number }>
  >([]);
  const cargarInventario = useCallback(async () => {
    const prof = await getUserProfile();
    if (!prof?.negocio_id) return;
    // precio_cents (no "precio") y el stock vive en inventario.unidades
    const { data } = await supabase
      .from("productos")
      .select("id, nombre, precio_cents, stock_minimo, inventario(unidades)")
      .eq("negocio_id", prof.negocio_id)
      .eq("activo", true)
      .order("nombre");
    setInventarioProductos(data ?? []);
  }, []);
  const cargarProductosCita = useCallback(async () => {
    const { data } = await supabase
      .from("cita_productos")
      .select("producto_id, nombre, precio_cents, cantidad")
      .eq("cita_id", cita.id);
    setProductosCita(
      (data ?? []).map((r: any) => ({
        id: r.producto_id,
        nombre: r.nombre,
        precio: Number(r.precio_cents ?? 0) / 100,
        cantidad: r.cantidad,
      })),
    );
  }, [cita.id]);
  useEffect(() => {
    cargarInventario();
    cargarProductosCita();
  }, [cargarInventario, cargarProductosCita]);
  const addProductoCita = useCallback(
    async (p: any) => {
      // Optimista; la RPC hace alta/incremento + descuento de stock + movimiento
      setProductosCita((prev) => {
        const i = prev.findIndex((x) => x.id === p.id);
        if (i >= 0)
          return prev.map((x, j) =>
            j === i ? { ...x, cantidad: x.cantidad + 1 } : x,
          );
        return [
          ...prev,
          {
            id: p.id,
            nombre: p.nombre,
            precio: Number(p.precio_cents ?? 0) / 100,
            cantidad: 1,
          },
        ];
      });
      const { error } = await supabase.rpc("cita_producto_add", {
        p_cita_id: cita.id,
        p_producto_id: p.id,
      });
      if (error) await cargarProductosCita();
      await cargarInventario();
    },
    [cita.id, cargarProductosCita, cargarInventario],
  );
  const quitarProductoCita = useCallback(
    async (id: string) => {
      setProductosCita((prev) => {
        const i = prev.findIndex((x) => x.id === id);
        if (i < 0) return prev;
        const actual = prev[i];
        if (actual.cantidad > 1)
          return prev.map((x, j) =>
            j === i ? { ...x, cantidad: x.cantidad - 1 } : x,
          );
        return prev.filter((_, j) => j !== i);
      });
      const { error } = await supabase.rpc("cita_producto_remove", {
        p_cita_id: cita.id,
        p_producto_id: id,
      });
      if (error) await cargarProductosCita();
      await cargarInventario();
    },
    [cita.id, cargarProductosCita, cargarInventario],
  );
  const totalProductosCita = productosCita.reduce(
    (s, p) => s + p.precio * p.cantidad,
    0,
  );
  // Señal ya pagada: para que el cobro inline (pestaña Pagos) descuente bien.
  useEffect(() => {
    if (cobrada) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("pagos")
        .select("tipo, importe_cents, estado")
        .eq("cita_id", cita.id);
      if (cancel) return;
      const senal = (data || [])
        .filter(
          (p: any) =>
            p.tipo === "senal" &&
            ["completado", "pagado", "succeeded", "paid"].includes(p.estado),
        )
        .reduce((s: number, p: any) => s + (p.importe_cents || 0), 0);
      setCobroSenalCents(senal);
    })();
    return () => {
      cancel = true;
    };
  }, [cita.id, cobrada]);
  // Historial del cliente (citas anteriores) para la pestaña Cliente
  const [clienteHistorial, setClienteHistorial] = useState<any[]>([]);
  useEffect(() => {
    const cid = selectedCliente?.id;
    if (!cid) {
      setClienteHistorial([]);
      return;
    }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("citas")
        .select("id, inicio, servicio_id, profesional_id, estado")
        .eq("cliente_id", cid)
        .neq("id", cita.id)
        .order("inicio", { ascending: false })
        .limit(15);
      if (!cancel) setClienteHistorial(data ?? []);
    })();
    return () => {
      cancel = true;
    };
  }, [selectedCliente?.id, cita.id]);
  // Citas del MISMO profesional (pendientes/confirmadas) mapeadas para el calculo de cascada.
  function citasDelProfParaCascada() {
    return (allCitas || [])
      .filter(
        (c: any) =>
          c.profesional_id === cita.profesional_id &&
          (c.estado === "pendiente" || c.estado === "confirmada"),
      )
      .map((c: any) => ({
        id: c.id,
        inicio: c.inicio,
        fin: c.fin,
        fin_activa: c.fin_activa,
        fin_espera: c.fin_espera,
        cliente:
          clientes.find((x: any) => x.id === c.cliente_id)?.nombre ?? null,
        telefono:
          clientes.find((x: any) => x.id === c.cliente_id)?.telefono ?? null,
        servicio:
          servicios.find((x: any) => x.id === c.servicio_id)?.nombre ?? null,
      }));
  }
  // Cierre del dia en ms (para que las estrategias puedan reubicar hasta el final).
  function cierreDelDiaMs(): number {
    const d = new Date(cita.inicio);
    d.setHours(HORARIO_CIERRE.horas, HORARIO_CIERRE.minutos, 0, 0);
    return d.getTime();
  }
  function abrirRetraso(min: number) {
    setRetrasoMin(min);
    setEstrategiasRetraso(
      calcularEstrategiasRetraso(
        citasDelProfParaCascada() as CitaRetraso[],
        cita.id,
        min,
        { cierreMs: cierreDelDiaMs() },
      ),
    );
    setRetrasoPickerOpen(false);
  }
  // Aplica la estrategia elegida: desplaza las citas segun sus updates y, si se pidio
  // avisar, marca retraso_aviso_pendiente en los afectados con telefono (el motor n8n
  // cron-pull manda la plantilla aviso_retraso, gateado por notifRetrasoActiva del salon).
  async function aplicarRetraso(
    estrategia: EstrategiaRetraso,
    avisarClientes: boolean,
  ) {
    setAplicandoRetraso(true);
    try {
      const avisar = new Set<string>(
        avisarClientes
          ? estrategia.avisos
              .filter(
                (a) => a.telefono && String(a.telefono).trim().length >= 6,
              )
              .map((a) => a.cita_id)
          : [],
      );
      for (const u of estrategia.updates) {
        const { id, ...campos } = u;
        if (avisar.has(id)) (campos as any).retraso_aviso_pendiente = true;
        await supabase.from("citas").update(campos).eq("id", id);
      }
      setEstrategiasRetraso(null);
      onSaved?.();
      triggerRefresh?.();
      onClose?.();
    } catch {
      setAplicandoRetraso(false);
    }
  }
  const [fechaEditada, setFechaEditada] = useState(() => new Date(cita.inicio));
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [horaEditada, setHoraEditada] = useState(() => {
    const d = new Date(cita.inicio);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  function adjustFecha(delta: number) {
    setFechaEditada((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  }
  function adjustHora(dh: number, dm: number) {
    const [h, m] = horaEditada.split(":").map(Number);
    let newH = h + dh;
    let newM = m + dm;
    if (newM < 0) {
      newM = 55;
      newH -= 1;
    }
    if (newM >= 60) {
      newM = 0;
      newH += 1;
    }
    newH = ((newH % 24) + 24) % 24;
    setHoraEditada(
      `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`,
    );
  }
  const [errMsg, setErrMsg] = useState("");
  const [notasCita, setNotasCita] = useState(cita.notas ?? "");
  const [citaAddons, setCitaAddons] = useState<any[]>([]);
  const [availableAddons, setAvailableAddons] = useState<any[]>([]);
  const [togglingAddon, setTogglingAddon] = useState<string | null>(null);
  // Riesgo de no-show de la clienta (Sesion 7): score neutro derivado del historial,
  // solo para el equipo. Se pide a la RPC al abrir; null si es baja o sin clienta.
  const [riesgoCliente, setRiesgoCliente] = useState<RiesgoNoShow | null>(null);
  // Nivel de fidelidad de la clienta (junto al nombre): nombre + color del nivel.
  const [nivelFidel, setNivelFidel] = useState<{
    nombre: string;
    color: string;
    visitas: number;
  } | null>(null);
  const [holdPagoId, setHoldPagoId] = useState<string | null>(null); // fianza retenida (hold) de esta cita, si la hay

  // ¿La cita ya paso y sigue en un estado que admite marcarla como no-show?
  const citaPasada = new Date(cita.inicio) < new Date();
  const puedeMarcarNoShow =
    citaPasada &&
    (cita.estado === "confirmada" || cita.estado === "completada");

  async function marcarNoShow() {
    if (guardando) return;
    setGuardando(true);
    setErrMsg("");
    try {
      const { data, error } = await supabase.rpc("marcar_cita_no_show", {
        p_cita_id: cita.id,
      });
      const res = (data ?? {}) as {
        ok?: boolean;
        error?: string;
        hold_pago_id?: string | null;
        capturar_auto?: boolean;
      };
      if (error || !res.ok) {
        const map: Record<string, string> = {
          no_autorizado: "No tienes permiso para marcar ausencias.",
          cita_futura: "La cita aun no ha pasado.",
          estado_no_valido:
            "Solo se puede marcar en citas confirmadas o completadas.",
        };
        setErrMsg(
          error?.message ||
            map[res.error ?? ""] ||
            "No se pudo marcar la ausencia.",
        );
        setGuardando(false);
        return;
      }
      // Fianza en modo hold: si el negocio captura en auto y hay retencion, capturarla ahora.
      if (res.capturar_auto && res.hold_pago_id) {
        try {
          await supabase.functions.invoke("capturar-hold", {
            body: { pago_id: res.hold_pago_id },
          });
        } catch {
          /* no bloquear el no-show */
        }
      }
      onSaved?.();
      triggerRefresh?.();
      onClose?.();
    } catch (e) {
      setErrMsg(String(e));
      setGuardando(false);
    }
  }

  // Fianza retenida (hold): detectarla para ofrecer captura/liberacion manual desde la ficha.
  useEffect(() => {
    let cancel = false;
    supabase
      .from("pagos")
      .select("id")
      .eq("cita_id", cita.id)
      .eq("tipo", "senal")
      .eq("estado", "retenido")
      .maybeSingle()
      .then(({ data }: any) => {
        if (!cancel) setHoldPagoId(data?.id ?? null);
      });
    return () => {
      cancel = true;
    };
  }, [cita.id]);

  async function gestionarFianza(accion: "capturar" | "liberar") {
    if (guardando || !holdPagoId) return;
    setGuardando(true);
    setErrMsg("");
    try {
      const fn = accion === "capturar" ? "capturar-hold" : "liberar-hold";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { pago_id: holdPagoId },
      });
      if (error || !(data as any)?.ok) throw new Error("fallo");
      setHoldPagoId(null);
      onSaved?.();
      triggerRefresh?.();
      onClose?.();
    } catch {
      setErrMsg(
        accion === "capturar"
          ? "No se pudo capturar la fianza (puede que ya se procesara)."
          : "No se pudo liberar la fianza (puede que ya se procesara).",
      );
      setGuardando(false);
    }
  }

  async function anularCobro() {
    if (guardando) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("¿Anular este cobro? La cita volvera a estar sin cobrar.")
    )
      return;
    setGuardando(true);
    setErrMsg("");
    try {
      const { data, error } = await supabase.rpc("anular_cobro", {
        p_cita_id: cita.id,
      });
      const res = (data ?? {}) as { ok?: boolean; error?: string };
      if (error || !res.ok) {
        const map: Record<string, string> = {
          no_autorizado: "No tienes permiso para anular cobros.",
          cobro_no_encontrado: "No se encuentra el cobro.",
          usa_reembolso:
            "Este cobro es online: anulalo con Reembolsar en Caja.",
        };
        setErrMsg(
          error?.message ||
            map[res.error ?? ""] ||
            "No se pudo anular el cobro.",
        );
        setGuardando(false);
        return;
      }
      onSaved?.();
      triggerRefresh?.();
      onClose?.();
    } catch (e) {
      setErrMsg(String(e));
      setGuardando(false);
    }
  }

  useEffect(() => {
    let cancel = false;
    if (!cita.cliente_id) {
      setRiesgoCliente(null);
      return;
    }
    supabase
      .rpc("riesgo_no_show_cliente", { p_cliente_id: cita.cliente_id })
      .then(({ data }) => {
        if (!cancel && data) setRiesgoCliente(data as RiesgoNoShow);
      });
    return () => {
      cancel = true;
    };
  }, [cita.cliente_id]);

  useEffect(() => {
    let cancel = false;
    if (!cita.cliente_id) {
      setNivelFidel(null);
      return;
    }
    obtenerNivelCliente(cita.cliente_id)
      .then((r) => {
        if (cancel || !r.ok || !r.nivel_nombre) return;
        setNivelFidel({
          nombre: r.nivel_nombre,
          color: r.nivel_color || "#9ca3af",
          visitas: r.visitas || 0,
        });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [cita.cliente_id]);

  useEffect(() => {
    supabase
      .from("cita_addons")
      .select("addon_id, service_addons(nombre, duracion_min, precio)")
      .eq("cita_id", cita.id)
      .then(({ data }) => setCitaAddons(data ?? []));
  }, [cita.id]);

  useEffect(() => {
    const srvId = selectedServicio?.id || cita.servicio_id;
    if (!srvId) {
      setAvailableAddons([]);
      return;
    }
    supabase
      .from("service_addons")
      .select("id, nombre, duracion_min, precio")
      .eq("servicio_id", srvId)
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setAvailableAddons(data ?? []));
  }, [selectedServicio?.id, cita.servicio_id]);

  const toggleAddon = async (addon: any) => {
    setTogglingAddon(addon.id);
    const exists = citaAddons.find((ca: any) => ca.addon_id === addon.id);
    const delta = addon.duracion_min || 0;

    if (exists) {
      await supabase
        .from("cita_addons")
        .delete()
        .eq("cita_id", cita.id)
        .eq("addon_id", addon.id);
      setCitaAddons((prev) =>
        prev.filter((ca: any) => ca.addon_id !== addon.id),
      );
    } else {
      await supabase
        .from("cita_addons")
        .insert({ cita_id: cita.id, addon_id: addon.id });
      setCitaAddons((prev) => [
        ...prev,
        { addon_id: addon.id, service_addons: addon },
      ]);
    }

    // Addons suman al final: solo cambia fin, no fin_activa ni fin_espera
    const inicioDate = new Date(cita.inicio);
    const finActivaDate = new Date(inicioDate.getTime() + activo * 60000);
    const finEsperaDate = new Date(finActivaDate.getTime() + espera * 60000);
    const newActivo2 = exists ? Math.max(0, activo2 - delta) : activo2 + delta;
    const newFin = new Date(finEsperaDate.getTime() + newActivo2 * 60000);
    setActivo2(newActivo2);

    await supabase
      .from("citas")
      .update({
        fin: newFin.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cita.id);

    triggerRefresh();
    setTogglingAddon(null);
  };

  // Seguimiento de resena del cliente (marcado manual; las resenas del portal son anonimas).
  // Se guarda en clientes.etiquetas del cliente de la cita.
  const [clienteTags, setClienteTags] = useState<string[]>(
    selectedCliente?.etiquetas ?? [],
  );
  const [savingResena, setSavingResena] = useState(false);
  useEffect(() => {
    setClienteTags(selectedCliente?.etiquetas ?? []);
  }, [selectedCliente?.id]);
  const toggleResenaTag = async (tag: string) => {
    if (!selectedCliente?.id || savingResena) return;
    setSavingResena(true);
    // Lectura-modificacion-escritura fresca para no pisar otras etiquetas del cliente.
    const { data } = await supabase
      .from("clientes")
      .select("etiquetas")
      .eq("id", selectedCliente.id)
      .single();
    const current: string[] = data?.etiquetas ?? clienteTags ?? [];
    const has = current.includes(tag);
    const next = has
      ? current.filter((x) => x !== tag)
      : Array.from(new Set([...current, tag]));
    await supabase
      .from("clientes")
      .update({ etiquetas: next })
      .eq("id", selectedCliente.id);
    setClienteTags(next);
    setSavingResena(false);
  };

  const hasFormula = !!(
    cita.formula_producto ||
    cita.formula_tono ||
    cita.formula_tiempo_min != null ||
    cita.formula_resultado ||
    cita.formula_notas
  );
  const [showFormula, setShowFormula] = useState(true);
  const [confirmadaCliente, setConfirmadaCliente] = useState<boolean>(
    !!cita.confirmada_cliente,
  );
  const [togglingConfirma, setTogglingConfirma] = useState(false);
  const [chainOverlapInfo, setChainOverlapInfo] = useState<any>(null);
  const [loadingChainInfo, setLoadingChainInfo] = useState(false);
  const [showChainForm, setShowChainForm] = useState(false);
  const [chainServicioId, setChainServicioId] = useState<string | null>(null);
  const [chainProfId, setChainProfId] = useState<string | null>(null);
  const [chainGuardando, setChainGuardando] = useState(false);
  const [chainErr, setChainErr] = useState("");
  const [historial, setHistorial] = useState<any[]>([]);
  const [showHistorial, setShowHistorial] = useState(true);

  useEffect(() => {
    supabase
      .from("citas_historial")
      .select("campo, valor_anterior, valor_nuevo, motivo, created_at")
      .eq("cita_id", cita.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setHistorial(data ?? []));
  }, [cita.id]);

  useEffect(() => {
    setConfirmadaCliente(!!cita.confirmada_cliente);
  }, [cita.confirmada_cliente]);

  async function toggleConfirma() {
    if (togglingConfirma) return;
    setTogglingConfirma(true);
    const next = !confirmadaCliente;
    const { error: e } = await supabase
      .from("citas")
      .update({
        confirmada_cliente: next,
        confirmada_at: next ? new Date().toISOString() : null,
      })
      .eq("id", cita.id);
    setTogglingConfirma(false);
    if (e) {
      setErrMsg(mensajeDeError(e, "No se pudo cambiar la confirmacion."));
      return;
    }
    setConfirmadaCliente(next);
    triggerRefresh();
  }

  useEffect(() => {
    async function detectChainOverlap() {
      if (!cita.grupo_id || !selectedProf) {
        setChainOverlapInfo(null);
        return;
      }
      setLoadingChainInfo(true);
      try {
        const profile = await getUserProfile();
        const negocioId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
        const { data: citasDelGrupo } = await supabase
          .from("citas")
          .select("*")
          .eq("grupo_id", cita.grupo_id)
          .eq("negocio_id", negocioId);
        if (!citasDelGrupo || citasDelGrupo.length <= 1) {
          setChainOverlapInfo(null);
          setLoadingChainInfo(false);
          return;
        }
        const sortedGroup = (citasDelGrupo as any[]).sort(
          (a, b) => (a.orden_en_grupo ?? 0) - (b.orden_en_grupo ?? 0),
        );
        const currentIndex = sortedGroup.findIndex(
          (c: any) => c.id === cita.id,
        );
        if (currentIndex === -1) {
          setChainOverlapInfo(null);
          setLoadingChainInfo(false);
          return;
        }
        const prevCitas = sortedGroup.slice(0, currentIndex);
        const nextCitas = sortedGroup.slice(currentIndex + 1);
        const currentInicio = new Date(cita.inicio);
        const currentFin = new Date(cita.fin);
        let overlaps: any = {
          before: false,
          after: false,
          beforeCita: null,
          afterCita: null,
        };
        for (const prev of prevCitas) {
          const prevFin = new Date(prev.fin);
          if (prevFin > currentInicio) {
            overlaps.before = true;
            overlaps.beforeCita = prev;
            break;
          }
        }
        for (const next of nextCitas) {
          const nextInicio = new Date(next.inicio);
          if (nextInicio < currentFin) {
            overlaps.after = true;
            overlaps.afterCita = next;
            break;
          }
        }
        if (overlaps.before || overlaps.after) {
          setChainOverlapInfo(overlaps);
        } else {
          setChainOverlapInfo(null);
        }
      } catch (err) {
        console.error("Error detecting chain overlap:", err);
        setChainOverlapInfo(null);
      } finally {
        setLoadingChainInfo(false);
      }
    }
    detectChainOverlap();
  }, [cita.grupo_id, cita.inicio, cita.fin, selectedProf]);

  const [formulaProducto, setFormulaProducto] = useState(
    cita.formula_producto ?? "",
  );
  const [formulaTono, setFormulaTono] = useState(cita.formula_tono ?? "");
  const [formulaTiempo, setFormulaTiempo] = useState(
    cita.formula_tiempo_min != null ? String(cita.formula_tiempo_min) : "",
  );
  const [formulaResultado, setFormulaResultado] = useState(
    cita.formula_resultado ?? "",
  );
  const [formulaNotas, setFormulaNotas] = useState(cita.formula_notas ?? "");

  const totalMin = activo + espera + activo2;
  const citaDate = new Date(cita.inicio).toLocaleDateString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  const citaHora = new Date(cita.inicio).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const citaFinHora = new Date(cita.fin).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Horas reales EN VIVO derivadas de la hora + secuencia que se estan editando
  // (se recalculan al mover los sliders): intervalo total, limites de cada fase y
  // duracion, para que cada tramo diga "de 14:00 a 14:40" y no solo "40 min".
  const fmtHora = (d: Date) =>
    d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  const inicioLive = (() => {
    const [h, m] = horaEditada.split(":").map(Number);
    const d = new Date(fechaEditada);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  })();
  const finActiva1Live = new Date(inicioLive.getTime() + activo * 60000);
  const finEsperaLive = new Date(finActiva1Live.getTime() + espera * 60000);
  const finLive = new Date(finEsperaLive.getTime() + activo2 * 60000);
  const durTexto =
    totalMin >= 60
      ? `${Math.floor(totalMin / 60)}h${totalMin % 60 ? ` ${totalMin % 60}m` : ""}`
      : `${totalMin}m`;

  const handleGuardar = async () => {
    if (!selectedCliente || !selectedServicio || !selectedProf) return;
    setErrMsg("");
    setGuardando(true);
    try {
      const [hh, mm] = horaEditada.split(":").map(Number);
      const inicioDate = new Date(fechaEditada);
      inicioDate.setHours(hh, mm, 0, 0);

      const finActiva = new Date(inicioDate.getTime() + activo * 60000);
      const finEspera = new Date(finActiva.getTime() + espera * 60000);
      const fin = new Date(finEspera.getTime() + activo2 * 60000);

      const originalInicio = new Date(cita.inicio);
      const originalFin = new Date(cita.fin);
      const inicioMoved = inicioDate.getTime() !== originalInicio.getTime();
      const profMoved = selectedProf.id !== cita.profesional_id;

      // Horario laboral del profesional (respeta turnos / horario partido).
      // Solo al mover la cita o cambiar de profesional, para no bloquear
      // ediciones (notas, formula) de citas ya existentes.
      if (inicioMoved || profMoved) {
        const errHorarioEdit = await validarHorarioLaboral(
          selectedProf.id,
          inicioDate,
          fin,
        );
        if (errHorarioEdit) {
          setErrMsg(errHorarioEdit);
          setGuardando(false);
          return;
        }
      }

      if (inicioMoved && citasHoy) {
        // MOVER: validar solapamiento, sin cascade
        const conflictActivo1 = isTimeSlotOccupied(
          inicioDate,
          finActiva,
          citasHoy,
          selectedProf.id,
          cita.id,
        );
        const conflictActivo2 =
          activo2 > 0 &&
          isTimeSlotOccupied(
            finEspera,
            fin,
            citasHoy,
            selectedProf.id,
            cita.id,
          );
        if (conflictActivo1 || conflictActivo2) {
          setErrMsg(
            "Conflicto activo+activo: la fase activa se solapa con otra cita activa del profesional.",
          );
          setGuardando(false);
          return;
        }
      }

      // Bloqueo duro: si esta cita está dentro del tiempo de espera de otra,
      // el nuevo fin activo no puede superar el fin de ese tiempo de espera (RN-AG-013)
      if (!inicioMoved && citasHoy) {
        const hostCita = (citasHoy as any[]).find(
          (c: any) =>
            c.id !== cita.id &&
            c.profesional_id === selectedProf.id &&
            c.fin_activa &&
            new Date(c.fin_activa) <= inicioDate &&
            c.fin_espera &&
            new Date(c.fin_espera) > inicioDate,
        );
        if (hostCita && finActiva > new Date(hostCita.fin_espera)) {
          setErrMsg(
            "El tiempo activo supera el tiempo de espera de la cita anterior.",
          );
          setGuardando(false);
          return;
        }
      }

      const formulaTiempoNum = formulaTiempo.trim()
        ? parseInt(formulaTiempo.trim(), 10)
        : null;
      const updatedFields = {
        inicio: inicioDate.toISOString(),
        cliente_id: selectedCliente.id,
        servicio_id: selectedServicio.id,
        profesional_id: selectedProf.id,
        estado,
        fin_activa: finActiva.toISOString(),
        fin_espera: finEspera.toISOString(),
        fin: fin.toISOString(),
        notas: notasCita.trim() || null,
        formula_producto: formulaProducto.trim() || null,
        formula_tono: formulaTono.trim() || null,
        formula_tiempo_min:
          formulaTiempoNum != null && !isNaN(formulaTiempoNum)
            ? formulaTiempoNum
            : null,
        formula_resultado: formulaResultado.trim() || null,
        formula_notas: formulaNotas.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("citas")
        .update(updatedFields)
        .eq("id", cita.id);
      if (error) throw error;

      // Registrar historial de cambios relevantes
      const profile = await getUserProfile();
      const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
      const cambiosHist: {
        campo: string;
        valor_anterior: string;
        valor_nuevo: string;
      }[] = [];
      if (updatedFields.inicio !== cita.inicio)
        cambiosHist.push({
          campo: "inicio",
          valor_anterior: cita.inicio,
          valor_nuevo: updatedFields.inicio,
        });
      if (updatedFields.fin !== cita.fin)
        cambiosHist.push({
          campo: "fin",
          valor_anterior: cita.fin,
          valor_nuevo: updatedFields.fin,
        });
      if (updatedFields.profesional_id !== cita.profesional_id)
        cambiosHist.push({
          campo: "profesional_id",
          valor_anterior: cita.profesional_id,
          valor_nuevo: updatedFields.profesional_id,
        });
      if (updatedFields.estado !== cita.estado)
        cambiosHist.push({
          campo: "estado",
          valor_anterior: cita.estado,
          valor_nuevo: updatedFields.estado,
        });
      if (cambiosHist.length > 0) {
        await supabase.from("citas_historial").insert(
          cambiosHist.map((c) => ({
            cita_id: cita.id,
            negocio_id: nId,
            campo: c.campo,
            valor_anterior: c.valor_anterior,
            valor_nuevo: c.valor_nuevo,
            motivo: "Edicion manual",
          })),
        );
      }

      if (selectedCliente?.id && notasCita.trim()) {
        await syncAlergiasACliente(selectedCliente.id, notasCita.trim());
      }

      // Cascade solo cuando las barras de duracion cambiaron (inicio no se movio)
      if (!inicioMoved) {
        // Desplazar automaticamente citas dentro del tiempo de espera
        const originalFinActiva = cita.fin_activa
          ? new Date(cita.fin_activa)
          : originalFin;
        const originalFinEspera = cita.fin_espera
          ? new Date(cita.fin_espera)
          : originalFin;
        const deltaActiva = finActiva.getTime() - originalFinActiva.getTime();
        if (deltaActiva !== 0 && citasHoy) {
          const citasEnEspera = (citasHoy as any[]).filter(
            (c: any) =>
              c.profesional_id === selectedProf.id &&
              c.id !== cita.id &&
              new Date(c.inicio) >= originalFinActiva &&
              new Date(c.inicio) < originalFinEspera,
          );
          for (const sig of citasEnEspera) {
            const p: any = {
              inicio: new Date(
                new Date(sig.inicio).getTime() + deltaActiva,
              ).toISOString(),
              fin: new Date(
                new Date(sig.fin).getTime() + deltaActiva,
              ).toISOString(),
            };
            if (sig.fin_activa)
              p.fin_activa = new Date(
                new Date(sig.fin_activa).getTime() + deltaActiva,
              ).toISOString();
            if (sig.fin_espera)
              p.fin_espera = new Date(
                new Date(sig.fin_espera).getTime() + deltaActiva,
              ).toISOString();
            await supabase.from("citas").update(p).eq("id", sig.id);
          }
        }

        const delayMs = fin.getTime() - originalFin.getTime();
        if (delayMs > 0 && citasHoy) {
          const posteriores = (citasHoy as any[]).filter(
            (c: any) =>
              c.profesional_id === selectedProf.id &&
              c.id !== cita.id &&
              new Date(c.inicio) >= originalFin,
          );
          // El nuevo fin es la barrera: la cascada absorbe los huecos y se corta en la
          // primera cita a la que el alargamiento ya no llega. Alargar sin solapar con
          // nadie no mueve nada, y cada afectada se desplaza solo lo justo.
          const propuesta = calcularCascada(
            posteriores.map((c: any) => ({
              id: c.id,
              inicio: c.inicio,
              fin: c.fin,
            })),
            fin.getTime(),
          );
          const n = propuesta.totalAfectadas;
          if (n > 0) {
            const delayMin = Math.round(delayMs / 60000);
            const ok = window.confirm(
              `Esta cita se ha alargado ${delayMin} min.\n\nSe solapa con ${n} cita${n > 1 ? "s" : ""} siguiente${n > 1 ? "s" : ""} de ${selectedProf.nombre}.\n\n¿Desplazar${n > 1 ? "las" : "la"} tambien?`,
            );
            if (ok) {
              const updates = construirUpdatesRetraso(
                propuesta,
                posteriores as CitaTiempos[],
              );
              for (const u of updates) {
                const { id, ...campos } = u;
                await supabase.from("citas").update(campos).eq("id", id);
              }
            }
          }
        }
      }

      triggerRefresh();
      onSaved?.(updatedFields) ?? onClose();
    } catch (err) {
      console.error("Error al guardar:", err);
      alert(mensajeDeError(err, "No se pudo guardar la cita."));
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    setGuardando(true);
    try {
      const payload: any = {
        oculta_en_calendario: true,
        cancelado_por: canceladoPor,
        motivo_cancelacion: motivoCancelacion.trim() || null,
      };
      if (cita.estado !== CITA_STATUS.CANCELADA)
        payload.estado = CITA_STATUS.CANCELADA;
      // Cancel this cita
      const { error } = await supabase
        .from("citas")
        .update(payload)
        .eq("id", cita.id);
      if (error) throw error;
      // If part of a group, cancel all siblings too
      if (cita.grupo_id) {
        await supabase
          .from("citas")
          .update(payload)
          .eq("grupo_id", cita.grupo_id)
          .neq("id", cita.id);
      }
      // Serie recurrente: si se pidio "y las siguientes", cancela las futuras de la serie.
      if (cita.serie_id && cancelarSerie) {
        await supabase
          .from("citas")
          .update(payload)
          .eq("serie_id", cita.serie_id)
          .gte("inicio", cita.inicio)
          .neq("id", cita.id);
      }
      triggerRefresh();

      // Sesion 8-B: matching con Chispa (mejor candidata de lista de espera)
      try {
        const { data: matchData } = await supabase.rpc(
          "matching_lista_espera",
          { p_cita_id: cita.id },
        );
        if (matchData && typeof matchData === "object" && matchData.ok) {
          const candidata = matchData.candidata as CandidataListaEspera | null;
          const citaOrigen = matchData.cita_origen as CitaOrigen | null;
          if (candidata && citaOrigen) {
            setCandidataChispa(candidata);
            setCitaOrigenParaChispa(citaOrigen);
            setGuardando(false);
            setShowCancelModal(false);
            return; // Priorizamos la propuesta de Chispa
          }
        }
      } catch (e) {
        console.warn("Error al llamar a matching_lista_espera:", e);
        // Continuamos con el flujo manual si falla
      }

      // Hueco liberado: ofrecer los candidatos de la lista de espera compatibles (sin WhatsApp)
      let cands: any[] = [];
      try {
        const { data } = await supabase.rpc("candidatos_para_hueco", {
          p_cita_id: cita.id,
        });
        if (Array.isArray(data)) cands = data;
      } catch {
        /* si falla, simplemente no mostramos el panel */
      }
      if (cands.length > 0) {
        setCandidatosHueco(cands);
        return;
      }
      onSaved?.() ?? onClose();
    } catch (err) {
      console.error("Error al cancelar:", err);
      alert(mensajeDeError(err, "No se pudo cancelar la cita."));
    } finally {
      setGuardando(false);
      setShowCancelModal(false);
    }
  };

  const asignarCandidato = async (candId: string) => {
    setAsignandoCand(candId);
    try {
      const { data, error } = await supabase.rpc("asignar_candidato_hueco", {
        p_cita_id: cita.id,
        p_candidato_id: candId,
      });
      if (error) throw error;
      if (!data || !data.ok)
        throw new Error(data?.error || "No se pudo asignar");
      triggerRefresh();
      setCandidatosHueco(null);
      onSaved?.() ?? onClose();
    } catch (err) {
      console.error("Error al asignar candidato:", err);
      alert(mensajeDeError(err, "No se pudo asignar el candidato al hueco."));
      setAsignandoCand(null);
    }
  };

  // Sesion 8-B: confirmar aviso a candidata de lista de espera (Chispa)
  const confirmarAvisoChispa = async (listaEsperaId: string) => {
    setAvisandoChispa(true);
    try {
      const profile = await getUserProfile();
      if (!profile?.id) {
        alert("No se pudo obtener tu perfil de usuario.");
        setAvisandoChispa(false);
        return;
      }
      const negocioId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;

      // Construir la acción para Chispa con todos los campos requeridos
      const accion: AccionPropuesta = {
        tipo: "avisar_lista_espera_match",
        negocio_id: negocioId,
        lista_espera_id: listaEsperaId,
        cita_origen_id: citaOrigenParaChispa?.id || cita.id,
        cliente_nombre: candidataChispa?.nombre || "Clienta",
        servicio_nombre:
          servicios.find((s: any) => s.id === cita.servicio_id)?.nombre ||
          "Servicio",
        profesional_nombre:
          profesionales.find((p: any) => p.id === cita.profesional_id)
            ?.nombre || "Profesional",
        inicio: citaOrigenParaChispa?.inicio || cita.inicio,
        fidelidad_citas: candidataChispa?.fidelidad_citas ?? 0,
        resumen: `Avisar a ${candidataChispa?.nombre || "clienta"} por el hueco liberado`,
      };

      const resultado = await ejecutarAccion(accion, profile.id);
      if (resultado.ok) {
        triggerRefresh();
        setCandidataChispa(null);
        setCitaOrigenParaChispa(null);
        onSaved?.() ?? onClose();
      } else {
        alert(`No se pudo avisar a la clienta: ${resultado.error}`);
      }
    } catch (err) {
      console.error("Error al avisar a la clienta:", err);
      alert(mensajeDeError(err, "No se pudo avisar a la clienta."));
    } finally {
      setAvisandoChispa(false);
    }
  };

  // Helper: check if a new active window overlaps with any active phase of an existing cita
  // A cita has TWO active phases: [inicio→fin_activa] + [fin_espera→fin] (activa_extra)
  // During reposo (fin_activa→fin_espera) the professional is FREE
  const citaActivaOverlap = (
    c: any,
    newInicio: Date,
    newFinActiva: Date,
  ): boolean => {
    const ci = new Date(c.inicio);
    const cfa = new Date(c.fin_activa);
    const cfe = c.fin_espera ? new Date(c.fin_espera) : null;
    const cf = new Date(c.fin);
    // Overlap with first active phase
    if (ci < newFinActiva && cfa > newInicio) return true;
    // Overlap with activa_extra (second active phase after reposo)
    if (
      cfe &&
      cf.getTime() > cfe.getTime() &&
      cfe < newFinActiva &&
      cf > newInicio
    )
      return true;
    return false;
  };

  // Helper: resolve durations for a prof+service via cascade
  const resolverDuraciones = async (profId: string, servicioId: string) => {
    const srv = servicios.find((s: any) => s.id === servicioId);
    if (!srv) throw new Error("Servicio no encontrado");
    const [{ data: profSrvOvs }, { data: durOvs }] = await Promise.all([
      supabase
        .from("professional_service_overrides")
        .select("duracion, duracion_espera_min, duracion_activa_extra_min")
        .eq("professional_id", profId)
        .eq("service_id", servicioId),
      supabase
        .from("duraciones_profesional")
        .select(
          "duracion_activa_min, duracion_espera_min, duracion_activa_extra_min",
        )
        .eq("profesional_id", profId)
        .eq("servicio_id", servicioId),
    ]);
    const pso = profSrvOvs?.[0];
    const dov = durOvs?.[0];
    return {
      durActiva:
        pso?.duracion ??
        dov?.duracion_activa_min ??
        srv.duracion_activa_min ??
        30,
      durEspera:
        pso?.duracion_espera_min ??
        dov?.duracion_espera_min ??
        srv.duracion_espera_min ??
        0,
      durActivaExtra:
        pso?.duracion_activa_extra_min ??
        dov?.duracion_activa_extra_min ??
        srv.duracion_activa_extra_min ??
        0,
    };
  };

  // Helper: get chain start time (fin of last cita in group)
  const getChainInicio = (): Date => {
    if (cita.grupo_id && allCitas) {
      const siblings = (allCitas as any[]).filter(
        (c: any) => c.grupo_id === cita.grupo_id,
      );
      const maxSib = siblings.reduce(
        (best: any, c: any) =>
          !best || (c.orden_en_grupo ?? 0) > (best.orden_en_grupo ?? 0)
            ? c
            : best,
        null,
      );
      return maxSib ? new Date(maxSib.fin) : new Date(cita.fin);
    }
    return new Date(cita.fin);
  };

  // Helper: create the chained cita in DB
  const crearCitaEncadenada = async (
    profId: string,
    servicioId: string,
    inicioDate: Date,
    durActiva: number,
    durEspera: number,
    durActivaExtra: number,
  ) => {
    const profile = await getUserProfile();
    const negocioId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    const userId = (await supabase.auth.getUser()).data.user?.id || null;

    const chainFinActiva = new Date(inicioDate.getTime() + durActiva * 60000);
    const chainFinEspera = new Date(
      inicioDate.getTime() + (durActiva + durEspera) * 60000,
    );
    const chainFin = new Date(
      inicioDate.getTime() + (durActiva + durEspera + durActivaExtra) * 60000,
    );

    const solapamientoBloqueo = bloqueos.some(
      (b: any) =>
        b.profesional_id === profId &&
        inicioDate.getTime() < new Date(b.fin).getTime() &&
        chainFin.getTime() > new Date(b.inicio).getTime()
    );
    if (solapamientoBloqueo) {
      alert("No se puede crear el servicio encadenado porque colisiona con un periodo bloqueante (ej. vacaciones) del profesional seleccionado.");
      return;
    }

    let grupoId = cita.grupo_id;
    let maxOrden = cita.orden_en_grupo ?? 0;
    if (!grupoId) {
      grupoId = crypto.randomUUID();
      await supabase
        .from("citas")
        .update({ grupo_id: grupoId, orden_en_grupo: 0 })
        .eq("id", cita.id);
      maxOrden = 0;
    } else if (allCitas) {
      const siblings = (allCitas as any[]).filter(
        (c: any) => c.grupo_id === grupoId,
      );
      maxOrden = Math.max(
        ...siblings.map((c: any) => c.orden_en_grupo ?? 0),
        0,
      );
    }

    const { error } = await supabase
      .from("citas")
      .insert({
        negocio_id: negocioId,
        profesional_id: profId,
        servicio_id: servicioId,
        cliente_id: cita.cliente_id,
        inicio: inicioDate.toISOString(),
        fin: chainFin.toISOString(),
        fin_activa: chainFinActiva.toISOString(),
        fin_espera: chainFinEspera.toISOString(),
        estado: CITA_STATUS.CONFIRMADA,
        canal: "manual",
        creado_por: userId,
        grupo_id: grupoId,
        orden_en_grupo: maxOrden + 1,
      })
      .select();

    if (error) throw new Error(error.message);
    triggerRefresh();
    onClose();
  };

  const handleEncadenar = async () => {
    if (!chainServicioId || !chainProfId) return;
    setChainErr("");
    setChainGuardando(true);
    try {
      const { durActiva, durEspera, durActivaExtra } = await resolverDuraciones(
        chainProfId,
        chainServicioId,
      );

      const chainInicio = getChainInicio();
      const chainFinActiva = new Date(
        chainInicio.getTime() + durActiva * 60000,
      );

      // Validate overlap (broad fetch, filter both active phases)
      const { data: potentialOverlaps } = await supabase
        .from("citas")
        .select("id, inicio, fin_activa, fin_espera, fin")
        .eq("profesional_id", chainProfId)
        .eq("estado", CITA_STATUS.CONFIRMADA)
        .lt("inicio", chainFinActiva.toISOString())
        .gt("fin", chainInicio.toISOString());
      const solapadas = (potentialOverlaps || []).filter((c: any) =>
        citaActivaOverlap(c, chainInicio, chainFinActiva),
      );

      if (solapadas.length > 0) {
        const profName =
          profesionales.find((p: any) => p.id === chainProfId)?.nombre ||
          "Profesional";
        const fmtH = (d: Date) =>
          d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        setChainErr(
          `${profName} tiene otra cita activa en esa franja (${fmtH(chainInicio)}-${fmtH(chainFinActiva)})`,
        );
        setChainGuardando(false);
        return;
      }

      await crearCitaEncadenada(
        chainProfId,
        chainServicioId,
        chainInicio,
        durActiva,
        durEspera,
        durActivaExtra,
      );
    } catch (e: any) {
      setChainErr(e?.message ?? "Error inesperado");
    } finally {
      setChainGuardando(false);
    }
  };

  // Computed: chain timing preview
  const chainTimingPreview = (() => {
    if (!chainServicioId || !chainProfId) return null;
    const srv = servicios.find((s: any) => s.id === chainServicioId);
    if (!srv) return null;
    let lastFin: Date;
    if (cita.grupo_id && allCitas) {
      const siblings = (allCitas as any[]).filter(
        (c: any) => c.grupo_id === cita.grupo_id,
      );
      const maxSib = siblings.reduce(
        (best: any, c: any) =>
          !best || (c.orden_en_grupo ?? 0) > (best.orden_en_grupo ?? 0)
            ? c
            : best,
        null,
      );
      lastFin = maxSib ? new Date(maxSib.fin) : new Date(cita.fin);
    } else {
      lastFin = new Date(cita.fin);
    }
    const durTotal =
      (srv.duracion_activa_min ?? 30) +
      (srv.duracion_espera_min ?? 0) +
      (srv.duracion_activa_extra_min ?? 0);
    const chainFin = new Date(lastFin.getTime() + durTotal * 60000);
    return {
      inicio: lastFin,
      fin: chainFin,
      durTotal,
      precio: srv.precio ?? 0,
    };
  })();

  const estadoMeta: any = {
    pendiente: {
      label: "Pendiente",
      color: "#e08a00",
      soft: "rgba(224,138,0,0.16)",
    },
    [CITA_STATUS.CONFIRMADA]: {
      label: "Confirmada",
      color: TOKENS.success,
      soft: `rgba(16,185,129,0.12)`,
    },
    [CITA_STATUS.COMPLETADA]: {
      label: "Completada",
      color: "#22c55e",
      soft: "rgba(34,197,94,0.12)",
    },
    [CITA_STATUS.CANCELADA]: {
      label: "Cancelada",
      color: TOKENS.danger,
      soft: "rgba(239,68,68,0.12)",
    },
    [CITA_STATUS.NO_PRESENTADA]: {
      label: "No presentada",
      color: "#ef4444",
      soft: "rgba(239,68,68,0.15)",
    },
  };
  // La cita puede traer un estado que este mapa no conoce (lo escribe la capa de IA
  // o una version anterior). Sin fallback, meta.color/meta.label reventaba la vista
  // (pantalla en blanco) al abrir el detalle. Mostramos el estado en crudo, neutro.
  const meta = estadoMeta[estado] || {
    label: estado || "Sin estado",
    color: TOKENS.textSec,
    soft: "rgba(148,163,184,0.12)",
  };

  const serviciosFiltrados = servicios.filter((s: any) =>
    norm(s.nombre).includes(norm(qSrv)),
  );
  const clientesFiltrados = clientes.filter((c: any) =>
    norm(c.nombre).includes(norm(qCli)),
  );

  // --- Demo guiada: explicar la cita bloque a bloque. La guia abre este detalle
  // (cita-detalle) y enfoca con spotlight: servicio, cliente, estado, secuencia
  // (tiempo activo -> reposo -> 2o activo = tiempos muertos) y formula.
  const [demoZone, setDemoZone] = useState<string | null>(null);
  const dCliRef = useRef<HTMLElement | null>(null);
  const dSrvRef = useRef<HTMLElement | null>(null);
  const dEstRef = useRef<HTMLElement | null>(null);
  const dSeqRef = useRef<HTMLElement | null>(null);
  const dSeqActRef = useRef<HTMLDivElement | null>(null);
  const dSeqRepRef = useRef<HTMLDivElement | null>(null);
  const dSeqAct2Ref = useRef<HTMLDivElement | null>(null);
  const dFormRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onDemo = (e: Event) => {
      const a = (e as CustomEvent).detail?.action;
      if (typeof a !== "string" || a.indexOf("detalle-") !== 0) return;
      const zone = a.slice("detalle-".length);
      // Rail maestro-detalle: activar la seccion que contiene la zona antes de
      // hacer scroll a su ref, para que ya este montada y visible.
      const seccionPorZona: Record<string, SeccionCita> = {
        cliente: "cliente",
        servicio: "servicio",
        estado: "resumen",
        secuencia: "servicio",
        "secuencia-activo": "servicio",
        "secuencia-reposo": "servicio",
        "secuencia-activo2": "servicio",
        formula: "color",
      };
      if (seccionPorZona[zone]) setSeccionActiva(seccionPorZona[zone]);
      if (zone === "formula") setShowFormula(true);
      setDemoZone(zone);
    };
    window.addEventListener("mecha-demo", onDemo);
    return () => window.removeEventListener("mecha-demo", onDemo);
  }, []);
  useEffect(() => {
    if (!demoZone) return;
    const m: Record<string, { current: HTMLElement | null }> = {
      cliente: dCliRef,
      servicio: dSrvRef,
      estado: dEstRef,
      secuencia: dSeqRef,
      "secuencia-activo": dSeqActRef,
      "secuencia-reposo": dSeqRepRef,
      "secuencia-activo2": dSeqAct2Ref,
      formula: dFormRef,
    };
    const el = m[demoZone]?.current;
    if (el && typeof el.scrollIntoView === "function")
      el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [demoZone]);
  const demoRefMap: Record<string, { current: HTMLElement | null }> = {
    cliente: dCliRef,
    servicio: dSrvRef,
    estado: dEstRef,
    secuencia: dSeqRef,
    "secuencia-activo": dSeqActRef,
    "secuencia-reposo": dSeqRepRef,
    "secuencia-activo2": dSeqAct2Ref,
    formula: dFormRef,
  };
  const demoActiveRef = (demoZone && demoRefMap[demoZone]) || dSeqRef;
  const demoLabel =
    demoZone === "cliente"
      ? "Cliente"
      : demoZone === "servicio"
        ? "Servicio"
        : demoZone === "estado"
          ? "Estado de la cita"
          : demoZone === "secuencia"
            ? "Secuencia · tiempos muertos"
            : demoZone === "secuencia-activo"
              ? "1 · Tiempo activo (aplicación)"
              : demoZone === "secuencia-reposo"
                ? "2 · Tiempo de reposo (hueco libre)"
                : demoZone === "secuencia-activo2"
                  ? "3 · Segundo tiempo activo (acabado)"
                  : demoZone === "formula"
                    ? "Fórmula guardada"
                    : "";

  const isMobileOrTablet = isMobile || isTablet;

  return (
    <div
      className="m-overlay-enter"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: isMobileOrTablet ? "flex-end" : "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <DemoSpotlight
        targetRef={demoActiveRef}
        active={!!demoZone}
        label={demoLabel}
        padding={12}
        radius={14}
      />
      <div
        className="m-modal-enter"
        style={{
          background: TOKENS.bgPanel,
          borderRadius: isMobileOrTablet ? "24px 24px 0 0" : 16,
          maxWidth: 1040,
          width: isMobileOrTablet ? "100%" : "95%",
          height: isMobileOrTablet ? undefined : "86vh",
          maxHeight: isMobileOrTablet ? "90dvh" : "86vh",
          overflow: "hidden",
          border: isMobileOrTablet ? "none" : `1px solid ${TOKENS.border}`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          animation: isMobileOrTablet
            ? "slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            : "scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {/* Header. En movil queda fijo (sticky) para que el boton de cerrar
            siga a la vista aunque el tour baje hasta la secuencia o la formula. */}
          <div
            style={{
              marginTop: 3,
              padding: isMobileOrTablet ? "18px 18px 16px" : "28px 32px 24px",
              borderBottom: `1px solid ${TOKENS.border}`,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              position: isMobileOrTablet ? "sticky" : "relative",
              top: 0,
              zIndex: 4,
              background: TOKENS.bgPanel,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                minWidth: 0,
                flex: 1,
              }}
            >
              <Avatar name={selectedCliente?.nombre} size={52} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: TOKENS.textTer,
                    letterSpacing: 1.5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  Detalle de cita
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: -0.3,
                    color: TOKENS.text,
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {selectedCliente?.nombre}
                  {/* Grado de fidelidad de la clienta: nivel + color junto al nombre. */}
                  {nivelFidel && (
                    <span
                      title={`Fidelidad: ${nivelFidel.nombre}${nivelFidel.visitas ? ` · ${nivelFidel.visitas} visitas` : ""}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: `${nivelFidel.color}18`,
                        border: `1px solid ${nivelFidel.color}55`,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: nivelFidel.color,
                        letterSpacing: 0.2,
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill={nivelFidel.color}
                        stroke="none"
                        aria-hidden="true"
                      >
                        <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z" />
                      </svg>
                      {nivelFidel.nombre}
                    </span>
                  )}
                  {/* Riesgo de no-show de la clienta (Sesion 7): discreto, solo equipo. */}
                  <RiesgoNoShowIndicator riesgo={riesgoCliente} compact />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: TOKENS.textSec,
                    marginTop: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {selectedServicioCategoria?.icono ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          color: selectedServicioColor || TOKENS.primary,
                          marginRight: 2,
                        }}
                        title={selectedServicioCategoria.nombre}
                      >
                        {getCategoryIcon(
                          selectedServicioCategoria.icono,
                          selectedServicioColor || TOKENS.primary,
                          14,
                        )}
                      </span>
                    ) : (
                      selectedServicioColor && (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 99,
                            background: selectedServicioColor,
                            flexShrink: 0,
                          }}
                        />
                      )
                    )}
                    {selectedServicio?.nombre}
                  </span>
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 99,
                      background: TOKENS.textTer,
                    }}
                  />
                  <span>{selectedProf?.nombre}</span>
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 99,
                      background: TOKENS.textTer,
                    }}
                  />
                  <span>
                    {citaDate} · {citaHora} - {citaFinHora}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Pill
                color={
                  estado === CITA_STATUS.CONFIRMADA
                    ? TOKENS.primary
                    : meta.color
                }
                soft={
                  estado === CITA_STATUS.CONFIRMADA
                    ? TOKENS.primarySoft
                    : meta.soft
                }
              >
                {meta.label}
              </Pill>
              <button
                className="m-btn-icon m-btn-icon-close"
                onClick={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  color: TOKENS.textSec,
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                <IconClose />
              </button>
            </div>
          </div>

          {/* Citas ENCAJADAS en el reposo de esta cita: al abrir el host se ve que hay
            otra(s) cita(s) aprovechando su tiempo muerto (feedback Jose). */}
          {(() => {
            if (!cita.fin_activa || !cita.fin_espera) return null;
            const ini = new Date(cita.fin_activa).getTime();
            const finR = new Date(cita.fin_espera).getTime();
            if (finR <= ini) return null;
            const dentro = (citasHoy || []).filter(
              (c: any) =>
                c.id !== cita.id &&
                c.profesional_id === cita.profesional_id &&
                c.estado !== CITA_STATUS.CANCELADA &&
                new Date(c.inicio).getTime() >= ini &&
                new Date(c.fin).getTime() <= finR,
            );
            if (dentro.length === 0) return null;
            const hh = (d: Date) =>
              `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            return (
              <div
                style={{
                  margin: isMobileOrTablet ? "14px 18px 0" : "18px 32px 0",
                  padding: "12px 14px",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(224,147,11,0.35)",
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 9,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#c77f0a"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2" />
                  </svg>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#93560a",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    En el reposo de esta cita ({dentro.length})
                  </span>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {dentro.map((c: any) => {
                    const cli = (clientes || []).find(
                      (x: any) => x.id === c.cliente_id,
                    );
                    const srv = (servicios || []).find(
                      (x: any) => x.id === c.servicio_id,
                    );
                    return (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: TOKENS.bgCard,
                          border: `1px solid ${TOKENS.border}`,
                          borderRadius: 8,
                          padding: "7px 10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: TOKENS.textSec,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {hh(new Date(c.inicio))}–{hh(new Date(c.fin))}
                        </span>
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: TOKENS.text,
                          }}
                        >
                          {cli?.nombre || "Cliente"}
                        </span>
                        {srv?.nombre && (
                          <span
                            style={{ fontSize: 11.5, color: TOKENS.textTer }}
                          >
                            · {srv.nombre}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div
                  style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 7 }}
                >
                  Aprovechan el tiempo de reposo: el profesional queda libre
                  mientras el tinte/proceso actua.
                </div>
              </div>
            );
          })()}

          {/* Cuerpo maestro-detalle: rail de secciones + panel (estilo Booksy) */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: isMobileOrTablet ? "column" : "row" }}>
            {isMobileOrTablet ? (
              <div style={{ display: "flex", gap: 4, padding: "10px 12px", overflowX: "auto", borderBottom: `1px solid ${TOKENS.border}`, background: TOKENS.bgPanel, flexShrink: 0 }}>
                {RAIL_ITEMS.map((it) => (
                  <SeccionRailItem key={it.id} id={it.id} label={it.label} active={seccionActiva === it.id} onClick={() => setSeccionActiva(it.id)} vertical={false} />
                ))}
              </div>
            ) : (
              <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${TOKENS.border}`, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
                {RAIL_ITEMS.map((it) => (
                  <SeccionRailItem key={it.id} id={it.id} label={it.label} active={seccionActiva === it.id} onClick={() => setSeccionActiva(it.id)} vertical />
                ))}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, padding: isMobileOrTablet ? "18px 18px 24px" : "24px 32px 28px" }}>
              {seccionActiva === "servicio" && (<>
              {/* 5.5: Servicios encadenados info */}
          {cita.grupo_id &&
            allCitas &&
            (() => {
              const siblings = (allCitas as any[])
                .filter((c: any) => c.grupo_id === cita.grupo_id)
                .sort(
                  (a: any, b: any) =>
                    (a.orden_en_grupo ?? 0) - (b.orden_en_grupo ?? 0),
                );
              if (siblings.length <= 1) return null;
              return (
                <div
                  style={{
                    padding: "12px 32px",
                    borderBottom: `1px solid ${TOKENS.border}`,
                    background: "rgba(192,38,10,0.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#e0340e",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      marginBottom: 8,
                    }}
                  >
                    Servicio encadenado ({siblings.length} servicios)
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {siblings.map((sib: any, idx: number) => {
                      const sibSrv = servicios.find(
                        (s: any) => s.id === sib.servicio_id,
                      );
                      const sibProf = profesionales.find(
                        (p: any) => p.id === sib.profesional_id,
                      );
                      const isCurrent = sib.id === cita.id;
                      const sibInicio = new Date(sib.inicio);
                      const sibFin = new Date(sib.fin);
                      return (
                        <div
                          key={sib.id}
                          style={{
                            padding: "6px 10px",
                            background: isCurrent
                              ? "rgba(192,38,10,0.15)"
                              : TOKENS.bgCard,
                            border: `1px solid ${isCurrent ? "#e0340e" : TOKENS.border}`,
                            borderRadius: 8,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: isCurrent ? "#e0340e" : TOKENS.text,
                            }}
                          >
                            {idx + 1}. {sibSrv?.nombre || "Servicio"}
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              color: TOKENS.textTer,
                              marginTop: 2,
                            }}
                          >
                            {sibProf?.nombre?.split(" ")[0]} ·{" "}
                            {sibInicio.toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            -
                            {sibFin.toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

          </>)}
              {seccionActiva === "servicio" && (<>
              {/* Chain overlap detection */}
          {chainOverlapInfo &&
            (chainOverlapInfo.before || chainOverlapInfo.after) && (
              <div
                style={{
                  padding: "12px 32px",
                  borderBottom: `1px solid ${TOKENS.border}`,
                  background: "rgba(239,68,68,0.04)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#ef4444",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 8,
                  }}
                >
                  Conflicto en cadena
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {chainOverlapInfo.before &&
                    chainOverlapInfo.beforeCita &&
                    (() => {
                      const prevSrv = servicios.find(
                        (s: any) =>
                          s.id === chainOverlapInfo.beforeCita.servicio_id,
                      );
                      const prevProf = profesionales.find(
                        (p: any) =>
                          p.id === chainOverlapInfo.beforeCita.profesional_id,
                      );
                      const prevFin = new Date(chainOverlapInfo.beforeCita.fin);
                      const currentInicio = new Date(cita.inicio);
                      const overlap =
                        prevFin > currentInicio
                          ? Math.round(
                              (prevFin.getTime() - currentInicio.getTime()) /
                                60000,
                            )
                          : 0;
                      return (
                        <div
                          style={{
                            padding: "8px 10px",
                            background: TOKENS.bgCard,
                            border: `1px solid #ef4444`,
                            borderRadius: 6,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#ef4444",
                            }}
                          >
                            Anterior finaliza tarde
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: TOKENS.text,
                              marginTop: 4,
                            }}
                          >
                            {prevSrv?.nombre} ({prevProf?.nombre?.split(" ")[0]}
                            ) finaliza a{" "}
                            {prevFin.toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            - Solapamiento: {overlap} min
                          </div>
                        </div>
                      );
                    })()}
                  {chainOverlapInfo.after &&
                    chainOverlapInfo.afterCita &&
                    (() => {
                      const nextSrv = servicios.find(
                        (s: any) =>
                          s.id === chainOverlapInfo.afterCita.servicio_id,
                      );
                      const nextProf = profesionales.find(
                        (p: any) =>
                          p.id === chainOverlapInfo.afterCita.profesional_id,
                      );
                      const nextInicio = new Date(
                        chainOverlapInfo.afterCita.inicio,
                      );
                      const currentFin = new Date(cita.fin);
                      const overlap =
                        currentFin > nextInicio
                          ? Math.round(
                              (currentFin.getTime() - nextInicio.getTime()) /
                                60000,
                            )
                          : 0;
                      return (
                        <div
                          style={{
                            padding: "8px 10px",
                            background: TOKENS.bgCard,
                            border: `1px solid #ef4444`,
                            borderRadius: 6,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#ef4444",
                            }}
                          >
                            Siguiente comienza temprano
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: TOKENS.text,
                              marginTop: 4,
                            }}
                          >
                            {nextSrv?.nombre} ({nextProf?.nombre?.split(" ")[0]}
                            ) comienza a{" "}
                            {nextInicio.toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            - Solapamiento: {overlap} min
                          </div>
                        </div>
                      );
                    })()}
                </div>
              </div>
            )}

          </>)}
              {seccionActiva === "servicio" && (<>
              {/* Encadenar servicio */}
          {estado === CITA_STATUS.CONFIRMADA && (
            <div
              style={{
                padding: showChainForm ? "10px 32px" : "0 32px",
                borderBottom: `1px solid ${TOKENS.border}`,
                ...(showChainForm
                  ? {}
                  : { display: "flex", alignItems: "center", minHeight: 36 }),
              }}
            >
              {!showChainForm ? (
                <button
                  onClick={() => {
                    setShowChainForm(true);
                    setChainServicioId(null);
                    setChainProfId(null);
                    setChainErr("");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    alignSelf: "flex-start",
                    background: "rgba(244,80,30,0.08)",
                    border: "1px solid rgba(244,80,30,0.35)",
                    borderRadius: 10,
                    padding: "10px 16px",
                    color: "#e0340e",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "background 0.15s ease, transform 0.15s ease",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(244,80,30,0.14)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(244,80,30,0.08)";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Encadenar servicio
                </button>
              ) : (
                <div
                  style={{
                    borderLeft: "3px solid #e0340e",
                    paddingLeft: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#e0340e",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      Encadenar servicio
                    </div>
                    <button
                      onClick={() => setShowChainForm(false)}
                      style={{
                        background: "none",
                        border: "none",
                        color: TOKENS.textTer,
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      x
                    </button>
                  </div>

                  {/* Servicio */}
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: TOKENS.textTer,
                        letterSpacing: 0.6,
                        marginBottom: 6,
                      }}
                    >
                      Servicio
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {servicios.map((s: any) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setChainServicioId(s.id);
                            setChainErr("");
                          }}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            border:
                              chainServicioId === s.id
                                ? "1px solid #e0340e"
                                : `1px solid ${TOKENS.border}`,
                            background:
                              chainServicioId === s.id
                                ? "rgba(192,38,10,0.15)"
                                : TOKENS.bgCard,
                            color:
                              chainServicioId === s.id
                                ? "#e0340e"
                                : TOKENS.text,
                            transition: "all 0.15s",
                          }}
                        >
                          {s.nombre}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Profesional */}
                  {chainServicioId && (
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: TOKENS.textTer,
                          letterSpacing: 0.6,
                          marginBottom: 6,
                        }}
                      >
                        Profesional
                      </div>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 5 }}
                      >
                        {profesionales.map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setChainProfId(p.id);
                              setChainErr("");
                            }}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              border:
                                chainProfId === p.id
                                  ? `1px solid ${p.color || "#e0340e"}`
                                  : `1px solid ${TOKENS.border}`,
                              background:
                                chainProfId === p.id
                                  ? `${p.color || "#e0340e"}22`
                                  : TOKENS.bgCard,
                              color:
                                chainProfId === p.id
                                  ? p.color || "#e0340e"
                                  : TOKENS.text,
                              transition: "all 0.15s",
                            }}
                          >
                            {p.nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview de horario */}
                  {chainTimingPreview && chainProfId && (
                    <div
                      style={{
                        padding: "8px 10px",
                        background: "rgba(192,38,10,0.06)",
                        borderRadius: 6,
                        border: `1px solid rgba(192,38,10,0.15)`,
                      }}
                    >
                      <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                        {chainTimingPreview.inicio.toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        -{" "}
                        {chainTimingPreview.fin.toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ({chainTimingPreview.durTotal} min) ·{" "}
                        {chainTimingPreview.precio}
                      </div>
                    </div>
                  )}

                  {chainErr && (
                    <div
                      style={{
                        fontSize: 11,
                        color: TOKENS.danger,
                        padding: "6px 10px",
                        background: `${TOKENS.danger}15`,
                        borderRadius: 6,
                        border: `1px solid ${TOKENS.danger}44`,
                      }}
                    >
                      {chainErr}
                    </div>
                  )}

                  {/* Botones */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={() => setShowChainForm(false)}
                      style={{
                        padding: "6px 14px",
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        color: TOKENS.textSec,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleEncadenar}
                      disabled={
                        !chainServicioId || !chainProfId || chainGuardando
                      }
                      style={{
                        padding: "6px 14px",
                        background:
                          !chainServicioId || !chainProfId || chainGuardando
                            ? "rgba(192,38,10,0.3)"
                            : "linear-gradient(180deg,#9b8afb 0%,#c0260a 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor:
                          !chainServicioId || !chainProfId || chainGuardando
                            ? "not-allowed"
                            : "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {chainGuardando ? "..." : "Encadenar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}


              </>)}
              {seccionActiva === "cliente" && (<>
              {/* Cliente */}
              <div
                ref={(el) => {
                  dCliRef.current = el;
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <Label>Cliente</Label>
                  {selectedCliente?.id && (
                    <button
                      type="button"
                      className="m-btn-secondary"
                      onClick={() => {
                        onClose();
                        router.push({
                          pathname: "/(tabs)/clientes",
                          params: { clienteId: selectedCliente.id },
                        } as any);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "4px 9px",
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        color: TOKENS.textSec,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                      }}
                    >
                      Ver ficha →
                    </button>
                  )}
                </div>
                <SearchDropdown
                  open={openCli}
                  setOpen={setOpenCli}
                  q={qCli}
                  setQ={setQCli}
                  placeholder="Buscar cliente…"
                  trigger={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      <Avatar name={selectedCliente?.nombre} size={28} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: TOKENS.text,
                          }}
                        >
                          {selectedCliente?.nombre}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: TOKENS.textTer,
                            fontStyle: !selectedCliente?.telefono
                              ? "italic"
                              : "normal",
                          }}
                        >
                          {selectedCliente?.telefono || "Sin teléfono"}
                        </div>
                      </div>
                    </div>
                  }
                >
                  {clientesFiltrados.map((c: any) => (
                    <DropdownItem
                      key={c.id}
                      onClick={() => {
                        setSelectedCliente(c);
                        setOpenCli(false);
                        setQCli("");
                      }}
                      active={c.id === selectedCliente?.id}
                    >
                      <Avatar name={c.nombre} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: TOKENS.text,
                          }}
                        >
                          {c.nombre}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: TOKENS.textTer,
                            fontStyle: !c.telefono ? "italic" : "normal",
                          }}
                        >
                          {c.telefono || "Sin teléfono"}
                        </div>
                      </div>
                    </DropdownItem>
                  ))}
                </SearchDropdown>

                {/* Dictar Fórmula Color / Notas Post-Servicio */}
                {selectedCliente?.id && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowFichaColor(true)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: "rgba(244,80,30,0.06)",
                        border: `2px dashed rgba(244,80,30,0.3)`,
                        borderRadius: 12,
                        color: TOKENS.primary,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        transition: "all 0.2s",
                      }}
                    >
                      <Icon name="mic" size={20} color={TOKENS.primary} />
                      Dictar Fórmula de Color
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (estadoVoz === "inactivo")
                          iniciarEscucha(procesarDictadoNotas);
                        else detenerEscucha();
                      }}
                      disabled={loadingDictado}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background:
                          estadoVoz === "inactivo"
                            ? TOKENS.bgCardHi
                            : "rgba(16,185,129,0.1)",
                        border: `1px solid ${estadoVoz === "inactivo" ? TOKENS.border : TOKENS.success}`,
                        borderRadius: 12,
                        color:
                          estadoVoz === "inactivo"
                            ? TOKENS.textSec
                            : TOKENS.success,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: loadingDictado ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <Icon
                        name="mic"
                        size={18}
                        color={
                          estadoVoz === "inactivo"
                            ? TOKENS.textSec
                            : TOKENS.success
                        }
                      />
                      {estadoVoz === "inactivo"
                        ? "Dictar Notas Post-Servicio"
                        : estadoVoz === "escuchando"
                          ? "Escuchando..."
                          : "Procesando dictado..."}
                    </button>
                    {errorVoz && (
                      <div
                        style={{
                          fontSize: 12,
                          color: TOKENS.danger,
                          textAlign: "center",
                        }}
                      >
                        {errorVoz}
                      </div>
                    )}
                  </div>
                )}
              </div>

              </>)}
              {seccionActiva === "cliente" && (<>
              {/* Historial del cliente (citas anteriores) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: TOKENS.textTer }}>Historial del cliente</div>
                {clienteHistorial.length === 0 ? (
                  <div style={{ fontSize: 13, color: TOKENS.textTer }}>Sin citas anteriores registradas.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {clienteHistorial.map((c: any) => {
                      const srv = servicios.find((s: any) => s.id === c.servicio_id);
                      const pr = profesionales.find((p: any) => p.id === c.profesional_id);
                      const d = new Date(c.inicio);
                      return (
                        <div
                          key={c.id}
                          style={{ display: "flex", alignItems: "center", gap: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: "8px 12px", transition: "border-color 0.15s ease, transform 0.15s ease" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; e.currentTarget.style.transform = "translateY(-1px)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = "none"; }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.textSec, minWidth: 64 }}>{d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" })}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, color: TOKENS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{srv?.nombre || "Servicio"}</div>
                            {pr?.nombre && <div style={{ fontSize: 11, color: TOKENS.textTer }}>{pr.nombre}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Confirmacion del cliente */}
              <div>
                <Label>Confirmacion de asistencia (cliente)</Label>
                <button
                  type="button"
                  onClick={toggleConfirma}
                  disabled={togglingConfirma}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: confirmadaCliente
                      ? "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(16,185,129,0.04))"
                      : "linear-gradient(180deg, rgba(239,68,68,0.10), rgba(239,68,68,0.04))",
                    border: `1.5px solid ${confirmadaCliente ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`,
                    color: confirmadaCliente ? TOKENS.success : "#ef4444",
                    cursor: togglingConfirma ? "wait" : "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    transition:
                      "transform 0.15s cubic-bezier(0.16,1,0.3,1), box-shadow 0.15s ease, border-color 0.15s ease",
                    boxShadow: confirmadaCliente
                      ? "0 4px 14px rgba(16,185,129,0.18)"
                      : "0 4px 14px rgba(239,68,68,0.18)",
                  }}
                  onMouseEnter={(e) => {
                    if (!togglingConfirma) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = confirmadaCliente
                        ? "0 8px 22px rgba(16,185,129,0.30)"
                        : "0 8px 22px rgba(239,68,68,0.30)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = confirmadaCliente
                      ? "0 4px 14px rgba(16,185,129,0.18)"
                      : "0 4px 14px rgba(239,68,68,0.18)";
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: confirmadaCliente
                        ? "rgba(16,185,129,0.20)"
                        : "rgba(239,68,68,0.20)",
                      flexShrink: 0,
                    }}
                  >
                    {confirmadaCliente ? (
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
                    ) : (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}
                    >
                      {confirmadaCliente
                        ? "El cliente confirmo que asistira"
                        : "El cliente aun no ha confirmado asistencia"}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: confirmadaCliente
                          ? "rgba(16,185,129,0.80)"
                          : "rgba(239,68,68,0.80)",
                        fontWeight: 500,
                      }}
                    >
                      {togglingConfirma
                        ? "Guardando..."
                        : confirmadaCliente
                          ? "Toca para desmarcar (independiente del estado de la cita)"
                          : "Toca para marcar que el cliente confirmo su asistencia"}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      background: confirmadaCliente
                        ? "rgba(16,185,129,0.20)"
                        : "rgba(239,68,68,0.20)",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    {confirmadaCliente ? "Desmarcar" : "Confirmar"}
                  </div>
                </button>
              </div>

              </>)}
              {seccionActiva === "cliente" && (<>
              {/* Seguimiento de resena (las resenas del portal son anonimas; marcado manual) */}
              {selectedCliente?.id && (
                <div>
                  <Label>¿Ha dejado reseña?</Label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {[
                      { tag: TAG_RESENO_SALON, label: "Salón" },
                      { tag: TAG_RESENO_MECHA, label: "Mecha" },
                    ].map(({ tag, label }) => {
                      const has = clienteTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleResenaTag(tag)}
                          disabled={savingResena}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            padding: "11px 12px",
                            borderRadius: 12,
                            background: has
                              ? "rgba(16,185,129,0.10)"
                              : TOKENS.bgCard,
                            border: `1.5px solid ${has ? "rgba(16,185,129,0.45)" : TOKENS.border}`,
                            color: has ? TOKENS.success : TOKENS.textSec,
                            cursor: savingResena ? "wait" : "pointer",
                            fontFamily: "inherit",
                            fontSize: 13,
                            fontWeight: 700,
                            transition:
                              "border-color 0.15s ease, background 0.15s ease",
                          }}
                        >
                          {has && (
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              </>)}
              {seccionActiva === "servicio" && (<>
              {/* Servicio */}
              <div
                ref={(el) => {
                  dSrvRef.current = el;
                }}
              >
                <Label>Servicio</Label>
                <SearchDropdown
                  open={openSrv}
                  setOpen={setOpenSrv}
                  q={qSrv}
                  setQ={setQSrv}
                  placeholder="Buscar servicio…"
                  trigger={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: selectedServicioColor
                            ? `${selectedServicioColor}22`
                            : TOKENS.primarySoft,
                          color: selectedServicioColor || TOKENS.primaryHi,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <IconClock />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: TOKENS.text,
                          }}
                        >
                          {selectedServicio?.nombre}
                        </div>
                        <div style={{ fontSize: 11, color: TOKENS.textTer }}>
                          {(selectedServicio?.duracion_activa_min ||
                            selectedServicio?.duracion ||
                            0) +
                            (selectedServicio?.duracion_espera_min || 0) +
                            (selectedServicio?.duracion_activa_extra_min ||
                              0) || 0}{" "}
                          min · {selectedServicio?.precio || 0} €
                        </div>
                      </div>
                    </div>
                  }
                >
                  {serviciosFiltrados.map((s: any) => (
                    <DropdownItem
                      key={s.id}
                      onClick={() => {
                        setSelectedServicio(s);
                        setOpenSrv(false);
                        setQSrv("");
                        setActivo(s.duracion_activa_min || s.duracion || 30);
                        setEspera(s.duracion_espera_min || 0);
                        setActivo2(s.duracion_activa_extra_min || 0);
                      }}
                      active={s.id === selectedServicio?.id}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: TOKENS.text,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {(() => {
                            const cat = (categorias || []).find(
                              (cc: any) => cc.id === s.categoria_id,
                            );
                            return cat ? (
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 99,
                                  background: categoryColorHex(cat.color),
                                  flexShrink: 0,
                                }}
                              />
                            ) : null;
                          })()}
                          {s.nombre}
                        </div>
                        <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                          {(s.duracion_activa_min || s.duracion || 0) +
                            (s.duracion_espera_min || 0) +
                            (s.duracion_activa_extra_min || 0) || 0}{" "}
                          min
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: TOKENS.success,
                        }}
                      >
                        {s.precio || 0} €
                      </span>
                    </DropdownItem>
                  ))}
                </SearchDropdown>

                {/* Add-ons toggleables */}
                {availableAddons.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                      marginTop: 6,
                    }}
                  >
                    {availableAddons.map((addon: any) => {
                      const active = citaAddons.some(
                        (ca: any) => ca.addon_id === addon.id,
                      );
                      const loading = togglingAddon === addon.id;
                      return (
                        <button
                          key={addon.id}
                          onClick={() => toggleAddon(addon)}
                          disabled={loading}
                          onMouseEnter={(e) => {
                            if (!active) {
                              e.currentTarget.style.borderColor =
                                "rgba(16,185,129,0.5)";
                              e.currentTarget.style.background =
                                "rgba(16,185,129,0.06)";
                            }
                            e.currentTarget.style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            if (!active) {
                              e.currentTarget.style.borderColor = TOKENS.border;
                              e.currentTarget.style.background = "transparent";
                            }
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 4,
                            cursor: loading ? "wait" : "pointer",
                            background: active
                              ? "rgba(16,185,129,0.1)"
                              : "transparent",
                            color: active ? TOKENS.success : TOKENS.textSec,
                            border: `1px solid ${active ? "rgba(16,185,129,0.25)" : TOKENS.border}`,
                            opacity: loading ? 0.5 : 1,
                            transition: "all 0.15s ease",
                            transform: "scale(1)",
                          }}
                        >
                          {active ? "+" : ""} {addon.nombre} (
                          {addon.duracion_min}min · {addon.precio}EUR)
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              </>)}
              {seccionActiva === "servicio" && (<>
              {/* Profesional */}
              <div>
                <Label>Profesional</Label>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    minWidth: 0,
                  }}
                >
                  {profesionales.map((p: any) => {
                    const sel = p.id === selectedProf?.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProf(p)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "7px 11px",
                          borderRadius: 999,
                          background: sel
                            ? `${p.color}22`
                            : "rgba(148,163,184,0.06)",
                          border: `1px solid ${sel ? `${p.color}66` : TOKENS.border}`,
                          color: sel ? p.color : TOKENS.textSec,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!sel) {
                            e.currentTarget.style.borderColor = p.color;
                            e.currentTarget.style.background = `${p.color}10`;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!sel) {
                            e.currentTarget.style.borderColor = TOKENS.border;
                            e.currentTarget.style.background =
                              "rgba(148,163,184,0.06)";
                          }
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: p.color,
                          }}
                        />
                        {p.nombre.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              </>)}
              {seccionActiva === "color" && (<>
              {/* Aviso de alergias del cliente */}
              {(() => {
                const alergiasTexto = (selectedCliente?.alergias ?? "").trim();
                if (!alergiasTexto) return null;
                return (
                  <div
                    className="m-pulse-red"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: 12,
                      background: "rgba(239,68,68,0.10)",
                      border: "1px solid rgba(239,68,68,0.40)",
                      borderRadius: 10,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        color: "#ef4444",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#ef4444",
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          marginBottom: 2,
                        }}
                      >
                        Alergias registradas
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#ef4444",
                          lineHeight: 1.4,
                          whiteSpace: "pre-wrap" as any,
                        }}
                      >
                        {alergiasTexto}
                      </div>
                    </div>
                  </div>
                );
              })()}

              </>)}
              {seccionActiva === "color" && (<>
              {/* Alergias de la cita */}
              <div>
                <Label>Alergias</Label>
                <textarea
                  value={notasCita}
                  onChange={(e) => setNotasCita(e.target.value)}
                  placeholder="Alergias o reacciones a tener en cuenta para esta cita…"
                  rows={4}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    background: TOKENS.bgCard,
                    border: `1px solid ${TOKENS.border}`,
                    borderRadius: 10,
                    color: TOKENS.text,
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              </>)}
              {seccionActiva === "resumen" && (<>
              {/* Estado */}
              <div
                ref={(el) => {
                  dEstRef.current = el;
                }}
              >
                <Label>Estado</Label>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setOpenEst(!openEst)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      cursor: "pointer",
                      color: TOKENS.text,
                      fontSize: 13,
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: meta.color,
                        }}
                      />
                      {meta.label}
                    </span>
                    <span
                      style={{
                        transform: openEst ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s",
                        display: "flex",
                        alignItems: "center",
                        color: TOKENS.textTer,
                      }}
                    >
                      <IconChevronDown />
                    </span>
                  </button>
                  {openEst && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        zIndex: 30,
                        background: TOKENS.bgPanel,
                        border: `1px solid ${TOKENS.borderHi}`,
                        borderRadius: 10,
                        boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
                        padding: 4,
                      }}
                    >
                      {Object.entries(estadoMeta).map(([k, m]: any) => (
                        <button
                          key={k}
                          onClick={async () => {
                            setEstado(k);
                            setOpenEst(false);
                            await supabase
                              .from("citas")
                              .update({ estado: k })
                              .eq("id", cita.id);
                            triggerRefresh();
                          }}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            borderRadius: 7,
                            background:
                              estado === k ? TOKENS.primarySoft : "transparent",
                            border: "none",
                            color: TOKENS.text,
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "background 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (estado !== k) {
                              e.currentTarget.style.background =
                                "rgba(244,80,30,0.06)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (estado !== k) {
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: m.color,
                            }}
                          />
                          <span style={{ flex: 1 }}>{m.label}</span>
                          {estado === k && <IconCheck />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              </>)}
              {seccionActiva === "resumen" && (<>
              {/* Resumen */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.25)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: 1.5,
                      color: TOKENS.textTer,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Resumen
                  </span>
                  <span
                    style={{ fontSize: 22, fontWeight: 700, color: "#10b981" }}
                  >
                    {selectedServicio?.precio || 0} €
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 6,
                  }}
                >
                  <SummaryCell
                    label="Activo 1"
                    value={`${activo}m`}
                    color={TOKENS.primary}
                  />
                  <SummaryCell
                    label="Espera"
                    value={`${espera}m`}
                    color="#f59e0b"
                  />
                  <SummaryCell
                    label="Activo 2"
                    value={`${activo2}m`}
                    color={TOKENS.primary}
                  />
                  <SummaryCell
                    label="Total"
                    value={`${totalMin}m`}
                    color="#10b981"
                  />
                </div>
              </div>

              </>)}
              {seccionActiva === "resumen" && (<>
              {/* Intervalo y duracion GRANDES: lo primero que se ve, se actualiza en vivo. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${TOKENS.primarySoft}, rgba(148,163,184,0.05))`,
                  border: `1px solid ${TOKENS.primary}30`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: TOKENS.textTer,
                      fontWeight: 700,
                    }}
                  >
                    Horario
                  </div>
                  <div
                    style={{
                      fontSize: 27,
                      fontWeight: 800,
                      color: TOKENS.text,
                      letterSpacing: -0.5,
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.1,
                      marginTop: 2,
                    }}
                  >
                    {fmtHora(inicioLive)}{" "}
                    <span style={{ color: TOKENS.textTer, fontWeight: 700 }}>
                      –
                    </span>{" "}
                    {fmtHora(finLive)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: TOKENS.textSec,
                      marginTop: 3,
                      textTransform: "capitalize",
                    }}
                  >
                    {fechaEditada.toLocaleDateString(LOCALE, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </div>
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    textAlign: "center",
                    padding: "9px 15px",
                    borderRadius: 12,
                    background: TOKENS.bgPanel,
                    border: `1px solid ${TOKENS.border}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: TOKENS.primary,
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {durTexto}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      color: TOKENS.textTer,
                      fontWeight: 700,
                      marginTop: 3,
                    }}
                  >
                    Duración
                  </div>
                </div>
              </div>
              </>)}
              {seccionActiva === "servicio" && (<>
              {/* Fecha */}
              <div>
                <Label>Fecha</Label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: TOKENS.bgCard,
                    border: `1px solid ${TOKENS.border}`,
                  }}
                >
                  <TimeBtn onClick={() => adjustFecha(-1)} />
                  <div
                    onClick={() =>
                      dateInputRef.current?.showPicker?.() ??
                      dateInputRef.current?.click()
                    }
                    style={{
                      flex: 1,
                      textAlign: "center",
                      fontSize: 13,
                      fontWeight: 600,
                      color: TOKENS.text,
                      cursor: "pointer",
                      userSelect: "none",
                      textTransform: "capitalize",
                    }}
                  >
                    {fechaEditada.toLocaleDateString(LOCALE, {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                  <TimeBtn onClick={() => adjustFecha(1)} plus />
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={`${fechaEditada.getFullYear()}-${String(fechaEditada.getMonth() + 1).padStart(2, "0")}-${String(fechaEditada.getDate()).padStart(2, "0")}`}
                    onChange={(e) =>
                      e.target.value &&
                      setFechaEditada(new Date(e.target.value + "T12:00:00"))
                    }
                    style={{
                      position: "absolute",
                      opacity: 0,
                      pointerEvents: "none",
                      width: 0,
                      height: 0,
                    }}
                  />
                </div>
              </div>

              </>)}
              {seccionActiva === "servicio" && (<>
              {/* Hora */}
              <div>
                <Label>Hora</Label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: TOKENS.bgCard,
                    border: `1px solid ${TOKENS.border}`,
                  }}
                >
                  <TimeBtn onClick={() => adjustHora(-1, 0)} />
                  <TimeNumBox value={horaEditada.split(":")[0]} label="h" />
                  <TimeBtn onClick={() => adjustHora(1, 0)} plus />
                  <span
                    style={{
                      color: TOKENS.textTer,
                      fontSize: 17,
                      fontWeight: 700,
                      margin: "0 2px",
                    }}
                  >
                    :
                  </span>
                  <TimeBtn onClick={() => adjustHora(0, -5)} />
                  <TimeNumBox value={horaEditada.split(":")[1]} label="min" />
                  <TimeBtn onClick={() => adjustHora(0, 5)} plus />
                </div>
              </div>

              </>)}
              {seccionActiva === "servicio" && (<>
              {/* Secuencia */}
              <div
                ref={(el) => {
                  dSeqRef.current = el;
                }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(148,163,184,0.04)",
                  border: `1px solid ${TOKENS.border}`,
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
                  <Label>Secuencia de la cita</Label>
                  <span
                    style={{
                      fontSize: 10,
                      color: TOKENS.textSec,
                      fontWeight: 400,
                    }}
                  >
                    activo → espera → activo
                  </span>
                </div>

                <SequenceBar
                  activo={activo}
                  espera={espera}
                  activo2={activo2}
                  primary={TOKENS.primary}
                  warning="#f59e0b"
                  inicioTxt={fmtHora(inicioLive)}
                  finTxt={fmtHora(finLive)}
                />

                <div ref={dSeqActRef}>
                  <TimeSlider
                    label="1 · Tiempo activo"
                    hint="Aplicación del servicio"
                    value={activo}
                    setValue={setActivo}
                    min={5}
                    max={240}
                    step={1}
                    color={TOKENS.primary}
                    chips={[15, 30, 45, 60, 90, 120]}
                    rango={`${fmtHora(inicioLive)} – ${fmtHora(finActiva1Live)}`}
                  />
                </div>

                <div style={{ height: 12 }} />

                <div ref={dSeqRepRef}>
                  <TimeSlider
                    label="2 · Tiempo de reposo"
                    hint="Tiempo de reposo (ej. tinte procesando). Pon 0 si no hay."
                    value={espera}
                    setValue={setEspera}
                    min={0}
                    max={120}
                    step={1}
                    color="#f59e0b"
                    chips={[0, 15, 30, 45, 60]}
                    rango={
                      espera > 0
                        ? `${fmtHora(finActiva1Live)} – ${fmtHora(finEsperaLive)}`
                        : undefined
                    }
                  />
                </div>

                <div style={{ height: 12 }} />

                <div ref={dSeqAct2Ref}>
                  <TimeSlider
                    label="3 · Segundo tiempo activo"
                    hint="Trabajo posterior al reposo (lavado, peinado…). 0 si no aplica."
                    value={activo2}
                    setValue={setActivo2}
                    min={0}
                    max={120}
                    step={1}
                    color={TOKENS.primary}
                    chips={[0, 15, 30, 45, 60]}
                    rango={
                      activo2 > 0
                        ? `${fmtHora(finEsperaLive)} – ${fmtHora(finLive)}`
                        : undefined
                    }
                  />
                </div>
              </div>

              </>)}
              {seccionActiva === "color" && (<>
              {/* Fórmula de color / química */}
              <div
                ref={(el) => {
                  dFormRef.current = el;
                }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: showFormula
                    ? "rgba(192,38,10,0.06)"
                    : "rgba(148,163,184,0.04)",
                  border: `1px solid ${showFormula ? "rgba(192,38,10,0.30)" : TOKENS.border}`,
                  transition: "all 0.2s ease",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowFormula((v) => !v)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: TOKENS.text,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: "rgba(192,38,10,0.14)",
                      color: "#c0260a",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                    </svg>
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: TOKENS.text,
                        letterSpacing: 0.3,
                      }}
                    >
                      Fórmula de color / química
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: TOKENS.textSec,
                        marginTop: 2,
                      }}
                    >
                      {hasFormula
                        ? "Fórmula registrada"
                        : "Opcional · producto, tono, tiempo, resultado"}
                    </div>
                  </div>
                  <span
                    style={{
                      transform: showFormula ? "rotate(180deg)" : "none",
                      transition: "transform 0.15s",
                      color: TOKENS.textTer,
                      display: "flex",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>

                {showFormula && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      marginTop: 12,
                    }}
                  >
                    <FormulaInput
                      label="Producto"
                      value={formulaProducto}
                      onChange={setFormulaProducto}
                      placeholder="Ej. Wella Koleston 7/0"
                    />
                    <FormulaInput
                      label="Tono / mezcla"
                      value={formulaTono}
                      onChange={setFormulaTono}
                      placeholder="Ej. Rubio medio + 9% oxidante 30 vol"
                    />
                    <FormulaInput
                      label="Tiempo de aplicación (min)"
                      value={formulaTiempo}
                      onChange={setFormulaTiempo}
                      placeholder="35"
                      inputMode="numeric"
                    />
                    <FormulaInput
                      label="Resultado"
                      value={formulaResultado}
                      onChange={setFormulaResultado}
                      placeholder="Cómo quedó (cobertura, tono final…)"
                      multiline
                    />
                    <FormulaInput
                      label="Notas adicionales"
                      value={formulaNotas}
                      onChange={setFormulaNotas}
                      placeholder="Observaciones específicas"
                      multiline
                    />
                  </div>
                )}
              </div>
            </>)}
            {seccionActiva === "historial" && (<>
            {historial.length === 0 && (
              <div style={{ fontSize: 13, color: TOKENS.textTer, padding: "8px 2px" }}>Sin cambios registrados todavia.</div>
            )}
            {/* Historial de cambios */}
        {historial.length > 0 && (
          <div style={{ padding: "0 32px 12px" }}>
            <div
              style={{
                background: showHistorial
                  ? "rgba(59,130,246,0.06)"
                  : "rgba(148,163,184,0.04)",
                border: `1px solid ${showHistorial ? "rgba(59,130,246,0.30)" : TOKENS.border}`,
                borderRadius: 10,
                overflow: "hidden",
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => setShowHistorial((v) => !v)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(59,130,246,0.7)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: TOKENS.textSec,
                    }}
                  >
                    Historial de cambios
                  </span>
                  <span style={{ fontSize: 11, color: TOKENS.textTer }}>
                    ({historial.length})
                  </span>
                </div>
                <span
                  style={{
                    transform: showHistorial ? "rotate(180deg)" : "none",
                    transition: "transform 0.15s",
                    color: TOKENS.textTer,
                    display: "flex",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
              {showHistorial && (
                <div
                  style={{
                    padding: "0 14px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {historial.map((h: any, i: number) => {
                    const fecha = new Date(h.created_at);
                    const hh = String(fecha.getHours()).padStart(2, "0");
                    const mm = String(fecha.getMinutes()).padStart(2, "0");
                    const dd = String(fecha.getDate()).padStart(2, "0");
                    const mo = String(fecha.getMonth() + 1).padStart(2, "0");
                    const campoLabel: Record<string, string> = {
                      inicio: "Hora inicio",
                      fin: "Hora fin",
                      profesional_id: "Profesional",
                      estado: "Estado",
                      cierre_salon: "Cierre salon",
                    };
                    const label = campoLabel[h.campo] || h.campo;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          padding: "6px 8px",
                          background: "rgba(148,163,184,0.05)",
                          borderRadius: 6,
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            color: TOKENS.textTer,
                            whiteSpace: "nowrap",
                            minWidth: 70,
                          }}
                        >
                          {dd}/{mo} {hh}:{mm}
                        </span>
                        <span
                          style={{
                            color: TOKENS.textSec,
                            fontWeight: 600,
                            minWidth: 80,
                          }}
                        >
                          {label}
                        </span>
                        <span style={{ color: TOKENS.textTer, flex: 1 }}>
                          {h.valor_anterior && <span>{h.valor_anterior}</span>}
                          {h.valor_anterior && h.valor_nuevo && (
                            <span
                              style={{ margin: "0 4px", color: TOKENS.textTer }}
                            >
                              {"->"}
                            </span>
                          )}
                          {h.valor_nuevo && (
                            <span style={{ color: TOKENS.text }}>
                              {h.valor_nuevo}
                            </span>
                          )}
                          {h.motivo && (
                            <span
                              style={{
                                marginLeft: 6,
                                color: "rgba(59,130,246,0.7)",
                                fontStyle: "italic",
                              }}
                            >
                              ({h.motivo})
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
            </>)}
            {seccionActiva === "productos" && (<>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: TOKENS.textTer }}>Inventario del salón</div>
                <div style={{ fontSize: 12, color: TOKENS.textSec, lineHeight: 1.5 }}>
                  Haz clic en un producto para añadirlo a esta cita. Su precio se
                  suma al total del cobro (lo verás en la pestaña <span style={{ fontWeight: 700, color: TOKENS.text }}>Pagos</span>).
                </div>
                {productosCita.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 12, background: "rgba(244,80,30,0.06)", border: `1px solid ${TOKENS.primary}40` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: TOKENS.primaryHi }}>Usados en esta cita</div>
                    {productosCita.map((p) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "7px 10px" }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: TOKENS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.textSec }}>x{p.cantidad}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: TOKENS.text, minWidth: 58, textAlign: "right" }}>{(p.precio * p.cantidad).toFixed(2)} €</span>
                        <button
                          type="button"
                          onClick={() => quitarProductoCita(p.id)}
                          title="Quitar uno"
                          style={{ background: "none", border: "none", color: TOKENS.danger, cursor: "pointer", fontSize: 15, fontWeight: 700, padding: "0 4px", lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: TOKENS.textSec }}>Suma productos</span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: TOKENS.primaryHi }}>{totalProductosCita.toFixed(2)} €</span>
                    </div>
                  </div>
                )}
                {inventarioProductos.length === 0 ? (
                  <div style={{ fontSize: 13, color: TOKENS.textTer, padding: "8px 2px" }}>No hay productos en el inventario todavía.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {inventarioProductos.map((p: any) => {
                      const enCita = productosCita.find((x) => x.id === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProductoCita(p)}
                          title="Añadir a la cita"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            textAlign: "left",
                            background: TOKENS.bgCard,
                            border: `1px solid ${enCita ? TOKENS.primary : TOKENS.border}`,
                            borderRadius: 10,
                            padding: "10px 12px",
                            cursor: "pointer",
                            transition: "border-color 0.15s ease, transform 0.15s ease, background 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = TOKENS.primary;
                            e.currentTarget.style.transform = "translateY(-1px)";
                            e.currentTarget.style.background = "rgba(244,80,30,0.05)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = enCita ? TOKENS.primary : TOKENS.border;
                            e.currentTarget.style.transform = "none";
                            e.currentTarget.style.background = TOKENS.bgCard;
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre}</div>
                            {(() => {
                              const stock = p.inventario?.[0]?.unidades ?? 0;
                              const bajo = stock <= (p.stock_minimo ?? 0);
                              return (
                                <div style={{ fontSize: 11, color: bajo ? TOKENS.danger : TOKENS.textTer, marginTop: 2, fontWeight: bajo ? 700 : 400 }}>
                                  Stock: {stock}{bajo ? " · bajo" : ""}
                                </div>
                              );
                            })()}
                          </div>
                          {enCita && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: TOKENS.primaryHi, background: "rgba(244,80,30,0.12)", borderRadius: 999, padding: "2px 8px" }}>x{enCita.cantidad}</span>
                          )}
                          <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text, flexShrink: 0 }}>{(Number(p.precio_cents ?? 0) / 100).toFixed(2)} €</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              </>)}
            {seccionActiva === "pagos" && (<>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: TOKENS.textTer }}>Cobros y pagos</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {holdPagoId && (
              <>
                <button
                  onClick={() => gestionarFianza("capturar")}
                  disabled={guardando}
                  onMouseEnter={(e) => {
                    if (!guardando) {
                      e.currentTarget.style.filter = "brightness(1.05)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = "none";
                    e.currentTarget.style.transform = "none";
                  }}
                  title="Cobrar la fianza retenida (penalizacion por no presentarse)."
                  style={{
                    padding: "9px 14px",
                    background: "rgba(226,59,52,0.10)",
                    color: "#b91c1c",
                    border: "1px solid rgba(226,59,52,0.5)",
                    borderRadius: 8,
                    cursor: guardando ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    transition: "filter 0.16s ease, transform 0.16s ease",
                  }}
                >
                  Capturar fianza
                </button>
                <button
                  onClick={() => gestionarFianza("liberar")}
                  disabled={guardando}
                  onMouseEnter={(e) => {
                    if (!guardando) {
                      e.currentTarget.style.filter = "brightness(1.05)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = "none";
                    e.currentTarget.style.transform = "none";
                  }}
                  title="Liberar la retencion (el cliente asistio, no se cobra)."
                  style={{
                    padding: "9px 14px",
                    background: TOKENS.bgCard,
                    color: TOKENS.text,
                    border: `1px solid ${TOKENS.border}`,
                    borderRadius: 8,
                    cursor: guardando ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    transition: "filter 0.16s ease, transform 0.16s ease",
                  }}
                >
                  Liberar fianza
                </button>
              </>
            )}
            {cobrada && (
              <button
                onClick={anularCobro}
                disabled={guardando}
                onMouseEnter={(e) => {
                  if (!guardando) {
                    e.currentTarget.style.filter = "brightness(1.05)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "none";
                  e.currentTarget.style.transform = "none";
                }}
                title="Anular este cobro (efectivo/datafono). La cita vuelve a estar sin cobrar."
                style={{
                  padding: "9px 14px",
                  background: TOKENS.bgCard,
                  color: "#b91c1c",
                  border: "1px solid rgba(226,59,52,0.5)",
                  borderRadius: 8,
                  cursor: guardando ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  transition: "filter 0.16s ease, transform 0.16s ease",
                }}
              >
                Anular cobro
              </button>
            )}
            {puedeMarcarNoShow && (
              <button
                onClick={marcarNoShow}
                disabled={guardando}
                title="Registrar que la clienta no acudio a su cita. Se usa para el riesgo de no-show (tono neutro, solo el equipo lo ve)."
                style={{
                  padding: "9px 14px",
                  background: "rgba(245,158,11,0.10)",
                  color: "#b45309",
                  border: "1px solid rgba(245,158,11,0.55)",
                  borderRadius: 8,
                  cursor: guardando ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                No se presentó
              </button>
            )}
            {!cobrada && cita.estado !== CITA_STATUS.CANCELADA && (
              <div style={{ width: "100%" }}>
                {(() => {
                  const baseCents = Math.round(
                    Number(selectedServicio?.precio ?? servicio?.precio ?? 0) *
                      100,
                  );
                  const pendienteCents = Math.max(
                    0,
                    baseCents - cobroSenalCents,
                  );
                  return (
                    <CobroSheet
                      mode="cita"
                      inline
                      citaIds={[cita.id]}
                      lineasIniciales={productosCita.map((p) => ({
                        nombre: p.nombre,
                        precio: String(p.precio),
                        cantidad: String(p.cantidad),
                        ref_id: p.id,
                      }))}
                      pendienteCents={pendienteCents}
                      senalCents={cobroSenalCents}
                      subtitulo={`${selectedCliente?.nombre || "Cliente"} · ${selectedServicio?.nombre || servicio?.nombre || "Servicio"}`}
                      subtituloColor={selectedServicioColor ?? undefined}
                      onClose={() => {}}
                      onSuccess={(cobroIds) => {
                        setCobrada(true);
                        onSaved?.({
                          id: cita.id,
                          cobrada: true,
                          cobro_id: cobroIds[0],
                        });
                        triggerRefresh?.();
                      }}
                    />
                  );
                })()}
              </div>
            )}
            {cobrada && (
              <span
                style={{
                  padding: "7px 12px",
                  background: "rgba(22,163,74,0.12)",
                  color: "#16a34a",
                  border: "1px solid rgba(22,163,74,0.4)",
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <IconCheck /> Cobrada
              </span>
            )}

                </div>
              </div>
            </>)}
            </div>
          </div>
        </div>

        {/* Footer — barra inferior fija (sticky) para que las acciones (descartar,
            guardar, cobrar) sigan a la vista en movil aunque el contenido sea largo. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: isMobileOrTablet ? "sticky" : "relative",
            bottom: 0,
            zIndex: 4,
            background: TOKENS.bgPanel,
            padding: isMobileOrTablet
              ? "12px 18px calc(18px + env(safe-area-inset-bottom, 0px))"
              : "20px 32px",
            borderTop: `1px solid ${TOKENS.border}`,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {cita.estado === CITA_STATUS.CONFIRMADA && (
              <button
                className="m-btn-danger"
                onClick={() => setShowCancelModal(true)}
                disabled={guardando}
                style={{
                  padding: "9px 14px",
                  background: "rgba(239,68,68,0.08)",
                  color: TOKENS.danger,
                  border: `1px solid ${TOKENS.danger}88`,
                  borderRadius: 8,
                  cursor: guardando ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <IconTrash /> Cancelar cita
              </button>
            )}
            {retrasosActivo &&
              cita.estado === CITA_STATUS.CONFIRMADA &&
              new Date(cita.inicio) > new Date() && (
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setRetrasoPickerOpen((v) => !v)}
                    disabled={guardando}
                    style={{
                      padding: "9px 14px",
                      background: "rgba(245,158,11,0.10)",
                      color: "#b45309",
                      border: "1px solid rgba(245,158,11,0.55)",
                      borderRadius: 8,
                      cursor: guardando ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    Marcar retraso
                  </button>
                  {retrasoPickerOpen && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "112%",
                        left: 0,
                        zIndex: 10,
                        display: "flex",
                        gap: 6,
                        background: TOKENS.bgCard,
                        border: `1px solid ${TOKENS.border}`,
                        borderRadius: 10,
                        padding: 6,
                        boxShadow: "0 10px 26px rgba(40,30,24,0.16)",
                      }}
                    >
                      {[10, 15, 30].map((m) => (
                        <button
                          key={m}
                          onClick={() => abrirRetraso(m)}
                          style={{
                            padding: "7px 10px",
                            background: "rgba(245,158,11,0.12)",
                            color: "#b45309",
                            border: "1px solid rgba(245,158,11,0.4)",
                            borderRadius: 7,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          +{m} min
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
          </div>
          {errMsg ? (
            <div
              style={{
                fontSize: 11,
                color: TOKENS.danger,
                padding: "6px 10px",
                background: `${TOKENS.danger}15`,
                borderRadius: 6,
                border: `1px solid ${TOKENS.danger}44`,
              }}
            >
              {errMsg}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            {onDuplicate && (
            <button
              className="m-btn-secondary"
              onClick={onDuplicate}
              disabled={guardando}
              style={{
                padding: "9px 18px",
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text,
                borderRadius: 8,
                cursor: guardando ? "not-allowed" : "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Duplicar cita
            </button>
            )}
            <button
              className="m-btn-secondary"
              onClick={onClose}
              disabled={guardando}
              style={{
                padding: "9px 18px",
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text,
                borderRadius: 8,
                cursor: guardando ? "not-allowed" : "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Descartar
            </button>
            <button
              className="m-btn-primary"
              onClick={handleGuardar}
              disabled={
                !selectedCliente ||
                !selectedServicio ||
                !selectedProf ||
                guardando
              }
              style={{
                padding: "9px 18px",
                background:
                  !selectedCliente ||
                  !selectedServicio ||
                  !selectedProf ||
                  guardando
                    ? "rgba(244,80,30,0.5)"
                    : `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor:
                  !selectedCliente ||
                  !selectedServicio ||
                  !selectedProf ||
                  guardando
                    ? "not-allowed"
                    : "pointer",
                fontSize: 12,
                fontWeight: 600,
                boxShadow:
                  !selectedCliente ||
                  !selectedServicio ||
                  !selectedProf ||
                  guardando
                    ? "none"
                    : `0 4px 12px rgba(244,80,30,0.4)`,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {guardando ? (
                "..."
              ) : (
                <>
                  <IconCheck /> Guardar cambios
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de cobro (POS-0/1): motor compartido con Caja, ver components/pos/CobroSheet */}
      {showCobro &&
        (() => {
          const baseCents = Math.round(
            Number(selectedServicio?.precio ?? servicio?.precio ?? 0) * 100,
          );
          const pendienteCents = Math.max(0, baseCents - cobroSenalCents);
          return (
            <CobroSheet
              mode="cita"
              citaIds={[cita.id]}
              pendienteCents={pendienteCents}
              senalCents={cobroSenalCents}
              subtitulo={`${selectedCliente?.nombre || "Cliente"} · ${selectedServicio?.nombre || servicio?.nombre || "Servicio"}`}
              subtituloColor={selectedServicioColor ?? undefined}
              onClose={() => setShowCobro(false)}
              onSuccess={(cobroIds) => {
                setCobrada(true);
                setShowCobro(false);
                onSaved?.({
                  id: cita.id,
                  cobrada: true,
                  cobro_id: cobroIds[0],
                });
                triggerRefresh?.();
              }}
            />
          );
        })()}

      {/* Estrategias de retraso (Sesion 4): Chispa ofrece 2-3 formas de resolverlo */}
      {estrategiasRetraso && (
        <RetrasoEstrategiasModal
          estrategias={estrategiasRetraso}
          minutos={retrasoMin}
          profesionalNombre={prof?.nombre}
          avisarDisponible={avisarRetrasoActivo}
          enviando={aplicandoRetraso}
          onConfirmar={aplicarRetraso}
          onCancelar={() => setEstrategiasRetraso(null)}
        />
      )}
      {showCancelModal && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 16,
              padding: 28,
              width: 360,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>
              Cancelar cita
            </div>
            <div style={{ fontSize: 13, color: TOKENS.textSec }}>
              La cita desaparecera del calendario pero se conservara en el
              historial.
            </div>

            {cita.serie_id && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "10px 12px",
                  background: "rgba(244,80,30,0.06)",
                  border: `1px solid ${cancelarSerie ? "rgba(244,80,30,0.45)" : TOKENS.border}`,
                  borderRadius: 10,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: TOKENS.text,
                }}
              >
                <input
                  type="checkbox"
                  checked={cancelarSerie}
                  onChange={(e) => setCancelarSerie(e.target.checked)}
                  style={{ accentColor: "#f4501e", width: 15, height: 15 }}
                />
                Cancelar tambien las siguientes de la serie
              </label>
            )}

            {/* Quien cancela */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: TOKENS.textTer,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Quien cancela
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["clienta", "negocio"] as const).map((op) => (
                  <button
                    key={op}
                    onClick={() => setCanceladoPor(op)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      background:
                        canceladoPor === op
                          ? "rgba(244,80,30,0.12)"
                          : "transparent",
                      border: `1px solid ${canceladoPor === op ? "rgba(244,80,30,0.5)" : TOKENS.border}`,
                      color: canceladoPor === op ? "#ff7a2e" : TOKENS.textSec,
                      transition: "all 0.15s",
                    }}
                  >
                    {op === "clienta" ? "Cliente" : "Negocio"}
                  </button>
                ))}
              </div>
            </div>

            {/* Motivo */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: TOKENS.textTer,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Motivo (opcional)
              </div>
              <textarea
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value)}
                placeholder="Ej: el cliente no puede venir..."
                rows={3}
                style={{
                  width: "100%",
                  background: TOKENS.bg,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: TOKENS.text,
                  resize: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={guardando}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 8,
                  color: TOKENS.textSec,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Volver
              </button>
              <button
                onClick={handleEliminar}
                disabled={guardando}
                style={{
                  padding: "8px 16px",
                  background: TOKENS.danger,
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: guardando ? "not-allowed" : "pointer",
                }}
              >
                {guardando ? "..." : "Cancelar cita"}
              </button>
            </div>
          </div>
        </div>
      )}

      {candidatosHueco && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 16,
              padding: 24,
              width: 460,
              maxWidth: "100%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div>
              <div
                style={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}
              >
                Hueco libre · lista de espera
              </div>
              <div
                style={{ fontSize: 13, color: TOKENS.textSec, marginTop: 4 }}
              >
                {candidatosHueco.length}{" "}
                {candidatosHueco.length === 1
                  ? "persona compatible"
                  : "personas compatibles"}{" "}
                con {servicio?.nombre || "este hueco"}
                {prof ? ` · ${prof.nombre}` : ""}, el{" "}
                {new Date(cita.inicio).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "long",
                })}{" "}
                a las{" "}
                {new Date(cita.inicio).toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                .
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                overflowY: "auto",
              }}
            >
              {candidatosHueco.map((cand) => {
                const tel = (cand.telefono || "").replace(/\D/g, "");
                const franja =
                  cand.franja === "manana"
                    ? "Mañanas"
                    : cand.franja === "tarde"
                      ? "Tardes"
                      : "Cualquier hora";
                return (
                  <div
                    key={cand.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 14px",
                      background: TOKENS.bg,
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: TOKENS.text,
                        }}
                      >
                        {cand.nombre || "Sin nombre"}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: TOKENS.textSec,
                          marginTop: 2,
                        }}
                      >
                        {franja}
                        {cand.telefono
                          ? ` · ${cand.telefono}`
                          : " · sin teléfono"}
                      </div>
                      {cand.nota && (
                        <div
                          style={{
                            fontSize: 12,
                            color: TOKENS.textTer,
                            marginTop: 2,
                            fontStyle: "italic",
                          }}
                        >
                          {cand.nota}
                        </div>
                      )}
                    </div>
                    {tel && (
                      <a
                        href={`https://wa.me/${tel}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flexShrink: 0,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1px solid ${TOKENS.border}`,
                          color: "#16a34a",
                          textDecoration: "none",
                          fontSize: 12,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        WhatsApp
                      </a>
                    )}
                    <button
                      onClick={() => asignarCandidato(cand.id)}
                      disabled={asignandoCand !== null}
                      style={{
                        flexShrink: 0,
                        padding: "8px 12px",
                        background: TOKENS.primary,
                        border: "none",
                        borderRadius: 8,
                        color: "#fff",
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: asignandoCand ? "not-allowed" : "pointer",
                        opacity:
                          asignandoCand && asignandoCand !== cand.id ? 0.5 : 1,
                      }}
                    >
                      {asignandoCand === cand.id ? "..." : "Asignar"}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setCandidatosHueco(null);
                  onSaved?.() ?? onClose();
                }}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 8,
                  color: TOKENS.textSec,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sesion 8-B: Modal de propuesta de aviso de lista de espera (Chispa) */}
      {candidataChispa && citaOrigenParaChispa && (
        <ListaEsperaPropuestaModal
          candidata={candidataChispa}
          citaOrigen={citaOrigenParaChispa}
          servicioNombre={
            servicios.find((s: any) => s.id === cita.servicio_id)?.nombre
          }
          profesionalNombre={
            profesionales.find((p: any) => p.id === cita.profesional_id)?.nombre
          }
          enviando={avisandoChispa}
          onConfirmar={confirmarAvisoChispa}
          onCancelar={() => {
            setCandidataChispa(null);
            setCitaOrigenParaChispa(null);
            onSaved?.() ?? onClose();
          }}
        />
      )}

      {showFichaColor && selectedCliente?.id && (
        <FichaColorModal
          mode="add"
          ficha={{ cita_id: cita.id, profesional_id: cita.profesional_id }}
          clienteId={selectedCliente.id}
          negocioId={cita.negocio_id || ""}
          citasCliente={
            allCitas
              ? allCitas.filter((c: any) => c.cliente_id === selectedCliente.id)
              : []
          }
          servicios={servicios}
          profesionales={profesionales}
          onClose={() => setShowFichaColor(false)}
          onSaved={async () => {
            setShowFichaColor(false);
            triggerRefresh?.();
          }}
          onGoToNotas={() => {
            setShowFichaColor(false);
            alert(
              "Por favor, anota las alergias en el campo de Notas de la cita o en la pestaña de Notas del cliente.",
            );
          }}
        />
      )}
    </div>
  );
}

function FormulaInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: any;
}) {
  const Tag: any = multiline ? "textarea" : "input";
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.8,
          color: TOKENS.textSec,
          fontWeight: 600,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <Tag
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 2 : undefined}
        inputMode={inputMode}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 8,
          color: TOKENS.text,
          fontSize: 12,
          fontFamily: "inherit",
          outline: "none",
          resize: multiline ? "vertical" : "none",
          minHeight: multiline ? 50 : "auto",
        }}
      />
    </div>
  );
}

function Label({ children }: any) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: 1.2,
        color: TOKENS.textTer,
        textTransform: "uppercase",
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function SearchDropdown({
  open,
  setOpen,
  q,
  setQ,
  placeholder,
  trigger,
  children,
}: any) {
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderRadius: 10,
          background: TOKENS.bgCard,
          border: `1px solid ${open ? "rgba(244,80,30,0.40)" : TOKENS.border}`,
          cursor: "pointer",
          textAlign: "left",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{trigger}</div>
        <span
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <IconChevronDown />
        </span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 30,
            background: TOKENS.bgPanel,
            border: `1px solid ${TOKENS.borderHi}`,
            borderRadius: 12,
            boxShadow: "0 16px 50px rgba(0,0,0,0.55)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderBottom: `1px solid ${TOKENS.border}`,
              background: TOKENS.bgCard,
            }}
          >
            <span
              style={{
                color: TOKENS.textTer,
                display: "flex",
                alignItems: "center",
              }}
            >
              <IconSearch />
            </span>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              placeholder={placeholder}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: TOKENS.text,
                fontSize: 12,
                fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", padding: 4 }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownItem({ onClick, active, children }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: active ? TOKENS.primarySoft : "transparent",
        border: `1px solid ${active ? "rgba(244,80,30,0.30)" : "transparent"}`,
        cursor: "pointer",
        textAlign: "left",
        marginBottom: 2,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(244,80,30,0.06)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

function TimeSlider({
  label,
  hint,
  value,
  setValue,
  min,
  max,
  step,
  color,
  chips,
  rango,
}: any) {
  const pct = ((value - min) / (max - min)) * 100;
  const trackRef = useRef<HTMLDivElement>(null);
  // En movil el arrastre con el dedo se trababa: el navegador interpretaba el gesto
  // como scroll y cancelaba el puntero. Con touchAction 'none' + captura de puntero
  // + un flag de arrastre propio (e.buttons no es fiable en touch) el control sigue
  // al dedo de forma fluida.
  const dragging = useRef(false);

  const updateFromEvent = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const stepVal = step || 1;
    const rawVal = ratio * (max - min) + min;
    const newVal = Math.round((rawVal - min) / stepVal) * stepVal + min;
    setValue(Math.max(min, Math.min(max, newVal)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    try {
      trackRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    updateFromEvent(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    updateFromEvent(e.clientX);
  };

  const endDrag = (e: React.PointerEvent) => {
    dragging.current = false;
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Label>{label}</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setValue(Math.max(min, value - step))}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            −
          </button>
          <div
            style={{
              minWidth: 64,
              textAlign: "center",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: 3,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color }}>
              {value}
            </span>
            <span
              style={{ fontSize: 11, fontWeight: 500, color: TOKENS.textSec }}
            >
              min
            </span>
          </div>
          <button
            onClick={() => setValue(Math.min(max, value + step))}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            +
          </button>
        </div>
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: TOKENS.textSec,
            marginTop: -3,
            marginBottom: 8,
            fontWeight: 400,
          }}
        >
          {hint}
        </div>
      )}

      {/* Horas reales de este tramo (ej. "14:00 – 14:40"): claridad de lo que pasa en la vida real. */}
      {rango && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 8,
            padding: "2px 9px",
            borderRadius: 999,
            background: `${color}12`,
            border: `1px solid ${color}30`,
            fontSize: 11,
            fontWeight: 700,
            color,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15.5 14" />
          </svg>
          {rango}
        </div>
      )}

      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: 16,
          display: "flex",
          alignItems: "center",
          marginBottom: 8,
          userSelect: "none",
          cursor: "grab",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Track de fondo */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 99,
            background: "rgba(148,163,184,0.15)",
            pointerEvents: "none",
          }}
        />
        {/* Track relleno */}
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            height: 4,
            borderRadius: 99,
            background: color,
            pointerEvents: "none",
          }}
        />
        {/* Thumb siempre visible */}
        <div
          style={{
            position: "absolute",
            left: `calc(${pct}% - 8px)`,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 0 4px ${color}33, 0 2px 6px rgba(0,0,0,0.4)`,
            pointerEvents: "none",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 8,
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        {chips.map((m: number) => {
          const isActive = value === m;
          return (
            <button
              key={m}
              onClick={() => setValue(m)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: isActive ? `${color}22` : "rgba(148,163,184,0.06)",
                border: `1px solid ${isActive ? `${color}66` : TOKENS.border}`,
                color: isActive ? color : TOKENS.textSec,
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = color;
                  e.currentTarget.style.background = `${color}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = TOKENS.border;
                  e.currentTarget.style.background = "rgba(148,163,184,0.06)";
                }
              }}
            >
              {m === 0 ? "Sin espera" : `${m}m`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, color }: any) {
  return (
    <div
      style={{
        background: "rgba(148,163,184,0.06)",
        borderRadius: 8,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1,
          color: TOKENS.textTer,
          fontWeight: 600,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function SequenceBar({
  activo,
  espera,
  activo2,
  primary,
  warning,
  inicioTxt,
  finTxt,
}: any) {
  const total = Math.max(1, activo + espera + activo2);

  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 32,
          borderRadius: 8,
          overflow: "hidden",
          gap: 2,
        }}
      >
        {/* Activo 1 */}
        {activo > 0 && (
          <div
            style={{
              flex: activo / total,
              background: `linear-gradient(180deg, #ff7a2e, #f4501e)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "clip",
              whiteSpace: "nowrap",
            }}
          >
            {(activo / total) * 100 >= 12 ? `${activo}m` : ""}
          </div>
        )}

        {/* Espera */}
        {espera > 0 && (
          <div
            style={{
              flex: espera / total,
              background: `repeating-linear-gradient(45deg, #f59e0b 0 6px, transparent 6px 12px), rgba(245,158,11,0.18)`,
              borderTop: `1px solid rgba(245,158,11,0.4)`,
              borderBottom: `1px solid rgba(245,158,11,0.4)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "clip",
              whiteSpace: "nowrap",
            }}
          >
            {(espera / total) * 100 >= 12 ? `${espera}m` : ""}
          </div>
        )}

        {/* Activo 2 */}
        {activo2 > 0 && (
          <div
            style={{
              flex: activo2 / total,
              background: `linear-gradient(180deg, #ff7a2e, #f4501e)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "clip",
              whiteSpace: "nowrap",
            }}
          >
            {(activo2 / total) * 100 >= 12 ? `${activo2}m` : ""}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 9.5,
          color: TOKENS.textTer,
          fontWeight: 700,
          letterSpacing: 0.4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{inicioTxt || "0 min"}</span>
        <span>Total · {total} min</span>
        <span>{finTxt || ""}</span>
      </div>
    </div>
  );
}

function Avatar({ name, size }: any) {
  const getInitials = (n: string) => {
    return n
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const hash =
    name?.split("").reduce((h: any, c: any) => h + c.charCodeAt(0), 0) || 0;
  const colors = [
    "#f4501e",
    "#c0260a",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
  ];
  const color = colors[hash % colors.length];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: Math.max(10, size / 3),
        fontWeight: 700,
        color: color,
      }}
    >
      {getInitials(name || "?")}
    </div>
  );
}

function Pill({ children, color, soft }: any) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: soft,
        border: `1px solid ${color}55`,
        color: color,
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: 999, background: color }}
      />
      {children}
    </span>
  );
}

// =============================================
// 8.5: WeekView
// =============================================
function WeekView({
  citas,
  profesionales,
  servicios,
  clientes,
  servicioMap,
  clienteMap,
  selectedDateObj,
  filterServicio,
  filterEstado,
  selectedProf,
  onSelectDay,
  onEditCita,
  categorias = [],
  onMoveCita,
}: any) {
  // En movil la rejilla de 7 columnas (~45px cada una a 375px) era ilegible:
  // numeros recortados y citas truncadas a una letra. Pasamos a lista vertical.
  const { isMobile } = useResponsive();
  const weekStart = useMemo(() => {
    const d = new Date(selectedDateObj);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [selectedDateObj]);

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);

  const citasByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    days.forEach((d) => {
      map[d.toDateString()] = [];
    });
    citas.forEach((c: any) => {
      const cd = new Date(c.inicio).toDateString();
      if (!map[cd]) return;
      if (selectedProf !== "todos" && c.profesional_id !== selectedProf) return;
      if (filterServicio !== "todos" && c.servicio_id !== filterServicio)
        return;
      if (filterEstado !== "todos" && c.estado !== filterEstado) return;
      map[cd].push(c);
    });
    return map;
  }, [citas, days, selectedProf, filterServicio, filterEstado]);

  const todayStr = new Date().toDateString();
  const DAY_ABBR = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const totalSemana = Object.values(citasByDay).reduce(
    (n, arr: any) => n + arr.length,
    0,
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: -0.3,
            color: TOKENS.text,
          }}
        >
          {weekStart.toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
          })}{" "}
          –{" "}
          {weekEnd.toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
          })}
        </h2>
        <span
          style={{ fontSize: 12.5, fontWeight: 600, color: TOKENS.textSec }}
        >
          {totalSemana} cita{totalSemana !== 1 ? "s" : ""} esta semana
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(7, 1fr)",
          gap: 10,
          alignItems: "start",
        }}
      >
        {days.map((d, i) => {
          const key = d.toDateString();
          const dayCitas = (citasByDay[key] || [])
            .slice()
            .sort(
              (a: any, b: any) =>
                new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
            );
          const isToday = key === todayStr;
          const isWeekend = i >= 5;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: isMobile ? 6 : 8,
                minWidth: 0,
              }}
            >
              {/* Cabecera del dia: nombre legible + numero en circulo */}
              <button
                onClick={() => onSelectDay(d)}
                title={`Ver ${DAY_ABBR[i]} ${d.getDate()} en detalle`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  borderRadius: 11,
                  cursor: "pointer",
                  background: isToday ? "rgba(244,80,30,0.10)" : TOKENS.bgCard,
                  border: `1px solid ${isToday ? "rgba(244,80,30,0.40)" : TOKENS.border}`,
                  transition: "border-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = TOKENS.primary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isToday
                    ? "rgba(244,80,30,0.40)"
                    : TOKENS.border;
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    color: isToday
                      ? TOKENS.primaryHi
                      : isWeekend
                        ? TOKENS.textTer
                        : TOKENS.textSec,
                    textTransform: "uppercase",
                  }}
                >
                  {DAY_ABBR[i]}
                </span>
                <span
                  style={{
                    minWidth: 26,
                    height: 26,
                    padding: "0 6px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    background: isToday
                      ? "linear-gradient(180deg,#ff7a2e,#f4501e)"
                      : "transparent",
                    color: isToday ? "#fff" : TOKENS.text,
                    boxShadow: isToday
                      ? `0 3px 10px ${TOKENS.primaryGlow}`
                      : "none",
                  }}
                >
                  {d.getDate()}
                </span>
              </button>

              {/* Cuerpo: lista de citas con profesional diferenciado.
                  En movil sin altura minima, en desktop con altura fija y scroll interno. */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.background = "rgba(244,80,30,0.06)";
                }}
                onDragLeave={(e) => {
                  e.currentTarget.style.background = TOKENS.bgCard;
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.background = TOKENS.bgCard;
                  const citaId = e.dataTransfer.getData("text/plain");
                  if (citaId && onMoveCita) onMoveCita(citaId, key);
                }}
                style={{
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 12,
                  padding: 6,
                  minHeight: 460,
                  height: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  scrollbarWidth: "thin",
                  transition: "background 0.2s",
                }}
              >
                {dayCitas.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      color: TOKENS.textTer,
                      padding: "24px 0",
                      pointerEvents: "none",
                    }}
                  >
                    Sin citas
                  </div>
                ) : (
                  dayCitas.map((c: any) => {
                    const cli = clientes.find(
                      (cl: any) => cl.id === c.cliente_id,
                    );
                    const prof = profesionales.find(
                      (p: any) => p.id === c.profesional_id,
                    );
                    const srv = servicioMap?.get(c.servicio_id);
                    const srvName = srv?.nombre || "";
                    const cat = srv
                      ? (categorias || []).find(
                          (catObj: any) => catObj.id === srv.categoria_id,
                        )
                      : null;
                    const catColor = cat ? categoryColorHex(cat.color) : null;
                    const catIcon = cat?.icono
                      ? getCategoryIcon(
                          cat.icono,
                          catColor || TOKENS.textSec,
                          11,
                        )
                      : null;
                    const catName = cat?.nombre || "";

                    const hora = new Date(c.inicio).toLocaleTimeString(
                      "es-ES",
                      { hour: "2-digit", minute: "2-digit" },
                    );
                    const profColor = prof?.color || TOKENS.primary;
                    // Color que diferencia la CATEGORIA del servicio (feedback Jose):
                    // el borde/acento de la tarjeta usa el color de categoria, con
                    // fallback al color del profesional si el servicio no tiene categoria.
                    const acentoColor = catColor || profColor;
                    const done = c.estado === "completada";
                    const cancel = c.estado === "cancelada";
                    const noShow = c.estado === "no_presentada";
                    // Iniciales de la clienta para el avatar (max 2 letras).
                    const iniciales =
                      (cli?.nombre || "?")
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w: string) => w[0])
                        .join("")
                        .toUpperCase() || "?";
                    return (
                      <button
                        key={c.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", c.id);
                          e.dataTransfer.effectAllowed = "move";
                          // Opcional: drag image custom
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditCita(c);
                        }}
                        style={{
                          textAlign: "left",
                          width: "100%",
                          cursor: "grab",
                          padding: "6px 8px",
                          borderRadius: 8,
                          background: done
                            ? "rgba(15,157,107,0.05)"
                            : cancel
                              ? "rgba(226,59,52,0.04)"
                              : noShow
                                ? "rgba(224,138,0,0.05)"
                                : TOKENS.bgCardHi,
                          border: `1px solid ${TOKENS.border}`,
                          borderLeft: `3.5px solid ${cancel ? TOKENS.danger : acentoColor}`,
                          opacity: cancel ? 0.6 : 1,
                          transition: "all 0.12s ease",
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          overflow: "hidden",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = TOKENS.primary;
                          e.currentTarget.style.background =
                            "rgba(244,80,30,0.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = TOKENS.border;
                          e.currentTarget.style.background = done
                            ? "rgba(15,157,107,0.05)"
                            : cancel
                              ? "rgba(226,59,52,0.04)"
                              : noShow
                                ? "rgba(224,138,0,0.05)"
                                : TOKENS.bgCardHi;
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: TOKENS.textSec,
                                flexShrink: 0,
                              }}
                            >
                              {hora}
                            </span>
                            {/* Distintivo de categoria del servicio: color + icono (si lo hay). */}
                            <span
                              title={catName || undefined}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 999,
                                  background: acentoColor,
                                  flexShrink: 0,
                                }}
                              />
                              {catIcon && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    opacity: 0.85,
                                  }}
                                >
                                  {catIcon}
                                </span>
                              )}
                            </span>
                          </div>
                          {done && (
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                background: TOKENS.success,
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            width: "100%",
                            minWidth: 0,
                          }}
                        >
                          {/* Avatar de iniciales de la clienta (tintado con el color de categoria). */}
                          <div
                            style={{
                              display: "flex",
                              gap: 4,
                              alignItems: "center",
                            }}
                          >
                            {c.estado === "Confirmada" && (
                              <Icon name="check" size={10} color={TOKENS.success} />
                            )}
                            {cli?.tag === "VIP" && (
                              <Icon name="star" size={10} color={TOKENS.warning} />
                            )}
                            {cli?.tag === "Habitual" && (
                              <Icon name="star" size={10} color={TOKENS.primary} />
                            )}
                          </div>
                          <span
                            style={{
                              flex: 1,
                              fontSize: 11.5,
                              fontWeight: 650,
                              color: TOKENS.text,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              textDecoration: cancel ? "line-through" : "underline",
                              textDecorationColor: cancel ? "inherit" : "rgba(244,80,30,0.4)",
                              textUnderlineOffset: 2,
                              minWidth: 0,
                            }}
                          >
                            {dayCitas.length > 5 ? (iniciales || "?") : (cli?.nombre || "Sin cliente")}
                          </span>
                        </div>

                        {prof && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              gap: 4,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 9.5,
                                color: TOKENS.textTer,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                flexShrink: 1,
                              }}
                            >
                              <span
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: 999,
                                  background: profColor,
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {prof.nombre.split(" ")[0]}
                              </span>
                            </span>
                            {srvName && (
                              <span
                                style={{
                                  fontSize: 9,
                                  color: TOKENS.textTer,
                                  fontStyle: "italic",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: "60%",
                                  textAlign: "right",
                                  flexShrink: 1,
                                }}
                                title={srvName}
                              >
                                {srvName}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================
// 8.5: MonthView
// =============================================
function MonthView({
  citas,
  profesionales,
  servicios,
  clientes,
  servicioMap,
  clienteMap,
  currentMonth,
  filterServicio,
  filterEstado,
  selectedProf,
  onSelectDay,
  bloqueos,
}: any) {
  const { isMobile } = useResponsive();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  const filteredCitas = useMemo(() => {
    return citas.filter((c: any) => {
      if (selectedProf !== "todos" && c.profesional_id !== selectedProf)
        return false;
      if (filterServicio !== "todos" && c.servicio_id !== filterServicio)
        return false;
      if (filterEstado !== "todos" && c.estado !== filterEstado) return false;
      const d = new Date(c.inicio);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [citas, selectedProf, filterServicio, filterEstado, month, year]);

  const citasByDay = useMemo(() => {
    const map: Record<number, any[]> = {};
    filteredCitas.forEach((c: any) => {
      const day = new Date(c.inicio).getDate();
      if (!map[day]) map[day] = [];
      map[day].push(c);
    });
    return map;
  }, [filteredCitas]);

  const todayDate = new Date();
  const isCurrentMonth =
    todayDate.getMonth() === month && todayDate.getFullYear() === year;
  const DAY_NAMES = ["L", "M", "X", "J", "V", "S", "D"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const cellMinH = isMobile ? 54 : 92;
  const gap = isMobile ? 4 : 6;

  return (
    <div style={{ paddingTop: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap,
        }}
      >
        {DAY_NAMES.map((d, idx) => {
          const weekend = idx >= 5;
          return (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: isMobile ? 10 : 11.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                color: weekend ? TOKENS.textSec : TOKENS.text,
                padding: "6px 0 8px",
                borderBottom: `2px solid ${weekend ? "rgba(148,163,184,0.4)" : TOKENS.borderHi}`,
              }}
            >
              {d}
            </div>
          );
        })}
        {cells.map((d, i) => {
          const weekendCol = i % 7 >= 5;
          if (!d)
            return (
              <div
                key={i}
                style={{
                  minHeight: cellMinH,
                  borderRadius: 10,
                  background: "rgba(148,163,184,0.025)",
                }}
              />
            );
          const dayCitas = citasByDay[d] || [];
          const isToday = isCurrentMonth && d === todayDate.getDate();
          const total = dayCitas.length;
          
          let festivo = null;
          if (month === 9 && d === 12) festivo = "Día de la Hispanidad";
          if (month === 11 && d === 25) festivo = "Navidad";
          if (month === 0 && d === 1) festivo = "Año Nuevo";
          if (month === 0 && d === 6) festivo = "Reyes Magos";
          if (month === 4 && d === 1) festivo = "Día del Trabajador";

          let birthday = null;
          if (d === 15) birthday = "Cumpleaños Cliente";
          
          const isClosed = (bloqueos || []).some((b: any) => {
             const bDate = new Date(b.inicio || b.dia);
             return b.tipo === "vacaciones" && bDate.getFullYear() === year && bDate.getMonth() === month && bDate.getDate() === d;
          });

          const maxCitas = 15;
          const ratio = Math.min(1, total / maxCitas);
          let satColor = TOKENS.success;
          if(ratio > 0.5) satColor = TOKENS.warning;
          if(ratio > 0.8) satColor = TOKENS.danger;

          return (
            <div
              key={i}
              onClick={(e) => {
                  if((e.target as any).closest(".m-birthday-link")) {
                      e.stopPropagation();
                      return;
                  }
                  onSelectDay(new Date(year, month, d));
              }}
              style={{
                background: isClosed
                  ? "repeating-linear-gradient(45deg, rgba(0,0,0,0.02), rgba(0,0,0,0.02) 10px, rgba(0,0,0,0.04) 10px, rgba(0,0,0,0.04) 20px)"
                  : isToday
                    ? "rgba(244,80,30,0.07)"
                    : weekendCol
                      ? "rgba(148,163,184,0.045)"
                      : TOKENS.bgCard,
                border: `1px solid ${isToday ? TOKENS.primary : TOKENS.border}`,
                borderRadius: 10,
                padding: isMobile ? 6 : 9,
                minHeight: cellMinH,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: isMobile ? 4 : 6,
                transition: "border-color 0.15s, transform 0.15s",
                position: "relative",
                overflow: "hidden",
                opacity: isClosed ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = TOKENS.primary;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isToday
                  ? TOKENS.primary
                  : TOKENS.border;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {isClosed && (
                 <div style={{ position: "absolute", top: "50%", left: 0, width: "100%", height: 2, background: TOKENS.textSec, opacity: 0.5, transform: "translateY(-50%)" }} />
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={
                    isToday
                      ? {
                          fontSize: isMobile ? 12 : 13,
                          fontWeight: 800,
                          color: "#fff",
                          width: isMobile ? 20 : 23,
                          height: isMobile ? 20 : 23,
                          borderRadius: "50%",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "linear-gradient(180deg,#ff7a2e,#f4501e)",
                          boxShadow: "0 2px 8px rgba(244,80,30,0.4)",
                        }
                      : {
                          fontSize: isMobile ? 12.5 : 14,
                          fontWeight: 600,
                          color: isClosed ? TOKENS.textTer : (weekendCol ? TOKENS.textSec : TOKENS.text),
                          textDecoration: isClosed ? "line-through" : "none"
                        }
                  }
                >
                  {d}
                </span>
                {!isMobile && festivo && (
                    <span style={{ fontSize: 9, color: TOKENS.danger, fontWeight: 700, padding: "2px 4px", background: "rgba(239,68,68,0.1)", borderRadius: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "65%" }} title={festivo}>
                        {festivo}
                    </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  {!isMobile && birthday && (
                     <div className="m-birthday-link" style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(139,92,246,0.1)", padding: "2px 4px", borderRadius: 4, color: "#8b5cf6", maxWidth: "90%" }}>
                         <Icon name="gift" size={10} color="#8b5cf6" style={{ flexShrink: 0 }} />
                         <span style={{ fontSize: 9, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{birthday}</span>
                     </div>
                  )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  marginTop: "auto",
                  zIndex: 2,
                }}
              >
                {total > 0 && !isClosed && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: isToday ? TOKENS.primaryHi : TOKENS.textSec,
                    }}
                  >
                    {total} cita{total !== 1 && "s"}
                  </span>
                )}
              </div>

              {total > 0 && !isClosed && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                     {Array.from({ length: Math.min(12, total) }).map((_, idx) => (
                        <div key={idx} style={{ width: 6, height: 6, background: satColor, borderRadius: "50%", opacity: 0.8 }} />
                     ))}
                     {total > 12 && <span style={{fontSize: 9, fontWeight: 700, color: TOKENS.textSec, lineHeight: "6px"}}>+</span>}
                  </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
// =============================================
// 8.2: ClienteHistorialModal
// =============================================
function ClienteHistorialModal({
  cliente,
  onClose,
  citas,
  servicioMap,
  profesionalMap,
}: any) {
  const clienteCitas = useMemo(() => {
    return citas
      .filter((c: any) => c.cliente_id === cliente.id)
      .sort(
        (a: any, b: any) =>
          new Date(b.inicio).getTime() - new Date(a.inicio).getTime(),
      );
  }, [citas, cliente.id]);

  const estadoColors: Record<string, { bg: string; color: string }> = {
    confirmada: { bg: "rgba(244,80,30,0.12)", color: TOKENS.primaryHi },
    completada: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
    cancelada: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
    no_presentada: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 16,
          width: 500,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${TOKENS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: TOKENS.text,
              }}
            >
              {cliente.nombre}
            </h3>
            <p
              style={{ margin: "4px 0 0", fontSize: 12, color: TOKENS.textSec }}
            >
              {cliente.telefono || "Sin telefono"} · {clienteCitas.length} citas
              totales
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: TOKENS.textTer,
              cursor: "pointer",
              padding: 4,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Stats */}
        <div
          style={{
            padding: "12px 24px",
            display: "flex",
            gap: 12,
            borderBottom: `1px solid ${TOKENS.border}`,
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              background: "rgba(244,80,30,0.08)",
              borderRadius: 8,
              fontSize: 11,
              color: TOKENS.primaryHi,
              fontWeight: 600,
            }}
          >
            {clienteCitas.filter((c: any) => c.estado === "completada").length}{" "}
            completadas
          </div>
          <div
            style={{
              padding: "6px 12px",
              background: "rgba(239,68,68,0.08)",
              borderRadius: 8,
              fontSize: 11,
              color: "#ef4444",
              fontWeight: 600,
            }}
          >
            {
              clienteCitas.filter(
                (c: any) =>
                  c.estado === "cancelada" || c.estado === "no_presentada",
              ).length
            }{" "}
            canceladas/no-show
          </div>
          {cliente.alergias && (
            <div
              style={{
                padding: "6px 12px",
                background: "rgba(245,158,11,0.08)",
                borderRadius: 8,
                fontSize: 11,
                color: "#f59e0b",
                fontWeight: 600,
              }}
            >
              Alergias: {cliente.alergias}
            </div>
          )}
        </div>
        {/* List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 24px",
            paddingBottom: 60,
          }}
        >
          {clienteCitas.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: TOKENS.textTer,
                textAlign: "center",
                padding: 32,
              }}
            >
              Sin citas registradas
            </div>
          )}
          {clienteCitas.map((c: any) => {
            const srv = servicioMap.get(c.servicio_id);
            const prof = profesionalMap.get(c.profesional_id);
            const fecha = new Date(c.inicio);
            const est = estadoColors[c.estado] || estadoColors.confirmada;
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: `1px solid ${TOKENS.border}22`,
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 36,
                    borderRadius: 2,
                    background: prof?.color || TOKENS.primary,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: TOKENS.text,
                    }}
                  >
                    {srv?.nombre || "Servicio"}
                  </div>
                  <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                    {prof?.nombre || "Profesional"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
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
                      year:
                        fecha.getFullYear() !== new Date().getFullYear()
                          ? "numeric"
                          : undefined,
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                    {fecha.toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "3px 7px",
                    borderRadius: 4,
                    background: est.bg,
                    color: est.color,
                    textTransform: "uppercase",
                  }}
                >
                  {c.estado.replace("_", " ")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const IconCalendar = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const IconClock = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const IconTrash = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const IconSearch = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const IconCheck = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconClose = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconChevronDown = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
