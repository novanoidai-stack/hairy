import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile, roleLabel } from '@/lib/auth';
import { format, parseISO, startOfDay, addDays, startOfWeek, addWeeks, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { mensajeDeError } from '@/lib/errores';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { Segmented, StatBox } from '@/components/ui/SettingsAtoms';

const T = DESIGN_TOKENS;

const ANIM = `
  @keyframes mjFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes mjUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes mjSpin { to { transform: rotate(360deg) } }
  .mj-row { animation: mjUp 0.32s cubic-bezier(0.16,1,0.3,1) both; }
  .mj-btn { transition: all 0.15s ease; cursor: pointer; }
  .mj-btn:hover { filter: brightness(1.05); }
`;

// Iconos en linea (mismo set que caja.web.tsx, sin dependencias extra).
function Icon({ name, size = 18, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="6" r="1"/><path d="M20.2 19.2L13 12"/><path d="M18 4l4 4-8.8 8.8a4 4 0 0 1-2.8 1.2H4l1.8-1.8a4 4 0 0 1 1.2-2.8L18 4z"/>',
    cash: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    drop: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  };
  return (
    <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
      __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
    }} />
  );
}

type Periodo = 'hoy' | 'semana' | 'mes';
type Fichaje = { tipo: string; marcado_at: string; user_id: string | null };

interface CitaLista { inicio: string; cliente: string | null; servicio: string | null; es_tinte: boolean; }
interface Resumen {
  profesional: { id: string | null; nombre: string; vinculado: boolean };
  rol: string;
  horas: number;
  citas_completadas: number;
  tintes: number;
  citas_lista: CitaLista[];
  puede_ver_importes: boolean;
  puede_ver_comision: boolean;
  total_cents?: number;
  propinas_cents?: number;
  efectivo_cents?: number;
  datafono_cents?: number;
  cobros_count?: number;
  ticket_medio_cents?: number;
  comision_cents?: number;
}

const PERIODO_LABEL: Record<Periodo, string> = { hoy: 'hoy', semana: 'esta semana', mes: 'este mes' };

// Rango [desde, hasta) en hora local para el periodo elegido.
function rangoDe(periodo: Periodo): [Date, Date] {
  const now = new Date();
  if (periodo === 'hoy') { const d = startOfDay(now); return [d, addDays(d, 1)]; }
  if (periodo === 'semana') { const d = startOfWeek(now, { weekStartsOn: 1 }); return [d, addWeeks(d, 1)]; }
  const d = startOfMonth(now); return [d, addMonths(d, 1)];
}

// Horas trabajadas a partir de marcas entrada/salida (sesion abierta cuenta hasta ahora).
function horasDeMarcas(fichajes: Fichaje[]): number {
  const sorted = [...fichajes].sort((a, b) => a.marcado_at.localeCompare(b.marcado_at));
  let total = 0;
  let abierta: number | null = null;
  for (const f of sorted) {
    if (f.tipo === 'entrada') abierta = parseISO(f.marcado_at).getTime();
    else if (f.tipo === 'salida' && abierta != null) { total += (parseISO(f.marcado_at).getTime() - abierta) / 3600000; abierta = null; }
  }
  if (abierta != null) total += (Date.now() - abierta) / 3600000;
  return total;
}

function fmtHoras(h: number): string {
  const horas = Math.floor(h);
  const mins = Math.round((h - horas) * 60);
  if (horas <= 0 && mins <= 0) return '0h';
  if (horas <= 0) return `${mins}m`;
  return mins > 0 ? `${horas}h ${mins}m` : `${horas}h`;
}

const eur = (cents?: number) => `${((cents || 0) / 100).toFixed(2)}€`;

export default function MiJornadaScreen() {
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [fichajesHoy, setFichajesHoy] = useState<Fichaje[]>([]);
  const [userId, setUserId] = useState('');
  const [fichando, setFichando] = useState(false);

  const cargar = useCallback(async (per: Periodo) => {
    setLoading(true);
    setError(null);
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setLoading(false); return; }
      setUserId(profile.id || '');

      // Fichajes de HOY del usuario (para la tarjeta de fichaje, siempre visible).
      const hoy0 = startOfDay(new Date());
      const { data: fchs } = await supabase
        .from('fichajes')
        .select('tipo, marcado_at, user_id')
        .eq('negocio_id', profile.negocio_id)
        .eq('user_id', profile.id)
        .gte('marcado_at', hoy0.toISOString())
        .lt('marcado_at', addDays(hoy0, 1).toISOString())
        .order('marcado_at', { ascending: true });
      setFichajesHoy((fchs as Fichaje[]) || []);

      // Resumen del periodo (RPC con gate server-side de dinero/comision).
      const [d, h] = rangoDe(per);
      const { data, error: rpcErr } = await supabase.rpc('mi_jornada_resumen', {
        p_desde: d.toISOString(),
        p_hasta: h.toISOString(),
      });
      if (rpcErr) throw rpcErr;
      setResumen(data as Resumen);
    } catch (err) {
      console.error('Error cargando Mi jornada:', err);
      setError(mensajeDeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(periodo); }, [periodo, cargar]);

  const ultimaMarca = useMemo(() => {
    const sorted = [...fichajesHoy].sort((a, b) => a.marcado_at.localeCompare(b.marcado_at));
    return sorted[sorted.length - 1];
  }, [fichajesHoy]);
  const fichado = ultimaMarca?.tipo === 'entrada';
  const horasHoy = useMemo(() => horasDeMarcas(fichajesHoy), [fichajesHoy]);

  const fichar = async () => {
    setFichando(true);
    setError(null);
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setFichando(false); return; }
      const tipo = fichado ? 'salida' : 'entrada';
      const { error: insErr } = await supabase.from('fichajes').insert({
        negocio_id: profile.negocio_id,
        user_id: profile.id,
        tipo,
      });
      if (insErr) throw insErr;
      await cargar(periodo);
    } catch (err) {
      console.error('Error fichando:', err);
      setError(mensajeDeError(err));
    } finally {
      setFichando(false);
    }
  };

  if (loading && !resumen) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: T.primary, borderRadius: '50%', animation: 'mjSpin 0.8s linear infinite', margin: '0 auto 12px' }} />
        Cargando tu jornada...
      </div>
    );
  }

  const nombre = resumen?.profesional.nombre || 'Tu jornada';
  const iniciales = nombre.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const rolTxt = resumen?.rol ? roleLabel({ role: resumen.rol }) : '';
  const vinculado = resumen?.profesional.vinculado ?? false;
  const pLabel = PERIODO_LABEL[periodo];
  const verImportes = resumen?.puede_ver_importes;
  const verComision = resumen?.puede_ver_comision;

  return (
    <div style={{ background: T.bg, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{ANIM}</style>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 14px 96px' : '20px' }}>

        {/* Cabecera: identidad + selector de periodo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: isMobile ? 16 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 999, background: T.primary, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
              {iniciales}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nombre}
              </h1>
              <div style={{ fontSize: 13, color: T.textSec }}>Mi jornada{rolTxt ? ` · ${rolTxt}` : ''}</div>
            </div>
          </div>
          <Segmented
            value={periodo}
            onChange={(v) => setPeriodo(v as Periodo)}
            options={[{ value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]}
          />
        </div>

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 16, background: T.dangerSoft, color: T.danger, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Aviso si la cuenta no esta vinculada a una ficha de profesional */}
        {resumen && !vinculado && (
          <div className="mj-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 12, marginBottom: 16, background: T.warningSoft, border: `1px solid ${T.warning}33` }}>
            <Icon name="info" size={18} color={T.warning} />
            <div style={{ fontSize: 13, color: T.text }}>
              <b>Tu cuenta no está vinculada a una ficha de profesional.</b> Puedes fichar igualmente, pero para ver tus citas, cobros y rendimiento pídele al responsable que vincule tu cuenta desde <b>Equipo</b>.
            </div>
          </div>
        )}

        {/* Tarjeta de fichaje (siempre, hoy) */}
        <div className="mj-row" style={{ background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="clock" size={18} color={fichado ? T.success : T.textTer} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Tu fichaje de hoy</div>
                <div style={{ fontSize: 12, color: T.textSec }}>
                  {fichado ? 'Trabajando — entrada registrada' : 'Fuera de turno'} · {fmtHoras(horasHoy)} hoy
                </div>
              </div>
            </div>
            <button onClick={fichar} disabled={fichando} className="mj-btn" style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: fichado ? T.danger : T.success, color: '#fff', fontSize: 14, fontWeight: 700, cursor: fichando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="clock" size={15} color="#fff" /> {fichando ? '...' : (fichado ? 'Fichar salida' : 'Fichar entrada')}
            </button>
          </div>
          {fichajesHoy.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {fichajesHoy.map((f, i) => (
                <span key={i} style={{ fontSize: 11.5, color: T.textSec, padding: '4px 9px', borderRadius: 999, background: T.bg, border: `1px solid ${T.border}`, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.tipo === 'entrada' ? T.success : T.textTer }} />
                  {f.tipo === 'entrada' ? 'Entrada' : 'Salida'} {format(parseISO(f.marcado_at), 'HH:mm', { locale: es })}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Metricas del periodo */}
        <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 2px 10px' }}>
          Tu actividad · {pLabel}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 160}px, 1fr))`, gap: 12, marginBottom: 18 }}>
          <StatBox label="Citas completadas" value={String(resumen?.citas_completadas ?? 0)} sub={pLabel} accent={T.primary} />
          <StatBox label="Tintes / color" value={String(resumen?.tintes ?? 0)} sub="de tus citas" />
          <StatBox label="Horas trabajadas" value={fmtHoras(resumen?.horas ?? 0)} sub={pLabel} />
          {verImportes && (
            <>
              <StatBox label="Cobrado" value={eur(resumen?.total_cents)} sub={`${resumen?.cobros_count ?? 0} cobro${(resumen?.cobros_count ?? 0) === 1 ? '' : 's'}`} accent={T.text} />
              <StatBox label="Propinas" value={eur(resumen?.propinas_cents)} sub="incluidas en cobros" accent={T.success} />
              <StatBox label="Ticket medio" value={eur(resumen?.ticket_medio_cents)} sub="por cobro" />
            </>
          )}
          {verComision && (
            <StatBox label="Comisión estimada" value={eur(resumen?.comision_cents)} sub="sobre servicios" accent={T.primaryHi} />
          )}
        </div>

        {/* Lista de citas completadas del periodo */}
        {vinculado && (
          <>
            <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 2px 10px' }}>
              Citas completadas · {pLabel}
            </div>
            {(resumen?.citas_lista?.length ?? 0) === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, color: T.textSec, fontSize: 14 }}>
                <Icon name="calendar" size={36} color={T.textTer} />
                <div style={{ marginTop: 10 }}>No tienes citas completadas {pLabel}.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {resumen!.citas_lista.map((c, idx) => (
                  <div key={idx} className="mj-row" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 16px', background: T.bgCard, borderRadius: 12, border: `1px solid ${T.border}`, animationDelay: `${Math.min(idx, 12) * 0.025}s` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                      {format(parseISO(c.inicio), 'HH:mm', { locale: es })}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.cliente || 'Sin cliente'}
                      </div>
                      <div style={{ fontSize: 12, color: T.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.servicio || 'Servicio'}
                      </div>
                    </div>
                    {c.es_tinte && (
                      <span style={{ fontSize: 11, color: T.primaryHi, background: T.primarySoft, padding: '3px 9px', borderRadius: 999, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="drop" size={12} color={T.primaryHi} /> Color
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
