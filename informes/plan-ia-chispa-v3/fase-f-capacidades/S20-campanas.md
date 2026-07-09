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
PENDIENTE.
