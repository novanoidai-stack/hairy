import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useCalendarRefresh } from '@/lib/calendarContext';
import { TText, TTextInput } from '@/components/ui/TText';
import { CITA_STATUS } from '@/lib/constants';

const ESTADOS_META: Record<string, { label: string; color: string }> = {
  [CITA_STATUS.PROPUESTA]:      { label: 'Propuesta',        color: '#8b5cf6' },
  [CITA_STATUS.CONFIRMADA]:     { label: 'Confirmada',       color: '#6366f1' },
  [CITA_STATUS.EN_CURSO]:       { label: 'En curso',         color: '#10b981' },
  [CITA_STATUS.FINALIZADA]:     { label: 'Finalizada',       color: '#06b6d4' },
  [CITA_STATUS.COBRADA]:        { label: 'Cobrada',          color: '#22c55e' },
  [CITA_STATUS.CANCELADA]:      { label: 'Cancelada',        color: '#94a3b8' },
  [CITA_STATUS.NO_PRESENTADA]:  { label: 'No presentada',   color: '#ef4444' },
  [CITA_STATUS.INTERRUMPIDA]:   { label: 'Interrumpida',     color: '#f97316' },
  [CITA_STATUS.HISTORICA]:      { label: 'Historica',        color: '#64748b' },
  [CITA_STATUS.PENDIENTE]:      { label: 'Pendiente',        color: '#f59e0b' },
};

// Transiciones permitidas por estado actual (RN-AG según documento modular)
const TRANSICIONES: Record<string, string[]> = {
  [CITA_STATUS.PROPUESTA]:   [CITA_STATUS.CONFIRMADA, CITA_STATUS.CANCELADA],
  [CITA_STATUS.CONFIRMADA]:  [CITA_STATUS.EN_CURSO, CITA_STATUS.NO_PRESENTADA, CITA_STATUS.CANCELADA],
  [CITA_STATUS.EN_CURSO]:    [CITA_STATUS.FINALIZADA, CITA_STATUS.INTERRUMPIDA],
  [CITA_STATUS.FINALIZADA]:  [CITA_STATUS.COBRADA],
  [CITA_STATUS.COBRADA]:     [CITA_STATUS.HISTORICA],
  [CITA_STATUS.INTERRUMPIDA]:[CITA_STATUS.COBRADA],
  [CITA_STATUS.PENDIENTE]:   [CITA_STATUS.CONFIRMADA, CITA_STATUS.CANCELADA],
};

export default function AgendaDetalleScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { citaId } = useLocalSearchParams<{ citaId: string }>();
  const { triggerRefresh } = useCalendarRefresh();
  const [cita, setCita] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [mostrarnDialogoEliminar, setMostrarDialogoEliminar] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [canceladoPor, setCanceladoPor] = useState<'clienta' | 'negocio'>('negocio');

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('citas')
        .select(`
          id, inicio, fin, fin_activa, fin_espera, negocio_id, estado, notas, canal, profesional_id,
          motivo_cancelacion, cancelado_por,
          formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas,
          profesionales(nombre, color),
          servicios(nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min),
          clientes(id, nombre, telefono)
        `)
        .eq('id', citaId)
        .single();
      setCita(data);
      setLoading(false);
    }
    cargar();
  }, [citaId]);

  async function guardarFormula(payload: {
    formula_producto: string | null;
    formula_tono: string | null;
    formula_tiempo_min: number | null;
    formula_resultado: string | null;
    formula_notas: string | null;
  }) {
    setActualizando(true);
    const { error } = await supabase.from('citas').update(payload).eq('id', citaId);
    setActualizando(false);
    if (!error) {
      setCita((prev: any) => ({ ...prev, ...payload }));
      triggerRefresh();
    }
  }

  async function cambiarEstado(nuevoEstado: string) {
    setActualizando(true);
    await supabase.from('citas').update({ estado: nuevoEstado }).eq('id', citaId);
    setCita((prev: any) => ({ ...prev, estado: nuevoEstado }));
    setActualizando(false);
    triggerRefresh();
  }

  function handleCitaUpdated(updatedFields: any) {
    setCita((prev: any) => ({ ...prev, ...updatedFields }));
    triggerRefresh();
  }

  // CU-AG-05 + PA-06: nunca eliminar físicamente. Cancelar = ocultar del calendario + registrar motivo y quién cancela.
  async function cancelarCita() {
    setActualizando(true);
    const payload: any = {
      oculta_en_calendario: true,
      cancelado_por: canceladoPor,
      motivo_cancelacion: motivoCancelacion.trim() || null,
    };
    if (cita.estado !== CITA_STATUS.CANCELADA) {
      payload.estado = CITA_STATUS.CANCELADA;
    }
    const { error } = await supabase.from('citas').update(payload).eq('id', citaId);
    setActualizando(false);
    if (!error) {
      triggerRefresh();
      router.back();
    }
  }

  if (loading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator color="#6366f1" /></View>;
  if (!cita) return null;

  const estadoActual = ESTADOS_META[cita.estado] ?? { label: cita.estado, color: '#94a3b8' };
  const transicionesDisponibles = TRANSICIONES[cita.estado] ?? [];
  const inicio = new Date(cita.inicio);
  const fin = new Date(cita.fin);

  const inner = (
    <View style={[s.container, { backgroundColor: c.bg, paddingBottom: insets.bottom + spacing.lg }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>

        {/* Estado actual */}
        <View style={[s.estadoBadge, { backgroundColor: estadoActual.color + '22', borderColor: estadoActual.color }]}>
          <View style={[s.estadoDot, { backgroundColor: estadoActual.color }]} />
          <TText style={[s.estadoText, { color: estadoActual.color }]}>{estadoActual.label}</TText>
        </View>

        {/* Info principal */}
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row icon="time-outline" label="Hora" value={`${format(inicio, 'HH:mm')} — ${format(fin, 'HH:mm')}`} />
          <Divider />
          <Row icon="calendar-outline" label="Fecha" value={format(inicio, "EEEE d 'de' MMMM", { locale: es })} capitalize />
          <Divider />
          <Row icon="cut-outline" label="Servicio" value={cita.servicios?.nombre ?? '—'} />
          <Divider />
          <Row icon="person-outline" label="Profesional" value={cita.profesionales?.nombre ?? '—'} dot={cita.profesionales?.color} />
          {cita.clientes && (
            <>
              <Divider />
              <Row icon="people-outline" label="Clienta" value={cita.clientes.nombre} sub={cita.clientes.telefono} />
            </>
          )}
          <Divider />
          <Row icon="cash-outline" label="Precio" value={`${cita.servicios?.precio ?? 0}€`} />
          <Divider />
          <Row icon="timer-outline" label="Tiempo activo" value={`${cita.servicios?.duracion_activa_min ?? 0} min`} />
          <Divider />
          <Row icon="hourglass-outline" label="Tiempo de reposo" value={`${cita.servicios?.duracion_espera_min ?? 0} min`} />
          {(cita.servicios?.duracion_activa_extra_min ?? 0) > 0 && (
            <>
              <Divider />
              <Row icon="timer-outline" label="Tiempo activo extra" value={`${cita.servicios?.duracion_activa_extra_min ?? 0} min`} />
            </>
          )}
          {cita.canal !== 'manual' && (
            <>
              <Divider />
              <Row icon="globe-outline" label="Canal" value={cita.canal} />
            </>
          )}
          {cita.cancelado_por && (
            <>
              <Divider />
              <Row icon="close-circle-outline" label="Cancelado por" value={cita.cancelado_por === 'clienta' ? 'Clienta' : 'Negocio'} />
            </>
          )}
          {cita.motivo_cancelacion && (
            <>
              <Divider />
              <Row icon="chatbox-outline" label="Motivo" value={cita.motivo_cancelacion} />
            </>
          )}
        </View>

        {/* Ajustar horario — solo en citas EN_CURSO (PA-01 + CE-AG-02) */}
        {cita.estado === CITA_STATUS.EN_CURSO && (
          <AjustarHorarioSection cita={cita} onCitaUpdated={handleCitaUpdated} />
        )}

        {/* Cambiar estado — solo transiciones válidas según ciclo de vida */}
        {transicionesDisponibles.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <TText style={[s.sectionTitle, { color: c.textSecondary }]}>Cambiar estado</TText>
            <View style={s.estadosGrid}>
              {transicionesDisponibles.map((estadoKey) => {
                const meta = ESTADOS_META[estadoKey];
                if (!meta) return null;
                return (
                  <TouchableOpacity
                    key={estadoKey}
                    style={[s.estadoBtn, { borderColor: meta.color, backgroundColor: meta.color + '15' }]}
                    onPress={() => cambiarEstado(estadoKey)}
                    disabled={actualizando}
                  >
                    <TText style={[s.estadoBtnText, { color: meta.color }]}>{meta.label}</TText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Formula de color */}
        <FormulaSection cita={cita} onSave={guardarFormula} actualizando={actualizando} />

        {/* CU-AG-05: cancelar cita (solo estados no terminales ni ya cancelada) */}
        {![CITA_STATUS.HISTORICA, CITA_STATUS.EXPIRADA, CITA_STATUS.CANCELADA].includes(cita.estado) && (
          <TouchableOpacity
            style={[s.cancelBtn, { borderColor: c.border }]}
            onPress={() => setMostrarDialogoEliminar(true)}
            disabled={actualizando}
          >
            <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
            <TText style={s.cancelBtnText}>Cancelar cita</TText>
          </TouchableOpacity>
        )}
      </ScrollView>

      {mostrarnDialogoEliminar && (
        <View style={s.dialogOverlay}>
          <View style={[s.dialog, { backgroundColor: c.surface, borderColor: c.border }]}>
            <TText style={[s.dialogTitle, { color: c.text }]}>Cancelar cita</TText>
            <TText style={[s.dialogMessage, { color: c.textSecondary }]}>
              La cita desaparecera del calendario pero se conservara en el historial.
            </TText>

            {/* Quien cancela */}
            <TText style={[s.dialogLabel, { color: c.textSecondary }]}>Quien cancela</TText>
            <View style={s.canceladoPorRow}>
              {(['clienta', 'negocio'] as const).map((opcion) => (
                <TouchableOpacity
                  key={opcion}
                  style={[s.canceladoPorBtn, canceladoPor === opcion && s.canceladoPorBtnActive, { borderColor: canceladoPor === opcion ? '#6366f1' : c.border }]}
                  onPress={() => setCanceladoPor(opcion)}
                >
                  <TText style={[s.canceladoPorBtnText, { color: canceladoPor === opcion ? '#6366f1' : c.textSecondary }]}>
                    {opcion === 'clienta' ? 'Clienta' : 'Negocio'}
                  </TText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Motivo opcional */}
            <TText style={[s.dialogLabel, { color: c.textSecondary }]}>Motivo (opcional)</TText>
            <TTextInput
              value={motivoCancelacion}
              onChangeText={setMotivoCancelacion}
              placeholder="Ej: clienta no puede venir..."
              style={[s.motivoInput, { backgroundColor: c.bg, borderColor: c.border, color: c.text }]}
              multiline
            />

            <View style={s.dialogButtons}>
              <TouchableOpacity
                style={[s.dialogBtn, { backgroundColor: c.surface, borderColor: c.border }]}
                onPress={() => setMostrarDialogoEliminar(false)}
                disabled={actualizando}
              >
                <TText style={[s.dialogBtnText, { color: c.text }]}>Volver</TText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dialogBtn, s.dialogBtnDanger]}
                onPress={cancelarCita}
                disabled={actualizando}
              >
                <TText style={s.dialogBtnDangerText}>
                  {actualizando ? '...' : 'Cancelar cita'}
                </TText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={s.overlay}>
        <View style={[s.panel, { backgroundColor: c.bg }]}>
          <View style={[s.panelHeader, { borderBottomColor: c.border }]}>
            <TText style={[s.panelTitle, { color: c.text }]}>Detalle de cita</TText>
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

function Row({ icon, label, value, sub, dot, capitalize }: any) {
  const { c } = useTheme();
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={18} color={c.textTertiary} />
      <View style={{ flex: 1 }}>
        <TText style={[s.rowLabel, { color: c.textTertiary }]}>{label}</TText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
          <TText style={[s.rowValue, { color: c.text }, capitalize && { textTransform: 'capitalize' }]}>{value}</TText>
        </View>
        {sub && <TText style={[s.rowSub, { color: c.textSecondary }]}>{sub}</TText>}
      </View>
    </View>
  );
}

function Divider() {
  const { c } = useTheme();
  return <View style={[s.divider, { backgroundColor: c.border }]} />;
}

function FormulaSection({ cita, onSave, actualizando }: {
  cita: any;
  onSave: (payload: { formula_producto: string | null; formula_tono: string | null; formula_tiempo_min: number | null; formula_resultado: string | null; formula_notas: string | null }) => Promise<void>;
  actualizando: boolean;
}) {
  const { c } = useTheme();
  const hasContent = !!(cita.formula_producto || cita.formula_tono || cita.formula_tiempo_min != null || cita.formula_resultado || cita.formula_notas);
  const [editing, setEditing] = useState(!hasContent ? false : false);
  const [expanded, setExpanded] = useState(hasContent);
  const [producto, setProducto] = useState(cita.formula_producto ?? '');
  const [tono, setTono] = useState(cita.formula_tono ?? '');
  const [tiempo, setTiempo] = useState(cita.formula_tiempo_min != null ? String(cita.formula_tiempo_min) : '');
  const [resultado, setResultado] = useState(cita.formula_resultado ?? '');
  const [notasFormula, setNotasFormula] = useState(cita.formula_notas ?? '');

  async function handleSave() {
    const t = tiempo.trim() ? parseInt(tiempo.trim(), 10) : null;
    await onSave({
      formula_producto: producto.trim() || null,
      formula_tono: tono.trim() || null,
      formula_tiempo_min: t != null && !isNaN(t) ? t : null,
      formula_resultado: resultado.trim() || null,
      formula_notas: notasFormula.trim() || null,
    });
    setEditing(false);
  }

  function handleCancel() {
    setProducto(cita.formula_producto ?? '');
    setTono(cita.formula_tono ?? '');
    setTiempo(cita.formula_tiempo_min != null ? String(cita.formula_tiempo_min) : '');
    setResultado(cita.formula_resultado ?? '');
    setNotasFormula(cita.formula_notas ?? '');
    setEditing(false);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <TouchableOpacity
        onPress={() => setExpanded(v => !v)}
        style={[s.formulaToggle, { backgroundColor: c.surface, borderColor: c.border }]}
      >
        <Ionicons name="color-palette-outline" size={18} color={'#8b5cf6'} />
        <View style={{ flex: 1 }}>
          <TText style={[s.sectionTitle, { color: c.text, fontWeight: fontWeight.semibold }]}>Formula de color / quimica</TText>
          <TText style={[s.formulaSub, { color: c.textTertiary }]}>
            {hasContent ? 'Hay formula registrada' : 'Sin formula'}
          </TText>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSecondary} />
      </TouchableOpacity>

      {expanded && !editing && (
        <View style={[s.formulaBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          {hasContent ? (
            <>
              {cita.formula_producto && <FormulaRow label="Producto" value={cita.formula_producto} c={c} />}
              {cita.formula_tono && <FormulaRow label="Tono / mezcla" value={cita.formula_tono} c={c} />}
              {cita.formula_tiempo_min != null && <FormulaRow label="Tiempo" value={`${cita.formula_tiempo_min} min`} c={c} />}
              {cita.formula_resultado && <FormulaRow label="Resultado" value={cita.formula_resultado} c={c} />}
              {cita.formula_notas && <FormulaRow label="Notas" value={cita.formula_notas} c={c} />}
            </>
          ) : (
            <TText style={{ fontSize: fontSize.sm, color: c.textTertiary }}>Sin datos. Pulsa Editar para anotar.</TText>
          )}
          <TouchableOpacity
            onPress={() => setEditing(true)}
            style={[s.formulaEditBtn, { borderColor: c.border }]}
          >
            <Ionicons name="create-outline" size={14} color={c.textSecondary} />
            <TText style={[s.formulaEditBtnText, { color: c.textSecondary }]}>{hasContent ? 'Editar' : 'Anadir formula'}</TText>
          </TouchableOpacity>
        </View>
      )}

      {expanded && editing && (
        <View style={[s.formulaBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <FormulaInput label="Producto" value={producto} onChange={setProducto} placeholder="Ej. Wella Koleston 7/0" c={c} />
          <FormulaInput label="Tono / mezcla" value={tono} onChange={setTono} placeholder="Ej. Rubio medio + 9% oxidante 30 vol" c={c} />
          <FormulaInput label="Tiempo de aplicacion (min)" value={tiempo} onChange={setTiempo} placeholder="35" c={c} keyboardType="number-pad" />
          <FormulaInput label="Resultado" value={resultado} onChange={setResultado} placeholder="Como quedo" c={c} multiline />
          <FormulaInput label="Notas adicionales" value={notasFormula} onChange={setNotasFormula} placeholder="Observaciones" c={c} multiline />

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity onPress={handleCancel} disabled={actualizando} style={[s.formulaEditBtn, { borderColor: c.border, flex: 1 }]}>
              <TText style={[s.formulaEditBtnText, { color: c.textSecondary }]}>Cancelar</TText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={actualizando} style={[s.formulaSaveBtn, actualizando && { opacity: 0.6 }]}>
              <TText style={s.formulaSaveBtnText}>{actualizando ? 'Guardando...' : 'Guardar'}</TText>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function FormulaRow({ label, value, c }: { label: string; value: string; c: any }) {
  return (
    <View style={{ gap: 2 }}>
      <TText style={{ fontSize: fontSize.xs, color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.semibold }}>{label}</TText>
      <TText style={{ fontSize: fontSize.sm, color: c.text }}>{value}</TText>
    </View>
  );
}

function FormulaInput({ label, value, onChange, placeholder, c, multiline, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; c: any; multiline?: boolean; keyboardType?: any;
}) {
  return (
    <View style={{ gap: 6 }}>
      <TText style={{ fontSize: fontSize.xs, color: c.textSecondary, fontWeight: fontWeight.medium }}>{label}</TText>
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

function AjustarHorarioSection({ cita, onCitaUpdated }: {
  cita: any;
  onCitaUpdated: (updated: any) => void;
}) {
  const { c } = useTheme();
  const [saving, setSaving] = useState(false);

  // --- MOVER ---
  const inicioFmt = format(new Date(cita.inicio), 'HH:mm');
  const [horaIn, setHoraIn] = useState(inicioFmt);
  const [moveError, setMoveError] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);

  const duracionTotalMs = new Date(cita.fin).getTime() - new Date(cita.inicio).getTime();
  const durTotalMin = Math.round(duracionTotalMs / 60000);

  async function handleMover() {
    const [hIn, mIn] = horaIn.split(':').map(Number);
    if (isNaN(hIn) || isNaN(mIn)) return;

    const base = new Date(cita.inicio);
    const nuevoInicio = new Date(base);
    nuevoInicio.setHours(hIn, mIn, 0, 0);

    const finActivaMs = cita.fin_activa
      ? new Date(cita.fin_activa).getTime() - new Date(cita.inicio).getTime()
      : duracionTotalMs;
    const finEsperaMs = cita.fin_activa && cita.fin_espera
      ? new Date(cita.fin_espera).getTime() - new Date(cita.fin_activa).getTime()
      : 0;
    const activo2Ms = cita.fin_espera
      ? new Date(cita.fin).getTime() - new Date(cita.fin_espera).getTime()
      : 0;

    const nuevoFinActiva = new Date(nuevoInicio.getTime() + finActivaMs);
    const nuevoFinEspera = new Date(nuevoFinActiva.getTime() + finEsperaMs);
    const nuevoFin = new Date(nuevoFinEspera.getTime() + activo2Ms);

    // Validar solapamiento fase activa 1
    const { data: sol1 } = await supabase
      .from('citas')
      .select('id')
      .eq('negocio_id', cita.negocio_id)
      .eq('profesional_id', cita.profesional_id)
      .neq('estado', CITA_STATUS.CANCELADA)
      .neq('estado', CITA_STATUS.HISTORICA)
      .neq('id', cita.id)
      .lt('inicio', nuevoFinActiva.toISOString())
      .gt('fin_activa', nuevoInicio.toISOString());

    if (sol1 && sol1.length > 0) {
      setMoveError('El profesional ya tiene una cita activa en ese horario.');
      return;
    }

    // Validar solapamiento fase activa 2 (si existe)
    if (activo2Ms > 0) {
      const { data: sol2 } = await supabase
        .from('citas')
        .select('id')
        .eq('negocio_id', cita.negocio_id)
        .eq('profesional_id', cita.profesional_id)
        .neq('estado', CITA_STATUS.CANCELADA)
        .neq('estado', CITA_STATUS.HISTORICA)
        .neq('id', cita.id)
        .lt('inicio', nuevoFin.toISOString())
        .gt('fin_activa', nuevoFinEspera.toISOString());

      if (sol2 && sol2.length > 0) {
        setMoveError('El profesional ya tiene una cita activa en ese horario.');
        return;
      }
    }

    // Validar excedeLaEspera: la cita movida cae en el tiempo de espera de otra
    // y su fase activa supera el fin de ese tiempo de espera
    const { data: sol3 } = await supabase
      .from('citas')
      .select('id')
      .eq('negocio_id', cita.negocio_id)
      .eq('profesional_id', cita.profesional_id)
      .neq('estado', CITA_STATUS.CANCELADA)
      .neq('estado', CITA_STATUS.HISTORICA)
      .neq('id', cita.id)
      .lte('fin_activa', nuevoInicio.toISOString())
      .gt('fin_espera', nuevoInicio.toISOString())
      .lt('fin_espera', nuevoFinActiva.toISOString())
      .not('fin_espera', 'is', null);

    if (sol3 && sol3.length > 0) {
      setMoveError('El tiempo activo supera el tiempo de espera de otra cita.');
      return;
    }

    setMoveError('');
    setSaving(true);
    const payload: any = {
      inicio: nuevoInicio.toISOString(),
      fin: nuevoFin.toISOString(),
      fin_activa: nuevoFinActiva.toISOString(),
      fin_espera: nuevoFinEspera.toISOString(),
    };
    const { error } = await supabase.from('citas').update(payload).eq('id', cita.id);
    setSaving(false);
    if (!error) {
      onCitaUpdated(payload);
      setMoveOpen(false);
    }
  }

  // --- AJUSTAR DURACION ---
  const inicioMs = new Date(cita.inicio).getTime();
  const finMs = new Date(cita.fin).getTime();
  const finActivaMs2 = cita.fin_activa ? new Date(cita.fin_activa).getTime() : finMs;
  const finEsperaMs2 = cita.fin_espera ? new Date(cita.fin_espera).getTime() : finActivaMs2;

  const initActivo = Math.max(5, Math.round((finActivaMs2 - inicioMs) / 60000));
  const initEspera = Math.round((finEsperaMs2 - finActivaMs2) / 60000);
  const initActivo2 = Math.round((finMs - finEsperaMs2) / 60000);

  const [activo, setActivo] = useState(initActivo);
  const [espera, setEspera] = useState(initEspera);
  const [activo2, setActivo2] = useState(initActivo2);
  const [extOpen, setExtOpen] = useState(false);

  async function handleAjustar() {
    const inicio = new Date(cita.inicio);
    const nuevoFinActiva = new Date(inicio.getTime() + activo * 60000);
    const nuevoFinEspera = new Date(nuevoFinActiva.getTime() + espera * 60000);
    const nuevoFin = new Date(nuevoFinEspera.getTime() + activo2 * 60000);
    const originalFin = new Date(cita.fin);
    const delayMs = nuevoFin.getTime() - originalFin.getTime();

    setSaving(true);

    // Bloqueo duro: si esta cita está dentro del tiempo de espera de otra,
    // el nuevo fin activo no puede superar el fin de ese tiempo de espera (RN-AG-013)
    const { data: hostCitas } = await supabase
      .from('citas')
      .select('id, fin_espera')
      .eq('negocio_id', cita.negocio_id)
      .eq('profesional_id', cita.profesional_id)
      .neq('id', cita.id)
      .neq('estado', CITA_STATUS.CANCELADA)
      .neq('estado', CITA_STATUS.HISTORICA)
      .lte('fin_activa', inicio.toISOString())
      .gt('fin_espera', inicio.toISOString())
      .not('fin_espera', 'is', null);

    if (hostCitas && hostCitas.length > 0) {
      const host = hostCitas[0] as any;
      if (nuevoFinActiva > new Date(host.fin_espera)) {
        Alert.alert('Conflicto de horario', 'El tiempo activo supera el tiempo de espera de la cita anterior.');
        setSaving(false);
        return;
      }
    }

    const payload: any = {
      fin: nuevoFin.toISOString(),
      fin_activa: nuevoFinActiva.toISOString(),
      fin_espera: nuevoFinEspera.toISOString(),
    };
    const { error } = await supabase.from('citas').update(payload).eq('id', cita.id);
    if (error) { setSaving(false); return; }
    onCitaUpdated(payload);

    // Desplazar automaticamente citas dentro del tiempo de espera
    const originalFinActiva = new Date(cita.fin_activa || cita.fin);
    const originalFinEspera = new Date(cita.fin_espera || cita.fin);
    const deltaActiva = nuevoFinActiva.getTime() - originalFinActiva.getTime();
    if (deltaActiva !== 0) {
      const { data: citasEnEspera } = await supabase
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera')
        .eq('negocio_id', cita.negocio_id)
        .eq('profesional_id', cita.profesional_id)
        .gte('inicio', originalFinActiva.toISOString())
        .lt('inicio', originalFinEspera.toISOString())
        .neq('id', cita.id)
        .neq('estado', CITA_STATUS.CANCELADA)
        .neq('estado', CITA_STATUS.HISTORICA)
        .eq('oculta_en_calendario', false);
      if (citasEnEspera) {
        for (const sig of citasEnEspera as any[]) {
          const p: any = {
            inicio: new Date(new Date(sig.inicio).getTime() + deltaActiva).toISOString(),
            fin: new Date(new Date(sig.fin).getTime() + deltaActiva).toISOString(),
          };
          if (sig.fin_activa) p.fin_activa = new Date(new Date(sig.fin_activa).getTime() + deltaActiva).toISOString();
          if (sig.fin_espera) p.fin_espera = new Date(new Date(sig.fin_espera).getTime() + deltaActiva).toISOString();
          await supabase.from('citas').update(p).eq('id', sig.id);
        }
      }
    }

    if (delayMs > 0) {
      const diaFin = new Date(originalFin);
      diaFin.setHours(23, 59, 59, 999);
      const { data: siguientes } = await supabase
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera')
        .eq('negocio_id', cita.negocio_id)
        .eq('profesional_id', cita.profesional_id)
        .gte('inicio', originalFin.toISOString())
        .lte('inicio', diaFin.toISOString())
        .neq('id', cita.id)
        .neq('estado', CITA_STATUS.CANCELADA)
        .neq('estado', CITA_STATUS.HISTORICA)
        .eq('oculta_en_calendario', false);

      if (siguientes && siguientes.length > 0) {
        const delayMin = Math.round(delayMs / 60000);
        Alert.alert(
          'Cita extendida',
          `La cita se ha alargado ${delayMin} min. Hay ${siguientes.length} cita${siguientes.length > 1 ? 's' : ''} siguiente${siguientes.length > 1 ? 's' : ''} que pueden verse afectadas. Desplazarlas tambien?`,
          [
            { text: 'No', style: 'cancel', onPress: () => setSaving(false) },
            {
              text: 'Si, desplazar',
              onPress: async () => {
                for (const sig of siguientes as any[]) {
                  const p: any = {
                    inicio: new Date(new Date(sig.inicio).getTime() + delayMs).toISOString(),
                    fin: new Date(new Date(sig.fin).getTime() + delayMs).toISOString(),
                  };
                  if (sig.fin_activa) p.fin_activa = new Date(new Date(sig.fin_activa).getTime() + delayMs).toISOString();
                  if (sig.fin_espera) p.fin_espera = new Date(new Date(sig.fin_espera).getTime() + delayMs).toISOString();
                  await supabase.from('citas').update(p).eq('id', sig.id);
                }
                setSaving(false);
              },
            },
          ]
        );
        return;
      }
    }

    setSaving(false);
    setExtOpen(false);
  }

  return (
    <View style={{ gap: spacing.sm }}>

      {/* Mover cita */}
      <TouchableOpacity
        onPress={() => { setMoveOpen(v => !v); setExtOpen(false); }}
        style={[s.formulaToggle, { backgroundColor: '#6366f112', borderColor: '#6366f140' }]}
      >
        <Ionicons name="arrow-forward-circle-outline" size={18} color="#6366f1" />
        <View style={{ flex: 1 }}>
          <TText style={[s.sectionTitle, { color: c.text, fontWeight: fontWeight.semibold }]}>Cambiar hora de inicio</TText>
          <TText style={[s.formulaSub, { color: c.textTertiary }]}>Duracion se mantiene ({durTotalMin} min)</TText>
        </View>
        <Ionicons name={moveOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSecondary} />
      </TouchableOpacity>

      {moveOpen && (
        <View style={[s.formulaBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ gap: 6 }}>
            <TText style={{ fontSize: fontSize.xs, color: c.textSecondary, fontWeight: fontWeight.medium }}>Nueva hora de inicio</TText>
            <TTextInput
              value={horaIn}
              onChangeText={v => { setHoraIn(v); setMoveError(''); }}
              placeholder="HH:mm"
              keyboardType="numbers-and-punctuation"
              style={{
                backgroundColor: c.bg,
                borderColor: moveError ? '#ef4444' : c.border,
                borderWidth: 1,
                borderRadius: radius.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: 10,
                color: c.text,
                fontSize: fontSize.md,
                textAlign: 'center',
              }}
            />
          </View>
          {!!moveError && (
            <TText style={{ fontSize: fontSize.sm, color: '#ef4444' }}>{moveError}</TText>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              onPress={() => { setMoveOpen(false); setHoraIn(inicioFmt); setMoveError(''); }}
              disabled={saving}
              style={[s.formulaEditBtn, { borderColor: c.border, flex: 1 }]}
            >
              <TText style={[s.formulaEditBtnText, { color: c.textSecondary }]}>Cancelar</TText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMover}
              disabled={saving}
              style={[s.formulaSaveBtn, { flex: 1, backgroundColor: '#6366f1' }, saving && { opacity: 0.6 }]}
            >
              <TText style={s.formulaSaveBtnText}>{saving ? '...' : 'Mover'}</TText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Ajustar duracion */}
      <TouchableOpacity
        onPress={() => { setExtOpen(v => !v); setMoveOpen(false); }}
        style={[s.formulaToggle, { backgroundColor: '#10b98112', borderColor: '#10b98140' }]}
      >
        <Ionicons name="time-outline" size={18} color="#10b981" />
        <View style={{ flex: 1 }}>
          <TText style={[s.sectionTitle, { color: c.text, fontWeight: fontWeight.semibold }]}>Ajustar duracion</TText>
          <TText style={[s.formulaSub, { color: c.textTertiary }]}>{activo} + {espera} + {activo2} min</TText>
        </View>
        <Ionicons name={extOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSecondary} />
      </TouchableOpacity>

      {extOpen && (
        <View style={[s.formulaBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <DuracionStep label="Tiempo activo 1" value={activo} onChange={setActivo} min={5} c={c} />
          <DuracionStep label="Tiempo de reposo" value={espera} onChange={setEspera} min={0} c={c} />
          <DuracionStep label="Tiempo activo 2" value={activo2} onChange={setActivo2} min={0} c={c} />
          <TText style={{ fontSize: fontSize.xs, color: '#10b981', textAlign: 'center' }}>
            Total: {activo + espera + activo2} min
          </TText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              onPress={() => { setExtOpen(false); setActivo(initActivo); setEspera(initEspera); setActivo2(initActivo2); }}
              disabled={saving}
              style={[s.formulaEditBtn, { borderColor: c.border, flex: 1 }]}
            >
              <TText style={[s.formulaEditBtnText, { color: c.textSecondary }]}>Cancelar</TText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAjustar}
              disabled={saving}
              style={[s.formulaSaveBtn, { flex: 1 }, saving && { opacity: 0.6 }]}
            >
              <TText style={s.formulaSaveBtnText}>{saving ? '...' : 'Aplicar'}</TText>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function DuracionStep({ label, value, onChange, min, c }: {
  label: string; value: number; onChange: (v: number) => void; min: number; c: any;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <TText style={{ fontSize: fontSize.sm, color: c.textSecondary, flex: 1 }}>{label}</TText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <TouchableOpacity
          onPress={() => onChange(Math.max(min, value - 5))}
          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <TText style={{ fontSize: fontSize.md, color: c.textSecondary, lineHeight: 20 }}>-</TText>
        </TouchableOpacity>
        <TText style={{ fontSize: fontSize.sm, color: c.text, fontWeight: fontWeight.semibold, minWidth: 48, textAlign: 'center' }}>{value} min</TText>
        <TouchableOpacity
          onPress={() => onChange(value + 5)}
          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <TText style={{ fontSize: fontSize.md, color: c.textSecondary, lineHeight: 20 }}>+</TText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  estadoDot: { width: 8, height: 8, borderRadius: 4 },
  estadoText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md },
  rowLabel: { fontSize: fontSize.xs, marginBottom: 2 },
  rowValue: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  rowSub: { fontSize: fontSize.sm, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  estadosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  estadoBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  estadoBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm },
  cancelBtnText: { color: '#ef4444', fontSize: fontSize.md, fontWeight: fontWeight.medium },
  formulaToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  formulaSub: { fontSize: fontSize.xs, marginTop: 2 },
  formulaBox: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: spacing.md },
  formulaEditBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1 },
  formulaEditBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  formulaSaveBtn: { flex: 1, backgroundColor: '#8b5cf6', paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  formulaSaveBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  panel: { width: 480, maxHeight: '85%' as any, borderRadius: 20, overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1 },
  panelTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dialogOverlay: { position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  dialog: { width: '80%', maxWidth: 320, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  dialogTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  dialogMessage: { fontSize: fontSize.sm, lineHeight: 20 },
  dialogButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  dialogBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1 },
  dialogBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  dialogBtnDanger: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  dialogBtnDangerText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.medium },
  dialogLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginTop: spacing.md, marginBottom: spacing.xs },
  canceladoPorRow: { flexDirection: 'row', gap: spacing.sm },
  canceladoPorBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  canceladoPorBtnActive: { backgroundColor: 'rgba(99,102,241,0.1)' },
  canceladoPorBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  motivoInput: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, fontSize: fontSize.sm, minHeight: 60, textAlignVertical: 'top', marginBottom: spacing.xs },
});
