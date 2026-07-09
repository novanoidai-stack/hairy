# S21 · Chispa sustituto del propietario/administrador (capacidades emergentes)

**Fase:** F · Capacidades · **Dueño:** Carlos + Alexandro · **Esfuerzo:** alto · **Depende:** S09-S12, S13-S15, S19

> El capstone: Chispa puede llevar las tareas de gestión del propietario/admin — siempre
> **propone → confirma**, con reparto y seguridad.

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-domain-data` + `hairy-agenda-rules`.

## Objetivo (resultado deseado)
Que Chispa orqueste las tareas típicas de dirección (agenda, equipo, caja/cierres, informes, config,
clientes, campañas, avisos) de forma que un gestor pueda apoyarse en ella para "llevar el salón", sin
perder el control (confirma; puede deshacer, S05).

## Ya existe (no reconstruir — verifica)
- Todas las tools/acciones de Chispa (`chispaOps`, edge), memoria (Fase C), proactividad (Fase D),
  capacidades (S19), rol/permisos (`can()`), campañas (S20).

## Construir
1. **Orquestación de tareas de gestión:** flujos compuestos de alto nivel ("cierra el día",
   "prepara la semana", "revisa lo urgente y propón acciones") que encadenan lecturas + propuestas de
   varias áreas en un resumen accionable.
2. **Confianza:** todo es propuesta → confirmación; acciones reversibles (S05); traza en eventos (S08).
3. **Límites duros:** respeta reparto (envíos/dinero = Alexandro, encolar no ejecutar), rol/tenant, y
   nunca escrituras sin confirmación. Salud fuera.

## Reglas duras que te aplican
- Propone→confirma SIEMPRE. Envíos/pagos = Alexandro. Rol/tenant/RLS. Salud fuera. Sin claims falsos.

## Criterios de aceptación (verificables)
- "Cierra el día" / "revisa lo urgente" produce un resumen con acciones de un clic reales, cada una
  confirmable y reversible; nada se ejecuta sin confirmación; envíos quedan encolados (verificado E2E).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] edge desplegada+probada  [ ] E2E demo  [ ] manuales+iaCatalogo
[ ] specs landing  [ ] commit+push  [ ] S21 marcada`

## Estado
PENDIENTE.
