/**
 * Rendimiento del equipo — ranking + objetivos.
 *
 * Vivia dentro de "Mi jornada" detras de un conmutador Mi jornada / Equipo, lo
 * que mezclaba dos cosas distintas: lo MIO y lo de TODOS. Se ha movido a la
 * pagina de Equipo, que es donde se gestiona a las personas, y "Mi jornada"
 * vuelve a ser literalmente eso. Aqui solo entra quien puede gestionar equipo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { startOfDay, addDays, startOfWeek, addWeeks, startOfMonth, addMonths } from 'date-fns';

const T = DESIGN_TOKENS;

type Periodo = 'hoy' | 'semana' | 'mes';
type Orden = 'ingresos' | 'servicios' | 'horas' | 'productivo';
type Metrica = 'ingresos' | 'servicios' | 'horas' | 'productivo';

interface ProfesionalRanking {
  id: string;
  nombre: string;
  horas: number;
  citas_completadas: number;
  ingresos_cents: number;
  // Propinas del profesional en el periodo (van siempre aparte del ingreso real).
  propinas_cents?: number;
  comision_cents: number;
  reposo_total_min: number;
  reposo_usado_min: number;
  servicios_top: Array<{ nombre: string; count: number }>;
}

interface ObjetivoEquipo {
  id: string;
  profesional_id: string;
  profesional_nombre: string;
  metrica: Metrica;
  objetivo_valor: number;
  actual: number;
  bonus_cents: number | null;
}

const PERIODO_LABEL: Record<Periodo, string> = { hoy: 'hoy', semana: 'esta semana', mes: 'este mes' };
const METRICA_LABEL: Record<Metrica, string> = {
  ingresos: 'Dinero generado (€)',
  servicios: 'Servicios completados',
  horas: 'Horas trabajadas',
  productivo: 'Reposo aprovechado (%)',
};
const METRICA_SUFIJO: Record<Metrica, string> = { ingresos: '€', servicios: '', horas: 'h', productivo: '%' };

function rangoDe(periodo: Periodo): [Date, Date] {
  const now = new Date();
  if (periodo === 'hoy') { const d = startOfDay(now); return [d, addDays(d, 1)]; }
  if (periodo === 'semana') { const d = startOfWeek(now, { weekStartsOn: 1 }); return [d, addWeeks(d, 1)]; }
  const d = startOfMonth(now); return [d, addMonths(d, 1)];
}

const eur = (cents?: number) => `${((cents || 0) / 100).toFixed(2)}€`;
const fmtPct = (n: number) => `${Math.round(n)}%`;
function fmtHoras(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h';
  const horas = Math.floor(h);
  const mins = Math.round((h - horas) * 60);
  if (mins === 60) return `${horas + 1}h`;
  if (horas <= 0) return `${mins}m`;
  return mins > 0 ? `${horas}h ${mins}m` : `${horas}h`;
}
function fmtMetrica(m: Metrica, v: number): string {
  if (m === 'ingresos') return `${v.toFixed(0)}€`;
  if (m === 'horas') return `${v.toFixed(1)}h`;
  if (m === 'productivo') return `${Math.round(v)}%`;
  return String(Math.round(v));
}

function Segmento<V extends string>({ value, onChange, options }: {
  value: V; onChange: (v: V) => void; options: Array<{ value: V; label: string }>;
}) {
  return (
    <div style={{ display: 'flex', background: T.bg, borderRadius: 10, padding: 3, border: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 700,
            background: value === o.value ? T.bgCard : 'transparent',
            color: value === o.value ? T.text : T.textSec,
            boxShadow: value === o.value ? '0 1px 3px rgba(40,30,24,0.12)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RendimientoEquipo({ isMobile = false }: { isMobile?: boolean }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [orden, setOrden] = useState<Orden>('ingresos');
  const [ranking, setRanking] = useState<ProfesionalRanking[] | null>(null);
  const [objetivos, setObjetivos] = useState<ObjetivoEquipo[]>([]);
  const [activos, setActivos] = useState<Array<{ id: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { profesional_id: string; metrica: Metrica; objetivo_valor: string; bonus_euros: string }>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, h] = rangoDe(periodo);
      const { data, error: rpcErr } = await supabase.rpc('equipo_jornada_ranking', {
        p_desde: d.toISOString(), p_hasta: h.toISOString(),
      });
      if (rpcErr) throw rpcErr;
      setRanking(((data as any)?.profesionales as ProfesionalRanking[]) || []);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  const cargarObjetivos = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) return;
      const [{ data: objRes }, { data: profs }] = await Promise.all([
        supabase.rpc('objetivos_negocio_progreso'),
        supabase.from('profesionales').select('id, nombre')
          .eq('negocio_id', profile.negocio_id).eq('activo', true).order('nombre'),
      ]);
      setObjetivos(((objRes as any)?.objetivos as ObjetivoEquipo[]) || []);
      setActivos((profs as Array<{ id: string; nombre: string }>) || []);
    } catch (err) {
      console.error('Error cargando objetivos del equipo:', err);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarObjetivos(); }, [cargarObjetivos]);

  const ordenado = useMemo(() => {
    if (!ranking) return [];
    const arr = [...ranking];
    // Ordenar por ingreso REAL (sin propina), misma definicion que Mi Jornada/Caja.
    if (orden === 'ingresos') arr.sort((a, b) => (b.ingresos_cents - (b.propinas_cents ?? 0)) - (a.ingresos_cents - (a.propinas_cents ?? 0)));
    else if (orden === 'servicios') arr.sort((a, b) => b.citas_completadas - a.citas_completadas);
    else if (orden === 'horas') arr.sort((a, b) => b.horas - a.horas);
    else arr.sort((a, b) => {
      const pa = a.reposo_total_min > 0 ? a.reposo_usado_min / a.reposo_total_min : -1;
      const pb = b.reposo_total_min > 0 ? b.reposo_usado_min / b.reposo_total_min : -1;
      return pb - pa;
    });
    return arr;
  }, [ranking, orden]);

  const guardarObjetivo = async () => {
    if (!modal) return;
    const valor = parseFloat(modal.objetivo_valor);
    if (!modal.profesional_id || !valor || valor <= 0) return;
    const bonusEuros = parseFloat(modal.bonus_euros);
    const bonusCents = !isNaN(bonusEuros) && bonusEuros > 0 ? Math.round(bonusEuros * 100) : null;
    try {
      const { error: rpcErr } = await supabase.rpc('guardar_objetivo_profesional', {
        p_profesional_id: modal.profesional_id,
        p_metrica: modal.metrica,
        p_objetivo_valor: valor,
        p_bonus_cents: bonusCents,
      });
      if (rpcErr) throw rpcErr;
      setModal(null);
      await cargarObjetivos();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const eliminarObjetivo = async (id: string) => {
    if (!window.confirm('¿Eliminar este objetivo?')) return;
    try {
      const { error: rpcErr } = await supabase.rpc('eliminar_objetivo_profesional', { p_id: id });
      if (rpcErr) throw rpcErr;
      await cargarObjetivos();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const pLabel = PERIODO_LABEL[periodo];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: T.dangerSoft, color: T.danger, fontSize: 13.5 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Ranking del equipo · {pLabel}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Segmento
            value={periodo}
            onChange={setPeriodo}
            options={[{ value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]}
          />
          <Segmento
            value={orden}
            onChange={setOrden}
            options={[
              { value: 'ingresos', label: 'Dinero' },
              { value: 'servicios', label: 'Servicios' },
              { value: 'horas', label: 'Horas' },
              { value: 'productivo', label: 'Productivo' },
            ]}
          />
        </div>
      </div>

      {loading && !ranking ? (
        <div style={{ padding: 40, textAlign: 'center', color: T.textSec, fontSize: 13.5 }}>Cargando el equipo…</div>
      ) : ordenado.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, color: T.textSec, fontSize: 14 }}>
          No hay profesionales con actividad {pLabel}.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
          {ordenado.map((p, idx) => {
            const pct = p.reposo_total_min > 0 ? (p.reposo_usado_min / p.reposo_total_min) * 100 : null;
            const inic = p.nombre.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
            return (
              <div key={p.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: isMobile ? 14 : 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 20, textAlign: 'center', fontSize: 13, fontWeight: 700, color: T.textTer }}>{idx + 1}</div>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: T.primary, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {inic}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: T.textSec }}>
                      {fmtHoras(p.horas)} trabajadas · {p.citas_completadas} servicio{p.citas_completadas === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{eur(p.ingresos_cents - (p.propinas_cents ?? 0))}</div>
                    {(p.propinas_cents ?? 0) > 0 && <div style={{ fontSize: 11, color: '#d97706' }}>{eur(p.propinas_cents)} propinas</div>}
                    {p.comision_cents > 0 && <div style={{ fontSize: 11, color: T.primaryHi }}>{eur(p.comision_cents)} comisión</div>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Servicios más realizados</div>
                    {p.servicios_top.length === 0 ? (
                      <div style={{ fontSize: 12, color: T.textTer }}>Sin servicios en este periodo</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.servicios_top.map((s, i) => (
                          <span key={i} style={{ fontSize: 11.5, color: T.text, padding: '4px 9px', borderRadius: 999, background: T.bg, border: `1px solid ${T.border}` }}>
                            {s.nombre} <b style={{ color: T.textSec }}>×{s.count}</b>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
                      Tiempo de reposo (tintes/mechas)
                    </div>
                    {pct === null ? (
                      <div style={{ fontSize: 12, color: T.textTer }}>Sin tiempos de reposo</div>
                    ) : (
                      <>
                        <div style={{ height: 6, borderRadius: 999, background: T.bg, overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: pct >= 50 ? T.success : T.warning, borderRadius: 999 }} />
                        </div>
                        <div style={{ fontSize: 11.5, color: T.textSec }}>
                          <b style={{ color: T.text }}>{fmtPct(pct)}</b> productivo · {Math.round(p.reposo_usado_min)} de {Math.round(p.reposo_total_min)} min aprovechados
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Objetivos */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Objetivos del equipo · este mes
        </div>
        <button
          onClick={() => setModal({ profesional_id: activos[0]?.id || '', metrica: 'ingresos', objetivo_valor: '', bonus_euros: '' })}
          disabled={activos.length === 0}
          className="btn-interactive"
          style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.primary}`, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: activos.length === 0 ? 'not-allowed' : 'pointer' }}
        >
          + Nuevo objetivo
        </button>
      </div>

      {objetivos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 20px', background: T.bgCard, borderRadius: 12, border: `1px dashed ${T.border}`, color: T.textSec, fontSize: 13 }}>
          Aún no hay objetivos. Fija uno por profesional (dinero, servicios, horas o % de reposo aprovechado)
          y verán su progreso en su «Mi jornada».
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {objetivos.map((o) => {
            const pct = Math.min(100, (o.actual / o.objetivo_valor) * 100);
            const done = pct >= 100;
            return (
              <div key={o.id} style={{ background: T.bgCard, border: `1px solid ${done ? T.success : T.border}`, borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.profesional_nombre} · {METRICA_LABEL[o.metrica]}
                  </div>
                  <div style={{ fontSize: 12, color: done ? T.success : T.textSec, fontWeight: 700 }}>
                    {fmtMetrica(o.metrica, o.actual)} / {fmtMetrica(o.metrica, o.objetivo_valor)}
                  </div>
                  <button onClick={() => eliminarObjetivo(o.id)} className="btn-interactive" title="Eliminar objetivo" style={{ background: 'transparent', border: 'none', color: T.textTer, fontSize: 18, cursor: 'pointer', padding: '0 6px' }}>×</button>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: T.bg, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: done ? T.success : T.primary, borderRadius: 999, transition: 'width 0.4s ease' }} />
                </div>
                {o.bonus_cents != null && o.bonus_cents > 0 && (
                  <div style={{ fontSize: 11.5, color: done ? T.success : T.textSec, marginTop: 6 }}>
                    Bonus: <b>{eur(o.bonus_cents)}</b>{done ? ' · conseguido' : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(8,6,4,0.45)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>Nuevo objetivo</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Profesional
                <select
                  value={modal.profesional_id}
                  onChange={(e) => setModal({ ...modal, profesional_id: e.target.value })}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                >
                  {activos.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Métrica
                <select
                  value={modal.metrica}
                  onChange={(e) => setModal({ ...modal, metrica: e.target.value as Metrica })}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                >
                  <option value="ingresos">Dinero generado (€)</option>
                  <option value="servicios">Servicios completados</option>
                  <option value="horas">Horas trabajadas</option>
                  <option value="productivo">% de reposo aprovechado</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Objetivo del mes ({METRICA_SUFIJO[modal.metrica] || 'unidades'})
                <input
                  type="number" min="1" step="1"
                  value={modal.objetivo_valor}
                  onChange={(e) => setModal({ ...modal, objetivo_valor: e.target.value })}
                  placeholder={modal.metrica === 'ingresos' ? '3000' : modal.metrica === 'servicios' ? '80' : modal.metrica === 'horas' ? '160' : '70'}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                />
              </label>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Bonus al alcanzarlo (€, opcional)
                <input
                  type="number" min="0" step="1"
                  value={modal.bonus_euros}
                  onChange={(e) => setModal({ ...modal, bonus_euros: e.target.value })}
                  placeholder="100"
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModal(null)} className="btn-interactive" style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarObjetivo} className="btn-interactive" style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
