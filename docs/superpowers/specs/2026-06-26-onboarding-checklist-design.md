# Diseño: Checklist de puesta en marcha del salón ("Pon en marcha tu salón")

- Fecha: 2026-06-26
- Autor: Carlos + Claude
- Estado: aprobado el diseño; pendiente de revisión del spec antes de plan de implementación
- Reparto: Carlos (UI + lógica de solo lectura en el cliente). No toca mensajería, dinero, IA ni OAuth.

## 1. Problema y objetivo

Cuando un cliente real entra por primera vez en el software (ya con su negocio propio,
tras `staff_grant_full_access`), no tiene una guía de qué configurar para quedar operativo.
Hoy puede dejar el salón a medias (sin servicios, sin horarios de equipo, sin portal) y no
darse cuenta de por qué "no funciona".

Objetivo: un **checklist de puesta en marcha** que:
- Aparece en el panel de **Avisos** (la campana de la agenda) como entrada destacada.
- Abre un **panel dedicado** con los pasos, cada uno con una explicación de **qué es y por qué**,
  y un botón **"Configurar →"** que redirige al sitio exacto.
- Cada paso **se marca hecho solo cuando se cumple su mínimo real** (lo decide el dato, no un click).
- **Se cierra y desaparece solo** cuando el salón está operativo.

## 2. Decisiones de diseño (cerradas con el usuario)

1. **Colocación:** entrada en Avisos → abre un **panel dedicado** (no todo embebido en el
   desplegable, que es estrecho en móvil). Elegido sobre "todo en el desplegable" y "wizard al entrar".
2. **Completado derivado del dato (no flags manuales):** el estado de cada paso se calcula
   leyendo los datos reales. Si borran un servicio, el paso se vuelve a abrir solo. Imposible
   quedar "hecho" en falso.
3. **Cálculo en el cliente (sin migración ni RPC):** el dueño ya tiene permiso RLS de lectura
   sobre todas las tablas implicadas (las pantallas de Ajustes/Equipo ya las consultan). Un hook
   `useOnboardingStatus` hace unas pocas consultas pequeñas en paralelo. Se evita SQL nuevo,
   advisors y coordinación de backend. (Alternativa futura: un RPC `onboarding_status` si se
   quiere una sola llamada; no necesario ahora.)
4. **Graduación por necesidad objetiva de operar** (no por valor de producto). El orden del
   panel va de más urgente a menos.
5. **Línea de "operativo" = pasos 1–5** (Imprescindible + Necesario). Al completarlos, la tarjeta
   de Avisos desaparece. Los Recomendados (6–8) no bloquean la desaparición (tienen "Omitir").
   Los Opcionales (9–10) ni cuentan.

## 3. Los pasos (graduados por necesidad)

Cada paso define: nivel, **predicado de "hecho"** (cómo lo detecta el dato), **destino** (deep-link)
y **copy** (qué es y por qué). Copy final pulible en implementación; intención fijada aquí.

| # | Paso | Nivel | Predicado "hecho" | Destino |
|---|------|-------|-------------------|---------|
| 1 | Crea tus servicios | Imprescindible | ≥1 fila en `servicios` con `activo=true`, `precio>0` y duración activa `>0` | Ajustes › Servicios (`configuracion?tab=servicios`) |
| 2 | Da de alta tu equipo | Imprescindible | ≥1 fila en `profesionales` con `activo=true` | Equipo (`/(tabs)/equipo`) |
| 3 | Define el horario de cada profesional | Imprescindible | **cada** profesional activo tiene ≥1 fila en `horarios_profesional` | Equipo › ficha (`/(tabs)/equipo?focus=horarios`) |
| 4 | Fija el horario del salón | Necesario | ≥1 fila en `negocio_horarios` con `abierto=true` y `apertura`/`cierre` no nulos | Ajustes › Horarios (`configuracion?tab=horarios`) |
| 5 | Completa los datos del negocio | Necesario | `negocio_config.config` con `nombre`, `direccion` y `telefono` no vacíos | Ajustes › General (`configuracion?tab=general`) |
| 6 | Activa la reserva online | Recomendado | fila en `negocio_portal` con `slug` no nulo y `activo=true` | Ajustes › Reserva online (`configuracion?tab=reserva`) |
| 7 | Sube fotos a tus servicios | Recomendado | **todos** los servicios activos tienen `foto_url` no nulo | Ajustes › Servicios (`configuracion?tab=servicios`) |
| 8 | Activa recordatorios por WhatsApp | Recomendado | `negocio_config.config.notifRecordatorioActiva = true` | Ajustes › Notificaciones (`configuracion?tab=notificaciones`) |
| 9 | Señal / pago online | Opcional | (no cuenta para el checklist) | Ajustes › Notificaciones / pago |
| 10 | Comisiones del equipo | Opcional | (no cuenta para el checklist) | Ajustes › Comisiones |

Copy de ejemplo (paso 3): *"Define qué días y horas trabaja cada persona. La agenda y la
reserva online solo ofrecen huecos dentro de ese horario: sin él, no se puede reservar con esa
persona."*

Nota de alcance: los pasos 9–10 se mencionan en el panel como "extras opcionales" pero **no son
items con check** ni bloquean nada. Pueden omitirse del v1 si recargan; se deja como decisión menor.

## 4. Lógica de completado y desaparición

- **Por paso:** `hecho = predicado(datos)`. Mientras no se cumpla, el paso sigue abierto; al
  pulsarlo redirige a su destino. **Al volver a la agenda / reabrir el panel se recalcula** el
  estado (re-fetch) y el paso se tacha solo si ya cumple.
- **Núcleo (1–5):** `coreDone = pasos 1..5 todos hechos`.
  - `coreDone === false` y elegible → la **tarjeta de Avisos se muestra** (con su punto en la campana).
  - `coreDone === true` → la **tarjeta desaparece** de Avisos (operativo). El panel deja de saltar solo.
- **Recomendados (6–8):** se listan en el panel; cada uno con **"Omitir"**. No bloquean la
  desaparición del núcleo. "Omitir" se recuerda para no volver a ofrecerlo.
- **Reapertura:** tras el núcleo, queda accesible desde Ajustes (entrada "Puesta en marcha")
  que navega a la agenda con `?onboarding=1` para abrir el panel.
- **Ocultar manual:** botón "ocultar" en la tarjeta para no agobiar antes de terminar; reaparece
  igual desde Ajustes. (Persistencia: ver §7.)

## 5. Elegibilidad (cuándo y a quién aparece)

`eligible = esGestor && !esDemo && tieneNegocioPropio`

- **esGestor:** rol `owner` o `admin` (vía `getUserProfile()` de `lib/auth`). Un empleado no ve
  "configura tu salón".
- **esDemo:** `IS_DEMO_MODE` falso **y** `negocio_id !== 'demo_salon_001'`. La demo está sembrada;
  mostrar el checklist ahí sería incorrecto y confuso (y los prospectos free viven en la demo).
- **tieneNegocioPropio:** `negocio_id` presente y distinto de la demo (estado tras acceso completo).

## 6. Arquitectura y componentes

Web primero (el producto real). Sin tocar backend.

Nuevos:
- `lib/onboarding.ts` — definición estática de los pasos (id, título, nivel, copy, icono, destino).
- `lib/hooks/useOnboardingStatus.ts` — hace las consultas (en paralelo) y devuelve
  `{ steps: {id, done}[], coreDone, loading, refresh() }`. Reutiliza datos ya cargados donde sea
  posible. Recalcula en `refresh()` (al abrir panel / al recuperar foco de la agenda).
- `components/onboarding/OnboardingCard.web.tsx` — tarjeta compacta para la cabecera del
  desplegable de Avisos: título, barra de progreso "X/5", botón "Ver pasos" y "ocultar".
- `components/onboarding/OnboardingPanel.web.tsx` — overlay/modal con la lista completa de pasos
  (icono + título + etiqueta de nivel + explicación + check si hecho + "Configurar →"), recomendados
  con "Omitir", barra de progreso. Hoja a pantalla completa en móvil; overlay centrado en escritorio.

Integración:
- `components/agenda/AgendaCalendar.web.tsx`:
  - En el desplegable de Avisos (sobre "sin confirmar"/"cumpleaños"), render de `OnboardingCard`
    si `eligible && !coreDone`.
  - El punto/badge de la campana se enciende también si hay onboarding pendiente.
  - Estado `showOnboarding` que monta `OnboardingPanel` (como los demás modales).
  - Lee `?onboarding=1` para auto-abrir el panel (reapertura desde Ajustes).
- **Cambio habilitador (deep-link):** `app/(tabs)/configuracion.web.tsx` (y `.tsx`) leen
  `useLocalSearchParams().tab` al montar para fijar la pestaña inicial. `app/(tabs)/equipo.web.tsx`
  lee `?focus=horarios` para abrir la ficha del primer profesional sin horario (best-effort; si no,
  basta con aterrizar en Equipo).

Reutiliza componentes existentes (`Card`, `Btn`, `Icon`, `StatusBadge`/`Badge`, barra de progreso),
tokens de marca (`designTokens.ts`), motion web (`motion.tsx`), `useResponsive()`. Sin emojis.

## 7. Persistencia (sin backend)

- **Desaparición del núcleo:** derivada de `coreDone`. No se persiste nada.
- **"Omitir" recomendados** y **"ocultar" manual:** `localStorage`, clave por negocio
  (`mecha-onboarding:<negocio_id>` → `{ skipped: string[], hidden: boolean }`).
  Suficiente para un onboarding único, normalmente en el mismo dispositivo. Si más adelante se
  quiere persistencia multi-dispositivo, migrar a `negocio_config.config.onboarding` (no en v1).

## 8. Estados y comportamiento de UI

- Barra de progreso del núcleo "X/5"; al llegar a 5/5, transición breve a "¡Listo! Tu salón está
  operativo" y la tarjeta se retira de Avisos.
- Pasos hechos: atenuados con check verde (success token). Pasos pendientes: etiqueta de nivel con
  color (Imprescindible = fuego/primary, Necesario = ámbar/warning, Recomendado = neutro, Opcional = atenuado).
- Respeta `prefers-reduced-motion`. Móvil: panel a pantalla completa, botones grandes, ≤3 toques.

## 9. Fuera de alcance (v1)

- App nativa (paridad como follow-up; hoy el producto real es la web).
- Migraciones / RPC / cambios de BD.
- Logo/portada del salón como paso (no se confirma campo; se omite).
- Persistencia multi-dispositivo de skip/hidden.
- Pasos 9–10 como items con check (solo mención).

## 10. Criterios de aceptación

1. Cuenta gestora con negocio propio recién creado: la campana de Avisos muestra punto y la
   tarjeta "Pon en marcha tu salón · 0/5"; el panel lista los pasos con su explicación.
2. "Configurar →" de cada paso aterriza en la pestaña/sección exacta.
3. Crear 1 servicio (con precio/duración) marca el paso 1 hecho al volver; ídem resto de predicados.
4. El paso 3 solo se marca hecho cuando **todos** los profesionales activos tienen horario.
5. Al completar 1–5, la tarjeta desaparece de Avisos y la campana deja de señalar onboarding.
6. "Omitir" en un recomendado lo retira y no reaparece; el núcleo sigue gobernando la desaparición.
7. En modo demo y para empleados (rol no gestor): no aparece nada.
8. Reapertura desde Ajustes (`?onboarding=1`) abre el panel aunque el núcleo esté completo.

## 11. Cómo probar

- `npm run build:web` y `node scripts/serve-web.mjs`; entrar en `/app` con una cuenta gestora de
  negocio propio (no la demo). Verificar puntos 1–8 de §10.
- Demo (`/demo.html?share=1`): confirmar que NO aparece el checklist.
