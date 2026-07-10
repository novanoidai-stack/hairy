# S20 · Campañas (reactivación / difusión)

**Fase:** F · Capacidades · **Dueño:** Carlos (UI/segmentación) + Alexandro (envío real) · **Esfuerzo:** medio-alto · **Depende:** S10, S14

> Constructor de campañas con IA. **El envío real (WhatsApp/correo) es de Alexandro.**

## Lee antes
- [`../README.md`](../README.md) (reparto). Carga `hairy-domain-data`.

## Objetivo (resultado deseado)
Que el usuario lance campañas (reactivar clientas dormidas, difusión de una oferta) definiendo segmento
+ mensaje asistido por IA, con vista previa; el disparo se encola para el envío real de Alexandro.

## Ya existe (no reconstruir — verifica)
- Fuga/reactivación (`recuperar_cliente`), memoria por ficha (S10), cola de notificación (S14), motor
  n8n de envíos (Alexandro), presupuestos/mensajería.

## Construir
1. **Segmentación:** construir audiencia por criterios reales (última visita, gasto, servicio, fuga…)
   con conteo en vivo y RLS.
2. **Mensaje con IA:** redacción/variantes del mensaje (LLM redacta; el usuario edita/aprueba);
   personalización por campos no sensibles.
3. **Vista previa + encolado:** previsualizar a quién y qué; al confirmar, **encolar** (no enviar) para
   Alexandro; registrar (S08). Stub y contrato de envío claros.

## Reglas duras que te aplican
- **Envío real = Alexandro** (no lo implementes). Salud fuera. Consentimiento/opt-out. RLS/tenant.

## Criterios de aceptación (verificables)
- Se define un segmento (conteo real), se genera y edita el mensaje, y al confirmar queda **encolado**
  con su audiencia y contrato para Alexandro (verificado por SQL; sin enviar nada).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] migración+advisors (si aplica)  [ ] E2E demo  [ ] manuales+iaCatalogo
[ ] specs landing  [ ] commit+push  [ ] S20 marcada  [ ] stub de envío documentado para Alexandro`

## Estado
Lado CARLOS HECHO y verificado E2E 10 jul. **Envío real = Alexandro (pendiente, contrato listo).**

**Construido (Carlos)**
- **Migración `migrations/sesion20-campanas.sql`** (aplicada en remoto, advisors en verde salvo los WARN
  informativos de "authenticated puede ejecutar SECURITY DEFINER" en los RPC de gestor, que chequean rol
  dentro — mismo patrón que el resto del repo):
  - Tablas `campanas` + `campana_destinatarios` con RLS de **solo lectura** por `negocio_id`; escrituras
    solo por RPC definer.
  - Segmentación centralizada `_campana_audiencia(negocio, canal, seg jsonb)` (allowlist fija:
    `inactividad_dias`, `min_visitas`, `max_visitas`, `min_ticket`, `etiqueta`; excluye bloqueadas y sin
    contacto del canal; sin SQL dinámico). Helper de rol `_campana_gestor` (owner/admin).
  - RPC gestor: `campana_contar` (conteo en vivo), `campana_crear` (borrador), `campana_encolar`
    (materializa destinatarios con `{nombre}` + registro S08 en `eventos_negocio`), `campana_cancelar`.
  - RPC del motor (service_role, **Alexandro**): `campanas_destinatarios_pendientes(limit)` +
    `campana_marcar_enviado(destinatario, estado)` (auto-avanza la campaña a enviada al vaciar la cola).
- **UI** `app/(tabs)/campanas.web.tsx` (+ stub nativo): plantillas rápidas, canal, constructor de segmento
  con **conteo en vivo** (debounced), editor de mensaje con **vista previa** personalizada, encolado de un
  clic e historial con estados y cancelar. Móvil primero. Gateada a gestor (`informes.ver`) client-side +
  rol dentro del RPC. Entrada en Sidebar + hoja "Más" móvil + `CHISPA_RUTAS.campanas`.

**Verificado E2E** (cuenta `chispa.test.s18@mecha.app`, tenant `test_s18_e6d9d`; 4 clientas sembradas:
2 con teléfono/no bloqueadas, 1 sin teléfono, 1 bloqueada):
- Por SQL (impersonando el JWT del gestor): `campana_contar` whatsapp={} → 2, {inactividad_dias:60} → 1,
  email={} → 2 (excluye bloqueada y sin contacto correctamente); `campana_encolar` materializa 1
  destinatario con mensaje personalizado ("Hola Ana Ruiz, …") + registro S08; `campanas_destinatarios_pendientes`
  devuelve la cola con canal/contacto/mensaje para Alexandro.
- En el navegador: la pantalla renderiza, `campana_contar` responde 200 (conteo en vivo "1 clienta
  recibirá"), y "Encolar" crea+encola la campaña (verificado en BD: estado `encolada`, 1 destinatario).
- `tsc` + `build:web` limpios. Docs al día: `iaCatalogo` (`campanas-reactivacion`) + specs landing.

**PENDIENTE — Alexandro:** el ENVÍO real (WhatsApp/correo) leyendo `campanas_destinatarios_pendientes()` y
confirmando con `campana_marcar_enviado()` desde n8n; y (opcional, LLM) generar variantes de mensaje —
hoy Carlos entrega plantillas deterministas + personalización `{nombre}`, no redacción por LLM.

`[x] tsc  [x] build  [x] migración+advisors  [x] E2E (SQL + navegador, tenant real)  [x] manuales/iaCatalogo
[x] specs landing  [ ] commit+push  [x] S20 marcada  [x] stub de envío documentado para Alexandro`
