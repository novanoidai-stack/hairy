import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
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

const ANCHO_PANEL = 320;
const MARGEN = 8;

export function ListaEsperaDropdown({ negocioId }: { negocioId: string }) {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ListaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Posicion del panel en coordenadas de VIEWPORT (el panel vive en un portal a
  // <body>, no dentro de la cabecera).
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // El panel se saca del arbol de la cabecera y se ancla al viewport. Antes era
  // un position:absolute dentro de la barra de titulo (z-index 60) y la cabecera
  // pegajosa de la agenda (z-index 100) le pasaba por encima: en escritorio se
  // comia la mitad de arriba del panel y en movil, ademas, los 320 px se salian
  // por la derecha de la pantalla.
  const medir = useCallback(() => {
    const b = botonRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = isMobile ? Math.min(ANCHO_PANEL, vw - MARGEN * 2) : ANCHO_PANEL;
    // Pegado al boton, pero sin salirse por ningun borde.
    const left = Math.max(MARGEN, Math.min(r.left, vw - width - MARGEN));
    setPos({ top: r.bottom + 8, left, width });
  }, [isMobile]);

  useEffect(() => {
    if (!open) return;
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [open, medir]);

  const fetchListaEspera = useCallback(() => {
    if (!negocioId) return;
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
      })
      .catch(() => setLoading(false));
  }, [negocioId]);

  // Cargar recuento e items al montar y cuando cambie negocioId
  useEffect(() => {
    fetchListaEspera();
  }, [fetchListaEspera]);

  useEffect(() => {
    if (open) fetchListaEspera();
  }, [open, fetchListaEspera]);

  // Escuchar eventos para actualizar en tiempo real
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("mecha_calendar_refresh", fetchListaEspera);
    window.addEventListener("mecha_lista_espera_updated", fetchListaEspera);
    return () => {
      window.removeEventListener("mecha_calendar_refresh", fetchListaEspera);
      window.removeEventListener("mecha_lista_espera_updated", fetchListaEspera);
    };
  }, [fetchListaEspera]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      // El panel ya no es hijo del wrapper (portal): hay que mirar los dos.
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const panel = open && pos && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Lista de espera"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: `calc(100vh - ${pos.top + MARGEN}px)`,
            display: "flex",
            flexDirection: "column",
            background: TOKENS.bgCard,
            border: `1px solid ${TOKENS.borderHi}`,
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
            zIndex: 99999,
            overflow: "hidden",
            animation: "fadeIn 0.15s ease",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${TOKENS.border}`,
              background: TOKENS.bg,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TOKENS.text }}>En espera ahora</h3>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: TOKENS.textSec }}>Próximos 5 clientes esperando hueco</p>
            </div>
            {/* En movil no hay "clic fuera" comodo: la cruz cierra sin rodeos. */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar la lista de espera"
              style={{
                background: "none",
                border: "none",
                padding: 4,
                margin: -4,
                cursor: "pointer",
                color: TOKENS.textSec,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="x" size={16} color="currentColor" />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
                    <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              flexShrink: 0,
              transition: "background 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = `${TOKENS.primary}30`)}
            onMouseLeave={(e) => (e.currentTarget.style.background = TOKENS.primarySoft)}
          >
            Ver lista completa
            <Icon name="chevronRight" size={14} color={TOKENS.primaryHi} />
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div style={{ position: "relative" }} ref={wrapRef}>
      <button
        ref={botonRef}
        className="m-control"
        onClick={() => setOpen(!open)}
        title="Lista de espera"
        aria-expanded={open}
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

      {panel}
    </div>
  );
}
