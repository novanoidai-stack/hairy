# Prompt Sesion 11-B — Chispa en la landing + CTA migracion (Opus 4.8, esfuerzo medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 11) y
informes/DIFERENCIADORES-IA-MECHA.md (seccion A.1 y B). Esta es la PARTE B de la Sesion 11.
La PARTE A (migracion magica + catalogo desde foto + factura->stock) debe estar HECHA antes.
Requiere Sesiones 1, 2, 3 (renderer + RBAC + ejecutor general).

IMPORTANTE: Antes de empezar, analiza la calidad del codigo de las sesiones anteriores 1-6
para mantener consistencia en estilos, calidad de codigo, patrones y metodos. NO cambies
estilos ya establecidos (comentarios en espanol sin emojis, codigo en ingles, tokens fuego
#f4501e/#c0260a, sin any, movil primero useResponsive, PR-12 estricto, RBAC via permisos.ts,
ejecutor general lib/chispaOps.ts, renderer de bloques BloqueRenderer, protocolo de bloques
lib/chispaBloques.ts, multi-tenant negocio_id, RLS + can()). Si hay patrones establecidos,
REUTILIZALOS.

CONSTRUYE (esta sesion toca SOLO la landing web/ estatica y el CTA):
1) CHISPA EN LA LANDING (web/ estatica): widget de chat en index.html que responde preguntas de
   prospectos con RAG sobre los manuales existentes y especificaciones.html (edge function publica
   con rate-limit por IP y anti-abuso, misma disciplina que las RPC publicas; se identifica como IA;
   sin claims falsos ni cifras inventadas; escala a "reserva una llamada" -> reservar.html).
2) CTA en la landing: "Cambiate desde Booksy o Fresha en 10 minutos" enlazando al flujo de migracion
   (respeta el estilo de landing: menos texto, mas visual — memoria landing-copy-style).

NOTA: El motor de migracion magica (CSV/Excel/foto -> preview -> import) se construyo en la
Sesion 11-A, NO en esta. Esta sesion se centra SOLO en la landing (widget + CTA).

REGLAS: PR-12 estricto (Chispa propone, usuario confirma), multi-tenant negocio_id, sin any,
comentarios en espanol sin emojis. Edge publica: grant execute a anon explicito, rate-limit
por IP, anti-abuso (mismas disciplinas que portal_info/crear_cita_publica). Sin claims falsos
ni cifras inventadas en la landing.

VERIFICA: el chat de la landing responde 3 preguntas reales del manual y rechaza salirse de tema;
el CTA enlaza correctamente al flujo de migracion (si 11-A esta hecha). Prueba en local con
node scripts/serve-web.mjs.

CIERRE: commit + push a master; actualiza informes/MEGA_INFORME_MECHA.md con lo hecho y marca
"Sesion 11-B HECHA (completa S11)" y "Sesion 11 HECHA" en informes/PLAN-IA-CHISPA.md.
Si otra sesion empujo a master, stash/pull/pop.
```
