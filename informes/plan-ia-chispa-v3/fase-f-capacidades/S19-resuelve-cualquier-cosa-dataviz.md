# S19 - Resuelve cualquier cosa + dataviz ampliada

**Estado:** COMPLETADO
**Responsable:** Carlos (UI) + Alexandro (Edge)
**Fase:** F. Capacidades Avanzadas

**Objetivo:**
Completar la transición hacia una UI rica donde el LLM nunca vomita cifras en markdown, sino que delega en el motor de renderizado de bloques de Chispa (kpi, barras, tablas).

---

### Tareas Completadas

1. **HECHO — Carlos (cliente)**: Crear `lib/chispaFormato.ts`. Centraliza la lógica de "dado este JSON neutral (DatoRespuesta), ¿cuál es el mejor bloque visual?".
   - Si es 1 cifra -> `kpi` (1 tarjeta)
   - Si son varias cifras no relacionadas -> `kpi` (N tarjetas)
   - Si es un reparto porcentual/categorías -> `barras`
   - Si es una serie temporal de >1 punto -> `grafica`
   - Si es una lista detallada -> `tabla`

2. **HECHO — Carlos (UI)**: Extender `RenderBloque` para soportar `kpi`, `barras` (ya existe pero simplificado), y `tabla` de forma nativa (usando la UI del design system).

3. **HECHO — Alexandro (edge `agenda-asistente`)**: Implementar en el dispatcher (`index.ts`) la inyección determinista de bloques.
   - Las tools de lectura (`resumen_caja`, `ocupacion`, `citas_hoy`, `resumen_informes`) devuelven un `DatoRespuesta` inyectado en su JSON.
   - El iterador de tools extrae el `DatoRespuesta`, genera el bloque correspondiente (`cifras`, `reparto`, `listado`) pasándolo a `elegirFormatoDato`.
   - Se inyecta en `bloquesExtra` garantizando que las cifras se procesan siempre server-side antes de retornar el JSON crudo al LLM.

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
Lado CLIENTE (Carlos) HECHO y verificado E2E 10 jul. **Emisión desde el edge = Alexandro (pendiente).**

**Construido (Carlos, cliente/determinista)**
- **Librería de bloques de datos ampliada** (`lib/chispaBloques.ts` + `BloqueRenderer.web.tsx`):
  nuevos tipos `kpi` (tarjetas de cifra con delta y color/icono de subida/bajada), `barras`
  (`components/charts/BarChartMini.web.tsx`, reparto de una medida entre categorías, un solo tono +
  valores etiquetados, siguiendo la skill `dataviz`) y `tabla` (columnas tipadas por unidad + fila de
  totales, tabular-nums, scroll-x). `grafica`/`comparativa`/`timeline` ya existían.
- **Selección de formato determinista** (`lib/chispaFormato.ts`): `elegirFormatoDato(DatoRespuesta)`
  mapea la clase del dato a su mejor bloque — `cifra→kpi`, `reparto→barras` (1 categoría→kpi),
  `evolucion→grafica` (1 punto→kpi), `comparativa→comparativa`, `listado→tabla`, `cronologia→timeline`.
  `bloqueFallbackAccionable()` = salida accionable (enlaces) para "nunca 'no puedo'".
- Arnés `?chispatest=1` → comando `/testdatos` (en `ChispaPanel.web.tsx`) que pasa una batería de
  descriptores por `elegirFormatoDatos` para probar formato+render de punta a punta.

**Verificado E2E** (cuenta real `chispa.test.s18@mecha.app`, tenant `test_s18_e6d9d`, `?chispatest=1`):
`/testdatos` renderiza correctamente los 6 formatos (kpi con ▲/▼ y %, barras, gráfica de línea,
comparativa, tabla con totales, timeline). `tsc` + `build:web` limpios. Docs al día: manual Chispa
("Respuestas con datos en su mejor formato"), `iaCatalogo` (`chispa-datos-formato`) y specs landing.

**PENDIENTE — Alexandro (edge `agenda-asistente`):** hacer que el LLM/tools emitan estos bloques con
datos REALES. Dos vías (elegir una): (a) las tools de analítica devuelven un `DatoRespuesta` (misma
tabla de decisión que `lib/chispaFormato.ts`, replicada en Deno) y el edge llama a la equivalente de
`elegirFormatoDato`; o (b) el prompt instruye emitir directamente `kpi`/`barras`/`tabla` según la
pregunta. El contrato de bloques (`lib/chispaBloques.ts`) es la interfaz común y ya está desplegado en
cliente. Cifras SIEMPRE server-side. Hasta entonces, una pregunta de datos real cae en los bloques que
el edge ya sabe emitir (`grafica`/`comparativa`/texto) o en el fallback de superficie (S02).

`[x] tsc  [x] build  [ ] edge desplegada (Alexandro)  [x] E2E (render+selector, tenant real)
[x] manuales+iaCatalogo  [x] specs landing  [ ] commit+push  [ ] S19 cerrada (falta edge)`
