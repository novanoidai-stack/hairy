# Guía de Diseño — Prevención de Regresión Visual

Esta guía mantiene la consistencia visual de Mecha/Hairy. **Síguela estrictamente.**

## Tokens Fuente de Verdad

### App Principal (tema claro)
- **Archivo:** `lib/designTokens.ts`
- **Import:** `import { DESIGN_TOKENS } from '@/lib/designTokens';`
- **Uso:** `DESIGN_TOKENS.primary`, `DESIGN_TOKENS.success`, etc.

### Portal Público (tema dark)
- **Archivo:** `lib/portalTokens.ts`
- **Import:** `import { PORTAL_TOKENS, FIRE_GRADIENT, SANS_SERIF } from '@/lib/portalTokens';`
- **Uso:** `PORTAL_TOKENS.primary`, `FIRE_GRADIENT`, etc.

## Reglas de Oro

### 1. NUNCA hardcodee colores hexadecimales
❌ `color: '#f4501e'`
✅ `color: DESIGN_TOKENS.primary`

**Excepción:** Solo en `lib/designTokens.ts` o `lib/portalTokens.ts` para definir nuevos tokens.

### 2. Use los tokens de estado correctos
- `success`: `DESIGN_TOKENS.success` (#0f9d6b)
- `danger`: `DESIGN_TOKENS.danger` (#e23b34)
- `warning`: `DESIGN_TOKENS.warning` (#e08a00)

**NO use variantes Tailwind:** `#10b981`, `#22c55e`, `#16a34a`, `#ef4444`, `#f59e0b`

### 3. Gradientes
- Portal público: `FIRE_GRADIENT` (de `lib/portalTokens.ts`)
- App principal: `DESIGN_TOKENS.fireGradient`

### 4. Layout dimensions
- Tab bar height móvil: `DESIGN_TOKENS.tabBarHeight` (96px)
- Spacing: `DESIGN_TOKENS.spacing.sm/md/lg/xl`

## Patrones Prohibidos

### Redefinición local de tokens
❌
```typescript
const T = {
  primary: '#f4501e',
  success: '#10b981',
  // ...
};
```

✅
```typescript
import { DESIGN_TOKENS } from '@/lib/designTokens';
// Usa DESIGN_TOKENS directamente
```

### Magic numbers
❌ `paddingBottom: 96`
✅ `paddingBottom: DESIGN_TOKENS.tabBarHeight`

## Antes de Commit

1. **Busque colores hex:**
   ```bash
   grep -rn '#[0-9a-f]\{6\}' app/ components/ --exclude-dir=node_modules
   ```

2. **Verifique que cada color tenga un token correspondiente.**

3. **Si necesita un color nuevo:**
   - Agréguelo a `designTokens.ts` o `portalTokens.ts`
   - NO lo hardcodee en el componente

## Referencias

- Landing colors: `web/assets/mecha.css` (`--accent`, `--bg`, etc.)
- Estado de citas: `STATUS_META` en `designTokens.ts`

---

**Última actualización:** 2025-06-25 (Megaauditoría Phase 7)
