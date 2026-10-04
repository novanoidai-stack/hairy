import React, { memo, useEffect, useRef, useState } from "react";
import { CITA_STATUS } from "@/lib/constants";
import { esReservaGrupo } from "@/lib/agenda/cadena";

/**
 * Cadenas de citas (grupo_id) — el riel exterior.
 *
 * Una cadena es una RELACION entre citas, no un estado. Por eso NO tinte (ni
 * toca) el bloque (el color del bloque lo decide solo el estado, ver
 * lib/agendaBloqueUi) y se dibuja fuera, en el carril que los bloques
 * encadenados dejan libre a su izquierda:
 *
 *   riel vertical continuo por cada eslabon, en carbon calido
 *   nodos: inicio (circulo lleno con flecha), continuacion (anillo), fin (cuadrado)
 *   cable curvo cuando la cadena salta de un profesional a otro, con un punto
 *   viajero dorado que recorre el trayecto
 *
 * El carril lo reserva la propia tarjeta desplazandose CHAIN_GUTTER px a la
 * derecha; por eso las dos constantes viven aqui y las importa AgendaCalendar.
 * Si se cambian sin tocar la otra, el riel se dibuja encima del texto.
 *
 * GEOMETRIA (rehelcha el 4 oct 2026, bug de la foto de Jose): antes se
 * recalcultaba a mano donde estaba cada tarjeta (columna x carril y hora por
 * ROW_H) y cualquier caso que esa formula no contemplara — profesional
 * oculto, cita anidada en el reposo de otra, cita por debajo de START_H,
 * columnas filtradas — ponia el riel o el nodo donde no habia tarjeta y el
 * cable cruzaba la rejilla entera. Ahora la UNICA fuente de verdad es la
 * tarjeta renderizada: se localiza por su gancho data-mecha-cita
 * (AppointmentCard) y se mide con getBoundingClientRect. Si la tarjeta no
 * esta en el DOM, ese eslabon no dibuja nada: la linea une lo que se ve.
 *
 * El overlay va DEBAJO de las tarjetas (zIndex 2 frente al 3 del contenedor
 * de citas): un cable que cruce por debajo de otra cita la respeta en vez de
 * atravesarle el texto, y riel y nodos siguen visibles en el carril libre.
 */

/** Centro del riel, en px desde el borde izquierdo del carril de la cita. */
export const CHAIN_RAIL_X = 6;
/** Hueco que reserva a su izquierda una cita encadenada. */
export const CHAIN_GUTTER = 18;

interface ChainFlowOverlayProps {
  /** Citas del dia ya repartidas en carriles (_lane / _totalLanes). */
  citas: any[];
  /** Altura total de la rejilla (HOURS.length * ROW_H). */
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

interface Geometria {
  rails: RailItem[];
  nodes: NodeItem[];
  cables: CableItem[];
}

const VACIA: Geometria = { rails: [], nodes: [], cables: [] };

export const ChainFlowOverlay = memo(function ChainFlowOverlay({
  citas,
  height,
}: ChainFlowOverlayProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firmaRef = useRef("");
  const [geo, setGeo] = useState<Geometria>(VACIA);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // La rejilla puede mutar sin que cambien las props (una tarjeta que
    // aparece, un carril que se reparte): cualquier alta/baja de nodos dentro
    // de la rejilla re-mide. La propia re-renderizacion del overlay no puede
    // buclear porque solo se actualiza el estado si la firma cambia.
    const observer = new MutationObserver(() => medir());
    if (root.parentElement) {
      observer.observe(root.parentElement, { childList: true, subtree: true });
    }

    function medir() {
      const rootEl = rootRef.current;
      if (!rootEl) return;
      const rootRect = rootEl.getBoundingClientRect();
      if (rootRect.width <= 0) return;

      const tarjetas = new Map<string, DOMRect>();
      document
        .querySelectorAll<HTMLElement>("[data-mecha-cita]")
        .forEach((el) => {
          tarjetas.set(
            el.getAttribute("data-mecha-cita") || "",
            el.getBoundingClientRect(),
          );
        });

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

      for (const [, bloques] of grupos) {
        if (bloques.length < 2) continue;
        // Una reserva de grupo (bodas, eventos) atiende a distintas personas en
        // paralelo o con desfase: no debe trazar cables de un unico cliente
        // saltando de silla en silla.
        if (esReservaGrupo(bloques[0]?.grupo_id, citas as any)) continue;

        const sorted = [...bloques].sort(
          (a, b) =>
            (a.orden_en_grupo ?? 0) - (b.orden_en_grupo ?? 0) ||
            new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
        );

        // Eslabon = tarjeta que existe de verdad en la rejilla.
        const eslabones = sorted
          .map((c) => {
            const rect = tarjetas.get(c.id);
            return rect
              ? {
                  left: rect.left - rootRect.left,
                  top: rect.top - rootRect.top,
                  bottom: rect.bottom - rootRect.top,
                }
              : null;
          })
          .filter(Boolean) as Array<{
          left: number;
          top: number;
          bottom: number;
        }>;

        if (eslabones.length < 2) continue;

        for (let i = 0; i < eslabones.length; i++) {
          const p = eslabones[i];
          // El riel vive en el carril que la tarjeta reserva a su izquierda
          // (CHAIN_GUTTER): 12px a la izquierda de su borde esta siempre
          // dentro de ese hueco, sea cual sea su carril o su columna.
          const x = p.left - 12;
          const top = Math.max(0, p.top + 2);
          const bottom = Math.min(height, p.bottom - 2);
          // Una tarjeta que cuelga fuera de la rejilla (entera o casi) no
          // lleva riel: no hay donde apoyarlo.
          if (bottom - top < 8) continue;

          rails.push({ x, top, height: bottom - top });
          nodes.push({ x, y: top, type: i === 0 ? "start" : "mid" });
          if (i === eslabones.length - 1) {
            nodes.push({ x, y: bottom, type: "end" });
          }

          if (i < eslabones.length - 1) {
            const p2 = eslabones[i + 1];
            const x2 = p2.left - 12;
            const y2 = Math.max(0, p2.top + 2);

            if (Math.abs(x2 - x) < 2) {
              // Mismo carril: el riel es continuo, el cable es un tramo recto.
              cables.push({ path: `M ${x} ${bottom} L ${x2} ${y2}` });
            } else {
              // Salto de columna: curva acotada. El dy antiguo era
              // proporcional al hueco temporal sin limite y una cadena con
              // dos horas de espera se hundia media rejilla.
              const dy = Math.min(
                40,
                Math.max(12, Math.abs(y2 - bottom) * 0.45),
              );
              const haciaAbajo = bottom <= y2;
              const c1 = haciaAbajo ? bottom + dy : bottom + dy * 0.6;
              const c2 = haciaAbajo ? y2 - dy : y2 + dy;
              cables.push({
                path: `M ${x} ${bottom} C ${x} ${c1}, ${x2} ${c2}, ${x2} ${y2}`,
              });
            }
          }
        }
      }

      const firma = JSON.stringify({ rails, nodes, cables });
      if (firma !== firmaRef.current) {
        firmaRef.current = firma;
        setGeo({ rails, nodes, cables });
      }
    }

    // Las tarjetas son hermanas posteriores en el DOM: en el commit en que se
    // montan, este efecto corre antes de que existan. Un rAF las espera.
    const raf = requestAnimationFrame(medir);
    // Repintados por cambio de tamano (columnas mas estrechas/anchas).
    const ro = new ResizeObserver(() => medir());
    ro.observe(root);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      observer.disconnect();
    };
  }, [citas, height]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 56,
        right: 0,
        height,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {geo.cables.length > 0 && (
        <svg
          width="100%"
          height={height}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            display: "block",
          }}
        >
          {geo.cables.map((c, i) => (
            <g key={`cable-${i}`}>
              <path d={c.path} className="mch-cable" />
              <circle r="3.5" className="mch-dot">
                <animateMotion dur="1.8s" repeatCount="indefinite" path={c.path} />
              </circle>
            </g>
          ))}
        </svg>
      )}

      {geo.rails.map((r, i) => (
        <div
          key={`rail-${i}`}
          className="mch-rail"
          style={{ left: r.x - 1.25, top: r.top, height: r.height }}
        />
      ))}

      {geo.nodes.map((nd, i) => {
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
