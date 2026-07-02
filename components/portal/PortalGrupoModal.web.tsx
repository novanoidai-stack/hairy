// Modal auto-contenido para reserva de grupo en el portal público.
// Cada asistente elige nombre, servicio y profesional; todos empiezan a la misma hora.
// Se apoya en crear_cita_publica_grupo (max 6 asistentes, sin depósito online v0).

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  crearGrupoPublico, getDisponibilidad, fechaISOaClave,
  type PortalInfo, type PortalServicio, type PortalProfesional, type SlotDisponible,
  type AsistenteGrupo,
} from '@/lib/reservaPublica';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PORTAL_TOKENS } from '@/lib/portalTokens';

const T = PORTAL_TOKENS;

interface Props {
  slug: string;
  info: PortalInfo;
  onClose: () => void;
  onSuccess: (r: { total: number; inicio: string }) => void;
}

interface AsistenteState { nombre: string; servicioId: string; profesionalId: string; }

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtFechaLarga(d: Date) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function PortalGrupoModal({ slug, info, onClose, onSuccess }: Props) {
  const primerServicio = info.servicios[0]?.id || '';
  const primerProf = info.profesionales[0]?.id || '';
  const [asistentes, setAsistentes] = useState<AsistenteState[]>(() => [
    { nombre: '', servicioId: primerServicio, profesionalId: primerProf },
    { nombre: '', servicioId: primerServicio, profesionalId: primerProf },
  ]);
  const [fecha, setFecha] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [slots, setSlots] = useState<SlotDisponible[]>([]);
  const [slotElegido, setSlotElegido] = useState<string | null>(null);
  const [reservanteNombre, setReservanteNombre] = useState('');
  const [reservanteTelefono, setReservanteTelefono] = useState('');
  const [reservanteEmail, setReservanteEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Horas comunes: interseccion de horas libres para (servicio, prof) de cada asistente.
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const clave = fechaISOaClave(fecha);
        const perAsistente = await Promise.all(
          asistentes.map((a) => getDisponibilidad(slug, a.servicioId, clave, a.profesionalId))
        );
        if (cancel) return;
        // Interseccion: hora ISO comun a TODOS los asistentes (misma hora de inicio).
        const horasComunes = perAsistente[0]?.map((s) => s.slot) || [];
        const setsExtras = perAsistente.slice(1).map((arr) => new Set(arr.map((s) => s.slot)));
        const comunes = horasComunes.filter((h) => setsExtras.every((set) => set.has(h)));
        // Devolvemos representantes (uno por hora comun) del primer asistente para pintar la lista.
        const primer = perAsistente[0] || [];
        setSlots(primer.filter((s) => comunes.includes(s.slot)));
      } catch {
        setSlots([]);
      } finally {
        if (!cancel) setLoadingSlots(false);
      }
    })();
    return () => { cancel = true; };
  }, [slug, fecha, asistentes.map((a) => `${a.servicioId}|${a.profesionalId}`).join(',')]);

  const puedeEnviar = useMemo(() => {
    if (!slotElegido) return false;
    if (asistentes.some((a) => !a.nombre.trim() || !a.servicioId || !a.profesionalId)) return false;
    if (!reservanteNombre.trim() || !reservanteTelefono.trim()) return false;
    if (!consent) return false;
    return true;
  }, [slotElegido, asistentes, reservanteNombre, reservanteTelefono, consent]);

  const addAsistente = () => {
    if (asistentes.length >= 6) return;
    setAsistentes([...asistentes, { nombre: '', servicioId: primerServicio, profesionalId: primerProf }]);
  };
  const rmAsistente = (i: number) => {
    if (asistentes.length <= 1) return;
    setAsistentes(asistentes.filter((_, idx) => idx !== i));
  };
  const setAsistente = (i: number, patch: Partial<AsistenteState>) => {
    setAsistentes(asistentes.map((a, idx) => idx === i ? { ...a, ...patch } : a));
    setSlotElegido(null);
  };

  const enviar = async () => {
    if (!slotElegido) return;
    setEnviando(true); setError('');
    try {
      const payload: AsistenteGrupo[] = asistentes.map((a) => ({
        nombre: a.nombre.trim(),
        servicioId: a.servicioId,
        profesionalId: a.profesionalId,
      }));
      const r = await crearGrupoPublico({
        slug,
        inicioISO: slotElegido,
        reservanteNombre: reservanteNombre.trim(),
        reservanteTelefono: reservanteTelefono.trim(),
        reservanteEmail: reservanteEmail.trim() || undefined,
        asistentes: payload,
        consentimientoDatos: consent,
      });
      onSuccess({ total: r.total, inicio: r.inicio });
    } catch (e: any) {
      setError(e?.message || 'No se pudo crear la reserva de grupo');
    } finally {
      setEnviando(false);
    }
  };

  const diasProximos = useMemo(() => {
    const out: Date[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) { const d = new Date(base); d.setDate(base.getDate() + i); out.push(d); }
    return out;
  }, []);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,7,10,0.75)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, padding: 22, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 30px 90px rgba(0,0,0,0.65)', color: T.text }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Reserva de grupo</div>
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>
              Varias personas, misma hora de inicio. Cada una elige su servicio y profesional.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.textTer, fontSize: 22, cursor: 'pointer', padding: '0 6px' }}>×</button>
        </div>

        {/* Asistentes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {asistentes.map((a, i) => (
            <div key={i} style={{ background: T.cardHi, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.primaryHi, background: T.primarySoft, borderRadius: 999, padding: '2px 10px' }}>Asistente {i + 1}</div>
                <input
                  className="rp-field"
                  placeholder="Nombre"
                  value={a.nombre}
                  onChange={(e) => setAsistente(i, { nombre: e.target.value })}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13 }}
                />
                {asistentes.length > 1 && (
                  <button onClick={() => rmAsistente(i)} title="Quitar" style={{ background: 'transparent', border: 'none', color: T.textTer, fontSize: 18, cursor: 'pointer', padding: '0 6px' }}>×</button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select
                  className="rp-field"
                  value={a.servicioId}
                  onChange={(e) => setAsistente(i, { servicioId: e.target.value })}
                  style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13 }}
                >
                  {info.servicios.map((s: PortalServicio) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
                <select
                  className="rp-field"
                  value={a.profesionalId}
                  onChange={(e) => setAsistente(i, { profesionalId: e.target.value })}
                  style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13 }}
                >
                  {info.profesionales.map((p: PortalProfesional) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {asistentes.length < 6 && (
            <button onClick={addAsistente} style={{ padding: '8px 12px', borderRadius: 9, border: `1px dashed ${T.border}`, background: 'transparent', color: T.primaryHi, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Añadir asistente
            </button>
          )}
        </div>

        {/* Dia */}
        <div style={{ fontSize: 12, color: T.textTer, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Día</div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
          {diasProximos.map((d) => {
            const activo = d.toDateString() === fecha.toDateString();
            return (
              <button
                key={d.toISOString()}
                onClick={() => { setFecha(d); setSlotElegido(null); }}
                style={{ flexShrink: 0, minWidth: 62, padding: '8px 10px', borderRadius: 10, border: `1px solid ${activo ? T.primary : T.border}`, background: activo ? T.primarySoft : T.cardHi, color: T.text, cursor: 'pointer', textAlign: 'center' }}
              >
                <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase' }}>{d.toLocaleDateString('es-ES', { weekday: 'short' })}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{d.getDate()}</div>
              </button>
            );
          })}
        </div>

        {/* Slots comunes */}
        <div style={{ fontSize: 12, color: T.textTer, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
          Hora común disponible · {fmtFechaLarga(fecha)}
        </div>
        {loadingSlots ? (
          <div style={{ padding: 16, textAlign: 'center', color: T.textSec, fontSize: 13 }}>Buscando horas comunes...</div>
        ) : slots.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: T.textSec, fontSize: 13 }}>
            No hay hueco común para todos los asistentes en este día. Prueba otro día o cambia el profesional de alguien.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {slots.map((s) => (
              <button
                key={s.slot}
                onClick={() => setSlotElegido(s.slot)}
                className={`rp-slot ${slotElegido === s.slot ? 'rp-on' : ''}`}
                style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${T.border}`, background: T.cardHi, color: T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {fmtHora(s.slot)}
              </button>
            ))}
          </div>
        )}

        {/* Datos del reservante */}
        <div style={{ fontSize: 12, color: T.textTer, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Datos de contacto</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input
            className="rp-field"
            placeholder="Tu nombre"
            value={reservanteNombre}
            onChange={(e) => setReservanteNombre(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${T.border}`, fontSize: 13 }}
          />
          <PhoneInput value={reservanteTelefono} onChange={setReservanteTelefono} />
        </div>
        <input
          className="rp-field"
          placeholder="Email (opcional)"
          value={reservanteEmail}
          onChange={(e) => setReservanteEmail(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${T.border}`, fontSize: 13, width: '100%', marginBottom: 10 }}
        />

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: T.textSec, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Acepto el tratamiento de mis datos para gestionar la reserva. <a href="/privacidad.html" target="_blank" rel="noopener" style={{ color: T.primaryHi }}>Política de privacidad</a>.</span>
        </label>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(226,59,52,0.14)', color: '#ff8a80', fontSize: 12.5, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={!puedeEnviar || enviando}
            style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: puedeEnviar && !enviando ? T.primary : `${T.primary}66`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: puedeEnviar && !enviando ? 'pointer' : 'not-allowed' }}
          >
            {enviando ? 'Reservando...' : `Reservar grupo (${asistentes.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
