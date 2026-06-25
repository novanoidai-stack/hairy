-- MIGRACIÓN: Cumplimiento Ley Antifraude 11/2021 (Inmutabilidad de Registros Financieros)
-- Fecha: 25 de junio de 2026
-- Autor: Antigravity
--
-- Objetivo:
-- Garantizar que una vez que se registre un cobro en Mecha, los importes, métodos de pago,
-- negocio_id y cita_id queden blindados contra cualquier modificación o borrado accidental/malicioso.
-- Cualquier corrección debe hacerse mediante un cobro negativo/reembolso, no modificando o borrando.

-- ===============================================================================
-- 1. BLOQUEAR CUALQUIER BORRADO (DELETE) EN COBROS Y LINEAS DE COBRO
-- ===============================================================================

create or replace function public.prevent_delete_financial_records()
returns trigger as $$
begin
  raise exception 'No se permite eliminar registros financieros del POS (Ley Antifraude 11/2021).';
end;
$$ language plpgsql security definer set search_path = public;

-- Trigger para la cabecera de cobros
drop trigger if exists cobros_prevent_delete_trigger on public.cobros;
create trigger cobros_prevent_delete_trigger
  before delete on public.cobros
  for each row execute function public.prevent_delete_financial_records();

-- Trigger para el detalle de líneas de cobro
drop trigger if exists cobro_lineas_prevent_delete_trigger on public.cobro_lineas;
create trigger cobro_lineas_prevent_delete_trigger
  before delete on public.cobro_lineas
  for each row execute function public.prevent_delete_financial_records();

-- ===============================================================================
-- 2. BLOQUEAR MODIFICACIÓN DE CAMPOS FINANCIEROS (UPDATE) EN COBROS
-- ===============================================================================

create or replace function public.cobros_prevent_financial_updates()
returns trigger as $$
begin
  if OLD.total_cents <> NEW.total_cents or
     OLD.efectivo_cents <> NEW.efectivo_cents or
     OLD.datafono_cents <> NEW.datafono_cents or
     OLD.online_cents <> NEW.online_cents or
     OLD.propina_cents <> NEW.propina_cents or
     OLD.descuento_cents <> NEW.descuento_cents or
     OLD.negocio_id <> NEW.negocio_id or
     OLD.cita_id is distinct from NEW.cita_id then
    raise exception 'No se permite modificar los datos financieros de un cobro registrado (Ley Antifraude 11/2021).';
  end if;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists cobros_prevent_financial_updates_trigger on public.cobros;
create trigger cobros_prevent_financial_updates_trigger
  before update on public.cobros
  for each row execute function public.cobros_prevent_financial_updates();

-- ===============================================================================
-- 3. ELIMINAR POLÍTICAS DE BORRADO DE RLS
-- ===============================================================================

drop policy if exists cobros_delete_own on public.cobros;
drop policy if exists cobro_lineas_delete_own on public.cobro_lineas;

comment on function public.prevent_delete_financial_records() is 'Impide la eliminación física de cualquier registro financiero (Ley Antifraude 11/2021).';
comment on function public.cobros_prevent_financial_updates() is 'Impide la modificación de campos monetarios y de enlace en cobros (Ley Antifraude 11/2021).';
