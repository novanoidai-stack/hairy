import { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { eur } from '@/lib/presupuestos';
import { generarPresupuestoPdf, descargarBlob } from '@/lib/presupuestoPdf';
import { presupuestoEnviarMensajePublico, notificarBandeja, type MensajeTipo } from '@/lib/bandeja';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// ---------------------------------------------------------------------------
// Página pública de un presupuesto (/app/presupuesto/[token]). Anónima: el
// cliente la abre desde el enlace del correo/WhatsApp, ve el detalle, descarga
// el PDF y puede ACEPTARLO. Todo vía RPC security definer (presupuesto_publico /
// aceptar_presupuesto_publico). Lenguaje visual del portal de reserva.
// ---------------------------------------------------------------------------
const T = {
  bg: '#f7f0e8', card: '#ffffff', cardHi: '#fbf5ef', border: 'rgba(40,30,24,0.10)',
  text: '#241a14', textSec: '#5c5249', textTer: '#736658',
  success: '#0f9d6b', successSoft: 'rgba(15,157,107,0.12)', danger: '#e23b34',
};
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";

function Icon({ name, size = 18, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  };
  return <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
    __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
  }} />;
}

interface PubLinea { nombre: string; precio_cents: number; cantidad: number; }
interface PubMensaje { autor: 'cliente' | 'salon'; tipo: MensajeTipo; cuerpo: string; created_at: string; }
interface PubData {
  ok: boolean; motivo?: string;
  numero: number | null; estado: string; titulo: string | null; notas: string | null;
  contacto_nombre: string | null; total_cents: number; valido_hasta: string | null; created_at: string;
  lineas: PubLinea[];
  mensajes: PubMensaje[];
  salon: { nombre: string; logo_url: string | null; color: string; slug: string | null; direccion: string | null; telefono: string | null };
  aceptable: boolean; aceptado: boolean; cobrado: boolean; caducado: boolean;
}

export default function PresupuestoPublicoScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<PubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [mensajes, setMensajes] = useState<PubMensaje[]>([]);
  const [modoAccion, setModoAccion] = useState<MensajeTipo | null>(null);
  const [textoAccion, setTextoAccion] = useState('');
  const [enviandoAccion, setEnviandoAccion] = useState(false);
  const [accionError, setAccionError] = useState('');
  const [yaRechazado, setYaRechazado] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc('presupuesto_publico', { p_token: token });
    if (!error && res?.ok) {
      setData(res as PubData);
      setAccepted((res as PubData).aceptado);
      setMensajes((res as PubData).mensajes || []);
    }
    else setData(res?.ok === false ? (res as PubData) : null);
    setLoading(false);
  }, [token]);

  const enviarAccion = async () => {
    if (!token || !modoAccion) return;
    if (modoAccion !== 'rechazo' && !textoAccion.trim()) { setAccionError('Escribe un mensaje.'); return; }
    setEnviandoAccion(true); setAccionError('');
    try {
      const res = await presupuestoEnviarMensajePublico(token, modoAccion, textoAccion);
      if (!res.ok) { setAccionError('No se pudo enviar. Inténtalo de nuevo.'); return; }
      if (res.mensaje_id) notificarBandeja(res.mensaje_id);
      setMensajes((prev) => [...prev, {
        autor: 'cliente', tipo: modoAccion,
        cuerpo: textoAccion.trim() || (modoAccion === 'rechazo' ? 'Has rechazado el presupuesto.' : ''),
        created_at: new Date().toISOString(),
      }]);
      if (modoAccion === 'rechazo') setYaRechazado(true);
      setTextoAccion(''); setModoAccion(null);
    } catch (_e) {
      setAccionError('No se pudo enviar. Inténtalo de nuevo.');
    } finally { setEnviandoAccion(false); }
  };

  useEffect(() => { cargar(); }, [cargar]);

  const aceptar = async () => {
    if (!token) return;
    setAccepting(true);
    const { data: res } = await supabase.rpc('aceptar_presupuesto_publico', { p_token: token });
    if (res?.ok) setAccepted(true);
    setAccepting(false);
  };

  const descargar = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const blob = await generarPresupuestoPdf({
        salonNombre: data.salon.nombre, color: data.salon.color, salonDireccion: data.salon.direccion, salonTelefono: data.salon.telefono,
        numero: data.numero, fecha: data.created_at ? parseISO(data.created_at) : new Date(),
        contactoNombre: data.contacto_nombre, titulo: data.titulo, notas: data.notas,
        lineas: data.lineas, totalCents: data.total_cents, validoHasta: data.valido_hasta,
      });
      descargarBlob(blob, `presupuesto-P-${data.numero}.pdf`);
    } finally { setDownloading(false); }
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'grid', placeItems: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 34, height: 34, border: '3px solid #e3d8cc', borderTopColor: data?.salon?.color || '#f4501e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>;
  }

  if (!data || data.ok === false) {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 28, color: T.text, margin: '0 0 8px' }}>Presupuesto no disponible</h1>
        <p style={{ color: T.textSec, fontSize: 15 }}>El enlace no es válido o el presupuesto ya no existe. Pide a tu salón que te lo reenvíe.</p>
      </div>
    </div>;
  }

  const accent = data.salon.color || '#f4501e';
  const isAccepted = accepted || data.aceptado;
  const rechazado = yaRechazado || data.estado === 'rechazado';

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '32px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Cabecera salón */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          {data.salon.logo_url
            ? <img src={data.salon.logo_url} alt={data.salon.nombre} style={{ height: 48, objectFit: 'contain', marginBottom: 10 }} />
            : null}
          <div style={{ fontFamily: SERIF, fontSize: 26, color: T.text, lineHeight: 1.1 }}>{data.salon.nombre}</div>
          {data.salon.direccion ? <div style={{ fontSize: 12.5, color: T.textTer, marginTop: 4 }}>{data.salon.direccion}</div> : null}
        </div>

        {/* Tarjeta presupuesto */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 50px -28px rgba(40,30,24,0.4)' }}>
          <div style={{ height: 6, background: accent }} />
          <div style={{ padding: '22px 22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.textTer }}>Presupuesto P-{data.numero}</div>
              <div style={{ fontSize: 12.5, color: T.textTer }}>{data.created_at ? format(parseISO(data.created_at), "d 'de' MMMM yyyy", { locale: es }) : ''}</div>
            </div>
            {data.contacto_nombre ? <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginTop: 6 }}>Para {data.contacto_nombre}</div> : null}
            {data.titulo ? <div style={{ fontSize: 14, color: T.textSec, marginTop: 2 }}>{data.titulo}</div> : null}

            {/* Líneas */}
            <div style={{ marginTop: 18, borderTop: `1px solid ${T.border}` }}>
              {data.lineas.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 14.5, color: T.text }}>{l.nombre} {l.cantidad > 1 ? <span style={{ color: T.textTer }}>×{l.cantidad}</span> : null}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>{eur((l.precio_cents || 0) * Math.max(1, l.cantidad || 1))}</div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Total</span>
              <span style={{ fontSize: 28, fontWeight: 800, color: accent }}>{eur(data.total_cents)}</span>
            </div>

            {data.notas ? <p style={{ fontSize: 13, color: T.textSec, marginTop: 14, whiteSpace: 'pre-wrap' }}>{data.notas}</p> : null}
            {data.valido_hasta ? <p style={{ fontSize: 12.5, color: T.textTer, marginTop: 10 }}>Válido hasta el {format(parseISO(data.valido_hasta), "d 'de' MMMM yyyy", { locale: es })}.</p> : null}

            {/* Estado / acciones */}
            {data.cobrado ? (
              <div style={{ marginTop: 18, padding: '12px 14px', background: T.successSoft, borderRadius: 10, color: T.success, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={16} color={T.success} /> Este presupuesto ya está abonado. ¡Gracias!
              </div>
            ) : isAccepted ? (
              <div style={{ marginTop: 18 }}>
                <div style={{ padding: '12px 14px', background: T.successSoft, borderRadius: 10, color: T.success, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Icon name="check" size={16} color={T.success} /> Has aceptado el presupuesto. El salón se pondrá en contacto contigo.
                </div>
                {data.salon.slug && (
                  <a href={`/app/r/${data.salon.slug}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: accent, color: '#fff', borderRadius: 11, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                    <Icon name="calendar" size={16} color="#fff" /> Pedir cita ahora
                  </a>
                )}
              </div>
            ) : data.caducado ? (
              <div style={{ marginTop: 18, padding: '12px 14px', background: 'rgba(138,125,112,0.12)', borderRadius: 10, color: T.textTer, fontSize: 13.5 }}>
                Este presupuesto ha caducado. Pide a tu salón que te lo actualice.
              </div>
            ) : rechazado ? (
              <div style={{ marginTop: 18, padding: '12px 14px', background: 'rgba(226,59,52,0.10)', borderRadius: 10, color: T.danger, fontSize: 13.5 }}>
                Has rechazado este presupuesto. Si el salón te lo actualiza, podrás aceptarlo aquí.
              </div>
            ) : data.aceptable ? (
              <button onClick={aceptar} disabled={accepting} style={{ marginTop: 18, width: '100%', padding: '14px', background: accent, color: '#fff', border: 'none', borderRadius: 11, fontSize: 15.5, fontWeight: 700, cursor: accepting ? 'default' : 'pointer' }}>
                {accepting ? 'Aceptando…' : 'Aceptar presupuesto'}
              </button>
            ) : null}

            {/* Descargar PDF (siempre disponible) */}
            <button onClick={descargar} disabled={downloading} style={{ marginTop: 10, width: '100%', padding: '12px', background: T.card, color: T.textSec, border: `1px solid ${T.border}`, borderRadius: 11, fontSize: 14, fontWeight: 600, cursor: downloading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="download" size={15} color={T.textSec} /> {downloading ? 'Generando PDF…' : 'Descargar en PDF'}
            </button>

            {/* Conversación */}
            {!data.cobrado && !data.caducado ? (
              <div style={{ marginTop: 22, borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.textTer, marginBottom: 10 }}>Conversación</div>
                {mensajes.length === 0 ? (
                  <p style={{ fontSize: 13, color: T.textSec, marginBottom: 14 }}>¿Dudas sobre el presupuesto? Puedes pedir un cambio o escribir aquí.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {mensajes.map((m, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.autor === 'cliente' ? 'flex-end' : 'flex-start' }}>
                        {m.autor === 'cliente' && m.tipo !== 'mensaje' ? (
                          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: m.tipo === 'rechazo' ? T.danger : '#e08a00', marginBottom: 3 }}>
                            {m.tipo === 'rechazo' ? 'Rechazado' : 'Petición de cambio'}
                          </div>
                        ) : null}
                        <div style={{
                          maxWidth: '85%', padding: '10px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                          background: m.autor === 'cliente' ? T.cardHi : accent, color: m.autor === 'cliente' ? T.text : '#fff',
                          border: m.autor === 'cliente' ? `1px solid ${T.border}` : 'none',
                        }}>{m.cuerpo}</div>
                      </div>
                    ))}
                  </div>
                )}

                {modoAccion ? (
                  <div>
                    <textarea
                      value={textoAccion}
                      onChange={(e) => setTextoAccion(e.target.value)}
                      placeholder={modoAccion === 'rechazo' ? '¿Por qué? (opcional, ayuda al salón)' : modoAccion === 'cambio' ? 'Cuéntanos qué te gustaría cambiar…' : 'Escribe tu mensaje…'}
                      rows={3}
                      style={{ width: '100%', padding: 11, borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
                    />
                    {accionError ? <p style={{ color: T.danger, fontSize: 12.5, marginBottom: 8 }}>{accionError}</p> : null}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={enviarAccion} disabled={enviandoAccion} style={{ flex: 1, padding: '11px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: enviandoAccion ? 'default' : 'pointer' }}>
                        {enviandoAccion ? 'Enviando…' : modoAccion === 'rechazo' ? 'Confirmar rechazo' : 'Enviar'}
                      </button>
                      <button onClick={() => { setModoAccion(null); setTextoAccion(''); setAccionError(''); }} disabled={enviandoAccion} style={{ padding: '11px 16px', background: 'transparent', color: T.textSec, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {data.aceptable && !rechazado ? (
                      <button onClick={() => setModoAccion('rechazo')} style={{ padding: '9px 14px', background: 'transparent', color: T.danger, border: `1px solid ${T.danger}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        Rechazar
                      </button>
                    ) : null}
                    <button onClick={() => setModoAccion('cambio')} style={{ padding: '9px 14px', background: 'transparent', color: T.text, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Pedir un cambio
                    </button>
                    <button onClick={() => setModoAccion('mensaje')} style={{ padding: '9px 14px', background: 'transparent', color: T.text, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Escribir un mensaje
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: T.textTer, marginTop: 16 }}>Presupuesto orientativo · No es una factura · Enviado con Mecha</p>
      </div>
    </div>
  );
}
