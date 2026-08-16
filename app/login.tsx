import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { signIn } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { MechaMark } from '@/components/ui/MechaMark';
import { mensajeDeError } from '@/lib/errores';

// Tipografia del wordmark: Bricolage en web (igual que la landing), peso fuerte en nativo.
const WORDMARK_FONT = Platform.select({
  web: "'Bricolage Grotesque', 'Inter', system-ui, sans-serif" as any,
  default: undefined,
});

// Codigos que devuelve la edge signup-free → frases claras en español.
// mensajeDeError humaniza los snake_case no listados, pero para estos merece
// la pena dar un texto exacto que guie al usuario.
const SIGNUP_ERRORES: Record<string, string> = {
  invalid_email: 'El email no es válido.',
  weak_password: 'La contraseña debe tener al menos 8 caracteres.',
  missing_fields: 'Rellena todos los campos obligatorios.',
  leaked_password: 'Esa contraseña ha aparecido en filtraciones públicas. Elige otra más segura.',
  invalid_email_domain: 'El dominio de ese correo no existe. Comprueba que esté bien escrito.',
  demasiados_intentos: 'Demasiados intentos. Espera un rato antes de volver a intentarlo.',
  phone_limit_reached: 'Ese teléfono ya está asociado a demasiadas cuentas.',
  email_exists: 'Ya existe una cuenta con ese email.',
  create_failed: 'No se pudo crear la cuenta. Inténtalo de nuevo.',
};

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [telefono, setTelefono] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleLogin() {
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) setError(mensajeDeError(error));
    setLoading(false);
  }

  async function handleRegister() {
    if (!nombre.trim()) { setError('Introduce tu nombre'); return; }
    if (!apellido.trim()) { setError('Introduce tu apellido'); return; }
    if (!nombreNegocio.trim()) { setError('Introduce el nombre del negocio'); return; }
    if (!codigoPostal.trim()) { setError('Introduce el código postal'); return; }
    if (password.length < 8) { setError('La contraseña necesita al menos 8 caracteres.'); return; }
    setLoading(true);
    setError('');
    // Antes este formulario llamaba a supabase.auth.signUp() directamente,
    // saltandose TODAS las protecciones del servidor (HIBP, DNS MX, rate limit
    // por IP, limite de telefono). Ahora pasa por la misma Edge Function que la
    // web: signup-free. La cuenta se crea ya confirmada en el tenant de demo
    // (demo_salon_001). El negocio propio se asigna despues, cuando el equipo
    // Mecha da el acceso completo (staff_grant_full_access).
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('signup-free', {
        body: {
          email: email.trim().toLowerCase(),
          password,
          nombre: `${nombre.trim()} ${apellido.trim()}`,
          salon: nombreNegocio.trim(),
          telefono: telefono.trim() || undefined,
          apellido: apellido.trim(),
          codigo_postal: codigoPostal.trim(),
        },
      });

      // supabase-js pone el body en data cuando es 2xx; en errores (4xx) el body
      // llega como JSON en error.context (un Response). Lo leemos para dar el
      // mensaje traducido en vez del generico.
      let respBody = data as { ok?: boolean; error?: string } | null;
      if (invokeErr && !respBody?.error) {
        try {
          const ctx = (invokeErr as unknown as { context?: Response })?.context;
          if (ctx && typeof ctx.json === 'function') respBody = await ctx.json();
        } catch { /* body no JSON */ }
      }

      if (invokeErr || respBody?.error) {
        const codigo = respBody?.error || '';
        setError(SIGNUP_ERRORES[codigo] || mensajeDeError(invokeErr));
        setLoading(false);
        return;
      }

      // Cuenta creada con exito: auto-login con las mismas credenciales.
      // signup-free no devuelve sesion (usa la Admin API), asi que hacemos
      // signIn normalmente.
      setSuccess('Cuenta creada. Entrando…');
      const { error: loginErr } = await signIn(email.trim().toLowerCase(), password);
      if (loginErr) {
        // La cuenta existe pero el login fallo: pedir que entre manualmente.
        setSuccess('');
        setError('Cuenta creada, pero no se pudo entrar automaticamente. Inicia sesión.');
      }
    } catch (e) {
      setError('No se pudo crear la cuenta. Comprueba tu conexión e inténtalo de nuevo.');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <View style={s.brandRow}>
            <MechaMark size={40} />
            <Text style={s.wordmark}>Mecha<Text style={{ color: '#f4501e' }}>.</Text></Text>
            <View style={s.tag}><Text style={s.tagText}>OS</Text></View>
          </View>
          <Text style={s.sub}>{mode === 'login' ? 'Gestión inteligente de tu salón' : 'Crea tu cuenta'}</Text>

          {mode === 'register' && (
            <>
              <TextInput
                style={s.input}
                placeholder="Nombre"
                placeholderTextColor="#8a7d70"
                value={nombre}
                onChangeText={setNombre}
              />
              <TextInput
                style={s.input}
                placeholder="Apellido"
                placeholderTextColor="#8a7d70"
                value={apellido}
                onChangeText={setApellido}
              />
              <TextInput
                style={s.input}
                placeholder="Nombre del negocio"
                placeholderTextColor="#8a7d70"
                value={nombreNegocio}
                onChangeText={setNombreNegocio}
              />
              <TextInput
                style={s.input}
                placeholder="Código postal"
                placeholderTextColor="#8a7d70"
                value={codigoPostal}
                onChangeText={setCodigoPostal}
                keyboardType="number-pad"
              />
              <TextInput
                style={s.input}
                placeholder="Teléfono (opcional)"
                placeholderTextColor="#8a7d70"
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
              />
            </>
          )}
          <TextInput
            style={s.input}
            placeholder="Email"
            placeholderTextColor="#8a7d70"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={s.input}
            placeholder="Contraseña"
            placeholderTextColor="#8a7d70"
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
            activeOpacity={0.85}
          >
            <Text style={s.btnText}>
              {loading ? '...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.switchBtn}
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
              setSuccess('');
              setEmail('');
              setPassword('');
              setNombre('');
              setApellido('');
              setNombreNegocio('');
              setCodigoPostal('');
              setTelefono('');
            }}
          >
            <Text style={s.switchText}>
              {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f1ea' },
  inner: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fffdfb',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: 'rgba(40,30,24,0.08)',
    ...Platform.select({
      web: { boxShadow: '0 18px 50px rgba(40,30,24,0.10)' } as any,
      default: {
        shadowColor: '#281e18',
        shadowOpacity: 0.1,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
      },
    }),
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wordmark: { fontSize: 32, fontWeight: '800', color: '#1c1814', letterSpacing: -0.5, fontFamily: WORDMARK_FONT },
  tag: {
    backgroundColor: 'rgba(244,80,30,0.12)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  tagText: { color: '#c0260a', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  sub: { color: '#5c5249', textAlign: 'center', marginTop: 8, marginBottom: 28, fontSize: 15 },
  input: {
    backgroundColor: '#ffffff',
    color: '#1c1814',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(40,30,24,0.14)',
  },
  btn: {
    backgroundColor: '#f4501e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
    ...Platform.select({
      web: { boxShadow: '0 8px 22px rgba(244,80,30,0.30)' } as any,
      default: {},
    }),
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#e23b34', marginBottom: 8, textAlign: 'center', fontSize: 14 },
  successText: { color: '#0f9d6b', marginBottom: 8, textAlign: 'center', fontSize: 14 },
  switchBtn: { marginTop: 18, alignItems: 'center' },
  switchText: { color: '#f4501e', fontSize: 14, fontWeight: '600' },
});
