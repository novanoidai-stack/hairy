// ControlHorarioSection — "Control horario" dentro de Informes.
//
// Es la vista de EMPRESA del registro de jornada: horas de todo el equipo,
// totalizacion diaria y mensual, incidencias y descarga del registro para la
// nomina o para la Inspeccion de Trabajo. Antes esto no existia: los fichajes
// se guardaban pero no habia forma de sacarlos, que es justo lo que exige el
// art. 34.9 del Estatuto de los Trabajadores.
//
// Solo se pinta para owner/admin (informes ya esta gateado por canAccessInformes),
// pero el alcance real lo vuelve a decidir el servidor en jornada_totales.
import { useEffect, useState } from 'react';
import { getUserProfile } from '@/lib/auth';
import { RegistroJornada } from '@/components/jornada/RegistroJornada.web';
import { cargarConfigJornada, type ConfigJornada } from '@/lib/jornada';

const TOKENS = {
  bgCard: '#ffffff',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  cyan: '#0891b2',
};

export interface ControlHorarioSectionProps {
  profesionales: Array<{ id: string; nombre: string }>;
  isMobile?: boolean;
}

export function ControlHorarioSection({ profesionales, isMobile = false }: ControlHorarioSectionProps) {
  const [salon, setSalon] = useState<{ nombre?: string | null }>({});
  const [config, setConfig] = useState<ConfigJornada | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getUserProfile();
      setSalon({ nombre: p?.nombre_negocio || p?.negocio_id });
      try { setConfig(await cargarConfigJornada()); } catch { /* la zona cae al default */ }
    })();
  }, []);

  return (
    <div style={{ marginBottom: isMobile ? 10 : 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12,
        padding: isMobile ? '11px 13px' : '14px 18px', borderRadius: '14px 14px 0 0',
        background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`,
      }}>
        <div style={{
          width: isMobile ? 30 : 36, height: isMobile ? 30 : 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${TOKENS.cyan}18`, flexShrink: 0,
        }}>
          <svg width={isMobile ? 16 : 18} height={isMobile ? 16 : 18} viewBox="0 0 24 24" fill="none"
               stroke={TOKENS.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 13.5 : 14, fontWeight: 700, color: TOKENS.text }}>
            Control horario
          </div>
          <div style={{ fontSize: isMobile ? 10.5 : 11, color: TOKENS.textTer, marginTop: 1 }}>
            Registro de jornada del equipo · descargable para la nómina y para la Inspección
          </div>
        </div>
      </div>

      <div className="section-card" style={{
        padding: isMobile ? 13 : 18, borderRadius: '0 0 14px 14px', background: TOKENS.bgCard,
        border: `1px solid ${TOKENS.border}`, borderTop: 'none',
      }}>
        <div style={{ fontSize: 12.5, color: TOKENS.textSec, lineHeight: 1.55, marginBottom: 14, maxWidth: 760 }}>
          Este es el registro que tienes que poder enseñar si te lo piden. Cada entrada, salida y pausa
          queda con la hora real del servidor, no se puede editar ni borrar, y se conserva cuatro años.
          Si hay que arreglar algo, se hace con una corrección que necesita el visto bueno de la empresa
          y de la persona trabajadora, y deja escrito quién, cuándo y por qué.
          {config && (
            <> Zona horaria del centro: <b>{config.zona}</b>. Jornada semanal de referencia: <b>{config.jornada_semanal} h</b>.</>
          )}
        </div>

        <RegistroJornada
          alcance="centro"
          salon={salon}
          profesionales={profesionales}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}
