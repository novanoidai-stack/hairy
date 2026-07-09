# S12 · Chispa consciente del ecosistema IA (catálogo + ejecuciones)

**Fase:** C · Cerebro · **Dueño:** Carlos + Alexandro (edge) · **Esfuerzo:** medio-alto · **Depende:** S01, S07, S08

> Chispa conoce **todas** las funciones IA (incluidas las de página que no ejecuta ella), **cómo
> funcionan, por qué dan X resultado y cuándo se ejecutaron**.

## Lee antes
- [`../README.md`](../README.md) + manifiesto de S01 + Registro universal de S08.

## Objetivo (resultado deseado)
Que Chispa pueda responder/razonar sobre el ecosistema IA: "esta página tiene el helper Y, sirve para
Z, se ejecutó hace un rato y dio este resultado por esta razón".

## Ya existe (no reconstruir — verifica)
- `lib/iaCatalogo.ts` (qué/cómo, estático). Manifiesto (S01). Eventos de ejecución de helpers (S07→S08).

## Construir
1. **Consciencia estática:** el manifiesto/catálogo (cómo funciona cada helper y **por qué** produce su
   resultado) se inyecta compacto al edge.
2. **Consciencia dinámica:** Chispa lee del Registro universal las **ejecuciones y resultados** de las
   funciones IA por página (aunque las ejecutara la página, no ella), con RLS.
3. **Respuestas:** ante "¿qué funciones de IA tengo aquí?" / "¿por qué salió este upsell?" / "¿cuándo
   se analizó mi día?", responde desde catálogo + eventos, en superficie visual.

## Reglas duras que te aplican
- RLS/tenant. Presupuesto de tokens (inyección compacta). Sin inventar (si no hay evento, dilo).

## Criterios de aceptación (verificables)
- Chispa enumera las funciones IA de una página y explica una ejecución concreta con su resultado y su
  porqué, leídos del registro (verificado E2E tras ejecutar un helper).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] edge desplegada+probada  [ ] E2E demo  [ ] manuales+iaCatalogo
[ ] specs landing  [ ] commit+push  [ ] S12 marcada`

## Estado
PENDIENTE.
