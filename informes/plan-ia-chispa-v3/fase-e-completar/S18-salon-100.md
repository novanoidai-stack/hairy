# S18 · Salón al 100% (config total guiada; arreglar "seguir onboarding")

**Fase:** E · Completar · **Dueño:** Carlos · **Esfuerzo:** medio-alto · **Depende:** S03

> Que Chispa lleve a cada salón hasta "operativo 100%", no solo el mínimo. Y arreglar que "seguir
> onboarding" **reinicie de 0** en vez de continuar por donde iba.

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-domain-data` + `hairy-design-system`.

## Objetivo (resultado deseado)
Un asistente de completitud que sabe qué falta para operar de verdad (horarios, agenda, políticas,
pagos, notificaciones, portal, equipo, catálogo…) y guía a completarlo; el botón de "seguir" **retoma**
el estado real, no empieza de cero.

## Ya existe (no reconstruir — verifica)
- `lib/hooks/useOnboardingStatus.ts` (`done`/`coreDone`/`ready`), `components/onboarding/
  OnboardingCard.web.tsx`, config guiada en Chispa (`onboardingAgent.ts`, `CHISPA_CONFIG_GUIADA_EVENT`),
  onboarding checklist en Avisos.

## Construir
1. **Bug "reinicia de 0":** el disparo desde Avisos debe **continuar** según `useOnboardingStatus`
   (saltar lo ya hecho), no relanzar la secuencia completa. Verifica el flujo real y arréglalo.
2. **Checklist de completitud ampliada:** más allá del núcleo, un catálogo de "para operar 100%
   necesitas X" (derivado de datos, sin migración si se puede), con progreso y enlaces/acciones.
3. **Guiado por Chispa:** cada ítem se completa con formulario/opciones (o tour S17) — nunca texto.

## Reglas duras que te aplican
- Rol (gestor). Casi-nunca-texto-plano. Sin claims falsos (no marcar completo lo que no lo está).

## Criterios de aceptación (verificables)
- Con el núcleo hecho y algo pendiente, "seguir" retoma en lo pendiente (no reinicia) — verificado E2E.
- La checklist refleja el estado real y lleva a completarlo con formularios/acciones.

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] E2E demo (tenant con onboarding parcial)  [ ] manuales+iaCatalogo
[ ] specs landing  [ ] commit+push  [ ] S18 marcada`

## Estado
HECHA (10 jul).

**Qué se construyó**
- **Bug "reinicia de 0" arreglado** (`components/chispa/ChispaPanel.web.tsx`): `iniciarConfigGuiada`
  congela un snapshot del estado real (`useOnboardingStatus.done`) y arranca en el **primer tema
  pendiente**; `avanzarTemaGuiado` salta los temas ya hechos de ese snapshot. Así "seguir onboarding"
  (evento `mecha-chispa-config-guiada` desde Avisos, o «configúrame el salón») **retoma** en vez de
  repetir. Si todo está hecho, no reinicia: avisa "ya está al 100%". En la **demo** (escrituras
  simuladas) se fuerza snapshot vacío para conservar el recorrido completo del showcase.
- **Guía hasta el 100%, no solo el mínimo** (`components/agenda/AgendaCalendar.web.tsx` +
  `components/onboarding/OnboardingCard.web.tsx`): la tarjeta de Avisos ya no desaparece al completar
  el núcleo; sigue mientras quede algún paso **no omitido** (los recomendados omitidos con "Omitir" no
  cuentan). Fase 1 (no operativo) muestra progreso del núcleo; fase 2 (operativo) el progreso total
  "al 100%". La checklist ampliada = los 8 pasos ya existentes derivados de datos reales (sin migración).
- Manuales (`lib/manuals/chispa.ts`), `lib/iaCatalogo.ts` y specs landing
  (`web/especificaciones.html`, nuevo ítem "Te configura el salón paso a paso") al día.

**Verificado**
- `tsc --noEmit` limpio · `npm run build:web` OK · specs landing sirve el ítem nuevo (200, menciona 100% y "retoma").
- **E2E retomar en tenant REAL parcial** (cuenta de prueba `chispa.test.s18@mecha.app`, tenant vacío
  propio `test_s18_e6d9d`, owner/full): con el salón a cero, la config guiada arranca en paso 1/7
  (datos de negocio, 14%). Tras completar datos de negocio (guardado real en `negocio_config`) y salir,
  al **re-disparar** `mecha-chispa-config-guiada` responde *"Retomamos donde lo dejaste: saltaré lo que
  ya tienes hecho. Te quedan 6 pasos"* y arranca en **Tus servicios (29%, paso 2)** — NO reinicia en el
  paso 1. Confirma AC1. El edge `onboarding-agent` (LLM) funcionó (enriqueció la pregunta con estimación
  por zona + disclaimer honesto), señal de que la key de OpenRouter rotada está operativa.
- Demo `/demo.html?share=1`: sin regresión (arranca el recorrido completo desde paso 1 con escrituras simuladas).
- Sin edge/migración nuevas. Envíos/pagos = Alexandro.

`[x] tsc  [x] build  [ ] edge (n/a)  [ ] migración (n/a)  [x] E2E (tenant real parcial + demo)  [x] manuales+iaCatalogo
[x] specs landing  [x] commit+push master  [x] S18 marcada`
