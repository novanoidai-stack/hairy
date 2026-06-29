# Presupuestos — diseño

**Fecha:** 30 jun 2026 · **Autor:** Carlos + Claude

## Objetivo

Herramienta para que el profesional genere un **presupuesto** a una clienta (caso típico:
"¿cuánto me costaría esto?"), lo envíe en **PDF** por correo (ya) / WhatsApp (próximamente,
Alexandro) con un click sin salir de Mecha, la clienta lo **acepte** desde una página pública,
y se pueda **cobrar en Caja**. El presupuesto NO afecta a la contabilidad hasta que se cobra.

## Modelo (decisión clave)

El presupuesto es un **objeto independiente** con su propio ciclo de vida, no una cita ni un
cobro. Se puede *enganchar* opcionalmente a una cita (`cita_id`) y/o a un cliente (`cliente_id`)
cuando toque. Esto deja la puerta abierta a que la IA reserve la cita al "sí quiero" sin
construirlo ahora (PR02: IA transversal).

```
PRESUPUESTO (borrador→enviado→aceptado→cobrado; +rechazado/caducado)
  ├ contacto: cliente con ficha  ó  datos sueltos (prospecta)
  ├ líneas: conceptos (nombre+precio); los nuevos se guardan en un catálogo reutilizable
  ├ (opcional) cita_id  ← reserva por portal/IA/manual
  └ COBRO en Caja → crea `cobro` (esto es la contabilidad). Si tiene cliente → su historial.
                     Si estaba enganchado a una cita aún no cobrada, la marca cobrada (sin doble cargo).
```

## Datos (migración `migrations/presupuestos.sql`)

- `presupuesto_conceptos` (catálogo reutilizable: negocio_id, nombre único, precio_cents).
- `presupuestos` (cabecera: numero por negocio, estado, contacto_*, cliente_id, profesional_id,
  total_cents, valido_hasta, cita_id, cobro_id, **token** público, pdf_path, whatsapp_solicitado,
  enviado_email_at/whatsapp_at, aceptado_at).
- `presupuesto_lineas` (concepto_id, nombre snapshot, precio_cents, cantidad, orden).
- `citas.presupuesto_id` (vínculo para agenda/IA).
- Importes en **céntimos**. Multi-tenant `negocio_id` + RLS (patrón `clientes`/`servicios`,
  demo-block **RESTRICTIVE**). Bucket privado `presupuestos` (signed URLs).
- RPCs: `crear_cobro_desde_presupuesto` (authenticated), `presupuesto_publico` /
  `aceptar_presupuesto_publico` (anon), `presupuestos_pendientes_envio` /
  `marcar_presupuesto_enviado` (**service_role**, revocadas de anon — evita fuga de teléfonos).

## UI

- **Sección propia "Presupuestos"** (`app/(tabs)/presupuestos.web.tsx`): lista con filtros por
  estado + buscador + "Nuevo presupuesto". Entrada en Sidebar y en la tab bar móvil.
- **Editor (modal):** contacto (buscar cliente o datos sueltos) → líneas (autocompletado desde el
  catálogo de conceptos, o concepto libre con "guardar para futuros") → título/notas/validez →
  total. Acciones: Guardar borrador · PDF (descarga) · Enviar por correo. WhatsApp = "próximamente".
- **Config → Presupuestos:** CRUD del catálogo de conceptos (`components/config/TabPresupuestoConceptos.tsx`).
- **Página pública** `app/presupuesto/[token].web.tsx` (exenta de guards): ver, descargar PDF,
  **Aceptar**, y "Pedir cita" (enlaza al portal `/app/r/<slug>`). Vía RPCs security definer.
- **Caja** (`app/(tabs)/caja.web.tsx`): los presupuestos **aceptados** sin cobrar aparecen y se
  cobran con el `CobroSheet` (nuevo modo `presupuesto`).

## PDF y envío

- PDF generado en cliente (jsPDF, `lib/presupuestoPdf.web.ts`; stub nativo), branded con el color
  del salón. Se sube al bucket `presupuestos` y se guarda `pdf_path`.
- **Correo (hecho):** edge function `enviar-presupuesto` (Resend) — verifica propiedad por negocio,
  adjunta el PDF, enlaza a la página pública, marca `enviado_email_at`.
- **WhatsApp (Alexandro):** cola `presupuestos_pendientes_envio` + `marcar_presupuesto_enviado`.
  Ver `informes/HANDOFF-presupuestos-whatsapp-2026-06-30.md`.

## Fuera de alcance (YAGNI)

Envío real WhatsApp e IA reservando cita (Alexandro), lógica fiscal/VeriFactu (un presupuesto no
es factura), app nativa rica (stubs), plantillas avanzadas.
