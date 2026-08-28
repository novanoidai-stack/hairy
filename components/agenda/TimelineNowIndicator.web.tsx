import React, { useState, useEffect, memo } from "react";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { HORARIO_APERTURA } from "@/lib/constants";

export interface TimelineNowIndicatorProps {
  selectedDate?: Date | string | null;
  startHour?: number;
  rowHeight?: number;
  totalHours?: number;
  left?: number;
  right?: number;
  zIndex?: number;
}

/**
 * Indicador visual aislado de la hora actual ("AHORA") en el timeline diario.
 * Mantiene su propio estado `now` y ciclo `setInterval` de 30s para actualizar
 * la posición y el reloj en el gutter sin provocar re-renders del grid de fondo,
 * columnas ni tarjetas de citas.
 */
export const TimelineNowIndicator = memo(function TimelineNowIndicator({
  selectedDate,
  startHour = HORARIO_APERTURA.horas,
  rowHeight = 160,
  totalHours = 14,
  left = 56,
  right = 0,
  zIndex = 60,
}: TimelineNowIndicatorProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const isSelectedDateToday = (() => {
    if (!selectedDate) return true;
    const sel =
      typeof selectedDate === "string" ? new Date(selectedDate) : selectedDate;
    if (!(sel instanceof Date) || isNaN(sel.getTime())) return false;
    return (
      sel.getFullYear() === now.getFullYear() &&
      sel.getMonth() === now.getMonth() &&
      sel.getDate() === now.getDate()
    );
  })();

  const currentHour = now.getHours();
  const isWithinHours =
    currentHour >= startHour && currentHour < startHour + totalHours;

  if (!isSelectedDateToday || !isWithinHours) {
    return null;
  }

  const top =
    (now.getHours() - startHour + now.getMinutes() / 60) * rowHeight;
  const horaStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      // Gancho para tests de caracterizacion (tests/agenda-demo.spec.ts). Es un
      // atributo, no entra en ninguna decision de render. La hora va en el valor
      // para poder comprobar que el indicador se coloca donde toca sin depender
      // de estilos ni de la posicion en pixeles.
      data-mecha-ahora={horaStr}
      style={{
        position: "absolute",
        left,
        right,
        top,
        height: 0,
        borderTop: `2px dashed ${TOKENS.danger}`,
        pointerEvents: "none",
        zIndex,
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
        {horaStr}
      </div>
    </div>
  );
});

export default TimelineNowIndicator;
