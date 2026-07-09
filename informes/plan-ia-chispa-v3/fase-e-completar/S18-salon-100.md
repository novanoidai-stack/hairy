# S18 · Salón al 100% (config total guiada; arreglar "seguir onboarding")

**Fase:** E · Completar · **Dueño:** Carlos · **Esfuerzo:** medio-alto · **Depende:** S03

> Que Chispa lleve a cada salón hasta "operativo 100%", no solo el mínimo. Y arreglar que "seguir
> onboarding" **reinicie de 0** en vez de continuar por donde iba.

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-domain-data` + `hairy-design-system`.

## Objetivo (resultado deseado)
Un asistente de completitud que sabe qué falta para operar de verdad (horarios, agenda, políticas,
pagos, notificaciones, portal, equipo, catálogo…) y guía a completarlo; el botón de "seguir" **retoma**
el estado real, no empieza de cero.

## Ya existe (no reconstruir — verifica)
- `lib/hooks/useOnboardingStatus.ts` (`done`/`coreDone`/`ready`), `components/onboarding/
  OnboardingCard.web.tsx`, config guiada en Chispa (`onboardingAgent.ts`, `CHISPA_CONFIG_GUIADA_EVENT`),
  onboarding checklist en Avisos.

## Construir
1. **Bug "reinicia de 0":** el disparo desde Avisos debe **continuar** según `useOnboardingStatus`
   (saltar lo ya hecho), no relanzar la secuencia completa. Verifica el flujo real y arréglalo.
2. **Checklist de completitud ampliada:** más allá del núcleo, un catálogo de "para operar 100%
   necesitas X" (derivado de datos, sin migración si se puede), con progreso y enlaces/acciones.
3. **Guiado por Chispa:** cada ítem se completa con formulario/opciones (o tour S17) — nunca texto.

## Reglas duras que te aplican
- Rol (gestor). Casi-nunca-texto-plano. Sin claims falsos (no marcar completo lo que no lo está).

## Criterios de aceptación (verificables)
- Con el núcleo hecho y algo pendiente, "seguir" retoma en lo pendiente (no reinicia) — verificado E2E.
- La checklist refleja el estado real y lleva a completarlo con formularios/acciones.

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] E2E demo (tenant con onboarding parcial)  [ ] manuales+iaCatalogo
[ ] specs landing  [ ] commit+push  [ ] S18 marcada`

## Estado
PENDIENTE.
