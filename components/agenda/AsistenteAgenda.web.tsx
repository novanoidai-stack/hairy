import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ejecutarAccion, type AccionPropuesta } from '@/lib/agendaOps';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';

// Panel de chat IA para la agenda (web). Flota sobre la pantalla de agenda como
// burbuja en la esquina inferior derecha. En escritorio abre un panel lateral de
// ~380px; en movil un overlay a pantalla completa.

const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';

// Estilos de animacion para el panel
const PANEL_STYLES = `
  @keyframes asisPanelIn {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes asisMobileIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes asisBubbleIn {
    from { opacity: 0; transform: scale(0.7); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes asisMsgIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .asis-msg { animation: asisMsgIn 0.22s cubic-bezier(0.16,1,0.3,1); }
  .asis-panel { animation: asisPanelIn 0.28s cubic-bezier(0.16,1,0.3,1); }
  .asis-mobile { animation: asisMobileIn 0.28s cubic-bezier(0.16,1,0.3,1); }
  .asis-bubble { animation: asisBubbleIn 0.25s cubic-bezier(0.16,1,0.3,1); }
  @media (prefers-reduced-motion: reduce) {
    .asis-msg, .asis-panel, .asis-mobile, .asis-bubble { animation: none !important; }
  }
`;

type Mensaje = { role: 'user' | 'assistant'; content: string };

export interface AsistenteAgendaProps {
  negocioId: string;
  profile: { id: string; role?: string | null };
  onAgendaChanged: () => void;
}

// Icono SVG del asistente (estrella/brillo minimalista)
function IconoAsistente({ size = 22, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L17 20L12 16.9L7 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Icono de cerrar (X)
function IconoCerrar({ size = 18, color = T.textSecondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Icono de enviar
function IconoEnviar({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Icono de advertencia
function IconoAdvertencia({ size = 15, color = T.warning }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function AsistenteAgenda({ negocioId: _negocioId, profile, onAgendaChanged }: AsistenteAgendaProps) {
  const { isMobile } = useResponsive();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { role: 'assistant', content: 'Hola, soy tu asistente de agenda. Puedes pedirme que cree, reagende o cancele citas.' },
  ]);
  const [propuesta, setPropuesta] = useState<AccionPropuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [texto, setTexto] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stylesInjected = useRef(false);

  // Inyectar estilos de animacion una sola vez
  useEffect(() => {
    if (stylesInjected.current) return;
    stylesInjected.current = true;
    const el = document.createElement('style');
    el.textContent = PANEL_STYLES;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);

  // Scroll al ultimo mensaje cuando cambia la lista
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, propuesta]);

  // Focus al input cuando se abre el panel
  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 80);
  }, [abierto]);

  // Cierre con Escape
  useEffect(() => {
    if (!abierto) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abierto]);

  async function enviarMensaje() {
    const t = texto.trim();
    if (!t || cargando || propuesta) return;

    const nuevosMensajes: Mensaje[] = [...mensajes, { role: 'user' as const, content: t }];
    setMensajes(nuevosMensajes);
    setTexto('');
    setCargando(true);

    try {
      const { data, error } = await supabase.functions.invoke('agenda-asistente', {
        body: { mensajes: nuevosMensajes },
      });

      if (error || !data) {
        setMensajes((m) => [
          ...m,
          { role: 'assistant', content: 'Lo siento, hubo un problema al conectar con el asistente. Intentalo de nuevo.' },
        ]);
        return;
      }

      if (data.error) {
        setMensajes((m) => [
          ...m,
          { role: 'assistant', content: `No pude procesar la solicitud: ${data.error}` },
        ]);
        return;
      }

      setMensajes((m) => [...m, { role: 'assistant', content: data.texto }]);
      if (data.accion_propuesta) {
        setPropuesta(data.accion_propuesta as AccionPropuesta);
      }
    } finally {
      setCargando(false);
    }
  }

  async function confirmarPropuesta() {
    if (!propuesta) return;
    setCargando(true);
    try {
      const r = await ejecutarAccion(propuesta, profile.id);
      setMensajes((m) => [
        ...m,
        { role: 'assistant', content: r.ok ? r.mensaje : `No se pudo: ${r.error}` },
      ]);
      setPropuesta(null);
      if (r.ok) onAgendaChanged();
    } finally {
      setCargando(false);
    }
  }

  function cancelarPropuesta() {
    setPropuesta(null);
    setMensajes((m) => [...m, { role: 'assistant', content: 'Accion cancelada.' }]);
  }

  // Comprueba si la propuesta tiene solapamiento (solo las variantes que tienen el campo)
  function tieneSolapa(p: AccionPropuesta): boolean {
    return 'solapa' in p && (p as { solapa: boolean }).solapa;
  }

  // --- Renderizado ---

  const panelWidth = isMobile ? '100%' : 380;
  const panelHeight = isMobile ? '100%' : 560;

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        background: T.bgPanel,
        fontFamily: 'Inter, system-ui, sans-serif',
      }
    : {
        position: 'fixed',
        bottom: 88,
        right: 24,
        zIndex: 300,
        width: panelWidth,
        height: panelHeight,
        display: 'flex',
        flexDirection: 'column',
        background: T.bgPanel,
        border: `1px solid ${T.borderHi}`,
        borderRadius: 20,
        boxShadow: '0 24px 60px rgba(40,30,24,0.16)',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
      };

  return (
    <>
      {/* Burbuja flotante */}
      {!abierto && (
        <button
          className="asis-bubble"
          onClick={() => setAbierto(true)}
          aria-label="Abrir asistente de agenda"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 300,
            width: 54,
            height: 54,
            borderRadius: 999,
            border: 'none',
            background: FIRE,
            boxShadow: '0 8px 24px rgba(192,38,10,0.30)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 32px rgba(192,38,10,0.40)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(192,38,10,0.30)';
          }}
        >
          <IconoAsistente size={22} color="#fff" />
        </button>
      )}

      {/* Panel */}
      {abierto && (
        <>
          {/* Overlay en movil */}
          {isMobile && (
            <div
              onClick={() => setAbierto(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(8,6,4,0.40)' }}
            />
          )}

          <div className={isMobile ? 'asis-mobile' : 'asis-panel'} style={panelStyle}>
            {/* Cabecera */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 16px 12px',
                borderBottom: `1px solid ${T.border}`,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: FIRE,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <IconoAsistente size={17} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>
                  Asistente de agenda
                </div>
                <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>
                  IA · responde en segundos
                </div>
              </div>
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar asistente"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.bgCard,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <IconoCerrar size={15} color={T.textSecondary} />
              </button>
            </div>

            {/* Lista de mensajes */}
            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {mensajes.map((msg, i) => (
                <div
                  key={i}
                  className="asis-msg"
                  style={{
                    display: 'flex',
                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    gap: 7,
                    alignItems: 'flex-end',
                  }}
                >
                  {/* Avatar solo para asistente */}
                  {msg.role === 'assistant' && (
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: FIRE,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginBottom: 2,
                      }}
                    >
                      <IconoAsistente size={13} color="#fff" />
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '9px 12px',
                      borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background:
                        msg.role === 'user'
                          ? T.primary
                          : T.bgCard,
                      border: msg.role === 'user' ? 'none' : `1px solid ${T.border}`,
                      fontSize: 13.5,
                      fontWeight: 400,
                      color: msg.role === 'user' ? '#fff' : T.text,
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Indicador de carga (puntos animados) */}
              {cargando && (
                <div className="asis-msg" style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      background: FIRE,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <IconoAsistente size={13} color="#fff" />
                  </div>
                  <div
                    style={{
                      padding: '9px 14px',
                      borderRadius: '14px 14px 14px 4px',
                      background: T.bgCard,
                      border: `1px solid ${T.border}`,
                      display: 'flex',
                      gap: 4,
                      alignItems: 'center',
                    }}
                  >
                    {[0, 1, 2].map((n) => (
                      <div
                        key={n}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: T.textMuted,
                          animation: `pulse 1.2s ease-in-out ${n * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Tarjeta de confirmacion de accion propuesta */}
              {propuesta && (
                <div
                  className="asis-msg"
                  style={{
                    background: T.bgCard,
                    border: `1.5px solid ${T.borderHi}`,
                    borderRadius: 14,
                    padding: '12px 14px',
                    marginTop: 4,
                  }}
                >
                  {/* Resumen de la accion */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.45, marginBottom: 6 }}>
                    {propuesta.resumen}
                  </div>

                  {/* Advertencia de solapa */}
                  {tieneSolapa(propuesta) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 10px',
                        background: T.warningSoft,
                        borderRadius: 8,
                        marginBottom: 10,
                      }}
                    >
                      <IconoAdvertencia size={14} color={T.warning} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: T.warning }}>
                        Esta franja se solapa con otra cita
                      </span>
                    </div>
                  )}

                  {/* Botones */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={cancelarPropuesta}
                      disabled={cargando}
                      style={{
                        flex: 1,
                        padding: '9px 0',
                        borderRadius: 10,
                        border: `1.5px solid ${T.border}`,
                        background: T.bgPanel,
                        color: T.textSecondary,
                        fontSize: 13.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: cargando ? 0.6 : 1,
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmarPropuesta}
                      disabled={cargando}
                      style={{
                        flex: 2,
                        padding: '9px 0',
                        borderRadius: 10,
                        border: 'none',
                        background: FIRE,
                        color: '#fff',
                        fontSize: 13.5,
                        fontWeight: 700,
                        cursor: cargando ? 'default' : 'pointer',
                        opacity: cargando ? 0.7 : 1,
                        boxShadow: '0 6px 18px rgba(192,38,10,0.22)',
                      }}
                    >
                      {cargando ? 'Aplicando...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Input de texto */}
            <div
              style={{
                padding: '10px 12px 12px',
                borderTop: `1px solid ${T.border}`,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-end',
                  background: T.bgCard,
                  border: `1.5px solid ${propuesta ? T.border : T.borderHi}`,
                  borderRadius: 14,
                  padding: '8px 8px 8px 12px',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <input
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      enviarMensaje();
                    }
                  }}
                  disabled={!!propuesta || cargando}
                  placeholder={propuesta ? 'Confirma o cancela la accion primero...' : 'Escribe tu solicitud...'}
                  aria-label="Mensaje al asistente"
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    color: T.text,
                    fontSize: 13.5,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    outline: 'none',
                    resize: 'none',
                    lineHeight: 1.4,
                    cursor: propuesta ? 'not-allowed' : 'text',
                  }}
                />
                <button
                  onClick={enviarMensaje}
                  disabled={!texto.trim() || cargando || !!propuesta}
                  aria-label="Enviar mensaje"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: 'none',
                    background:
                      !texto.trim() || cargando || propuesta
                        ? T.bgCardHi
                        : FIRE,
                    cursor:
                      !texto.trim() || cargando || propuesta ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <IconoEnviar
                    size={16}
                    color={!texto.trim() || cargando || propuesta ? T.textMuted : '#fff'}
                  />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Keyframe pulse para los puntos de carga */}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
