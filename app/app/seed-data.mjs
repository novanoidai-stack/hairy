import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://aujlzfmrtafbmmjybjxz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1amx6Zm1ydGFmYm1tanlianh6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI5NDU3NywiZXhwIjoyMDg3ODcwNTc3fQ.zS5vCJeXDTlfdafNYZ6ct4pbE6Bk7QNyOym79jTzL60';

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('🌱 Seeding test data...');

  // Get user's negocio
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, negocio_id')
    .eq('id', user?.id)
    .single();

  if (!profile?.negocio_id) {
    console.error('❌ No negocio_id found');
    return;
  }

  const negocioId = profile.negocio_id;
  console.log(`📌 Using negocio_id: ${negocioId}`);

  // Insert profesionales
  const profesionales = [
    { nombre: 'Carlos', color: '#6366f1', activo: true },
    { nombre: 'Javier', color: '#f59e0b', activo: true },
    { nombre: 'María', color: '#10b981', activo: true },
  ];

  for (const prof of profesionales) {
    const { error } = await supabase.from('profesionales').insert({
      negocio_id: negocioId,
      nombre: prof.nombre,
      color: prof.color,
      activo: prof.activo,
    });
    if (error) console.error(`Error inserting ${prof.nombre}:`, error);
    else console.log(`✅ Added ${prof.nombre}`);
  }

  // Get inserted profesionales
  const { data: profs } = await supabase
    .from('profesionales')
    .select('id')
    .eq('negocio_id', negocioId);

  if (!profs?.length) {
    console.error('❌ No profesionales were inserted');
    return;
  }

  // Insert servicios
  const servicios = [
    { nombre: 'Corte hombre', categoria: 'Cortes', precio: 25, duracion_minutos: 30 },
    { nombre: 'Corte mujer', categoria: 'Cortes', precio: 35, duracion_minutos: 45 },
    { nombre: 'Tinte', categoria: 'Color', precio: 50, duracion_minutos: 90 },
    { nombre: 'Peinado', categoria: 'Tratamientos', precio: 20, duracion_minutos: 20 },
  ];

  for (const serv of servicios) {
    const { error } = await supabase.from('servicios').insert({
      negocio_id: negocioId,
      nombre: serv.nombre,
      categoria: serv.categoria,
      precio: serv.precio,
      duracion_minutos: serv.duracion_minutos,
      activo: true,
    });
    if (error) console.error(`Error inserting ${serv.nombre}:`, error);
    else console.log(`✅ Added ${serv.nombre}`);
  }

  // Insert clientes
  const clientes = [
    { nombre: 'Ana García', telefono: '645123456', email: 'ana@example.com' },
    { nombre: 'Rosa López', telefono: '634567890', email: 'rosa@example.com' },
    { nombre: 'Carmen Ruiz', telefono: '667891234', email: 'carmen@example.com' },
  ];

  const clientIds = [];
  for (const cli of clientes) {
    const { data, error } = await supabase.from('clientes').insert({
      negocio_id: negocioId,
      nombre: cli.nombre,
      telefono: cli.telefono,
      email: cli.email,
    }).select('id');
    if (error) console.error(`Error inserting ${cli.nombre}:`, error);
    else {
      console.log(`✅ Added ${cli.nombre}`);
      if (data?.length) clientIds.push(data[0].id);
    }
  }

  // Insert citas
  const now = new Date();
  const citas = [
    { cliente_id: clientIds[0], profesional_id: profs[0].id, servicio_id: null, inicio: new Date(now.getTime() + 3600000), duracion: 30, estado: 'confirmada' },
    { cliente_id: clientIds[1], profesional_id: profs[1].id, servicio_id: null, inicio: new Date(now.getTime() + 7200000), duracion: 45, estado: 'confirmada' },
    { cliente_id: clientIds[2], profesional_id: profs[2].id, servicio_id: null, inicio: new Date(now.getTime() + 10800000), duracion: 90, estado: 'pendiente' },
  ];

  for (const cita of citas) {
    const inicio = cita.inicio.toISOString();
    const fin = new Date(cita.inicio.getTime() + cita.duracion * 60000).toISOString();
    const { error } = await supabase.from('citas').insert({
      negocio_id: negocioId,
      cliente_id: cita.cliente_id,
      profesional_id: cita.profesional_id,
      inicio,
      fin,
      estado: cita.estado,
    });
    if (error) console.error(`Error inserting cita:`, error);
    else console.log(`✅ Added cita`);
  }

  console.log('✨ Seeding complete!');
}

seed().catch(console.error);
