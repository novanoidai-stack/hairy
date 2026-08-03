// Portal public tokens — paginas publicas (r/[slug], resena/[slug]).
//
// Tema CLARO crema, el mismo de la app (lib/designTokens.ts) y el del directorio
// publico. Antes seguia la paleta oscura de la landing, pero el recorrido de la
// clienta es directorio -> ficha -> reserva, y las tres deben verse igual: la
// landing oscura es para el salon que compra el software, no para quien reserva.
//
// Los nombres de token NO cambian: r/[slug], resena/[slug] y PortalGrupoModal
// siguen funcionando sin tocar sus referencias.

export const PORTAL_TOKENS = {
  bg: '#f6f1ea',        // lienzo crema calido
  panel: '#fffdfb',     // panel principal (opaco: nada de blur, ver nota de rendimiento)
  card: '#ffffff',
  cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',  // sobre fondo claro el acento "alto" es el profundo, por contraste
  primarySoft: 'rgba(244,80,30,0.12)',
  star: '#e08a00',
  ember: '#e08a00',      // alias de star (usado en r/[slug])
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.14)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.16)',
};

// Gradientes compartidos
export const FIRE_GRADIENT = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';

// Tipografia: la misma de la app y del directorio.
export const SANS_SERIF = 'Inter, system-ui, -apple-system, sans-serif';
