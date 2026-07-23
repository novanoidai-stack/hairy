import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getUserProfile } from "@/lib/auth";
import { CITA_STATUS, NEGOCIO_ID_FALLBACK } from "@/lib/constants";

export default function PapeleraModal({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: () => void;
}) {
  const [citasBorradas, setCitasBorradas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [clientesMap, setClientesMap] = useState<Record<string, any>>({});
  const [serviciosMap, setServiciosMap] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchPapelera();
  }, []);

  const fetchPapelera = async () => {
    setLoading(true);
    try {
      const profile = await getUserProfile();
      const negocioId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;

      // Obtener citas ocultas (borradas) recientes
      const { data, error } = await supabase
        .from("citas")
        .select("*")
        .eq("negocio_id", negocioId)
        .eq("oculta_en_calendario", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setCitasBorradas(data || []);

      if (data && data.length > 0) {
        // Cargar nombres de clientes y servicios
        const clienteIds = [...new Set(data.map((c) => c.cliente_id).filter(Boolean))];
        const servicioIds = [...new Set(data.map((c) => c.servicio_id).filter(Boolean))];

        if (clienteIds.length > 0) {
          const { data: clis } = await supabase
            .from("clientes")
            .select("id, nombre")
            .in("id", clienteIds);
          if (clis) {
            const m = { ...clientesMap };
            clis.forEach((c) => (m[c.id] = c));
            setClientesMap(m);
          }
        }
        if (servicioIds.length > 0) {
          const { data: servs } = await supabase
            .from("servicios")
            .select("id, nombre")
            .in("id", servicioIds);
          if (servs) {
            const m = { ...serviciosMap };
            servs.forEach((s) => (m[s.id] = s));
            setServiciosMap(m);
          }
        }
      }
    } catch (e) {
      console.error("Error cargando papelera", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRestaurar = async (cita: any) => {
    setRestaurando(cita.id);
    try {
      const { error } = await supabase
        .from("citas")
        .update({
          oculta_en_calendario: false,
          estado: CITA_STATUS.CONFIRMADA,
          motivo_cancelacion: null,
          cancelado_por: null,
        })
        .eq("id", cita.id);
      
      if (error) throw error;
      
      // Si era de un grupo, preguntar si restaurar todas? Por ahora solo restaura esta,
      // para evitar problemas. Ojo, si restauras una de un grupo, igual quieres restaurar el resto.
      if (cita.grupo_id) {
        const ok = window.confirm("Esta cita pertenece a un grupo (citas encadenadas). ¿Restaurar también el resto de citas del grupo borradas?");
        if (ok) {
          await supabase
            .from("citas")
            .update({
              oculta_en_calendario: false,
              estado: CITA_STATUS.CONFIRMADA,
              motivo_cancelacion: null,
              cancelado_por: null,
            })
            .eq("grupo_id", cita.grupo_id)
            .eq("oculta_en_calendario", true);
        }
      }

      onRestored();
      fetchPapelera();
    } catch (e) {
      console.error("Error al restaurar", e);
      alert("Error al restaurar la cita");
    } finally {
      setRestaurando(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="m-fade-in m-scale-up"
        style={{
          background: "#fff",
          width: 500,
          maxWidth: "90vw",
          maxHeight: "80vh",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Papelera de reciclaje</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            &times;
          </button>
        </div>
        <div style={{ padding: 20, overflowY: "auto", flex: 1, background: "#f9fafb" }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "#6b7280" }}>Cargando...</p>
          ) : citasBorradas.length === 0 ? (
            <p style={{ textAlign: "center", color: "#6b7280", padding: "40px 0" }}>La papelera está vacía.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {citasBorradas.map((cita) => {
                const clienteNombre = clientesMap[cita.cliente_id]?.nombre || "Cliente desconocido";
                const servicioNombre = serviciosMap[cita.servicio_id]?.nombre || "Servicio no especificado";
                return (
                  <div
                    key={cita.id}
                    style={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{clienteNombre}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{servicioNombre}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                        {new Date(cita.inicio).toLocaleString()}
                        {cita.motivo_cancelacion ? ` · Cancelada: ${cita.motivo_cancelacion}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestaurar(cita)}
                      disabled={restaurando === cita.id}
                      style={{
                        padding: "6px 12px",
                        background: "#f0fdf4",
                        color: "#16a34a",
                        border: "1px solid #bbf7d0",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: restaurando === cita.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {restaurando === cita.id ? "Restaurando..." : "Restaurar"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
