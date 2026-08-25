import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getUserProfile } from "@/lib/auth";
import { withClientDataGate } from "@/components/PrivacyGateOverlay";
import { format, parseISO, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { mensajeDeError } from "@/lib/errores";
import { reportarError } from "@/lib/reportarError";
import { ingresosRealesCents, propinasCents } from "@/lib/metricasNegocio";
import { useResponsive } from "@/lib/hooks/useResponsive";
import { CobroSheet } from "@/components/pos/CobroSheet";
import { SesionCajaPanel } from "@/components/pos/SesionCajaPanel.web";
import { VentaBonoModal } from "@/components/pos/VentaBonoModal";
import { VentaTarjetaRegaloModal } from "@/components/pos/VentaTarjetaRegaloModal";
import { categoryColorHex } from "@/lib/categoryColors";
import { usePaginaManualVista } from "@/lib/hooks/usePaginaManualVista";
import { manualCaja } from "@/lib/manuals/caja";
import { AvisoPrimeraVisita } from "@/components/manuals/AvisoPrimeraVisita.web";
import { ManualPanel } from "@/components/manuals/ManualPanel.web";
import { AvisosBell } from "@/components/avisos/AvisosBell";
import { useAyudaIA } from "@/lib/hooks/useAyudaIA";
import { TarjetaAyudaIA } from "@/components/chispa/TarjetaAyudaIA.web";
import { elegirCandidatoUpsell } from "@/lib/upsellCandidato";

// ─────────────────────────────────────────────────────────────────────────────────
// Tokens (consistente con el resto de .web.tsx)
// ─────────────────────────────────────────────────────────────────────────────────
const T = {
  bg: "#f6f1ea",
  panel: "#fffdfb",
  card: "#ffffff",
  cardHi: "#fbf6f0",
  border: "rgba(40,30,24,0.10)",
  borderHi: "rgba(40,30,24,0.16)",
  text: "#1c1814",
  textSec: "#5c5249",
  textTer: "#736658",
  primary: "#f4501e",
  primaryHi: "#c0260a",
  primarySoft: "rgba(244,80,30,0.10)",
  success: "#0f9d6b",
  successSoft: "rgba(15,157,107,0.12)",
  warning: "#e08a00",
  warningSoft: "rgba(224,138,0,0.14)",
  danger: "#e23b34",
  dangerSoft: "rgba(226,59,52,0.12)",
};

const ANIM = `
  @keyframes caFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes caUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  .ca-row { animation: caUp 0.35s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.15s ease; }
  .ca-row:hover { background: rgba(244,80,30,0.06) !important; }
  .ca-row.selected { background: ${T.primarySoft} !important; border-color: ${T.primary} !important; }
  .ca-btn { transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
  .ca-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.04); box-shadow: 0 4px 14px rgba(40,30,24,0.12); }
  .ca-btn:active:not(:disabled) { transform: translateY(0) scale(0.97); opacity: 0.9; transition-duration: 0.08s; }
  .ca-modal-overlay { animation: caFade 0.2s ease; }
  .ca-modal { animation: caUp 0.3s cubic-bezier(0.16,1,0.3,1) both; }
`;

function Icon({
  name,
  size = 18,
  color = T.text,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const paths: Record<string, string> = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    wallet:
      '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4z"/>',
    credit:
      '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    cash: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clock:
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    scisors:
      '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="6" r="1"/><path d="M20.2 19.2L13 12"/><path d="M18 4l4 4-8.8 8.8a4 4 0 0 1-2.8 1.2H4l1.8-1.8a4 4 0 0 1 1.2-2.8L18 4z"/>',
    alert:
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  };
  return (
    <span
      style={{ display: "inline-flex", color, flexShrink: 0 }}
      dangerouslySetInnerHTML={{
        __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────────
interface CitaPendiente {
  id: string;
  fecha: string;
  hora_inicio: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  profesional_nombre: string | null;
  servicio_nombre: string | null;
  servicio_precio: number | null;
  categoria_color: string | null;
  sena_pagada: number; // señal ya pagada
  total_pendiente: number; // lo que falta cobrar
  grupo_id: string | null;
  orden_en_grupo: number | null;
}

// Registros descargables (CSV) — como el modo gestor de novanoidai.
function toCSV(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? "");
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(";"),
    )
    .join("\r\n");
}
function downloadCSV(filename: string, rows: (string | number)[][]) {
  // BOM para que Excel respete los acentos.
  const blob = new Blob(["﻿" + toCSV(rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Cobros pendientes puede listar citas de hoy y de días anteriores no cobrados
// en la misma lista: mostrar solo la hora hacía imposible saber a qué día
// pertenecía cada una.
function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  const d = parseISO(iso);
  const hora = format(d, "HH:mm", { locale: es });
  return isToday(d) ? hora : `${format(d, "d MMM", { locale: es })} · ${hora}`;
}

// ─────────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────────
function CajaScreen() {
  const { isMobile } = useResponsive();
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista("caja");
  const [citas, setCitas] = useState<CitaPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Conceptos (grupos por cliente) desplegados para cobrar servicios por separado.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCobroModal, setShowCobroModal] = useState(false);
  const [showWalkin, setShowWalkin] = useState(false);
  // Productos a adjuntar al cobro de citas (ticket unificado cita + productos).
  // Se rellena desde el modal "Venta rápida" cuando hay citas seleccionadas.
  const [lineasExtraCobro, setLineasExtraCobro] = useState<
    Array<{ nombre: string; precio: string; cantidad: string; ref_id?: string }>
  >([]);
  // Productos consumidos en las citas seleccionadas (tabla cita_productos).
  // Se cargan al abrir el cobro y entran como líneas iniciales del ticket,
  // para que su precio se cobre junto al servicio.
  const [lineasProductosCita, setLineasProductosCita] = useState<
    Array<{ nombre: string; precio: string; cantidad: string; ref_id?: string }>
  >([]);
  // Presupuestos aceptados pendientes de cobro (se cobran con el mismo motor).
  type PresupuestoCobrable = {
    id: string;
    numero: number | null;
    contacto_nombre: string | null;
    total_cents: number;
  };
  const [presupuestosCobrables, setPresupuestosCobrables] = useState<
    PresupuestoCobrable[]
  >([]);
  const [cobroPresupuesto, setCobroPresupuesto] =
    useState<PresupuestoCobrable | null>(null);
  const [mensaje, setMensaje] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  // Arqueo del dia: lo cobrado HOY de verdad (libro de cobros), por metodo.
  const [arqueo, setArqueo] = useState<{
    total: number;
    efectivo: number;
    datafono: number;
    propinas: number;
    count: number;
  } | null>(null);
  // Rol del usuario: propietario/dirección ven TODO el equipo; el resto, lo suyo.
  const [canSeeAll, setCanSeeAll] = useState(false);
  // Cobros del día (filas crudas) para los registros descargables.
  const [cobrosHoy, setCobrosHoy] = useState<Array<any>>([]);
  // Id del cobro que se está reembolsando (spinner del botón).
  const [reembolsando, setReembolsando] = useState<string | null>(null);

  // --- Venta rápida de productos ---
  type ProductoVenta = {
    id: string;
    nombre: string;
    precio_cents: number;
    categoria: string | null;
  };
  type CarritoItem = ProductoVenta & { cantidad: number };
  const [showVentaProductos, setShowVentaProductos] = useState(false);
  const [showVentaBono, setShowVentaBono] = useState(false);
  const [showVentaTarjetaRegalo, setShowVentaTarjetaRegalo] = useState(false);
  const [productosDisponibles, setProductosDisponibles] = useState<
    ProductoVenta[]
  >([]);
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [ventaMetodo, setVentaMetodo] = useState<
    "efectivo" | "datafono" | "bizum"
  >("efectivo");
  const [ventaEnviando, setVentaEnviando] = useState(false);
  // Cliente de la venta suelta (opcional). Sin esto la venta era siempre
  // anonima: no quedaba en la ficha de nadie y en el registro de productos
  // vendidos salia "Cliente desconocido".
  const [ventaClienteId, setVentaClienteId] = useState("");
  const [clientesVenta, setClientesVenta] = useState<
    Array<{ id: string; nombre: string }>
  >([]);
  // Búsqueda + categoría del panel "Venta rápida" (salones con catálogo grande).
  const [ventaBusqueda, setVentaBusqueda] = useState("");
  const [ventaCategoriaFiltro, setVentaCategoriaFiltro] =
    useState<string>("todas");

  // Sesion 6 (V2): Upsell IA proactivo al cobrar. Determinista primero: el
  // candidato (que producto sugerir) lo elige elegirCandidatoUpsell (sin LLM,
  // por categoria del servicio); Chispa solo redacta la frase comercial sobre
  // ESE candidato. Patron "AyudaIA por pagina" (Sesion 4): nunca fallo silencioso.
  const upsellIA = useAyudaIA();

  // Totales de la selección
  const seleccion = useMemo(() => {
    const seleccionadas = citas.filter((c) => selectedIds.has(c.id));
    const totalServicios = seleccionadas.reduce(
      (s, c) => s + (c.servicio_precio || 0),
      0,
    );
    const totalSenas = seleccionadas.reduce((s, c) => s + c.sena_pagada, 0);
    const pendiente = totalServicios - totalSenas;
    // Nombre del cliente si toda la seleccion es del mismo cliente (para el titulo del cobro).
    const clientesUnicos = new Set(
      seleccionadas.map((c) => c.cliente_id ?? `solo:${c.id}`),
    );
    const clienteNombre =
      clientesUnicos.size === 1
        ? (seleccionadas[0]?.cliente_nombre ?? null)
        : null;
    return {
      count: seleccionadas.length,
      totalServicios,
      totalSenas,
      pendiente,
      clienteNombre,
    };
  }, [citas, selectedIds]);

  // Filtros de fecha y búsqueda para Citas Pendientes de Cobro
  const [filtroFechaPendientes, setFiltroFechaPendientes] = useState<
    "todas" | "hoy" | "ayer" | "semana" | "mes" | "rango"
  >("todas");
  const [fechaDesdePendientes, setFechaDesdePendientes] = useState<string>("");
  const [fechaHastaPendientes, setFechaHastaPendientes] = useState<string>("");
  const [busquedaPendientes, setBusquedaPendientes] = useState<string>("");

  // Citas filtradas según el rango de fecha y búsqueda elegidos
  const citasFiltradas = useMemo(() => {
    return citas.filter((c) => {
      // Filtro por fecha
      if (filtroFechaPendientes === "hoy") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const d = new Date(c.hora_inicio);
        if (d < start || d > end) return false;
      } else if (filtroFechaPendientes === "ayer") {
        const start = new Date();
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        const d = new Date(c.hora_inicio);
        if (d < start || d > end) return false;
      } else if (filtroFechaPendientes === "semana") {
        const now = new Date();
        const day = now.getDay() || 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day - 1));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        const d = new Date(c.hora_inicio);
        if (d < monday || d > sunday) return false;
      } else if (filtroFechaPendientes === "mes") {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        const end = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
        const d = new Date(c.hora_inicio);
        if (d < start || d > end) return false;
      } else if (filtroFechaPendientes === "rango") {
        const d = new Date(c.hora_inicio);
        if (fechaDesdePendientes) {
          const start = new Date(fechaDesdePendientes);
          start.setHours(0, 0, 0, 0);
          if (d < start) return false;
        }
        if (fechaHastaPendientes) {
          const end = new Date(fechaHastaPendientes);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
      }

      // Filtro por búsqueda de texto
      if (busquedaPendientes.trim()) {
        const q = busquedaPendientes.toLowerCase().trim();
        const cliMatch = (c.cliente_nombre || "").toLowerCase().includes(q);
        const srvMatch = (c.servicio_nombre || "").toLowerCase().includes(q);
        const profMatch = (c.profesional_nombre || "").toLowerCase().includes(q);
        if (!cliMatch && !srvMatch && !profMatch) return false;
      }

      return true;
    });
  }, [
    citas,
    filtroFechaPendientes,
    fechaDesdePendientes,
    fechaHastaPendientes,
    busquedaPendientes,
  ]);

  // Conceptos: agrupa las citas pendientes por cliente (servicios encadenados de un
  // mismo cliente caen juntos). Sin cliente -> concepto propio (no se agrupan anonimos).
  const conceptos = useMemo(() => {
    const map = new Map<string, CitaPendiente[]>();
    const orden: string[] = [];
    for (const c of citasFiltradas) {
      const key = c.grupo_id
        ? `grupo:${c.grupo_id}`
        : c.cliente_id
          ? `cli:${c.cliente_id}`
          : `solo:${c.id}`;
      if (!map.has(key)) {
        map.set(key, []);
        orden.push(key);
      }
      map.get(key)!.push(c);
    }
    return orden.map((key) => {
      const items = map.get(key)!;
      if (key.startsWith("grupo:")) {
        items.sort((a, b) => (a.orden_en_grupo || 0) - (b.orden_en_grupo || 0));
      } else {
        items.sort(
          (a, b) =>
            new Date(a.hora_inicio).getTime() -
            new Date(b.hora_inicio).getTime(),
        );
      }
      return {
        key,
        cliente_nombre: items[0].cliente_nombre,
        items,
        totalPendiente: items.reduce((s, i) => s + i.total_pendiente, 0),
        totalSenas: items.reduce((s, i) => s + i.sena_pagada, 0),
      };
    });
  }, [citasFiltradas]);

  const contarSeleccionados = (items: CitaPendiente[]) =>
    items.filter((i) => selectedIds.has(i.id)).length;

  const toggleConcepto = (items: CitaPendiente[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const todosSel = items.every((i) => next.has(i.id));
      if (todosSel) items.forEach((i) => next.delete(i.id));
      else items.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Cargar citas pendientes de cobro (hoy)
  const cargarCitas = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).toISOString();
      const tomorrowStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      ).toISOString();

      // Citas pendientes de cobro (hasta hoy y días anteriores no cobrados). El esquema real usa `inicio` (timestamptz),
      // `servicio_id` (no tabla puente) y `pagos.importe_cents`.
      const { data, error } = await supabase
        .from("citas")
        .select(
          `
          id,
          inicio,
          estado,
          cliente_id,
          clientes (nombre),
          profesional_id,
          profesionales (nombre),
          servicio_id,
          servicios (nombre, precio, categorias_servicio (color)),
          pagos (tipo, importe_cents, estado),
          grupo_id,
          orden_en_grupo
        `,
        )
        .eq("negocio_id", profile.negocio_id)
        .eq("cobrada", false)
        // "pendiente" tiene que estar: las citas nacen en ese estado, y sin el
        // una cita recien apuntada no aparecia aqui y no habia forma de cobrarla
        // desde Caja hasta confirmarla a mano.
        .in("estado", ["pendiente", "completada", "finalizada", "confirmada"])
        .order("inicio", { ascending: false });

      if (error) throw error;

      // Importes SIEMPRE en centimos internamente (servicios.precio viene en euros).
      const procesadas: CitaPendiente[] = (data || []).map((cita: any) => {
        const servicio = cita.servicios || {};
        const precioCents = Math.round((servicio.precio || 0) * 100);
        const catRel = servicio.categorias_servicio;
        const catToken = Array.isArray(catRel)
          ? catRel[0]?.color
          : catRel?.color;
        const pagos = cita.pagos || [];
        const sena = pagos
          .filter(
            (p: any) =>
              p.tipo === "senal" &&
              ["completado", "pagado", "succeeded", "paid"].includes(p.estado),
          )
          .reduce((s: number, p: any) => s + (p.importe_cents || 0), 0);

        return {
          id: cita.id,
          fecha: cita.inicio,
          hora_inicio: cita.inicio,
          cliente_id: cita.cliente_id || null,
          cliente_nombre: cita.clientes?.nombre || null,
          profesional_nombre: cita.profesionales?.nombre || null,
          servicio_nombre: servicio.nombre || null,
          servicio_precio: precioCents,
          categoria_color: catToken ? categoryColorHex(catToken) : null,
          sena_pagada: sena,
          total_pendiente: Math.max(0, precioCents - sena),
          grupo_id: cita.grupo_id || null,
          orden_en_grupo: cita.orden_en_grupo || null,
        };
      });

      setCitas(procesadas);

      // Rol: el propietario/dirección ve el equipo entero; el resto, lo suyo.
      // (Los fichajes/jornada viven en "Mi jornada"; Caja ya no los consulta.)
      setCanSeeAll(profile.role === "owner" || profile.role === "admin");

      // Arqueo del dia: lo cobrado HOY de verdad (libro de cobros)
      const { data: cobrosData } = await supabase
        .from("cobros")
        .select(
          "id, cobrado_at, total_cents, efectivo_cents, datafono_cents, propina_cents, metodo, online_cents, cliente_id",
        )
        .eq("negocio_id", profile.negocio_id)
        .eq("estado", "completado")
        .gte("cobrado_at", todayStart)
        .order("cobrado_at", { ascending: false });
      const cr = cobrosData || [];
      setCobrosHoy(cr);
      setArqueo({
        // total = ingresos reales SIN propina (la propina va en su propio campo,
        // para que "Cobrado hoy" no la duplique con la tarjeta "Propinas").
        total: ingresosRealesCents(cr),
        efectivo: cr.reduce(
          (s: number, r: any) => s + (r.efectivo_cents || 0),
          0,
        ),
        datafono: cr.reduce(
          (s: number, r: any) => s + (r.datafono_cents || 0),
          0,
        ),
        propinas: propinasCents(cr),
        count: cr.length,
      });

      // Presupuestos aceptados, aún sin cobrar.
      const { data: presData } = await supabase
        .from("presupuestos")
        .select("id, numero, contacto_nombre, total_cents")
        .eq("negocio_id", profile.negocio_id)
        .eq("estado", "aceptado")
        .is("cobro_id", null)
        .order("created_at", { ascending: true });
      setPresupuestosCobrables((presData || []) as PresupuestoCobrable[]);

      // Cargar productos para Upsell IA (categoria: entrada determinista del candidato)
      const { data: prods } = await supabase
        .from("productos")
        .select("id, nombre, precio_cents, categoria")
        .eq("negocio_id", profile.negocio_id)
        .eq("activo", true)
        .order("nombre");
      if (prods) setProductosDisponibles(prods);

      // Clientes para poder poner nombre a una venta suelta.
      const { data: clis } = await supabase
        .from("clientes")
        .select("id, nombre")
        .eq("negocio_id", profile.negocio_id)
        .order("nombre")
        .limit(500);
      setClientesVenta(clis ?? []);
    } catch (err) {
      console.error("Error cargando citas pendientes:", err);
      reportarError(err, { origen: "app", tipo: "operativo" });
      setMensaje({ type: "error", text: mensajeDeError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarCitas();
  }, [cargarCitas]);

  // Toggle selección
  const toggleSeleccion = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seleccionarTodas = () => {
    if (selectedIds.size === citas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(citas.map((c) => c.id)));
    }
  };

  // Cita unica seleccionada (el upsell solo tiene sentido con 1 servicio claro).
  const citaUpsell =
    selectedIds.size === 1
      ? (citas.find((c) => c.id === Array.from(selectedIds)[0]) ?? null)
      : null;
  // Candidato DETERMINISTA (sin LLM): que producto sugerir. Null si el servicio
  // no encaja con ninguna categoria conocida o no hay producto de esa categoria.
  const upsellCandidato = citaUpsell
    ? elegirCandidatoUpsell(citaUpsell.servicio_nombre, productosDisponibles)
    : null;

  // Categorías reales del catálogo (para las píldoras del panel "Venta rápida").
  const categoriasVenta = useMemo(
    () =>
      Array.from(
        new Set(productosDisponibles.map((p) => p.categoria || "general")),
      ).sort((a, b) => a.localeCompare(b)),
    [productosDisponibles],
  );
  const productosVentaFiltrados = useMemo(() => {
    const q = ventaBusqueda.trim().toLowerCase();
    return productosDisponibles.filter(
      (p) =>
        (ventaCategoriaFiltro === "todas" ||
          (p.categoria || "general") === ventaCategoriaFiltro) &&
        (!q || p.nombre.toLowerCase().includes(q)),
    );
  }, [productosDisponibles, ventaBusqueda, ventaCategoriaFiltro]);

  useEffect(() => {
    if (upsellCandidato) {
      const precio = (upsellCandidato.precio_cents / 100).toFixed(2);
      const prompt = `El profesional va a cobrar el servicio "${citaUpsell?.servicio_nombre}". Sugiere en 1 frase corta (maximo 20 palabras), comercial y directa al profesional, por que ofrecer justo ahora "${upsellCandidato.nombre}" (${precio}€) antes de cobrar. No inventes propiedades ni precios distintos a los dados. No uses emojis.`;
      upsellIA.analizar(prompt);
    } else {
      upsellIA.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upsellCandidato?.id, citaUpsell?.id]);

  // Abrir el cobro de las citas seleccionadas cargando antes los productos
  // consumidos en ellas (cita_productos) para que entren como líneas del ticket.
  const abrirCobroCitas = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setLineasProductosCita([]);
      setShowCobroModal(true);
      return;
    }
    try {
      const { data } = await supabase
        .from("cita_productos")
        .select("producto_id, nombre, precio_cents, cantidad")
        .in("cita_id", ids);
      setLineasProductosCita(
        (data ?? []).map((r: any) => ({
          nombre: r.nombre,
          precio: String(Number(r.precio_cents ?? 0) / 100),
          cantidad: String(r.cantidad ?? 1),
          ref_id: r.producto_id ?? undefined,
        })),
      );
    } catch {
      setLineasProductosCita([]);
    }
    setShowCobroModal(true);
  }, [selectedIds]);

  // Tras cobrar con exito desde el CobroSheet: recargar, avisar, cerrar.
  const handleCobroSuccess = async (cobroIds: string[]) => {
    const txt =
      cobroIds.length === 1
        ? "El cobro se ha efectuado correctamente."
        : `Los ${cobroIds.length} cobros se han efectuado correctamente.`;
    setMensaje({ type: "success", text: txt });
    setSelectedIds(new Set());
    setLineasExtraCobro([]);
    setLineasProductosCita([]);
    setShowCobroModal(false);
    await cargarCitas(); // Recargar
    setTimeout(() => setMensaje(null), 4000);
  };

  // Reembolsar un cobro online (Stripe). El dinero se devuelve y la cita vuelve a "sin cobrar".
  const reembolsarCobro = async (cobroId: string, importeCents: number) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `¿Reembolsar ${(importeCents / 100).toFixed(2)} € al cliente?\nEl dinero se devuelve por Stripe y la cita vuelve a estar sin cobrar.`,
      )
    )
      return;
    setReembolsando(cobroId);
    try {
      const { data, error } = await supabase.functions.invoke(
        "reembolsar-cobro",
        { body: { cobro_id: cobroId } },
      );
      if (error || !(data as any)?.ok)
        throw new Error((data as any)?.error || "No se pudo reembolsar.");
      setMensaje({ type: "success", text: "Reembolso realizado." });
      await cargarCitas();
      setTimeout(() => setMensaje(null), 3000);
    } catch (err) {
      setMensaje({
        type: "error",
        text: mensajeDeError(err, "No se pudo reembolsar."),
      });
    } finally {
      setReembolsando(null);
    }
  };

  // Cobro rapido (walk-in): venta sin cita, mismo motor, sin lista de pendientes que tocar.
  const handleWalkinSuccess = async () => {
    setMensaje({
      type: "success",
      text: "El cobro se ha efectuado correctamente.",
    });
    setShowWalkin(false);
    await cargarCitas(); // Recargar arqueo del dia
    setTimeout(() => setMensaje(null), 4000);
  };

  const handleCobroPresupuestoSuccess = async () => {
    setMensaje({
      type: "success",
      text: "El cobro del presupuesto se ha efectuado correctamente.",
    });
    setCobroPresupuesto(null);
    await cargarCitas();
    setTimeout(() => setMensaje(null), 4000);
  };

  // Los fichajes/jornada viven en "Mi jornada". Caja se centra en cobros y arqueo.

  // Descargas (registros del día) — solo propietario/dirección.
  const hoyStr = format(new Date(), "yyyy-MM-dd");
  const descargarCobros = () => {
    const rows: (string | number)[][] = [
      ["Hora", "Total (€)", "Efectivo (€)", "Datáfono (€)", "Propina (€)"],
    ];
    cobrosHoy.forEach((c: any) =>
      rows.push([
        format(parseISO(c.cobrado_at), "HH:mm", { locale: es }),
        ((c.total_cents || 0) / 100).toFixed(2),
        ((c.efectivo_cents || 0) / 100).toFixed(2),
        ((c.datafono_cents || 0) / 100).toFixed(2),
        ((c.propina_cents || 0) / 100).toFixed(2),
      ]),
    );
    rows.push([
      "TOTAL",
      ((arqueo?.total || 0) / 100).toFixed(2),
      ((arqueo?.efectivo || 0) / 100).toFixed(2),
      ((arqueo?.datafono || 0) / 100).toFixed(2),
      ((arqueo?.propinas || 0) / 100).toFixed(2),
    ]);
    downloadCSV(`caja-cobros-${hoyStr}.csv`, rows);
  };

  // Citas pasadas pendientes de cobro (su hora ya ha llegado y siguen sin
  // cobrarse). Va ANTES del early-return de carga: un hook despues de un
  // return condicional rompe las reglas de hooks (React error #310) y tira
  // toda la pantalla de Caja al pasar de "cargando" a "cargada".
  // El esquema real usa `inicio` (timestamptz), no `fecha`.
  const citasPasadas = useMemo(() => {
    const ahora = Date.now();
    return citas.filter((c: any) => new Date(c.inicio).getTime() <= ahora);
  }, [citas]);

  // ─────────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: T.textSec }}>
        <div
          className="spinner"
          style={{
            width: 32,
            height: 32,
            border: "3px solid #e0e0e0",
            borderTopColor: T.primary,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 12px",
          }}
        />
        Cargando citas pendientes...
      </div>
    );
  }

  return (
    <div
      style={{
        background: T.bg,
        height: "calc(100vh / var(--mecha-zoom, 1))",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{ANIM}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Contenedor con scroll propio: en movil la pantalla vive en una escena de
          altura acotada (con la tab bar de 58px abajo); sin overflowY propio + padding
          inferior, el contenido se cortaba y no se podia hacer scroll. */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: isMobile ? "16px 14px 96px" : "20px",
        }}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: isMobile ? 16 : 20,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: isMobile ? 22 : 28,
                fontWeight: 700,
                color: T.text,
                margin: "0 0 8px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon name="wallet" size={isMobile ? 22 : 28} color={T.primary} />
              Caja
            </h1>
            <p
              style={{
                fontSize: isMobile ? 13 : 14,
                color: T.textSec,
                margin: 0,
              }}
            >
              Cobra las citas completadas, controla el arqueo del día y la
              jornada del equipo.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              zIndex: 100,
              flexWrap: "wrap",
            }}
          >
            {canSeeAll && (
              <>
                <button
                  onClick={async () => {
                    setShowVentaProductos(true);
                  }}
                  // El recorrido guiado pulsa este boton para poder enseñar el
                  // panel de venta de producto, que solo existe abierto.
                  data-demo-abrir="caja-venta"
                  className="ca-btn"
                  style={{
                    padding: "10px 18px",
                    background: T.primary,
                    border: "none",
                    color: "#fff",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="wallet" size={15} color="#fff" />
                  Vender producto
                </button>
                <button
                  onClick={() => setShowWalkin(true)}
                  data-demo-abrir="caja-cobrar"
                  className="ca-btn"
                  style={{
                    padding: "10px 18px",
                    background: T.card,
                    border: `1px solid ${T.borderHi}`,
                    color: T.text,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="cash" size={15} color={T.primary} />
                  Cobro rápido
                </button>
                <button
                  onClick={() => setShowVentaBono(true)}
                  className="ca-btn"
                  style={{
                    padding: "10px 18px",
                    background: T.card,
                    border: `1px solid ${T.borderHi}`,
                    color: T.text,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="scisors" size={15} color={T.primary} />
                  Vender bono
                </button>
                <button
                  onClick={() => setShowVentaTarjetaRegalo(true)}
                  className="ca-btn"
                  style={{
                    padding: "10px 18px",
                    background: T.card,
                    border: `1px solid ${T.borderHi}`,
                    color: T.text,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="gift" size={15} color={T.primary} />
                  Vender tarjeta regalo
                </button>
              </>
            )}
            <button
              onClick={() => setShowManualPanel(true)}
              title="Manual de esta pagina"
              className="ca-btn"
              style={{
                display: "grid",
                placeItems: "center",
                width: 32,
                height: 32,
                borderRadius: 8,
                background: T.card,
                border: `1px solid ${T.borderHi}`,
                color: T.textSec,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <AvisosBell mode="header" />
          </div>
        </div>

        {/* Abrir y cerrar la caja del dia. Solo gestion: las RPC lo comprueban
            tambien en servidor, esto es para no enseñar un boton que fallaria. */}
        {canSeeAll && <SesionCajaPanel />}

        {!paginaManual.loading && !paginaManual.visto && (
          <div style={{ marginBottom: isMobile ? 16 : 20 }}>
            <AvisoPrimeraVisita
              content={manualCaja}
              isMobile={isMobile}
              onVerManual={() => {
                paginaManual.marcarVisto();
                setShowManualPanel(true);
              }}
              onCerrar={paginaManual.marcarVisto}
            />
          </div>
        )}

        {/* Banner de aviso si hay cobros de citas pasadas pendientes */}
        {canSeeAll && citasPasadas.length > 0 && (
          <div
            style={{
              background: T.warningSoft,
              border: `1px solid ${T.warning}`,
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="alert" size={18} color={T.warning} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>
                  {citasPasadas.length === 1
                    ? "1 cobro pendiente de registrar (cita pasada o completada)"
                    : `${citasPasadas.length} cobros pendientes de registrar (citas pasadas o completadas)`}
                </div>
                <div style={{ fontSize: 11.5, color: T.textSec }}>
                  Se ha sobrepasado la hora de la cita sin marcarla como cobrada
                  en el software.
                </div>
              </div>
            </div>
            <button
              onClick={() =>
                setSelectedIds(new Set(citasPasadas.map((c) => c.id)))
              }
              className="ca-btn"
              style={{
                padding: "6px 12px",
                background: T.warning,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              Seleccionar pendientes ({citasPasadas.length})
            </button>
          </div>
        )}

        {/* Arqueo del dia — solo propietario/dirección (todo lo del dinero) */}
        {canSeeAll &&
          arqueo &&
          (() => {
            // IVA estimado (operativo, NO fiscal): peluquería 21% incluido en el precio.
            const ivaEstim = Math.round((arqueo.total * 21) / 121);
            const card = (
              label: string,
              value: string,
              opts: {
                hero?: boolean;
                color?: string;
                icon?: string;
                sub?: string;
              } = {},
            ) => (
              <div
                style={{
                  background: T.card,
                  border: `1px solid ${opts.hero ? "rgba(244,80,30,0.32)" : T.border}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  boxShadow: opts.hero
                    ? "0 6px 20px -10px rgba(244,80,30,0.4)"
                    : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: T.textSec,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {opts.icon ? (
                    <Icon
                      name={opts.icon}
                      size={13}
                      color={opts.color || T.textSec}
                    />
                  ) : null}
                  {label}
                </div>
                <div
                  style={{
                    fontSize: opts.hero ? 24 : 18,
                    fontWeight: opts.hero ? 800 : 700,
                    color: opts.color || T.text,
                    marginTop: 4,
                  }}
                >
                  {value}
                </div>
                {opts.sub ? (
                  <div style={{ fontSize: 11, color: T.textTer, marginTop: 2 }}>
                    {opts.sub}
                  </div>
                ) : null}
              </div>
            );
            return (
              <div
                data-demo="caja-arqueo"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                {card("Cobrado hoy", `${(arqueo.total / 100).toFixed(2)}€`, {
                  hero: true,
                  sub: `${arqueo.count} cobro${arqueo.count === 1 ? "" : "s"}`,
                })}
                {card("Efectivo", `${(arqueo.efectivo / 100).toFixed(2)}€`, {
                  icon: "cash",
                  color: T.text,
                })}
                {card("Datáfono", `${(arqueo.datafono / 100).toFixed(2)}€`, {
                  icon: "credit",
                  color: T.text,
                })}
                {card("Propinas", `${(arqueo.propinas / 100).toFixed(2)}€`, {
                  color: T.success,
                })}
                {card("IVA estim. (21%)", `${(ivaEstim / 100).toFixed(2)}€`, {
                  color: T.textSec,
                  sub: "incluido en lo cobrado",
                })}
              </div>
            );
          })()}

        {/* Registros descargables (CSV) — solo propietario/dirección */}
        {canSeeAll && cobrosHoy.length > 0 && (
          <div
            data-demo="caja-facturas"
            style={{
              background: T.card,
              border: `1px solid ${T.borderHi}`,
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="download" size={18} color={T.textTer} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                  Exportar registros del día
                </div>
                <div style={{ fontSize: 12, color: T.textSec }}>
                  Descarga los cobros completados hoy en formato CSV.
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px solid ${T.border}`,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <button
                onClick={descargarCobros}
                className="ca-btn"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 9,
                  border: `1px solid ${T.borderHi}`,
                  background: T.bg,
                  color: T.textSec,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="download" size={13} color={T.textSec} /> Cobros
                (CSV)
              </button>
            </div>
          </div>
        )}

        {/* Cobros online de hoy — reembolsables por Stripe (solo propietario/dirección) */}
        {canSeeAll &&
          cobrosHoy.some(
            (c: any) => c.metodo === "online" || c.metodo === "bizum",
          ) && (
            <div
              style={{
                background: T.card,
                border: `1px solid ${T.borderHi}`,
                borderRadius: 12,
                padding: "14px 18px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: T.text,
                  marginBottom: 4,
                }}
              >
                Cobros online de hoy
              </div>
              <div style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>
                Pagos por QR/enlace (tarjeta o Bizum). Puedes reembolsarlos.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cobrosHoy
                  .filter(
                    (c: any) => c.metodo === "online" || c.metodo === "bizum",
                  )
                  .map((c: any) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        background: T.bg,
                        border: `1px solid ${T.border}`,
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: T.text,
                          }}
                        >
                          {(c.total_cents / 100).toFixed(2)} €
                        </div>
                        <div style={{ fontSize: 11.5, color: T.textTer }}>
                          {c.metodo === "bizum" ? "Bizum" : "Online"} ·{" "}
                          {new Date(c.cobrado_at).toLocaleTimeString("es-ES", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => reembolsarCobro(c.id, c.total_cents)}
                        disabled={reembolsando === c.id}
                        className="ca-btn"
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "7px 14px",
                          borderRadius: 9,
                          border: `1px solid ${T.danger}55`,
                          background: T.dangerSoft ?? "rgba(226,59,52,0.10)",
                          color: T.danger,
                          cursor:
                            reembolsando === c.id ? "not-allowed" : "pointer",
                          opacity: reembolsando === c.id ? 0.6 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {reembolsando === c.id ? "Reembolsando…" : "Reembolsar"}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

        {/* Mensaje */}
        {mensaje && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              marginBottom: 16,
              background:
                mensaje.type === "success" ? T.successSoft : T.dangerSoft,
              color: mensaje.type === "success" ? T.success : T.danger,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {mensaje.text}
          </div>
        )}

        {/* Barra de acciones — solo propietario/dirección */}
        {canSeeAll && citas.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              background: T.card,
              borderRadius: 12,
              border: `1px solid ${T.borderHi}`,
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="checkbox"
                checked={selectedIds.size === citas.length && citas.length > 0}
                onChange={seleccionarTodas}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, color: T.text }}>
                {selectedIds.size > 0
                  ? `${selectedIds.size} seleccionadas`
                  : "Seleccionar todas"}
              </span>
            </div>

            {seleccion.count > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: T.textSec }}>
                    Pendiente
                  </div>
                  <div
                    style={{ fontSize: 18, fontWeight: 700, color: T.primary }}
                  >
                    {(seleccion.pendiente / 100).toFixed(2)}€
                  </div>
                </div>
                <button
                  onClick={abrirCobroCitas}
                  className="ca-btn"
                  style={{
                    padding: "10px 20px",
                    background: T.primary,
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="cash" size={16} color="white" />
                  Cobrar
                </button>
              </div>
            )}
          </div>
        )}

        {/* Upsell IA (Sesion 6): candidato determinista + copy de Chispa. Vive en
          el flujo normal (nunca fixed/absolute), como manda el patron de la
          Sesion 4 — no compite con AvisosBell ni con ningun overlay. */}
        {canSeeAll && upsellCandidato && (
          <div style={{ marginBottom: 16 }}>
            <TarjetaAyudaIA
              titulo="Oportunidad de venta"
              subtitulo="Sugerencia para este cobro"
              estado={upsellIA.estado}
              onAnalizar={() => upsellIA.reintentar()}
              botonLabel="Repetir sugerencia"
              mensajeVacio="Chispa no ha encontrado un motivo especial para sugerir esto ahora."
              isMobile={isMobile}
              resumenDeterminista={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: T.text }}>
                      {upsellCandidato.nombre}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSec }}>
                      {(upsellCandidato.precio_cents / 100).toFixed(2)}€
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCarrito([{ ...upsellCandidato, cantidad: 1 }]);
                      setShowVentaProductos(true);
                    }}
                    className="ca-btn"
                    style={{
                      padding: "8px 14px",
                      background: T.primary,
                      color: "#fff",
                      border: "none",
                      borderRadius: 9,
                      fontSize: 12.5,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Añadir al ticket
                  </button>
                </div>
              }
            />
          </div>
        )}

        {/* Lista de citas pendientes de cobro — solo propietario/dirección */}
        {canSeeAll && (
          <div
            data-demo="caja-cobro"
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: "14px 16px",
              marginBottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="calendar" size={18} color={T.primary} />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: T.text,
                  }}
                >
                  Filtrar Cobros Pendientes
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: T.textTer,
                    background: T.bg,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  {citasFiltradas.length} cita{citasFiltradas.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Buscador de texto */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: "6px 12px",
                  minWidth: 200,
                }}
              >
                <Icon name="search" size={14} color={T.textSec} />
                <input
                  type="text"
                  placeholder="Buscar cliente, servicio..."
                  value={busquedaPendientes}
                  onChange={(e) => setBusquedaPendientes(e.target.value)}
                  style={{
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    color: T.text,
                    fontSize: 13,
                    width: "100%",
                  }}
                />
                {busquedaPendientes ? (
                  <button
                    onClick={() => setBusquedaPendientes("")}
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      color: T.textSec,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>

            {/* Chips de filtro de fecha */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {[
                { id: "todas", label: "Todas las fechas" },
                { id: "hoy", label: "Hoy" },
                { id: "ayer", label: "Ayer" },
                { id: "semana", label: "Esta semana" },
                { id: "mes", label: "Este mes" },
                { id: "rango", label: "Personalizado" },
              ].map((f) => {
                const active = filtroFechaPendientes === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() =>
                      setFiltroFechaPendientes(f.id as any)
                    }
                    style={{
                      padding: "6px 12px",
                      borderRadius: 20,
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 500,
                      background: active ? T.primary : T.bg,
                      color: active ? "#ffffff" : T.textSec,
                      border: `1px solid ${active ? T.primary : T.border}`,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Selector de rango de fechas personalizado */}
            {filtroFechaPendientes === "rango" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 4,
                  paddingTop: 8,
                  borderTop: `1px dashed ${T.border}`,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: T.textSec }}>Desde:</span>
                  <input
                    type="date"
                    value={fechaDesdePendientes}
                    onChange={(e) => setFechaDesdePendientes(e.target.value)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      background: T.bg,
                      color: T.text,
                      fontSize: 12.5,
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: T.textSec }}>Hasta:</span>
                  <input
                    type="date"
                    value={fechaHastaPendientes}
                    onChange={(e) => setFechaHastaPendientes(e.target.value)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      background: T.bg,
                      color: T.text,
                      fontSize: 12.5,
                    }}
                  />
                </div>
                {(fechaDesdePendientes || fechaHastaPendientes) ? (
                  <button
                    onClick={() => {
                      setFechaDesdePendientes("");
                      setFechaHastaPendientes("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: T.primary,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Limpiar rango
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Lista de citas pendientes de cobro — solo propietario/dirección */}
        {canSeeAll &&
          (conceptos.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                background: T.card,
                borderRadius: 16,
                border: `1px solid ${T.border}`,
              }}
            >
              <Icon name="check" size={48} color={T.success} />
              <p
                style={{
                  fontSize: 16,
                  color: T.textSec,
                  marginTop: 16,
                  margin: 0,
                }}
              >
                No hay citas pendientes de cobro para el filtro seleccionado
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: T.textTer,
                  marginTop: 8,
                  margin: 0,
                }}
              >
                Prueba a cambiar el rango de fecha o el filtro de búsqueda
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {conceptos.map((concepto, idx) => {
                const animDelay = `${idx * 0.03}s`;

                // Concepto de un solo servicio: fila simple (igual que antes).
                if (concepto.items.length === 1) {
                  const cita = concepto.items[0];
                  const isSelected = selectedIds.has(cita.id);
                  const hora = fmtFechaHora(cita.hora_inicio);
                  return (
                    <div
                      key={concepto.key}
                      className={`ca-row ${isSelected ? "selected" : ""}`}
                      onClick={() => toggleSeleccion(cita.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 16,
                        padding: "14px 18px",
                        background: T.card,
                        borderRadius: 12,
                        border: `1px solid ${isSelected ? T.primary : T.border}`,
                        cursor: "pointer",
                        animationDelay: animDelay,
                      }}
                    >
                      <div style={{ display: "grid", placeItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSeleccion(cita.id)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: T.text,
                            }}
                          >
                            {cita.cliente_nombre || "Sin cliente"}
                          </span>
                          {cita.profesional_nombre && (
                            <span
                              style={{
                                fontSize: 12,
                                color: T.textSec,
                                padding: "2px 8px",
                                background: T.bg,
                                borderRadius: 6,
                              }}
                            >
                              {cita.profesional_nombre}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: T.textSec,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Icon name="clock" size={13} />
                            {hora}
                          </span>
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            {cita.categoria_color && (
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 99,
                                  background: cita.categoria_color,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            {cita.servicio_nombre || "Servicio"}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: T.text,
                          }}
                        >
                          {(cita.total_pendiente / 100).toFixed(2)}€
                        </div>
                        {cita.sena_pagada > 0 && (
                          <div style={{ fontSize: 11, color: T.success }}>
                            señal {(cita.sena_pagada / 100).toFixed(2)}€
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Concepto con varios servicios encadenados del mismo cliente.
                const seleccionados = contarSeleccionados(concepto.items);
                const estado =
                  seleccionados === 0
                    ? "none"
                    : seleccionados === concepto.items.length
                      ? "all"
                      : "some";
                const expanded = expandedIds.has(concepto.key);
                const primeraHora = fmtFechaHora(concepto.items[0].hora_inicio);

                return (
                  <div
                    key={concepto.key}
                    className={`ca-row ${estado !== "none" ? "selected" : ""}`}
                    style={{
                      padding: "14px 18px",
                      background: T.card,
                      borderRadius: 12,
                      border: `1px solid ${estado !== "none" ? T.primary : T.border}`,
                      animationDelay: animDelay,
                    }}
                  >
                    {/* Cabecera del concepto: pulsar la fila despliega los servicios */}
                    <div
                      onClick={() => toggleExpand(concepto.key)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 16,
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      {/* Checkbox tri-estado: selecciona/deselecciona todo el concepto */}
                      <div
                        style={{ display: "grid", placeItems: "center" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={estado === "all"}
                          ref={(el) => {
                            if (el) el.indeterminate = estado === "some";
                          }}
                          onChange={() => toggleConcepto(concepto.items)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                        />
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: T.text,
                            }}
                          >
                            {concepto.cliente_nombre || "Sin cliente"}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: T.primary,
                              padding: "2px 8px",
                              background: T.primarySoft,
                              borderRadius: 6,
                            }}
                          >
                            {concepto.key.startsWith("grupo:")
                              ? `Servicio encadenado (${concepto.items.length})`
                              : `${concepto.items.length} servicios`}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: T.textSec,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Icon name="clock" size={13} />
                            {primeraHora}
                          </span>
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            {concepto.items.slice(0, 5).map((it, i) => (
                              <span
                                key={i}
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: 99,
                                  background: it.categoria_color || T.border,
                                  flexShrink: 0,
                                }}
                              />
                            ))}
                          </span>
                          {estado === "some" && (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: T.primary,
                              }}
                            >
                              {seleccionados}/{concepto.items.length}{" "}
                              seleccionados
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              color: T.text,
                            }}
                          >
                            {(concepto.totalPendiente / 100).toFixed(2)}€
                          </div>
                          {concepto.totalSenas > 0 && (
                            <div style={{ fontSize: 11, color: T.success }}>
                              señal {(concepto.totalSenas / 100).toFixed(2)}€
                            </div>
                          )}
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            transform: expanded ? "rotate(180deg)" : "none",
                            transition: "transform 0.15s ease",
                          }}
                        >
                          <Icon name="chevron" size={18} color={T.textSec} />
                        </span>
                      </div>
                    </div>

                    {/* Servicios individuales: cobrar por separado marcando solo algunos */}
                    {expanded && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: `1px solid ${T.border}`,
                        }}
                      >
                        {concepto.items.map((sub) => {
                          const subSel = selectedIds.has(sub.id);
                          const subHora = fmtFechaHora(sub.hora_inicio);
                          return (
                            <div
                              key={sub.id}
                              onClick={() => toggleSeleccion(sub.id)}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "auto 1fr auto",
                                gap: 12,
                                alignItems: "center",
                                padding: "8px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                                background: subSel ? T.primarySoft : T.bg,
                                border: `1px solid ${subSel ? T.primary : "transparent"}`,
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  placeItems: "center",
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={subSel}
                                  onChange={() => toggleSeleccion(sub.id)}
                                  style={{
                                    width: 16,
                                    height: 16,
                                    cursor: "pointer",
                                  }}
                                />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontSize: 13.5,
                                    color: T.text,
                                  }}
                                >
                                  {sub.categoria_color && (
                                    <span
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: 99,
                                        background: sub.categoria_color,
                                        flexShrink: 0,
                                      }}
                                    />
                                  )}
                                  <span
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {sub.servicio_nombre || "Servicio"}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: T.textSec,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    marginTop: 2,
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 4,
                                    }}
                                  >
                                    <Icon name="clock" size={12} />
                                    {subHora}
                                  </span>
                                  {sub.profesional_nombre && (
                                    <span>{sub.profesional_nombre}</span>
                                  )}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: T.text,
                                  }}
                                >
                                  {(sub.total_pendiente / 100).toFixed(2)}€
                                </div>
                                {sub.sena_pagada > 0 && (
                                  <div
                                    style={{ fontSize: 10, color: T.success }}
                                  >
                                    señal {(sub.sena_pagada / 100).toFixed(2)}€
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

        {/* Presupuestos aceptados pendientes de cobro */}
        {canSeeAll && presupuestosCobrables.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: T.text,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Icon name="check" size={16} color={T.primary} /> Presupuestos
              aceptados
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {presupuestosCobrables.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "14px 18px",
                    background: T.card,
                    borderRadius: 12,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: T.textTer,
                        }}
                      >
                        P-{p.numero}
                      </span>
                      <span
                        style={{ fontSize: 15, fontWeight: 600, color: T.text }}
                      >
                        {p.contacto_nombre || "Sin nombre"}
                      </span>
                    </div>
                    <div
                      style={{ fontSize: 12.5, color: T.textSec, marginTop: 2 }}
                    >
                      Presupuesto aceptado · pendiente de cobro
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 14 }}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: T.text,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {(p.total_cents / 100).toFixed(2)}€
                    </span>
                    <button
                      onClick={() => setCobroPresupuesto(p)}
                      className="ca-btn"
                      style={{
                        padding: "9px 16px",
                        background: T.primary,
                        color: "white",
                        border: "none",
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Icon name="cash" size={14} color="white" /> Cobrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* fin contenedor con scroll */}

      {/* Modal de cobro — solo propietario/dirección (fixed: fuera del scroll) */}
      {canSeeAll && showCobroModal && (
        <CobroSheet
          mode="cita"
          citaIds={Array.from(selectedIds)}
          pendienteCents={seleccion.pendiente}
          senalCents={seleccion.totalSenas}
          titulo={`Cobrar ${seleccion.count} servicio${seleccion.count > 1 ? "s" : ""}${seleccion.clienteNombre ? ` · ${seleccion.clienteNombre}` : ""}`}
          lineasIniciales={
            lineasProductosCita.length > 0 || lineasExtraCobro.length > 0
              ? [...lineasProductosCita, ...lineasExtraCobro]
              : undefined
          }
          onClose={() => {
            setShowCobroModal(false);
            setLineasExtraCobro([]);
            setLineasProductosCita([]);
          }}
          onSuccess={handleCobroSuccess}
        />
      )}
      {canSeeAll && showWalkin && (
        <CobroSheet
          mode="walkin"
          onClose={() => setShowWalkin(false)}
          onSuccess={handleWalkinSuccess}
        />
      )}
      {canSeeAll && cobroPresupuesto && (
        <CobroSheet
          mode="presupuesto"
          presupuestoId={cobroPresupuesto.id}
          pendienteCents={cobroPresupuesto.total_cents}
          titulo={`Cobrar presupuesto P-${cobroPresupuesto.numero}`}
          subtitulo={cobroPresupuesto.contacto_nombre || undefined}
          onClose={() => setCobroPresupuesto(null)}
          onSuccess={handleCobroPresupuestoSuccess}
        />
      )}

      {/* === PANEL VENTA RÁPIDA DE PRODUCTOS === */}
      {canSeeAll && showVentaProductos && (
        <div
          onClick={() => {
            if (!ventaEnviando) {
              setShowVentaProductos(false);
              setCarrito([]);
            }
          }}
          className="ca-modal-overlay"
          // El recorrido guiado abre este panel en su paso; al avanzar hay que
          // cerrarlo o se apila sobre los pasos siguientes (arqueo y registros).
          data-demo-cerrar="caja-venta"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 210,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ca-modal"
            data-demo="caja-venta"
            // minWidth 0: el overlay es un grid y sus hijos tienen minimo
            // automatico = min-content. Con una fila de carrito larga (nombre +
            // −/+ + importe + aspa) el modal se estiraba a ~520 px dentro de una
            // pantalla de 375 y se salia por la derecha. Con minWidth 0 manda el
            // width:100% y el nombre se corta con puntos suspensivos.
            style={{
              background: T.panel,
              border: `1px solid ${T.borderHi}`,
              borderRadius: 16,
              width: "100%",
              minWidth: 0,
              maxWidth: 540,
              maxHeight: "calc(90vh / var(--mecha-zoom, 1))",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 70px rgba(40,30,24,0.35)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "18px 20px 12px",
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 800,
                    color: T.text,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="wallet" size={18} color={T.primary} /> Venta
                  rápida
                </h4>
                <button
                  onClick={() => {
                    setShowVentaProductos(false);
                    setCarrito([]);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: T.textTer,
                    fontSize: 20,
                    cursor: "pointer",
                    padding: "0 4px",
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
                {selectedIds.size > 0 ? (
                  <>
                    Tienes{" "}
                    <b>
                      {selectedIds.size} cita{selectedIds.size > 1 ? "s" : ""}
                    </b>{" "}
                    seleccionada{selectedIds.size > 1 ? "s" : ""}. Los productos
                    se cobrarán <b>en el mismo ticket</b>.
                  </>
                ) : (
                  "Toca un producto para añadirlo. Rápido y sin complicaciones."
                )}
              </div>
            </div>

            {/* Búsqueda + categorías (catálogos grandes) */}
            {productosDisponibles.length > 0 && (
              <div style={{ padding: "12px 20px 0" }}>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      display: "flex",
                    }}
                  >
                    <Icon name="search" size={15} color={T.textTer} />
                  </span>
                  <input
                    type="text"
                    value={ventaBusqueda}
                    onChange={(e) => setVentaBusqueda(e.target.value)}
                    placeholder="Buscar producto..."
                    style={{
                      width: "100%",
                      padding: "8px 10px 8px 32px",
                      background: T.card,
                      border: `1px solid ${T.border}`,
                      borderRadius: 8,
                      color: T.text,
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                {categoriasVenta.length > 1 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      overflowX: "auto",
                      paddingBottom: 10,
                    }}
                  >
                    {["todas", ...categoriasVenta].map((cat) => {
                      const on = ventaCategoriaFiltro === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setVentaCategoriaFiltro(cat)}
                          style={{
                            flexShrink: 0,
                            padding: "5px 12px",
                            borderRadius: 99,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            background: on ? T.primarySoft : T.card,
                            border: `1px solid ${on ? T.primary : T.border}`,
                            color: on ? T.primaryHi : T.textSec,
                            textTransform: "capitalize",
                          }}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Product grid */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
              {productosDisponibles.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px 10px",
                    color: T.textSec,
                    fontSize: 13,
                  }}
                >
                  No hay productos en el inventario. Añádelos desde la pestaña
                  Inventario.
                </div>
              ) : productosVentaFiltrados.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px 10px",
                    color: T.textSec,
                    fontSize: 13,
                  }}
                >
                  Ningún producto coincide con la búsqueda.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 10,
                  }}
                >
                  {productosVentaFiltrados.map((prod) => {
                    const enCarrito = carrito.find((c) => c.id === prod.id);
                    return (
                      <button
                        key={prod.id}
                        onClick={() => {
                          setCarrito((prev) => {
                            const idx = prev.findIndex((c) => c.id === prod.id);
                            if (idx >= 0)
                              return prev.map((c, i) =>
                                i === idx
                                  ? { ...c, cantidad: c.cantidad + 1 }
                                  : c,
                              );
                            return [...prev, { ...prod, cantidad: 1 }];
                          });
                        }}
                        className="ca-btn"
                        style={{
                          position: "relative",
                          // minWidth 0: son celdas de grid; sin esto un nombre
                          // largo ensancha la columna y la rejilla se sale.
                          minWidth: 0,
                          background: enCarrito ? T.primarySoft : T.card,
                          border: `1px solid ${enCarrito ? T.primary : T.border}`,
                          borderRadius: 12,
                          padding: "14px 10px",
                          textAlign: "center",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {enCarrito && (
                          <span
                            style={{
                              position: "absolute",
                              top: -6,
                              right: -6,
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: T.primary,
                              color: "#fff",
                              fontSize: 11,
                              fontWeight: 800,
                              display: "grid",
                              placeItems: "center",
                              boxShadow: "0 2px 6px rgba(244,80,30,0.4)",
                            }}
                          >
                            {enCarrito.cantidad}
                          </span>
                        )}
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: T.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {prod.nombre}
                        </div>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            color: T.primary,
                            marginTop: 4,
                          }}
                        >
                          {(prod.precio_cents / 100).toFixed(2)}€
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mini-cart + checkout */}
            {carrito.length > 0 && (
              <div
                style={{
                  borderTop: `1px solid ${T.border}`,
                  padding: "14px 20px",
                  background: T.cardHi,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginBottom: 12,
                  }}
                >
                  {carrito.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          color: T.text,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.nombre}
                      </span>
                      <button
                        onClick={() =>
                          setCarrito((prev) =>
                            prev.map((c) =>
                              c.id === item.id
                                ? {
                                    ...c,
                                    cantidad: Math.max(1, c.cantidad - 1),
                                  }
                                : c,
                            ),
                          )
                        }
                        style={{
                          background: "none",
                          border: `1px solid ${T.border}`,
                          borderRadius: 6,
                          width: 24,
                          height: 24,
                          fontSize: 14,
                          cursor: "pointer",
                          color: T.text,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontWeight: 700,
                          color: T.text,
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {item.cantidad}
                      </span>
                      <button
                        onClick={() =>
                          setCarrito((prev) =>
                            prev.map((c) =>
                              c.id === item.id
                                ? { ...c, cantidad: c.cantidad + 1 }
                                : c,
                            ),
                          )
                        }
                        style={{
                          background: "none",
                          border: `1px solid ${T.border}`,
                          borderRadius: 6,
                          width: 24,
                          height: 24,
                          fontSize: 14,
                          cursor: "pointer",
                          color: T.text,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        +
                      </button>
                      <span
                        style={{
                          color: T.textSec,
                          minWidth: 55,
                          textAlign: "right",
                          fontWeight: 600,
                        }}
                      >
                        {((item.precio_cents * item.cantidad) / 100).toFixed(2)}
                        €
                      </span>
                      <button
                        onClick={() =>
                          setCarrito((prev) =>
                            prev.filter((c) => c.id !== item.id),
                          )
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: T.danger,
                          fontSize: 16,
                          cursor: "pointer",
                          padding: "0 2px",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* Cliente (opcional): si no se elige, la venta queda anonima
                    y no aparece en la ficha de nadie. */}
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: T.textSec,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      marginBottom: 5,
                    }}
                  >
                    Cliente (opcional)
                  </div>
                  <select
                    value={ventaClienteId}
                    onChange={(e) => setVentaClienteId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      background: T.card,
                      border: `1px solid ${T.border}`,
                      borderRadius: 8,
                      color: T.text,
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">Sin cliente (venta anónima)</option>
                    {clientesVenta.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Total + método + cobrar */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    alignItems: isMobile ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: T.textSec,
                          fontWeight: 600,
                          textTransform: "uppercase",
                        }}
                      >
                        Total
                      </div>
                      <div
                        style={{ fontSize: 22, fontWeight: 800, color: T.text }}
                      >
                        {(
                          carrito.reduce(
                            (s, c) => s + c.precio_cents * c.cantidad,
                            0,
                          ) / 100
                        ).toFixed(2)}
                        €
                      </div>
                    </div>
                    {isMobile && (
                      <div style={{ display: "flex", gap: 4 }}>
                        {(["efectivo", "datafono", "bizum"] as const).map(
                          (m) => (
                            <button
                              key={m}
                              onClick={() => setVentaMetodo(m)}
                              className="ca-btn"
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                fontSize: 11.5,
                                fontWeight: 600,
                                cursor: "pointer",
                                background: ventaMetodo === m ? T.text : T.card,
                                color: ventaMetodo === m ? "#fff" : T.textSec,
                                border: `1px solid ${ventaMetodo === m ? T.text : T.border}`,
                              }}
                            >
                              {m === "efectivo"
                                ? "Efectivo"
                                : m === "datafono"
                                  ? "Datáfono"
                                  : "Bizum"}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  {!isMobile && (
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["efectivo", "datafono", "bizum"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setVentaMetodo(m)}
                          className="ca-btn"
                          style={{
                            padding: "7px 12px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            background: ventaMetodo === m ? T.text : T.card,
                            color: ventaMetodo === m ? "#fff" : T.textSec,
                            border: `1px solid ${ventaMetodo === m ? T.text : T.border}`,
                          }}
                        >
                          {m === "efectivo"
                            ? "Efectivo"
                            : m === "datafono"
                              ? "Datáfono"
                              : "Bizum"}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    disabled={ventaEnviando}
                    onClick={async () => {
                      // Si hay citas seleccionadas, cobramos todo junto en un
                      // único ticket (citas + productos) vía CobroSheet. Si no,
                      // venta suelta (walk-in) como antes.
                      if (selectedIds.size > 0) {
                        setLineasExtraCobro(
                          carrito.map((c) => ({
                            nombre: c.nombre,
                            precio: (c.precio_cents / 100).toString(),
                            cantidad: String(c.cantidad),
                            ref_id: c.id,
                          })),
                        );
                        setShowVentaProductos(false);
                        setCarrito([]);
                        await abrirCobroCitas();
                        return;
                      }
                      setVentaEnviando(true);
                      try {
                        const lineasPayload = carrito.map((c) => ({
                          nombre: c.nombre,
                          precio_cents: c.precio_cents,
                          cantidad: c.cantidad,
                          ref_id: c.id,
                        }));
                        const { error: rpcErr } = await supabase.rpc(
                          "crear_cobro_walkin",
                          {
                            p_lineas: lineasPayload,
                            p_metodo: ventaMetodo,
                            p_propina_cents: 0,
                            p_descuento_cents: 0,
                            p_cliente_id: ventaClienteId || null,
                          },
                        );
                        if (rpcErr) throw rpcErr;
                        setShowVentaProductos(false);
                        setCarrito([]);
                        setVentaClienteId("");
                        setMensaje({
                          type: "success",
                          text: `Venta registrada · ${(carrito.reduce((s, c) => s + c.precio_cents * c.cantidad, 0) / 100).toFixed(2)}€`,
                        });
                        setTimeout(() => setMensaje(null), 4000);
                        cargarCitas();
                      } catch (err: any) {
                        setMensaje({
                          type: "error",
                          text: mensajeDeError(
                            err,
                            "Error al registrar la venta.",
                          ),
                        });
                      } finally {
                        setVentaEnviando(false);
                      }
                    }}
                    className="ca-btn"
                    style={{
                      padding: "11px 22px",
                      background: T.primary,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: ventaEnviando ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    <Icon name="check" size={16} color="#fff" />
                    {ventaEnviando
                      ? "Cobrando..."
                      : selectedIds.size > 0
                        ? `Cobrar todo junto (${selectedIds.size} cita${selectedIds.size > 1 ? "s" : ""} + productos)`
                        : "Cobrar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showManualPanel && (
        <ManualPanel
          content={manualCaja}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
      {showVentaBono && (
        <VentaBonoModal
          onClose={() => setShowVentaBono(false)}
          onSuccess={() => {
            setShowVentaBono(false);
            setMensaje({
              type: "success",
              text: "Bono vendido correctamente.",
            });
            setTimeout(() => setMensaje(null), 4000);
            cargarCitas();
          }}
        />
      )}
      {showVentaTarjetaRegalo && (
        <VentaTarjetaRegaloModal
          onClose={() => setShowVentaTarjetaRegalo(false)}
          onSuccess={() => {
            setShowVentaTarjetaRegalo(false);
            setMensaje({
              type: "success",
              text: "Tarjeta regalo vendida correctamente.",
            });
            setTimeout(() => setMensaje(null), 4000);
            cargarCitas();
          }}
        />
      )}
    </div>
  );
}

export default withClientDataGate(CajaScreen, "Caja");
