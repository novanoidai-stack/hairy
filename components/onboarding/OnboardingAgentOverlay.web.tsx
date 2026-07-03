// components/onboarding/OnboardingAgentOverlay.web.tsx
// Asistente de onboarding con IA: pantalla completa, "fotogramas" (no chat)
// que sustituyen al anterior, uno por tema, con un unico bloque de
// interaccion centrado. La IA solo redacta/interpreta; el ORDEN y la
// EJECUCION las controla este componente (ver lib/onboardingAgent.ts).
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { useOnboardingStatus } from '@/lib/hooks/useOnboardingStatus';
import {
  TEMA_ORDEN, TEMA_FALLBACK, TEMA_TITULO_SECCION, TEMA_DESTINO_MANUAL, HORARIO_PRESETS, TEMA_CAMPOS_SIMPLES,
  pedirPregunta, interpretarRespuesta, ejecutarAccion,
  type TemaId,
} from '@/lib/onboardingAgent';

type Fase = 'cerrado' | 'bienvenida' | 'pregunta' | 'ejecutando' | 'recibo' | 'confirmar_riesgo' | 'cerrando';

const FLAG_PREFIX = 'mecha-onboarding-agent:';

export function OnboardingAgentOverlay() {
  const { isMobile } = useResponsive();
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [elegible, setElegible] = useState(false);
  const [fase, setFase] = useState<Fase>('cerrado');
  const [temaIdx, setTemaIdx] = useState(0);
  const [pregunta, setPregunta] = useState<{ titulo: string; subtitulo?: string; placeholder_ejemplo?: string }>({ titulo: '' });
  const [respuesta, setRespuesta] = useState('');
  const [recibo, setRecibo] = useState<{ ok: boolean; resumen: string } | null>(null);
  const [accionPendiente, setAccionPendiente] = useState<{ tipo: string; args: Record<string, any> } | null>(null);
  const [cargandoPregunta, setCargandoPregunta] = useState(false);
  const [perfil, setPerfil] = useState<{ codigoPostal?: string; nombreNegocio?: string }>({});
  // Se activa si interpretarRespuesta devuelve null (fallo/timeout): el
  // fotograma cae a un formulario simple y determinista para ese tema
  // (requisito de robustez, spec seccion 6). Se resetea al cambiar de tema.
  const [fallbackActivo, setFallbackActivo] = useState(false);
  const [camposSimples, setCamposSimples] = useState<Record<string, string>>({});
  // Mensaje breve si interpretarRespuesta falla en un tema SIN formulario
  // simple definido (hoy solo horario_salon, que ya tiene los presets siempre
  // visibles como alternativa sin IA).
  const [errorTexto, setErrorTexto] = useState('');
  // Cuando crear_profesional viene con quiere_invitar=true: el ALTA del
  // profesional se ejecuta sin friccion de inmediato (no es una accion
  // riesgosa); el ENVIO DEL EMAIL queda en cola para pedir confirmacion
  // explicita justo despues de mostrar el recibo del alta (spec, decision 5:
  // solo el email real y activar el portal publico piden confirmar).
  const [invitacionPendiente, setInvitacionPendiente] = useState<{ profesionalId: string; nombre: string; email: string } | null>(null);

  // Contexto de ejecucion persistido durante toda la sesion del asistente
  // (profesionales creados para aplicar el horario, datos de negocio para
  // reutilizar en la activacion del portal).
  const ctxRef = useRef({ negocioId: '', profesionalesCreados: [] as { id: string; nombre: string }[], datosNegocioSesion: undefined as { nombre: string; direccion: string; telefono: string } | undefined });

  const status = useOnboardingStatus(elegible ? negocioId : null, elegible);

  // Elegibilidad: mismo criterio exacto que el checklist manual (AgendaCalendar.web.tsx).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancel = false;
    (async () => {
      const profile = await getUserProfile();
      if (cancel || !profile) return;
      const esGestor = profile.role === 'owner' || profile.role === 'admin';
      const ok = esGestor && !IS_DEMO_MODE && profile.negocio_id !== 'demo_salon_001';
      setNegocioId(profile.negocio_id ?? null);
      setPerfil({ codigoPostal: profile.codigo_postal, nombreNegocio: profile.nombre_negocio });
      setElegible(ok);
      ctxRef.current.negocioId = profile.negocio_id ?? '';
    })();
    return () => { cancel = true; };
  }, []);

  // Disparo automatico, una sola vez: en cuanto sabemos que esta elegible, el
  // nucleo no esta completo, y no se ha mostrado antes en este navegador.
  useEffect(() => {
    if (!elegible || !negocioId || !status.ready || fase !== 'cerrado') return;
    if (status.coreDone) return;
    const key = `${FLAG_PREFIX}${negocioId}`;
    if (typeof window === 'undefined' || window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, JSON.stringify({ shown: true }));
    setFase('bienvenida');
  }, [elegible, negocioId, status.ready, status.coreDone, fase]);

  if (Platform.OS !== 'web' || fase === 'cerrado') return null;

  const cerrar = () => setFase('cerrando');

  if (fase === 'cerrando') return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#ffffff' }} className="m-overlay-enter">
      {fase === 'bienvenida' && <FotogramaBienvenida isMobile={isMobile} onEmpezar={() => avanzarATema(0)} onSaltar={cerrar} />}
      {(fase === 'pregunta' || fase === 'ejecutando') && (
        <FotogramaPregunta
          key={`pregunta-${temaIdx}`}
          isMobile={isMobile}
          seccion={TEMA_TITULO_SECCION[TEMA_ORDEN[temaIdx]]}
          destinoManual={TEMA_DESTINO_MANUAL[TEMA_ORDEN[temaIdx]]}
          progreso={(temaIdx + 1) / TEMA_ORDEN.length}
          pregunta={pregunta}
          cargando={cargandoPregunta}
          ejecutando={fase === 'ejecutando'}
          modoInput={TEMA_FALLBACK[TEMA_ORDEN[temaIdx]].modoInput}
          valor={respuesta}
          onCambiar={setRespuesta}
          onEnviar={() => enviarRespuesta()}
          onSaltar={() => avanzarATema(temaIdx + 1)}
          onCerrar={cerrar}
          onBoton={(activar) => responderDirecto(TEMA_ORDEN[temaIdx] === 'reserva_online' ? 'activar_reserva_online' : 'activar_notificaciones', { activar })}
          presets={TEMA_ORDEN[temaIdx] === 'horario_salon' ? HORARIO_PRESETS : undefined}
          onPreset={(dias) => responderDirecto('fijar_horario_salon', { dias })}
          fallbackActivo={fallbackActivo}
          camposSimplesDef={TEMA_CAMPOS_SIMPLES[TEMA_ORDEN[temaIdx]]}
          camposSimples={camposSimples}
          onCambiarCampoSimple={(key, v) => setCamposSimples((prev) => ({ ...prev, [key]: v }))}
          onEnviarCamposSimples={() => enviarCamposSimples()}
          errorTexto={errorTexto}
        />
      )}
      {fase === 'confirmar_riesgo' && accionPendiente && (
        <FotogramaConfirmarRiesgo
          isMobile={isMobile}
          accion={accionPendiente}
          onConfirmar={() => ejecutarYMostrarRecibo(accionPendiente)}
          onCancelar={() => avanzarATema(temaIdx + 1)}
        />
      )}
      {fase === 'recibo' && recibo && (
        <FotogramaRecibo
          isMobile={isMobile}
          recibo={recibo}
          esUltimoTema={temaIdx >= TEMA_ORDEN.length - 1}
          permiteAnadirOtro={TEMA_ORDEN[temaIdx] === 'servicios' || TEMA_ORDEN[temaIdx] === 'equipo'}
          onAnadirOtro={() => { setRespuesta(''); void cargarPregunta(temaIdx); }}
          onContinuar={() => continuarDesdeRecibo()}
        />
      )}
    </div>
  );

  // ---- logica interna ----
  async function cargarPregunta(idx: number) {
    // Limpia estado transitorio de la pregunta anterior (fallback, campos
    // simples, error): tanto al avanzar de tema como al "+ Anadir otro" del
    // mismo tema deben empezar limpios.
    setFallbackActivo(false);
    setCamposSimples({});
    setErrorTexto('');
    setCargandoPregunta(true);
    setFase('pregunta');
    const tema = TEMA_ORDEN[idx];
    const p = await pedirPregunta(tema, status.done, perfil);
    setPregunta(p);
    setCargandoPregunta(false);
  }

  function avanzarATema(idx: number) {
    if (idx >= TEMA_ORDEN.length) { cerrar(); return; }
    setTemaIdx(idx);
    setRespuesta('');
    void cargarPregunta(idx); // cargarPregunta ya limpia fallback/campos simples/error
  }

  async function enviarRespuesta() {
    const tema = TEMA_ORDEN[temaIdx];
    if (tema === 'fotos_servicios') return; // este tema no interpreta texto, solo sube archivo (ver FotogramaPregunta)
    if (!respuesta.trim()) return;
    setFase('ejecutando');
    const accion = await interpretarRespuesta(tema, respuesta, status.done, perfil);
    if (!accion) {
      // Robustez (spec seccion 6): la IA no respondio a tiempo o fallo. Si el
      // tema tiene un formulario simple determinista, caemos a el en vez de
      // repetir el mismo campo de texto libre. Si no lo tiene (no debería
      // ocurrir para los temas de texto de este plan), solo dejamos reintentar.
      setFase('pregunta');
      if (TEMA_CAMPOS_SIMPLES[tema]) {
        setFallbackActivo(true);
      } else {
        setErrorTexto('No he entendido el horario. Prueba uno de los atajos de abajo, o reformula (ej. "lunes a viernes de 9 a 20").');
      }
      return;
    }
    // Solo activar_reserva_online es riesgosa DE ENTRADA (portal publico).
    // crear_profesional con quiere_invitar=true NO se retrasa: el alta del
    // profesional va sin friccion; el email queda a confirmar despues (ver
    // ejecutarYMostrarRecibo + continuarDesdeRecibo).
    const esReserva = accion.tipo === 'activar_reserva_online' && accion.args?.activar === true;
    if (esReserva) {
      setAccionPendiente(accion);
      setFase('confirmar_riesgo');
      return;
    }
    await ejecutarYMostrarRecibo(accion);
  }

  // Para 'botones' (si/no) y los presets de horario: construye la accion
  // directamente en el cliente, SIN llamar a la IA (mas simple, mas barato y
  // mas fiable que interpretar texto libre para un booleano o un horario
  // predefinido). La reserva online sigue pidiendo confirmacion si se activa.
  function responderDirecto(tipo: string, args: Record<string, any>) {
    if (tipo === 'activar_reserva_online' && args.activar === true) {
      setAccionPendiente({ tipo, args });
      setFase('confirmar_riesgo');
      return;
    }
    void ejecutarYMostrarRecibo({ tipo, args });
  }

  // Tras el recibo: si queda una invitacion por email pendiente de confirmar
  // (se encolo en ejecutarYMostrarRecibo al crear el profesional), pasa a
  // pedirla ahora; si no, avanza al siguiente tema.
  function continuarDesdeRecibo() {
    if (invitacionPendiente) {
      setAccionPendiente({
        tipo: 'invitar_profesional_email',
        args: { profesional_id: invitacionPendiente.profesionalId, profesional_nombre: invitacionPendiente.nombre, email: invitacionPendiente.email },
      });
      setInvitacionPendiente(null);
      setFase('confirmar_riesgo');
      return;
    }
    avanzarATema(temaIdx + 1);
  }

  // Envia el formulario simple determinista (fallback de fallo de IA) para
  // datos_negocio/servicios/equipo. Mapea 1:1 a la misma tool que usaria la
  // interpretacion normal, para que ejecutarAccion no necesite un camino aparte.
  function enviarCamposSimples() {
    const tema = TEMA_ORDEN[temaIdx];
    const tipoPorTema: Partial<Record<TemaId, string>> = {
      datos_negocio: 'completar_datos_negocio', servicios: 'crear_servicio', equipo: 'crear_profesional',
    };
    const tipo = tipoPorTema[tema];
    if (!tipo) return;
    const args: Record<string, any> = { ...camposSimples };
    if (tema === 'servicios') { args.precio = Number(camposSimples.precio); args.duracion_min = Number(camposSimples.duracion_min); }
    if (tema === 'equipo') { args.categoria = 'oficial'; args.quiere_invitar = false; args.email = ''; }
    void ejecutarYMostrarRecibo({ tipo, args });
  }

  async function ejecutarYMostrarRecibo(accion: { tipo: string; args: Record<string, any> }) {
    setFase('ejecutando');
    const resultado = await ejecutarAccion(accion.tipo, accion.args, ctxRef.current);
    if (accion.tipo === 'completar_datos_negocio' && resultado.ok) {
      ctxRef.current.datosNegocioSesion = { nombre: accion.args.nombre, direccion: accion.args.direccion, telefono: accion.args.telefono };
    }
    // El alta del profesional va sin friccion; si pidio invitacion por email,
    // se encola para confirmarla justo despues de ver este recibo (ver
    // continuarDesdeRecibo) en vez de retrasar la creacion.
    if (accion.tipo === 'crear_profesional' && resultado.ok && accion.args?.quiere_invitar === true) {
      const nuevoId = ctxRef.current.profesionalesCreados[ctxRef.current.profesionalesCreados.length - 1]?.id;
      setInvitacionPendiente({ profesionalId: nuevoId, nombre: accion.args.nombre, email: accion.args.email });
    }
    setRecibo(resultado);
    setFase('recibo');
    status.refresh();
  }
}

function FotogramaBienvenida({ isMobile, onEmpezar, onSaltar }: { isMobile: boolean; onEmpezar: () => void; onSaltar: () => void }) {
  return (
    <div className="m-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: isMobile ? 24 : 32, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)' }} />
      <div style={{ fontFamily: "'Bricolage Grotesque','Inter',sans-serif", fontSize: isMobile ? 26 : 32, fontWeight: 800, color: T.text, lineHeight: 1.25, maxWidth: 480 }}>
        Vamos a poner en marcha tu salon
      </div>
      <div style={{ fontSize: 14, color: T.textSecondary, maxWidth: 420 }}>
        Te voy a hacer unas pocas preguntas y voy dejando todo configurado de verdad, a tu ritmo. Puedes saltar cualquier paso.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onEmpezar} className="m-btn-primary" style={{ padding: '12px 24px', background: T.primary, border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Empezar</button>
        <button onClick={onSaltar} style={{ padding: '12px 20px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 12, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Prefiero hacerlo yo, manual</button>
      </div>
    </div>
  );
}

function FotogramaPregunta({
  isMobile, seccion, destinoManual, progreso, pregunta, cargando, ejecutando, modoInput, valor, onCambiar, onEnviar, onSaltar, onCerrar,
  onBoton, presets, onPreset, fallbackActivo, camposSimplesDef, camposSimples, onCambiarCampoSimple, onEnviarCamposSimples, errorTexto,
}: {
  isMobile: boolean; seccion: string; destinoManual: string; progreso: number;
  pregunta: { titulo: string; subtitulo?: string; placeholder_ejemplo?: string };
  cargando: boolean; ejecutando: boolean; modoInput: 'texto' | 'foto' | 'botones';
  valor: string; onCambiar: (v: string) => void; onEnviar: () => void; onSaltar: () => void; onCerrar: () => void;
  onBoton: (activar: boolean) => void;
  presets?: { label: string; dias: any[] }[]; onPreset: (dias: any[]) => void;
  fallbackActivo: boolean;
  camposSimplesDef?: { key: string; label: string; tipo: 'texto' | 'numero' }[];
  camposSimples: Record<string, string>; onCambiarCampoSimple: (key: string, v: string) => void; onEnviarCamposSimples: () => void;
  errorTexto: string;
}) {
  const mostrarCamposSimples = fallbackActivo && !!camposSimplesDef;
  return (
    <div className="m-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: isMobile ? 20 : 32, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(40,30,24,0.06)' }}>
        <div style={{ width: `${Math.round(progreso * 100)}%`, height: '100%', background: T.primary, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
      <button onClick={onCerrar} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: T.textTertiary, fontSize: 13, cursor: 'pointer' }}>Cerrar</button>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700 }}>{seccion}</div>
      {cargando ? (
        <>
          <div style={{ fontSize: 15, color: T.textSecondary }}>Un momento...</div>
          <button onClick={onSaltar} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Saltar este paso
          </button>
        </>
      ) : mostrarCamposSimples ? (
        <>
          <div style={{ fontFamily: 'Inter,sans-serif', fontSize: isMobile ? 19 : 22, fontWeight: 600, color: T.text, textAlign: 'center', maxWidth: 420 }}>
            No he entendido bien la respuesta. Rellenalo asi, campo a campo:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: isMobile ? '100%' : 280 }}>
            {camposSimplesDef!.map((c) => (
              <input
                key={c.key}
                className="m-input"
                value={camposSimples[c.key] ?? ''}
                onChange={(e) => onCambiarCampoSimple(c.key, e.target.value)}
                placeholder={c.label}
                type={c.tipo === 'numero' ? 'number' : 'text'}
                disabled={ejecutando}
                style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, background: T.bgCard, outline: 'none' }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onEnviarCamposSimples} disabled={ejecutando} className="m-btn-primary" style={{ padding: '10px 20px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {ejecutando ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={onSaltar} disabled={ejecutando} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Saltar este paso
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'Inter,sans-serif', fontSize: isMobile ? 21 : 26, lineHeight: 1.3, fontWeight: 600, color: T.text, textAlign: 'center', maxWidth: 460, letterSpacing: -0.5 }}>
            {pregunta.titulo}
          </div>
          {modoInput === 'texto' && (
            <div style={{ width: isMobile ? '100%' : 320 }}>
              <input
                className="m-input"
                value={valor}
                onChange={(e) => onCambiar(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !ejecutando) onEnviar(); }}
                placeholder={pregunta.placeholder_ejemplo || ''}
                disabled={ejecutando}
                style={{ width: '100%', textAlign: 'center', border: 'none', borderBottom: '2px solid rgba(40,30,24,0.15)', borderRadius: 0, padding: '10px 4px', fontSize: 15, background: 'transparent', outline: 'none' }}
              />
            </div>
          )}
          {modoInput === 'texto' && presets && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 420 }}>
              {presets.map((p) => (
                <button key={p.label} onClick={() => onPreset(p.dias)} disabled={ejecutando} className="m-chip" style={{ padding: '7px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 999, color: T.textSecondary, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {errorTexto && (
            <div style={{ fontSize: 11.5, color: T.danger, textAlign: 'center', maxWidth: 380 }}>{errorTexto}</div>
          )}
          {modoInput === 'foto' && <SubidaFotoInline disabled={ejecutando} />}
          {modoInput === 'botones' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onBoton(true)} disabled={ejecutando} className="m-btn-primary" style={{ padding: '11px 22px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Si, activar</button>
              <button onClick={() => onBoton(false)} disabled={ejecutando} style={{ padding: '11px 18px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ahora no</button>
            </div>
          )}
          {pregunta.subtitulo && (
            <div style={{ fontSize: 11.5, color: T.textSecondary, background: T.primarySoft, borderRadius: 999, padding: '8px 14px', maxWidth: 380, textAlign: 'center' }}>
              {pregunta.subtitulo}
            </div>
          )}
          {modoInput === 'texto' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onEnviar} disabled={ejecutando || !valor.trim()} className="m-btn-primary" style={{ padding: '10px 20px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: ejecutando ? 'not-allowed' : 'pointer', opacity: ejecutando ? 0.6 : 1 }}>
                {ejecutando ? 'Guardando...' : 'Continuar'}
              </button>
              <button onClick={onSaltar} disabled={ejecutando} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                Saltar este paso
              </button>
            </div>
          )}
          {modoInput !== 'texto' && (
            <button onClick={onSaltar} disabled={ejecutando} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Saltar este paso
            </button>
          )}
          <div style={{ fontSize: 11, color: T.textTertiary }}>{destinoManual}</div>
        </>
      )}
    </div>
  );
}

// Placeholder minimo de subida de foto: el tema fotos_servicios es opcional y
// no bloquea el nucleo (spec, decision 2). Sube directo al bucket publico
// servicio-fotos, igual que hace hoy Ajustes > Servicios.
function SubidaFotoInline({ disabled }: { disabled: boolean }) {
  const [subiendo, setSubiendo] = useState(false);
  const [subida, setSubida] = useState(false);
  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setSubiendo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user ? await supabase.from('profiles').select('negocio_id').eq('id', user.id).maybeSingle() : { data: null };
      const negocioId = profile?.negocio_id;
      const { data: servicios } = negocioId ? await supabase.from('servicios').select('id').eq('negocio_id', negocioId).limit(1) : { data: null };
      const servicioId = servicios?.[0]?.id;
      if (!negocioId || !servicioId) { setSubiendo(false); return; }
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${negocioId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('servicio-fotos').upload(path, file, { contentType: file.type });
      if (!up.error) {
        const { data: pub } = supabase.storage.from('servicio-fotos').getPublicUrl(path);
        await supabase.from('servicios').update({ foto_url: pub.publicUrl }).eq('id', servicioId);
        setSubida(true);
      }
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <label style={{ padding: '12px 20px', background: T.bgCard, border: `1.5px dashed ${T.borderHi}`, borderRadius: 12, fontSize: 13, color: T.textSecondary, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {subida ? 'Foto subida' : subiendo ? 'Subiendo...' : 'Elegir foto'}
      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={disabled || subiendo} onChange={(e) => onFile(e.target.files)} />
    </label>
  );
}

function FotogramaConfirmarRiesgo({ isMobile, accion, onConfirmar, onCancelar }: {
  isMobile: boolean; accion: { tipo: string; args: Record<string, any> }; onConfirmar: () => void; onCancelar: () => void;
}) {
  // Guarda local anti-doble-clic: onConfirmar dispara ejecutarYMostrarRecibo
  // (async) y fase tarda un tick en pasar a 'ejecutando'. Sin esto, un
  // doble-clic antes de ese tick podria disparar la accion dos veces; grave
  // en invitar_profesional_email, que envia un email real sin idempotencia.
  const [confirmando, setConfirmando] = useState(false);
  const esInvitacion = accion.tipo === 'invitar_profesional_email';
  const titulo = esInvitacion ? `Invitar a ${accion.args.profesional_nombre} por email` : 'Activar la reserva online publica';
  const detalle = esInvitacion ? `Se enviara un correo real a ${accion.args.email}.` : 'Tu salon sera visible y reservable publicamente ahora mismo.';
  const handleConfirmar = () => {
    if (confirmando) return;
    setConfirmando(true);
    onConfirmar();
  };
  const handleCancelar = () => {
    if (confirmando) return;
    onCancelar();
  };
  return (
    <div className="m-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: isMobile ? 20 : 32, textAlign: 'center' }}>
      <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: T.text, maxWidth: 400 }}>{titulo}</div>
      <div style={{ fontSize: 13, color: T.textSecondary, maxWidth: 360 }}>{detalle}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleConfirmar} disabled={confirmando} className="m-btn-primary" style={{ padding: '11px 22px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: confirmando ? 'not-allowed' : 'pointer', opacity: confirmando ? 0.6 : 1 }}>
          {confirmando ? 'Un momento...' : 'Si, adelante'}
        </button>
        <button onClick={handleCancelar} disabled={confirmando} style={{ padding: '11px 18px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: confirmando ? 'not-allowed' : 'pointer' }}>Ahora no</button>
      </div>
    </div>
  );
}

function FotogramaRecibo({ isMobile, recibo, esUltimoTema, permiteAnadirOtro, onAnadirOtro, onContinuar }: {
  isMobile: boolean; recibo: { ok: boolean; resumen: string }; esUltimoTema: boolean; permiteAnadirOtro: boolean;
  onAnadirOtro: () => void; onContinuar: () => void;
}) {
  return (
    <div className="m-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: isMobile ? 20 : 32, textAlign: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: recibo.ok ? T.successSoft : T.dangerSoft, display: 'grid', placeItems: 'center', fontSize: 20, color: recibo.ok ? T.success : T.danger }}>
        {recibo.ok ? '✓' : '!'}
      </div>
      <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, color: T.text, maxWidth: 420 }}>{recibo.resumen}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {permiteAnadirOtro && recibo.ok && (
          <button onClick={onAnadirOtro} style={{ padding: '11px 18px', background: T.primarySoft, border: `1px solid ${T.primaryGlow}`, borderRadius: 10, color: T.primaryHi, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Anadir otro</button>
        )}
        <button onClick={onContinuar} className="m-btn-primary" style={{ padding: '11px 20px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {esUltimoTema ? 'Terminar' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
