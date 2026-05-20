# Fase 6 — Reorganizaciones y casos de excepcion

**Fecha:** 2026-05-20
**Alcance:** Items 6.1, 6.3, 6.9, 6.10 (4 de 10). Los otros 6 se posponen.
**Enfoque:** Simplificacion de estados primero, luego features sobre base limpia.

---

## 1. Simplificacion de estados de cita

### Estados nuevos (4 en total)

| Estado | Descripcion | Transiciones permitidas |
|--------|-------------|------------------------|
| `confirmada` | Cita activa, pendiente de realizarse | completada / cancelada / no_presentada |
| `completada` | Servicio realizado | (terminal) |
| `cancelada` | Anulada antes de realizarse | (terminal) |
| `no_presentada` | Clienta no aparecio | (terminal) |

### Estados eliminados

propuesta, en_curso, finalizada, cobrada (como estado), historica, interrumpida, expirada, pendiente.

### Campos complementarios en tabla `citas`

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `cobrada` | boolean | false | Se marca al cobrar. Aplica a citas completadas. |
| `metodo_pago` | text | null | efectivo / tarjeta / bizum. Se rellena al cobrar. |
| `importe_final` | numeric | null | Importe real cobrado (puede diferir del precio del servicio). |

### Impacto en codigo

- `CITA_STATUS` en `lib/constants.ts`: de 10 valores a 4
- `CITA_STATUS_TERMINALES` y `CITA_STATUS_ACTIVOS`: actualizar
- `TRANSICIONES` en `agenda-detalle.tsx`: simplificar
- `ESTADOS_META` en `agenda-detalle.tsx`: reducir a 4
- Todas las queries que filtran `.neq('estado', ...)`: revisar
- Drag & drop y logica de solapamiento: sin cambios (usan inicio/fin, no estados)

---

## 2. Bloqueo recurrente (6.10)

### Modelo de datos

Tabla `bloqueos_profesional` ya existe. Cambios:

**Columna existente reutilizada:**
- `recurrencia` (text, nullable): `null` = puntual, JSON string = recurrente

**Columnas nuevas:**
- `grupo_bloqueo_id` (uuid, nullable): agrupa bloqueos creados juntos para varios profesionales
- `recurrencia_padre_id` (uuid, nullable, FK a bloqueos_profesional.id): apunta al bloqueo "plantilla" para gestionar la serie

### Estructura JSON de recurrencia

```json
{
  "tipo": "semanal | bisemanal | mensual | diaria",
  "dias_semana": [1, 3, 5],
  "dia_mes": 15,
  "hora_inicio": "09:00",
  "hora_fin": "10:00",
  "fecha_inicio": "2026-05-20",
  "fecha_fin": null
}
```

- `dias_semana`: array de 0-6 (0=dom). Solo para semanal/bisemanal/diaria.
- `dia_mes`: solo para mensual.
- `fecha_fin`: null = indefinido.

### Generacion de instancias

- Al crear bloqueo recurrente, generar instancias concretas para los proximos 90 dias
- Cada instancia es una fila en `bloqueos_profesional` con `inicio`/`fin` reales + `recurrencia_padre_id`
- Las queries existentes de validacion siguen funcionando sin cambios
- Para regenerar o eliminar la serie, se usa `recurrencia_padre_id`

### Profesionales multiples

- UI permite seleccionar varios profesionales al crear bloqueo
- Se crea un bloqueo (+ instancias) por cada profesional
- Todos comparten `grupo_bloqueo_id` para "Editar serie" / "Eliminar serie"

### UI en equipo.web.tsx

- Toggle "Recurrente" al crear bloqueo
- Despliega: tipo de frecuencia, selector de dias, rango de fechas
- Selector de profesionales: chips multi-select
- Lista de bloqueos: icono de repeticion para recurrentes
- Acciones: "Editar serie" / "Eliminar serie" (actua sobre grupo_bloqueo_id)

---

## 3. Bloqueo sobre citas existentes — Wizard (6.9)

### Flujo

**Paso 1 — Deteccion:**
- Antes de insertar bloqueo, query de citas `confirmada` del profesional que solapan con el rango
- Sin conflictos → crear bloqueo directamente
- Con conflictos → abrir wizard

**Paso 2 — Lista de citas afectadas:**
- Modal con cada cita conflictiva: clienta, servicio, hora, profesional
- Para cada cita, 3 opciones:
  - **Reagendar**: mini-selector con horarios libres del mismo profesional (u otro) ese dia o el siguiente
  - **Cancelar**: marca como cancelada
  - **Ignorar**: no hace nada (conflicto visible en calendario)

**Paso 3 — Resumen y confirmacion:**
- Resumen: "2 reagendadas, 1 cancelada, 0 ignoradas"
- Boton "Confirmar y crear bloqueo"
- Ejecuta en orden: reagendados → cancelaciones → creacion del bloqueo

### Bloqueos recurrentes

El wizard muestra TODAS las citas afectadas por todas las instancias futuras (90 dias), agrupadas por fecha con expand/collapse.

### Componente

`ConflictWizard` en equipo.web.tsx. Recibe array de citas afectadas, devuelve array de acciones a ejecutar.

---

## 4. Excepciones de retraso

### 4a. Profesional llega tarde (6.1)

**Trigger:** Boton manual en calendario, en la fila del profesional.

**Modal `ProfesionalRetrasoModal`:**
- Input: minutos de retraso (5, 10, 15, 20, 30, custom)
- Calcula citas afectadas: todas las del profesional desde ahora, estado `confirmada`
- Lista con preview del nuevo horario (hora original + retraso)
- Por cita: Desplazar (default) / Cancelar / No tocar
- "Aplicar ajuste" → actualiza inicio/fin/fin_activa/fin_espera
- Valida solapamientos con encadenados

### 4b. Clienta llega tarde (6.3)

**Trigger:** Boton en detalle de cita, solo visible para citas `confirmada` cuya hora de inicio ya paso.

**Modal `ClientaTardeModal`:**
- Muestra hora original vs hora actual
- 3 opciones:
  - **Reducir servicio**: mantiene hora fin, acorta duracion activa. Alerta si < 50% de la original.
  - **Desplazar**: mueve cita entera. Si hay siguientes del mismo profesional, pregunta si desplazarlas.
  - **Cancelar / No presentada**: cancelar o marcar no_presentada si pasaron > 15 min.

### 4c. Alertas en calendario

**Componente `AlertBar`:**
- Barra superior del calendario
- Polling cada 60 segundos
- Detecta citas `confirmada` cuya hora de inicio paso hace > 5 minutos
- Alerta amber: "Cita de [clienta] con [profesional] a las [hora] sin iniciar"
- Click en alerta → abre detalle de la cita

### Ubicacion del codigo

- `ProfesionalRetrasoModal`: componente nuevo en AgendaCalendar.web.tsx
- `ClientaTardeModal`: componente nuevo en AgendaCalendar.web.tsx
- `AlertBar`: componente nuevo, parte superior del calendario

---

## Orden de implementacion

1. Simplificacion de estados (refactor base)
2. Bloqueo recurrente 6.10 (modelo + UI)
3. Wizard de conflictos 6.9 (sobre bloqueos)
4. Excepciones de retraso 6.1 + 6.3 (modales + alertas)

## Items pospuestos

| Item | Razon |
|------|-------|
| 6.2 (cita se alarga) | Ya implementado parcialmente en codigo existente |
| 6.4 (cierre inesperado) | Edge case muy raro |
| 6.5/6.6 (reagendado) | Ya existe "Mover cita" en agenda-detalle.tsx |
| 6.7 (notificacion al reagendar) | Depende de sistema de comunicaciones (Fase 4) |
| 6.8 (bloqueo basico) | Ya implementado |
| 5.8 (asignacion inteligente encadenados) | Fase 5, no Fase 6 |
