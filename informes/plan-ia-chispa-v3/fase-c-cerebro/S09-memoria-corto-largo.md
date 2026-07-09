# S09 · Memoria corto / largo plazo (estructura + retención)

**Fase:** C · Cerebro · **Dueño:** Carlos + Alexandro (edge) · **Esfuerzo:** alto · **Depende:** S08

> Que Chispa **recuerde**: conversaciones y **hechos aprendidos del negocio**, más allá del
> `localStorage` de hoy.

## Lee antes
- [`../README.md`](../README.md) + modelo de memoria (S01). Carga `hairy-domain-data`.

## Objetivo (resultado deseado)
Memoria durable y estructurada: **corto plazo** (hilo de sesión) + **largo plazo** (BD), con capa
**episódica** (sobre S08) y **semántica** (hechos/preferencias aprendidas), inyectada al edge para que
Chispa la use.

## Ya existe (no reconstruir — verifica)
- Hilo en `localStorage` (`ChispaPanel.web.tsx`, `HILO_KEY_PREFIX`). `agenda-asistente` recibe el
  historial aplanado. No hay tabla de memoria durable.

## Construir
1. **Tabla `chispa_memoria`** (largo plazo) por `negocio_id` (+ `usuario_id` donde aplique): mensajes/
   resúmenes de conversación + **hechos aprendidos** (`clave`, `valor`, `confianza`, `origen`,
   `actualizado_en`). RLS por tenant/rol. **En demo no se persiste** cross-visitante.
2. **Resumen/compactación:** para no crecer sin límite, resúmenes periódicos del hilo (corto→largo).
3. **Aprendizaje de hechos:** deriva hechos del negocio de eventos (S08) y conversaciones (p.ej.
   "suele cerrar los lunes", "producto estrella X") con confianza y origen; nunca inventa.
4. **Inyección al edge:** un extracto de memoria relevante entra en el prompt (compacto, con
   presupuesto de tokens). Salud fuera.

## Reglas duras que te aplican
- RLS, demo sin persistencia cross-visitante, salud fuera del LLM, sin claims falsos (hechos con origen).

## Criterios de aceptación (verificables)
- Tras una conversación, recargar mantiene el hilo desde BD (no solo localStorage); en cuenta real.
- Chispa usa un hecho aprendido en una respuesta posterior (verificado E2E). En demo no persiste.

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] edge desplegada+probada  [ ] migración+advisors  [ ] E2E demo
[ ] manuales+iaCatalogo  [ ] specs landing  [ ] commit+push  [ ] S09 marcada`

## Estado
PENDIENTE.
