import { useState, useRef, useEffect } from 'react';
// @ts-ignore react-dom no tiene @types instalado en este proyecto; createPortal existe en runtime.
import { createPortal } from 'react-dom';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { ejecutarAccion, type AccionPropuesta } from '@/lib/agendaOps';
import { normalizarRespuesta, type Bloque } from '@/lib/chispaBloques';
import { BloqueRenderer, type AccionEstado } from '@/components/chispa/BloqueRenderer.web';
import { ChispaMascota } from '@/components/chispa/ChispaMascota.web';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';

// Chispa — panel conversacional de la capa de IA (web). Drawer lateral que se
// abre desde una pestana fija en el borde derecho. Renderiza RESPUESTAS por
// BLOQUES TIPADOS (texto / enlace / accion) mediante BloqueRenderer.
// PR-12: el LLM propone; el profesional confirma. En la demo compartida los
// cambios NO se aplican de verdad (guardrail) y hay limite de mensajes.

const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';
const DEMO_LIMITE_MSGS = 15; // rate-limit por sesion en la demo compartida
const DEMO_COUNT_KEY = 'mecha-chispa-demo-msgs';

const PANEL_STYLES = `
  @keyframes chispaDrawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes chispaBackdropIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes chispaMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes chispaTabIn { from { opacity: 0; transform: translate(20px,-50%); } to { opacity: 1; transform: translate(0,-50%); } }
  @keyframes chispaDot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1); } }
  .chispa-msg { animation: chispaMsgIn 0.22s cubic-bezier(0.16,1,0.3,1); }
  .chispa-drawer { animation: chispaDrawerIn 0.30s cubic-bezier(0.16,1,0.3,1); }
  .chispa-backdrop { animation: chispaBackdropIn 0.25s ease; }
  .chispa-launch-tab { animation: chispaTabIn 0.3s cubic-bezier(0.16,1,0.3,1); }
  @media (prefers-reduced-motion: reduce) {
    .chispa-msg, .chispa-drawer, .chispa-backdrop, .chispa-launch-tab { animation: none !important; }
  }
`;

type Mensaje =
  | { role: 'user'; content: string }
  | { role: 'assistant'; bloques: Bloque[]; accionEstado: AccionEstado | null };

export interface ChispaPanelProps {
  negocioId: string;
  profile: { id: string; role?: string | null };
  onAgendaChanged: () => void;
}

function IconoCerrar({ size = 15, color = T.textSecondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconoEnviar({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BIENVENIDA: Mensaje = {
  role: 'assistant',
  bloques: [{
    tipo: 'texto',
    texto: 'Hola, soy Chispa, la IA del salon. Puedo crear, reagendar o cancelar citas, consultarte huecos y citas, y llevarte a la pantalla que necesites. ¿Que hacemos?',
  }],
  accionEstado: null,
};

export default function ChispaPanel({ negocioId: _negocioId, profile, onAgendaChanged }: ChispaPanelProps) {
  const { isMobile } = useResponsive();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([BIENVENIDA]);
  const [cargando, setCargando] = useState(false);
  const [texto, setTexto] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stylesInjected = useRef(false);

  // Rate-limit de la demo: contador por sesion (persistente entre recargas del iframe).
  const demoCount = useRef<number>(0);
  useEffect(() => {
    if (!IS_DEMO_MODE || typeof sessionStorage === 'undefined') return;
    demoCount.current = Number(sessionStorage.getItem(DEMO_COUNT_KEY) || '0') || 0;
  }, []);

  // ¿Hay una accion propuesta sin resolver? Mientras la haya, el input se bloquea
  // (una operacion a la vez, igual que el flujo anterior).
  const hayAccionPendiente = mensajes.some(
    (m) => m.role === 'assistant' && m.accionEstado === 'pendiente',
  );
  const bloqueado = cargando || hayAccionPendiente;

  useEffect(() => {
    if (stylesInjected.current) return;
    stylesInjected.current = true;
    const el = document.createElement('style');
    el.textContent = PANEL_STYLES;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, abierto]);

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 120);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abierto]);

  // Historial en texto plano para dar contexto al edge (los bloques se aplanan).
  function historialParaEdge(msgs: Mensaje[]): { role: 'user' | 'assistant'; content: string }[] {
    return msgs.map((m) => {
      if (m.role === 'user') return { role: 'user' as const, content: m.content };
      const content = m.bloques
        .map((b) =>
          b.tipo === 'texto' ? b.texto
          : b.tipo === 'enlace' ? `[enlace: ${b.label}]`
          : `[accion propuesta: ${b.accion.resumen}]`,
        )
        .join('\n');
      return { role: 'assistant' as const, content };
    });
  }

  function pushAssistantTexto(t: string) {
    setMensajes((m) => [...m, { role: 'assistant', bloques: [{ tipo: 'texto', texto: t }], accionEstado: null }]);
  }

  async function enviarMensaje() {
    const t = texto.trim();
    if (!t || bloqueado) return;

    // Guardrail demo: limite de mensajes por sesion (protege el coste del LLM en
    // la cuenta publica compartida). En cuentas reales no hay limite.
    if (IS_DEMO_MODE) {
      if (demoCount.current >= DEMO_LIMITE_MSGS) {
        setMensajes((m) => [...m, { role: 'user', content: t }]);
        setTexto('');
        pushAssistantTexto('Has alcanzado el limite de mensajes de esta demo. En una cuenta real de Mecha no hay limite: Chispa te acompana todo el dia.');
        return;
      }
      demoCount.current += 1;
      try { sessionStorage.setItem(DEMO_COUNT_KEY, String(demoCount.current)); } catch { /* no critico */ }
    }

    const nuevos: Mensaje[] = [...mensajes, { role: 'user', content: t }];
    setMensajes(nuevos);
    setTexto('');
    setCargando(true);

    try {
      const { data, error } = await supabase.functions.invoke('agenda-asistente', {
        body: { mensajes: historialParaEdge(nuevos) },
      });

      if (error || !data) {
        pushAssistantTexto('Lo siento, hubo un problema al conectar con Chispa. Intentalo de nuevo.');
        return;
      }
      if ((data as { error?: string }).error) {
        pushAssistantTexto(`No pude procesar la solicitud: ${(data as { error?: string }).error}`);
        return;
      }

      const bloques = normalizarRespuesta(data);
      const tieneAccion = bloques.some((b) => b.tipo === 'accion');
      setMensajes((m) => [...m, { role: 'assistant', bloques, accionEstado: tieneAccion ? 'pendiente' : null }]);
    } finally {
      setCargando(false);
    }
  }

  function setAccionEstado(msgIndex: number, estado: AccionEstado) {
    setMensajes((m) => m.map((msg, i) =>
      i === msgIndex && msg.role === 'assistant' ? { ...msg, accionEstado: estado } : msg,
    ));
  }

  async function confirmarAccion(msgIndex: number, accion: AccionPropuesta) {
    setAccionEstado(msgIndex, 'aplicando');

    // Guardrail demo: nunca se ejecuta una escritura real sobre el tenant
    // compartido. Se simula el resultado para que el prospecto vea el flujo
    // propone -> confirma completo sin ensuciar los datos de la demo.
    if (IS_DEMO_MODE) {
      setAccionEstado(msgIndex, 'aplicada');
      pushAssistantTexto('Hecho (demostracion). En la demo los cambios no se guardan de verdad; en tu cuenta esta accion se aplicaria al instante.');
      return;
    }

    const r = await ejecutarAccion(accion, profile.id);
    if (r.ok) {
      setAccionEstado(msgIndex, 'aplicada');
      pushAssistantTexto(r.mensaje);
      onAgendaChanged();
    } else {
      // Fallo: la tarjeta queda resuelta y se explica; el usuario puede volver a pedirlo.
      setAccionEstado(msgIndex, 'cancelada');
      pushAssistantTexto(`No se pudo aplicar: ${r.error}. Puedes pedirmelo de nuevo si quieres.`);
    }
  }

  function cancelarAccion(msgIndex: number) {
    setAccionEstado(msgIndex, 'cancelada');
    pushAssistantTexto('Accion cancelada.');
  }

  const drawerWidth = isMobile ? '100%' : 400;

  const contenido = (
    <>
      {/* Pestana lanzadora (borde derecho) cuando esta cerrado */}
      {!abierto && (
        <button
          className="chispa-launch-tab"
          onClick={() => setAbierto(true)}
          aria-label="Abrir Chispa, la IA del salon"
          style={{
            position: 'fixed', top: '50%', right: 0, transform: 'translateY(-50%)',
            zIndex: 2147483000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '12px 8px 14px', border: 'none', borderRadius: '14px 0 0 14px',
            background: FIRE, color: '#fff', boxShadow: '0 8px 24px rgba(192,38,10,0.32)', cursor: 'pointer',
            transition: 'padding 0.15s ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.paddingRight = '12px'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.paddingRight = '8px'; }}
        >
          <ChispaMascota size={26} showLabel={false} animar={false} />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, fontWeight: 700, letterSpacing: 0.3, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Chispa
          </span>
        </button>
      )}

      {/* Drawer abierto */}
      {abierto && (
        <>
          {isMobile && (
            <div className="chispa-backdrop" onClick={() => setAbierto(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 2147482999, background: 'rgba(8,6,4,0.40)' }} />
          )}

          <div className="chispa-drawer" style={{
            position: 'fixed', top: 0, right: 0, height: '100%', width: drawerWidth, zIndex: 2147483000,
            display: 'flex', flexDirection: 'column', background: T.bgPanel,
            borderLeft: `1px solid ${T.border}`, boxShadow: '-18px 0 50px rgba(40,30,24,0.16)',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <ChispaMascota size={30} showLabel={false} animar={false} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>Chispa</div>
                <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>IA · asistente del salon</div>
              </div>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar Chispa"
                style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconoCerrar size={15} color={T.textSecondary} />
              </button>
            </div>

            {/* Lista de mensajes */}
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mensajes.map((msg, i) => {
                if (msg.role === 'user') {
                  return (
                    <div key={i} className="chispa-msg" style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-end' }}>
                      <div style={{
                        maxWidth: '80%', padding: '9px 12px', borderRadius: '14px 14px 4px 14px',
                        background: T.primary, fontSize: 13.5, color: '#fff', lineHeight: 1.5,
                        wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                // Assistant: avatar + columna de bloques
                return (
                  <div key={i} className="chispa-msg" style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      <ChispaMascota size={22} showLabel={false} animar={false} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, maxWidth: '84%' }}>
                      {msg.bloques.map((b, j) => (
                        <BloqueRenderer
                          key={j}
                          bloque={b}
                          accionEstado={msg.accionEstado ?? 'pendiente'}
                          onConfirmar={b.tipo === 'accion' ? () => confirmarAccion(i, b.accion) : undefined}
                          onCancelar={b.tipo === 'accion' ? () => cancelarAccion(i) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {cargando && (
                <div className="chispa-msg" style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
                  <div style={{ flexShrink: 0 }}><ChispaMascota size={22} showLabel={false} /></div>
                  <div style={{ padding: '9px 14px', borderRadius: '14px 14px 14px 4px', background: T.bgCard, border: `1px solid ${T.border}`, display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 1, 2].map((n) => (
                      <div key={n} style={{ width: 6, height: 6, borderRadius: 999, background: T.textMuted, animation: `chispaDot 1.2s ease-in-out ${n * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: '10px 12px 12px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: T.bgCard, border: `1.5px solid ${hayAccionPendiente ? T.border : T.borderHi}`, borderRadius: 14, padding: '8px 8px 8px 12px', transition: 'border-color 0.15s ease' }}>
                <input
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); } }}
                  disabled={bloqueado}
                  placeholder={hayAccionPendiente ? 'Confirma o cancela la accion primero...' : 'Escribe tu solicitud...'}
                  aria-label="Mensaje para Chispa"
                  style={{ flex: 1, border: 'none', background: 'transparent', color: T.text, fontSize: 13.5, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', lineHeight: 1.4, cursor: hayAccionPendiente ? 'not-allowed' : 'text' }}
                />
                <button onClick={enviarMensaje} disabled={!texto.trim() || bloqueado} aria-label="Enviar mensaje"
                  style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: !texto.trim() || bloqueado ? T.bgCardHi : FIRE, cursor: !texto.trim() || bloqueado ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s ease' }}>
                  <IconoEnviar size={16} color={!texto.trim() || bloqueado ? T.textMuted : '#fff'} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  // Portal a document.body: el fixed se ancla al viewport, no a ancestros con transform.
  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(contenido, document.body);
}
