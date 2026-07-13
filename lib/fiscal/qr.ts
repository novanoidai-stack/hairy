/**
 * lib/fiscal/qr.ts
 * Genera la URL de cotejo de la AEAT para el QR de la factura.
 */

export function generarUrlCotejoAEAT(params: {
  entorno: 'preproduccion' | 'produccion';
  nifEmisor: string;
  numSerieFactura: string;
  fechaExpedicion: string; // DD-MM-YYYY
  importeTotal: string;    // "123.45"
}): string {
  const base = params.entorno === 'produccion'
    ? 'https://www2.agenciatributaria.gob.es/wlpl/inwinv/es.aeat.dit.adu.sii.facturacion.FacturacionQR'
    : 'https://prewww2.aeat.es/wlpl/inwinv/es.aeat.dit.adu.sii.facturacion.FacturacionQR';

  const query = new URLSearchParams({
    idEmisorFactura: params.nifEmisor,
    numSerieFactura: params.numSerieFactura,
    fechaExpedicionFactura: params.fechaExpedicion,
    importeTotal: params.importeTotal,
  });

  return `${base}?${query.toString()}`;
}
