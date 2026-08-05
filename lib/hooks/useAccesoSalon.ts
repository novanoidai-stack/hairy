// Estado del acceso del salon: modo (individual / compartido), si hay PIN, y
// quien se ha identificado en este dispositivo.
//
// Lo consume la puerta "¿Quien eres?" (components/acceso/PuertaIdentidad) y el
// chip de la barra que permite cambiar de persona sin cerrar sesion.

import { useCallback, useEffect, useState } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import {
  cargarIdentidad,
  identidadActiva,
  identidadCargada,
  soltarIdentidad,
  suscribirIdentidad,
  type EstadoAccesoSalon,
  type IdentidadActiva,
} from '@/lib/identidadActiva';

export interface FichaElegible {
  id: string;
  nombre: string;
  color: string | null;
  foto_perfil: string | null;
  rol_acceso: 'owner' | 'admin' | 'recepcion' | 'employee';
}

export interface AccesoSalon {
  cargando: boolean;
  modo: 'individual' | 'compartido';
  tienePin: boolean;
  identidad: IdentidadActiva | null;
  fichas: FichaElegible[];
  negocioId: string | null;
  // El correo con el que se entro (el del jefe): se enseña en la puerta para
  // que se vea de que salon es este dispositivo.
  email: string | null;
  refrescar: () => void;
  salir: () => Promise<void>;
}

export function useAccesoSalon(): AccesoSalon {
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState<EstadoAccesoSalon>({ modo: 'individual', tienePin: false });
  const [fichas, setFichas] = useState<FichaElegible[]>([]);
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [identidad, setIdentidad] = useState<IdentidadActiva | null>(
    identidadCargada() ? identidadActiva() : null,
  );
  const [tick, setTick] = useState(0);

  useEffect(() => suscribirIdentidad(setIdentidad), []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        // La demo compartida no tiene equipo real que elegir.
        if (IS_DEMO_MODE) {
          if (vivo) setEstado({ modo: 'individual', tienePin: false });
          return;
        }
        await cargarIdentidad();
        const [perfil, estadoRpc] = await Promise.all([
          getUserProfile(),
          supabase.rpc('acceso_salon_estado'),
        ]);
        if (!vivo) return;
        setNegocioId(perfil?.negocio_id ?? null);
        setEmail(perfil?.email ?? null);

        const datos = (estadoRpc.data ?? null) as { modo?: string; tiene_pin?: boolean } | null;
        // Si la consulta falla no inventamos: se queda en 'individual', que es
        // el comportamiento de siempre y no deja a nadie fuera del software.
        const modo = datos?.modo === 'compartido' ? 'compartido' : 'individual';
        setEstado({ modo, tienePin: datos?.tiene_pin === true });

        if (modo === 'compartido' && perfil?.negocio_id) {
          const { data } = await supabase
            .from('profesionales')
            .select('id, nombre, color, foto_perfil, rol_acceso')
            .eq('negocio_id', perfil.negocio_id)
            .eq('activo', true)
            .order('nombre');
          if (vivo) setFichas((data as FichaElegible[]) ?? []);
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [tick]);

  const refrescar = useCallback(() => setTick((t) => t + 1), []);
  const salir = useCallback(async () => { await soltarIdentidad(); }, []);

  return {
    cargando,
    modo: estado.modo,
    tienePin: estado.tienePin,
    identidad,
    fichas,
    negocioId,
    email,
    refrescar,
    salir,
  };
}
