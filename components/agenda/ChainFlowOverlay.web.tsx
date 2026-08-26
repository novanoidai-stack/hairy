import React, { memo, useEffect, useRef, useState } from "react";
import { CITA_STATUS } from "@/lib/constants";

/**
 * Cadenas de citas (grupo_id) — el riel exterior.
 *
 * Una cadena es una RELACION entre citas, no un estado. Por eso NO tine (ni
 * toca) el
 * bloque (el color del bloque lo decide solo el estado, ver lib/agendaBloqueUi)
 * y se dibuja fuera, en el carril que los bloques encadenados dejan libre a su
 * izquierda:
 *
 *   riel vertical continuo por cada eslabon, en carbon calido
 *   nodos: inicio (circulo lleno con flecha), continuacion (anillo), fin (cuadrado)
 *   cable curvo cuando la cadena salta de un profesional a otro, con un punto
 *   viajero dorado que recorre el trayecto
 *
 * El carril lo reserva la propia tarjeta desplazandose CHAIN_GUTTER px a la
 * derecha; por eso las dos constantes viven aqui y las importa AgendaCalendar.
 * Si se cambian sin tocar la otra, el riel se dibuja encima del texto.
 */

/** Centro del riel, en px desde el borde izquierdo del carril de la cita. */
export const CHAIN_RAIL_X = 6;
/** Hueco que reserva a su izquierda una cita encadenada. */
export const CHAIN_GUTTER = 18;

interface ChainFlowOverlayProps {
  /** Citas del dia ya repartidas en carriles (_lane / _totalLanes). */
  citas: any[];
  /** Profesionales en el orden de columnas de la rejilla. */
  profesionales: any[];
  START_H: number;
  ROW_H: number;
  height: number;
}

interface RailItem {
  x: number;
  top: number;
  height: number;
}

interface NodeItem {
  x: number;
  y: number;
  type: "start" | "mid" | "end";
}

interface CableItem {
  path: string;
}

export const ChainFlowOverlay = memo(function ChainFlowOverlay({
  citas,
  profesionales,
  START_H,
  ROW_H,
  height,
}: ChainFlowOverlayProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width > 0) {
          setWidth(e.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = Math.max(1, profesionales.length);
  const colW = width > 0 ? width / n : 0;

  // El riel arranca en el carril de la cita, no en el de la columna: una cita
  // encadenada puede estar en el segundo carril si se solapa con otra.
  const xDeCita = (c: any) => {
    const idx = profesionales.findIndex((p: any) => p.id === c.profesional_id);
    const lane = c._lane ?? 0;
    const total = c._totalLanes ?? 1;
    return (idx < 0 ? 0 : idx) * colW + (lane / total) * colW + CHAIN_RAIL_X;
  };

  const yOf = (iso: string) => {
    const d = new Date(iso);
    return (d.getHours() + d.getMinutes() / 60 - START_H) * ROW_H;
  };

  const grupos = new Map<string, any[]>();
  for (const c of citas) {
    // Un eslabon cancelado sale de la cadena: la linea tiene que unir lo que
    // de verdad va a pasar, no dibujar un tramo hacia una cita muerta.
    if (!c.grupo_id || c.estado === CITA_STATUS.CANCELADA) continue;
    const arr = grupos.get(c.grupo_id) || [];
    arr.push(c);
    grupos.set(c.grupo_id, arr);
  }

  const rails: RailItem[] = [];
  const nodes: NodeItem[] = [];
  const cables: CableItem[] = [];

  if (colW > 0) {
    for (const [, bloques] of grupos) {
      if (bloques.length < 2) continue;

      const sorted = [...bloques].sort(
        (a, b) =>
          (a.orden_en_grupo ?? 0) - (b.orden_en_grupo ?? 0) ||
          new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
      );

      for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i];
        const x = xDeCita(c);
        const top = yOf(c.inicio);
        const endIso = c.fin_espera || c.fin_activa || c.fin;
        const bot = yOf(endIso);
        const railH = Math.max(16, bot - top);

        rails.push({ x, top, height: railH });
        nodes.push({ x, y: top, type: i === 0 ? "start" : "mid" });
        if (i === sorted.length - 1) {
          nodes.push({ x, y: bot, type: "end" });
        }

        if (i < sorted.length - 1) {
          const next = sorted[i + 1];
          const nextX = xDeCita(next);
          const nextTop = yOf(next.inicio);

          if (Math.abs(nextX - x) > 1 || Math.abs(nextTop - bot) > 2) {
            const dy = Math.max(12, Math.abs(nextTop - bot) * 0.45);
            const path =
              Math.abs(nextX - x) < 2
                ? `M ${x} ${bot} L ${x} ${nextTop}`
                : `M ${x} ${bot} C ${x} ${bot + dy}, ${nextX} ${nextTop - dy}, ${nextX} ${nextTop}`;
            cables.push({ path });
          }
        }
      }
    }
  }

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 56,
        right: 0,
        height,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {cables.length > 0 && (
        <svg
          width={width || "100%"}
          height={height}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            display: "block",
            zIndex: 4,
          }}
        >
          {cables.map((c, i) => (
            <g key={`cable-${i}`}>
              <path d={c.path} className="mch-cable" />
              <circle r="3.5" className="mch-dot">
                <animateMotion dur="1.8s" repeatCount="indefinite" path={c.path} />
              </circle>
            </g>
          ))}
        </svg>
      )}

      {rails.map((r, i) => (
        <div
          key={`rail-${i}`}
          className="mch-rail"
          style={{ left: r.x - 1.25, top: r.top, height: r.height }}
        />
      ))}

      {nodes.map((nd, i) => {
        const cls =
          nd.type === "start"
            ? "mch-node mch-node-start"
            : nd.type === "end"
              ? "mch-node mch-node-end"
              : "mch-node";
        return (
          <div key={`node-${i}`} className={cls} style={{ left: nd.x, top: nd.y }} />
        );
      })}
    </div>
  );
});
