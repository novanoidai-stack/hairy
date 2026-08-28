// Ficha de una cita: ver, editar, mover, ajustar duracion, cobrar.
//
// Sale de AgendaCalendar.web.tsx, donde eran 6.900 lineas de las 25.700 del
// fichero -- la pieza suelta mas grande que habia dentro. Se movio TAL CUAL:
// mismo cuerpo, mismas props, misma logica. Lo unico que cambia es donde vive.
//
// Por que se pudo mover sin cirugia: ya era un componente exportado y ya
// recibia todo por props (no cerraba sobre el estado del calendario). Lo unico
// que le ataba al fichero eran las piezas visuales sueltas (ahora en
// ./ui/atomos.web) y los tipos Cita/Profesional (ahora en ./tipos).
//
// Lo que NO se ha tocado, y hay que seguir sin tocar sin una razon y una
// prueba: el calculo de solape delega en pisaOtraCitaAlSoltar/citaSolapaOcupacion
// (regla unica de la casa) y la cadena multiprofesional en eslabonesParaOperar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore
import { createPortal } from "react-dom";
import { useRouter } from "expo-router";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { supabase } from "@/lib/supabase";
import { getUserProfile } from "@/lib/auth";
import { mensajeDeError } from "@/lib/errores";
import { useCalendarRefresh } from "@/lib/calendarContext";
import { useResponsive } from "@/lib/hooks/useResponsive";
import { useChispaVoz } from "@/lib/hooks/useChispaVoz.web";
import { categoryColorHex } from "@/lib/categoryColors";
import { syncAlergiasACliente } from "@/lib/syncAlergias";
import { traerAlFoco } from "@/lib/demoScroll";
import { obtenerNivelCliente } from "@/lib/fidelizacion";
import { ejecutarAccion, type AccionPropuesta } from "@/lib/chispaOps";
import {
  calcularCascada,
  construirUpdatesRetraso,
  calcularEstrategiasRetraso,
  type EstrategiaRetraso,
  type CitaRetraso,
  type CitaTiempos,
} from "@/lib/retrasos";
import { validarHorarioLaboral } from "@/lib/horarios";
import { DemoSpotlight } from "@/components/ui/DemoSpotlight";
import { CobroSheet } from "@/components/pos/CobroSheet";
import { FichaColorModal } from "@/app/(tabs)/clientes.web";
import RetrasoEstrategiasModal from "../RetrasoEstrategiasModal";
import ListaEsperaPropuestaModal, {
  type CandidataListaEspera,
  type CitaOrigen,
} from "../ListaEsperaPropuestaModal.web";
import {
  RiesgoNoShowIndicator,
  type RiesgoNoShow,
} from "@/components/clientes/RiesgoNoShowIndicator.web";
import {
  CITA_STATUS,
  CITA_STATUS_BLOQUEAN_SOLAPE,
  HORARIO_CIERRE,
  LOCALE,
  NEGOCIO_ID_FALLBACK,
  sinCarrilPropio,
  TAG_RESENO_MECHA,
  TAG_RESENO_SALON,
} from "@/lib/constants";
import { ESTADO_CITA_UI, metaEstadoCita } from "@/lib/citasEstadoUi";
import { isTimeSlotOccupied, citaSolapaOcupacion } from "@/lib/utils/appointment";
import { eslabonesParaOperar } from "@/lib/agenda/cadena";
import type { Cita, Profesional } from "../tipos";
import {
  Avatar,
  DropdownItem,
  FormulaInput,
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
  getCategoryIcon,
} from "../ui/atomos.web";

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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  cliente: (c) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  ),
  servicio: (c) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  ),
  color: (c) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z" />
    </svg>
  ),
  notas: (c) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20l3.5-1L18 8.5a1.5 1.5 0 0 0 0-2.1l-.4-.4a1.5 1.5 0 0 0-2.1 0L5 16.5 4 20z" />
    </svg>
  ),
  pagos: (c) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  productos: (c) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.3 7 12 12 20.7 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  ),
  historial: (c) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  ),
};

// labelCorto: version para el rail horizontal de movil. Con las etiquetas largas
// la barra medía 770px dentro de 390 y cuatro de las seis secciones quedaban
// fuera de pantalla tras un scroll lateral que no se veia venir.
// Un dato de la cabecera de la cita en MOVIL: etiqueta arriba, valor debajo.
// Sustituye a la linea corrida de "valor · valor · valor", que en una pantalla
// estrecha se partia en cinco renglones y dejaba los puntos separadores
// colgando al final de cada uno.
function DatoCita({
  etiqueta,
  valor,
  color,
  destacado,
  anchoCompleto,
}: {
  etiqueta: string;
  valor: string;
  color?: string | null;
  destacado?: boolean;
  anchoCompleto?: boolean;
}) {
  return (
    <div style={{ minWidth: 0, gridColumn: anchoCompleto ? "1 / -1" : undefined }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: TOKENS.textTer,
          marginBottom: 2,
        }}
      >
        {etiqueta}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          fontSize: destacado ? 14.5 : 13.5,
          fontWeight: destacado ? 800 : 600,
          color: destacado ? TOKENS.primaryHi : TOKENS.text,
        }}
      >
        {color && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              background: color,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={valor}
        >
          {valor}
        </span>
      </div>
    </div>
  );
}

const RAIL_ITEMS: { id: SeccionCita; label: string; labelCorto: string }[] = [
  { id: "servicio", label: "Servicio y tiempos", labelCorto: "Servicio" },
  { id: "cliente", label: "Cliente", labelCorto: "Cliente" },
  { id: "color", label: "Ficha de color", labelCorto: "Color" },
  { id: "productos", label: "Productos", labelCorto: "Productos" },
  { id: "pagos", label: "Pagos", labelCorto: "Pagos" },
  { id: "historial", label: "Historial", labelCorto: "Historial" },
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
  onAbrirCita,
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
  const [seccionActiva, setSeccionActiva] = useState<SeccionCita>("servicio");
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

  // Citas sin fases (fin_activa/fin_espera NULL, p.ej. importadas o sembradas):
  // el tiempo activo es TODA la cita y no hay reposo. Sin estas guardas, un
  // new Date(null) es 1970 y salian duraciones de millones de minutos.
  const [activo, setActivo] = useState(
    cita.fin_activa
      ? Math.round(
          (new Date(cita.fin_activa).getTime() -
            new Date(cita.inicio).getTime()) /
            60000,
        )
      : cita.fin
        ? Math.max(
            5,
            Math.round(
              (new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) /
                60000,
            ),
          )
        : 30,
  );
  const [espera, setEspera] = useState(
    cita.fin_espera && cita.fin_activa
      ? Math.round(
          (new Date(cita.fin_espera).getTime() -
            new Date(cita.fin_activa).getTime()) /
            60000,
        )
      : 0,
  );
  const [activo2, setActivo2] = useState(
    cita.fin && cita.fin_espera
      ? Math.max(
          0,
          Math.round(
            (new Date(cita.fin).getTime() -
              new Date(cita.fin_espera).getTime()) /
              60000,
          ),
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
  const [previewState, setPreviewState] = useState<{
    profId?: string;
    minutos: number;
    updates: Array<{
      id: string;
      inicio: string;
      fin: string;
      fin_activa?: string;
      fin_espera?: string;
    }>;
    originalCitas?: any[];
  } | null>(null);
  const [retrasoPickerOpen, setRetrasoPickerOpen] = useState(false);
  const [estrategiasRetraso, setEstrategiasRetraso] = useState<
    EstrategiaRetraso[] | null
  >(null);
  const [retrasoMin, setRetrasoMin] = useState(0);
  const [aplicandoRetraso, setAplicandoRetraso] = useState(false);
  // --- Cobro (POS-0/1): motor compartido con Caja, ver components/pos/CobroSheet. ---
  const [cobrada, setCobrada] = useState<boolean>(!!cita.cobrada);
  const [cobroSenalCents, setCobroSenalCents] = useState(0);
  const [cobrarEncadenadoCompleto, setCobrarEncadenadoCompleto] =
    useState(true);

  const chainSiblings = useMemo(() => {
    if (!cita.grupo_id || !allCitas) return [cita];
    // Fuera tambien los no-shows, no solo las canceladas: un tramo al que la
    // clienta no vino no se cobra ni se arrastra con el resto de la cadena.
    return allCitas.filter(
      (c: any) => c.grupo_id === cita.grupo_id && !sinCarrilPropio(c.estado),
    );
  }, [cita.grupo_id, allCitas]);

  // A que citas afecta un cambio de estado.
  //
  // En un servicio encadenado (color + corte + peinado son tramos de la MISMA
  // visita), tocar el estado del PRIMER tramo arrastra a toda la cadena: si la
  // clienta no viene, no viene a ninguno. Tocar un tramo intermedio afecta solo
  // a ese, porque puede pasar que se haga el color y se deje el peinado.
  const idsParaEstado = useCallback((): string[] => {
    if (!cita.grupo_id || !cita.cliente_id || !allCitas) return [cita.id];
    const cadena = eslabonesParaOperar(cita as any, allCitas as any);
    if (cadena.length > 0 && cadena[0].id === cita.id) {
      return cadena.map((x: any) => x.id);
    }
    return [cita.id];
  }, [cita.id, cita.grupo_id, cita.cliente_id, allCitas]);

  // Punto UNICO por el que pasa cualquier cambio de estado, para que el menu de
  // estado y el boton de Guardar se comporten igual. Antes solo el menu hacia
  // cascade y guardar desde la ficha dejaba el resto de la cadena descolgado.
  const aplicarEstadoCita = useCallback(
    async (nuevoEstado: string): Promise<string[]> => {
      const dbEstado =
        nuevoEstado === "finalizada" ? CITA_STATUS.COMPLETADA : nuevoEstado;
      const ids = idsParaEstado();
      const { error } = await supabase
        .from("citas")
        .update({ estado: dbEstado })
        .in("id", ids);
      if (error) throw error;
      return ids;
    },
    [idsParaEstado],
  );

  // Inventario del salon (pestaña Productos)
  const [inventarioProductos, setInventarioProductos] = useState<any[]>([]);
  // Buscador y categorias del rail de productos. Con un inventario de verdad
  // (decenas de referencias) una lista plana no sirve: hay que poder encontrar
  // el bote concreto sin bajar scrolleando. Mismo patron que la venta en Caja.
  const [prodBusqueda, setProdBusqueda] = useState("");
  const [prodCategoria, setProdCategoria] = useState("todas");
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
      // categoria hace falta para los chips de filtro del rail.
      .select("id, nombre, categoria, precio_cents, stock_minimo, inventario(unidades)")
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

  // Categorias presentes en el inventario (solo se ofrecen las que existen).
  const categoriasProducto = useMemo(
    () =>
      Array.from(
        new Set(
          inventarioProductos.map((p: any) => p.categoria || "general"),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [inventarioProductos],
  );
  const productosFiltrados = useMemo(() => {
    const q = prodBusqueda.trim().toLowerCase();
    return inventarioProductos.filter(
      (p: any) =>
        (prodCategoria === "todas" ||
          (p.categoria || "general") === prodCategoria) &&
        (!q || (p.nombre || "").toLowerCase().includes(q)),
    );
  }, [inventarioProductos, prodBusqueda, prodCategoria]);
  // Señal ya pagada: para que el cobro inline (pestaña Pagos) descuente bien.
  useEffect(() => {
    if (cobrada) return;
    let cancel = false;
    (async () => {
      const citaIds =
        cobrarEncadenadoCompleto && chainSiblings.length > 1
          ? chainSiblings.map((c: any) => c.id)
          : [cita.id];
      const { data } = await supabase
        .from("pagos")
        .select("tipo, importe_cents, estado")
        .in("cita_id", citaIds);
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
  }, [cita.id, cobrada, cobrarEncadenadoCompleto, chainSiblings]);
  // Historial del cliente (citas anteriores) para la pestaña Cliente.
  // Se muestran de 3 en 3; al cerrar la ficha el modal se desmonta y el
  // contador vuelve solo a 3.
  const [clienteHistorial, setClienteHistorial] = useState<any[]>([]);
  const HIST_PASO = 3;
  const [histVisibles, setHistVisibles] = useState(HIST_PASO);
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
        .limit(100);
      if (!cancel) {
        setClienteHistorial(data ?? []);
        setHistVisibles(HIST_PASO);
      }
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
    // Pendiente es el caso mas tipico de no-show: la clienta nunca llego a
    // confirmar y ademas no aparecio. Sin esto no habia forma de marcarlo.
    (cita.estado === CITA_STATUS.PENDIENTE ||
      cita.estado === CITA_STATUS.CONFIRMADA ||
      cita.estado === CITA_STATUS.COMPLETADA);

  async function marcarNoShow() {
    if (guardando) return;
    setGuardando(true);
    setErrMsg("");
    try {
      const citaIds =
        chainSiblings.length > 1
          ? chainSiblings
              .filter((c: any) => c.cliente_id === cita.cliente_id)
              .map((c: any) => c.id)
          : [cita.id];

      for (const cid of citaIds) {
        const { data, error } = await supabase.rpc("marcar_cita_no_show", {
          p_cita_id: cid,
        });
        const res = (data ?? {}) as {
          ok?: boolean;
          error?: string;
          hold_pago_id?: string | null;
          capturar_auto?: boolean;
        };
        if (error || !res.ok) {
          if (cid === cita.id) {
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
        } else {
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
    // Anular un cobro mueve dinero del libro de caja: el servidor exige un motivo
    // y lo guarda en el registro de auditoria, asi que hay que pedirlo aqui.
    let motivo = "";
    if (typeof window !== "undefined") {
      const respuesta = window.prompt(
        "¿Por que se anula este cobro? El motivo queda registrado y la cita volvera a estar sin cobrar.",
        "",
      );
      if (respuesta === null) return; // Cancelado.
      motivo = respuesta.trim();
      if (motivo.length < 3) {
        setErrMsg("Escribe el motivo de la anulacion (minimo 3 caracteres).");
        return;
      }
    }
    setGuardando(true);
    setErrMsg("");
    try {
      const { data, error } = await supabase.rpc("anular_cobro", {
        p_cita_id: cita.id,
        p_motivo: motivo,
      });
      const res = (data ?? {}) as { ok?: boolean; error?: string };
      if (error || !res.ok) {
        const map: Record<string, string> = {
          no_autorizado:
            "Solo el propietario o la direccion pueden anular cobros.",
          motivo_requerido: "Hace falta un motivo para anular el cobro.",
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
  const [chainServicioSearch, setChainServicioSearch] = useState("");
  const [chainGuardando, setChainGuardando] = useState(false);
  const [chainErr, setChainErr] = useState("");
  const [historial, setHistorial] = useState<any[]>([]);
  const [showHistorial, setShowHistorial] = useState(true);

  // Agrupación de servicios por categoría con colores y filtro de búsqueda para encadenar
  const gruposServicioEncadenar = useMemo(() => {
    let baseList = servicios || [];
    if (chainServicioSearch.trim()) {
      const q = norm(chainServicioSearch);
      baseList = baseList.filter((s: any) =>
        norm(s?.nombre || "").includes(q),
      );
    }
    const grupos = (categorias || [])
      .map((cat: any) => ({
        key: cat.id,
        nombre: cat.nombre,
        color: cat.color as string | null,
        items: baseList.filter((s: any) => s.categoria_id === cat.id),
      }))
      .filter((g: any) => g.items.length > 0);
    const sinCategoria = baseList.filter((s: any) => !s.categoria_id);
    if (sinCategoria.length > 0) {
      grupos.push({
        key: "__sin_categoria__",
        nombre: "Sin categoría",
        color: null,
        items: sinCategoria,
      });
    }
    return grupos;
  }, [servicios, categorias, chainServicioSearch]);

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
  // Fecha sin dia de la semana para la cabecera en movil. Ahi la columna de
  // texto se queda en 141 px (el avatar, la pastilla de estado y la cruz se
  // llevan el resto): "jueves, 20 ago · 10:45 - 11:15" pide 162 y "jue, 20 ago
  // · ..." todavia 142, asi que se cortaba por la hora de FIN, justo el dato
  // que se va a mirar. El dia de la semana es lo prescindible: la cabecera de
  // la agenda ya dice en que dia estas, y la fecha completa queda en el title.
  const citaDateCorta = new Date(cita.inicio).toLocaleDateString(LOCALE, {
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

      // Si aqui se ha cambiado el estado, tiene que arrastrar a la cadena igual
      // que si se hubiera cambiado desde el menu de estado. Antes guardar desde
      // la ficha dejaba el resto de los tramos con el estado viejo.
      if (estado !== cita.estado) {
        await aplicarEstadoCita(estado);
      }

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
          .eq("cliente_id", cita.cliente_id)
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

  const handleRestaurar = async () => {
    setGuardando(true);
    try {
      const payload: any = {
        oculta_en_calendario: false,
        estado: CITA_STATUS.PENDIENTE,
        cancelado_por: null,
        motivo_cancelacion: null,
      };

      const { error } = await supabase
        .from("citas")
        .update(payload)
        .eq("id", cita.id);
      if (error) throw error;

      if (cita.grupo_id) {
        await supabase
          .from("citas")
          .update(payload)
          .eq("grupo_id", cita.grupo_id)
          .eq("cliente_id", cita.cliente_id)
          .neq("id", cita.id);
      }

      triggerRefresh();
      onSaved?.({ ...cita, ...payload }) ?? onClose();
      window.dispatchEvent(
        new CustomEvent("mecha-toast", {
          detail: { text: "Cita restaurada." },
        }),
      );
    } catch (err) {
      console.error("Error al restaurar cita:", err);
      alert(mensajeDeError(err, "No se pudo restaurar la cita."));
    } finally {
      setGuardando(false);
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
        chainFin.getTime() > new Date(b.inicio).getTime(),
    );
    if (solapamientoBloqueo) {
      alert(
        "No se puede crear el servicio encadenado porque colisiona con un periodo bloqueante (ej. vacaciones) del profesional seleccionado.",
      );
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
        // El servicio encadenado nace pendiente como cualquier otra cita.
        estado: CITA_STATUS.PENDIENTE,
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

      // Validate overlap (broad fetch, filter both active phases).
      // Mismo criterio que el alta simple: cuenta todo lo que ocupa hueco.
      const { data: potentialOverlaps } = await supabase
        .from("citas")
        .select("id, inicio, fin_activa, fin_espera, fin")
        .eq("profesional_id", chainProfId)
        .in("estado", CITA_STATUS_BLOQUEAN_SOLAPE)
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

  const estadoMeta = ESTADO_CITA_UI;
  // metaEstadoCita ya trae el fallback neutro para estados desconocidos (los
  // escribe la capa de IA o una version anterior): sin el, leer .color/.label de
  // undefined dejaba el detalle en blanco.
  const meta = metaEstadoCita(estado);

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
  // Aviso "en el reposo de esta cita": solo existe cuando la cita TIENE reposo y
  // alguien lo aprovecha. El recorrido guiado abre a proposito una cita asi, y
  // esta cabecera es lo primero que cambia respecto a una cita normal: hay que
  // explicarla, no dejar que sorprenda.
  const dHuecoRef = useRef<HTMLDivElement | null>(null);
  // "detalle-cobrar": el paso final del cobro (efectivo / datafono / Bizum). Vive
  // dentro de la hoja de cobro incrustada en la seccion de pagos, asi que no hay
  // un ref de React al que agarrarse desde aqui: se resuelve por su marca
  // `data-demo="cobro-metodo"` cuando la seccion termina de montarse.
  const dCobroRef = useRef<HTMLElement | null>(null);
  // Zonas "de seccion completa" (resumen, notas, productos, pagos, historial):
  // no tienen un bloque suelto al que apuntar, asi que el foco va al primer
  // bloque real del cuerpo de la seccion, que se resuelve al montarse.
  const dBodyRef = useRef<HTMLDivElement | null>(null);
  const dSeccionRef = useRef<HTMLElement | null>(null);
  // Solo las secciones que EXISTEN en el rail (ver RAIL_ITEMS): productos,
  // pagos e historial. No hay seccion "resumen" ni "notas" sueltas.
  const ZONAS_SECCION: Record<string, SeccionCita> = {
    productos: "productos",
    pagos: "pagos",
    historial: "historial",
  };
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
        estado: "servicio",
        secuencia: "servicio",
        "secuencia-activo": "servicio",
        "secuencia-reposo": "servicio",
        "secuencia-activo2": "servicio",
        formula: "color",
        cobrar: "pagos",
        ...ZONAS_SECCION,
      };
      if (seccionPorZona[zone]) setSeccionActiva(seccionPorZona[zone]);
      if (zone === "formula") setShowFormula(true);
      // El contenedor reenvia la accion del paso varias veces (la seccion puede
      // tardar en montarse). Soltar el objetivo en CADA reenvio dejaba el foco
      // parpadeando dentro del mismo paso; solo se suelta al cambiar de zona.
      setDemoZone((prev) => {
        if (prev !== zone && ZONAS_SECCION[zone]) dSeccionRef.current = null;
        return zone;
      });
    };
    window.addEventListener("mecha-demo", onDemo);
    return () => window.removeEventListener("mecha-demo", onDemo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zonas de seccion completa (productos, pagos, historial): el objetivo es el
  // CUERPO del panel, no su contenido.
  //
  // Antes se apuntaba al primer hijo real, y ese bloque es mas alto que el panel:
  // el recuadro del foco se salia por abajo de la pantalla y dejaba a la vista
  // dos productos y medio, justo lo contrario de lo que explicaba el paso. El
  // cuerpo tiene altura acotada (es el que scrollea), asi que el hueco cae
  // siempre entero dentro del panel. Ademas lo subimos arriba del todo para que
  // la seccion empiece por su principio y no a medio scroll del paso anterior.
  useEffect(() => {
    if (!demoZone || !ZONAS_SECCION[demoZone]) return;
    let tries = 0;
    let raf = 0;
    const pick = () => {
      const root = dBodyRef.current;
      if (root && root.getBoundingClientRect().height > 0) {
        dSeccionRef.current = root;
        root.scrollTop = 0;
        return;
      }
      if (tries++ < 400) raf = requestAnimationFrame(pick); // ~2-6 s segun refresco
    };
    pick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoZone, seccionActiva]);
  // El bloque del metodo de cobro lo pinta CobroSheet, que no expone ref. Se
  // busca por su marca mientras la zona este activa (la hoja tarda en montarse
  // porque la seccion de pagos se acaba de activar).
  //
  // OJO: se busca DENTRO de dBodyRef, no en todo el documento. expo-router deja
  // montada mas de una copia de este detalle a la vez, asi que
  // `document.querySelector` devolvia la hoja de cobro de la copia de ATRAS: se
  // scrolleaba esa, el foco se colocaba con su geometria y encima de la copia
  // visible caia justo la cabecera de la hoja. Acotando la busqueda al cuerpo de
  // ESTA instancia, cada copia enfoca lo suyo y la de delante acierta.
  useEffect(() => {
    if (demoZone !== "cobrar") return;
    let tries = 0;
    let raf = 0;
    const pick = () => {
      const root = dBodyRef.current;
      const el = root
        ? (root.querySelector('[data-demo="cobro-metodo"]') as HTMLElement | null)
        : null;
      if (el && el.getBoundingClientRect().height > 0) {
        dCobroRef.current = el;
        traerAlFoco(el);
        return;
      }
      if (tries++ < 400) raf = requestAnimationFrame(pick);
    };
    pick();
    return () => {
      cancelAnimationFrame(raf);
      dCobroRef.current = null;
    };
  }, [demoZone, seccionActiva]);

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
      "hueco-reposo": dHuecoRef,
      formula: dFormRef,
      productos: dSeccionRef,
      pagos: dSeccionRef,
      cobrar: dCobroRef,
      historial: dSeccionRef,
    };
    // Reintenta: la seccion recien activada tarda un frame en montarse.
    let tries = 0;
    let raf = 0;
    const intentar = () => {
      const el = m[demoZone]?.current;
      if (el && el.getBoundingClientRect().height > 0) {
        traerAlFoco(el);
        return;
      }
      if (tries++ < 400) raf = requestAnimationFrame(intentar); // ~2-6 s segun refresco
    };
    intentar();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoZone]);
  const demoRefMap: Record<string, { current: HTMLElement | null }> = {
    cliente: dCliRef,
    servicio: dSrvRef,
    estado: dEstRef,
    secuencia: dSeqRef,
    "secuencia-activo": dSeqActRef,
    "secuencia-reposo": dSeqRepRef,
    "secuencia-activo2": dSeqAct2Ref,
    "hueco-reposo": dHuecoRef,
    formula: dFormRef,
    productos: dSeccionRef,
    pagos: dSeccionRef,
    cobrar: dCobroRef,
    historial: dSeccionRef,
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
                  : demoZone === "hueco-reposo"
                    ? "Otra cita dentro de este reposo"
                  : demoZone === "formula"
                    ? "Fórmula guardada"
                    : demoZone === "productos"
                      ? "Productos vendidos"
                      : demoZone === "pagos"
                        ? "Cobro desde la cita"
                        : demoZone === "cobrar"
                          ? "Efectivo, datáfono o Bizum"
                        : demoZone === "historial"
                          ? "Historial del cliente"
                          : "";

  const isMobileOrTablet = isMobile || isTablet;

  // El modal se monta en <body> con un portal. Sin el, la barra de pestanas de
  // movil le pasaba por encima y tapaba el pie con "Guardar cambios": cada View
  // de react-native-web es position:relative con z-index:0, asi que el z-index
  // 1000 del overlay se quedaba encerrado en el contexto de apilamiento de la
  // escena, hermano (y anterior) al de la barra.
  const contenido = (
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
          // Pantalla completa en movil, igual que el modal de crear cita: el
          // detalle es largo (rail de secciones + cuerpo con scroll) y el
          // resquicio de hoja solo restaba alto util.
          borderRadius: isMobileOrTablet ? 0 : 16,
          maxWidth: 1040,
          width: isMobileOrTablet ? "100%" : "95%",
          // La hoja sube casi hasta arriba: el detalle de la cita es largo y a
          // 90dvh se quedaban 80 px de fondo oscuro sin usar mientras dentro
          // sobraba scroll. height fija (no solo maxHeight) para que el pie
          // quede SIEMPRE anclado abajo y el cuerpo scrollee por dentro.
          // 98dvh en movil: aprovecha todo el alto posible (pide "subir un
          // poquito mas") dejando solo un resquicio para ver que es una hoja.
          height: isMobileOrTablet ? "calc(100dvh / var(--mecha-zoom, 1))" : "calc(86vh / var(--mecha-zoom, 1))",
          maxHeight: isMobileOrTablet ? "calc(100dvh / var(--mecha-zoom, 1))" : "calc(86vh / var(--mecha-zoom, 1))",
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
              // Menos aire en movil: la cabecera ocupaba 90 px fijos y empujaba
              // todo el detalle hacia abajo.
              padding: isMobileOrTablet ? "12px 14px 10px" : "28px 32px 24px",
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
              <Avatar
                name={selectedCliente?.nombre}
                size={isMobileOrTablet ? 40 : 52}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                {/* El rotulo "DETALLE DE CITA" sobra en movil: la hoja se acaba
                    de abrir desde la cita y el nombre ya dice de quien es. */}
                {!isMobileOrTablet && (
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
                )}
                <div
                  style={{
                    fontSize: isMobileOrTablet ? 18 : 22,
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
                {/* En MOVIL los datos de la cita van en rejilla con su etiqueta.
                    En una linea de puntos separadores se apelotonaban en cinco
                    renglones y los puntos se quedaban colgando al final de cada
                    uno ("Maria Garcia ·"), que era lo que se veia mal. */}
                {isMobileOrTablet ? (
                  // Tres lineas jerarquizadas en vez de una rejilla 2x3 de
                  // etiquetas. La rejilla gastaba ~134 px para cinco datos
                  // (cada uno con su rotulo en mayusculas encima) y quedaba
                  // dentada, porque "Servicio" ocupaba las dos columnas y el
                  // resto caia a media fila. Aqui los rotulos sobran: un nombre
                  // se lee como un nombre y una hora como una hora.
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      marginTop: 8,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: TOKENS.text,
                      }}
                    >
                      {selectedServicioColor && (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 99,
                            background: selectedServicioColor,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {/* El nombre del servicio SE ENVUELVE, no se recorta: con
                          puntos suspensivos "Mechas Balayage + Matiz" quedaba en
                          "Mechas Balayage ..." y el dato principal de la cita
                          dejaba de leerse. */}
                      <span style={{ minWidth: 0 }}>
                        {selectedServicio?.nombre || "—"}
                      </span>
                    </div>
                    {/* Dos lineas de texto plano, con el punto DENTRO de la
                        cadena. Con una fila flexible que envuelve, el separador
                        es un elemento mas y se queda colgando al final del
                        renglon ("Maria Garcia ·"), que es el defecto que ya se
                        habia corregido una vez en la version de escritorio. */}
                    <div
                      style={{
                        fontSize: 12,
                        color: TOKENS.textSec,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        minWidth: 0,
                      }}
                      title={selectedProf?.nombre || "—"}
                    >
                      {selectedProf?.nombre || "—"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: TOKENS.textSec,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        minWidth: 0,
                      }}
                      title={`${citaDate} · ${citaHora} - ${citaFinHora}`}
                    >
                      {citaDateCorta} · {citaHora} - {citaFinHora}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: TOKENS.text,
                          letterSpacing: -0.2,
                        }}
                      >
                        {totalMin} min
                      </span>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: TOKENS.primaryHi,
                          letterSpacing: -0.2,
                        }}
                      >
                        {selectedServicio?.precio ?? 0} €
                      </span>
                      {espera > 0 && (
                        <span
                          style={{ fontSize: 11.5, color: TOKENS.textSec }}
                        >
                          {activo}m activo · {espera}m reposo
                          {activo2 > 0 ? ` · ${activo2}m activo` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                <>
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
                {/* Resumen de la cita: antes vivia en su propia pestana, ahora
                    va en la tarjeta de cabecera y algo mas grande. */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    marginTop: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: TOKENS.text,
                      letterSpacing: -0.2,
                    }}
                  >
                    {totalMin} min
                  </span>
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 99,
                      background: TOKENS.textTer,
                      alignSelf: "center",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: TOKENS.primaryHi,
                      letterSpacing: -0.2,
                    }}
                  >
                    {selectedServicio?.precio ?? 0} €
                  </span>
                  {espera > 0 && (
                    <>
                      <span
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: 99,
                          background: TOKENS.textTer,
                          alignSelf: "center",
                        }}
                      />
                      <span style={{ fontSize: 12.5, color: TOKENS.textSec }}>
                        {activo}m activo · {espera}m reposo
                        {activo2 > 0 ? ` · ${activo2}m activo` : ""}
                      </span>
                    </>
                  )}
                </div>
                </>
                )}
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
                ref={dHuecoRef}
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
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: isMobileOrTablet ? "column" : "row",
            }}
          >
            {isMobileOrTablet ? (
              // Rail de secciones en hoja inferior: envuelve en dos filas en vez de
              // esconder la mitad tras un scroll lateral. Todas a la vista y a un toque.
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  rowGap: 4,
                  padding: "10px 12px",
                  borderBottom: `1px solid ${TOKENS.border}`,
                  background: TOKENS.bgPanel,
                  flexShrink: 0,
                }}
              >
                {RAIL_ITEMS.map((it) => (
                  <SeccionRailItem
                    key={it.id}
                    id={it.id}
                    label={it.labelCorto}
                    active={seccionActiva === it.id}
                    onClick={() => setSeccionActiva(it.id)}
                    vertical={false}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  width: 220,
                  flexShrink: 0,
                  borderRight: `1px solid ${TOKENS.border}`,
                  padding: "16px 10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  overflowY: "auto",
                }}
              >
                {RAIL_ITEMS.map((it) => (
                  <SeccionRailItem
                    key={it.id}
                    id={it.id}
                    label={it.label}
                    active={seccionActiva === it.id}
                    onClick={() => setSeccionActiva(it.id)}
                    vertical
                  />
                ))}
                {/* Resumen anclado abajo: reparte el alto del rail (antes quedaba
                    todo acumulado arriba con un vacio enorme debajo). */}
                <div style={{ marginTop: "auto", paddingTop: 14 }}>
                  <div
                    style={{
                      borderTop: `1px solid ${TOKENS.border}`,
                      paddingTop: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 9,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: selectedProf?.color || TOKENS.primary,
                        }}
                      >
                        {selectedProf?.foto_perfil ? (
                          <img
                            src={selectedProf.foto_perfil}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              color: "#fff",
                            }}
                          >
                            {(selectedProf?.nombre || "?")
                              .split(/\s+/)
                              .map((w: string) => w[0])
                              .filter(Boolean)
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: TOKENS.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {selectedProf?.nombre || "Sin asignar"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: TOKENS.textSec }}>
                        Duración
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: TOKENS.text,
                        }}
                      >
                        {totalMin} min
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: TOKENS.textSec }}>
                        Precio
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: TOKENS.primaryHi,
                        }}
                      >
                        {selectedServicio?.precio ?? 0} €
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: TOKENS.textSec }}>
                        Estado
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          color: meta.color,
                          background: meta.soft,
                          padding: "3px 8px",
                          borderRadius: 999,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div
              ref={dBodyRef}
              style={{
                flex: 1,
                minWidth: 0,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                padding: isMobileOrTablet ? "18px 18px 24px" : "24px 32px 28px",
              }}
            >
              {seccionActiva === "cliente" && (
                <>
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
                  </div>
                </>
              )}
              {seccionActiva === "cliente" && (
                <>
                  {/* Historial del cliente (citas anteriores) */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: TOKENS.textTer,
                      }}
                    >
                      Historial del cliente
                    </div>
                    {clienteHistorial.length === 0 ? (
                      <div style={{ fontSize: 13, color: TOKENS.textTer }}>
                        Sin citas anteriores registradas.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {clienteHistorial
                          .slice(0, histVisibles)
                          .map((c: any) => {
                            const srv = servicios.find(
                              (s: any) => s.id === c.servicio_id,
                            );
                            const pr = profesionales.find(
                              (p: any) => p.id === c.profesional_id,
                            );
                            const d = new Date(c.inicio);
                            return (
                              <div
                                key={c.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  background: TOKENS.bgCard,
                                  border: `1px solid ${TOKENS.border}`,
                                  borderRadius: 10,
                                  padding: "8px 12px",
                                  transition:
                                    "border-color 0.15s ease, transform 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor =
                                    TOKENS.primary;
                                  e.currentTarget.style.transform =
                                    "translateY(-1px)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor =
                                    TOKENS.border;
                                  e.currentTarget.style.transform = "none";
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: TOKENS.textSec,
                                    minWidth: 64,
                                  }}
                                >
                                  {d.toLocaleDateString("es-ES", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "2-digit",
                                  })}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: 12.5,
                                      color: TOKENS.text,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {srv?.nombre || "Servicio"}
                                  </div>
                                  {pr?.nombre && (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: TOKENS.textTer,
                                      }}
                                    >
                                      {pr.nombre}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        {(clienteHistorial.length > histVisibles ||
                          histVisibles > HIST_PASO) && (
                          <div
                            style={{ display: "flex", gap: 8, marginTop: 2 }}
                          >
                            {clienteHistorial.length > histVisibles && (
                              <button
                                type="button"
                                onClick={() =>
                                  setHistVisibles((v) => v + HIST_PASO)
                                }
                                style={{
                                  flex: 1,
                                  padding: "8px 12px",
                                  background: "rgba(244,80,30,0.08)",
                                  border: "1px solid rgba(244,80,30,0.35)",
                                  borderRadius: 9,
                                  color: TOKENS.primaryHi,
                                  fontSize: 12.5,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  transition: "background 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background =
                                    "rgba(244,80,30,0.14)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background =
                                    "rgba(244,80,30,0.08)";
                                }}
                              >
                                Ver más (
                                {clienteHistorial.length - histVisibles})
                              </button>
                            )}
                            {histVisibles > HIST_PASO && (
                              <button
                                type="button"
                                className="m-btn-secondary"
                                onClick={() => setHistVisibles(HIST_PASO)}
                                style={{
                                  flex: 1,
                                  padding: "8px 12px",
                                  background: TOKENS.bgCard,
                                  border: `1px solid ${TOKENS.border}`,
                                  borderRadius: 9,
                                  color: TOKENS.textSec,
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Ver menos
                              </button>
                            )}
                          </div>
                        )}
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
                          : "linear-gradient(180deg, rgba(226,59,52,0.10), rgba(226,59,52,0.04))",
                        border: `1.5px solid ${confirmadaCliente ? "rgba(16,185,129,0.45)" : "rgba(226,59,52,0.45)"}`,
                        color: confirmadaCliente ? TOKENS.success : "#e23b34",
                        cursor: togglingConfirma ? "wait" : "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                        transition:
                          "transform 0.15s cubic-bezier(0.16,1,0.3,1), box-shadow 0.15s ease, border-color 0.15s ease",
                        boxShadow: confirmadaCliente
                          ? "0 4px 14px rgba(16,185,129,0.18)"
                          : "0 4px 14px rgba(226,59,52,0.18)",
                      }}
                      onMouseEnter={(e) => {
                        if (!togglingConfirma) {
                          e.currentTarget.style.transform = "translateY(-1px)";
                          e.currentTarget.style.boxShadow = confirmadaCliente
                            ? "0 8px 22px rgba(16,185,129,0.30)"
                            : "0 8px 22px rgba(226,59,52,0.30)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = confirmadaCliente
                          ? "0 4px 14px rgba(16,185,129,0.18)"
                          : "0 4px 14px rgba(226,59,52,0.18)";
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
                            : "rgba(226,59,52,0.20)",
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
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            marginBottom: 2,
                          }}
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
                              : "rgba(226,59,52,0.80)",
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
                            : "rgba(226,59,52,0.20)",
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
                </>
              )}
              {seccionActiva === "cliente" && (
                <>
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
                              className="m-chip"
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
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
                            <div
                              style={{ fontSize: 11, color: TOKENS.textTer }}
                            >
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
                            setActivo(
                              s.duracion_activa_min || s.duracion || 30,
                            );
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
                            <div
                              style={{ fontSize: 10, color: TOKENS.textTer }}
                            >
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
                                e.currentTarget.style.transform = "none";
                              }}
                              onMouseLeave={(e) => {
                                if (!active) {
                                  e.currentTarget.style.borderColor =
                                    TOKENS.border;
                                  e.currentTarget.style.background =
                                    "transparent";
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
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
                            padding: "12px 14px",
                            borderRadius: 12,
                            border: "1px solid rgba(192,38,10,0.25)",
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
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
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
                                <button
                                  key={sib.id}
                                  type="button"
                                  onClick={() => {
                                    if (!isCurrent) onAbrirCita?.(sib);
                                  }}
                                  title={
                                    isCurrent
                                      ? "Estas viendo este servicio"
                                      : "Ver este servicio de la cadena"
                                  }
                                  style={{
                                    padding: "6px 10px",
                                    textAlign: "left",
                                    background: isCurrent
                                      ? "rgba(192,38,10,0.15)"
                                      : TOKENS.bgCard,
                                    border: `1px solid ${isCurrent ? "#e0340e" : TOKENS.border}`,
                                    borderRadius: 8,
                                    minWidth: 0,
                                    cursor: isCurrent ? "default" : "pointer",
                                    transition:
                                      "border-color 0.15s ease, transform 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (isCurrent) return;
                                    e.currentTarget.style.borderColor =
                                      "#e0340e";
                                    e.currentTarget.style.transform =
                                      "translateY(-1px)";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (isCurrent) return;
                                    e.currentTarget.style.borderColor =
                                      TOKENS.border;
                                    e.currentTarget.style.transform = "none";
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: isCurrent
                                        ? "#e0340e"
                                        : TOKENS.text,
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
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
                  {/* Chain overlap detection */}
                  {chainOverlapInfo &&
                    (chainOverlapInfo.before || chainOverlapInfo.after) && (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          border: "1px solid rgba(226,59,52,0.25)",
                          background: "rgba(226,59,52,0.04)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#e23b34",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Conflicto en cadena
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {chainOverlapInfo.before &&
                            chainOverlapInfo.beforeCita &&
                            (() => {
                              const prevSrv = servicios.find(
                                (s: any) =>
                                  s.id ===
                                  chainOverlapInfo.beforeCita.servicio_id,
                              );
                              const prevProf = profesionales.find(
                                (p: any) =>
                                  p.id ===
                                  chainOverlapInfo.beforeCita.profesional_id,
                              );
                              const prevFin = new Date(
                                chainOverlapInfo.beforeCita.fin,
                              );
                              const currentInicio = new Date(cita.inicio);
                              const overlap =
                                prevFin > currentInicio
                                  ? Math.round(
                                      (prevFin.getTime() -
                                        currentInicio.getTime()) /
                                        60000,
                                    )
                                  : 0;
                              return (
                                <div
                                  style={{
                                    padding: "8px 10px",
                                    background: TOKENS.bgCard,
                                    border: `1px solid #e23b34`,
                                    borderRadius: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "#e23b34",
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
                                    {prevSrv?.nombre} (
                                    {prevProf?.nombre?.split(" ")[0]}) finaliza
                                    a{" "}
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
                                  s.id ===
                                  chainOverlapInfo.afterCita.servicio_id,
                              );
                              const nextProf = profesionales.find(
                                (p: any) =>
                                  p.id ===
                                  chainOverlapInfo.afterCita.profesional_id,
                              );
                              const nextInicio = new Date(
                                chainOverlapInfo.afterCita.inicio,
                              );
                              const currentFin = new Date(cita.fin);
                              const overlap =
                                currentFin > nextInicio
                                  ? Math.round(
                                      (currentFin.getTime() -
                                        nextInicio.getTime()) /
                                        60000,
                                    )
                                  : 0;
                              return (
                                <div
                                  style={{
                                    padding: "8px 10px",
                                    background: TOKENS.bgCard,
                                    border: `1px solid #e23b34`,
                                    borderRadius: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "#e23b34",
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
                                    {nextSrv?.nombre} (
                                    {nextProf?.nombre?.split(" ")[0]}) comienza
                                    a{" "}
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
                  {/* Encadenar servicio */}
                  {estado === CITA_STATUS.CONFIRMADA && (
                    <div
                      style={{
                        padding: showChainForm ? "10px 0" : "0",
                        ...(showChainForm
                          ? {}
                          : {
                              display: "flex",
                              alignItems: "center",
                              minHeight: 36,
                            }),
                      }}
                    >
                      {!showChainForm ? (
                        <button
                          onClick={() => {
                            setShowChainForm(true);
                            setChainServicioId(null);
                            setChainProfId(null);
                            setChainServicioSearch("");
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
                            transition:
                              "background 0.15s ease, transform 0.15s ease",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "rgba(244,80,30,0.14)";
                            e.currentTarget.style.transform =
                              "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              "rgba(244,80,30,0.08)";
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
                              className="m-btn-icon"
                              onClick={() => {
                                setShowChainForm(false);
                                setChainServicioSearch("");
                              }}
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

                          {/* Servicio con Buscador y Categorías */}
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

                            {/* Buscador de servicios */}
                            <div style={{ position: "relative", marginBottom: 8 }}>
                              <input
                                type="text"
                                placeholder="Buscar servicio a encadenar..."
                                value={chainServicioSearch}
                                onChange={(e) =>
                                  setChainServicioSearch(e.target.value)
                                }
                                style={{
                                  width: "100%",
                                  padding: "7px 10px 7px 28px",
                                  background: TOKENS.bgCard,
                                  border: `1px solid ${TOKENS.border}`,
                                  borderRadius: 8,
                                  color: TOKENS.text,
                                  fontSize: 11.5,
                                  boxSizing: "border-box",
                                  outline: "none",
                                  transition: "all 0.15s ease",
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = "#e0340e";
                                  e.currentTarget.style.boxShadow =
                                    "0 0 0 2px rgba(244,80,30,0.15)";
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor =
                                    TOKENS.border;
                                  e.currentTarget.style.boxShadow = "none";
                                }}
                              />
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={TOKENS.textTer}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  position: "absolute",
                                  left: 9,
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  pointerEvents: "none",
                                }}
                              >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              {chainServicioSearch && (
                                <button
                                  type="button"
                                  onClick={() => setChainServicioSearch("")}
                                  style={{
                                    position: "absolute",
                                    right: 6,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    color: TOKENS.textTer,
                                    cursor: "pointer",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 4px",
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>

                            {/* Lista ordenada por categorías */}
                            <div
                              style={{
                                maxHeight: 200,
                                overflowY: "auto",
                                paddingRight: 2,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                              }}
                            >
                              {gruposServicioEncadenar.length === 0 ? (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: TOKENS.textTer,
                                    textAlign: "center",
                                    padding: "10px 0",
                                    fontStyle: "italic",
                                  }}
                                >
                                  No se encontraron servicios
                                </div>
                              ) : (
                                gruposServicioEncadenar.map((grupo: any) => {
                                  const gColor = grupo.color
                                    ? categoryColorHex(grupo.color)
                                    : "#e0340e";
                                  return (
                                    <div key={grupo.key}>
                                      {!(
                                        gruposServicioEncadenar.length === 1 &&
                                        grupo.key === "__sin_categoria__"
                                      ) && (
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 5,
                                            marginBottom: 4,
                                            fontSize: 9.5,
                                            fontWeight: 700,
                                            color: TOKENS.textTer,
                                            textTransform: "uppercase",
                                            letterSpacing: 0.5,
                                          }}
                                        >
                                          <span
                                            style={{
                                              width: 6,
                                              height: 6,
                                              borderRadius: 99,
                                              background: gColor || "#94a3b8",
                                              flexShrink: 0,
                                            }}
                                          />
                                          {grupo.nombre}
                                        </div>
                                      )}
                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns:
                                            "repeat(auto-fill, minmax(130px, 1fr))",
                                          gap: 5,
                                        }}
                                      >
                                        {grupo.items.map((s: any) => {
                                          const isSelected =
                                            chainServicioId === s.id;
                                          const durTotal =
                                            (s.duracion_activa_min || 0) +
                                            (s.duracion_espera_min || 0) +
                                            (s.duracion_activa_extra_min || 0) ||
                                            30;
                                          return (
                                            <button
                                              key={s.id}
                                              type="button"
                                              className="m-chip"
                                              onClick={() => {
                                                setChainServicioId(
                                                  isSelected ? null : s.id,
                                                );
                                                setChainErr("");
                                              }}
                                              style={{
                                                padding: "6px 8px",
                                                borderRadius: 7,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                textAlign: "left",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 2,
                                                border: isSelected
                                                  ? `1.5px solid ${gColor || "#e0340e"}`
                                                  : `1px solid ${TOKENS.border}`,
                                                background: isSelected
                                                  ? `${gColor || "#e0340e"}18`
                                                  : TOKENS.bgCard,
                                                color: isSelected
                                                  ? gColor || "#e0340e"
                                                  : TOKENS.text,
                                                borderLeft: `3px solid ${gColor || "#94a3b8"}`,
                                                boxShadow: isSelected
                                                  ? `0 2px 6px ${gColor || "#e0340e"}22`
                                                  : "none",
                                                transition: "all 0.15s ease",
                                              }}
                                            >
                                              <span
                                                style={{
                                                  overflow: "hidden",
                                                  textOverflow: "ellipsis",
                                                  whiteSpace: "nowrap",
                                                  width: "100%",
                                                  fontWeight: isSelected
                                                    ? 700
                                                    : 600,
                                                }}
                                              >
                                                {s.nombre}
                                              </span>
                                              <div
                                                style={{
                                                  display: "flex",
                                                  alignItems: "center",
                                                  justifyContent:
                                                    "space-between",
                                                  fontSize: 9.5,
                                                  color: isSelected
                                                    ? gColor || "#e0340e"
                                                    : TOKENS.textTer,
                                                  fontWeight: 500,
                                                }}
                                              >
                                                <span>{durTotal} min</span>
                                                <span
                                                  style={{
                                                    fontWeight: 700,
                                                    color: TOKENS.success,
                                                  }}
                                                >
                                                  {s.precio != null
                                                    ? `${s.precio}€`
                                                    : ""}
                                                </span>
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
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
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 5,
                                }}
                              >
                                {profesionales.map((p: any) => (
                                  <button
                                    key={p.id}
                                    className="m-chip"
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
                              <div
                                style={{ fontSize: 10, color: TOKENS.textTer }}
                              >
                                {chainTimingPreview.inicio.toLocaleTimeString(
                                  "es-ES",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}{" "}
                                -{" "}
                                {chainTimingPreview.fin.toLocaleTimeString(
                                  "es-ES",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}{" "}
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
                              className="m-btn-secondary"
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
                              className="m-btn-primary"
                              onClick={handleEncadenar}
                              disabled={
                                !chainServicioId ||
                                !chainProfId ||
                                chainGuardando
                              }
                              style={{
                                padding: "6px 14px",
                                background:
                                  !chainServicioId ||
                                  !chainProfId ||
                                  chainGuardando
                                    ? "rgba(192,38,10,0.3)"
                                    : "linear-gradient(180deg,#9b8afb 0%,#c0260a 100%)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 6,
                                cursor:
                                  !chainServicioId ||
                                  !chainProfId ||
                                  chainGuardando
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
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
                                e.currentTarget.style.borderColor =
                                  TOKENS.border;
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
                </>
              )}
              {seccionActiva === "color" && (
                <>
                  {/* Aviso de alergias del cliente */}
                  {(() => {
                    const alergiasTexto = (
                      selectedCliente?.alergias ?? ""
                    ).trim();
                    if (!alergiasTexto) return null;
                    return (
                      <div
                        className="m-pulse-red"
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          padding: 12,
                          background: "rgba(226,59,52,0.10)",
                          border: "1px solid rgba(226,59,52,0.40)",
                          borderRadius: 10,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            color: "#e23b34",
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
                              color: "#e23b34",
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
                              color: "#e23b34",
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
                </>
              )}
              {seccionActiva === "color" && (
                <>
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
                  {/* Estado */}
                  <div
                    ref={(el) => {
                      dEstRef.current = el;
                    }}
                  >
                    <Label>Estado</Label>
                    <div style={{ position: "relative" }}>
                      <button
                        className="m-row-hover"
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
                                setOpenEst(false);
                                // Cancelar NO es cambiar un campo mas. Ademas de
                                // dejar la cita en cancelada hay que ocultarla del
                                // calendario, guardar quien cancela y por que,
                                // arrastrar a los servicios encadenados y ofrecer
                                // el hueco a la lista de espera. Todo eso vive en
                                // el modal de cancelacion. Antes, cancelar desde
                                // aqui dejaba la cita a medias: marcada como
                                // cancelada pero visible, sin motivo y sin liberar
                                // el hueco para nadie.
                                if (k === CITA_STATUS.CANCELADA) {
                                  setShowCancelModal(true);
                                  return;
                                }
                                setEstado(k);
                                try {
                                  await aplicarEstadoCita(k);
                                } catch (err) {
                                  alert(
                                    mensajeDeError(
                                      err,
                                      "No se pudo cambiar el estado de la cita.",
                                    ),
                                  );
                                  setEstado(cita.estado);
                                }
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
                                  estado === k
                                    ? TOKENS.primarySoft
                                    : "transparent",
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
                                  e.currentTarget.style.background =
                                    "transparent";
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
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
                        style={{
                          fontSize: 22,
                          fontWeight: 700,
                          color: "#10b981",
                        }}
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
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
                        <span
                          style={{ color: TOKENS.textTer, fontWeight: 700 }}
                        >
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
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
                          setFechaEditada(
                            new Date(e.target.value + "T12:00:00"),
                          )
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
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
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
                      <TimeNumBox
                        value={horaEditada.split(":")[1]}
                        label="min"
                      />
                      <TimeBtn onClick={() => adjustHora(0, 5)} plus />
                    </div>
                  </div>
                </>
              )}
              {seccionActiva === "servicio" && (
                <>
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
                </>
              )}
              {seccionActiva === "color" && (
                <>
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
                      className="m-row-hover"
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
                </>
              )}
              {seccionActiva === "historial" && (
                <>
                  {historial.length === 0 && (
                    <div
                      style={{
                        fontSize: 13,
                        color: TOKENS.textTer,
                        padding: "8px 2px",
                      }}
                    >
                      Sin cambios registrados todavia.
                    </div>
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
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
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
                            <span
                              style={{ fontSize: 11, color: TOKENS.textTer }}
                            >
                              ({historial.length})
                            </span>
                          </div>
                          <span
                            style={{
                              transform: showHistorial
                                ? "rotate(180deg)"
                                : "none",
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
                              const hh = String(fecha.getHours()).padStart(
                                2,
                                "0",
                              );
                              const mm = String(fecha.getMinutes()).padStart(
                                2,
                                "0",
                              );
                              const dd = String(fecha.getDate()).padStart(
                                2,
                                "0",
                              );
                              const mo = String(fecha.getMonth() + 1).padStart(
                                2,
                                "0",
                              );
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
                                  <span
                                    style={{ color: TOKENS.textTer, flex: 1 }}
                                  >
                                    {h.valor_anterior && (
                                      <span>{h.valor_anterior}</span>
                                    )}
                                    {h.valor_anterior && h.valor_nuevo && (
                                      <span
                                        style={{
                                          margin: "0 4px",
                                          color: TOKENS.textTer,
                                        }}
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
                </>
              )}
              {seccionActiva === "productos" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: TOKENS.textTer,
                      }}
                    >
                      Inventario del salón
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: TOKENS.textSec,
                        lineHeight: 1.5,
                      }}
                    >
                      Haz clic en un producto para añadirlo a esta cita. Su
                      precio se suma al total del cobro (lo verás en la pestaña{" "}
                      <span style={{ fontWeight: 700, color: TOKENS.text }}>
                        Pagos
                      </span>
                      ).
                    </div>
                    {productosCita.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          padding: 10,
                          borderRadius: 12,
                          background: "rgba(244,80,30,0.06)",
                          border: `1px solid ${TOKENS.primary}40`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                            color: TOKENS.primaryHi,
                          }}
                        >
                          Usados en esta cita
                        </div>
                        {productosCita.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              background: TOKENS.bgCard,
                              border: `1px solid ${TOKENS.border}`,
                              borderRadius: 8,
                              padding: "7px 10px",
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 12.5,
                                color: TOKENS.text,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {p.nombre}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: TOKENS.textSec,
                              }}
                            >
                              x{p.cantidad}
                            </span>
                            <span
                              style={{
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: TOKENS.text,
                                minWidth: 58,
                                textAlign: "right",
                              }}
                            >
                              {(p.precio * p.cantidad).toFixed(2)} €
                            </span>
                            <button
                              type="button"
                              className="m-btn-icon"
                              onClick={() => quitarProductoCita(p.id)}
                              title="Quitar uno"
                              style={{
                                background: "none",
                                border: "none",
                                color: TOKENS.danger,
                                cursor: "pointer",
                                fontSize: 15,
                                fontWeight: 700,
                                padding: "0 4px",
                                lineHeight: 1,
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: 2,
                          }}
                        >
                          <span style={{ fontSize: 12, color: TOKENS.textSec }}>
                            Suma productos
                          </span>
                          <span
                            style={{
                              fontSize: 13.5,
                              fontWeight: 800,
                              color: TOKENS.primaryHi,
                            }}
                          >
                            {totalProductosCita.toFixed(2)} €
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Buscador + categorias: sin esto, con un inventario real
                        hay que bajar scrolleando hasta dar con el producto. */}
                    {inventarioProductos.length > 4 && (
                      <div style={{ marginBottom: 10 }}>
                        <input
                          type="text"
                          value={prodBusqueda}
                          onChange={(e) => setProdBusqueda(e.target.value)}
                          placeholder="Buscar producto..."
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            background: TOKENS.bgCard,
                            border: `1px solid ${TOKENS.border}`,
                            borderRadius: 8,
                            color: TOKENS.text,
                            fontSize: 13,
                            boxSizing: "border-box",
                          }}
                        />
                        {categoriasProducto.length > 1 && (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              overflowX: "auto",
                              marginTop: 8,
                            }}
                          >
                            {["todas", ...categoriasProducto].map((cat) => {
                              const on = prodCategoria === cat;
                              return (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => setProdCategoria(cat)}
                                  style={{
                                    flexShrink: 0,
                                    padding: "5px 12px",
                                    borderRadius: 99,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    background: on
                                      ? TOKENS.primarySoft
                                      : TOKENS.bgCard,
                                    border: `1px solid ${on ? TOKENS.primary : TOKENS.border}`,
                                    color: on ? TOKENS.primaryHi : TOKENS.textSec,
                                    textTransform: "capitalize",
                                  }}
                                >
                                  {cat}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {inventarioProductos.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: TOKENS.textTer,
                          padding: "8px 2px",
                        }}
                      >
                        No hay productos en el inventario todavía.
                      </div>
                    ) : productosFiltrados.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: TOKENS.textTer,
                          padding: "8px 2px",
                        }}
                      >
                        Ningún producto coincide con la búsqueda.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {productosFiltrados.map((p: any) => {
                          const enCita = productosCita.find(
                            (x) => x.id === p.id,
                          );
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
                                transition:
                                  "border-color 0.15s ease, transform 0.15s ease, background 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor =
                                  TOKENS.primary;
                                e.currentTarget.style.transform =
                                  "translateY(-1px)";
                                e.currentTarget.style.background =
                                  "rgba(244,80,30,0.05)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = enCita
                                  ? TOKENS.primary
                                  : TOKENS.border;
                                e.currentTarget.style.transform = "none";
                                e.currentTarget.style.background =
                                  TOKENS.bgCard;
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: TOKENS.text,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {p.nombre}
                                </div>
                                {(() => {
                                  const stock =
                                    p.inventario?.[0]?.unidades ?? 0;
                                  const bajo = stock <= (p.stock_minimo ?? 0);
                                  return (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: bajo
                                          ? TOKENS.danger
                                          : TOKENS.textTer,
                                        marginTop: 2,
                                        fontWeight: bajo ? 700 : 400,
                                      }}
                                    >
                                      Stock: {stock}
                                      {bajo ? " · bajo" : ""}
                                    </div>
                                  );
                                })()}
                              </div>
                              {enCita && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: TOKENS.primaryHi,
                                    background: "rgba(244,80,30,0.12)",
                                    borderRadius: 999,
                                    padding: "2px 8px",
                                  }}
                                >
                                  x{enCita.cantidad}
                                </span>
                              )}
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: TOKENS.text,
                                  flexShrink: 0,
                                }}
                              >
                                {(Number(p.precio_cents ?? 0) / 100).toFixed(2)}{" "}
                                €
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
              {seccionActiva === "pagos" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "stretch",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: TOKENS.textTer,
                      }}
                    >
                      Cobros y pagos
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {holdPagoId && (
                        <>
                          <button
                            onClick={() => gestionarFianza("capturar")}
                            disabled={guardando}
                            onMouseEnter={(e) => {
                              if (!guardando) {
                                e.currentTarget.style.filter =
                                  "brightness(1.05)";
                                e.currentTarget.style.transform =
                                  "translateY(-1px)";
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
                              transition:
                                "filter 0.16s ease, transform 0.16s ease",
                            }}
                          >
                            Capturar fianza
                          </button>
                          <button
                            onClick={() => gestionarFianza("liberar")}
                            disabled={guardando}
                            onMouseEnter={(e) => {
                              if (!guardando) {
                                e.currentTarget.style.filter =
                                  "brightness(1.05)";
                                e.currentTarget.style.transform =
                                  "translateY(-1px)";
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
                              transition:
                                "filter 0.16s ease, transform 0.16s ease",
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
                              e.currentTarget.style.transform =
                                "translateY(-1px)";
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
                            transition:
                              "filter 0.16s ease, transform 0.16s ease",
                          }}
                        >
                          Anular cobro
                        </button>
                      )}
                      {puedeMarcarNoShow && (
                        <button
                          className="m-btn-warn"
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
                      {/* Por que no se puede cobrar. Antes el cobro simplemente
                          desaparecia sin decir nada y parecia un fallo. */}
                      {!cobrada &&
                        (cita.estado === CITA_STATUS.CANCELADA ||
                          cita.estado === CITA_STATUS.NO_PRESENTADA) && (
                          <div
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 8,
                              background: TOKENS.warningSoft,
                              border: `1px solid ${TOKENS.warning}33`,
                              color: TOKENS.text,
                              fontSize: 12.5,
                              lineHeight: 1.5,
                            }}
                          >
                            No se puede cobrar:{" "}
                            {cita.estado === CITA_STATUS.CANCELADA
                              ? "la cita está cancelada"
                              : "la clienta no se presentó"}
                            . Cambia el estado de la cita para habilitar el
                            cobro.
                          </div>
                        )}
                      {!cobrada &&
                        cita.estado !== CITA_STATUS.CANCELADA &&
                        cita.estado !== CITA_STATUS.NO_PRESENTADA && (
                        <div style={{ width: "100%" }}>
                          {chainSiblings.length > 1 && (
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 12,
                                padding: "10px 14px",
                                background: "rgba(244,80,30,0.06)",
                                border: "1px solid rgba(244,80,30,0.2)",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 500,
                                color: TOKENS.text,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={cobrarEncadenadoCompleto}
                                onChange={(e) =>
                                  setCobrarEncadenadoCompleto(e.target.checked)
                                }
                                style={{
                                  width: 16,
                                  height: 16,
                                  accentColor: TOKENS.primary,
                                }}
                              />
                              Cobrar todo el servicio encadenado junto (
                              {chainSiblings.length} servicios)
                            </label>
                          )}
                          {(() => {
                            const baseCents =
                              cobrarEncadenadoCompleto &&
                              chainSiblings.length > 1
                                ? chainSiblings.reduce(
                                    (sum: number, sibling: any) => {
                                      const srv = servicios.find(
                                        (s: any) =>
                                          s.id === sibling.servicio_id,
                                      );
                                      return (
                                        sum +
                                        Math.round((srv?.precio ?? 0) * 100)
                                      );
                                    },
                                    0,
                                  )
                                : Math.round(
                                    Number(
                                      selectedServicio?.precio ??
                                        servicio?.precio ??
                                        0,
                                    ) * 100,
                                  );

                            const pendienteCents = Math.max(
                              0,
                              baseCents - cobroSenalCents,
                            );
                            const citaIdsToCharge =
                              cobrarEncadenadoCompleto &&
                              chainSiblings.length > 1
                                ? chainSiblings.map((c: any) => c.id)
                                : [cita.id];

                            return (
                              <CobroSheet
                                mode="cita"
                                inline
                                citaIds={citaIdsToCharge}
                                lineasIniciales={productosCita.map((p) => ({
                                  nombre: p.nombre,
                                  precio: String(p.precio),
                                  cantidad: String(p.cantidad),
                                  ref_id: p.id,
                                }))}
                                pendienteCents={pendienteCents}
                                senalCents={cobroSenalCents}
                                subtitulo={
                                  cobrarEncadenadoCompleto &&
                                  chainSiblings.length > 1
                                    ? `${selectedCliente?.nombre || "Cliente"} · Servicio encadenado (${chainSiblings.length})`
                                    : `${selectedCliente?.nombre || "Cliente"} · ${selectedServicio?.nombre || servicio?.nombre || "Servicio"}`
                                }
                                subtituloColor={
                                  selectedServicioColor ?? undefined
                                }
                                onClose={() => {}}
                                onSuccess={(cobroIds: string[]) => {
                                  setCobrada(true);
                                  citaIdsToCharge.forEach((cId: string) => {
                                    onSaved?.({
                                      id: cId,
                                      cobrada: true,
                                      cobro_id: cobroIds[0],
                                    });
                                  });
                                  window.dispatchEvent(
                                    new CustomEvent("mecha-toast", {
                                      detail: {
                                        text: "Cobro efectuado correctamente.",
                                      },
                                    }),
                                  );
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
                </>
              )}
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
                  background: "rgba(226,59,52,0.08)",
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
                    className="m-btn-warn"
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
                          className="m-btn-warn"
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
              La cita desaparecera del calendario, pero no se borra: puedes
              volver a verla con el boton «Canceladas» de la barra de arriba, y
              desde ahi restaurarla.
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
                    className="m-chip"
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
                className="m-btn-secondary"
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
                className="m-btn-primary"
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

      {cita.estado === CITA_STATUS.CANCELADA && (
        <div
          style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}
        >
          <button
            className="m-btn-primary"
            onClick={handleRestaurar}
            disabled={guardando}
            style={{
              padding: "8px 16px",
              background: TOKENS.success,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: guardando ? "not-allowed" : "pointer",
            }}
          >
            {guardando ? "..." : "Restaurar cita"}
          </button>
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
                      className="m-btn-primary"
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
                className="m-btn-secondary"
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
  return typeof document !== "undefined"
    ? createPortal(contenido, document.body)
    : contenido;
}

