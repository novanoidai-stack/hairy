import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeCtx {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({ mode: 'system', isDark: true, setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('@hairy:theme')
      .then(v => { if (v === 'light' || v === 'dark' || v === 'system') setModeState(v); })
      .finally(() => setReady(true));
  }, []);

  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';

  function setMode(m: ThemeMode) {
    setModeState(m);
    AsyncStorage.setItem('@hairy:theme', m).catch(() => {});
  }

  if (!ready) return null;

  return <Ctx.Provider value={{ mode, isDark, setMode }}>{children}</Ctx.Provider>;
}

export function useThemeMode() {
  return useContext(Ctx);
}
