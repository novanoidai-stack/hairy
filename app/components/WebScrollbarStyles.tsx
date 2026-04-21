import { useEffect } from 'react';
import { Platform } from 'react-native';

export function WebScrollbarStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 999px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.65); }
      * { scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.35) transparent; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
  return null;
}
