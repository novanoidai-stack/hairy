-- VeriFactu, paso 1 de 3: el esquema del envio y LA DECISION QUE NO SE DESHACE.
--
-- Contexto (informes/ESTUDIO-SECTORIAL-Y-REAUDITORIA-2026-08-30.md §7): hay 1.600
-- tickets encadenados en local y CERO enviados, y en esta tabla no existia ni una
-- columna donde anotar el resultado de un envio. Esto la prepara.
--
-- ── Lo que se encontro al abrirlo, y obliga a cortar la cadena ────────────────
--
-- `mint_ticket_verifactu` leia el NIF de `negocio_portal.nif`, que esta VACIO en
-- los tres negocios, y caia a `negocio_id` como identificador del emisor. O sea
-- que los 1.600 tickets estan encadenados contra "demo_salon_001" y
-- "florent_surez_peluqueros_15004" en el sitio donde va un NIF. El NIF de verdad
-- estaba al lado, en `config_fiscal.nif` (B5786236 para el salon real), sin que
-- nadie lo leyera. `payload->>'nif_real'` es null en las 1.600 filas.
--
-- Ademas la huella se calculaba con un formato propio
-- (`cif|numero|fecha|total|anterior`) y no con la cadena oficial de la AEAT, que
-- es la que ya implementa lib/fiscal/huella.ts.
--
-- Conclusion: lo emitido hasta hoy es un LIBRO INTERNO valido como tal --numeracion
-- correlativa, inalterable, tickets que se rectifican y no se borran-- y no puede
-- ser el principio de una cadena que se remita a Hacienda. No se reescribe (seria
-- exactamente lo que la cadena existe para impedir): se marca `formato_huella =
-- 'interno_v1'` y la cadena AEAT arranca limpia cuando hay un NIF de verdad.
--
-- ── La decision que no se deshace ─────────────────────────────────────────────
--
-- La cadena pasa a ir por **(negocio_id, nif_emisor, serie)** y no por
-- (negocio_id, serie). Dos motivos:
--
--   1. Es lo correcto: la correlatividad y el encadenado son POR EMISOR. Meter
--      dos NIF en una serie es una cadena invalida.
--   2. Deja abierta la puerta del alquiler de sillon (spec 14), que son N
--      autonomos con N NIF bajo un mismo techo -- o sea, N emisores dentro de un
--      `negocio_id`. Hoy cuesta lo mismo; con 50.000 tickets emitidos ya no se
--      puede.
--
-- Y de regalo resuelve el corte: cuando un salon rellena su NIF, `nif_emisor`
-- cambia, la cadena nueva no encuentra anterior y arranca con huella vacia, que
-- es justo lo que la AEAT espera del primer registro de un emisor.

alter table public.tickets_verifactu
  -- Quien emite. Null = todavia no hay NIF configurado: ticket interno, no enviable.
  add column if not exists nif_emisor text,
  -- Con que formato se calculo la huella. Sin esto, un cambio de formato a mitad
  -- de cadena es invisible y no hay forma de auditar donde esta el corte.
  add column if not exists formato_huella text not null default 'interno_v1',
  add column if not exists tipo_factura text,
  add column if not exists base_cents integer,
  add column if not exists cuota_cents integer,
  -- URL de cotejo que va dentro del QR del ticket.
  add column if not exists qr_url text,
  add column if not exists estado_envio text not null default 'no_enviado',
  add column if not exists enviado_at timestamptz,
  add column if not exists csv_aeat text,
  add column if not exists respuesta_aeat jsonb,
  add column if not exists intentos integer not null default 0,
  add column if not exists ultimo_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tickets_verifactu_formato_huella_chk') then
    alter table public.tickets_verifactu
      add constraint tickets_verifactu_formato_huella_chk
      check (formato_huella in ('interno_v1', 'aeat_v1'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tickets_verifactu_estado_envio_chk') then
    alter table public.tickets_verifactu
      add constraint tickets_verifactu_estado_envio_chk
      check (estado_envio in (
        'no_enviado',            -- interno: no hay NIF, o VeriFactu no esta activo
        'pendiente',             -- listo para enviar, el worker no ha pasado
        'enviado',               -- mandado, sin respuesta firme todavia
        'aceptado',
        'aceptado_con_errores',  -- la AEAT lo admite y senala defectos
        'rechazado',
        'anulado'
      ));
  end if;
end $$;

-- Lo emitido hasta hoy: se deja tal cual y se etiqueta con lo que de verdad se
-- uso como emisor. Honesto y auditable; no se toca ni un hash.
update public.tickets_verifactu
   set nif_emisor = coalesce(nif_emisor, payload->>'cif_emisor'),
       formato_huella = 'interno_v1',
       estado_envio = 'no_enviado'
 where nif_emisor is null;

-- La cadena, ahora por emisor. Unico ademas: dos tickets con el mismo numero en
-- la misma serie del mismo emisor es una cadena rota.
create unique index if not exists tickets_verifactu_cadena_uk
  on public.tickets_verifactu (negocio_id, coalesce(nif_emisor, ''), serie, numero);

-- Lo que el worker pregunta en cada pasada: dame lo pendiente, por orden.
create index if not exists tickets_verifactu_por_enviar_idx
  on public.tickets_verifactu (negocio_id, estado_envio, numero)
  where estado_envio in ('pendiente', 'enviado');

comment on column public.tickets_verifactu.nif_emisor is
  'NIF del emisor. La cadena va por (negocio_id, nif_emisor, serie): un negocio_id puede albergar varios emisores (alquiler de sillon). Null = ticket interno sin NIF configurado.';
comment on column public.tickets_verifactu.formato_huella is
  'interno_v1 = formato propio previo al 30 ago 2026, encadenado contra el negocio_id porque el NIF se leia de una tabla vacia. aeat_v1 = cadena oficial de la AEAT (ver lib/fiscal/huella.ts).';
