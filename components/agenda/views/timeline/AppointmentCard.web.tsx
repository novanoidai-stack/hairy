// La tarjeta de una cita dentro de la rejilla del dia, y el hueco de reposo
// interactivo que pinta dentro de si misma.
//
// Sale de AgendaCalendar.web.tsx (Fase 5, paso 3). Los tres bloques viajan
// juntos porque forman una unidad:
//   - ReposoFreeGapInteractive vivia al principio del fichero, a 7.000 lineas
//     de distancia, pero su unico consumidor es esta tarjeta.
//   - areCardPropsEqual es el comparador del memo de la tarjeta; separarlo no
//     tiene sentido.
//
// OJO CON EL MEMO: areCardPropsEqual es lo que impide que arrastrar una cita
// repinte la agenda entera. tests/agenda-demo.spec.ts congela ese coste
// (8 nodos mutados, 0 remontajes). Si se toca la lista de props comparadas,
// esa prueba es la que avisa.
//
// MUDANZA, NO REESCRITURA: los cuerpos son identicos a los que tenian.
import { memo, useEffect, useState } from "react";
import { CITA_STATUS, LOCALE } from "@/lib/constants";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import {
  bloqueDeCita,
  progresoCita,
  minutosRestantes,
} from "@/lib/agendaBloqueUi";
import { categoryColorHex } from "@/lib/categoryColors";
import { eslabonesParaPintar } from "@/lib/agenda/cadena";
import { CHAIN_GUTTER } from "../../ChainFlowOverlay.web";
import { fmtHHMM } from "../../ui/atomos.web";

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

  // Spec 4: Reloj de reposo en vivo (detección de temporizador de cabina)
  const fasesLista = (cita.cita_fases || cita.fases || []) as any[];
  const faseReposoEnCurso = fasesLista.find(
    (f) => f.tipo === "reposo" && f.iniciada_at && !f.cerrada_at,
  );
  const planReposoMs = faseReposoEnCurso
    ? new Date(faseReposoEnCurso.fin).getTime() -
      new Date(faseReposoEnCurso.inicio).getTime()
    : 0;
  const elapsedReposoMs = faseReposoEnCurso
    ? nowTick - new Date(faseReposoEnCurso.iniciada_at).getTime()
    : 0;
  const remainReposoMin = faseReposoEnCurso
    ? Math.round((planReposoMs - elapsedReposoMs) / 60000)
    : 0;
  const reposoPasado = faseReposoEnCurso && remainReposoMin < 0;

  const relojReposoChip = faseReposoEnCurso ? (
    <span
      title={
        reposoPasado
          ? `¡Tinte pasado de tiempo por ${Math.abs(remainReposoMin)} minutos!`
          : `Reposo en cabina: ${remainReposoMin}′ restantes`
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "1.5px 6px",
        borderRadius: 999,
        background: reposoPasado
          ? "rgba(239,68,68,0.22)"
          : "rgba(245,158,11,0.20)",
        color: reposoPasado ? "#dc2626" : "#b45309",
        fontSize: 9,
        fontWeight: 800,
        border: reposoPasado
          ? "1px solid rgba(239,68,68,0.50)"
          : "1px solid rgba(245,158,11,0.40)",
        animation: reposoPasado ? "pulse 1s infinite" : "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {reposoPasado ? `⚠️ +${Math.abs(remainReposoMin)}′` : `⏱️ ${remainReposoMin}′`}
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

      {!cancelada &&
        (() => {
          const fasesList = (cita.cita_fases || cita.fases || []) as any[];
          const repososList = fasesList.filter((f) => f.tipo === "reposo");
          const msToPx = (ms: number) => (ms / 3600000) * ROW_H;

          // Si hay fases estructuradas (Spec 1: múltiples reposos)
          if (repososList.length > 0) {
            return (
              <>
                {repososList.map((rep, rIdx) => {
                  const rIniMs = new Date(rep.inicio).getTime();
                  const rFinMs = new Date(rep.fin).getTime();
                  const rTopPx = msToPx(rIniMs - start.getTime());
                  const rHeightPx = msToPx(rFinMs - rIniMs);
                  if (rHeightPx <= 2) return null;

                  const ocupados = profCitas
                    .filter(
                      (c: any) =>
                        c._hostId === cita.id &&
                        c.estado !== CITA_STATUS.CANCELADA,
                    )
                    .map(
                      (c: any) =>
                        [
                          new Date(c.inicio).getTime(),
                          new Date(c.fin).getTime(),
                        ] as [number, number],
                    )
                    .sort(
                      (a: [number, number], b: [number, number]) =>
                        a[0] - b[0],
                    );
                  const libres: [number, number][] = [];
                  let cursor = rIniMs;
                  for (const [ini, fin] of ocupados) {
                    if (ini > cursor)
                      libres.push([cursor, Math.min(ini, rFinMs)]);
                    cursor = Math.max(cursor, fin);
                  }
                  if (cursor < rFinMs) libres.push([cursor, rFinMs]);

                  return (
                    <div
                      key={`reposo_${rIdx}_${rep.id || rIdx}`}
                      title={`Reposo (${rep.etiqueta || "Técnico"}): el producto actúa solo y el profesional queda libre`}
                      style={{
                        position: "absolute",
                        top: rTopPx,
                        left: 0,
                        right: 0,
                        height: rHeightPx,
                        pointerEvents: "auto",
                        zIndex: 4,
                        background:
                          "repeating-linear-gradient(135deg, rgba(115,102,88,0.13) 0px, rgba(115,102,88,0.13) 5px, rgba(255,253,251,0.60) 5px, rgba(255,253,251,0.60) 11px)",
                        borderTop: "1.5px dashed rgba(115,102,88,0.40)",
                        borderBottom: "1.5px dashed rgba(115,102,88,0.40)",
                        overflow: "hidden",
                      }}
                    >
                      {libres.map(([ini, fin], i) => {
                        const gapMin = Math.round((fin - ini) / 60000);
                        if (gapMin < 5) return null;
                        const gapTop = msToPx(ini - rIniMs);
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
                            onSelectReposo={({
                              horaStr,
                              profId,
                              reposoContext,
                            }) => {
                              if (onCreateSlot) {
                                onCreateSlot({
                                  hora: horaStr,
                                  profId,
                                  reposoContext,
                                });
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </>
            );
          }

          // Fallback clásico cuando no hay lista explícita de cita_fases
          if (!hasEspera) return null;
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
                {relojReposoChip}
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
