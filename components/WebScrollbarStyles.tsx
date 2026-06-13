import { useEffect } from 'react';
import { Platform } from 'react-native';

export function WebScrollbarStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Add Inter font link
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = 'https://fonts.googleapis.com';
    document.head.appendChild(link);

    const link2 = document.createElement('link');
    link2.rel = 'preconnect';
    link2.href = 'https://fonts.gstatic.com';
    link2.crossOrigin = 'anonymous';
    document.head.appendChild(link2);

    const link3 = document.createElement('link');
    link3.rel = 'stylesheet';
    link3.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link3);

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
      document.head.removeChild(link);
      document.head.removeChild(link2);
      document.head.removeChild(link3);
      document.head.removeChild(style);
    };
  }, []);
  return null;
}
