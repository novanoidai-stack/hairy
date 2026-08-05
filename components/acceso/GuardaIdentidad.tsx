// Guardián del modo de acceso compartido.
//
// Se monta una sola vez en el layout raíz. Si el salón entra con un solo correo
// y todavía nadie ha dicho quién es en este dispositivo, tapa la app con la
// puerta "¿Quién eres?". En un salón normal (cada persona con su correo) no
// pinta nada y no cuesta nada: una llamada a acceso_salon_estado() por carga.

import { useEffect, useState } from 'react';
import { useAccesoSalon } from '@/lib/hooks/useAccesoSalon';
import { getUserProfile } from '@/lib/auth';
import PuertaIdentidad from './PuertaIdentidad';

export function GuardaIdentidad() {
  const { cargando, modo, tienePin, identidad, fichas, negocioId, email, refrescar } = useAccesoSalon();
  const [nombreSalon, setNombreSalon] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (modo !== 'compartido') return;
    getUserProfile().then((p) => { if (vivo) setNombreSalon(p?.nombre_negocio ?? null); });
    return () => { vivo = false; };
  }, [modo]);

  if (cargando || modo !== 'compartido' || identidad) return null;

  return (
    <PuertaIdentidad
      fichas={fichas}
      negocioId={negocioId ?? ''}
      tienePin={tienePin}
      email={email}
      nombreSalon={nombreSalon}
      onElegida={refrescar}
    />
  );
}

export default GuardaIdentidad;
