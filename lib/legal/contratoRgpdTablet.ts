/**
 * Pasada 2 / Micro-Tarea D12: Generador y Validador de Consentimiento Informado RGPD para Firma en Tablet
 * Permite registrar de forma fehaciente el consentimiento expreso de imágenes para RRSS y tratamiento de datos de salud.
 */

export interface ConsentimientoRgpdEntrada {
  clienteId: string;
  clienteNombre: string;
  clienteDniNie: string;
  aceptaTratamientoDatos: boolean;
  aceptaComunicacionesWhatsapp: boolean;
  aceptaUsoImagenRrss: boolean;
  rawBase64Firma: string; // Data URL de la firma táctil
}

export interface RegistroConsentimientoGuardado {
  documentoId: string;
  hashDocumento: string;
  fechaFirmaISO: string;
  esValidoLegalmente: boolean;
  errores: string[];
}

export async function registrarConsentimientoRgpd(c: ConsentimientoRgpdEntrada): Promise<RegistroConsentimientoGuardado> {
  const errores: string[] = [];

  if (!c.aceptaTratamientoDatos) {
    errores.push('El consentimiento para el tratamiento de datos personales es obligatorio (art. 6 RGPD).');
  }

  if (!c.rawBase64Firma || c.rawBase64Firma.length < 50) {
    errores.push('La firma manuscrita digital es requerida para validar el documento.');
  }

  const fechaFirmaISO = new Date().toISOString();
  const documentoId = `rgpd-${c.clienteId}-${Date.now()}`;

  const payloadString = `${c.clienteId}|${c.clienteDniNie}|${c.aceptaTratamientoDatos}|${c.aceptaUsoImagenRrss}|${c.rawBase64Firma.length}|${fechaFirmaISO}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payloadString));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashDocumento = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    documentoId,
    hashDocumento,
    fechaFirmaISO,
    esValidoLegalmente: errores.length === 0,
    errores,
  };
}
