# Instrucciones de revisión para Copilot Code Review — Mecha (Hairy)

> Este repo es un SaaS multi-tenant de peluquerías (React Native + Expo web,
> Supabase, edge functions Deno). Las reglas completas viven en `CLAUDE.md`;
> aquí va lo que TIENES que mirar en cada PR, **en este orden**. Un fallo del
> punto 1 o 2 es lo más grave que puede haber en este repo.

## Checklist obligatorio (en orden)

1. **Multi-tenant:** ¿toda consulta nueva y toda política RLS lleva `negocio_id`?
   Una query que filtre sin `negocio_id` es una fuga de datos entre clientes.
2. **Claves en el código:** ¿alguna clave de Supabase/Stripe/OpenRouter en el
   diff? Prohibido, ni "temporal". Van en `.env` (gitignored) o en el Vault.
   En edge functions: la clave se pide a `claveServicio()`; para autorizar la
   llamada, `peticionDeServicio(req)`. Nunca `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
   a pelo ni decodificar un JWT para mirar su `role`.
3. **Cosas que viven en varios sitios:** ¿este cambio toca precios, referidos o
   tipos de solicitud? Esos datos viven replicados (precios en 3 sitios,
   `lib/planes.ts` + BD + JSON-LD). Si toca uno, ¿están TODOS actualizados?
4. **Handlers de clic asíncronos:** ¿hay `onClick={() => { algoAsync() }}` sin
   `await`, sin `.catch` y sin try/catch? Es el patrón del error silencioso:
   el botón "funciona" y se traga el fallo.
5. **RPC `security definer`:** si el PR añade o toca una RPC con `security
   definer`, tiene que llevar su guard (`negocio_id` + rol) dentro. Si no,
   cualquier usuario puede llamarla con argumentos arbitrarios.

## Nivel de la revisión

Tus comentarios son **siempre aviso, nunca bloqueo**. La IA no tumba una CI;
los vigilantes deterministas (`scripts/vigilantes/`, `tests/smoke/`) sí. Si un
comentario humano decide, se marca el PR.

## Contexto que ayuda

- Los "vigilantes" son checks propios: smoke de 17 pantallas con anclas,
  knip, mapas de BD. Un ancla perdida FALLA la CI a propósito.
- La deuda heredada vive congelada en líneas base (`*.baseline.json`); el
  trinquete solo gira hacia abajo. No propongas "limpiar todo lo rojo" de una
  línea base: se reduce de forma consciente, no en un PR ajeno.
- Idioma del repo: español. Comenta en español.
