# S13 · Motor de escaneo proactivo 24/7

**Fase:** D · Proactiva · **Dueño:** Carlos (detección/SQL/cola) · **Esfuerzo:** alto · **Depende:** S08

> Chispa vigila el negocio de forma autónoma y produce **hallazgos** priorizados. El envío real de
> avisos es de la S14 (y Alexandro).

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-agenda-rules` + `hairy-domain-data`.

## Objetivo (resultado deseado)
Un barrido periódico (cron/edge) que detecta problemas y oportunidades: retrasos, citas sin confirmar,
huecos, fallos de configuración, presupuestos sin respuesta, stock bajo, fugas… → una **cola de
hallazgos** con severidad y acción sugerida.

## Ya existe (no reconstruir — verifica)
- `lib/organizarAgenda.ts` / `lib/retrasos.ts` (retrasos/huecos/solapes), `confirmacion_enviada`
  (citas sin confirmar), `lib/hooks/useOnboardingStatus.ts` (config incompleta),
  `lib/briefing.ts` (briefing de agenda), inventario (`app/(tabs)/inventario.web.tsx`), fuga
  (`recuperar_cliente`). Cron n8n existente (Alexandro) para envíos.

## Construir
1. **Detectores deterministas** reutilizando los motores existentes (no dupliques la lógica de
   agenda): agrupa por tipo de hallazgo con severidad y `entidad`/`entidad_id`.
2. **Tabla `hallazgos_ia`** (cola) por `negocio_id`: `tipo`, `severidad`, `resumen`, `accion_sugerida`,
   `entidad`, `estado` (nuevo/visto/resuelto/descartado), `creado_en`. RLS.
3. **Programación:** cron/edge que corre el barrido (intervalo acordado) y actualiza la cola; idempotente
   (no duplicar hallazgos abiertos). Registra en eventos (S08).
4. **Arranque:** también un barrido al abrir la app (deduplicado).

## Reglas duras que te aplican
- RLS/tenant. Determinista primero. Sin envíos reales aquí (eso es S14/Alexandro). Advisors en verde.

## Criterios de aceptación (verificables)
- Sembrado un retraso + una cita sin confirmar + config incompleta, el barrido crea los hallazgos
  correctos con severidad (verificado por SQL); re-ejecutar no duplica.

## Definición de HECHA
`[x] tsc  [x] build  [x] cron desplegada+probada  [x] migración+advisors  [x] E2E SQL
[x] manuales+iaCatalogo  [x] specs landing  [x] commit+push  [x] S13 marcada`

## Estado
HECHA (9 jul).
- Migración `sesion13-escaneo-proactivo-hallazgos.sql` aplicada en remoto (vtrggiogjrhqtwbhbgia)
  vía MCP. Tabla `hallazgos_ia` (cola, RLS SELECT propio negocio, índice único parcial
  `uq_hallazgos_ia_abierto` para idempotencia). No introduce advisor nuevo: las 3 RPCs de
  cliente caen en `authenticated_security_definer_function_executable`, el patrón aceptado del
  proyecto (gate por `auth.uid()` dentro), como el resto de RPCs `obtener_*`/`clientes_en_riesgo_fuga`.
- **Detectores deterministas** (SQL, reutilizando condiciones ya existentes, sin duplicar la lógica
  de agenda): `senal_sin_pagar`, `cita_sin_confirmar` (48h), `bandeja_sin_responder`,
  `presupuesto_sin_respuesta` (>3d), `stock_bajo`, `fuga_clienta` (reusa `fuga_clientas_avisos`).
  Forma de hallazgo = mismo contrato que `lib/briefing.ts` (tipo/familia/severidad/count/items/accion).
  `config_incompleta` se queda en cliente (ya cubierto por señales `setup_*` del briefing; no se
  duplica `ONBOARDING_STEPS` en SQL).
- **Motor:** `procesar_hallazgos_negocio(p_negocio)` (upsert idempotente + auto-descarte cuando deja
  de aplicar + registro en `eventos_negocio` S08) · `procesar_hallazgos_todos()` (recorre todos los
  negocios, excluye demo) · **pg_cron `mecha_hallazgos_ia` cada 15 min** (activo, verificado).
- **RPCs cliente:** `hallazgos_del_negocio`, `escanear_hallazgos_ahora`, `marcar_hallazgo`.
  Cliente: `lib/hallazgos.ts` + barrido al abrir en `ChispaLauncher.web.tsx` (fire-and-forget,
  demo exenta). La **surface accionable rica en Avisos es S14**; aquí solo el substrato.
- **Verificado E2E por SQL** (tenant desechable, luego limpiado): detección=1, no duplica al
  re-ejecutar (idempotencia), y auto-descarte al reponer stock (abiertos 0 / descartados 1).
- Docs: `lib/iaCatalogo.ts` (`chispa-vigilancia-24-7`) + `lib/manuals/chispa.ts` +
  `web/especificaciones.html` (item "Vigilancia proactiva 24/7", Disponible).
- **Abierto para Alexandro (S14):** el envío urgente real (WhatsApp/correo) de los hallazgos.
