/**
 * Parser Local Inteligente de Migración (Fallback Autónomo en Cliente)
 * Extrae Clientes, Servicios y Citas de cualquier exportación (Booksy, Treatwell, Shortcut, Fresha, CSV/Excel/JSON).
 */

export interface ClienteMigrado {
  nombre: string;
  telefono: string | null;
  email: string | null;
  notas?: string | null;
}

export interface ServicioMigrado {
  nombre: string;
  precio: number;
  duracion_min: number;
  categoria?: string;
}

// MISMO contrato que devuelve la edge migracion-magica cuando la IA interpreta
// el archivo: fecha 'YYYY-MM-DD' + hora_inicio 'HH:MM'. No es cosmetico. Antes
// aqui se devolvia `inicio` en ISO y el importador (TabMigracionMagica) solo lee
// fecha/hora_inicio, asi que TODAS las citas del fallback local se descartaban en
// silencio: el usuario veia clientes y servicios importados, y ni una cita, sin
// un solo error por pantalla. Si se cambia un lado, hay que cambiar el otro.
export interface CitaMigrada {
  cliente_nombre: string;
  cliente_telefono?: string | null;
  servicio_nombre: string;
  fecha: string;        // YYYY-MM-DD
  hora_inicio: string;  // HH:MM
  duracion_min?: number;
  precio?: number;
  estado?: string;
}

export interface ResultadoMigracionParseada {
  clientes: ClienteMigrado[];
  servicios: ServicioMigrado[];
  citas: CitaMigrada[];
}

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

/**
 * Normaliza nombres de columnas removiendo tildes, espacios y caracteres especiales
 */
function normalizarClave(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parsea contenido de texto (CSV/TSV/JSON) o datos de hojas de cálculo
 */
export function parsearMigracionLocal(rawContent: string, filename: string = ''): ResultadoMigracionParseada {
  const clientes: ClienteMigrado[] = [];
  const servicios: ServicioMigrado[] = [];
  const citas: CitaMigrada[] = [];

  const clienteSet = new Set<string>();
  const servicioSet = new Set<string>();

  // 1. Intentar parseo como JSON
  try {
    const json = JSON.parse(rawContent);
    const arr = Array.isArray(json) ? json : (json.data || json.items || json.clients || json.services || json.appointments || [json]);

    for (const item of arr) {
      if (typeof item !== 'object' || !item) continue;
      
      const keys = Object.keys(item).reduce((acc, k) => {
        acc[normalizarClave(k)] = item[k];
        return acc;
      }, {} as Record<string, any>);

      const nombre = keys['nombre'] || keys['name'] || keys['client'] || keys['cliente'] || keys['customer'];
      const tel = keys['telefono'] || keys['phone'] || keys['mobile'] || keys['celular'] || keys['tel'];
      const email = keys['email'] || keys['mail'] || keys['correo'];
      const servicio = keys['servicio'] || keys['service'] || keys['treatment'] || keys['tratamiento'];
      const precio = parseFloat(keys['precio'] || keys['price'] || keys['cost'] || keys['importe'] || '0') || 0;

      if (nombre && typeof nombre === 'string') {
        const keyTel = tel ? String(tel).replace(/\D/g, '') : nombre.toLowerCase();
        if (!clienteSet.has(keyTel)) {
          clienteSet.add(keyTel);
          clientes.push({
            nombre: nombre.trim(),
            telefono: tel ? String(tel).trim() : null,
            email: email ? String(email).trim() : null,
          });
        }
      }

      if (servicio && typeof servicio === 'string') {
        if (!servicioSet.has(servicio.toLowerCase())) {
          servicioSet.add(servicio.toLowerCase());
          servicios.push({
            nombre: servicio.trim(),
            precio: precio || 20,
            duracion_min: parseInt(keys['duracion'] || keys['duration'] || keys['tiempo'] || '30', 10) || 30,
          });
        }
      }
    }

    if (clientes.length > 0 || servicios.length > 0) {
      return { clientes, servicios, citas };
    }
  } catch {
    /* continuar a parseo de texto por líneas (CSV) */
  }

  // 2. Parseo de CSV / Líneas de Texto
  const lineas = rawContent
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lineas.length === 0) {
    return { clientes, servicios, citas };
  }

  // Detectar separador (, o ; o \t)
  const primeraLinea = lineas[0];
  const sep = primeraLinea.includes(';') ? ';' : primeraLinea.includes('\t') ? '\t' : ',';
  const cabeceras = primeraLinea.split(sep).map(h => normalizarClave(h.replace(/^"|"$/g, '')));

  const idxNombre = cabeceras.findIndex(h => h.includes('nombre') || h.includes('client') || h.includes('customer') || h === 'name');
  const idxTel = cabeceras.findIndex(h => h.includes('telef') || h.includes('phone') || h.includes('tel') || h.includes('mobile') || h.includes('celular'));
  const idxEmail = cabeceras.findIndex(h => h.includes('mail') || h.includes('correo'));
  const idxServicio = cabeceras.findIndex(h => h.includes('servic') || h.includes('tratamiento') || h.includes('treatment') || h.includes('concepto'));
  const idxPrecio = cabeceras.findIndex(h => h.includes('precio') || h.includes('price') || h.includes('cost') || h.includes('importe') || h.includes('total'));
  const idxFecha = cabeceras.findIndex(h => h.includes('fecha') || h.includes('date') || h.includes('inicio') || h.includes('start'));

  // Procesar filas
  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split(sep).map(c => c.replace(/^"|"$/g, '').trim());
    if (cols.length === 0) continue;

    const nombre = idxNombre >= 0 ? cols[idxNombre] : (cols[0] && cols[0].length > 2 && !cols[0].match(/^\d+$/) ? cols[0] : null);
    const tel = idxTel >= 0 ? cols[idxTel] : cols.find(c => c.match(/^(\+?\d{1,4}[-.\s]?)?\d{6,12}$/));
    const email = idxEmail >= 0 ? cols[idxEmail] : cols.find(c => c.includes('@'));
    const servicio = idxServicio >= 0 ? cols[idxServicio] : null;
    const precioRaw = idxPrecio >= 0 ? cols[idxPrecio] : null;
    const fechaRaw = idxFecha >= 0 ? cols[idxFecha] : null;

    if (nombre && nombre.length > 1 && !nombre.toLowerCase().includes('total')) {
      const keyTel = tel ? tel.replace(/\D/g, '') : nombre.toLowerCase();
      if (!clienteSet.has(keyTel)) {
        clienteSet.add(keyTel);
        clientes.push({
          nombre,
          telefono: tel || null,
          email: email || null,
        });
      }
    }

    if (servicio && servicio.length > 1) {
      if (!servicioSet.has(servicio.toLowerCase())) {
        servicioSet.add(servicio.toLowerCase());
        const precio = parseFloat((precioRaw || '0').replace(',', '.')) || 20;
        servicios.push({
          nombre: servicio,
          precio: precio || 20,
          duracion_min: 30,
        });
      }
    }

    if (nombre && servicio && fechaRaw) {
      // Una fecha ilegible NO se sustituye por "ahora": eso metia citas fantasma
      // en el dia de la importacion. Sin fecha valida, no hay cita.
      const cuando = new Date(fechaRaw);
      if (cuando.isValid()) {
        citas.push({
          cliente_nombre: nombre,
          cliente_telefono: tel || null,
          servicio_nombre: servicio,
          fecha: `${cuando.getFullYear()}-${dosDigitos(cuando.getMonth() + 1)}-${dosDigitos(cuando.getDate())}`,
          // Si el origen solo traia fecha (sin hora), queda 00:00 y el importador
          // la coloca a esa hora: es visible y corregible, a diferencia de perderla.
          hora_inicio: `${dosDigitos(cuando.getHours())}:${dosDigitos(cuando.getMinutes())}`,
          precio: parseFloat((precioRaw || '0').replace(',', '.')) || 0,
        });
      }
    }
  }

  return { clientes, servicios, citas };
}

// Helper para validar fecha
declare global {
  interface Date {
    isValid(): boolean;
  }
}
Date.prototype.isValid = function () {
  return !isNaN(this.getTime());
};
