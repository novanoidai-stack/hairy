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

### Paso 6 — Desactivar la heredada *(panel)* — LO ÚNICO QUE QUEDA
En esa misma pantalla. **Es reversible**: si te dejaste un cliente, la reactivas.
Hasta aquí, la filtración sigue abierta.

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
