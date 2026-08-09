/**
 * Aviso (y bloqueo opcional) de fichaje al entrar en la aplicacion.
 *
 * Lo que dice la ley y lo que NO dice: el art. 34.9 ET obliga a la empresa a
 * registrar la jornada, no obliga a que el software se bloquee si no fichas.
 * Por eso esto viene DESACTIVADO de fabrica y tiene dos niveles, que se eligen
 * en Configuracion > Control horario:
 *
 *   · "Recordar fichar al entrar"      -> aviso arriba, no estorba.
 *   · "Exigir fichar para trabajar"    -> pantalla completa hasta fichar.
 *
 * Ni siquiera en el modo estricto se puede tapar "Mi jornada": la persona
 * trabajadora tiene derecho a consultar y descargar su registro de forma
 * inmediata, y ese acceso no se puede condicionar a nada.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname, router } from 'expo-router';
import { IS_DEMO_MODE } from '@/lib/supabase';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import {
  cargarConfigJornada, cargarEstadoJornada, fichar, fmtMinutos,
  type ConfigJornada, type JornadaEstado, type Modalidad,
} from '@/lib/jornada';

const T = DESIGN_TOKENS;
const CLAVE_APLAZADO = 'mecha:gate-fichaje-aplazado';

/** El aplazamiento dura lo que dure la pestana abierta, no mas. */
function estaAplazado(): boolean {
  try { return sessionStorage.getItem(CLAVE_APLAZADO) === '1'; } catch { return false; }
}
function aplazar() {
  try { sessionStorage.setItem(CLAVE_APLAZADO, '1'); } catch { /* modo incognito */ }
}

export function GateFichaje() {
  const pathname = usePathname();
  const [config, setConfig] = useState<ConfigJornada | null>(null);
  const [estado, setEstado] = useState<JornadaEstado | null>(null);
  const [modalidad, setModalidad] = useState<Modalidad>('presencial');
  const [fichando, setFichando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aplazado, setAplazado] = useState(estaAplazado);

  const refrescar = useCallback(async () => {
    if (IS_DEMO_MODE) return;
    try {
      const cfg = await cargarConfigJornada();
      setConfig(cfg);
      if (!cfg?.exigir_fichaje) return;
      setEstado(await cargarEstadoJornada());
    } catch {
      // Sin sesion o sin salon: el gate simplemente no aparece.
      setConfig(null);
    }
  }, []);

  useEffect(() => { refrescar(); }, [refrescar]);

  const ficharEntrada = async () => {
    setFichando(true);
    setError(null);
    try {
      const r = await fichar('entrada', { modalidad });
      if (!r?.ok) { setError(r?.error || 'No se ha podido registrar la entrada.'); return; }
      setEstado(await cargarEstadoJornada());
    } catch (e: any) {
      setError(e?.message || 'No se ha podido registrar la entrada.');
    } finally {
      setFichando(false);
    }
  };

  if (IS_DEMO_MODE) return null;
  if (!config?.exigir_fichaje) return null;
  if (!estado?.vinculado) return null;          // sin ficha de profesional no hay jornada que registrar
  if (estado.estado !== 'fuera') return null;   // ya esta dentro (o en pausa)

  const enMiJornada = (pathname || '').includes('mi-jornada');
  const bloquear = !!config.bloquear && !aplazado && !enMiJornada;

  const botones = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ display: 'flex', background: T.bg, borderRadius: 9, padding: 3, border: `1px solid ${T.border}` }}>
        {(['presencial', 'remoto'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModalidad(m)}
            style={{
              padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700,
              background: modalidad === m ? T.bgCard : 'transparent',
              color: modalidad === m ? T.text : T.textSec,
              boxShadow: modalidad === m ? '0 1px 3px rgba(40,30,24,0.12)' : 'none',
            }}
          >
            {m === 'presencial' ? 'Presencial' : 'Remoto'}
          </button>
        ))}
      </div>
      <button
        onClick={ficharEntrada}
        disabled={fichando}
        className="btn-interactive"
        style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', background: T.success,
          color: '#fff', fontSize: 14, fontWeight: 700, cursor: fichando ? 'not-allowed' : 'pointer',
        }}
      >
        {fichando ? 'Registrando…' : 'Fichar entrada'}
      </button>
    </div>
  );

  if (!bloquear) {
    // Aviso no intrusivo.
    return (
      <div style={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
        background: T.bgCard, border: `1px solid ${T.warning}55`, borderRadius: 12,
        boxShadow: '0 10px 30px rgba(40,30,24,0.14)', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 24px)',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>Aún no has fichado la entrada</div>
          <div style={{ fontSize: 12, color: T.textSec }}>
            Tu jornada de hoy empieza cuando fiches. {fmtMinutos(estado.minutos_hoy)} registrados.
          </div>
        </div>
        {botones}
        <button
          onClick={() => { aplazar(); setAplazado(true); }}
          style={{ background: 'none', border: 'none', color: T.textTer, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          aria-label="Cerrar aviso"
        >
          ×
        </button>
        {error && <div style={{ fontSize: 12, color: T.danger, width: '100%' }}>{error}</div>}
      </div>
    );
  }

  // Modo estricto: pantalla completa.
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(28,24,20,0.72)',
      display: 'grid', placeItems: 'center', padding: 20,
    }}>
      <div style={{
        background: T.bgCard, borderRadius: 16, border: `1px solid ${T.border}`,
        padding: 28, width: 'min(460px, 100%)', textAlign: 'center',
        boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          width: 54, height: 54, borderRadius: 999, background: T.warningSoft,
          display: 'grid', placeItems: 'center', margin: '0 auto 14px',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.warning}
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 19, color: T.text }}>Ficha tu entrada para empezar</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: T.textSec, lineHeight: 1.55 }}>
          En este salón hay que registrar la jornada antes de ponerse a trabajar. La hora la pone el
          sistema, no tú, y el asiento no se puede modificar después.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center' }}>{botones}</div>

        {error && <div style={{ fontSize: 12.5, color: T.danger, marginTop: 12 }}>{error}</div>}

        <button
          onClick={() => { aplazar(); setAplazado(true); router.push('/mi-jornada'); }}
          style={{
            marginTop: 18, background: 'none', border: 'none', color: T.textSec,
            fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer',
          }}
        >
          Solo quiero consultar mi registro de jornada
        </button>
      </div>
    </div>
  );
}
