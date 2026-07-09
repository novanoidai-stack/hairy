# S19 · "Resuelve cualquier cosa" + dataviz ampliada

**Fase:** F · Capacidades · **Dueño:** Carlos + Alexandro (edge) · **Esfuerzo:** alto · **Depende:** S02, S08-S12

> Aplicar el marco de razonamiento (S02) a fondo + una librería rica de visualización, para "servir al
> usuario como a un rey".

## Lee antes
- [`../README.md`](../README.md) + S02 (razonamiento). Carga `dataviz` skill + `hairy-ui-craft`.

## Objetivo (resultado deseado)
Que casi cualquier petición razonable caiga en una superficie útil y bonita, con **muchos formatos de
datos** (tablas ricas, varias gráficas, KPIs, timelines, comparativas) elegidos según la pregunta.

## Ya existe (no reconstruir — verifica)
- Bloques `grafica`/`comparativa` (`BloqueRenderer`), `components/charts/LineChartMini.web.tsx`, tools
  de analítica (`resumen_caja`/`ocupacion`/`citas_hoy`/`metas`), marco S02, memoria/registro (Fase C).

## Construir
1. **Router robusto:** afina el marco S02 para cubrir el "long tail" de peticiones; siempre una salida
   útil o un fallback accionable (nunca "no puedo").
2. **Librería de bloques de datos ampliada:** nuevos tipos (`tabla`, `kpi`, `timeline`, más gráficas)
   en `lib/chispaBloques.ts` + `BloqueRenderer`, con la estética de S04. Sigue la skill `dataviz`
   (paleta, accesibilidad, claridad).
3. **Selección de formato:** el sistema elige el mejor formato para cada respuesta (cifra→KPI,
   evolución→línea, reparto→barras, histórico→timeline/tabla).

## Reglas duras que te aplican
- Cifras server-side reales, nunca inventadas. Casi-nunca-texto-plano. Accesibilidad de dataviz.

## Criterios de aceptación (verificables)
- Una batería de preguntas de datos variadas produce el formato adecuado cada vez (KPI/gráfica/tabla/
  timeline), con datos reales; peticiones raras caen en fallback útil (verificado E2E).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] edge desplegada+probada  [ ] E2E demo  [ ] manuales+iaCatalogo
[ ] specs landing  [ ] commit+push  [ ] S19 marcada`

## Estado
PENDIENTE.
