# Prompt Sesion 11-A — Migración mágica + catálogo desde foto + factura->stock (Opus 4.8, esfuerzo alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 11) y
informes/DIFERENCIADORES-IA-MECHA.md (seccion A.1 y B). Gap de mercado confirmado: nadie migra desde
Booksy/Fresha con IA. Parsing correctness-critical: datos de un negocio real, no se puede corromper.

IMPORTANTE: Antes de empezar, analiza la calidad del codigo de las sesiones anteriores 1-6
para mantener consistencia en estilos, calidad de codigo, patrones y metodos. NO cambies
estilos ya establecidos (comentarios en espanol sin emojis, codigo en ingles, tokens fuego
#f4501e/#c0260a, sin any, movil primero useResponsive, PR-12 estricto, RBAC via permisos.ts,
ejecutor general lib/chispaOps.ts, renderer de bloques BloqueRenderer, protocolo de bloques
lib/chispaBloques.ts, multi-tenant negocio_id, RLS + can()). Si hay patrones establecidos,
REUTILIZALOS.

YA EXISTE: components/config/TabImportarCitas.tsx (importador manual). Usalo de base/inspiracion.

CONSTRUYE (esta sesion NO toca la landing, eso es Sesion 11-B):
1) MIGRACION MAGICA: flujo en Configuracion (y enlace desde onboarding): el usuario sube CSV/Excel
   exportado de Booksy o Fresha, O una foto/PDF de su agenda o listado. Edge function
   migracion-magica: LLM con vision + structured output (JSON schema estricto) mapea a entidades
   Mecha (clientas, servicios con duracion/precio, citas futuras). SIEMPRE preview completo editable
   -> el usuario confirma -> insercion batch via la sesion del usuario (RLS). Reglas: telefonos solo
   digitos (regla del repo), duplicados detectados por telefono, NADA se inserta sin confirmar,
   validacion de tipos servidor. Maneja los formatos de export conocidos de Booksy y Fresha (columnas
   tipicas) y el caso generico.
2) CATALOGO DESDE FOTO: mismo motor, caso "foto de la lista de precios" -> servicios propuestos con
   precio/duracion -> preview -> confirmar.
3) FACTURA PROVEEDOR -> STOCK: foto de albaran -> lineas de entrada de inventario (inventario v0
   existe) -> preview -> confirmar.

NOTA: La landing (Chispa widget + CTA "Cambiate desde Booksy/Fresha") se construye en la
Sesion 11-B, NO en esta. Esta sesion se centra SOLO en el motor de migracion/vision.

VERIFICA: CSV de prueba estilo Booksy y estilo Fresha -> preview correcto -> importa en demo; foto de
una lista de precios -> catalogo propuesto; factura de proveedor -> lineas de inventario propuestas.
Advisors tras cualquier migracion SQL.

CIERRE: commit + push a master; actualiza informes/MEGA_INFORME_MECHA.md con lo hecho y marca
"Sesion 11-A HECHA (11-B pendiente)" en informes/PLAN-IA-CHISPA.md. Si otra sesion empujo a master,
stash/pull/pop.
```
