import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';
import { Section, Btn, SettingsIcon } from '@/components/ui/SettingsAtoms';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { extractDocumentContent } from '@/lib/documentExtractor';
import { CATEGORY_COLOR_TOKENS } from '@/lib/categoryColors';

const T = DESIGN_TOKENS;

type Origen = 'ia' | 'local';
type Categoria = 'servicios' | 'clientes' | 'profesionales' | 'citas' | 'lineas';

interface MetaIA {
  modelo?: string;
  latencia_ms?: number;
  coste_usd?: number;
  degradado?: boolean;
}

interface ExtractedData {
  nombre_negocio?: string;
  direccion?: string;
  /** Frase del modelo describiendo que era el documento. */
  resumen?: string;
  /** Lo que el usuario deberia revisar a mano antes de importar. */
  avisos?: string[];
  profesionales?: Array<{ idTemp?: string; seleccionado?: boolean; nombre: string; email?: string; telefono?: string; puesto?: string }>;
  servicios?: Array<{ idTemp?: string; seleccionado?: boolean; nombre: string; precio: number; duracion_min: number; categoria?: string }>;
  clientes?: Array<{ idTemp?: string; seleccionado?: boolean; nombre: string; telefono?: string; email?: string; notas?: string }>;
  citas?: Array<{ idTemp?: string; seleccionado?: boolean; cliente_nombre: string; cliente_telefono?: string; servicio_nombre: string; profesional_nombre?: string; fecha: string; hora_inicio: string; hora_fin?: string }>;
  lineas?: Array<{ idTemp?: string; seleccionado?: boolean; nombre: string; sku?: string; cantidad: number; precio_coste: number }>;
}

interface ImportState {
  paso: 'subir' | 'procesando' | 'preview' | 'resultado';
  archivo: File | null;
  data: ExtractedData | null;
  categoriaActiva: Categoria;
  resultado: { creadas: number; errores: string[] } | null;
  /** De donde salieron los datos: se muestra, nunca se oculta. */
  origen: Origen;
  meta: MetaIA | null;
}

/** Etiqueta e icono de cada categoria. Sin emojis: iconos del sistema. */
const CATEGORIAS: { id: Categoria; label: string; icono: string }[] = [
  { id: 'servicios', label: 'Servicios', icono: 'cut-outline' },
  { id: 'clientes', label: 'Clientes', icono: 'people-outline' },
  { id: 'profesionales', label: 'Equipo', icono: 'person-outline' },
  { id: 'citas', label: 'Citas', icono: 'calendar-outline' },
  { id: 'lineas', label: 'Productos', icono: 'cube-outline' },
];

export function TabMigracionMagica({ negocioId }: { negocioId: string }) {
  const [state, setState] = useState<ImportState>({
    paso: 'subir',
    archivo: null,
    data: null,
    categoriaActiva: 'servicios',
    resultado: null,
    origen: 'ia',
    meta: null,
  });
  const [error, setError] = useState('');

  const handleFileUpload = async (file: File) => {
    setError('');
    setState(prev => ({ ...prev, paso: 'procesando', archivo: file }));

    try {
      const doc = await extractDocumentContent(file);
      let parsedData: any = null;
      let origen: Origen = 'ia';
      let meta: MetaIA | null = null;
      let motivoLocal = '';

      const { data, error: funcError } = await supabase.functions.invoke('migracion-magica', {
        body: {
          mimeType: doc.mimeType,
          content: doc.content,
          filename: file.name,
        },
      });

      if (!funcError && data?.ok) {
        parsedData = data.data;
        meta = data.meta ?? null;
      } else {
        // Antes esto caia al parser local EN SILENCIO: el usuario veia
        // resultados de una expresion regular creyendo que era la IA, y por eso
        // un "200 OK" en las pruebas no demostraba nada. Ahora degrada igual
        // (mejor eso que nada) pero lo dice bien claro en pantalla.
        motivoLocal = mensajeDeError(funcError) || data?.error || 'La IA no ha respondido';
        console.warn('[migracion-magica] sin IA, se usa el lector local:', motivoLocal);

        if (doc.type === 'image' || doc.mimeType === 'application/pdf') {
          // El lector local solo entiende texto: con una foto o un PDF escaneado
          // devolveria cero. Es mas honesto parar que fingir un resultado vacio.
          throw new Error(
            `No se ha podido analizar la imagen o el PDF: ${motivoLocal}. Vuelve a intentarlo en unos segundos.`,
          );
        }

        const { parsearMigracionLocal } = await import('@/lib/migracionParserLocal');
        parsedData = parsearMigracionLocal(doc.content, file.name);
        origen = 'local';
      }

      // Asignar IDs temporales y estado de selección
      const dataConIds: ExtractedData = {
        nombre_negocio: parsedData?.nombre_negocio || '',
        direccion: parsedData?.direccion || '',
        resumen: parsedData?.resumen || '',
        avisos: [
          ...(Array.isArray(parsedData?.avisos) ? parsedData.avisos : []),
          ...(origen === 'local'
            ? [`No se ha podido usar la IA (${motivoLocal}). Los datos de abajo salen del lector básico: revísalos con más atención de lo normal.`]
            : []),
        ],
        profesionales: (parsedData?.profesionales || []).map((p: any, i: number) => ({
          ...p,
          idTemp: `prof-${i}-${Date.now()}`,
          seleccionado: true,
        })),
        servicios: (parsedData?.servicios || []).map((s: any, i: number) => ({
          ...s,
          idTemp: `srv-${i}-${Date.now()}`,
          seleccionado: true,
        })),
        clientes: (parsedData?.clientes || []).map((c: any, i: number) => ({
          ...c,
          idTemp: `cli-${i}-${Date.now()}`,
          seleccionado: true,
        })),
        citas: (parsedData?.citas || []).map((ct: any, i: number) => ({
          ...ct,
          idTemp: `cita-${i}-${Date.now()}`,
          seleccionado: true,
        })),
        lineas: (parsedData?.lineas || []).map((l: any, i: number) => ({
          ...l,
          idTemp: `lin-${i}-${Date.now()}`,
          seleccionado: true,
        })),
      };

      const totalItems =
        (dataConIds.servicios?.length || 0) +
        (dataConIds.clientes?.length || 0) +
        (dataConIds.profesionales?.length || 0) +
        (dataConIds.citas?.length || 0) +
        (dataConIds.lineas?.length || 0);

      if (totalItems === 0) {
        throw new Error('No se reconocieron datos estructurados en el archivo. Revisa que el documento contenga tarifas, clientes o citas.');
      }

      // Determinar la pestaña inicial con datos
      let inicial: 'servicios' | 'clientes' | 'profesionales' | 'citas' | 'lineas' = 'servicios';
      if ((dataConIds.servicios?.length || 0) > 0) inicial = 'servicios';
      else if ((dataConIds.clientes?.length || 0) > 0) inicial = 'clientes';
      else if ((dataConIds.profesionales?.length || 0) > 0) inicial = 'profesionales';
      else if ((dataConIds.citas?.length || 0) > 0) inicial = 'citas';
      else if ((dataConIds.lineas?.length || 0) > 0) inicial = 'lineas';

      setState(prev => ({ ...prev, paso: 'preview', data: dataConIds, categoriaActiva: inicial, origen, meta }));
    } catch (e) {
      setError(mensajeDeError(e));
      setState(prev => ({ ...prev, paso: 'subir' }));
    }
  };

  const updateItem = (categoria: 'servicios' | 'clientes' | 'profesionales' | 'citas' | 'lineas', idTemp: string, fields: any) => {
    setState(prev => {
      if (!prev.data) return prev;
      const list = (prev.data[categoria] || []).map((item: any) =>
        item.idTemp === idTemp ? { ...item, ...fields } : item
      );
      return {
        ...prev,
        data: {
          ...prev.data,
          [categoria]: list,
        },
      };
    });
  };

  const deleteItem = (categoria: 'servicios' | 'clientes' | 'profesionales' | 'citas' | 'lineas', idTemp: string) => {
    setState(prev => {
      if (!prev.data) return prev;
      const list = (prev.data[categoria] || []).filter((item: any) => item.idTemp !== idTemp);
      return {
        ...prev,
        data: {
          ...prev.data,
          [categoria]: list,
        },
      };
    });
  };

  /** ¿Está todo marcado en esa pestaña? Decide si el botón selecciona o quita. */
  const todosSeleccionados = (categoria: Categoria) => {
    const lista = state.data?.[categoria] ?? [];
    return lista.length > 0 && lista.every((item: any) => item.seleccionado !== false);
  };

  /** Cuántas filas se van a importar en total (todas las pestañas). */
  const totalSeleccionado = CATEGORIAS.reduce(
    (total, { id }) => total + (state.data?.[id] ?? []).filter((item: any) => item.seleccionado !== false).length,
    0,
  );

  const toggleSelectAll = (categoria: Categoria, val: boolean) => {
    setState(prev => {
      if (!prev.data) return prev;
      const list = (prev.data[categoria] || []).map((item: any) => ({ ...item, seleccionado: val }));
      return {
        ...prev,
        data: {
          ...prev.data,
          [categoria]: list,
        },
      };
    });
  };

  const ejecutarImportacion = async () => {
    setError('');
    setState(prev => ({ ...prev, paso: 'procesando' }));
    try {
      const data = state.data;
      if (!data) return;

      let creadas = 0;
      let errores: string[] = [];

      // 1. Profesionales / Equipo
      const profsSeleccionados = (data.profesionales || []).filter(p => p.seleccionado && p.nombre);
      for (const p of profsSeleccionados) {
        const { error: profErr } = await supabase.from('profesionales').insert({
          negocio_id: negocioId,
          nombre: p.nombre,
          email: p.email || null,
          telefono: p.telefono ? String(p.telefono).replace(/\D/g, '') : null,
          activo: true,
          color: '#f4501e',
        });
        if (profErr) errores.push(`Profesional ${p.nombre}: ${profErr.message}`);
        else creadas++;
      }

      // 2. Clientes
      const clientesSeleccionados = (data.clientes || []).filter(c => c.seleccionado && c.nombre);
      for (const c of clientesSeleccionados) {
        const { error: cliErr } = await supabase.from('clientes').upsert({
          negocio_id: negocioId,
          nombre: c.nombre,
          telefono: c.telefono ? String(c.telefono).replace(/\D/g, '') : null,
          email: c.email || null,
          notas: c.notas || null,
        }, { onConflict: 'negocio_id,telefono' });
        if (cliErr) errores.push(`Cliente ${c.nombre}: ${cliErr.message}`);
        else creadas++;
      }

      // 3. Categorías y Servicios
      const serviciosSeleccionados = (data.servicios || []).filter(s => s.seleccionado && s.nombre);
      let colorIdx = 0;
      for (const s of serviciosSeleccionados) {
        let catId = null;
        if (s.categoria) {
          const { data: cats } = await supabase.from('categorias_servicio').select('id').eq('negocio_id', negocioId).ilike('nombre', s.categoria).limit(1);
          if (cats && cats[0]) {
            catId = cats[0].id;
          } else {
            const color = CATEGORY_COLOR_TOKENS[colorIdx % CATEGORY_COLOR_TOKENS.length];
            const { data: newCat, error: catErr } = await supabase.from('categorias_servicio').insert({
              negocio_id: negocioId,
              nombre: s.categoria,
              orden: 0,
              color,
              icono: 'general',
            }).select().single();
            if (newCat) { catId = newCat.id; colorIdx++; }
            if (catErr) errores.push(`Categoría "${s.categoria}": ${catErr.message}`);
          }
        }

        const { error: srvErr } = await supabase.from('servicios').upsert({
          negocio_id: negocioId,
          nombre: s.nombre,
          precio: Number(s.precio) || 0,
          duracion_activa_min: Number(s.duracion_min) || 30,
          categoria_id: catId,
        }, { onConflict: 'negocio_id,nombre' });

        if (srvErr) errores.push(`Servicio ${s.nombre}: ${srvErr.message}`);
        else creadas++;
      }

      // 4. Citas
      const citasSeleccionadas = (data.citas || []).filter(c => c.seleccionado && c.fecha && c.hora_inicio);
      for (const c of citasSeleccionadas) {
        const { data: srvs } = await supabase.from('servicios').select('id, duracion_activa_min').eq('negocio_id', negocioId).eq('nombre', c.servicio_nombre).limit(1);
        const servicio = srvs?.[0];

        let clienteId = null;
        if (c.cliente_telefono) {
          const telefonoLimpio = String(c.cliente_telefono).replace(/\D/g, '');
          const { data: cls } = await supabase.from('clientes').select('id').eq('negocio_id', negocioId).eq('telefono', telefonoLimpio).limit(1);
          if (cls && cls[0]) clienteId = cls[0].id;
        }

        const { data: profs } = await supabase.from('profesionales').select('id').eq('negocio_id', negocioId).eq('activo', true).limit(1);
        const profId = profs?.[0]?.id;

        if (!servicio || !profId) {
          errores.push(`Cita ${c.fecha} ${c.hora_inicio}: Servicio o profesional no asignado`);
          continue;
        }

        const inicio = new Date(`${c.fecha}T${c.hora_inicio}:00`);
        const fin = new Date(inicio.getTime() + (servicio.duracion_activa_min * 60000));

        const { error: citaErr } = await supabase.from('citas').insert({
          negocio_id: negocioId,
          cliente_id: clienteId,
          servicio_id: servicio.id,
          profesional_id: profId,
          inicio: inicio.toISOString(),
          fin: fin.toISOString(),
          estado: 'confirmada',
        });
        if (citaErr) errores.push(`Cita ${c.fecha} ${c.hora_inicio}: ${citaErr.message}`);
        else creadas++;
      }

      // 5. Productos / Inventario
      const lineasSeleccionadas = (data.lineas || []).filter(l => l.seleccionado && l.nombre);
      for (const l of lineasSeleccionadas) {
        let prodId = null;
        const { data: prods } = await supabase.from('productos').select('id').eq('negocio_id', negocioId).ilike('nombre', l.nombre).limit(1);
        if (prods && prods[0]) {
          prodId = prods[0].id;
        } else {
          const { data: newProd, error: errProd } = await supabase.from('productos').insert({
            negocio_id: negocioId,
            nombre: l.nombre,
            codigo_barras: l.sku || null,
            precio_cents: Math.round((Number(l.precio_coste) || 0) * 100),
            stock_minimo: 5,
            categoria: 'general',
          }).select().single();
          if (errProd) errores.push(`Producto ${l.nombre}: ${errProd.message}`);
          if (newProd) prodId = newProd.id;
        }

        if (prodId) {
          const { error: movErr } = await supabase.rpc('registrar_movimiento_inventario', {
            p_producto_id: prodId,
            p_tipo: 'entrada',
            p_unidades: l.cantidad || 1,
            p_motivo: 'Albarán Proveedor / Migración',
          });
          if (movErr) errores.push(`Línea ${l.nombre}: ${movErr.message}`);
          else creadas++;
        }
      }

      setState(prev => ({ ...prev, paso: 'resultado', resultado: { creadas, errores } }));
    } catch (e) {
      setError(mensajeDeError(e));
      setState(prev => ({ ...prev, paso: 'preview' }));
    }
  };

  const reset = () => {
    setState({ paso: 'subir', archivo: null, data: null, categoriaActiva: 'servicios', resultado: null, origen: 'ia', meta: null });
    setError('');
  };

  const data = state.data;
  const countServicios = data?.servicios?.length || 0;
  const countClientes = data?.clientes?.length || 0;
  const countProfesionales = data?.profesionales?.length || 0;
  const countCitas = data?.citas?.length || 0;
  const countLineas = data?.lineas?.length || 0;

  return (
    <div>
      <Section title="Migración Mágica Universal con IA">
        <p style={{ fontSize: 13.5, color: T.textSec, marginBottom: 20, lineHeight: 1.5 }}>
          Arrastra o sube cualquier documento o foto de tu salón (PDF escaneado, Excel, CSV, Word, capturas de Booksy, Treatwell o Fresha, o una foto de tu carta de precios).
          La IA extraerá servicios, clientes, equipo, citas y productos. <strong>Nada se guarda hasta que tú lo confirmes</strong>: primero lo revisas y lo editas fila a fila.
        </p>

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(226,59,52,0.10)', color: '#e23b34', fontSize: 13, marginBottom: 16, border: '1px solid rgba(226,59,52,0.25)' }}>
            {error}
          </div>
        )}

        {state.paso === 'subir' && (
          <div>
            <div
              style={{
                padding: '48px 24px',
                borderRadius: 14,
                border: `2px dashed ${T.border}`,
                background: T.bgCard,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.docx,.xlsx,.xls,.csv,.pdf,.txt,.png,.jpg,.jpeg,.webp';
                input.onchange = e => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
                };
                input.click();
              }}
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = T.primary; }}
              onDragLeave={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
              onDrop={e => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).style.borderColor = T.border;
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
            >
              <div style={{ marginBottom: 12, color: T.primary }}>
                <SettingsIcon name="upload" size={36} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                Haz clic o arrastra cualquier archivo o foto aquí
              </div>
              <div style={{ fontSize: 13, color: T.textSec, maxWidth: 500, margin: '0 auto' }}>
                Soporta PDF (incluso escaneados), Excel (.xlsx/.xls), CSV, Word (.docx), fotos de listas de precios (JPG, PNG) o exports de Booksy, Treatwell y Fresha.
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              <span style={{ fontSize: 12, padding: '4px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, color: T.textSec }}>Servicios y tarifas</span>
              <span style={{ fontSize: 12, padding: '4px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, color: T.textSec }}>Clientes y teléfonos</span>
              <span style={{ fontSize: 12, padding: '4px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, color: T.textSec }}>Equipo</span>
              <span style={{ fontSize: 12, padding: '4px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, color: T.textSec }}>Citas</span>
              <span style={{ fontSize: 12, padding: '4px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, color: T.textSec }}>Productos de albarán</span>
            </div>
          </div>
        )}

        {state.paso === 'procesando' && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ marginBottom: 16, color: T.primary }}>
              <SettingsIcon name="upload" size={32} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Analizando y estructurando datos con IA...</div>
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 8 }}>Extrayendo servicios, clientes, citas y equipo en tiempo real.</div>
          </div>
        )}

        {state.paso === 'preview' && data && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <button
                  onClick={() => setState(prev => ({ ...prev, paso: 'subir' }))}
                  style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  Descartar y subir otro
                </button>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginTop: 4 }}>
                  Revisa y edita los datos extraídos
                </div>
              </div>
              <Btn variant="primary" onClick={ejecutarImportacion} disabled={totalSeleccionado === 0}>
                {totalSeleccionado === 0
                  ? 'No hay nada marcado'
                  : `Importar ${totalSeleccionado} ${totalSeleccionado === 1 ? 'elemento' : 'elementos'}`}
              </Btn>
            </div>

            {/* Lo que la IA ha entendido del documento, antes de los datos.
                Da contexto y evita el "no sé de dónde ha salido esto". */}
            {(data.resumen || (data.avisos?.length ?? 0) > 0 || state.meta?.modelo) && (
              <div style={{
                borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg,
                padding: '14px 16px', marginBottom: 16,
              }}>
                {data.resumen && (
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.55 }}>{data.resumen}</div>
                )}
                {(data.avisos?.length ?? 0) > 0 && (
                  <ul style={{ margin: data.resumen ? '10px 0 0' : 0, paddingLeft: 18 }}>
                    {data.avisos!.map((aviso, i) => (
                      <li key={i} style={{ fontSize: 12.5, color: T.warning ?? '#b26a00', lineHeight: 1.5, marginBottom: 3 }}>
                        {aviso}
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 10, fontSize: 11, color: T.textTer, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <span>{state.origen === 'ia' ? `Analizado por ${state.meta?.modelo ?? 'IA'}` : 'Lector básico (sin IA)'}</span>
                  {state.meta?.latencia_ms != null && <span>{(state.meta.latencia_ms / 1000).toFixed(1)} s</span>}
                  {state.meta?.degradado && <span>Se usó un modelo de respaldo</span>}
                </div>
              </div>
            )}

            {/* Pestañas de categorías detectadas */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
              {CATEGORIAS.map(({ id, label, icono }) => {
                const total = data[id]?.length ?? 0;
                if (total === 0) return null;
                const activa = state.categoriaActiva === id;
                return (
                  <button
                    key={id}
                    onClick={() => setState(prev => ({ ...prev, categoriaActiva: id }))}
                    aria-pressed={activa}
                    style={{
                      padding: '8px 14px', borderRadius: 8,
                      border: `1px solid ${activa ? T.primary : T.border}`,
                      background: activa ? T.primarySoft : T.bgCard,
                      color: activa ? T.primary : T.text,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                    }}
                  >
                    <SettingsIcon name={icono} size={14} />
                    {label}
                    <span style={{ padding: '1px 6px', borderRadius: 10, background: T.bg, fontSize: 11 }}>{total}</span>
                  </button>
                );
              })}
            </div>

            {/* SECCIÓN EDITABLE: SERVICIOS */}
            {state.categoriaActiva === 'servicios' && (
              <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Tarifas y Servicios ({countServicios})</span>
                  <button onClick={() => toggleSelectAll('servicios', !todosSeleccionados('servicios'))} style={{ fontSize: 12, color: T.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {todosSeleccionados('servicios') ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {(data.servicios || []).map(s => (
                    <div key={s.idTemp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
                      <input
                        type="checkbox"
                        checked={s.seleccionado !== false}
                        onChange={e => updateItem('servicios', s.idTemp!, { seleccionado: e.target.checked })}
                      />
                      <input
                        type="text"
                        value={s.nombre}
                        onChange={e => updateItem('servicios', s.idTemp!, { nombre: e.target.value })}
                        placeholder="Nombre servicio"
                        style={{ flex: 2, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <input
                        type="number"
                        value={s.precio}
                        onChange={e => updateItem('servicios', s.idTemp!, { precio: Number(e.target.value) })}
                        placeholder="Precio €"
                        style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <input
                        type="number"
                        value={s.duracion_min}
                        onChange={e => updateItem('servicios', s.idTemp!, { duracion_min: Number(e.target.value) })}
                        placeholder="Minutos"
                        style={{ width: 75, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <input
                        type="text"
                        value={s.categoria || ''}
                        onChange={e => updateItem('servicios', s.idTemp!, { categoria: e.target.value })}
                        placeholder="Categoría"
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <button onClick={() => deleteItem('servicios', s.idTemp!)} style={{ background: 'none', border: 'none', color: '#e23b34', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center' }} aria-label="Quitar de la importación">
                        <SettingsIcon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN EDITABLE: CLIENTES */}
            {state.categoriaActiva === 'clientes' && (
              <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Clientes ({countClientes})</span>
                  <button onClick={() => toggleSelectAll('clientes', !todosSeleccionados('clientes'))} style={{ fontSize: 12, color: T.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {todosSeleccionados('clientes') ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {(data.clientes || []).map(c => (
                    <div key={c.idTemp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
                      <input
                        type="checkbox"
                        checked={c.seleccionado !== false}
                        onChange={e => updateItem('clientes', c.idTemp!, { seleccionado: e.target.checked })}
                      />
                      <input
                        type="text"
                        value={c.nombre}
                        onChange={e => updateItem('clientes', c.idTemp!, { nombre: e.target.value })}
                        placeholder="Nombre cliente"
                        style={{ flex: 2, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <input
                        type="text"
                        value={c.telefono || ''}
                        onChange={e => updateItem('clientes', c.idTemp!, { telefono: e.target.value })}
                        placeholder="Teléfono"
                        style={{ flex: 1.5, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <input
                        type="text"
                        value={c.email || ''}
                        onChange={e => updateItem('clientes', c.idTemp!, { email: e.target.value })}
                        placeholder="Email"
                        style={{ flex: 1.5, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <button onClick={() => deleteItem('clientes', c.idTemp!)} style={{ background: 'none', border: 'none', color: '#e23b34', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center' }} aria-label="Quitar de la importación">
                        <SettingsIcon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN EDITABLE: PROFESIONALES */}
            {state.categoriaActiva === 'profesionales' && (
              <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Equipo y Barberos ({countProfesionales})</span>
                  <button onClick={() => toggleSelectAll('profesionales', !todosSeleccionados('profesionales'))} style={{ fontSize: 12, color: T.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {todosSeleccionados('profesionales') ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {(data.profesionales || []).map(p => (
                    <div key={p.idTemp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
                      <input
                        type="checkbox"
                        checked={p.seleccionado !== false}
                        onChange={e => updateItem('profesionales', p.idTemp!, { seleccionado: e.target.checked })}
                      />
                      <input
                        type="text"
                        value={p.nombre}
                        onChange={e => updateItem('profesionales', p.idTemp!, { nombre: e.target.value })}
                        placeholder="Nombre profesional"
                        style={{ flex: 2, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <input
                        type="text"
                        value={p.puesto || ''}
                        onChange={e => updateItem('profesionales', p.idTemp!, { puesto: e.target.value })}
                        placeholder="Puesto (ej. Barbero)"
                        style={{ flex: 1.5, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <button onClick={() => deleteItem('profesionales', p.idTemp!)} style={{ background: 'none', border: 'none', color: '#e23b34', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center' }} aria-label="Quitar de la importación">
                        <SettingsIcon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN EDITABLE: CITAS */}
            {state.categoriaActiva === 'citas' && (
              <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Citas ({countCitas})</span>
                  <button onClick={() => toggleSelectAll('citas', !todosSeleccionados('citas'))} style={{ fontSize: 12, color: T.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {todosSeleccionados('citas') ? 'Quitar todas' : 'Seleccionar todas'}
                  </button>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {(data.citas || []).map(ct => (
                    <div key={ct.idTemp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
                      <input
                        type="checkbox"
                        checked={ct.seleccionado !== false}
                        onChange={e => updateItem('citas', ct.idTemp!, { seleccionado: e.target.checked })}
                      />
                      <input
                        type="date"
                        value={ct.fecha}
                        onChange={e => updateItem('citas', ct.idTemp!, { fecha: e.target.value })}
                        style={{ width: 130, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                      />
                      <input
                        type="time"
                        value={ct.hora_inicio}
                        onChange={e => updateItem('citas', ct.idTemp!, { hora_inicio: e.target.value })}
                        style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                      />
                      <input
                        type="text"
                        value={ct.cliente_nombre}
                        onChange={e => updateItem('citas', ct.idTemp!, { cliente_nombre: e.target.value })}
                        placeholder="Cliente"
                        style={{ flex: 1.5, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                      />
                      <input
                        type="text"
                        value={ct.servicio_nombre}
                        onChange={e => updateItem('citas', ct.idTemp!, { servicio_nombre: e.target.value })}
                        placeholder="Servicio"
                        style={{ flex: 1.5, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                      />
                      <button onClick={() => deleteItem('citas', ct.idTemp!)} style={{ background: 'none', border: 'none', color: '#e23b34', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center' }} aria-label="Quitar de la importación">
                        <SettingsIcon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN EDITABLE: PRODUCTOS */}
            {state.categoriaActiva === 'lineas' && (
              <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Productos de Albarán ({countLineas})</span>
                  <button onClick={() => toggleSelectAll('lineas', !todosSeleccionados('lineas'))} style={{ fontSize: 12, color: T.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {todosSeleccionados('lineas') ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {(data.lineas || []).map(l => (
                    <div key={l.idTemp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
                      <input
                        type="checkbox"
                        checked={l.seleccionado !== false}
                        onChange={e => updateItem('lineas', l.idTemp!, { seleccionado: e.target.checked })}
                      />
                      <input
                        type="text"
                        value={l.nombre}
                        onChange={e => updateItem('lineas', l.idTemp!, { nombre: e.target.value })}
                        placeholder="Producto"
                        style={{ flex: 2, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <input
                        type="number"
                        value={l.cantidad}
                        onChange={e => updateItem('lineas', l.idTemp!, { cantidad: Number(e.target.value) })}
                        placeholder="Uds"
                        style={{ width: 70, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <input
                        type="number"
                        value={l.precio_coste}
                        onChange={e => updateItem('lineas', l.idTemp!, { precio_coste: Number(e.target.value) })}
                        placeholder="Coste €"
                        style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}
                      />
                      <button onClick={() => deleteItem('lineas', l.idTemp!)} style={{ background: 'none', border: 'none', color: '#e23b34', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center' }} aria-label="Quitar de la importación">
                        <SettingsIcon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {state.paso === 'resultado' && state.resultado && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>
              ¡Importación Universal Completada!
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 18, borderRadius: 12, background: 'rgba(15,157,107,0.10)', border: '1px solid rgba(15,157,107,0.3)', textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#0f9d6b' }}>{state.resultado.creadas}</div>
                <div style={{ fontSize: 13, color: T.textSec, marginTop: 4, fontWeight: 600 }}>Elementos importados con éxito</div>
              </div>
              <div style={{ padding: 18, borderRadius: 12, background: state.resultado.errores.length > 0 ? 'rgba(226,59,52,0.10)' : 'rgba(0,0,0,0.03)', border: `1px solid ${state.resultado.errores.length > 0 ? 'rgba(226,59,52,0.3)' : T.border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: state.resultado.errores.length > 0 ? '#e23b34' : T.textSec }}>{state.resultado.errores.length}</div>
                <div style={{ fontSize: 13, color: T.textSec, marginTop: 4, fontWeight: 600 }}>Incidencias</div>
              </div>
            </div>

            {state.resultado.errores.length > 0 && (
              <div style={{ background: T.bgCard, borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, marginBottom: 8 }}>Detalles:</div>
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
