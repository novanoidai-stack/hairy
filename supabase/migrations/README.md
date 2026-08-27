# Migraciones — fuente de verdad única

**Esta carpeta (`supabase/migrations/`) es la ÚNICA fuente de verdad del historial de migraciones.**

## Contexto (2026-08-27)

Hasta hoy el proyecto tenía dos directorios de migraciones:

- `supabase/migrations/` — la canónica del CLI (14 archivos con timestamp).
- `migrations/` (raíz) — 265 archivos .sql ad-hoc con nombres libres, aplicados
  directamente a producción por scripts o SQL editor a lo largo de meses.

La reconciliación hecha:

1. Todas las versiones locales de `supabase/migrations/` están marcadas como
   `applied` en el historial remoto (`supabase migration repair`), así que
   `supabase db push` NO intentará reaplicarlas.
2. Los ~267 registros remotos sin archivo local (aplicados en su día desde la
   carpeta raíz) permanecen en el historial remoto como aplicados. No hace
   falta repararlos: solo importan para no reaplicar.
3. La carpeta raíz se movió a `archive/migraciones-legacy/` (solo consulta;
   los scripts legacy que la referencian fueron actualizados).
4. `20260809101900_fondo_portal.sql` estaba en UTF-16 y rompía el CLI;
   convertido a UTF-8.

## Reglas desde ahora

- Toda migración nueva se crea aquí con `supabase migration new <nombre>`
  (genera `<timestamp>_<nombre>.sql`) y se aplica con `supabase db push`.
- Nada de aplicar SQL a mano por el SQL editor. Si se hace por emergencia,
  después se registra el archivo aquí y se hace `migration repair --status applied`.
- Los archivos DEBEN ser UTF-8 sin BOM.

## Pendiente conocido

- Falta una migración baseline completa del schema de producción
  (`supabase db dump`), que requiere cadena de conexión a la BD
  (IPv6/pooler). Comando cuando se tenga `DATABASE_URL`:

  ```
  npx supabase db dump --db-url "$DATABASE_URL" -f supabase/migrations/<ts>_baseline_produccion.sql
  npx supabase migration repair --project-ref vtrggiogjrhqtwbhbgia --status applied <ts>
  ```

  Con esa baseline, un proyecto fresh (`supabase db reset` + push) reproduce
  el schema completo desde el repo.
