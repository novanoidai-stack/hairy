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
`[x] tsc  [x] build  [x] edge desplegada+probada  [x] migración+advisors  [x] E2E demo
[x] manuales+iaCatalogo  [x] specs landing  [x] commit+push  [x] S09 marcada`

## Estado
HECHA (Implementada y verificada, con soporte para recuperar hilos persistentes y recordar hechos con `guardar_recuerdo`).
- Auditoría V3 (9 jul): la tabla `chispa_memoria` estaba definida pero **no aplicada en remoto** y con
  RLS frágil (`current_setting(jwt)`). Corregido y desplegado a producción: tabla creada + **RLS
  homogeneizada** al patrón estándar `profiles.negocio_id` (coherente con `eventos_negocio`/`chispa_acciones`),
  trigger con `SET search_path`. Guardrail de demo en `guardar_recuerdo` (no persiste cross-visitante) +
  `upsert` para reafirmar hechos sin romper la UNIQUE + fin del doble-encoding jsonb. Edge desplegada
  (`agenda-asistente`) y verificada (401 sin auth, tablas presentes). Advisors en verde.
