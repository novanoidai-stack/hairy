// TabImportarCitas: importación de citas desde Booksy/Fresha (CSV)
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';
import { Section, Btn } from '@/components/ui/SettingsAtoms';
import { DESIGN_TOKENS } from '@/lib/designTokens';

const T = DESIGN_TOKENS;

interface ImportState {
  paso: 'origen' | 'subir' | 'mapear' | 'previsualizar' | 'resultado';
  origen: 'booksy' | 'fresha' | null;
  archivo: File | null;
  columnas: string[];
  mapeo: Record<string, string>;
  filas: any[];
  resultado: { creadas: number; errores: string[]; duplicados: number } | null;
}

interface Servicio { id: string; nombre: string; }
interface Profesional { id: string; nombre: string; }

export function TabImportarCitas({ negocioId }: { negocioId: string }) {
  const [state, setState] = useState<ImportState>({
    paso: 'origen',
    origen: null,
    archivo: null,
    columnas: [],
    mapeo: {},
    filas: [],
    resultado: null,
  });
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cargarReferencias = useCallback(async () => {
    const [srvs, profs] = await Promise.all([
      supabase.from('servicios').select('id, nombre').eq('negocio_id', negocioId).eq('activo', true),
      supabase.from('profesionales').select('id, nombre').eq('negocio_id', negocioId).eq('activo', true),
    ]);
    setServicios((srvs.data || []) as Servicio[]);
    setProfesionales((profs.data || []) as Profesional[]);
  }, [negocioId]);

  // Al montar, cargar referencias
  useState(() => { cargarReferencias(); });

  const parseCSV = (text: string): string[] => {
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentLine += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        lines.push(currentLine.trim());
        currentLine = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = '';
        if (char === '\r' && nextChar === '\n') i++;
      } else {
        currentLine += char;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    return lines;
  };

  const handleFileUpload = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const text = await file.text();
      const lines = parseCSV(text);
      if (lines.length < 2) throw new Error('El archivo CSV debe tener al menos una cabecera y una fila de datos');

      const columnas = lines[0].split(',').map(c => c.replace(/^"|"$/g, '').trim());
      const filas = lines.slice(1).map(line => {
        const valores = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
        const obj: any = {};
        columnas.forEach((col, i) => { obj[col] = valores[i] || ''; });
        return obj;
      });

      setState(prev => ({ ...prev, paso: 'mapear', archivo: file, columnas, filas }));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  };

  const CAMPOS_REQUERIDOS = ['fecha', 'hora', 'cliente', 'telefono', 'servicio'];
  const CAMPOS_OPCIONALES = ['profesional', 'precio', 'notas'];

  const setMapeo = (csvCol: string, mechaCampo: string) => {
    setState(prev => ({ ...prev, mapeo: { ...prev.mapeo, [csvCol]: mechaCampo } }));
  };

  const mapeoCompleto = (): boolean => {
    return CAMPOS_REQUERIDOS.every(campo => Object.values(state.mapeo).includes(campo));
  };

  const aplicarMapeo = () => {
    const { filas, mapeo } = state;
    const mapeoInverso: Record<string, string> = {};
    Object.entries(mapeo).forEach(([csvCol, mechaCampo]) => {
      if (mechaCampo) mapeoInverso[mechaCampo] = csvCol;
    });

    const filasMapeadas = filas.map(fila => {
      const mapeada: any = {};
      Object.entries(mapeoInverso).forEach(([mechaCampo, csvCol]) => {
        mapeada[mechaCampo] = fila[csvCol] || '';
      });
      return mapeada;
    });

    setState(prev => ({ ...prev, paso: 'previsualizar', filas: filasMapeadas }));
  };

  const ejecutarImportacion = async () => {
    setError('');
    setBusy(true);
    try {
      const { data, error: err } = await supabase.rpc('importar_citas_csv', {
        p_negocio_id: negocioId,
        p_filas: state.filas,
        p_canal: 'csv',
      });

      if (err) throw err;

      setState(prev => ({ ...prev, paso: 'resultado', resultado: data as any }));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setState({
      paso: 'origen',
      origen: null,
      archivo: null,
      columnas: [],
      mapeo: {},
      filas: [],
      resultado: null,
    });
    setError('');
  };

  return (
    <div>
      <Section title="Importar citas desde Booksy/Fresha">
        <p style={{ fontSize: 13, color: T.textSec, marginBottom: 20 }}>
          Importa tu agenda desde Booksy o Fresha subiendo un archivo CSV. El asistente te guiará paso a paso.
        </p>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(226,59,52,0.10)', color: '#e23b34', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* PASO 1: Origen */}
        {state.paso === 'origen' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              ¿Desde dónde quieres importar?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <button
                onClick={() => setState(prev => ({ ...prev, paso: 'subir', origen: 'booksy' }))}
                disabled={busy}
                style={{
                  padding: 20, borderRadius: 12, border: `2px solid ${T.border}`, background: T.bgCard,
                  cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.primary; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Booksy</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Exporta tu agenda desde Booksy y súbela aquí</div>
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, paso: 'subir', origen: 'fresha' }))}
                disabled={busy}
                style={{
                  padding: 20, borderRadius: 12, border: `2px solid ${T.border}`, background: T.bgCard,
                  cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.primary; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>💇</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Fresha</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Exporta tu agenda desde Fresha y súbela aquí</div>
              </button>
            </div>
          </div>
        )}

        {/* PASO 2: Subir archivo */}
        {state.paso === 'subir' && (
          <div>
            <button
              onClick={() => setState(prev => ({ ...prev, paso: 'origen' }))}
              style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}
            >
              ← Volver
            </button>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              Sube tu archivo CSV de {state.origen === 'booksy' ? 'Booksy' : 'Fresha'}
            </div>
            <div
              style={{
                padding: 40, borderRadius: 12, border: `2px dashed ${T.border}`,
                background: T.bgCard, textAlign: 'center', cursor: 'pointer',
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = e => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
                };
                input.click();
              }}
            >
              {busy ? (
                <div style={{ fontSize: 13, color: T.textSec }}>Procesando...</div>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                  <div style={{ fontSize: 14, color: T.text }}>Haz clic o arrastra tu archivo CSV aquí</div>
                  <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Máx. 5MB</div>
                </>
              )}
            </div>
          </div>
        )}

        {/* PASO 3: Mapear columnas */}
        {state.paso === 'mapear' && (
          <div>
            <button
              onClick={() => setState(prev => ({ ...prev, paso: 'subir' }))}
              style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}
            >
              ← Volver
            </button>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              Asigna cada columna de tu CSV a un campo de Mecha
            </div>

            <div style={{ background: T.bgCard, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              {CAMPOS_REQUERIDOS.map(campo => (
                <div key={campo} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 140, fontSize: 13, fontWeight: 600, color: T.text }}>
                    {campo.charAt(0).toUpperCase() + campo.slice(1)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <select
                      value={Object.keys(state.mapeo).find(k => state.mapeo[k] === campo) || ''}
                      onChange={e => {
                        const prevCol = Object.keys(state.mapeo).find(k => state.mapeo[k] === campo);
                        if (prevCol) {
                          const newMapeo = { ...state.mapeo };
                          delete newMapeo[prevCol];
                          setState(prev => ({ ...prev, mapeo: newMapeo }));
                        }
                        if (e.target.value) {
                          setMapeo(e.target.value, campo);
                        }
                      }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13 }}
                    >
                      <option value="">-- Selecciona columna --</option>
                      {state.columnas.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <Btn
              variant="primary"
              disabled={!mapeoCompleto() || busy}
              onClick={aplicarMapeo}
            >
              Continuar
            </Btn>
          </div>
        )}

        {/* PASO 4: Previsualizar */}
        {state.paso === 'previsualizar' && (
          <div>
            <button
              onClick={() => setState(prev => ({ ...prev, paso: 'mapear' }))}
              style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}
            >
              ← Volver
            </button>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              Revisa {state.filas.length} citas que se importarán
            </div>

            <div style={{ background: T.bgCard, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: T.text }}>Fecha</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: T.text }}>Hora</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: T.text }}>Cliente</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: T.text }}>Servicio</th>
                  </tr>
                </thead>
                <tbody>
                  {state.filas.slice(0, 10).map((fila, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: '10px 12px', color: T.text }}>{fila.fecha}</td>
                      <td style={{ padding: '10px 12px', color: T.text }}>{fila.hora}</td>
                      <td style={{ padding: '10px 12px', color: T.text }}>{fila.cliente}</td>
                      <td style={{ padding: '10px 12px', color: T.text }}>{fila.servicio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {state.filas.length > 10 && (
                <div style={{ padding: '10px 12px', fontSize: 12, color: T.textSec, textAlign: 'center' }}>
                  ... y {state.filas.length - 10} más
                </div>
              )}
            </div>

            <Btn
              variant="primary"
              disabled={busy}
              onClick={ejecutarImportacion}
            >
              {busy ? 'Importando...' : `Importar ${state.filas.length} citas`}
            </Btn>
          </div>
        )}

        {/* PASO 5: Resultado */}
        {state.paso === 'resultado' && state.resultado && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              Importación completada
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 16, borderRadius: 10, background: 'rgba(15,157,107,0.10)', border: `1px solid rgba(15,157,107,0.3)`, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#0f9d6b' }}>{state.resultado.creadas}</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Citas creadas</div>
              </div>
              <div style={{ padding: 16, borderRadius: 10, background: 'rgba(244,80,30,0.10)', border: `1px solid rgba(244,80,30,0.3)`, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: T.primary }}>{state.resultado.duplicados}</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Duplicados omitidos</div>
              </div>
              <div style={{ padding: 16, borderRadius: 10, background: 'rgba(226,59,52,0.10)', border: `1px solid rgba(226,59,52,0.3)`, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#e23b34' }}>{state.resultado.errores.length}</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Errores</div>
              </div>
            </div>

            {state.resultado.errores.length > 0 && (
              <div style={{ background: T.bgCard, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 8 }}>Errores:</div>
                {state.resultado.errores.map((err, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#e23b34', marginBottom: 4 }}>• {err}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <Btn variant="primary" onClick={() => window.location.href = '/app/agenda'}>
                Ver agenda
              </Btn>
              <Btn variant="ghost" onClick={reset}>
                Importar más
              </Btn>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
