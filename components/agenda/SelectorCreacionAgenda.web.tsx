// QUE QUIERES PONER AQUI (peticion 6 de Jose, 6 sep 2026).
//
// Hasta ahora, clicar un hueco de la agenda abria DIRECTAMENTE el modal de cita.
// Para apuntar que alguien se va a comer o al medico habia que salir a Equipo,
// buscar a la persona, abrir sus bloqueos y escribir las horas a mano -- con la
// agenda delante y el hueco ya senalado con el dedo.
//
// Jose: "que al clicar no se abra directamente el modal de la cita, sino que te
// pregunte primero que quieres crear: una cita, una ausencia, algun tipo de
// bloqueo, una pausa... una forma de acceso rapido".
//
// NO HAY NADA NUEVO DEBAJO. `bloqueos_profesional` existe desde hace meses (133
// filas en produccion) y la agenda ya los pintaba; lo unico que faltaba era
// poder crearlos desde donde se ven. Esto es un atajo, no una funcion.
//
// LO QUE NO SE HACE, Y ES DELIBERADO
// "Cita" sigue estando a UN gesto: es el primer boton, el unico relleno y el que
// responde al Enter. Crear una cita es la accion mas repetida del producto y
// meterle un clic de peaje a cambio de un atajo que se usa una vez al dia seria
// un mal cambio. El resto son secundarios.
//
// `reserva_temporal` NO se ofrece aunque el CHECK lo admita: es el hueco que
// retiene el portal mientras alguien paga, lo pone el servidor y no significa
// nada dicho por una persona.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DESIGN_TOKENS as TOKENS } from '@/lib/designTokens';
import { mensajeDeError } from '@/lib/errores';

/** Tipos de `bloqueos_profesional` que tiene sentido que elija una persona. */
const TIPOS_BLOQUEO = [
  { tipo: 'descanso', etiqueta: 'Descanso', ayuda: 'Comida, cafe, un rato fuera' },
  { tipo: 'baja', etiqueta: 'Ausencia', ayuda: 'Medico, asunto propio, baja' },
  { tipo: 'reunion', etiqueta: 'Reunion', ayuda: 'Con el equipo o con proveedores' },
  { tipo: 'formacion', etiqueta: 'Formacion', ayuda: 'Curso o taller' },
  { tipo: 'vacaciones', etiqueta: 'Vacaciones', ayuda: 'Dias libres' },
] as const;

const DURACIONES = [30, 60, 90, 120, 240] as const;

export function SelectorCreacionAgenda({
  abierto,
  hora,
  profesionalId,
  profesionalNombre,
  fecha,
  negocioId,
  onCerrar,
  onElegirCita,
  onBloqueoCreado,
}: {
  abierto: boolean;
  /** "HH:MM" del hueco pulsado. */
  hora: string;
  profesionalId: string;
  profesionalNombre: string;
  /** Dia del hueco pulsado. */
  fecha: Date;
  negocioId: string;
  onCerrar: () => void;
  /** Seguir al alta de cita de siempre, con el hueco ya elegido. */
  onElegirCita: () => void;
  /** El bloqueo ya esta en la BD: toca recargar la agenda. */
  onBloqueoCreado: () => void;
}) {
  const [paso, setPaso] = useState<'elegir' | 'bloqueo'>('elegir');
  const [tipo, setTipo] = useState<string>('descanso');
  const [minutos, setMinutos] = useState<number>(60);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  // Cada apertura empieza de cero: si no, el segundo hueco del dia hereda el
  // tipo y el motivo del anterior y se crea un bloqueo que nadie pidio.
  useEffect(() => {
    if (abierto) {
      setPaso('elegir');
      setTipo('descanso');
      setMinutos(60);
      setMotivo('');
      setErr('');
      setGuardando(false);
    }
  }, [abierto]);

  if (!abierto) return null;

  const crearBloqueo = async () => {
    setErr('');
    setGuardando(true);
    try {
      const [hh, mm] = hora.split(':').map(Number);
      const inicio = new Date(fecha);
      inicio.setHours(hh, mm, 0, 0);
      const fin = new Date(inicio.getTime() + minutos * 60000);

      // negocio_id va explicito: `bloqueos_profesional` SI lo tiene (se anadio
      // despues, a diferencia de horarios_profesional) y la RLS lo exige.
      const { error } = await supabase.from('bloqueos_profesional').insert({
        profesional_id: profesionalId,
        negocio_id: negocioId,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        tipo,
        motivo: motivo.trim() || null,
      });
      if (error) throw error;
      onBloqueoCreado();
      onCerrar();
    } catch (e: any) {
      setErr(mensajeDeError(e, 'No se pudo crear el bloqueo.'));
    } finally {
      setGuardando(false);
    }
  };

  const cabecera = `${profesionalNombre} · ${hora}`;

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,18,32,0.34)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: TOKENS.bgCard,
          borderRadius: 16,
          padding: 20,
          width: 'min(420px, 100%)',
          maxHeight: '86vh',
          overflowY: 'auto',
          boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ fontSize: 11, color: TOKENS.textTer, marginBottom: 2 }}>
          {cabecera}
        </div>

        {paso === 'elegir' ? (
          <>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: TOKENS.text,
                marginBottom: 14,
              }}
            >
              ¿Que pones aqui?
            </div>

            <button
              autoFocus
              onClick={onElegirCita}
              style={{
                width: '100%',
                padding: '13px 16px',
                background: TOKENS.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 10,
                textAlign: 'left',
              }}
            >
              Una cita
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, opacity: 0.9 }}>
                Reservar para una clienta
              </span>
            </button>

            <button
              onClick={() => setPaso('bloqueo')}
              style={{
                width: '100%',
                padding: '13px 16px',
                background: 'transparent',
                color: TOKENS.text,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Bloquear el hueco
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  color: TOKENS.textTer,
                }}
              >
                Descanso, ausencia, reunion, formacion o vacaciones
              </span>
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: TOKENS.text,
                marginBottom: 14,
              }}
            >
              Bloquear el hueco
            </div>

            <div style={{ fontSize: 11, color: TOKENS.textTer, marginBottom: 6 }}>
              Motivo
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 6,
                marginBottom: 14,
              }}
            >
              {TIPOS_BLOQUEO.map((t) => (
                <button
                  key={t.tipo}
                  onClick={() => setTipo(t.tipo)}
                  title={t.ayuda}
                  style={{
                    padding: '9px 10px',
                    background: tipo === t.tipo ? TOKENS.primarySoft : 'transparent',
                    color: tipo === t.tipo ? TOKENS.primaryHi : TOKENS.text,
                    border: `1px solid ${tipo === t.tipo ? TOKENS.primary : TOKENS.border}`,
                    borderRadius: 9,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t.etiqueta}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11, color: TOKENS.textTer, marginBottom: 6 }}>
              Cuanto dura
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {DURACIONES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutos(m)}
                  style={{
                    padding: '8px 12px',
                    background: minutos === m ? TOKENS.primarySoft : 'transparent',
                    color: minutos === m ? TOKENS.primaryHi : TOKENS.text,
                    border: `1px solid ${minutos === m ? TOKENS.primary : TOKENS.border}`,
                    borderRadius: 9,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11, color: TOKENS.textTer, marginBottom: 6 }}>
              Nota (opcional)
            </div>
            <input
              className="m-input"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: dentista"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 11px',
                borderRadius: 9,
                border: `1px solid ${TOKENS.border}`,
                fontSize: 13,
                marginBottom: 14,
              }}
            />

            {err && (
              <div
                style={{
                  fontSize: 12,
                  color: TOKENS.danger,
                  marginBottom: 10,
                }}
              >
                {err}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPaso('elegir')}
                disabled={guardando}
                style={{
                  padding: '9px 16px',
                  background: 'transparent',
                  color: TOKENS.textTer,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Atras
              </button>
              <button
                onClick={crearBloqueo}
                disabled={guardando}
                style={{
                  padding: '9px 16px',
                  background: TOKENS.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: guardando ? 'default' : 'pointer',
                  opacity: guardando ? 0.6 : 1,
                }}
              >
                {guardando ? 'Guardando...' : 'Bloquear'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
