// Hub "Qué hace la IA" - SESIÓN 9 PLAN-IA-CHISPA-V2-REDISENO.md
// Catálogo discoverible de todas las funciones de IA de Mecha
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { roleOf, type Role } from '@/lib/permissions';
import { CATALOGO_POR_CATEGORIA, type FuncionIA } from '@/lib/iaCatalogo';

interface Props {
  negocioId: string;
  rolStr?: string;
}

// Iconos SVG reutilizables (sin dangerouslySetInnerHTML)
const IconoPanel = () => <path d="M12 3l1.8 5.6L19.5 10.4l-5.7 1.8L12 18l-1.8-5.8L4.5 10.4l5.7-1.8L12 3z" />;
const IconoConfig = () => {
  return (
    <>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </>
  );
};
const IconoAgenda = () => {
  return (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  );
};
const IconoPagina = () => {
  return (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </>
  );
};
const IconoMigracion = () => {
  return (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>
  );
};
const IconoVoz = () => {
  return (
    <>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </>
  );
};

const ICONOS: Record<string, () => React.ReactNode> = {
  panel: IconoPanel,
  config: IconoConfig,
  agenda: IconoAgenda,
  pagina: IconoPagina,
  migracion: IconoMigracion,
  voz: IconoVoz,
};

const CATEGORIAS: Record<string, { label: string; color: string }> = {
  panel: { label: 'Panel Chispa', color: T.primary },
  config: { label: 'Configuración', color: '#0891b2' },
  agenda: { label: 'Agenda', color: '#e08a00' },
  pagina: { label: 'Por página', color: '#0f9d6b' },
  migracion: { label: 'Migración', color: '#e11d6b' },
  voz: { label: 'Voz', color: '#8b5cf6' },
};

function IconoSVG({ Icon, size = 18, color = T.text }: { Icon: () => React.ReactNode; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <Icon />
    </svg>
  );
}

function FilaFuncion({ fn, esGestor }: { fn: FuncionIA; esGestor: boolean }) {
  if (fn.soloGestor && !esGestor) return null;

  const ir = () => {
    if (typeof window === 'undefined') return;
    const u = fn.ubicacion;
    // Abrir el chat de Chispa donde estas, no navegar: '?chispa=1' no es una ruta.
    if (u.includes('chispa=1')) {
      window.dispatchEvent(new CustomEvent('mecha-chispa-open'));
      return;
    }
    // Las 'ubicacion' del catalogo usan el prefijo publico '/app' (baseUrl); el
    // router interno de expo espera hrefs '/(tabs)/...'. Ademas navegamos por el
    // puente 'mecha-nav' del layout raiz (mismo que usa el tour): navegar con el
    // router LOCAL desde dentro de la escena de Configuracion dejaba la pagina
    // anterior pintada encima (overlap). Desde la raiz el cambio de pestana es limpio.
    let ruta = u.split('?')[0].replace(/^\/app/, '');
    // La agenda es el index del grupo; 'avisos' es una hoja, no una ruta propia.
    const route = (ruta === '' || ruta === '/' || ruta === '/agenda' || ruta === '/avisos')
      ? '/(tabs)'
      : '/(tabs)' + ruta;
    window.postMessage({ type: 'mecha-nav', route }, window.location.origin);
  };

  const cat = CATEGORIAS[fn.categoria];

  return (
    <div
      onClick={ir}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 12px',
        borderRadius: 10,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${cat.color}40`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
    >
      <div style={{
        display: 'grid', placeItems: 'center', flexShrink: 0,
        width: 30, height: 30, borderRadius: 8, background: `${cat.color}10`,
      }}>
        <IconoSVG Icon={ICONOS[fn.categoria] || ICONOS.pagina} size={16} color={cat.color} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fn.titulo}</span>
          {fn.soloGestor && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: cat.color, background: `${cat.color}12`, borderRadius: 999, padding: '1px 6px', flexShrink: 0 }}>Solo gestor</span>
          )}
        </div>
        {/* Descripcion a una sola linea (antes 2-3 lineas por fila hacian la lista
            interminable); el detalle completo se ve al ir a la funcion. */}
        <p style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.4, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {fn.descripcion}
        </p>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.textTertiary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
}

export function HubIA({ negocioId, rolStr }: Props) {
  const rol = roleOf({ role: rolStr });
  const esGestor = rol === 'propietario' || rol === 'direccion';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 8, margin: 0 }}>Qué hace la IA (Chispa)</h2>
        <p style={{ fontSize: 14, color: T.textSecondary, margin: 0, maxWidth: 680 }}>
          Chispa es la capa de inteligencia artificial de Mecha. Aquí tienes el catálogo completo de funciones que puede realizar,
          organizado por categoría. Pulsa en cualquier función para ir a la pantalla donde se usa.
        </p>
      </div>

      {Object.entries(CATALOGO_POR_CATEGORIA).map(([catKey, funciones]) => {
        const cat = CATEGORIAS[catKey];
        const visibles = funciones.filter(f => !f.soloGestor || esGestor);
        if (visibles.length === 0) return null;

        return (
          <div key={catKey} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 4, height: 18, background: cat.color, borderRadius: 999 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>{cat.label}</h3>
              <span style={{ fontSize: 11.5, color: T.textTertiary, background: T.bg, padding: '2px 8px', borderRadius: 6 }}>
                {visibles.length} {visibles.length === 1 ? 'función' : 'funciones'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {visibles.map((fn) => (
                <FilaFuncion key={fn.id} fn={fn} esGestor={esGestor} />
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 32, padding: '16px 18px', borderRadius: 10, background: 'rgba(244,80,30,0.08)', border: '1px solid rgba(244,80,30,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <p style={{ fontSize: 13, color: T.text, margin: '0 0 6px 0', fontWeight: 600 }}>
              Chispa es complementaria, no obligatoria
            </p>
            <p style={{ fontSize: 13, color: T.textSecondary, margin: 0 }}>
              Todo lo que hace la IA también puedes hacerlo tú con los botones normales del software. Chispa es para ahorrarte tiempo,
              no para reemplazarte. Si prefieres no usarla, puedes desactivar el asistente desde Ajustes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
