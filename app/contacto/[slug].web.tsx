import { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { negocioContactoPublico, enviarMensajeContactoPublico, notificarBandeja } from '@/lib/bandeja';

// ---------------------------------------------------------------------------
// Página pública "Contactar con el salón" (/app/contacto/<slug>). Anónima: el
// cliente llega desde el portal de reserva o la gestión de su cita. Ofrece
// llamar/WhatsApp directo (si el salón tiene teléfono) y un formulario de
// mensaje que cae en la Bandeja del software (envío único, se responde por
// correo — sin hilo de seguimiento aquí, a diferencia del presupuesto).
// ---------------------------------------------------------------------------
const T = {
  bg: '#f7f0e8', card: '#ffffff', border: 'rgba(40,30,24,0.10)',
  text: '#241a14', textSec: '#5c5249', textTer: '#736658',
  success: '#0f9d6b', successSoft: 'rgba(15,157,107,0.12)', danger: '#e23b34',
};
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";

function Icon({ name, size = 18, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    whatsapp: '<path d="M3 21l1.65-4.95A9 9 0 1 1 8.05 19.35L3 21z"/><path d="M9 10a1 1 0 0 0 1 1h.5a1 1 0 0 0 0-2H10a1 1 0 0 0-1 1z"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
  };
  return <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
    __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
  }} />;
}

interface Negocio {
  ok: boolean; nombre?: string; logo_url?: string | null; color?: string;
  direccion?: string | null; telefono?: string | null;
}

export default function ContactoPublicoScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try { setNegocio(await negocioContactoPublico(slug)); }
    catch { setNegocio({ ok: false }); }
    setLoading(false);
  }, [slug]);

  useEffect(() => { cargar(); }, [cargar]);

  const enviar = async () => {
    setError('');
    if (nombre.trim().length < 2) { setError('Indica tu nombre.'); return; }
    if (!telefono.trim() && !email.trim()) { setError('Indica un teléfono o un correo para poder responderte.'); return; }
    if (!mensaje.trim()) { setError('Escribe tu mensaje.'); return; }
    setEnviando(true);
    try {
      const res = await enviarMensajeContactoPublico({ slug, nombre, telefono, email, cuerpo: mensaje });
      if (!res.ok) {
        setError(res.motivo === 'limite_ip' || res.motivo === 'limite_negocio'
          ? 'Has enviado varios mensajes seguidos. Prueba de nuevo más tarde o llama directamente.'
          : 'No se pudo enviar. Inténtalo de nuevo.');
        return;
      }
      if (res.mensaje_id) notificarBandeja(res.mensaje_id);
      setEnviado(true);
    } catch {
      setError('No se pudo enviar. Inténtalo de nuevo.');
    } finally { setEnviando(false); }
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'grid', placeItems: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 34, height: 34, border: '3px solid #e3d8cc', borderTopColor: negocio?.color || '#f4501e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>;
  }

  if (!negocio || negocio.ok === false) {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 28, color: T.text, margin: '0 0 8px' }}>Página no disponible</h1>
        <p style={{ color: T.textSec, fontSize: 15 }}>El enlace no es válido.</p>
      </div>
    </div>;
  }

  const accent = negocio.color || '#f4501e';
  const tel = (negocio.telefono || '').trim();
  const telDigits = tel.replace(/[^\d+]/g, '');

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '32px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          {negocio.logo_url
            ? <img src={negocio.logo_url} alt={negocio.nombre} style={{ height: 48, objectFit: 'contain', marginBottom: 10 }} />
            : null}
          <div style={{ fontFamily: SERIF, fontSize: 26, color: T.text, lineHeight: 1.1 }}>{negocio.nombre}</div>
          {negocio.direccion ? <div style={{ fontSize: 12.5, color: T.textTer, marginTop: 4 }}>{negocio.direccion}</div> : null}
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 50px -28px rgba(40,30,24,0.4)' }}>
          <div style={{ height: 6, background: accent }} />
          <div style={{ padding: '22px 22px 24px' }}>
            <h1 style={{ margin: '0 0 6px', fontFamily: SERIF, fontSize: 24, color: T.text }}>Contactar con el salón</h1>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: T.textSec }}>Llama, escribe por WhatsApp o déjanos un mensaje y te respondemos por correo.</p>

            {telDigits && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <a href={`tel:${telDigits}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px', background: accent, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                  <Icon name="phone" size={15} color="#fff" /> Llamar
                </a>
                <a href={`https://wa.me/${telDigits.replace('+', '')}`} target="_blank" rel="noreferrer" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px', background: '#25D366', color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                  <Icon name="whatsapp" size={15} color="#fff" /> WhatsApp
                </a>
              </div>
            )}

            {enviado ? (
              <div style={{ padding: '14px 16px', background: T.successSoft, borderRadius: 10, color: T.success, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={16} color={T.success} /> Mensaje enviado. Te responderemos por correo en breve.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre"
                  style={{ padding: '11px 13px', borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" type="tel"
                    style={{ flex: 1, padding: '11px 13px', borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" type="email"
                    style={{ flex: 1, padding: '11px 13px', borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Escribe tu mensaje…" rows={4}
                  style={{ padding: '11px 13px', borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                {error ? <p style={{ color: T.danger, fontSize: 12.5, margin: 0 }}>{error}</p> : null}
                <button onClick={enviar} disabled={enviando} style={{ padding: '13px', background: accent, color: '#fff', border: 'none', borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: enviando ? 'default' : 'pointer' }}>
                  {enviando ? 'Enviando…' : 'Enviar mensaje'}
                </button>
              </div>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: T.textTer, marginTop: 16 }}>Enviado con Mecha</p>
      </div>
    </div>
  );
}
