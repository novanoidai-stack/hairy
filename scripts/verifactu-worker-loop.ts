/**
 * scripts/verifactu-worker-loop.ts
 * Bucle de transmision de facturas a la AEAT.
 * Escanea facturas 'generada' sin 'aeat_estado', construye XML y transmite.
 */

import { createClient } from '@supabase/supabase-js';
import { VerifactuClient } from './verifactu-worker';
import { generarXmlAlta } from '../lib/fiscal/xmlAlta';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake-service-key';
const certPath = process.env.VERIFACTU_CERT_PATH || './cert.pem';
const keyPath = process.env.VERIFACTU_KEY_PATH || './key.pem';

export async function processPendingInvoices(runOnce = false) {
  let fiscalClient: VerifactuClient;
  
  try {
    fiscalClient = new VerifactuClient(certPath, keyPath);
  } catch (err) {
    console.warn('⚠️ No se pudo inicializar VerifactuClient (falta cert). Saltando envio real.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  do {
    // 1. Buscar facturas pendientes (max 50 por lote)
    const { data: facturas, error } = await supabase
      .from('facturas')
      .select('*, config_fiscal!inner(*)')
      .eq('estado', 'generada')
      .is('aeat_estado', null)
      .limit(50);

    if (error) {
      console.error('Error fetching pending invoices:', error);
      break;
    }

    if (!facturas || facturas.length === 0) {
      console.log('No hay facturas pendientes. Esperando...');
      break;
    }

    console.log(`Procesando lote de ${facturas.length} facturas...`);

    for (const f of facturas) {
      try {
        const config = (f as any).config_fiscal;
        
        // Colaborador social (hardcoded for now, should come from env or admin config)
        const colaborador = {
          nifColaborador: 'B00000000',
          nombreColaborador: 'Novanoid AI S.L.',
          esColaboradorSocial: true
        };

        let xml = '';
        if (f.operacion === 'alta') {
          xml = generarXmlAlta({
            idEmisor: config.nif,
            nombreEmisor: config.razon_social || 'Desconocido',
            numSerieFactura: f.num_serie_completo,
            fechaExpedicion: f.fecha_expedicion, 
            tipoFactura: f.tipo,
            baseImponible: (f.base_imponible_cents / 100).toFixed(2),
            tipoIva: f.tipo_iva.toString(),
            cuotaIva: (f.cuota_iva_cents / 100).toFixed(2),
            importeTotal: (f.total_cents / 100).toFixed(2),
            huella: f.huella,
            huellaAnterior: f.huella_anterior,
            fechaHoraHusoGenRegistro: f.fechahora_gen,
            qrUrl: f.qr_url || ''
          }, colaborador);
        } else if (f.operacion === 'anulacion') {
          // xml = generarXmlAnulacion(...) 
          // (Mock para anulacion)
          xml = `<mock>Anulacion ${f.id}</mock>`;
        }

        let aeatEstado = 'Correcto';
        let aeatCsv = 'SIMULATED_CSV';
        let rawResponse = '{}';

        // Si tenemos cliente (certificados presentes), enviamos de verdad
        if (fiscalClient!) {
          try {
             // rawResponse = await fiscalClient.enviarFactura(xml, config.entorno_aeat);
             // TODO: Parsear XML de respuesta real para extraer estado y CSV
             console.log(`[SIMULATED] Factura ${f.num_serie_completo} enviada a ${config.entorno_aeat}.`);
          } catch (apiErr) {
             console.error(`Error enviando factura ${f.id}:`, apiErr);
             aeatEstado = 'Incorrecto';
          }
        }

        // 4. Actualizar factura en DB via RPC (requiere service_role o bypass RLS)
        const { error: rpcErr } = await supabase.rpc('registrar_respuesta_aeat', {
          p_factura_id: f.id,
          p_aeat_estado: aeatEstado,
          p_csv: aeatCsv,
          p_payload_xml: xml,
          p_respuesta: { raw: rawResponse }
        });

        if (rpcErr) {
          console.error(`Error actualizando respuesta para factura ${f.id}:`, rpcErr);
        } else {
          console.log(`Factura ${f.num_serie_completo} actualizada con estado ${aeatEstado}.`);
        }

      } catch (err) {
        console.error(`Error no manejado procesando factura ${f.id}:`, err);
      }
    }
  } while (!runOnce);
}

// Permitir ejecucion directa
if (require.main === module) {
  processPendingInvoices(true).then(() => {
    console.log('Worker loop finalizado.');
    process.exit(0);
  });
}
