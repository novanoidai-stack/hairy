import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AsYouType, parsePhoneNumberFromString, getCountries, getCountryCallingCode, CountryCode } from 'libphonenumber-js';

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
  compact?: boolean;                              // altura 36px para filas de Ajustes
};

export function PhoneInput({ value, onChange, defaultCountry = 'ES', placeholder = 'Número de teléfono', disabled, autoFocus, compact }: PhoneInputProps) {
  const [country, setCountry] = useState<CountryCode>(defaultCountry);
  const [national, setNational] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const lastEmitted = useRef('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Prefill desde un E.164 externo (modo edicion). Solo cuando el value externo no es lo que emitimos.
  useEffect(() => {
    if (value && value !== lastEmitted.current) {
      // Parsea E.164; si es un valor legado sin prefijo, reintenta con el pais por defecto.
      const p = parsePhoneNumberFromString(value) || parsePhoneNumberFromString(value, defaultCountry);
      if (p) { setCountry(p.country ?? defaultCountry); setNational(p.formatNational()); return; }
      setNational(value);
      return;
    }
    if (!value) setNational('');
  }, [value, defaultCountry]);

  // Cerrar el desplegable al pulsar fuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setSearch(''); } };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

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
  const H = compact ? 36 : 46;
  const R = compact ? 9 : 12;
  const FS = compact ? 13 : 15;

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'flex', gap: 8 }}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: compact ? '0 10px' : '0 12px', height: H, borderRadius: R,
          border: '1px solid rgba(28,24,20,0.14)', background: '#f6f1ea', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 14, color: '#1c1814' }}>+{cur?.code}</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>▾</span>
      </button>
      <input value={national} disabled={disabled} autoFocus={autoFocus} inputMode="tel" placeholder={placeholder}
        onChange={e => onNationalChange(e.target.value)}
        style={{ flex: 1, minWidth: 0, height: H, padding: compact ? '0 12px' : '0 14px', borderRadius: R,
          border: '1px solid rgba(28,24,20,0.14)', background: '#f6f1ea', fontSize: FS, color: '#1c1814', boxSizing: 'border-box' }} />
      {open && (
        <div style={{ position: 'absolute', top: H + 6, left: 0, zIndex: 50, width: 320, maxHeight: 320, overflow: 'auto',
          background: '#fffdfb', border: '1px solid rgba(28,24,20,0.14)', borderRadius: 14, boxShadow: '0 12px 32px rgba(28,24,20,0.18)' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar país o prefijo…"
            style={{ width: '100%', height: 42, padding: '0 14px', border: 'none', borderBottom: '1px solid rgba(28,24,20,0.1)',
              background: '#f6f1ea', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
          {filtered.map(c => (
            <button key={c.iso} type="button" onClick={() => pickCountry(c.iso)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', border: 'none',
                background: c.iso === country ? '#f1e9dd' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 14 }}>
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
