import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { getUserProfile } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { reportarError } from '@/lib/reportarError';
import { STextInput, NumberInput, SSelect } from '@/components/ui/SettingsAtoms';
import {
  type Campana, type CampanaCanal, type SegmentoCriterios,
  contarSegmento, crearYEncolarCampana, cancelarCampana, listarCampanas,
  personalizarPreview, CAMPANA_ESTADO_META,
} from '@/lib/campanas';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualCampanas } from '@/lib/manuals/campanas';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { withPlanGate } from '@/components/PlanGateOverlay';

const T = {
  bg: '#f6f1ea', panel: '#fffdfb', card: '#ffffff', cardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.10)', borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814', textSec: '#5c5249', textTer: '#736658', textMuted: '#b3a89d',
  primary: '#f4501e', primaryHi: '#c0260a', primarySoft: 'rgba(244,80,30,0.10)',
  fire: 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)',
  success: '#0f9d6b', warning: '#e08a00', danger: '#e23b34',
};

// Plantillas rapidas: rellenan segmento + un mensaje base (el usuario edita).
const PLANTILLAS: { titulo: string; desc: string; canal: CampanaCanal; seg: SegmentoCriterios; nombre: string; mensaje: string }[] = [
  {
    titulo: 'Reactivar clientas dormidas',
    desc: 'No vienen desde hace 60 días o más',
    canal: 'whatsapp', seg: { inactividad_dias: 60 }, nombre: 'Reactivar dormidas',
    mensaje: 'Hola {nombre}, te echamos de menos. Este mes tienes un 20% en tu próxima visita. ¿Reservamos?',
  },
  {
    titulo: 'Difundir una oferta',
    desc: 'A toda tu clientela con contacto',
    canal: 'whatsapp', seg: {}, nombre: 'Oferta del mes',
    mensaje: 'Hola {nombre}, este mes tenemos una promoción especial. Escríbenos para reservar tu cita.',
  },
  {
    titulo: 'Premiar a las mejores',
    desc: 'Clientas con ticket medio alto',
    canal: 'whatsapp', seg: { min_ticket: 40, min_visitas: 5 }, nombre: 'Gracias VIP',
    mensaje: 'Hola {nombre}, gracias por tu confianza. Como clienta especial, te invitamos a un extra en tu próxima visita.',
  },
];

function Campo({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 5 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, color: T.textTer, marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

function Bloque({ titulo, paso, desc, children, accion }: {
  titulo: string; paso?: number; desc?: string; children: React.ReactNode; accion?: React.ReactNode;
}) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {paso != null && (
            <span style={{
              width: 24, height: 24, borderRadius: 999, background: T.primarySoft, color: T.primaryHi,
              display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0,
            }}>{paso}</span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: T.text }}>{titulo}</div>
            {desc && <div style={{ fontSize: 12, color: T.textTer, marginTop: 2 }}>{desc}</div>}
          </div>
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** El segmento, dicho en cristiano. Sin esto el usuario ve cuatro casillas y no
 *  sabe a quién le va a llegar el mensaje. */
function resumirSegmento(seg: SegmentoCriterios): string[] {
  const chips: string[] = [];
  if (seg.inactividad_dias) chips.push(`Sin venir desde hace ${seg.inactividad_dias} días o más`);
  if (seg.min_visitas) chips.push(`Con ${seg.min_visitas} visitas o más`);
  if (seg.min_ticket) chips.push(`Ticket medio de ${seg.min_ticket} € o más`);
  if (seg.etiqueta) chips.push(`Etiqueta «${seg.etiqueta}»`);
  return chips;
}

function CampanasScreen() {
  const router = useRouter();
  const { isMobile, isTablet } = useResponsive();
  const [esGestor, setEsGestor] = useState<boolean | null>(null);
  const [nombreEjemplo, setNombreEjemplo] = useState('Ana');
  const [salonNombre, setSalonNombre] = useState('Tu salón');

  const [nombre, setNombre] = useState('');
  const [canal, setCanal] = useState<CampanaCanal>('whatsapp');
  const [mensaje, setMensaje] = useState('');
  const [seg, setSeg] = useState<SegmentoCriterios>({});
  const [conteo, setConteo] = useState<number | null>(null);
  const [contando, setContando] = useState(false);
  const [encolando, setEncolando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('campanas');

  // Una sola columna en movil y tablet; en escritorio, formulario + panel de
  // envio en paralelo, que es lo que evita el scroll infinito de antes.
  const dosColumnas = !isMobile && !isTablet;

  useEffect(() => {
    (async () => {
      const p = await getUserProfile();
      setEsGestor(can(p, 'informes.ver'));
      if (p?.nombre) setNombreEjemplo(p.nombre.split(' ')[0] || 'Ana');
      if (p?.nombre_negocio) setSalonNombre(p.nombre_negocio);
    })();
  }, []);

  const cargarCampanas = useCallback(async () => {
    try { setCampanas(await listarCampanas()); } catch { /* la lista es secundaria */ }
  }, []);
  useEffect(() => { if (esGestor) void cargarCampanas(); }, [esGestor, cargarCampanas]);

  // Conteo en vivo (debounced) al cambiar canal o segmento.
  useEffect(() => {
    if (!esGestor) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setContando(true);
    debounceRef.current = setTimeout(async () => {
      try { setConteo(await contarSegmento(canal, seg)); setError(null); }
      catch (e) {
        reportarError(e, { origen: 'app', tipo: 'operativo' });
        setError(mensajeDeError(e, 'No se pudo contar el segmento.'));
        setConteo(null);
      }
      finally { setContando(false); }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [canal, seg, esGestor]);

  const setSegNum = (k: keyof SegmentoCriterios) => (v: string | number) =>
    setSeg((prev) => ({ ...prev, [k]: v === '' ? undefined : Number(v) }));

  function aplicarPlantilla(p: typeof PLANTILLAS[number]) {
    setNombre(p.nombre); setCanal(p.canal); setSeg(p.seg); setMensaje(p.mensaje);
    setError(null); setAviso(null);
  }

  const chipsSegmento = useMemo(() => resumirSegmento(seg), [seg]);
  const puedeEncolar = !!nombre.trim() && !!mensaje.trim() && (conteo ?? 0) > 0 && !encolando;

  // Que falta para poder enviar: se dice, en vez de dejar el boton muerto.
  const pendientes = useMemo(() => {
    const f: string[] = [];
    if (!nombre.trim()) f.push('ponle nombre a la campaña');
    if (!mensaje.trim()) f.push('escribe el mensaje');
    if ((conteo ?? 0) === 0 && !contando) f.push('no hay nadie en este segmento');
    return f;
  }, [nombre, mensaje, conteo, contando]);

  async function encolar() {
    if (!puedeEncolar) return;
    setEncolando(true); setError(null); setAviso(null);
    try {
      const c = await crearYEncolarCampana(nombre.trim(), canal, mensaje, seg);
      setAviso(`Campaña "${c.nombre}" encolada: ${c.total_destinatarios} destinatarios. El envío se hará desde el motor de mensajería.`);
      setNombre(''); setMensaje(''); setSeg({});
      void cargarCampanas();
    } catch (e) {
      reportarError(e, { origen: 'app', tipo: 'operativo' });
      setError(mensajeDeError(e, 'No se pudo encolar la campaña.'));
    } finally {
      setEncolando(false);
    }
  }

  async function cancelar(id: string) {
    try { await cancelarCampana(id); void cargarCampanas(); }
    catch (e) {
      reportarError(e, { origen: 'app', tipo: 'operativo' });
      setError(mensajeDeError(e, 'No se pudo cancelar.'));
    }
  }

  if (esGestor === false) {
    return (
      <div style={{ minHeight: '100%', background: T.bg, padding: 24 }}>
        <Header onBack={() => router.back()} isMobile={isMobile} />
        <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center', color: T.textSec, fontSize: 14 }}>
          Las campañas solo las gestiona el propietario o la dirección del salón.
        </div>
      </div>
    );
  }

  const previewTexto = mensaje.trim()
    ? personalizarPreview(mensaje, nombreEjemplo)
    : 'Escribe el mensaje y aquí verás cómo le llega a cada clienta, con su nombre puesto.';

  const panelEnvio = (
    <div style={{ display: 'grid', gap: 14, position: dosColumnas ? 'sticky' : 'static', top: 16, alignSelf: 'start' }}>
      {/* Vista previa tipo conversacion */}
      <Bloque titulo="Cómo le llega" desc={`Ejemplo con el nombre «${nombreEjemplo}»`}>
        <div style={{
          background: T.cardHi, border: `1px solid ${T.border}`, borderRadius: 14,
          padding: 14, minHeight: 150, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 11, color: T.textTer, fontWeight: 700 }}>
            {canal === 'email' ? 'Correo' : 'WhatsApp'} · {salonNombre}
          </div>
          <div style={{
            alignSelf: 'flex-start', maxWidth: '92%',
            background: canal === 'email' ? T.panel : '#e7f6e4',
            border: `1px solid ${canal === 'email' ? T.border : 'rgba(15,157,107,0.25)'}`,
            borderRadius: '14px 14px 14px 4px', padding: '10px 12px',
            fontSize: 13.5, lineHeight: 1.5, color: mensaje.trim() ? T.text : T.textMuted,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {previewTexto}
          </div>
          {mensaje.trim() && (
            <div style={{ fontSize: 10.5, color: T.textTer, alignSelf: 'flex-start' }}>
              {mensaje.trim().length} caracteres
            </div>
          )}
        </div>
      </Bloque>

      {/* Destinatarios + envio */}
      <Bloque titulo="A cuántas personas" desc="Se recalcula solo al tocar el segmento">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <span aria-live="polite" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: (conteo ?? 0) > 0 ? T.primaryHi : T.textMuted }}>
            {contando ? '…' : conteo == null ? '—' : conteo}
          </span>
          <span style={{ fontSize: 13, color: T.textSec }}>
            {conteo === 1 ? 'clienta' : 'clientas'} con {canal === 'email' ? 'correo' : 'WhatsApp'}
          </span>
        </div>

        {chipsSegmento.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {chipsSegmento.map((c) => (
              <span key={c} style={{ fontSize: 11.5, color: T.textSec, background: T.cardHi, border: `1px solid ${T.border}`, borderRadius: 999, padding: '4px 10px' }}>
                {c}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: T.textTer, marginBottom: 12 }}>
            Sin filtros: le llega a toda tu clientela con contacto.
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: T.danger, fontWeight: 600, marginBottom: 10 }}>{error}</div>}
        {aviso && <div style={{ fontSize: 13, color: T.success, fontWeight: 600, marginBottom: 10 }}>{aviso}</div>}

        <button className="m-btn-primary" onClick={encolar} disabled={!puedeEncolar}
          style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: puedeEncolar ? T.fire : T.cardHi, color: puedeEncolar ? '#fff' : T.textMuted, fontSize: 14.5, fontWeight: 700, cursor: puedeEncolar ? 'pointer' : 'not-allowed', boxShadow: puedeEncolar ? '0 6px 18px rgba(192,38,10,0.22)' : 'none' }}>
          {encolando ? 'Encolando…' : `Encolar campaña${conteo ? ` (${conteo})` : ''}`}
        </button>

        {!puedeEncolar && pendientes.length > 0 && !encolando && (
          <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 8, textAlign: 'center' }}>
            Falta: {pendientes.join(' · ')}.
          </div>
        )}
        <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 8, textAlign: 'center', lineHeight: 1.45 }}>
          El envío real de WhatsApp o correo lo hace el motor de mensajería. Aquí preparas y encolas la campaña.
        </div>
      </Bloque>
    </div>
  );

  return (
    <div style={{ height: '100%', minHeight: '100%', background: T.bg, overflowY: 'auto', paddingBottom: isMobile ? 96 : 40 }}>
      <Header onBack={() => router.back()} isMobile={isMobile} onManual={() => setShowManualPanel(true)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '0 14px' : '0 24px', display: 'grid', gap: 16 }}>

        {!paginaManual.loading && !paginaManual.visto && (
          <AvisoPrimeraVisita
            content={manualCampanas}
            isMobile={isMobile}
            onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
            onCerrar={paginaManual.marcarVisto}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: dosColumnas ? 'minmax(0, 1.35fr) minmax(340px, 0.9fr)' : '1fr', gap: 16, alignItems: 'start' }}>

          {/* Columna de construccion */}
          <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>

            <Bloque
              titulo="Empieza por una plantilla"
              desc="Rellena el segmento y un mensaje base. Luego lo cambias a tu gusto."
            >
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 10 }}>
                {PLANTILLAS.map((p) => (
                  <button key={p.titulo} className="m-card-hover" onClick={() => aplicarPlantilla(p)}
                    style={{ textAlign: 'left', background: T.cardHi, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{p.titulo}</div>
                    <div style={{ fontSize: 12, color: T.textTer, marginTop: 3 }}>{p.desc}</div>
                  </button>
                ))}
              </div>
            </Bloque>

            <Bloque paso={1} titulo="Nombre y canal" desc="El nombre es solo para ti: no lo ve la clienta.">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 200px', gap: 12 }}>
                <Campo label="Nombre de la campaña">
                  <STextInput value={nombre} onChange={setNombre} width="100%" />
                </Campo>
                <Campo label="Canal">
                  <SSelect value={canal} onChange={(v) => setCanal(v as CampanaCanal)}
                    options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Correo' }]} width="100%" />
                </Campo>
              </div>
            </Bloque>

            <Bloque
              paso={2}
              titulo="¿A quién se la mandas?"
              desc="Deja los campos vacíos para llegar a toda tu clientela."
              accion={chipsSegmento.length > 0 ? (
                <button onClick={() => setSeg({})}
                  style={{ background: 'none', border: 'none', color: T.textTer, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                  Quitar filtros
                </button>
              ) : undefined}
            >
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))', gap: 12 }}>
                <Campo label="Sin volver (días)" hint="Dormidas">
                  <NumberInput value={seg.inactividad_dias ?? ''} onChange={setSegNum('inactividad_dias')} />
                </Campo>
                <Campo label="Visitas mínimas">
                  <NumberInput value={seg.min_visitas ?? ''} onChange={setSegNum('min_visitas')} />
                </Campo>
                <Campo label="Ticket medio ≥">
                  <NumberInput value={seg.min_ticket ?? ''} onChange={setSegNum('min_ticket')} unit="€" step={5} />
                </Campo>
                <Campo label="Etiqueta">
                  <STextInput value={seg.etiqueta ?? ''} onChange={(v) => setSeg((p) => ({ ...p, etiqueta: v || undefined }))} width="100%" />
                </Campo>
              </div>
            </Bloque>

            <Bloque paso={3} titulo="El mensaje" desc="Escribe {nombre} donde quieras que aparezca el nombre de cada clienta.">
              <textarea
                className="m-input"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={isMobile ? 5 : 8}
                placeholder="Hola {nombre}, ..."
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '12px 14px',
                  borderRadius: 12, border: `1.5px solid ${T.borderHi}`, fontSize: 14, color: T.text,
                  fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.6, minHeight: isMobile ? 120 : 190,
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setMensaje((m) => `${m}{nombre}`)}
                  style={{ background: T.cardHi, border: `1px solid ${T.border}`, borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 600, color: T.textSec, cursor: 'pointer' }}
                >
                  + Insertar {'{nombre}'}
                </button>
              </div>
            </Bloque>

            {/* En movil el panel de envio va aqui, debajo del formulario. */}
            {!dosColumnas && panelEnvio}
          </div>

          {/* Columna de preview + envio (escritorio) */}
          {dosColumnas && panelEnvio}
        </div>

        {/* Historial, a lo ancho */}
        <Bloque titulo="Tus campañas" desc="Las encoladas se pueden cancelar antes de que salgan.">
          {campanas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '26px 16px', border: `1px dashed ${T.border}`, borderRadius: 12, color: T.textTer, fontSize: 13 }}>
              Todavía no has creado ninguna campaña. Empieza por una plantilla de arriba.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
              {campanas.map((c) => {
                const meta = CAMPANA_ESTADO_META[c.estado];
                const cancelable = c.estado === 'borrador' || c.estado === 'encolada';
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '11px 13px', borderRadius: 12, background: T.cardHi, border: `1px solid ${T.border}` }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
                      <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 2 }}>
                        {c.canal === 'email' ? 'Correo' : 'WhatsApp'} · {c.total_destinatarios} destinatarios
                      </div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: meta.color, whiteSpace: 'nowrap' }}>{meta.label}</span>
                    {cancelable && (
                      <button className="m-btn-secondary" onClick={() => cancelar(c.id)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.panel, color: T.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Bloque>
      </div>

      {showManualPanel && (
        <ManualPanel
          content={manualCampanas}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}

function Header({ onBack, isMobile, onManual }: { onBack: () => void; isMobile: boolean; onManual?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '16px 14px' : '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <button className="m-btn-icon" onClick={onBack} aria-label="Volver"
        style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.panel, color: T.textSec, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>‹</button>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 10 }}>
          Campañas
          {onManual && (
            <button className="m-btn-icon" onClick={onManual} title="Manual de esta pagina"
              style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: T.card, border: `1px solid ${T.borderHi}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: T.textTer }}>Reactiva clientas y difunde ofertas</div>
      </div>
    </div>
  );
}

export default withPlanGate(CampanasScreen, 'campanas');
