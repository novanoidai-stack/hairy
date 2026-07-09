# S25 · Testeo masivo (millones de casos, testeo absoluto)

**Fase:** G · Cierre · **Dueño:** Carlos + Alexandro · **Esfuerzo:** alto · **Depende:** S02, S19, A-F

> Someter a Chispa y a las superficies a un volumen enorme de casos generados, para garantizar que
> **cualquier cosa** cae siempre en una salida útil (nunca cuelgue, nunca texto seco, nunca fuga de
> datos entre tenants).

## Lee antes
- [`../README.md`](../README.md) + marco S02 (toda petición tiene salida útil).

## Objetivo (resultado deseado)
Una batería masiva y repetible de peticiones/escenarios (incluidas raras, límite, maliciosas) que
verifica robustez, coherencia, rol/multi-tenant y seguridad de la capa IA.

## Ya existe (no reconstruir)
- Tests Deno del edge (`agenda-asistente`, `chispaOps.test.ts`, `retrasos.test.ts`,
  `organizarAgenda.test.ts`), guardrails de demo, RLS.

## Construir
1. **Generador de casos:** un banco grande de peticiones (plantillas + variaciones + IA que fabrica
   peticiones raras/ambiguas/adversarias) contra el edge y las superficies.
2. **Aserciones de robustez:** cada caso debe (a) devolver una superficie útil o fallback accionable,
   (b) nunca colgar ni error 500 sin manejar, (c) nunca texto seco donde hay superficie mejor,
   (d) respetar rol/tenant (no fugar datos de otro negocio), (e) no exponer salud.
3. **Reporte:** resumen de fallos por categoría; corregir los críticos; registrar el resto.

## Reglas duras que te aplican
- Multi-tenant/rol/seguridad son criterio de fallo. Salud fuera. Guardrails de demo intactos.

## Criterios de aceptación (verificables)
- La batería corre a escala y reporta; 0 fugas cross-tenant, 0 cuelgues no manejados, 0 exposición de
  salud; los fallos críticos quedan corregidos (evidencia adjunta).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] batería ejecutada + reporte  [ ] críticos corregidos  [ ] commit+push
[ ] S25 marcada`

## Estado
PENDIENTE.
