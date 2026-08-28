// Vistas de semana y mes de la agenda, extraidas tal cual del monolito
// AgendaCalendar.web.tsx (Fase 5 del plan maestro). Mismo comportamiento,
// mismas props: la unica diferencia es que ahora viven en su modulo propio.
// La vista de dia (rejilla con drag & drop) NO esta aqui: esa depende de la
// fisica del arrastre y se queda en el calendario.
import { useMemo } from "react";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { useResponsive } from "@/lib/hooks/useResponsive";
import { categoryColorHex } from "@/lib/categoryColors";
import { metaEstadoCita } from "@/lib/citasEstadoUi";
import { bloqueDeCita, BLOQUEO_COLORS, BLOQUEO_LABELS } from "@/lib/agendaBloqueUi";
import { Icon } from "../ui/Icon.web";

export function WeekView({
  citas,
  bloqueos = [],
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
      if (filterEstado === "cobradas" && !c.cobrada) return;
      if (
        filterEstado === "sin_cobrar" &&
        (c.cobrada || c.estado === "cancelada")
      )
        return;
      if (
        filterEstado !== "todos" &&
        filterEstado !== "cobradas" &&
        filterEstado !== "sin_cobrar" &&
        c.estado !== filterEstado
      )
        return;
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
          // Descansos/bloqueos del dia (mismo solape que usa la rejilla
          // diaria): un bloqueo que abarca varios dias aparece cada dia.
          const dayStartW = new Date(d);
          dayStartW.setHours(0, 0, 0, 0);
          const dayEndW = new Date(d);
          dayEndW.setHours(23, 59, 59, 999);
          const dayBloqueos = (bloqueos as any[])
            .filter(
              (b: any) =>
                (selectedProf === "todos" ||
                  b.profesional_id === selectedProf) &&
                new Date(b.inicio) <= dayEndW &&
                new Date(b.fin) >= dayStartW,
            )
            .slice()
            .sort(
              (a: any, b: any) =>
                new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
            );
          // Citas y bloqueos intercalados por hora, para que un descanso
          // no quede "escondido" al final de la columna del dia.
          const dayItems = [
            ...dayCitas.map((c: any) => ({
              kind: "cita" as const,
              inicio: c.inicio,
              c,
            })),
            ...dayBloqueos.map((b: any) => ({
              kind: "bloqueo" as const,
              inicio: b.inicio,
              b,
            })),
          ].sort(
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
                {dayItems.length === 0 ? (
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
                  dayItems.map((item: any) => {
                    // Tarjeta de descanso/bloqueo: misma franja rayada que la
                    // rejilla diaria, adaptada a lista. No es interactiva.
                    if (item.kind === "bloqueo") {
                      const b = item.b;
                      const profBlq = profesionales.find(
                        (p: any) => p.id === b.profesional_id,
                      );
                      const blqColor = BLOQUEO_COLORS[b.tipo] || "#94a3b8";
                      const hIni = new Date(b.inicio).toLocaleTimeString(
                        "es-ES",
                        { hour: "2-digit", minute: "2-digit" },
                      );
                      const hFin = new Date(b.fin).toLocaleTimeString(
                        "es-ES",
                        { hour: "2-digit", minute: "2-digit" },
                      );
                      return (
                        <div
                          key={`blq-${b.id}`}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 8,
                            background: `repeating-linear-gradient(45deg, ${blqColor}14, ${blqColor}14 4px, transparent 4px, transparent 10px)`,
                            backgroundColor: `${blqColor}0a`,
                            border: `1px solid ${TOKENS.border}`,
                            borderLeft: `3.5px solid ${blqColor}99`,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            overflow: "hidden",
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
                              {hIni}–{hFin}
                            </span>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: blqColor,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {BLOQUEO_LABELS[b.tipo] || b.tipo}
                            </span>
                          </div>
                          {(profBlq?.nombre || b.motivo) && (
                            <div
                              style={{
                                fontSize: 10,
                                color: TOKENS.textTer,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {[profBlq?.nombre, b.motivo]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </div>
                      );
                    }
                    const c = item.c;
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
                    const cancel = c.estado === "cancelada";
                    // Misma ley que la rejilla de dia (lib/agendaBloqueUi.ts):
                    // el color del bloque lo decide el estado y solo el estado.
                    // Aqui convivian cuatro fondos distintos, un borde del color
                    // de la categoria y dos insignias sueltas — y un no-show
                    // salia ambar, que es el color de "te falta algo".
                    const bloque = bloqueDeCita(c, Date.now());
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
                          backgroundColor: TOKENS.bgCard,
                          backgroundImage: `linear-gradient(${bloque.fondo}, ${bloque.fondo})`,
                          border: `1px solid ${bloque.borde}`,
                          borderLeft: `3.5px solid ${bloque.acento ?? bloque.borde}`,
                          opacity: bloque.atenuado ? 0.6 : 1,
                          transition: "box-shadow 0.12s ease, filter 0.12s ease",
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          overflow: "hidden",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.filter = "brightness(1.03)";
                          e.currentTarget.style.boxShadow =
                            "0 4px 12px rgba(28,24,20,0.12)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.filter = "";
                          e.currentTarget.style.boxShadow = "none";
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
                              // Sin esto el grupo encogia pero sus hijos no, y
                              // el icono de categoria se metia por debajo del
                              // chip de estado en una tarjeta de 180px.
                              overflow: "hidden",
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
                            {/* Categoria del servicio: solo el punto. El icono
                                decia lo mismo y en esta tarjeta no hay ancho
                                para las dos cosas mas el chip de estado. */}
                            <span
                              title={catName || undefined}
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                background: acentoColor,
                                flexShrink: 0,
                              }}
                            />
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                              flexShrink: 0,
                            }}
                          >
                            {/* Un solo chip, el del estado. Antes habia dos
                                insignias y ademas un punto verde repitiendo
                                "cobrada" por tercera vez. */}
                            {!!bloque.label && !!bloque.chipBg && (
                              <span
                                title={bloque.label}
                                style={{
                                  fontSize: 8.5,
                                  fontWeight: 800,
                                  background: bloque.chipBg,
                                  color: bloque.acentoTexto || TOKENS.textSec,
                                  padding: "1px 6px",
                                  borderRadius: 999,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  lineHeight: 1.4,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {bloque.label}
                              </span>
                            )}
                          </div>
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
                            {/* Habia aqui un check verde para c.estado ===
                                "Confirmada" con mayuscula: los estados van en
                                minuscula, asi que no se pintaba nunca. Y si se
                                pintara, seria el estado dicho dos veces. */}
                            {cli?.tag === "VIP" && (
                              <Icon
                                name="star"
                                size={10}
                                color={TOKENS.warning}
                              />
                            )}
                            {cli?.tag === "Habitual" && (
                              <Icon
                                name="star"
                                size={10}
                                color={TOKENS.primary}
                              />
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
                              textDecoration: cancel
                                ? "line-through"
                                : "underline",
                              textDecorationColor: cancel
                                ? "inherit"
                                : "rgba(244,80,30,0.4)",
                              textUnderlineOffset: 2,
                              minWidth: 0,
                            }}
                          >
                            {dayCitas.length > 5
                              ? iniciales || "?"
                              : cli?.nombre || "Sin cliente"}
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
export function MonthView({
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
  cierres = [],
}: any) {
  const { isMobile } = useResponsive();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  // Color de cada profesional, para que los puntos de cada dia digan TAMBIEN
  // de quien son las citas y no solo cuantas hay.
  const colorProf = useMemo(() => {
    const m: Record<string, string> = {};
    (profesionales || []).forEach((p: any) => {
      m[p.id] = p.color || TOKENS.primary;
    });
    return m;
  }, [profesionales]);

  // Orden de los profesionales, para agrupar los puntos por persona: los del
  // mismo color quedan juntos y de un vistazo se ve quien carga con el dia.
  const ordenProf = useMemo(() => {
    const m: Record<string, number> = {};
    (profesionales || []).forEach((p: any, i: number) => {
      m[p.id] = i;
    });
    return m;
  }, [profesionales]);

  // Cierres REALES del salon (tabla cierres_negocio: festivos, vacaciones, dias
  // sueltos), por dia del mes. Antes aqui habia cinco festivos escritos a mano
  // (Navidad, Reyes...) que salian igual para todos los salones aunque ese dia
  // trabajaran, y no se veian los cierres que el salon si habia configurado.
  const cierrePorDia = useMemo(() => {
    const m: Record<number, string | null> = {};
    (cierres || []).forEach((c: any) => {
      if (!c?.fecha) return;
      const [y, mm, dd] = String(c.fecha).split("-").map(Number);
      if (y === year && mm === month + 1) m[dd] = c.motivo || null;
    });
    return m;
  }, [cierres, year, month]);

  // Cumpleaños REALES de la clientela ese mes (antes ponia "Cumpleaños Cliente"
  // el dia 15 de todos los meses, fuese cierto o no).
  const cumplesPorDia = useMemo(() => {
    const m: Record<number, string[]> = {};
    (clientes || []).forEach((cl: any) => {
      if (!cl?.fecha_nacimiento) return;
      const fn = new Date(cl.fecha_nacimiento);
      if (isNaN(fn.getTime()) || fn.getMonth() !== month) return;
      const d = fn.getDate();
      if (!m[d]) m[d] = [];
      m[d].push(cl.nombre || "Clienta");
    });
    return m;
  }, [clientes, month]);

  const filteredCitas = useMemo(() => {
    return citas.filter((c: any) => {
      if (selectedProf !== "todos" && c.profesional_id !== selectedProf)
        return false;
      if (filterServicio !== "todos" && c.servicio_id !== filterServicio)
        return false;
      if (filterEstado === "cobradas" && !c.cobrada) return false;
      if (
        filterEstado === "sin_cobrar" &&
        (c.cobrada || c.estado === "cancelada")
      )
        return false;
      if (
        filterEstado !== "todos" &&
        filterEstado !== "cobradas" &&
        filterEstado !== "sin_cobrar" &&
        c.estado !== filterEstado
      )
        return false;
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

  // Cuanta gente cubre el dia segun el filtro activo: es el divisor con el que
  // se decide si un dia esta lleno (verde / ambar / rojo).
  const maxCitasDia = useMemo(() => {
    const cuantos =
      selectedProf === "todos" ? Math.max(1, (profesionales || []).length) : 1;
    return 8 * cuantos;
  }, [selectedProf, profesionales]);

  const todayDate = new Date();
  const isCurrentMonth =
    todayDate.getMonth() === month && todayDate.getFullYear() === year;
  const DAY_NAMES = ["L", "M", "X", "J", "V", "S", "D"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  // La celda tiene que dar para varias filas de puntos sin recortarlos.
  const cellMinH = isMobile ? 66 : 108;
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

          // Cierre del salon: primero el que el salon ha configurado de verdad
          // (cierres_negocio) y, si no, unas vacaciones puestas como bloqueo.
          const cerradoPorCierre = Object.prototype.hasOwnProperty.call(
            cierrePorDia,
            d,
          );
          const festivo = cerradoPorCierre
            ? cierrePorDia[d] || "Cerrado"
            : null;
          const cumplesDia = cumplesPorDia[d] || [];
          const birthday = cumplesDia.length
            ? cumplesDia.length === 1
              ? cumplesDia[0]
              : `${cumplesDia.length} cumpleaños`
            : null;

          const isClosed =
            cerradoPorCierre ||
            (bloqueos || []).some((b: any) => {
              const bDate = new Date(b.inicio || b.dia);
              return (
                b.tipo === "vacaciones" &&
                bDate.getFullYear() === year &&
                bDate.getMonth() === month &&
                bDate.getDate() === d
              );
            });

          // "Dia lleno" depende de cuanta gente trabaja: 12 citas son una
          // barbaridad para una persona y poca cosa para un equipo de cuatro.
          // Antes el umbral era 15 fijo, asi que en "Todos" casi ningun dia
          // llegaba a rojo y en un salon de una persona casi todos lo eran.
          const ratio = Math.min(1, total / maxCitasDia);
          let satColor = TOKENS.success;
          if (ratio > 0.5) satColor = TOKENS.warning;
          if (ratio > 0.8) satColor = TOKENS.danger;

          // Un punto por cita, agrupados por profesional y repartidos en varias
          // filas: asi el hueco de la celda se aprovecha entero y el volumen del
          // dia se lee de un vistazo. Antes cabian 12 en una linea y a partir de
          // ahi solo ponia un "+", con lo que 16 y 40 citas se veian igual.
          const puntos = dayCitas.slice().sort((a: any, b: any) => {
            const oa = ordenProf[a.profesional_id] ?? 99;
            const ob = ordenProf[b.profesional_id] ?? 99;
            if (oa !== ob) return oa - ob;
            return new Date(a.inicio).getTime() - new Date(b.inicio).getTime();
          });
          const MAX_PUNTOS = isMobile ? 9 : 30;
          const puntosVisibles = puntos.slice(0, MAX_PUNTOS);
          const puntosOcultos = total - puntosVisibles.length;

          // Si todas las citas del dia son del MISMO profesional (siempre en
          // movil, que arranca con uno solo elegido, y en cualquier salon de una
          // persona), pintarlas de su color no dice nada: todos los dias del mes
          // salian identicos. En ese caso los puntos pasan a decir carga de
          // trabajo (verde / ambar / rojo), que es lo que se busca de un vistazo.
          // Con varios profesionales manda el color de cada uno, que si informa.
          const profsDelDia = new Set(
            dayCitas.map((c: any) => c.profesional_id ?? "sin"),
          );
          const puntosPorCarga = profsDelDia.size < 2;

          return (
            <div
              key={i}
              onClick={(e) => {
                if ((e.target as any).closest(".m-birthday-link")) {
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
                opacity: isClosed ? 0.6 : 1,
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
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: 0,
                    width: "100%",
                    height: 2,
                    background: TOKENS.textSec,
                    opacity: 0.5,
                    transform: "translateY(-50%)",
                  }}
                />
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
                          color: isClosed
                            ? TOKENS.textTer
                            : weekendCol
                              ? TOKENS.textSec
                              : TOKENS.text,
                          textDecoration: isClosed ? "line-through" : "none",
                        }
                  }
                >
                  {d}
                </span>
                {!isMobile && festivo && (
                  <span
                    style={{
                      fontSize: 9,
                      color: TOKENS.danger,
                      fontWeight: 700,
                      padding: "2px 4px",
                      background: "rgba(226,59,52,0.1)",
                      borderRadius: 6,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "65%",
                    }}
                    title={festivo}
                  >
                    {festivo}
                  </span>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {!isMobile && birthday && (
                  <div
                    className="m-birthday-link"
                    title={`Cumpleaños: ${cumplesDia.join(", ")}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      background: "rgba(139,92,246,0.1)",
                      padding: "2px 4px",
                      borderRadius: 4,
                      color: "#8b5cf6",
                      maxWidth: "90%",
                    }}
                  >
                    <Icon
                      name="gift"
                      size={10}
                      color="#8b5cf6"
                      style={{ flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {birthday}
                    </span>
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
                      // El color dice como de lleno esta el dia (verde/ambar/rojo),
                      // relativo a cuanta gente trabaja segun el filtro.
                      color: satColor,
                    }}
                  >
                    {total} cita{total !== 1 && "s"}
                  </span>
                )}
              </div>

              {total > 0 && !isClosed && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: isMobile ? 3 : 4,
                    marginTop: 4,
                  }}
                  title={
                    puntosPorCarga
                      ? `${total} cita${total !== 1 ? "s" : ""} · el color dice como de lleno esta el dia`
                      : `${total} cita${total !== 1 ? "s" : ""} · un punto por cita, agrupados por profesional`
                  }
                >
                  {puntosVisibles.map((c: any, idx: number) => (
                    <div
                      key={c.id ?? idx}
                      style={{
                        width: isMobile ? 5 : 6,
                        height: isMobile ? 5 : 6,
                        background: puntosPorCarga
                          ? satColor
                          : colorProf[c.profesional_id] || satColor,
                        borderRadius: "50%",
                        opacity: 0.9,
                        flexShrink: 0,
                      }}
                    />
                  ))}
                  {puntosOcultos > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: TOKENS.textSec,
                        lineHeight: `${isMobile ? 5 : 6}px`,
                      }}
                    >
                      +{puntosOcultos}
                    </span>
                  )}
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
export function ClienteHistorialModal({
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

  // Mismo lenguaje de color que el badge y el detalle (lib/citasEstadoUi).

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
            className="m-btn-icon m-btn-icon-close"
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
              background: "rgba(226,59,52,0.08)",
              borderRadius: 8,
              fontSize: 11,
              color: "#e23b34",
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
            // Antes el fallback era el color de "confirmada", asi que un estado
            // sin color propio (p.ej. pendiente) se pintaba como confirmado.
            const est = metaEstadoCita(c.estado);
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
                    background: est.soft,
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

