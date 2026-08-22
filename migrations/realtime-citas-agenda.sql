-- Realtime de la agenda: que una cita creada desde el portal, desde el agente
-- de WhatsApp o desde otra pantalla del salon aparezca en recepcion sin recargar.
--
-- Hasta ahora la publicacion supabase_realtime estaba VACIA: el cliente podia
-- suscribirse y no recibia nada nunca, sin error ninguno. Por eso hay que
-- publicar la tabla explicitamente.
--
-- Sobre replica identity: se deja la de por defecto (la clave primaria). Con
-- REPLICA IDENTITY FULL el evento de DELETE viajaria con TODAS las columnas de
-- la fila borrada, lo que engorda el WAL y saca datos de cliente por el socket
-- sin necesidad. Como contrapartida, un DELETE solo trae el id y el filtro por
-- negocio_id no puede aplicarse en servidor: el cliente se suscribe a los
-- borrados sin filtro y solo hace caso de los ids que ya tenia cargados (que
-- son, por definicion, los que ya pasaron RLS al leerlos).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'citas'
  ) then
    alter publication supabase_realtime add table public.citas;
  end if;
end $$;
