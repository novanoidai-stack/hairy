# Diseño: Organizador de Agenda Inteligente (multídia, consciente de horarios, con latidos)

**Fecha**: 2026-08-10
**Estado**: Diseño aprobado (sin implementar). Abordar por capas: Fase 1 → 2 → 3.
**Decisión del usuario**:
- Aviso al cliente al mover cita → **proponer y esperar confirmación** (con badge visual de "pendiente de confirmación" en la cita).
- Ventana temporal del organizador → **hoy + próximos 7 días**.
- Lista de espera al abrir hueco → **auto-asignar + avisar**.
- Abordaje → **solo diseño ahora, implemento después**.

---

## 0. Diagnóstico — por qué falla cada queja (file:line)

| Queja | Causa raíz |
|---|---|
| "No respeta horarios del trabajador" | `OrganizarAgendaPanel.web.tsx:142-150` NO pasa `horariosProfesional` a `analizarAgendaDia`. El badge del calendario SÍ (`AgendaCalendar.web.tsx:1400`). Bug de cableado; la función ya admite la opción (`organizarAgenda.ts:271`). |
| "No respeta bloqueos/descansos/vacaciones" | `bloqueos` solo se usa como ocupación en `detectarHuecosVacios` (`organizarAgenda.ts:631`). No hay detector de "cita existente cae en tramo no laborable". |
| "No ve los cierres/festivos" | `analizarAgendaDia` nunca lee `cierres_negocio`. `ventanaDelDia` (`:295`) cae al default si el día está cerrado en vez de bloquear. |
| "No avisa de cita en tramo no laborable" | `tramosDelProfesional` (`:316`) solo busca huecos nuevos, no audita citas ya colocadas. |
| "Solo mira el día actual" | `analizarAgendaDia` filtra a un único `diaMs` (`organizarAgenda.ts:697`). |
| "Lista de espera: no avisa al crear hueco moviendo" | El matching solo se dispara al **cancelar** (`AgendaCalendar.web.tsx:15323`). Mover una cita no marca el slot antiguo como revisable. |
| "Hueco vacío sin botón" | `detectarHuecosVacios` (`:656`) emite texto plano, `estrategias: []`. |
| "Se buguea / no repiensa" | Reevaluación reactiva vía `useMemo` ya existe, pero no hay latido proactivo. |
| "No evalúa miles de posibilidades" | El motor es determinista de pasada única; no genera/puntúa alternativas. |
| "Mover cita al día siguiente" | `calcularEstrategiasRetraso`/`Solape` operan dentro del MISMO día. |
| "WhatsApp + esperar confirmación" | **Ya existe y completo**: `proponer_cambio_cita` (`propuestas-cambio-cita.sql:99`), `responder_propuesta_cambio` (`:225`), `caducar_propuestas_cambio` (`:332`). No se invoca desde el organizador; `responder_propuesta_cambio` no tiene UI pública. |
| "Visualmente saber cita pendiente de confirmarse" | `reserva_temporal` se inserta en `bloqueos_profesional` pero la rejilla la pinta con fallback gris (`BLOQUEO_COLORS` no tiene entrada, `AgendaCalendar.web.tsx:6502`). La cita original no muestra badge. |

**Piezas huérfanas ya escritas a conectar** (existen pero nadie las importa):
- `lib/agenda/validadorFestivosTurnos.ts:30` — `validarTurnoYFestivo`
- `lib/propuestasCambio.ts:28` — `proponerCambioCita` (wrapper frontend de la RPC)

---

## 1. Arquitectura objetivo (4 capas)

```
CAPA 4 — UI: OrganizarAgendaPanel multídia + badge en rejilla + botones Proponer/Auto-asignar
CAPA 3 — Motor de propuestas (NUEVO): lib/organizador/motorPropuestas.ts
         genera/puntúa miles de candidatos, mantiene cita localizada, latido
CAPA 2 — Orquestador multídia: extender lib/organizarAgenda.ts
         analizarAgendaRango, detectarFueraJornada
CAPA 1 — Datos: tablas existentes + 1 RPC nueva
```

**Principios no negociables**:
1. Determinista primero (TS puro, LLM opcional para el chatbot).
2. Una cita, una propuesta viva (constraint `citas_propuestas_cambio_una_viva_idx` ya lo garantiza).
3. Toda escritura por el mismo camino: `chispaOps.ejecutarAccion({tipo:'optimizar_agenda'})` → auditoría en `citas_historial`.
4. Reevaluación reactiva + proactiva (latido).
5. El movimiento propuesto NO se aplica hasta confirmación del cliente (decisión del usuario). Mientras tanto, cita original visible y hueco destino retenido con `reserva_temporal`.

---

## 2. FASE 1 — Bugs críticos (quick wins)

**Objetivo**: que el organizador deje de proponer horas inválidas y avise de citas en tramos no laborables.

### 2.1 Cableado de `horariosProfesional` y `cierres` al panel
- `components/agenda/OrganizarAgendaPanel.web.tsx`
  - Añadir props `horariosProfesional?` y `cierres?` a la interfaz (`:61-78`).
  - Pasarlos en la llamada a `analizarAgendaDia` (`:142-150`): `horariosProfesional, cierres`.
- `components/agenda/AgendaCalendar.web.tsx:4837-4859`
  - Pasar `horariosProf={horariosProf}` y `cierres={cierres}` al render del panel (ya están en estado, `:962`, `:948`).

### 2.2 Nuevo tipo de problema `fuera_jornada`
En `lib/organizarAgenda.ts`:
- Añadir `'fuera_jornada'` a `TipoProblemaAgenda` (`:55`) y a `PESO_TIPO` (`:131`) con peso ~3500 (entre solape y retraso: cita que ya está mal puesta).
- Nueva función `detectarFueraJornada(citasProf, tramos, bloqueos, ahoraMs)`:
  - Para cada cita activa, comprueba si `[inicio, fin_activa]` (o `[fin_espera, fin]`) cae **fuera** de todos los tramos del profesional, **o** dentro de un bloqueo (vacaciones/descanso/baja).
  - Devuelve `ProblemaAgenda` con `tipo:'fuera_jornada'` y descripción clara ("María no trabaja los martes por la tarde" / "María está de vacaciones ese día").
- Llamarla en `analizarAgendaDia` (`:712`) después de `detectarSolapes`, antes de `detectarHuecos`.

### 2.3 Respeto a `cierres_negocio`
- `analizarAgendaDia` recibe `cierres?: { fecha: string }[]`.
- En `ventanaDelDia` (`:295`): si la fecha está en `cierres` → retorna jornada vacía (apertura=cierre). Eso hace que `detectarHuecos` no proponga nada y `detectarFueraJornada` marque todas las citas del día.
- El comentario `:293` ("mejor reorganizar que no ofrecer nada") cambia de política: un día cerrado es cerrado.

### 2.4 Tests de regresión (`lib/organizarAgenda.test.ts`, deno)
- Cita a las 14:30 con profesional que solo trabaja 9-14 → genera `fuera_jornada`.
- Día en `cierres` → no se proponen huecos, todas las citas marcadas.
- Profesional con dos turnos (9-13, 16-20): hueco en la comida (13-16) nunca se propone.
- Bug pre-fix: sin `horariosProfesional` propone 14:30; con él, no.

---

## 3. FASE 2 — Visión multídia + motor de propuestas

**Objetivo**: analizar hoy + 7 días, proponer mover a otro día/trabajador, evaluar miles de posibilidades.

### 3.1 Orquestador multídia
En `lib/organizarAgenda.ts`:
- Nueva export `analizarAgendaRango(citas, profesionales, opts: { desdeMs, hastaMs, ...resto })`:
  - Itera día a día en el rango, llama a `analizarAgendaDia` por cada uno, agrega resultados.
  - Etiqueta cada `ProblemaAgenda` con `fechaDia: string` (nuevo campo) para agrupar en la UI.
  - Cachea tramos/horarios por `(profesionalId, fechaISO)` para no recalcular.
- `analizarAgendaDia` queda como primitiva de un día; `analizarAgendaRango` la envuelve.

### 3.2 Motor de propuestas (NUEVO) — `lib/organizador/motorPropuestas.ts`
El "cerebro" que evalúa miles de movimientos candidatos y mantiene localizada la cita.

```ts
interface MovimientoCandidato {
  citaId: string;
  nuevoInicio: number;            // ms
  nuevoProfesionalId?: string;    // si cambia de trabajador
  nuevoFinActiva: number;
  nuevoFin: number;
  nuevoFinEspera: number;
  score: number;                  // mayor = mejor
  razonScore: string;             // explicación legible
  tipo: 'compactar' | 'cambiar_dia' | 'cambiar_trabajador' | 'aprovechar_reposo';
}
```

**Generador de candidatos** (por cada cita movible, ~miles de combinaciones):
- **Deltas de minutos**: en steps de `SLOT_MIN` (15 min), desde `−maxAdelantoMin` hasta `+maxRetrasoMin`.
- **Cambio de trabajador**: iterar profesionales activos cuya `categoria` ≥ `categoriaMinima` del servicio.
- **Cambio de día**: ±1, ±2, … ±7 días (dentro del rango).
- **Snap a reposos existentes**: como hoy hace `buscarHueco(soloReposo:true)`.

**Función de score** (mayor = mejor propuesta):
- `+ganancia_compactación` (min reducidos entre cita y la anterior).
- `+aprovecha_reposo` (bonus si cae en un reposo libre).
- `−penalización_cambio_día` (cambiar de día pesa más que mover dentro del día).
- `−penalización_cambio_trabajador` (si el cliente pidió a alguien concreto).
- `−requiere_confirmación_cliente` (si mueve a otro día/trabajador, pesa más porque hay que avisar).
- **Hard constraint**: si el movimiento cae fuera de tramos o choca activa-activa → score = `−∞` (descartado).

**Mantener localizada la cita**:
- El motor devuelve referencias estables a la cita (`citaId`) y su estado "actual" vs "propuesto".
- Tras cualquier cambio aplicado, el motor se reinvoca con el nuevo conjunto de citas y **relocaliza** la cita movida (sigue siendo la misma por `id`).

**Latido (evaluación constante)**:
- En el panel: `useEffect` con `setInterval` cada 60-90 s que reinvoca el motor si el panel está abierto.
- Reset del timer tras cualquier acción del usuario (aplicar/proponer).
- Tras cada aplicación, `useMemo` ya recalcula (reactivo). El latido cubre el caso "cambios externos" (otra terminal, cliente confirma por WhatsApp).

### 3.3 UI multídia
`OrganizarAgendaPanel.web.tsx`:
- Cabecera cambia de "hoy" a segmentos: **Hoy · Mañana · Esta semana** (o agrupación por fecha con cabeceras "Martes 12 · 3 problemas").
- Cada tarjeta muestra el día explícitamente (`fmtFechaHora` ya lo hace).
- El botón "Enséñamelo" navega la rejilla al día del problema (no solo `fechaVista`).

---

## 4. FASE 3 — Cliente (WhatsApp + confirmación) y lista de espera

### 4.1 Proponer al cliente y esperar confirmación
**Reutiliza `proponer_cambio_cita` (ya completo) desde el organizador.**

- En `OrganizarAgendaPanel.web.tsx`, nueva acción por problema: **"Proponer al cliente"**.
- Llama a `proponerCambioCita(citaId, inicioPropuestoISO, margenReaccionMin)` (`lib/propuestasCambio.ts:28`).
- Comportamiento:
  - Envía WhatsApp (vía `lista_espera_avisos` → n8n).
  - Retiene el hueco destino con `bloqueos_profesional.tipo='reserva_temporal'`.
  - La cita **no se mueve** hasta que el cliente acepta.
  - Si no contesta en `expira_at` → `caducar_propuestas_cambio()` (cron existente) libera el hueco.
- El panel muestra el estado de la propuesta (`pendiente / aceptada / rechazada / caducada`) consultando `citas_propuestas_cambio`.

### 4.2 Badge visual "pendiente de confirmación" en la rejilla
**Decisión explícita del usuario: visualmente saber que una cita tiene movimiento propuesto.**

En `components/agenda/AgendaCalendar.web.tsx`:
- Cargar `citas_propuestas_cambio` activas para el negocio (nueva query en el `Promise.all` de `:903`).
- En el render del bloque (`:8203-8288`), si la cita tiene propuesta `pendiente`:
  - Badge superpuesto: icono reloj + "Cambio propuesto → mar 14:30".
  - Borde animado/discontinuo para distinguir de una cita normal.
- En `BLOQUEO_COLORS`/`BLOQUEO_LABELS` (`:6502-6524`), añadir entrada `reserva_temporal` con color propio (violeta) y label "Hueco reservado (cambio propuesto)" para que la retención se vea bien, no como fallback gris.

### 4.3 UI pública de confirmación del cliente (gap actual)
**Hoy `responder_propuesta_cambio` no tiene consumidor frontend.** El enlace `{{6}}` del WhatsApp va a `/app/cita/[id]` que usa otras RPCs.
- Extender `app/cita/[id].web.tsx` para detectar `?propuesta=<id>` y ofrecer "Aceptar el cambio / Rechazar" llamando a `responder_propuesta_cambio(slug, propuestaId, telefono, acepta)`.
- Esto completa el bucle: organizador propone → n8n envía WA → cliente entra al enlace → acepta/rechaza → la cita se mueve (o se libera el hueco).

### 4.4 Lista de espera: auto-asignar + avisar (decisión del usuario)
**Dos detonantes nuevos:**

**A) Al crear un hueco por movimiento del organizador**
- En `chispaOps.ts` caso `optimizar_agenda` (aplicar, `:889-928`), tras aplicar los `movimientos`:
  - El slot que la cita **dejó libre** (su `[inicio, fin]` original) queda hueco.
  - Llamar a la nueva RPC `revisar_hueco_lista_espera(p_cita_id, p_slot_inicio, p_slot_fin)`.
  - Devuelve `{ ofertas_creadas: N, candidatos: [...] }`.
- En el panel, tras aplicar, mostrar toast: "Se ha avisado a 2 personas de la lista de espera por el hueco liberado".

**B) Huecos vacíos detectados → acción directa (no solo aviso)**
- `detectarHuecosVacios` hoy devuelve `estrategias: []`. Cambiar:
  - Añadir estrategia `tipo: 'ofrecer_lista_espera'` que envuelva la llamada a `candidatos_para_hueco`.
  - La tarjeta del `hueco_vacio` pasa de "Nada que mover" a un botón **"Ver X de la lista de espera"** que abre `ListaEsperaPropuestaModal` (ya existe) o auto-asigna con `asignar_candidato_hueco`.

**C) Reevaluación al crear hueco**
- Tras cualquier aplicación, el motor (`motorPropuestas.ts`) reincluye el hueco liberado en su análisis y, si cabe alguien de la lista de espera, lo propone.
- "Si mueves una cita adelante, una de atrás un poquito, ese cambio no te lo propongo": el score del motor penaliza micro-movimientos que no ganan compactación (< `umbralHuecoMin`).

### 4.5 Detonante de movimiento (gap crítico en BD)
Hoy `procesar_lista_espera` solo mira `estado='cancelada'`. Para que el motor detecte huecos por movimiento, dos opciones:
- **Opción A (frontend, recomendada Fase 3)**: el organizador, tras aplicar, llama explícitamente a `revisar_hueco_lista_espera`. Simple, sin tocar el cron.
- **Opción B (BD)**: trigger en `UPDATE citas` cuando cambian `inicio`/`profesional_id` → marca el slot antiguo como revisable. Más robusto pero más invasivo.

---

## 5. Robustez: que no se buguee ante cambios

### 5.1 Reevaluación post-aplicación garantizada
- Tras `aplicarEstrategia` (`OrganizarAgendaPanel.web.tsx:160`), `onAplicado` actualiza `citas` en el padre → el `useMemo` del panel recalcula.
- **Verificar** que `onAplicado` (`AgendaCalendar.web.tsx:1427-1465`) efectivamente actualiza el estado que alimenta al panel (no solo la rejilla).
- Añadir test E2E: aplicar una estrategia → el problema desaparece de la lista → no aparece un problema fantasma sobre la cita movida.

### 5.2 Latido proactivo
- `useEffect` en el panel con `setInterval(reevaluar, 75000)` mientras esté abierto.
- En cada tick: re-fetch ligero de `citas` (solo las del rango) + reinvocar motor.
- Si el usuario está editando (drag en curso), saltar el tick.

### 5.3 "Enseñamelo" robusto
- `onEnsenar` ya resalta la zona (`AgendaCalendar.web.tsx:1467-1488`).
- Garantizar que al cambiar de día (problema multídia), `fechaVista` se actualiza al día del problema antes de resaltar.

### 5.4 Consistencia demo
- `esDemoCompartida` simula escrituras (`:164-170`). El motor de propuestas debe funcionar en demo sin llamar a RPCs reales (mock de `proponer_cambio_cita` y `revisar_hueco_lista_espera`).

---

## 6. Modelo de datos: cambios necesarios

Mínimos. La infraestructura ya existe casi toda.

### 6.1 Sin cambios de esquema (reutilizar)
- `citas_propuestas_cambio` — completo.
- `bloqueos_profesional.tipo='reserva_temporal'` — completo.
- `lista_espera`, `lista_espera_ofertas`, `lista_espera_avisos` — completas.
- `citas.es_oferta_espera`, `citas.lista_espera_revisada` — completas.

### 6.2 Nueva RPC (1)
`revisar_hueco_lista_espera(p_cita_id uuid, p_slot_inicio timestamptz, p_slot_fin timestamptz)`:
- Security definer, granted `authenticated`.
- Reutiliza `_lista_espera_mejor_candidato` + `_lista_espera_ofrecer` (o `avisar_lista_espera_candidata`).
- Crea ofertas tentativas para el slot liberado, encola avisos.
- Devuelve JSON con candidatos avisados.
- Migración: `migrations/organizador-revisar-hueco-lista-espera.sql`.

### 6.3 Sin nuevas columnas en `citas`
El badge "pendiente de confirmación" se deriva de `citas_propuestas_cambio` (join), no hace falta flag.

### 6.4 Configuración nueva en `negocio_config`
Claves (con defaults sensatos):
- `organizadorVentanaDias` (default 7) — ventana del análisis multídia.
- `organizadorLatidoMs` (default 75000) — intervalo de reevaluación.
- `organizadorAutoListaEspera` (default true) — auto-asignar al mover.
- Reusar `agendaMaxAdelantoMin`, `agendaUmbralHuecoMin`, `agendaMargenReaccionMin` ya existentes.

---

## 7. Archivos a tocar (resumen ejecutivo)

### Nuevos
- `lib/organizador/motorPropuestas.ts` — motor de scoring de candidatos.
- `lib/organizador/motorPropuestas.test.ts` — tests del motor.
- `lib/organizador/__types.ts` — tipos compartidos (`MovimientoCandidato`, etc.).
- `migrations/organizador-revisar-hueco-lista-espera.sql` — RPC nueva.
- `app/cita/[id].web.tsx` (extender) — UI de confirmación de propuesta.

### Modificados
- `lib/organizarAgenda.ts` — `analizarAgendaRango`, `detectarFueraJornada`, `cierres` en `ventanaDelDia`, tipo `'fuera_jornada'`.
- `components/agenda/OrganizarAgendaPanel.web.tsx` — props nuevas, UI multídia, botones proponer/auto-asignar, latido.
- `components/agenda/AgendaCalendar.web.tsx` — pasar props, cargar `citas_propuestas_cambio`, badge visual, `BLOQUEO_COLORS` entrada `reserva_temporal`, `onEnsenar` multídia.
- `lib/chispaOps.ts` — caso `optimizar_agenda` llama a `revisar_hueco_lista_espera` tras aplicar.
- `lib/propuestasCambio.ts` — ya listo, solo se consume desde el panel.
- `lib/organizarAgenda.test.ts` — tests de regresión.

---

## 8. Orden de implementación propuesto

1. **Fase 1** (día 1-2): cablear `horariosProf` + `cierres`, añadir `detectarFueraJornada`, tests. → Resuelve las 3 quejas de "no respeta horarios/bloqueos/cierres".
2. **Fase 2** (día 3-5): `analizarAgendaRango`, UI multídia, `motorPropuestas.ts` con scoring, latido. → Resuelve "solo mira hoy" + "evalúa miles de posibilidades".
3. **Fase 3** (día 6-8): propuesta al cliente + badge visual + UI pública confirmación + auto-asignar lista de espera + RPC `revisar_hueco_lista_espera`. → Resuelve "WhatsApp + confirmación" + "lista de espera inteligente".
4. **Fase 4** (día 9): tests E2E, pulido UI, migrar detonante lista de espera a BD si procede.

Cada fase es desplegable y validable por separado. **Fase 1 sola ya resuelve los bugs más dolorosos.**

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Performance: analizar 7 días × N prof × miles candidatos | Cachear tramos por día; podar candidatos con hard constraints antes de score; limitar top-N en UI. |
| El cliente no contesta a la propuesta → el hueco queda retenido | `caducar_propuestas_cambio` ya corre cada 5 min; mostrar en el panel propuestas caducadas para reofrecer. |
| Auto-asignar lista de espera crea citas que el cliente final no confirma | Usar `es_oferta_espera=true` (cita tentativa) + caducidad propia del motor de lista de espera. |
| Movimiento propuesto por el organizador entra en conflicto con un cambio manual simultáneo | `proponer_cambio_cita` ya guarda `inicio_actual` y `responder_propuesta_cambio` verifica que no cambió (`propuestas-cambio-cita.sql:277-282`). |
| Sobrecarga de notificaciones WhatsApp | Agrupar avisos; respetar "no molestar" existente; flag `organizadorAutoListaEspera` para desactivar. |

---

## 10. Experiencia final del usuario

1. Abre el organizador. Ve **hoy + 7 días** agrupados, con problemas priorizados.
2. Una tarjeta dice: *"Cita fuera de jornada — María tiene a la clienta el martes 14:30 pero no trabaja por la tarde"* → botón **"Proponer al cliente mover a miércoles 10:30"**.
3. Al pulsar, se envía WhatsApp, la cita original muestra badge **"Cambio propuesto"**, el hueco destino aparece como **"Reservado"** (violeta).
4. Mueve otra cita para compactar → el panel avisa: *"Se ha liberado un hueco de 45 min. Se ha avisado a 2 personas de la lista de espera"*.
5. Un cliente acepta por WhatsApp → la cita se mueve sola, el badge desaparece, el hueco reservado se libera, el motor reevalúa en el siguiente latido y propone la siguiente optimización.
6. Si el cliente rechaza o no contesta → a los X min caduca, el hueco se libera, el motor lo reconsidera.

**Objetivo cumplido**: menos trabajo, menos espacios muertos, agenda coherente con horarios reales, y el organizador "piensa" en continuo sin buguearse.
