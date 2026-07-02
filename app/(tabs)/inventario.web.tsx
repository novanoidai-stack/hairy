import { useEffect, useMemo, useState } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { PageLoader } from '@/components/ui/DesignComponents';
import { useAppLang } from '@/lib/hooks/useAppLang';

// ────────────────────────────────────────────────────────────────────────────────
// ICONOS SVG PREMIUM
// ────────────────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  const icons: any = {
    search: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    package: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    history: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    chevronDown: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    category: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    grid: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    list: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    info: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    filter: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

// ────────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ────────────────────────────────────────────────────────────────────────────────
const TOKENS = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.14)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.16)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
};

// ────────────────────────────────────────────────────────────────────────────────
// TIPOS
// ────────────────────────────────────────────────────────────────────────────────
interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  precio_cents: number;
  precio: number;
  stock_minimo: number;
  stock_actual: number;
  stock_bajo: boolean;
  ubicacion: string | null;
  codigo_barras: string | null;
  proveedor: string | null;
  activo: boolean;
}

interface Movimiento {
  id: string;
  producto_id: string;
  producto_nombre: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  unidades: number;
  motivo: string | null;
  referencia_id: string | null;
  referencia_tipo: string | null;
  notas: string | null;
  creado_por: string | null;
  created_at: string;
}

export default function InventarioScreen() {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const { t } = useAppLang();

  // ────────────────────────────────────────────────────────────────────────────────
  // ESTADO
  // ────────────────────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [alertasCount, setAlertasCount] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [soloStockBajo, setSoloStockBajo] = useState(false);

  // Modales
  const [showNuevoProducto, setShowNuevoProducto] = useState(false);
  const [showMovimiento, setShowMovimiento] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);

  // Formularios
  const [nuevoProducto, setNuevoProducto] = useState({
    nombre: '',
    descripcion: '',
    categoria: 'general',
    precio_cents: 0,
    stock_minimo: 5,
    inicial_unidades: 0,
  });

  const [nuevoMovimiento, setNuevoMovimiento] = useState({
    tipo: 'entrada' as 'entrada' | 'salida' | 'ajuste',
    unidades: 1,
    motivo: '',
    notas: '',
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // CARGAR DATOS
  // ────────────────────────────────────────────────────────────────────────────────
  const cargarInventario = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('obtener_inventario', {
        p_solo_activos: true,
        p_categoria: filtroCategoria === 'todas' ? null : filtroCategoria,
      });

      if (error) throw error;

      if (data?.ok) {
        setProductos(data.productos || []);
        setAlertasCount(data.productos?.filter((p: Producto) => p.stock_bajo).length || 0);
      }
    } catch (err) {
      console.error('Error cargando inventario:', err);
    } finally {
      setLoading(false);
    }
  };

  const cargarAlertas = async () => {
    try {
      const { data, error } = await supabase.rpc('productos_stock_bajo');
      if (!error && data?.ok) {
        setAlertasCount(data.total || 0);
      }
    } catch (err) {
      console.error('Error cargando alertas:', err);
    }
  };

  const cargarMovimientos = async (productoId: string) => {
    try {
      const { data, error } = await supabase.rpc('obtener_movimientos_inventario', {
        p_producto_id: productoId,
        p_limit: 50,
      });

      if (error) throw error;

      if (data?.ok) {
        setMovimientos(data.movimientos || []);
      }
    } catch (err) {
      console.error('Error cargando movimientos:', err);
    }
  };

  useEffect(() => {
    cargarInventario();
    cargarAlertas();
  }, [filtroCategoria]);

  // ────────────────────────────────────────────────────────────────────────────────
  // ACCIONES
  // ────────────────────────────────────────────────────────────────────────────────
  const crearProducto = async () => {
    if (!nuevoProducto.nombre.trim()) return;

    try {
      const { data, error } = await supabase.rpc('crear_producto', {
        p_nombre: nuevoProducto.nombre,
        p_descripcion: nuevoProducto.descripcion || null,
        p_categoria: nuevoProducto.categoria,
        p_precio_cents: nuevoProducto.precio_cents,
        p_stock_minimo: nuevoProducto.stock_minimo,
        p_inicial_unidades: nuevoProducto.inicial_unidades,
      });

      if (error) throw error;

      if (data?.ok) {
        setShowNuevoProducto(false);
        setNuevoProducto({
          nombre: '',
          descripcion: '',
          categoria: 'general',
          precio_cents: 0,
          stock_minimo: 5,
          inicial_unidades: 0,
        });
        cargarInventario();
      }
    } catch (err) {
      console.error('Error creando producto:', err);
      alert(mensajeDeError(err));
    }
  };

  const registrarMovimiento = async () => {
    if (!productoSeleccionado) return;

    try {
      const { data, error } = await supabase.rpc('registrar_movimiento_inventario', {
        p_producto_id: productoSeleccionado.id,
        p_tipo: nuevoMovimiento.tipo,
        p_unidades: nuevoMovimiento.unidades,
        p_motivo: nuevoMovimiento.motivo || null,
        p_notas: nuevoMovimiento.notas || null,
      });

      if (error) throw error;

      if (data?.ok) {
        setShowMovimiento(false);
        setNuevoMovimiento({
          tipo: 'entrada',
          unidades: 1,
          motivo: '',
          notas: '',
        });
        cargarInventario();
      }
    } catch (err) {
      console.error('Error registrando movimiento:', err);
      alert(mensajeDeError(err));
    }
  };

  const eliminarProducto = async (productoId: string) => {
    if (!confirm('¿Eliminar este producto? Se marcará como inactivo.')) return;

    try {
      const { data, error } = await supabase.rpc('eliminar_producto', {
        p_producto_id: productoId,
      });

      if (error) throw error;

      if (data?.ok) {
        cargarInventario();
      }
    } catch (err) {
      console.error('Error eliminando producto:', err);
      alert(mensajeDeError(err));
    }
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // CALCULOS Y MEMOS
  // ────────────────────────────────────────────────────────────────────────────────
  const categorias = useMemo(() => {
    const cats = new Set(productos.map((p) => p.categoria));
    return ['todas', ...Array.from(cats).sort()];
  }, [productos]);

  const valorTotalInventario = useMemo(() => {
    return productos.reduce((sum, p) => sum + ((p.precio || 0) * (p.stock_actual || 0)), 0);
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    let list = productos;
    if (soloStockBajo) {
      list = list.filter((p) => p.stock_bajo);
    }
    if (!busqueda) return list;
    const query = busqueda.toLowerCase();
    return list.filter(
      (p) =>
        p.nombre.toLowerCase().includes(query) ||
        p.descripcion?.toLowerCase().includes(query) ||
        p.codigo_barras?.includes(query) ||
        p.categoria.toLowerCase().includes(query)
    );
  }, [productos, busqueda, soloStockBajo]);

  // Nivel de stock progress bar renderer
  const renderStockProgress = (current: number, min: number) => {
    const safeMin = min || 1;
    // 100% capacity is double the minimum stock for visual reference
    const ratio = Math.min(current / (safeMin * 2), 1);
    const percent = Math.round(ratio * 100);
    
    let barColor = TOKENS.success;
    if (current === 0) {
      barColor = TOKENS.danger;
    } else if (current <= min) {
      barColor = TOKENS.warning;
    }
    
    return (
      <div style={styles.progressContainer}>
        <div style={styles.progressHeader}>
          <span style={styles.progressLabel}>Stock:</span>
          <span style={{ ...styles.progressValue, color: barColor }}>
            {current} <span style={{ color: TOKENS.textTer, fontSize: '11px', fontWeight: '400' }}>/ mín. {min}</span>
          </span>
        </div>
        <div style={styles.progressBarBg}>
          <div style={{
            ...styles.progressBarFill,
            width: `${percent || 2}%`,
            backgroundColor: barColor,
          }} />
        </div>
      </div>
    );
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // MODAL NUEVO PRODUCTO
  // ────────────────────────────────────────────────────────────────────────────────
  const ModalNuevoProducto = () => {
    if (!showNuevoProducto) return null;
    return createPortal(
      <div style={styles.modalOverlay}>
        <div style={styles.modalContent}>
          <div style={styles.modalHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={styles.modalHeaderIcon}>
                <Icon name="package" size={20} color={TOKENS.primary} />
              </div>
              <h3 style={styles.modalTitle}>{t('inv_nuevo_prod')}</h3>
            </div>
            <button style={styles.modalClose} onClick={() => setShowNuevoProducto(false)}>
              <Icon name="x" size={20} color={TOKENS.textSec} />
            </button>
          </div>

          <div style={styles.modalBody}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Nombre del Producto *</label>
              <input
                style={styles.formInput}
                value={nuevoProducto.nombre}
                onChange={(e) => setNuevoProducto({ ...nuevoProducto, nombre: e.target.value })}
                placeholder="Ej: Champú Orgánico Hidratante 500ml"
                autoFocus
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Descripción</label>
              <textarea
                style={styles.formTextarea}
                value={nuevoProducto.descripcion}
                onChange={(e) => setNuevoProducto({ ...nuevoProducto, descripcion: e.target.value })}
                placeholder="Describe el producto (ingredientes, modo de uso...)"
                rows={2}
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Categoría</label>
                <select
                  style={styles.formSelect}
                  value={nuevoProducto.categoria}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, categoria: e.target.value })}
                >
                  <option value="general">General</option>
                  <option value="shampoo">Champú</option>
                  <option value="color">Coloración</option>
                  <option value="tratamiento">Tratamiento</option>
                  <option value="accesorios">Accesorios</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Precio PVP (€)</label>
                <input
                  style={styles.formInput}
                  type="number"
                  step="0.01"
                  value={(nuevoProducto.precio_cents / 100).toFixed(2)}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, precio_cents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Stock Mínimo Alerta</label>
                <input
                  style={styles.formInput}
                  type="number"
                  value={nuevoProducto.stock_minimo}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, stock_minimo: parseInt(e.target.value) || 0 })}
                  placeholder="5"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Inventario Inicial</label>
                <input
                  style={styles.formInput}
                  type="number"
                  value={nuevoProducto.inicial_unidades}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, inicial_unidades: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div style={styles.modalFooter}>
            <button style={styles.buttonSecondary} onClick={() => setShowNuevoProducto(false)}>
              {t('cancelar')}
            </button>
            <button style={{ ...styles.buttonPrimary, padding: '10px 20px' }} onClick={crearProducto}>
              {t('inv_btn_crear')}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // MODAL REGISTRAR MOVIMIENTO (AJUSTAR STOCK)
  // ────────────────────────────────────────────────────────────────────────────────
  const ModalMovimiento = () => {
    if (!showMovimiento || !productoSeleccionado) return null;
    
    const resultingStock = () => {
      if (nuevoMovimiento.tipo === 'entrada') return productoSeleccionado.stock_actual + nuevoMovimiento.unidades;
      if (nuevoMovimiento.tipo === 'salida') return Math.max(0, productoSeleccionado.stock_actual - nuevoMovimiento.unidades);
      return nuevoMovimiento.unidades; // ajuste
    };

    return createPortal(
      <div style={styles.modalOverlay}>
        <div style={styles.modalContent}>
          <div style={styles.modalHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={styles.modalHeaderIcon}>
                <Icon name="edit" size={20} color={TOKENS.primary} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={styles.modalTitle}>{t('inv_ajustar_stock')}</h3>
                <span style={{ fontSize: '12px', color: TOKENS.textTer }}>{productoSeleccionado.nombre}</span>
              </div>
            </div>
            <button style={styles.modalClose} onClick={() => setShowMovimiento(false)}>
              <Icon name="x" size={20} color={TOKENS.textSec} />
            </button>
          </div>

          <div style={styles.modalBody}>
            <div style={styles.stockInfo}>
              <span>Stock actual: <strong style={{ color: TOKENS.text, fontSize: '15px' }}>{productoSeleccionado.stock_actual} ud.</strong></span>
              <span style={{
                ...styles.stockBadge,
                ...(productoSeleccionado.stock_bajo ? styles.stockBajo : styles.stockOK)
              }}>
                {productoSeleccionado.stock_bajo ? `⚠️ ${t('inv_bajo_min')}` : `✓ ${t('inv_disponible')}`}
              </span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Tipo de Ajuste</label>
              <div style={styles.tipoButtons}>
                {(['entrada', 'salida', 'ajuste'] as const).map((tipo) => (
                  <button
                    key={tipo}
                    style={{
                      ...styles.tipoButton,
                      ...(nuevoMovimiento.tipo === tipo ? styles.tipoButtonActive : {}),
                    }}
                    onClick={() => setNuevoMovimiento({ ...nuevoMovimiento, tipo, unidades: tipo === 'ajuste' ? productoSeleccionado.stock_actual : 1 })}
                  >
                    {tipo === 'entrada' ? '↓ Entrada' : tipo === 'salida' ? '↑ Salida' : '⟳ Ajuste'}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                {nuevoMovimiento.tipo === 'ajuste' ? 'Inventario Total Final' : 'Cantidad de unidades'}
              </label>
              <input
                style={styles.formInput}
                type="number"
                min={0}
                value={nuevoMovimiento.unidades}
                onChange={(e) => setNuevoMovimiento({ ...nuevoMovimiento, unidades: Math.max(0, parseInt(e.target.value) || 0) })}
                placeholder="1"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Motivo del movimiento</label>
              <input
                style={styles.formInput}
                value={nuevoMovimiento.motivo}
                onChange={(e) => setNuevoMovimiento({ ...nuevoMovimiento, motivo: e.target.value })}
                placeholder={nuevoMovimiento.tipo === 'entrada' ? 'Ej: Pedido proveedor, stock inicial...' : nuevoMovimiento.tipo === 'salida' ? 'Ej: Venta, producto roto, caducado...' : 'Ej: Recuento de inventario...'}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Notas adicionales</label>
              <textarea
                style={styles.formTextarea}
                value={nuevoMovimiento.notas || ''}
                onChange={(e) => setNuevoMovimiento({ ...nuevoMovimiento, notas: e.target.value })}
                placeholder="Añade notas complementarias si es necesario"
                rows={2}
              />
            </div>

            <div style={{
              ...styles.previewInfo,
              backgroundColor: resultingStock() < productoSeleccionado.stock_minimo ? TOKENS.dangerSoft : TOKENS.successSoft,
              borderColor: resultingStock() < productoSeleccionado.stock_minimo ? TOKENS.danger : TOKENS.success,
              borderWidth: '1px',
              borderStyle: 'solid'
            }}>
              Stock Resultante: <strong style={{ fontSize: '15px' }}>{resultingStock()} unidades</strong> 
              {resultingStock() < productoSeleccionado.stock_minimo && ' (Quedará bajo mínimo)'}
            </div>
          </div>

          <div style={styles.modalFooter}>
            <button style={styles.buttonSecondary} onClick={() => setShowMovimiento(false)}>
              {t('cancelar')}
            </button>
            <button style={{ ...styles.buttonPrimary, padding: '10px 20px' }} onClick={registrarMovimiento}>
              {t('aceptar')}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // MODAL HISTORIAL DE MOVIMIENTOS
  // ────────────────────────────────────────────────────────────────────────────────
  const ModalHistorial = () => {
    if (!showHistorial) return null;
    return createPortal(
      <div style={styles.modalOverlay}>
        <div style={{ ...styles.modalContent, maxWidth: '600px' }}>
          <div style={styles.modalHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={styles.modalHeaderIcon}>
                <Icon name="history" size={20} color={TOKENS.primary} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={styles.modalTitle}>{t('inv_historial')}</h3>
                {productoSeleccionado && (
                  <span style={{ fontSize: '12px', color: TOKENS.textTer }}>{productoSeleccionado.nombre}</span>
                )}
              </div>
            </div>
            <button style={styles.modalClose} onClick={() => setShowHistorial(false)}>
              <Icon name="x" size={20} color={TOKENS.textSec} />
            </button>
          </div>

          <div style={styles.modalBody}>
            {movimientos.length === 0 ? (
              <div style={styles.emptyHistorial}>
                <Icon name="info" size={32} color={TOKENS.textTer} />
                <p style={styles.emptyText}>No hay registros de inventario históricos para esta referencia.</p>
              </div>
            ) : (
              <div style={styles.timeline}>
                {movimientos.map((mov) => (
                  <div key={mov.id} style={styles.timelineItem}>
                    <div style={styles.timelineIndicator}>
                      <div style={{
                        ...styles.timelineDot,
                        backgroundColor: mov.tipo === 'entrada' ? TOKENS.success : mov.tipo === 'salida' ? TOKENS.danger : TOKENS.warning,
                      }} />
                      <div style={styles.timelineLine} />
                    </div>
                    
                    <div style={styles.timelineContent}>
                      <div style={styles.timelineHeader}>
                        <span style={{
                          ...styles.timelineBadge,
                          ...(mov.tipo === 'entrada' ? styles.tipoEntrada : mov.tipo === 'salida' ? styles.tipoSalida : styles.tipoAjuste),
                        }}>
                          {mov.tipo === 'entrada' ? '↓ Entrada' : mov.tipo === 'salida' ? '↑ Salida' : '⟳ Ajuste'}
                        </span>
                        <span style={styles.timelineDate}>
                          {new Date(mov.created_at).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      
                      <div style={styles.timelineBody}>
                        <span style={styles.timelineUnits}>
                          {mov.unidades > 0 ? '+' : ''}{mov.unidades} unidades
                        </span>
                        {mov.motivo && <span style={styles.timelineReason}>— {mov.motivo}</span>}
                      </div>
                      
                      {(mov.creado_por || mov.notas) && (
                        <div style={styles.timelineFooter}>
                          {mov.creado_por && <span>Usuario: {mov.creado_por}</span>}
                          {mov.notas && <p style={styles.timelineNotes}>Nota: {mov.notas}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.modalFooter}>
            <button style={styles.buttonSecondary} onClick={() => setShowHistorial(false)}>
              {t('cerrar')}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ────────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <PageLoader />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Inyectamos estilos CSS personalizados para efectos avanzados */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulseAlert {
          0% { box-shadow: 0 0 0 0 rgba(226, 59, 52, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(226, 59, 52, 0); }
          100% { box-shadow: 0 0 0 0 rgba(226, 59, 52, 0); }
        }
        .pulse-alert-card {
          animation: pulseAlert 2.5s infinite;
        }
        .card-premium {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .card-premium:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 20px rgba(40, 30, 24, 0.06);
          border-color: rgba(244, 80, 30, 0.25) !important;
        }
        .btn-tab {
          transition: all 0.2s;
        }
        .btn-tab:hover {
          background-color: rgba(40, 30, 24, 0.03);
          border-color: rgba(40, 30, 24, 0.2);
        }
        .row-hover {
          transition: background-color 0.15s;
        }
        .row-hover:hover {
          background-color: rgba(251, 246, 240, 0.6) !important;
        }
        .btn-action-premium {
          transition: all 0.15s;
        }
        .btn-action-premium:hover {
          background-color: rgba(40, 30, 24, 0.05) !important;
          transform: scale(1.05);
        }
      `}} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIconContainer}>
            <Icon name="package" size={28} color="#fff" />
          </div>
          <div>
            <h1 style={styles.headerTitle}>{t('inv_titulo')}</h1>
            <p style={{ fontSize: '13px', color: TOKENS.textSec, margin: '2px 0 0 0' }}>
              {t('inv_subtitulo')}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={styles.kpiGrid}>
        <div style={{ ...styles.kpiCard, borderLeft: '4px solid #0891b2' }}>
          <div style={styles.kpiContent}>
            <span style={styles.kpiLabel}>{t('inv_total_refs')}</span>
            <span style={styles.kpiValue}>{productos.length}</span>
            <span style={styles.kpiSubtext}>Productos cargados</span>
          </div>
          <div style={{ ...styles.kpiIconWrapper, backgroundColor: 'rgba(8, 145, 178, 0.1)' }}>
            <Icon name="package" size={24} color="#0891b2" />
          </div>
        </div>

        <div style={{
          ...styles.kpiCard,
          borderLeft: `4px solid ${alertasCount > 0 ? TOKENS.danger : TOKENS.success}`,
        }} className={alertasCount > 0 ? 'pulse-alert-card' : ''}>
          <div style={styles.kpiContent}>
            <span style={styles.kpiLabel}>{t('inv_bajo_min')}</span>
            <span style={{ ...styles.kpiValue, color: alertasCount > 0 ? TOKENS.danger : TOKENS.success }}>
              {alertasCount}
            </span>
            <span style={styles.kpiSubtext}>
              {alertasCount > 0 ? 'Necesitan reposición' : 'Nivel de stock óptimo'}
            </span>
          </div>
          <div style={{
            ...styles.kpiIconWrapper,
            backgroundColor: alertasCount > 0 ? TOKENS.dangerSoft : TOKENS.successSoft
          }}>
            <Icon name="alert" size={24} color={alertasCount > 0 ? TOKENS.danger : TOKENS.success} />
          </div>
        </div>

        <div style={{ ...styles.kpiCard, borderLeft: `4px solid ${TOKENS.success}` }}>
          <div style={styles.kpiContent}>
            <span style={styles.kpiLabel}>{t('inv_valor')}</span>
            <span style={styles.kpiValue}>{valorTotalInventario.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
            <span style={styles.kpiSubtext}>Valoración a PVP</span>
          </div>
          <div style={{ ...styles.kpiIconWrapper, backgroundColor: 'rgba(15, 157, 107, 0.1)' }}>
            <Icon name="history" size={24} color={TOKENS.success} />
          </div>
        </div>

        <div style={{ ...styles.kpiCard, borderLeft: '4px solid #8b5cf6' }}>
          <div style={styles.kpiContent}>
            <span style={styles.kpiLabel}>{t('inv_categorias')}</span>
            <span style={styles.kpiValue}>{categorias.length - 1}</span>
            <span style={styles.kpiSubtext}>Grupos de productos</span>
          </div>
          <div style={{ ...styles.kpiIconWrapper, backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
            <Icon name="category" size={24} color="#8b5cf6" />
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {alertasCount > 0 && (
        <div style={styles.alertBanner}>
          <div style={styles.alertBannerLeft}>
            <div style={styles.alertBannerIcon}>
              <Icon name="alert" size={20} color={TOKENS.danger} />
            </div>
            <div style={styles.alertBannerText}>
              <h4 style={styles.alertBannerTitle}>{t('inv_critico_title')}</h4>
              <p style={styles.alertBannerDesc}>
                {t('inv_critico_desc').replace('{count}', alertasCount.toString())}
              </p>
            </div>
          </div>
          <button 
            style={{
              ...styles.alertBannerBtn,
              ...(soloStockBajo ? styles.alertBannerBtnActive : {})
            }}
            onClick={() => setSoloStockBajo(!soloStockBajo)}
          >
            {soloStockBajo ? t('inv_mostrar_todos') : t('inv_ver_criticos')}
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div style={styles.categoryTabs}>
        {categorias.map((cat) => {
          const isSelected = filtroCategoria === cat;
          return (
            <button
              key={cat}
              onClick={() => {
                setFiltroCategoria(cat);
                setSoloStockBajo(false); // Reset low stock filter on tab change
              }}
              style={{
                ...styles.categoryTab,
                ...(isSelected ? styles.categoryTabActive : {}),
              }}
              className="btn-tab"
            >
              <span style={{ textTransform: 'capitalize' }}>
                {cat === 'todas' ? t('inv_todos') : cat}
              </span>
              <span style={{
                ...styles.categoryTabCount,
                ...(isSelected ? styles.categoryTabCountActive : {}),
              }}>
                {cat === 'todas' 
                  ? productos.length 
                  : productos.filter(p => p.categoria === cat).length
                }
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar / Actions */}
      <div style={styles.toolbar}>
        <div style={styles.searchBox}>
          <Icon name="search" size={18} color={TOKENS.textTer} />
          <input
            style={styles.searchInput}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t('inv_buscar_placeholder')}
          />
          {busqueda && (
            <button style={styles.clearSearch} onClick={() => setBusqueda('')}>
              <Icon name="x" size={14} color={TOKENS.textTer} />
            </button>
          )}
        </div>

        <div style={styles.toolbarRight}>
          <div style={styles.viewToggleGroup}>
            <button
              style={{
                ...styles.toggleBtn,
                ...(viewMode === 'grid' ? styles.toggleBtnActive : {}),
              }}
              onClick={() => setViewMode('grid')}
              title="Cuadrícula"
            >
              <Icon name="grid" size={16} color={viewMode === 'grid' ? TOKENS.primary : TOKENS.textSec} />
              {!isMobile && <span style={styles.toggleBtnText}>{t('inv_mosaico')}</span>}
            </button>
            <button
              style={{
                ...styles.toggleBtn,
                ...(viewMode === 'table' ? styles.toggleBtnActive : {}),
              }}
              onClick={() => setViewMode('table')}
              title="Tabla"
            >
              <Icon name="list" size={16} color={viewMode === 'table' ? TOKENS.primary : TOKENS.textSec} />
              {!isMobile && <span style={styles.toggleBtnText}>{t('inv_tabla')}</span>}
            </button>
          </div>

          <button style={styles.buttonPrimary} onClick={() => setShowNuevoProducto(true)}>
            <Icon name="plus" size={18} color="#fff" />
            <span>{t('inv_nuevo_prod')}</span>
          </button>
        </div>
      </div>

      {/* Product List/Grid Container */}
      <div style={{ marginTop: '16px' }}>
        {productosFiltrados.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIconContainer}>
              <Icon name="package" size={42} color={TOKENS.textTer} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: TOKENS.text, margin: '16px 0 8px 0' }}>
              {busqueda || soloStockBajo ? t('inv_no_resultados') : t('inv_vacio_title')}
            </h3>
            <p style={styles.emptyText}>
              {busqueda || soloStockBajo
                ? 'Prueba a modificar los filtros o los términos de búsqueda.'
                : t('inv_vacio_desc')}
            </p>
            {!busqueda && !soloStockBajo && (
              <button style={{ ...styles.buttonSecondary, marginTop: '8px' }} onClick={() => setShowNuevoProducto(true)}>
                {t('inv_btn_crear')}
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div style={styles.productosGrid}>
            {productosFiltrados.map((producto) => (
              <div
                key={producto.id}
                style={{
                  ...styles.productoCard,
                  ...(producto.stock_bajo ? styles.productoCardAlert : {}),
                }}
                className="card-premium"
              >
                <div style={styles.cardHeader}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={styles.cardCategoryBadge}>{producto.categoria}</span>
                      {producto.ubicacion && (
                        <span style={styles.cardLocationBadge}>📍 {producto.ubicacion}</span>
                      )}
                    </div>
                    <h3 style={styles.cardTitle} title={producto.nombre}>{producto.nombre}</h3>
                  </div>
                  <div style={styles.cardPrice}>
                    {producto.precio > 0 ? `${producto.precio.toFixed(2)} €` : '—'}
                  </div>
                </div>

                <p style={styles.cardDesc}>
                  {producto.descripcion || 'Sin descripción detallada.'}
                </p>

                {producto.codigo_barras && (
                  <div style={styles.barcodeBox}>
                    <span style={{ fontSize: '11px', color: TOKENS.textTer }}>EAN: {producto.codigo_barras}</span>
                  </div>
                )}

                <div style={{ margin: '16px 0' }}>
                  {renderStockProgress(producto.stock_actual, producto.stock_minimo)}
                </div>

                <div style={styles.cardActions}>
                  <button
                    style={styles.cardActionBtn}
                    onClick={() => {
                      setProductoSeleccionado(producto);
                      setShowMovimiento(true);
                    }}
                    className="btn-action-premium"
                    title="Ajustar existencias"
                  >
                    <Icon name="edit" size={16} color={TOKENS.textSec} />
                    <span>{t('inv_ajustar_stock')}</span>
                  </button>
                  
                  <button
                    style={styles.cardActionBtn}
                    onClick={() => {
                      setProductoSeleccionado(producto);
                      cargarMovimientos(producto.id);
                      setShowHistorial(true);
                    }}
                    className="btn-action-premium"
                    title="Kardex / Historial"
                  >
                    <Icon name="history" size={16} color={TOKENS.textSec} />
                    <span>{t('inv_historial')}</span>
                  </button>

                  <button
                    style={{ ...styles.cardActionBtn, flex: 0.3 }}
                    onClick={() => eliminarProducto(producto.id)}
                    className="btn-action-premium"
                    title="Eliminar referencia"
                  >
                    <Icon name="trash" size={16} color={TOKENS.danger} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* TABLE VIEW */
          <div style={styles.tableContainer}>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>{t('inv_col_producto')}</th>
                    <th style={styles.th}>{t('inv_col_categoria')}</th>
                    <th style={styles.th}>{t('inv_col_precio')}</th>
                    <th style={styles.th}>{t('inv_col_ubicacion')}</th>
                    <th style={styles.th}>{t('inv_col_stock_min')}</th>
                    <th style={styles.th}>{t('inv_col_stock_act')}</th>
                    <th style={styles.th}>{t('inv_col_estado')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('inv_col_acciones')}</th>
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.map((producto) => {
                    const isLow = producto.stock_bajo;
                    return (
                      <tr 
                        key={producto.id} 
                        style={{
                          ...styles.tr,
                          ...(isLow ? styles.trAlert : {}),
                        }}
                        className="row-hover"
                      >
                        <td style={styles.td}>
                          <div style={styles.tableNameCell}>
                            <span style={styles.tableProductName}>{producto.nombre}</span>
                            {producto.codigo_barras && (
                              <span style={styles.tableProductCode}>EAN: {producto.codigo_barras}</span>
                            )}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.categoryBadge}>{producto.categoria}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.tablePrice}>
                            {producto.precio > 0 ? `${producto.precio.toFixed(2)} €` : '—'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.tableText}>{producto.ubicacion || '—'}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.tableText}>{producto.stock_minimo}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.tableStockValue,
                            ...(isLow ? styles.tableStockValueLow : styles.tableStockValueOk)
                          }}>
                            {producto.stock_actual}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            ...(isLow ? styles.statusBadgeLow : styles.statusBadgeOk)
                          }}>
                            {isLow ? `⚠️ ${t('inv_bajo_stock')}` : `✓ ${t('inv_disponible')}`}
                          </span>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <div style={styles.tableActions}>
                            <button
                              style={styles.tableActionButton}
                              onClick={() => {
                                setProductoSeleccionado(producto);
                                setShowMovimiento(true);
                              }}
                              title="Ajustar stock"
                              className="btn-action-premium"
                            >
                              <Icon name="edit" size={15} color={TOKENS.textSec} />
                            </button>
                            <button
                              style={styles.tableActionButton}
                              onClick={() => {
                                setProductoSeleccionado(producto);
                                cargarMovimientos(producto.id);
                                setShowHistorial(true);
                              }}
                              title="Historial de movimientos"
                              className="btn-action-premium"
                            >
                              <Icon name="history" size={15} color={TOKENS.textSec} />
                            </button>
                            <button
                              style={styles.tableActionButton}
                              onClick={() => eliminarProducto(producto.id)}
                              title="Eliminar producto"
                              className="btn-action-premium"
                            >
                              <Icon name="trash" size={15} color={TOKENS.danger} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      <ModalNuevoProducto />
      <ModalMovimiento />
      <ModalHistorial />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// ESTILOS EN LINEA PREMIUM
// ────────────────────────────────────────────────────────────────────────────────
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '24px',
    backgroundColor: TOKENS.bg,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: TOKENS.bg,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${TOKENS.border}`,
    paddingBottom: '16px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerIconContainer: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: TOKENS.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(244, 80, 30, 0.3)',
  },
  headerTitle: {
    fontSize: '26px',
    fontWeight: '800',
    color: TOKENS.text,
    margin: 0,
    letterSpacing: '-0.5px',
  },

  // KPI Grid
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
  },
  kpiCard: {
    backgroundColor: TOKENS.bgCard,
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: `1px solid ${TOKENS.border}`,
    boxShadow: '0 2px 6px rgba(40, 30, 24, 0.02)',
  },
  kpiContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  kpiLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: TOKENS.textTer,
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  kpiValue: {
    fontSize: '22px',
    fontWeight: '800',
    color: TOKENS.text,
  },
  kpiSubtext: {
    fontSize: '12px',
    color: TOKENS.textSec,
  },
  kpiIconWrapper: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Alert Banner
  alertBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    backgroundColor: TOKENS.dangerSoft,
    border: `1px solid ${TOKENS.danger}`,
    borderRadius: '12px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  alertBannerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: '280px',
  },
  alertBannerIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(226, 59, 52, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertBannerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  alertBannerTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: TOKENS.danger,
    margin: 0,
  },
  alertBannerDesc: {
    fontSize: '13px',
    color: TOKENS.textSec,
    margin: 0,
  },
  alertBannerBtn: {
    padding: '8px 16px',
    backgroundColor: TOKENS.danger,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  alertBannerBtnActive: {
    backgroundColor: TOKENS.text,
  },

  // Category Tabs
  categoryTabs: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '4px',
    scrollbarWidth: 'none',
    marginTop: '12px',
    marginBottom: '12px',
  },
  categoryTab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    color: TOKENS.textSec,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  categoryTabActive: {
    backgroundColor: TOKENS.primary,
    borderColor: TOKENS.primary,
    color: '#fff',
    boxShadow: '0 4px 10px rgba(244, 80, 30, 0.2)',
  },
  categoryTabCount: {
    padding: '2px 6px',
    borderRadius: '10px',
    backgroundColor: TOKENS.bgCardHi,
    fontSize: '11px',
    fontWeight: '700',
    color: TOKENS.textTer,
  },
  categoryTabCountActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    color: '#fff',
  },

  // Toolbar
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
    minWidth: '260px',
    padding: '10px 14px',
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '10px',
    position: 'relative',
    boxShadow: '0 2px 4px rgba(40, 30, 24, 0.01)',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: TOKENS.text,
    backgroundColor: 'transparent',
  },
  clearSearch: {
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  viewToggleGroup: {
    display: 'flex',
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '10px',
    padding: '3px',
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  toggleBtnActive: {
    backgroundColor: TOKENS.primarySoft,
  },
  toggleBtnText: {
    fontSize: '12px',
    fontWeight: '700',
    color: TOKENS.text,
  },
  buttonPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: TOKENS.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 3px 8px rgba(244, 80, 30, 0.25)',
    transition: 'all 0.2s',
  },
  buttonSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: TOKENS.bgCard,
    color: TOKENS.text,
    border: `1px solid ${TOKENS.borderHi}`,
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Grid
  productosGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '20px',
  },
  productoCard: {
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '14px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 10px rgba(40, 30, 24, 0.015)',
    position: 'relative',
    overflow: 'hidden',
  },
  productoCardAlert: {
    borderColor: TOKENS.warning,
    backgroundColor: 'rgba(224, 138, 0, 0.02)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '10px',
  },
  cardCategoryBadge: {
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: TOKENS.textTer,
    backgroundColor: TOKENS.bgCardHi,
    padding: '3px 8px',
    borderRadius: '6px',
    border: `1px solid ${TOKENS.border}`,
  },
  cardLocationBadge: {
    fontSize: '10px',
    fontWeight: '600',
    color: TOKENS.textSec,
    backgroundColor: 'rgba(40, 30, 24, 0.04)',
    padding: '3px 6px',
    borderRadius: '6px',
  },
  cardTitle: {
    fontSize: '17px',
    fontWeight: '700',
    color: TOKENS.text,
    margin: '6px 0 0 0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardPrice: {
    fontSize: '18px',
    fontWeight: '800',
    color: TOKENS.text,
    flexShrink: 0,
  },
  cardDesc: {
    fontSize: '13px',
    color: TOKENS.textSec,
    margin: '0 0 12px 0',
    lineHeight: '1.4',
    height: '36px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  barcodeBox: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    backgroundColor: TOKENS.bgCardHi,
    borderRadius: '6px',
    border: `1px dashed ${TOKENS.borderHi}`,
    width: 'fit-content',
    marginBottom: '12px',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    marginTop: 'auto',
    borderTop: `1px solid ${TOKENS.border}`,
    paddingTop: '16px',
  },
  cardActionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 10px',
    backgroundColor: TOKENS.bgCardHi,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    color: TOKENS.textSec,
    cursor: 'pointer',
  },

  // Progress Bar
  progressContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
  },
  progressLabel: {
    color: TOKENS.textTer,
    fontWeight: '600',
  },
  progressValue: {
    fontWeight: '700',
  },
  progressBarBg: {
    height: '6px',
    backgroundColor: 'rgba(40, 30, 24, 0.05)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.4s ease-out',
  },

  // Table View
  tableContainer: {
    backgroundColor: TOKENS.bgCard,
    borderRadius: '14px',
    border: `1px solid ${TOKENS.border}`,
    boxShadow: '0 4px 10px rgba(40, 30, 24, 0.015)',
    overflow: 'hidden',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  th: {
    padding: '16px 20px',
    fontSize: '11px',
    fontWeight: '700',
    color: TOKENS.textTer,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    backgroundColor: TOKENS.bgCardHi,
    borderBottom: `1px solid ${TOKENS.border}`,
  },
  tr: {
    borderBottom: `1px solid ${TOKENS.border}`,
  },
  trAlert: {
    backgroundColor: 'rgba(224, 138, 0, 0.01)',
  },
  td: {
    padding: '16px 20px',
    verticalAlign: 'middle',
  },
  tableNameCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  tableProductName: {
    fontSize: '14px',
    fontWeight: '700',
    color: TOKENS.text,
  },
  tableProductCode: {
    fontSize: '11px',
    color: TOKENS.textTer,
  },
  categoryBadge: {
    fontSize: '11px',
    fontWeight: '700',
    color: TOKENS.textSec,
    backgroundColor: TOKENS.bgCardHi,
    padding: '4px 10px',
    borderRadius: '12px',
    border: `1px solid ${TOKENS.border}`,
    textTransform: 'capitalize',
  },
  tablePrice: {
    fontSize: '14px',
    fontWeight: '700',
    color: TOKENS.text,
  },
  tableText: {
    fontSize: '13px',
    color: TOKENS.textSec,
  },
  tableStockValue: {
    fontSize: '15px',
    fontWeight: '800',
  },
  tableStockValueOk: {
    color: TOKENS.success,
  },
  tableStockValueLow: {
    color: TOKENS.danger,
  },
  statusBadge: {
    display: 'inline-flex',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  statusBadgeOk: {
    backgroundColor: TOKENS.successSoft,
    color: TOKENS.success,
  },
  statusBadgeLow: {
    backgroundColor: TOKENS.dangerSoft,
    color: TOKENS.danger,
  },
  tableActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  tableActionButton: {
    border: 'none',
    backgroundColor: 'transparent',
    padding: '6px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty State
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 32px',
    backgroundColor: TOKENS.bgCard,
    borderRadius: '14px',
    border: `1px dashed ${TOKENS.borderHi}`,
    textAlign: 'center',
  },
  emptyIconContainer: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: TOKENS.bgCardHi,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${TOKENS.border}`,
  },
  emptyText: {
    fontSize: '14px',
    color: TOKENS.textSec,
    maxWidth: '400px',
    margin: '0 0 16px 0',
  },

  // Modales General
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(28, 24, 20, 0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '16px',
  },
  modalContent: {
    backgroundColor: TOKENS.bgCard,
    borderRadius: '16px',
    width: '100%',
    maxWidth: '520px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 40px rgba(28, 24, 20, 0.15)',
    border: `1px solid ${TOKENS.borderHi}`,
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: `1px solid ${TOKENS.border}`,
  },
  modalHeaderIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: TOKENS.primarySoft,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: TOKENS.text,
    margin: 0,
  },
  modalClose: {
    padding: '6px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.15s',
  },
  modalBody: {
    padding: '24px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '16px 24px',
    borderTop: `1px solid ${TOKENS.border}`,
    backgroundColor: TOKENS.bgCardHi,
  },

  // Formulario
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  formLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: TOKENS.textSec,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  formInput: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '14px',
    border: `1px solid ${TOKENS.borderHi}`,
    borderRadius: '8px',
    backgroundColor: TOKENS.bgPanel,
    color: TOKENS.text,
    outline: 'none',
    boxSizing: 'border-box',
  },
  formTextarea: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '14px',
    border: `1px solid ${TOKENS.borderHi}`,
    borderRadius: '8px',
    backgroundColor: TOKENS.bgPanel,
    color: TOKENS.text,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  formSelect: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '14px',
    border: `1px solid ${TOKENS.borderHi}`,
    borderRadius: '8px',
    backgroundColor: TOKENS.bgPanel,
    color: TOKENS.text,
    outline: 'none',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },

  // Ajustes Modal
  stockInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    backgroundColor: TOKENS.bgCardHi,
    borderRadius: '10px',
    border: `1px solid ${TOKENS.border}`,
    fontSize: '14px',
  },
  stockBadge: {
    fontWeight: '700',
    fontSize: '12px',
    padding: '4px 10px',
    borderRadius: '10px',
  },
  stockOK: {
    backgroundColor: TOKENS.successSoft,
    color: TOKENS.success,
  },
  stockBajo: {
    backgroundColor: TOKENS.dangerSoft,
    color: TOKENS.danger,
  },
  tipoButtons: {
    display: 'flex',
    gap: '8px',
  },
  tipoButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.borderHi}`,
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    color: TOKENS.textSec,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tipoButtonActive: {
    backgroundColor: TOKENS.primarySoft,
    borderColor: TOKENS.primary,
    color: TOKENS.primary,
  },
  previewInfo: {
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    color: TOKENS.textSec,
  },

  // Timeline (Kardex Historial)
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    paddingLeft: '10px',
  },
  timelineItem: {
    display: 'flex',
    gap: '16px',
    paddingBottom: '20px',
  },
  timelineIndicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  timelineDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    zIndex: 2,
    border: '2px solid #fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  timelineLine: {
    flex: 1,
    width: '2px',
    backgroundColor: TOKENS.borderHi,
    marginTop: '4px',
  },
  timelineContent: {
    flex: 1,
    backgroundColor: TOKENS.bgCardHi,
    borderRadius: '10px',
    padding: '12px 16px',
    border: `1px solid ${TOKENS.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  timelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  timelineBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  timelineDate: {
    fontSize: '11px',
    color: TOKENS.textTer,
  },
  timelineBody: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
  },
  timelineUnits: {
    fontWeight: '700',
    color: TOKENS.text,
  },
  timelineReason: {
    color: TOKENS.textSec,
  },
  timelineFooter: {
    borderTop: `1px dashed ${TOKENS.border}`,
    paddingTop: '8px',
    marginTop: '4px',
    fontSize: '11px',
    color: TOKENS.textTer,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  timelineNotes: {
    margin: 0,
    fontStyle: 'italic',
    color: TOKENS.textSec,
  },
  emptyHistorial: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
    gap: '10px',
  },
  tipoEntrada: {
    backgroundColor: TOKENS.successSoft,
    color: TOKENS.success,
  },
  tipoSalida: {
    backgroundColor: TOKENS.dangerSoft,
    color: TOKENS.danger,
  },
  tipoAjuste: {
    backgroundColor: TOKENS.warningSoft,
    color: TOKENS.warning,
  },
};
