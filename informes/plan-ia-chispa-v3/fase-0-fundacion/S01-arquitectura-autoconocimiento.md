# S01 · Arquitectura + auto-conocimiento de la capa IA

**Fase:** 0 · Fundación · **Dueño:** Carlos + Alexandro (edge/prompt) · **Esfuerzo:** alto · **Depende:** — (es la primera de todo)

> Esta sesión define la ESTRUCTURA sobre la que enchufan las otras 26. Su salida (documento de
> arquitectura + manifiesto que Chispa consume) es contrato para el resto del plan.

## Lee antes
- La **RAÍZ** del plan: [`../README.md`](../README.md) (contexto + constraints globales + protocolo).
- No leas otras sesiones. Si tocas UI más adelante, carga `hairy-design-system`.
- **Reglas duras que más te aplican:** anti-alucinación (inventaría lo REAL, no lo supuesto),
  seguridad (nada de exponer secretos en el manifiesto), sin `any`.

## Objetivo (resultado deseado)
Que exista **una fuente de verdad de la arquitectura de toda la capa IA** que: (a) la **delimite**
(módulos, contratos, flujo de datos, límites), (b) la deje **óptima** (un solo camino por
responsabilidad, sin deriva/duplicados), y (c) sea **auto-conocimiento de Chispa**: un manifiesto
legible por máquina que se inyecta al edge para que Chispa sepa qué piezas existen, qué hace cada una
y cómo se conectan. Sin esto, cada sesión posterior improvisaría su propia estructura.

## Ya existe (INVENTARIAR, no reconstruir — verifica con grep/git antes de escribir nada)
- `lib/chispaBloques.ts` (protocolo de bloques), `components/chispa/BloqueRenderer.web.tsx`,
  `components/chispa/ChispaPanel.web.tsx`, `ChispaLauncher.web.tsx`.
- Edge: `supabase/functions/agenda-asistente/` (+ `whitelist.ts`), `chispa-tts`, `chispa-stt`.
- Ejecutores: `lib/chispaOps.ts`, `lib/agendaOps.ts`, `lib/organizarAgenda.ts`, `lib/retrasos.ts`.
- IA por página: `lib/hooks/useAyudaIA.ts`, `components/chispa/TarjetaAyudaIA.web.tsx`,
  `informes/PATRON-IA-POR-PAGINA.md`.
- Catálogo: `lib/iaCatalogo.ts` (estático), `components/config/HubIA.tsx`.
- Voz: `lib/hooks/useChispaVoz.web.ts` + cadena Kokoro→ElevenLabs→navegador.
- Config guiada: `lib/onboardingAgent.ts`.
- **Deuda/deriva conocida a resolver:** duplicado import CSV (`components/config/TabImportarCitas.tsx`)
  vs Migración Mágica; TOKENS redefinidos localmente en `.web.tsx` (deuda C14). Verifica cuáles siguen.

## Construir
1. **Documento de arquitectura canónico** `informes/plan-ia-chispa-v3/ARQUITECTURA.md`:
   - Mapa de módulos por capa: **UI** (panel/bloques/renderer/tarjetas/coach) · **orquestación
     cliente** (hooks/ops deterministas) · **edge/LLM** (agenda-asistente, tools, pedirInfo) ·
     **datos** (tablas, RLS, RPCs) · **voz** · **catálogo/manifiesto** · **memoria/registro** (aún por
     construir en Fase C — dejar el hueco definido).
   - Para **cada módulo**: qué hace, cómo se usa, de qué depende, su **contrato** (tipos/props/firma).
   - **Flujo de datos** de una petición de punta a punta (usuario → panel → edge → tool → ejecutor →
     BD → bloque de respuesta).
   - **Modelo de memoria** (define aquí, implementan las Fases C): corto plazo (sesión) · largo plazo
     (durable BD) · episódica (sobre el Registro universal, S08) · semántica (hechos aprendidos) ·
     retención · índices para recuerdo temporal (S11). Deja las **firmas de tabla propuestas** como
     contrato para S08–S11 (no las crees aquí).
2. **Manifiesto legible por máquina** (p.ej. `lib/ia/manifiestoIA.ts`, sin `any`): estructura tipada
   que enumera módulos/superficies/tools/funciones-por-página con {id, título, qué hace, dónde,
   entradas/salidas, rol}. Debe poder derivarse de/coincidir con `lib/iaCatalogo.ts` (unifícalos o haz
   que uno consuma al otro; **no dos fuentes de verdad divergentes**). **Nunca** incluye secretos ni
   claves.
3. **Inyección de auto-conocimiento en el edge:** el manifiesto (o un resumen compacto) se pasa al
   `agenda-asistente` para que Chispa pueda responder "qué sé hacer / dónde está X / por qué doy este
   resultado". Compacto (cuida tokens del prompt).
4. **Resolver deriva:** decide y ejecuta el destino del duplicado import CSV vs Migración Mágica (uno
   se retira o se hace redirigir al otro). Documenta el cambio de arquitectura en `ARQUITECTURA.md`.

## Reglas duras que te aplican (de la RAÍZ)
- **Una sola fuente de verdad** por responsabilidad (contra la deriva). 
- Sin `any`, sin emojis, comentarios en español. 
- El manifiesto **no** expone secretos. 
- Anti-alucinación: cada entrada del manifiesto corresponde a algo que **existe de verdad** (verificado
  con grep); si no existe aún (memoria/registro), márcalo `estado: 'planificado'`.

## Criterios de aceptación (verificables)
- Existe `ARQUITECTURA.md` con el mapa de módulos + contratos + flujo E2E + modelo de memoria.
- Existe el manifiesto tipado y **una sola** fuente de verdad catálogo↔manifiesto (no divergen).
- El edge recibe el auto-conocimiento y, ante "¿qué sabes hacer?" / "¿dónde configuro X?", responde
  desde el manifiesto (verificado E2E en la demo, con superficie visual, no texto seco).
- El duplicado import CSV/Migración Mágica queda resuelto (un solo camino).
- `npx tsc --noEmit` y `npm run build:web` limpios. Edge redesplegado y probado si tocaste su contrato.

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] edge desplegada+probada (si aplica)  [ ] E2E demo (auto-conocimiento)
[ ] manuales+iaCatalogo coherentes con el manifiesto  [ ] specs landing (si cambió algo visible)
[ ] commit+push master  [ ] S01 marcada`

## Estado
HECHA — 2026-07-09.

**Qué se construyó:**
- `informes/plan-ia-chispa-v3/ARQUITECTURA.md`: fuente de verdad de la capa IA (módulos por
  capa + contratos + flujo E2E + modelo de memoria con firmas de tabla propuestas para Fase C +
  límites). Verificado contra repo/BD, nada inventado; memoria/registro marcados `planificado`.
- `lib/ia/manifiestoIA.ts`: manifiesto tipado (sin `any`, sin secretos). `MODULOS_IA` (arquitectura
  interna, cada uno verificado real o `estado:'planificado'`) + `SUPERFICIES_IA` **derivadas** de
  `CATALOGO_IA` (una sola fuente de verdad catálogo↔manifiesto, imposible divergir por
  construcción) + `resumenAutoconocimiento()`.
- Auto-conocimiento en el edge `agenda-asistente/index.ts`: constante `AUTOCONOCIMIENTO_IA`
  (proyección compacta de las superficies) inyectada en `buildSystemPrompt` + instrucción para
  responder "¿qué sabes hacer? / ¿dónde está X?" con chips `sugerir_enlace`.
- Deriva resuelta: **retirado `components/config/TabImportarCitas.tsx`** (huérfano, sin ningún
  import; Migración Mágica lo supersede con `agenda_booksy_fresha`). Un solo camino de importación.
- Coherencia: nueva superficie en `lib/iaCatalogo.ts` (`chispa-autoconocimiento`) + sección en
  `lib/manuals/chispa.ts` + item en `web/especificaciones.html`.

**Verificado:**
`[x] tsc (limpio en lib/, ruido preexistente solo en scripts/tts-test)  [x] build:web OK
[x] edge desplegada (401 sin auth) + probada autenticada con la demo (demo.publico): "¿qué sabes
hacer?" → texto conciso + 5 chips de enlace a pantallas reales; "¿dónde está X?" → chip a la
pantalla correcta  [x] E2E demo (llamada real al tenant demo vía edge desplegado)
[x] manuales+iaCatalogo coherentes con el manifiesto  [x] specs landing  [x] commit+push master`
