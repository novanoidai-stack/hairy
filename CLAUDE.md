# CLAUDE.md — Contexto del proyecto Mecha (repo "Hairy")

> Claude Code lee este archivo automáticamente al arrancar en este repo.
> **Fuente de verdad del estado del producto: `informes/MEGA_INFORME_MECHA.md`** (carpeta informes).
> Los specs del socio (Jose) están en `Documentacion/` (NO versionada: contiene secretos).

## Qué es esto

**Mecha** (antes "Hairy") — SaaS multi-tenant de gestión para peluquerías/barberías.
Diferencial: verticalización peluquería (fases activa/reposo de tintes, fichas de color)
+ capa de IA (WhatsApp + voz, vía n8n y Retell AI).

**Equipo:** Carlos (frontend/UX/backend ligero — el que suele estar en esta sesión) ·
Alexandro (pagos, IA, mensajería, integraciones) · Jose Suárez (producto/specs).

**Estructura local:** este repo vive dentro de la carpeta gestora `novanoidai/` (repo
paraguas de la agencia) junto a `web_vercel/` (el sitio/proyecto de novanoidai.com, con su
propio Supabase). Son proyectos DISTINTOS: no mezclar migraciones ni claves entre ellos.
Git de Mecha: remoto `novanoidai-stack/hairy`; rama de trabajo `feat/portal-reserva-online`;
**producción despliega desde `master`** (Vercel via Git).
Regla de reparto: si una tarea envía mensajes reales, mueve dinero, usa IA o integra
OAuth de terceros → es de Alexandro. El resto → Carlos. (Detalle en §6 del mega informe.)

## Stack y arquitectura

- **App de gestión:** Expo ~54 + expo-router 6, React Native 0.81, **react-native-web**.
  Misma base para nativo y web; cada pantalla tiene `.tsx` (nativo) y `.web.tsx` (web, la rica).
  **Hoy el producto real es la web**; el nativo va por detrás.
- **Datos:** Supabase, proyecto `vtrggiogjrhqtwbhbgia`. Multi-tenant por `negocio_id` (text)
  en TODAS las consultas y políticas RLS.
- **Web pública:** `web/` (HTML/CSS/JS estático): `index.html` (landing), `demo.html`,
  `acceso.html` (login/signup), `reservar.html` (llamada comercial), `admin.html` (panel staff),
  legales. El build de la app (`expo export -p web`) va a `web/app/` (gitignored; Vercel lo genera).
- **Deploy:** Vercel (`vercel.json`); el dominio sirve `web/` y reescribe `/app/*` a la SPA.
  **Dominio canónico: `https://www.mechaa.es`** (apex redirige a www; `hairy-two.vercel.app`
  hace 308 al canónico desde el 2 jul). Las allowlists CORS de las edge functions y el
  Site URL de Supabase Auth deben incluir mechaa.es — no volver a hornear hairy-two.
- **Migraciones:** archivos en `supabase/migrations/` (las históricas se movieron a
  `archive/migraciones-legacy/`) + aplicadas en remoto (el historial remoto manda).
  Edge functions en `supabase/functions/`.

## Decisiones de diseño VIGENTES (no romper)

1. **Demo compartida:** TODO visitante ve la misma demo (tenant `demo_salon_001`).
   - `demo.html` embebe `/app?demo=1` en un iframe.
   - En modo demo la app usa una **sesión Supabase aislada** (`storageKey: 'mecha-demo-auth'`,
     ver `lib/supabase.ts`) y entra sola con `demo.publico@mecha.app` / `MechaDemoView_2026`
     (credenciales públicas a propósito). La sesión personal del visitante NO se toca.
   - Solo cuenta como demo si va EMBEBIDA en iframe del mismo origen; `/app?demo=1` directo no.
   - `demo.publico` está EXENTA del límite de 3 visitas (los prospectos free no).
   - **DEROGADO el 19 ago 2026** (antes: "las cuentas nuevas nacen en `demo_salon_001` plan
     free"). Hoy el alta es AUTOSERVICIO: `handle_new_user` crea `negocio_id` propio con
     `generar_negocio_id_unico()` y sella `plan='esencial'`, `suscripcion_estado='prueba'` y
     `trial_ends_at = now()+30d`. `free` ya solo significa **prueba agotada**. El trigger NO
     crea perfil si `auth.users.invited_at` no es nulo: esas altas son invitaciones de
     empleado y el perfil lo crea `crear-acceso-empleado` con el negocio y el plan heredados
     (si lo creara el trigger, ese upsert seria un UPDATE y `guard_profile_identity_columns`
     le revertiria negocio_id/role/plan en silencio, tambien para service_role).
     `staff_grant_full_access` sigue existiendo para los salones que preconfiguramos nosotros.
2. **Portal público de reserva:** `/app/r/<slug>` (+ reseñas en `/app/resena/<slug>`).
   Anónimo; todo pasa por RPCs `security definer` (`portal_info`, `disponibilidad_publica`,
   `crear_cita_publica`, `crear_resena_publica`, `resenas_publicas`) con **anti-abuso en
   servidor** (límites por teléfono/IP/negocio). NO abrir SELECT directo a `anon`.
   Las rutas `r`, `resena`, `cita`, `pago`, `pagar`, `presupuesto` y `contacto` están
  exentas de los guards de auth en `app/_layout.tsx` (la lista exacta la vigila
  `scripts/vigilantes/rutas-publicas.mjs`: tocarla sin actualizar el vigilante para la CI).
3. **Fotos de clientas:** bucket `cliente-fotos` PRIVADO, políticas por carpeta de negocio,
   render con `createSignedUrls` (no `getPublicUrl`).
4. **Seguridad:** tras CUALQUIER migración, pasar los advisors de Supabase (security).
   Nunca políticas `USING (true)` de escritura, nunca funciones tipo `exec_sql`.
   Desde el round 4 (2 jul, `security-round4-superficie-funciones.sql`) las funciones nuevas
   NO nacen ejecutables por `anon`: toda RPC pública nueva necesita `grant execute ... to anon`
   explícito en su migración, y las RPCs internas sensibles chequean rol owner/admin DENTRO.
   `Documentacion/` está en `.gitignore` porque contiene client secrets de Google — no versionar.
   - **La regla del parámetro (23 ago 2026).** Si una RPC recibe `negocio_id`, o un id del que
     se deduce (`p_cliente_id`, `p_cobro_id`, `p_factura_id`, `p_profesional_id`), **tiene que
     atarse a quien llama**: `perform public.exige_mi_negocio(<negocio>, <solo_gestor>)`.
     Sin eso el multi-tenant no existe — basta cambiar un uuid para operar sobre otro salón.
     Así se colaron doce, incluidas las que reescribían el NIF de otro salón y las que metían
     eslabones en su cadena de huellas VeriFactu. Migraciones `seguridad-multitenant-*.sql`.
     El guard deja pasar el `uid` nulo A PROPÓSITO: como esas funciones no están concedidas a
     `anon`, un uid nulo solo puede ser una llamada interna del portal público o service_role.
   - **Los advisors NO se limpian, se auditan.** De los 250 iniciales, 226 son
     `*_security_definer_function_executable`: es la arquitectura (el cliente no toca tablas,
     llama a RPCs definer que comprueban permiso dentro). "Arreglarlos" es apagar la API.
     `auth_leaked_password_protection` tampoco se irá nunca: el interruptor es de plan Pro y
     ya se resuelve contra HaveIBeenPwned por nuestra cuenta. Quedan 228 y ese es el suelo
     razonable — si alguien vuelve a proponer bajarlo, esto es por qué no.
     La consulta que sí vale la pena repetir: buscar funciones `definer` abiertas a
     `authenticated` que reciban parámetros y NO mencionen `auth.uid()`, `is_staff()`,
     `my_negocio_id_text()` ni `exige_mi_negocio()`. Hoy da **0**.
5. **Sin claims falsos:** nada de reseñas/ratings inventados en structured data ni cifras
   sin fuente en la landing (ya se retiraron una vez).
6. **RLS rápida (17 ago 2026):** toda política nueva envuelve sus llamadas en `(select ...)`
   — `(select auth.uid())`, `(select is_shared_demo_visitor())`, `(select my_negocio_id_text())`.
   Suelta, Postgres la ejecuta una vez POR FILA; dentro de un subselect la evalúa una vez por
   consulta (InitPlan). Y los ayudantes de RLS van `STABLE`, **nunca `VOLATILE`**: `is_staff()`
   volátil provocó por sí sola 24 M de seq scans sobre `staff` y 456 M de tuplas leídas en
   `citas`. Se comprueba en el plan (`One-Time Filter` + `InitPlan`) y con el advisor de
   rendimiento (aviso `auth_rls_initplan`). Migraciones: `archive/migraciones-legacy/rendimiento-rls-initplan.sql`
   (idempotente, se puede repasar tras añadir políticas) y `rendimiento-funciones-estables-e-indices.sql`.
7. **Caché de `/app` (17 ago 2026):** los estáticos del export de Expo llevan hash en el nombre,
   así que `/app/_expo/*` y `/app/assets/*` van `immutable` en `vercel.json`; solo `index.html`
   y el resto de `/app` van `no-store`. Estuvo TODO en `no-store` y eso obligaba a re-descargar
   el bundle de ~7 MB en cada carga, login y apertura de demo. No volver a poner `no-store` a `/app/(.*)`.

8. **Capa de IA: una sola puerta (20 ago 2026).** Toda llamada a un LLM pasa por
   `supabase/functions/shared/openrouterClient.ts`. **Ninguna edge function vuelve a hacer
   `fetch` a openrouter.ai ni a escribir un id de modelo a mano.** Los ids, capacidades y
   precios viven SOLO en `shared/modelos.ts`, verificado contra el catálogo real.
   - **Antes de tocar `modelos.ts`: `npm run verificar:modelos`** (o `deno task verificar:modelos`).
     Falla si un id no existe, si el precio se ha movido o si declaras una capacidad que el
     modelo no tiene. La versión anterior tenía tres modelos inventados (`qwen/qwq-32b`,
     `google/gemini-2.0-flash-001`, `qwen/qwen-2.5-vl-72b-instruct`) y nadie se enteró: la
     cascada se los saltaba en silencio y se pagaba el modelo caro creyendo usar el barato.
   - **La cascada NO se escribe a mano**: se pide por capacidad (`modalidades`, `tools`, `json`)
     y el cliente filtra. Si mandas un PDF, un modelo sin modalidad `archivo` ni se intenta.
     El primer fallback es siempre de OTRO proveedor (hay un test que lo vigila).
   - **Las variantes `:batch` NO valen para chat**: se consumen por `POST /api/beta/batches`
     (asíncrono, SLA de horas), no por `/v1/chat/completions`. Están en el catálogo marcadas
     `activo: false`, solo para tarifar. No volver a meterlas en una cascada síncrona.
   - **Un PDF va como parte `file`** (`parteArchivo`), nunca como `image_url` ni incrustado en
     el prompt de texto: eso metía megas de base64 en el contexto y costaba dinero real.
   - **Fotos de clientas**: a los modelos se les mandan los BYTES (`shared/imagenes.ts`), nunca
     la signed URL del bucket privado — es una credencial de acceso con TTL (decisión 3).
   - **Coste**: `shared/chispa-auditoria.ts` registra cada llamada en `chispa_auditoria` con el
     precio real de `modelos.ts`. Tope de gasto por usuario/hora en `cupo_ia_disponible`
     (`archive/migraciones-legacy/cupo-ia-por-usuario.sql`); si esa migración no está aplicada el límite
     **no se aplica** y se avisa a gritos en los logs.
   - Tests: `deno task test:ia`.

9. **CLAVES DE SUPABASE: nunca en el código, y las heredadas están muertas de verdad
   (desactivadas el 29 ago 2026).** Se encontraron cinco ficheros versionados con la
   `service_role` en claro **en un repo que entonces era público**, y seguía viva. Detalle y
   runbook: `informes/MIGRACION-CLAVES-SUPABASE-2026-08-28.md`.
   **"Muertas" ya no es una intención: el gateway devuelve 401 con ellas.** Si algo falla con
   un 401 inexplicable, la primera hipótesis es que ese componente todavía las usa.
   - **Regla dura: ninguna clave se escribe en un fichero del repo. Ninguna.** Ni en `.ts`,
     ni en `.mjs`, ni en SQL, ni en un comentario, ni "temporalmente". Van en `.env`
     (gitignored, ver `.env.example`) o en el Vault. Y quien las lee **falla ruidosamente
     si faltan**, nunca tira de un valor por defecto: así fue como esto pasó desapercibido.
   - **Las heredadas (`anon` y `service_role`, JWT que empiezan por `eyJ`) NO SE PUEDEN
     ROTAR.** No es que no encuentres el botón: Supabase eliminó la operación. Se sustituyen
     por `sb_publishable_...` (cliente) y `sb_secret_...` (servidor), que sí se crean, nombran
     y revocan por separado. No pierdas el tiempo buscando "rotar".
   - **En edge functions, una sola puerta: `claveServicio()` de
     `supabase/functions/shared/claveServicio.ts`.** Nunca `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
     a pelo. Devuelve la nueva si está y la heredada si no, para que un despliegue no tenga
     que coincidir con un cambio de clave.
   - **Para autorizar llamadas internas (crons, triggers, otro backend): `peticionDeServicio(req)`.**
     **PROHIBIDO** el patrón que había antes —decodificar el JWT y mirar si `role === 'service_role'`—
     porque **no verifica la firma**: con `verify_jwt` apagado, cualquiera fabrica ese token.
     Y falla igual con las claves nuevas, que no son JWT y no tienen tres partes.
   - **Una secret key no es un JWT: viaja en la cabecera `apikey`, no en `Authorization: Bearer`.**
     Vale para `pg_net`, Database Webhooks y n8n. La clave se lee del Vault en cada llamada,
     nunca incrustada en el SQL.
   - **Las funciones que llama la base de datos necesitan `verify_jwt = false`** en
     `supabase/config.toml` — el verificador de la plataforma solo entiende JWT — **y por eso
     autorizan por su cuenta**. Si añades una función a esa lista, añádele también su
     `peticionDeServicio` o la dejas abierta al mundo.
   - **El cliente ya usa la publishable (28 ago 2026).** `sb_publishable_...` sustituye a la
     `anon` en los 20 ficheros que la llevaban incrustada (app, landing, demo, marketplace,
     portal, scripts de diagnóstico y specs E2E), en `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`.env` y
     `.env.example`) y en la función `public.chispa_tts_keepwarm`. Es pública por diseño, así
     que va en el código igual que iba la `anon` — **no es un secreto**.
     El nombre de la variable NO cambió a propósito: lo leen `app.config.js`, los scripts de
     SEO y el build de Expo, y renombrarlo era un segundo fallo posible sin ninguna ganancia.
     **Trampa verificada: Metro incrusta los `EXPO_PUBLIC_*` como literal y cachea esa
     transformación por fichero.** Cambiar `.env` NO invalida los ficheros que no tocaste:
     el bundle salió con la clave vieja en dos sitios aunque el código fuente estaba limpio
     y los tests pasaban. Tras tocar una clave, reconstruir con la caché limpia y verificar
     **el bundle**, no el código:
     `rm -rf web/app .expo node_modules/.cache/metro && npm run build:web`
     y luego `grep -rl 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' web/app/` → tiene que dar 0.
   - **La clave PUBLICA también tiene su puerta: `clavePublicable()` (28 ago 2026).** No
     basta con `claveServicio()`: **22 edge functions** creaban además un `userClient` con
     `createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {headers:{Authorization}})`
     para actuar EN NOMBRE de quien llama. Esa variable es la `anon` **heredada** — la
     documentación de Supabase la clasifica como *legacy key* junto a `SUPABASE_SERVICE_ROLE_KEY`.
     Al desactivar las heredadas el gateway las rechaza y esas 22 dejan de funcionar, aunque
     su cliente admin ya use la clave nueva. La sustituta es `SUPABASE_PUBLISHABLE_KEYS`
     (JSON indexado por nombre, igual que `SUPABASE_SECRET_KEYS`).
     Nunca `Deno.env.get('SUPABASE_ANON_KEY')` a pelo: `clavePublicable()`, o
     `clavePublicableOpcional()` si la función ya trata la ausencia como caso normal.
   - **Para saber quién usa todavía una clave heredada, los logs lo dicen:** `edge_logs`
     guarda `request.sb.jwt.apikey.payload.role` por petición. `anon`/`service_role` = clave
     heredada; vacío = clave nueva (no son JWT y no tienen carga). Es la única forma fiable
     de contestar "¿puedo apagarlas ya?" — el `curl` a `/rest/v1/` NO sirve, devuelve 401
     con cualquier clave, viva o muerta.
   - **APAGADAS. Fecha exacta: 29 ago 2026. Último 200 a las 11:16:20 UTC, primer 401 a las
     11:18:17 UTC.** Estado de los tres pasos manuales que quedaban:
     1. ✅ Publishable en `EXPO_PUBLIC_SUPABASE_ANON_KEY` de Vercel y redesplegado.
        Verificado en el bundle de producción, no en el código: 0 apariciones de la JWT
        heredada en `__common-*.js` y `entry-*.js`.
     2. ⚠️→✅ **Se hizo TARDE: la credencial de n8n se cambió después del apagón.**
        27 minutos de caída (11:18–11:45). Ver abajo lo que enseñó.
     3. ✅ Desactivadas en Settings → API Keys. `get_publishable_keys` da la `anon`
        con `disabled: true`.
     **Qué sobrevivió, comprobado en vivo el mismo día:** landing, portal público y app
     entera (login, RLS, agenda con datos), las 41 edge functions, el Vault (ya tenía
     `sb_secret_...`) y los 15 crons de `pg_cron`/`pg_net`. Desde el 28 ago a las 17:50 UTC
     ningún navegador había vuelto a usar la `anon` heredada: el cliente estaba migrado.

   > ### La caída de n8n del 29 ago 2026 (27 min) — lo que enseñó
   >
   > **Qué pasó.** Se desactivaron las heredadas antes de cambiar la credencial de n8n.
   > Sus tres workflows (`notificaciones_pendientes`, `expirar_citas_sin_senal`,
   > `marcar_notificacion_enviada`) devolvieron **401 cada 2 minutos de 11:18 a 11:40**:
   > ningún WhatsApp de ningún salón y los huecos de señal impagada sin liberar. Resuelto
   > a las 11:45 cambiando la credencial por la secret key del Vault (`service_role_key`).
   >
   > **Cómo se identifica en `edge_logs`:** `user_agent = axios/1.13.5` es n8n.
   > `rol_clave` (`request.sb.jwt.apikey.payload.role`) con valor = clave HEREDADA;
   > **vacío = clave nueva** (no son JWT, no tienen carga). Ese campo pasando de
   > `service_role` a vacío es la prueba de que el cambio entró.
   >
   > **Trampa que sigue viva:** una secret key **no es un JWT**. En un nodo *HTTP Request*
   > con `Authorization: Bearer` no cuela — va en la cabecera **`apikey`**. Con el nodo
   > Supabase nativo da igual: manda las dos.
   >
   > **No hubo backlog que recuperar, y no lo habrá la próxima.**
   > `notificaciones_pendientes` NO es una tabla de cola: calcula en vivo desde las
   > banderas de `citas` (`confirmacion_enviada`, `recordatorio_enviado`, `resena_enviada`,
   > `senal_enviada`). Al volver el servicio sale solo todo lo pendiente — se vieron 15
   > `marcar_notificacion_enviada` seguidas al restablecerse. Lo único que se pierde de
   > verdad es lo que se salga de su ventana durante la caída (el recordatorio de una cita
   > que ya pasó). Para medir el daño real de una caída, no busques una tabla:
   > `select count(*) from jsonb_array_elements(public.notificaciones_pendientes(500));`
   >
   > **La lección de orden:** antes de apagar una credencial, cambiarla PRIMERO en todo lo
   > que no despliegas tú (n8n, crons externos, integraciones). El código del repo estaba
   > listo desde el 28 ago; lo que falló fue lo que vive fuera de él.

   - **Vigilante `claves` (29 ago 2026).** `npm run vigilar` ahora falla si aparece una
     clave heredada o una `sb_secret_...` en cualquier fichero versionado, si una edge
     function lee `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` a pelo, si crea un
     cliente sin pasar por `claveServicio()`/`clavePublicable()`, o si el bundle de
     `web/app/` lleva una clave vieja (la trampa de la caché de Metro). Barre por
     `git ls-files --cached --others`: lo gitignorado no está publicado, y así tarda
     0,2 s en vez de 45. La publishable NO es un hallazgo (es pública por diseño) y las
     fixtures cortas tipo `sb_secret_nueva` tampoco.
   - **En scripts de Node la variable es `SUPABASE_SECRET_KEY`**, no la heredada. Los que
     tiraban solo de `SUPABASE_SERVICE_ROLE_KEY` (importadores, diagnósticos, seed, worker
     de VeriFactu) ya prefieren la nueva y caen a la vieja solo por compatibilidad.
   - Tests: `deno task test:claves` (edge) · `npm run vigilar:test` (vigilante).
   - Trampa de Windows: **nunca `echo "X=y" >> .env`** en PowerShell. Escribe UTF-16 y deja el
     fichero ilegible para el CLI de Supabase. A mano, con el editor.

10. **VIGILANTES: lo que se rompe en silencio ya tiene quien lo mire (28 ago 2026).**
    Detalle y runbook: `docs/superpowers/plans/2026-08-28-vigilantes-de-regresion.md`.
    - **Tres capas.** (1) `scripts/vigilantes/*.mjs`: invariantes estáticos, sin red, en
      cada PR (`npm run vigilar`). (2) `public.vigilancia_bd()`: lo que solo se puede
      comprobar dentro de Postgres (la regla del parámetro, RLS sin InitPlan, ayudantes
      volátiles). (3) `tests/smoke/`: una pantalla, un test — carga, consola, red y
      botones. Las tres publican en la pestaña **Salud** del panel de staff.
    - **Dos niveles.** `bloqueante` tumba la CI (un usuario real vería algo falso o roto);
      `aviso` solo informa. La deuda heredada nace en `aviso` con línea base congelada
      (`scripts/vigilantes/knip-baseline.json`): así el trinquete solo gira hacia abajo y
      nadie acaba quitando el linter porque la CI lleva un mes en rojo.
    - **Un ancla perdida FALLA.** Si un regex deja de casar, el vigilante se ha quedado
      ciego y eso es un hallazgo bloqueante, no un verde. Es el único modo de que esta
      herramienta no se pudra sola. Si molesta, se arregla el ancla, nunca la comprobación.
    - **Salud ≠ Errores.** `errores_cliente` es "se rompió en casa de un cliente real, ya
      pasó, hay alguien esperando". `vigilancia_*` es "lo cazamos antes". Mezclarlas
      entierra el crash de un salón que paga bajo 66 exports muertos. Por eso son dos
      tablas y dos pestañas.
    - **Los invariantes repartidos son la fábrica de regresiones**, no el código: precios
      en 3 sitios, referidos en 4, tipos de solicitud en 2. Al añadir uno nuevo, añade su
      vigilante en el mismo commit o la próxima deriva será silenciosa otra vez.
    - **GitHub Actions NUNCA ve una clave de Supabase.** El recolector
      (`registrar-vigilancia`) autoriza con `VIGILANCIA_TOKEN`, un token propio que solo
      sirve para escribir en `vigilancia_*`. Va con `verify_jwt = false` y por eso
      comprueba por su cuenta (regla 9).
    - **El canario mudo no es verde.** Si lleva más de 26 h sin correr,
      `staff_vigilancia_resumen` lo marca y el panel lo dice: un panel en verde porque
      nadie está mirando es peor que uno en rojo.
    - Correr: `npm run vigilar` · `npm run vigilar:bd` · `npm run vigilar:test` ·
      `npx playwright test tests/smoke --project=publico`.
    - **Radar de GitHub (29 ago 2026, familia 12 de la fase 2).** Lo que ya existía,
      instalado y no construido; los vigilantes propios siguen siendo los únicos que
      entienden de invariantes Mecha. Detalle:
      `docs/superpowers/plans/2026-08-29-vigilantes-fase2-radiografia.md` §12.
      - **Semgrep + zizmor** (workflow `seguridad.yml`) nacieron sustituyendo a
        CodeQL (entonces imposible: repo privado de cuenta personal, exige
        GHAS); desde que el repo volvió a público conviven con CodeQL default
        setup. Semgrep: solo severity ERROR bloquea; los falsos positivos se
        ignoran con `// nosemgrep` INLINE en la línea del hallazgo y comentario de
        por qué (precedente: el 3DES-CBC de Redsys es node-forge, no crypto de Node).
        zizmor: `--min-severity medium`, y las acciones van fijadas por SHA (con
        `# vX` al lado) — una acción nueva sin fijar vuelve a ponerlo en rojo.
      - **CodeQL default setup** activado (el repo volvió a ser público el 29 ago).
      - **Renovate** (`.github/renovate.json`) agrupa expo y supabase; sus PRs pasan
        la CI completa antes de mergearse. **CodeRabbit** (`.coderabbit.yaml`) es el
        revisor IA; sus comentarios son SIEMPRE aviso, nunca bloquean — la IA no
        tumba una CI. Sus instrucciones: `.github/copilot-instructions.md`.
      - **Node 22 en CI/Canario** (no 20): `node --test` no expande globs en 20 y
        `vigilar:test` nació muerto en CI sin que nadie lo viera hasta el 29 ago.
    - **Rendimiento medido, no opinado (29 ago 2026, familia 1 de la fase 2).**
      El smoke ya MIDE además de comprobar: `ms_carga`, long tasks (>50 ms),
      fps de scroll y **peticiones a Supabase por pantalla** (el detector de N+1).
      - Dos líneas base **por origen** (`tests/smoke/rendimiento-baseline.json`
        la CI local, `...baseline.canario.json` producción): producción carga
        ~5× más rápido que el espejo de CI y comparar una contra la base de la
        otra es puro ruido. El canario mide como un usuario de verdad cada hora.
      - Solo degeneración extrema (carga >3× base y >15 s) es `bloqueante`;
        todo lo demás avisa. Bajar la base es `--aprobar` (`--origen canario`
        para la suya): un acto consciente cuyo diff se ve en el repo.
      - El fps del runner de CI (headless, sin GPU) no es fiable: solo avisa
        si es injugable (<30). El aviso de fps que importa es el del canario.
      - Peso del bundle: `scripts/vigilantes/peso-bundle.mjs` tras `build:web`
        avisa si sube >5% sobre `scripts/vigilantes/peso-baseline.json`
        (8,20 MB / entry 1,05 MB congelados el 29 ago).

## Convenciones de código

- Código en inglés, comentarios en español (sin emojis en código/UI).
- Marca "fuego": acento `#f4501e` (profundo `#c0260a`), fondos crema (`#f6f1ea`/`#fffdfb`).
  Tokens en `lib/designTokens.ts` (ojo: los `.web.tsx` aún redefinen TOKENS locales — deuda C14).
- **Móvil primero en la web app:** usar `useResponsive()` (`lib/hooks/useResponsive.ts`,
  isMobile <768) en TODA pantalla nueva. Trampas conocidas ya corregidas que no hay que repetir:
  - Grids con columnas px fijas (`'1fr 110px...'`) aplastan la columna `1fr` en móvil →
    usar layouts apilados o `minmax(0,1fr)` (los grid items no encogen sin minWidth 0).
  - Filas de cabecera con botones: `flexWrap` + textos cortos en móvil.
  - El átomo `Section` (SettingsAtoms) ya envuelve su header; `FieldRow` ya apila en móvil.

## Cómo ejecutar y probar

```bash
npm run build:web          # compila la app a web/app (necesario tras tocar app/, lib/, components/)
node scripts/serve-web.mjs # espejo local de Vercel en http://localhost:8080
npx tsc --noEmit           # typecheck (ignorar errores de supabase/functions: son Deno)
```
- Landing: `http://localhost:8080/` · Demo sin gastar visitas: `/demo.html?share=1`
- Software: `/app` (login por `/acceso.html`) · Portal demo: `/app/r/demo`
- La demo es interactiva y comparte datos: si alguien los ensucia, re-sembrar el tenant demo.

## Estado y pendientes (actualizado 17 jun 2026 — detalle en informes/MEGA_INFORME_MECHA.md y sus adendos)

- Hecho y verificado: portal+QR, reseñas, lista de espera (v1), bloqueo clientes, etiquetas,
  consentimientos, fidelización v1, demo compartida estable, móvil de landing y software,
  endurecimiento de seguridad (exec_sql fuera, addons cerrados, anti-abuso, bucket privado).
- Hecho 13-14 jun (rama `feat/portal-reserva-online` lista para mergear a `master` para producción):
  landing recortada/premium + `especificaciones.html` aparte con acordeón interactivo y detalles;
  **login SSO de Google arreglado** (la landing maneja el callback que aterriza en la Site URL);
  inputs del software ya no se salen del marco (`box-sizing:border-box` global); equipo/informes sin
  scroll horizontal en móvil; botón "Volver a la web" en Ajustes móvil; tab bar móvil afinada;
  **rediseño total de la navegación móvil** (panel lateral deslizante sin overflow); cita sintética
  para el tour de la demo (para evitar campos vacíos); y ficha/cierres sticky en móvil.
- **IA / mensajería / pagos (Alexandro, en `master`, 16-17 jun) — HECHO:**
  - **RPCs base agentes IA (A1–A6):** `identificar_cliente`, `citas_de_cliente`, `cancelar/modificar_cita_publica`,
    `crear_cita_publica` con canal, `cita_publica` (getter anónimo), tabla+RPC `conversaciones_ia`.
  - **Motor de notificaciones WhatsApp** ACTIVO (workflow n8n, cron-pull 2 min): confirmación + recordatorio +
    petición de reseña + **enlace de señal**; al reagendar reenvía la confirmación. Validado E2E (envío real a móvil).
  - **Agente WhatsApp entrante** (n8n + LLM gpt-4o vía OpenRouter + RPCs): responde, consulta catálogo y reserva.
  - **Stripe señal P1:** edge functions `crear-checkout-senal` + `stripe-webhook` (ya en `supabase/functions/`),
    **página de pago `/app/pago/[ref]`** (+ `/app/pago/ok`), y **cron de expiración** (`expirar_citas_sin_senal`:
    libera el hueco si no se paga en 15 min, workflow n8n "Mecha — Expirar señales").
  - **Página de autogestión del cliente `/app/cita/[id]`** (ver/cambiar/cancelar). Rutas `cita` y `pago`
    exentas de los guards de auth en `app/_layout.tsx` (como `r`/`resena`).
- **Precios PÚBLICOS (reestructura del 7 ago 2026):** Esencial **39 €/mes**, Estudio **59 €/mes**
  (+IVA) — mismo software completo en los dos, la diferencia de precio no gatea nada. Aparte y
  opcional sobre cualquiera de los dos: addon **Recepcionistas** (IA), por WhatsApp +19 €/mes, por
  voz +29 €/mes, o completo (WhatsApp+voz) +39 €/mes. 1 mes gratis sin tarjeta, sin permanencia, 0%
  comisiones, profesionales ilimitados. Viven en TRES sitios que hay que cambiar a la vez: la sección
  `#precios` de `web/index.html` (incluidos los datos estructurados y el FAQ), el `SYSTEM_PROMPT` de
  `supabase/functions/chispa-landing/index.ts` (el asistente los recita de memoria) y `lib/planes.ts`.
- **REFERIDOS (tabla fijada el 23 ago 2026).** Red de 3 niveles: **−10 %** por cada salón que traes
  tú, **−4 %** por los que traen ellos y **−2 %** por el tercer nivel, **tope 30 %**. Al llegar al
  tope, cada salón de pago que sigue entrando da **1 mes gratis** en vez de más porcentaje. Quien
  entra con tu enlace: **−15 %** de bienvenida + migración y configuración sin coste.
  Fuente única: `archive/migraciones-legacy/referidos-tope-30-y-meses-gratis.sql`. Vive en CUATRO sitios que hay
  que cambiar a la vez: esa migración, la sección `#hermano` de `web/index.html` (con su FAQ en los
  datos estructurados), el modal "Recomendar" de `web/demo.html` y `TabReferidos` en
  `app/(tabs)/configuracion.web.tsx`. Ojo con dos trampas ya pisadas: el motor contaba solo
  `plan='full'` (valor histórico, hoy no lo tiene casi nadie) y el plan por sí solo no dice que
  alguien pague — hace falta `suscripcion_estado`; y cuenta solo el `owner`, o un salón con seis
  empleados valdría por seis referidos.
- **QUIÉN PAGA (`suscripcion_estado`), y cómo se marca (23 ago 2026).** Es la única columna que
  dice si un salón paga; el plan no (un salón en prueba también tiene plan `estudio`). Normalmente
  la escribe **solo** el webhook de Stripe (`aplicar_suscripcion_stripe`, service_role). Para quien
  paga por transferencia, en efectivo o con un acuerdo aparte está `staff_set_cobro_manual`
  (`archive/migraciones-legacy/staff-marcar-cobro-fuera-de-stripe.sql`), en el panel de staff → Cuentas → "Cobro".
  Reglas: **Stripe manda** (si hay `stripe_subscription_id` la RPC se niega, o el siguiente evento
  lo revertiría), se marca en la fila del `owner`, no se marca un plan `free`, es reversible
  (guarda el estado previo) y deja rastro en `eventos_negocio`. **No es para regalar acceso**: una
  cortesía va por la prueba de 30 días o `staff_grant_full_access`, y no debe contar como referido
  de pago. `activa` significa siempre "este salón paga".
- **PLANES que limitan de verdad (3 ago 2026, IA separada en addon el 7 ago 2026).** `profiles.plan`
  ∈ `free | esencial | estudio` (`full` = valor histórico, se lee como `estudio`; ninguna cuenta
  antigua pierde nada). **Fuente única de qué incluye cada plan: `lib/planes.ts`** — debe cuadrar
  con la sección de precios.
  - Esencial y Estudio dan el mismo software (agenda, fichas, portal, recordatorios, caja, informes,
    equipo, presupuestos, inventario, reseñas, señales, campañas, lista de espera, VeriFactu).
  - La IA (Chispa por WhatsApp y el agente de voz) ya NO depende del plan: es el addon
    `profiles.ia_nivel` (`ninguna | whatsapp | voz | completa`), ortogonal a Esencial/Estudio.
  - Se aplica en: menú lateral (esconde lo que no entra), pantallas (`withPlanGate`/`ia_nivel`) y
    **servidor** (la edge `agenda-asistente` devuelve 402 sin el nivel de IA correspondiente: gasta
    tokens, esconder el botón no es un control de acceso).
  - El plan lo contrata el **SALÓN, no la cuenta**: la fuente es el `owner` y el resto del equipo
    lo hereda (`plan_del_negocio` / `sincronizar_plan_negocio`). `staff_set_plan` y
    `staff_grant_full_access` propagan a todo el negocio. `demo_salon_001` queda fuera.
  - `profiles.plan` **no se puede tocar desde el cliente**: el trigger `guard_profile_identity_columns`
    congela `role`, `negocio_id` **y `plan`**. Solo cambia dentro de funciones `security definer`
    que marquen `mecha.identity_ctx`. (Antes cualquiera se ponía `plan='estudio'` y el 402 del
    servidor no servía de nada, porque leía ese mismo campo.)
  - `demo_salon_001` está EXENTA: la demo es el escaparate y debe enseñarlo todo.
- **ECOSISTEMA DE CUENTAS: propietario + trabajadores (3 ago 2026).** Un salón = un `owner` (quien
  paga) + sus trabajadores, todos con `negocio_id` común y su propio correo de acceso.
  - **Dos cosas distintas que se confunden:** la **ficha** (`profesionales`, la columna de la agenda,
    sirve aunque esa persona no entre nunca) y la **cuenta** (`profiles` + `auth`, el correo con el
    que se entra). Se unen por `profesionales.profile_id`. Ficha sin cuenta = normal; cuenta sin
    ficha (rol profesional) = error, entra pero nadie puede darle citas.
  - **Tener perfil ≠ poder entrar.** El perfil se crea AL INVITAR. El estado real (`activa` /
    `pendiente`) sale de `auth.users.last_sign_in_at` vía la RPC **`equipo_cuentas()`** (owner/admin).
  - **Invitar / reenviar / revocar**: todo en la edge `crear-acceso-empleado` (campo `accion`).
    La invitación aterriza en **`/restablecer.html`**, donde la persona ELIGE SU CONTRASEÑA
    (antes iba a `acceso.html`, que la trataba como login normal: entraba una vez y nunca más).
    Al invitar se puede pasar `profesional_id` (vincula la ficha en el servidor) o `crear_ficha`.
  - Capa común en el cliente: **`lib/equipoAccesos.ts`** — la usan Equipo y Ajustes → Accesos y roles.
  - Un trabajador NO ve la pantalla de "completa tu salón" ni la de contratar: `acceso.html`
    distingue por `role`.
  - El tenant de la demo **no expone cuentas reales**: ahí nacen todos los registros, así que la
    política de SELECT y `equipo_cuentas()` filtran por `profiles.es_cuenta_demo` (las 4 de atrezzo).
- **Contacto comercial: TRES vías** en `#precios` (llamada de 10 min · mensaje · "quiero el
  software"). Todas dejan la solicitud en `solicitudes` **y** avisan por correo con la edge
  `notificar-solicitud` (SMTP de Hostinger): a `contacto@mechaa.es` con los datos y al interesado
  la confirmación. Al añadir un `tipo` de solicitud hay que tocar DOS sitios: la función
  `crear_solicitud_publica` **y** el CHECK de la tabla `solicitudes`.
- **Contraseñas filtradas: RESUELTO sin Supabase Pro.** La opción "Leaked password protection" del
  dashboard es de plan de pago, así que la comprobación se hace por nuestra cuenta contra
  HaveIBeenPwned con k-anonimato: en el servidor al crear cuenta (`supabase/functions/signup-free`)
  y en el navegador al cambiarla (`web/assets/auth.js`). NO buscar el interruptor del dashboard.
- **Pendientes prioritarios:**
  1. Manual (Carlos): rotar credenciales Google de `Documentacion/n8n/`.
  2. UI (Carlos): badge "señal pagada" en la ficha de la cita.
  3. Stripe: cobro por QR en el local (P2) — §8 del informe.
  4. Matching automático de lista de espera + avisos (el motor de envío ya existe = Alexandro; falta el matching SQL).
  5. Operacionalizar el **agente de voz Retell** (Alexandro; número Zadarma ya disponible) — se deja para el final.
  6. Externo (usuario): apuntar **DNS de `mecha.app`** a Vercel + pasar la app Meta a producción (para clientes reales).
  7. Caja fiscal M-CJ (doc modular 5): NO improvisar, requiere fiscalista.
- **No hacer aún** (disciplina del dossier): inventario, app nativa del cliente final,
  contabilidad, marketplace, precios dinámicos.
