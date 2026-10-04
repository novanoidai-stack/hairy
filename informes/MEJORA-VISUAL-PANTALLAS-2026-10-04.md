# Estructura visual del panel — 4 octubre 2026

## Alcance

Se han revisado las 14 pantallas web principales del panel y la navegación entre sus secciones. Agenda, Caja y Equipo ya habían recibido la primera mejora de horarios, bloqueos y gastos en el commit `210431b3`; esta pasada extiende el mismo criterio al resto.

## Cambios por pantalla

| Pantalla | Organización aplicada |
| --- | --- |
| Mi jornada | Pestañas **Citas**, **Mis números**, **Bloqueos** y **Registro** también en escritorio. El fichaje permanece visible arriba. |
| Bandeja | Pestañas separadas para **Mensajes** y **Solicitudes de ausencia**, con contadores. El enlace **Revisar** desde Equipo abre directamente las solicitudes. |
| Informes | Título de página, pestañas de **Análisis Visual** y **Registros Legales**, e índice fijo para saltar a los bloques del análisis. |
| Clientes | Pestañas de la ficha más legibles y desplazables cuando el panel es estrecho. |
| Presupuestos | El creador con IA se abre desde un botón; la lista queda visible de entrada. Filtros de estado y contador de resultados. |
| Inventario | Categorías identificadas como navegación, selector de vista claro y contador de referencias visibles. |
| Citas | Encabezado de búsqueda con número de resultados y botón para restablecer filtros. |
| Lista de espera | Estados identificados como pestañas y contador de personas en la vista. |
| Reseñas | Filtros con título y grupos identificados; selección marcada también para accesibilidad. |
| Campañas | Secuencia visible de cuatro pasos sobre el formulario y encabezado consistente. |
| Ayuda | Exploración por temas señalada y categorías identificadas como pestañas. |
| Configuración | Navegación lateral etiquetada y sección actual señalada para accesibilidad. Se conserva su división por grupos y su buscador. |
| Equipo | Pestañas principales con la misma selección visual que las de la ficha profesional. |
| Caja | Mantiene **Cobros** y **Gastos** como espacios separados, según la primera pasada. |

Los encabezados de las páginas de gestión comparten una escala de 26 px en escritorio y 22 px en móvil. Se actualizaron los manuales de Bandeja, Mi jornada, Presupuestos e Informes para reflejar la nueva navegación.

## Verificación

- `npx tsc --noEmit`.
- `npm run test:componentes`.
- `npm run vigilar:rapido`.
- `npm run build:web`.
- Demo local: navegación manual por Mi jornada, Bandeja, Presupuestos, Informes y Configuración, incluida la selección de pestañas y el salto a Ingresos.

La demo usa datos ficticios. No se han creado ni editado registros al revisar las pantallas.
