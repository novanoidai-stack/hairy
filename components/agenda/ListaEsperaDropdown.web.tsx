import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { DESIGN_TOKENS as TOKENS } from "@/lib/designTokens";
import { useResponsive } from "@/lib/hooks/useResponsive";

interface ListaItem {
  id: string;
  cliente_id: string | null;
  nombre: string | null;
  telefono: string | null;
  franja: string;
  nota: string | null;
  created_at: string;
}

const Icon = ({ name, size = 16, color = TOKENS.text }: any) => {
  const paths: any = {
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  };
  return (
    <span
      style={{ display: "inline-flex", color, flexShrink: 0 }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`,
      }}
    />
  );
};

export function ListaEsperaDropdown({ negocioId }: { negocioId: string }) {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ListaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && negocioId) {
      setLoading(true);
      supabase
        .from("lista_espera")
        .select("id, cliente_id, nombre, telefono, franja, nota, created_at")
        .eq("negocio_id", negocioId)
        .eq("estado", "esperando")
        .order("prioridad", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(5)
        .then(({ data }) => {
          if (data) setItems(data);
          setLoading(false);
        });
    }
  }, [open, negocioId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        title="Lista de espera"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          background: open ? TOKENS.primarySoft : TOKENS.bgCard,
          border: `1px solid ${open ? TOKENS.primary + "40" : TOKENS.border}`,
          borderRadius: 10,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: open ? TOKENS.primaryHi : TOKENS.textSec,
          whiteSpace: "nowrap",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.borderColor = TOKENS.primary;
            e.currentTarget.style.color = TOKENS.primaryHi;
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.borderColor = TOKENS.border;
            e.currentTarget.style.color = TOKENS.textSec;
          }
        }}
      >
        <Icon name="clock" size={14} color="currentColor" />
        {isMobile ? "Espera" : "Lista de espera"}
        {items.length > 0 && !open && (
          <span style={{
            background: TOKENS.primary,
            color: "#fff",
            borderRadius: 999,
            padding: "2px 6px",
            fontSize: 10,
            fontWeight: 800,
            marginLeft: 4
          }}>
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 8,
            width: 320,
            background: TOKENS.bgCard,
            border: `1px solid ${TOKENS.borderHi}`,
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(0,0,0,0.15)",
            zIndex: 300,
            overflow: "hidden",
            animation: "fadeIn 0.15s ease",
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${TOKENS.border}`, background: TOKENS.bg }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TOKENS.text }}>En espera ahora</h3>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: TOKENS.textSec }}>Próximos 5 clientes esperando hueco</p>
          </div>

          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: TOKENS.textSec, fontSize: 12 }}>Cargando...</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: TOKENS.textSec, fontSize: 12 }}>
                La lista de espera está vacía.
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${TOKENS.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Icon name="user" size={14} color={TOKENS.textSec} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>
                      {item.nombre || "Cliente Anónimo"}
                    </span>
                  </div>
                  {(item.nota || item.franja) && (
                    <div style={{ fontSize: 11, color: TOKENS.textSec, paddingLeft: 22 }}>
                      {item.franja !== "cualquiera" && <span style={{ fontWeight: 600, color: TOKENS.text }}>{item.franja === "manana" ? "Mañanas" : "Tardes"}</span>}
                      {item.franja !== "cualquiera" && item.nota && " · "}
                      {item.nota}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div
            onClick={() => {
              setOpen(false);
              router.push("/(tabs)/lista-espera" as never);
            }}
            style={{
              padding: "12px 16px",
              background: TOKENS.primarySoft,
              color: TOKENS.primaryHi,
              fontSize: 12,
              fontWeight: 700,
              textAlign: "center",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "background 0.2s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = `${TOKENS.primary}30`}
            onMouseLeave={(e) => e.currentTarget.style.background = TOKENS.primarySoft}
          >
            Ver lista completa
            <Icon name="chevronRight" size={14} color={TOKENS.primaryHi} />
          </div>
        </div>
      )}
    </div>
  );
}
