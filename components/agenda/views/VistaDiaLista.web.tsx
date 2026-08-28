// Vista de dia en LISTA: la alternativa a la rejilla, pensada para movil.
// Pinta las citas del dia en orden y rellena los huecos de 15 min o mas con un
// boton para crear cita en ese hueco.
//
// Sale de AgendaCalendar.web.tsx (Fase 5, paso 2). CitaEstadoBadge viaja con
// ella a proposito: es su unico consumidor, y separarlos solo crearia un import
// cruzado entre dos ficheros nuevos.
//
// No comparte nada con la rejilla (views/timeline/): no conoce el arrastre, ni
// las lanes, ni las fases. Solo lee las citas ya preparadas.
//
// MUDANZA, NO REESCRITURA: el cuerpo de las dos es identico al que tenian.
import { useMemo } from "react";
import { HORARIO_APERTURA, HORARIO_CIERRE } from "@/lib/constants";
import { metaEstadoCita } from "@/lib/citasEstadoUi";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";

export function CitaEstadoBadge({ estado }: { estado: string }) {
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

export function DayListView({
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
