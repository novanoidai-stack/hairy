// El PDF del ticket tiene que salir de verdad: es lo unico que el salon puede
// imprimir o mandar a una clienta. Antes de esto, la pantalla de tickets pintaba
// un hash inventado en el navegador, asi que aqui se comprueba el camino real
// (jsPDF + datos de tickets_verifactu) y que el binario resultante es un PDF.
//
// Ejecutar: deno task test

import { generarTicketPdf } from './ticketPdf.web.ts';
import { assertEquals } from 'jsr:@std/assert@0.224.0';

Deno.test('el ticket real produce un PDF valido', async () => {
  const blob = await generarTicketPdf({
    razonSocial: 'Florent Suarez Peluqueros SL',
    nif: 'B12345678',
    direccionFiscal: 'Calle Mayor 1',
    cpFiscal: '15004',
    poblacionFiscal: 'A Coruna',
    telefono: '981000000',
    color: '#f4501e',
    numeroFactura: 'A-00063',
    fechaEmision: new Date('2026-08-13T17:44:11Z'),
    clienteNombre: 'Marta Gomez',
    lineas: [
      { nombre: 'Corte + peinado', precio_cents: 1500, cantidad: 1 },
      { nombre: 'Mascarilla', precio_cents: 900, cantidad: 2 },
    ],
    totalCents: 1500,
    propinaCents: 0,
    descuentoCents: 0,
    metodo: 'efectivo',
    hash: 'd354679e556b6dac246a09c38cf4010403dd760fa3acc5bcbfed84d0e5b65bcd',
    hashAnterior: '34a79ce4cd93fd29310f9610855e9a195afba17d8566ecc09873579ead83a8e9',
    reconstruido: true,
  });
  const cabecera = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
  assertEquals(cabecera, '%PDF-');
  assertEquals(blob.size > 1000, true);
  console.log('  PDF generado:', blob.size, 'bytes');
});
