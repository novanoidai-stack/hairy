# Ficha de Cliente con Historial Real — Diseño

**Fecha:** 2026-05-09
**Origen:** Punto 2 del Dossier de Requisitos Innegociables (v1)
**Alcance:** Solo web (`.web.tsx`). Mobile queda para iteración futura.

## Objetivo

Convertir la ficha de cliente actual en una herramienta de memoria real del salón:
acceso rápido a historial, alergias, fórmulas de color y alertas críticas, con
edición completa de los datos del cliente.

## Resumen de decisiones

| Decisión | Valor |
|----------|-------|
| Scope | Todos los sub-bloques en una sola tanda |
| Plataforma | Solo web |
| Modelo de fórmula color | Campos estructurados en `citas` |
| Datos extra cliente | email, fecha_nacimiento, alergias, notas_generales |
| Umbral inactividad | 90 días |
| Tag VIP/Habitual/Nuevo | Computado en frontend |
| Layout | Panel lateral derecho con pestañas |

## 1. Cambios de base de datos

### Tabla `clientes` — nuevas columnas

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| `email` | `text` | sí | Validación frontend de formato |
| `fecha_nacimiento` | `date` | sí | Si solo se conoce día/mes, guardar año `1900` |
| `alergias` | `text` | sí | Texto libre. Si tiene contenido, banner rojo |
| `notas_generales` | `text` | sí | Preferencias permanentes del cliente |

### Tabla `citas` — nuevas columnas (fórmula de color/química)

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| `formula_producto` | `text` | sí | Marca + producto, ej. "Wella Koleston 7/0" |
| `formula_tono` | `text` | sí | Ej. "Rubio medio + 9% oxidante 30 vol" |
| `formula_tiempo_min` | `int` | sí | Minutos de aplicación |
| `formula_resultado` | `text` | sí | Cómo quedó tras la aplicación |
| `formula_notas` | `text` | sí | Observaciones específicas de esa fórmula |

`citas.notas` ya existe → se reutiliza para "notas internas por visita".

### Migración

Un único archivo SQL aplicado vía Supabase Management API:

```sql
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS alergias text,
  ADD COLUMN IF NOT EXISTS notas_generales text;

ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS formula_producto text,
  ADD COLUMN IF NOT EXISTS formula_tono text,
  ADD COLUMN IF NOT EXISTS formula_tiempo_min int,
  ADD COLUMN IF NOT EXISTS formula_resultado text,
  ADD COLUMN IF NOT EXISTS formula_notas text;
```

Las RLS policies existentes ya filtran por `negocio_id` y aplican a todas las
columnas: no requieren cambios.

## 2. Cómputo del tag (frontend)

Sin persistencia. Se calcula al cargar la lista de clientes:

```
visitas === 0       → "Nuevo"
visitas 1-2         → "Nuevo"
visitas 3-10        → "Habitual"
visitas > 10  ó
gastado > 500€      → "VIP"
```

## 3. Sistema de alertas

Se calculan en frontend al seleccionar un cliente. Aparecen como banners
apilados encima de las quick actions, ordenados por severidad:

| Tipo | Color | Condición |
|------|-------|-----------|
| Alergias | Rojo (`danger`) | `alergias` no vacío |
| Inactividad | Amarillo (`warning`) | `>90 días` desde última visita |
| Cumpleaños | Naranja (`warning` claro) | Cumple hoy o en los próximos 7 días |
| Cliente nuevo | Verde (`success`) | `visitas === 0` |

Solo se muestran las relevantes. Si no hay ninguna, no se renderiza ningún banner.

## 4. UI: panel lateral derecho

### Cabecera fija (siempre visible al seleccionar cliente)

1. Avatar grande + nombre + teléfono
2. Pill con tag computado + texto "Cliente desde [año primera cita]"
3. Banner de alertas (0-N apilados)
4. Quick actions: `Reservar` | `Llamar` | `Editar`
5. Mini-stats: `Visitas` | `Total` | `Ticket medio`

### Pestañas (debajo, lazy render)

- **Resumen** — servicio preferido + próxima cita (lo que ya existe)
- **Notas** — `notas_generales` (textarea inline editable con auto-save al perder foco) + `alergias` (textarea inline editable, marca rojo si tiene contenido)
- **Color/Química** — lista de citas que tienen al menos un campo `formula_*` rellenado. Cada item: fecha · profesional · producto · tono · tiempo · resultado · notas (colapsable). Orden: fecha desc.
- **Historial** — todas las citas del cliente, no solo 5. Reutiliza el componente actual.

### Estado vacío

Si una pestaña no tiene contenido, mensaje neutro en `textTer`:
- Notas: "Sin notas guardadas"
- Color/Química: "Sin fórmulas registradas todavía"
- Historial: "Sin historial"

## 5. Modal "Editar cliente"

Reutilización: extender `NewClienteModal` para soportar modo `edit` recibiendo
un `cliente` opcional. Si viene, precarga campos y cambia el botón a
"Guardar cambios" + añade botón "Eliminar cliente" en rojo.

### Campos del modal

- Nombre* (text)
- Teléfono (text)
- Email (text + validación de formato)
- Fecha de nacimiento (date input + checkbox "no sé el año" → guarda `1900-MM-DD`)
- Alergias (textarea, etiqueta destacada en rojo)
- Notas generales (textarea)

### Acciones

- `Cancelar` — cierra sin guardar
- `Eliminar cliente` — solo en modo edit. Confirmación nativa (`window.confirm`). Borra el registro y vuelve a la lista. **No** borra citas asociadas (FK), solo el cliente. Si hay error de FK por citas existentes, mostrar mensaje claro.
- `Guardar` — UPSERT a `clientes` con todos los campos.

## 6. Edición de fórmula de color en cita

Sección colapsable "Fórmula de color" en dos pantallas:

- `screens/nueva-cita.tsx` — al crear cita, opcional desplegar y rellenar
- `screens/agenda-detalle.tsx` — al ver una cita existente, mostrar valores guardados y permitir edición

Los 5 campos (`formula_producto`, `formula_tono`, `formula_tiempo_min`,
`formula_resultado`, `formula_notas`) se guardan en el INSERT/UPDATE de la cita.
Solo se muestran si el peluquero despliega la sección — no estorba en citas
normales.

## 7. Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `app/(tabs)/clientes.web.tsx` | Reescritura del panel derecho con pestañas, banners de alertas, edición inline de notas, integración modal editar |
| `app/screens/nueva-cita.tsx` | Sección colapsable "Fórmula de color" |
| `app/screens/agenda-detalle.tsx` | Mostrar y editar fórmula de color |
| `app/screens/cliente-detalle.tsx` | **No se toca** |
| BD Supabase | Migración SQL (vía Management API) |

## 8. Fuera de alcance (YAGNI)

- Lista de espera y recordatorios (corresponden al punto 3 del dossier)
- Edición de cliente desde mobile
- Múltiples fórmulas por cita (raíz/medios/puntas). Si surge necesidad real, migrar a tabla `formulas_color` con FK a citas
- Subir fotos del resultado
- Búsqueda por contenido de notas o fórmulas
- Exportar ficha del cliente

## 9. Criterios de aceptación

- [ ] Editar nombre, teléfono, email, fecha nacimiento, alergias y notas de un cliente y verificar que persiste
- [ ] Cliente con alergias muestra banner rojo persistente
- [ ] Cliente con cumpleaños hoy o esta semana muestra banner naranja
- [ ] Cliente sin visitas en >90 días muestra banner amarillo
- [ ] Cliente recién creado (sin citas) muestra banner verde "Primera vez"
- [ ] Tag VIP/Habitual/Nuevo refleja correctamente las visitas y gasto
- [ ] Crear cita con fórmula de color guarda los 5 campos
- [ ] Pestaña "Color/Química" muestra solo citas con al menos un campo de fórmula
- [ ] Eliminar cliente sin citas funciona; con citas muestra error claro
