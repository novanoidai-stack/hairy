import { useEffect, useRef, useState } from 'react';

// Enfoque tipo "spotlight" para la demo guiada: oscurece toda la app y deja
// clara solo la zona que se esta explicando (con borde luminoso de acento).
// Es la alternativa a las flechas: en vez de senalar un pixel, recorta la zona.
//
// Tecnica: un unico div colocado sobre el rect del objetivo con una sombra
// gigante (box-shadow spread 9999px) que pinta de oscuro TODO menos el hueco.
// pointer-events:none -> es solo visual, no bloquea clics (la demo sigue viva).
//
// Solo se usa en web (lo importan archivos .web.tsx). Mide con
// getBoundingClientRect en coordenadas de viewport y se posiciona con fixed,
// que dentro del iframe de la demo equivale al viewport de la app.

type Rect = { top: number; left: number; width: number; height: number };

export function DemoSpotlight({
  targetRef,
  active,
  padding = 10,
  radius = 14,
  label,
}: {
  targetRef: { current: HTMLElement | null };
  active: boolean;
  padding?: number;
  radius?: number;
  label?: string;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  // Embebido en la demo guiada: aqui NO pintamos (lo hace el contenedor), asi
  // que tampoco guardamos el rect en estado. Si no, el bucle de medida provocaba
  // un re-render por frame de toda la pantalla para nada.
  const embebido = typeof window !== 'undefined' && window.parent !== window;
  // El objetivo se lee SIEMPRE desde aqui. Las pantallas construyen su mapa de
  // zonas en cada render, asi que el objeto `targetRef` que nos llega es nuevo
  // cada vez; si estuviera en las dependencias del efecto, este se re-montaria
  // en cada render y su limpieza mandaria `null` al contenedor. Resultado: el
  // foco parpadeaba y a menudo se quedaba APAGADO en medio de un paso.
  const objetivo = useRef(targetRef);
  objetivo.current = targetRef;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!active) return;

    // Comunica al contenedor de la demo (demo.html, mismo origen) el rect del
    // hueco iluminado, para que coloque el texto del tour en la zona OSCURA y no
    // tape lo que se esta enfocando. Solo emite cuando cambia de forma apreciable.
    let lastPosted: Rect | null = null;
    const postHole = (r: Rect | null) => {
      try {
        const parent = window.parent;
        if (parent && parent !== window) {
          parent.postMessage({ type: 'mecha-spotlight', rect: r }, window.location.origin);
        }
      } catch (e) { /* cross-origin: ignorar */ }
    };

    // Latido: ademas de emitir cuando el hueco cambia, reenviamos el mismo rect
    // cada poco. El contenedor (demo.html) usa esas senales para saber que el
    // paso SI tiene foco; sin latido, dos pasos seguidos cuyo objetivo cae en el
    // mismo sitio (tipico entre pestanas de Ajustes) no emitian nada y el
    // contenedor daba el foco por perdido y lo apagaba.
    const LATIDO_MS = 400;
    let lastSent = 0;
    let raf = 0;
    // Si el objetivo desaparece (el boton al que apuntaba deja de existir, la
    // seccion se desmonta…) hay que APAGAR el foco. Antes se quedaba el ultimo
    // rect pintado y, tras recolocarse el panel, acababa senalando otra cosa
    // (llego a marcar "Cancelar" cuando explicaba "+ Encadenar otro").
    //
    // La gracia va por TIEMPO, no por frames: a 180 Hz (portatiles y monitores
    // modernos) contar frames daba ~130 ms y apagaba el foco en los huecos
    // normales de un re-render, asi que el paso se quedaba a oscuras a ratos.
    const GRACIA_MS = 700;
    let sinObjetivoDesde = 0;
    let apagado = false;
    const measure = () => {
      const el = objetivo.current.current;
      const vivo = !!el && el.getBoundingClientRect().height > 0;
      if (!vivo) {
        const ahora = Date.now();
        if (!sinObjetivoDesde) sinObjetivoDesde = ahora;
        else if (!apagado && ahora - sinObjetivoDesde > GRACIA_MS) {
          apagado = true;
          if (!embebido) setRect(null);
          lastPosted = null;
          postHole(null);
        }
      } else {
        sinObjetivoDesde = 0;
        apagado = false;
      }
      if (el) {
        const r = el.getBoundingClientRect();
        // Evita parpadeos cuando aun no esta colocado (height 0)
        if (r.width > 0 && r.height > 0) {
          if (!embebido) setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          // Hueco iluminado (con el padding visual aplicado), en coords del viewport del iframe.
          const hole = { top: r.top - padding, left: r.left - padding, width: r.width + padding * 2, height: r.height + padding * 2 };
          const ahora = Date.now();
          const cambio = !lastPosted ||
              Math.abs(hole.top - lastPosted.top) > 1 || Math.abs(hole.left - lastPosted.left) > 1 ||
              Math.abs(hole.width - lastPosted.width) > 1 || Math.abs(hole.height - lastPosted.height) > 1;
          if (cambio || ahora - lastSent > LATIDO_MS) {
            lastPosted = hole;
            lastSent = ahora;
            postHole(hole);
          }
        }
      }
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => { cancelAnimationFrame(raf); postHole(null); };
  }, [active, padding, embebido]);

  // Dentro de la demo guiada el foco lo pinta el CONTENEDOR (demo.html) con el
  // rect que le mandamos: aqui solo medimos. Pintarlo tambien nosotros dejaba
  // DOS recuadros a la vez —el de dentro y el de fuera nunca van sincronizados
  // al pixel— y el doble de oscuridad encima del software.
  if (embebido) return null;

  if (!rect) return null;

  const top = rect.top - padding;
  const left = rect.left - padding;
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;
  // Coloca la etiqueta arriba del hueco salvo que no quepa (entonces, debajo).
  const labelOnTop = top > 40;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top,
          left,
          width,
          height,
          borderRadius: radius,
          boxShadow:
            '0 0 0 9999px rgba(4,3,2,0.85), 0 0 0 2px rgba(244,80,30,0.95), 0 0 34px 6px rgba(244,80,30,0.42)',
          transform: 'translate3d(0, 0, 0)',
          willChange: 'top, left, width, height, opacity',
          transition: 'top 0.35s cubic-bezier(0.16, 1, 0.3, 1), left 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), height 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
          opacity: active ? 1 : 0,
        }}
      />
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: labelOnTop ? top - 30 : top + height + 8,
            left: Math.max(12, left),
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: '#fff',
            background: 'rgba(18,13,10,0.9)',
            padding: '5px 11px',
            borderRadius: 8,
            border: '1px solid rgba(244,80,30,0.5)',
            boxShadow: '0 8px 20px -6px rgba(0,0,0,0.6)',
            transition: 'top 0.4s ease, left 0.4s ease, opacity 0.3s ease',
            opacity: active ? 1 : 0,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
