// Renderer unico de los bloques tipados de Chispa (web).
// bloque.tipo -> componente. Un solo sitio donde se decide como se pinta cada
// tipo; anadir un tipo nuevo (grafica, listas...) = anadir un caso aqui y en
// lib/chispaBloques.ts, sin tocar el panel ni el edge.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { Bloque, ChispaUnidad, CampoFormulario } from '@/lib/chispaBloques';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { LineChartMini } from '@/components/charts/LineChartMini.web';
import { STextInput, SSelect, NumberInput, TimeInput } from '@/components/ui/SettingsAtoms';

const FIRE = 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)';

// Convierte markdown ligero (bold, newlines, bullets) a HTML con animacion
// de entrada word-by-word para que el texto se sienta dinamico.
function renderChispaMarkdown(raw: string): string {
  let wordIdx = 0;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const animWord = (w: string) => {
    const delay = Math.min(wordIdx * 25, 800); // cap at 0.8s
    wordIdx++;
    return `<span class="chispa-typewriter-word" style="animation-delay:${delay}ms">${w}</span> `;
  };

  // Process line by line
  const lines = raw.split('\n');
  const html: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { html.push('<br/>'); continue; }

    // Bullet point
    const isBullet = trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ');
    let processed = esc(isBullet ? trimmed.slice(2) : trimmed);

    // Bold: **text** -> <strong>text</strong>
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text* -> <em>text</em>
    processed = processed.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    // Code: `text` -> <code>text</code>
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Wrap each "word" (split by spaces) in animated span
    const words = processed.split(/(\s+|<[^>]+>)/g);
    let animated = '';
    let insideTag = false;
    for (const part of words) {
      if (part.startsWith('<') && !part.startsWith('<span')) {
        animated += part;
        insideTag = part.startsWith('<') && !part.endsWith('>');
      } else if (insideTag) {
        animated += part;
        if (part.endsWith('>')) insideTag = false;
      } else if (part.trim()) {
        animated += animWord(part);
      } else {
        animated += part;
      }
    }

    if (isBullet) {
      html.push(`<div style="display:flex;gap:6px;align-items:baseline;margin:2px 0"><span style="color:#f4501e;font-weight:700;flex-shrink:0">•</span><span>${animated}</span></div>`);
    } else {
      html.push(`<div style="margin:1px 0">${animated}</div>`);
    }
  }

  return html.join('');
}

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
  // Solo para bloques 'formulario'/'opciones' (Sesion 1): mapa blockId -> payload
  // ya enviado (el panel lo guarda por toda la conversacion) + callback de envio.
  respuestasInteractivas?: Record<string, unknown>;
  onRespuestaInteractiva?: (bloque: Bloque, payload: unknown) => void;
  // true cuando el panel esta en pantalla completa (desktop): da mas aire a los
  // formularios (grid de 2 columnas en vez de 1).
  anchoAmplio?: boolean;
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

// Lista de citas afectadas por una accion batch (confirmar_citas u optimizar_agenda). Vacia si no aplica.
function citasAfectadas(accion: unknown): { id: string; label: string }[] {
  if (!accion || typeof accion !== 'object') return [];
  if ('citas' in accion) {
    const c = (accion as { citas?: unknown }).citas;
    return Array.isArray(c) ? (c as { id: string; label: string }[]) : [];
  }
  if ('movimientos' in accion) {
    const m = (accion as { movimientos?: any[] }).movimientos;
    if (Array.isArray(m)) {
      return m.map((mov) => {
        try {
          const t1 = new Date(mov.nuevo_inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          const t2 = new Date(mov.nuevo_fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          return { id: mov.cita_id, label: `${mov.cliente_nombre}: ${t1} - ${t2}` };
        } catch {
          return { id: mov.cita_id, label: mov.cliente_nombre };
        }
      });
    }
  }
  return [];
}

// --- Control de un campo de 'formulario', segun su tipo. Se envuelve en un
// <label> nativo (no id/htmlFor) para que la etiqueta sea accesible sin tener
// que anadir props de id a los atomos de SettingsAtoms. ---
function CampoControl({ campo, valor, disabled, onChange }: {
  campo: CampoFormulario;
  valor: string | number | undefined;
  disabled?: boolean;
  onChange: (v: string | number) => void;
}) {
  if (campo.tipo === 'select') {
    return (
      <SSelect
        value={valor ?? ''}
        onChange={onChange}
        options={(campo.opciones ?? []).map((o) => ({ value: o.valor, label: o.label }))}
        disabled={disabled}
        width="100%"
      />
    );
  }
  if (campo.tipo === 'hora') {
    return <TimeInput value={String(valor ?? '')} onChange={onChange} disabled={disabled} />;
  }
  if (campo.tipo === 'fecha') {
    return <STextInput value={String(valor ?? '')} onChange={onChange} disabled={disabled} mono placeholder="AAAA-MM-DD" width="100%" />;
  }
  if (campo.tipo === 'numero' || campo.tipo === 'euro') {
    return (
      <NumberInput
        value={valor ?? ''}
        onChange={onChange}
        unit={campo.tipo === 'euro' ? '€' : undefined}
        step={campo.tipo === 'euro' ? 0.5 : 1}
        disabled={disabled}
      />
    );
  }
  return (
    <STextInput
      value={String(valor ?? '')}
      onChange={onChange}
      disabled={disabled}
      type={campo.tipo === 'tel' ? 'tel' : 'text'}
      width="100%"
    />
  );
}

// --- BLOQUE 'formulario': recoge varios campos a la vez (en vez de un
// interrogatorio de texto turno a turno) y los manda como un unico payload. ---
function BloqueFormulario({ bloque, respondido, anchoAmplio, onEnviar }: {
  bloque: Extract<Bloque, { tipo: 'formulario' }>;
  respondido?: Record<string, string | number>;
  anchoAmplio?: boolean;
  onEnviar: (valores: Record<string, string | number>) => void;
}) {
  const [valores, setValores] = useState<Record<string, string | number>>(() =>
    Object.fromEntries(bloque.campos.map((c) => [c.key, c.valor ?? ''])),
  );
  const enviado = !!respondido;
  const datos = respondido ?? valores;
  const faltaRequerido = !enviado && bloque.campos.some(
    (c) => c.requerido && (valores[c.key] === '' || valores[c.key] == null),
  );

  return (
    <div style={{ background: T.bgCard, border: `1.5px solid ${T.borderHi}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>{bloque.titulo}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: anchoAmplio ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr',
        gap: 12, marginBottom: enviado ? 4 : 14,
      }}>
        {bloque.campos.map((campo) => (
          <label key={campo.key} style={{ display: 'block', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: T.textSecondary, marginBottom: 5 }}>
              {campo.label}{campo.requerido && !enviado ? ' *' : ''}
            </span>
            <CampoControl
              campo={campo}
              valor={datos[campo.key]}
              disabled={enviado}
              onChange={(v) => setValores((prev) => ({ ...prev, [campo.key]: v }))}
            />
          </label>
        ))}
      </div>
      {enviado ? (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.success }}>Enviado</div>
      ) : (
        <button
          type="button"
          onClick={() => onEnviar(valores)}
          disabled={faltaRequerido}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
            background: faltaRequerido ? T.bgCardHi : FIRE,
            color: faltaRequerido ? T.textMuted : '#fff',
            fontSize: 13.5, fontWeight: 700, cursor: faltaRequerido ? 'not-allowed' : 'pointer',
            boxShadow: faltaRequerido ? 'none' : '0 6px 18px rgba(192,38,10,0.22)',
          }}
        >
          {bloque.enviarLabel || 'Enviar'}
        </button>
      )}
    </div>
  );
}

// --- BLOQUE 'opciones': chips seleccionables. Selección simple envía al
// instante (funciona como una respuesta rápida); selección múltiple pide
// confirmación explícita. ---
function BloqueOpciones({ bloque, respondido, onEnviar }: {
  bloque: Extract<Bloque, { tipo: 'opciones' }>;
  respondido?: string[];
  onEnviar: (seleccion: string[]) => void;
}) {
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const enviado = !!respondido;
  const activos = respondido ?? seleccion;

  function toggle(valor: string) {
    if (enviado) return;
    if (bloque.multiple) {
      setSeleccion((prev) => (prev.includes(valor) ? prev.filter((v) => v !== valor) : [...prev, valor]));
    } else {
      onEnviar([valor]);
    }
  }

  return (
    <div style={{ background: T.bgCard, border: `1.5px solid ${T.borderHi}`, borderRadius: 14, padding: '12px 14px' }}>
      {bloque.titulo && <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>{bloque.titulo}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: bloque.multiple && !enviado ? 12 : 0 }}>
        {bloque.opciones.map((o) => {
          const activo = activos.includes(o.valor);
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => toggle(o.valor)}
              disabled={enviado}
              aria-pressed={activo}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                border: `1.5px solid ${activo ? T.primary : T.border}`,
                background: activo ? T.primarySoft : T.bgPanel,
                cursor: enviado ? 'default' : 'pointer',
                opacity: enviado && !activo ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: activo ? T.primaryHi : T.text }}>{o.label}</div>
              {o.descripcion && <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 2 }}>{o.descripcion}</div>}
            </button>
          );
        })}
      </div>
      {bloque.multiple && !enviado && (
        <button
          type="button"
          onClick={() => onEnviar(seleccion)}
          disabled={seleccion.length === 0}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 10, border: 'none',
            background: seleccion.length === 0 ? T.bgCardHi : FIRE,
            color: seleccion.length === 0 ? T.textMuted : '#fff',
            fontSize: 13, fontWeight: 700, cursor: seleccion.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Confirmar selección
        </button>
      )}
      {enviado && (
        <div style={{ marginTop: bloque.multiple ? 10 : 0, fontSize: 12.5, fontWeight: 700, color: T.success }}>Enviado</div>
      )}
    </div>
  );
}

export function BloqueRenderer({ bloque, accionEstado = 'pendiente', onConfirmar, onCancelar, anchoAmplio, respuestasInteractivas, onRespuestaInteractiva }: BloqueRendererProps) {
  const router = useRouter();

// --- TEXTO: burbuja del asistente con markdown ligero y typewriter ---
  if (bloque.tipo === 'texto') {
    return (
      <div
        className="chispa-text-bubble"
        style={{
          padding: '9px 12px',
          borderRadius: '14px 14px 14px 4px',
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          fontSize: 13.5, fontWeight: 400, color: T.text,
          lineHeight: 1.55, wordBreak: 'break-word',
        }}
        dangerouslySetInnerHTML={{ __html: renderChispaMarkdown(bloque.texto) }}
      />
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

  // --- FORMULARIO: recoge varios campos a la vez (Sesion 1) ---
  if (bloque.tipo === 'formulario') {
    const respondido = respuestasInteractivas && bloque.id in respuestasInteractivas
      ? (respuestasInteractivas[bloque.id] as Record<string, string | number>)
      : undefined;
    return (
      <BloqueFormulario
        bloque={bloque}
        respondido={respondido}
        anchoAmplio={anchoAmplio}
        onEnviar={(valores) => onRespuestaInteractiva?.(bloque, valores)}
      />
    );
  }

  // --- OPCIONES: chips seleccionables (Sesion 1) ---
  if (bloque.tipo === 'opciones') {
    const respondido = respuestasInteractivas && bloque.id in respuestasInteractivas
      ? (respuestasInteractivas[bloque.id] as string[])
      : undefined;
    return (
      <BloqueOpciones
        bloque={bloque}
        respondido={respondido}
        onEnviar={(seleccion) => onRespuestaInteractiva?.(bloque, seleccion)}
      />
    );
  }

  // --- PROGRESO: indicador de paso X de Y (no interactivo) ---
  if (bloque.tipo === 'progreso') {
    const pct = bloque.total > 0 ? Math.min(100, Math.round((bloque.paso / bloque.total) * 100)) : 0;
    return (
      <div style={{ padding: '2px 2px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary }}>
            {bloque.etiqueta ?? `Paso ${bloque.paso} de ${bloque.total}`}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: T.bgCardHi, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', background: FIRE, borderRadius: 999,
            transition: 'width 0.3s cubic-bezier(0.16,1,0.3,1)',
          }} />
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
