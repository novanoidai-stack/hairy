# Auditoría Mecha — 14 sep 2026

## Resumen

| Comprobación | Resultado |
|---|---|
| `npm run vigilar:rapido` | ✅ ok (33 vigilantes) |
| `npm run vigilar` | ✅ ok — 0 bloqueantes, 282 avisos |
| `npm run vigilar:bd` | ❌ **1 bloqueante**, 302 avisos |
| `npm run vigilar:test` | ✅ ok — 0 fail |
| `npx tsc --noEmit` | ✅ ok |

## Bloqueante (1): `whatsapp_eventos` sin gate de suscripción

La tabla `whatsapp_eventos` (creada en la migración
`20260911150000_whatsapp_eventos_entregas.sql`, commit `4298406b`) tiene
`negocio_id` pero **no lleva el trigger `trg_gate_suscripcion_exige_acceso`**,
que toda tabla multi-tenant debe tener para bloquear escrituras si la suscripción
está inactiva. La migración no crea ningún trigger.

Corrección: migración nueva que añada el gate (patrón de las demás tablas con
`negocio_id`), o añadirla a la lista blanca de `vigilancia_bd()` si se considera
tabla exenta (no parece exenta: es registro de entregas por negocio).

## Deuda conocida (sin cambios)

- `demo_salon_001`: 7 cobros descuadrados anteriores al 31 ago 2026. Deuda
  congelada (trinquete); correcto que no baje.
- Meta-contrato: 8 vigilantes de BD sin suite de tests (deuda heredada).
- Avisos habituales: código muerto (`optimizacionTouchAgenda.ts`, tablas
  `logros*`), PhoneInput duplicado web/native, knip 8→9 ficheros sin importar.

## Veredicto

Todo bien excepto el gate de `whatsapp_eventos`, que es un fallo de aislamiento
multi-tenant introducido en el último commit de WhatsApp y hay que corregirlo
con una migración.

---

# Parte 2 (tarde): pestaña Salud + arreglos

## Qué decía la pestaña Salud (`web/admin.html`, RPCs `staff_vigilancia_*`)

- Canario horario corriendo (última corrida 14:12 UTC, verde).
- Corridas de BD de hoy (04:59 y 12:51 UTC): **1 bloqueante** — el mismo gate
  de `whatsapp_eventos` — y 12 avisos.
- Aviso de **7 migraciones del repo sin registrar** en el historial remoto.

## Qué se ha arreglado (cambios en el árbol, sin commitear)

1. **Migración nueva** `supabase/migrations/20260914174030_whatsapp_eventos_gate_suscripcion.sql`
   — añade `trg_gate_suscripcion_exige_acceso` a `whatsapp_eventos` (mismo
   patrón que `tarjetas_regalo`, 20260908205201). El gate no afecta a n8n
   (escribe con service_role, sin sesión).
2. **Migración nueva** `supabase/migrations/20260914174042_indices_fk_gastos_y_tarjetas_regalo.sql`
   — índices para las 3 FKs huérfanas que avisaba `bd-profunda`
   (`gastos.profesional_id`, `tarjetas_regalo.cliente_comprador_id`,
   `tarjetas_regalo_movimientos.cobro_id`).
3. **Registradas las 7 migraciones "sin aplicar"** en
   `scripts/vigilantes/migraciones-conocidas.json`, cada una con la prueba del
   efecto verificada EN VIVO contra producción el 14 sep:
   - 6 de sept 1: aplicadas por SQL suelto (sin versión en historial). Efectos
     confirmados: 0 addons con duración, tabla `servicios_sugeridos`, firmas
     nuevas de `crear_cobro_desde_cita` y `consumir_bono_cita` (responden
     `sin_perfil`, no PGRST202), `enlace_pago_token`/`pago_info_publica`,
     `registrar_cobro_online`.
   - `20260911150000` (whatsapp): consta aplicada como `20260911143129` +
     refino `20260911143245`; tabla con escrituras de hoy y RPC viva. Las dos
     versiones remotas añadidas además a `CUBIERTAS_POR` en
     `scripts/vigilantes/bd-migraciones.mjs`.
4. Efecto en la guardia: avisos 302 → 294; los 7 "no constan aplicadas" y los
   2 "corre en producción sin fichero" desaparecen.

## Queda UNA acción que solo puede hacer el humano (dashboard/MCP)

~~Aplicar en producción las DOS migraciones nuevas~~

# Parte 3: aplicado en producción con token de 1 h (14 sep, tarde)

Con un access token temporal (sbp_..., 1 h, solo como variable de entorno,
nunca en un fichero) se aplicó todo:

1. `supabase migration repair --status applied` para las 7 versiones que ya
   estaban en producción sin registrar (6 de sept 1 + 20260911150000). Con eso
   el historial remoto y el repo cuentan la misma historia.
2. Las DOS migraciones nuevas se aplicaron por la Management API
   (`/v1/projects/{ref}/database/query`, 201 en las dos). `db push` no era
   viable: el historial remoto tiene ~250 versiones cuyo fichero vive en
   `archive/migraciones-legacy/` y el CLI exige que estén en
   `supabase/migrations/`.
3. Sus versiones (20260914174030, 20260914174042) registradas con
   `migration repair --status applied`.
4. Verificación EN VIVO del esquema: trigger del gate presente en
   `whatsapp_eventos` (1), los 3 índices creados (3), las 2 versiones en
   `schema_migrations` (2).
5. Las 7 entradas de `migraciones-conocidas.json` se RETIRARON: ahora que las
   versiones constan, el propio vigilante las marcaría como "exención que
   sobra". Las entradas `CUBIERTAS_POR` de 20260911143129/143245 en
   `bd-migraciones.mjs` SÍ se quedan (esas filas del historial siguen sin
   fichero propio).

## Verificación final (tras aplicar)

- `npm run vigilar:bd` — **0 bloqueantes**, 289 avisos (antes: 1 bloqueante,
  302 avisos). Caen el bloqueante del gate, los 7 de migraciones sin
  registrar, los 2 de sin-fichero y los 3 de FK sin índice.
- `npm run vigilar` — 0 bloqueantes, 282 avisos.
- `npm run vigilar:test` — 418 pass, 0 fail.
- `npx tsc --noEmit` — limpio.

## Deuda que sigue (congelada a propósito, sin cambios)

- `demo_salon_001`: 7 cobros descuadrados pre-31-ago (trinquete).
- `florent_surez_peluqueros_15004`: 24 solapes pre-31-ago (trinquete).
- `pg_net` pierde el 33 % de las llamadas (aviso conocido del canario).
- 8 vigilantes de BD sin suite de tests; knip 8→9; código muerto conocido.

## Limpieza durante la verificación

La prueba de `registrar_envio_whatsapp` con uuid de ceros insertó una fila de
prueba (`id=1361`); borrada inmediatamente (DELETE confirmado).
