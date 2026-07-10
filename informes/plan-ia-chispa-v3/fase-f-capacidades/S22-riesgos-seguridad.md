# S22: Evaluación de Riesgos y Seguridad de "Macros"

## Contexto de la Sesión S22
La sesión **S22 (Tools en Vivo)** tiene como objetivo permitir a la IA "Chispa" componer herramientas existentes o usar macros personalizadas para expandir sus capacidades sin introducir vulnerabilidades de seguridad.

## Modelo de Macros Parametrizables
Para satisfacer este requisito, se ha implementado el modelo de **Macros Declarativas** (`chispa_macros`), que almacena secuencias predefinidas de llamadas a *tools existentes*.

### ¿Por qué es seguro este modelo?
1. **Ausencia de Generación de Código**: En ningún momento la IA genera, evalúa o ejecuta código arbitrario (`eval()`) o consultas SQL directas (`exec_sql`). Toda macro es una abstracción que únicamente delega en `ejecutarLectura()`.
2. **Dependencia de Tools Validadas**: Las macros *solo* pueden componer tools que ya están en el sistema (ej. `resumen_caja`, `ocupacion`). Cada una de estas tools tiene sus propios controles RLS (Row Level Security) y comprobación de permisos de usuario. Si una tool requiere un rol que el usuario no tiene (ej. `informes.ver`), fallará en el nivel inferior.
3. **Flujo de Aprobación**: La tool `proponer_macro` que puede usar el LLM siempre guarda la macro en estado `revision`. Una macro no se inyecta como herramienta válida en el System Prompt de OpenAI hasta que un propietario/admin cambie su estado a `aprobado` en base de datos.
4. **Barrera por Tenant**: La tabla `chispa_macros` está sujeta a RLS basado en `negocio_id` y rol. Un negocio no puede ver ni ejecutar las macros de otro negocio.

## Puntos Pendientes de Revisión (para Sesión S26 - Seguridad)
- **Denegación de Servicio (DoS)**: Una macro maliciosa podría definir un loop muy largo de llamadas a tools pesadas (ej. 100 llamadas a informes). En la S26 se debería evaluar si poner un límite duro en el código edge a la cantidad de `pasos` que se pueden ejecutar (ej. `if (macro.pasos.length > 5) throw new Error(...)`).
- **Filtrado de Tools de Escritura**: Actualmente las macros operan con `ejecutarLectura` y `serializarLectura`. Es crítico mantener la aserción de que una macro no puede encadenar ejecuciones destructivas automáticas sin el flujo `propone -> confirma` del cliente.

**Firma:** Carlos/Alexandro - I+D Completado.
