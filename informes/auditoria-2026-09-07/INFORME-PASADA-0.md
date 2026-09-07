# Auditoría Mecha — Pasada 0: destilado de la evidencia ya recogida

**Fecha:** 7 sep 2026 · **Coste:** ~0 (la evidencia estaba en disco)
**Fuente:** los 2,4 MB que dejó la sesión de Codex del 7 sep 16:52–17:03 antes de agotar cuota.

---

## Resumen

La sesión de Codex no llegó a escribir informe, pero sí recogió la evidencia. Destilada, y
**re-verificada en fresco** (porque la foto ya estaba caducada en sus dos hallazgos principales),
el estado es mejor de lo que decía el snapshot.

| Comprobación | Resultado |
|---|---|
| `npm run vigilar:rapido` (fresco) | **0 bloqueantes**, 303 avisos, 33 vigilantes, 2,5 s |
| `npx tsc --noEmit` | limpio |
| `npm run test:componentes` | 6/6 pasando |
| Inventario BD | 130 tablas · 554 funciones · 286 políticas · 377 migraciones |

---

## Los 3 "bloqueantes" del snapshot: FALSOS, autoinfligidos

Los tres apuntaban a `scripts/vigilantes/trampa-de-prueba.mjs`:

- `meta-registro/se-suicida-al-importar` — llama a `process.exit()` a nivel de módulo
- `meta-contrato/process-exit-trampa-de-prueba.mjs`
- `meta-contrato/sin-test-trampa-de-prueba.mjs`

**Ese fichero no existe y nunca estuvo en git.** Lo creó el propio Codex durante la auditoría
como cebo para comprobar si la meta-vigilancia lo detectaba. La detectó, con el texto exacto
del incidente del 1–4 sep ("dejaría toda la vigilancia en un verde falso"). Luego lo borró.

**Conclusión: la capa de meta-vigilancia funciona.** Es una prueba de vida, no un fallo.

## El "aplicada sin fichero": también falso

`20260907140952_solape_forzado_con_aviso` — el `.sql` **sí está** en `supabase/migrations/`,
commiteado en `de80ac846`. El snapshot se tomó antes del commit.

---

## Lo que SÍ queda por mirar

### 1. CI: dos pasos de vigilancia que se saltan en cascada — `aviso`, arreglo trivial

En `.github/workflows/ci.yml`, job `e2e`:

- paso "Vigilante de peso del bundle"
- paso "Puerta de claves contra el bundle construido"

Ninguno lleva `if: always()`. Si un paso anterior falla, no corren y **su informe no se genera**:
el panel de Salud se queda con la foto vieja sin decir que es vieja. Es exactamente el fallo
que documenta el CLAUDE.md ("un panel en verde porque nadie está mirando es peor que uno en rojo"),
y encima la "Puerta de claves contra el bundle" es la que caza la trampa de la caché de Metro.

### 2. Seis migraciones del 1 sep que no constan aplicadas — verificar, no asumir

`20260901153000_addons_solo_dinero` · `..154500_restaurar_servicios_sugeridos` ·
`..161500_editar_importe_y_addons_en_cobro` · `..170000_restaurar_cobro_online` ·
`..171500_bono_cobra_addons` · `..173000_cobro_online_con_importe_corregido`

Puede ser el falso positivo conocido (el editor SQL del dashboard registra su propio timestamp).
**Pero son justo las de la tanda del 1 sep que pisó S4.2/S4.4 y dejó la propina del portal muerta
3 días.** No dar por aplicada ninguna sin comprobar su efecto en producción.

### 3. `backups.json` dice `pitr_enabled: false` y `backups: []`

Contradice lo que espera `dr-backups.mjs` ("backups diarios al día, PITR activo").
Puede ser permisos del token usado. **Verificar en el dashboard antes de alarmarse.**

### 4. Bug encontrado y arreglado por Codex — pendiente de revisar

`supabase/functions/shared/openrouterClient.ts` (+46 líneas de test):
un `200` con `content` vacía —lo que devuelve un modelo de razonamiento que gasta todo el
`max_tokens` pensando, `finish_reason: length`— se daba por respuesta válida. La cascada caía
al fallback sin dejar rastro de fallo en los logs. **Hallazgo legítimo.** Falta revisar el parche.

### 5. Deuda congelada (correcta, no tocar)

- 24 pares de citas solapadas en `florent_surez_peluqueros_15004`, anteriores al candado del 31 ago.
- 7 cobros descuadrados en `demo_salon_001`, anteriores al arreglo del generador.

Ambas exentas por decisión de producto y protegidas por `cobros_prevent_financial_updates`
(Ley Antifraude 11/2021). Está bien que no se puedan corregir.

### 6. Los 303 avisos

250 son de `rendimiento`, 26 de `codigo-muerto`, 13 `fiscal`, 11 `meta`, 5 `codigo`, 2 `seguridad`.
Casi todos con línea base congelada (el trinquete solo gira hacia abajo). Los de `<Modal>`
sin `onRequestClose` en `clientes.tsx` y `equipo.tsx` son accesibilidad real y baratos de arreglar.

---

## Nota de seguridad — ACCIÓN REQUERIDA

En el prompt de la sesión se pegó en claro un token personal de la Management API.
Un `sbp_` no abre una base de datos: **abre la cuenta entera de la organización.**

- **No está en el repo** (verificados los 2.552 ficheros que ve git). El script
  `consultas-remotas.mjs` lo lee de `process.env` y redacta `sbp_`/`sb_secret_`/JWT en su salida.
- **Sí está en claro** en `~/.codex/sessions/2026/09/07/rollout-...16-52-46...jsonl`,
  `~/.codex/logs_2.sqlite` y `~/.codex/thread_history_1.sqlite`, y viajó a OpenAI en el prompt.

Quitarlo no lo desactiva. **Hay que revocarlo** en Supabase → Account → Access Tokens.

---

## Por qué se agotó la cuota (para no repetirlo)

| | |
|---|---|
| Sesiones | 4 (1 principal + 3 subagentes *forkeados*) |
| Turnos | 73 |
| Tokens totales | **5.688.801** |
| — de entrada | 5.663.506 |
| — de salida | 25.295 (**0,4%**) |
| Contexto por turno | 104.000–135.000 |
| Resultados de herramienta >20 KB | **121** (el mayor, 174 KB ≈ 43k tokens) |

**Causa:** leer ficheros enteros al contexto, encadenados
(`Get-Content -Raw a.ts; Get-Content -Raw b.ts; ...`), y multiplicarlo por 4 forks que heredaron
el contexto del padre. Los ficheros de instrucciones (`CLAUDE.md` ~15.3k + `AGENTS.md` ~3k)
son solo el 15% del contexto por turno: **no son el problema.**

**La ironía:** gran parte del gasto fue leer el código fuente de los vigilantes
(`precios.mjs`, `planes.mjs`, `referidos.mjs`, `bd-comun.mjs`…) para razonar a mano lo que
`npm run vigilar:rapido` calcula en **2,5 segundos y cero tokens**.
