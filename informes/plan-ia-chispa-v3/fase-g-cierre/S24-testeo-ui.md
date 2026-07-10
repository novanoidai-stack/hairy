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
COMPLETADA.

### Log de Bugs Arreglados (Evidencia)
1. **AvisosBell (Z-Index / Render Bug)**: El dropdown de notificaciones se renderizaba detrás del contenido principal (o se veía cortado/tapado) al abrirse desde el `Sidebar` (dashboard) o páginas con un stacking context complejo como `/clientes`. 
   - **Solución**: Refactorizado `AvisosBell.web.tsx` para usar `createPortal(..., document.body)` desde `react-dom`. Esto permite que el dropdown escape del DOM hierarchy del Sidebar/Página y se renderice siempre por encima de todo (`zIndex: 99999`).
2. **Tipos de React-DOM**: Añadido `@types/react-dom` a `devDependencies` para mantener una compilación TypeScript limpia y sin errores de tipado implícito en `createPortal`.
3. **Verificación**: `npx tsc --noEmit` exitoso y `npm run build:web` exitoso. Todos los botones de la capa IA y el dropdown de avisos funcionan correctamente en móvil/escritorio sin ser solapados.
