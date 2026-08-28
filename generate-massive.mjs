import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const supabaseKey = 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Logging in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'carlitosocanamartinez@gmail.com',
    password: 'minicharlie2007',
  });

  if (authError) {
    console.error('Login failed', authError);
    return;
  }

  const { data: profile } = await supabase.from('profiles').select('negocio_id').eq('id', authData.user.id).single();
  const negocioId = profile.negocio_id;
  console.log('Negocio ID:', negocioId);

  // 1. Setup Profesionales (Keep exactly 5 active)
  let { data: profs } = await supabase.from('profesionales').select('*').eq('negocio_id', negocioId);
  const targetProfs = 5;
  if (profs.length < targetProfs) {
    const missing = targetProfs - profs.length;
    const newProfs = Array.from({length: missing}).map((_, i) => ({
      negocio_id: negocioId,
      nombre: `Profesor ${i}`,
      color: '#000000',
      activo: true
    }));
    await supabase.from('profesionales').insert(newProfs);
    profs = (await supabase.from('profesionales').select('*').eq('negocio_id', negocioId)).data;
  }
  
  // Set 5 to active, rest to inactive
  for (let i = 0; i < profs.length; i++) {
    const shouldBeActive = i < targetProfs;
    if (profs[i].activo !== shouldBeActive) {
      await supabase.from('profesionales').update({ activo: shouldBeActive }).eq('id', profs[i].id);
      profs[i].activo = shouldBeActive;
    }
  }
  const activeProfs = profs.filter(p => p.activo);
  console.log(`Active Profesionales: ${activeProfs.length}`);

  // 2. Servicios
  let { data: servs } = await supabase.from('servicios').select('*').eq('negocio_id', negocioId).eq('activo', true);
  if (!servs || servs.length === 0) {
    console.log('No services found, inserting defaults...');
    await supabase.from('servicios').insert([
      { negocio_id: negocioId, nombre: 'Corte', precio: 15, duracion_activa_min: 30, activo: true },
      { negocio_id: negocioId, nombre: 'Tinte', precio: 40, duracion_activa_min: 90, activo: true },
      { negocio_id: negocioId, nombre: 'Lavado', precio: 10, duracion_activa_min: 15, activo: true }
    ]);
    servs = (await supabase.from('servicios').select('*').eq('negocio_id', negocioId).eq('activo', true)).data;
  }
  console.log(`Available Services: ${servs.length}`);

  // 3. Clientes (Generate ~800 clients if less than that)
  let { count: currentClientsCount } = await supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('negocio_id', negocioId);
  const targetClients = 800;
  let allClientIds = [];
  
  if (currentClientsCount < targetClients) {
    console.log(`Generating ${targetClients - currentClientsCount} new clients...`);
    const newClients = [];
    const firstNames = ['Ana', 'Maria', 'Jose', 'Carlos', 'Lucia', 'Marta', 'Laura', 'Pedro', 'David', 'Jorge', 'Sofia', 'Paula', 'Carmen', 'Daniel', 'Alejandro', 'Manuel', 'Julia', 'Sara', 'Alba', 'Javier'];
    const lastNames = ['Garcia', 'Lopez', 'Martinez', 'Sanchez', 'Perez', 'Gomez', 'Martin', 'Jimenez', 'Ruiz', 'Hernandez', 'Diaz', 'Moreno', 'Alvarez', 'Munoz', 'Romero', 'Alonso', 'Gutierrez', 'Navarro', 'Torres', 'Dominguez'];
    
    for (let i = currentClientsCount; i < targetClients; i++) {
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
      newClients.push({
        negocio_id: negocioId,
        nombre: `${fn} ${ln}`,
        telefono: '6' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`
      });
    }
    
    // Insert in batches of 200
    for(let i=0; i<newClients.length; i+=200) {
      await supabase.from('clientes').insert(newClients.slice(i, i+200));
      console.log(`Inserted clients ${i} to ${i+200}`);
    }
  }

  // Fetch all client IDs to use for appointments
  let page = 0;
  while (true) {
    const { data: clis } = await supabase.from('clientes').select('id').eq('negocio_id', negocioId).range(page * 1000, (page + 1) * 1000 - 1);
    if (!clis || clis.length === 0) break;
    allClientIds.push(...clis.map(c => c.id));
    page++;
  }
  console.log(`Total Clientes for appointments: ${allClientIds.length}`);

  // 4. Generate Citas
  console.log('Generating appointments...');
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const endOf2Years = new Date(today);
  endOf2Years.setFullYear(today.getFullYear() + 2);
  
  let currentDay = new Date(today);
  
  const allAppointments = [];

  while (currentDay <= endOf2Years) {
    const dayOfWeek = currentDay.getDay();
    if (dayOfWeek !== 0) { // Skip Sundays
      const dateStr = currentDay.toISOString().split('T')[0];
      
      for (const prof of activeProfs) {
        // Horario: 10:00 to 19:00 with 1 hour lunch at 14:00 => 10:00-14:00 and 15:00-19:00
        // We will generate random appointments with ~70% fill rate.
        let timeMinutes = 10 * 60; // 10:00 AM
        const endDayMinutes = 19 * 60; // 7:00 PM
        const lunchStart = 14 * 60;
        const lunchEnd = 15 * 60;
        
        while (timeMinutes < endDayMinutes) {
          // If in lunch break, skip
          if (timeMinutes >= lunchStart && timeMinutes < lunchEnd) {
            timeMinutes = lunchEnd;
            continue;
          }
          
          // 70% chance to have an appointment, 30% idle time (gap)
          if (Math.random() > 0.70) {
             timeMinutes += 15; // gap
             continue;
          }
          
          // Pick a random service
          const s = servs[Math.floor(Math.random() * servs.length)];
          const dur = s.duracion_activa_min || 30;
          
          if (timeMinutes + dur > endDayMinutes) break; // Doesn't fit in the day
          if (timeMinutes < lunchStart && timeMinutes + dur > lunchStart) {
             // Intersects lunch, skip to after lunch
             timeMinutes = lunchEnd;
             continue;
          }
          
          // Add appointment
          const h = Math.floor(timeMinutes / 60);
          const m = timeMinutes % 60;
          
          const dt = new Date(currentDay);
          dt.setHours(h, m, 0, 0);
          
          const endDt = new Date(dt.getTime() + dur * 60000);
          
          const cId = allClientIds[Math.floor(Math.random() * allClientIds.length)];
          
          allAppointments.push({
            negocio_id: negocioId,
            profesional_id: prof.id,
            cliente_id: cId,
            servicio_id: s.id,
            inicio: dt.toISOString(),
            fin: endDt.toISOString(),
            estado: 'confirmada',
            notas: ''
          });
          
          timeMinutes += dur;
        }
      }
    }
    
    currentDay.setDate(currentDay.getDate() + 1);
  }
  
  console.log(`Generated ${allAppointments.length} appointments. Inserting in batches of 500...`);
  
  let inserted = 0;
  for (let i = 0; i < allAppointments.length; i += 500) {
    const batch = allAppointments.slice(i, i + 500);
    const { error } = await supabase.from('citas').insert(batch);
    if (error) {
       console.error(`Error inserting batch ${i}:`, error);
    } else {
       inserted += batch.length;
       if (inserted % 5000 === 0) console.log(`Inserted ${inserted} / ${allAppointments.length}...`);
    }
  }
  
  console.log('✅ ALL DONE! Appointments seeded successfully.');
}

run();
