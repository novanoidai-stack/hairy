# Ejemplo de integración de LiquidacionesSection en informes.web.tsx

## 1. Importar el componente

Añadir al principio de informes.web.tsx:

```typescript
import { LiquidacionesSection } from '@/components/informes/LiquidacionesSection';
```

## 2. Añadir la sección en el JSX

Despues de la sección de comisiones (linea ~1778 en informes.web.tsx):

```tsx
            {/* ============================================================= */}
            {/* Liquidaciones de comisiones                                  */}
            {/* ============================================================= */}
            <LiquidacionesSection negocioId={negocioId} />
```

## 3. Características implementadas

### Selector de periodo (mes)
- Botones para los ultimos 6 meses
- Visualizacion clara del periodo seleccionado
- Recarga automatica de datos al cambiar el mes

### Toggle de vista
- "Todas": muestra todas las liquidaciones generadas del periodo
- "Por profesional": permite seleccionar un profesional y ver el calculo preview

### Lista de liquidaciones
- Columnas: Profesional, % aplicado, Base, Comisión, Estado
- Estados: Pendiente, Pagada, Preview (calculada no guardada)
- Indicadores visuales de estado con colores
- Acciones: Ver detalle, Generar (para previews)

### Modal Detalle de liquidación
- Resumen: base, porcentaje, comision final
- Configuracion aplicada (neto/bruto, addons, propinas)
- Resumen de actividad (numero de cobros)
- Estado y fechas (creada, pagada)
- Accion: Marcar como pagada

### RPCs integradas
- `calcular_comisiones_periodo`: previsualizacion
- `generar_liquidacion`: persistir liquidacion
- `obtener_liquidaciones`: listar liquidaciones
- `marcar_liquidacion_pagada`: cambiar estado

### Export y acciones
- Export CSV con todas las liquidaciones del periodo
- Boton "Generar todas las liquidaciones" para crearlas en lote
- Indicador de carga durante generacion

### Responsive
- Móvil primero: grid adaptativo, textos compactos
- Columnas apiladas en pantallas pequeñas
- Touch-friendly buttons

## 4. Requisitos previos

Las siguientes RPCs deben estar instaladas (archivo `migrations/comisiones-liquidaciones.sql`):

- `calcular_comisiones_periodo(p_profesional_id, p_desde, p_hasta)`
- `generar_liquidacion(p_profesional_id, p_periodo_inicio, p_periodo_fin)`
- `obtener_liquidaciones(p_negocio_id, p_profesional_id, p_estado)`
- `marcar_liquidacion_pagada(p_liquidacion_id)`

## 5. Notas de diseño

- Sin emojis (requerimiento del proyecto)
- Colores sobrios profesionales usando tokens de diseño
- Consistencia visual con el resto de informes
- Animaciones sutiles de carga y hover
- Accesibilidad: tooltips, estados focus, contrastes WCAG AA
