import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useResponsive } from '@/lib/hooks/useResponsive';

// Minimal tokens
const TOKENS = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  text: '#1c1814',
  textSec: '#5c5249',
  primary: '#f4501e',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
};

const Icon = ({ name, size = 24, color = 'currentColor' }: { name: string, size?: number, color?: string }) => {
  const icons: any = {
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    upload: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    sparkle: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M12 3l1.9 5.7a2 2 0 0 0 1.4 1.4L21 12l-5.7 1.9a2 2 0 0 0-1.4 1.4L12 21l-1.9-5.7a2 2 0 0 0-1.4-1.4L3 12l5.7-1.9a2 2 0 0 0 1.4-1.4L12 3z"/></svg>`,
    check: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  };
  return <div style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

const TONES = [
  { name: 'Rubio Platino', value: 'rubio_platino', hex: '#E6D3A8' },
  { name: 'Castaño Claro', value: 'castano_claro', hex: '#8B5A2B' },
  { name: 'Caoba', value: 'caoba', hex: '#8C3224' },
  { name: 'Cobre', value: 'cobre', hex: '#B84E14' },
  { name: 'Negro Azabache', value: 'negro', hex: '#1C1C1C' },
  { name: 'Fantasía Rosa', value: 'rosa', hex: '#FF69B4' },
];

export function ColorTryOnModal({ cliente, negocioId, onClose, onSaved }: { cliente: { id: string, consiente_ia?: boolean }, negocioId: string, onClose: () => void, onSaved: () => Promise<void> }) {
  const { isMobile } = useResponsive();
  const [step, setStep] = useState<'consent' | 'upload' | 'select' | 'processing' | 'result'>(
    cliente.consiente_ia ? 'upload' : 'consent'
  );
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(TONES[0].value);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConsent = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: dbErr } = await supabase
        .from('clientes')
        .update({ consiente_ia: true, consiente_ia_origen: 'modal_tryon', consiente_ia_fecha: new Date().toISOString() })
        .eq('id', cliente.id);
      
      if (dbErr) throw dbErr;
      setStep('upload');
    } catch (err) {
      setError((err as Error).message || 'Error al actualizar consentimiento');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      setStep('select');
    }
  };

  const processTryOn = async () => {
    if (!photoFile) return;
    setLoading(true);
    setError(null);
    setStep('processing');

    try {
      // 1. Upload to private bucket
      const ext = photoFile.name.split('.').pop();
      const fileName = `${cliente.id}/tryon_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('cliente-fotos').upload(fileName, photoFile);
      if (uploadErr) throw new Error('Error al subir la imagen: ' + uploadErr.message);

      // 2. Get signed url
      const { data: signedData, error: signedErr } = await supabase.storage.from('cliente-fotos').createSignedUrl(fileName, 3600);
      if (signedErr || !signedData?.signedUrl) throw new Error('Error al generar enlace seguro: ' + (signedErr?.message || ''));

      // 3. Call Edge Function
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      const r = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/try-on-color`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: signedData.signedUrl,
          targetColor: selectedColor,
        }),
      });

      const res = await r.json();
      if (!r.ok) {
        throw new Error(res.error || 'Fallo en la API de simulación');
      }

      setResultUrl(res.resultUrl);
      setStep('result');
    } catch (err) {
      setError((err as Error).message || 'Error durante la simulación');
      setStep('select');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndBook = async () => {
    setLoading(true);
    try {
      const tonoObj = TONES.find(t => t.value === selectedColor);
      const { error: dbErr } = await supabase.from('formulas_color').insert({
        negocio_id: negocioId,
        cliente_id: cliente.id,
        producto: 'Simulación IA',
        tono: tonoObj?.name || selectedColor,
        notas: `Tono virtual generado a partir de foto. \nColor objetivo: ${tonoObj?.name}`,
      });
      if (dbErr) throw dbErr;
      
      await onSaved();
      
      // Navigate to booking or handle booking flow
      // A generic approach: alert or direct to agenda
      alert(`¡Tono ${tonoObj?.name} guardado en la ficha técnica! Ya puedes agendar su cita de color.`);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Error al guardar la fórmula');
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(28,24,20,0.6)', padding: 16 }}>
      <div style={{ background: TOKENS.bgPanel, width: '100%', maxWidth: 500, borderRadius: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        
        {/* Header */}
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${TOKENS.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(244,80,30,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOKENS.primary }}>
              <Icon name="sparkle" size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TOKENS.text }}>Prueba de Color Virtual</h2>
              <p style={{ margin: 0, fontSize: 12, color: TOKENS.textSec }}>IA Chispa</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: TOKENS.textSec, padding: 4 }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24, overflowY: 'auto' }}>
          {error && (
            <div style={{ padding: 12, background: TOKENS.dangerSoft, border: `1px solid ${TOKENS.danger}40`, color: TOKENS.danger, borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          {step === 'consent' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: TOKENS.dangerSoft, color: TOKENS.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Icon name="alert" size={24} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Consentimiento Requerido</h3>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: TOKENS.textSec, lineHeight: 1.5 }}>
                Esta funcionalidad utiliza un proveedor de IA de terceros (LightX) para procesar la fotografía y generar el resultado. La foto original se elimina de sus servidores en 24 horas. ¿Deseas firmar el consentimiento de la clienta para proceder?
              </p>
              <button 
                onClick={handleConsent} 
                disabled={loading}
                style={{ width: '100%', padding: '12px', background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Guardando...' : 'Sí, otorgar consentimiento'}
              </button>
            </div>
          )}

          {step === 'upload' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div 
                style={{ border: `2px dashed ${TOKENS.border}`, borderRadius: 12, padding: 40, cursor: 'pointer', background: TOKENS.bgCardHi }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ color: TOKENS.textSec, marginBottom: 12 }}>
                  <Icon name="upload" size={32} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TOKENS.text }}>Subir foto de la clienta</div>
                <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 4 }}>Formatos JPEG o PNG</div>
                <input 
                  type="file" 
                  accept="image/jpeg,image/png" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  style={{ display: 'none' }} 
                />
              </div>
            </div>
          )}

          {step === 'select' && photoPreview && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <img src={photoPreview} alt="Original" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 12, objectFit: 'cover' }} />
              </div>
              <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Elige un tono a simular:</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {TONES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedColor(t.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: 12,
                      borderRadius: 10, border: `2px solid ${selectedColor === t.value ? TOKENS.primary : TOKENS.border}`,
                      background: TOKENS.bgCard, cursor: 'pointer', textAlign: 'left'
                    }}
                  >
                    <span style={{ width: 24, height: 24, borderRadius: 12, background: t.hex, border: '1px solid rgba(0,0,0,0.1)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="m-spinner" style={{ margin: '0 auto 16px', borderTopColor: TOKENS.primary }}></div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TOKENS.text }}>Procesando magia...</div>
              <div style={{ fontSize: 13, color: TOKENS.textSec, marginTop: 8 }}>La IA está aplicando el color seleccionado a la foto de la clienta.</div>
            </div>
          )}

          {step === 'result' && resultUrl && (
             <div>
               <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                 <img src={resultUrl} alt="Resultado" style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 12, objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
               </div>
               <div style={{ background: TOKENS.bgCardHi, padding: 16, borderRadius: 12, textAlign: 'center' }}>
                 <div style={{ fontSize: 13, color: TOKENS.textSec, marginBottom: 4 }}>Tono simulado:</div>
                 <div style={{ fontSize: 16, fontWeight: 700, color: TOKENS.primary }}>{TONES.find(t => t.value === selectedColor)?.name}</div>
               </div>
             </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', background: TOKENS.bgCard, borderTop: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          {step !== 'processing' && (
             <button onClick={onClose} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${TOKENS.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600, color: TOKENS.text, cursor: 'pointer' }}>
               Cancelar
             </button>
          )}
          {step === 'select' && (
             <button onClick={processTryOn} disabled={loading} style={{ padding: '10px 16px', background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
               Generar Tono
             </button>
          )}
          {step === 'result' && (
             <button onClick={handleSaveAndBook} disabled={loading} style={{ padding: '10px 16px', background: '#0f9d6b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
               <Icon name="check" size={16} />
               Guardar y Reservar Color
             </button>
          )}
        </div>
      </div>
    </div>
  );
}
