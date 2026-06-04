// Sistema centralizado de motion / animaciones para toda la app web
// Inyecta keyframes + clases utilitarias una sola vez en el layout raiz.
// Curva estandar: cubic-bezier(0.16,1,0.3,1) (spring-like, salida suave).
// Duraciones estandar: 0.18s hover, 0.35s entradas cortas, 0.5s entradas largas.

import { Platform } from 'react-native';

const MOTION_CSS = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(24px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.15; }
  }
  @keyframes pulseRed {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
    50% { box-shadow: 0 0 0 4px rgba(239,68,68,0.10); }
  }

  /* Entradas estandar (animan al montar) */
  .m-fade-in        { animation: fadeIn 0.4s ease both; }
  .m-slide-up       { animation: slideInUp 0.45s cubic-bezier(0.16,1,0.3,1) both; }
  .m-slide-right    { animation: slideInRight 0.5s cubic-bezier(0.16,1,0.3,1) both; }
  .m-slide-down     { animation: slideDown 0.35s cubic-bezier(0.16,1,0.3,1) both; }
  .m-scale-in       { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both; }

  /* Stagger automatico para listas (max 12 items para no exagerar) */
  .m-stagger > *:nth-child(1)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.00s both; }
  .m-stagger > *:nth-child(2)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.04s both; }
  .m-stagger > *:nth-child(3)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.08s both; }
  .m-stagger > *:nth-child(4)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.12s both; }
  .m-stagger > *:nth-child(5)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.16s both; }
  .m-stagger > *:nth-child(6)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.20s both; }
  .m-stagger > *:nth-child(7)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.24s both; }
  .m-stagger > *:nth-child(8)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.28s both; }
  .m-stagger > *:nth-child(9)  { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.32s both; }
  .m-stagger > *:nth-child(10) { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.36s both; }
  .m-stagger > *:nth-child(11) { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.40s both; }
  .m-stagger > *:nth-child(12) { animation: slideInUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.44s both; }

  /* Botones primarios (CTAs con gradiente) */
  .m-btn-primary {
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), box-shadow 0.18s ease, filter 0.18s ease;
    will-change: transform;
  }
  .m-btn-primary:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.02);
    filter: brightness(1.06);
  }
  .m-btn-primary:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
    transition-duration: 0.08s;
  }
  .m-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Botones secundarios (neutros) */
  .m-btn-secondary {
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), background 0.18s ease, border-color 0.18s ease;
  }
  .m-btn-secondary:hover:not(:disabled) {
    transform: translateY(-1px);
    background: rgba(148,163,184,0.08) !important;
    border-color: rgba(148,163,184,0.25) !important;
  }
  .m-btn-secondary:active:not(:disabled) {
    transform: translateY(0);
    transition-duration: 0.08s;
  }
  .m-btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Botones de peligro (rojo) */
  .m-btn-danger {
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  }
  .m-btn-danger:hover:not(:disabled) {
    transform: translateY(-1px);
    background: rgba(239,68,68,0.14) !important;
    border-color: rgba(239,68,68,0.55) !important;
    color: #ef4444 !important;
  }
  .m-btn-danger:active:not(:disabled) {
    transform: translateY(0);
    transition-duration: 0.08s;
  }
  .m-btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Botones de icono pequenos (cerrar, chevrons) */
  .m-btn-icon {
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), background 0.18s ease, border-color 0.18s ease;
  }
  .m-btn-icon:hover:not(:disabled) {
    transform: scale(1.12);
    background: rgba(148,163,184,0.12) !important;
    border-color: rgba(244,80,30,0.40) !important;
  }
  .m-btn-icon:active:not(:disabled) {
    transform: scale(0.95);
    transition-duration: 0.08s;
  }

  /* Variantes de icono con rotacion (chevrons, prev/next) */
  .m-btn-icon-rotate-l:hover:not(:disabled) { transform: scale(1.12) rotate(-15deg); }
  .m-btn-icon-rotate-r:hover:not(:disabled) { transform: scale(1.12) rotate(15deg); }
  .m-btn-icon-rotate-l, .m-btn-icon-rotate-r {
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), background 0.18s ease, border-color 0.18s ease;
  }
  .m-btn-icon-close:hover:not(:disabled) { transform: rotate(90deg); }
  .m-btn-icon-close {
    transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), background 0.18s ease;
  }

  /* Tarjetas / filas clicables */
  .m-card-hover {
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }
  .m-card-hover:hover {
    transform: translateY(-1px);
    border-color: rgba(244,80,30,0.30) !important;
    background: rgba(244,80,30,0.04) !important;
  }

  /* Chips / tags / pills clicables */
  .m-chip {
    transition: transform 0.15s cubic-bezier(0.16,1,0.3,1), background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .m-chip:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  /* Stat cards / metricas pequenas */
  .m-stat {
    transition: transform 0.18s ease, border-color 0.18s ease;
  }
  .m-stat:hover {
    transform: translateY(-1px);
    border-color: rgba(148,163,184,0.22) !important;
  }

  /* Modales y overlays */
  .m-overlay-enter { animation: fadeIn 0.2s ease both; }
  .m-modal-enter   { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both; }

  /* Dropdowns / menus desplegables */
  .m-dropdown      { animation: slideDown 0.18s cubic-bezier(0.16,1,0.3,1) both; }

  /* Animaciones de alerta (pulso) */
  .m-pulse-red     { animation: pulseRed 2.4s ease-in-out infinite; }
  .m-pulse         { animation: pulse 1.5s ease infinite; }

  /* Tab switching: el contenido entra con fade */
  .m-tab-content   { animation: fadeIn 0.25s ease both; }

  /* Inputs con focus ring suave */
  .m-input {
    transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }
  .m-input:focus {
    border-color: rgba(244,80,30,0.55) !important;
    box-shadow: 0 0 0 3px rgba(244,80,30,0.12);
  }

  /* Reduce motion: respeta preferencias del usuario */
  @media (prefers-reduced-motion: reduce) {
    .m-fade-in, .m-slide-up, .m-slide-right, .m-slide-down, .m-scale-in,
    .m-stagger > *, .m-overlay-enter, .m-modal-enter, .m-dropdown,
    .m-tab-content, .m-pulse-red, .m-pulse {
      animation: none !important;
    }
    .m-btn-primary, .m-btn-secondary, .m-btn-danger, .m-btn-icon,
    .m-card-hover, .m-chip, .m-stat, .m-input {
      transition: none !important;
    }
  }
`;

// Componente que monta el sistema de motion en el DOM (solo web).
// Hay que renderizarlo una vez en el layout raiz.
export function MotionStyles() {
  if (Platform.OS !== 'web') return null;
  return <style dangerouslySetInnerHTML={{ __html: MOTION_CSS }} />;
}
