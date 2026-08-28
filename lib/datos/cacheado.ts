// Puente entre la cache y el codigo que todavia NO usa hooks.
//
// Las pantallas grandes cargan sus datos con un `Promise.all` dentro de un
// `useEffect` y esperan la forma `{ data, error }` de supabase-js. Reescribirlas
// a `useQuery` de golpe seria un cambio enorme (la agenda son 25.000 lineas), y
// el plan dice mover antes que mejorar.
//
// `cacheado` deja usar la cache SIN tocar esa estructura: devuelve lo guardado
// si sigue fresco y consulta si no, con la misma forma de dato y en el mismo
// sitio donde ya estaba la consulta. Es un paso intermedio a proposito; cuando
// una pantalla se parta (Fase 5 del plan) pasara a `useQuery` de verdad.
//
// Si algo falla se devuelve lista vacia y el error, que es como se comportaban
// las consultas que sustituye: la pantalla sigue viva.
import type { QueryClient } from '@tanstack/react-query';

export function cacheado<T>(
  qc: QueryClient,
  clave: readonly unknown[],
  fn: () => Promise<T>,
  frescuraMs: number,
): Promise<{ data: T; error: unknown }> {
  return qc
    .fetchQuery({ queryKey: clave, queryFn: fn, staleTime: frescuraMs })
    .then((data) => ({ data, error: null as unknown }))
    .catch((error) => ({ data: [] as unknown as T, error }));
}
