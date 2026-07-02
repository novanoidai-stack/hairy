# Plan de blindaje, hardening y compliance — Mecha

**Fecha:** 2 de julio de 2026
**Alcance:** auditoría estática del repo + advisors de seguridad de Supabase (proyecto `vtrggiogjrhqtwbhbgia`) pasados hoy (145 avisos analizados) + revisión de edge functions, cabeceras Vercel, manejo de sesión y flujo de subida de archivos.
**Enfoque:** ingeniería defensiva, OWASP Top 10, RGPD/LOPDGDD. Sin claims falsos (regla de la casa #5): este documento distingue siempre entre lo VERIFICADO hoy y lo pendiente.

---

## 0. Resumen ejecutivo — hallazgos verificados hoy

### Lo que YA está bien (verificado, mantener; no es teoría)

| Área | Evidencia |
|---|---|
| Cabeceras base | `vercel.json`: HSTS con preload, `X-Content-Type-Options`, `X-Frame-Options SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP |
| Webhook Stripe | Verificación de firma, protección anti-replay (5 min), idempotencia con tabla `stripe_webhook_eventos` (`supabase/functions/stripe-webhook/index.ts`) |
| RLS multi-tenant | `negocio_id` en todas las políticas; round 3 (1 jul) cierra el leak de cobros/fichajes por rol |
| Inmutabilidad de caja | `compliance-antifraude-inmutabilidad.sql` aplicada (1 jul) |
| Storage | Bucket `cliente-fotos` privado, signed URLs, path por negocio/cliente, nombre aleatorio (UUID), extensión saneada |
| Anti-abuso portal | RPCs `security definer` con límites por teléfono/IP/negocio, captcha, teléfonos E.164 |
| XSS en panel staff | `admin.html` escapa todo con `esc()` (revisado línea a línea el render de solicitudes/cuentas) |
| CORS | `signup-free` usa allowlist de orígenes con `Vary: Origin` |
| service_role | Solo vive en edge functions; nunca en cliente (verificado en `lib/supabase.ts` y `web/assets/`) |

### Hallazgos que corregir (priorizados)

| # | Prio | Hallazgo | Dónde | Acción |
|---|---|---|---|---|
| H1 | **P0** | **54 funciones `security definer` ejecutables por `anon`** y 84 por `authenticated` (advisors WARN). Incluye RPCs financieras y de administración: `crear_cobro_walkin`, `anular_liquidacion`, `generar_liquidacion`, `marcar_liquidacion_pagada`, `actualizar/eliminar_producto`, `registrar_movimiento_inventario`, `importar_citas_csv` | BD remota | Matriz REVOKE/GRANT (§2.3) |
| H2 | **P0** | **Sin Content-Security-Policy.** La cabecera más importante contra XSS/exfiltración no existe; con el JWT en localStorage (H9) es la mitigación principal | `vercel.json` | CSP Report-Only → enforce (§2.1) |
| H3 | **P0** | Política `solicitudes_insert_public` con `WITH CHECK (true)` para `anon`+`authenticated` (advisors WARN). Viola la regla propia "nunca USING(true) de escritura". El formulario web YA usa la RPC `crear_solicitud_publica` con rate-limit (verificado en `web/assets/auth.js:30`) y `signup-free` inserta con service_role (salta RLS) | tabla `solicitudes` | Drop de la política (§2.3) |
| H4 | **P0** | Edge function `apply-migrations` desplegada: primitiva "SQL por HTTP" residual. Está gateada por service_role, pero contradice la purga de `exec_sql`, tiene CORS `*` y comparación de secreto no constant-time | `supabase/functions/apply-migrations/` | Eliminar función y despliegue (§2.3) |
| H5 | **P0** | `importe_senal_servicio` sin `search_path` fijado (advisors WARN): riesgo de hijack de search_path en `security definer` | BD remota | `ALTER FUNCTION ... SET search_path` (§2.3) |
| H6 | **P0** | Leaked password protection desactivada (advisors WARN; ya estaba en pendientes) | Dashboard Supabase Auth | Toggle manual (usuario) |
| H7 | P1 | Límites de subida de fotos solo en cliente (5MB / `image/*` en `clientes.web.tsx`), saltables llamando a la API de Storage directo | Bucket `cliente-fotos` (y `servicio-fotos`) | `file_size_limit` + `allowed_mime_types` en el bucket (§1.6) |
| H8 | P1 | `signup-free`: sin tope de longitud en `nombre`/`salon`, devuelve `cErr.message` interno al cliente, sin rate-limit por IP propio | `supabase/functions/signup-free/index.ts` | Endurecer (§1.7) |
| H9 | P1 | JWT en `localStorage`/AsyncStorage (default de supabase-js en SPA sin servidor propio). No hay HttpOnly viable sin proxy; mitigar, no eliminar | `lib/supabase.ts`, `web/assets/auth.js` | CSP + TTL corto + MFA (§2.2) |
| H10 | P2 | 4 tablas con RLS activado y sin políticas (`cita_pago_enlaces`, `lista_espera_avisos`, `lista_espera_ofertas`, `stripe_webhook_eventos`). Es deny-all (seguro): solo las escribe service_role. Documentar como intencional para que nadie "lo arregle" abriendo un SELECT | BD remota | Comentario SQL (§2.3) |

---

## Bloque 1 — Fortalecimiento de entradas y validación de datos

### 1.1 Principio rector del proyecto (ya vigente, formalizarlo)

Todo lo que toca un usuario anónimo pasa por RPC `security definer` con validación en servidor; **nunca** SELECT/INSERT directo a `anon`. Esta decisión (vigente, decisión #2 del CLAUDE.md) es la línea de defensa principal y es correcta. Lo que falta es que la **superficie de funciones** expuesta coincida con la intención (H1) y que cada RPC valide con whitelist homogénea.

### 1.2 Plantilla de validación whitelist para toda RPC pública

Regla: dentro de cada función pública se valida **antes de tocar ninguna tabla**, con listas cerradas y rangos, y se responde con códigos de error genéricos (los mensajes bonitos los pone `lib/errores.ts` en cliente):

```sql
create or replace function public.crear_cita_publica(...)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp   -- SIEMPRE fijado (ver H5)
as $$
begin
  -- 1) Tipado: los argumentos SQL tipados (uuid, int, timestamptz) ya son
  --    parametrizados: no hay concatenación => no hay SQLi. PROHIBIDO
  --    EXECUTE format() con input de usuario sin quote_ident/quote_literal.

  -- 2) Longitudes máximas (whitelist de tamaño)
  if length(coalesce(p_nombre, '')) not between 2 and 80 then
    return jsonb_build_object('ok', false, 'error', 'nombre_invalido');
  end if;

  -- 3) Formatos cerrados
  if p_telefono !~ '^\+[1-9][0-9]{7,14}$' then          -- E.164 (ya normalizado)
    return jsonb_build_object('ok', false, 'error', 'telefono_invalido');
  end if;

  -- 4) Enums cerrados (nunca texto libre en campos de estado/canal)
  if p_canal not in ('portal', 'whatsapp', 'voz') then
    return jsonb_build_object('ok', false, 'error', 'canal_invalido');
  end if;

  -- 5) Rangos numéricos (importes SIEMPRE en cents, int, > 0 y con techo)
  if p_importe_cents is not null and (p_importe_cents <= 0 or p_importe_cents > 500000) then
    return jsonb_build_object('ok', false, 'error', 'importe_invalido');
  end if;

  -- 6) Fechas: solo futuro razonable
  if p_inicio < now() or p_inicio > now() + interval '90 days' then
    return jsonb_build_object('ok', false, 'error', 'fecha_invalida');
  end if;

  -- 7) Anti-abuso (ya existente: límites por teléfono/IP/negocio) ...
end $$;
```

**Acción:** pasar esta checklist a las RPCs públicas existentes (`crear_cita_publica`, `crear_cita_publica_grupo`, `modificar/cancelar_cita_publica`, `crear_resena_publica`, `enviar_mensaje_contacto_publico`, `aceptar_presupuesto_publico`, `presupuesto_enviar_mensaje_publico`, `confirmar_cita_oferta`) y anotar en cada una qué puntos cumple. La mayoría ya valida (round 2 anti-abuso); el gap típico es longitud máxima de textos libres (notas, mensajes).

### 1.3 Inyección SQL / NoSQL

- Estado: PostgREST + RPCs tipadas = consultas parametrizadas por construcción. No se encontró `EXECUTE format(` con input de usuario en `migrations/`.
- Regla permanente: si algún día hace falta SQL dinámico, `format('%I', ...)` para identificadores y `%L` para literales, nunca `%s`.
- Auditoría periódica (añadir al hábito post-migración junto a los advisors):
  `grep -rn "EXECUTE" migrations/ | grep -vi "quote_\|%I\|%L"`

### 1.4 XSS

- La app (React Native Web) escapa por defecto; no se usa `dangerouslySetInnerHTML`.
- En `web/*.html` (JS a mano) la regla es: **todo dato de usuario pasa por `esc()` antes de `innerHTML`**. `admin.html` ya lo cumple (verificado). Extender la misma función a cualquier página nueva que pinte datos de BD.
- La defensa de fondo contra el XSS residual es la CSP (§2.1): sin ella, un XSS roba el JWT de localStorage (H9).

### 1.5 Formularios

- Validación doble: cliente para UX (ya, con `lib/errores.ts`), servidor como autoridad (RPC/edge function). El cliente nunca es fuente de verdad.
- Captcha ya integrado en portal (`captcha-portal.sql` + `validate-captcha`); pendiente de credenciales (bloqueado, ya conocido).
- Honeypot barato para `crear_solicitud_publica`: campo oculto que un humano nunca rellena; si viene relleno, aceptar en silencio y marcar `estado = 'spam'` (no revelar la detección).

### 1.6 Carga de archivos (fotos de clientas y servicios)

Ya bien: bucket privado, signed URLs, nombre UUID, extensión saneada, path `negocio/cliente/`, validación cliente de tipo y 5MB. Faltan dos cierres server-side:

```sql
-- Los límites del cliente son saltables llamando a la API de Storage directo:
-- fijarlos también en el bucket (autoridad en servidor).
update storage.buckets
set file_size_limit = 5242880,  -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
where id in ('cliente-fotos', 'servicio-fotos');
```

Y un punto de privacidad sectorial: las fotos hechas con móvil llevan **EXIF con GPS** (domicilio del salón o de la clienta). Strip de EXIF antes de subir (en web: recodificar vía canvas ya lo elimina; barato de añadir al flujo de `clientes.web.tsx`). Es además argumento de venta (§4.3).

### 1.7 Edge functions (entradas HTTP directas)

Endurecer `signup-free` (patrón para las demás):

- Tope de longitud: `nombre`, `salon` ≤ 80 chars; `telefono` ≤ 20; rechazar payloads > 10 KB antes de parsear.
- No filtrar internals: quitar `detail: cErr.message` de la respuesta; loggear el detalle en servidor y devolver `create_failed` a secas.
- Rate-limit por IP (tabla + ventana, mismo patrón que `solicitudes-rpc-rate-limiting.sql`) — hoy solo hay señales antifraude post-hoc.
- Normalizar `telefono` a E.164 al entrar (ya existe la convención en BD).

---

## Bloque 2 — Arquitectura defensiva y configuración

### 2.1 Cabeceras HTTP: añadir CSP (H2)

La base actual de `vercel.json` es buena. Falta la CSP. Plan en dos fases porque la web estática tiene scripts inline y la SPA de Expo también inyecta estilos:

**Fase 1 (inmediata, sin riesgo de romper nada): Report-Only**

```json
{
  "key": "Content-Security-Policy-Report-Only",
  "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://vtrggiogjrhqtwbhbgia.supabase.co; connect-src 'self' https://vtrggiogjrhqtwbhbgia.supabase.co wss://vtrggiogjrhqtwbhbgia.supabase.co https://api.stripe.com; frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://accounts.google.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
}
```

Observar violaciones unos días en la consola (o con `report-to` si se quiere recolectar) y ajustar la allowlist real (p. ej. el captcha cuando se active, avatares de Google si los hay).

**Fase 2: enforce.** Renombrar a `Content-Security-Policy`. Para poder retirar `'unsafe-inline'` de `script-src` (el objetivo final) hay que mover los `<script>` inline de `web/*.html` a ficheros `.js` propios — trabajo mecánico, hacerlo página a página. `style-src 'unsafe-inline'` se queda: react-native-web inyecta estilos y es de bajo riesgo comparado con scripts.

Notas:
- `frame-ancestors 'self'` es compatible con la demo (demo.html embebe `/app` en iframe del MISMO origen) y sustituye a `X-Frame-Options` en navegadores modernos (mantener ambas).
- Añadir también `X-Permitted-Cross-Domain-Policies: none` (barato) y retirar `X-XSS-Protection` cuando la CSP esté en enforce (esa cabecera está obsoleta y en navegadores viejos podía introducir problemas; con CSP ya no aporta).

### 2.2 Sesiones, JWT y cookies (H9)

Realidad del stack: SPA estática + Supabase; supabase-js guarda el token en `localStorage` (web) / AsyncStorage (nativo). **No hay opción HttpOnly sin meter un backend proxy de sesión**, lo cual cambiaría la arquitectura entera (no lo recomiendo ahora). Estrategia de mitigación por capas:

1. **CSP en enforce** (§2.1) — la mitigación real del robo de token por XSS.
2. **TTL corto del access token**: Dashboard → Auth → Sessions: JWT expiry a 3600s (1h). La rotación de refresh tokens con detección de reuso ya viene activa por defecto en Supabase (documentarlo, no hay que hacer nada).
3. `detectSessionInUrl: false` ya está en `lib/supabase.ts` (evita fijación por URL). Para el SSO de Google, verificar que el flujo usa **PKCE** (`flowType: 'pkce'` donde se cree el cliente que maneja el callback en la landing).
4. **MFA (TOTP)** para cuentas owner/admin — Supabase Auth lo trae nativo; UI en Ajustes. Es P1 y además argumento de venta (§4.3).
5. **Leaked password protection ON** (H6, toggle manual) + política de contraseñas en dashboard (mínimo 8 ya se valida en `signup-free`; subir a "letras+números" en Auth settings para que también aplique a cambios de contraseña).
6. La sesión demo aislada (`storageKey: 'mecha-demo-auth'`) está bien diseñada: la cuenta demo es pública a propósito y RLS la limita; no tocar.
7. Cookies: el sitio apenas usa cookies propias; si se introduce alguna (analytics GA4 pendiente), con `Secure; SameSite=Lax` mínimo, y recogida tras consentimiento (banner ya existente en legales — verificar que GA4 no se cargue antes de aceptar).

### 2.3 RBAC y aislamiento multi-tenant (H1, H3, H4, H5, H10)

El modelo (roles `owner/admin/employee/recepcion` en `profiles.role` + `negocio_id` en toda política RLS) es correcto y el round 3 cerró el último leak conocido de lectura. Las acciones pendientes son de **superficie de ejecución**, no de modelo:

**a) Matriz REVOKE/GRANT de funciones (H1 — la acción más importante del plan).**
Hoy 54 funciones `security definer` son ejecutables por `anon`. Muchas fallarán internamente al no haber `auth.uid()`, pero la defensa en profundidad exige que la superficie visible coincida con la intención:

```sql
-- 1) Por defecto, las funciones nuevas NO son ejecutables por nadie no explícito
alter default privileges in schema public revoke execute on functions from public, anon;

-- 2) Cerrar el stock existente
revoke execute on all functions in schema public from anon, public;

-- 3) Reabrir SOLO la superficie pública intencional (portal + autogestión + reseñas)
grant execute on function public.portal_info(text) to anon;
grant execute on function public.portal_dias_disponibles(text, date) to anon;
grant execute on function public.disponibilidad_publica(...) to anon;
grant execute on function public.crear_cita_publica(...) to anon;
grant execute on function public.crear_cita_publica_grupo(...) to anon;
grant execute on function public.modificar_cita_publica(...) to anon;
grant execute on function public.cancelar_cita_publica(...) to anon;
grant execute on function public.cita_publica(...) to anon;
grant execute on function public.crear_resena_publica(...) to anon;
grant execute on function public.resenas_publicas(...) to anon;
grant execute on function public.crear_solicitud_publica(...) to anon;
grant execute on function public.enviar_mensaje_contacto_publico(...) to anon;
grant execute on function public.negocio_contacto_publico(...) to anon;
grant execute on function public.presupuesto_publico(...) to anon;
grant execute on function public.aceptar_presupuesto_publico(...) to anon;
grant execute on function public.presupuesto_enviar_mensaje_publico(...) to anon;
grant execute on function public.confirmar_cita_oferta(...) to anon;
grant execute on function public.deposito_dinamico_cents(...) to anon;   -- si lo usa la página de pago anónima

-- 4) Y el resto, solo a authenticated (con el chequeo de rol DENTRO de la función)
grant execute on all functions in schema public to authenticated;  -- o lista explícita, mejor
```

> Ojo con las firmas: `revoke/grant` requieren la signatura exacta; generar la lista con
> `select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';`
> Y probar el portal (`/app/r/demo`), la página de pago, autogestión de cita, reseñas y el agente WhatsApp de Alexandro **antes y después** (el agente usa varias de estas RPCs con anon key — coordinar con él la lista del paso 3).

Además, las RPCs internas sensibles (`crear_cobro_walkin`, `anular_liquidacion`, `generar_liquidacion`, `marcar_liquidacion_pagada`, `importar_citas_csv`, inventario) deben chequear el rol **dentro** de la función (owner/admin), no solo pertenecer al tenant. Auditar una a una; las de caja ya lo hacen en su mayoría (round 3 / antifraude), las de inventario son nuevas (1 jul) y hay que verificarlas.

**b) Drop de la política always-true (H3).** El formulario ya usa la RPC con rate-limit y `signup-free` escribe con service_role:

```sql
drop policy if exists "solicitudes_insert_public" on public.solicitudes;
-- Verificar tras el drop: formulario de la landing (auth.js -> crear_solicitud_publica)
-- y el alta free (signup-free, service_role: no le afecta RLS).
```

**c) Eliminar `apply-migrations` (H4).** Borrar la carpeta `supabase/functions/apply-migrations/` y des-desplegarla del proyecto. Su trabajo (crear `is_team_member`) ya está hecho y versionado en `migrations/apply-is-team-member.sql`. Es exactamente el tipo de primitiva que se purgó con `exec_sql`.

**d) Fijar search_path (H5):**

```sql
alter function public.importe_senal_servicio(...) set search_path = public, pg_temp;
-- Y de paso, verificación global de que ninguna otra security definer quede sin fijar:
select p.oid::regprocedure
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
```

**e) Documentar las tablas deny-all (H10):**

```sql
comment on table public.stripe_webhook_eventos is
  'RLS sin políticas A PROPÓSITO: solo escribe/lee service_role (webhook). No añadir políticas.';
-- ídem cita_pago_enlaces, lista_espera_avisos, lista_espera_ofertas
```

**f) Test de regresión de aislamiento (nuevo hábito).** Un script SQL de asserts que se pasa tras cada migración junto a los advisors: con un usuario de prueba del tenant A, comprobar que `select` sobre `clientes`, `citas`, `cobros`, `fichajes`, `presupuestos` filtrando por el tenant B devuelve 0 filas; y que un `employee` no ve cobros ajenos. Guardarlo en `migrations/tests/rls-asserts.sql` y correrlo con `execute_sql` del MCP. Barato y detecta regresiones de RLS al instante.

---

## Bloque 3 — Compliance, privacidad y RGPD

### 3.1 Registro de actividades de tratamiento (RAT — art. 30)

Documento (no código) que Mecha debe poder enseñar y que además es la base del "pack inspección" vendible (§4.3). Tratamientos mínimos:

| Tratamiento | Datos | Base legal | Retención |
|---|---|---|---|
| Agenda y citas | Nombre, teléfono, email, historial de citas | Ejecución de contrato (art. 6.1.b) | Mientras haya relación + 3 años |
| Ficha técnica de color | Fórmulas, resultados, fotos | Ejecución de contrato | Ídem |
| **Alergias/sensibilidad a tintes** | **Dato de salud (art. 9)** | **Consentimiento explícito (9.2.a)** | Ídem, con purga al borrar clienta |
| Comunicaciones WhatsApp/recordatorios | Teléfono, contenido | Consentimiento (ya: `consentimientos-gdpr.sql`) | Conversaciones IA: 12 meses (propuesto) |
| Fichajes de empleados | Jornada, horas | Obligación legal (registro horario, RDL 8/2019) | **4 años (obligatorio)** |
| Cobros y facturación | Importes, método | Obligación legal/fiscal | **6 años** (Código de Comercio; ampliable según fiscalista M-CJ) |
| Reseñas públicas | Nombre, texto | Consentimiento | Hasta retirada |

El punto de las **alergias es el más delicado del sector**: es categoría especial. Acciones: (1) añadir tipo de consentimiento explícito en el sistema de consentimientos ya existente; (2) restringir el campo por rol si no lo está; (3) opcional pero diferencial: cifrado a nivel de columna (pgsodium/Vault) para ese campo.

### 3.2 Subencargados (art. 28) — lista para DPAs y política de privacidad

Supabase (BD/Auth/Storage — **verificar que el proyecto está en región UE** en el dashboard; si lo está, documentarlo como residencia de datos UE), Vercel (hosting), Stripe (pagos), Meta/WhatsApp (mensajería), **OpenRouter/OpenAI** (agente IA: los mensajes de clientas viajan a un LLM en EE. UU. — hace falta: mención en la política de privacidad, DPA/SCCs, y **minimización**: no enviar al modelo más PII de la necesaria; p. ej. el agente no necesita apellidos ni email para reservar), Retell (voz, cuando se active: grabaciones de voz son especialmente sensibles — evaluar antes de producción), Resend (correo), n8n (verificar dónde está alojado: si es cloud, es otro subencargado; si es self-hosted de Alexandro, documentar la máquina). Esta parte es de Alexandro + Jose (textos).

### 3.3 Derechos de los interesados

- **Acceso/rectificación:** ya cubierto por la UI de clientes.
- **Supresión (derecho al olvido):** crear RPC `anonimizar_cliente(cliente_id)` para owner/admin: conserva las filas de `cobros`/facturación (obligación fiscal prevalece) pero rompe el vínculo PII (nombre → 'Cliente eliminado', teléfono/email/notas → null, fotos → delete del bucket + filas de `cliente_fotos`, consentimientos → revocados con timestamp). La web ya promete 30 días en `privacidad.html` — hoy no existe el mecanismo: **hay que construirlo para no incumplir lo publicado.**
- **Portabilidad:** export CSV/JSON de clientas+citas por negocio (botón en Ajustes). Existe el import (`importar_citas_csv`); falta el export. También es selling point (§4.2).

### 3.4 Retención automatizada

Con `pg_cron` (ya se usan crons vía n8n; esto puede ir en BD directamente):
- `conversaciones_ia`: purga > 12 meses.
- `solicitudes` (leads): purga > 24 meses.
- Señales antifraude/rate-limit: purga > 90 días.
- Fichajes y cobros: NO purgar (retenciones legales de §3.1).

### 3.5 Cifrado

- **En tránsito:** Vercel y Supabase fuerzan TLS 1.2+ con 1.3 preferido en sus edges, y HSTS con preload ya está en `vercel.json`. Nada que implementar; documentarlo tal cual (no prometer "TLS 1.3 only": el edge lo gestiona el proveedor).
- **En reposo:** Supabase (AWS) cifra volúmenes y backups con AES-256 por defecto. Documentar. Para el dato de salud (alergias) valorar la capa extra de cifrado de columna (§3.1).
- **Claves:** los secretos viven en env vars de Vercel/Supabase (correcto). Pendiente ya conocido y **urgente**: rotar las credenciales de Google de `Documentacion/n8n/`. Mantener la disciplina de `Documentacion/` fuera de git.

### 3.6 Incidentes (art. 33-34) — runbook mínimo

1. Contener (rotar service_role y claves afectadas desde dashboard; pausar workflows n8n si están implicados).
2. Evaluar alcance con logs de Supabase (`get_logs`) y Vercel.
3. Si hay riesgo para derechos: notificar a la **AEPD en 72h** (formulario sede electrónica) y a los afectados si el riesgo es alto.
4. Restaurar: backups diarios incluidos en el plan; **activar el add-on PITR** para recuperación a punto exacto (recomendado, §4.1).
5. Post-mortem en `informes/`.

### 3.7 Facturación fiscal (España)

La inmutabilidad de cobros ya aplicada (antifraude) va en la dirección del RD 1007/2023 (Veri*factu / sistemas informáticos de facturación). La doctrina del proyecto ya es la correcta: **la caja fiscal M-CJ no se improvisa, requiere fiscalista** antes de emitir facturas reales. Nada nuevo que añadir salvo no relajarlo.

---

## Bloque 4 — Propuesta de valor tecnológico y diferenciación

### 4.1 Disponibilidad honesta (regla de la casa: sin claims falsos)

Con Vercel + Supabase gestionados, el objetivo **creíble y defendible es ~99.9%**. Prometer 99.99% exigiría multi-región activa-activa y no es verdad hoy: no ponerlo en la landing. Lo que sí se puede construir y vender:

- **PITR (Point-in-Time Recovery)** en Supabase (add-on): recuperación al minuto, no solo backup diario. Es la mejora de resiliencia con mejor ratio coste/valor del plan.
- **Página de estado** (status page) pública simple + monitor de los crons n8n (si el motor de WhatsApp se cae, que lo sepamos antes que el cliente).
- **Tolerancia a caídas en el local:** el modo lectura offline/PWA de agenda y caja ya está en el roadmap POS — venderlo como "tu salón no se para aunque se caiga internet".
- **Export continuo:** el export de §3.3 también es un argumento anti-lock-in ("tus datos salen contigo cuando quieras").

### 4.2 Selling points de privacidad que YA existen (solo hay que contarlos)

Esto es lo más fuerte del bloque: casi todo está construido y verificado; falta narrarlo.

1. **"Tu cartera de clientas es tuya."** El contraste directo con Booksy/marketplaces: allí tus clientas entran en un marketplace que les promociona otros salones; en Mecha el aislamiento por negocio es una garantía técnica (RLS por `negocio_id` en cada tabla), no una promesa comercial. Encaja con la comparativa Booksy ya en backlog.
2. **Fotos privadas de verdad:** bucket privado + URLs firmadas caducables (nada de URLs públicas adivinables).
3. **Caja a prueba de manipulación:** registros de cobro inmutables (antifraude interno) — para el dueño significa "nadie de tu equipo puede borrar o retocar un cobro sin dejar rastro".
4. **Cada profesional ve solo lo suyo:** el round 3 de RLS (empleados no ven el dinero ni los fichajes de otros) es una feature de confidencialidad interna que ningún competidor de este segmento anuncia.
5. **Consentimientos RGPD integrados** en la ficha (WhatsApp, fotos) — el dueño va "listo para inspección".
6. **Datos en la UE** (confirmar región del proyecto y entonces afirmarlo).

### 4.3 Innovaciones baratas y vendibles (siguiente ola)

- **Página `/seguridad.html` (trust page):** medidas reales de este documento en lenguaje de dueño de salón. Coste: una página estática. Sin inventar certificaciones (no decir "ISO 27001" ni "encriptación militar").
- **MFA para el dueño** (§2.2): "tu negocio no se abre con una sola llave".
- **Pack inspección RGPD descargable:** botón que genera PDF con el RAT del negocio, consentimientos registrados y política de retención. Convierte el compliance (coste) en feature (valor). Ningún competidor del sector lo ofrece.
- **Strip EXIF/GPS en fotos** (§1.6): "las fotos de tus clientas no llevan su ubicación escondida".
- **Panel de privacidad del negocio:** vista en Ajustes con consentimientos activos, últimas exportaciones, y botón de anonimización de clienta (la RPC de §3.3 con UI).

---

## Reparto y orden de ejecución

**P0 — esta semana:**
| Acción | Owner |
|---|---|
| H1 matriz REVOKE/GRANT (coordinar lista de RPCs anon con el agente WhatsApp) | Carlos + Alexandro (lista) |
| H3 drop `solicitudes_insert_public` + verificación del form | Carlos |
| H4 borrar `apply-migrations` (repo + despliegue) | Carlos |
| H5 `search_path` en `importe_senal_servicio` + barrido global | Carlos |
| H2 CSP en Report-Only | Carlos |
| H6 leaked password protection + TTL 1h + verificar región UE (dashboard) | Usuario (manual) |
| H7 límites server-side de buckets | Carlos |
| Rotar credenciales Google de `Documentacion/n8n/` (pendiente previo, sigue abierto) | Usuario/Carlos (manual) |

**P1 — próximas 2 semanas:** CSP enforce (mover scripts inline), H8 endurecer `signup-free`, MFA owners (UI Ajustes), tests RLS `migrations/tests/rls-asserts.sql`, RPC anonimizar_cliente + export CSV (la promesa de 30 días de privacidad.html está publicada y sin mecanismo), auditoría de chequeo de rol en RPCs de inventario.

**P2 — mes:** pack RGPD (RAT + retención pg_cron + DPAs con Alexandro/Jose), trust page `/seguridad.html`, strip EXIF, PITR (decisión de coste con Jose), panel de privacidad, minimización PII hacia el LLM (Alexandro).

**Hábitos permanentes (ya casi todos vigentes):** advisors tras cada migración + asserts RLS + grep de `EXECUTE` dinámico; nunca `USING(true)` de escritura; `Documentacion/` fuera de git; sin claims falsos en la landing.
