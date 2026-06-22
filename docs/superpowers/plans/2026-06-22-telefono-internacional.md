# Teléfono internacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el teléfono se introduzca con selector de país + número nacional, se guarde/compare en E.164, y funcione meter el número con o sin prefijo en toda la app (web + nativo).

**Architecture:** (1) Backend: helper `normalizar_telefono` + comparación sobre dígitos canónicos en las 7 RPCs + migración de datos a E.164. (2) Frontend: componente reutilizable `PhoneInput` (web `.web.tsx` + nativo `.tsx`) con `libphonenumber-js`, usado en todas las pantallas con teléfono.

**Tech Stack:** Expo ~54 + expo-router 6 + react-native-web, Supabase (Postgres RPC security definer), `libphonenumber-js`. Verificación del repo: `npx tsc --noEmit`, `npm run build:web`, `node scripts/serve-web.mjs` (localhost:8080), y queries SQL vía MCP (no hay framework de tests unitarios).

**Nota de verificación:** este repo no tiene runner de tests. Cada tarea verifica con typecheck, build, queries SQL y prueba manual en navegador, como define `CLAUDE.md`. Spec: `docs/superpowers/specs/2026-06-22-telefono-internacional-design.md`.

---

## Fase A — Backend: comparación canónica + migración

### Task A1: Helper `normalizar_telefono` + comparación en las 7 RPCs

**Files:**
- Create: `migrations/telefono-normalizar-comparacion.sql`
- Aplica en remoto vía MCP de Supabase (`apply_migration`, proyecto `vtrggiogjrhqtwbhbgia`).

- [ ] **Step 1: Escribir el helper + recrear las 7 RPCs cambiando SOLO la comparación de teléfono**

Crear `migrations/telefono-normalizar-comparacion.sql`. El helper:

```sql
create or replace function public.normalizar_telefono(p text)
returns text language sql immutable parallel safe as $$
  -- Canonico para comparar: solo digitos (con E.164, equivale a prefijo+nacional).
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;
```

Luego, en la MISMA migración, `create or replace` de las 7 funciones tomando su cuerpo actual
(obtenerlo con `select pg_get_functiondef('public.<fn>'::regproc)`) y sustituyendo cada
comparación de teléfono:

- En `cita_publica`, `cancelar_cita_publica`, `modificar_cita_publica`, `citas_de_cliente`,
  `identificar_cliente`: cambiar `cl.telefono = trim(p_telefono)` (o `c.telefono = trim(p_telefono)`)
  por `public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono)`
  (respetando el alias real `cl`/`c` de cada función).
- En `crear_cita_publica`, los 3 usos:
  - bloqueado: `where negocio_id = v_negocio and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono) and bloqueado = true`
  - conteo de citas: `and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_cliente_telefono)`
  - buscar cliente: `where negocio_id = v_negocio and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono) limit 1`
  - (el `insert ... values (..., trim(p_cliente_telefono), ...)` se deja: en A2 los datos pasan a E.164; ver Step de A2 nota.)
- En `confirmar_cita_oferta`, sustituir el bloque actual
  `if right(regexp_replace(...,9) <> right(regexp_replace(...,9) then` por
  `if public.normalizar_telefono(v_tel) is distinct from public.normalizar_telefono(p_telefono) then`.

Mantener TODO lo demás de cada función idéntico (firmas, `security definer`, `set search_path`).

- [ ] **Step 2: Aplicar la migración**

`apply_migration` (MCP Supabase, project `vtrggiogjrhqtwbhbgia`, name `telefono_normalizar_comparacion`) con el contenido del archivo.

- [ ] **Step 3: Verificar la comparación con varios formatos (SQL)**

Sembrar un cliente de prueba y comprobar que casa con/sin prefijo. Ejecutar vía MCP `execute_sql`:

```sql
-- helper
select public.normalizar_telefono('+34 661 03 13 65') as a,  -- 34661031365
       public.normalizar_telefono('661031365')        as b,  -- 661031365
       public.normalizar_telefono('0034661031365')     as c;  -- 34661031365
-- comparacion exacta sobre digitos: '34661031365' vs '661031365' NO son iguales todavia.
```
Expected: `a='34661031365'`, `b='661031365'`, `c='34661031365'`.

**OJO (dependencia con A2):** la comparación es exacta sobre dígitos, así que `34661031365`
(guardado) y `661031365` (tecleado) sólo casan **si los datos están en E.164** y el front manda
E.164. Por eso A2 (migración de datos) y el `PhoneInput` (manda E.164) son obligatorios para el
fix completo. Verificación E2E real al final (Task D2).

- [ ] **Step 4: Advisors de seguridad**

`get_advisors` (type `security`). Expected: sin ERROR nuevo respecto al baseline (los WARN de
funciones anon-executable preexistentes son por diseño).

- [ ] **Step 5: Commit**

```bash
git add migrations/telefono-normalizar-comparacion.sql
git commit -m "feat(telefono): normalizar_telefono + comparacion canonica en las 7 RPC"
```

### Task A2: Migrar datos existentes a E.164

**Files:**
- Create: `migrations/telefono-e164-backfill.sql`
- Aplica en remoto vía MCP.

- [ ] **Step 1: Escribir la migración de backfill**

`migrations/telefono-e164-backfill.sql`:

```sql
-- Normaliza telefonos de personas a E.164 (+<prefijo><nacional>).
-- Criterio para lo viejo sin prefijo internacional: asumir Espana (+34).
create or replace function public._to_e164_es(p text)
returns text language sql immutable as $$
  with d as (select regexp_replace(coalesce(p,''), '\D', '', 'g') as digs)
  select case
    when digs = '' then null
    when left(coalesce(p,''),1) = '+' then '+' || digs           -- ya internacional
    when left(digs,2) = '00' then '+' || substr(digs, 3)          -- 00 -> +
    when left(digs,2) = '34' and length(digs) = 11 then '+' || digs -- 34XXXXXXXXX
    when length(digs) = 9 then '+34' || digs                       -- nacional ES suelto
    else '+' || digs                                              -- fallback: anteponer +
  end
  from d;
$$;

update public.clientes
  set telefono = public._to_e164_es(telefono)
  where telefono is not null and telefono <> public._to_e164_es(telefono);

update public.lista_espera
  set telefono = public._to_e164_es(telefono)
  where telefono is not null and telefono <> public._to_e164_es(telefono);

drop function public._to_e164_es(text);
```

- [ ] **Step 2: (Pre-check) Inspeccionar muestras antes de aplicar**

Vía `execute_sql`, revisar qué cambiaría (no destructivo):

```sql
select telefono, regexp_replace(telefono,'\D','','g') as digs, length(regexp_replace(telefono,'\D','','g')) as n
from public.clientes
where telefono is not null
group by 1 order by n desc limit 30;
```
Expected: confirmar que la mayoría son 9 dígitos (ES) o ya `+34…`. Anotar cualquier caso raro
(longitudes 10/11 sin `+34` que pudieran ser otro país) para revisar a mano.

- [ ] **Step 3: Aplicar la migración**

`apply_migration` (name `telefono_e164_backfill`).

- [ ] **Step 4: Verificar el resultado**

```sql
select count(*) filter (where telefono is not null and left(telefono,1) <> '+') as sin_mas,
       count(*) filter (where telefono ~ '^\+\d{8,15}$') as bien_e164,
       count(*) as total
from public.clientes;
```
Expected: `sin_mas = 0`; `bien_e164` ≈ total (descontando nulos).

- [ ] **Step 5: Commit**

```bash
git add migrations/telefono-e164-backfill.sql
git commit -m "feat(telefono): backfill de telefonos existentes a E.164"
```

---

## Fase B — Componente web + pantallas web

### Task B1: Añadir dependencia `libphonenumber-js`

**Files:** Modify: `package.json`

- [ ] **Step 1: Instalar**

```bash
cd C:/Users/alexa/Desktop/Projects/Hairy
npm install libphonenumber-js
```
Expected: aparece `"libphonenumber-js": "^1.x"` en `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): libphonenumber-js"
```

### Task B2: Componente `components/ui/PhoneInput.web.tsx`

**Files:** Create: `components/ui/PhoneInput.web.tsx`

- [ ] **Step 1: Escribir el componente (completo)**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AsYouType, parsePhoneNumberFromString, getCountries, getCountryCallingCode, CountryCode } from 'libphonenumber-js';

// Bandera emoji desde ISO2 (regional indicator letters).
const flag = (iso: string) => iso.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
const regionNames = (() => { try { return new Intl.DisplayNames(['es'], { type: 'region' }); } catch { return null; } })();
const countryName = (iso: string) => regionNames?.of(iso) ?? iso;

type Country = { iso: CountryCode; name: string; code: string };
const COUNTRIES: Country[] = getCountries()
  .map(iso => ({ iso, name: countryName(iso), code: getCountryCallingCode(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

export type PhoneInputProps = {
  value: string;                                  // E.164 ('+34661031365') o ''
  onChange: (e164: string, isValid: boolean) => void;
  defaultCountry?: CountryCode;                   // default 'ES'
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function PhoneInput({ value, onChange, defaultCountry = 'ES', placeholder = 'Número de teléfono', disabled, autoFocus }: PhoneInputProps) {
  const [country, setCountry] = useState<CountryCode>(defaultCountry);
  const [national, setNational] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const lastEmitted = useRef('');

  // Prefill desde un E.164 externo (modo edicion). Solo cuando el value externo no es lo que emitimos.
  useEffect(() => {
    if (value && value !== lastEmitted.current) {
      const p = parsePhoneNumberFromString(value);
      if (p) { setCountry(p.country ?? defaultCountry); setNational(p.formatNational()); return; }
    }
    if (!value) setNational('');
  }, [value, defaultCountry]);

  const emit = (iso: CountryCode, nat: string) => {
    const p = parsePhoneNumberFromString(nat, iso);
    const e164 = p ? p.number : ('+' + getCountryCallingCode(iso) + nat.replace(/\D/g, ''));
    lastEmitted.current = e164;
    onChange(e164, !!p && p.isValid());
  };

  const onNationalChange = (raw: string) => {
    const formatted = new AsYouType(country).input(raw);
    setNational(formatted);
    emit(country, formatted);
  };
  const pickCountry = (iso: CountryCode) => {
    setCountry(iso); setOpen(false); setSearch('');
    emit(iso, national);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.includes(q.replace(/\D/g, '')));
  }, [search]);

  const cur = COUNTRIES.find(c => c.iso === country);

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 46, borderRadius: 12,
          border: '1px solid rgba(28,24,20,0.14)', background: '#f6f1ea', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 18 }}>{flag(country)}</span>
        <span style={{ fontSize: 14, color: '#1c1814' }}>+{cur?.code}</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>▾</span>
      </button>
      <input value={national} disabled={disabled} autoFocus={autoFocus} inputMode="tel" placeholder={placeholder}
        onChange={e => onNationalChange(e.target.value)}
        style={{ flex: 1, minWidth: 0, height: 46, padding: '0 14px', borderRadius: 12,
          border: '1px solid rgba(28,24,20,0.14)', background: '#f6f1ea', fontSize: 15, color: '#1c1814', boxSizing: 'border-box' }} />
      {open && (
        <div style={{ position: 'absolute', top: 52, left: 0, zIndex: 50, width: 320, maxHeight: 320, overflow: 'auto',
          background: '#fffdfb', border: '1px solid rgba(28,24,20,0.14)', borderRadius: 14, boxShadow: '0 12px 32px rgba(28,24,20,0.18)' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar país o prefijo…"
            style={{ width: '100%', height: 42, padding: '0 14px', border: 'none', borderBottom: '1px solid rgba(28,24,20,0.1)',
              background: '#f6f1ea', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
          {filtered.map(c => (
            <button key={c.iso} type="button" onClick={() => pickCountry(c.iso)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', border: 'none',
                background: c.iso === country ? '#f1e9dd' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 14 }}>
              <span style={{ fontSize: 18 }}>{flag(c.iso)}</span>
              <span style={{ flex: 1, color: '#1c1814' }}>{c.name}</span>
              <span style={{ opacity: 0.6 }}>+{c.code}</span>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: 14, opacity: 0.6, fontSize: 14 }}>Sin resultados</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `components/ui/PhoneInput.web.tsx`.

- [ ] **Step 3: Build**

Run: `npm run build:web`
Expected: build OK (sin "Unable to resolve module libphonenumber-js").

- [ ] **Step 4: Commit**

```bash
git add components/ui/PhoneInput.web.tsx
git commit -m "feat(ui): PhoneInput web (selector pais buscable + E.164)"
```

### Task B3: Usar PhoneInput en `app/cita/[id].web.tsx`

**Files:** Modify: `app/cita/[id].web.tsx` (paso 'phone', ~líneas 255-270 y estado `tel`)

- [ ] **Step 1: Sustituir el `<input>` de teléfono por PhoneInput**

Importar `import { PhoneInput } from '@/components/ui/PhoneInput';`. Reemplazar el `<input value={tel} onChange={e => setTel(e.target.value)} inputMode="tel" .../>` (con su icono envolvente si estorba) por:

```tsx
<PhoneInput value={tel} onChange={(e164) => setTel(e164)} autoFocus />
```

`tel` ya se usa como `tel.trim()` en las llamadas RPC; al ser ahora E.164 (`+34…`) casa con los datos migrados. El botón "Ver mi cita" sigue gateado por `!tel.trim()` → cambiar a deshabilitar si `tel.length < 8`.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build:web`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add app/cita/[id].web.tsx
git commit -m "feat(cita): PhoneInput en gestionar/confirmar cita"
```

### Task B4: Usar PhoneInput en `app/r/[slug].web.tsx` (portal de reserva)

**Files:** Modify: `app/r/[slug].web.tsx` (paso de datos del cliente; campo teléfono)

- [ ] **Step 1: Localizar el campo de teléfono**

Run: `grep -n "telefono\|inputMode=\"tel\"\|setTelefono\|phone" app/r/[slug].web.tsx`
Identificar el estado del teléfono del cliente y su `<input>`.

- [ ] **Step 2: Sustituir por PhoneInput**

Importar `PhoneInput` y reemplazar el `<input>` del teléfono por
`<PhoneInput value={<estadoTel>} onChange={(e164, valid) => { set<EstadoTel>(e164); setTelValido(valid); }} />`.
Antes de enviar la reserva (`crear_cita_publica`), exigir teléfono válido (bloquear submit si `!telValido`).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build:web`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add app/r/[slug].web.tsx
git commit -m "feat(portal): PhoneInput en reserva publica"
```

### Task B5: Usar PhoneInput en clientes / lista-espera / equipo / configuración (web)

**Files:** Modify: `app/(tabs)/clientes.web.tsx`, `app/(tabs)/lista-espera.web.tsx`, `app/(tabs)/equipo.web.tsx`, `app/(tabs)/configuracion.web.tsx`

- [ ] **Step 1: Para CADA archivo, localizar el input de teléfono y sustituirlo**

Para cada uno: `grep -n "telefono\|inputMode=\"tel\"\|phone\|Teléfono" <archivo>`. Sustituir el `<input>`/`STextInput` del teléfono por `<PhoneInput value={<tel>} onChange={(e164) => set<Tel>(e164)} />`. En formularios de edición el `value` precargado (E.164 tras A2) hace el prefill automático.
- `configuracion.web.tsx`: aplica al teléfono del salón/portal (`negocio_portal.telefono`). Mismo patrón.
- `equipo.web.tsx`: aplica al teléfono de contacto del profesional, si el formulario lo tiene.

- [ ] **Step 2: Typecheck + build tras cada archivo**

Run: `npx tsc --noEmit && npm run build:web`
Expected: OK.

- [ ] **Step 3: Commit (uno por archivo o agrupado)**

```bash
git add app/(tabs)/clientes.web.tsx app/(tabs)/lista-espera.web.tsx app/(tabs)/equipo.web.tsx app/(tabs)/configuracion.web.tsx
git commit -m "feat(web): PhoneInput en clientes, lista-espera, equipo y configuracion"
```

---

## Fase C — Componente nativo + pantallas nativas

### Task C1: Componente `components/ui/PhoneInput.tsx` (nativo)

**Files:** Create: `components/ui/PhoneInput.tsx`

- [ ] **Step 1: Escribir el componente nativo (misma API que el web)**

Misma firma `PhoneInputProps`. Implementación con RN: una fila `View` con un `Pressable` (bandera + `+code`) que abre un `Modal` con `TextInput` de búsqueda + `FlatList` de países; y un `TextInput` para el número con `keyboardType="phone-pad"`. Reusar la lógica de `AsYouType`/`parsePhoneNumberFromString`/`getCountries`/`getCountryCallingCode` idéntica al web. Estilos con los tokens nativos existentes (crema `#f6f1ea`, acento `#f4501e`).

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, FlatList } from 'react-native';
import { AsYouType, parsePhoneNumberFromString, getCountries, getCountryCallingCode, CountryCode } from 'libphonenumber-js';
import type { PhoneInputProps } from './PhoneInput.web';

const flag = (iso: string) => iso.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
const regionNames = (() => { try { return new Intl.DisplayNames(['es'], { type: 'region' }); } catch { return null; } })();
const COUNTRIES = getCountries().map(iso => ({ iso, name: regionNames?.of(iso) ?? iso, code: getCountryCallingCode(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

export function PhoneInput({ value, onChange, defaultCountry = 'ES', placeholder = 'Número de teléfono', disabled }: PhoneInputProps) {
  const [country, setCountry] = useState<CountryCode>(defaultCountry);
  const [national, setNational] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const lastEmitted = useRef('');

  useEffect(() => {
    if (value && value !== lastEmitted.current) {
      const p = parsePhoneNumberFromString(value);
      if (p) { setCountry(p.country ?? defaultCountry); setNational(p.formatNational()); return; }
    }
    if (!value) setNational('');
  }, [value, defaultCountry]);

  const emit = (iso: CountryCode, nat: string) => {
    const p = parsePhoneNumberFromString(nat, iso);
    const e164 = p ? p.number : ('+' + getCountryCallingCode(iso) + nat.replace(/\D/g, ''));
    lastEmitted.current = e164; onChange(e164, !!p && p.isValid());
  };
  const onNat = (raw: string) => { const f = new AsYouType(country).input(raw); setNational(f); emit(country, f); };
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.includes(q.replace(/\D/g, ''))) : COUNTRIES;
  }, [search]);

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable disabled={disabled} onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 46, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(28,24,20,0.14)', backgroundColor: '#f6f1ea' }}>
        <Text style={{ fontSize: 18 }}>{flag(country)}</Text>
        <Text style={{ fontSize: 14, color: '#1c1814' }}>+{getCountryCallingCode(country)}</Text>
      </Pressable>
      <TextInput value={national} editable={!disabled} keyboardType="phone-pad" placeholder={placeholder} onChangeText={onNat}
        style={{ flex: 1, height: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(28,24,20,0.14)', backgroundColor: '#f6f1ea', fontSize: 15, color: '#1c1814' }} />
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fffdfb', maxHeight: '70%', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 12 }}>
            <TextInput value={search} onChangeText={setSearch} placeholder="Buscar país o prefijo…" autoFocus
              style={{ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#f6f1ea', fontSize: 15, marginBottom: 8 }} />
            <FlatList data={filtered} keyExtractor={c => c.iso} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable onPress={() => { setCountry(item.iso); setOpen(false); setSearch(''); emit(item.iso, national); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 6 }}>
                  <Text style={{ fontSize: 18 }}>{flag(item.iso)}</Text>
                  <Text style={{ flex: 1, color: '#1c1814', fontSize: 15 }}>{item.name}</Text>
                  <Text style={{ opacity: 0.6 }}>+{item.code}</Text>
                </Pressable>
              )} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (la importación de tipo `PhoneInputProps` desde `./PhoneInput.web` es solo de tipos).

- [ ] **Step 3: Commit**

```bash
git add components/ui/PhoneInput.tsx
git commit -m "feat(ui): PhoneInput nativo"
```

### Task C2: Usar PhoneInput en pantallas nativas

**Files:** Modify: `app/screens/nueva-cita.tsx`, `app/screens/agenda-detalle.tsx`, `app/(tabs)/clientes.tsx`

- [ ] **Step 1: Para cada pantalla, localizar y sustituir el `TextInput` de teléfono**

`grep -n "telefono\|phone\|keyboardType" <archivo>`. Sustituir el `TextInput` del teléfono por
`<PhoneInput value={<tel>} onChange={(e164) => set<Tel>(e164)} />` (import desde `@/components/ui/PhoneInput`; el resolver de RN coge `.tsx` en nativo y `.web.tsx` en web).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add app/screens/nueva-cita.tsx app/screens/agenda-detalle.tsx app/(tabs)/clientes.tsx
git commit -m "feat(nativo): PhoneInput en nueva-cita, agenda-detalle y clientes"
```

---

## Fase D — Convención + verificación E2E

### Task D1: Dejar la convención en el design system del repo

**Files:** Modify: `.claude/skills/hairy-design-system/SKILL.md` (o el archivo del skill) y/o `CLAUDE.md` (sección "Convenciones de código")

- [ ] **Step 1: Añadir la regla**

Añadir una línea: «Todo campo de teléfono usa el componente `components/ui/PhoneInput` (selector de país + E.164). No usar inputs de texto crudos para teléfonos; pantallas nuevas parten de este componente.»

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/hairy-design-system CLAUDE.md
git commit -m "docs: convencion PhoneInput en el design system"
```

### Task D2: Verificación E2E del bug original

- [ ] **Step 1: Levantar el espejo local**

Run: `npm run build:web && node scripts/serve-web.mjs`
Expected: localhost:8080 sirviendo.

- [ ] **Step 2: Probar confirmar/gestionar cita con número SIN prefijo**

Crear (o reutilizar) una cita de un cliente cuyo teléfono esté en E.164 tras A2. Abrir
`http://localhost:8080/app/cita/<cita_id>?s=<slug>`, elegir país España y teclear el número
nacional **sin prefijo** (`661031365`). Pulsar "Ver mi cita".
Expected: la cita se carga (antes daba "no encontrada"). El bug original queda resuelto.

- [ ] **Step 3: Probar portal de reserva con país no-ES**

En `http://localhost:8080/app/r/<slug>`, en el paso de datos elegir p. ej. México (+52), teclear un
número MX válido. Expected: valida la longitud, deja reservar, y el cliente se guarda en E.164.

- [ ] **Step 4: Commit final / cierre**

Sin cambios de código nuevos; si los pasos revelan ajustes, corregir en la tarea correspondiente y
re-verificar.

---

## Notas de integración / git

- Tras `npm install libphonenumber-js`, cualquier `git pull` posterior necesita `npm install` (Vercel lo instala solo al desplegar).
- Flujo del repo: `git fetch` + rebase sobre `origin/master` antes de `push` (Carlos pushea a menudo). El push a `master` despliega a producción.
- Limpieza pendiente de la sesión de pruebas de lista de espera (datos `__TEST_LE__` en `demo_salon_001` y `prueba_46980`, config matching ON, workflow `Z4YtgqgEEEasufGJ` desactivado) — independiente de este plan; dejar el entorno como estaba al cerrar.
