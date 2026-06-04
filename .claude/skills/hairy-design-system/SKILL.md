---
name: hairy-design-system
description: Fuente de verdad del sistema de diseño de Hairy (Expo/React Native + react-native-web). Tokens, tipografía, motion, inventario de componentes reutilizables, patrón de split .web.tsx, reglas anti-deriva. Cargar SIEMPRE antes de tocar cualquier UI de Hairy.
---

# Hairy — Design System

App SaaS de gestión de salón de peluquería. Stack: **Expo / React Native + react-native-web** (NO Next.js). Dark theme por defecto. Idioma UI: español. **Sin emojis en ningún archivo, nunca.**

## Antes de diseñar — leer los canónicos

NO dupliques valores aquí (rotan). Lee la fuente real:

| Qué | Archivo |
|-----|---------|
| Tokens (colores, spacing, radius, fuentes, STATUS_META) | `app/app/lib/designTokens.ts` |
| Tema light/dark + context | `app/app/lib/theme.ts`, `app/app/lib/themeContext` |
| Sistema de motion (web) | `app/app/lib/motion.tsx` |
| Spec de diseño píxel-perfecto (4 pantallas desktop + 4 mobile + modal) | `design_handoff/README.md` + `design_handoff/source/` |
| Brief de Configuración | `docs/brief-configuracion-claude-design.md` |

## Paleta (resumen — el canónico es designTokens.ts)

Fondos índigo-sobre-azul-muy-oscuro: `bg #0b1220` · `bgPanel #0f172a` · `bgCard #141f33` · `bgCardHi #1a2540`. Texto en 4 niveles: `#f8fafc` → `#94a3b8` → `#64748b` → `#475569`. Primary índigo `#6366f1` (hi `#818cf8`). Semánticos: success `#10b981`, warning `#f59e0b`, danger `#ef4444`, violet `#8b5cf6`, cyan `#06b6d4`, rose `#ec4899`. Cada color con su variante `*Soft` (alpha 0.14).

## Tipografía

- **Inter** (400/500/600/700/800) — toda la UI.
- **Instrument Serif** (400 + italic) — solo logo "hairy" (22px) y hero mobile (72px).
- Jerarquía de pesos y tamaños: ver cabecera de `designTokens.ts`.

## Componentes reutilizables — ÚSALOS, no reinventes

Antes de crear un componente nuevo, comprueba si ya existe:

- `app/app/components/ui/DesignComponents.tsx`: `Topbar`, `Btn`, `Pill`, `StatusBadge`, `Card`, `Input`, `Loading`, `EmptyState`, `StatCard`, `RowItem`.
- `app/app/components/ui/SettingsAtoms.tsx`: `Section`, `FieldRow`, `FieldStack`, `Toggle`, `NumberInput`, `STextInput`, `SSelect`, `Segmented`, `DayPicker`, `TimeInput`, `Badge`, `SoonBadge`, `SoonBanner`, `StatBox`, `Btn`, `IconBtn`, `ScopeChip`, `SettingsIcon`.
- `app/app/components/ui/Pickers.tsx`: `TimeDrumPicker`, `DateTimePicker`.
- `app/app/components/ui/TText.tsx`: `TText`, `TTextInput` (wrappers de texto con fuente correcta — usar en vez de `<Text>` crudo).
- `app/app/components/layout/Sidebar.tsx`, `app/app/components/agenda/*`.

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
