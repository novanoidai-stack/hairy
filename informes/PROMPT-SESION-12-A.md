Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 12) y
informes/DIFERENCIADORES-IA-MECHA.md (A.2 y A.4). Gap de mercado confirmado: nadie une voz + IA + ficha tecnica.
Esta es la PARTE A de la Sesión 12 (Motor Backend y Reglas Estrictas).

IMPORTANTE: Haz énfasis absoluto en la calidad del código, tipado estricto en TypeScript, y seguridad en RLS. NO cambies estilos ya establecidos (código en inglés, comentarios en español sin emojis, tokens de diseño).

CONSTRUYE (Backend y Edge Functions):
1) ESQUEMA Y RLS: Crea las migraciones SQL necesarias para soportar `formulas_color` (producto, tono, gramos, oxidante, tiempos, notas) vinculadas a `clientes` y `citas`. Asegura el RLS multi-tenant (`negocio_id`).
2) EDGE FUNCTION `color-formula-parser`: Recibe texto (obtenido del dictado) -> LLM parsea a estructura de fórmula usando JSON schema estricto. Debe ser tolerante a jerga real de peluquería (7.1, "veinte volúmenes", marcas).
3) REGLA DURA DE SALUD: Si el LLM detecta que el texto dictado menciona alergias o condiciones de salud (ej. "picor", "alergia", "sensibilidad"), el parser DEBE rechazar la extracción y devolver una alerta (`health_warning: true`) para que el frontend redirija a "las notas de salud van en su ficha médica, a mano".
4) EDGE FUNCTION `traductor-marcas`: LLM propone equivalencia de una fórmula a otra marca (Wella <-> Schwarzkopf <-> L'Oreal) devolviendo un JSON con la nueva fórmula y un disclaimer obligatorio de "orientativo, verifica con tu carta de color".

VERIFICA:
- Las migraciones pasan los advisors de Supabase (sin advertencias de seguridad, multi-tenant aplicado).
- Los edge functions compilan correctamente (`npx tsc --noEmit`).

CIERRE: commit + push a master; actualiza informes/MEGA_INFORME_MECHA.md y marca "Sesión 12-A HECHA (12-B pendiente)" en informes/PLAN-IA-CHISPA.md.
