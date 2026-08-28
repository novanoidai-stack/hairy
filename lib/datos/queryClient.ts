// Cliente unico de TanStack Query.
//
// Por que entra esta libreria (medido el 27 ago 2026, ver
// informes/PLAN-MAESTRO-RENDIMIENTO-Y-ARQUITECTURA-2026-08-27.md §2.bis):
// volver a la agenda desde clientes disparaba **14 peticiones** y repintaba
// desde cero, porque cada pantalla pide sus datos en un useEffect de montaje y
// no hay donde guardarlos. Eso es lo que se percibe como "pantallas en blanco"
// al moverse por la app. NO entra por los re-renders: el arrastre de la agenda
// ya estaba bien optimizado y se midio que muta 8 nodos.
import { QueryClient } from '@tanstack/react-query';
import { alEscribirEnTabla } from '@/lib/supabase';

// Cuanto vale una respuesta antes de volver a pedirla.
//
// AVISO IMPORTANTE, y es la razon de que esto viva aqui y no suelto por ahi:
// las CITAS no llevan staleTime. La agenda es compartida (recepcion, varios
// profesionales, el portal publico y el agente de WhatsApp escriben sobre lo
// mismo), y ya hay realtime alimentando la pantalla. Dejar una ventana de
// "estos datos valen" sobre las citas es abrir la puerta a la doble reserva.
// Las citas se refrescan por realtime directo a la pantalla (su canal propio,
// NO via queryClient.setQueryData: hoy no existe ese puente, y si algun dia
// alguien quiere cachear citas habra que construirlo antes).
//
// Lo que si aguanta cache de verdad son las tablas de referencia: servicios,
// horarios, configuracion del salon. Cambian de Pascuas a Ramos y se consultan
// sin parar. Son, no por casualidad, las mismas que `fetchSinRepetir` ya trata
// aparte en lib/supabase.ts.
export const FRESCURA = {
  /** Nada de cache: cada consumidor pide y el realtime manda. */
  citas: 0,
  /** Cambian poco y se leen mucho. */
  referencia: 5 * 60 * 1000,
  /** Termino medio para listados que el usuario edita (clientes, equipo). */
  listado: 30 * 1000,
} as const;

export function crearQueryClient(): QueryClient {
  const cliente = new QueryClient({
    defaultOptions: {
      queries: {
        // Por defecto, prudente: quien quiera cachear lo pide explicitamente.
        staleTime: 0,
        // Lo que da la victoria medida: al volver a una pantalla ya visitada se
        // pinta al instante desde memoria y se revalida por detras, en vez de
        // dejar la pantalla en blanco esperando a la red.
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // Un salon con mala cobertura no gana nada reintentando cinco veces.
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });

  // Cualquier escritura invalida lo guardado de esa tabla, venga de donde venga
  // (lib/supabase.ts avisa desde el propio fetch). Esto es lo que hace que se
  // pueda cachear sin miedo: guardar la configuracion del salon y volver a la
  // agenda ensena lo recien guardado, no lo de hace cinco minutos.
  //
  // Por eso la PRIMERA parte de cada clave es el nombre EXACTO de la tabla: asi
  // invalidar es una linea y no hay que mantener un mapa tabla -> claves que
  // alguien se acabaria dejando a medias.
  alEscribirEnTabla((tabla) => {
    cliente.invalidateQueries({ queryKey: [tabla] });
  });

  return cliente;
}

// Claves de consulta. DOS reglas, y las dos importan:
//
// 1. La primera parte es el nombre EXACTO de la tabla de Postgres. De eso
//    depende la invalidacion automatica de arriba: si aqui pone
//    'negocio-config' y la tabla es `negocio_config`, escribir no invalida nada
//    y la pantalla se queda con datos viejos sin que nadie se entere.
// 2. La segunda es SIEMPRE el negocio. Sin el, la cache puede servirle a un
//    salon los datos de otro al cambiar de sesion: es un fallo de aislamiento
//    multi-tenant, no de rendimiento. Mismo criterio que la regla del parametro
//    en las RPC (CLAUDE.md, decision 4). Vale tambien para las tablas que NO
//    tienen columna negocio_id y se acotan por RLS.
export const claves = {
  clientes: (negocioId: string) => ['clientes', negocioId] as const,
  cliente: (negocioId: string, id: string) => ['clientes', negocioId, id] as const,
  citas: (negocioId: string, desde: string, hasta: string) =>
    ['citas', negocioId, desde, hasta] as const,
  servicios: (negocioId: string) => ['servicios', negocioId] as const,
  profesionales: (negocioId: string) => ['profesionales', negocioId] as const,
} as const;
