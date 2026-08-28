// Alta de cita: cliente, servicio, profesional, hora y encadenado.
//
// Sale de AgendaCalendar.web.tsx siguiendo la misma receta que DetalleCitaModal
// (ver ese fichero y la memoria del proyecto): mudanza tal cual, sin reescribir
// el cuerpo, y dejando que `tsc` cante que imports faltan.
//
// Va con ModalAhoraBadge, que es suyo y de nadie mas.
//
// Lo que NO se toca sin una razon y una prueba: el calculo de disponibilidad y
// solape delega en la regla unica (citaSolapaOcupacion / isTimeSlotOccupied), y
// la duracion efectiva sale de los overrides por profesional, no del catalogo.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { supabase } from "@/lib/supabase";
import { getUserProfile } from "@/lib/auth";
import { mensajeDeError } from "@/lib/errores";
import { useCalendarRefresh } from "@/lib/calendarContext";
import { useResponsive } from "@/lib/hooks/useResponsive";
import { cacheado } from "@/lib/datos/cacheado";
import { FRESCURA } from "@/lib/datos/queryClient";
import {
  clavesConfig,
  listarDuracionesProfesional,
  listarOverridesServicio,
  listarRecursos,
} from "@/lib/datos/configuracionSalon";
import { isTimeSlotOccupied, citaSolapaOcupacion } from "@/lib/utils/appointment";
import { resolverSenalStaff } from "@/lib/senalStaff";
import { avisoDeRecurso, type Recurso } from "@/lib/recursos";
import { categoryColorHex } from "@/lib/categoryColors";
import { traerAlFoco } from "@/lib/demoScroll";
import { useDebounce } from "@/lib/hooks/useDebounce";
import {
  validarHorarioLaboral,
  slotsQueCaben,
  cabeEnAlgunaFranja,
  franjasTexto,
} from "@/lib/horarios";
import { duracionRealAprendida, type CitaHistorial } from "@/lib/retrasos";
import {
  CITA_STATUS,
  CITA_STATUS_BLOQUEAN_SOLAPE,
  HORARIO_APERTURA,
  HORARIO_CIERRE,
  INTERVALO_MINUTOS,
  LOCALE,
  sigueViva,
} from "@/lib/constants";
import { TimeDrumPicker } from "@/components/ui/Pickers";
import { DemoSpotlight } from "@/components/ui/DemoSpotlight";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Icon } from "../ui/Icon.web";
import type { Cita, Profesional } from "../tipos";
import {
  Avatar,
  DropdownItem,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconSearch,
  Label,
  Pill,
  SearchDropdown,
  SummaryCell,
  TimeSlider,
  getCategoryIcon,
  norm,
  fmtHHMM,
} from "../ui/atomos.web";

const ModalAhoraBadge = memo(function ModalAhoraBadge() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const ahoraStr = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 13px",
        borderRadius: 11,
        background: "rgba(148,163,184,0.06)",
        border: `1px solid ${TOKENS.border}`,
      }}
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#10b981",
          boxShadow: "0 0 6px #10b981",
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
  );
});

export default function NewCitaModal({
  onClose,
  onSaved,
  selectedDate,
  prefillHora,
  prefillProf,
  prefillClienteId,
  prefillServicioId,
  prefillNotas,
  prefillWaitlistId,
  prefillReposoContext,
  negocioIdIni,
  userIdIni,
  clientesIni,
  serviciosIni,
  profesionalesIni,
  categoriasIni,
  // Jornada de cada profesional (horarios_profesional, dia_semana 0=DOMINGO) y
  // festivos/cierres del salon. Los trae la agenda ya cargados: la rejilla de horas
  // sale de aqui, no de una ventana 09:00-20:00 inventada.
  horariosProfIni,
  cierresIni,
}: any) {
  const { triggerRefresh } = useCalendarRefresh();
  const { isMobile, isTablet } = useResponsive();
  // Misma cache que la agenda: los overrides de duracion y los puestos son
  // datos de referencia y ya los habra traido ella.
  const qcModal = useQueryClient();
  const cacheadoAgenda = useCallback(
    <T,>(clave: readonly unknown[], fn: () => Promise<T>) =>
      cacheado(qcModal, clave, fn, FRESCURA.referencia),
    [qcModal],
  );
  // La agenda ya tiene negocio, usuario y catalogos cargados: sembramos el estado
  // con lo que nos pasa en vez de volver a pedirlo. Antes el modal se abria detras
  // de un spinner mientras repetia getUserProfile (round-trip a /auth/v1/user, y la
  // cache de auth dura 8 s) + 7 consultas que el padre ya habia hecho.
  const [clientes, setClientes] = useState<any[]>(() =>
    [...(clientesIni ?? [])].sort((a: any, b: any) =>
      String(a?.nombre ?? "").localeCompare(String(b?.nombre ?? ""), LOCALE),
    ),
  );
  const [servicios, setServicios] = useState<any[]>(() =>
    [...(serviciosIni ?? [])].sort((a: any, b: any) =>
      String(a?.nombre ?? "").localeCompare(String(b?.nombre ?? ""), LOCALE),
    ),
  );
  const [categorias, setCategorias] = useState<any[]>(categoriasIni ?? []);
  const [profesionales, setProfesionales] = useState<any[]>(() =>
    (profesionalesIni ?? []).filter((p: any) => p?.activo !== false),
  );
  const [citasHoy, setCitasHoy] = useState<any[]>([]);
  // Puestos del salon (lavacabezas, cabinas). Lista corta y que casi nunca
  // cambia: se pide una vez al abrir el modal.
  const [recursosSalon, setRecursosSalon] = useState<Recurso[]>([]);
  // Las horas libres dependen de las citas del dia: hasta que llegan no se puede
  // decir que huecos estan libres ni cuales aprovechan un reposo.
  const [citasHoyListas, setCitasHoyListas] = useState(false);
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
  // Solo hay spinner si nadie nos ha sembrado los catalogos (no pasa desde la agenda).
  const [loading, setLoading] = useState(!clientesIni);
  const [negocioId, setNegocioId] = useState(negocioIdIni || "");
  const [userId, setUserId] = useState<string | null>(userIdIni ?? null);
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
  const debouncedClienteSearch = useDebounce(clienteSearch, 200);
  const [servicioSearch, setServicioSearch] = useState("");
  const debouncedServicioSearch = useDebounce(servicioSearch, 200);
  const [historialClienteServicios, setHistorialClienteServicios] = useState<{
    top: string[];
    last: string[];
  }>({ top: [], last: [] });

  // Buscar servicios más frecuentes del cliente
  useEffect(() => {
    let cancel = false;
    setHistorialClienteServicios({ top: [], last: [] });
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

      const lastServices = Array.from(
        new Set(data.map((c: any) => c.servicio_id).filter(Boolean)),
      ).slice(0, 3) as string[];

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
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Turnos del profesional ESE dia. horarios_profesional.dia_semana es 0=DOMINGO
  // (extract(dow) de Postgres), igual que Date#getDay().
  const franjasHoy = useMemo(
    () =>
      selectedProf
        ? ((horariosProfIni ?? []) as any[])
            .filter(
              (h: any) =>
                h.profesional_id === selectedProf &&
                h.dia_semana === today.getDay(),
            )
            .map((h: any) => ({
              hora_inicio: h.hora_inicio,
              hora_fin: h.hora_fin,
              turno: h.turno,
            }))
        : [],
    [horariosProfIni, selectedProf, todayKey],
  );
  // Festivo / cierre del salon: ese dia no se reserva a nadie.
  const cierreDelDia = useMemo(
    () => ((cierresIni ?? []) as any[]).find((c: any) => c.fecha === todayKey) ?? null,
    [cierresIni, todayKey],
  );
  // Las citas ya completadas siguen ocupando su hueco, pero se tratan aparte al
  // pintar la rejilla: una hora tapada solo por una cita TERMINADA se ensena
  // marcada en vez de desaparecer, para que se vea por que no estaba libre.
  const citasHoyVivas = useMemo(
    () => (citasHoy ?? []).filter((c: any) => sigueViva(c.estado)),
    [citasHoy],
  );

  // --- Demo guiada: el recorrido de demo.html pide rellenar el formulario paso a
  // paso (cliente -> servicio -> hora) y enfocar cada zona con un spotlight. El
  // modal escucha las sub-acciones (cita-cliente / cita-servicio / cita-hora /
  // cita-reposo), auto-selecciona valores de ejemplo y marca la zona a iluminar.
  const [demoZone, setDemoZone] = useState<
    "cliente" | "servicio" | "hora" | "reposo" | "addons" | "encadenar" | null
  >(null);
  const clienteZoneRef = useRef<HTMLElement | null>(null);
  const servicioZoneRef = useRef<HTMLElement | null>(null);
  const horaZoneRef = useRef<HTMLElement | null>(null);
  // Extras (add-ons) y encadenado: el recorrido los explica como pasos propios.
  const addonsZoneRef = useRef<HTMLElement | null>(null);
  const encadenarZoneRef = useRef<HTMLElement | null>(null);
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
      // Los huecos son un interruptor: volver a pulsar el que ya esta puesto lo
      // APAGA. El recorrido pasa por dos pasos seguidos que eligen hora (encadenar
      // y luego la hora), asi que el segundo deseleccionaba lo del primero y se
      // veia como un parpadeo raro. Si ya hay hora elegida, no se toca nada.
      if (zone && zone.querySelector('button[data-slot][data-sel="1"]')) return;
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

  // Servicio que enseña la demo: el de mayor precio del catalogo. En un salon
  // real es el servicio estrella (color/mechas), el que tiene extras y tiempo de
  // reposo, asi que el recorrido cuenta la historia completa. Coger servicios[0]
  // dejaba una barba de 12 EUR con un solo extra y sin reposo.
  // Clienta que enseña la demo al crear la cita: la de ficha mas completa, no la
  // primera por orden alfabetico. Con el fichero de la demo lleno (cientos de
  // nombres) esa primera era un senor cualquiera sin datos, y justo despues el
  // recorrido elige un servicio de color: no pegaba ni con cola.
  const clienteDemo = (clientes: any[]): any => {
    if (!clientes.length) return null;
    const relleno = (c: any) =>
      (c?.alergias ? 2 : 0) +
      (c?.notas ? 2 : 0) +
      ((c?.etiquetas?.length ?? 0) > 0 ? 1 : 0) +
      (Number(c?.ticket_medio ?? 0) > 0 ? 1 : 0);
    return clientes.reduce(
      (mejor: any, c: any) => (relleno(c) > relleno(mejor) ? c : mejor),
      clientes[0],
    );
  };

  const servicioDemo = (servicios: any[]): any =>
    servicios.reduce(
      (mejor: any, s: any) =>
        !mejor || Number(s?.precio ?? 0) > Number(mejor?.precio ?? 0) ? s : mejor,
      null,
    );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyZone = (action: string) => {
      const d = dataRef.current;
      const srv = servicioDemo(d.servicios);
      const cli = clienteDemo(d.clientes);
      if (action === "cita-cliente") {
        if (cli) setSelectedCliente(cli.id);
        setDemoZone("cliente");
      } else if (action === "cita-servicio") {
        if (cli) setSelectedCliente((p: any) => p || cli.id);
        if (srv) setSelectedServicio(srv.id);
        setDemoZone("servicio");
      } else if (action === "cita-hora") {
        if (srv) setSelectedServicio((p: any) => p || srv.id);
        if (d.profesionales[0])
          setSelectedProf((p: string) => p || d.profesionales[0].id);
        setDemoZone("hora");
        pickDemoSlot("hora");
      } else if (action === "cita-reposo") {
        if (srv) setSelectedServicio((p: any) => p || srv.id);
        if (d.profesionales[0])
          setSelectedProf((p: string) => p || d.profesionales[0].id);
        setDemoZone("reposo");
        pickDemoSlot("reposo");
      } else if (action === "cita-addons") {
        // Los extras solo se pintan con un servicio elegido: lo aseguramos.
        if (cli) setSelectedCliente((p: any) => p || cli.id);
        if (srv) setSelectedServicio((p: any) => p || srv.id);
        if (d.profesionales[0])
          setSelectedProf((p: string) => p || d.profesionales[0].id);
        setDemoZone("addons");
      } else if (action === "cita-encadenar") {
        // "+ Encadenar otro" solo aparece con el formulario completo (cliente,
        // servicio, profesional y hora), asi que rellenamos todo y elegimos hueco.
        if (cli) setSelectedCliente((p: any) => p || cli.id);
        if (srv) setSelectedServicio((p: any) => p || srv.id);
        if (d.profesionales[0])
          setSelectedProf((p: string) => p || d.profesionales[0].id);
        // Primero la zona y luego el hueco: si se elige el hueco antes, el
        // formulario crece (aparece "+ Encadenar otro") DESPUES de que el foco
        // haya medido, y el recuadro se queda donde ya no hay nada.
        setDemoZone("encadenar");
        pickDemoSlot("hora");
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

  // Mapa unico zona -> ref (lo usan el scroll y el spotlight).
  const demoZoneRefs: Record<string, { current: HTMLElement | null }> = {
    cliente: clienteZoneRef,
    servicio: servicioZoneRef,
    hora: horaZoneRef,
    reposo: horaZoneRef,
    addons: addonsZoneRef,
    encadenar: encadenarZoneRef,
  };

  // Centra la zona enfocada dentro del modal para que el spotlight la recorte bien.
  // Reintenta unos frames: zonas como los extras o "+ Encadenar otro" aparecen
  // justo despues de que el paso rellene el formulario, no en el mismo tick.
  useEffect(() => {
    if (!demoZone) return;
    const ref = demoZoneRefs[demoZone] || horaZoneRef;
    let tries = 0;
    let raf = 0;
    // Segundo pase: el paso rellena el formulario y el modal sigue creciendo un
    // poco despues (extras, hueco elegido, "+ Encadenar otro"). Con un solo
    // scroll el bloque acababa desplazado; se reasienta una vez mas al final.
    let reasentar = 0;
    const intentar = () => {
      const el = ref.current;
      if (el && el.getBoundingClientRect().height > 0) {
        traerAlFoco(el);
        reasentar = window.setTimeout(() => traerAlFoco(ref.current), 700);
        return;
      }
      // Hasta ~4 s: "+ Encadenar otro" solo aparece con el formulario completo,
      // y la hora se elige sola tras unos reintentos.
      if (tries++ < 240) raf = requestAnimationFrame(intentar);
    };
    intentar();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(reasentar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoZone]);


  useEffect(() => {
    let cancel = false;
    async function cargar() {
      let negocioId = negocioIdIni || "";
      // Solo preguntamos por el perfil si la agenda no nos lo dio: ese getUserProfile
      // era el tramo mas caro de abrir el modal (la cache de auth dura 8 s, asi que
      // al crear una cita casi siempre estaba caducada).
      if (!negocioId) {
        const profile = await getUserProfile();
        if (cancel) return;
        negocioId = profile?.negocio_id || "prueba_46980";
        if (profile?.id) setUserId(profile.id);
      }
      setNegocioId(negocioId);

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

      // Esto es lo unico que la agenda no tiene ya: las citas confirmadas del dia
      // (para saber que huecos quedan libres) y los overrides de duracion.
      const [
        { data: cits, error: citsErr },
        { data: durOverrides },
        { data: profSrvOverrides },
      ] = await Promise.all([
        supabase
          .from("citas")
          .select(
            "id, inicio, fin, fin_activa, fin_espera, profesional_id, grupo_id, orden_en_grupo, estado",
          )
          .eq("negocio_id", negocioId)
          .gte("inicio", `${todayStr}T00:00:00`)
          .lt("inicio", `${tomorrowStr}T00:00:00`)
          // El organizador tiene que ver el dia como es: una cita pendiente
          // ocupa sitio igual que una confirmada, y si no la cuenta propone
          // mover gente a huecos que en realidad estan pillados.
          .in("estado", CITA_STATUS_BLOQUEAN_SOLAPE),
        // Overrides de duracion: datos de referencia, van por cache compartida.
        cacheadoAgenda(clavesConfig.duraciones(negocioId), () =>
          listarDuracionesProfesional(negocioId),
        ),
        cacheadoAgenda(clavesConfig.overridesServicio(negocioId), () =>
          listarOverridesServicio(negocioId),
        ),
      ]);
      if (cancel) return;

      if (citsErr) console.error("Citas error:", citsErr);

      setCitasHoy(cits ?? []);
      setCitasHoyListas(true);
      // Puestos del salon. Si la tabla no dice nada, la lista se queda vacia y
      // el aviso no se enseña nunca: no controlar no es no caber.
      cacheadoAgenda(clavesConfig.recursos(negocioId), () => listarRecursos(negocioId)).then(
        ({ data }) => {
          if (!cancel) setRecursosSalon((data ?? []) as Recurso[]);
        },
      );
      setAllDurOverrides(durOverrides ?? []);
      setAllProfSrvOverrides(profSrvOverrides ?? []);

      // Red de seguridad: si alguien monta el modal sin sembrar los catalogos,
      // se piden aqui (desde la agenda nunca entra por este camino).
      if (!clientesIni) {
        const [
          { data: clts, error: cltsErr },
          { data: srvs, error: srvsErr },
          { data: prfs, error: prfsErr },
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
              "id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, min_antelacion_min, categoria_id, recurso_tipo, recurso_fase",
            )
            .eq("negocio_id", negocioId)
            .order("nombre"),
          supabase
            .from("profesionales")
            .select("id, nombre, color")
            .eq("negocio_id", negocioId)
            .eq("activo", true),
          supabase
            .from("categorias_servicio")
            .select("id, nombre, color, orden, icono")
            .eq("negocio_id", negocioId)
            .eq("activo", true)
            .order("orden"),
        ]);
        if (cancel) return;

        if (srvsErr) console.error("Servicios error:", srvsErr);
        if (cltsErr) console.error("Clientes error:", cltsErr);
        if (prfsErr) console.error("Profesionales error:", prfsErr);

        setClientes(clts ?? []);
        setServicios(srvs ?? []);
        setCategorias(cats ?? []);
        setProfesionales(prfs ?? []);
      }

      setLoading(false);
    }
    cargar();
    return () => {
      cancel = true;
    };
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
    if (debouncedServicioSearch.trim()) {
      baseList = baseList.filter((s: any) =>
        norm(s?.nombre || "").includes(norm(debouncedServicioSearch)),
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
  }, [categorias, selectedProf, serviciosFiltrados, servicios, debouncedServicioSearch]);

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

  // Puestos fisicos: la profesional puede estar libre y el lavacabezas no. Es un
  // AVISO, no un bloqueo: el salon sabe mejor que nosotros si ese dia apana. Y si
  // no hay puestos dados de alta, avisoDeRecurso devuelve null y no se ve nada.
  const avisoRecurso = useMemo(() => {
    if (!inicio || !fin || !selectedServicio) return null;
    const srv = servicios.find((x: any) => x.id === selectedServicio);
    if (!srv?.recurso_tipo) return null;
    return avisoDeRecurso(
      {
        id: 'candidata',
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        fin_activa: finActiva?.toISOString() ?? null,
        fin_espera: finEspera?.toISOString() ?? null,
        estado: 'pendiente',
        recurso_tipo: srv.recurso_tipo,
        recurso_fase: srv.recurso_fase ?? 'final',
      },
      citasHoy.map((c: any) => {
        const s = servicios.find((x: any) => x.id === c.servicio_id);
        return { ...c, recurso_tipo: s?.recurso_tipo ?? null, recurso_fase: s?.recurso_fase ?? 'final' };
      }),
      recursosSalon,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio?.getTime(), fin?.getTime(), selectedServicio, citasHoy, servicios, recursosSalon]);

  // RN-AG-072: detectar si la hora seleccionada cae dentro del tiempo de reposo de otra cita
  const citaHostReposo =
    inicio && selectedProf
      ? citasHoyVivas.find((c: any) => {
          if (
            c.profesional_id !== selectedProf ||
            !c.fin_activa ||
            !c.fin_espera
          )
            return false;
          const cFinActiva = new Date(c.fin_activa);
          const cFinEspera = new Date(c.fin_espera);
          return inicio! >= cFinActiva && inicio! < cFinEspera;
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
          // Las citas nacen PENDIENTE: apuntarla no es lo mismo que tenerla
          // confirmada por la clienta. Confirmar sigue siendo un paso manual,
          // y asi el salon ve de un vistazo (ambar) lo que le falta por cerrar.
          estado: CITA_STATUS.PENDIENTE,
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
          // Nace pendiente (ver arriba). Si el salon exige senal, el bloque de
          // deposito de mas abajo pisa este estado con el suyo.
          estado: CITA_STATUS.PENDIENTE,
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

        // Check overlap contra DB (ambas fases activas).
        // Cuentan todas las que ocupan hueco, no solo las confirmadas: si aqui
        // se ignoran las `pendiente` se dejan crear citas encima y luego salen
        // pintadas en dos columnas (ver CITA_STATUS_BLOQUEAN_SOLAPE).
        const { data: candidatas } = await supabase
          .from("citas")
          .select("id, profesional_id, inicio, fin_activa, fin_espera, fin")
          .eq("profesional_id", cita.profesional_id)
          .in("estado", CITA_STATUS_BLOQUEAN_SOLAPE)
          .lt("inicio", cita.fin)
          .gt("fin", cita.inicio);

        // Las DOS fases activas de la cita nueva contra las DOS de cada cita ya
        // puesta. Aqui habia una copia a mano de la regla que solo miraba la
        // primera fase de la nueva y se saltaba la segunda regla entera cuando la
        // otra cita no tenia fin_espera: por ahi entraban los solapes.
        const solapa = citaSolapaOcupacion(
          {
            inicio: cInicio,
            finActiva: cFinActiva,
            finEspera: cFinEspera,
            fin: cFin,
          },
          (candidatas || []) as any,
          cita.profesional_id,
        );

        if (solapa) {
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
        const intraConflict = citaSolapaOcupacion(
          {
            inicio: cInicio,
            finActiva: cFinActiva,
            finEspera: cFinEspera,
            fin: cFin,
          },
          citasAGuardar.slice(0, i) as any,
          cita.profesional_id,
        );
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
            await supabase.from("cita_addons").insert(
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

          // Solape activa-activa contra las citas que ocupan hueco en DB
          const { data: cand } = await supabase
            .from("citas")
            .select("id, profesional_id, inicio, fin_activa, fin_espera, fin")
            .eq("profesional_id", base.profesional_id)
            .in("estado", CITA_STATUS_BLOQUEAN_SOLAPE)
            .lt("inicio", oFin.toISOString())
            .gt("fin", oInicio.toISOString());
          const choca = citaSolapaOcupacion(
            {
              inicio: oInicio,
              finActiva: oFinActiva,
              finEspera: oFinEspera,
              fin: oFin,
            },
            (cand || []) as any,
            base.profesional_id,
          );
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
            // Las repeticiones de la serie nacen pendiente igual que la base.
            estado: CITA_STATUS.PENDIENTE,
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
                await supabase.from("cita_addons").insert(
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
  const demoZoneRef = (demoZone && demoZoneRefs[demoZone]) || horaZoneRef;
  const demoZoneLabel =
    demoZone === "cliente"
      ? "Elige cliente"
      : demoZone === "servicio"
        ? "Elige servicio"
        : demoZone === "hora"
          ? "Elige la hora"
          : demoZone === "reposo"
            ? "Tiempos muertos"
            : demoZone === "addons"
              ? "Extras del servicio"
              : demoZone === "encadenar"
                ? "Encadenar otro servicio"
                : "";

  const isMobileOrTablet = isMobile || isTablet;

  // Portal a <body>, igual que el detalle de cita: dentro del arbol de escenas
  // la barra de pestanas de movil se pinta encima y tapa el pie con "Reservar".
  const contenido = (
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
          //
          // PANTALLA COMPLETA en movil (100dvh, sin esquinas redondeadas): crear
          // una cita es un formulario largo —clienta, servicio, extras,
          // encadenados y rejilla de horas— y en una hoja al 92 % se veian dos
          // campos y media rejilla. El 8 % que se dejaba de fondo oscuro no
          // aportaba nada y costaba una fila de huecos.
          height: isMobileOrTablet ? "calc(100dvh / var(--mecha-zoom, 1))" : "auto",
          maxHeight: isMobileOrTablet ? "calc(100dvh / var(--mecha-zoom, 1))" : "calc(90vh / var(--mecha-zoom, 1))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: TOKENS.bgPanel,
          border: isMobileOrTablet ? "none" : `1px solid ${TOKENS.borderHi}`,
          borderRadius: isMobileOrTablet ? 0 : 18,
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
          {/* Banner de ayuda de Reposo si la cita se abre desde un hueco de reposo */}
          {prefillReposoContext && (
            <div
              style={{
                marginBottom: 20,
                padding: "14px 16px",
                borderRadius: 14,
                background:
                  "linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.06) 100%)",
                border: "1.5px solid rgba(16,185,129,0.35)",
                boxShadow: "0 4px 16px rgba(16,185,129,0.10)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: "rgba(16,185,129,0.20)",
                    display: "grid",
                    placeItems: "center",
                    color: "#059669",
                    fontSize: 16,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  ⚡
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "#047857",
                      marginBottom: 2,
                    }}
                  >
                    Encajando cita en el reposo de{" "}
                    {prefillReposoContext.hostClienteNombre}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: TOKENS.textSec,
                      lineHeight: 1.4,
                    }}
                  >
                    {prefillReposoContext.hostServicioNombre} · Intervalo
                    disponible:{" "}
                    <strong style={{ color: TOKENS.text }}>
                      {fmtHHMM(new Date(prefillReposoContext.reposoInicio))} -{" "}
                      {fmtHHMM(new Date(prefillReposoContext.reposoFin))}
                    </strong>{" "}
                    ({prefillReposoContext.duracionReposoMin} min libres)
                  </div>
                </div>
              </div>

              {/* Botones de inicio rápido */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  paddingTop: 8,
                  borderTop: "1px dashed rgba(16,185,129,0.25)",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: TOKENS.textSec,
                  }}
                >
                  Inicio en reposo:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const hStr = fmtHHMM(
                      new Date(prefillReposoContext.reposoInicio),
                    );
                    setUseCustomHora(true);
                    setHoraPersonalizada(hStr);
                    setSelectedHora(hStr);
                  }}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 8,
                    border:
                      (useCustomHora &&
                        horaPersonalizada ===
                          fmtHHMM(
                            new Date(prefillReposoContext.reposoInicio),
                          )) ||
                      selectedHora ===
                        fmtHHMM(new Date(prefillReposoContext.reposoInicio))
                        ? "1.5px solid #10b981"
                        : `1px solid ${TOKENS.border}`,
                    background:
                      (useCustomHora &&
                        horaPersonalizada ===
                          fmtHHMM(
                            new Date(prefillReposoContext.reposoInicio),
                          )) ||
                      selectedHora ===
                        fmtHHMM(new Date(prefillReposoContext.reposoInicio))
                        ? "rgba(16,185,129,0.22)"
                        : TOKENS.bgCard,
                    color:
                      (useCustomHora &&
                        horaPersonalizada ===
                          fmtHHMM(
                            new Date(prefillReposoContext.reposoInicio),
                          )) ||
                      selectedHora ===
                        fmtHHMM(new Date(prefillReposoContext.reposoInicio))
                        ? "#047857"
                        : TOKENS.text,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  📍 Al principio (
                  {fmtHHMM(new Date(prefillReposoContext.reposoInicio))})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const midMs =
                      new Date(prefillReposoContext.reposoInicio).getTime() +
                      (prefillReposoContext.duracionReposoMin / 2) * 60000;
                    const hStr = fmtHHMM(new Date(midMs));
                    setUseCustomHora(true);
                    setHoraPersonalizada(hStr);
                    setSelectedHora(hStr);
                  }}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 8,
                    border:
                      (useCustomHora &&
                        horaPersonalizada ===
                          fmtHHMM(
                            new Date(
                              new Date(
                                prefillReposoContext.reposoInicio,
                              ).getTime() +
                                (prefillReposoContext.duracionReposoMin / 2) *
                                  60000,
                            ),
                          )) ||
                      selectedHora ===
                        fmtHHMM(
                          new Date(
                            new Date(
                              prefillReposoContext.reposoInicio,
                            ).getTime() +
                              (prefillReposoContext.duracionReposoMin / 2) *
                                60000,
                          ),
                        )
                        ? "1.5px solid #10b981"
                        : `1px solid ${TOKENS.border}`,
                    background:
                      (useCustomHora &&
                        horaPersonalizada ===
                          fmtHHMM(
                            new Date(
                              new Date(
                                prefillReposoContext.reposoInicio,
                              ).getTime() +
                                (prefillReposoContext.duracionReposoMin / 2) *
                                  60000,
                            ),
                          )) ||
                      selectedHora ===
                        fmtHHMM(
                          new Date(
                            new Date(
                              prefillReposoContext.reposoInicio,
                            ).getTime() +
                              (prefillReposoContext.duracionReposoMin / 2) *
                                60000,
                          ),
                        )
                        ? "rgba(16,185,129,0.22)"
                        : TOKENS.bgCard,
                    color:
                      (useCustomHora &&
                        horaPersonalizada ===
                          fmtHHMM(
                            new Date(
                              new Date(
                                prefillReposoContext.reposoInicio,
                              ).getTime() +
                                (prefillReposoContext.duracionReposoMin / 2) *
                                  60000,
                            ),
                          )) ||
                      selectedHora ===
                        fmtHHMM(
                          new Date(
                            new Date(
                              prefillReposoContext.reposoInicio,
                            ).getTime() +
                              (prefillReposoContext.duracionReposoMin / 2) *
                                60000,
                          ),
                        )
                        ? "#047857"
                        : TOKENS.text,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ⏳ En el medio (
                  {fmtHHMM(
                    new Date(
                      new Date(prefillReposoContext.reposoInicio).getTime() +
                        (prefillReposoContext.duracionReposoMin / 2) * 60000,
                    ),
                  )}
                  )
                </button>
              </div>

              {/* Medidor de ajuste de duración y avisos */}
              {(() => {
                const srv = servicios.find(
                  (s: any) => s.id === selectedServicio,
                );
                if (!srv) return null;
                const srvDur =
                  (srv.duracion_activa_min || 0) +
                  (srv.duracion_espera_min || 0) +
                  (srv.duracion_activa_extra_min || 0);

                let windowAvailMin = prefillReposoContext.duracionReposoMin;
                const selectedHoraTxt =
                  useCustomHora && horaPersonalizada
                    ? horaPersonalizada
                    : selectedHora;
                if (selectedHoraTxt && selectedHoraTxt.includes(":")) {
                  const [h, m] = selectedHoraTxt.split(":").map(Number);
                  const selStart = new Date(prefillReposoContext.reposoInicio);
                  selStart.setHours(h, m, 0, 0);
                  const diffMs =
                    new Date(prefillReposoContext.reposoFin).getTime() -
                    selStart.getTime();
                  windowAvailMin = Math.max(0, Math.round(diffMs / 60000));
                }

                const pct =
                  windowAvailMin > 0
                    ? Math.min(100, Math.round((srvDur / windowAvailMin) * 100))
                    : 100;
                const isOverflow = srvDur > windowAvailMin;
                const overflowMin = srvDur - windowAvailMin;

                return (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      marginTop: 4,
                      paddingTop: 6,
                      borderTop: "1px dashed rgba(16,185,129,0.25)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 11.5,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: TOKENS.text }}>
                        Duración servicio: <strong>{srvDur} min</strong> (Reposo
                        disp: <strong>{windowAvailMin} min</strong>)
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: isOverflow ? "#d97706" : "#059669",
                        }}
                      >
                        {isOverflow
                          ? `Sobrepasa +${overflowMin}′`
                          : `${pct}% del hueco`}
                      </span>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        height: 7,
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: isOverflow
                            ? "linear-gradient(90deg, #f59e0b 0%, #e23b34 100%)"
                            : "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: isOverflow ? "#b45309" : "#047857",
                        marginTop: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {isOverflow ? (
                        <span>
                          ⚠️ Atención: El servicio dura {srvDur} min y se
                          sobrepasa {overflowMin} min del reposo disponible
                          desde las {selectedHoraTxt}. Se solapará parcialmente.
                        </span>
                      ) : (
                        <span>
                          ✓ El servicio encaja perfectamente en este reposo
                          (quedan {windowAvailMin - srvDur} min libres).
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
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
            <ModalAhoraBadge />
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
                        background: "rgba(226,59,52,0.08)",
                        border: "1px solid rgba(226,59,52,0.2)",
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
                          "rgba(226,59,52,0.18)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "rgba(226,59,52,0.08)";
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
                {/* No pintar los N clientes de golpe: con carteras grandes (cientos)
                    eso disparaba el Rendering+Painting al abrir. Se muestra un tope y
                    el resto aparece al escribir en el buscador (este bloque solo se
                    renderiza cuando aun no hay cliente elegido). */}
                {(() => {
                  const CLIENTES_TOPE = 30;
                  const matches = clientes.filter((c) =>
                    norm(c.nombre).includes(norm(debouncedClienteSearch)),
                  );
                  const visibles = matches.slice(0, CLIENTES_TOPE);
                  const ocultos = matches.length - visibles.length;
                  return (
                    <>
                      {visibles.map((c) => (
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
                      {ocultos > 0 && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "8px 12px",
                            fontSize: 11,
                            fontWeight: 500,
                            color: TOKENS.textTer,
                            whiteSpace: "nowrap",
                          }}
                        >
                          +{ocultos} mas · escribe para filtrar
                        </div>
                      )}
                    </>
                  );
                })()}
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

          {/* FormField Servicio.
              El `servicioZoneRef` del recorrido guiado NO va aqui: ver la nota
              en la lista de categorias, mas abajo. */}
          <div style={{ marginBottom: 14 }}>
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

            {(historialClienteServicios.top.length > 0 ||
              historialClienteServicios.last.length > 0) && (
              <div
                style={{
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {historialClienteServicios.last.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: TOKENS.textTer,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      Últimos servicios
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {historialClienteServicios.last.map((sid) => {
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
                              background: sel
                                ? "rgba(244,80,30,0.18)"
                                : TOKENS.bgCard,
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
                        );
                      })}
                    </div>
                  </div>
                )}
                {historialClienteServicios.top.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: TOKENS.textTer,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      Más habituales
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {historialClienteServicios.top.map((sid) => {
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
                              background: sel
                                ? "rgba(244,80,30,0.18)"
                                : TOKENS.bgCard,
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
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {gruposServicio.map((grupo, iGrupo) => (
              // El foco del recorrido para "el servicio trae precio y duracion"
              // va sobre la PRIMERA categoria, no sobre el bloque Servicio
              // entero: ese medía 540x571 y llegaba al borde inferior del marco,
              // asi que ni se entendia que se estaba señalando ni cabia debajo la
              // señal. Aqui se ven las tarjetas con sus "90 min · 52 EUR".
              <div
                key={grupo.key}
                ref={iGrupo === 0 ? (el) => { servicioZoneRef.current = el; } : undefined}
                style={{ marginBottom: 10 }}
              >
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
                          e.currentTarget.style.transform = "translateY(-1px)";
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
            <div
              ref={(el) => {
                addonsZoneRef.current = el as HTMLElement | null;
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
                    e.currentTarget.style.transform = "none";
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
                // Sin las citas del dia no se puede decir que hueco esta libre ni
                // cual cae dentro de un reposo: mejor no pintar horas que pintarlas mal.
                if (!citasHoyListas)
                  return (
                    <div
                      style={{
                        fontSize: 11,
                        color: TOKENS.textTer,
                        padding: "10px 0",
                      }}
                    >
                      Cargando horas disponibles...
                    </div>
                  );
                // Festivo o cierre del salon: ese dia no hay horas que ofrecer.
                if (cierreDelDia)
                  return (
                    <div
                      style={{
                        fontSize: 11,
                        color: TOKENS.textTer,
                        padding: "10px 0",
                      }}
                    >
                      El salon esta cerrado ese dia
                      {cierreDelDia.motivo ? ` (${cierreDelDia.motivo})` : ""}.
                    </div>
                  );
                // La rejilla sale de los turnos REALES del profesional ese dia y solo
                // ofrece horas en las que la cita entera termina dentro del turno. Sin
                // franjas configuradas se cae a la ventana del salon, que es lo que
                // hace tambien validarHorarioLaboral al guardar.
                const franjasParaSlots =
                  franjasHoy.length > 0
                    ? franjasHoy
                    : [
                        {
                          hora_inicio: `${String(HORARIO_APERTURA.horas).padStart(2, "0")}:${String(HORARIO_APERTURA.minutos).padStart(2, "0")}`,
                          hora_fin: `${String(HORARIO_CIERRE.horas).padStart(2, "0")}:${String(HORARIO_CIERRE.minutos).padStart(2, "0")}`,
                        },
                      ];
                const slots = slotsQueCaben(
                  franjasParaSlots,
                  duracionTotal,
                  INTERVALO_MINUTOS,
                );
                if (slots.length === 0)
                  return (
                    <div
                      style={{
                        fontSize: 11,
                        color: TOKENS.textTer,
                        padding: "10px 0",
                      }}
                    >
                      {franjasHoy.length === 0
                        ? "Ese profesional no trabaja ese dia."
                        : `No hay ningun turno donde quepan los ${duracionTotal} min del servicio (${franjasTexto(franjasParaSlots)}).`}
                    </div>
                  );
                // RN-AG-070/071: añadir fin_activa exacto como slot extra si no es múltiplo de 15
                const slotsSet = new Set(slots);
                const extraSlots: string[] = [];
                // Solo las citas VIVAS ofrecen hueco de reposo: el reposo de una
                // cita que ya termino no es un hueco donde encajar nada.
                citasHoyVivas.forEach((c: any) => {
                  if (
                    c.profesional_id !== selectedProf ||
                    !c.fin_activa ||
                    !c.fin_espera
                  )
                    return;
                  const cFinActiva = new Date(c.fin_activa);
                  const cFinEspera = new Date(c.fin_espera);
                  const slotFinActiva = new Date(
                    cFinActiva.getTime() + duracionActiva * 60000,
                  );
                  // Si encaja exacto en el límite, está permitido (<= cFinEspera).
                  if (slotFinActiva > cFinEspera) return;
                  // Y tiene que seguir cabiendo en el turno: el hueco de reposo no es
                  // excusa para que la cita se salga por el final de la jornada.
                  const minutosSlot =
                    cFinActiva.getHours() * 60 + cFinActiva.getMinutes();
                  if (
                    !cabeEnAlgunaFranja(
                      franjasParaSlots,
                      minutosSlot,
                      duracionTotal,
                    )
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
                  const encajaEnReposo = citasHoyVivas.some((c: any) => {
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
                    // La nueva activa debe terminar <= cFinEspera (puede tocar el límite exacto)
                    return (
                      slotInicio >= cFinActiva && slotFinActiva <= cFinEspera
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
                        const inicioFase2 = new Date(
                          testInicio.getTime() +
                            (duracionActiva + duracionEspera) * 60000,
                        );
                        const testFin = new Date(
                          testInicio.getTime() + duracionTotal * 60000,
                        );
                        // Choque con lo que sigue vivo (pendiente/confirmada):
                        // esas horas ni se ensenan.
                        const pisaViva =
                          isTimeSlotOccupied(
                            testInicio,
                            testFinActiva,
                            citasHoyVivas,
                            selectedProf,
                          ) ||
                          (duracionActivaExtra > 0 &&
                            isTimeSlotOccupied(
                              inicioFase2,
                              testFin,
                              citasHoyVivas,
                              selectedProf,
                            ));
                        // Choque solo con una cita ya TERMINADA: se ensena, pero
                        // marcada y sin poder elegirla. Asi se ve que ese rato la
                        // profesional estuvo trabajando, en vez de que la hora
                        // desaparezca sin explicacion.
                        const pisaTerminada =
                          !pisaViva &&
                          (isTimeSlotOccupied(
                            testInicio,
                            testFinActiva,
                            citasHoy,
                            selectedProf,
                          ) ||
                            (duracionActivaExtra > 0 &&
                              isTimeSlotOccupied(
                                inicioFase2,
                                testFin,
                                citasHoy,
                                selectedProf,
                              )));
                        const blockedByAusencia = bloqueosProfHoy.some(
                          (b: any) =>
                            new Date(b.inicio) < testFin &&
                            new Date(b.fin) > testInicio,
                        );

                        if (pisaViva || blockedByAusencia) return null;

                        // Resaltar en naranja tambien el hueco prellenado al clicar en la rejilla
                        const selected =
                          (selectedHora === time && !horaPersonalizada) ||
                          (useCustomHora && horaPersonalizada === time);
                        const esReposo = reposaSlots.has(time);

                        if (pisaTerminada)
                          return (
                            <button
                              key={time}
                              data-slot={time}
                              data-reposo="0"
                              data-terminada="1"
                              disabled
                              title="La profesional ya atendio una cita a esa hora"
                              style={{
                                width: "100%",
                                padding: "5px 0 4px",
                                borderRadius: 8,
                                background: "rgba(148,163,184,0.06)",
                                border: `1px dashed ${TOKENS.border}`,
                                color: TOKENS.textTer,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "not-allowed",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <span style={{ textDecoration: "line-through" }}>
                                {time}
                              </span>
                              <span
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  letterSpacing: 0.4,
                                  color: TOKENS.textTer,
                                }}
                              >
                                terminada
                              </span>
                            </button>
                          );

                        return (
                          <button
                            key={time}
                            data-slot={time}
                            data-reposo={esReposo ? "1" : "0"}
                            data-sel={selected ? "1" : "0"}
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
                              e.currentTarget.style.transform =
                                "translateY(-1px)";
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

          {/* RN-AG-072: info banner cuando la hora cae en un reposo */}
          {avisoRecurso && (
            <div
              style={{
                padding: "10px 12px",
                background: "rgba(224,138,0,0.10)",
                border: "1px solid rgba(224,138,0,0.28)",
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
                  background: "#e08a00",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: "#a86800", lineHeight: "1.4", fontWeight: 600 }}>
                {avisoRecurso.mensaje} Puedes seguir: es un aviso, no un bloqueo.
              </span>
            </div>
          )}
          {citaHostReposo && horaActual && (() => {
            const cFinActiva = new Date(citaHostReposo.fin_activa);
            const cFinEspera = new Date(citaHostReposo.fin_espera);
            const durReposoMin = Math.round(
              (cFinEspera.getTime() - cFinActiva.getTime()) / 60000,
            );
            const hostCli =
              clientes.find((cl: any) => cl.id === citaHostReposo.cliente_id)
                ?.nombre || "otra cita";
            const cabe = finActiva
              ? finActiva.getTime() <= cFinEspera.getTime() + 2 * 60000
              : true;

            if (cabe) {
              return (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.25)",
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
                      background: "#10b981",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      color: "#059669",
                      lineHeight: "1.4",
                      fontWeight: 600,
                    }}
                  >
                    Esta hora aprovecha el tiempo de reposo de {hostCli} ({durReposoMin} min). El profesional atenderá este servicio mientras la cita anterior reposa.
                  </span>
                </div>
              );
            }

            return (
              <div
                style={{
                  padding: "10px 12px",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.3)",
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
                  style={{
                    fontSize: 11,
                    color: "#b45309",
                    lineHeight: "1.4",
                    fontWeight: 600,
                  }}
                >
                  Aviso: Este servicio ({duracionTotal} min) supera el tiempo de reposo de {hostCli} ({durReposoMin} min). Se organizará en carril paralelo al terminar el reposo.
                </span>
              </div>
            );
          })()}

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
                background: "rgba(226,59,52,0.12)",
                border: `1px solid rgba(226,59,52,0.3)`,
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
                  ref={(el) => {
                    encadenarZoneRef.current = el as HTMLElement | null;
                  }}
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
                    e.currentTarget.style.transform = "translateY(-1px)";
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
  return typeof document !== "undefined"
    ? createPortal(contenido, document.body)
    : contenido;
}
