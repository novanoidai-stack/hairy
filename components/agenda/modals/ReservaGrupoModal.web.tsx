import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DESIGN_TOKENS as T } from "@/lib/designTokens";
import { mensajeDeError } from "@/lib/errores";
import { useResponsive } from "@/lib/hooks/useResponsive";

interface IntegranteLinea {
  id: string;
  nombre: string;
  cliente_id?: string;
  servicio_id: string;
  profesional_id: string;
  duracion_min: number;
  desfase_antes_fin_min: number;
}

interface ReservaGrupoModalProps {
  negocioId: string;
  profesionales: Array<{ id: string; nombre: string }>;
  servicios: Array<{
    id: string;
    nombre: string;
    precio: number;
    duracion?: number;
    duracion_activa_min?: number | null;
    duracion_espera_min?: number | null;
    duracion_activa_extra_min?: number | null;
  }>;
  clientes: Array<{ id: string; nombre: string; telefono?: string }>;
  selectedDate: Date;
  onClose: () => void;
  onSaved: (grupoId: string) => void;
}

// Duracion total de un servicio del catalogo: activa + espera + extra (la
// misma suma que hace NewCitaModal). El campo plano `duracion` NO existe en
// la query del catalogo (lib/datos/catalogo.ts): leerlo a pelo mostraba
// "undefined′" en las opciones y dejaba todas las duraciones en el default
// — parte del "esta mal la interfaz" de la spec.
function duracionServicioMin(s: {
  duracion?: number;
  duracion_activa_min?: number | null;
  duracion_espera_min?: number | null;
  duracion_activa_extra_min?: number | null;
}): number {
  return (
    s.duracion ??
    ((s.duracion_activa_min || 0) +
      (s.duracion_espera_min || 0) +
      (s.duracion_activa_extra_min || 0) ||
      45)
  );
}

// ---------------------------------------------------------------------------
// ComboBuscador: select con buscador. La lista de servicios de un salon real
// pasa de cincuenta y la de clientas de quinientas: un <select> plano obliga
// a leerla entera. El popover es position:fixed al ancho del boton porque el
// cuerpo del modal scrollea (overflow auto) y recortaria un popover absoluto.
// ---------------------------------------------------------------------------
function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface OpcionCombo {
  id: string;
  etiqueta: string;
  detalle?: string;
}

function ComboBuscador({
  valor,
  opciones,
  onChange,
  placeholder,
  vacio,
  ariaLabel,
}: {
  valor: string;
  opciones: OpcionCombo[];
  onChange: (id: string) => void;
  placeholder: string;
  vacio?: string;
  ariaLabel?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (!(t as HTMLElement).closest?.("[data-combo-popover]")) setAbierto(false);
    };
    const alScrollar = () => setAbierto(false);
    document.addEventListener("mousedown", fuera);
    // Cualquier scroll (el cuerpo del modal, la pagina) despega el popover
    // del boton: mejor cerrarlo que dejarlo flotando en un sitio que ya no
    // corresponde a su campo.
    document.addEventListener("scroll", alScrollar, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("scroll", alScrollar, true);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    setQ("");
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(250, r.width) });
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [abierto]);

  const sel = opciones.find((o) => o.id === valor);
  const qn = normalizar(q.trim());
  const filtradas = qn
    ? opciones.filter(
        (o) =>
          normalizar(o.etiqueta).includes(qn) ||
          (o.detalle ? normalizar(o.detalle).includes(qn) : false),
      )
    : opciones;

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel ?? placeholder}
        onClick={() => setAbierto((v) => !v)}
        style={{
          width: "100%",
          padding: "7px 9px",
          borderRadius: 6,
          border: `1px solid ${T.border}`,
          background: T.bgPanel,
          color: sel ? T.text : T.textTer,
          fontSize: 12.5,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {sel ? sel.etiqueta : (vacio ?? placeholder)}
        </span>
        <span style={{ color: T.textTer, fontSize: 10, flexShrink: 0 }}>▾</span>
      </button>
      {abierto && pos && (
        <div
          data-combo-popover
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            background: T.bgPanel,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            boxShadow: "0 12px 28px rgba(28,24,20,0.18)",
            zIndex: 60,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 9px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke={T.textTer}
              strokeWidth="2"
              style={{ flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAbierto(false);
                if (e.key === "Enter" && filtradas.length > 0) {
                  e.preventDefault();
                  onChange(filtradas[0].id);
                  setAbierto(false);
                }
              }}
              placeholder={placeholder}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                color: T.text,
                fontSize: 12.5,
                width: "100%",
                padding: 0,
              }}
            />
          </div>
          <div style={{ maxHeight: 232, overflowY: "auto" }}>
            {filtradas.length === 0 && (
              <div
                style={{
                  padding: "12px 10px",
                  fontSize: 12,
                  color: T.textTer,
                  textAlign: "center",
                }}
              >
                Sin resultados para “{q}”
              </div>
            )}
            {filtradas.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setAbierto(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  borderTop: `1px solid ${T.border}55`,
                  background: o.id === valor ? "rgba(244,80,30,0.08)" : "transparent",
                  color: T.text,
                  fontSize: 12.5,
                  fontWeight: o.id === valor ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                }}
              >
                  {o.etiqueta}
                </span>
                {o.detalle && (
                  <span style={{ color: T.textTer, fontSize: 10.5, flexShrink: 0 }}>
                    {o.detalle}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// La plantilla de columnas vive UNA vez y la comparten cabecera y filas: si
// cada una llevaba la suya, el header "Duracion" acababa encima del selector
// de profesional (el fallo de la spec de Jose: "en duracion esta el selector
// del que corta el pelo").
const GRID_COLS =
  "minmax(110px, 1fr) minmax(140px, 1.25fr) minmax(150px, 1.35fr) minmax(120px, 1.15fr) 74px 70px 24px";

const inputBase = {
  padding: "7px 9px",
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: T.bgPanel,
  color: T.text,
  fontSize: 12.5,
  boxSizing: "border-box",
  width: "100%",
} as const;

const labelMini = {
  fontSize: 10,
  fontWeight: 700,
  color: T.textTer,
  textTransform: "uppercase",
} as const;

export function ReservaGrupoModal({
  negocioId,
  profesionales,
  servicios,
  clientes,
  selectedDate,
  onClose,
  onSaved,
}: ReservaGrupoModalProps) {
  const { isMobile } = useResponsive();
  const [nombreGrupo, setNombreGrupo] = useState("Boda - Novia y Acompañantes");
  const [horaFinObjetivo, setHoraFinObjetivo] = useState("13:00");
  const [senalEuros, setSenalEuros] = useState("50");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");

  const [integrantes, setIntegrantes] = useState<IntegranteLinea[]>([
    {
      id: "1",
      nombre: "Novia",
      cliente_id: "",
      servicio_id: servicios[0]?.id || "",
      profesional_id: profesionales[0]?.id || "",
      duracion_min: duracionServicioMin(servicios[0] || ({} as any)),
      desfase_antes_fin_min: 0,
    },
    {
      id: "2",
      nombre: "Madrina",
      cliente_id: "",
      servicio_id: servicios[1]?.id || servicios[0]?.id || "",
      profesional_id: profesionales[1]?.id || profesionales[0]?.id || "",
      duracion_min: duracionServicioMin(servicios[1] || servicios[0] || ({} as any)),
      desfase_antes_fin_min: 15,
    },
  ]);

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const opcionesServicios: OpcionCombo[] = servicios.map((s) => ({
    id: s.id,
    etiqueta: s.nombre,
    detalle: `${duracionServicioMin(s)}′`,
  }));
  const opcionesProfesionales: OpcionCombo[] = profesionales.map((p) => ({
    id: p.id,
    etiqueta: p.nombre,
  }));
  // La ficha de cliente es opcional: sin ella la cita se crea igual (cliente
  // suelto), con ella queda vinculada al historial de la clienta.
  const opcionesClientes: OpcionCombo[] = [
    { id: "", etiqueta: "Sin ficha de cliente" },
    ...clientes.map((c) => ({
      id: c.id,
      etiqueta: c.nombre,
      detalle: c.telefono || undefined,
    })),
  ];

  const agregarIntegrante = () => {
    const srv = servicios[0];
    const prof = profesionales[0];
    setIntegrantes((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        nombre: `Acompañante ${prev.length + 1}`,
        cliente_id: "",
        servicio_id: srv?.id || "",
        profesional_id: prof?.id || "",
        duracion_min: srv ? duracionServicioMin(srv) : 45,
        desfase_antes_fin_min: 20,
      },
    ]);
  };

  const quitarIntegrante = (idx: number) => {
    setIntegrantes((prev) => prev.filter((_, i) => i !== idx));
  };

  // Los nombres por defecto ("Novia", "Madrina", "Acompañante 3") se
  // sustituyen solos al elegir ficha: nadie quiere borrar a mano lo que ya
  // sabe el sistema.
  const esNombrePorDefecto = (n: string) =>
    /^(Novia|Madrina|Acompañante \d+)$/.test(n.trim());

  const actualizarIntegrante = (
    idx: number,
    field: keyof IntegranteLinea,
    val: any,
  ) => {
    setIntegrantes((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        if (field === "servicio_id") {
          const srv = servicios.find((s) => s.id === val);
          return {
            ...it,
            servicio_id: val,
            duracion_min: srv ? duracionServicioMin(srv) : it.duracion_min,
          };
        }
        if (field === "cliente_id") {
          const cli = clientes.find((c) => c.id === val);
          return {
            ...it,
            cliente_id: val || undefined,
            nombre:
              cli && esNombrePorDefecto(it.nombre) ? cli.nombre : it.nombre,
          };
        }
        return { ...it, [field]: val };
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreGrupo.trim() || integrantes.length === 0) return;
    const incompleto = integrantes.findIndex(
      (it) => !it.servicio_id || !it.profesional_id,
    );
    if (incompleto >= 0) {
      setErrorMsg(
        `El integrante ${incompleto + 1} (${integrantes[incompleto].nombre || "sin nombre"}) necesita servicio y profesional.`,
      );
      return;
    }
    try {
      setGuardando(true);
      setErrorMsg("");

      const [hh, mm] = horaFinObjetivo.split(":").map(Number);
      const finDate = new Date(selectedDate);
      finDate.setHours(hh || 13, mm || 0, 0, 0);

      const payloadLineas = integrantes.map((it) => ({
        nombre: it.nombre,
        cliente_id: it.cliente_id || null,
        servicio_id: it.servicio_id,
        profesional_id: it.profesional_id,
        duracion_min: it.duracion_min,
        desfase_antes_fin_min: it.desfase_antes_fin_min,
      }));

      const senalCents = Math.round(parseFloat(senalEuros || "0") * 100);

      const { data, error } = await supabase.rpc(
        "crear_reserva_grupo_hacia_atras",
        {
          p_nombre: nombreGrupo.trim(),
          p_hora_fin_objetivo: finDate.toISOString(),
          p_senal_cents: senalCents,
          p_contacto_nombre: contactoNombre.trim() || null,
          p_contacto_telefono: contactoTelefono.trim() || null,
          p_lineas: payloadLineas as any,
        },
      );

      if (error) throw error;
      const res = data as any;
      if (res && res.grupo_id) {
        onSaved(res.grupo_id);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(mensajeDeError(err, "No se pudo crear la reserva de grupo."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.60)",
        zIndex: 9999,
        display: "flex",
        // Movil: hoja que sube desde abajo, como el detalle de cita y el de
        // crear cita. Centrado en escritorio.
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 920,
          // dvh (no vh): en movil cuenta con la barra del navegador retraida.
          // El divisor de --mecha-zoom es el mismo pacto de tamanoTexto que
          // ya usan NewCitaModal y DetalleCitaModal: sin el, el modo "texto
          // grande" empujaba el pie fuera de la pantalla.
          maxHeight: isMobile
            ? "calc(100dvh / var(--mecha-zoom, 1))"
            : "calc(92dvh / var(--mecha-zoom, 1))",
          // El scroll ya no vive en la hoja: cabecera y botones quedan
          // anclados y el CUERPO scrollea dentro.
          overflow: "hidden",
          background: T.bgPanel,
          borderRadius: isMobile ? "16px 16px 0 0" : 16,
          border: isMobile ? "none" : `1px solid ${T.border}`,
          padding: isMobile ? "14px 14px 16px" : 22,
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
            flexShrink: 0,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: T.text,
              }}
            >
              Reserva de Grupo (Bodas & Eventos)
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12.5,
                color: T.textSec,
              }}
            >
              Planificación hacia atrás: asegura que todas las personas estén
              listas a la hora fijada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: T.textSec,
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Solo el cuerpo scrollea: la cabecera del modal y los botones de
              accion quedan siempre a la vista a los lados del scroll. */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              paddingRight: 2,
            }}
          >
          {/* Cabecera del Evento */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
              background: T.bgCard,
              padding: 14,
              borderRadius: 10,
              border: `1px solid ${T.border}`,
            }}
          >
            <div>
              <label style={{ ...labelMini, fontSize: 11 }}>
                Nombre del Grupo / Boda *
              </label>
              <input
                type="text"
                value={nombreGrupo}
                onChange={(e) => setNombreGrupo(e.target.value)}
                required
                style={{ ...inputBase, marginTop: 4 }}
              />
            </div>

            <div>
              <label style={{ ...labelMini, fontSize: 11 }}>
                Hora Fin Objetivo (Listas a las) *
              </label>
              <input
                type="time"
                value={horaFinObjetivo}
                onChange={(e) => setHoraFinObjetivo(e.target.value)}
                required
                style={{ ...inputBase, marginTop: 4 }}
              />
            </div>

            <div>
              <label style={{ ...labelMini, fontSize: 11 }}>
                Señal Requerida (€)
              </label>
              <input
                type="number"
                value={senalEuros}
                onChange={(e) => setSenalEuros(e.target.value)}
                placeholder="50"
                min={0}
                style={{ ...inputBase, marginTop: 4 }}
              />
            </div>

            <div>
              <label style={{ ...labelMini, fontSize: 11 }}>
                Persona de Contacto
              </label>
              <input
                type="text"
                placeholder="Ej. Marta Gómez"
                value={contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
                style={{ ...inputBase, marginTop: 4 }}
              />
            </div>

            <div>
              <label style={{ ...labelMini, fontSize: 11 }}>
                Teléfono de Contacto
              </label>
              <input
                type="tel"
                placeholder="Ej. 612 345 678"
                value={contactoTelefono}
                onChange={(e) => setContactoTelefono(e.target.value)}
                style={{ ...inputBase, marginTop: 4 }}
              />
            </div>
          </div>

          {/* Lista de Integrantes y Servicios */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: T.text,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Integrantes ({integrantes.length})
              </div>
              <button
                type="button"
                onClick={agregarIntegrante}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(244,80,30,0.10)",
                  color: T.primary,
                  border: "1px solid rgba(244,80,30,0.25)",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + Añadir Acompañante
              </button>
            </div>

            {!isMobile && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLS,
                  gap: 8,
                  padding: "0 10px 4px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: T.textTer,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <span>Nombre / Rol</span>
                <span>Cliente (ficha)</span>
                <span>Servicio</span>
                <span>Profesional</span>
                <span style={{ textAlign: "center" }} title="Minutos de servicio">Duración</span>
                <span style={{ textAlign: "center" }} title="Minutos antes de la hora límite">Antes fin</span>
                <span />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {integrantes.map((it, idx) =>
                isMobile ? (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: "10px 12px",
                      background: T.bgCard,
                      borderRadius: 10,
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: idx === 0 ? T.primary : T.textSec,
                          textTransform: "uppercase",
                        }}
                      >
                        {idx === 0
                          ? "Novia / Protagonista"
                          : `Acompañante #${idx + 1}`}
                      </span>
                      {integrantes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => quitarIntegrante(idx)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: 12,
                            padding: "2px 4px",
                          }}
                        >
                          ✕ Quitar
                        </button>
                      )}
                    </div>
                    <div>
                      <label style={labelMini}>Nombre / Rol</label>
                      <input
                        type="text"
                        value={it.nombre}
                        onChange={(e) =>
                          actualizarIntegrante(idx, "nombre", e.target.value)
                        }
                        placeholder="Ej. Novia, Madrina..."
                        style={{ ...inputBase, marginTop: 3 }}
                      />
                    </div>
                    <div>
                      <label style={labelMini}>Cliente (ficha opcional)</label>
                      <div style={{ marginTop: 3 }}>
                        <ComboBuscador
                          valor={it.cliente_id || ""}
                          opciones={opcionesClientes}
                          onChange={(id) =>
                            actualizarIntegrante(idx, "cliente_id", id)
                          }
                          placeholder="Buscar clienta por nombre o teléfono…"
                          vacio="Sin ficha de cliente"
                          ariaLabel={`Cliente del integrante ${idx + 1}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelMini}>Servicio</label>
                      <div style={{ marginTop: 3 }}>
                        <ComboBuscador
                          valor={it.servicio_id}
                          opciones={opcionesServicios}
                          onChange={(id) =>
                            actualizarIntegrante(idx, "servicio_id", id)
                          }
                          placeholder="Buscar servicio…"
                          ariaLabel={`Servicio del integrante ${idx + 1}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelMini}>Profesional</label>
                      <div style={{ marginTop: 3 }}>
                        <ComboBuscador
                          valor={it.profesional_id}
                          opciones={opcionesProfesionales}
                          onChange={(id) =>
                            actualizarIntegrante(idx, "profesional_id", id)
                          }
                          placeholder="Buscar profesional…"
                          ariaLabel={`Profesional del integrante ${idx + 1}`}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        alignItems: "end",
                      }}
                    >
                      <div>
                        <label style={labelMini}>Duración (min)</label>
                        <input
                          type="number"
                          min={5}
                          step={5}
                          value={it.duracion_min}
                          onChange={(e) =>
                            actualizarIntegrante(
                              idx,
                              "duracion_min",
                              Number(e.target.value) || 0,
                            )
                          }
                          style={{ ...inputBase, marginTop: 3 }}
                        />
                      </div>
                      <div>
                        <label
                          style={labelMini}
                          title="Minutos de margen antes de la hora de fin objetivo"
                        >
                          Lista antes de (min)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={5}
                          value={it.desfase_antes_fin_min ?? 0}
                          onChange={(e) =>
                            actualizarIntegrante(
                              idx,
                              "desfase_antes_fin_min",
                              Number(e.target.value) || 0,
                            )
                          }
                          placeholder="0"
                          style={{ ...inputBase, marginTop: 3 }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    key={it.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID_COLS,
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 10px",
                      background: T.bgCard,
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <input
                      type="text"
                      value={it.nombre}
                      onChange={(e) =>
                        actualizarIntegrante(idx, "nombre", e.target.value)
                      }
                      placeholder="Nombre/Rol"
                      style={inputBase}
                    />

                    <ComboBuscador
                      valor={it.cliente_id || ""}
                      opciones={opcionesClientes}
                      onChange={(id) =>
                        actualizarIntegrante(idx, "cliente_id", id)
                      }
                      placeholder="Buscar clienta…"
                      vacio="Sin ficha"
                      ariaLabel={`Cliente del integrante ${idx + 1}`}
                    />

                    <ComboBuscador
                      valor={it.servicio_id}
                      opciones={opcionesServicios}
                      onChange={(id) =>
                        actualizarIntegrante(idx, "servicio_id", id)
                      }
                      placeholder="Buscar servicio…"
                      ariaLabel={`Servicio del integrante ${idx + 1}`}
                    />

                    <ComboBuscador
                      valor={it.profesional_id}
                      opciones={opcionesProfesionales}
                      onChange={(id) =>
                        actualizarIntegrante(idx, "profesional_id", id)
                      }
                      placeholder="Buscar profesional…"
                      ariaLabel={`Profesional del integrante ${idx + 1}`}
                    />

                    <input
                      type="number"
                      min={5}
                      step={5}
                      title="Duración prevista del servicio (minutos). Se ajusta sola al cambiar el servicio."
                      value={it.duracion_min}
                      onChange={(e) =>
                        actualizarIntegrante(
                          idx,
                          "duracion_min",
                          Number(e.target.value) || 0,
                        )
                      }
                      style={{
                        ...inputBase,
                        padding: "6px 6px",
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    />

                    <input
                      type="number"
                      min={0}
                      step={5}
                      title="Minutos antes de la hora final (ej. 30 = lista 30 min antes)"
                      placeholder="0"
                      value={it.desfase_antes_fin_min ?? 0}
                      onChange={(e) =>
                        actualizarIntegrante(
                          idx,
                          "desfase_antes_fin_min",
                          Number(e.target.value) || 0,
                        )
                      }
                      style={{
                        ...inputBase,
                        padding: "6px 6px",
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    />

                    {integrantes.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => quitarIntegrante(idx)}
                        title="Eliminar acompañante"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#dc2626",
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: 13,
                          padding: 0,
                        }}
                      >
                        ✕
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ),
              )}
            </div>
          </div>

          </div>

          {errorMsg && (
            <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
              {errorMsg}
            </div>
          )}

          {/* Botones de Acción */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 6,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: T.bgCard,
                color: T.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              style={{
                padding: "9px 22px",
                borderRadius: 8,
                background: T.primary,
                color: "#fff",
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: guardando ? "not-allowed" : "pointer",
                opacity: guardando ? 0.7 : 1,
              }}
            >
              {guardando
                ? "Planificando citas..."
                : `Crear Reserva (${integrantes.length} citas)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
