// Puerta "¿Quién eres?" del modo de acceso compartido — versión nativa.
// Misma idea que la web (components/acceso/PuertaIdentidad.web.tsx): el salón
// entra con un solo correo y aquí se elige la persona. Propietario y Dirección
// piden PIN.

import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { elegirIdentidad, pidePin, ROL_ACCESO_DESC, ROL_ACCESO_LABEL, type RolAcceso } from '@/lib/identidadActiva';
import type { FichaElegible } from '@/lib/hooks/useAccesoSalon';

interface Props {
  fichas: FichaElegible[];
  negocioId: string;
  tienePin: boolean;
  email: string | null;
  nombreSalon?: string | null;
  onElegida: () => void;
}

const ENTRADA_PROPIETARIO = '__propietario__';

export function PuertaIdentidad({ fichas, negocioId, tienePin, email, nombreSalon, onElegida }: Props) {
  const [pendiente, setPendiente] = useState<{ id: string; nombre: string; rol: RolAcceso } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [comprobando, setComprobando] = useState(false);

  useEffect(() => { setPin(''); setError(''); }, [pendiente]);

  async function guardar(id: string, nombre: string, rol: RolAcceso) {
    await elegirIdentidad({
      negocioId,
      profesionalId: id === ENTRADA_PROPIETARIO ? null : id,
      nombre,
      rol,
    });
    onElegida();
  }

  async function entrar(id: string, nombre: string, rol: RolAcceso) {
    // Sin PIN configurado no se puede pedir: mejor dejar pasar al jefe a su
    // propio salón que dejarle fuera.
    if (pidePin(rol) && tienePin) { setPendiente({ id, nombre, rol }); return; }
    await guardar(id, nombre, rol);
  }

  async function confirmarPin() {
    if (!pendiente) return;
    setComprobando(true);
    setError('');
    const { data, error: err } = await supabase.rpc('verificar_pin_propietario', { p_pin: pin });
    setComprobando(false);
    if (err) {
      setError((err.message || '').includes('demasiados_intentos')
        ? 'Demasiados intentos seguidos. Espera unos minutos.'
        : 'No se pudo comprobar el PIN.');
      return;
    }
    if (data !== true) { setError('Ese PIN no es correcto.'); setPin(''); return; }
    await guardar(pendiente.id, pendiente.nombre, pendiente.rol);
  }

  const iniciales = (n: string) =>
    n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

  if (pendiente) {
    return (
      <View style={s.fondo}>
        <View style={s.tarjetaPin}>
          <Text style={s.nombrePin}>{pendiente.nombre}</Text>
          <Text style={s.descPin}>{ROL_ACCESO_DESC[pendiente.rol]} Escribe el PIN para entrar.</Text>
          <TextInput
            autoFocus
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 8))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="••••"
            placeholderTextColor="#8a7d70"
            style={[s.inputPin, error ? s.inputPinError : null]}
          />
          {!!error && <Text style={s.error}>{error}</Text>}
          <TouchableOpacity
            onPress={confirmarPin}
            disabled={pin.length < 4 || comprobando}
            style={[s.botonPrimario, (pin.length < 4 || comprobando) && s.botonApagado]}
          >
            {comprobando
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.botonPrimarioTexto}>Entrar</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPendiente(null)}>
            <Text style={s.volver}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.fondo}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.salon}>{(nombreSalon || 'Tu salón').toUpperCase()}</Text>
        <Text style={s.titulo}>¿Quién eres?</Text>
        <Text style={s.sub}>Elige tu nombre para que la agenda y los cobros queden a tu nombre.</Text>

        <View style={s.rejilla}>
          {fichas.map((f) => (
            <TouchableOpacity key={f.id} style={s.ficha} onPress={() => entrar(f.id, f.nombre, f.rol_acceso)}>
              <View style={[s.avatar, { backgroundColor: f.color || '#f4501e' }]}>
                <Text style={s.avatarTexto}>{iniciales(f.nombre)}</Text>
              </View>
              <Text style={s.fichaNombre}>{f.nombre}</Text>
              <Text style={s.fichaRol}>
                {ROL_ACCESO_LABEL[f.rol_acceso]}{pidePin(f.rol_acceso) ? ' · PIN' : ''}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[s.ficha, s.fichaJefe]} onPress={() => entrar(ENTRADA_PROPIETARIO, 'Propietario', 'owner')}>
            <View style={[s.avatar, s.avatarJefe]}>
              <Text style={s.avatarJefeTexto}>🔑</Text>
            </View>
            <Text style={s.fichaNombre}>Soy el jefe</Text>
            <Text style={s.fichaRol}>Propietario · PIN</Text>
          </TouchableOpacity>
        </View>

        {fichas.length === 0 && (
          <Text style={s.vacio}>
            Todavía no hay profesionales dados de alta. Entra como jefe y añádelos en Equipo.
          </Text>
        )}

        <Text style={s.pie}>
          Este dispositivo entra con {email || 'el correo del salón'}. Puedes cambiar de persona desde tu nombre.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  fondo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#f6f1ea', zIndex: 10000 },
  scroll: { padding: 22, paddingTop: 60, alignItems: 'center' },
  salon: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: '#8a7d70' },
  titulo: { fontSize: 28, fontWeight: '800', color: '#1c1814', marginTop: 8 },
  sub: { fontSize: 14, color: '#5c5249', textAlign: 'center', marginTop: 6, marginBottom: 22 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  ficha: {
    width: 150, alignItems: 'center', paddingVertical: 18, paddingHorizontal: 10,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(40,30,24,0.10)',
  },
  fichaJefe: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: 'rgba(40,30,24,0.16)' },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarJefe: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(40,30,24,0.16)' },
  avatarTexto: { color: '#fff', fontSize: 20, fontWeight: '800' },
  avatarJefeTexto: { fontSize: 22 },
  fichaNombre: { fontSize: 15, fontWeight: '700', color: '#1c1814', marginTop: 10, textAlign: 'center' },
  fichaRol: { fontSize: 11, fontWeight: '600', color: '#8a7d70', marginTop: 4 },
  vacio: { fontSize: 13, color: '#5c5249', textAlign: 'center', marginTop: 18 },
  pie: { fontSize: 11.5, color: '#8a7d70', textAlign: 'center', marginTop: 24 },
  tarjetaPin: {
    margin: 'auto', width: 320, backgroundColor: '#fffdfb', borderRadius: 18, padding: 24,
    borderWidth: 1, borderColor: 'rgba(40,30,24,0.16)', alignItems: 'center',
  },
  nombrePin: { fontSize: 16, fontWeight: '700', color: '#1c1814' },
  descPin: { fontSize: 12.5, color: '#5c5249', textAlign: 'center', marginTop: 6, marginBottom: 16 },
  inputPin: {
    width: '100%', paddingVertical: 12, paddingHorizontal: 14, fontSize: 22, letterSpacing: 8,
    textAlign: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(40,30,24,0.16)',
    backgroundColor: '#f6f1ea', color: '#1c1814', marginBottom: 10,
  },
  inputPinError: { borderColor: '#e23b34' },
  error: { fontSize: 12.5, color: '#e23b34', marginBottom: 10 },
  botonPrimario: {
    width: '100%', paddingVertical: 13, borderRadius: 12, backgroundColor: '#f4501e', alignItems: 'center',
  },
  botonApagado: { backgroundColor: 'rgba(244,80,30,0.35)' },
  botonPrimarioTexto: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  volver: { marginTop: 12, color: '#5c5249', fontSize: 13, fontWeight: '600' },
});

export default PuertaIdentidad;
