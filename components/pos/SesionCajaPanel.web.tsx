// Abrir la caja por la mañana y cerrarla contando el dinero.
//
// El cierre es un ARQUEO CIEGO: mientras se cuenta no se enseña por ningun lado
// lo que el sistema espera encontrar. El teorico y el descuadre llegan del
// servidor DESPUES de teclear lo contado (RPC cerrar_caja). Si se pudiera ver
// antes, el arqueo no controlaria nada: se teclearia el numero que cuadra.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import {
  DENOMINACIONES_EUR,
  etiquetaDenominacion,
  euros,
  resumenDeCierre,
  totalContado,
  type Conteo,
  type ResumenCierre,
} from '@/lib/caja/sesionCaja';

const T = DESIGN_TOKENS;

type SesionAbierta = {
  abierta: boolean;
  sesion_id?: string;
  abierta_at?: string;
  fondo_inicial_cents?: number;
  cobros?: number;
};

export function SesionCajaPanel({ onCambio }: { onCambio?: () => void }) {
  const { isMobile } = useResponsive();
  const [sesion, setSesion] = useState<SesionAbierta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [abriendo, setAbriendo] = useState(false);
  const [fondo, setFondo] = useState('150');

  const [contando, setContando] = useState(false);
  const [conteo, setConteo] = useState<Conteo>({});
  const [notas, setNotas] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [resumen, setResumen] = useState<ResumenCierre | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase.rpc('caja_sesion_abierta');
    if (err) setError(mensajeDeError(err));
    else if (data?.ok) setSesion(data as SesionAbierta);
    else setError(data?.error ?? '');
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = async () => {
    setError('');
    setAbriendo(true);
    const cents = Math.round(parseFloat(fondo.replace(',', '.') || '0') * 100);
    const { data, error: err } = await supabase.rpc('abrir_caja', {
      p_fondo_inicial_cents: Number.isFinite(cents) ? cents : 0,
    });
    setAbriendo(false);
    if (err || !data?.ok) { setError(err ? mensajeDeError(err) : data?.error); return; }
    await cargar();
    onCambio?.();
  };

  const cerrar = async () => {
    setError('');
    setCerrando(true);
    const { data, error: err } = await supabase.rpc('cerrar_caja', {
      p_contado_efectivo_cents: totalContado(conteo),
      p_contado_datafono_cents: null,
      p_notas: notas.trim() || null,
    });
    setCerrando(false);
    if (err || !data?.ok) { setError(err ? mensajeDeError(err) : data?.error); return; }

    setResumen(resumenDeCierre(data));
    setContando(false);
    setConteo({});
    setNotas('');
    await cargar();
    onCambio?.();
  };

  if (cargando) return null;

  const contado = totalContado(conteo);

  // ── Resultado del cierre (aqui es donde por fin aparece el teorico) ──
  if (resumen) {
    const color = resumen.gravedad === 'cuadra' ? T.success
      : resumen.gravedad === 'leve' ? T.warning : T.danger;
    return (
      <div style={{
        background: T.bgCard, border: `1px solid ${color}`, borderRadius: 14,
        padding: 18, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>
            Caja cerrada · Informe Z {resumen.numeroZ}
          </h3>
          <span style={{ fontSize: 15, fontWeight: 700, color }}>{resumen.texto}</span>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10, marginTop: 14,
        }}>
          {[
            ['Cambio inicial', euros(resumen.fondoInicialCents)],
            ['Debería haber (efectivo)', euros(resumen.teoricoEfectivoCents)],
            ['Has contado (efectivo)', euros(resumen.contadoEfectivoCents)],
            ['Diferencia efectivo', euros(resumen.descuadreCents)],
            ...(resumen.teoricoDatafonoCents != null && resumen.teoricoDatafonoCents > 0 ? [['Datáfono / Tarjeta', euros(resumen.teoricoDatafonoCents)]] : []),
            ...(resumen.teoricoBizumCents != null && resumen.teoricoBizumCents > 0 ? [['Bizum', euros(resumen.teoricoBizumCents)]] : []),
            ...(resumen.teoricoOnlineCents != null && resumen.teoricoOnlineCents > 0 ? [['Online / Otros', euros(resumen.teoricoOnlineCents)]] : []),
          ].map(([label, valor]) => (
            <div key={label} style={{
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12,
            }}>
              <div style={{ fontSize: 11.5, color: T.textTer, marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{valor}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setResumen(null)}
          style={{
            marginTop: 14, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
            background: T.bg, border: `1px solid ${T.borderHi}`, color: T.textSec,
            fontSize: 13.5, fontWeight: 600,
          }}
        >
          Entendido
        </button>
      </div>
    );
  }

  // ── Contar el dinero (sin ver el teorico por ningun lado) ──
  if (contando) {
    return (
      <div style={{
        background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 14,
        padding: 18, marginBottom: 16,
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: T.text }}>
          Cuenta el dinero del cajón
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: T.textSec, lineHeight: 1.5 }}>
          Cuenta primero y teclea lo que hay. Lo que debería haber te lo digo al terminar:
          así el recuento sirve de algo.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)',
          gap: 8,
        }}>
          {DENOMINACIONES_EUR.map((d) => (
            <div key={d} style={{
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8,
            }}>
              <div style={{ fontSize: 11.5, color: T.textTer, marginBottom: 4 }}>
                {etiquetaDenominacion(d)}
              </div>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={conteo[d] ?? ''}
                onChange={(e) => setConteo({ ...conteo, [d]: parseInt(e.target.value, 10) || 0 })}
                placeholder="0"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
                  borderRadius: 8, border: `1px solid ${T.border}`,
                  background: T.bgCard, color: T.text, fontSize: 14, fontWeight: 600,
                }}
              />
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 14, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ fontSize: 15, color: T.textSec }}>
            Has contado <strong style={{ color: T.text, fontSize: 18 }}>{euros(contado)}</strong>
          </div>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Alguna nota del día (opcional)"
            style={{
              flex: 1, minWidth: 200, boxSizing: 'border-box', padding: '9px 12px',
              borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg,
              color: T.text, fontSize: 13.5,
            }}
          />
        </div>

        {error && (
          <div style={{
            marginTop: 12, background: T.dangerSoft, border: `1px solid ${T.danger}`,
            borderRadius: 10, padding: '10px 12px', fontSize: 13, color: T.danger,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            onClick={cerrar}
            disabled={cerrando}
            style={{
              padding: '11px 20px', borderRadius: 10, cursor: cerrando ? 'wait' : 'pointer',
              background: T.primary, border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
            }}
          >
            {cerrando ? 'Cerrando...' : 'Cerrar caja'}
          </button>
          <button
            onClick={() => { setContando(false); setConteo({}); setError(''); }}
            style={{
              padding: '11px 20px', borderRadius: 10, cursor: 'pointer',
              background: T.bg, border: `1px solid ${T.borderHi}`, color: T.textSec,
              fontSize: 14, fontWeight: 600,
            }}
          >
            Dejarlo
          </button>
        </div>
      </div>
    );
  }

  // ── Caja abierta / cerrada ──
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: 16, marginBottom: 16,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 12,
    }}>
      {sesion?.abierta ? (
        <>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
              Caja abierta
              <span style={{ fontWeight: 500, color: T.textSec }}>
                {' · '}{sesion.cobros ?? 0} {sesion.cobros === 1 ? 'cobro' : 'cobros'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: T.textTer, marginTop: 2 }}>
              Empezaste con {euros(sesion.fondo_inicial_cents ?? 0)} de cambio
              {sesion.abierta_at
                ? ` a las ${new Date(sesion.abierta_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </div>
          </div>
          <button
            onClick={() => setContando(true)}
            style={{
              padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
              background: T.primary, border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700,
            }}
          >
            Cerrar caja
          </button>
        </>
      ) : (
        <>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>La caja está cerrada</div>
            <div style={{ fontSize: 12.5, color: T.textTer, marginTop: 2 }}>
              Ábrela con el cambio que dejas en el cajón para poder cuadrarla al final del día.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={fondo}
              onChange={(e) => setFondo(e.target.value)}
              inputMode="decimal"
              style={{
                width: 90, boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
                border: `1px solid ${T.border}`, background: T.bg, color: T.text,
                fontSize: 14, fontWeight: 600,
              }}
            />
            <span style={{ fontSize: 13.5, color: T.textSec }}>€</span>
            <button
              onClick={abrir}
              disabled={abriendo}
              style={{
                padding: '10px 18px', borderRadius: 10, cursor: abriendo ? 'wait' : 'pointer',
                background: T.primary, border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700,
              }}
            >
              {abriendo ? 'Abriendo...' : 'Abrir caja'}
            </button>
          </div>
        </>
      )}

      {error && (
        <div style={{
          width: '100%', background: T.dangerSoft, border: `1px solid ${T.danger}`,
          borderRadius: 10, padding: '10px 12px', fontSize: 13, color: T.danger,
        }}>{error}</div>
      )}
    </div>
  );
}
