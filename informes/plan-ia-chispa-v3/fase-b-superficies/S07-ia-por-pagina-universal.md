# S07 · IA por página universal + Config (optimiza / ahorra tiempo)

**Fase:** B · Superficies · **Dueño:** Carlos · **Esfuerzo:** medio-alto · **Depende:** S04 (patrón visual)

> Aparte de Chispa, **cada página (incluida Config)** tiene una función IA que optimiza / ahorra
> tiempo. Extiende el patrón ya existente a TODAS las pantallas.

## Lee antes
- [`../README.md`](../README.md) + `informes/PATRON-IA-POR-PAGINA.md`. Carga `hairy-design-system`.

## Objetivo (resultado deseado)
Que en toda página el usuario tenga a mano un helper IA de eficiencia (no el panel Chispa), con estados
visibles y acciones de un clic; y que **cada ejecución quede lista para registrarse** (S08) para que
Chispa la conozca (S12).

## Ya existe (no reconstruir — verifica)
- Patrón `lib/hooks/useAyudaIA.ts` + `components/chispa/TarjetaAyudaIA.web.tsx`.
- Ya cubiertas (V2): Mi Jornada, Caja (upsell), Presupuestos, Clientes (riesgo/fuga/Q&A), Informes,
  Reseñas, Bandeja. **Faltan / revisar:** Agenda, Equipo, Inventario, **Configuración**, y las que no
  tengan un helper de "optimiza/ahorra tiempo".

## Construir
1. **Cobertura universal:** una tarjeta/acción IA de eficiencia en cada página que falte, con sabor
   "optimiza esto / ahórrame tiempo" (determinista primero; LLM solo redacta/sugiere).
2. **Config con IA:** helper que detecte config incompleta/subóptima y proponga arreglarla (enlaza con
   S18 "salón al 100%").
3. **Gancho de registro:** cada helper emite un evento normalizado {función, cuándo, entrada, resultado,
   por qué} listo para el Registro universal (S08). Define el contrato aquí aunque S08 llegue después.
4. **Catálogo:** añade cada función nueva a `lib/iaCatalogo.ts` (y su manual).

## Reglas duras que te aplican
- Prohibido fallo silencioso (5 estados). Rol/multi-tenant. Casi-nunca-texto-plano.

## Criterios de aceptación (verificables)
- Todas las páginas relevantes (incl. Configuración) tienen un helper IA de eficiencia, consistente y
  sin fallos silenciosos (verificado E2E en varias).
- Cada ejecución produce el evento normalizado (aunque el registro real se conecte en S08).

## Definición de HECHA
`[x] tsc  [x] build  [x] E2E demo (varias páginas)  [x] manuales+iaCatalogo  [x] specs landing
[x] commit+push  [x] S07 marcada`

## Estado
COMPLETADO.
