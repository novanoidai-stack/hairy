// Cartera de clientas del salon.
//
// Primera pantalla que se migra a la capa de datos (plan §4.3: se empieza por
// una que NO sea la agenda, para que equivocarse salga barato).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabaseTipado } from '@/lib/supabase';
import { claves, FRESCURA } from './queryClient';

// Las columnas son EXACTAMENTE las que ya pedia app/(tabs)/clientes.web.tsx.
// No se aprovecha la migracion para cambiar el select: primero mover, luego (si
// acaso) mejorar. Mezclar las dos cosas hace irrevisable el cambio.
const COLUMNAS =
  'id, nombre, telefono, email, fecha_nacimiento, alergias, notas, canal_preferido, ' +
  'bebida_preferida, sensibilidades_cuero, noshows_count, perfil_riesgo, ticket_medio, ' +
  'frecuencia_dias, bloqueado, bloqueo_motivo, etiquetas, deposito_perfil_override, ' +
  'nivel_fidelizacion_override, consiente_ia, consiente_ia_origen, consiente_ia_fecha';

export type ClienteCartera = Record<string, unknown> & {
  id: string;
  nombre: string | null;
  telefono: string | null;
};

export async function listarClientes(negocioId: string): Promise<ClienteCartera[]> {
  const { data, error } = await supabaseTipado
    .from('clientes')
    .select(COLUMNAS)
    .eq('negocio_id', negocioId)
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as unknown as ClienteCartera[];
}

export function useClientes(negocioId: string | null) {
  return useQuery({
    queryKey: claves.clientes(negocioId ?? ''),
    queryFn: () => listarClientes(negocioId as string),
    enabled: !!negocioId,
    // Es un listado que el propio usuario edita: ni cache larga (veria su
    // cambio tarde) ni cero (volveria a pedir la cartera entera al cambiar de
    // pestana, que es justo lo que se venia a arreglar).
    staleTime: FRESCURA.listado,
  });
}

// Actualizar una clienta e invalidar la cartera.
//
// Esto es lo que antes NO habia: cada pantalla hacia su `update` y luego se
// apanaba a mano con setState para reflejarlo. Al invalidar, cualquier pantalla
// que este mirando esa lista se entera sola.
export function useActualizarCliente(negocioId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: Record<string, unknown> }) => {
      const { error } = await supabaseTipado
        .from('clientes')
        .update(cambios as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (negocioId) qc.invalidateQueries({ queryKey: claves.clientes(negocioId) });
    },
  });
}
