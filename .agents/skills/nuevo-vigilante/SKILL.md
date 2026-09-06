---
name: nuevo-vigilante
description: Cómo escribir un vigilante nuevo para scripts/vigilantes/ de Mecha (los verificadores de invariantes que corren en CI con npm run vigilar). Usar SIEMPRE al crear un vigilante, añadir una comprobación de invariante, tocar una línea base congelada (baseline.json), arreglar un ancla perdida o registrar un vigilante en el runner. Cubre el contrato de hallazgos, el registro en registro.mjs, la convención "ancla perdida falla" y los tests con node --test.
---

# Vigilante nuevo (Mecha)

Los vigilantes son los tres ojos del proyecto: estáticos en el PR (`npm run vigilar`),
dentro de Postgres (`vigilancia_bd()`, skill `migracion-bd-segura`) y el smoke del navegador
(skill `smoke-pantalla`). Esta skill es para la capa 1: un módulo en `scripts/vigilantes/`.

## Antes de crear uno: ¿ya tiene dueño?

Si el invariante cae dentro del ámbito de un vigilante existente (promesas de venta →
`planes.mjs` / `claims-fiscales.mjs`, precios → `precios.mjs`, referidos → `referidos.mjs`),
**extiéndelo** en vez de crear otro: duplicar al dueño reparte el invariante, que es justo
lo que esta casa quiere evitar. Vigilante nuevo solo para un ámbito que nadie mira.

## Contrato

Un vigilante es un módulo con export por defecto:

```js
export default {
  nombre: 'husos',
  ambito: 'seguridad', // o 'vigilancia', 'rendimiento', 'codigo-muerto', ...
  descripcion: 'Ninguna edge usa horarios de salon sin pasarlos por el reloj del salon',
  ejecutar, // async () => hallazgo[]
};
```

Cada hallazgo se crea con `hallazgo()` de `nucleo.mjs`:

```js
hallazgos.push(hallazgo({
  clave: 'husos/sin-reloj-salon-functions',  // convención: <vigilante>/<qué>
  nivel: 'bloqueante',                        // o 'aviso'
  ambito: 'seguridad',
  titulo: '...',        // frase humana para el informe
  detalle: '...',       // el porqué y cómo arreglarlo; aquí va la explicación larga
  fichero: '...', linea: 123, // contexto opcional
}));
```

`clave` es lo que ve el panel; no la cambies a la ligera (el dedupe de Telegram la usa).

## Registro: un paso, tres sitios

Importa el vigilante y añádelo a `ESTATICOS` en `scripts/vigilantes/registro.mjs`. Con eso
entra a la vez en el runner, en la CI y en el panel de Salud. Los de red (`bd-*`) van
además en `DE_RED`, y `meta-registro` comprueba que estén también en la edge que los
dispara cada 6 h. **Un vigilante fuera del registro no existe** (motivo del meta-registro:
seis ficheros sueltos del equipo multi-agente).

## Nivel: bloqueante vs aviso

- **`bloqueante`**: un usuario real vería algo falso o roto. Tumba la CI.
- **`aviso`**: informa, no para nada. La deuda heredada nace en `aviso` con línea base
  congelada (ver abajo). La revisión IA (CodeRabbit) SIEMPRE es aviso: la IA no tumba una CI.
- Un aviso que grita en falso cada hora hace que se deje de mirar el panel entero: si no
  estás seguro de que es roto-roto, `aviso`.

## La convención que define todo: el ancla perdida FALLA

Si tu regex/dependencia deja de casar porque alguien reescribió la sección, el vigilante
se ha quedado CIEGO — y eso es un hallazgo **bloqueante**, no un verde. Usa las ayudas de
`nucleo.mjs` y no reinventes:

- `leer(fichero)` — lanza `AnclaPerdida` si no existe.
- `capturar(fichero, regex, ancla)` — extrae con grupo 1; falla si no casa.
- `exigir(...)` — ancla de existencia.
- `codigoEjecutable()` — quita comentarios/cadenas para no confundir menciones con llamadas.

Un `AnclaPerdida` lanzada dentro de `ejecutar()` no crashea el runner: se convierte en
hallazgo bloqueante `<nombre>/ancla-perdida` («El vigilante "X" se ha quedado ciego»).
Si molesta, se arregla el ANCLA, nunca la comprobación.

Regla general que salió del vigilante de claves: **si tu vigilante depende de un artefacto
que puede no estar (un build, un directorio), di "no he podido mirar" EN VOZ ALTA** —
`existsSync(...) return` silencioso es la forma más elegante de mentir en verde.

## Línea base congelada (trinquete)

Para deuda heredada que no se arregla hoy: guarda contadores en
`scripts/vigilantes/<vigilante>-baseline.json` y compara así:

- **Sube** un contador → aviso (o bloqueante) "antes → ahora": subirlo es un acto consciente
  que se ve en el diff.
- **Baja** → aviso pidiendo REBAJAR la base, para que el trinquete solo gire hacia abajo.
- Se congela con un flag `--aprobar` en el propio vigilante (precedentes:
  `node scripts/vigilantes/errores-tragados.mjs --aprobar`, y en rendimiento
  `--aprobar --origen canario`).

## Tests

Exporta las funciones puras (parsing, recolección) y testéalas + un test de "estado del
mundo" ("hoy está limpio"). Fichero hermano `<vigilante>.test.mjs` con `node:test` +
`node:assert/strict`. Correr todas: `npm run vigilar:test`.

## Estilo y trampas del runner

- Comentario de cabecera con el PORQUÉ (qué incidente lo motivó), como en `husos.mjs`.
- Anclas y exenciones como constantes arriba, exenciones con su justificación.
- NUNCA `process.exit()` directo: usa `salir(codigo)` de `index.mjs` (bug de libuv/undici
  en Windows; el runner necesita que el proceso muera limpio).
- La primera pasada SIEMPRE da falsos positivos: los cinco vigilantes de la tanda del
  29 ago tuvieron uno antes de valer, y cada falso positivo enseñó algo del diseño real.
  **Estrenar un vigilante sin mirar uno a uno sus primeros hallazgos es como no tenerlo.**
- Verifica tu trabajo: `npm run vigilar` (o `--solo <nombre>`) y `npm run vigilar:test`.
