import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';
import { Section, Btn } from '@/components/ui/SettingsAtoms';
import { DESIGN_TOKENS } from '@/lib/designTokens';

const T = DESIGN_TOKENS;

type Intencion = 'agenda_booksy_fresha' | 'catalogo' | 'factura_proveedor';

interface ImportState {
  paso: 'seleccion' | 'subir' | 'procesando' | 'preview' | 'resultado';
  intencion: Intencion | null;
  archivo: File | null;
  data: any | null;
  resultado: { creadas: number; errores: string[] } | null;
}

export function TabMigracionMagica({ negocioId }: { negocioId: string }) {
  const [state, setState] = useState<ImportState>({
    paso: 'seleccion',
    intencion: null,
    archivo: null,
    data: null,
    resultado: null,
  });
  const [error, setError] = useState('');

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let encoded = reader.result?.toString() || '';
        // extract base64 part
        const split = encoded.split(',');
        if (split.length > 1) {
          resolve(split[1]);
        } else {
          resolve(encoded);
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileUpload = async (file: File) => {
    setError('');
    setState(prev => ({ ...prev, paso: 'procesando', archivo: file }));

    try {
      let content = '';
      const mimeType = file.type || 'application/octet-stream';

      if (mimeType.startsWith('image/')) {
        content = await getBase64(file);
      } else {
        // Assume text/csv
        content = await file.text();
      }

      const { data, error: funcError } = await supabase.functions.invoke('migracion-magica', {
        body: {
          intencion: state.intencion,
          mimeType,
          content,
          negocioId
        }
      });

      if (funcError) throw funcError;
      if (!data || !data.ok) throw new Error(data?.error || 'Error desconocido al procesar con IA');

      setState(prev => ({ ...prev, paso: 'preview', data: data.data }));
    } catch (e) {
      setError(mensajeDeError(e));
      setState(prev => ({ ...prev, paso: 'subir' }));
    }
  };

  const ejecutarImportacion = async () => {
    setError('');
    setState(prev => ({ ...prev, paso: 'procesando' }));
    try {
      const { data, intencion } = state;
      let creadas = 0;
      let errores: string[] = [];

      if (intencion === 'agenda_booksy_fresha') {
        // Insert clientes
        for (const c of data.clientes || []) {
          if (!c.nombre) continue;
          const { error } = await supabase.from('clientes').upsert({
            negocio_id: negocioId,
            nombre: c.nombre,
            telefono: c.telefono ? c.telefono.replace(/\D/g, '') : null,
            email: c.email || null
          }, { onConflict: 'negocio_id,telefono' });
          if (error) errores.push(`Cliente ${c.nombre}: ${error.message}`);
          else creadas++;
        }
        // Insert servicios
        for (const s of data.servicios || []) {
          if (!s.nombre) continue;
          const { error } = await supabase.from('servicios').upsert({
            negocio_id: negocioId,
            nombre: s.nombre,
            precio: s.precio || 0,
            duracion_activa_min: s.duracion_min || 30
          }, { onConflict: 'negocio_id,nombre' });
          if (error) errores.push(`Servicio ${s.nombre}: ${error.message}`);
          else creadas++;
        }
        // Insert citas (simplified)
        for (const c of data.citas || []) {
          if (!c.fecha || !c.hora_inicio || !c.servicio_nombre) continue;
          
          // Buscar servicio_id
          const { data: srvs } = await supabase.from('servicios').select('id, precio, duracion_activa_min').eq('negocio_id', negocioId).eq('nombre', c.servicio_nombre).limit(1);
          const servicio = srvs?.[0];

          // Buscar cliente_id si hay telefono
          let clienteId = null;
          if (c.cliente_telefono) {
            const telefonoLimpio = c.cliente_telefono.replace(/\D/g, '');
            const { data: cls } = await supabase.from('clientes').select('id').eq('negocio_id', negocioId).eq('telefono', telefonoLimpio).limit(1);
            if (cls && cls[0]) clienteId = cls[0].id;
          }

          // Asignar primer profesional activo por defecto si no se sabe
          const { data: profs } = await supabase.from('profesionales').select('id').eq('negocio_id', negocioId).eq('activo', true).limit(1);
          const profId = profs?.[0]?.id;

          if (!servicio || !profId) {
            errores.push(`Cita ${c.fecha} ${c.hora_inicio}: Servicio o profesional no encontrado`);
            continue;
          }

          const inicio = new Date(`${c.fecha}T${c.hora_inicio}:00`);
          const fin = new Date(inicio.getTime() + (servicio.duracion_activa_min * 60000));

          const { error } = await supabase.from('citas').insert({
            negocio_id: negocioId,
            cliente_id: clienteId,
            cliente_nombre: c.cliente_nombre,
            servicio_id: servicio.id,
            servicio_nombre: c.servicio_nombre,
            profesional_id: profId,
            inicio: inicio.toISOString(),
            fin: fin.toISOString(),
            estado: 'confirmada',
            importe_esperado: servicio.precio
          });
          if (error) errores.push(`Cita ${c.fecha} ${c.hora_inicio}: ${error.message}`);
          else creadas++;
        }
      } else if (intencion === 'catalogo') {
        for (const s of data.servicios || []) {
          if (!s.nombre) continue;
          
          let catId = null;
          if (s.categoria) {
            const { data: cats } = await supabase.from('categorias_servicio').select('id').eq('negocio_id', negocioId).ilike('nombre', s.categoria).limit(1);
            if (cats && cats[0]) {
              catId = cats[0].id;
            } else {
              const { data: newCat } = await supabase.from('categorias_servicio').insert({ negocio_id: negocioId, nombre: s.categoria, orden: 0, color: '#e5e7eb', icono: 'general' }).select().single();
              if (newCat) catId = newCat.id;
            }
          }

          const { error } = await supabase.from('servicios').upsert({
            negocio_id: negocioId,
            nombre: s.nombre,
            precio: s.precio || 0,
            duracion_activa_min: s.duracion_min || 30,
            categoria_id: catId
          }, { onConflict: 'negocio_id,nombre' });
          
          if (error) errores.push(`Servicio ${s.nombre}: ${error.message}`);
          else creadas++;
        }
      } else if (intencion === 'factura_proveedor') {
        for (const l of data.lineas || []) {
          if (!l.nombre) continue;

          // Buscar o crear producto
          let prodId = null;
          const { data: prods } = await supabase.from('productos').select('id').eq('negocio_id', negocioId).ilike('nombre', l.nombre).limit(1);
          if (prods && prods[0]) {
            prodId = prods[0].id;
          } else {
            const { data: newProd } = await supabase.from('productos').insert({
              negocio_id: negocioId,
              nombre: l.nombre,
              codigo_barras: l.sku || null,
              precio: l.precio_coste || 0,
              stock_actual: 0,
              stock_minimo: 5,
              categoria: 'general'
            }).select().single();
            if (newProd) prodId = newProd.id;
          }

          if (prodId) {
            const { error } = await supabase.rpc('registrar_movimiento_inventario', {
              p_producto_id: prodId,
              p_tipo: 'entrada',
              p_unidades: l.cantidad || 1,
              p_motivo: 'Albarán Proveedor'
            });
            if (error) errores.push(`Línea ${l.nombre}: ${error.message}`);
            else creadas++;
          }
        }
      }

      setState(prev => ({ ...prev, paso: 'resultado', resultado: { creadas, errores } }));
    } catch (e) {
      setError(mensajeDeError(e));
      setState(prev => ({ ...prev, paso: 'preview' }));
    }
  };

  const reset = () => {
    setState({ paso: 'seleccion', intencion: null, archivo: null, data: null, resultado: null });
    setError('');
  };

  return (
    <div>
      <Section title="Migración Mágica con IA">
        <p style={{ fontSize: 13, color: T.textSec, marginBottom: 20 }}>
          Sube tus archivos de Booksy/Fresha, o una foto de tu lista de precios o albarán. La IA extraerá los datos automáticamente y los importará a Mecha sin configuraciones complejas.
        </p>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(226,59,52,0.10)', color: '#e23b34', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {state.paso === 'seleccion' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              ¿Qué quieres importar?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <button
                onClick={() => setState(prev => ({ ...prev, paso: 'subir', intencion: 'agenda_booksy_fresha' }))}
                style={{
                  padding: 20, borderRadius: 12, border: `2px solid ${T.border}`, background: T.bgCard,
                  cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.primary; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Booksy / Fresha</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>CSV o Excel con la agenda</div>
              </button>
              
              <button
                onClick={() => setState(prev => ({ ...prev, paso: 'subir', intencion: 'catalogo' }))}
                style={{
                  padding: 20, borderRadius: 12, border: `2px solid ${T.border}`, background: T.bgCard,
                  cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.primary; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Lista de Precios</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Sube una foto del catálogo</div>
              </button>

              <button
                onClick={() => setState(prev => ({ ...prev, paso: 'subir', intencion: 'factura_proveedor' }))}
                style={{
                  padding: 20, borderRadius: 12, border: `2px solid ${T.border}`, background: T.bgCard,
                  cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.primary; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>📦</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Albarán / Factura</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Sube una foto para el inventario</div>
              </button>
            </div>
          </div>
        )}

        {state.paso === 'subir' && (
          <div>
            <button
              onClick={() => setState(prev => ({ ...prev, paso: 'seleccion' }))}
              style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}
            >
              ← Volver
            </button>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              Sube tu archivo
            </div>
            <div
              style={{
                padding: 40, borderRadius: 12, border: `2px dashed ${T.border}`,
                background: T.bgCard, textAlign: 'center', cursor: 'pointer',
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = state.intencion === 'agenda_booksy_fresha' ? '.csv,.txt' : 'image/*';
                input.onchange = e => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
                };
                input.click();
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 14, color: T.text }}>Haz clic o arrastra tu archivo aquí</div>
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
                {state.intencion === 'agenda_booksy_fresha' ? 'Archivos CSV' : 'Imágenes (JPG, PNG)'}
              </div>
            </div>
          </div>
        )}

        {state.paso === 'procesando' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 24, marginBottom: 16 }}>✨</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>La IA está analizando tu archivo...</div>
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 8 }}>Esto puede tomar unos segundos.</div>
          </div>
        )}

        {state.paso === 'preview' && state.data && (
          <div>
            <button
              onClick={() => setState(prev => ({ ...prev, paso: 'subir' }))}
              style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}
            >
              ← Descartar
            </button>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              Vista previa de la extracción
            </div>

            <div style={{ background: T.bgCard, borderRadius: 10, overflow: 'hidden', marginBottom: 16, border: `1px solid ${T.border}` }}>
              <pre style={{ margin: 0, padding: 16, fontSize: 12, color: T.text, maxHeight: 400, overflow: 'auto', background: T.bgCard }}>
                {JSON.stringify(state.data, null, 2)}
              </pre>
            </div>

            <Btn variant="primary" onClick={ejecutarImportacion}>
              Confirmar e Importar
            </Btn>
          </div>
        )}

        {state.paso === 'resultado' && state.resultado && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 12, textTransform: 'uppercase' }}>
              Importación completada
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 16, borderRadius: 10, background: 'rgba(15,157,107,0.10)', border: '1px solid rgba(15,157,107,0.3)', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#0f9d6b' }}>{state.resultado.creadas}</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Registros creados</div>
              </div>
              <div style={{ padding: 16, borderRadius: 10, background: 'rgba(226,59,52,0.10)', border: '1px solid rgba(226,59,52,0.3)', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#e23b34' }}>{state.resultado.errores.length}</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Errores</div>
              </div>
            </div>

            {state.resultado.errores.length > 0 && (
              <div style={{ background: T.bgCard, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 8 }}>Errores detallados:</div>
                {state.resultado.errores.map((err, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#e23b34', marginBottom: 4 }}>• {err}</div>
                ))}
              </div>
            )}

            <Btn variant="primary" onClick={reset}>
              Importar otro archivo
            </Btn>
          </div>
        )}

      </Section>
    </div>
  );
}
