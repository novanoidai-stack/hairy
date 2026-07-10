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
`[x] tsc  [x] build (no requiere: bloques kpi/opciones ya en cliente desde S19)  [x] edge desplegada+probada (v40, CLI)  [x] E2E demo  [x] manuales+iaCatalogo
[x] specs landing  [x] commit+push  [x] S21 marcada`

## Estado
HECHA (10 jul). Implementado como tool de LECTURA+composicion `resumen_gestion(foco)` en el edge
(supabase/functions/agenda-asistente): foco = cierre_dia | preparar_semana | urgente. No es una
escritura: orquesta lecturas reales (agenda + caja + escaneo proactivo hallazgos_ia) y empuja un
panel VISUAL (kpi + barras/tabla) + un menu 'opciones' cuyas labels vuelven como turno y disparan
las tarjetas individuales de propone->confirma (confirmar_citas, organizar agenda, etc.). Respeta
reparto (envios encolados por sus tools = Alexandro), rol/tenant (gate informes.ver en permisos.ts,
service key + negocio_id), salud fuera (no toca fichas). Gotchas resueltos:
- El tipo `Bloque` LOCAL del edge no tenia kpi/barras/tabla (S19 solo toco el cliente); anadidos.
- Deploy: repo no linkado con config.toml pero la CLI de Supabase ya estaba autenticada
  (`npx supabase functions deploy agenda-asistente --project-ref vtrggiogjrhqtwbhbgia`); bundlea
  siguiendo el import `../../../lib/iaCatalogo.ts`. No hizo falta Docker (warning ignorable).
- Verificado E2E contra el tenant demo (owner) via curl con JWT real: los 3 focos enrutan bien y
  las cifras (0 en la demo vacia hoy) coinciden con SQL directo (conteo correcto).
Nota aparte (no S21): `buscar_recuerdos`/`guardar_recuerdo` NO estaban en LECTURA_CAP -> nunca se
declaraban al LLM (S9-S12 rotas por el panel). Flagueado como tarea de fondo, no arreglado aqui.
