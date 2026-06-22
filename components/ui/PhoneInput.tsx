import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, FlatList } from 'react-native';
import { AsYouType, parsePhoneNumberFromString, getCountries, getCountryCallingCode, CountryCode } from 'libphonenumber-js';
import type { PhoneInputProps } from './PhoneInput.web';

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
        <Text style={{ fontSize: 14, color: '#1c1814' }}>+{getCountryCallingCode(country)}</Text>
      </Pressable>
      <TextInput value={national} editable={!disabled} keyboardType="phone-pad" placeholder={placeholder} onChangeText={onNat}
        style={{ flex: 1, height: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(28,24,20,0.14)', backgroundColor: '#f6f1ea', fontSize: 15, color: '#1c1814' }} />
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => { setOpen(false); setSearch(''); }} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#fffdfb', maxHeight: '70%', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 12 }}>
            <TextInput value={search} onChangeText={setSearch} placeholder="Buscar país o prefijo…" autoFocus
              style={{ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#f6f1ea', fontSize: 15, marginBottom: 8 }} />
            <FlatList data={filtered} keyExtractor={c => c.iso} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable onPress={() => { setCountry(item.iso); setOpen(false); setSearch(''); emit(item.iso, national); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 6 }}>
                  <Text style={{ flex: 1, color: '#1c1814', fontSize: 15 }}>{item.name}</Text>
                  <Text style={{ opacity: 0.6 }}>+{item.code}</Text>
                </Pressable>
              )} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
