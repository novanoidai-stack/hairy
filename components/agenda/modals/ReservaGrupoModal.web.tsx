import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { DESIGN_TOKENS as T } from "@/lib/designTokens";
import { mensajeDeError } from "@/lib/errores";

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
  servicios: Array<{ id: string; nombre: string; duracion: number; precio: number }>;
  clientes: Array<{ id: string; nombre: string; telefono?: string }>;
  selectedDate: Date;
  onClose: () => void;
  onSaved: (grupoId: string) => void;
}

export function ReservaGrupoModal({
  negocioId,
  profesionales,
  servicios,
  clientes,
  selectedDate,
  onClose,
  onSaved,
}: ReservaGrupoModalProps) {
  const [nombreGrupo, setNombreGrupo] = useState("Boda - Novia y Acompañantes");
  const [horaFinObjetivo, setHoraFinObjetivo] = useState("13:00");
  const [senalEuros, setSenalEuros] = useState("50");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");

  const [integrantes, setIntegrantes] = useState<IntegranteLinea[]>([
    {
      id: "1",
      nombre: "Novia",
      servicio_id: servicios[0]?.id || "",
      profesional_id: profesionales[0]?.id || "",
      duracion_min: servicios[0]?.duracion || 60,
      desfase_antes_fin_min: 0,
    },
    {
      id: "2",
      nombre: "Madrina",
      servicio_id: servicios[1]?.id || servicios[0]?.id || "",
      profesional_id: profesionales[1]?.id || profesionales[0]?.id || "",
      duracion_min: servicios[1]?.duracion || 45,
      desfase_antes_fin_min: 15,
    },
  ]);

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const agregarIntegrante = () => {
    const srv = servicios[0];
    const prof = profesionales[0];
    setIntegrantes((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        nombre: `Acompañante ${prev.length + 1}`,
        servicio_id: srv?.id || "",
        profesional_id: prof?.id || "",
        duracion_min: srv?.duracion || 45,
        desfase_antes_fin_min: 20,
      },
    ]);
  };

  const quitarIntegrante = (idx: number) => {
    setIntegrantes((prev) => prev.filter((_, i) => i !== idx));
  };

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
            duracion_min: srv?.duracion || it.duracion_min,
          };
        }
        return { ...it, [field]: val };
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreGrupo.trim() || integrantes.length === 0) return;
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
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          overflowY: "auto",
          background: T.bgPanel,
          borderRadius: 16,
          border: `1px solid ${T.border}`,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
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
              👰 Reserva de Grupo (Bodas & Eventos)
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
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          {/* Cabecera del Evento */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
              background: T.bgCard,
              padding: 14,
              borderRadius: 10,
              border: `1px solid ${T.border}`,
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.textTer,
                  textTransform: "uppercase",
                }}
              >
                Nombre del Grupo / Boda *
              </label>
              <input
                type="text"
                value={nombreGrupo}
                onChange={(e) => setNombreGrupo(e.target.value)}
                required
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.bgPanel,
                  color: T.text,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.textTer,
                  textTransform: "uppercase",
                }}
              >
                Hora Fin Objetivo (Listas a las) *
              </label>
              <input
                type="time"
                value={horaFinObjetivo}
                onChange={(e) => setHoraFinObjetivo(e.target.value)}
                required
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.bgPanel,
                  color: T.text,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.textTer,
                  textTransform: "uppercase",
                }}
              >
                Señal Requerida (€)
              </label>
              <input
                type="number"
                value={senalEuros}
                onChange={(e) => setSenalEuros(e.target.value)}
                placeholder="50"
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.bgPanel,
                  color: T.text,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Contacto Principal */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              background: T.bgCard,
              padding: 12,
              borderRadius: 10,
              border: `1px solid ${T.border}`,
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.textTer,
                  textTransform: "uppercase",
                }}
              >
                Persona de Contacto
              </label>
              <input
                type="text"
                placeholder="Ej. Marta Gómez"
                value={contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.bgPanel,
                  color: T.text,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.textTer,
                  textTransform: "uppercase",
                }}
              >
                Teléfono de Contacto
              </label>
              <input
                type="tel"
                placeholder="Ej. 612 345 678"
                value={contactoTelefono}
                onChange={(e) => setContactoTelefono(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.bgPanel,
                  color: T.text,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
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

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {integrantes.map((it, idx) => (
                <div
                  key={it.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1.5fr 1.2fr 80px 30px",
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
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      background: T.bgPanel,
                      color: T.text,
                      fontSize: 12,
                    }}
                  />

                  <select
                    value={it.servicio_id}
                    onChange={(e) =>
                      actualizarIntegrante(idx, "servicio_id", e.target.value)
                    }
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      background: T.bgPanel,
                      color: T.text,
                      fontSize: 12,
                    }}
                  >
                    {servicios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre} ({s.duracion}′)
                      </option>
                    ))}
                  </select>

                  <select
                    value={it.profesional_id}
                    onChange={(e) =>
                      actualizarIntegrante(
                        idx,
                        "profesional_id",
                        e.target.value,
                      )
                    }
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      background: T.bgPanel,
                      color: T.text,
                      fontSize: 12,
                    }}
                  >
                    {profesionales.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>

                  <div
                    title="Duración prevista"
                    style={{
                      fontSize: 11,
                      color: T.textSec,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    {it.duracion_min} min
                  </div>

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
                        fontSize: 13,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
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
