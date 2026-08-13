// Estado del acceso del salon: modo (individual / compartido), si hay PIN, y
// quien se ha identificado en este dispositivo.
//
// Lo consume la puerta "¿Quien eres?" (components/acceso/PuertaIdentidad) y el
// chip de la barra que permite cambiar de persona sin cerrar sesion.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Recordamos el último modo de acceso conocido en este dispositivo. Si la RPC
// acceso_salon_estado falla un instante (red, arranque en frío), sin esto el
// modo caería a 'individual' y la puerta "¿Quién eres?" desaparecería en un
// salón compartido, dejando entrar sin preguntar. Con el respaldo, usa lo último
// que sí supimos.
const CLAVE_ESTADO = 'mecha_estado_acceso';
async function leerEstadoPersistido(): Promise<EstadoAccesoSalon | null> {
  try {
    const v = await AsyncStorage.getItem(CLAVE_ESTADO);
    return v ? (JSON.parse(v) as EstadoAccesoSalon) : null;
  } catch { return null; }
}
async function guardarEstadoPersistido(e: EstadoAccesoSalon): Promise<void> {
  try { await AsyncStorage.setItem(CLAVE_ESTADO, JSON.stringify(e)); } catch { /* modo privado */ }
}

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
        let modo: 'individual' | 'compartido';
        let tienePin: boolean;
        if (datos) {
          modo = datos.modo === 'compartido' ? 'compartido' : 'individual';
          tienePin = datos.tiene_pin === true;
          guardarEstadoPersistido({ modo, tienePin }).catch(() => {});
        } else {
          // La consulta falló (red, arranque en frío): no inventamos 'individual'
          // sin más, que haría desaparecer la puerta en un salón compartido.
          // Usamos el último estado conocido de este dispositivo.
          const persistido = await leerEstadoPersistido();
          modo = persistido?.modo ?? 'individual';
          tienePin = persistido?.tienePin ?? false;
        }
        setEstado({ modo, tienePin });

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
