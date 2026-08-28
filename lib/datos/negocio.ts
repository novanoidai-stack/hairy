// Identidad del salon para la capa de datos.
//
// Toda consulta de la app va filtrada por `negocio_id` (multi-tenant), asi que
// casi cualquier hook de datos necesita saberlo antes de poder pedir nada. Se
// resuelve una vez aqui y el resto de hooks se cuelgan de el con `enabled`.
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/lib/auth';

export function useNegocioId() {
  const q = useQuery({
    queryKey: ['negocio-id'],
    queryFn: async () => {
      const perfil = await getUserProfile();
      return perfil?.negocio_id ?? null;
    },
    // getUserProfile ya trae su propia cache con TTL (lib/auth.ts), asi que
    // esto no es la unica defensa; aqui interesa sobre todo que el valor este
    // disponible de forma sincrona para el resto de hooks tras la primera vez.
    staleTime: 5 * 60 * 1000,
  });

  return { negocioId: q.data ?? null, cargando: q.isLoading };
}
