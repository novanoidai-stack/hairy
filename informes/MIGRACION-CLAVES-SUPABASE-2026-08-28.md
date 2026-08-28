# Migración de claves de Supabase — service_role → secret key

**Fecha:** 28 ago 2026 · **Motivo:** una `service_role` filtrada en un repo público
**Estado del código:** preparado y verificado. Falta la parte de panel, que es manual.

---

## 1. Qué pasó

`novanoidai-stack/hairy` es un repositorio **público**. Cinco ficheros versionados
llevaban claves `service_role` en claro:

| Fichero | Proyecto |
|---|---|
| `scripts/importar_jose_suarez.mjs` | `vtrggiogjrhqtwbhbgia` (Mecha, producción) |
| `scripts/inspect-columns.mjs` | `vtrggiogjrhqtwbhbgia` |
| `scripts/test-consent-columns.mjs` | `vtrggiogjrhqtwbhbgia` |
| `scripts/update-profile.ts` | `aujlzfmrtafbmmjybjxz` (novanoidai.com) |
| `seed-data.mjs` | `aujlzfmrtafbmmjybjxz` |

Emitidas en feb/abr 2026, válidas hasta 2036. Comprobado con una petición de solo
lectura que no lee ninguna fila: **la de producción devolvía HTTP 200**, o sea que
seguía viva.

Una `service_role` usa `BYPASSRLS`: se salta **todas** las políticas. Con ella se
leen y escriben los datos de cualquier salón —clientas, teléfonos, citas,
facturación, cadenas VeriFactu— sin que el multi-tenant pinte nada.

El commit `5a9c761a4` (27 ago) ya avisaba de rotar. Estos cinco se le escaparon.

---

## 2. Por qué no hay botón de "rotar"

Palabras de Supabase: **"ya no es posible rotar las claves heredadas `anon`,
`service` y JWT"**. Derivan del JWT secret del proyecto y no se pueden cambiar
sin tirar el servicio. No hay botón porque no existe la operación.

El camino oficial para una `service_role` filtrada es **sustituirla por una secret
key** (`sb_secret_...`), que sí se crea, se nombra y se revoca por separado.

Las heredadas siguen funcionando **hasta finales de 2026**, así que la migración
se puede hacer cliente a cliente, sin corte.

---

## 3. Lo que ya está hecho (en el código)

- **Las cinco claves fuera del código.** Ahora salen de `.env` (gitignored) y cada
  script se niega a arrancar sin ella, en vez de tirar de un valor por defecto.
- **Puerta única: `supabase/functions/shared/claveServicio.ts`.** Las **31 edge
  functions** que usaban `SUPABASE_SERVICE_ROLE_KEY` ahora la piden ahí.
  - `claveServicio()` — devuelve la nueva si está, y si no la heredada. **Las dos a
    la vez, a propósito**: desplegar esto hoy no cambia nada, y sigue funcionando
    el día que desactives la heredada. Sin ventana de corte y sin coordinar 31
    despliegues con un cambio de clave.
  - `claveServicioOpcional()` — para `vigilar-agenda` y `notificar-solicitud`, que
    ya trataban la ausencia de clave como caso normal. Lanzar habría cambiado su
    comportamiento.
  - `esClaveDeServicio(valor)` — para `agenda-optimizador`, que **autentica** a
    quien la llama comparando contra la clave. Acepta la nueva **y** la heredada,
    para que el trigger no deje de autenticarse en silencio a mitad de migración.
    Comparación en tiempo constante.
- **15 pruebas** (`deno task test:claves`), ya en la CI.

---

## 3.bis Inventario real de quién usa la clave

Consultado contra la base de datos, no supuesto.

**Vault:** un solo secreto, `service_role_key` (*"para que pg_cron llame a edge
functions"*). **Ninguno de los seis llamadores lleva la clave incrustada**: los
seis la leen de ahí, así que cambiar ese único secreto los actualiza a todos.

| Quién | Cuándo | Llama a |
|---|---|---|
| cron `vigilar-agenda-pruebas` | cada 15 min | `vigilar-agenda` |
| cron `mecha_avisos_prueba` | 3:00 | `avisar-fin-prueba` |
| cron `mecha_descuento_referidos` | 3:40 | `sincronizar-descuento-referidos` |
| cron `mecha_informe_semanal` | lunes 6:00 | `enviar-informe-periodico` |
| cron `mecha_informe_mensual` | día 1, 6:30 | `enviar-informe-periodico` |
| trigger `agenda_ojos_notify` | cada movimiento de agenda | `agenda-optimizador` |

De paso: `chispa_tts_keepwarm` sí tiene una clave incrustada, pero es la **`anon`**,
pública por diseño. No es una filtración.

---

## 3.ter Un agujero que había que cerrar antes de apagar `verify_jwt`

Tres de esas funciones (`avisar-fin-prueba`, `sincronizar-descuento-referidos`,
`enviar-informe-periodico`) comprobaban quién llamaba así:

```ts
const p = bearer.split('.');
esServiceRole = JSON.parse(atob(p[1])).role === 'service_role';
```

Es decir, **se creían la carga del JWT sin verificar la firma**. Hoy no es
explotable porque `verify_jwt` valida la firma antes de que la petición llegue al
código. Pero esta migración obliga a apagarlo, y en ese momento cualquiera podría
fabricar un token sin firmar con `role: service_role` y entrar. Y además fallaría
igual: una `sb_secret_...` no tiene tres partes, así que el `split('.')` la
rechazaría y el cron se quedaría fuera.

`vigilar-agenda` era peor: **no comprobaba nada**, dependía entera de `verify_jwt`,
y recorre todos los negocios escribiendo hallazgos.

Las cinco usan ahora `peticionDeServicio(req)`: comparación exacta contra la clave
real del proyecto, en tiempo constante, aceptando las dos claves y las dos
cabeceras. Hay una prueba dedicada a que un JWT forjado salga rechazado.

---

## 3.quater El giro: Supabase ya había migrado las funciones

Descubierto al desplegar, instrumentando el 401 que devolvía el cron:

```
entrante:                  len=219  pre=eyJh   <- el vault mandaba la JWT heredada
SUPABASE_SERVICE_ROLE_KEY: len=41   pre=sb_s   <- ya era una secret key
SUPABASE_SECRET_KEYS:      len=55   pre={"de   <- el JSON nuevo
```

**La plataforma ya había sustituido `SUPABASE_SERVICE_ROLE_KEY` en el entorno de
las edge functions por una `sb_secret_...`.** Las 31 ya hablaban con la base de
datos con la clave nueva, incluso con el código viejo. El único sitio que seguía
con la clave filtrada era el vault.

Y eso destapó un **bug silencioso en producción**: `agenda-optimizador` autenticaba
el modo "ojo" comparando la JWT entrante contra esa variable de entorno. Cuando la
plataforma la cambió, la comparación dejó de casar y **cada movimiento de agenda
fallaba con 401 "No autenticado"**, sin que saltara nada. Arreglado de rebote: ahora
responde 200 con sus hallazgos.

Moraleja para la próxima: un 401 que no dice *por qué* cuesta una tarde. Por eso
`peticionDeServicio` deja la huella (longitud y 4 caracteres) de las tres claves.

---

## 4. Lo que falta

> **Estado a 28 ago 2026, 17:00.** Pasos 1 a 5: **HECHOS y verificados**. Queda
> solo el paso 6, que es el que cierra la fuga.
>
> **Corrección (28 ago 2026, tarde).** Ese "queda solo el paso 6" era falso: el
> paso 6 apaga la `anon` **y** la `service_role` a la vez, y la `anon` seguía
> incrustada en el cliente. Faltaba un paso entero, ahora documentado como
> **paso 5.bis**. Hecho también. Ahora sí: solo queda el 6.

### Paso 1 — Crear/localizar la secret key *(panel)* — HECHO
Supabase → **Settings → API Keys → "Publishable and secret API keys"**.

En Mecha el sistema nuevo **ya está activo** (convive la `anon` heredada con una
`sb_publishable_...` llamada `default`), así que la `sb_secret_...` `default`
probablemente ya existe. Si no, el botón "Create new API keys" la crea; es seguro
y no toca las heredadas.

### Paso 2 — Desplegar las edge functions — HECHO (las 31)
Con `supabase/config.toml`, que apaga `verify_jwt` en las cinco funciones a las
que llama la base de datos. **Este paso va primero**: apagar el verificador sin la
comprobación propia dejaría esas funciones abiertas.

Si el despliegue no es por CLI sino por panel, el interruptor hay que tocarlo
allí, función por función.

### Paso 3 — Aplicar la migración — HECHO
`supabase/migrations/20260828120000_claves_pg_net_cabecera_apikey.sql`.

Pasa los seis llamadores a la cabecera `apikey` **manteniendo el `Authorization`**,
para que este paso y el anterior no tengan que ser el mismo minuto. Sigue
funcionando con la clave heredada.

### Paso 4 — Repartir la clave nueva — HECHO (vault) · pendiente n8n
- **Vault** → cambiar el secreto `service_role_key`. Actualiza los seis de golpe.
- **Edge functions** → confirmar que `SUPABASE_SECRET_KEYS` aparece en
  *Edge Functions → Secrets*. Supabase la inyecta sola; no hay que pegar nada.
- **n8n** → credenciales de los workflows que hablen con Supabase.
- **Tu `.env` local** → solo si llegas a usar los scripts. Los nombres están en
  `.env.example`.

### Paso 5 — Verificar que nadie usa ya la heredada — HECHO salvo n8n
No hay indicador automático de uso. Los que se olvidan: CI/CD, integraciones de
terceros, apps ya instaladas, y cualquier webhook.

### Paso 5.bis — Migrar el CLIENTE a la publishable — HECHO (28 ago 2026)

Este es el paso que faltaba y el que de verdad bloqueaba el 6. La `anon` heredada
estaba incrustada en el navegador; apagarla sin esto tumba login, app,
marketplace, demo y portal a la vez, para todos los salones.

**La publishable es la sustituta directa de la `anon`:** mismos privilegios bajos,
mismas RLS, pensada para vivir en el navegador. **No es un secreto** — va en el
código exactamente como iba la `anon`. La clave `default` es
`sb_publishable_...` (46 caracteres).

**Alcance real: 21 apariciones en 20 ficheros**, no los 9 que decía el encargo.
El barrido bueno es decodificar la carga de cada JWT y quedarse con los de
`role: anon`, no fiarse de una lista escrita antes:

```
git ls-files -z | xargs -0 grep -l "eyJ"
```

- **App y web:** `lib/supabase.ts`, `web/assets/{auth,directorio,directorio-contacto,salon-directorio,reportarError}.js`,
  `web/index.html` (×2), `web/demo.html`, `web/demo_v2.html`.
- **Scripts de diagnóstico** (no los mencionaba el encargo): `check-citas.mjs`,
  `generate-massive.mjs`, `inspect-db.mjs`, `inspect-schema.mjs`, `test-auth.mjs`,
  `scripts/check-inventario-tables.js`.
- **Cadena de build de SEO** (tampoco): `scripts/seo/data.mjs`. Lo arrastra
  `npm run build:web` vía `generate-seo` y `generate-sitemap`, así que una clave
  muerta ahí rompe el build, no solo un script suelto.
- **Specs E2E** (tampoco): `tests/{caja-sesion,inventario-gramos,recursos-puestos}.spec.ts`.
- **Variable de build:** `EXPO_PUBLIC_SUPABASE_ANON_KEY` en `.env` y `.env.example`.
  En `lib/supabase.ts` la clave incrustada era el **fallback** de esa variable:
  cambiar solo una de las dos deja la vieja en pie.
- **Base de datos:** `public.chispa_tts_keepwarm` la llevaba en su definición →
  `supabase/migrations/20260828180000_chispa_tts_keepwarm_publishable.sql`.

**El nombre de la variable NO se cambió** (sigue `..._ANON_KEY` aunque ya no haya
`anon`): lo leen `app.config.js`, los scripts de SEO y el build de Expo.
Renombrarlo era un segundo punto de fallo sin ninguna ganancia.

#### La trampa que casi lo tumba: Metro cachea el valor de `EXPO_PUBLIC_*`

Los `EXPO_PUBLIC_*` **no se leen en tiempo de ejecución**: Metro los **incrusta
como literal al transformar cada fichero**, y cachea esa transformación por
fichero. Cambiar `.env` **no invalida** la caché de los ficheros que no tocaste.

Pasó de verdad, y el `.env` ya estaba bien tres minutos antes del build:

| | leía | en el bundle |
|---|---|---|
| `lib/supabase.ts` (editado) | `process.env... \|\| '<publishable>'` | publishable ✓ |
| `clientes.web.tsx` (NO editado) | `process.env... \|\| ''` | **`anon` legada** ✗ |
| `ColorTryOnModal.web.tsx` (NO editado) | `process.env... \|\| ''` | **`anon` legada** ✗ |

Compilaba, pasaba los tests y el `grep eyJ` del repo daba limpio, porque la clave
vieja ya no estaba en **el código fuente** — estaba en la **caché de Metro**.
Habría llegado a producción y habría muerto al apagar las heredadas.

**Por eso hay que reconstruir con la caché limpia y verificar el bundle, no el
código:**

```bash
rm -rf web/app .expo node_modules/.cache/metro && npm run build:web
grep -rl 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' web/app/   # tiene que dar 0
```

De paso se quitó la causa raíz: esos dos ficheros leían la variable **por su
cuenta** con `|| ''`, o sea que una variable mal puesta les dejaba el `apikey`
**vacío en silencio** — justo lo que la decisión 9 prohíbe. Ahora importan
`SUPABASE_ANON_KEY` de `lib/supabase.ts`, que es la única fuente.

#### ⚠️ Antes de desplegar: la variable en VERCEL

`.env` está gitignorado; **Vercel compila con sus propias variables**. Si
`EXPO_PUBLIC_SUPABASE_ANON_KEY` sigue valiendo la `anon` vieja en el proyecto de
Vercel, el build de producción la volverá a incrustar y apagar las heredadas
tumbará la app igual — la variable gana al fallback del código.

**Hay que actualizarla en Vercel → Settings → Environment Variables** (los tres
entornos) y **redesplegar**. No se puede comprobar desde aquí: el CLI de Vercel
no está instalado y el conector de Vercel no está autorizado en esta sesión.

**Lo que queda con `eyJ` y es correcto que quede:** prosa en `CLAUDE.md`,
`AGENTS.md`, `.env.example` y este informe; el fixture `eyJlegado` de
`claveServicio.test.ts`; el `ilike '%eyJhbGci%'` de la migración
`20260828120000`, que es un *detector* de claves incrustadas; y binarios
(`.png`, `.wav`) que son falsos positivos del grep.

### Paso 5.ter — La clave PÚBLICA del servidor: 22 funciones más — HECHO

`claveServicio()` arregló el cliente admin. Pero **22 edge functions** creaban
además un cliente para actuar **en nombre del usuario que llama**:

```ts
const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
  global: { headers: { Authorization: authHeader } },
});
```

Esa variable es la **`anon` heredada**. La documentación de Supabase la lista
literalmente bajo *«Legacy keys»*, junto a `SUPABASE_SERVICE_ROLE_KEY`. El día
del apagón el gateway rechaza esas peticiones y las 22 dejan de funcionar,
**aunque su cliente admin ya use la secret key nueva**. Se habría notado en:
agenda-asistente, crear-acceso-empleado, los tres checkouts de Stripe, los holds,
el TPV, todas las de Chispa/visión, migración mágica y onboarding.

La sustituta es `SUPABASE_PUBLISHABLE_KEYS`, que Supabase inyecta igual que
`SUPABASE_SECRET_KEYS`: JSON indexado por nombre, la clave se llama `default`.

Solución simétrica a la de servicio, en el mismo fichero:
`clavePublicable()` y `clavePublicableOpcional()` en
`supabase/functions/shared/claveServicio.ts`. Prefieren la nueva, caen a la
heredada mientras viva, y revientan con mensaje claro si no hay ninguna — en vez
del `?? ''` de antes, que construía el cliente con cadena vacía y moría después
con un error que no decía nada. 8 pruebas nuevas (`deno task test:claves`, 31 en
total). Las 22 pasan `deno check`.

### Quién usa todavía una clave heredada — la respuesta está en los logs

No hace falta adivinar. `edge_logs` guarda `request.sb.jwt.apikey.payload.role`
en cada petición: si sale `anon` o `service_role`, esa petición fue con una clave
heredada; si sale vacío, fue con una nueva (no son JWT, no tienen carga).

Medido el 28 ago 2026 (ventana de 24 h):

| clave | peticiones | quién |
|---|---|---|
| `anon` heredada | 26 542 | navegadores (`supabase-js runtime=web`), incl. móviles reales |
| clave nueva | 19 011 | edge functions ya migradas |
| `service_role` heredada | **1 689** | **n8n** (`axios/1.13.5`) |
| `supabase_admin` | 2 | plataforma |

**n8n es el bloqueo que no se ve desde el repo**, y aquí queda medido. Llama a
`notificaciones_pendientes` (cada 2 min), `expirar_citas_sin_senal` y
`marcar_notificacion_enviada` con la `service_role` heredada. Apagar antes de
cambiar esa credencial **para los WhatsApp de todos los salones** (confirmación,
recordatorio, reseña, enlace de señal) y deja de liberar los huecos de las
señales impagadas.

Consulta para repetirlo:

```sql
select coalesce(nullIf(log_attributes['request.sb.jwt.apikey.payload.role'],''),'(clave nueva)') as rol,
       log_attributes['request.headers.user_agent'] as agente,
       count(*) as n, max(timestamp) as ultima
  from logs where source = 'edge_logs'
 group by rol, agente order by n desc;
```

### Cómo comprobar si una clave sigue viva — OJO, el `curl` obvio no vale

```
curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: <clave>" \
  https://vtrggiogjrhqtwbhbgia.supabase.co/rest/v1/
```

**Esto no sirve.** Medido el 28 ago 2026: la raíz `/rest/v1/` devuelve **401 con
todo** — con la `anon` viva, con la publishable y con un JWT inventado. Da igual
lo que pases. Quien lo use va a dar por muerta una clave que sigue abriendo la
puerta.

Lo que sí discrimina es pedir **una tabla**, y mirar 401 contra cualquier otra cosa:

```
curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: <clave>" \
  'https://vtrggiogjrhqtwbhbgia.supabase.co/rest/v1/negocios?select=id&limit=1'
```

| clave | raíz `/rest/v1/` | tabla `negocios` | lectura |
|---|---|---|---|
| `anon` heredada (viva) | 401 | **404** | aceptada |
| `sb_publishable_...` | 401 | **404** | aceptada |
| JWT inventado | 401 | **401** | rechazada |

**401 = clave rechazada (muerta). Cualquier otra cosa = sigue viva.** El 404 es
que la tabla no está expuesta en el esquema público, y eso solo se contesta
*después* de aceptar la clave.

Y esto solo dice si la clave **vive**, no si alguien **la usa**. Para lo segundo,
los logs de Supabase (source `edge_logs`) unas horas después de desplegar.

### Paso 6 — Desactivar la heredada *(panel)* — LO ÚNICO QUE QUEDA
En esa misma pantalla. **Es reversible**: si te dejaste un cliente, la reactivas.
Hasta aquí, la filtración sigue abierta.

**Este paso es del usuario, no del agente.** El repo queda listo; el botón lo
pulsa una persona, después de desplegar y de mirar los logs.

---

## 5. Trampas, todas verificadas contra la documentación

**Una secret key no es un JWT.** No vale en `Authorization: Bearer`; va en la
cabecera `apikey`.

**Pero `createClient(url, sb_secret_...)` sí funciona.** El gateway sustituye la
cabecera `Authorization` por un JWT interno cuando ve un `Bearer sb_`. Por eso las
31 funciones no necesitan nada más: todas crean el cliente así y **ninguna hace
`fetch` a mano con la clave** (comprobado).

**`pg_net` y los Database Webhooks sí se rompen.** Mandan la clave a mano en
`Authorization`. Hay que pasarlos a `apikey`, y leerla del **Vault**, nunca
incrustada en el SQL.

**`verify_jwt` tumba las funciones llamadas con la clave nueva.** El verificador de
la plataforma solo entiende JWT: rechazaría la petición **antes** de que llegue al
código. Ya resuelto: `supabase/config.toml` (creado para esto, el repo no tenía)
lo apaga en las cinco, y las cinco autorizan por su cuenta con
`peticionDeServicio`.

**Realtime público queda limitado a 24 h** por conexión salvo que la sesión se
eleve con autenticación de usuario.

---

## 6. Lo que NO arregla esto

**Las claves viejas siguen en el historial de git, que es público.** Sacarlas del
código evita filtraciones futuras; no borra la que ya salió. **La única cura es
desactivarlas.** Hasta entonces, dar por comprometidos los datos de los dos
proyectos.

**Poner el repo en privado tampoco lo arregla.** Es buena idea y corta la
exposición futura, pero no invalida la clave que ya salió: estuvo en un repo
público con la clave dentro, y hay bots rastreando GitHub justo para eso. Cualquier
fork que exista se queda como está. Las dos cosas, no una u otra.

---

## 7. Verificación hecha

- Cero claves `service_role` en ficheros versionados (antes cinco).
- `deno check` sobre **las 31 edge functions modificadas**: limpio.
- `tsc --noEmit` limpio · Biome sin errores (464 ficheros).
- 473 unitarios (Deno) · 15 de claves · 26 de IA · 9 de esquemas · 6 de Vitest.

**Tres errores de tipos PREVIOS** salieron al comprobar las 31, en
`crear-checkout-cobro`, `crear-checkout-senal` y `redsys-notificacion`: los tres en
`crypto.subtle.importKey` (`Uint8Array<ArrayBufferLike>` vs `BufferSource`).
Verificado que son anteriores — mismos ficheros, mismas columnas, una línea antes,
sin mis cambios. **La CI no los ve** porque `check:edges` solo cubre otras tres
funciones. Merecen su propio arreglo.
