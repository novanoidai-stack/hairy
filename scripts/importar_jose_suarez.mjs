import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

// Usar la URL de producción y la service_role key
const supabaseUrl = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc1NzI5NSwiZXhwIjoyMDkyMzMzMjk1fQ.5ejE9ktV7edy2jC4uaDbBvmj34_yPn8wscX6JGDSTZ4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('🚀 Iniciando script de importación robusto (matriz) para Jose Suárez...');

  const negocioId = 'florent_surez_peluqueros_15004';
  
  // 1. Limpiar la inserción anterior
  console.log(`🧹 Eliminando clientes de la importación anterior para el negocio ${negocioId}...`);
  const { error: dError } = await supabase
    .from('clientes')
    .delete()
    .eq('negocio_id', negocioId);

  if (dError) {
    console.error('❌ Error al limpiar clientes:', dError);
    process.exit(1);
  }
  console.log('✅ Base de datos limpia.');

  // 2. Leer y parsear lista_de_clientes.xlsx
  let excelPath = 'docs/lista_de_clientes_importada_jose_suarez.xlsx';
  if (!fs.existsSync(excelPath)) {
    excelPath = 'lista_de_clientes.xlsx';
  }
  
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ No existe el archivo Excel en ninguna de las ubicaciones (${excelPath}).`);
    process.exit(1);
  }

  console.log(`📖 Leyendo archivo ${excelPath}...`);
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Obtenemos los datos de forma matricial (header: 1)
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`📊 Se cargaron ${rawData.length} filas del Excel.`);

  // 3. Mapear filas (los datos empiezan en la fila 8, que es el índice 7)
  const mappedClients = [];

  for (let i = 7; i < rawData.length; i++) {
    const row = rawData[i];
    
    // Si la fila está vacía o no tiene al menos el nombre
    if (!row || row.length < 2) continue;

    const nombreCompleto = row[1]; // Nombre y apellido está en la columna B (índice 1)
    if (!nombreCompleto || String(nombreCompleto).trim() === '') continue;

    // Verificar si es una fila de totalizador o metadata al final
    if (String(nombreCompleto).toLowerCase().includes('total') || String(nombreCompleto).toLowerCase().includes('período')) {
      continue;
    }

    const gruposRaw = row[2] ? String(row[2]).trim() : ''; // Grupos está en columna C (índice 2)
    const etiquetas = gruposRaw ? gruposRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    // Métricas
    const nReservas = row[3] !== undefined ? row[3] : 0; // Columna D
    const nAusencias = row[4] !== undefined ? row[4] : 0; // Columna E
    const primeraVisita = row[5] || ''; // Columna F
    const ultimaVisita = row[6] || ''; // Columna G
    const ingresosTotales = row[12] !== undefined ? row[12] : 0; // Columna M (índice 12)

    let notas = `Ficha técnica importada de Booksy.\n` +
      `- Total Reservas: ${nReservas}\n` +
      `- Ausencias (No-shows): ${nAusencias}\n` +
      `- Primera visita: ${primeraVisita}\n` +
      `- Última visita: ${ultimaVisita}\n` +
      `- Gastado acumulado: ${ingresosTotales} €`;

    mappedClients.push({
      negocio_id: negocioId,
      nombre: String(nombreCompleto).trim(),
      telefono: null,
      email: null,
      notas: notas,
      etiquetas: etiquetas,
      alergias: null,
      fecha_nacimiento: null
    });
  }

  console.log(`Clientes reales filtrados y listos para importar: ${mappedClients.length}`);
  if (mappedClients.length > 0) {
    console.log('Muestra del primer cliente mapeado:', mappedClients[0]);
  } else {
    console.warn('⚠️ No se mapeó ningún cliente. Revisa los índices.');
    process.exit(1);
  }

  // 4. Insertar clientes
  console.log(`💾 Guardando ${mappedClients.length} clientes reales en Supabase...`);
  let exitos = 0;
  let errores = 0;

  // Inserción en lotes de 50
  const batchSize = 50;
  for (let i = 0; i < mappedClients.length; i += batchSize) {
    const batch = mappedClients.slice(i, i + batchSize);
    const { error } = await supabase.from('clientes').insert(batch);

    if (error) {
      console.error(`❌ Error al insertar lote ${i / batchSize + 1}:`, error.message || error);
      // Intentar uno por uno en caso de error
      for (const client of batch) {
        const { error: singleError } = await supabase.from('clientes').insert(client);
        if (singleError) {
          console.error(`   Error al insertar cliente "${client.nombre}":`, singleError.message || singleError);
          errores++;
        } else {
          exitos++;
        }
      }
    } else {
      exitos += batch.length;
      console.log(`✅ Lote ${i / batchSize + 1} insertado (${exitos}/${mappedClients.length})`);
    }
  }

  console.log(`\n✨ Importación finalizada con éxito.`);
  console.log(`Éxitos: ${exitos} clientes insertados.`);
  console.log(`Errores: ${errores} fallidos.`);

  // Mover archivo final a docs/ si estaba en la raíz
  const excelRaiz = 'lista_de_clientes.xlsx';
  if (fs.existsSync(excelRaiz)) {
    const destDir = 'docs';
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir);
    }
    const destPath = path.join(destDir, 'lista_de_clientes_importada_jose_suarez.xlsx');
    try {
      fs.renameSync(excelRaiz, destPath);
      console.log(`📁 Archivo original movido a: ${destPath}`);
    } catch (err) {
      console.warn(`⚠️ No se pudo mover el archivo Excel:`, err.message);
    }
  }
}

run().catch(err => {
  console.error('💥 Error fatal en el script:', err);
  process.exit(1);
});
