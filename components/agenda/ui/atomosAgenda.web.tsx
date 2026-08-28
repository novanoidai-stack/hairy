// Atomos de la cabecera de la agenda: la tarjeta de metrica, la fila de
// profesional del panel lateral y la pestana de vista.
//
// Salen de AgendaCalendar.web.tsx (Fase 5, paso 1). Son hojas del arbol: solo
// reciben props y pintan, no conocen citas ni fases ni solapes, y no usan
// estado. Por eso van primero -- moverlas no puede cambiar comportamiento.
//
// No confundir con ui/atomos.web.tsx, que son las piezas compartidas por los
// modales (inputs, dropdowns, iconos). Estas tres solo las usa la agenda.
//
// MUDANZA, NO REESCRITURA: el cuerpo de cada una es identico al que tenian.
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";

export function StatCard({ label, value, sub, tone, progress, onClick }: any) {
  return (
    <div
      onClick={onClick}
      style={{
        background: TOKENS.bgCard,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 14,
        padding: 14,
        position: "relative",
        overflow: "hidden",
        transition: "all 0.3s ease",
        transform: "scale(1)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = TOKENS.borderHi;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.borderColor = TOKENS.border;
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          color: TOKENS.textTer,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: TOKENS.text,
          marginTop: 4,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: TOKENS.textSec, marginTop: 2 }}>
        {sub}
      </div>
      {progress != null && (
        <div
          style={{
            marginTop: 8,
            height: 3,
            borderRadius: 99,
            background: "rgba(148,163,184,0.12)",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              borderRadius: 99,
              background: tone,
            }}
          />
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 6,
          height: 6,
          borderRadius: 999,
          background: tone,
          boxShadow: `0 0 10px ${tone}`,
        }}
      />
    </div>
  );
}

export function ProfRow({
  id,
  name,
  role,
  color,
  count,
  selected,
  onSel,
  reposoUtil,
  onRetraso,
}: any) {
  return (
    <button
      onClick={onSel}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: selected ? "rgba(244,80,30,0.10)" : "transparent",
        border: `1px solid ${selected ? "rgba(244,80,30,0.25)" : "transparent"}`,
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.2s ease",
        transform: "translateX(0)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = selected
          ? "rgba(244,80,30,0.15)"
          : "rgba(244,80,30,0.05)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = selected
          ? "rgba(244,80,30,0.10)"
          : "transparent";
        e.currentTarget.style.transform = "translateX(0)";
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.06)`,
        }}
      >
        {id === "todos" ? (
          <svg width="13" height="13" viewBox="0 0 12 12" fill="#fff">
            <rect x="0" y="0" width="5" height="5" rx="1" />
            <rect x="7" y="0" width="5" height="5" rx="1" />
            <rect x="0" y="7" width="5" height="5" rx="1" />
            <rect x="7" y="7" width="5" height="5" rx="1" />
          </svg>
        ) : (
          name
            .split(" ")
            .map((n: string) => n[0])
            .slice(0, 2)
            .join("")
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: selected ? TOKENS.text : TOKENS.textSec,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        {role && (
          <div style={{ fontSize: 11, color: TOKENS.textTer }}>{role}</div>
        )}
        {reposoUtil && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: "rgba(245,158,11,0.15)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.round((reposoUtil.usedMin / reposoUtil.totalMin) * 100)}%`,
                  height: "100%",
                  borderRadius: 2,
                  background: "#f59e0b",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 9,
                color: "#f59e0b",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {Math.round((reposoUtil.usedMin / reposoUtil.totalMin) * 100)}%
            </span>
          </div>
        )}
      </div>
      {onRetraso && (
        <div
          title="Profesional llega tarde"
          onClick={(e) => {
            e.stopPropagation();
            onRetraso();
          }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            background: "transparent",
            transition: "background 0.15s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(245,158,11,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: TOKENS.textSec,
          padding: "2px 7px",
          borderRadius: 6,
          background: "rgba(148,163,184,0.10)",
        }}
      >
        {count}
      </div>
    </button>
  );
}

export function ViewTab({ children, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        fontSize: 12,
        fontWeight: 600,
        background: active ? TOKENS.bgCard : "transparent",
        border: `1px solid ${active ? TOKENS.borderHi : TOKENS.border}`,
        borderRadius: 8,
        color: active ? TOKENS.text : TOKENS.textSec,
        cursor: "pointer",
        transition: "all 0.2s ease",
        transform: "scale(1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.borderColor = TOKENS.primary;
        if (!active) {
          e.currentTarget.style.background = "rgba(244,80,30,0.05)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.borderColor = active
          ? TOKENS.borderHi
          : TOKENS.border;
        e.currentTarget.style.background = active
          ? TOKENS.bgCard
          : "transparent";
      }}
    >
      {children}
    </button>
  );
}
