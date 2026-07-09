# S17 · Tours y redirecciones guiadas

**Fase:** D · Guía · **Dueño:** Carlos · **Esfuerzo:** medio-alto · **Depende:** S16

> "Te llevo y te enseño": recorridos guiados paso a paso entre pantallas, no soltarte en una ruta.

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-ui-craft`.

## Objetivo (resultado deseado)
Que Chispa pueda guiar un flujo multi-pantalla (p.ej. "configurar reserva online", "hacer tu primer
cobro") llevándote paso a paso, resaltando qué tocar en cada pantalla y confirmando avance.

## Ya existe (no reconstruir — verifica)
- Coach intra-página (S16), navegación por bloque `enlace`/rutas (`CHISPA_RUTAS`), config guiada
  (`onboardingAgent.ts`), posible tour previo (verifica).

## Construir
1. **Motor de tour** declarativo: pasos {ruta, elemento, explicación, criterio de avance}; navega y
   ancla el coach (S16) en cada pantalla; barra de progreso (bloque `progreso`).
2. **Catálogo de tours** curados (los flujos de más valor). Reanudable; se puede salir siempre.
3. **Entrada:** desde Chispa ("guíame para X"), desde Avisos/onboarding, o proactivo.

## Reglas duras que te aplican
- Móvil primero. Salir siempre disponible. No bloquear al usuario.

## Criterios de aceptación (verificables)
- Un tour real lleva al usuario por ≥2 pantallas, resaltando el paso y avanzando al completarlo;
  reanudable y abandonable (verificado E2E).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] E2E demo  [ ] manuales+iaCatalogo  [ ] specs landing  [ ] commit+push
[ ] S17 marcada`

## Estado
PENDIENTE.
