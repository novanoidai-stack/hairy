import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { DESIGN_TOKENS } from '@/lib/designTokens';

const tokens = DESIGN_TOKENS;

interface Servicio {
  id: string;
  nombre: string;
  categoria?: string;
  precio: number;
  duracion_minutos: number;
  activo: boolean;
}

export default function ConfiguracionScreen() {
  const { width } = useWindowDimensions();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [activeTab, setActiveTab] = useState('servicios');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }

      const { data: servs } = await supabase
        .from('servicios')
        .select('id, nombre, categoria, precio, duracion_minutos, activo')
        .eq('negocio_id', profile.negocio_id)
        .order('nombre');

      setServicios(servs ?? []);
      setLoading(false);
    })();
  }, []);

  const categorias = [...new Set(servicios.map(s => s.categoria || 'Sin categoría'))];

  if (loading) return <View style={s.loading}><Text style={{ color: tokens.text }}>Cargando...</Text></View>;

  return (
    <View style={[s.root, { backgroundColor: tokens.bg }]}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={[s.title, { color: tokens.text }]}>Configuración</Text>
        <Text style={[s.subtitle, { color: tokens.textSecondary }]}>Gestiona tu negocio y servicios</Text>

        {/* Tabs */}
        <View style={s.tabs}>
          {['servicios', 'negocio', 'apariencia'].map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[s.tabBtn, activeTab === tab && { borderBottomColor: tokens.primary, borderBottomWidth: 2 }]}
            >
              <Text style={[s.tabLabel, { color: activeTab === tab ? tokens.primary : tokens.textSecondary }]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'servicios' && (
          <View>
            {categorias.map(categoria => (
              <View key={categoria}>
                <Text style={[s.categoryTitle, { color: tokens.textTertiary }]}>{categoria}</Text>
                {servicios
                  .filter(s => (s.categoria || 'Sin categoría') === categoria)
                  .map(srv => (
                    <View key={srv.id} style={[s.serviceRow, { borderColor: tokens.border, backgroundColor: tokens.bgCard }]}>
                      <View>
                        <Text style={[s.serviceName, { color: tokens.text }]}>{srv.nombre}</Text>
                        <Text style={[s.serviceMeta, { color: tokens.textTertiary }]}>{srv.duracion_minutos} min · €{srv.precio}</Text>
                      </View>
                      <View style={[s.toggle, { backgroundColor: srv.activo ? tokens.success : tokens.border }]} />
                    </View>
                  ))}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'negocio' && (
          <View>
            <Text style={[s.label, { color: tokens.text }]}>Nombre del negocio</Text>
            <Text style={[s.input, { color: tokens.text, borderColor: tokens.border }]}>Mi salón</Text>
          </View>
        )}

        {activeTab === 'apariencia' && (
          <View>
            <Text style={[s.themeLabel, { color: tokens.text }]}>Dark mode (Actual)</Text>
            <Text style={[s.themeDesc, { color: tokens.textSecondary }]}>Tema oscuro moderno y profesional</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 20 },
  tabs: { flexDirection: 'row', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.10)' },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 16, marginRight: 8 },
  tabLabel: { fontSize: 13, fontWeight: '600' },
  categoryTitle: { fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  serviceRow: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  serviceName: { fontSize: 13, fontWeight: '600' },
  serviceMeta: { fontSize: 11, marginTop: 4 },
  toggle: { width: 40, height: 24, borderRadius: 12 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 16 },
  themeLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  themeDesc: { fontSize: 11, marginBottom: 16 },
});
