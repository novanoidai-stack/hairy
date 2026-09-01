-- La inmutabilidad de importes tenia un agujero con la forma de una columna nueva.
--
-- QUE PASABA (verificado en produccion el 1 sep 2026, sin escribir nada)
--
-- `cobros_prevent_financial_updates()` congela los importes de un cobro ya
-- registrado (Ley Antifraude 11/2021). Nombra las columnas UNA A UNA, y
-- `bizum_cents` --que se anadio despues, con la spec 10 (20260830130000)-- no
-- estaba en la lista. Guarda dinero exactamente igual que las otras seis y se
-- podia reescribir en un cobro cerrado sin que el guarda dijera nada.
--
-- Se midio columna a columna contra produccion con un UPDATE que ademas ponia
-- `sesion_caja_id` a un uuid inexistente: los BEFORE ROW triggers corren antes
-- que las constraints, asi que o saltaba el guarda (P0001) o saltaba la FK
-- (23503) -- y en los dos casos la sentencia abortaba sin escribir. Resultado:
--
--   CONGELADA  total_cents, efectivo_cents, datafono_cents, online_cents,
--              propina_cents, descuento_cents, negocio_id, cita_id
--   CONGELADA  cobrado_at, metodo, origen        (segundo mensaje)
--   CONGELADA  estado                            (rama mecha.cobro_ctx)
--   LIBRE      bizum_cents                       <-- el agujero
--   LIBRE      nota, cliente_id, profesional_id, grupo_id   (correcto)
--
-- De paso quedo comprobado que el cuerpo desplegado se comportaba EXACTAMENTE
-- como el del repo (archive/migraciones-legacy/antifraude-cobros-v2-v5.sql):
-- aqui no habia deriva de dashboard como en guard_profile_identity_columns, asi
-- que este `create or replace` no pisa nada que solo existiera en produccion.
--
-- POR QUE SE PUEDE CERRAR YA, SIN ABRIR UN HUECO ANTES
--
-- Quedan 243 cobros con `metodo = 'bizum'` (243 de 243) que llevan su importe en
-- `online_cents` y `bizum_cents` a 0. La spec 10 pedia moverlos, y esa decision
-- YA SE TOMO Y ESTA ESCRITA: 20260830210025_retencion_comisiones_y_bizum.sql, §3.
-- El backfill se intento, lo rechazo este mismo guarda por `online_cents`, y se
-- resolvio al reves --`cerrar_caja` deduce el Bizum de `metodo` cuando
-- `bizum_cents` esta a 0-- porque un cobro es un registro inmutable y la spec se
-- escribio sin contar con eso. O sea que no hay ninguna migracion de datos
-- pendiente a la que haya que dejarle la puerta abierta: el historico se queda
-- como esta, igual que se hizo con los solapes historicos y con los descuadres
-- de la demo. Cerrar ahora cuesta un hueco; cerrar despues costaria dos.
--
-- Y no rompe a nadie: NINGUNA funcion actualiza `bizum_cents`. Los unicos
-- `update cobros` del repo tocan `estado` (anular/reembolsar, por la rama del
-- ctx) y `cliente_id` (fusionar clientes), las dos comprobadas libres arriba.
-- Quien SI escribe bizum_cents es `cobros_encaminar_bizum_trg`, que es BEFORE
-- INSERT: el alta no la toca este guarda.
--
-- EL DETALLE QUE NO SE PUEDE COPIAR DEL RESTO DE LA LISTA
--
-- `bizum_cents` es NULLABLE (`add column ... integer default 0`), y las otras
-- seis son NOT NULL. Con `OLD.x <> NEW.x` --la forma que usan las demas-- un
-- null a cada lado da NULL, no true: la cadena de OR no entraria por la rama de
-- error y el cambio pasaria. O sea que `<>` dejaria justo el mismo agujero un
-- poco mas escondido (poner la columna a NULL, y desde NULL a lo que sea).
-- Va con `is distinct from`, como `cita_id`, que es la unica forma que trata el
-- null como un valor mas.

create or replace function public.cobros_prevent_financial_updates()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- coalesce OBLIGATORIO: current_setting(...,true) devuelve NULL si no existe y
  -- `NULL = '1'` es NULL, que en un `if not v_rpc` no entraria por la rama de
  -- error y dejaria pasar el cambio. Con coalesce es siempre true/false.
  v_rpc boolean := coalesce(current_setting('mecha.cobro_ctx', true), '') = '1';
begin
  -- 1. Importes y vinculos: inmutables SIEMPRE, ni siquiera por RPC.
  if OLD.total_cents <> NEW.total_cents or
     OLD.efectivo_cents <> NEW.efectivo_cents or
     OLD.datafono_cents <> NEW.datafono_cents or
     OLD.online_cents <> NEW.online_cents or
     -- nullable: `is distinct from` o el null se cuela (ver cabecera).
     OLD.bizum_cents is distinct from NEW.bizum_cents or
     OLD.propina_cents <> NEW.propina_cents or
     OLD.descuento_cents <> NEW.descuento_cents or
     OLD.negocio_id <> NEW.negocio_id or
     OLD.cita_id is distinct from NEW.cita_id then
    raise exception 'No se permite modificar los datos financieros de un cobro registrado (Ley Antifraude 11/2021).';
  end if;

  -- 2. Cuando, como y desde donde se cobro: tambien inmutable SIEMPRE.
  if OLD.cobrado_at is distinct from NEW.cobrado_at or
     OLD.metodo is distinct from NEW.metodo or
     OLD.origen is distinct from NEW.origen then
    raise exception 'No se permite cambiar la fecha, el metodo ni el origen de un cobro registrado (Ley Antifraude 11/2021).';
  end if;

  -- 3. Estado: solo por RPC autorizada y sin marcha atras desde terminal.
  if OLD.estado is distinct from NEW.estado then
    if not v_rpc then
      raise exception 'El estado de un cobro solo se cambia con anular_cobro o con un reembolso (Ley Antifraude 11/2021).';
    end if;
    if OLD.estado in ('anulado', 'reembolsado') then
      raise exception 'Un cobro % no puede volver a otro estado (Ley Antifraude 11/2021).', OLD.estado;
    end if;
  end if;

  return NEW;
end;
$function$;

comment on function public.cobros_prevent_financial_updates() is
  'Congela los SIETE importes de un cobro (total, efectivo, datafono, online, bizum, propina, descuento), su negocio, su cita, la fecha, el metodo y el origen. El estado solo lo cambian las RPC que marcan mecha.cobro_ctx, y nunca desde anulado/reembolsado. bizum_cents va con `is distinct from` porque es la unica nullable de las siete (1 sep 2026). Lo vigila scripts/vigilantes/inmutabilidad-cobros.mjs: si manana aparece otra columna _cents en cobros y no se anade aqui, la CI lo dice.';

-- El trigger ya existe (compliance-antifraude-inmutabilidad.sql) y apunta a esta
-- misma funcion, asi que `create or replace` basta. Se re-declara de todas
-- formas para que esta migracion valga en un entorno reconstruido desde cero.
drop trigger if exists cobros_prevent_financial_updates_trigger on public.cobros;
create trigger cobros_prevent_financial_updates_trigger
  before update on public.cobros
  for each row execute function public.cobros_prevent_financial_updates();
