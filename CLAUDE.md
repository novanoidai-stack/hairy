# CLAUDE.md — Contexto del proyecto Mecha (repo "Hairy")

> Claude Code lee este archivo automáticamente al arrancar en este repo.
> **Fuente de verdad del estado del producto: `MEGA_INFORME_MECHA.md`** (raíz).
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
- **Migraciones:** archivos en `migrations/` + aplicadas en remoto (las últimas vía MCP de
  Supabase; el historial remoto manda). Edge functions en `supabase/functions/`.

## Decisiones de diseño VIGENTES (no romper)

1. **Demo compartida:** TODO visitante ve la misma demo (tenant `demo_salon_001`).
   - `demo.html` embebe `/app?demo=1` en un iframe.
   - En modo demo la app usa una **sesión Supabase aislada** (`storageKey: 'mecha-demo-auth'`,
     ver `lib/supabase.ts`) y entra sola con `demo.publico@mecha.app` / `MechaDemoView_2026`
     (credenciales públicas a propósito). La sesión personal del visitante NO se toca.
   - Solo cuenta como demo si va EMBEBIDA en iframe del mismo origen; `/app?demo=1` directo no.
   - `demo.publico` está EXENTA del límite de 3 visitas (los prospectos free no).
   - Las cuentas nuevas (web y nativo) nacen en `demo_salon_001` plan free; el negocio propio
     se asigna al dar acceso completo (`staff_grant_full_access`). NUNCA crear perfiles con
     `negocio_id` propio en el signup.
2. **Portal público de reserva:** `/app/r/<slug>` (+ reseñas en `/app/resena/<slug>`).
   Anónimo; todo pasa por RPCs `security definer` (`portal_info`, `disponibilidad_publica`,
   `crear_cita_publica`, `crear_resena_publica`, `resenas_publicas`) con **anti-abuso en
   servidor** (límites por teléfono/IP/negocio). NO abrir SELECT directo a `anon`.
   Las rutas `r` y `resena` están exentas de los guards de auth en `app/_layout.tsx`.
3. **Fotos de clientas:** bucket `cliente-fotos` PRIVADO, políticas por carpeta de negocio,
   render con `createSignedUrls` (no `getPublicUrl`).
4. **Seguridad:** tras CUALQUIER migración, pasar los advisors de Supabase (security).
   Nunca políticas `USING (true)` de escritura, nunca funciones tipo `exec_sql`.
   `Documentacion/` está en `.gitignore` porque contiene client secrets de Google — no versionar.
5. **Sin claims falsos:** nada de reseñas/ratings inventados en structured data ni cifras
   sin fuente en la landing (ya se retiraron una vez).

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

## Estado y pendientes (13 jun 2026 — detalle en MEGA_INFORME_MECHA.md y su adendo, §ADENDO G)

- Hecho y verificado: portal+QR, reseñas, lista de espera (v1), bloqueo clientes, etiquetas,
  consentimientos, fidelización v1, demo compartida estable, móvil de landing y software,
  endurecimiento de seguridad (exec_sql fuera, addons cerrados, anti-abuso, bucket privado).
- Hecho 13 jun (commit `4f3b97b`, preview de Vercel verde — falta merge a `master` para producción):
  landing recortada/premium + `especificaciones.html` aparte; **login SSO de Google arreglado**
  (la landing maneja el callback que aterriza en la Site URL); inputs del software ya no se salen
  del marco (`box-sizing:border-box` global); equipo/informes sin scroll horizontal en móvil;
  botón "Volver a la web" en Ajustes móvil; tab bar móvil afinada.
- Pagos (Alexandro, en `master`): modelo de datos de señal (tabla `pagos`) + RPC
  `requerir_senal_cita` ya aplicados. Falta la pasarela (Checkout+webhook) y la UI del pago.
- **Pendientes prioritarios:**
  1. Manual (Carlos): rotar credenciales Google de `Documentacion/n8n/`; activar
     "Leaked password protection" en Supabase Auth (dashboard).
  2. RPCs A1–A6 (base agentes IA: identificar cliente por teléfono, cancelar/modificar cita,
     canal+autoría IA, credencial de servicio, webhook saliente) — §7 del informe.
  3. Cancelar/modificar cita desde el portal (criterio de lanzamiento del dossier).
  4. Stripe: señal anti no-show (P1, backend ya empezado por Alexandro — falta pasarela+UI)
     y cobro por QR en el local (P2) — §8 del informe.
  5. Matching automático de lista de espera + avisos (motor de mensajería = Alexandro).
  6. Caja fiscal M-CJ (doc modular 5): NO improvisar, requiere fiscalista.
- **No hacer aún** (disciplina del dossier): inventario, app nativa del cliente final,
  contabilidad, marketplace, precios dinámicos.
