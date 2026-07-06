# Contexto Sesion 9 — Superficies por pagina

> Documento auxiliar con el contexto necesario para ejecutar S9-A y S9-B del plan IA Chispa.
> Fecha: 2026-07-06

## 1. Objetivo general: ¿Qué es Chispa?

Chispa es la capa de IA de Mecha: un asistente **transversal, omnisciente y conversacional**
que vive en toda la app (no es una pantalla aparte). Responde con **UI viva** (bloques
interactivos, no texto plano) y **actúa** sobre el negocio con confirmación del usuario.

**Diferencial:** IA verticalizada para peluquerías (entiende fases activa/reposo de tintes,
fichas de color, horarios, comisiones, etc.) + respeto por datos sensibles (salud fuera
del LLM).

## 2. Arquitectura (como funciona)

1. **Edge function** (`agenda-asistente`): recibe la pregunta del usuario, deriva rol/negocio
   del JWT, filtra tools por RBAC, llama al LLM con tool-use.
2. **Respuesta en bloques tipados:** el edge devuelve `{ bloques: Bloque[] }` donde cada
   bloque tiene tipo: `texto` (markdown), `accion` (tarjeta propone->confirma), `enlace`
   (chip que navega), `grafica`/`comparativa` (visuales).
3. **Renderer único:** `components/chispa/BloqueRenderer.web.tsx` mapea cada bloque a un
   componente reutilizando lo que ya existe (graficas de Informes, tarjetas de Agenda).
4. **Ejecutor general:** `lib/chispaOps.ts` ejecuta las acciones confirmadas con la sesion
   Supabase del usuario (RLS + can()). El LLM nunca ejecuta escrituras directamente.

**Regla dura (PR-12):** Chispa propone, el profesional dispone. Toda escritura es una
propuesta con Confirmar.

## 3. Dónde encaja la Sesion 9

Las sesiones previas (1-8) construyeron el núcleo:
- **S1:** Protocolo de bloques + renderer + Chispa global
- **S2:** RBAC + consentimiento + regla de salud
- **S3:** Ejecutor general (crear_presupuesto, enviar_mensaje_bandeja, etc.)
- **S4-S8:** Retrasos con alternativas, voz, analítica, Q&A cliente, lista de espera

**S9 es la sesion de superficies:** llevar Chispa a 8 páginas concretas del software para
que sea útil en el dia a dia, no solo en la agenda.

## 4. Prerrequisitos (YA HECHO, no reconstruir)

### De la Sesion 1 (nucleo generativo):
- `lib/chispaBloques.ts`: tipos Bloque = { tipo, datos } con 'texto'|'accion'|'enlace'|'grafica'|'comparativa'
- `components/chispa/BloqueRenderer.web.tsx`: renderiza cada tipo
- `components/chispa/ChispaLauncher.web.tsx`: burbuja global montada en `app/_layout.tsx`
- `components/chispa/ChispaPanel.web.tsx`: panel con input + burbuja + toggle altavoz
- Persona Chispa unificada: misma voz/estética que el onboarding (tokens fuego #f4501e)

### De la Sesion 2 (RBAC + seguridad):
- `lib/permissions.ts`: `can()` y caps por rol (ej: `agenda.ver`, `informes.ver`, `bandeja.escribir`)
- Lista blanca de campos Q&A cliente: nombre, telefono, historial, gasto. **Salud fuera.**
- Flag `consiente_ia` en clientes: si false, Chispa no la conoce

### De la Sesion 3 (ejecutor general):
- `lib/chispaOps.ts`: ejecutor de acciones con validacion server-side
  - `confirmar_citas`: batch pendientes -> confirmadas
  - `editar_servicio`: precio/nombre/duracion/activo del catalogo
  - `editar_horario`: fija turno de profesional
  - `crear_presupuesto`: borrador (reutiliza backend existente)
  - `enviar_mensaje_bandeja`: borrador (envio real = Alexandro)
- Patrón: validacion en edge -> tarjeta propone -> usuario confirma -> ejecuta

### De la Sesion 6 (analítica, herramientas reutilizables):
- Tools de lectura agregada en el edge: `resumen_caja`, `ocupacion`, `citas_hoy`, `metas_progreso`
- Bloques visuales: `grafica` (serie temporal), `comparativa` (actual vs anterior con delta %)

### De la Sesion 7 (Q&A cliente + riesgo no-show):
- Tool `ficha_cliente(texto|id)` en el edge: devuelve operativos + booleano `tiene_notas_salud`
  (sin contenido)
- Score de riesgo no-show determinista: no_shows + cancelaciones_tardias + antigüedad
- RPC `registrar_aviso_fuga`: deja registro 'pendiente' para motor de Alexandro

## 5. Reglas que debes respetar

1. **PR-12:** Chispa propone, usuario confirma. El LLM nunca ejecuta escrituras.
2. **PR-12-bis (Alexandro = envios reales):** WhatsApp/publicar resenas = tarea de Alexandro.
   Deja borradores/flags, nunca llames a APIs de envio.
3. **Multi-tenant estricto:** todo SELECT `.eq('negocio_id', ...)`; todo INSERT incluye `negocio_id`.
4. **Sin any:** TypeScript estricto en todo codigo nuevo.
5. **Movil primero:** usa `useResponsive()` en toda nueva UI.
6. **Identificacion:** Chispa se identifica SIEMPRE como IA.
7. **Salud fuera del LLM:** datos de salud/alergias/medicacion NUNCA viajan al LLM.
8. **Sin claims falsos:** nada de cifras/reviews inventadas.

## 6. Division S9-A / S9-B

**S9-A (superficies dia a dia, UI centricas):**
1. **Resenas:** boton sugerir respuesta, sentimiento, temas recurrentes
2. **Bandeja:** borrador respuesta, triage, convertir en cita/presupuesto
3. **Mi Jornada:** tu dia personal (proxima clienta, notas NO sensibles, comision, huecos)
4. **Upsell en cobro:** sugerencia basada en historial

**S9-B (superficies analiticas, backend intensivas):**
1. **Presupuestos:** crear desde descripcion NL, upsell, seguimiento
2. **Inventario:** stock bajo, prediccion reposicion, pedido sugerido
3. **Equipo:** resumen comisiones/liquidacion, deteccion sobrecarga/huecos
4. **Recompra predictiva:** calculo recurrencia, candidatas retinte

## 7. Edge functions existentes

- `supabase/functions/agenda-asistente/`: LLM tool-use, tools de lectura (S6, S7)
- `supabase/functions/chispa-stt/`: STT fallback para Safari/iPad
- `supabase/functions/chispa-tts/`: TTS ElevenLabs

## 8. Verificacion y cierre

1. `npm run build:web` + `npx tsc --noEmit` (ignora errores de supabase/functions/ que son Deno)
2. Verificacion en demo: `node scripts/serve-web.mjs` -> http://localhost:8080/demo.html?share=1
3. Commit(s) feat:/fix: por superficie
4. Push a master (produccion despliega de ahi)
5. Actualiza `informes/MEGA_INFORME_MECHA.md` con lo hecho
6. Marca la sesion como HECHA en `informes/PLAN-IA-CHISPA.md`
7. Si otra sesion empujo a master: stash/pull/pop rutinario

## 9. Verificacion E2E

Recorrido por cada superficie construida en el demo (tenant demo_salon_001).
Respeta rol: un Profesional solo ve su jornada, no datos globales.
