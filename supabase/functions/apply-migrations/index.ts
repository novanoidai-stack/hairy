// RETIRADA (round 4 de seguridad, 2 jul 2026).
// Esta funcion era una primitiva residual de "SQL por HTTP" (aplicaba la
// migracion is_team_member, ya versionada en migrations/apply-is-team-member.sql).
// Contradecia la purga de exec_sql: las migraciones van SIEMPRE por el MCP de
// Supabase o el dashboard, nunca por una edge function. Se deja este tombstone
// desplegado (410 Gone) en lugar de codigo ejecutable.
Deno.serve(() => new Response(
  JSON.stringify({ error: 'gone', detail: 'Funcion retirada. Las migraciones se aplican via MCP/dashboard.' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
));
