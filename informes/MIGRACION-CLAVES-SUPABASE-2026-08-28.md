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

## 4. Lo que falta (manual, en el panel)

### Paso 1 — Crear/localizar la secret key
Supabase → **Settings → API Keys → "Publishable and secret API keys"**.

En Mecha el sistema nuevo **ya está activo** (convive la `anon` heredada con una
`sb_publishable_...` llamada `default`), así que la `sb_secret_...` `default`
probablemente ya existe. Si no, el botón "Create new API keys" la crea; es seguro
y no toca las heredadas.

### Paso 2 — Repartirla
- **Tu `.env` local** → `SUPABASE_SERVICE_ROLE_KEY=` (los nombres están en
  `.env.example`). No hace falta esperar a nada: el código acepta las dos.
- **Edge functions** → confirmar que Supabase inyecta `SUPABASE_SECRET_KEYS` en
  *Edge Functions → Secrets*. En cuanto esté, `claveServicio()` la prefiere sola.
- **n8n** → credenciales de los workflows que hablen con Supabase.
- **Vault** → el secreto que usan los triggers para llamar a `agenda-optimizador`.

### Paso 3 — Verificar que nadie usa ya la heredada
No hay indicador automático de uso. Hay que repasarlo a mano. Los que se olvidan:
CI/CD, integraciones de terceros, crons, `pg_net` y Database Webhooks.

### Paso 4 — Desactivar la heredada
En esa misma pantalla. **Es reversible**: si te dejaste un cliente, la reactivas.

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
código. Las funciones a las que llame un cron o un trigger necesitarán
`verify_jwt = false` en `supabase/config.toml` y autorizar por su cuenta —
`agenda-optimizador` ya lo hace, y ya acepta la clave por las dos cabeceras.
**Este repo no tiene `supabase/config.toml`: hay que crearlo.**

**Realtime público queda limitado a 24 h** por conexión salvo que la sesión se
eleve con autenticación de usuario.

---

## 6. Lo que NO arregla esto

**Las claves viejas siguen en el historial de git, que es público.** Sacarlas del
código evita filtraciones futuras; no borra la que ya salió. **La única cura es
desactivarlas.** Hasta entonces, dar por comprometidos los datos de los dos
proyectos.

Y la pregunta de fondo: **¿debe el repo ser público?** Mientras lo sea, cualquier
secreto que entre queda quemado desde el primer push. Ya ha pasado dos veces.

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
