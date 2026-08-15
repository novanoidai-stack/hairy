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
import { DESIGN_TOKENS as TOKENS } from '@/lib/designTokens';
import { RegistroCard, IconosRegistro } from './RegistroCard';

const ACENTO = '#0891b2';

export interface ControlHorarioSectionProps {
  profesionales: Array<{ id: string; nombre: string }>;
  isMobile?: boolean;
  customInicio?: string | null;
  customFin?: string | null;
}

export function ControlHorarioSection({ profesionales, isMobile = false, customInicio, customFin }: ControlHorarioSectionProps) {
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
    <RegistroCard
      titulo="Control horario"
      descripcion="Registro de jornada del equipo · descargable para la nómina y para la Inspección"
      icono={IconosRegistro.reloj}
      acento={ACENTO}
    >
      <>
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
          customDesde={customInicio ?? undefined}
          customHasta={customFin ?? undefined}
        />
      </>
    </RegistroCard>
  );
}
