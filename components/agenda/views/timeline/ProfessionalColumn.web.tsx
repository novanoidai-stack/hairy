// Una columna de la rejilla del dia: la de un profesional. Pinta su fondo, sus
// franjas de horario y bloqueos, y dentro las tarjetas de sus citas.
//
// Sale de AgendaCalendar.web.tsx (Fase 5, paso 4). Se extrae DESPUES de la
// tarjeta porque la usa: el orden no es libre, lo que se usa va primero.
//
// Igual que la tarjeta, va envuelta en memo: es la otra barrera que impide que
// arrastrar una cita repinte la agenda entera.
//
// MUDANZA, NO REESCRITURA: el cuerpo es identico al que tenia.
import { memo } from "react";
import { HORARIO_CIERRE } from "@/lib/constants";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { BLOQUEO_COLORS, BLOQUEO_LABELS } from "@/lib/agendaBloqueUi";
import type { ProblemaAgenda } from "@/lib/organizarAgenda";
import { DayTimelineAppointmentCard } from "./AppointmentCard.web";

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
