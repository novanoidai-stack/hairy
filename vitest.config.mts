import { defineConfig } from 'vitest/config';
import path from 'path';

// Tests de COMPONENTE. El hueco que faltaba entre las dos suites que ya habia:
//   - Deno (lib/**.test.ts): logica pura, 466 pruebas, ~8 s. No monta React.
//   - Playwright (tests/**.spec.ts): navegador de verdad, ~7 min. Caro para
//     comprobar que un componente pinta lo que debe.
// Vitest cubre el medio: React montado en jsdom, sin navegador, en segundos.
//
// OJO con react-native-web: los componentes de este repo importan de
// 'react-native' y en web eso lo resuelve Metro a 'react-native-web'. Vitest no
// sabe de Metro, asi que el alias hay que darselo aqui a mano; sin el, cualquier
// test de componente falla con "Cannot find module 'react-native'".
export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: '@', replacement: path.resolve(__dirname, '.') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Solo los .test.tsx (componentes). Los .test.ts de lib/ son de Deno y NO
    // deben correr aqui: usan `Deno.test`, que en Vitest no existe.
    include: ['**/*.test.tsx'],
    exclude: ['node_modules/**', 'web/**', '.claude/**', 'ui-references/**'],
  },
});
