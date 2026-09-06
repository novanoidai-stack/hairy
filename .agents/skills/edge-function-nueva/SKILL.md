---
name: edge-function-nueva
description: Convenciones obligatorias para crear o modificar una edge function de Supabase en supabase/functions/ de Mecha. Usar SIEMPRE al crear una función nueva, añadir autorización, tocar CORS, llamar a un LLM u operar con horarios de salón. Cubre claveServicio/clavePublicable/peticionDeServicio, las tres formas de autorizar, el CORS de mechaa.es, el reloj del salón, la puerta única de OpenRouter y el despliegue.
---

# Edge function nueva (Mecha)

Una edge function de Mecha tiene cuatro decisiones de seguridad que no son opcionales:
de dónde saca la clave, cómo autoriza a quien llama, a qué orígenes responde y qué reloj usa.
Aquí va cada una con su porqué.

## Claves: una sola puerta

Nada de `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` ni `Deno.env.get('SUPABASE_ANON_KEY')`
a pelo — lo vigila el vigilante `claves` y tumba la CI. Todo sale de
`supabase/functions/shared/claveServicio.ts`:

- `claveServicio(nombre?)` → `string`. La clave de servicio. **Lanza si falta** (nunca valor
  por defecto: así fue como una service_role acabó versionada y nadie se enteró).
- `claveServicioOpcional(nombre?)` → `string | undefined`. Para funciones que tratan la
  ausencia como caso normal (p. ej. `notificar-solicitud`).
- `clavePublicable(nombre?)` / `clavePublicableOpcional(nombre?)` → para crear un
  `userClient` que actúa EN NOMBRE de quien llama.
- `peticionDeServicio(req)` → `boolean`. Autoriza llamadas internas (crons, n8n, la BD).

Las claves nuevas (`sb_secret_...`) **no son JWT**: viajan en la cabecera `apikey`, no en
`Authorization: Bearer`. `claveEntrante()` ya lo resuelve.

## Autorizar: elige UNA de las tres y aplícala de verdad

1. **Llamada interna** (`peticionDeServicio(req)`): compara la clave entrante en tiempo
   constante contra las reales. `if (!peticionDeServicio(req)) return json({ error: 'unauthorized' }, 401);`
   PROHIBIDO decodificar el JWT y mirar `role === 'service_role'`: no verifica firma y
   falla con las claves nuevas (no tienen tres partes).
2. **Sesión de usuario**: `userClient.auth.getUser()` → 401 si no hay usuario; después
   saca `negocio_id` de `profiles` → 403 si no hay salón. Ejemplo modelo:
   `color-formula-parser/index.ts`.
3. **Dos modos** (interno O sesión): primero servicio, si no, JWT de sesión + rol en
   `profiles`. Ejemplo: `orquestador-ia/index.ts`.

**Si la función va en `verify_jwt = false` en `supabase/config.toml`, la autorización por su
cuenta es OBLIGATORIA** — el verificador de plataforma solo entiende JWT, así que con las
claves nuevas esa función está abierta al mundo si no se cuida sola. El vigilante
`edges-autorizadas` no busca que llames a `peticionDeServicio`, sino que su RESULTADO se
consuma (un `if` real que devuelva 401).

## CORS

Cada función define el suyo (no hay `shared/cors.ts`). Allowlist con **mechaa.es incluido
siempre** — el dominio canónico es `https://www.mechaa.es`; no volver a hornear solo
hairy-two. Patrón de `chispa-landing` / `signup-free`:

```ts
const ALLOWED_ORIGINS = [
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
];
function esOrigenPermitido(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); // cualquier puerto dev
}
```

Funciones sin navegador (llamadas solo por crons/servicios) pueden usar `'*'`.

## Esqueleto

Copiar el estilo de `registrar-vigilancia/index.ts`: comentario de cabecera con el porqué →
imports de `esm.sh`/`jsr` + `../shared/*` → CORS + helper `json(cuerpo, status)` →
`Deno.serve` con OPTIONS primero, check de método, autorización, parseo defensivo del body
(try/catch → 400), cliente `createClient(SUPABASE_URL, claveServicio())` creado por petición,
errores con `console.error('[nombre-funcion] fallo:', ...)` y respuesta JSON con código
corto (`json_invalido`, `sin_configurar`, `no_autenticado`...).

## Horarios de salón

Las edges corren en UTC; el salón vive en `Europe/Madrid`. Nada de `new Date(...).setHours(...)`
con horas del salón: pásalas por `horariosAlRelojDelRuntime(filas, campos, { referencia })`
de `shared/relojSalon.ts` (también `parseInstanteSalon`, `enHoraSalon`, `fechaSalon`,
`horaSalon`). Lo vigila el vigilante `husos`.

## LLM: una sola puerta

Toda llamada a un modelo pasa por `shared/openrouterClient.ts`. Nunca `fetch` a
openrouter.ai ni ids de modelo escritos a mano: la cascada se pide POR CAPACIDAD
(`modalidades`, `tools`, `json`, `perfil: 'calidad' | 'economico'`) y `construirCadena()`
de `shared/modelos.ts` elige.

```ts
const resultado = await llamarIAJson<T>(OPENROUTER_API_KEY, {
  funcion: 'mi-funcion',
  mensajes,
  modalidades,
  maxTokens: 900,
  temperatura: 0.1,
});
```

- PDF va como parte `file` (`parteArchivo`), nunca `image_url` ni base64 en el prompt.
- Fotos de clientas: BYTES (`shared/imagenes.ts`), nunca la signed URL (es una credencial).
- Si la función gasta tokens, audita con `shared/chispa-auditoria.ts` (`auditar`/`auditarFallo`).
- Antes de tocar `modelos.ts`: `npm run verificar:modelos`.

## Despliegue y verificación

```bash
deno task check:edges        # compila todas
deno task test:claves        # la puerta de claves sigue cerrada
npx supabase functions deploy <fn> --project-ref vtrggiogjrhqtwbhbgia
```

Tras desplegar, **prueba el endpoint real**: 401 = desplegada y autorizando; 404 = no
desplegada. Si añadiste `verify_jwt = false`, añade también tu `peticionDeServicio` en el
mismo commit o la dejas abierta al mundo.
