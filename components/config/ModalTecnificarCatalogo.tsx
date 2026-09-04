import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { Btn, IconBtn } from '@/components/ui/SettingsAtoms';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { reportarError } from '@/lib/reportarError';

const T = DESIGN_TOKENS;

export interface ServicioCatalogo {
  id?: string;
  nombre: string;
  descripcion?: string | null;
  categoria_id?: string | null;
  duracion_activa_min?: number | null;
  duracion_espera_min?: number | null;
  recurso_tipo?: string | null;
  recurso_fase?: string | null;
  activo?: boolean;
}

// Una fase de la plantilla (servicios.fases). La forma es la que exige el CHECK
// servicios_fases_forma: el saneador de la edge ya la ha pasado, y aqui solo se
// puede retocar dentro de los mismos limites.
export interface FaseIA {
  tipo: 'activa' | 'reposo' | 'transicion';
  min: number;
  etiqueta?: string | null;
  recurso_tipo?: string | null;
}

export interface PropuestaIA {
  id: string;
  duracion_activa_min: number;
  duracion_espera_min: number;
  recurso_tipo: string | null;
  recurso_fase: string | null;
  fases?: FaseIA[] | null;
  confianza: string;
  motivo: string;
  seleccionada: boolean;
}

interface ModalTecnificarCatalogoProps {
  isOpen: boolean;
  negocioId: string;
  servicios: ServicioCatalogo[];
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}

const RECURSOS_OPTIONS = [
  { value: '', label: 'Sin recurso específico' },
  { value: 'lavacabezas', label: 'Lavacabezas (pila)' },
  { value: 'sillon', label: 'Sillón de tocador' },
  { value: 'cabina', label: 'Cabina cerrada' },
  { value: 'aparatologia', label: 'Aparatología' },
];

const FASES_OPTIONS = [
  { value: 'final', label: 'Fase final (tras reposo)' },
  { value: 'completa', label: 'Servicio completo' },
];

const TIPOS_FASE_OPTIONS = [
  { value: 'activa', label: 'Activa', color: '#c0260a', bg: 'rgba(244,80,30,0.10)' },
  { value: 'reposo', label: 'Reposo', color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { value: 'transicion', label: 'Transición', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
];

// Dos reposos seguidos son UN reposo mal escrito: el CHECK de la base de datos
// los rechaza, y la RPC rechazaria el servicio entero. Se avisa aqui, en la
// pantalla, antes de que la duena le de a guardar.
const fasesTienenDosRepososSeguidos = (fases: FaseIA[]) =>
  fases.some((f, i) => f.tipo === 'reposo' && fases[i - 1]?.tipo === 'reposo');

export function ModalTecnificarCatalogo({
  isOpen,
  negocioId: _negocioId,
  servicios,
  onClose,
  onApplied,
}: ModalTecnificarCatalogoProps) {
  const { isMobile } = useResponsive();
  const [paso, setPaso] = useState<'inicio' | 'analizando' | 'revision' | 'exito'>('inicio');
  const [incluirTodos, setIncluirTodos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [propuestas, setPropuestas] = useState<PropuestaIA[]>([]);
  const [descartadas, setDescartadas] = useState<{ id?: string; descartada: string }[]>([]);
  const [metaInfo, setMetaInfo] = useState<{ total: number; conReposo: number; analizados: number } | null>(null);
  const [aplicadosCount, setAplicadosCount] = useState(0);

  const serviciosMap = useMemo(() => new Map(servicios.filter(s => !!s.id).map((s) => [s.id!, s])), [servicios]);

  const sinReposoCount = useMemo(() => {
    return servicios.filter((s) => s.activo !== false && (!s.duracion_espera_min || s.duracion_espera_min <= 0)).length;
  }, [servicios]);

  if (!isOpen) return null;

  async function handleIniciarAnalisis(todos = incluirTodos) {
    setLoading(true);
    setErrorMsg(null);
    setPaso('analizando');

    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      if (!token) throw new Error('No hay sesión activa de usuario.');

      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/tecnificar-catalogo`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ incluir_todos: todos, desde: 0 }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error del servidor (${res.status})`);
      }

      const data = await res.json();
      const rawProps: PropuestaIA[] = (data.propuestas || []).map((p: any) => ({
        ...p,
        seleccionada: true,
      }));

      setPropuestas(rawProps);
      setDescartadas(data.descartadas || []);
      setMetaInfo({
        total: data.total_catalogo ?? servicios.length,
        conReposo: data.ya_con_reposo ?? 0,
        analizados: data.meta?.analizados ?? rawProps.length,
      });
      setPaso('revision');
    } catch (err: any) {
      reportarError(err, { origen: 'app', tipo: 'operativo' });
      setErrorMsg(err.message || 'No se pudo completar el análisis del catálogo.');
      setPaso('inicio');
    } finally {
      setLoading(false);
    }
  }

  function handleTogglePropuesta(id: string) {
    setPropuestas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, seleccionada: !p.seleccionada } : p))
    );
  }

  function handleSelectAll(sel: boolean) {
    setPropuestas((prev) => prev.map((p) => ({ ...p, seleccionada: sel })));
  }

  function handleUpdatePropuesta(id: string, fields: Partial<PropuestaIA>) {
    setPropuestas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...fields } : p))
    );
  }

  function handleUpdateFase(id: string, idx: number, fields: Partial<FaseIA>) {
    setPropuestas((prev) =>
      prev.map((p) =>
        p.id === id && p.fases
          ? { ...p, fases: p.fases.map((f, i) => (i === idx ? { ...f, ...fields } : f)) }
          : p
      )
    );
  }

  function handleRemoveFase(id: string, idx: number) {
    setPropuestas((prev) =>
      prev.map((p) => (p.id === id && p.fases ? { ...p, fases: p.fases.filter((_, i) => i !== idx) } : p))
    );
  }

  function handleAddFase(id: string) {
    setPropuestas((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, fases: [...(p.fases ?? []), { tipo: 'activa', min: 10, etiqueta: null }] }
          : p
      )
    );
  }

  // Plantilla on/off. Al desmarcar se envia null: borrar la plantilla deja el
  // servicio en el camino clasico de tres tramos. Al marcar sin secuencia
  // previa se siembra una basica desde los dos numeros.
  function handleTogglePlantilla(id: string) {
    setPropuestas((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.fases) return { ...p, fases: null };
        const reposo = Math.max(0, p.duracion_espera_min);
        const activa = Math.max(5, p.duracion_activa_min);
        return {
          ...p,
          fases: [
            { tipo: 'activa' as const, min: Math.max(5, activa - 15), etiqueta: 'Aplicación' },
            ...(reposo > 0 ? [{ tipo: 'reposo' as const, min: reposo }] : []),
            { tipo: 'activa' as const, min: 15, etiqueta: 'Lavado y peinado' },
          ],
        };
      })
    );
  }

  async function handleAplicarCambios() {
    const seleccionadas = propuestas.filter((p) => p.seleccionada);
    if (seleccionadas.length === 0) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const payload = seleccionadas.map((p) => ({
        id: p.id,
        duracion_activa_min: p.duracion_activa_min,
        duracion_espera_min: p.duracion_espera_min,
        recurso_tipo: p.recurso_tipo || null,
        recurso_fase: p.recurso_tipo ? (p.recurso_fase || 'final') : null,
        // fases: null = sin plantilla (y borra la que hubiera). Solo viaja la
        // secuencia que pasa las reglas de forma: si la edicion la ha dejado
        // coja, se envia null y el servicio se queda en el camino clasico en
        // vez de rechazarse entero en la RPC.
        fases: p.fases && p.fases.length > 0 && !fasesTienenDosRepososSeguidos(p.fases)
          ? p.fases.map((f) => ({
              tipo: f.tipo,
              min: Math.min(300, Math.max(1, Math.round(f.min) || 1)),
              etiqueta: f.etiqueta || null,
              recurso_tipo: f.recurso_tipo || null,
            }))
          : null,
      }));

      const { data, error } = await supabase.rpc('aplicar_tecnificacion_servicios', {
        p_cambios: payload,
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Error al aplicar cambios');

      setAplicadosCount(data.aplicados ?? seleccionadas.length);
      await onApplied();
      setPaso('exito');
    } catch (err: any) {
      reportarError(err, { origen: 'app', tipo: 'operativo' });
      setErrorMsg(err.message || 'Error al guardar los tiempos técnicos.');
    } finally {
      setLoading(false);
    }
  }

  const seleccionadasCount = propuestas.filter((p) => p.seleccionada).length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 12 : 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: paso === 'revision' ? 860 : 540,
          maxHeight: '90vh',
          backgroundColor: T.bgCard,
          borderRadius: 20,
          border: `1px solid ${T.borderHi}`,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? '16px 18px' : '20px 24px',
            borderBottom: `1px solid ${T.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(244,80,30,0.04) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #f4501e 0%, #ff7043 100%)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 18,
                boxShadow: '0 4px 12px rgba(244, 80, 30, 0.25)',
              }}
            >
              ⚡
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 18, fontWeight: 700, color: T.text }}>
                Técnificador de Catálogo con IA
              </h2>
              <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
                Fases activas, tiempos de reposo químico y recursos físicos
              </div>
            </div>
          </div>
          <IconBtn icon="x" size={32} onClick={onClose} title="Cerrar" />
        </div>

        {/* Content */}
        <div style={{ padding: isMobile ? 16 : 24, overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#dc2626',
                fontSize: 13,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* PASO 1: INICIO */}
          {paso === 'inicio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                style={{
                  background: 'rgba(244, 80, 30, 0.05)',
                  border: '1px solid rgba(244, 80, 30, 0.15)',
                  borderRadius: 14,
                  padding: 18,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: T.text,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#c0260a', fontSize: 14 }}>
                  ¿Por qué es crucial para la rentabilidad de tu salón?
                </div>
                <div>
                  En peluquería, un servicio de color (tinte, mechas, balayage) tiene una fase de <b>reposo químico</b>{' '}
                  en la que el estilista queda libre. Al declarar los minutos exactos de aplicación vs. reposo, Mecha
                  puede <b>doblar citas</b> y encajar cortes express en los huecos muertos sin solapes.
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: T.textSecondary }}>
                  💡 <i>Un salón medio desbloquea hasta <b>334 €/mes</b> de margen adicional aprovechando solo el 25% de sus reposos.</i>
                </div>
              </div>

              {/* Status card */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: `1px solid ${T.border}`,
                    background: T.bgCard,
                  }}
                >
                  <div style={{ fontSize: 11, color: T.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>
                    Servicios en catálogo
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: T.text, marginTop: 4 }}>
                    {servicios.length}
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: `1px solid ${sinReposoCount > 0 ? 'rgba(245, 158, 11, 0.3)' : T.border}`,
                    background: sinReposoCount > 0 ? 'rgba(245, 158, 11, 0.05)' : T.bgCard,
                  }}
                >
                  <div style={{ fontSize: 11, color: sinReposoCount > 0 ? '#d97706' : T.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>
                    Sin reposo configurado
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: sinReposoCount > 0 ? '#b45309' : '#16a34a', marginTop: 4 }}>
                    {sinReposoCount}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="incluirTodos"
                  checked={incluirTodos}
                  onChange={(e) => setIncluirTodos(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="incluirTodos" style={{ fontSize: 13, color: T.textSecondary, cursor: 'pointer' }}>
                  Reanalizar también los servicios que ya tienen reposo configurado
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <Btn variant="soft" onClick={onClose}>
                  Cancelar
                </Btn>
                <Btn
                  variant="primary"
                  onClick={() => handleIniciarAnalisis()}
                  disabled={loading || servicios.length === 0}
                >
                  ✨ Analizar Catálogo ({incluirTodos ? servicios.length : sinReposoCount} servicios)
                </Btn>
              </div>
            </div>
          )}

          {/* PASO 2: ANALIZANDO */}
          {paso === 'analizando' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  border: '4px solid rgba(244, 80, 30, 0.15)',
                  borderTopColor: '#f4501e',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 20px',
                }}
              />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>
                Analizando servicios y química de color...
              </div>
              <div style={{ fontSize: 13, color: T.textSecondary, maxWidth: 400, margin: '0 auto' }}>
                La IA está deduciendo la duración de aplicación, tiempo de reposo y lavacabezas según las fórmulas y prácticas estándar de peluquería.
              </div>
            </div>
          )}

          {/* PASO 3: REVISION DE PROPUESTAS */}
          {paso === 'revision' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                  padding: '10px 14px',
                  backgroundColor: 'rgba(244, 80, 30, 0.04)',
                  borderRadius: 12,
                  border: `1px solid ${T.border}`,
                }}
              >
                <div style={{ fontSize: 13, color: T.text }}>
                  <b>{propuestas.length} propuestas generadas</b> · {metaInfo?.conReposo ?? 0} ya tenían reposo.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleSelectAll(true)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#f4501e',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Seleccionar todas
                  </button>
                  <span style={{ color: T.border }}>|</span>
                  <button
                    onClick={() => handleSelectAll(false)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: T.textSecondary,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Deseleccionar
                  </button>
                </div>
              </div>

              {/* Lista de propuestas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {propuestas.map((prop) => {
                  const srv = serviciosMap.get(prop.id);
                  const durTotal = prop.duracion_activa_min + prop.duracion_espera_min;

                  return (
                    <div
                      key={prop.id}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        border: `1px solid ${prop.seleccionada ? 'rgba(244,80,30,0.3)' : T.border}`,
                        backgroundColor: prop.seleccionada ? 'rgba(255,255,255,1)' : 'rgba(250,250,250,0.6)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <input
                          type="checkbox"
                          checked={prop.seleccionada}
                          onChange={() => handleTogglePropuesta(prop.id)}
                          style={{ width: 18, height: 18, marginTop: 3, cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>
                              {srv?.nombre || `Servicio #${prop.id.slice(0, 6)}`}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  backgroundColor:
                                    prop.confianza === 'alta'
                                      ? 'rgba(16, 185, 129, 0.12)'
                                      : prop.confianza === 'media'
                                      ? 'rgba(245, 158, 11, 0.12)'
                                      : 'rgba(156, 163, 175, 0.15)',
                                  color:
                                    prop.confianza === 'alta'
                                      ? '#059669'
                                      : prop.confianza === 'media'
                                      ? '#d97706'
                                      : '#4b5563',
                                }}
                              >
                                Confianza {prop.confianza}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#f4501e' }}>
                                Total: {durTotal} min
                              </span>
                            </div>
                          </div>

                          {prop.motivo && (
                            <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                              "{prop.motivo}"
                            </div>
                          )}

                          {/* Inputs de ajuste */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: isMobile ? '1fr 1fr' : '110px 110px 160px 140px',
                              gap: 10,
                              marginTop: 12,
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, marginBottom: 3, textTransform: 'uppercase' }}>
                                ACTIVA (MIN)
                              </div>
                              <input
                                type="number"
                                min={5}
                                max={300}
                                value={prop.duracion_activa_min}
                                onChange={(e) =>
                                  handleUpdatePropuesta(prop.id, {
                                    duracion_activa_min: parseInt(e.target.value, 10) || 5,
                                  })
                                }
                                style={{
                                  width: '100%',
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  border: `1px solid ${T.border}`,
                                  fontSize: 13,
                                  outline: 'none',
                                }}
                              />
                            </div>

                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, marginBottom: 3, textTransform: 'uppercase' }}>
                                REPOSO (MIN)
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={120}
                                value={prop.duracion_espera_min}
                                onChange={(e) =>
                                  handleUpdatePropuesta(prop.id, {
                                    duracion_espera_min: parseInt(e.target.value, 10) || 0,
                                  })
                                }
                                style={{
                                  width: '100%',
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  border: `1px solid ${T.border}`,
                                  fontSize: 13,
                                  outline: 'none',
                                  fontWeight: prop.duracion_espera_min > 0 ? 700 : 400,
                                  color: prop.duracion_espera_min > 0 ? '#c0260a' : T.text,
                                }}
                              />
                            </div>

                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, marginBottom: 3, textTransform: 'uppercase' }}>
                                RECURSO FÍSICO
                              </div>
                              <select
                                value={prop.recurso_tipo || ''}
                                onChange={(e) =>
                                  handleUpdatePropuesta(prop.id, {
                                    recurso_tipo: e.target.value || null,
                                  })
                                }
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: `1px solid ${T.border}`,
                                  fontSize: 12,
                                  outline: 'none',
                                  background: T.bgCard,
                                }}
                              >
                                {RECURSOS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {prop.recurso_tipo && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, marginBottom: 3, textTransform: 'uppercase' }}>
                                  FASE RECURSO
                                </div>
                                <select
                                  value={prop.recurso_fase || 'final'}
                                  onChange={(e) =>
                                    handleUpdatePropuesta(prop.id, {
                                      recurso_fase: e.target.value,
                                    })
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: 8,
                                    border: `1px solid ${T.border}`,
                                    fontSize: 12,
                                    outline: 'none',
                                    background: T.bgCard,
                                  }}
                                >
                                  {FASES_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          {/* SECUENCIA DE FASES (plantilla) */}
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              borderRadius: 10,
                              border: `1px solid ${prop.fases ? 'rgba(37,99,235,0.25)' : T.border}`,
                              backgroundColor: prop.fases ? 'rgba(37,99,235,0.03)' : 'transparent',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: T.text, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={!!prop.fases}
                                  onChange={() => handleTogglePlantilla(prop.id)}
                                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                                />
                                Secuencia de fases
                                {prop.fases && (
                                  <span style={{ fontWeight: 400, color: T.textSecondary }}>
                                    (suma {prop.fases.reduce((s, f) => s + (f.min || 0), 0)} min)
                                  </span>
                                )}
                              </label>
                              {prop.fases && (
                                <button
                                  onClick={() => handleAddFase(prop.id)}
                                  style={{ border: 'none', background: 'transparent', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                >
                                  + fase
                                </button>
                              )}
                            </div>

                            {prop.fases ? (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {prop.fases.map((fase, idx) => {
                                    const meta = TIPOS_FASE_OPTIONS.find((t) => t.value === fase.tipo) ?? TIPOS_FASE_OPTIONS[0];
                                    const mala =
                                      fase.tipo === 'reposo' && prop.fases?.[idx - 1]?.tipo === 'reposo';
                                    return (
                                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <span
                                          style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            padding: '2px 8px',
                                            borderRadius: 6,
                                            backgroundColor: meta.bg,
                                            color: meta.color,
                                            minWidth: 64,
                                            textAlign: 'center',
                                          }}
                                        >
                                          {meta.label}
                                        </span>
                                        <select
                                          value={fase.tipo}
                                          onChange={(e) =>
                                            handleUpdateFase(prop.id, idx, {
                                              tipo: e.target.value as FaseIA['tipo'],
                                            })
                                          }
                                          style={{ padding: '4px 6px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, outline: 'none', background: T.bgCard }}
                                        >
                                          {TIPOS_FASE_OPTIONS.map((t) => (
                                            <option key={t.value} value={t.value}>
                                              {t.label}
                                            </option>
                                          ))}
                                        </select>
                                        <input
                                          type="number"
                                          min={1}
                                          max={300}
                                          value={fase.min}
                                          onChange={(e) =>
                                            handleUpdateFase(prop.id, idx, {
                                              min: parseInt(e.target.value, 10) || 1,
                                            })
                                          }
                                          style={{ width: 64, padding: '4px 6px', borderRadius: 6, border: `1px solid ${mala ? '#dc2626' : T.border}`, fontSize: 12, outline: 'none' }}
                                        />
                                        <input
                                          type="text"
                                          placeholder="etiqueta (opcional)"
                                          maxLength={40}
                                          value={fase.etiqueta ?? ''}
                                          onChange={(e) =>
                                            handleUpdateFase(prop.id, idx, { etiqueta: e.target.value || null })
                                          }
                                          style={{ flex: 1, minWidth: 120, padding: '4px 6px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, outline: 'none' }}
                                        />
                                        <button
                                          onClick={() => handleRemoveFase(prop.id, idx)}
                                          title="Quitar fase"
                                          style={{ border: 'none', background: 'transparent', color: '#dc2626', fontSize: 14, cursor: 'pointer' }}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                                {fasesTienenDosRepososSeguidos(prop.fases) && (
                                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>
                                    Dos reposos seguidos: son un solo reposo. Al guardar se enviará sin plantilla.
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: 11, color: T.textSecondary }}>
                                Sin plantilla: la cita se descompone en los tres tramos clásicos.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Servicios descartados o no clasificados */}
              {descartadas.length > 0 && (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.03)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>
                    Servicios no modificados ({descartadas.length}):
                  </div>
                  {descartadas.map((d, i) => (
                    <div key={i} style={{ fontSize: 11, color: T.textTertiary }}>
                      • {serviciosMap.get(d.id || '')?.nombre || d.id || 'Servicio'}: {d.descartada}
                    </div>
                  ))}
                </div>
              )}

              {/* Botones de acción */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 16,
                  borderTop: `1px solid ${T.border}`,
                  marginTop: 8,
                }}
              >
                <Btn variant="soft" onClick={() => setPaso('inicio')}>
                  Atrás
                </Btn>
                <Btn
                  variant="primary"
                  onClick={handleAplicarCambios}
                  disabled={loading || seleccionadasCount === 0}
                >
                  {loading ? 'Aplicando...' : `Guardar ${seleccionadasCount} servicios`}
                </Btn>
              </div>
            </div>
          )}

          {/* PASO 4: EXITO */}
          {paso === 'exito' && (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#059669',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 26,
                  margin: '0 auto 16px',
                }}
              >
                ✓
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: '0 0 8px' }}>
                ¡Catálogo técnificado con éxito!
              </h3>
              <p style={{ fontSize: 13, color: T.textSecondary, maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.5 }}>
                Se han actualizado <b>{aplicadosCount} servicios</b> con sus fases activas, tiempos de reposo químico y recursos asignados. La agenda ya puede doblar citas durante los reposos.
              </p>
              <Btn variant="primary" onClick={onClose}>
                Volver a Servicios
              </Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
