import { useState, useRef, useEffect } from 'react';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { Btn, IconBtn } from '@/components/ui/SettingsAtoms';
import {
  parseTarifasDocumento,
  ejecutarImportacionTarifas,
  type ExtractedServicio,
} from '@/lib/importadorIA';

const T = DESIGN_TOKENS;

/** Simple viewport width tracker for responsive inline styles */
function useViewportWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return w;
}

interface ModalImportarTarifasIAProps {
  negocioId: string;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function ModalImportarTarifasIA({
  negocioId,
  isOpen,
  onClose,
  onImportComplete,
}: ModalImportarTarifasIAProps) {
  const vw = useViewportWidth();
  const isMobile = vw < 600;
  const [paso, setPaso] = useState<'subir' | 'procesando' | 'preview' | 'resultado'>('subir');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [servicios, setServicios] = useState<ExtractedServicio[]>([]);
  const [crearCatsAuto, setCrearCatsAuto] = useState(true);
  const [resultadoImport, setResultadoImport] = useState<{
    creadas: number;
    actualizadas: number;
    categoriasCreadas: number;
    errores: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    setError('');
    setArchivo(file);
    setPaso('procesando');

    const res = await parseTarifasDocumento(file, negocioId);

    if (res.ok && res.servicios.length > 0) {
      setServicios(res.servicios);
      if (res.nombreNegocio) setNombreNegocio(res.nombreNegocio);
      if (res.direccion) setDireccion(res.direccion);
      setPaso('preview');
    } else {
      setError(res.error || 'No se pudieron extraer tarifas válidas del documento.');
      setPaso('subir');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const toggleSelectAll = (check: boolean) => {
    setServicios(prev => prev.map(s => ({ ...s, seleccionado: check })));
  };

  const updateServicio = (idTemp: string, fields: Partial<ExtractedServicio>) => {
    setServicios(prev =>
      prev.map(s => (s.idTemp === idTemp ? { ...s, ...fields } : s))
    );
  };

  const removeServicio = (idTemp: string) => {
    setServicios(prev => prev.filter(s => s.idTemp !== idTemp));
  };

  const addManualServicio = () => {
    const newSrv: ExtractedServicio = {
      idTemp: `srv_manual_${Date.now()}`,
      nombre: 'Nuevo Servicio',
      precio: 20,
      duracion_min: 30,
      categoria: 'General',
      seleccionado: true,
    };
    setServicios(prev => [newSrv, ...prev]);
  };

  const handleConfirmImport = async () => {
    setError('');
    setPaso('procesando');

    const res = await ejecutarImportacionTarifas(negocioId, servicios, crearCatsAuto);

    if (res.ok) {
      setResultadoImport({
        creadas: res.creadas,
        actualizadas: res.actualizadas,
        categoriasCreadas: res.categoriasCreadas,
        errores: res.errores,
      });
      setPaso('resultado');
      onImportComplete();
    } else {
      setError(res.errores.join(' | ') || 'Error al guardar los servicios.');
      setPaso('preview');
    }
  };

  const resetState = () => {
    setPaso('subir');
    setArchivo(null);
    setError('');
    setServicios([]);
    setResultadoImport(null);
  };

  // Agrupar por categorías para la vista previa
  const seleccionadosCount = servicios.filter(s => s.seleccionado).length;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 8 : 16,
      }}
      onClick={e => {
        if (e.target === e.currentTarget && paso !== 'procesando') onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: paso === 'preview' ? 840 : 540,
          backgroundColor: '#ffffff',
          borderRadius: isMobile ? 12 : 20,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: isMobile ? 'calc(100vh / var(--mecha-zoom, 1))' : 'calc(90vh / var(--mecha-zoom, 1))',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Cabecera Modal */}
        <div
          style={{
            padding: isMobile ? '14px 16px' : '20px 24px',
            borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #fafaf9 0%, #f5f5f4 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #f4501e 0%, #ff7043 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                boxShadow: '0 4px 10px rgba(244, 80, 30, 0.3)',
              }}
            >
              ✨
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1c1917' }}>
                Importador de Tarifas con IA
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: '#78716c' }}>
                Extrae catálogo, precios y duraciones de cualquier archivo
              </p>
            </div>
          </div>
          {paso !== 'procesando' && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                color: '#a8a29e',
                cursor: 'pointer',
                padding: 4,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: '#fef2f2',
              borderBottom: '1px solid #fee2e2',
              color: '#dc2626',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Cuerpo del Modal */}
        <div style={{ padding: isMobile ? 14 : 24, overflowY: 'auto', flex: 1 }}>
          {/* PASO 1: SUBIR ARCHIVO */}
          {paso === 'subir' && (
            <div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#f4501e' : '#cbd5e1'}`,
                  borderRadius: 16,
                  padding: '40px 20px',
                  textAlign: 'center',
                  backgroundColor: dragOver ? 'rgba(244, 80, 30, 0.04)' : '#fafaf9',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".docx,.xlsx,.xls,.csv,.pdf,.txt,.png,.jpg,.jpeg,.webp"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
                <div style={{ fontSize: 42, marginBottom: 12 }}>📁</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1c1917', marginBottom: 6 }}>
                  Arrastra o selecciona el documento de tu salón
                </div>
                <div style={{ fontSize: 13, color: '#78716c', marginBottom: 16 }}>
                  Soporta listas en Word (`.docx`), Excel (`.xlsx`), CSV, PDF, texto o fotos del cartel
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 30,
                    backgroundColor: '#ffffff',
                    border: '1px solid #e7e5e4',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#f4501e',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  }}
                >
                  <span>🔍</span> Examinar mis archivos
                </div>
              </div>

              {/* Formatos soportados badge */}
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
                  Formatos compatibles probados:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { ext: 'DOCX', name: 'Word (ej. Carta Florent)' },
                    { ext: 'XLSX', name: 'Excel / CSV' },
                    { ext: 'PDF / TXT', name: 'Documentos' },
                    { ext: 'JPG / PNG', name: 'Fotos e imágenes' },
                  ].map(f => (
                    <div
                      key={f.ext}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        backgroundColor: '#f5f5f4',
                        border: '1px solid #e7e5e4',
                        fontSize: 12,
                        color: '#44403c',
                      }}
                    >
                      <strong style={{ color: '#1c1917' }}>{f.ext}</strong> — {f.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: PROCESANDO */}
          {paso === 'procesando' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  margin: '0 auto 20px',
                  borderRadius: '50%',
                  border: '4px solid #ffedd5',
                  borderTopColor: '#f4501e',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1c1917' }}>
                La Inteligencia Artificial está leyendo tu documento...
              </h4>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: '#78716c' }}>
                Extrayendo nombres de servicios, precios en euros, categorías y convirtiendo duraciones.
              </p>
            </div>
          )}

          {/* PASO 3: VISTA PREVIA Y EDICIÓN */}
          {paso === 'preview' && (
            <div>
              {nombreNegocio && (
                <div
                  style={{
                    padding: 12,
                    backgroundColor: '#fff7ed',
                    border: '1px solid #ffedd5',
                    borderRadius: 10,
                    marginBottom: 16,
                    fontSize: 13,
                    color: '#c2410c',
                  }}
                >
                  ✨ Se detectó la cabecera: <strong>{nombreNegocio}</strong> {direccion && `(${direccion})`}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#44403c' }}>
                  {servicios.length} servicios detectados ({seleccionadosCount} seleccionados)
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => toggleSelectAll(true)}
                    style={{ background: 'none', border: 'none', color: '#f4501e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Seleccionar todos
                  </button>
                  <button
                    onClick={() => toggleSelectAll(false)}
                    style={{ background: 'none', border: 'none', color: '#a8a29e', fontSize: 12, cursor: 'pointer' }}
                  >
                    Desmarcar todos
                  </button>
                </div>
              </div>

              {/* Lista editable de servicios */}
              <div
                style={{
                  maxHeight: 380,
                  overflowY: 'auto',
                  border: '1px solid #e7e5e4',
                  borderRadius: 12,
                  backgroundColor: '#fafaf9',
                }}
              >
                {servicios.map((s, i) => (
                  <div
                    key={s.idTemp}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: isMobile ? 6 : 8,
                      padding: isMobile ? '8px 10px' : '10px 14px',
                      borderBottom: i === servicios.length - 1 ? 'none' : '1px solid #f5f5f4',
                      backgroundColor: s.seleccionado ? '#ffffff' : 'rgba(250, 250, 249, 0.6)',
                      opacity: s.seleccionado ? 1 : 0.6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={s.seleccionado}
                      onChange={e => updateServicio(s.idTemp, { seleccionado: e.target.checked })}
                      style={{ cursor: 'pointer', width: 16, height: 16, flexShrink: 0, accentColor: '#f4501e' }}
                    />
                    <input
                      type="text"
                      value={s.nombre}
                      onChange={e => updateServicio(s.idTemp, { nombre: e.target.value })}
                      placeholder="Nombre del servicio"
                      style={{
                        flex: '3 1 150px',
                        minWidth: 120,
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #e7e5e4',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#1c1917',
                      }}
                    />
                    {s.yaExiste && (
                      <span
                        title="Ya existe un servicio con este nombre: se actualizará su precio/duración en vez de crear uno nuevo"
                        style={{
                          flexShrink: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#0369a1',
                          backgroundColor: '#e0f2fe',
                          border: '1px solid #bae6fd',
                          borderRadius: 20,
                          padding: '3px 8px',
                        }}
                      >
                        🔄 Actualiza existente
                      </span>
                    )}
                    <input
                      type="text"
                      value={s.categoria}
                      onChange={e => updateServicio(s.idTemp, { categoria: e.target.value })}
                      placeholder="Categoría"
                      style={{
                        flex: '1 1 100px',
                        minWidth: 90,
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #e7e5e4',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#6b21a8',
                        backgroundColor: '#faf5ff',
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 1 80px', minWidth: 66 }}>
                      <input
                        type="number"
                        value={s.precio}
                        onChange={e => updateServicio(s.idTemp, { precio: parseFloat(e.target.value) || 0 })}
                        style={{
                          width: '100%',
                          padding: '6px 6px',
                          borderRadius: 6,
                          border: '1px solid #e7e5e4',
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#0f766e',
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ fontSize: 12, color: '#78716c' }}>€</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 1 76px', minWidth: 62 }}>
                      <input
                        type="number"
                        value={s.duracion_min}
                        onChange={e => updateServicio(s.idTemp, { duracion_min: parseInt(e.target.value, 10) || 15 })}
                        style={{
                          width: '100%',
                          padding: '6px 6px',
                          borderRadius: 6,
                          border: '1px solid #e7e5e4',
                          fontSize: 12,
                          color: '#44403c',
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ fontSize: 11, color: '#a8a29e' }}>m</span>
                    </div>
                    <button
                      onClick={() => removeServicio(s.idTemp)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: 4,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
                <button
                  onClick={addManualServicio}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f4501e',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Añadir servicio manual
                </button>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#44403c', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={crearCatsAuto}
                    onChange={e => setCrearCatsAuto(e.target.checked)}
                    style={{ accentColor: '#f4501e' }}
                  />
                  Crear automáticamente las categorías que no existan
                </label>
              </div>
            </div>
          )}

          {/* PASO 4: RESULTADO DE IMPORTACIÓN */}
          {paso === 'resultado' && resultadoImport && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h4 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#166534' }}>
                ¡Tarifas e Importación Completadas!
              </h4>
              <p style={{ margin: '8px 0 24px', fontSize: 14, color: '#44403c' }}>
                Se han añadido correctamente las tarifas a la configuración de tu salón.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div style={{ padding: 16, backgroundColor: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#15803d' }}>{resultadoImport.creadas}</div>
                  <div style={{ fontSize: 12, color: '#166534' }}>Servicios Nuevos</div>
                </div>
                {resultadoImport.actualizadas > 0 && (
                  <div style={{ padding: 16, backgroundColor: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#1d4ed8' }}>{resultadoImport.actualizadas}</div>
                    <div style={{ fontSize: 12, color: '#1e40af' }}>Servicios Actualizados</div>
                  </div>
                )}
                <div style={{ padding: 16, backgroundColor: '#faf5ff', borderRadius: 12, border: '1px solid #f3e8ff' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#7e22ce' }}>{resultadoImport.categoriasCreadas}</div>
                  <div style={{ fontSize: 12, color: '#6b21a8' }}>Categorías Creadas</div>
                </div>
              </div>

              {resultadoImport.errores.length > 0 && (
                <div style={{ textAlign: 'left', backgroundColor: '#fef2f2', padding: 12, borderRadius: 8, fontSize: 12, color: '#b91c1c' }}>
                  <strong>Avisos durante la importación:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {resultadoImport.errores.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Acciones */}
        <div
          style={{
            padding: isMobile ? '12px 16px' : '16px 24px',
            borderTop: '1px solid #e7e5e4',
            backgroundColor: '#fafaf9',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {paso === 'preview' ? (
            <>
              <button
                onClick={resetState}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#78716c',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ← Volver a subir
              </button>

              <Btn
                variant="primary"
                onClick={handleConfirmImport}
                disabled={seleccionadosCount === 0}
              >
                Confirmar e Importar {seleccionadosCount} Servicios
              </Btn>
            </>
          ) : paso === 'resultado' ? (
            <div style={{ width: '100%', textAlign: 'right' }}>
              <Btn variant="primary" onClick={onClose}>
                Finalizar
              </Btn>
            </div>
          ) : (
            <div style={{ width: '100%', textAlign: 'right' }}>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#78716c',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
