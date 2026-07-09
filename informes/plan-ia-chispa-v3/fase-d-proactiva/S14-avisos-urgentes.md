# S14 · Avisos de Chispa + canal urgente

**Fase:** D · Proactiva · **Dueño:** Carlos (UI/cola) + Alexandro (envío real) · **Esfuerzo:** medio-alto · **Depende:** S13

> Los hallazgos (S13) se muestran de forma accionable, y lo **urgente** se marca para salir por
> WhatsApp/correo — **el envío real lo hace Alexandro**.

## Lee antes
- [`../README.md`](../README.md) (reparto Carlos/Alexandro). Carga `hairy-design-system`.

## Objetivo (resultado deseado)
Que el usuario vea los hallazgos en **Avisos** con acciones de un clic, y que lo urgente quede
encolado/etiquetado para notificación externa (stub claro para Alexandro).

## Ya existe (no reconstruir — verifica)
- Avisos/`AvisosBell`, onboarding checklist en Avisos, `hallazgos_ia` (S13). Motor n8n de envíos
  WhatsApp (Alexandro).

## Construir
1. **Surface en Avisos:** lista priorizada de hallazgos con su **acción sugerida de un clic** (aplicar,
   ver, descartar); estados visibles; sin fallo silencioso.
2. **Urgencia:** marca de severidad "urgente" y una **cola de notificación externa** (tabla/campo) que
   Alexandro conecta al envío real (WhatsApp/correo). Deja el stub y el contrato claros; **no** envíes
   tú.
3. **Cierre del bucle:** al resolver un hallazgo desde Avisos, actualizar estado + registrar (S08).

## Reglas duras que te aplican
- **Envío real = Alexandro** (no lo implementes). RLS/tenant/rol. Casi-nunca-texto-plano.

## Criterios de aceptación (verificables)
- Los hallazgos aparecen en Avisos y se resuelven de un clic (estado actualizado, verificado por SQL).
- Lo urgente entra en la cola de notificación con el contrato documentado (sin enviar).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] migración+advisors (si aplica)  [ ] E2E demo  [ ] manuales+iaCatalogo
[ ] specs landing  [ ] commit+push  [ ] S14 marcada  [ ] stub de envío documentado para Alexandro`

## Estado
PENDIENTE.
