import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, {
  columnasDeDinero,
  cuerpoDelGuarda,
  definicionVigente,
} from './inmutabilidad-cobros.mjs';

// El guarda de verdad, recortado. Sirve de fixture para las dos formas.
const GUARDA_CON_BIZUM = `
create or replace function public.cobros_prevent_financial_updates()
returns trigger
language plpgsql
as $function$
begin
  if OLD.total_cents <> NEW.total_cents or
     OLD.efectivo_cents <> NEW.efectivo_cents or
     OLD.bizum_cents is distinct from NEW.bizum_cents or
     OLD.propina_cents <> NEW.propina_cents then
    raise exception 'No se permite modificar (Ley Antifraude 11/2021).';
  end if;
  return NEW;
end;
$function$;`;

// Los tipos que genera Supabase, con la sangria exacta del fichero real.
const TIPOS = `
      cobros: {
        Row: {
          bizum_cents: number | null
          cita_id: string | null
          efectivo_cents: number
          metodo: string
          propina_cents: number
          total_cents: number
        }
        Insert: {
          bizum_cents?: number | null
        }
      }
`;

test('lee las columnas de dinero de cobros y sabe cual admite null', () => {
  const cols = columnasDeDinero(TIPOS);
  assert.deepEqual(
    cols.map((c) => c.nombre).sort(),
    ['bizum_cents', 'efectivo_cents', 'propina_cents', 'total_cents'],
  );
  // Solo las *_cents: ni cita_id ni metodo se cuelan.
  assert.equal(cols.length, 4);
  assert.equal(cols.find((c) => c.nombre === 'bizum_cents').nullable, true);
  assert.equal(cols.find((c) => c.nombre === 'total_cents').nullable, false);
});

test('si el bloque Row de cobros no aparece, FALLA en vez de callarse', () => {
  assert.throws(() => columnasDeDinero('export type Database = {}'), {
    name: 'AnclaPerdida',
  });
});

test('recorta el cuerpo entre dollar-quotes y no se lleva otra funcion del fichero', () => {
  const dosFunciones = `${GUARDA_CON_BIZUM}
create or replace function public.otra_cosa() returns trigger as $$
begin
  -- descuento_cents vive aqui, en la funcion de al lado.
  return new;
end;
$$;`;
  const cuerpo = cuerpoDelGuarda(dosFunciones);
  assert.match(cuerpo, /Ley Antifraude/);
  assert.doesNotMatch(cuerpo, /descuento_cents/);
});

test('si el fichero no define el guarda, devuelve null', () => {
  assert.equal(cuerpoDelGuarda('select 1;'), null);
});

// --- El corazon: la columna que se queda fuera -------------------------------

test('la columna de dinero que el guarda no nombra es bloqueante', () => {
  // El bug real del 30 ago 2026: bizum_cents existia y el guarda no la nombraba.
  const sinBizum = GUARDA_CON_BIZUM.replace(
    '     OLD.bizum_cents is distinct from NEW.bizum_cents or\n',
    '',
  );
  const cuerpo = cuerpoDelGuarda(sinBizum);
  const cols = columnasDeDinero(TIPOS);
  const libres = cols.filter((c) => !new RegExp(`\\b${c.nombre}\\b`).test(cuerpo));
  assert.deepEqual(libres.map((c) => c.nombre), ['bizum_cents']);
});

test('una columna nullable comparada con <> es el mismo agujero, mas escondido', () => {
  const conDesigualdad = GUARDA_CON_BIZUM.replace(
    'OLD.bizum_cents is distinct from NEW.bizum_cents',
    'OLD.bizum_cents <> NEW.bizum_cents',
  );
  const cuerpo = cuerpoDelGuarda(conDesigualdad);
  // Esta nombrada -- por eso la primera comprobacion no la ve...
  assert.match(cuerpo, /\bbizum_cents\b/);
  // ...pero la comparacion no aguanta un null.
  const m = /old\.bizum_cents\s*(<>|!=|is\s+distinct\s+from)/i.exec(cuerpo);
  assert.equal(m[1], '<>');
});

// --- Contra el repo de verdad ------------------------------------------------

test('el repo tiene una definicion vigente del guarda y menciona la ley', () => {
  const vigente = definicionVigente();
  assert.ok(vigente, 'no se encuentra ninguna definicion del guarda en el repo');
  assert.match(vigente.cuerpo, /Ley Antifraude/);
});

test('hoy, contra el repo real, no hay ninguna columna de dinero suelta', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(
    hallazgos.map((h) => h.titulo),
    [],
    'hay columnas de cobros con dinero fuera del guarda de inmutabilidad',
  );
});
