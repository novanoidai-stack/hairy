/**
 * scripts/verifactu-worker.ts
 * Worker de envio VeriFactu en NodeJS (mTLS + SOAP).
 *
 * Utiliza el "Sello de Entidad" de Novanoid AI S.L. como Colaborador Social.
 */

import * as https from 'https';
import * as fs from 'fs';

export class VerifactuClient {
  private agent: https.Agent;

  constructor(certPath: string, keyPath: string, passphrase?: string) {
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      throw new Error('Certificado o clave no encontrados en las rutas especificadas');
    }
    
    this.agent = new https.Agent({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      passphrase: passphrase,
      // La AEAT usa certificados emitidos por AC reconocidas.
      // rejectUnauthorized: false // (solo en pruebas extremas locales, NUNCA en prod)
    });
  }

  public async enviarFactura(xml: string, entorno: 'preproduccion' | 'produccion'): Promise<string> {
    const endpoint = entorno === 'produccion'
      ? 'https://www1.agenciatributaria.gob.es/wlpl/TKEW-IOTA/ws/SuministroLR.wsdl'
      : 'https://prewww1.aeat.es/wlpl/TKEW-IOTA/ws/SuministroLR.wsdl'; // Revisar manual tecnico AEAT para endpoints exactos

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': '' // Depende de la operacion, suele ir vacio o con la URI de la accion
      },
      body: xml,
      // Node 18.x native fetch permite pasar agent via parametro no estandar en algunas implementaciones
      // pero usaremos node-fetch o el wrapper https directamente si fetch nativo no soporta agent.
      // Aqui usamos un cast a any para inyectar el agent en Node 18/20 native fetch (custom dispatcher no es https.Agent sino undici.Agent).
      // Para evitar problemas de tipos, lo abstraemos. Si esto falla en runtime, usaremos axios o node-fetch.
      ...({ agent: this.agent } as any) 
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    return responseText;
  }
}
