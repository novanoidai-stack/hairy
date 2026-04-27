import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vtrggiogjrhqtwbhbgia.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc1NzI5NSwiZXhwIjoyMDkyMzMzMjk1fQ.5ejE9ktV7edy2jC4uaDbBvmj34_yPn8wscX6JGDSTZ4'
);

const NEGOCIO_ID = 'prueba_46980';

async function seedData() {
  try {
    console.log('🌱 Iniciando seed de datos...\n');

    // 1. Crear profesionales
    console.log('📝 Creando profesionales...');
    const profesionales = [
      { nombre: 'Carla', color: '#8b5cf6' },
      { nombre: 'Diego', color: '#10b981' },
      { nombre: 'Sofía', color: '#f59e0b' },
      { nombre: 'Marco', color: '#06b6d4' },
    ];

    const { data: profsData, error: profsError } = await supabase
      .from('profesionales')
      .insert(
        profesionales.map((p) => ({
          negocio_id: NEGOCIO_ID,
          nombre: p.nombre,
          color: p.color,
          activo: true,
        }))
      )
      .select();

    if (profsError) throw profsError;
    console.log(`✅ ${profsData?.length || 0} profesionales creados\n`);

    // 2. Crear servicios (si no existen)
    console.log('📝 Creando servicios...');
    const servicios = [
      { nombre: 'Corte de cabello', duracion_activa_min: 30, duracion_espera_min: 10, duracion_activa_extra_min: 0, precio: 25 },
      { nombre: 'Tinte', duracion_activa_min: 60, duracion_espera_min: 40, duracion_activa_extra_min: 20, precio: 65 },
      { nombre: 'Barba', duracion_activa_min: 20, duracion_espera_min: 5, duracion_activa_extra_min: 0, precio: 15 },
      { nombre: 'Manicura', duracion_activa_min: 45, duracion_espera_min: 0, duracion_activa_extra_min: 0, precio: 35 },
      { nombre: 'Tratamiento capilar', duracion_activa_min: 50, duracion_espera_min: 30, duracion_activa_extra_min: 10, precio: 55 },
    ];

    const { data: srvsData, error: srvsError } = await supabase
      .from('servicios')
      .insert(
        servicios.map((s) => ({
          negocio_id: NEGOCIO_ID,
          ...s,
        }))
      )
      .select();

    if (srvsError) throw srvsError;
    console.log(`✅ ${srvsData?.length || 0} servicios creados\n`);

    // 3. Crear clientes
    console.log('📝 Creando clientes...');
    const clientes = [
      { nombre: 'María Rodríguez', telefono: '+34 666 111 111' },
      { nombre: 'Juan García', telefono: '+34 666 222 222' },
      { nombre: 'Ana Martínez', telefono: '+34 666 333 333' },
      { nombre: 'Carlos López', telefono: '+34 666 444 444' },
      { nombre: 'Elena Sánchez', telefono: '+34 666 555 555' },
      { nombre: 'David Fernández', telefono: '+34 666 666 666' },
      { nombre: 'Carmen Vázquez', telefono: '+34 666 777 777' },
      { nombre: 'Lucía Pérez', telefono: '+34 666 888 888' },
    ];

    const { data: cltsData, error: cltsError } = await supabase
      .from('clientes')
      .insert(
        clientes.map((c) => ({
          negocio_id: NEGOCIO_ID,
          ...c,
        }))
      )
      .select();

    if (cltsError) throw cltsError;
    console.log(`✅ ${cltsData?.length || 0} clientes creados\n`);

    // 4. Crear citas
    console.log('📝 Creando citas...');
    const hoy = new Date(2026, 3, 27); // Apr 27, 2026
    const citas = [
      { hora: 9, min: 0, prof_idx: 0, cli_idx: 0, srv_idx: 0, estado: 'confirmada' }, // Carla - María - Corte
      { hora: 10, min: 0, prof_idx: 1, cli_idx: 1, srv_idx: 1, estado: 'pendiente' }, // Diego - Juan - Tinte
      { hora: 10, min: 30, prof_idx: 1, cli_idx: 2, srv_idx: 2, estado: 'confirmada' }, // Diego - Ana - Barba
      { hora: 13, min: 0, prof_idx: 0, cli_idx: 3, srv_idx: 0, estado: 'confirmada' }, // Carla - Carlos - Corte
      { hora: 15, min: 30, prof_idx: 2, cli_idx: 4, srv_idx: 4, estado: 'confirmada' }, // Sofía - Elena - Tratamiento
      { hora: 16, min: 0, prof_idx: 3, cli_idx: 5, srv_idx: 2, estado: 'confirmada' }, // Marco - David - Barba
      { hora: 17, min: 0, prof_idx: 2, cli_idx: 6, srv_idx: 3, estado: 'confirmada' }, // Sofía - Carmen - Manicura
      { hora: 17, min: 30, prof_idx: 2, cli_idx: 7, srv_idx: 3, estado: 'confirmada' }, // Sofía - Lucía - Manicura
    ];

    const citasInsert = citas.map((c) => {
      const prof = profsData?.[c.prof_idx];
      const srv = srvsData?.[c.srv_idx];
      const cli = cltsData?.[c.cli_idx];

      const inicio = new Date(hoy);
      inicio.setHours(c.hora, c.min, 0, 0);

      const duracionActiva = srv?.duracion_activa_min || 30;
      const duracionEspera = srv?.duracion_espera_min || 0;
      const duracionExtra = srv?.duracion_activa_extra_min || 0;

      const finActiva = new Date(inicio.getTime() + duracionActiva * 60000);
      const finEspera = new Date(inicio.getTime() + (duracionActiva + duracionEspera) * 60000);
      const fin = new Date(inicio.getTime() + (duracionActiva + duracionEspera + duracionExtra) * 60000);

      return {
        negocio_id: NEGOCIO_ID,
        profesional_id: prof?.id,
        servicio_id: srv?.id,
        cliente_id: cli?.id,
        inicio: inicio.toISOString(),
        fin_activa: finActiva.toISOString(),
        fin_espera: finEspera.toISOString(),
        fin: fin.toISOString(),
        estado: c.estado,
        canal: 'manual',
        notas: null,
      };
    });

    const { data: citasData, error: citasError } = await supabase
      .from('citas')
      .insert(citasInsert)
      .select();

    if (citasError) throw citasError;
    console.log(`✅ ${citasData?.length || 0} citas creadas\n`);

    console.log('🎉 ¡Seed completado exitosamente!');
  } catch (error: any) {
    console.error('❌ Error:', error?.message || error);
    process.exit(1);
  }
}

seedData();
