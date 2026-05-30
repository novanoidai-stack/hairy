# Brief para Claude Design — Pestana de Configuracion de Hairy

## Que es Hairy
App SaaS de gestion de salones de peluqueria. El usuario principal es el dueno/gerente del salon. Dark theme.

## Design System
- Background principal: #0b1220
- Background panel/sidebar: #0f172a
- Background cards: #141f33
- Background card hover: #1a2540
- Borde: rgba(148,163,184,0.10)
- Borde hover: rgba(148,163,184,0.18)
- Texto principal: #f8fafc
- Texto secundario: #94a3b8
- Texto terciario: #64748b
- Primary (indigo): #6366f1
- Primary hover: #818cf8
- Primary soft: rgba(99,102,241,0.14)
- Success (green): #10b981
- Warning (amber): #f59e0b
- Danger (red): #ef4444
- Violet: #8b5cf6
- Cyan: #06b6d4
- Border radius cards: 12-14px
- Border radius botones: 8-10px
- Font sizes: 10-13px en general, 18-22px para titulos
- Font family: Inter
- Sin emojis nunca

## Layout actual de la app
- Sidebar izquierda fija con navegacion (Agenda, Clientes, Equipo, Informes, Configuracion)
- Contenido principal ocupa el resto del ancho
- Todas las paginas tienen topbar con titulo + subtitulo + acciones
- Las paginas usan grid de 2-3 columnas con sidebar de detalle

## Lo que ya existe en Configuracion (tabs actuales)
1. **General** — Info basica del negocio (nombre, placeholder)
2. **Servicios** — CRUD completo con:
   - Lista agrupada por categoria (Corte, Color, Tratamiento, Peinado, Barba...)
   - Cada servicio: nombre, precio, duracion activa (min), duracion espera/reposo (min), duracion extra (min), minimo de antelacion (min), activo/inactivo
   - Selector de alcance: "Catalogo base" vs por profesional (override de duracion y precio por profesional)
   - Add-ons por servicio (complementos opcionales con duracion y precio propios)
3. **Horarios** — Selector de profesional + lista de bloqueos (vacaciones, reunion, baja, formacion, descanso)
4. **Pagos** — Placeholder vacio
5. **Apariencia** — Placeholder vacio

## TODAS las funcionalidades implementadas que necesitan configuracion

### Agenda (Fase 1)
- **Horario de apertura/cierre del salon** — Actualmente hardcodeado: 9:00-20:00. Debe ser configurable.
- **Intervalo de slots** — Actualmente 15 min. Debe ser configurable (15/30/60).
- **Minimo de antelacion para crear cita** — Se configura por servicio, pero deberia haber un valor global por defecto.
- **Confirmacion de cita** — Automatica o manual. Actualmente el sistema soporta ambas, falta toggle de configuracion.
- **Tiempo antes de marcar NO_PRESENTADA** — Default 15 min tras la hora de la cita. Debe ser configurable.

### Tiempos muertos productivos (Fase 3)
- **Margen de seguridad para servicios en reposo** — Default 5 min. Cuanto margen dejar antes de que acabe el reposo.
- **Alerta de reposos simultaneos** — Umbral de reposos simultaneos por profesional antes de alertar (default 3).

### Servicios encadenados (Fase 5)
- Ya se configuran desde la tab de Servicios existente (add-ons, duraciones).
- No necesita configuracion adicional.

### Reorganizaciones (Fase 6)
- **Tiempo de gracia para clienta tarde** — Cuantos minutos esperar antes de ofrecer opciones de retraso.
- **Bloqueos recurrentes** — Ya se gestionan desde Equipo. Podrian tener acceso rapido desde Configuracion > Horarios.

### Vistas (Fase 8)
- **Vista por defecto del calendario** — Dia/Semana/Mes. Cual se muestra al abrir la agenda.

### Informes (Fase 9)
- **Porcentaje de comision por defecto** — Actualmente se selecciona en la pantalla de informes. Podria tener un default en configuracion.
- **Comision por profesional** — Poder asignar % de comision diferente a cada profesional.

### Equipo
- **Categorias de profesional** — auxiliar, oficial, oficial_mayor, estilista_senior, direccion. Actualmente fijas, podrian ser configurables en el futuro.
- **Colores de profesional** — Se asignan en la tab Equipo, no necesitan duplicarse aqui.

### Negocio (General)
- **Nombre del salon**
- **Direccion**
- **Telefono de contacto**
- **Email del salon**
- **Logo** (subida de imagen)
- **Dias de apertura** — Que dias de la semana abre el salon (checkboxes Lun-Dom)
- **Moneda** — EUR por defecto

### Notificaciones (preparacion para Fase 4 futura)
- **Canal preferido de comunicacion** — WhatsApp / SMS / Email
- **Recordatorios activos** — Si/No + momentos (48h antes, 24h antes, 2h antes)
- **Horario de no molestar** — Default 22:00-08:00
- **Plantillas de mensaje** — Placeholders para confirmacion, recordatorio, cancelacion

### Politicas (preparacion para Fase 4 futura)
- **Politica de cancelacion** — Horas minimas de antelacion para cancelar sin penalizacion (default 24h)
- **Penalizacion por cancelacion tardia** — Si/No + % o importe fijo
- **Deposito/senal** — Si/No + % o importe fijo + para que servicios aplica
- **No-shows maximos antes de prepago obligatorio** — Default 2 en 6 meses

### Reserva online (preparacion para Fase 7 futura)
- **Portal publico activo** — Si/No
- **Visibilidad de precios** — Mostrar antes de reservar / Solo al confirmar
- **Servicios disponibles online** — Seleccionar cuales se pueden reservar online

## Estructura de tabs propuesta

1. **General** — Datos del negocio (nombre, direccion, telefono, email, logo, moneda)
2. **Horarios** — Horario apertura/cierre, dias de apertura, intervalo de slots, vista por defecto del calendario
3. **Servicios** — El CRUD completo que ya existe (catalogo + overrides por profesional + add-ons)
4. **Agenda** — Minimo antelacion global, confirmacion auto/manual, tiempo gracia no-show, margen reposo, alerta reposos simultaneos
5. **Comisiones** — % por defecto + override por profesional
6. **Notificaciones** — Canal, recordatorios, horario no molestar, plantillas (preparacion futura, puede ir con placeholders)
7. **Politicas** — Cancelacion, deposito, penalizaciones, no-shows (preparacion futura, puede ir con placeholders)
8. **Reserva online** — Portal publico, visibilidad precios, servicios online (preparacion futura, placeholder)

## Estilo de interaccion esperado
- Sidebar izquierda con las tabs (como la actual)
- Contenido principal con secciones separadas por cards
- Toggles para Si/No
- Inputs numericos con unidad (min, EUR, %)
- Selects/dropdowns custom con el mismo estilo dark
- Boton "Guardar cambios" sticky en el topbar
- Animaciones: fadeIn en cards, hover con translateX en sidebar tabs, transiciones suaves en toggles
- Cada seccion con titulo (13px, bold) + descripcion (11px, textTer)
- Cuando un campo es "preparacion futura", mostrar badge discreto tipo "Proximamente" en textTer

## Lo que NO debe tener
- Emojis
- Colores claros/blancos
- Bordes gruesos
- Sombras fuertes
- Modales para editar campos simples (inline editing preferido)
- Scroll horizontal
