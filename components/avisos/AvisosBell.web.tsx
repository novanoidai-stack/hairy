import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'expo-router';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useAvisos } from '@/lib/hooks/useAvisos';
import {
  CATEGORIA_META, CATEGORIA_ORDEN, urgenciaColor, tiempoRelativo,
  type AvisoCategoria, type AvisoItem,
} from '@/lib/avisosCategorias';

interface Props {
  // 'sidebar': boton compacto para la cabecera del Sidebar; el panel se ancla
  // en fixed junto al menu para no quedar recortado por el overflow del aside.
  collapsed?: boolean;
  mode?: 'sidebar' | 'header';
}

// Icono de categoria (SVG inline, tinte por categoria). El nativo usa Ionicons
// por su nombre en CATEGORIA_META.ionicon; aqui, SVG lucide-style equivalente.
function IconoCategoria({ cat, size = 15, color }: { cat: AvisoCategoria; size?: number; color: string }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (cat) {
    case 'citas': return (<svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>);
    case 'pagos': return (<svg {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>);
    case 'agenda': return (<svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
    case 'mensajes': return (<svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>);
    case 'clientes': return (<svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
    case 'inventario': return (<svg {...p}><path d="m21 16-9 5-9-5V8l9-5 9 5z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>);
    case 'presupuestos': return (<svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>);
    default: return (<svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z" fill={color} stroke="none"/></svg>);
  }
}

function IconoCheck({ size = 15, color }: { size?: number; color: string }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>);
}
function IconoX({ size = 14, color }: { size?: number; color: string }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
}

// Campana de avisos global: visible en todas las paginas (vive en el Sidebar).
// Estructura los avisos en CATEGORIAS con un CALIFICADOR de urgencia por fila y
// una vista "Todos" ordenada por urgencia + cercania temporal. Cada aviso navega
// a la pantalla donde se resuelve.
export function AvisosBell({ collapsed, mode = 'sidebar' }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<'todos' | AvisoCategoria>('todos');
  const avisos = useAvisos();
  const items = avisos.items;

  const go = (path: string) => {
    setOpen(false);
    router.push(path as never);
  };

  const hayUrgente = items.some((i) => i.urgencia === 'urgente' || i.urgencia === 'alta');
  const dotColor = hayUrgente ? T.danger : '#fb923c';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Categorias presentes (para los chips) y conteos por categoria.
  const categoriasPresentes = CATEGORIA_ORDEN.filter((c) => items.some((i) => i.categoria === c));
  const conteo = (c: AvisoCategoria) => items.filter((i) => i.categoria === c).length;
  const visibles = cat === 'todos' ? items : items.filter((i) => i.categoria === cat);

  const btnWidth = mode === 'header' ? 32 : (collapsed ? 32 : 26);
  const btnHeight = mode === 'header' ? 32 : (collapsed ? 32 : 26);
  const btnBackground = open ? T.primarySoft : (mode === 'header' ? T.bgCard : T.bgCardHi);
  const btnBorder = `1px solid ${open ? 'rgba(244,80,30,0.30)' : T.border}`;
  const btnColor = open ? T.primaryHi : (mode === 'header' ? T.textSec : T.textTertiary);

  const dropdownStyle: React.CSSProperties = mode === 'header'
    ? (isMobile
      ? { position: 'fixed', top: 58, left: 12, right: 12, maxHeight: '68vh', overflowY: 'auto', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 20px 50px rgba(20,12,6,0.30)', zIndex: 99999, padding: 12 }
      : { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxHeight: 460, overflowY: 'auto', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 20px 50px rgba(20,12,6,0.30)', zIndex: 99999, padding: 12 })
    : { position: 'fixed', top: 12, left: collapsed ? 84 : 248, width: 340, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 20px 50px rgba(20,12,6,0.30)', zIndex: 99999, padding: 12 };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={() => { setOpen((v) => !v); if (!open) { avisos.refresh(); setCat('todos'); } }}
        title="Avisos"
        style={{
          display: 'grid', placeItems: 'center', width: btnWidth, height: btnHeight,
          borderRadius: 8, background: btnBackground,
          border: btnBorder,
          color: btnColor, cursor: 'pointer', position: 'relative', padding: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {avisos.total > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, width: 7, height: 7, background: dotColor, borderRadius: 999, boxShadow: `0 0 0 2px ${T.bgPanel}` }} />
        )}
      </button>

      {open && mounted && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99998 }} />
          <div style={dropdownStyle} className="animate-pop-in">
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Avisos</span>
              {avisos.total > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: hayUrgente ? T.danger : '#fb923c', background: hayUrgente ? T.dangerSoft : 'rgba(251,146,60,0.14)', borderRadius: 999, padding: '2px 8px' }}>{avisos.total}</span>
              )}
            </div>

            {items.length === 0 ? (
              <div style={{ fontSize: 12, color: T.textTertiary, textAlign: 'center', padding: '22px 0' }}>
                {avisos.loading ? 'Cargando...' : 'No hay avisos pendientes'}
              </div>
            ) : (
              <>
                {/* Chips de categoria: "Todos" + solo las categorias con avisos. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                  <Chip label="Todos" count={items.length} active={cat === 'todos'} onClick={() => setCat('todos')} />
                  {categoriasPresentes.map((c) => (
                    <Chip key={c} label={CATEGORIA_META[c].label} count={conteo(c)} active={cat === c} onClick={() => setCat(c)} />
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {visibles.map((it) => (
                    <FilaAviso
                      key={it.id}
                      item={it}
                      onOpen={() => go(it.ruta)}
                      onResolver={it.hallazgoId ? () => { void avisos.resolverHallazgo(it.hallazgoId!, 'resuelto'); } : undefined}
                      onDescartar={it.hallazgoId ? () => { void avisos.resolverHallazgo(it.hallazgoId!, 'descartado'); } : undefined}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
        padding: '4px 9px', borderRadius: 999,
        background: active ? T.primarySoft : T.bgCard,
        border: `1px solid ${active ? 'rgba(244,80,30,0.35)' : T.border}`,
        color: active ? T.primaryHi : T.textSec,
      }}
    >
      {label}
      <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.85 }}>{count}</span>
    </button>
  );
}

function FilaAviso({ item, onOpen, onResolver, onDescartar }: {
  item: AvisoItem;
  onOpen: () => void;
  onResolver?: () => void;
  onDescartar?: () => void;
}) {
  const u = urgenciaColor(item.urgencia);
  const meta = CATEGORIA_META[item.categoria];
  const cuando = tiempoRelativo(item.ts);
  const mostrarBadge = item.urgencia === 'urgente' || item.urgencia === 'alta';
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
      <button
        onClick={onOpen}
        title={item.subtitulo || item.titulo}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
          background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `3px solid ${u.fg}`,
          borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 9,
        }}
      >
        <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, background: `${meta.tint}14` }}>
          <IconoCategoria cat={item.categoria} color={meta.tint} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{item.titulo}</span>
            {mostrarBadge && (
              <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: u.fg, background: u.bg, borderRadius: 999, padding: '1px 6px' }}>{u.label}</span>
            )}
          </span>
          <span style={{ fontSize: 11, color: T.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.meta ? item.meta : item.subtitulo || meta.label}
            <span style={{ color: T.textTertiary }}> · {cuando}</span>
          </span>
        </span>
      </button>
      {onResolver && (
        <button onClick={onResolver} title="Marcar como resuelto" style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, color: T.success, cursor: 'pointer', padding: 0 }}>
          <IconoCheck color={T.success} />
        </button>
      )}
      {onDescartar && (
        <button onClick={onDescartar} title="Descartar este aviso" style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, color: T.textTertiary, cursor: 'pointer', padding: 0 }}>
          <IconoX color={T.textTertiary} />
        </button>
      )}
    </div>
  );
}
