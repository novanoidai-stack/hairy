// Auditoría de lectura. Credencial exclusivamente desde el entorno del proceso.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('Falta SUPABASE_ACCESS_TOKEN');
const base = 'https://api.supabase.com/v1/projects/vtrggiogjrhqtwbhbgia';
const redact = text => text.replace(/sbp_[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
async function request(name, route, query, select = x => x) {
  const res = await fetch(base + route, {
    method: query ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(query ? { body: JSON.stringify({query, read_only: true}) } : {}),
  });
  const body = await res.text();
  let data; try { data = JSON.parse(body); } catch { data = body.slice(0, 1000); }
  data = res.ok ? select(data) : data;
  const result = { captured_at: new Date().toISOString(), status: res.status, data };
  fs.writeFileSync(path.join(dir, name + '.json'), redact(JSON.stringify(result, null, 2)));
  console.log(JSON.stringify({name, status: res.status, records: Array.isArray(data) ? data.length : undefined, keys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : undefined}));
}
const nombres = ['cancelar_cita_publica','modificar_cita_publica','crear_cita_publica','crear_cita_publica_cadena','crear_cita_publica_grupo','requerir_senal_cita','registrar_cobro_online','registrar_cobro','registrar_venta_rapida','limite_negocio','guard_profile_identity_columns'];
if (process.argv.includes('--config')) {
  await Promise.all([
    request('postgrest-config', '/postgrest', null, d => ({max_rows:d.max_rows, db_schema:d.db_schema, db_extra_search_path:d.db_extra_search_path})),
    request('edge-metadata', '/functions', null, d => d.map(x => ({name:x.name, status:x.status, version:x.version, verify_jwt:x.verify_jwt, updated_at:x.updated_at}))),
    request('politicas-y-cron', '/database/query', `select jsonb_build_object('rls_sin_activar', (select coalesce(jsonb_agg(c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 'cron', (select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'active',active)) from cron.job), 'fallos_cron_24h', (select count(*) from cron.job_run_details where start_time > now()-interval '24 hours' and status='failed')) as resumen`),
    request('funciones-cobro-remotas', '/database/query', `select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cobrar_cita','cobrar_venta_rapida','portal_info','plan_del_negocio','evaluar_alta_de_acceso') order by 1,2`),
  ]);
} else await Promise.all([
  request('backups', '/database/backups'),
  request('advisors-security', '/advisors/security'),
  request('advisors-performance', '/advisors/performance'),
  request('funciones-desplegadas', '/database/query', `select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname in (${nombres.map(n=>`'${n}'`).join(',')}) or p.proname like 'vigilancia_bd%') order by 1,2`),
  request('inventario-bd', '/database/query', `select 'tablas' as tipo, count(*)::int as total from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' union all select 'funciones', count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' union all select 'politicas', count(*)::int from pg_policies where schemaname='public' union all select 'migraciones', count(*)::int from supabase_migrations.schema_migrations`),
]);
