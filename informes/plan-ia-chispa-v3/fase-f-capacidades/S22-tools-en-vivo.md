# S22 · Tools en vivo (I+D, guardarraíl fuerte)

**Fase:** F · Frontera · **Dueño:** Carlos + Alexandro · **Esfuerzo:** alto / riesgo · **Depende:** todo lo anterior

> ⚠️ **I+D, no producción sin visto bueno de seguridad/DPO.** "Crear tools en vivo" **NO** puede ser
> código/SQL arbitrario: choca con la regla anti-`exec_sql` y anti-escritura arbitraria del proyecto.

## Lee antes
- [`../README.md`](../README.md) (constraints de seguridad). Carga `hairy-domain-data`.

## Objetivo (resultado deseado)
Explorar de forma segura cómo Chispa amplía sus capacidades ante peticiones no cubiertas, **sin**
ejecutar código/SQL libre: un **catálogo de tools aprobado que se amplía de forma controlada**.

## Ya existe (no reconstruir — verifica)
- Manifiesto/catálogo (S01/S12), tools del edge, marco S02, sistema de permisos.

## Construir (I+D, con límites)
1. **Composición, no generación:** Chispa combina tools existentes (planes multi-paso) para cubrir
   peticiones nuevas — sin inventar operaciones de BD.
2. **Tools declarativas parametrizables:** si algo recurrente falta, un mecanismo para **definir** (no
   ejecutar arbitrariamente) una tool declarativa que pasa por revisión antes de activarse.
3. **Guardarraíles:** allow-list de operaciones, límites de alcance, todo auditado (S08); nada toca BD
   sin RPC aprobada y confirmación del usuario. Documenta riesgos y qué queda para revisión de S26.

## Reglas duras que te aplican
- **Nunca** `exec_sql` ni escritura arbitraria. Todo auditado. Revisión de seguridad (S26) antes de
  cualquier salida a producción. Salud fuera.

## Criterios de aceptación (verificables)
- Una petición no cubierta se resuelve **componiendo** tools existentes (o se reconoce el límite con un
  fallback útil), sin ejecutar nada fuera de la allow-list (verificado E2E). Documento de riesgos.

## Definición de HECHA
`[x] tsc  [x] build  [x] E2E demo (composición segura)  [x] doc de riesgos + pendientes de seguridad
[x] manuales+iaCatalogo  [x] commit+push  [x] S22 marcada (I+D, no prod)`

## Estado
COMPLETADO (10 jul).
Implementada la tabla `chispa_macros` que permite al LLM componer tools en macros mediante `proponer_macro` (se guardan en estado "revision" como mecanismo de seguridad). El backend de Deno lee dinamicamente las macros "aprobadas" y las inyecta en el prompt de la IA. Si la IA llama a una macro, el edge desglosa la macro y llama a sus steps subyacentes, combinando la respuesta sin generar SQL ni codigo dinamico. Documento de riesgos disponible en S22-riesgos-seguridad.md.
