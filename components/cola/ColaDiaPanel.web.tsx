import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DESIGN_TOKENS as T } from "@/lib/designTokens";
import { mensajeDeError } from "@/lib/errores";

interface ColaItem {
  id: string;
  cliente_nombre: string;
  telefono: string | null;
  servicio_id: string | null;
  profesional_id: string | null;
  llegada_at: string;
  llamado_at: string | null;
  atendido_at: string | null;
  estado: "esperando" | "en_atencion" | "completado" | "cancelado" | "no_presentado";
  orden: number;
  notas: string | null;
}

interface ColaDiaPanelProps {
  negocioId: string;
  profesionales: Array<{ id: string; nombre: string }>;
  servicios: Array<{ id: string; nombre: string; precio: number }>;
  onAtender?: (item: ColaItem) => void;
  onCobrar?: (item: ColaItem) => void;
}

export function ColaDiaPanel({
  negocioId,
  profesionales,
  servicios,
  onAtender,
  onCobrar,
}: ColaDiaPanelProps) {
  const [items, setItems] = useState<ColaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [servicioId, setServicioId] = useState("");
  const [profId, setProfId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const cargarCola = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("cola_dia")
        .select("*")
        .eq("negocio_id", negocioId)
        .eq("fecha", today)
        .order("orden", { ascending: true });

      if (error) throw error;
      setItems((data || []) as ColaItem[]);
    } catch (err: any) {
      console.error("Error cargando cola del día:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCola();

    // Suscripción Realtime para cola de barbería
    const canal = supabase
      .channel(`cola-dia-${negocioId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cola_dia",
          filter: `negocio_id=eq.${negocioId}`,
        },
        () => {
          cargarCola();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [negocioId]);

  const handleAgregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    try {
      setEnviando(true);
      setErrorMsg("");
      const { error } = await supabase.rpc("unirse_cola_dia", {
        p_cliente_nombre: nombre.trim(),
        p_telefono: telefono.trim() || null,
        p_servicio_id: servicioId || null,
        p_profesional_id: profId || null,
      });
      if (error) throw error;
      setNombre("");
      setTelefono("");
      setServicioId("");
      setProfId("");
      cargarCola();
    } catch (err: any) {
      setErrorMsg(mensajeDeError(err, "No se pudo añadir a la cola."));
    } finally {
      setEnviando(false);
    }
  };

  const cambiarEstado = async (
    id: string,
    nuevoEstado: ColaItem["estado"],
  ) => {
    try {
      const updates: any = { estado: nuevoEstado };
      if (nuevoEstado === "en_atencion") updates.llamado_at = new Date().toISOString();
      if (nuevoEstado === "completado") updates.atendido_at = new Date().toISOString();
      if (nuevoEstado === "cancelado") updates.cancelado_at = new Date().toISOString();

      const { error } = await supabase.from("cola_dia").update(updates).eq("id", id);
      if (error) throw error;
      cargarCola();
    } catch (err: any) {
      console.error("Error actualizando turno:", err);
    }
  };

  const esperando = items.filter((i) => i.estado === "esperando");
  const enAtencion = items.filter((i) => i.estado === "en_atencion");
  const completados = items.filter((i) => i.estado === "completado");

  // Tiempo estimado de espera promedio (~20 min por turno esperando)
  const tiempoEstimadoMin = esperando.length * 20;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 18,
        background: T.bgPanel,
        borderRadius: 14,
        border: `1px solid ${T.border}`,
      }}
    >
      {/* Cabecera y Resumen de Espera */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: T.text,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>💈 Cola del Día</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(244,80,30,0.12)",
                color: T.primary,
                fontWeight: 700,
              }}
            >
              Walk-in en Vivo
            </span>
          </h3>
          <p
            style={{
              margin: "3px 0 0",
              fontSize: 12.5,
              color: T.textSec,
            }}
          >
            Gestión de turnos espontáneos para barberías y servicios sin cita.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 14px",
            background: T.bgCard,
            borderRadius: 10,
            border: `1px solid ${T.border}`,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: T.primary,
              }}
            >
              {esperando.length}
            </div>
            <div style={{ fontSize: 10, color: T.textTer, fontWeight: 700 }}>
              ESPERANDO
            </div>
          </div>
          <div
            style={{
              width: 1,
              height: 24,
              background: T.border,
            }}
          />
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: tiempoEstimadoMin > 45 ? "#dc2626" : "#059669",
              }}
            >
              ~{tiempoEstimadoMin}′
            </div>
            <div style={{ fontSize: 10, color: T.textTer, fontWeight: 700 }}>
              ESPERA EST.
            </div>
          </div>
        </div>
      </div>

      {/* Formulario de Entrada Rápida */}
      <form
        onSubmit={handleAgregar}
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          background: T.bgCard,
          padding: 12,
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="Nombre del cliente *"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          style={{
            flex: "1 1 140px",
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.bgPanel,
            color: T.text,
            fontSize: 13,
          }}
        />
        <input
          type="tel"
          placeholder="Teléfono (opcional)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          style={{
            flex: "1 1 120px",
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.bgPanel,
            color: T.text,
            fontSize: 13,
          }}
        />
        <select
          value={servicioId}
          onChange={(e) => setServicioId(e.target.value)}
          style={{
            flex: "1 1 130px",
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.bgPanel,
            color: T.text,
            fontSize: 13,
          }}
        >
          <option value="">Cualquier servicio</option>
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <select
          value={profId}
          onChange={(e) => setProfId(e.target.value)}
          style={{
            flex: "1 1 130px",
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.bgPanel,
            color: T.text,
            fontSize: 13,
          }}
        >
          <option value="">Cualquier barbero</option>
          {profesionales.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={enviando || !nombre.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: T.primary,
            color: "#fff",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            opacity: enviando || !nombre.trim() ? 0.6 : 1,
          }}
        >
          {enviando ? "Añadiendo..." : "+ Dar Turno"}
        </button>
      </form>

      {errorMsg && (
        <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}

      {/* Columnas de Turnos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {/* Columna: Esperando */}
        <div
          style={{
            background: T.bgCard,
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: T.textSec,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>En Sala de Espera</span>
            <span>({esperando.length})</span>
          </div>

          {esperando.length === 0 ? (
            <div
              style={{
                fontSize: 12.5,
                color: T.textTer,
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              No hay clientes esperando
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {esperando.map((it, idx) => {
                const minEspera = Math.round(
                  (Date.now() - new Date(it.llegada_at).getTime()) / 60000,
                );
                const srvName =
                  servicios.find((s) => s.id === it.servicio_id)?.nombre ||
                  "Servicio";
                const profName =
                  profesionales.find((p) => p.id === it.profesional_id)
                    ?.nombre || "Cualquiera";

                return (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      background: T.bgPanel,
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: T.text,
                        }}
                      >
                        #{it.orden} · {it.cliente_nombre}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: T.textSec,
                          marginTop: 2,
                        }}
                      >
                        {srvName} · Barbero: {profName}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: minEspera > 30 ? "#dc2626" : T.textTer,
                          fontWeight: 600,
                          marginTop: 1,
                        }}
                      >
                        Llegó hace {minEspera} min
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => {
                          cambiarEstado(it.id, "en_atencion");
                          if (onAtender) onAtender(it);
                        }}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 6,
                          background: "rgba(16,185,129,0.12)",
                          color: "#059669",
                          border: "1px solid rgba(16,185,129,0.30)",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Llamar
                      </button>
                      <button
                        type="button"
                        onClick={() => cambiarEstado(it.id, "cancelado")}
                        style={{
                          padding: "5px 8px",
                          borderRadius: 6,
                          background: "transparent",
                          color: T.textTer,
                          border: `1px solid ${T.border}`,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Columna: En Atención (En el Sillón) */}
        <div
          style={{
            background: T.bgCard,
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#059669",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>En el Sillón</span>
            <span>({enAtencion.length})</span>
          </div>

          {enAtencion.length === 0 ? (
            <div
              style={{
                fontSize: 12.5,
                color: T.textTer,
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              Ningún barbero atendiendo turno walk-in
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {enAtencion.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 10px",
                    background: "rgba(16,185,129,0.06)",
                    borderRadius: 8,
                    border: "1px solid rgba(16,185,129,0.25)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: T.text,
                      }}
                    >
                      {it.cliente_nombre}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: T.textSec,
                        marginTop: 2,
                      }}
                    >
                      En proceso de corte
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        cambiarEstado(it.id, "completado");
                        if (onCobrar) onCobrar(it);
                      }}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        background: T.primary,
                        color: "#fff",
                        border: "none",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Finalizar y Cobrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
