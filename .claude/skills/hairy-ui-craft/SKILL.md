---
name: hairy-ui-craft
description: Playbook para diseño frontend de nivel mercado en Hairy (Expo/RN + web). Cómo elevar más allá del "diseño genérico de IA" — sourcing de referencias reales, craft de animaciones (reanimated/moti/skia nativo + motion.tsx web), micro-interacciones, y checklist de calidad. Cargar cuando el objetivo sea pulir/elevar UI, no solo implementar.
---

# Hairy — UI Craft (diseño de nivel mercado)

Objetivo: que Hairy se vea como producto top del sector (mejor que Booksy/Fresha/Treatwell), no como una app generada por IA. Trabaja siempre sobre el sistema de [[hairy-design-system]] — esto NO lo contradice, lo eleva.

## Qué evita "el look de IA genérica"

Señales a EVITAR: gradientes morados aleatorios sin propósito, glassmorphism por defecto, emojis como iconos, espaciado inconsistente, sombras genéricas, layouts centrados simétricos sin jerarquía, copy tipo "✨ Welcome to your dashboard", micro-interacciones ausentes, todo a la misma velocidad de animación.

Qué SÍ hace que se vea profesional: jerarquía tipográfica nítida, densidad de información cuidada, estados (hover/active/focus/loading/empty/error) completos, motion con intención y física consistente, alineación a grid estricta, detalles (dots de estado con glow, líneas "AHORA", barras de progreso), y consistencia obsesiva con los tokens.

## Sourcing de referencias (tomar bases reales del mercado)

Antes de diseñar una pantalla nueva, busca patrones reales en vez de improvisar. Fuentes:
- **Inspiración visual**: Mobbin (apps reales iOS/web), Dribbble, Godly, Land-book, SaaS Landing references. Competidores directos: Booksy, Fresha, Treatwell, Square Appointments, Vagaro.
- **Componentes/código RN**: react-native-reusables, gluestack-ui, Tamagui, NativeWind ecosystem, react-native-elements. Web: shadcn/ui (para inspiración de patrones, NO para portar tal cual a RN).
- **Animación**: ejemplos de William Candillon (Reanimated/Skia), moti docs, Reactiive.

Cuando uses una referencia, **adáptala a los tokens de Hairy** (paleta índigo/dark, Inter, radios 8-16). Nunca pegues un estilo ajeno sin re-tokenizar.

## Animación — craft por plataforma

**Web** (`react-native-web`): usa el sistema existente `app/app/lib/motion.tsx` (clases `m-*`). Si necesitas algo nuevo, añádelo ahí con la misma curva `cubic-bezier(0.16,1,0.3,1)` y duraciones (0.18s hover / 0.35s entradas cortas / 0.5s largas). Stagger para listas. Siempre `prefers-reduced-motion`.

**Nativo iOS** (`motion.tsx` NO aplica): usar `react-native-reanimated` (ya instalado) + `react-native-gesture-handler` para gestos. Considerar **moti** (capa declarativa sobre reanimated) y **react-native-skia** para gráficos/efectos avanzados (no instalados aún — ver "Qué pido"). Patrones clave: layout animations, shared element transitions, entrada con stagger, spring en press, scroll-driven.

**Paridad**: la misma interacción debe sentirse equivalente en web y nativo aunque la implementación difiera.

## Micro-interacciones que importan en esta app

- Crear/mover cita (drag&drop) con feedback físico y sombra de arrastre.
- Línea "AHORA" pulsante en la timeline.
- Transición de estado de cita (pendiente→confirmada→completada) con cambio de color animado.
- Toggle, chips y stat cards con hover/press (ya hay base en motion.tsx).
- Entrada de modales (overlay fade + scale-in) y dropdowns (slide-down).

## Checklist de calidad antes de dar algo por hecho

- [ ] Tokens exactos, cero hex sueltos fuera de designTokens.
- [ ] Todos los estados cubiertos: default/hover/active/focus/disabled/loading/empty/error.
- [ ] Jerarquía tipográfica correcta (4 niveles de texto, pesos Inter correctos).
- [ ] Motion con intención y `prefers-reduced-motion` respetado.
- [ ] Paridad visual web ↔ nativo.
- [ ] Sin emojis. Copy en español, tono profesional de salón.
- [ ] Reutiliza componentes existentes antes de crear nuevos.
- [ ] Comparado lado a lado con referencia real del sector.

## Verificación visual

Para web, usar las tools `preview_*` (start, screenshot, snapshot) tras los cambios. No declarar "hecho" sin ver el render.

Relacionado: [[hairy-design-system]], router en [[hairy-design-router]].
