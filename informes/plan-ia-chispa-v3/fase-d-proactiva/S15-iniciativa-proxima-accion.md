# S15 · Iniciativa / próxima mejor acción

**Fase:** D · Proactiva · **Dueño:** Carlos · **Esfuerzo:** alto · **Depende:** S02, S09

> Chispa **toma la iniciativa** en contexto: propone la siguiente mejor acción sin que se lo pidas —
> con tacto, sin molestar.

## Lee antes
- [`../README.md`](../README.md) + marco de razonamiento (S02) + memoria (S09/S10).

## Objetivo (resultado deseado)
Que en cada página/momento Chispa sugiera de forma proactiva y oportuna la acción más valiosa
(determinista para elegir el candidato; LLM solo redacta), fácil de aceptar o descartar.

## Ya existe (no reconstruir — verifica)
- Patrón `useAyudaIA`/`TarjetaAyudaIA`, upsell (`lib/upsellCandidato.ts`), riesgo/fuga, hallazgos (S13),
  memoria (S09/S10).

## Construir
1. **Selector de "próxima mejor acción"** por contexto (página + rol + memoria + hallazgos): reglas
   deterministas que puntúan candidatos; el LLM solo escribe el copy.
2. **UX con tacto:** sugerencia discreta, no intrusiva, con "aceptar (1 clic)" / "ahora no"; frecuencia
   limitada (no spamear). Aprende de descartes (memoria).
3. **Consistencia** con el resto de superficies (mismo componente de tarjeta).

## Reglas duras que te aplican
- Determinista para elegir; LLM solo redacta. Sin claims falsos. Rol/tenant. No molestar (rate-limit).

## Criterios de aceptación (verificables)
- En un contexto sembrado (p.ej. clienta en fuga + hueco), Chispa propone proactivamente la acción
  correcta, aceptable de un clic; "ahora no" la silencia un tiempo (verificado E2E).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] edge (si aplica)  [ ] E2E demo  [ ] manuales+iaCatalogo  [ ] specs landing
[ ] commit+push  [ ] S15 marcada`

## Estado
PENDIENTE.
