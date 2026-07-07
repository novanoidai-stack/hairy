// Renderer unico de los bloques tipados de Chispa (web).
// bloque.tipo -> componente. Un solo sitio donde se decide como se pinta cada
// tipo; anadir un tipo nuevo (grafica, listas...) = anadir un caso aqui y en
// lib/chispaBloques.ts, sin tocar el panel ni el edge.
import { useRouter } from 'expo-router';
import type { Bloque, ChispaUnidad } from '@/lib/chispaBloques';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { LineChartMini } from '@/components/charts/LineChartMini.web';

const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';

// Formato + color por unidad para los bloques 'grafica'/'comparativa'. Los
// valores en si SIEMPRE vienen calculados por el edge (nunca inventados por el LLM).
function fmtUnidad(unidad: ChispaUnidad): (n: number) => string {
  if (unidad === 'eur') return (n) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  if (unidad === 'pct') return (n) => `${Math.round(n)}%`;
  return (n) => `${n}`;
}
function colorUnidad(unidad: ChispaUnidad): string {
  return unidad === 'eur' ? T.success : unidad === 'pct' ? T.cyan : T.primary;
}

// Estado del bloque 'accion' (propone -> confirma). Lo gobierna el panel.
export type AccionEstado = 'pendiente' | 'aplicando' | 'aplicada' | 'cancelada';

export interface BloqueRendererProps {
  bloque: Bloque;
  // Solo para bloque 'accion':
  accionEstado?: AccionEstado;
  onConfirmar?: (accion?: any) => void | Promise<void>;
  onCancelar?: () => void;
  isMobile?: boolean;
}

function IconoAdvertencia({ size = 14, color = T.warning }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconoFlecha({ size = 14, color = T.primaryHi }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Detecta la marca de solape en una accion propuesta (sin depender de su tipo).
function tieneSolapa(accion: unknown): boolean {
  return !!accion && typeof accion === 'object' && 'solapa' in accion && (accion as { solapa?: boolean }).solapa === true;
}

// Lista de citas afectadas por una accion batch (confirmar_citas). Vacia si no aplica.
function citasAfectadas(accion: unknown): { id: string; label: string }[] {
  if (!accion || typeof accion !== 'object' || !('citas' in accion)) return [];
  const c = (accion as { citas?: unknown }).citas;
  return Array.isArray(c) ? (c as { id: string; label: string }[]) : [];
}

export function BloqueRenderer({ bloque, accionEstado = 'pendiente', onConfirmar, onCancelar }: BloqueRendererProps) {
  const router = useRouter();

  // --- TEXTO: burbuja del asistente ---
  if (bloque.tipo === 'texto') {
    return (
      <div style={{
        padding: '9px 12px',
        borderRadius: '14px 14px 14px 4px',
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        fontSize: 13.5, fontWeight: 400, color: T.text,
        lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
      }}>
        {bloque.texto}
      </div>
    );
  }

  // --- ENLACE: chip que navega con router.push ---
  if (bloque.tipo === 'enlace') {
    return (
      <button
        onClick={() => router.push(bloque.ruta as never)}
        aria-label={bloque.label}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
          padding: '8px 12px', borderRadius: 999,
          border: `1.5px solid ${T.primary}`, background: T.primarySoft,
          color: T.primaryHi, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'left',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.primaryGlow; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.primarySoft; }}
      >
        <span>{bloque.descripcion ? `${bloque.descripcion} — ${bloque.label}` : bloque.label}</span>
        <IconoFlecha size={14} color={T.primaryHi} />
      </button>
    );
  }

  // --- GRAFICA: serie temporal real (ver 'grafica' en lib/chispaBloques.ts) ---
  if (bloque.tipo === 'grafica') {
    const fmt = fmtUnidad(bloque.unidad);
    const serie = bloque.serie.map((p) => ({ fecha: new Date(`${p.fecha}T00:00:00`), valor: p.valor }));
    return (
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px 14px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 8 }}>{bloque.titulo}</div>
        <LineChartMini serie={serie} color={colorUnidad(bloque.unidad)} fmt={fmt} />
      </div>
    );
  }

  // --- COMPARATIVA: dos cifras reales (periodo actual vs anterior) ---
  if (bloque.tipo === 'comparativa') {
    const { actual, anterior, unidad, titulo } = bloque;
    const fmt = fmtUnidad(unidad);
    const igual = actual.valor === anterior.valor;
    const subiendo = actual.valor > anterior.valor;
    const deltaPct = anterior.valor > 0
      ? Math.round(((actual.valor - anterior.valor) / anterior.valor) * 100)
      : (actual.valor > 0 ? 100 : 0);
    const colorDelta = igual ? T.textTertiary : subiendo ? T.success : T.danger;
    return (
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px 14px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 10 }}>{titulo}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10.5, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3 }}>{actual.label}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: T.text }}>{fmt(actual.valor)}</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: colorDelta, paddingBottom: 3 }}>
            {igual ? '=' : subiendo ? `+${deltaPct}%` : `${deltaPct}%`}
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3 }}>{anterior.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.textSecondary }}>{fmt(anterior.valor)}</div>
          </div>
        </div>
      </div>
    );
  }

  // --- ACCION: tarjeta propone -> confirma (PR-12: el usuario confirma) ---
  if (bloque.tipo === 'accion') {
    const accion = bloque.accion;
    const resuelta = accionEstado === 'aplicada' || accionEstado === 'cancelada';
    const aplicando = accionEstado === 'aplicando';
    const citas = citasAfectadas(accion);
    return (
      <div style={{ background: T.bgCard, border: `1.5px solid ${T.borderHi}`, borderRadius: 14, padding: '12px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.45, marginBottom: citas.length > 0 ? 8 : 6 }}>
          {accion.resumen}
        </div>
        {/* Batch (confirmar_citas): lista de citas afectadas */}
        {citas.length > 0 && !resuelta && (
          <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {citas.map((c) => (
              <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.textSecondary, lineHeight: 1.4 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: T.primary, flexShrink: 0 }} />
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        )}
        {tieneSolapa(accion) && !resuelta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: T.warningSoft, borderRadius: 8, marginBottom: 10 }}>
            <IconoAdvertencia size={14} color={T.warning} />
            <span style={{ fontSize: 12, fontWeight: 500, color: T.warning }}>Esta franja se solapa con otra cita</span>
          </div>
        )}

        {resuelta ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2,
            fontSize: 12.5, fontWeight: 700,
            color: accionEstado === 'aplicada' ? T.success : T.textTertiary,
          }}>
            {accionEstado === 'aplicada' ? 'Aplicada' : 'Cancelada'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onCancelar} disabled={aplicando}
              style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.bgPanel, color: T.textSecondary, fontSize: 13.5, fontWeight: 600, cursor: aplicando ? 'default' : 'pointer', opacity: aplicando ? 0.6 : 1 }}>
              Cancelar
            </button>
            <button onClick={onConfirmar} disabled={aplicando}
              style={{ flex: 2, padding: '9px 0', borderRadius: 10, border: 'none', background: FIRE, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: aplicando ? 'default' : 'pointer', opacity: aplicando ? 0.7 : 1, boxShadow: '0 6px 18px rgba(192,38,10,0.22)' }}>
              {aplicando ? 'Aplicando...' : 'Confirmar'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Tipo no reconocido (respuesta de una version futura del edge): no romper.
  return null;
}

export default BloqueRenderer;
