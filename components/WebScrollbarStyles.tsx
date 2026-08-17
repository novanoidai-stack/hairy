import { useEffect } from 'react';
import { Platform } from 'react-native';

export function WebScrollbarStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Aqui se pedian los preconnect y la hoja de Inter. Sobraban: index.html ya
    // los trae en el <head> (scripts/postbuild-web.mjs), asi que esto solo
    // duplicaba la descarga de la misma hoja y encima tarde, en runtime.
    const style = document.createElement('style');
    style.textContent = `
      /* Reset border-box: los inputs/divs crudos de las pantallas .web.tsx
         (SettingsAtoms, equipo, etc.) usaban content-box, asi un input con
         width:100% + padding se salia del marco en movil. */
      *, *::before, *::after { box-sizing: border-box; }
      html, body, #__next, #root, * {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(244,80,30,0.32); border-radius: 999px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(244,80,30,0.55); }
      * { scrollbar-width: thin; scrollbar-color: rgba(244,80,30,0.32) transparent; }
      input, textarea { background: transparent !important; outline: none; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  return null;
}
