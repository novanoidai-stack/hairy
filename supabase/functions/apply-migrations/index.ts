// Edge Function para aplicar migración is_team_member
// Usa el driver de PostgreSQL directamente con connection string pooling
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// SQL para crear is_team_member con emails hardcoded
const SQL_MIGRATION = `
-- Crear is_team_member con emails hardcoded (incluye Carlos)
CREATE OR REPLACE FUNCTION public.is_team_member()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or email ilike '%@novanoidai.com'
        or exists (
          select 1 from public.staff s
          where lower(s.email) = lower(profiles.email)
        )
        or lower(email) in (
          'novanoidai@gmail.com',
          'carlitosocanamartinez@gmail.com',
          'carlitoscanamartimez@gmail.com',
          'carletes2007cc@gmail.com',
          'alexandruiscru07@gmail.com',
          'alexandru.iscru07@gmail.com'
        )
      )
  ) into v_exists;
  return v_exists;
end;
$$;

-- Actualizar políticas de staff para usar is_team_member
drop policy if exists "Staff can select all staff" on public.staff;
create policy "Staff can select all staff" on public.staff
  for select to authenticated
  using (public.is_team_member());

drop policy if exists "Staff can insert staff" on public.staff;
create policy "Staff can insert staff" on public.staff
  for insert to authenticated
  with check (public.is_team_member());

drop policy if exists "Staff can delete staff" on public.staff;
create policy "Staff can delete staff" on public.staff
  for delete to authenticated
  using (public.is_team_member());

grant execute on function public.is_team_member() to authenticated, anon;
`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Obtener DATABASE_URL de variables de entorno
    const databaseUrl = Deno.env.get('DATABASE_URL')!

    if (!databaseUrl) {
      throw new Error('DATABASE_URL no encontrada en variables de entorno')
    }

    // Ejecutar SQL usando el cliente de PostgreSQL
    const client = new Client(databaseUrl)
    await client.connect()

    try {
      await client.queryObject(SQL_MIGRATION)
    } finally {
      await client.end()
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Migración is_team_member aplicada correctamente'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error aplicando migración:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Error desconocido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
