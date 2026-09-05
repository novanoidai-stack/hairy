// ===========================================================================
// Panel de Fases Técnicas y Reloj de Reposo en Vivo (Specs 1 y 4)
// Muestra el desglose de fases (activa, reposo, transición) y el cronómetro
// en tiempo real para control de tiempos de tinte/técnicos en cabina.
// ===========================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS as TOKENS } from '@/lib/designTokens';
import { type CitaFase } from '@/lib/agenda/citaFases';
import {
  serviciosQueCabenEnReposos,
  type ServicioParaEncaje,
} from '@/lib/agenda/serviciosCompatiblesReposo';

interface FasesCitaPanelProps {
  cita: any;
  onFasesUpdated?: () => void;
  isMobileOrTablet?: boolean;
}

export function FasesCitaPanel({
  cita,
  onFasesUpdated,
  isMobileOrTablet = false,
}: FasesCitaPanelProps) {
  const [fases, setFases] = useState<CitaFase[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [catalogo, setCatalogo] = useState<ServicioParaEncaje[]>([]);

  // El catalogo vivo del salon, para la cinta de "aqui cabe": que servicios
  // caben en los reposos de ESTA cita (Spec 1, UI incremental).
  useEffect(() => {
    if (!cita?.negocio_id) return;
    let vivo = true;
    supabase
      .from('servicios')
      .select('id, nombre, duracion_activa_min, duracion_espera_min')
      .eq('negocio_id', cita.negocio_id)
      .eq('activo', true)
      .then(({ data }: any) => {
        if (!vivo || !data) return;
        setCatalogo(
          data.map((s: any) => ({
            id: s.id,
            nombre: s.nombre,
            duracionTotalMin:
              (s.duracion_activa_min || 0) + (s.duracion_espera_min || 0),
          })),
        );
      });
    return () => {
      vivo = false;
    };
  }, [cita?.negocio_id]);

  // Tick cada segundo para el cronómetro si hay alguna fase activa
  useEffect(() => {
    const hayActiva = fases.some((f) => f.tipo === 'reposo' && f.iniciada_at && !f.cerrada_at);
    if (!hayActiva) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [fases]);

  // Cargar fases de la cita
  const cargarFases = async () => {
    if (!cita?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cita_fases')
        .select('*')
        .eq('cita_id', cita.id)
        .order('orden', { ascending: true });

      if (!error && data && data.length > 0) {
        setFases(data as CitaFase[]);
      } else {
        // Generar fases provisionales a partir de fin_activa / fin_espera
        const prov: CitaFase[] = [];
        if (cita.fin_activa && cita.fin_espera && new Date(cita.fin_espera) > new Date(cita.fin_activa)) {
          prov.push({
            orden: 1,
            tipo: 'activa',
            inicio: cita.inicio,
            fin: cita.fin_activa,
            etiqueta: 'Aplicación',
          });
          prov.push({
            orden: 2,
            tipo: 'reposo',
            inicio: cita.fin_activa,
            fin: cita.fin_espera,
            etiqueta: 'Reposo técnico',
          });
          if (new Date(cita.fin) > new Date(cita.fin_espera)) {
            prov.push({
              orden: 3,
              tipo: 'activa',
              inicio: cita.fin_espera,
              fin: cita.fin,
              etiqueta: 'Lavado y peinado',
            });
          }
        } else {
          prov.push({
            orden: 1,
            tipo: 'activa',
            inicio: cita.inicio,
            fin: cita.fin,
            etiqueta: 'Servicio',
          });
        }
        setFases(prov);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarFases();
  }, [cita?.id]);

  // Mover la frontera entre una fase y la siguiente ±N minutos (Spec 1, UI
  // incremental; en movil/tablet son los botones de ±5'). Desde el paso 4 se
  // escribe en cita_fases y el trigger de resumen recalcula las marcas solo.
  //
  // Va por `mover_frontera_fase` y no por dos `update` sueltos: son dos
  // escrituras que tienen que caer juntas o no caer (revision del 5 sep 2026).
  // A medias dejaban hueco o solape permanentes entre las fases, y desde el
  // paso 4 eso es la ocupacion real del salon, no un detalle de pintado.
  const moverFrontera = async (fase: CitaFase, deltaMin: number) => {
    const ordenadas = [...fases].sort((a, b) => a.orden - b.orden);
    const idx = ordenadas.findIndex((f) => f.orden === fase.orden);
    const next = ordenadas[idx + 1];
    if (!next || !fase.id || !next.id) return;

    const nueva = new Date(
      new Date(fase.fin).getTime() + deltaMin * 60000,
    ).toISOString();
    // 5' minimas a cada lado: una fase de 0 minutos no es una fase.
    if (
      new Date(nueva).getTime() - new Date(fase.inicio).getTime() < 300000 ||
      new Date(next.fin).getTime() - new Date(nueva).getTime() < 300000
    ) {
      return;
    }

    try {
      setActionLoading(`borde_${fase.orden}`);
      const { data, error } = await supabase.rpc('mover_frontera_fase', {
        p_fase_id: fase.id,
        p_siguiente_fase_id: next.id,
        p_nuevo: nueva,
      });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string } | null;
      if (!res?.ok) {
        // Un "no" razonado del servidor (un reposo cronometrandose, por
        // ejemplo) se dice en voz alta: antes el boton no hacia nada y no
        // habia forma de saber por que.
        window.dispatchEvent(
          new CustomEvent('mecha-toast', {
            detail: { text: res?.error || 'No se pudo mover la frontera.' },
          }),
        );
        return;
      }
      await cargarFases();
      onFasesUpdated?.();
    } catch (err: any) {
      console.error('Error al mover la frontera de fases:', err);
      window.dispatchEvent(
        new CustomEvent('mecha-toast', {
          detail: { text: mensajeDeError(err, 'No se pudo mover la frontera.') },
        }),
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleIniciarReposo = async (fase: CitaFase) => {
    try {
      setActionLoading(`ini_${fase.orden}`);
      const { data, error } = await supabase.rpc('iniciar_fase_reposo', {
        p_cita_id: cita.id,
        p_orden: fase.orden,
      });
      if (error) throw error;
      await cargarFases();
      onFasesUpdated?.();
    } catch (err: any) {
      console.error('Error al iniciar fase de reposo:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFinalizarReposo = async (fase: CitaFase) => {
    try {
      setActionLoading(`fin_${fase.orden}`);
      const { data, error } = await supabase.rpc('finalizar_fase_reposo', {
        p_cita_id: cita.id,
        p_orden: fase.orden,
      });
      if (error) throw error;
      await cargarFases();
      onFasesUpdated?.();
    } catch (err: any) {
      console.error('Error al finalizar fase de reposo:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // OJO: TODOS los hooks van ANTES de los returns tempranos de abajo.
  //
  // Aqui debajo habia un `useMemo` (la cinta de "aqui cabe"), y con los dos
  // `return null` por delante el numero de hooks cambiaba entre renders: el
  // primero, sin fases cargadas, salia antes de llegar a el; el segundo, ya con
  // datos, lo ejecutaba. React tumba el arbol con el error #310 ("rendered more
  // hooks than during the previous render"), y como este panel vive dentro de
  // DetalleCitaModal, lo que se caia era la AGENDA entera. Detectado por el
  // canario contra www.mechaa.es el 5 sep 2026: 143 errores de consola.
  const ordenadas = [...fases].sort((a, b) => a.orden - b.orden);
  const encajes = useMemo(
    () => serviciosQueCabenEnReposos(ordenadas, catalogo),
    [fases, catalogo],
  );

  if (loading && fases.length === 0) {
    return null;
  }

  // Si es un servicio simple sin reposos
  const tieneReposo = fases.some((f) => f.tipo === 'reposo');
  if (!tieneReposo && fases.length <= 1) {
    return null;
  }

  const fmtMin = (ini: string, fin: string) => {
    const min = Math.round((new Date(fin).getTime() - new Date(ini).getTime()) / 60000);
    return `${min}′`;
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // La cinta de "aqui cabe" y los botones de frontera solo tienen sentido con
  // fases reales (con id) y sin ningun reloj de reposo corriendo. `ordenadas` y
  // `encajes` se calculan arriba, con el resto de hooks.
  const relojCorriendo = ordenadas.some(
    (f) => f.tipo === 'reposo' && f.iniciada_at && !f.cerrada_at,
  );

  return (
    <div
      style={{
        margin: isMobileOrTablet ? '14px 18px 0' : '16px 32px 0',
        padding: '14px 16px',
        background: '#ffffff',
        border: '1px solid rgba(40,30,24,0.12)',
        borderRadius: 14,
        boxShadow: '0 1px 4px rgba(28,24,20,0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 16 }}>⏱️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: TOKENS.text }}>
              Fases Técnicas y Reloj de Cabina
            </div>
            <div style={{ fontSize: 11, color: TOKENS.textSec }}>
              Control de tiempos reales y avisos de reposo en vivo
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fases.map((fase) => {
          const esReposo = fase.tipo === 'reposo';
          const esTransicion = fase.tipo === 'transicion';
          const estaCorriendo = esReposo && fase.iniciada_at && !fase.cerrada_at;
          const estaCerrada = esReposo && !!fase.cerrada_at;

          let tiempoRestanteMin = 0;
          let tiempoTranscurridoMin = 0;
          let planMin = Math.round((new Date(fase.fin).getTime() - new Date(fase.inicio).getTime()) / 60000);
          let desvioMin = 0;

          if (estaCorriendo && fase.iniciada_at) {
            tiempoTranscurridoMin = Math.floor((nowTick - new Date(fase.iniciada_at).getTime()) / 60000);
            tiempoRestanteMin = planMin - tiempoTranscurridoMin;
          } else if (estaCerrada && fase.iniciada_at && fase.cerrada_at) {
            const realMin = Math.round(
              (new Date(fase.cerrada_at).getTime() - new Date(fase.iniciada_at).getTime()) / 60000,
            );
            desvioMin = realMin - planMin;
          }

          const pasadoTiempo = estaCorriendo && tiempoRestanteMin < 0;

          return (
            <div
              key={fase.orden}
              style={{
                display: 'flex',
                flexDirection: isMobileOrTablet ? 'column' : 'row',
                alignItems: isMobileOrTablet ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: 10,
                background: estaCorriendo
                  ? pasadoTiempo
                    ? 'rgba(239,68,68,0.10)'
                    : 'rgba(16,185,129,0.10)'
                  : esReposo
                    ? 'rgba(245,158,11,0.06)'
                    : esTransicion
                      ? 'rgba(59,130,246,0.05)'
                      : 'rgba(245,245,247,0.80)',
                border: `1px solid ${
                  estaCorriendo
                    ? pasadoTiempo
                      ? 'rgba(239,68,68,0.40)'
                      : 'rgba(16,185,129,0.40)'
                    : esReposo
                      ? 'rgba(245,158,11,0.22)'
                      : 'rgba(40,30,24,0.08)'
                }`,
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    background: esReposo ? TOKENS.warning : esTransicion ? '#3b82f6' : TOKENS.textSec,
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  {fase.orden}
                </span>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: TOKENS.text }}>
                      {fase.etiqueta || (esReposo ? 'Reposo' : esTransicion ? 'Transición' : 'Trabajo activo')}
                    </span>
                    {fase.recurso_tipo && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: 'rgba(59,130,246,0.12)',
                          color: '#2563eb',
                        }}
                      >
                        {fase.recurso_tipo}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: TOKENS.textSec }}>
                    {fmtTime(fase.inicio)} - {fmtTime(fase.fin)} · {fmtMin(fase.inicio, fase.fin)}
                  </div>
                  {(() => {
                    const idx = ordenadas.findIndex((f) => f.orden === fase.orden);
                    const next = ordenadas[idx + 1];
                    if (!next || !fase.id || !next.id || relojCorriendo) return null;
                    return (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => moverFrontera(fase, -5)}
                          disabled={actionLoading === `borde_${fase.orden}`}
                          title={`Acortar esta fase 5' y alargar la siguiente (frontera de las ${fmtTime(fase.fin)})`}
                          style={{
                            padding: '1px 7px',
                            borderRadius: 6,
                            border: '1px solid rgba(40,30,24,0.18)',
                            background: '#ffffff',
                            color: TOKENS.text,
                            fontSize: 10.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          −5′
                        </button>
                        <button
                          type="button"
                          onClick={() => moverFrontera(fase, 5)}
                          disabled={actionLoading === `borde_${fase.orden}`}
                          title={`Alargar esta fase 5' y acortar la siguiente (frontera de las ${fmtTime(fase.fin)})`}
                          style={{
                            padding: '1px 7px',
                            borderRadius: 6,
                            border: '1px solid rgba(40,30,24,0.18)',
                            background: '#ffffff',
                            color: TOKENS.text,
                            fontSize: 10.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          +5′
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Botones y estado del reloj de reposo */}
              {esReposo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: isMobileOrTablet ? 'flex-end' : 'center' }}>
                  {estaCorriendo ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 800,
                          color: pasadoTiempo ? '#dc2626' : '#059669',
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: pasadoTiempo ? '#fee2e2' : '#d1fae5',
                          animation: pasadoTiempo ? 'pulse 1s infinite' : 'none',
                        }}
                      >
                        {pasadoTiempo
                          ? `⚠️ PASADO +${Math.abs(tiempoRestanteMin)}′`
                          : `⏱️ Quedan ${tiempoRestanteMin}′ (${tiempoTranscurridoMin}/${planMin}′)`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleFinalizarReposo(fase)}
                        disabled={actionLoading === `fin_${fase.orden}`}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: '#059669',
                          color: '#ffffff',
                          fontSize: 11,
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {actionLoading === `fin_${fase.orden}` ? 'Guardando...' : '✅ Fin Reposo'}
                      </button>
                    </div>
                  ) : estaCerrada ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#059669',
                        padding: '2px 7px',
                        borderRadius: 6,
                        background: 'rgba(16,185,129,0.12)',
                      }}
                    >
                      ✓ Real: {planMin + desvioMin}′ {desvioMin !== 0 && `(${desvioMin > 0 ? '+' : ''}${desvioMin}′)`}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleIniciarReposo(fase)}
                      disabled={actionLoading === `ini_${fase.orden}`}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: 'rgba(245,158,11,0.16)',
                        color: '#b45309',
                        fontSize: 11,
                        fontWeight: 700,
                        border: '1px solid rgba(245,158,11,0.35)',
                        cursor: 'pointer',
                      }}
                    >
                      {actionLoading === `ini_${fase.orden}` ? 'Iniciando...' : '⏱️ Iniciar Reposo'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {encajes.length > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px dashed rgba(40,30,24,0.14)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: TOKENS.text, marginBottom: 6 }}>
            💡 Durante sus reposos cabe
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {encajes.slice(0, 8).map((e) => (
              <span
                key={e.servicio.id}
                title={`${e.servicio.nombre} (${e.servicio.duracionTotalMin}′) cabe en el reposo${e.reposoEtiqueta ? ` «${e.reposoEtiqueta}»` : ` nº ${e.reposoOrden}`} de ${e.huecoMin}′`}
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(15,157,107,0.10)',
                  border: '1px solid rgba(15,157,107,0.30)',
                  color: '#0f7a52',
                  whiteSpace: 'nowrap',
                }}
              >
                {e.servicio.nombre} · {e.servicio.duracionTotalMin}′
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
