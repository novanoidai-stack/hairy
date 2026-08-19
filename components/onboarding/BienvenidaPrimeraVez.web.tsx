// Bienvenida a pantalla completa, SOLO la primera vez que el duenio entra al
// software. No es el checklist (ese es OnboardingPanel, y sigue viviendo aparte):
// esto es el momento de llegada. Tres escenas cortas, sin scroll, sin decisiones
// que no sean necesarias:
//
//   1. Saludo con el nombre del salon y que tiene 30 dias de Esencial.
//   2. Como entra su equipo (solo si nadie lo ha elegido ya en Ajustes).
//   3. Que hace falta para operar, y a la faena.
//
// La escena 2 se salta entera si `acceso_salon_estado().configurado` es true: no
// se pregunta dos veces lo mismo.
//
// Persistencia en el SERVIDOR (negocio_config.config.bienvenidaVista), no en
// localStorage: si no, reaparece en cada navegador y en cada ordenador del salon.
//
// Motion: una sola curva (T_CURVA) para todo, escenas que entran con desenfoque y
// se van hacia el lado contrario, y contenido escalonado. Todo se apaga con
// prefers-reduced-motion: la animacion nunca es el vehiculo de la informacion.

import { useCallback, useEffect, useMemo, useState } from 'react';
// @ts-ignore react-dom no tiene @types instalado en este proyecto; createPortal existe en runtime.
import { createPortal } from 'react-dom';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { supabase } from '@/lib/supabase';
import { CORE_STEP_IDS, ONBOARDING_STEPS } from '@/lib/onboarding';
import { OIcon } from './OnboardingIcons';

const CURVA = 'cubic-bezier(0.16,1,0.3,1)';

interface Props {
  isMobile: boolean;
  negocioId: string;
  nombre: string;              // nombre de pila de quien entra
  nombreSalon: string;
  trialEndsAt: string | null;  // profiles.trial_ends_at
  onCerrar: (abrirChecklist: boolean) => void;
}

// Dias que quedan de prueba, o null si no hay prueba viva. Se redondea hacia
// arriba para no decir "0 dias" a alguien que aun tiene la tarde por delante.
function diasDePrueba(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const fin = new Date(trialEndsAt).getTime();
  if (Number.isNaN(fin)) return null;
  const dias = Math.ceil((fin - Date.now()) / 86400000);
  return dias > 0 ? dias : null;
}

const ANIM = `
  @keyframes bvFondo   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes bvEntra   { from { opacity: 0; transform: translateY(18px) scale(0.985); filter: blur(7px); }
                         to   { opacity: 1; transform: translateY(0) scale(1);        filter: blur(0); } }
  @keyframes bvSube    { from { opacity: 0; transform: translateY(14px); }
                         to   { opacity: 1; transform: translateY(0); } }
  @keyframes bvAurora  { 0%   { transform: translate3d(-6%, -4%, 0) scale(1); }
                         50%  { transform: translate3d(6%, 4%, 0) scale(1.12); }
                         100% { transform: translate3d(-6%, -4%, 0) scale(1); } }
  @keyframes bvBarra   { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  .bv-escena > * { animation: bvSube 0.62s ${CURVA} both; }
  .bv-escena > *:nth-child(1) { animation-delay: 0.06s; }
  .bv-escena > *:nth-child(2) { animation-delay: 0.14s; }
  .bv-escena > *:nth-child(3) { animation-delay: 0.22s; }
  .bv-escena > *:nth-child(4) { animation-delay: 0.30s; }
  .bv-escena > *:nth-child(5) { animation-delay: 0.38s; }

  .bv-opcion { transition: transform 0.32s ${CURVA}, border-color 0.2s ease, box-shadow 0.32s ${CURVA}, background 0.2s ease; }
  .bv-opcion:hover { transform: translateY(-3px); }
  .bv-cta { transition: transform 0.28s ${CURVA}, box-shadow 0.28s ${CURVA}, filter 0.2s ease; }
  .bv-cta:hover { transform: translateY(-2px); filter: saturate(1.06); }
  .bv-cta:active { transform: translateY(0) scale(0.985); }
  .bv-paso { animation: bvSube 0.5s ${CURVA} both; }

  @media (prefers-reduced-motion: reduce) {
    .bv-raiz *, .bv-raiz { animation: none !important; transition: none !important; filter: none !important; }
  }
`;

export default function BienvenidaPrimeraVez({
  isMobile, negocioId, nombre, nombreSalon, trialEndsAt, onCerrar,
}: Props) {
  const diasPrueba = useMemo(() => diasDePrueba(trialEndsAt), [trialEndsAt]);
  // -1 = aun no sabemos si hay que preguntar el modo de acceso (no pintamos nada
  // hasta saberlo: entrar y que la escena 2 aparezca/desaparezca seria peor).
  const [preguntarModo, setPreguntarModo] = useState<boolean | null>(null);
  const [escena, setEscena] = useState(0);
  const [modo, setModo] = useState<'individual' | 'compartido'>('individual');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('acceso_salon_estado').then(({ data, error }) => {
      if (!vivo) return;
      // Si la RPC falla, preferimos NO preguntar: el selector vive tambien en
      // Ajustes > Accesos y roles y alli no se pierde nada.
      const d = (data ?? {}) as { configurado?: boolean };
      setPreguntarModo(!error && d.configurado !== true);
    });
    return () => { vivo = false; };
  }, []);

  const escenas = useMemo(
    () => (preguntarModo ? ['saludo', 'acceso', 'marcha'] : ['saludo', 'marcha']),
    [preguntarModo],
  );

  // Marca la bienvenida como vista para este salon. Lectura + escritura del jsonb
  // entero: es el patron que ya usan Ajustes y Clientes sobre negocio_config.
  const marcarVista = useCallback(async () => {
    const { data: row } = await supabase
      .from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
    const cfg: Record<string, unknown> = (row?.config && typeof row.config === 'object')
      ? (row.config as Record<string, unknown>) : {};
    await supabase.from('negocio_config').upsert(
      { negocio_id: negocioId, config: { ...cfg, bienvenidaVista: true }, updated_at: new Date().toISOString() },
      { onConflict: 'negocio_id' },
    );
  }, [negocioId]);

  const salir = useCallback(async (abrirChecklist: boolean) => {
    // Se cierra ya y se persiste por detras: esperar a la red para quitar un
    // overlay que el usuario acaba de despedir se nota como lentitud.
    onCerrar(abrirChecklist);
    void marcarVista();
  }, [marcarVista, onCerrar]);

  const avanzar = useCallback(async () => {
    const actual = escenas[escena];
    if (actual === 'acceso') {
      setGuardando(true);
      const { error } = await supabase.rpc('set_acceso_salon_modo', { p_modo: modo });
      setGuardando(false);
      // Un fallo aqui no bloquea la bienvenida: el modo se puede cambiar en
      // Ajustes y el valor por defecto (individual) es el recomendado.
      if (error) console.error('set_acceso_salon_modo:', error.message);
    }
    if (escena >= escenas.length - 1) { void salir(true); return; }
    setEscena((n) => n + 1);
  }, [escena, escenas, modo, salir]);

  if (preguntarModo === null) return null;

  const nombreCorto = (nombre || '').trim().split(/\s+/)[0] || '';
  const actual = escenas[escena];
  const pasosCore = ONBOARDING_STEPS.filter((s) => CORE_STEP_IDS.includes(s.id));

  // PORTAL AL BODY, obligatorio. La agenda anida esto dentro de ~14 divs con
  // `z-index: 0`, y cada uno de esos crea su propio contexto de apilamiento: desde
  // dentro, ningun z-index por alto que sea puede superar al cajon de Chispa, que
  // cuelga del body. Es el mismo motivo por el que ChispaPanel usa createPortal.
  const contenido = (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div
        className="bv-raiz"
        role="dialog"
        aria-modal="true"
        aria-label="Bienvenida a Mecha"
        style={{
          // Por encima de TODO, incluido el cajon de Chispa (z 2147483000), que se
          // abre solo en cuentas nuevas para su onboarding conversacional. Es la
          // primera pantalla que ve el salon: nada puede taparla. Cuando se cierra,
          // Chispa sigue ahi con su guia paso a paso.
          position: 'fixed', inset: 0, zIndex: 2147483100, background: T.bg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: `bvFondo 0.5s ease both`,
        }}
      >
        {/* Aurora: dos manchas del gradiente de marca, muy difuminadas y en
            movimiento lento. Es el unico adorno; el resto es tipografia. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', top: '-28%', left: '-12%', width: '70vw', height: '70vw',
            background: 'radial-gradient(circle at 50% 50%, rgba(244,80,30,0.20), rgba(244,80,30,0) 62%)',
            animation: `bvAurora 22s ease-in-out infinite`,
          }} />
          <div style={{
            position: 'absolute', bottom: '-34%', right: '-16%', width: '62vw', height: '62vw',
            background: 'radial-gradient(circle at 50% 50%, rgba(255,207,74,0.22), rgba(255,207,74,0) 60%)',
            animation: `bvAurora 27s ease-in-out infinite reverse`,
          }} />
        </div>

        {/* Cabecera: marca + saltar */}
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '18px 20px' : '24px 34px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9,
              background: T.fireGradient,
            }}>
              <OIcon name="sparkles" size={16} color="#fff" />
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2, color: T.text }}>Mecha</span>
          </div>
          <button
            onClick={() => void salir(false)}
            style={{
              background: 'none', border: 'none', color: T.textTer, fontSize: 13,
              fontWeight: 600, cursor: 'pointer', padding: '8px 4px',
            }}
          >
            Saltar
          </button>
        </div>

        {/* Escena */}
        <div style={{
          position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: isMobile ? '8px 20px 24px' : '0 34px 24px',
        }}>
          <div
            key={actual}
            className="bv-escena"
            style={{
              width: '100%', maxWidth: actual === 'acceso' ? 760 : 620,
              animation: `bvEntra 0.72s ${CURVA} both`,
            }}
          >
            {actual === 'saludo' && (
              <>
                <div style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
                  color: T.primaryHi, marginBottom: 14,
                }}>
                  Todo listo
                </div>
                <h1 style={{
                  margin: 0, fontSize: isMobile ? 34 : 52, lineHeight: 1.04, letterSpacing: -1.4,
                  fontWeight: 800, color: T.text,
                }}>
                  {nombreCorto ? `Hola, ${nombreCorto}.` : 'Hola.'}
                  <br />
                  <span style={{
                    background: T.fireGradient, WebkitBackgroundClip: 'text',
                    backgroundClip: 'text', color: 'transparent',
                  }}>
                    {nombreSalon || 'Tu salón'}
                  </span>{' '}
                  ya es tuyo aquí.
                </h1>
                <p style={{
                  margin: '20px 0 0', fontSize: isMobile ? 15.5 : 17, lineHeight: 1.55,
                  color: T.textSec, maxWidth: 520,
                }}>
                  {diasPrueba !== null
                    ? `Tienes ${diasPrueba} ${diasPrueba === 1 ? 'día' : 'días'} con el software completo, sin tarjeta y sin permanencia. Vamos a dejarlo funcionando en unos minutos.`
                    : 'Vamos a dejar tu salón funcionando en unos minutos.'}
                </p>
                <div style={{ marginTop: 34 }}>
                  <CtaPrincipal isMobile={isMobile} onClick={avanzar}>Empezar</CtaPrincipal>
                </div>
              </>
            )}

            {actual === 'acceso' && (
              <>
                <h2 style={{
                  margin: 0, fontSize: isMobile ? 26 : 36, lineHeight: 1.1, letterSpacing: -0.9,
                  fontWeight: 800, color: T.text,
                }}>
                  ¿Cómo entrará tu equipo?
                </h2>
                <p style={{ margin: '12px 0 0', fontSize: isMobile ? 14.5 : 15.5, lineHeight: 1.55, color: T.textSec }}>
                  Puedes cambiarlo cuando quieras en Ajustes.
                </p>
                <div style={{
                  display: 'grid', gap: 14, marginTop: 26,
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                }}>
                  <OpcionModo
                    activa={modo === 'individual'}
                    onClick={() => setModo('individual')}
                    icono="users"
                    titulo="Cada uno con su correo"
                    desc="Cada profesional entra desde su móvil con su cuenta. Queda registrado quién hace qué."
                    etiqueta="Recomendado"
                  />
                  <OpcionModo
                    activa={modo === 'compartido'}
                    onClick={() => setModo('compartido')}
                    icono="store"
                    titulo="Un solo correo para el salón"
                    desc="Se entra con la cuenta del propietario desde el mostrador y se elige la ficha al empezar."
                  />
                </div>
                <div style={{ marginTop: 30 }}>
                  <CtaPrincipal isMobile={isMobile} onClick={avanzar} disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Continuar'}
                  </CtaPrincipal>
                </div>
              </>
            )}

            {actual === 'marcha' && (
              <>
                <h2 style={{
                  margin: 0, fontSize: isMobile ? 26 : 36, lineHeight: 1.1, letterSpacing: -0.9,
                  fontWeight: 800, color: T.text,
                }}>
                  Cinco cosas y a trabajar.
                </h2>
                <p style={{ margin: '12px 0 0', fontSize: isMobile ? 14.5 : 15.5, lineHeight: 1.55, color: T.textSec }}>
                  Es lo mínimo para que la agenda sepa a quién, cuándo y por cuánto. Te vamos guiando.
                </p>
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {pasosCore.map((paso, i) => (
                    <div
                      key={paso.id}
                      className="bv-paso"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 13, padding: '13px 4px',
                        borderBottom: i < pasosCore.length - 1 ? `1px solid ${T.border}` : 'none',
                        animationDelay: `${0.34 + i * 0.07}s`,
                      }}
                    >
                      <span style={{
                        display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10,
                        background: T.primarySoft, flexShrink: 0,
                      }}>
                        <OIcon name={paso.icon} size={16} color={T.primaryHi} />
                      </span>
                      <span style={{ fontSize: isMobile ? 14.5 : 15, fontWeight: 600, color: T.text }}>
                        {paso.titulo}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 30 }}>
                  <CtaPrincipal isMobile={isMobile} onClick={avanzar}>Poner en marcha mi salón</CtaPrincipal>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Progreso: barras finas, una por escena. */}
        <div style={{
          position: 'relative', display: 'flex', gap: 6, justifyContent: 'center',
          padding: isMobile ? '0 20px 26px' : '0 34px 32px', flexShrink: 0,
        }}>
          {escenas.map((e, i) => (
            <span
              key={e}
              style={{
                width: 34, height: 3, borderRadius: 999, overflow: 'hidden',
                background: 'rgba(40,30,24,0.12)',
              }}
            >
              <span style={{
                display: 'block', width: '100%', height: '100%', borderRadius: 999,
                background: i <= escena ? T.primary : 'transparent',
                transformOrigin: 'left',
                animation: i === escena ? `bvBarra 0.6s ${CURVA} both` : 'none',
              }} />
            </span>
          ))}
        </div>
      </div>
    </>
  );

  return typeof document !== 'undefined' ? createPortal(contenido, document.body) : contenido;
}

function CtaPrincipal({ children, onClick, disabled, isMobile }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  isMobile: boolean;
}) {
  return (
    <button
      className="bv-cta"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        width: isMobile ? '100%' : undefined,
        padding: isMobile ? '15px 22px' : '14px 28px',
        background: T.fireGradient, border: 'none', borderRadius: 12, color: '#fff',
        fontSize: 15, fontWeight: 700, letterSpacing: -0.1,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
        boxShadow: '0 10px 26px rgba(244,80,30,0.28)',
      }}
    >
      {children}
      <OIcon name="arrowRight" size={17} color="#fff" />
    </button>
  );
}

function OpcionModo({ activa, onClick, icono, titulo, desc, etiqueta }: {
  activa: boolean;
  onClick: () => void;
  icono: string;
  titulo: string;
  desc: string;
  etiqueta?: string;
}) {
  return (
    <button
      className="bv-opcion"
      onClick={onClick}
      aria-pressed={activa}
      style={{
        textAlign: 'left', padding: 18, borderRadius: 16, cursor: 'pointer',
        background: activa ? T.bgCard : 'rgba(255,255,255,0.55)',
        border: `1px solid ${activa ? T.primary : T.border}`,
        boxShadow: activa ? '0 14px 34px rgba(244,80,30,0.16)' : '0 2px 10px rgba(20,12,6,0.04)',
        display: 'flex', flexDirection: 'column', gap: 9, font: 'inherit',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 11,
          background: activa ? T.primary : T.primarySoft, flexShrink: 0,
        }}>
          <OIcon name={icono} size={18} color={activa ? '#fff' : T.primaryHi} />
        </span>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{titulo}</span>
        {etiqueta && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
            textTransform: 'uppercase', color: T.primaryHi, background: T.primarySoft,
            borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap',
          }}>
            {etiqueta}
          </span>
        )}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: T.textSec }}>{desc}</span>
    </button>
  );
}
