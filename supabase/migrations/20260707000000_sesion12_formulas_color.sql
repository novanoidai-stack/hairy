-- Migración: formulas_color (Sesión 12-A)
-- Tabla para almacenar fórmulas de color vinculadas a clientes y citas, 
-- con soporte multi-tenant (negocio_id).

CREATE TABLE IF NOT EXISTS public.formulas_color (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    negocio_id text NOT NULL,
    cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    cita_id uuid REFERENCES public.citas(id) ON DELETE SET NULL,
    producto text,
    tono text,
    gramos numeric,
    oxidante text,
    tiempos text,
    notas text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.formulas_color ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (Multi-tenant estricto)

-- POLICY: Usuarios pueden ver fórmulas de su propio negocio
CREATE POLICY "ver_formulas_propio_negocio" ON public.formulas_color
    FOR SELECT
    USING (
        negocio_id = (
            SELECT negocio_id 
            FROM public.profiles 
            WHERE id = auth.uid()
        )
    );

-- POLICY: Usuarios pueden insertar fórmulas en su propio negocio
CREATE POLICY "insertar_formulas_propio_negocio" ON public.formulas_color
    FOR INSERT
    WITH CHECK (
        negocio_id = (
            SELECT negocio_id 
            FROM public.profiles 
            WHERE id = auth.uid()
        )
    );

-- POLICY: Usuarios pueden actualizar fórmulas de su propio negocio
CREATE POLICY "actualizar_formulas_propio_negocio" ON public.formulas_color
    FOR UPDATE
    USING (
        negocio_id = (
            SELECT negocio_id 
            FROM public.profiles 
            WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        negocio_id = (
            SELECT negocio_id 
            FROM public.profiles 
            WHERE id = auth.uid()
        )
    );

-- POLICY: Usuarios pueden eliminar fórmulas de su propio negocio
CREATE POLICY "eliminar_formulas_propio_negocio" ON public.formulas_color
    FOR DELETE
    USING (
        negocio_id = (
            SELECT negocio_id 
            FROM public.profiles 
            WHERE id = auth.uid()
        )
    );

-- Grant permissions (para que la BD permita el acceso)
GRANT ALL ON TABLE public.formulas_color TO authenticated;
GRANT ALL ON TABLE public.formulas_color TO service_role;
