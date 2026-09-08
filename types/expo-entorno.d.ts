/// <reference types="expo/types" />

// POR QUE EXISTE ESTE FICHERO, Y POR QUE NO SE BORRA AUNQUE PAREZCA UN DUPLICADO
//
// Expo genera `expo-env.d.ts` con esta misma linea, pero ese fichero esta GITIGNORADO
// (`.gitignore`, bloque de expo-cli) y solo lo crea el CLI al arrancar en local. En CI,
// que hace `git checkout` + `npm ci` y nunca ejecuta el CLI, no existe -- y con el se va
// la unica referencia a `expo/types`, que es quien declara los modulos `*.css`.
//
// Con TypeScript 5.8 eso no se notaba: un import de efecto de un modulo sin declarar era
// legal. TypeScript 6 lo convirtio en error (TS2882) y el typecheck de CI empezo a fallar
// por `import './globals.css'` de `app/_layout.tsx`, un import que llevaba meses ahi.
//
// Que lo hacia dificil de ver: en las maquinas de desarrollo hay DOS copias del generado
// --`expo-env.d.ts` y `app/app/expo-env.d.ts`, resto del aplanado de carpetas-- asi que
// quitar una sola no reproduce el fallo. Hay que quitar las dos.
//
// Este fichero SI esta versionado, asi que la comprobacion de tipos deja de depender de
// un artefacto generado que no viaja en el repo. Si algun dia se versiona `expo-env.d.ts`,
// este se puede borrar; mientras tanto, duplicar la referencia es inofensivo (TypeScript
// resuelve la libreria una sola vez).
