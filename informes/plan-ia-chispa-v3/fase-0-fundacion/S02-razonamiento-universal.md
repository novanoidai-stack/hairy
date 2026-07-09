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
**HECHA** (2026-07-09). Verificado E2E contra el edge real (demo `demo.publico`) con una
batería de ~15 intenciones variadas: acción sin datos → `formulario`; acción ambigua → `opciones`;
consulta/analítica → `grafica`+`comparativa`; config/navegación → `enlace`; charla/ayuda →
auto-conocimiento con `enlace`; y peticiones raras/sin intención clara ("color favorito",
"cuéntame un chiste", "gracias", memoria sin datos) → siempre `opciones`/`enlace` (red de
seguridad). **Ninguna** respuesta salió en texto seco ni con cuelgue. Salud fuera del LLM
respetada (no fuga de alergias).

**Qué se construyó:**
- `informes/plan-ia-chispa-v3/RAZONAMIENTO-UNIVERSAL.md`: taxonomía de intención (6 clases),
  árbol de decisión, procedimiento fijo por turno y doctrina "casi nunca texto plano".
- `supabase/functions/agenda-asistente/index.ts`: constante `PROCEDIMIENTO_UNIVERSAL` inyectada
  como primera instrucción del prompt + red de seguridad determinista `garantizarSuperficie()`
  (con `accionesRapidas()` por rol) aplicada en `finalizar()`. **Desplegada** (401 sin auth).
- Manifiesto (`lib/ia/manifiestoIA.ts`, módulo `razonamiento-universal`) + `ARQUITECTURA.md` (§5-bis).
- Manuales (`lib/manuals/chispa.ts`, `lib/iaCatalogo.ts`) + landing (`web/especificaciones.html`).

**Checklist:** `[x] tsc  [x] build  [x] edge desplegada+probada  [x] E2E demo (batería)
[x] manuales+iaCatalogo  [x] specs landing  [x] commit+push  [x] S02 marcada`

**Abierto para Alexandro:** envíos reales (WhatsApp/correo) y pagos siguen como
propuesta/borrador; la red de seguridad no envía nada.
