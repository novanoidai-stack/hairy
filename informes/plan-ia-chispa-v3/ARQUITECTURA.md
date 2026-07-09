# ARQUITECTURA de la capa IA (Chispa) — fuente de verdad

> Salida de la **Sesión S01** (plan V3, árbol). Este documento **delimita** la capa IA
> (módulos, contratos, flujo de datos, límites), la deja **óptima** (un solo camino por
> responsabilidad) y define su **auto-conocimiento** (lo que Chispa sabe de sí misma).
> Contrato para las 26 sesiones restantes: **no romper** los contratos aquí descritos; si hay
> que cambiar uno, se actualiza aquí y en el README de la raíz.
>
> Espejo legible por máquina: [`lib/ia/manifiestoIA.ts`](../../lib/ia/manifiestoIA.ts).
> Verificado contra el repo/BD el 2026-07-09 (grep + MCP Supabase). Nada inventado: lo aún
> no construido va marcado como **planificado**.

---

## 1. Principios (de la RAÍZ, resumidos)

1. **IA propone, el humano confirma.** El LLM **nunca** ejecuta escrituras ni decide el orden.
2. **Determinista primero.** Cálculos y flujos de orden fijo los orquesta el cliente; el LLM
   interpreta / redacta / sugiere.
3. **Casi nunca texto plano.** Toda respuesta sale en la mejor superficie (acción, formulario,
   opciones, gráfica, enlace). Texto seco = último recurso.
4. **Nada de fallo silencioso.** Toda superficie IA tiene estados visibles cargando/vacío/error.
5. **Multi-tenant + RLS + rol.** El edge deriva `negocio_id` + rol del JWT; todo SELECT filtra por
   `negocio_id`.
6. **Salud fuera del LLM** (art. 9 RGPD). Lista blanca en Q&A de ficha.
7. **Una sola fuente de verdad por responsabilidad** (contra la deriva).

---

## 2. Mapa de módulos por capa

Cada entrada existe de verdad (verificada). Detalle tipado y contrato en `lib/ia/manifiestoIA.ts`.

### Capa UI (lo que el usuario ve)
| Módulo | Dónde | Contrato |
|---|---|---|
| Panel de Chispa (drawer voz/texto) | `components/chispa/ChispaPanel.web.tsx` + `ChispaLauncher.web.tsx` (montado en `app/_layout.tsx`) | entrada: mensajes + `onRespuestaInteractiva(bloque,payload)`; salida: `Bloque[]` |
| Renderer de bloques | `components/chispa/BloqueRenderer.web.tsx` | `Bloque` → nodo React |
| Protocolo de bloques tipados | `lib/chispaBloques.ts` | union EXTENSIBLE `texto\|enlace\|accion\|grafica\|comparativa\|formulario\|opciones\|progreso`; `normalizarRespuesta()` |
| Tarjeta de IA por página | `components/chispa/TarjetaAyudaIA.web.tsx` | consume `EstadoAyudaIA` |

### Capa orquestación (cliente, determinista)
| Módulo | Dónde | Contrato |
|---|---|---|
| Hook `useAyudaIA` | `lib/hooks/useAyudaIA.ts` | `analizar(prompt,contexto)` → estado `idle\|cargando\|vacio\|error\|listo`; `reintentar()` |
| Ejecutor general | `lib/chispaOps.ts` (+ `lib/agendaOps.ts`) | aplica `AccionPropuesta` **tras confirmación** |
| Organizador de agenda | `lib/organizarAgenda.ts` (+ `lib/retrasos.ts`, `lib/upsellCandidato.ts`) | citas+config → plan de movimientos (mueve las 4 marcas) |
| Config guiada | `lib/onboardingAgent.ts` | intención → pasos de formulario + escrituras de config |

### Capa edge / LLM (el cerebro)
| Módulo | Dónde | Contrato |
|---|---|---|
| `agenda-asistente` | `supabase/functions/agenda-asistente/index.ts` (+ `permisos.ts`, `whitelist.ts`) | `POST { mensajes } + Authorization` → `{ bloques, texto, accion_propuesta? }` |
| Auto-conocimiento (S01) | `AUTOCONOCIMIENTO_IA` dentro de `index.ts` (proyección de `manifiestoIA.ts`) | inyectado en el system prompt; responde "qué sé hacer / dónde está X" con chips `sugerir_enlace` |
| Razonamiento universal (S02) | `PROCEDIMIENTO_UNIVERSAL` (prompt) + `garantizarSuperficie()` (en `finalizar()`) en `index.ts` | procedimiento fijo por turno + doctrina "casi nunca texto plano"; **garantiza** una superficie útil (nunca texto seco/cuelgue). Doc: `RAZONAMIENTO-UNIVERSAL.md` |

El prompt lo arma `buildSystemPrompt()`: instrucciones + **AUTOCONOCIMIENTO_IA** + `MAPA_CONFIG` +
`CONFIG_EDITABLE_TEXT`. Las tools de escritura se detectan en `permisos.ts` (`esEscritura`), no se
duplica el set. El scope (`all\|self\|none`) se deriva del rol + `asistenteProfesionalEscribe`.

### Capa voz
| Módulo | Dónde | Contrato |
|---|---|---|
| TTS con respaldo | `supabase/functions/chispa-tts` + `lib/hooks/useChispaVoz.web.ts` | Kokoro-FastAPI (VPS) → ElevenLabs → `speechSynthesis` del navegador (con aviso honesto) |
| STT | `supabase/functions/chispa-stt` + Web Speech | audio → texto |

### Capa catálogo / descubribilidad
| Módulo | Dónde | Contrato |
|---|---|---|
| Catálogo de funciones | `lib/iaCatalogo.ts` (`CATALOGO_IA`) | `FuncionIA[]` (id, título, descripción, ubicación, uso, categoría, soloGestor) |
| Hub "Qué hace la IA" | `components/config/HubIA.tsx` | consume el catálogo, agrupa por categoría |
| **Manifiesto** (S01) | `lib/ia/manifiestoIA.ts` | superficies **derivadas** de `CATALOGO_IA` + módulos de arquitectura |

### Capa datos
| Tabla | RLS | Uso |
|---|---|---|
| `conversaciones_ia` | por `negocio_id` | log de los agentes de canal (WhatsApp/voz): `canal, telefono, cliente_id, cita_id, resumen(text), transcripcion(jsonb)`. **No** es la memoria del panel in-app. |

### Capa memoria/registro — **PLANIFICADA** (Fase C: S08–S11). No existe aún; contrato reservado.
| Módulo | Estado | Contrato **propuesto** (lo crean S08–S11, no S01) |
|---|---|---|
| Memoria corto plazo (sesión) | planificado | hoy solo `localStorage` del panel; sin persistencia durable |
| Memoria largo plazo (negocio/ficha) | planificado | tabla `ia_memoria (negocio_id, ambito, clave, valor, vigencia)`; RLS por `negocio_id`; retención + borrado RGPD; **salud NUNCA** |
| Registro universal (episódica) | planificado | tabla `ia_registro (negocio_id, actor, accion, entidad, ts, meta jsonb)`; base del recuerdo temporal |

---

## 3. Flujo de datos de una petición (punta a punta)

```
Usuario (voz/texto en el Panel)
  → ChispaPanel.web.tsx arma { mensajes } y llama al edge con el JWT
    → agenda-asistente: getUser() → profile(negocio_id, role) → negocio_config → scope
      → buildSystemPrompt(hoy, scope, puedeInformes)  [instrucciones + AUTOCONOCIMIENTO + MAPA_CONFIG + CONFIG_EDITABLE]
      → LLM (OpenRouter) con tools de lectura (info_catalogo, buscar_cliente, listar_citas, ...)
        y de escritura (crear_cita, cambiar_config, ...)
      → tool de lectura: consulta BD (service key, filtrada por negocio_id) y responde
      → tool de escritura: NO escribe; construye una AccionPropuesta
      → el edge emite Bloque[] (texto/enlace/accion/grafica/opciones/formulario/...)
  → BloqueRenderer pinta los bloques
  → si es 'accion' (propuesta), el usuario CONFIRMA en la tarjeta
    → lib/chispaOps.ts / lib/agendaOps.ts ejecuta la escritura en BD (RLS)
  → resultado visible (nunca fallo silencioso)
```

Para IA por página (Caja, Clientes, Informes…): la pantalla usa `useAyudaIA.analizar(prompt,ctx)`,
que llama al mismo edge y muestra el resultado en `TarjetaAyudaIA` con estados visibles.

---

## 4. Modelo de memoria (contrato para las Fases C; **no se implementa en S01**)

Cuatro niveles, sobre RLS por `negocio_id` y con retención/borrado RGPD:

- **Corto plazo (sesión):** hilo de la conversación actual. Hoy `localStorage`; S09 decide si se
  hace durable. En **demo** (`demo_salon_001`, tenant compartido) **no** se persiste memoria
  cross-visitante.
- **Largo plazo (semántica):** hechos aprendidos del negocio y de cada ficha
  (`ia_memoria`, S09/S10). **Salud fuera** (lista blanca).
- **Episódica:** "todo queda registrado" — bitácora de acciones (`ia_registro`, S08).
- **Recuerdo temporal:** índices por fecha sobre la episódica para "¿qué pasó hace 4 meses?" (S11).

Firmas de tabla **propuestas** (contrato, no crear aquí):
`ia_memoria(id, negocio_id text, ambito text, ref_id uuid null, clave text, valor jsonb, vigencia tstzrange null, created_at, updated_at)` ·
`ia_registro(id, negocio_id text, actor text, accion text, entidad text, entidad_id text null, ts timestamptz, meta jsonb)`.

---

## 5. Auto-conocimiento (cómo Chispa sabe qué sabe)

- **Canónico:** `lib/ia/manifiestoIA.ts`. `SUPERFICIES_IA` se **derivan** de `CATALOGO_IA`
  (`CATALOGO_IA.map(...)`): imposible divergir del Hub/manuales por construcción. `MODULOS_IA`
  enumera las piezas internas de arquitectura.
- **En el edge:** `AUTOCONOCIMIENTO_IA` (constante compacta en `index.ts`) es la **proyección**
  de las superficies, inyectada en el system prompt. Ante "¿qué sabes hacer?" / "¿dónde configuro
  X?", Chispa responde desde esa lista y ofrece chips `sugerir_enlace` (superficie visual, no texto
  seco). El edge (Deno) no puede importar `@/`, por eso lleva una copia compacta mantenida a mano;
  `resumenAutoconocimiento()` documenta el mismo algoritmo de proyección.
- **Regla:** una función solo entra en el auto-conocimiento si existe de verdad (está en el
  catálogo). Nada de capacidades inventadas.

---

## 5-bis. Razonamiento universal (S02) — cómo afronta Chispa cualquier petición

- **Procedimiento fijo por turno** (en el prompt, `PROCEDIMIENTO_UNIVERSAL`): clasificar la
  intención (acción · consulta/analítica · config · navegación · memoria · charla) → comprobar
  datos suficientes (si faltan, **un** formulario/opciones pre-rellenado, mínima info) → elegir
  la **mejor superficie** → proponer → confirmar (PR-12) → registrar (paso planificado, Fase C).
- **Doctrina "casi nunca texto plano":** cifra → gráfica/comparativa; lista → opciones; dato
  que falta → formulario; navegación/config → enlace; operación → tarjeta de acción.
- **Red de seguridad determinista** (`garantizarSuperficie()` en `finalizar()`): si la respuesta
  final no trae ninguna superficie útil, se le adjunta un bloque `opciones` de acciones rápidas
  según el rol. Convierte la doctrina en una garantía verificable: **nunca** texto seco ni cuelgue,
  y el fallback de intención no reconocida es un menú accionable, no "no te he entendido".
- Detalle completo (taxonomía + árbol de decisión): `RAZONAMIENTO-UNIVERSAL.md`.

## 6. Deriva resuelta en S01

- **Importador CSV duplicado.** Existían `components/config/TabImportarCitas.tsx` (importador CSV
  Booksy/Fresha con mapeo manual de columnas) y `components/config/TabMigracionMagica.tsx`
  (Migración Mágica: CSV **o** fotos, extracción con IA). Solo **Migración Mágica** estaba montada
  en `configuracion.web.tsx`; `TabImportarCitas` estaba **huérfano** (sin ningún import). **Decisión:
  retirado `TabImportarCitas.tsx`.** Un solo camino de importación: Migración Mágica
  (`agenda_booksy_fresha` cubre el caso CSV). Sin cambio de UX para el usuario.
- **Deuda restante conocida (no de S01):** varios `.web.tsx` redefinen `TOKENS` localmente en vez
  de `lib/designTokens.ts` (deuda C14) — se aborda en la fase A de diseño, no aquí.

---

## 7. Límites (lo que la capa IA **no** hace)

- El LLM no ejecuta escrituras ni decide orden de flujo.
- No toca datos de salud/alergias/medicación.
- No inventa cifras, precios ni funciones.
- No expone secretos: el manifiesto solo lleva nombres de módulo, rutas y descripciones.
- No hay (todavía) memoria durable ni escaneo proactivo 24/7: son Fases C y D.
