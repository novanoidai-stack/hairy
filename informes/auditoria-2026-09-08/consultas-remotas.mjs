// Auditoría de lectura. Credencial exclusivamente desde el entorno del proceso.
// Pregunta: ¿están las funciones/migraciones nuevas realmente en producción?
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('Falta SUPABASE_ACCESS_TOKEN');
const base = 'https://api.supabase.com/v1/projects/vtrggiogjrhqtwbhbgia';
const redact = text => text.replace(/sbp_[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');

async function sql(name, query, select = x => x) {
  const res = await fetch(base + '/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  });
  const body = await res.text();
  let data; try { data = JSON.parse(body); } catch { data = body.slice(0, 1000); }
  data = res.ok ? select(data) : body.slice(0, 500);
  fs.writeFileSync(path.join(dir, name + '.json'), redact(JSON.stringify({ captured_at: new Date().toISOString(), status: res.status, query, data }, null, 2)));
  console.log(JSON.stringify({ name, status: res.status, resumen: Array.isArray(data) && data.length === 1 ? data[0] : (Array.isArray(data) ? data.length + ' filas' : 'ver json') }));
  return data;
}

// 1. Migraciones de septiembre registradas en el historial remoto
await sql('migraciones-sep', `select version from supabase_migrations.schema_migrations where version >= '20260901' order by 1`);

// 2. Las funciones clave: existen y qué llevan dentro (marcadores, no cuerpos enteros)
await sql('funciones-clave', `
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       (pg_get_functiondef(p.oid) like '%senal_ya_pagada%') as tiene_bloqueo_senal_pagada,
       (pg_get_functiondef(p.oid) like '%rate_limit_ok%') as tiene_rate_limit,
       (pg_get_functiondef(p.oid) like '%consumir_captcha_token%') as consume_captcha,
       (pg_get_functiondef(p.oid) like '%auth.role()%') as mira_rol,
       (pg_get_functiondef(p.oid) like '%p_base_cents%') as acepta_base_cents,
       length(pg_get_functiondef(p.oid)) as longitud_def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('crear_cita_publica','crear_cita_publica_legacy_20260908','crear_cita_publica_grupo',
                    'crear_cita_publica_cadena','requerir_senal_cita','requerir_pago_total_cita',
                    'aplicar_tarjeta_regalo_a_cobro','request_ip','rate_limit_ok','consumir_captcha_token')
order by 1, 2`);

// 3. Columna captcha y tabla de tokens
await sql('captcha-esquema', `
select (select count(*) from information_schema.columns where table_schema='public' and table_name='negocio_portal' and column_name='captcha_activo') as columna_captcha_activo,
       (select string_agg(tablename, ', ') from pg_tables where schemaname='public' and tablename like '%captcha%') as tablas_captcha`);

// 4. Impacto real: ¿se ha usado tarjeta regalo o señales en producción?
await sql('uso-real', `
select (select count(*) from public.tarjetas_regalo) as tarjetas_regalo,
       (select count(*) from public.tarjetas_regalo_movimientos) as movimientos_regalo,
       (select count(*) from public.tarjetas_regalo_movimientos where created_at > now() - interval '7 days') as movimientos_7d,
       (select count(*) from public.pagos where tipo='senal') as senales_total,
       (select count(*) from public.pagos where tipo='senal' and estado='pendiente') as senales_pendientes,
       (select count(*) from public.pagos where tipo='senal' and estado='pagado') as senales_pagadas`);

// 5. Backups y PITR (ayer: vacío y desactivado)
const res = await fetch(base + '/database/backups', { headers: { Authorization: `Bearer ${token}` } });
const backups = await res.json();
fs.writeFileSync(path.join(dir, 'backups.json'), redact(JSON.stringify({ captured_at: new Date().toISOString(), status: res.status, backups }, null, 2)));
console.log(JSON.stringify({ name: 'backups', status: res.status, pitr: backups?.pitr_enabled, diarios: Array.isArray(backups?.backups) ? backups.backups.length : undefined }));
