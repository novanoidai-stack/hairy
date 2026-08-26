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
  @keyframes rise {
    from { opacity: 0; transform: translateY(16px) scale(0.99); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.15; }
  }
  @keyframes pulseRed {
    0%, 100% { box-shadow: 0 0 0 0 rgba(226,59,52,0); }
    50% { box-shadow: 0 0 0 4px rgba(226,59,52,0.10); }
  }

  /* Entradas estandar (animan al montar) */
  .m-fade-in        { animation: fadeIn 0.4s ease both; }
  .m-slide-up       { animation: slideInUp 0.45s cubic-bezier(0.16,1,0.3,1) both; }
  .m-slide-right    { animation: slideInRight 0.5s cubic-bezier(0.16,1,0.3,1) both; }
  .m-slide-down     { animation: slideDown 0.35s cubic-bezier(0.16,1,0.3,1) both; }
  .m-scale-in       { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both; }
  .m-rise           { animation: rise 0.5s cubic-bezier(0.16,1,0.3,1) both; }

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

  /* =========================================================================
     CANON DE HOVER DE MECHA (jul 2026) — un solo idioma para toda la app.
     Regla: HOVER ELEVA, CLICK HUNDE.
       - superficie (relleno/borde): translateY(-1px) + sombra; :active baja y encoge
       - icono: scale(1.12); :active 0.95
       - chip/segmentado (.m-seg): tine el inactivo, el activo NO se mueve
       - fila (.m-row-hover): solo tinte, sin desplazar
       - tarjeta (.m-card-hover): translateY(-2px) + sombra
       - enlace (.m-link): subraya y oscurece
       - control (.m-control, .m-select): borde + fondo + sombra; abierto/foco = anillo
     Las clases locales de cada pantalla (.b-btn, .ca-btn, .btn-tab, .cfg-chip...)
     se redefinen para igualar a estas. No inventar efectos nuevos por pantalla.
     ========================================================================= */

  /* Botones primarios (CTAs con gradiente) */
  .m-btn-primary {
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), box-shadow 0.18s ease, filter 0.18s ease;
    will-change: transform;
  }
  .m-btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.06);
    box-shadow: 0 6px 18px rgba(40,30,24,0.14);
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
    background: rgba(40,30,24,0.06) !important;
    border-color: rgba(40,30,24,0.20) !important;
    box-shadow: 0 4px 12px rgba(40,30,24,0.08);
  }
  .m-btn-secondary:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
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
    background: rgba(226,59,52,0.14) !important;
    border-color: rgba(226,59,52,0.55) !important;
    color: #e23b34 !important;
    box-shadow: 0 4px 12px rgba(226,59,52,0.16);
  }
  .m-btn-danger:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
    transition-duration: 0.08s;
  }
  .m-btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Botones de aviso (ambar: no-show, retrasos) */
  .m-btn-warn {
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), background 0.18s ease, border-color 0.18s ease;
  }
  .m-btn-warn:hover:not(:disabled) {
    transform: translateY(-1px);
    background: rgba(245,158,11,0.22) !important;
    border-color: rgba(245,158,11,0.75) !important;
    box-shadow: 0 4px 12px rgba(245,158,11,0.18);
  }
  .m-btn-warn:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
    transition-duration: 0.08s;
  }
  .m-btn-warn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Filas a ancho completo (acordeones, cabeceras plegables): sin desplazamiento */
  .m-row-hover {
    transition: background 0.18s ease, border-color 0.18s ease;
  }
  .m-row-hover:hover:not(:disabled) {
    background: rgba(244,80,30,0.06) !important;
    border-color: rgba(244,80,30,0.35) !important;
  }
  .m-row-hover:disabled {
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
    transform: translateY(-2px);
    border-color: rgba(244,80,30,0.30) !important;
    background: rgba(244,80,30,0.04) !important;
    box-shadow: 0 12px 28px rgba(40,30,24,0.10);
  }

  /* Chips / tags / pills clicables */
  .m-chip {
    transition: transform 0.15s cubic-bezier(0.16,1,0.3,1), background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .m-chip:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  /* Chips y segmentados con estado activo (.is-active en el seleccionado).
     El fondo suele ir inline en el JSX, de ahi el !important. El activo NO se
     mueve: dentro de un segmentado el desplazamiento delata cual esta elegido. */
  .m-seg {
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, filter 0.15s ease;
  }
  .m-seg:hover:not(.is-active):not(:disabled) {
    background: rgba(40,30,24,0.06) !important;
    border-color: rgba(40,30,24,0.20) !important;
  }
  .m-seg.is-active:hover:not(:disabled) {
    filter: brightness(0.96);
  }

  /* Enlaces de texto (acciones sin superficie: "Quitar", "+ Nueva variante") */
  .m-link {
    transition: filter 0.15s ease, color 0.15s ease;
  }
  .m-link:hover:not(:disabled) {
    text-decoration: underline;
    filter: brightness(0.9);
  }

  /* Controles: disparador de desplegable, select nativo y campos con marco.
     Reposo -> hover: sube el contraste del borde y aparece una sombra suave.
     Abierto o con foco: borde de marca + anillo (lo pone el propio componente
     cuando es un desplegable a medida; aqui se cubre el foco por teclado). */
  .m-control {
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .m-control:hover:not(:disabled):not(:focus) {
    background: #fbf6f0 !important;
    border-color: rgba(40,30,24,0.25) !important;
    box-shadow: 0 2px 10px rgba(28,24,20,0.10);
  }
  .m-control:focus, .m-control:focus-visible {
    border-color: rgba(244,80,30,0.55) !important;
    box-shadow: 0 0 0 3px rgba(244,80,30,0.12);
    outline: none;
  }

  /* Stat cards / metricas pequenas */
  .m-stat {
    transition: transform 0.18s ease, border-color 0.18s ease;
  }
  .m-stat:hover {
    transform: translateY(-2px);
    border-color: rgba(148,163,184,0.22) !important;
    box-shadow: 0 8px 20px rgba(40,30,24,0.08);
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

  /* ================================================================
     AGENDA — motion de la ley del bloque (ver lib/agendaBloqueUi.ts)

     Canon: SOLO LATE LO VIVO. Late en bucle la cita en curso y lo que sigue
     sin cobrar; todo lo demas anima una vez al cambiar de estado y se queda
     quieto. Con veinticinco citas en pantalla, si se mueven todas no se mueve
     ninguna: el ojo tiene que poder ir al unico sitio que cambia.

     Aqui NO se pinta el color del bloque (fondo, borde y barra salen de
     agendaBloqueUi). Estas clases solo anaden movimiento.
     ================================================================ */

  /* REGLA DE RENDIMIENTO, no negociable: en esta pantalla solo se animan
     'transform' y 'opacity'. Son las dos unicas propiedades que el compositor
     resuelve en GPU sin repintar. (Unica excepcion tolerada: el
     stroke-dashoffset del cable de la cadena, que es un unico path fino y no
     hay forma de conseguir ese efecto con transform.)
     La primera version animaba 'background-position' (barrido), 'box-shadow'
     (latido) y el angulo de un conic-gradient (aura del marco): las tres
     repintan en cada frame, y con nueve tarjetas a la vez mas un contenedor de
     1400x2400 px la agenda se quedaba sin frames. Si alguien vuelve a meter
     aqui una animacion de color, sombra, filtro o posicion de fondo, la agenda
     vuelve a ir a tirones. */

  /* En curso: una luz recorre la tarjeta + barra de progreso real. */
  @keyframes mechaBarrido {
    from { transform: translateX(-115%); }
    to   { transform: translateX(330%); }
  }
  .m-st-curso::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 45%;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(100deg,
      rgba(255,255,255,0) 0%,
      rgba(255,255,255,0.60) 40%,
      rgba(255,207,74,0.60) 60%,
      rgba(255,255,255,0) 100%);
    animation: mechaBarrido 2.2s linear infinite;
  }
  .m-st-curso-progress {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: var(--p, 0%);
    max-width: 100%;
    background: linear-gradient(90deg, #e0340e, #ffcf4a);
    border-radius: 0 2px 2px 0;
    z-index: 3;
    transition: width 0.9s linear;
  }

  /* Sin cobrar: latido tenue POR DENTRO. La sombra es fija y lo que late es la
     opacidad de la capa, que si se compone. */
  @keyframes mechaLatido {
    0%, 100% { opacity: 0; }
    50%      { opacity: 1; }
  }
  .m-st-sincobrar::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 1;
    box-shadow: inset 0 0 20px rgba(224,138,0,0.30);
    animation: mechaLatido 3.2s ease-in-out infinite;
  }

  /* Cambios de estado: animan una vez y paran. */
  @keyframes mechaPopin {
    0%   { transform: scale(0.55); opacity: 0; }
    70%  { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  .m-st-pop { animation: mechaPopin 0.4s cubic-bezier(0.16,1,0.3,1) both; }

  @keyframes mechaEntra {
    from { opacity: 0; transform: translateY(-2px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .m-st-entra { animation: mechaEntra 0.35s cubic-bezier(0.16,1,0.3,1) both; }

  @keyframes mechaSacude {
    0%, 100% { transform: translateX(0); }
    20%      { transform: translateX(2.5px); }
    45%      { transform: translateX(-2.5px); }
    70%      { transform: translateX(1.5px); }
  }
  .m-st-sacude { animation: mechaSacude 0.5s ease-in-out 1 both; }

  /* Cobrada: el candado se cierra una vez y se queda cerrado. */
  .m-st-cobrada-body { animation: mechaPopin 0.2s ease-out both; }
  .m-st-cobrada-arc {
    stroke-dasharray: 24;
    animation: mechaLockarc 0.55s cubic-bezier(0.16,1,0.3,1) 0.2s both;
  }
  @keyframes mechaLockarc {
    from { stroke-dashoffset: 24; }
    to   { stroke-dashoffset: 0; }
  }

  /* Cancelada: se tacha una vez. */
  .m-st-cancelada-strike {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 50%;
    height: 1.5px;
    background: rgba(226,59,52,0.55);
    transform-origin: left center;
    animation: mechaStrike 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s both;
    z-index: 3;
    pointer-events: none;
  }
  @keyframes mechaStrike {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }

  /* Bloqueo "reserva temporal": hormigas en marcha. Es un BLOQUEO, no una
     cita — lenguaje aparte a proposito. El color lo pone quien lo usa en
     --bloqueo (BLOQUEO_COLORS manda), aqui solo se anima. */
  @keyframes mechaMarch {
    0%, 49.9% { border-color: var(--bloqueo, rgba(92,82,73,0.55)); }
    50%, 100% { border-color: transparent; }
  }
  .m-st-reservatemp {
    border: 1.5px dashed var(--bloqueo, rgba(92,82,73,0.55));
    animation: mechaMarch 1.2s steps(1, end) infinite;
  }

  /* ================================================================
     CADENAS (grupo_id) — el riel exterior

     Una cadena es una RELACION entre citas, no un estado: por eso vive fuera
     del bloque y en carbon calido (TOKENS.chainRail), que no compite con
     ambar, fuego, verde ni rojo. El bloque encadenado no cambia de color.
     ================================================================ */
  @keyframes mechaRailFlow {
    from { transform: translateY(0); }
    to   { transform: translateY(11px); }
  }
  @keyframes mechaDashmove {
    to { stroke-dashoffset: -14; }
  }

  .mch-rail {
    position: absolute;
    width: 2.5px;
    border-radius: 3px;
    z-index: 4;
    overflow: hidden;
    background: rgba(92,82,73,0.18);
  }
  /* Las rayas viajan por transform dentro de un riel con overflow oculto: la
     version con background-position repintaba el riel entero cada frame. */
  .mch-rail::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -22px;
    bottom: -22px;
    background: repeating-linear-gradient(180deg,
      rgba(92,82,73,0.85) 0 6px,
      rgba(92,82,73,0) 6px 11px);
    animation: mechaRailFlow 1.3s linear infinite;
  }

  .mch-node {
    position: absolute;
    width: 13px;
    height: 13px;
    z-index: 6;
    transform: translate(-5.25px, -6.5px);
    background: #fffdfb;
    border: 2px solid #5c5249;
    border-radius: 50%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(28,24,20,0.18);
  }
  .mch-node-start {
    background: #5c5249;
    border-color: #5c5249;
  }
  .mch-node-start::after {
    content: '';
    border-left: 4px solid #fffdfb;
    border-top: 3px solid transparent;
    border-bottom: 3px solid transparent;
    margin-left: 1.5px;
  }
  .mch-node-end {
    border-radius: 3px;
  }
  .mch-node-end::after {
    content: '';
    width: 5px;
    height: 5px;
    background: #5c5249;
  }

  .mch-cable {
    stroke: #5c5249;
    stroke-width: 2.5;
    fill: none;
    stroke-linecap: round;
    stroke-dasharray: 7 5;
    opacity: 0.75;
    animation: mechaDashmove 1.4s linear infinite;
  }
  .mch-dot {
    fill: #ffcf4a;
    stroke: #c0260a;
    stroke-width: 1;
  }

  /* ================================================================
     MARCO DE LA AGENDA — aura fuego

     Borde fijo con degradado calido + una luz que recorre el canto superior.
     Es lo que separa "producto con IA detras" de "tabla de cuaderno".

     La primera version giraba un conic-gradient por todo el perimetro animando
     su angulo con @property. Se veia bien y costaba la pantalla: el contenedor
     de la agenda mide el dia entero (unos 1400x2400 px) y ese gradiente, con su
     mascara, se repintaba entero 60 veces por segundo. La luz de arriba dice lo
     mismo, se compone en GPU y no repinta nada.
     ================================================================ */
  .m-agenda-aura {
    position: relative;
  }
  .m-agenda-aura::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1.6px;
    z-index: 30;
    pointer-events: none;
    background: linear-gradient(135deg,
      rgba(244,80,30,0.40) 0%,
      rgba(255,207,74,0.30) 45%,
      rgba(192,38,10,0.38) 100%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
  }
  @keyframes mechaAura {
    from { transform: translateX(-110%); }
    to   { transform: translateX(300%); }
  }
  .m-agenda-aura::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 2px;
    width: 32%;
    z-index: 31;
    pointer-events: none;
    border-radius: 0 0 2px 2px;
    background: linear-gradient(90deg,
      rgba(244,80,30,0) 0%,
      rgba(255,207,74,0.95) 45%,
      rgba(244,80,30,0.90) 62%,
      rgba(244,80,30,0) 100%);
    animation: mechaAura 7s linear infinite;
  }

  /* Reduce motion: respeta preferencias del usuario */
  @media (prefers-reduced-motion: reduce) {
    .m-fade-in, .m-slide-up, .m-slide-right, .m-slide-down, .m-scale-in, .m-rise,
    .m-stagger > *, .m-overlay-enter, .m-modal-enter, .m-dropdown,
    .m-tab-content, .m-pulse-red, .m-pulse,
    .m-st-curso::after, .m-st-sincobrar::before, .m-st-pop, .m-st-entra,
    .m-st-sacude, .m-st-cobrada-body, .m-st-cobrada-arc,
    .m-st-cancelada-strike, .m-st-reservatemp, .mch-rail::before, .mch-cable,
    .m-agenda-aura::after {
      animation: none !important;
    }
    /* Sin movimiento, la luz que barre no aporta nada y tapa texto: fuera. */
    .m-st-curso::after, .m-agenda-aura::after { display: none !important; }
    /* El aviso de "sin cobrar" tiene que seguir viendose, quieto. */
    .m-st-sincobrar::before { opacity: 0.7; }
    /* Lo que anima "una vez y se queda" tiene que quedarse en su estado FINAL,
       no en el inicial: sin esto el tachado de una cancelada y el arco del
       candado no llegan a dibujarse nunca. */
    .m-st-cancelada-strike { transform: scaleX(1); }
    .m-st-cobrada-arc { stroke-dashoffset: 0; }
    .m-st-pop, .m-st-entra { opacity: 1; transform: none; }
    /* El aura del marco se queda quieta, pero visible. */
    .m-agenda-aura::before { opacity: 0.55; }
    .m-btn-primary, .m-btn-secondary, .m-btn-danger, .m-btn-warn, .m-btn-icon,
    .m-row-hover, .m-card-hover, .m-chip, .m-seg, .m-link, .m-control,
    .m-stat, .m-input {
      transition: none !important;
    }
    .m-btn-primary:hover, .m-btn-secondary:hover, .m-btn-danger:hover,
    .m-btn-warn:hover, .m-card-hover:hover, .m-chip:hover {
      transform: none !important;
    }
  }
`;

// Componente que monta el sistema de motion en el DOM (solo web).
// Hay que renderizarlo una vez en el layout raiz.
export function MotionStyles() {
  if (Platform.OS !== 'web') return null;
  return <style dangerouslySetInnerHTML={{ __html: MOTION_CSS }} />;
}
