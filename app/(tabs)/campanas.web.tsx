import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { getUserProfile } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { STextInput, NumberInput, SSelect } from '@/components/ui/SettingsAtoms';
import {
  type Campana, type CampanaCanal, type SegmentoCriterios,
  contarSegmento, crearYEncolarCampana, cancelarCampana, listarCampanas,
  personalizarPreview, CAMPANA_ESTADO_META,
} from '@/lib/campanas';

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

function CampanasScreen() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [esGestor, setEsGestor] = useState<boolean | null>(null);
  const [nombreEjemplo, setNombreEjemplo] = useState('Ana');

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

  useEffect(() => {
    (async () => {
      const p = await getUserProfile();
      setEsGestor(can(p, 'informes.ver'));
      if (p?.nombre) setNombreEjemplo(p.nombre.split(' ')[0] || 'Ana');
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
      catch (e) { setError(mensajeDeError(e, 'No se pudo contar el segmento.')); setConteo(null); }
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

  const puedeEncolar = !!nombre.trim() && !!mensaje.trim() && (conteo ?? 0) > 0 && !encolando;

  async function encolar() {
    if (!puedeEncolar) return;
    setEncolando(true); setError(null); setAviso(null);
    try {
      const c = await crearYEncolarCampana(nombre.trim(), canal, mensaje, seg);
      setAviso(`Campaña "${c.nombre}" encolada: ${c.total_destinatarios} destinatarios. El envío se hará desde el motor de mensajería.`);
      setNombre(''); setMensaje(''); setSeg({});
      void cargarCampanas();
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo encolar la campaña.'));
    } finally {
      setEncolando(false);
    }
  }

  async function cancelar(id: string) {
    try { await cancelarCampana(id); void cargarCampanas(); }
    catch (e) { setError(mensajeDeError(e, 'No se pudo cancelar.')); }
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

  return (
    <div style={{ minHeight: '100%', background: T.bg, paddingBottom: 40 }}>
      <Header onBack={() => router.back()} isMobile={isMobile} />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '0 14px' : '0 24px', display: 'grid', gap: 16 }}>

        {/* Plantillas rapidas */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
          {PLANTILLAS.map((p) => (
            <button key={p.titulo} onClick={() => aplicarPlantilla(p)}
              style={{ textAlign: 'left', background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{p.titulo}</div>
              <div style={{ fontSize: 12, color: T.textTer, marginTop: 3 }}>{p.desc}</div>
            </button>
          ))}
        </div>

        {/* Constructor */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: isMobile ? 16 : 20, display: 'grid', gap: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Nueva campaña</div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 220px', gap: 12 }}>
            <Campo label="Nombre de la campaña">
              <STextInput value={nombre} onChange={setNombre} width="100%" />
            </Campo>
            <Campo label="Canal">
              <SSelect value={canal} onChange={(v) => setCanal(v as CampanaCanal)}
                options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Correo' }]} width="100%" />
            </Campo>
          </div>

          {/* Segmento */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 8 }}>¿A quién? (segmento)</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
              <Campo label="Sin volver (días)" hint="Dormidas">
                <NumberInput value={seg.inactividad_dias ?? ''} onChange={setSegNum('inactividad_dias')} />
              </Campo>
              <Campo label="Visitas mínimas">
                <NumberInput value={seg.min_visitas ?? ''} onChange={setSegNum('min_visitas')} />
              </Campo>
              <Campo label="Ticket medio ≥" >
                <NumberInput value={seg.min_ticket ?? ''} onChange={setSegNum('min_ticket')} unit="€" step={5} />
              </Campo>
              <Campo label="Etiqueta">
                <STextInput value={seg.etiqueta ?? ''} onChange={(v) => setSeg((p) => ({ ...p, etiqueta: v || undefined }))} width="100%" />
              </Campo>
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-live="polite" style={{ fontSize: 13.5, fontWeight: 700, color: (conteo ?? 0) > 0 ? T.primaryHi : T.textTer }}>
                {contando ? 'Contando…' : conteo == null ? '—' : `${conteo} ${conteo === 1 ? 'clienta recibirá' : 'clientas recibirán'} esta campaña`}
              </span>
            </div>
          </div>

          {/* Mensaje */}
          <Campo label="Mensaje" hint="Usa {nombre} para personalizar con el nombre de cada clienta.">
            <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4}
              placeholder="Hola {nombre}, ..."
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${T.borderHi}`, fontSize: 13.5, color: T.text, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }} />
          </Campo>
          {mensaje.trim() && (
            <div style={{ background: T.cardHi, border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 10.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Vista previa</div>
              <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{personalizarPreview(mensaje, nombreEjemplo)}</div>
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: T.danger, fontWeight: 600 }}>{error}</div>}
          {aviso && <div style={{ fontSize: 13, color: T.success, fontWeight: 600 }}>{aviso}</div>}

          <button onClick={encolar} disabled={!puedeEncolar}
            style={{ padding: '12px 0', borderRadius: 12, border: 'none', background: puedeEncolar ? T.fire : T.cardHi, color: puedeEncolar ? '#fff' : T.textMuted, fontSize: 14.5, fontWeight: 700, cursor: puedeEncolar ? 'pointer' : 'not-allowed', boxShadow: puedeEncolar ? '0 6px 18px rgba(192,38,10,0.22)' : 'none' }}>
            {encolando ? 'Encolando…' : `Encolar campaña${conteo ? ` (${conteo})` : ''}`}
          </button>
          <div style={{ fontSize: 11.5, color: T.textTer, textAlign: 'center', marginTop: -6 }}>
            El envío real de WhatsApp/correo lo hace el motor de mensajería. Aquí preparas y encolas la campaña.
          </div>
        </div>

        {/* Historial */}
        {campanas.length > 0 && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: isMobile ? 14 : 18 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 12 }}>Tus campañas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {campanas.map((c) => {
                const meta = CAMPANA_ESTADO_META[c.estado];
                const cancelable = c.estado === 'borrador' || c.estado === 'encolada';
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, background: T.cardHi }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{c.nombre}</div>
                      <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 2 }}>
                        {c.canal === 'email' ? 'Correo' : 'WhatsApp'} · {c.total_destinatarios} destinatarios
                      </div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    {cancelable && (
                      <button onClick={() => cancelar(c.id)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.panel, color: T.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ onBack, isMobile }: { onBack: () => void; isMobile: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '16px 14px' : '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      <button onClick={onBack} aria-label="Volver"
        style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.panel, color: T.textSec, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>‹</button>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Campañas</div>
        <div style={{ fontSize: 12.5, color: T.textTer }}>Reactiva clientas y difunde ofertas</div>
      </div>
    </div>
  );
}

export default CampanasScreen;
