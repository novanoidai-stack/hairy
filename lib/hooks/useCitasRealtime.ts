import { useEffect, useRef } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import {
  aplicarCambioCita,
  type CitaBase,
  type CitaRealtime,
  type ContextoMezcla,
} from '@/lib/agenda/citasRealtime';

// Suscripcion a los cambios de la tabla citas del salon.
//
// Para que sirva de algo la tabla tiene que estar publicada en supabase_realtime
// (migrations/realtime-citas-agenda.sql). Sin esa migracion aplicada la
// suscripcion se abre sin error y no llega ni un evento: el aviso de la consola
// es la unica pista.
//
// INSERT y UPDATE van filtrados por negocio_id en el servidor. Los DELETE no
// pueden filtrarse (llegan solo con la clave primaria, ver la migracion), asi
// que se escuchan todos y la mezcla descarta los ids que esta agenda no tenia.

type Opciones<T extends CitaBase> = {
  negocioId: string | null | undefined;
  // La agenda solo tiene descargado un tramo de fechas; fuera de el no se pinta.
  dentroDeVentana: ContextoMezcla['dentroDeVentana'];
  verCanceladas: boolean;
  onCambio: (aplicar: (previas: T[]) => T[]) => void;
};

export function useCitasRealtime<T extends CitaBase>({
  negocioId,
  dentroDeVentana,
  verCanceladas,
  onCambio,
}: Opciones<T>) {
  // Por referencia para que cambiar de dia o abrir las canceladas no tire la
  // conexion y la vuelva a levantar: el canal solo depende del negocio.
  const ctxRef = useRef<ContextoMezcla>({ dentroDeVentana, verCanceladas });
  ctxRef.current = { dentroDeVentana, verCanceladas };
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  useEffect(() => {
    // En la demo compartida no: todos los visitantes comparten tenant y verian
    // aparecer en su pantalla lo que va tocando cualquier otro.
    if (!negocioId || IS_DEMO_MODE) return;

    const mezclar = (
      tipo: 'INSERT' | 'UPDATE' | 'DELETE',
      fila: CitaRealtime | null,
      filaAnterior: CitaRealtime | null,
    ) => {
      onCambioRef.current((previas) =>
        aplicarCambioCita(previas, { tipo, fila, filaAnterior }, ctxRef.current),
      );
    };

    const canal = supabase
      .channel(`agenda-citas-${negocioId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'citas', filter: `negocio_id=eq.${negocioId}` },
        (payload) => mezclar('INSERT', payload.new as CitaRealtime, null),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'citas', filter: `negocio_id=eq.${negocioId}` },
        (payload) => mezclar('UPDATE', payload.new as CitaRealtime, null),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'citas' },
        (payload) => mezclar('DELETE', null, payload.old as CitaRealtime),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [negocioId]);
}
