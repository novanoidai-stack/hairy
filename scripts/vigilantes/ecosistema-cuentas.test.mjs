import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vigilante, {
  analizarGuarda,
  buscarDeduccionesAMano,
  soloCodigo,
  COLUMNAS_CONGELADAS,
  DEDUCE_TITULAR_A_MANO,
} from './ecosistema-cuentas.mjs';
import { AnclaPerdida } from './nucleo.mjs';

const FICHERO = 'supabase/migrations/20260830002457_guard_profiles_congelar_de_verdad.sql';

// La version que estuvo CORRIENDO en produccion hasta el 30 ago 2026. Se guarda
// aqui tal cual para que la prueba de vida no sea un caso inventado: si el
// vigilante no caza esto, no sirve para nada.
const GUARDA_ROTO = `
create or replace function public.guard_profile_identity_columns()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if current_setting('mecha.identity_ctx', true) = '1' then return new; end if;
  if auth.role() = 'service_role' or auth.role() = 'supabase_admin' then return new; end if;
  new.negocio_id             := COALESCE(new.negocio_id, old.negocio_id);
  new.plan                   := COALESCE(new.plan, old.plan);
  new.ia_nivel               := COALESCE(new.ia_nivel, old.ia_nivel);
  new.trial_ends_at          := COALESCE(new.trial_ends_at, old.trial_ends_at);
  new.stripe_customer_id     := COALESCE(new.stripe_customer_id, old.stripe_customer_id);
  new.stripe_subscription_id := COALESCE(new.stripe_subscription_id, old.stripe_subscription_id);
  new.suscripcion_estado     := COALESCE(new.suscripcion_estado, old.suscripcion_estado);
  new.periodo_fin            := COALESCE(new.periodo_fin, old.periodo_fin);
  return new;
end;
$$;
`;

const GUARDA_BUENO = `
create or replace function public.guard_profile_identity_columns()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('mecha.identity_ctx', true) = '1' then return new; end if;
${COLUMNAS_CONGELADAS.map((c) => `  new.${c} := old.${c};`).join('\n')}
  return new;
end;
$$;
`;

// --- Prueba de vida: el fallo real del 30 ago 2026 --------------------------

test('caza el guarda que estuvo en produccion: COALESCE y sin `role`', () => {
  const h = analizarGuarda(GUARDA_ROTO, FICHERO);
  const claves = h.map((x) => x.clave);

  assert.ok(claves.includes('cuentas/guarda-con-coalesce'), 'no vio el COALESCE');
  assert.ok(claves.includes('cuentas/guarda-sin-role'), 'no vio que falta congelar role');
  // Con COALESCE, NINGUNA columna esta congelada de verdad.
  for (const col of COLUMNAS_CONGELADAS) {
    assert.ok(claves.includes(`cuentas/guarda-sin-${col}`), `no vio que falta ${col}`);
  }
  assert.ok(h.every((x) => x.nivel === 'bloqueante'), 'esto no puede ser un aviso');
});

test('el guarda correcto no da ningun hallazgo', () => {
  assert.deepEqual(analizarGuarda(GUARDA_BUENO, FICHERO), []);
});

test('quitar una sola columna ya es bloqueante', () => {
  const sinNegocio = GUARDA_BUENO.replace('  new.negocio_id := old.negocio_id;\n', '');
  const claves = analizarGuarda(sinNegocio, FICHERO).map((x) => x.clave);
  assert.deepEqual(claves, ['cuentas/guarda-sin-negocio_id']);
});

// --- El ancla perdida FALLA, no pasa en verde -------------------------------

test('si la funcion desaparece del fichero, revienta en vez de dar OK', () => {
  assert.throws(
    () => analizarGuarda('-- aqui ya no hay nada\nselect 1;', FICHERO),
    AnclaPerdida,
  );
});

// --- El falso positivo del estreno -----------------------------------------

test('un comentario que EXPLICA el fallo no cuenta como el fallo', () => {
  // Los tres hallazgos del estreno fueron esto: los ficheros nuevos escriben
  // `COALESCE(new.plan, old.plan)` dentro de un comentario para contar por que
  // estaba mal. Castigar la documentacion es la peor forma de tener vigilantes.
  const conComentario = GUARDA_BUENO.replace(
    'begin',
    "begin\n  -- ANTES estaba mal: new.plan := COALESCE(new.plan, old.plan);",
  );
  assert.deepEqual(analizarGuarda(conComentario, FICHERO), []);
});

test('soloCodigo quita comentarios de SQL y de TypeScript sin mover las lineas', () => {
  const antes = 'const a = 1; // COALESCE(new.plan, old.plan)\n-- COALESCE(new.role, old.role)\nconst b = 2;';
  const despues = soloCodigo(antes);
  assert.equal(despues.split('\n').length, antes.split('\n').length, 'las lineas se conservan');
  assert.ok(!/COALESCE/i.test(despues), 'no deberia quedar nada de los comentarios');
  assert.ok(despues.includes('const a = 1;'));
  assert.ok(despues.includes('const b = 2;'));
});

// --- Nadie deduce al titular a mano ----------------------------------------

test('caza la consulta que estaba copiada en seis sitios', () => {
  const malo = `
    select p.plan into v_plan from public.profiles p
     where p.negocio_id = p_negocio_id
       and p.role = 'owner'
     order by p.created_at asc
     limit 1;
  `;
  const h = buscarDeduccionesAMano([{ rel: 'supabase/migrations/9999_x.sql', texto: malo }]);
  assert.equal(h.length, 1);
  assert.equal(h[0].nivel, 'bloqueante');
});

test('contar propietarios NO es deducir el titular', () => {
  // staff_set_role y set_member_role cuentan owners para no dejar el salon sin
  // ninguno. Eso es correcto y no puede marcarse.
  const legitimo = `
    select count(*) into v_owners from public.profiles
     where negocio_id = prof.negocio_id and role = 'owner';
    if v_owners <= 1 then raise exception 'ultimo_propietario'; end if;
  `;
  assert.deepEqual(buscarDeduccionesAMano([{ rel: 'x.sql', texto: legitimo }]), []);
});

test('el regex no casa con un `role = owner` suelto', () => {
  assert.ok(!DEDUCE_TITULAR_A_MANO.test("where role = 'owner' and activo"));
});

// --- El repo de verdad, hoy -------------------------------------------------

test('el guarda que hay en el repo ahora mismo esta bien', () => {
  assert.deepEqual(analizarGuarda(readFileSync(FICHERO, 'utf8'), FICHERO), []);
});

test('el vigilante entero pasa sobre el repo actual', async () => {
  const h = await vigilante.ejecutar();
  assert.deepEqual(
    h.filter((x) => x.nivel === 'bloqueante'),
    [],
    'hay hallazgos bloqueantes en el repo:\n' + JSON.stringify(h, null, 2),
  );
});
