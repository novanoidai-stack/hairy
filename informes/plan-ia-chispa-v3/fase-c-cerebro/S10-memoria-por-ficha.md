# S10 · Memoria por ficha de clienta ("entender", no solo leer)

**Fase:** C · Cerebro · **Dueño:** Carlos · **Esfuerzo:** alto · **Depende:** S09 · **REGLA DURA: salud fuera del LLM**

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-domain-data`. Repasa la lista blanca de ficha.

## Objetivo (resultado deseado)
Que Chispa "entienda" a cada clienta: un **resumen semántico por ficha** (historial de servicios,
preferencias, patrones de visita/gasto, notas no sensibles) que recuerda y usa — **excluyendo siempre
salud/alergias/medicación**.

## Ya existe (no reconstruir — verifica)
- `app/(tabs)/clientes.web.tsx`, tool `ficha_cliente` (Q&A por lista blanca, V2 S7), riesgo/fuga
  (`clientes_riesgo_no_show`, `recuperar_cliente`), `migrations/ia-consentimiento-clientes.sql`
  (`consiente_ia`).

## Construir
1. **Resumen por ficha:** deriva de eventos (S08) + datos no sensibles un perfil útil (servicios
   frecuentes, cadencia, gasto medio, preferencias declaradas) guardado/actualizado; **lista blanca**
   estricta de campos.
2. **Uso por Chispa:** la memoria de ficha entra (compacta) donde ayuda: Q&A de ficha, recordatorios,
   iniciativa (S15), sustituto-owner (S21). Respeta `consiente_ia`.
3. **Salud aparte:** los campos de salud viven donde ya están y **nunca** entran al LLM ni al resumen.

## Reglas duras que te aplican
- **Salud NUNCA al LLM.** Consentimiento IA. RLS por `negocio_id`. Bucket de fotos privado.

## Criterios de aceptación (verificables)
- Chispa responde "¿qué suele hacerse esta clienta / cada cuánto viene / gasto medio?" con datos reales
  (no inventados), sin exponer campos de salud (verificado E2E, incl. una ficha con datos de salud).
- Ficha sin `consiente_ia` no alimenta memoria IA.

## Definición de HECHA
`[x] tsc  [x] build  [x] edge desplegada+probada (si aplica)  [x] migración+advisors (si aplica)
[x] E2E demo  [x] manuales+iaCatalogo  [x] specs landing  [x] commit+push  [x] S10 marcada`

## Estado
HECHA (Implementada y verificada. La memoria semántica se asocia mediante `cliente_id` en `guardar_recuerdo` e inyecta dinámicamente en `ficha_cliente` sin revelar datos de salud).
