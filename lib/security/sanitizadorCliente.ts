/**
 * Pasada 2 / Micro-Tarea D4: Sanitizador de Seguridad Anti-XSS y Validador Estricto de Entradas de Cliente
 * Escapa etiquetas script/html y valida números de teléfono WhatsApp en formato E.164.
 */

export interface FormularioClienteEntrada {
  nombre: string;
  apellidos?: string;
  telefono: string;
  notasMedicasAlergias?: string;
}

export interface ResultadoSanitizacionCliente {
  nombreSanitizado: string;
  apellidosSanitizados: string;
  telefonoValidoE164: string;
  notasSanitizadas: string;
  esValido: boolean;
  errores: string[];
}

export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizarYValidarCliente(f: FormularioClienteEntrada): ResultadoSanitizacionCliente {
  const errores: string[] = [];

  const nombreSanitizado = escapeHtml((f.nombre || '').trim());
  const apellidosSanitizados = escapeHtml((f.apellidos || '').trim());
  const notasSanitizadas = escapeHtml((f.notasMedicasAlergias || '').trim());

  if (!nombreSanitizado || nombreSanitizado.length < 2) {
    errores.push('El nombre es obligatorio y debe tener al menos 2 caracteres.');
  }

  // Normalizar telefono a E.164 (ej. +34612345678)
  const rawTel = (f.telefono || '').replace(/\s+/g, '').replace(/-/g, '');
  let telefonoValidoE164 = rawTel;

  if (rawTel.startsWith('6') || rawTel.startsWith('7')) {
    telefonoValidoE164 = `+34${rawTel}`;
  } else if (!rawTel.startsWith('+')) {
    telefonoValidoE164 = `+${rawTel}`;
  }

  const e164Regex = /^\+[1-9]\d{8,14}$/;
  if (!e164Regex.test(telefonoValidoE164)) {
    errores.push('El número de teléfono no tiene un formato WhatsApp válido.');
  }

  return {
    nombreSanitizado,
    apellidosSanitizados,
    telefonoValidoE164,
    notasSanitizadas,
    esValido: errores.length === 0,
    errores,
  };
}
