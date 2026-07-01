# Fidelización Avanzada - Resumen Ejecutivo

**Espec:** `docs/superpowers/specs/2026-07-01-sesion2-portal-competitivo-fidelizacion.md` (ÁREA 4)
**Plan detallado:** `docs/superpowers/planes/2026-07-01-fidelizacion-avanzada-implementation.md`
**Tiempo:** 6-8h

## Estado actual

- **YA HECHO:** Migración `recompensas.sql` con todas las tablas y RPCs
- **YA HECHO:** Componente `configuracion-recompensas.web.tsx` para configurar niveles/logros/recompensas
- **PENDIENTE:** Campo `bonus_puntos` en servicios
- **PENDIENTE:** Integración en clientes.web.tsx (badges + panel)
- **PENDIENTE:** Librería `lib/fidelizacion.ts`

## Archivos a crear

1. **`migrations/servicios-bonus-puntos.sql`** - Campo bonus_puntos en servicios
2. **`lib/fidelizacion.ts`** - Helpers (crear, ya hecho)

## Archivos a modificar

1. **`app/(tabs)/clientes.web.tsx`**
   - Añadir badge de nivel en tarjeta
   - Añadir sección fidelización en panel detalle
   - Importar `lib/fidelizacion.ts`

2. **`app/(tabs)/configuracion.web.tsx`**
   - Verificar que TabRecompensas está integrado

## Pasos rápidos

```bash
# 1. Aplicar migración
# Ejecutar contenido de migrations/servicios-bonus-puntos.sql en Supabase

# 2. Build web
npm run build:web

# 3. Test local
node scripts/serve-web.mjs
# Probar en http://localhost:8080/app?demo=1

# 4. Deploy
vercel --prod
```

## Fix crítico: nombres de tablas

El componente usa nombres incorrectos. Actualizar `configuracion-recompensas.web.tsx`:

```typescript
// Buscar y reemplazar:
'recompensas_fidelizacion' -> 'recompensas'
'logros_fidelizacion' -> 'logros'
```

## Checklist

- [ ] Migración bonus_puntos aplicada
- [ ] lib/fidelizacion.ts creado
- [ ] clientes.web.tsx modificado con badges
- [ ] clientes.web.tsx modificado con panel fidelización
- [ ] Nombres de tablas corregidos en configuracion-recompensas.web.tsx
- [ ] Test en demo (niveles visibles, logros mostrados)
- [ ] Deploy a Vercel

## Seed datos demo

```sql
-- Niveles
INSERT INTO niveles_fidelizacion (negocio_id, nombre, umbral_visitas, umbral_gastado_cents, color, icono, orden) VALUES
  ('demo_salon_001', 'Nuevo', 0, 0, '#9ca3af', 'star', 0),
  ('demo_salon_001', 'Habitual', 3, 5000, '#f59e0b', 'award', 1),
  ('demo_salon_001', 'VIP', 10, 20000, '#dc2626', 'trophy', 2)
ON CONFLICT DO NOTHING;

-- Logros
INSERT INTO logros (negocio_id, nombre, descripcion, tipo, condicion, icono, color) VALUES
  ('demo_salon_001', 'Primera visita', 'Completaste tu primera cita', 'primera_visita', '{}', 'sparkle', '#10b981'),
  ('demo_salon_001', 'Fiel', '5 citas completadas', 'visitas_multiple', '{"visitas": 5}', 'heart', '#ec4899'),
  ('demo_salon_001', 'Invertexido', 'Has gastado más de 100€', 'gastado_total', '{"gastado_cents": 10000}', 'euro', '#8b5cf6')
ON CONFLICT DO NOTHING;

-- Recompensas
INSERT INTO recompensas (negocio_id, nombre, descripcion, tipo, valor, umbral_visitas, expira_meses) VALUES
  ('demo_salon_001', 'Corte gratis', 'Un corte de cortesía', 'servicio', 'corte', 10, 12),
  ('demo_salon_001', '20% descuento', '20% en tu próximo servicio', 'descuento_pct', '20', 5, 6)
ON CONFLICT DO NOTHING;
```
