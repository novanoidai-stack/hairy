/**
 * Pasada 3 / Micro-Tarea E2: Motor de Detección de Clientes Duplicados
 * Detecta clientes potencialmente duplicados comparando teléfono E.164 normalizado y email
 * (case-insensitive, sin espacios), sugiriendo cuál registro conservar (el más antiguo o el más activo).
 */

export interface RegistroCliente {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  totalVisitas: number;
  creadoISO: string;
}

export interface ParejaDuplicada {
  clienteA: RegistroCliente;
  clienteB: RegistroCliente;
  motivo: 'telefono' | 'email' | 'telefono_y_email';
  sugerenciaConservar: string; // id del cliente a conservar
  sugerenciaEliminar: string;  // id del cliente a fusionar/eliminar
}

function normalizarTel(tel: string): string {
  return (tel || '').replace(/\s+/g, '').replace(/-/g, '').toLowerCase();
}

function normalizarEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function detectarDuplicados(clientes: RegistroCliente[]): ParejaDuplicada[] {
  const resultado: ParejaDuplicada[] = [];
  const vistos = new Set<string>();

  for (let i = 0; i < clientes.length; i++) {
    for (let j = i + 1; j < clientes.length; j++) {
      const a = clientes[i];
      const b = clientes[j];
      const clave = [a.id, b.id].sort().join('|');
      if (vistos.has(clave)) continue;

      const telA = normalizarTel(a.telefono);
      const telB = normalizarTel(b.telefono);
      const emailA = normalizarEmail(a.email);
      const emailB = normalizarEmail(b.email);

      const mismoTel = telA.length > 6 && telA === telB;
      const mismoEmail = emailA.length > 4 && emailA === emailB;

      if (!mismoTel && !mismoEmail) continue;

      vistos.add(clave);

      const motivo: ParejaDuplicada['motivo'] =
        mismoTel && mismoEmail ? 'telefono_y_email' :
        mismoTel ? 'telefono' : 'email';

      // Conservar el que tiene más visitas; en empate, el más antiguo
      const conservar = a.totalVisitas >= b.totalVisitas ? a : b;
      const eliminar = conservar.id === a.id ? b : a;

      resultado.push({
        clienteA: a,
        clienteB: b,
        motivo,
        sugerenciaConservar: conservar.id,
        sugerenciaEliminar: eliminar.id,
      });
    }
  }

  return resultado;
}
