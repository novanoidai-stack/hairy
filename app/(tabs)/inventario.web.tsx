import { useEffect, useMemo, useState } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { PageLoader } from '@/components/ui/DesignComponents';

// ────────────────────────────────────────────────────────────────────────────────
// ICONOS SVG
// ────────────────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  const icons: any = {
    search: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    package: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    history: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    chevronDown: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
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

  // ────────────────────────────────────────────────────────────────────────────────
  // ESTADO
  // ────────────────────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [alertasCount, setAlertasCount] = useState(0);

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
  // FILTROS
  // ────────────────────────────────────────────────────────────────────────────────
  const categorias = useMemo(() => {
    const cats = new Set(productos.map((p) => p.categoria));
    return ['todas', ...Array.from(cats).sort()];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    if (!busqueda) return productos;
    const query = busqueda.toLowerCase();
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(query) ||
        p.descripcion?.toLowerCase().includes(query) ||
        p.codigo_barras?.includes(query)
    );
  }, [productos, busqueda]);

  // ────────────────────────────────────────────────────────────────────────────────
  // MODAL NUEVO PRODUCTO
  // ────────────────────────────────────────────────────────────────────────────────
  const ModalNuevoProducto = () => {
    if (!showNuevoProducto) return null;
    return createPortal(
      <div style={styles.modalOverlay}>
        <div style={styles.modalContent}>
          <div style={styles.modalHeader}>
            <h3 style={styles.modalTitle}>Nuevo Producto</h3>
            <button style={styles.modalClose} onClick={() => setShowNuevoProducto(false)}>
              <Icon name="x" size={20} color={TOKENS.textSec} />
            </button>
          </div>

          <div style={styles.modalBody}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Nombre *</label>
              <input
                style={styles.formInput}
                value={nuevoProducto.nombre}
                onChange={(e) => setNuevoProducto({ ...nuevoProducto, nombre: e.target.value })}
                placeholder="Ej: Shampoo hidratante"
                autoFocus
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Descripción</label>
              <textarea
                style={styles.formTextarea}
                value={nuevoProducto.descripcion}
                onChange={(e) => setNuevoProducto({ ...nuevoProducto, descripcion: e.target.value })}
                placeholder="Descripción opcional"
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
                  <option value="shampoo">Shampoo</option>
                  <option value="color">Color/Tinte</option>
                  <option value="tratamiento">Tratamiento</option>
                  <option value="accesorios">Accesorios</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Precio (€)</label>
                <input
                  style={styles.formInput}
                  type="number"
                  step="0.01"
                  value={(nuevoProducto.precio_cents / 100).toFixed(2)}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, precio_cents: Math.round(parseFloat(e.target.value) * 100) })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Stock mínimo</label>
                <input
                  style={styles.formInput}
                  type="number"
                  value={nuevoProducto.stock_minimo}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, stock_minimo: parseInt(e.target.value) || 0 })}
                  placeholder="5"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Unidades iniciales</label>
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
              Cancelar
            </button>
            <button style={styles.buttonPrimary} onClick={crearProducto}>
              Crear Producto
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // MODAL REGISTRAR MOVIMIENTO
  // ────────────────────────────────────────────────────────────────────────────────
  const ModalMovimiento = () => {
    if (!showMovimiento || !productoSeleccionado) return null;
    return createPortal(
      <div style={styles.modalOverlay}>
        <div style={styles.modalContent}>
          <div style={styles.modalHeader}>
            <h3 style={styles.modalTitle}>Ajustar Stock</h3>
            <span style={styles.modalSubtitle}>{productoSeleccionado.nombre}</span>
            <button style={styles.modalClose} onClick={() => setShowMovimiento(false)}>
              <Icon name="x" size={20} color={TOKENS.textSec} />
            </button>
          </div>

          <div style={styles.modalBody}>
            <div style={styles.stockInfo}>
              <span>Stock actual: <strong>{productoSeleccionado.stock_actual}</strong></span>
              <span style={productoSeleccionado.stock_actual < productoSeleccionado.stock_minimo ? styles.stockBajo : styles.stockOK}>
                {productoSeleccionado.stock_actual < productoSeleccionado.stock_minimo && '⚠️ Bajo'}
              </span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Tipo de movimiento</label>
              <div style={styles.tipoButtons}>
                {(['entrada', 'salida', 'ajuste'] as const).map((tipo) => (
                  <button
                    key={tipo}
                    style={{
                      ...styles.tipoButton,
                      ...(nuevoMovimiento.tipo === tipo ? styles.tipoButtonActive : {}),
                    }}
                    onClick={() => setNuevoMovimiento({ ...nuevoMovimiento, tipo })}
                  >
                    {tipo === 'entrada' ? 'Entrada' : tipo === 'salida' ? 'Salida' : 'Ajuste'}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                {nuevoMovimiento.tipo === 'ajuste' ? 'Nuevo stock total' : 'Unidades'}
              </label>
              <input
                style={styles.formInput}
                type="number"
                min={nuevoMovimiento.tipo === 'salida' ? 1 : 0}
                value={nuevoMovimiento.unidades}
                onChange={(e) => setNuevoMovimiento({ ...nuevoMovimiento, unidades: parseInt(e.target.value) || 0 })}
                placeholder="1"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Motivo</label>
              <input
                style={styles.formInput}
                value={nuevoMovimiento.motivo}
                onChange={(e) => setNuevoMovimiento({ ...nuevoMovimiento, motivo: e.target.value })}
                placeholder={nuevoMovimiento.tipo === 'entrada' ? 'Reabastecimiento, compra...' : 'Venta, merma, caducidad...'}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Notas (opcional)</label>
              <textarea
                style={styles.formTextarea}
                value={nuevoMovimiento.notas}
                onChange={(e) => setNuevoMovimiento({ ...nuevoMovimiento, notas: e.target.value })}
                placeholder="Notas adicionales"
                rows={2}
              />
            </div>

            {nuevoMovimiento.tipo === 'salida' && (
              <div style={styles.previewInfo}>
                Stock resultante: <strong>{productoSeleccionado.stock_actual - nuevoMovimiento.unidades}</strong>
              </div>
            )}

            {nuevoMovimiento.tipo === 'entrada' && (
              <div style={styles.previewInfo}>
                Stock resultante: <strong>{productoSeleccionado.stock_actual + nuevoMovimiento.unidades}</strong>
              </div>
            )}

            {nuevoMovimiento.tipo === 'ajuste' && (
              <div style={styles.previewInfo}>
                Stock establecido en: <strong>{nuevoMovimiento.unidades}</strong>
              </div>
            )}
          </div>

          <div style={styles.modalFooter}>
            <button style={styles.buttonSecondary} onClick={() => setShowMovimiento(false)}>
              Cancelar
            </button>
            <button style={styles.buttonPrimary} onClick={registrarMovimiento}>
              Registrar
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // MODAL HISTORIAL
  // ────────────────────────────────────────────────────────────────────────────────
  const ModalHistorial = () => {
    if (!showHistorial) return null;
    return createPortal(
      <div style={styles.modalOverlay}>
        <div style={{ ...styles.modalContent, maxWidth: '600px' }}>
          <div style={styles.modalHeader}>
            <h3 style={styles.modalTitle}>Historial de Movimientos</h3>
            {productoSeleccionado && (
              <span style={styles.modalSubtitle}>{productoSeleccionado.nombre}</span>
            )}
            <button style={styles.modalClose} onClick={() => setShowHistorial(false)}>
              <Icon name="x" size={20} color={TOKENS.textSec} />
            </button>
          </div>

          <div style={styles.modalBody}>
            {movimientos.length === 0 ? (
              <p style={styles.emptyText}>No hay movimientos registrados</p>
            ) : (
              <div style={styles.movimientosList}>
                {movimientos.map((mov) => (
                  <div key={mov.id} style={styles.movimientoItem}>
                    <div style={styles.movimientoHeader}>
                      <span style={{
                        ...styles.movimientoTipo,
                        ...(mov.tipo === 'entrada' ? styles.tipoEntrada : mov.tipo === 'salida' ? styles.tipoSalida : styles.tipoAjuste),
                      }}>
                        {mov.tipo === 'entrada' ? '↓ Entrada' : mov.tipo === 'salida' ? '↑ Salida' : '⟳ Ajuste'}
                      </span>
                      <span style={styles.movimientoFecha}>
                        {new Date(mov.created_at).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div style={styles.movimientoBody}>
                      <span style={styles.movimientoUnidades}>
                        {mov.unidades > 0 ? '+' : ''}{mov.unidades} unidades
                      </span>
                      {mov.motivo && <span style={styles.movimientoMotivo}>{mov.motivo}</span>}
                    </div>
                    {mov.creado_por && (
                      <div style={styles.movimientoFooter}>
                        por {mov.creado_por}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.modalFooter}>
            <button style={styles.buttonSecondary} onClick={() => setShowHistorial(false)}>
              Cerrar
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // RENDER
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
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Icon name="package" size={28} color={TOKENS.primary} />
          <h1 style={styles.headerTitle}>Inventario</h1>
          {alertasCount > 0 && (
            <span style={styles.alertBadge}>
              <Icon name="alert" size={16} color={TOKENS.danger} />
              {alertasCount}
            </span>
          )}
        </div>

        {!isMobile && (
          <button style={styles.buttonPrimary} onClick={() => setShowNuevoProducto(true)}>
            <Icon name="plus" size={18} color="#fff" />
            Nuevo Producto
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={styles.filters}>
        <div style={styles.searchBox}>
          <Icon name="search" size={18} color={TOKENS.textTer} />
          <input
            style={styles.searchInput}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código..."
          />
        </div>

        <select
          style={styles.filterSelect}
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
        >
          {categorias.map((cat) => (
            <option key={cat} value={cat}>
              {cat === 'todas' ? 'Todas las categorías' : cat}
            </option>
          ))}
        </select>

        {isMobile && (
          <button style={styles.buttonPrimarySmall} onClick={() => setShowNuevoProducto(true)}>
            <Icon name="plus" size={18} color="#fff" />
          </button>
        )}
      </div>

      {/* Lista de productos */}
      <div style={styles.productosList}>
        {productosFiltrados.length === 0 ? (
          <div style={styles.emptyState}>
            <Icon name="package" size={48} color={TOKENS.textTer} />
            <p style={styles.emptyText}>
              {busqueda ? 'No se encontraron productos' : 'No hay productos registrados'}
            </p>
            {!busqueda && (
              <button style={styles.buttonSecondary} onClick={() => setShowNuevoProducto(true)}>
                Crear primer producto
              </button>
            )}
          </div>
        ) : (
          productosFiltrados.map((producto) => (
            <div
              key={producto.id}
              style={{
                ...styles.productoCard,
                ...(producto.stock_bajo ? styles.productoCardAlert : {}),
              }}
            >
              <div style={styles.productoMain}>
                <div style={styles.productoInfo}>
                  <h3 style={styles.productoNombre}>{producto.nombre}</h3>
                  <span style={styles.productoCategoria}>{producto.categoria}</span>
                </div>

                <div style={styles.productoStock}>
                  <span style={styles.stockLabel}>Stock:</span>
                  <span style={{
                    ...styles.stockValue,
                    ...(producto.stock_bajo ? styles.stockValueLow : {}),
                  }}>
                    {producto.stock_actual}
                  </span>
                  {producto.stock_bajo && (
                    <Icon name="alert" size={16} color={TOKENS.danger} />
                  )}
                  <span style={styles.stockMin}>/ {producto.stock_minimo}</span>
                </div>

                <div style={styles.productoPrecio}>
                  {producto.precio > 0 ? `${producto.precio.toFixed(2)} €` : '-'}
                </div>
              </div>

              <div style={styles.productoActions}>
                <button
                  style={styles.actionButton}
                  onClick={() => {
                    setProductoSeleccionado(producto);
                    setShowMovimiento(true);
                  }}
                  title="Ajustar stock"
                >
                  <Icon name="edit" size={18} color={TOKENS.textSec} />
                </button>
                <button
                  style={styles.actionButton}
                  onClick={() => {
                    setProductoSeleccionado(producto);
                    cargarMovimientos(producto.id);
                    setShowHistorial(true);
                  }}
                  title="Ver historial"
                >
                  <Icon name="history" size={18} color={TOKENS.textSec} />
                </button>
                <button
                  style={styles.actionButton}
                  onClick={() => eliminarProducto(producto.id)}
                  title="Eliminar"
                >
                  <Icon name="trash" size={18} color={TOKENS.danger} />
                </button>
              </div>

              {producto.ubicacion && (
                <div style={styles.productoMeta}>
                  <small style={styles.metaText}>Ubicación: {producto.ubicacion}</small>
                </div>
              )}
            </div>
          ))
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
// ESTILOS
// ────────────────────────────────────────────────────────────────────────────────
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
    backgroundColor: TOKENS.bg,
    minHeight: '100vh',
  },

  // Loading
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: TOKENS.bg,
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: TOKENS.text,
    margin: 0,
  },
  alertBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '12px',
    backgroundColor: TOKENS.dangerSoft,
    color: TOKENS.danger,
    fontSize: '12px',
    fontWeight: '600',
  },

  // Filtros
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: '200px',
    padding: '8px 12px',
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '8px',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: TOKENS.text,
    backgroundColor: 'transparent',
  },
  filterSelect: {
    padding: '8px 32px 8px 12px',
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: TOKENS.text,
    cursor: 'pointer',
  },

  // Lista de productos
  productosList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },

  // Tarjeta de producto
  productoCard: {
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '12px',
    padding: '16px',
    transition: 'all 0.2s',
  },
  productoCardAlert: {
    borderColor: TOKENS.warning,
    backgroundColor: TOKENS.warningSoft,
  },
  productoMain: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  productoInfo: {
    flex: 1,
  },
  productoNombre: {
    fontSize: '16px',
    fontWeight: '600',
    color: TOKENS.text,
    margin: '0 0 4px 0',
  },
  productoCategoria: {
    fontSize: '12px',
    color: TOKENS.textTer,
    textTransform: 'capitalize',
  },
  productoStock: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '14px',
  },
  stockLabel: {
    color: TOKENS.textTer,
  },
  stockValue: {
    fontWeight: '600',
    color: TOKENS.success,
    fontSize: '16px',
  },
  stockValueLow: {
    color: TOKENS.danger,
  },
  stockMin: {
    color: TOKENS.textTer,
    fontSize: '12px',
  },
  productoPrecio: {
    fontSize: '18px',
    fontWeight: '700',
    color: TOKENS.text,
  },
  productoActions: {
    display: 'flex',
    gap: '8px',
    borderTop: `1px solid ${TOKENS.border}`,
    paddingTop: '12px',
  },
  actionButton: {
    padding: '8px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  actionButtonHover: {
    backgroundColor: TOKENS.bgCardHi,
  },
  productoMeta: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: `1px solid ${TOKENS.borderHi}`,
  },
  metaText: {
    color: TOKENS.textTer,
  },

  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '16px',
    color: TOKENS.textTer,
    margin: '16px 0',
  },

  // Botones
  buttonPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: TOKENS.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  buttonPrimaryHover: {
    backgroundColor: TOKENS.primaryHi,
  },
  buttonPrimarySmall: {
    padding: '8px',
  },
  buttonSecondary: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    color: TOKENS.text,
    border: `1px solid ${TOKENS.borderHi}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonSecondaryHover: {
    backgroundColor: TOKENS.bgCardHi,
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modalContent: {
    backgroundColor: TOKENS.bgCard,
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: `1px solid ${TOKENS.border}`,
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: TOKENS.text,
    margin: 0,
    flex: 1,
  },
  modalSubtitle: {
    fontSize: '14px',
    color: TOKENS.textTer,
  },
  modalClose: {
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '4px',
  },
  modalBody: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '16px 20px',
    borderTop: `1px solid ${TOKENS.border}`,
  },

  // Formulario
  formGroup: {
    marginBottom: '16px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  formLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: TOKENS.textSec,
    marginBottom: '6px',
  },
  formInput: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '6px',
    backgroundColor: TOKENS.bgPanel,
    color: TOKENS.text,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  formInputFocus: {
    borderColor: TOKENS.primary,
  },
  formTextarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '6px',
    backgroundColor: TOKENS.bgPanel,
    color: TOKENS.text,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  formSelect: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '6px',
    backgroundColor: TOKENS.bgPanel,
    color: TOKENS.text,
    outline: 'none',
    cursor: 'pointer',
  },

  // Info de stock
  stockInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: TOKENS.bgCardHi,
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  stockOK: {
    color: TOKENS.success,
  },
  stockBajo: {
    color: TOKENS.danger,
  },

  // Tipo de movimiento
  tipoButtons: {
    display: 'flex',
    gap: '8px',
  },
  tipoButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: TOKENS.bgCard,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    color: TOKENS.textSec,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tipoButtonActive: {
    backgroundColor: TOKENS.primarySoft,
    borderColor: TOKENS.primary,
    color: TOKENS.primary,
  },

  // Preview info
  previewInfo: {
    padding: '12px',
    backgroundColor: TOKENS.bgCardHi,
    borderRadius: '8px',
    fontSize: '14px',
    color: TOKENS.textSec,
    marginTop: '12px',
  },

  // Movimientos
  movimientosList: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  movimientoItem: {
    padding: '12px',
    backgroundColor: TOKENS.bgCardHi,
    borderRadius: '8px',
    marginBottom: '8px',
  },
  movimientoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  movimientoTipo: {
    fontSize: '12px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '4px',
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
  movimientoFecha: {
    fontSize: '12px',
    color: TOKENS.textTer,
  },
  movimientoBody: {
    display: 'flex',
    gap: '12px',
    fontSize: '14px',
  },
  movimientoUnidades: {
    fontWeight: '600',
    color: TOKENS.text,
  },
  movimientoMotivo: {
    color: TOKENS.textSec,
  },
  movimientoFooter: {
    marginTop: '4px',
    fontSize: '12px',
    color: TOKENS.textTer,
  },
};
