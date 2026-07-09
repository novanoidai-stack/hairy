# S04 · Solo UI / diseño de la capa IA (pulido premium transversal)

**Fase:** A · Experiencia · **Dueño:** Carlos · **Esfuerzo:** medio-alto · **Depende:** S03

> Sesión **solo de UI/diseño**: elevar visualmente TODAS las superficies de IA a una estética limpia,
> consistente y "gran tecnológica". No añade features nuevas.

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-design-system` + `hairy-ui-craft`.

## Objetivo (resultado deseado)
Que toda la capa IA se vea como **un solo sistema**: tarjetas, burbujas, bloques, estados y motion
coherentes; nada "de IA genérica"; cero formatos rotos.

## Ya existe (no reconstruir — verifica)
- `lib/designTokens.ts` (deuda C14: TOKENS redefinidos en `.web.tsx`). `BloqueRenderer.web.tsx`,
  `components/chispa/TarjetaAyudaIA.web.tsx`, `components/agenda/BriefingAgenda.web.tsx`,
  `components/charts/LineChartMini.web.tsx`.

## Construir
1. **Sistema visual de la IA:** unifica tokens (color/tipografía/espaciado/sombras/radios) para todas
   las superficies IA; retira redefiniciones locales donde se pueda (reduce deriva C14).
2. **Bloques bonitos:** repasa cada tipo de bloque (`texto/enlace/accion/grafica/comparativa/
   formulario/opciones/progreso`) para que se vea pulido y consistente en móvil y escritorio.
3. **Estados vacío/carga/error** con diseño cuidado (skeletons, microilustración/ícono, mensaje
   claro + reintento) — reutilizables por todas las páginas (Fase B/D).
4. **Motion library** ligera y coherente (entradas, hover, foco), respetando `prefers-reduced-motion`.
5. **Auditoría visual** de las superficies IA existentes (panel, tarjetas por página, briefing, hub) y
   corrección de inconsistencias/formatos feos.

## Reglas duras que te aplican
- Sin emojis, móvil primero, sin `any`. No cambiar comportamiento, solo presentación.

## Criterios de aceptación (verificables)
- Todas las superficies IA comparten tokens y se ven consistentes (verificado con `preview_inspect`
  en varias pantallas).
- Estados vacío/carga/error tienen un componente común y bonito, usado de forma consistente.
- Cero formatos rotos / textos que se salen / aplastes en móvil.

## Definición de HECHA
`[x] tsc  [x] build  [x] E2E demo (varias pantallas, móvil+escritorio)  [x] manuales (solo tokens IA)
[x] specs landing  [x] commit+push  [x] S04 marcada`

## Estado
**HECHA** (2026-07-09). Commit `aba51d1de`.
- Tokens IA añadidos: `ia.bloqueBorder`, `ia.mensajeUserBg`, `ia.drawerBackdrop`, etc.
- `IAStates.tsx` creado: `EstadoVacio`, `EstadoCargando`, `EstadoError` (reutilizables)
- Gradiente fuego unificado: `T.fireGradient` en ChispaPanel, BloqueRenderer, BriefingAgenda
- Typecheck limpio, build OK, push a master.
