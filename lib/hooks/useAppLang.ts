// Hook global de idioma. Un solo estado en un modulo (sin Context provider
// para no obligar a envolver el arbol y mantenerlo pequeño). Los consumidores se
// suscriben al setter y re-renderizan cuando cambia. Es de facto un mini-store.

import { useEffect, useState, useCallback } from 'react';
import { readSavedLang, saveLang, makeAppT, type AppLang, type AppTFn } from '@/lib/appI18n';

type Listener = (lang: AppLang) => void;
const listeners = new Set<Listener>();
let currentLang: AppLang = readSavedLang();

function setLangGlobal(lang: AppLang) {
  currentLang = lang;
  saveLang(lang);
  listeners.forEach((l) => l(lang));
}

export function useAppLang(): { lang: AppLang; setLang: (l: AppLang) => void; t: AppTFn } {
  const [lang, setLang] = useState<AppLang>(currentLang);
  useEffect(() => {
    const l: Listener = (v) => setLang(v);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const change = useCallback((v: AppLang) => { setLangGlobal(v); }, []);
  const t = useCallback<AppTFn>((k) => makeAppT(lang)(k), [lang]);
  return { lang, setLang: change, t };
}
