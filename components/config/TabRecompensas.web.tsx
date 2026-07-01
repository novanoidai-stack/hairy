// Tab de Recompensas para Configuración
// Sistema de fidelización: recompensas, niveles y logros
//
// Basado en el patrón de configuracion.web.tsx
// Usa componentes de SettingsAtoms
// Móvil primero, sin emojis, validación de formularios

import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import {
  Section, FieldRow, FieldStack, Toggle, NumberInput, STextInput, SSelect,
  Badge, Btn, IconBtn, SettingsIcon,
} from '@/components/ui/SettingsAtoms';

const T = DESIGN_TOKENS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Recompensa {
  id?: string;
  nombre: string;
  descripcion?: string;
  tipo: 'descuento_pct' | 'descuento_eur' | 'producto_gratis' | 'servicio_gratis';
  valor?: number | string;
  umbral_visitas: number;
  expira_meses?: number;
  activo: boolean;
}

interface Nivel {
  id: string;
  nombre: string;
  umbral_visitas?: number;
  umbral_gastado?: number;
  color: string;
  orden: number;
}

interface Logro {
  id: string;
  nombre: string;
  tipo: 'visitas' | 'gasto' | 'referidos' | 'custom';
  condicion_json: string;
  orden: number;
  activo: boolean;
}

// ---------------------------------------------------------------------------
// Componente principal: TabRecompensas
// ---------------------------------------------------------------------------

interface TabRecompensasProps {
  negocioId: string;
}

export function TabRecompensas({ negocioId }: TabRecompensasProps) {
  const { isMobile } = useResponsive();

  // Estado de recompensas
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [editRecompensa, setEditRecompensa] = useState<Recompensa | null>(null);
  const [loadingRecompensas, setLoadingRecompensas] = useState(true);

  // Estado de niveles
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [editNivel, setEditNivel] = useState<Nivel | null>(null);
  const [loadingNiveles, setLoadingNiveles] = useState(true);

  // Estado de logros
  const [logros, setLogros] = useState<Logro[]>([]);
  const [editLogro, setEditLogro] = useState<Logro | null>(null);
  const [loadingLogros, setLoadingLogros] = useState(true);

  // Estados de guardado
  const [saving, setSaving] = useState(false);

  // Búsqueda
  const [searchRecompensa, setSearchRecompensa] = useState('');

  // Cargar datos
  useEffect(() => {
    if (!negocioId) return;

    Promise.all([
      cargarRecompensas(),
      cargarNiveles(),
      cargarLogros(),
    ]);
  }, [negocioId]);

  // ---------------------------------------------------------------------------
  // Cargar datos
  // ---------------------------------------------------------------------------

  const cargarRecompensas = useCallback(async () => {
    if (!negocioId) return;
    setLoadingRecompensas(true);
    try {
      const { data, error } = await supabase
        .from('recompensas')
        .select('*')
        .eq('negocio_id', negocioId)
        .order('umbral_visitas', { ascending: true });

      if (error) throw error;
      setRecompensas(data || []);
    } catch (e) {
      console.error('Error cargando recompensas:', e);
    } finally {
      setLoadingRecompensas(false);
    }
  }, [negocioId]);

  const cargarNiveles = useCallback(async () => {
    if (!negocioId) return;
    setLoadingNiveles(true);
    try {
      const { data, error } = await supabase
        .from('niveles_fidelizacion')
        .select('*')
        .eq('negocio_id', negocioId)
        .order('orden', { ascending: true });

      if (error) throw error;
      // La BD guarda el umbral de gasto en centimos; el formulario trabaja en euros.
      setNiveles((data || []).map((n: any) => ({
        ...n,
        umbral_gastado: n.umbral_gastado_cents != null ? n.umbral_gastado_cents / 100 : undefined,
      })));
    } catch (e) {
      console.error('Error cargando niveles:', e);
    } finally {
      setLoadingNiveles(false);
    }
  }, [negocioId]);

  const cargarLogros = useCallback(async () => {
    if (!negocioId) return;
    setLoadingLogros(true);
    try {
      const { data, error } = await supabase
        .from('logros')
        .select('*')
        .eq('negocio_id', negocioId)
        .order('orden', { ascending: true });

      if (error) throw error;
      // La BD guarda 'condicion' como jsonb; el formulario lo edita como texto JSON.
      setLogros((data || []).map((l: any) => ({
        ...l,
        condicion_json: typeof l.condicion === 'string' ? l.condicion : JSON.stringify(l.condicion ?? {}),
      })));
    } catch (e) {
      console.error('Error cargando logros:', e);
    } finally {
      setLoadingLogros(false);
    }
  }, [negocioId]);

  // ---------------------------------------------------------------------------
  // Handlers de recompensas
  // ---------------------------------------------------------------------------

  const handleSaveRecompensa = useCallback(async (recompensa: Recompensa) => {
    if (!negocioId) return;
    setSaving(true);
    try {
      const payload = {
        negocio_id: negocioId,
        nombre: recompensa.nombre,
        descripcion: recompensa.descripcion || null,
        tipo: recompensa.tipo,
        valor: recompensa.valor || null,
        umbral_visitas: recompensa.umbral_visitas,
        expira_meses: recompensa.expira_meses || null,
        activo: recompensa.activo,
      };

      let error;
      if (recompensa.id) {
        const result = await supabase
          .from('recompensas')
          .update(payload)
          .eq('id', recompensa.id);
        error = result.error;
      } else {
        const result = await supabase
          .from('recompensas')
          .insert(payload)
          .select()
          .single();
        error = result.error;
      }

      if (error) throw error;

      await cargarRecompensas();
      setEditRecompensa(null);
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo guardar la recompensa.'));
    } finally {
      setSaving(false);
    }
  }, [negocioId, cargarRecompensas]);

  const handleDeleteRecompensa = useCallback(async (id: string) => {
    if (!negocioId) return;
    const ok = window.confirm('¿Eliminar esta recompensa? Esta acción no se puede deshacer.');
    if (!ok) return;

    try {
      const { error } = await supabase
        .from('recompensas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRecompensas(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo eliminar la recompensa.'));
    }
  }, [negocioId]);

  const handleToggleRecompensa = useCallback(async (recompensa: Recompensa) => {
    if (!recompensa.id || !negocioId) return;
    try {
      const { error } = await supabase
        .from('recompensas')
        .update({ activo: !recompensa.activo })
        .eq('id', recompensa.id);

      if (error) throw error;
      setRecompensas(prev => prev.map(r => r.id === recompensa.id ? { ...r, activo: !r.activo } : r));
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo actualizar la recompensa.'));
    }
  }, [negocioId]);

  // ---------------------------------------------------------------------------
  // Handlers de niveles
  // ---------------------------------------------------------------------------

  const handleSaveNivel = useCallback(async (nivel: Nivel) => {
    if (!negocioId) return;
    setSaving(true);
    try {
      const payload = {
        negocio_id: negocioId,
        nombre: nivel.nombre,
        umbral_visitas: nivel.umbral_visitas || null,
        umbral_gastado_cents: nivel.umbral_gastado ? Math.round(nivel.umbral_gastado * 100) : null,
        color: nivel.color,
        orden: nivel.orden,
      };

      let error;
      if (nivel.id) {
        const result = await supabase
          .from('niveles_fidelizacion')
          .update(payload)
          .eq('id', nivel.id);
        error = result.error;
      } else {
        const result = await supabase
          .from('niveles_fidelizacion')
          .insert(payload)
          .select()
          .single();
        error = result.error;
      }

      if (error) throw error;

      await cargarNiveles();
      setEditNivel(null);
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo guardar el nivel.'));
    } finally {
      setSaving(false);
    }
  }, [negocioId, cargarNiveles]);

  const handleDeleteNivel = useCallback(async (id: string) => {
    if (!negocioId) return;
    const ok = window.confirm('¿Eliminar este nivel? Esta acción no se puede deshacer.');
    if (!ok) return;

    try {
      const { error } = await supabase
        .from('niveles_fidelizacion')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setNiveles(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo eliminar el nivel.'));
    }
  }, [negocioId]);

  const handleReorderNiveles = useCallback(async (orderedIds: string[]) => {
    setNiveles(prev => {
      const byId = new Map(prev.map(n => [n.id, n]));
      return orderedIds.map((id, i) => ({ ...byId.get(id)!, orden: i }));
    });

    try {
      await Promise.all(orderedIds.map((id, i) =>
        supabase.from('niveles_fidelizacion').update({ orden: i }).eq('id', id)
      ));
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo reordenar los niveles.'));
      await cargarNiveles();
    }
  }, [cargarNiveles]);

  // ---------------------------------------------------------------------------
  // Handlers de logros
  // ---------------------------------------------------------------------------

  const handleSaveLogro = useCallback(async (logro: Logro) => {
    if (!negocioId) return;
    setSaving(true);
    try {
      let condicionParsed: any = {};
      try { condicionParsed = JSON.parse(logro.condicion_json || '{}'); } catch { condicionParsed = {}; }
      const payload = {
        negocio_id: negocioId,
        nombre: logro.nombre,
        tipo: logro.tipo,
        condicion: condicionParsed,
        orden: logro.orden,
        activo: logro.activo,
      };

      let error;
      if (logro.id) {
        const result = await supabase
          .from('logros')
          .update(payload)
          .eq('id', logro.id);
        error = result.error;
      } else {
        const result = await supabase
          .from('logros')
          .insert(payload)
          .select()
          .single();
        error = result.error;
      }

      if (error) throw error;

      await cargarLogros();
      setEditLogro(null);
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo guardar el logro.'));
    } finally {
      setSaving(false);
    }
  }, [negocioId, cargarLogros]);

  const handleDeleteLogro = useCallback(async (id: string) => {
    if (!negocioId) return;
    const ok = window.confirm('¿Eliminar este logro? Esta acción no se puede deshacer.');
    if (!ok) return;

    try {
      const { error } = await supabase
        .from('logros')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setLogros(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo eliminar el logro.'));
    }
  }, [negocioId]);

  // ---------------------------------------------------------------------------
  // Filtrado de recompensas
  // ---------------------------------------------------------------------------

  const recompensasFiltradas = useMemo(() => {
    if (!searchRecompensa.trim()) return recompensas;
    const q = searchRecompensa.toLowerCase();
    return recompensas.filter(r =>
      r.nombre.toLowerCase().includes(q) ||
      (r.descripcion && r.descripcion.toLowerCase().includes(q))
    );
  }, [recompensas, searchRecompensa]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Sección de Recompensas */}
      <Section
        title="Recompensas"
        desc="Beneficios que desbloquean tus clientes según su fidelización. Se asignan automáticamente al alcanzar el umbral de visitas."
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge>{recompensasFiltradas.length}</Badge>
            <Btn variant="primary" size="md" icon="plus" onClick={() => setEditRecompensa({
              nombre: '',
              tipo: 'descuento_pct',
              valor: 10,
              umbral_visitas: 5,
              activo: true,
            })}>
              Añadir recompensa
            </Btn>
          </div>
        }
      >
        {/* Búsqueda */}
        <div style={{ marginBottom: 14 }}>
          <STextInput
            value={searchRecompensa}
            onChange={setSearchRecompensa}
            placeholder="Buscar recompensa..."
            width={300}
            leadingIcon="search"
          />
        </div>

        {/* Lista de recompensas */}
        {loadingRecompensas ? (
          <div style={{ fontSize: 13, color: T.textTertiary, padding: '8px 0' }}>
            Cargando recompensas...
          </div>
        ) : recompensasFiltradas.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textTertiary, padding: '8px 0' }}>
            {searchRecompensa ? 'No hay recompensas que coincidan con la búsqueda.' : 'Aún no has creado ninguna recompensa.'}
          </div>
        ) : (
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {recompensasFiltradas.map((r, i, arr) => (
              <div
                key={r.id}
                style={{
                  display: isMobile ? 'flex' : 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 140px 120px 80px 80px 80px',
                  padding: '14px 16px',
                  alignItems: 'center',
                  borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none',
                  gap: isMobile ? 8 : 0,
                  transition: 'background 0.2s',
                  flexWrap: isMobile ? 'wrap' : 'nowrap',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(244,80,30,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* Nombre y descripción */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: r.activo ? T.text : T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nombre}
                  </div>
                  {r.descripcion && (
                    <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.descripcion}
                    </div>
                  )}
                </div>

                {/* Tipo */}
                <div style={{ fontSize: 11.5, color: T.textSecondary }}>
                  {TIPO_LABEL[r.tipo]}
                </div>

                {/* Valor */}
                <div style={{ fontSize: 12, fontWeight: 600, color: T.primaryHi }}>
                  {formatValorRecompensa(r)}
                </div>

                {/* Umbral */}
                <div style={{ fontSize: 11, color: T.textTertiary }}>
                  {r.umbral_visitas} visita{r.umbral_visitas !== 1 ? 's' : ''}
                </div>

                {/* Toggle */}
                <Toggle
                  on={r.activo}
                  onChange={() => handleToggleRecompensa(r)}
                />

                {/* Acciones */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <IconBtn icon="edit" size={28} onClick={() => setEditRecompensa(r)} title="Editar" />
                  <IconBtn icon="trash" size={28} tone="danger" onClick={() => r.id && handleDeleteRecompensa(r.id)} title="Eliminar" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Sección de Niveles */}
      <Section
        title="Niveles de fidelización"
        desc="Categorías de cliente según su historial. El nivel se asigna automáticamente y puede usarse para segmentar promociones."
        action={
          <Btn variant="primary" size="md" icon="plus" onClick={() => setEditNivel({
            id: '',
            nombre: '',
            umbral_visitas: 0,
            umbral_gastado: 0,
            color: T.primary,
            orden: niveles.length,
          })}>
            Añadir nivel
          </Btn>
        }
      >
        {loadingNiveles ? (
          <div style={{ fontSize: 13, color: T.textTertiary, padding: '8px 0' }}>
            Cargando niveles...
          </div>
        ) : niveles.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textTertiary, padding: '8px 0' }}>
            Aún no has creado ningún nivel.
          </div>
        ) : (
          <NivelesList
            niveles={niveles}
            onEdit={setEditNivel}
            onDelete={handleDeleteNivel}
            onReorder={handleReorderNiveles}
          />
        )}
      </Section>

      {/* Sección de Logros */}
      <Section
        title="Logros desbloqueables"
        desc="Badges y méritos especiales que los clientes pueden desbloquear. Se muestran en su perfil y pueden compartirse."
        action={
          <Btn variant="primary" size="md" icon="plus" onClick={() => setEditLogro({
            id: '',
            nombre: '',
            tipo: 'visitas',
            condicion_json: '{}',
            orden: logros.length,
            activo: true,
          })}>
            Añadir logro
          </Btn>
        }
      >
        {loadingLogros ? (
          <div style={{ fontSize: 13, color: T.textTertiary, padding: '8px 0' }}>
            Cargando logros...
          </div>
        ) : logros.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textTertiary, padding: '8px 0' }}>
            Aún no has creado ningún logro.
          </div>
        ) : (
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {logros.map((l, i, arr) => (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(244,80,30,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: l.activo ? T.text : T.textMuted }}>
                      {l.nombre}
                    </div>
                    <Badge tone={l.activo ? 'success' : 'neutral'}>
                      {LOGRO_TIPO_LABEL[l.tipo]}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>
                    Condición: <code style={{ background: T.bg, padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>{l.condicion_json}</code>
                  </div>
                </div>

                <Toggle on={l.activo} onChange={async () => {
                  if (!negocioId || !l.id) return;
                  try {
                    await supabase.from('logros').update({ activo: !l.activo }).eq('id', l.id);
                    setLogros(prev => prev.map(x => x.id === l.id ? { ...x, activo: !x.activo } : x));
                  } catch (e) {
                    alert(mensajeDeError(e));
                  }
                }} />

                <div style={{ display: 'flex', gap: 4 }}>
                  <IconBtn icon="edit" size={28} onClick={() => setEditLogro(l)} title="Editar" />
                  <IconBtn icon="trash" size={28} tone="danger" onClick={() => l.id && handleDeleteLogro(l.id)} title="Eliminar" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Modales */}
      {editRecompensa && (
        <ModalRecompensa
          recompensa={editRecompensa}
          onClose={() => setEditRecompensa(null)}
          onSave={handleSaveRecompensa}
          saving={saving}
        />
      )}

      {editNivel && (
        <ModalNivel
          nivel={editNivel}
          onClose={() => setEditNivel(null)}
          onSave={handleSaveNivel}
          saving={saving}
        />
      )}

      {editLogro && (
        <ModalLogro
          logro={editLogro}
          onClose={() => setEditLogro(null)}
          onSave={handleSaveLogro}
          saving={saving}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Componentes auxiliares
// ---------------------------------------------------------------------------

const TIPO_LABEL: Record<string, string> = {
  descuento_pct: 'Descuento %',
  descuento_eur: 'Descuento €',
  producto_gratis: 'Producto gratis',
  servicio_gratis: 'Servicio gratis',
};

const LOGRO_TIPO_LABEL: Record<string, string> = {
  visitas: 'Visitas',
  gasto: 'Gasto',
  referidos: 'Referidos',
  custom: 'Personalizado',
};

function formatValorRecompensa(r: Recompensa): string {
  switch (r.tipo) {
    case 'descuento_pct':
      return `-${r.valor}%`;
    case 'descuento_eur':
      return `-${r.valor}€`;
    case 'producto_gratis':
    case 'servicio_gratis':
      return typeof r.valor === 'string' ? r.valor : 'Gratis';
    default:
      return '--';
  }
}

// ---------------------------------------------------------------------------
// NivelesList (con drag & drop simulado)
// ---------------------------------------------------------------------------

interface NivelesListProps {
  niveles: Nivel[];
  onEdit: (n: Nivel) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

function NivelesList({ niveles, onEdit, onDelete, onReorder }: NivelesListProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const { isMobile } = useResponsive();

  const handleDragStart = (id: string) => {
    setDragging(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (dragging === targetId || dragging === null) return;

    const newOrder = [...niveles];
    const fromIdx = newOrder.findIndex(n => n.id === dragging);
    const toIdx = newOrder.findIndex(n => n.id === targetId);

    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);

    onReorder(newOrder.map(n => n.id));
    setDragging(targetId);
  };

  const handleDragEnd = () => {
    setDragging(null);
  };

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
      {niveles.map((n, i, arr) => (
        <div
          key={n.id}
          draggable
          onDragStart={() => handleDragStart(n.id)}
          onDragOver={(e) => handleDragOver(e, n.id)}
          onDragEnd={handleDragEnd}
          style={{
            display: isMobile ? 'flex' : 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '40px 1fr 140px 140px 80px',
            padding: '12px 16px',
            alignItems: 'center',
            borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none',
            gap: isMobile ? 8 : 0,
            cursor: 'grab',
            transition: 'background 0.2s',
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            opacity: dragging === n.id ? 0.5 : 1,
          }}
          onMouseEnter={e => {
            if (dragging !== n.id) (e.currentTarget as HTMLElement).style.background = 'rgba(244,80,30,0.04)';
          }}
          onMouseLeave={e => {
            if (dragging !== n.id) (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          {/* Drag handle */}
          {!isMobile && (
            <div style={{ display: 'grid', placeItems: 'center', color: T.textTertiary }}>
              <SettingsIcon name="reorderFour" size={16} />
            </div>
          )}

          {/* Nombre con color */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: n.color,
                flexShrink: 0,
              }}
            />
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.nombre}
            </div>
          </div>

          {/* Umbral visitas */}
          <div style={{ fontSize: 11.5, color: T.textSecondary }}>
            {n.umbral_visitas != null ? `${n.umbral_visitas} visita${n.umbral_visitas !== 1 ? 's' : ''}` : '--'}
          </div>

          {/* Umbral gastado */}
          <div style={{ fontSize: 11.5, color: T.textSecondary }}>
            {n.umbral_gastado != null ? `${n.umbral_gastado}€` : '--'}
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <IconBtn icon="edit" size={26} onClick={() => onEdit(n)} title="Editar" />
            <IconBtn icon="trash" size={26} tone="danger" onClick={() => onDelete(n.id)} title="Eliminar" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModalRecompensa
// ---------------------------------------------------------------------------

interface ModalRecompensaProps {
  recompensa: Recompensa;
  onClose: () => void;
  onSave: (r: Recompensa) => void;
  saving: boolean;
}

function ModalRecompensa({ recompensa, onClose, onSave, saving }: ModalRecompensaProps) {
  const [form, setForm] = useState<Recompensa>(recompensa);
  const [error, setError] = useState('');
  const { isMobile } = useResponsive();

  useEffect(() => {
    setForm(recompensa);
  }, [recompensa]);

  const handleSubmit = () => {
    setError('');

    // Validación
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (form.umbral_visitas < 1) {
      setError('El umbral de visitas debe ser al menos 1.');
      return;
    }
    if ((form.tipo === 'descuento_pct' || form.tipo === 'descuento_eur') && (form.valor === undefined || form.valor === null || Number(form.valor) <= 0)) {
      setError('El valor es obligatorio para descuentos.');
      return;
    }

    onSave(form);
  };

  const handleTipoChange = (tipo: Recompensa['tipo']) => {
    setForm({
      ...form,
      tipo,
      valor: tipo === 'descuento_pct' ? 10 : (tipo === 'descuento_eur' ? 5 : ''),
    });
  };

  return (
    <div style={{
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(28,24,20,0.65)',
      display: 'grid',
      placeItems: 'center',
      zIndex: 100,
      padding: isMobile ? 16 : 0,
    }} onClick={onClose}>
      <div
        style={{
          background: T.bgCard,
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto' as const,
          boxShadow: '0 25px 60px rgba(28,24,20,0.35)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>
              {recompensa.id ? 'Editar recompensa' : 'Nueva recompensa'}
            </h2>
            <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
              Beneficio por fidelización
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'transparent', border: 'none',
              color: T.textSecondary, cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
          >
            <SettingsIcon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <FieldStack>
          <div style={{ padding: '18px 24px' }}>
            <FieldRow label="Nombre" htmlFor="rec-nombre">
              <STextInput
                value={form.nombre}
                onChange={v => setForm({ ...form, nombre: v })}
                placeholder="Ej. 10% de descuento"
                width="100%"
              />
            </FieldRow>

            <FieldRow label="Descripción" htmlFor="rec-desc">
              <STextInput
                value={form.descripcion || ''}
                onChange={v => setForm({ ...form, descripcion: v })}
                placeholder="Opcional: detalles del beneficio"
                width="100%"
              />
            </FieldRow>

            <FieldRow label="Tipo de recompensa">
              <SSelect
                value={form.tipo}
                onChange={handleTipoChange}
                options={[
                  { value: 'descuento_pct', label: 'Descuento porcentual' },
                  { value: 'descuento_eur', label: 'Descuento en euros' },
                  { value: 'producto_gratis', label: 'Producto gratis' },
                  { value: 'servicio_gratis', label: 'Servicio gratis' },
                ]}
                width="100%"
              />
            </FieldRow>

            {(form.tipo === 'descuento_pct' || form.tipo === 'descuento_eur') && (
              <FieldRow
                label={form.tipo === 'descuento_pct' ? 'Porcentaje de descuento' : 'Descuento en euros'}
                htmlFor="rec-valor"
              >
                <NumberInput
                  value={Number(form.valor) || 0}
                  onChange={v => setForm({ ...form, valor: v })}
                  unit={form.tipo === 'descuento_pct' ? '%' : '€'}
                  min={1}
                  max={form.tipo === 'descuento_pct' ? 100 : 500}
                  width={200}
                />
              </FieldRow>
            )}

            {(form.tipo === 'producto_gratis' || form.tipo === 'servicio_gratis') && (
              <FieldRow label="Nombre del producto/servicio" htmlFor="rec-valor">
                <STextInput
                  value={String(form.valor || '')}
                  onChange={v => setForm({ ...form, valor: v })}
                  placeholder="Ej. Corte de pelo, Tratamiento hidratante..."
                  width="100%"
                />
              </FieldRow>
            )}

            <FieldRow label="Umbral de visitas" htmlFor="rec-umbral">
              <NumberInput
                value={form.umbral_visitas}
                onChange={v => setForm({ ...form, umbral_visitas: typeof v === 'number' ? v : parseInt(String(v), 10) || 1 })}
                unit="visitas"
                min={1}
                max={100}
                width={140}
              />
            </FieldRow>

            <FieldRow label="Expiración (meses)" htmlFor="rec-exp">
              <NumberInput
                value={form.expira_meses || 0}
                onChange={v => setForm({ ...form, expira_meses: typeof v === 'number' ? (v || undefined) : undefined })}
                unit="meses"
                min={0}
                max={24}
                width={140}
              />
              <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: 10 }}>
                0 = no expira
              </span>
            </FieldRow>

            <FieldRow label="Activa">
              <Toggle
                on={form.activo}
                onChange={v => setForm({ ...form, activo: v })}
                label={form.activo ? 'Disponible para clientes' : 'Oculta'}
              />
            </FieldRow>
          </div>
        </FieldStack>

        {/* Error */}
        {error && (
          <div style={{
            margin: '0 24px',
            padding: '10px 12px',
            background: 'rgba(226,59,52,0.10)',
            border: '1px solid rgba(226,59,52,0.30)',
            borderRadius: 10,
            fontSize: 12,
            color: T.danger,
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
        }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={saving} icon="check">
            {saving ? 'Guardando...' : 'Guardar recompensa'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModalNivel
// ---------------------------------------------------------------------------

interface ModalNivelProps {
  nivel: Nivel;
  onClose: () => void;
  onSave: (n: Nivel) => void;
  saving: boolean;
}

function ModalNivel({ nivel, onClose, onSave, saving }: ModalNivelProps) {
  const [form, setForm] = useState<Nivel>(nivel);
  const [error, setError] = useState('');
  const { isMobile } = useResponsive();

  useEffect(() => {
    setForm(nivel);
  }, [nivel]);

  const handleSubmit = () => {
    setError('');

    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (form.umbral_visitas === 0 && form.umbral_gastado === 0) {
      setError('Debes definir al menos un umbral (visitas o gastado).');
      return;
    }

    onSave(form);
  };

  const COLORES = [
    { v: '#f4501e', name: 'Fuego' },
    { v: '#10b981', name: 'Verde' },
    { v: '#3b82f6', name: 'Azul' },
    { v: '#8b5cf6', name: 'Violeta' },
    { v: '#ec4899', name: 'Rosa' },
    { v: '#f59e0b', name: 'Ambar' },
  ];

  return (
    <div style={{
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(28,24,20,0.65)',
      display: 'grid',
      placeItems: 'center',
      zIndex: 100,
      padding: isMobile ? 16 : 0,
    }} onClick={onClose}>
      <div
        style={{
          background: T.bgCard,
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflowY: 'auto' as const,
          boxShadow: '0 25px 60px rgba(28,24,20,0.35)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>
              {nivel.id ? 'Editar nivel' : 'Nuevo nivel'}
            </h2>
            <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
              Categoría de fidelización
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 'none',
            color: T.textSecondary, cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}>
            <SettingsIcon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <FieldStack>
          <div style={{ padding: '18px 24px' }}>
            <FieldRow label="Nombre del nivel" htmlFor="niv-nombre">
              <STextInput
                value={form.nombre}
                onChange={v => setForm({ ...form, nombre: v })}
                placeholder="Ej. VIP, Oro, Habitual..."
                width="100%"
              />
            </FieldRow>

            <FieldRow label="Umbral de visitas" htmlFor="niv-visitas">
              <NumberInput
                value={form.umbral_visitas || 0}
                onChange={v => setForm({ ...form, umbral_visitas: typeof v === 'number' ? v : parseInt(String(v), 10) || 0 })}
                unit="visitas"
                min={0}
                max={100}
                width={140}
              />
            </FieldRow>

            <FieldRow label="Umbral de gasto" htmlFor="niv-gasto">
              <NumberInput
                value={form.umbral_gastado || 0}
                onChange={v => setForm({ ...form, umbral_gastado: typeof v === 'number' ? v : parseInt(String(v), 10) || 0 })}
                unit="€"
                min={0}
                max={5000}
                width={140}
              />
            </FieldRow>

            <FieldRow label="Color del nivel">
              <div style={{ display: 'flex', gap: 8 }}>
                {COLORES.map(c => {
                  const active = form.color === c.v;
                  return (
                    <button
                      key={c.v}
                      title={c.name}
                      onClick={() => setForm({ ...form, color: c.v })}
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: c.v,
                        border: `2px solid ${active ? '#fff' : 'transparent'}`,
                        cursor: 'pointer',
                        boxShadow: active ? `0 0 0 2px ${T.bg}, 0 0 0 4px ${c.v}` : 'none',
                        display: 'grid', placeItems: 'center',
                      }}
                    >
                      {active && <SettingsIcon name="check" size={14} color="#fff" />}
                    </button>
                  );
                })}
              </div>
            </FieldRow>
          </div>
        </FieldStack>

        {/* Error */}
        {error && (
          <div style={{
            margin: '0 24px',
            padding: '10px 12px',
            background: 'rgba(226,59,52,0.10)',
            border: '1px solid rgba(226,59,52,0.30)',
            borderRadius: 10,
            fontSize: 12,
            color: T.danger,
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
        }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={saving} icon="check">
            {saving ? 'Guardando...' : 'Guardar nivel'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModalLogro
// ---------------------------------------------------------------------------

interface ModalLogroProps {
  logro: Logro;
  onClose: () => void;
  onSave: (l: Logro) => void;
  saving: boolean;
}

function ModalLogro({ logro, onClose, onSave, saving }: ModalLogroProps) {
  const [form, setForm] = useState<Logro>(logro);
  const [error, setError] = useState('');
  const { isMobile } = useResponsive();

  useEffect(() => {
    setForm(logro);
  }, [logro]);

  const handleSubmit = () => {
    setError('');

    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    try {
      JSON.parse(form.condicion_json);
    } catch {
      setError('La condición debe ser un JSON válido.');
      return;
    }

    onSave(form);
  };

  return (
    <div style={{
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(28,24,20,0.65)',
      display: 'grid',
      placeItems: 'center',
      zIndex: 100,
      padding: isMobile ? 16 : 0,
    }} onClick={onClose}>
      <div
        style={{
          background: T.bgCard,
          borderRadius: 16,
          width: '100%',
          maxWidth: 500,
          maxHeight: '90vh',
          overflowY: 'auto' as const,
          boxShadow: '0 25px 60px rgba(28,24,20,0.35)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>
              {logro.id ? 'Editar logro' : 'Nuevo logro'}
            </h2>
            <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
              Badge desbloqueable por clientes
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 'none',
            color: T.textSecondary, cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}>
            <SettingsIcon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <FieldStack>
          <div style={{ padding: '18px 24px' }}>
            <FieldRow label="Nombre del logro" htmlFor="log-nombre">
              <STextInput
                value={form.nombre}
                onChange={v => setForm({ ...form, nombre: v })}
                placeholder="Ej. Primera cita, 10 visitas, VIP..."
                width="100%"
              />
            </FieldRow>

            <FieldRow label="Tipo de condición">
              <SSelect
                value={form.tipo}
                onChange={v => setForm({ ...form, tipo: v as Logro['tipo'] })}
                options={[
                  { value: 'visitas', label: 'Por número de visitas' },
                  { value: 'gasto', label: 'Por cantidad gastada' },
                  { value: 'referidos', label: 'Por referidos' },
                  { value: 'custom', label: 'Personalizado' },
                ]}
                width="100%"
              />
            </FieldRow>

            <FieldRow
              label="Condición (JSON)"
              htmlFor="log-cond"
              hint='Ej: {"visitas": 10} o {"gasto_minimo": 500}'
            >
              <STextInput
                value={form.condicion_json}
                onChange={v => setForm({ ...form, condicion_json: v })}
                placeholder='{"visitas": 10}'
                width="100%"
                mono
              />
            </FieldRow>

            <FieldRow label="Activo">
              <Toggle
                on={form.activo}
                onChange={v => setForm({ ...form, activo: v })}
                label={form.activo ? 'Disponible' : 'Oculto'}
              />
            </FieldRow>
          </div>
        </FieldStack>

        {/* Error */}
        {error && (
          <div style={{
            margin: '0 24px',
            padding: '10px 12px',
            background: 'rgba(226,59,52,0.10)',
            border: '1px solid rgba(226,59,52,0.30)',
            borderRadius: 10,
            fontSize: 12,
            color: T.danger,
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
        }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={saving} icon="check">
            {saving ? 'Guardando...' : 'Guardar logro'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// Exportar componente por defecto para importación
export default TabRecompensas;
