-- Final RLS Lockdown Validation
-- Asegura que todas las tablas core (incluidas productos, movimientos_inventario, citas, presupuestos, cobros) tienen RLS activado.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename IN ('productos', 'movimientos_inventario', 'citas', 'presupuestos', 'cobros')
    LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY;';
    END LOOP;
END
$$;
