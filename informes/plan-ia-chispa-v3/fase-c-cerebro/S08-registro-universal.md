# S08 · Registro universal ("en Mecha todo queda registrado")

**Fase:** C · Cerebro · **Dueño:** Carlos + Alexandro · **Esfuerzo:** medio-alto · **Depende:** S01

> El substrato del que beben la memoria (S09–S11), la consciencia del ecosistema (S12) y el escaneo
> 24/7 (S13). Sin esto no hay "recuerda todo".

## Lee antes
- [`../README.md`](../README.md) + el modelo de memoria definido en S01. Carga `hairy-domain-data`.

## Objetivo (resultado deseado)
Una **línea de tiempo de eventos** del negocio, uniforme y consultable: citas, cobros, cambios de
config, ejecuciones de funciones IA (S07), avisos, etc. — cada uno con {qué, quién, cuándo, entrada,
resultado, por qué}.

## Ya existe (no reconstruir — verifica)
- `citas_historial` (auditoría de agenda), `chispa-acciones-historial-config.sql`. Tablas de dominio
  (`citas`, `cobros`, `negocio_config`…). Patrón de compliance/inmutabilidad
  (`compliance-antifraude-inmutabilidad`).

## Construir
1. **Tabla `eventos_negocio`** (o nombre acordado) con esquema uniforme: `negocio_id`, `tipo`,
   `entidad`, `entidad_id`, `actor` (usuario/IA/sistema), `resumen`, `datos` (jsonb acotado, **sin
   datos de salud**), `resultado`, `motivo`, `creado_en`. RLS por `negocio_id` + rol. Índices por
   fecha/tipo/entidad para recuerdo temporal (S11).
2. **Escritores:** engancha los puntos que ya generan cambios (acciones de Chispa, cobros, config) y
   los **helpers IA de S07** para que emitan su evento. No dupliques auditorías: unifica con lo que ya
   hay donde tenga sentido.
3. **Retención + borrado RGPD:** política de retención y borrado por clienta/negocio.

## Reglas duras que te aplican
- RLS estricta, sin `USING(true)`. **Salud fuera** del `datos` jsonb. Advisors en verde tras migración.

## Criterios de aceptación (verificables)
- Acciones de Chispa, un cobro, un cambio de config y una ejecución de helper IA quedan como eventos
  consultables por `negocio_id` (verificado por SQL).
- RLS impide ver eventos de otro tenant. Advisors sin hallazgos nuevos.

## Definición de HECHA
`[x] tsc  [x] build  [x] migración+advisors  [x] E2E demo  [x] manuales+iaCatalogo  [x] specs landing
[x] commit+push  [x] S08 marcada`

## Estado
COMPLETADO.
