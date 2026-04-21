import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { signIn } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleLogin() {
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleRegister() {
    if (!nombre.trim()) { setError('Introduce tu nombre'); return; }
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        nombre,
        role: 'owner',
      });
      setSuccess('Cuenta creada. Revisa tu email para confirmarla.');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>hairy</Text>
        <Text style={s.sub}>{mode === 'login' ? 'Gestión de peluquería' : 'Crea tu cuenta'}</Text>

        {mode === 'register' && (
          <TextInput
            style={s.input}
            placeholder="Nombre"
            placeholderTextColor="#64748b"
            value={nombre}
            onChangeText={setNombre}
          />
        )}
        <TextInput
          style={s.input}
          placeholder="Email"
          placeholderTextColor="#64748b"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={s.input}
          placeholder="Contraseña"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? <Text style={s.error}>{error}</Text> : null}
        {success ? <Text style={s.successText}>{success}</Text> : null}

        <TouchableOpacity
          style={s.btn}
          onPress={mode === 'login' ? handleLogin : handleRegister}
          disabled={loading}
        >
          <Text style={s.btnText}>
            {loading ? '...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.switchBtn}
          onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
        >
          <Text style={s.switchText}>
            {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 42, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -1 },
  sub: { color: '#64748b', textAlign: 'center', marginBottom: 40, fontSize: 15 },
  input: { backgroundColor: '#1e293b', color: '#f1f5f9', borderRadius: 12, padding: 16, marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#334155' },
  btn: { backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#f87171', marginBottom: 8, textAlign: 'center', fontSize: 14 },
  successText: { color: '#34d399', marginBottom: 8, textAlign: 'center', fontSize: 14 },
  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#6366f1', fontSize: 14 },
});
