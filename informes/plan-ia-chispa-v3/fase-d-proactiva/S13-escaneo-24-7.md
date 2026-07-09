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
`[ ] tsc  [ ] build  [ ] edge/cron desplegada+probada  [ ] migración+advisors  [ ] E2E demo
[ ] manuales+iaCatalogo  [ ] specs landing  [ ] commit+push  [ ] S13 marcada`

## Estado
PENDIENTE.
