---
name: hairy-design-system
description: Fuente de verdad del sistema de diseño de Hairy (Expo/React Native + react-native-web). Tokens, tipografía, motion, inventario de componentes reutilizables, patrón de split .web.tsx, reglas anti-deriva. Cargar SIEMPRE antes de tocar cualquier UI de Hairy.
---

# Hairy — Design System

App SaaS de gestión de salón de peluquería. Stack: **Expo / React Native + react-native-web** (NO Next.js). Tema CLARO crema con acento fuego por defecto (no dark theme — el tema oscuro se descartó en la megaauditoría de diseño). Idioma UI: español. **Sin emojis en ningún archivo, nunca.**

## Antes de diseñar — leer los canónicos

NO dupliques valores aquí (rotan). Lee la fuente real:

| Qué | Archivo |
|-----|---------|
| Tokens (colores, spacing, radius, fuentes, STATUS_META) | `lib/designTokens.ts` |
| Tema light/dark + context | `lib/theme.ts` |
| Sistema de motion (web) | `lib/motion.tsx` |

Nota: las rutas de arriba NO llevan prefijo `app/app/` — ese prefijo era de una estructura antigua y ya no existe (el directorio real es `app/app/` solo contiene `expo-env.d.ts`). Los tokens, tema y motion viven en `lib/` a nivel de raíz del repo.

Verificado en el historial de git (no citar estas dos rutas, ya no existen): el **spec de diseño píxel-perfecto** (`design_handoff/`) nunca tiene un solo commit en este repo — no se versionó nunca, probablemente referencia de otra plantilla. El **brief de Configuración** (`docs/brief-configuracion-claude-design.md`) sí existió (añadido el 30-may-2026) pero se borró en el aplanado de carpetas `app/app/app/` → `app/app/` (commit `5887ec159`). Si se necesita ese contexto, no está disponible en el repo actual.

## Paleta (resumen — el canónico es designTokens.ts)

Tema CLARO cálido/crema, acento fuego (NO índigo, NO dark). Fondos: `bg #f6f1ea` (crema cálido) · `bgPanel #fffdfb` (casi blanco cálido) · `bgCard #ffffff` · `bgCardHi #fbf6f0`. Texto en 4 niveles, carbón cálido sobre claro: `text #1c1814` → `textSecondary #5c5249` → `textTertiary #736658` → `textMuted #b3a89d`. Primary fuego `#f4501e` (hi/profundo `#c0260a`). Semánticos: `success #0f9d6b`, `warning #e08a00`, `danger #e23b34`, `cyan #0891b2`, `rose #e11d6b`. `fireGradient`: `linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)`. Variantes `*Soft`/`*Glow` existen por color pero NO comparten un alpha uniforme (ej. `primarySoft` .12, `primaryGlow` .30, `warningSoft` .16, el resto .14) — comprobar el valor exacto en `designTokens.ts` en vez de asumir.

**⚠ `violet` no es un violeta real:** vale `#c0260a`, exactamente el mismo hex que `primaryHi` (resto de una migración de marca anterior a la actual). No lo uses como color distintivo/diferenciador en UI nueva — para ese propósito usa `cyan` o `rose`, o pide que se sustituya por un tono violeta de verdad en `designTokens.ts` antes de depender de él.

## Tipografía

- **Inter** (400/500/600/700/800) — toda la UI.
- **Instrument Serif** (400 + italic) — solo logo "hairy" (22px) y hero mobile (72px).
- Jerarquía de pesos y tamaños: ver cabecera de `designTokens.ts`.

## Componentes reutilizables — ÚSALOS, no reinventes

Antes de crear un componente nuevo, comprueba si ya existe:

- `components/ui/DesignComponents.tsx`: `Topbar`, `Btn`, `Pill`, `StatusBadge`, `Card`, `Input`, `Loading`, `EmptyState`, `StatCard`, `RowItem`.
- `components/ui/SettingsAtoms.tsx`: `Section`, `FieldRow`, `FieldStack`, `Toggle`, `NumberInput`, `STextInput`, `SSelect`, `Segmented`, `DayPicker`, `TimeInput`, `Badge`, `SoonBadge`, `SoonBanner`, `StatBox`, `Btn`, `IconBtn`, `ScopeChip`, `SettingsIcon`.
- `components/ui/Pickers.tsx`: `TimeDrumPicker`, `DateTimePicker`.
- `components/ui/TText.tsx`: `TText`, `TTextInput` (wrappers de texto con fuente correcta — usar en vez de `<Text>` crudo).
- `components/layout/Sidebar.tsx`, `components/agenda/*`.

## Patrones del codebase

- **Split de plataforma**: existen variantes `*.web.tsx` (ej. `clientes.web.tsx`, `AgendaCalendar.web.tsx`). Web y nativo divergen donde hace falta. Mantén paridad visual entre ambas.
- **Motion web** = clases CSS inyectadas por `MotionStyles()` (`m-slide-up`, `m-stagger`, `m-btn-primary`, `m-card-hover`, etc.). Curva estándar `cubic-bezier(0.16,1,0.3,1)`. Respeta `prefers-reduced-motion`.
- **Motion nativo** (iOS) NO usa `motion.tsx` (es solo web) → usar `react-native-reanimated` (ya en deps). Ver [[hairy-ui-craft]] para patrones.
- **Multi-tenant estricto**: todo SELECT filtra `.eq('negocio_id', profile.negocio_id)`; todo INSERT incluye `negocio_id`. Supabase propio de Hairy (no el de Novanoid).

## Reglas anti-deriva (el handoff fue tajante por esto)

Intentos previos rompieron el diseño moviendo botones e inventando decoraciones. Por defecto:
1. Respeta tokens exactos (copia hex, no aproximes a clases tailwind).
2. No muevas/reordenes elementos respecto al handoff sin acuerdo.
3. Si algo del diseño no está definido, pregunta — no inventes.
4. Toda mejora creativa/animación pro va canalizada por [[hairy-ui-craft]] y acordada con el usuario primero.

Relacionado: [[hairy-ui-craft]], router en [[hairy-design-router]].
