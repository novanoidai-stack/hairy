// Piezas visuales sueltas de la agenda.
//
// Salen de AgendaCalendar.web.tsx, donde vivian mezcladas con la logica del
// calendario. Son componentes de presentacion puros: reciben props, pintan y no
// saben nada de citas, de solapes ni de fases. Por eso son lo primero que se
// extrae -- moverlas no puede cambiar ningun comportamiento -- y ademas son
// requisito para poder sacar despues los modales, que las usan.
//
// MUDANZA, NO REESCRITURA: el cuerpo de cada una es identico al que tenian.
import { useEffect, useRef, useState } from "react";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";

export function FormulaInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: any;
}) {
  const Tag: any = multiline ? "textarea" : "input";
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.8,
          color: TOKENS.textSec,
          fontWeight: 600,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <Tag
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 2 : undefined}
        inputMode={inputMode}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          background: TOKENS.bgCard,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 8,
          color: TOKENS.text,
          fontSize: 12,
          fontFamily: "inherit",
          outline: "none",
          resize: multiline ? "vertical" : "none",
          minHeight: multiline ? 50 : "auto",
        }}
      />
    </div>
  );
}

export function Label({ children }: any) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: 1.2,
        color: TOKENS.textTer,
        textTransform: "uppercase",
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

export function SearchDropdown({
  open,
  setOpen,
  q,
  setQ,
  placeholder,
  trigger,
  children,
}: any) {
  const [localQ, setLocalQ] = useState(q || "");
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    setLocalQ(q || "");
  }, [q]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (val: string) => {
    setLocalQ(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setQ(val);
    }, 150);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="m-control"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderRadius: 10,
          background: TOKENS.bgCard,
          border: `1px solid ${open ? "rgba(244,80,30,0.40)" : TOKENS.border}`,
          cursor: "pointer",
          textAlign: "left",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{trigger}</div>
        <span
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <IconChevronDown />
        </span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 30,
            background: TOKENS.bgPanel,
            border: `1px solid ${TOKENS.borderHi}`,
            borderRadius: 12,
            boxShadow: "0 16px 50px rgba(0,0,0,0.55)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderBottom: `1px solid ${TOKENS.border}`,
              background: TOKENS.bgCard,
            }}
          >
            <span
              style={{
                color: TOKENS.textTer,
                display: "flex",
                alignItems: "center",
              }}
            >
              <IconSearch />
            </span>
            <input
              autoFocus
              value={localQ}
              onChange={(e) => handleInputChange(e.currentTarget.value)}
              placeholder={placeholder}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: TOKENS.text,
                fontSize: 12,
                fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", padding: 4 }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ onClick, active, children }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: active ? TOKENS.primarySoft : "transparent",
        border: `1px solid ${active ? "rgba(244,80,30,0.30)" : "transparent"}`,
        cursor: "pointer",
        textAlign: "left",
        marginBottom: 2,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(244,80,30,0.06)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

export function TimeSlider({
  label,
  hint,
  value,
  setValue,
  min,
  max,
  step,
  color,
  chips,
  rango,
}: any) {
  const pct = ((value - min) / (max - min)) * 100;
  const trackRef = useRef<HTMLDivElement>(null);
  // En movil el arrastre con el dedo se trababa: el navegador interpretaba el gesto
  // como scroll y cancelaba el puntero. Con touchAction 'none' + captura de puntero
  // + un flag de arrastre propio (e.buttons no es fiable en touch) el control sigue
  // al dedo de forma fluida.
  const dragging = useRef(false);

  const updateFromEvent = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const stepVal = step || 1;
    const rawVal = ratio * (max - min) + min;
    const newVal = Math.round((rawVal - min) / stepVal) * stepVal + min;
    setValue(Math.max(min, Math.min(max, newVal)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    try {
      trackRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    updateFromEvent(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    updateFromEvent(e.clientX);
  };

  const endDrag = (e: React.PointerEvent) => {
    dragging.current = false;
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Label>{label}</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setValue(Math.max(min, value - step))}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            −
          </button>
          <div
            style={{
              minWidth: 64,
              textAlign: "center",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: 3,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color }}>
              {value}
            </span>
            <span
              style={{ fontSize: 11, fontWeight: 500, color: TOKENS.textSec }}
            >
              min
            </span>
          </div>
          <button
            onClick={() => setValue(Math.min(max, value + step))}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            +
          </button>
        </div>
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: TOKENS.textSec,
            marginTop: -3,
            marginBottom: 8,
            fontWeight: 400,
          }}
        >
          {hint}
        </div>
      )}

      {/* Horas reales de este tramo (ej. "14:00 – 14:40"): claridad de lo que pasa en la vida real. */}
      {rango && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 8,
            padding: "2px 9px",
            borderRadius: 999,
            background: `${color}12`,
            border: `1px solid ${color}30`,
            fontSize: 11,
            fontWeight: 700,
            color,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15.5 14" />
          </svg>
          {rango}
        </div>
      )}

      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: 16,
          display: "flex",
          alignItems: "center",
          marginBottom: 8,
          userSelect: "none",
          cursor: "grab",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Track de fondo */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 99,
            background: "rgba(148,163,184,0.15)",
            pointerEvents: "none",
          }}
        />
        {/* Track relleno */}
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            height: 4,
            borderRadius: 99,
            background: color,
            pointerEvents: "none",
          }}
        />
        {/* Thumb siempre visible */}
        <div
          style={{
            position: "absolute",
            left: `calc(${pct}% - 8px)`,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 0 4px ${color}33, 0 2px 6px rgba(0,0,0,0.4)`,
            pointerEvents: "none",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 8,
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        {chips.map((m: number) => {
          const isActive = value === m;
          return (
            <button
              key={m}
              onClick={() => setValue(m)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: isActive ? `${color}22` : "rgba(148,163,184,0.06)",
                border: `1px solid ${isActive ? `${color}66` : TOKENS.border}`,
                color: isActive ? color : TOKENS.textSec,
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = color;
                  e.currentTarget.style.background = `${color}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = TOKENS.border;
                  e.currentTarget.style.background = "rgba(148,163,184,0.06)";
                }
              }}
            >
              {m === 0 ? "Sin espera" : `${m}m`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SummaryCell({ label, value, color }: any) {
  return (
    <div
      style={{
        background: "rgba(148,163,184,0.06)",
        borderRadius: 8,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1,
          color: TOKENS.textTer,
          fontWeight: 600,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

export function SequenceBar({
  activo,
  espera,
  activo2,
  primary,
  warning,
  inicioTxt,
  finTxt,
}: any) {
  const total = Math.max(1, activo + espera + activo2);

  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 32,
          borderRadius: 8,
          overflow: "hidden",
          gap: 2,
        }}
      >
        {/* Activo 1 */}
        {activo > 0 && (
          <div
            style={{
              flex: activo / total,
              background: `linear-gradient(180deg, #ff7a2e, #f4501e)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "clip",
              whiteSpace: "nowrap",
            }}
          >
            {(activo / total) * 100 >= 12 ? `${activo}m` : ""}
          </div>
        )}

        {/* Espera */}
        {espera > 0 && (
          <div
            style={{
              flex: espera / total,
              background: `repeating-linear-gradient(45deg, #f59e0b 0 6px, transparent 6px 12px), rgba(245,158,11,0.18)`,
              borderTop: `1px solid rgba(245,158,11,0.4)`,
              borderBottom: `1px solid rgba(245,158,11,0.4)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "clip",
              whiteSpace: "nowrap",
            }}
          >
            {(espera / total) * 100 >= 12 ? `${espera}m` : ""}
          </div>
        )}

        {/* Activo 2 */}
        {activo2 > 0 && (
          <div
            style={{
              flex: activo2 / total,
              background: `linear-gradient(180deg, #ff7a2e, #f4501e)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "clip",
              whiteSpace: "nowrap",
            }}
          >
            {(activo2 / total) * 100 >= 12 ? `${activo2}m` : ""}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 9.5,
          color: TOKENS.textTer,
          fontWeight: 700,
          letterSpacing: 0.4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{inicioTxt || "0 min"}</span>
        <span>Total · {total} min</span>
        <span>{finTxt || ""}</span>
      </div>
    </div>
  );
}

export function Avatar({ name, size }: any) {
  const getInitials = (n: string) => {
    return n
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const hash =
    name?.split("").reduce((h: any, c: any) => h + c.charCodeAt(0), 0) || 0;
  const colors = [
    "#f4501e",
    "#c0260a",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
  ];
  const color = colors[hash % colors.length];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: Math.max(10, size / 3),
        fontWeight: 700,
        color: color,
      }}
    >
      {getInitials(name || "?")}
    </div>
  );
}

export function Pill({ children, color, soft }: any) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: soft,
        border: `1px solid ${color}55`,
        color: color,
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: 999, background: color }}
      />
      {children}
    </span>
  );
}

export const IconCalendar = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export const IconClock = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

export const IconTrash = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const IconSearch = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

export const IconCheck = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const IconClose = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const IconChevronDown = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Normalizar texto: quitar tildes y minusculas, para buscar sin que estorben
// los acentos.
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const CATEGORY_ICONS: Record<
  string,
  (color: string, size?: number) => React.ReactNode
> = {
  general: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  scissors: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="9.8" y1="8.2" x2="21" y2="19" />
      <line x1="9.8" y1="15.8" x2="21" y2="5" />
    </svg>
  ),
  brush: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 11-8-8H6v4l8 8Z" />
      <path d="m6 7 1-1" />
      <path d="m9 10 1-1" />
      <path d="m14 15 4 4a2 2 0 0 0 2.8-2.8l-4-4Z" />
    </svg>
  ),
  droplet: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z" />
    </svg>
  ),
  sparkles: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
  razor: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7h18M6 7V3h12v4M12 7v14M9 21h6" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  ),
  spa: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 12c2 0 4-1 5-3a6 6 0 0 0-10 0c1 2 3 3 5 3Z" />
      <path d="M12 12c-2 0-4 1-5 3a6 6 0 0 0 10 0c-1-2-3-3-5-3Z" />
      <path d="M12 2a15 15 0 0 0-3 10 15 15 0 0 0 3 10 15 15 0 0 0 3-10A15 15 0 0 0 12 2Z" />
    </svg>
  ),
  star: (color, size = 14) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
};

export function getCategoryIcon(icono: string, color: string, size = 14) {
  const iconFn = CATEGORY_ICONS[icono || "general"];
  if (iconFn) return iconFn(color, size);
  return CATEGORY_ICONS.general(color, size);
}
