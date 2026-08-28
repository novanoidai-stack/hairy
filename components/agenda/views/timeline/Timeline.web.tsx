// La rejilla del dia: la cuadricula de horas por profesional, con sus columnas,
// la linea de AHORA y el solape de cadenas encima.
//
// Sale de AgendaCalendar.web.tsx (Fase 5, paso 5, el ultimo). Es la cuspide de
// la cadena: Timeline -> ProfessionalColumn -> AppointmentCard -> ReposoFreeGap,
// por eso se extrae la ultima.
//
// LO QUE NO ESTA AQUI, Y NO DEBE ESTARLO: la fisica del arrastre (startDrag,
// onMove, onUp, el fantasma, el rAF, gridRect) se queda en el orquestador. Esta
// medida y funciona; moverla exige antes mas E2E que la congelen.
//
// hexToRgba viaja con la rejilla porque solo la usa ella: los degradados de
// fondo por profesional.
//
// MUDANZA, NO REESCRITURA: el cuerpo es identico al que tenia.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NEGOCIO_ID_FALLBACK,
  HORARIO_APERTURA,
  HORARIO_CIERRE,
  CITA_STATUS,
  CITA_STATUS_BLOQUEAN_SOLAPE,
  sinCarrilPropio,
} from "@/lib/constants";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { supabase } from "@/lib/supabase";
import { getUserProfile } from "@/lib/auth";
import { BLOQUEO_LABELS } from "@/lib/agendaBloqueUi";
import { isTimeSlotOccupied } from "@/lib/utils/appointment";
import { pisaOtraCitaAlSoltar } from "@/lib/agenda/solapeAlSoltar";
import {
  eslabonesParaOperar,
  estaEnCadenaVisible,
} from "@/lib/agenda/cadena";
import { mejorAlternativaSlot, type CitaRetraso } from "@/lib/retrasos";
import { snapshotDe } from "@/lib/agendaUndo";
import { useResponsive } from "@/lib/hooks/useResponsive";
import { useCalendarRefresh } from "@/lib/calendarContext";
import { ChispaMascota } from "@/components/chispa/ChispaMascota.web";
import { ChainFlowOverlay, CHAIN_GUTTER } from "../../ChainFlowOverlay.web";
import { TimelineNowIndicator } from "../../TimelineNowIndicator.web";
import { DayTimelineProfessionalColumn } from "./ProfessionalColumn.web";

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


// Memoizado: no re-renderiza la agenda entera cuando el padre cambia estado
// no relacionado (abrir modales, hover, etc.). Sus props ya son estables
// (useMemo en maps/filtered + useCallback en las callbacks).
export const DayTimelineMemo = memo(DayTimeline);

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
