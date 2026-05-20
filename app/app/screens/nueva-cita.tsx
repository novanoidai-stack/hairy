import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Platform, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addMinutes as dateFnsAddMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { useCalendarRefresh } from '@/lib/calendarContext';
import { TText, TTextInput } from '@/components/ui/TText';
import { syncAlergiasACliente } from '@/lib/syncAlergias';

export default function NuevaCitaScreen() {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ profesionalId?: string; hora?: string }>();
  const { triggerRefresh } = useCalendarRefresh();

  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);

  const [profSeleccionado, setProfSeleccionado] = useState<string>(params.profesionalId ?? '');
  const [servicioSeleccionado, setServicioSeleccionado] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [inicio, setInicio] = useState<Date>(params.hora ? new Date(params.hora) : new Date());
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [negocioId, setNegocioId] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState('');

  // Duration overrides
  const [duracionOverride, setDuracionOverride] = useState<{ duracion_activa_min: number; duracion_espera_min: number; duracion_activa_extra_min: number } | null>(null);
  const [duracionActivaCustom, setDuracionActivaCustom] = useState<number | null>(null);
  const [duracionEsperaCustom, setDuracionEsperaCustom] = useState<number | null>(null);
  const [duracionActivaExtraCustom, setDuracionActivaExtraCustom] = useState<number | null>(null);
  const [profOverrides, setProfOverrides] = useState<any[]>([]);

  // Formula de color (opcional)
  const [showFormula, setShowFormula] = useState(false);
  const [formulaProducto, setFormulaProducto] = useState('');
  const [formulaTono, setFormulaTono] = useState('');
  const [formulaTiempoMin, setFormulaTiempoMin] = useState('');
  const [formulaResultado, setFormulaResultado] = useState('');
  const [formulaNotas, setFormulaNotas] = useState('');

  // Notas / alergias de la cita (opcional)
  const [notasCita, setNotasCita] = useState('');

  // RN-AG-070/071: citas del dia del profesional para detectar reposos aprovechables
  const [citasDia, setCitasDia] = useState<any[]>([]);

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) return;
      setNegocioId(profile.negocio_id);
      setUserId(profile.id);

      const [{ data: profs }, { data: servs }, { data: clts }] = await Promise.all([
        supabase.from('profesionales').select('*').eq('negocio_id', profile.negocio_id).eq('activo', true),
        supabase.from('servicios').select('*').eq('negocio_id', profile.negocio_id).eq('activo', true),
        supabase.from('clientes').select('*').eq('negocio_id', profile.negocio_id).order('nombre').limit(200),
      ]);

      setProfesionales(profs ?? []);
      setServicios(servs ?? []);
      setClientes(clts ?? []);
      setLoading(false);
    }
    cargar();
  }, []);

  // Load professional_service_overrides when professional changes
  useEffect(() => {
    if (!profSeleccionado) { setProfOverrides([]); return; }
    supabase
      .from('professional_service_overrides')
      .select('*')
      .eq('professional_id', profSeleccionado)
      .then(({ data }) => {
        const ovs = data ?? [];
        setProfOverrides(ovs);
        // Deselect service if it's inactive for this professional
        if (servicioSeleccionado) {
          const ov = ovs.find((o: any) => o.service_id === servicioSeleccionado);
          if (ov?.activo === false) setServicioSeleccionado('');
        }
      });
  }, [profSeleccionado]);

  // Load citas del dia when prof or date changes (para detectar reposos aprovechables)
  useEffect(() => {
    if (!profSeleccionado || !negocioId) { setCitasDia([]); return; }
    const diaStr = inicio.toISOString().split('T')[0];
    supabase
      .from('citas')
      .select('id, inicio, fin, fin_activa, fin_espera, profesional_id')
      .eq('negocio_id', negocioId)
      .eq('profesional_id', profSeleccionado)
      .gte('inicio', `${diaStr}T00:00:00`)
      .lt('inicio', `${diaStr}T23:59:59`)
      .neq('estado', 'cancelada')
      .neq('estado', 'historica')
      .then(({ data }) => setCitasDia(data ?? []));
  }, [profSeleccionado, negocioId, inicio.toDateString()]);

  // Load per-professional duration override when both prof + service are selected
  useEffect(() => {
    if (!profSeleccionado || !servicioSeleccionado) {
      setDuracionOverride(null);
      setDuracionActivaCustom(null);
      setDuracionEsperaCustom(null);
      return;
    }
    supabase
      .from('duraciones_profesional')
      .select('duracion_activa_min, duracion_espera_min, duracion_activa_extra_min')
      .eq('profesional_id', profSeleccionado)
      .eq('servicio_id', servicioSeleccionado)
      .maybeSingle()
      .then(({ data }) => {
        setDuracionOverride(data ?? null);
        setDuracionActivaCustom(null);
        setDuracionEsperaCustom(null);
        setDuracionActivaExtraCustom(null);
      });
  }, [profSeleccionado, servicioSeleccionado]);

  const servicioActual = servicios.find((s) => s.id === servicioSeleccionado);
  const profOverride = profOverrides.find(o => o.service_id === servicioSeleccionado) ?? null;

  // Servicios visibles: excluye los que el profesional tiene marcados como inactivos
  const serviciosFiltrados = profSeleccionado
    ? servicios.filter(sv => {
        const ov = profOverrides.find(o => o.service_id === sv.id);
        return ov?.activo !== false;
      })
    : servicios;

  // Duration resolution: manual → professional_service_override → duraciones_profesional → service default
  const duracionActiva = duracionActivaCustom
    ?? profOverride?.duracion
    ?? duracionOverride?.duracion_activa_min
    ?? servicioActual?.duracion_activa_min
    ?? 30;
  const duracionEspera = duracionEsperaCustom
    ?? profOverride?.duracion_espera_min
    ?? duracionOverride?.duracion_espera_min
    ?? servicioActual?.duracion_espera_min
    ?? 0;
  const duracionActivaExtra = duracionActivaExtraCustom
    ?? profOverride?.duracion_activa_extra_min
    ?? duracionOverride?.duracion_activa_extra_min
    ?? servicioActual?.duracion_activa_extra_min
    ?? 0;
  const duracionTotal = duracionActiva + duracionEspera + duracionActivaExtra;

  // RN-AG-071/072: detectar si el slot actual aprovecha un reposo existente
  const citaHostReposo = citasDia.find((c) => {
    if (!c.fin_activa || !c.fin_espera) return false;
    const cFinActiva = new Date(c.fin_activa);
    const cFinEspera = new Date(c.fin_espera);
    const cFin = new Date(c.fin);
    const hasSegundaFase = cFinEspera.getTime() < cFin.getTime();
    const slotFinActiva = new Date(inicio.getTime() + duracionActiva * 60000);
    return inicio >= cFinActiva && (hasSegundaFase ? slotFinActiva < cFinEspera : slotFinActiva <= cFinEspera);
  });

  const finActiva = dateFnsAddMinutes(new Date(inicio), duracionActiva);
  const finEspera = dateFnsAddMinutes(new Date(inicio), duracionActiva + duracionEspera);
  const fin = dateFnsAddMinutes(new Date(inicio), duracionTotal);

  function cambiarDia(deltaDias: number) {
    const d = new Date(inicio);
    d.setDate(d.getDate() + deltaDias);
    setInicio(d);
  }

  function cambiarHora(deltaH: number, deltaM: number) {
    const d = new Date(inicio);
    d.setHours(d.getHours() + deltaH);
    d.setMinutes(d.getMinutes() + deltaM);
    setInicio(d);
  }

  const clientesFiltrados = clienteSearch.trim()
    ? clientes.filter(cl =>
        cl.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) ||
        (cl.telefono ?? '').includes(clienteSearch)
      )
    : clientes;

  function bloquear(msg: string) {
    setErrMsg(msg);
    setGuardando(false);
  }

  async function guardar() {
    if (!profSeleccionado || !servicioSeleccionado) {
      setErrMsg('Selecciona un profesional y un servicio.');
      return;
    }
    setErrMsg('');

    // Validar antelación mínima del servicio
    const minAntelacion = servicioActual?.min_antelacion_min ?? 0;
    if (minAntelacion > 0) {
      const limiteMin = new Date(Date.now() + minAntelacion * 60000);
      if (inicio < limiteMin) {
        setErrMsg(`Este servicio requiere reservarse con al menos ${minAntelacion} min de antelación.`);
        return;
      }
    }

    setGuardando(true);

    try {
      // 1. Check professional blocks
      const { data: bloqueos } = await supabase
        .from('bloqueos_profesional')
        .select('tipo, motivo')
        .eq('profesional_id', profSeleccionado)
        .lt('inicio', fin.toISOString())
        .gt('fin', inicio.toISOString());

      if (bloqueos && bloqueos.length > 0) {
        bloquear(`Profesional no disponible: ${bloqueos[0].motivo || bloqueos[0].tipo}`);
        return;
      }

      // 2. Check working hours (only if configured)
      const diaSemana = inicio.getDay();
      const { data: horario } = await supabase
        .from('horarios_profesional')
        .select('hora_inicio, hora_fin')
        .eq('profesional_id', profSeleccionado)
        .eq('dia_semana', diaSemana)
        .eq('activo', true)
        .maybeSingle();

      if (horario) {
        const minInicio = inicio.getHours() * 60 + inicio.getMinutes();
        const [h1, m1] = (horario.hora_inicio as string).split(':').map(Number);
        const [h2, m2] = (horario.hora_fin as string).split(':').map(Number);
        if (minInicio < h1 * 60 + m1 || minInicio + duracionTotal > h2 * 60 + m2) {
          bloquear(`Fuera de horario (${(horario.hora_inicio as string).slice(0,5)}–${(horario.hora_fin as string).slice(0,5)} los ${diaNombre(diaSemana)})`);
          return;
        }
      }

      // 3. No solapar en fase activa
      // Busca citas donde ambas fases activas se solapan
      const { data: solapadasActivas } = await supabase
        .from('citas')
        .select('id')
        .eq('profesional_id', profSeleccionado)
        .neq('estado', 'cancelada')
        .lt('inicio', finActiva.toISOString())       // otra.inicio < new.fin_activa
        .gt('fin_activa', inicio.toISOString());     // otra.fin_activa > new.inicio

      if (solapadasActivas && solapadasActivas.length > 0) {
        bloquear('El profesional ya tiene una cita activa en ese horario.');
        return;
      }

      // 3b. No solapar segunda fase activa (si existe)
      if (duracionActivaExtra > 0) {
        const { data: solapadasActivas2 } = await supabase
          .from('citas')
          .select('id')
          .eq('profesional_id', profSeleccionado)
          .neq('estado', 'cancelada')
          .lt('inicio', fin.toISOString())             // otra.inicio < new.fin
          .gt('fin_activa', finEspera.toISOString());  // otra.fin_activa > new.fin_espera (start of active2)

        if (solapadasActivas2 && solapadasActivas2.length > 0) {
          bloquear('El profesional ya tiene una cita activa en ese horario.');
          return;
        }
      }

      // 4. No extender el fin si ya hay cita en fase de espera
      // Busca citas donde la nueva empieza en su fase de espera pero intenta extender el fin
      const { data: citasEspera } = await supabase
        .from('citas')
        .select('id, fin')
        .eq('profesional_id', profSeleccionado)
        .neq('estado', 'cancelada')
        .lte('fin_activa', inicio.toISOString())    // otra.fin_activa <= new.inicio (new in/after wait phase)
        .gt('fin', inicio.toISOString())            // otra.fin > new.inicio (overlap real, excluye frontera exacta)
        .lt('fin', fin.toISOString());              // otra.fin < new.fin (new extends past)

      if (citasEspera && citasEspera.length > 0) {
        bloquear('No puedes terminar después de otra cita. El profesional sigue ocupado en esa franja.');
        return;
      }

      const tiempoMinNum = formulaTiempoMin.trim() ? parseInt(formulaTiempoMin.trim(), 10) : null;
      const { error } = await supabase.from('citas').insert({
        negocio_id: negocioId,
        profesional_id: profSeleccionado,
        servicio_id: servicioSeleccionado,
        cliente_id: clienteSeleccionado || null,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        fin_activa: finActiva.toISOString(),
        fin_espera: finEspera.toISOString(),
        estado: 'confirmada',
        canal: 'manual',
        creado_por: userId,
        notas: notasCita.trim() || null,
        formula_producto: formulaProducto.trim() || null,
        formula_tono: formulaTono.trim() || null,
        formula_tiempo_min: tiempoMinNum != null && !isNaN(tiempoMinNum) ? tiempoMinNum : null,
        formula_resultado: formulaResultado.trim() || null,
        formula_notas: formulaNotas.trim() || null,
      });

      // Sincronizar alergias de la cita hacia la ficha del cliente
      if (!error && clienteSeleccionado && notasCita.trim()) {
        await syncAlergiasACliente(clienteSeleccionado, notasCita.trim());
      }

      setGuardando(false);
      if (error) { setErrMsg(error.message); return; }
      triggerRefresh();
      router.back();
    } catch (e: any) {
      bloquear(e?.message ?? 'Error inesperado');
    }
  }

  if (loading) {
    return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator color="#6366f1" /></View>;
  }

  const inner = (
    <View style={[s.container, { backgroundColor: c.bg, paddingBottom: insets.bottom + spacing.lg }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">

        {/* ── Profesional ── */}
        <Section title="Profesional" required>
          <View style={s.chips}>
            {profesionales.map((p) => (
              <Chip key={p.id} label={p.nombre} color={p.color}
                selected={profSeleccionado === p.id} onPress={() => setProfSeleccionado(p.id)} />
            ))}
          </View>
        </Section>

        {/* ── Servicio ── */}
        <Section title="Servicio" required>
          <View style={s.serviceList}>
            {serviciosFiltrados.map((sv) => {
              const sel = servicioSeleccionado === sv.id;
              const ov = profOverrides.find(o => o.service_id === sv.id);
              const durTotal = (ov?.duracion ?? sv.duracion_activa_min ?? 0)
                + (ov?.duracion_espera_min ?? sv.duracion_espera_min ?? 0)
                + (ov?.duracion_activa_extra_min ?? sv.duracion_activa_extra_min ?? 0);
              const precio = ov?.precio ?? sv.precio;
              return (
                <TouchableOpacity
                  key={sv.id}
                  style={[s.serviceItem, {
                    borderColor: sel ? '#6366f1' : c.border,
                    backgroundColor: sel ? '#6366f122' : c.surface,
                  }]}
                  onPress={() => setServicioSeleccionado(sv.id)}
                >
                  <TText style={[s.serviceNombre, { color: sel ? '#6366f1' : c.text }]} numberOfLines={1}>
                    {sv.nombre}
                  </TText>
                  <TText style={[s.serviceDuracion, { color: sel ? '#6366f1' : c.textSecondary }]}>
                    {durTotal} min · {precio}€
                  </TText>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* ── Hora de inicio ── */}
        <Section title="Hora de inicio">
          <View style={[s.horaCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={s.fechaRow}>
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarDia(-1)}>
                <Ionicons name="remove" size={18} color={c.text} />
              </TouchableOpacity>
              <TText style={[s.horaFecha, { color: c.textSecondary }]}>
                {format(inicio, "EEEE d 'de' MMMM", { locale: es })}
              </TText>
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarDia(1)}>
                <Ionicons name="add" size={18} color={c.text} />
              </TouchableOpacity>
            </View>
            <View style={s.horaRow}>
              {/* Horas */}
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarHora(-1, 0)}>
                <Ionicons name="remove" size={18} color={c.text} />
              </TouchableOpacity>
              <View style={[s.horaNum, { backgroundColor: '#6366f122', borderColor: '#6366f133' }]}>
                <TText style={s.horaNumText}>{String(inicio.getHours()).padStart(2, '0')}</TText>
                <TText style={s.horaNumLabel}>h</TText>
              </View>
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarHora(1, 0)}>
                <Ionicons name="add" size={18} color={c.text} />
              </TouchableOpacity>

              <TText style={[s.horaSep, { color: c.textTertiary }]}>:</TText>

              {/* Minutos */}
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarHora(0, -5)}>
                <Ionicons name="remove" size={18} color={c.text} />
              </TouchableOpacity>
              <View style={[s.horaNum, { backgroundColor: '#6366f122', borderColor: '#6366f133' }]}>
                <TText style={s.horaNumText}>{String(inicio.getMinutes()).padStart(2, '0')}</TText>
                <TText style={s.horaNumLabel}>min</TText>
              </View>
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarHora(0, 5)}>
                <Ionicons name="add" size={18} color={c.text} />
              </TouchableOpacity>
            </View>

            {/* Duration controls — shown when service is selected */}
            {servicioActual && (
              <View style={[s.duracionBox, { borderTopColor: c.border }]}>
                <DuracionRow
                  label="Tiempo activo"
                  value={duracionActiva}
                  onMinus={() => setDuracionActivaCustom(Math.max(5, duracionActiva - 5))}
                  onPlus={() => setDuracionActivaCustom(duracionActiva + 5)}
                  c={c} isDark={isDark}
                />
                <DuracionRow
                  label="Tiempo de reposo"
                  value={duracionEspera}
                  onMinus={() => setDuracionEsperaCustom(Math.max(0, duracionEspera - 5))}
                  onPlus={() => setDuracionEsperaCustom(duracionEspera + 5)}
                  c={c} isDark={isDark}
                />
                {duracionEspera > 0 && (
                  <DuracionRow
                    label="Tiempo activo extra"
                    value={duracionActivaExtra}
                    onMinus={() => setDuracionActivaExtraCustom(Math.max(0, duracionActivaExtra - 5))}
                    onPlus={() => setDuracionActivaExtraCustom(duracionActivaExtra + 5)}
                    c={c} isDark={isDark}
                  />
                )}
                <TText style={[s.horaFin, { color: c.textTertiary }]}>
                  Finaliza: {format(fin, 'HH:mm')} · {duracionTotal} min totales
                  {duracionEspera > 0 && ` (${duracionActiva} activos + ${duracionEspera} reposo${duracionActivaExtra > 0 ? ` + ${duracionActivaExtra} activos` : ''})`}
                </TText>
              </View>
            )}
          </View>
        </Section>

        {/* RN-AG-071: hint aprovecha reposo */}
        {citaHostReposo && (
          <View style={[s.reposaHint, { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.35)' }]}>
            <Ionicons name="flash-outline" size={14} color="#f59e0b" />
            <TText style={s.reposaHintText}>Este horario aprovecha el tiempo de reposo de una cita existente</TText>
          </View>
        )}

        {/* ── Cliente ── */}
        <Section title="Clienta (opcional)">
          <View style={[s.searchBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={16} color={c.textTertiary} />
            <TTextInput
              style={[s.searchInput, { color: c.text }]}
              placeholder="Buscar por nombre o teléfono..."
              placeholderTextColor={c.textTertiary}
              value={clienteSearch}
              onChangeText={setClienteSearch}
            />
            {clienteSearch.length > 0 && (
              <TouchableOpacity onPress={() => setClienteSearch('')}>
                <Ionicons name="close-circle" size={16} color={c.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[s.clienteRow, { borderColor: !clienteSeleccionado ? '#6366f1' : c.border, backgroundColor: !clienteSeleccionado ? '#6366f122' : c.surface }]}
            onPress={() => { setClienteSeleccionado(''); setClienteSearch(''); }}
          >
            <View style={[s.clienteAvatar, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <Ionicons name="person-outline" size={16} color={c.textTertiary} />
            </View>
            <TText style={[s.clienteNombre, { color: !clienteSeleccionado ? '#6366f1' : c.textSecondary }]}>
              Sin clienta asignada
            </TText>
            {!clienteSeleccionado && <Ionicons name="checkmark-circle" size={18} color="#6366f1" style={{ marginLeft: 'auto' as any }} />}
          </TouchableOpacity>

          {clientesFiltrados.map((cl) => {
            const sel = clienteSeleccionado === cl.id;
            return (
              <TouchableOpacity
                key={cl.id}
                style={[s.clienteRow, { borderColor: sel ? '#6366f1' : c.border, backgroundColor: sel ? '#6366f122' : c.surface }]}
                onPress={() => { setClienteSeleccionado(cl.id); setClienteSearch(''); }}
              >
                <View style={[s.clienteAvatar, { backgroundColor: sel ? '#6366f133' : (isDark ? '#334155' : '#e2e8f0') }]}>
                  <TText style={{ fontSize: 13, fontWeight: fontWeight.bold, color: sel ? '#6366f1' : c.textSecondary }}>
                    {cl.nombre.charAt(0).toUpperCase()}
                  </TText>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <TText style={[s.clienteNombre, { color: sel ? '#6366f1' : c.text }]} numberOfLines={1}>{cl.nombre}</TText>
                  {cl.telefono && <TText style={[s.clienteTel, { color: c.textTertiary }]}>{cl.telefono}</TText>}
                </View>
                {sel && <Ionicons name="checkmark-circle" size={18} color="#6366f1" />}
              </TouchableOpacity>
            );
          })}

          {clientesFiltrados.length === 0 && clienteSearch.trim() !== '' && (
            <TText style={[s.noResults, { color: c.textTertiary }]}>Sin resultados para "{clienteSearch}"</TText>
          )}
        </Section>

        {/* Aviso de alergias del cliente seleccionado */}
        {(() => {
          if (!clienteSeleccionado) return null;
          const cl = clientes.find((x: any) => x.id === clienteSeleccionado);
          const alergiasTexto = (cl?.alergias ?? '').trim();
          if (!alergiasTexto) return null;
          return (
            <View style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.sm,
              padding: spacing.md,
              backgroundColor: 'rgba(239,68,68,0.10)',
              borderColor: 'rgba(239,68,68,0.40)',
              borderWidth: 1,
              borderRadius: radius.md,
            }}>
              <Ionicons name="alert-circle" size={18} color="#ef4444" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <TText style={{ color: '#ef4444', fontWeight: fontWeight.bold, fontSize: fontSize.sm, marginBottom: 2 }}>
                  Alergias registradas
                </TText>
                <TText style={{ color: '#ef4444', fontSize: fontSize.sm, lineHeight: 18 }}>
                  {alergiasTexto}
                </TText>
              </View>
            </View>
          );
        })()}

        {/* Alergias adicionales (opcional, especificas de esta cita) */}
        <Section title="Alergias (opcional)">
          <TTextInput
            value={notasCita}
            onChangeText={setNotasCita}
            placeholder="Alergias o reacciones a tener en cuenta para esta cita..."
            multiline
            numberOfLines={3}
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: 10,
              color: c.text,
              fontSize: fontSize.sm,
              minHeight: 70,
              textAlignVertical: 'top' as any,
            }}
          />
        </Section>

        {/* Formula de color (opcional, colapsable) */}
        <View style={{ gap: spacing.sm }}>
          <TouchableOpacity
            onPress={() => setShowFormula(v => !v)}
            style={[s.formulaToggle, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <Ionicons name="color-palette-outline" size={18} color={'#8b5cf6'} />
            <View style={{ flex: 1 }}>
              <TText style={[s.formulaToggleTitle, { color: c.text }]}>Formula de color / quimica</TText>
              <TText style={[s.formulaToggleSub, { color: c.textTertiary }]}>
                {showFormula ? 'Pulsa para ocultar' : 'Opcional. Anota producto, tono y tiempo'}
              </TText>
            </View>
            <Ionicons name={showFormula ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSecondary} />
          </TouchableOpacity>

          {showFormula && (
            <View style={[s.formulaBox, { backgroundColor: c.surface, borderColor: c.border }]}>
              <FormulaField label="Producto" value={formulaProducto} onChange={setFormulaProducto} placeholder="Ej. Wella Koleston 7/0" c={c} />
              <FormulaField label="Tono / mezcla" value={formulaTono} onChange={setFormulaTono} placeholder="Ej. Rubio medio + 9% oxidante 30 vol" c={c} />
              <FormulaField label="Tiempo de aplicacion (min)" value={formulaTiempoMin} onChange={setFormulaTiempoMin} placeholder="35" c={c} keyboardType="number-pad" />
              <FormulaField label="Resultado" value={formulaResultado} onChange={setFormulaResultado} placeholder="Como quedo (cobertura, tono final...)" c={c} multiline />
              <FormulaField label="Notas adicionales" value={formulaNotas} onChange={setFormulaNotas} placeholder="Observaciones especificas de la formula" c={c} multiline />
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[s.footer, { borderTopColor: c.border, backgroundColor: c.bg }]}>
        {errMsg ? (
          <View style={s.errBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
            <TText style={s.errText}>{errMsg}</TText>
          </View>
        ) : null}
        <TouchableOpacity style={[s.btnGuardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
          {guardando
            ? <ActivityIndicator color="#fff" size="small" />
            : <TText style={s.btnGuardarText}>Crear cita</TText>}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={s.overlay}>
        <View style={[s.panel, { backgroundColor: c.bg }]}>
          <View style={[s.panelHeader, { borderBottomColor: c.border }]}>
            <TText style={[s.panelTitle, { color: c.text }]}>Nueva cita</TText>
            <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={c.textSecondary} />
            </TouchableOpacity>
          </View>
          {inner}
        </View>
      </View>
    );
  }
  return inner;
}

function diaNombre(dia: number) {
  return ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'][dia];
}

function DuracionRow({ label, value, onMinus, onPlus, c, isDark }: {
  label: string; value: number;
  onMinus: () => void; onPlus: () => void;
  c: any; isDark: boolean;
}) {
  return (
    <View style={s.duracionRow}>
      <TText style={[s.duracionLabel, { color: c.textSecondary }]}>{label}</TText>
      <View style={s.duracionControl}>
        <TouchableOpacity style={[s.durBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={onMinus}>
          <Ionicons name="remove" size={14} color={c.text} />
        </TouchableOpacity>
        <TText style={[s.durValue, { color: c.text }]}>{value} min</TText>
        <TouchableOpacity style={[s.durBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={onPlus}>
          <Ionicons name="add" size={14} color={c.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Section({ title, children, required }: { title: string; children: React.ReactNode; required?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <TText style={{ color: c.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
        {title}{required && <TText style={{ color: '#ef4444' }}> *</TText>}
      </TText>
      {children}
    </View>
  );
}

function FormulaField({ label, value, onChange, placeholder, c, multiline, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  c: any; multiline?: boolean; keyboardType?: any;
}) {
  return (
    <View style={{ gap: 6 }}>
      <TText style={{ color: c.textSecondary, fontSize: fontSize.xs, fontWeight: fontWeight.medium }}>{label}</TText>
      <TTextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={{
          backgroundColor: c.bg,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: radius.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          color: c.text,
          fontSize: fontSize.sm,
          minHeight: multiline ? 60 : 38,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function Chip({ label, color, selected, onPress }: { label: string; color: string; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.chip, { borderColor: selected ? color : c.border, backgroundColor: selected ? color + '22' : c.surface }]}
    >
      <View style={[s.chipDot, { backgroundColor: color }]} />
      <TText style={[s.chipText, { color: selected ? color : c.textSecondary }]}>{label}</TText>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  serviceList: { gap: spacing.sm },
  serviceItem: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, marginBottom: spacing.sm },
  serviceNombre: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, marginBottom: 2 },
  serviceDuracion: { fontSize: fontSize.sm },

  horaCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  fechaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  horaFecha: { fontSize: fontSize.sm, textTransform: 'capitalize', flex: 1, textAlign: 'center' },
  horaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  horaBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  horaNum: { flexDirection: 'row', alignItems: 'baseline', gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, minWidth: 50, justifyContent: 'center' },
  horaNumText: { fontSize: 18, fontWeight: fontWeight.bold, color: '#6366f1' },
  horaNumLabel: { fontSize: 10, color: '#6366f1', fontWeight: fontWeight.medium },
  horaSep: { fontSize: 18, fontWeight: fontWeight.bold, marginHorizontal: 1 },
  horaFin: { fontSize: fontSize.xs },
  reposaHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.xs },
  reposaHintText: { fontSize: fontSize.xs, color: '#f59e0b', flex: 1 },

  duracionBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.sm },
  duracionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  duracionLabel: { fontSize: fontSize.sm },
  duracionControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  durBtn: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  durValue: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, minWidth: 50, textAlign: 'center' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: fontSize.sm, padding: 0, backgroundColor: 'transparent' },

  clienteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  clienteAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clienteNombre: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  clienteTel: { fontSize: fontSize.xs, marginTop: 1 },
  noResults: { fontSize: fontSize.sm, textAlign: 'center', paddingVertical: spacing.md },

  footer: { padding: spacing.lg, borderTopWidth: 1, gap: spacing.sm },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ef444415', borderRadius: radius.md, padding: spacing.sm },
  errText: { color: '#ef4444', fontSize: fontSize.sm, flex: 1 },
  btnGuardar: { backgroundColor: '#6366f1', borderRadius: radius.md, padding: 16, alignItems: 'center' },
  btnGuardarText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.bold },

  formulaToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  formulaToggleTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  formulaToggleSub: { fontSize: fontSize.xs, marginTop: 2 },
  formulaBox: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: spacing.md },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  panel: { width: 500, maxHeight: '90%' as any, borderRadius: 20, overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1 },
  panelTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
