import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const TOKENS = {
  bgApp: '#080604',
  bgPanel: '#120D0A',
  bgCard: '#1A1410',
  bgCardHi: '#251D17',
  border: '#2C221A',
  borderHi: '#382D24',
  text: '#F8FAFC',
  textSec: '#94A3B8',
  textTer: '#64748B',
  primary: '#F4501E',
  primarySoft: 'rgba(244, 80, 30, 0.12)',
  primaryHi: '#FF7A50',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  success: '#10B981',
};

const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {name === 'x' && <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
      {name === 'sparkle' && <path d="M12 2l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" />}
      {name === 'download' && <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>}
      {name === 'copy' && <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
    </svg>
  );
};

export function InstagramPostModal({ fotos, onClose, tonoSalon }: { fotos: any[]; onClose: () => void; tonoSalon?: string }) {
  const [antes, setAntes] = useState<any>(fotos.length === 2 ? fotos[1] : null); // Asumiendo que el más antiguo es el antes
  const [despues, setDespues] = useState<any>(fotos.length === 2 ? fotos[0] : null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [collageReady, setCollageReady] = useState(false);

  // Auto-seleccionar si solo hay 2
  useEffect(() => {
    if (fotos.length >= 2 && !antes && !despues) {
      const sorted = [...fotos].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setAntes(sorted[0]);
      setDespues(sorted[sorted.length - 1]);
    }
  }, [fotos]);

  useEffect(() => {
    if (antes && despues && canvasRef.current) {
      const drawCollage = async () => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Limpiar
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Cargar imágenes
        const loadImg = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous'; // Necesario para CORS en Canvas
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });

        try {
          const img1 = await loadImg(antes.url);
          const img2 = await loadImg(despues.url);

          // Dimensiones del canvas: 1080x1080 (cuadrado de Instagram)
          const size = 1080;
          canvas.width = size;
          canvas.height = size;

          // Dibujar Antes (mitad izquierda)
          // Cortar el centro de la imagen
          const drawHalf = (img: HTMLImageElement, isLeft: boolean) => {
            const hRatio = (size / 2) / img.width;
            const vRatio = size / img.height;
            const ratio = Math.max(hRatio, vRatio);
            const w = img.width * ratio;
            const h = img.height * ratio;
            const x = isLeft ? 0 : size / 2;
            const srcX = (img.width - (size / 2) / ratio) / 2;
            const srcY = (img.height - size / ratio) / 2;
            
            ctx.drawImage(
              img,
              srcX, srcY, (size / 2) / ratio, size / ratio, // Source
              x, 0, size / 2, size // Destination
            );
          };

          drawHalf(img1, true);
          drawHalf(img2, false);

          // Línea separadora
          ctx.beginPath();
          ctx.moveTo(size / 2, 0);
          ctx.lineTo(size / 2, size);
          ctx.lineWidth = 8;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          // Textos "Antes" y "Después"
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(size / 4 - 80, size - 100, 160, 60);
          ctx.fillRect(size * 0.75 - 80, size - 100, 160, 60);
          
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('ANTES', size / 4, size - 60);
          ctx.fillText('DESPUÉS', size * 0.75, size - 60);

          setCollageReady(true);
        } catch (e) {
          console.error("Error al generar collage:", e);
        }
      };
      drawCollage();
    } else {
      setCollageReady(false);
    }
  }, [antes, despues]);

  const generarPost = async () => {
    if (!antes || !despues) return;
    setLoading(true);
    setError('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chispa-vision-instagram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          urlAntes: antes.url,
          urlDespues: despues.url,
          tonoSalon: tonoSalon || 'profesional'
        })
      });

      if (!res.ok) throw new Error('Error en la llamada a la IA');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setCaption(data.caption);
    } catch (e: any) {
      setError(e.message || 'Error al generar el texto');
    } finally {
      setLoading(false);
    }
  };

  const descargarCollage = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/jpeg', 0.9);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antes-despues-${Date.now()}.jpg`;
    a.click();
  };

  const copiarCaption = () => {
    navigator.clipboard.writeText(caption);
    alert('Texto copiado al portapapeles');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: TOKENS.bgCard, width: '100%', maxWidth: 900, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="sparkle" size={20} color={TOKENS.primary} />
            <h2 style={{ margin: 0, fontSize: 18, color: TOKENS.text }}>Generar Post de Instagram (IA)</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="x" size={24} color={TOKENS.textSec} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Lado izquierdo: Selección y Generación */}
          <div style={{ flex: 1, padding: 24, borderRight: `1px solid ${TOKENS.border}`, overflowY: 'auto' }}>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8 }}>1. Selecciona el Antes</label>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                {fotos.map(f => (
                  <img 
                    key={`antes-${f.id}`}
                    src={f.url} 
                    alt="Foto" 
                    onClick={() => setAntes(f)}
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: antes?.id === f.id ? `3px solid ${TOKENS.primary}` : '3px solid transparent' }} 
                  />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8 }}>2. Selecciona el Después</label>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                {fotos.map(f => (
                  <img 
                    key={`despues-${f.id}`}
                    src={f.url} 
                    alt="Foto" 
                    onClick={() => setDespues(f)}
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: despues?.id === f.id ? `3px solid ${TOKENS.primary}` : '3px solid transparent' }} 
                  />
                ))}
              </div>
            </div>

            <button 
              onClick={generarPost}
              disabled={!antes || !despues || loading}
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: (!antes || !despues || loading) ? TOKENS.bgCardHi : TOKENS.primary, color: '#fff', fontSize: 15, fontWeight: 600, cursor: (!antes || !despues || loading) ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
            >
              <Icon name="sparkle" size={18} color="#fff" />
              {loading ? 'Generando magia...' : 'Generar Caption con IA'}
            </button>

            {error && <div style={{ marginTop: 16, color: TOKENS.danger, fontSize: 14 }}>{error}</div>}

            {caption && (
              <div style={{ marginTop: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8 }}>Caption Generado:</label>
                <div style={{ background: TOKENS.bgCardHi, padding: 16, borderRadius: 12, fontSize: 14, color: TOKENS.text, whiteSpace: 'pre-wrap', lineHeight: 1.5, border: `1px solid ${TOKENS.border}` }}>
                  {caption}
                </div>
                <button 
                  onClick={copiarCaption}
                  style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="copy" size={14} color={TOKENS.text} />
                  Copiar Texto
                </button>
              </div>
            )}
          </div>

          {/* Lado derecho: Preview del Collage */}
          <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: TOKENS.bgApp }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 15, color: TOKENS.textSec, fontWeight: 600 }}>Vista previa del Collage</h3>
            
            <div style={{ width: '100%', maxWidth: 360, aspectRatio: '1/1', background: TOKENS.bgCardHi, borderRadius: 12, overflow: 'hidden', position: 'relative', border: `1px solid ${TOKENS.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
              {(!antes || !despues) && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOKENS.textTer, fontSize: 14 }}>
                  Selecciona dos fotos
                </div>
              )}
              <canvas 
                ref={canvasRef} 
                style={{ width: '100%', height: '100%', display: antes && despues ? 'block' : 'none' }}
              />
            </div>

            {collageReady && (
              <button 
                onClick={descargarCollage}
                style={{ marginTop: 20, padding: '10px 20px', borderRadius: 8, border: `1px solid ${TOKENS.primary}`, background: TOKENS.primarySoft, color: TOKENS.primaryHi, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Icon name="download" size={16} color={TOKENS.primaryHi} />
                Descargar Imagen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
