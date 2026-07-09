# S02 · Marco de razonamiento universal (+ doctrina casi-nunca-texto-plano)

**Fase:** 0 · Fundación · **Dueño:** Carlos + Alexandro (edge/prompt) · **Esfuerzo:** alto · **Depende:** S01

> Define CÓMO afronta Chispa *cualquier* petición: un procedimiento fijo, repetible y correcto sea
> cual sea el modelo ejecutor. Gobierna todas las respuestas del resto del plan.

## Lee antes
- [`../README.md`](../README.md). Consume el manifiesto de auto-conocimiento de **S01**.
- Reglas duras que más te aplican: **casi-nunca-texto-plano**, determinista-primero, mínima-info,
  prohibido-fallo-silencioso, salud-fuera-del-LLM.

## Objetivo (resultado deseado)
Un **procedimiento universal** (documentado + implementado en el prompt/orquestación del edge) que ante
cualquier mensaje siga siempre los mismos pasos y **siempre dé una salida útil y visual**, nunca un
párrafo seco ni un cuelgue.

## Ya existe (no reconstruir — verifica)
- `supabase/functions/agenda-asistente/index.ts` (system prompt, tools, `construirPropuesta`,
  `pedirInfo`). `lib/chispaBloques.ts` (superficies). `lib/chispaOps.ts` (ejecución determinista).
- La regla "actúa con mínima info" y el retorno `pedirInfo: Bloque` ya existen (V2 S3).

## Construir
1. **Taxonomía de intención** (clasificación determinista o barata): `acción` · `consulta/analítica` ·
   `config` · `navegación` · `memoria/recuerdo` · `charla/ayuda`. Documenta el árbol de decisión.
2. **Procedimiento fijo** por turno: (a) clasificar intención → (b) ¿tengo datos suficientes? si no,
   **un** formulario/opciones pre-rellenado (mínima info) → (c) elegir la **mejor superficie** de
   salida (acción de 1 clic / gráfica / tabla / opciones / enlace-navegación / formulario) → (d)
   proponer → (e) confirmar (PR-12) → (f) registrar en memoria (Fase C).
3. **Doctrina "casi nunca texto plano"** en el prompt + en un normalizador de salida: si el modelo
   devuelve solo texto para algo que tiene superficie mejor (una cifra→KPI/gráfica; una lista→opciones;
   un dato de ficha→tarjeta), se **re-encauza** a bloque. Texto llano solo como último recurso.
4. **Trato al usuario:** tono cálido, breve, siempre ofreciendo el **siguiente paso accionable**; nunca
   dejar al usuario "¿y ahora qué?".
5. **Red de seguridad:** para intención no reconocida, **fallback útil** (ofrecer las acciones más
   probables / llevar a la superficie relevante), nunca "no te he entendido" a secas.

## Reglas duras que te aplican
- El LLM **nunca** ejecuta escrituras ni decide orden; propone. Salud fuera del LLM. Sin claims falsos.

## Criterios de aceptación (verificables)
- Un set de ~15 peticiones variadas (acción, consulta, config, rara, ambigua) SIEMPRE devuelve una
  superficie útil (form/acción/gráfica/opciones/enlace), nunca texto seco ni cuelgue — verificado E2E.
- Ante datos incompletos → un formulario con solo lo que falta. Ante datos completos → acción directa.
- Petición sin intención clara → fallback accionable, no "no entiendo".

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] edge desplegada+probada  [ ] E2E demo (batería de intenciones)
[ ] manuales+iaCatalogo  [ ] specs landing (si cambió algo visible)  [ ] commit+push  [ ] S02 marcada`

## Estado
PENDIENTE.
