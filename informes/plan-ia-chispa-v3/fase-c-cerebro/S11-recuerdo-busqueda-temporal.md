# S11 · Recuerdo y búsqueda temporal ("¿qué pasó hace 4 meses?")

**Fase:** C · Cerebro · **Dueño:** Carlos + Alexandro (edge) · **Esfuerzo:** medio-alto · **Depende:** S08, S09

> El lado **lectura/recall** de la memoria: el usuario pregunta por el pasado y Chispa lo recupera y lo
> muestra (con superficie visual, no texto seco).

## Lee antes
- [`../README.md`](../README.md) + modelo de memoria (S01).

## Objetivo (resultado deseado)
Que "¿qué pasó hace 4 meses con la clienta X / en caja / con este proveedor?" devuelva una respuesta
real, con **línea de tiempo / tabla / cifras** consultando el Registro universal (S08) y la memoria (S09).

## Ya existe (no reconstruir — verifica)
- `eventos_negocio` (S08) con índices por fecha/tipo/entidad. Bloques `grafica`/`comparativa`/`tabla`
  (según S19) para pintar el resultado.

## Construir
1. **Tool de recuerdo temporal** en el edge: parsea rango temporal ("hace 4 meses", "en marzo",
   "el año pasado") + entidad/tema, consulta `eventos_negocio`/memoria con RLS y devuelve un bloque
   visual (línea de tiempo/tabla/resumen). Determinista en la consulta; LLM solo interpreta la pregunta
   y redacta.
2. **Superficie de resultado:** timeline/tabla con los eventos relevantes; nunca un párrafo seco.
3. **Precisión:** si no hay datos en ese rango, dilo con franqueza (no inventar).

## Reglas duras que te aplican
- RLS/tenant/rol en la consulta. Salud fuera. Sin claims falsos. Casi-nunca-texto-plano.

## Criterios de aceptación (verificables)
- Sembrado un evento datado hace ~4 meses, preguntarlo lo recupera y lo pinta (verificado E2E).
- Rango sin datos → respuesta honesta, sin inventar. RLS impide ver otro tenant.

## Definición de HECHA
`[x] tsc  [x] build  [x] edge desplegada+probada  [x] E2E demo  [x] manuales+iaCatalogo
[x] specs landing  [x] commit+push  [x] S11 marcada`

## Estado
HECHO.
