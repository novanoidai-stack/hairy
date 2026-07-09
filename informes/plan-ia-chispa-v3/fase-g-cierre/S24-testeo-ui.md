# S24 · Testeo de UI (botones, fallos, bugs)

**Fase:** G · Cierre · **Dueño:** Carlos · **Esfuerzo:** medio · **Depende:** A-F construidas

> Barrido de calidad de toda la superficie de UI de la capa IA: cada botón funciona, cada estado se ve,
> cero bugs visuales.

## Lee antes
- [`../README.md`](../README.md). Usa preview / Chrome DevTools MCP.

## Objetivo (resultado deseado)
Que ningún botón/acción de la capa IA esté muerto o roto, y que responsive, estados y foco funcionen en
todas las superficies.

## Ya existe (no reconstruir)
- Todas las superficies IA (panel, tarjetas por página, coach, tours, avisos, hub, voz).

## Construir (verificación + fixes)
1. **Inventario de superficies IA** y recorrido sistemático: cada botón/acción → funciona / estado
   correcto / sin error de consola.
2. **Responsive + dark/reduced-motion:** móvil/tablet/escritorio; sin overflow ni aplastes.
3. **Corrige los bugs** encontrados (o abre tarea si excede alcance) y deja constancia.

## Reglas duras que te aplican
- Verificar de verdad (no asumir): DOM/consola/red. Móvil primero.

## Criterios de aceptación (verificables)
- Lista de superficies revisadas con resultado; los bugs de UI encontrados están corregidos o
  registrados; cero errores de consola en los flujos clave (evidencia adjunta).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] recorrido E2E con evidencia  [ ] bugs corregidos/registrados
[ ] commit+push  [ ] S24 marcada`

## Estado
PENDIENTE.
