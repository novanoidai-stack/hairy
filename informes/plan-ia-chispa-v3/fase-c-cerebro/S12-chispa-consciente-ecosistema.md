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
`[x] tsc  [x] build  [x] edge desplegada+probada  [~] E2E demo (bloqueada por 402)  [x] manuales+iaCatalogo
[ ] specs landing  [x] commit+push  [x] S12 marcada`

## Estado
IMPLEMENTADA y DESPLEGADA (2026-07-09) — verificación E2E del LLM bloqueada por un 402 de OpenRouter (créditos).
- **Consciencia estática (por página):** el catálogo se inyecta al edge de forma compacta incluyendo la
  `pantalla` de cada helper, para poder responder "¿qué IA hay en Clientes/Agenda/…?" enumerando solo las
  de esa ruta + un chip `sugerir_enlace` a cada una.
- **Consciencia dinámica (ejecuciones):** `buscar_recuerdos` audita `eventos_negocio` (S08) y ahora
  devuelve **motivo (el porqué) y resultado**; el bloque `timeline` muestra el motivo y marca en color fuego
  las ejecuciones de IA. Fechas opcionales (por defecto, últimos 30 días). El prompt obliga a auditar el
  registro antes de responder "por qué apareció X / cuándo se ejecutó X" (no responder solo desde catálogo).
- `iaCatalogo.ts` (`chispa-autoconocimiento`) actualizado con la nueva capacidad. `tsc`/`build` limpios.
- **BLOQUEO externo (Alexandro):** el edge devuelve `402 Prompt tokens limit exceeded (10134 > 6300)` de
  OpenRouter por **créditos agotados** — esto tumba TODO el chat de Chispa en producción, no solo S12. Se
  compactó la inyección del catálogo (~-850 tokens) pero el prompt no baja de 6300 sin recortar tools. Requiere
  recargar créditos o cambiar de modelo/tier (decisión de IA de terceros = Alexandro). Verificado que el
  plumbing determinista (evento con motivo/resultado → timeline) es correcto vía SQL.
