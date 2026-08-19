// Definicion del asistente de puesta en marcha: QUE se pregunta, en que orden y
// DONDE se guarda cada respuesta. Es la fuente unica del recorrido; la pantalla
// (components/onboarding/AsistentePuestaEnMarcha.web.tsx) solo lo pinta.
//
// Por que declarativo: el software tiene mas de 80 opciones repartidas en 17
// pestanias de Ajustes. Si el recorrido se escribiera a mano pantalla por
// pantalla, anadir una pregunta obligaria a tocar el componente y el orden se
// desincronizaria del checklist. Aqui, anadir un bloque es anadir una entrada.
//
// REGLA DE ALCANCE: cada bloque pregunta lo que DECIDE ese area (lo que cambia el
// comportamiento del software), no todos sus ajustes finos. Los finos siguen en
// Ajustes, y cada bloque dice donde. Un formulario de 80 campos no lo termina
// nadie, y un onboarding sin terminar deja el salon peor que uno corto.
//
// Los bloques 'especial' tienen UI propia en el componente (importar, horario,
// servicios, equipo): sus datos no son un formulario plano.

import { supabase } from '@/lib/supabase';

export type BloqueId =
  | 'punto_partida'
  | 'salon'
  | 'horario'
  | 'servicios'
  | 'equipo'
  | 'agenda'
  | 'cobros'
  | 'fiscal'
  | 'comisiones'
  | 'portal'
  | 'comunicacion';

export type Nivel = 'imprescindible' | 'importante' | 'opcional';

export type CampoTipo =
  | 'texto' | 'textoLargo' | 'numero' | 'tel' | 'email'
  | 'switch' | 'opciones' | 'color';

export interface CampoDef {
  key: string;
  label: string;
  ayuda?: string;
  tipo: CampoTipo;
  opciones?: { value: string; label: string }[];
  placeholder?: string;
  sufijo?: string;
  requerido?: boolean;
  // Se pinta solo si esta funcion devuelve true (dependencias entre campos).
  visibleSi?: (v: Record<string, any>) => boolean;
}

export interface BloqueDef {
  id: BloqueId;
  titulo: string;
  intro: string;
  icono: string;
  nivel: Nivel;
  // Donde se cambia despues. Se muestra SIEMPRE, no solo al saltar el paso.
  ajustesEn: string;
  especial?: boolean;
  campos: CampoDef[];
}

// ---------------------------------------------------------------------------
// Lectura y escritura de negocio_config (el jsonb donde vive la mayoria)
// ---------------------------------------------------------------------------

export async function leerConfig(negocioId: string): Promise<Record<string, any>> {
  const { data } = await supabase
    .from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
  return (data?.config && typeof data.config === 'object') ? (data.config as Record<string, any>) : {};
}

// Fusiona sobre lo que ya hay: nunca se pisa el jsonb entero, que borraria
// ajustes hechos en otra pestania mientras el asistente estaba abierto.
export async function guardarConfig(negocioId: string, parcial: Record<string, any>): Promise<void> {
  const actual = await leerConfig(negocioId);
  const { error } = await supabase.from('negocio_config').upsert(
    { negocio_id: negocioId, config: { ...actual, ...parcial }, updated_at: new Date().toISOString() },
    { onConflict: 'negocio_id' },
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

export const BLOQUES: BloqueDef[] = [
  {
    id: 'punto_partida',
    titulo: '¿Vienes de otro programa?',
    intro: 'Si ya trabajas con Booksy, Fresha u otro, traemos tus clientes, servicios y citas. Si no, lo montamos aquí en un momento.',
    icono: 'upload',
    nivel: 'importante',
    ajustesEn: 'Ajustes > Migración Mágica',
    especial: true,
    campos: [],
  },
  {
    id: 'salon',
    titulo: 'Los datos de tu salón',
    intro: 'Aparecen en el portal de reserva, en los mensajes a tus clientes y en el ticket.',
    icono: 'building',
    nivel: 'imprescindible',
    ajustesEn: 'Ajustes > General',
    campos: [
      { key: 'nombre', label: 'Nombre del salón', tipo: 'texto', requerido: true, placeholder: 'Studio Norte' },
      { key: 'direccion', label: 'Dirección', tipo: 'texto', requerido: true, placeholder: 'Calle Mayor 12, Madrid' },
      { key: 'telefono', label: 'Teléfono', tipo: 'tel', requerido: true, placeholder: '600 111 222' },
      { key: 'email', label: 'Correo de contacto', tipo: 'email', placeholder: 'hola@tusalon.com' },
      {
        key: 'moneda', label: 'Moneda', tipo: 'opciones',
        opciones: [{ value: 'EUR', label: 'Euro (EUR)' }, { value: 'GBP', label: 'Libra (GBP)' }, { value: 'USD', label: 'Dólar (USD)' }],
      },
      {
        key: 'timezone', label: 'Zona horaria', tipo: 'opciones',
        ayuda: 'De aquí sale la hora de las citas y de los recordatorios.',
        opciones: [
          { value: 'Europe/Madrid', label: 'Península y Baleares' },
          { value: 'Atlantic/Canary', label: 'Canarias' },
        ],
      },
      { key: 'brandColor', label: 'Color de tu marca', tipo: 'color', ayuda: 'Se usa en el portal de reserva y en los documentos.' },
    ],
  },
  {
    id: 'horario',
    titulo: 'El horario del salón',
    intro: 'Marca los días y las horas de apertura. Ordena la agenda y limita la reserva online a tu horario real.',
    icono: 'clock',
    nivel: 'imprescindible',
    ajustesEn: 'Ajustes > Horarios',
    especial: true,
    campos: [],
  },
  {
    id: 'servicios',
    titulo: 'Tus servicios',
    intro: 'Cada cita es un servicio. Sin al menos uno no puedes agendar ni cobrar nada.',
    icono: 'scissors',
    nivel: 'imprescindible',
    ajustesEn: 'Ajustes > Servicios',
    especial: true,
    campos: [],
  },
  {
    id: 'equipo',
    titulo: 'Tu equipo',
    intro: 'Cada profesional es una columna de la agenda. Puedes darles acceso ahora o más tarde.',
    icono: 'users',
    nivel: 'imprescindible',
    ajustesEn: 'Equipo',
    especial: true,
    campos: [],
  },
  {
    id: 'agenda',
    titulo: 'Cómo funciona tu agenda',
    intro: 'Cómo se ve y qué se permite al dar cita. Se puede afinar después.',
    icono: 'calendar',
    nivel: 'importante',
    ajustesEn: 'Ajustes > Agenda',
    campos: [
      {
        key: 'slotInterval', label: 'Cada cuánto empieza una cita', tipo: 'opciones',
        ayuda: 'Los huecos del portal se ofrecen con este salto.',
        opciones: [
          { value: '15', label: 'Cada 15 minutos' },
          { value: '30', label: 'Cada 30 minutos' },
          { value: '60', label: 'Cada hora' },
        ],
      },
      {
        key: 'defaultView', label: 'Vista al abrir la agenda', tipo: 'opciones',
        opciones: [
          { value: 'day', label: 'Día' },
          { value: 'week', label: 'Semana' },
          { value: 'month', label: 'Mes' },
        ],
      },
      {
        key: 'startOfWeek', label: 'La semana empieza en', tipo: 'opciones',
        opciones: [{ value: 'monday', label: 'Lunes' }, { value: 'sunday', label: 'Domingo' }],
      },
      { key: 'permitirMismoDia', label: 'Permitir reservas para hoy mismo', tipo: 'switch' },
      {
        key: 'antelacionGlobal', label: 'Antelación mínima para reservar', tipo: 'numero', sufijo: 'horas',
        ayuda: 'Tiempo mínimo entre la reserva y la cita, para que te dé tiempo a prepararte.',
      },
      {
        key: 'antelacionMax', label: 'Se puede reservar como mucho con', tipo: 'numero', sufijo: 'días',
        ayuda: 'Evita que te llenen la agenda de aquí a un año.',
      },
    ],
  },
  {
    id: 'cobros',
    titulo: 'Cómo cobras',
    intro: 'Propinas y señales. La señal es lo que evita los plantones: se pide al reservar y se descuenta del total.',
    icono: 'card',
    nivel: 'importante',
    ajustesEn: 'Ajustes > Pagos',
    campos: [
      { key: 'propinasActivo', label: 'Aceptar propinas al cobrar', tipo: 'switch' },
      { key: 'depositoDinamicoActivo', label: 'Pedir señal para reservar', tipo: 'switch', ayuda: 'Solo a quien tiene historial de plantones, si lo dejas en automático.' },
      {
        key: 'depositoModoFianza', label: 'Qué se hace con la señal', tipo: 'opciones',
        visibleSi: (v) => v.depositoDinamicoActivo === true,
        opciones: [
          { value: 'cobro', label: 'Cobrarla y descontarla del total' },
          { value: 'hold', label: 'Retenerla y cobrar solo si no aparece' },
        ],
      },
      {
        key: 'depositoModoClasificacion', label: 'A quién se le pide', tipo: 'opciones',
        visibleSi: (v) => v.depositoDinamicoActivo === true,
        opciones: [
          { value: 'auto', label: 'Automático, según su historial' },
          { value: 'manual', label: 'Solo a quien yo marque' },
          { value: 'ambos', label: 'Las dos cosas' },
        ],
      },
    ],
  },
  {
    id: 'fiscal',
    titulo: 'Facturación',
    intro: 'Necesario para que el ticket salga completo y legal. Si no lo sabes ahora, sáltalo y que lo mire tu gestor.',
    icono: 'shield',
    nivel: 'importante',
    ajustesEn: 'Ajustes > Pagos',
    campos: [
      { key: 'razon_social', label: 'Nombre fiscal o razón social', tipo: 'texto', placeholder: 'Peluquería Ana S.L.' },
      { key: 'nif', label: 'NIF / CIF', tipo: 'texto', placeholder: 'B12345678' },
      { key: 'domicilio_fiscal', label: 'Domicilio fiscal', tipo: 'texto' },
      {
        key: 'tipo_iva_defecto', label: 'IVA que aplicas', tipo: 'opciones',
        opciones: [
          { value: '21', label: '21% (general)' },
          { value: '10', label: '10% (reducido)' },
          { value: '4', label: '4% (superreducido)' },
          { value: '0', label: 'Exento' },
        ],
      },
      {
        key: 'territorio', label: 'Territorio', tipo: 'opciones',
        opciones: [
          { value: 'comun', label: 'Territorio común' },
          { value: 'canarias', label: 'Canarias (IGIC)' },
          { value: 'ceuta_melilla', label: 'Ceuta o Melilla' },
        ],
      },
      {
        key: 'aplica_verifactu', label: 'Emitir facturas con VeriFactu', tipo: 'switch',
        ayuda: 'Sistema de facturación verificable de la Agencia Tributaria.',
      },
    ],
  },
  {
    id: 'comisiones',
    titulo: 'Comisiones del equipo',
    intro: 'Lo que se lleva cada profesional por lo que factura. Si trabajas a sueldo fijo, sáltalo.',
    icono: 'percent',
    nivel: 'opcional',
    ajustesEn: 'Ajustes > Comisiones',
    campos: [
      { key: 'comisionBase', label: 'Comisión por servicio', tipo: 'numero', sufijo: '%' },
      { key: 'comisionPropinas', label: 'La propina va entera para quien la recibe', tipo: 'switch' },
      { key: 'comisionAddons', label: 'Comisionar también los extras del servicio', tipo: 'switch' },
      {
        key: 'comisionPeriodo', label: 'Se liquida', tipo: 'opciones',
        opciones: [
          { value: 'mensual', label: 'Cada mes' },
          { value: 'quincenal', label: 'Cada quince días' },
          { value: 'semanal', label: 'Cada semana' },
        ],
      },
    ],
  },
  {
    id: 'portal',
    titulo: 'Tu página de reservas',
    intro: 'Una página pública con tu enlace y tu QR para que tus clientes pidan cita solos, a cualquier hora.',
    icono: 'globe',
    nivel: 'importante',
    ajustesEn: 'Ajustes > Reserva online',
    campos: [
      { key: 'portal_activo', label: 'Activar la reserva online', tipo: 'switch' },
      {
        key: 'nombre_publico', label: 'Nombre que verán tus clientes', tipo: 'texto',
        visibleSi: (v) => v.portal_activo === true,
      },
      {
        key: 'descripcion', label: 'Descripción corta', tipo: 'textoLargo',
        placeholder: 'Peluquería de barrio especializada en color.',
        visibleSi: (v) => v.portal_activo === true,
      },
      {
        key: 'mostrar_precios', label: 'Precios en la página', tipo: 'opciones',
        visibleSi: (v) => v.portal_activo === true,
        opciones: [
          { value: 'catalogo', label: 'Mostrar el precio de cada servicio' },
          { value: 'desde', label: 'Mostrar "desde X euros"' },
          { value: 'ocultos', label: 'No mostrar precios' },
        ],
      },
      {
        key: 'directorio_visible', label: 'Salir en el directorio de Mecha', tipo: 'switch',
        ayuda: 'Tu salón aparece en las búsquedas por ciudad de mechaa.es.',
        visibleSi: (v) => v.portal_activo === true,
      },
    ],
  },
  {
    id: 'comunicacion',
    titulo: 'Avisos a tus clientes',
    intro: 'Mensajes automáticos por WhatsApp. Son lo que más reduce los plantones.',
    icono: 'bell',
    nivel: 'importante',
    ajustesEn: 'Ajustes > Notificaciones',
    campos: [
      { key: 'notifConfirmacionActiva', label: 'Confirmación al reservar', tipo: 'switch' },
      { key: 'notifRecordatorioActiva', label: 'Recordatorio antes de la cita', tipo: 'switch' },
      {
        key: 'notifRecordatorioHoras', label: 'Se avisa con', tipo: 'numero', sufijo: 'horas antes',
        visibleSi: (v) => v.notifRecordatorioActiva === true,
      },
      { key: 'notifResenaActiva', label: 'Pedir reseña después de la cita', tipo: 'switch' },
      { key: 'notifCumpleanosActiva', label: 'Felicitar el cumpleaños', tipo: 'switch' },
      {
        key: 'notifNoMolestar', label: 'No enviar de madrugada', tipo: 'switch',
        ayuda: 'Los mensajes que caigan en esa franja se envían al abrir.',
      },
    ],
  },
];

export const BLOQUES_POR_ID: Record<BloqueId, BloqueDef> =
  BLOQUES.reduce((acc, b) => { acc[b.id] = b; return acc; }, {} as Record<BloqueId, BloqueDef>);

// ---------------------------------------------------------------------------
// Carga y guardado por bloque
// ---------------------------------------------------------------------------

const CLAVES_CONFIG: Partial<Record<BloqueId, string[]>> = {
  salon: ['nombre', 'direccion', 'telefono', 'email', 'moneda', 'timezone', 'brandColor'],
  agenda: ['slotInterval', 'defaultView', 'startOfWeek', 'permitirMismoDia', 'antelacionGlobal', 'antelacionMax'],
  cobros: ['propinasActivo', 'depositoDinamicoActivo', 'depositoModoFianza', 'depositoModoClasificacion'],
  comisiones: ['comisionBase', 'comisionPropinas', 'comisionAddons', 'comisionPeriodo'],
  comunicacion: [
    'notifConfirmacionActiva', 'notifRecordatorioActiva', 'notifRecordatorioHoras',
    'notifResenaActiva', 'notifCumpleanosActiva', 'notifNoMolestar',
  ],
};

// Valores de partida cuando el salon aun no ha guardado nada. Son los mismos
// defaults que ya usa Ajustes, para que el asistente no proponga algo distinto
// de lo que el software hace por su cuenta.
const DEFECTOS: Record<string, any> = {
  moneda: 'EUR',
  timezone: 'Europe/Madrid',
  brandColor: '#f4501e',
  slotInterval: 30,
  defaultView: 'day',
  startOfWeek: 'monday',
  permitirMismoDia: true,
  antelacionGlobal: 2,
  antelacionMax: 60,
  propinasActivo: false,
  depositoDinamicoActivo: false,
  depositoModoFianza: 'cobro',
  depositoModoClasificacion: 'auto',
  comisionBase: 0,
  comisionPropinas: true,
  comisionAddons: false,
  comisionPeriodo: 'mensual',
  notifConfirmacionActiva: true,
  notifRecordatorioActiva: true,
  notifRecordatorioHoras: 24,
  notifResenaActiva: true,
  notifCumpleanosActiva: false,
  notifNoMolestar: true,
  // Fiscal (tabla aparte)
  tipo_iva_defecto: '21',
  territorio: 'comun',
  aplica_verifactu: true,
  // Portal (tabla aparte)
  portal_activo: true,
  mostrar_precios: 'catalogo',
  directorio_visible: false,
};

export async function cargarBloque(id: BloqueId, negocioId: string): Promise<Record<string, any>> {
  const claves = CLAVES_CONFIG[id];
  if (claves) {
    const cfg = await leerConfig(negocioId);
    const out: Record<string, any> = {};
    for (const k of claves) out[k] = cfg[k] ?? DEFECTOS[k];
    return out;
  }

  if (id === 'fiscal') {
    const { data } = await supabase
      .from('config_fiscal')
      .select('razon_social, nif, domicilio_fiscal, tipo_iva_defecto, territorio, aplica_verifactu')
      .eq('negocio_id', negocioId).maybeSingle();
    return {
      razon_social: data?.razon_social ?? '',
      nif: data?.nif ?? '',
      domicilio_fiscal: data?.domicilio_fiscal ?? '',
      tipo_iva_defecto: data ? String(data.tipo_iva_defecto) : DEFECTOS.tipo_iva_defecto,
      territorio: data?.territorio ?? DEFECTOS.territorio,
      aplica_verifactu: data?.aplica_verifactu ?? DEFECTOS.aplica_verifactu,
    };
  }

  if (id === 'portal') {
    const { data } = await supabase
      .from('negocio_portal')
      .select('portal_activo, nombre_publico, descripcion, mostrar_precios, directorio_visible')
      .eq('negocio_id', negocioId).maybeSingle();
    const cfg = await leerConfig(negocioId);
    return {
      portal_activo: data?.portal_activo ?? DEFECTOS.portal_activo,
      // Sin pagina creada todavia, se propone el nombre del salon.
      nombre_publico: data?.nombre_publico ?? cfg.nombre ?? '',
      descripcion: data?.descripcion ?? '',
      mostrar_precios: data?.mostrar_precios ?? DEFECTOS.mostrar_precios,
      directorio_visible: data?.directorio_visible ?? DEFECTOS.directorio_visible,
    };
  }

  return {};
}

// Slug del portal a partir del nombre. Mismas reglas que lib/onboardingAgent.
export function slugDeNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'salon';
}

export async function guardarBloque(
  id: BloqueId, negocioId: string, valores: Record<string, any>,
): Promise<void> {
  const claves = CLAVES_CONFIG[id];
  if (claves) {
    const parcial: Record<string, any> = {};
    for (const k of claves) {
      // Las claves sin valor NO se escriben. Pasa cuando se avanza antes de que
      // el bloque termine de cargar: se guardaba `undefined` en cada clave, que
      // al serializar el jsonb desaparece, y el paso quedaba sin efecto sin que
      // nadie viera un error. Ademas, escribir undefined sobre un valor bueno
      // seria borrarlo.
      if (valores[k] !== undefined) parcial[k] = valores[k];
    }
    if (Object.keys(parcial).length > 0) await guardarConfig(negocioId, parcial);
    return;
  }

  if (id === 'fiscal') {
    // Via RPC, NO upsert directo: config_fiscal solo tiene politica de SELECT
    // para el cliente. Es deliberado — son los datos con los que se emiten
    // facturas verificables ante Hacienda, y se escriben por una funcion que
    // valida y deja rastro. Un upsert directo devuelve "No tienes permisos".
    const { error } = await supabase.rpc('upsert_config_fiscal', {
      p_negocio_id: negocioId,
      p_nif: valores.nif || null,
      p_razon_social: valores.razon_social || null,
      p_domicilio_fiscal: valores.domicilio_fiscal || null,
      p_regimen_iva: 'general',
      p_tipo_iva_defecto: Number(valores.tipo_iva_defecto) || 21,
      p_territorio: valores.territorio || 'comun',
      p_serie_defecto: 'A',
      p_modalidad: 'verifactu',
      p_aplica_verifactu: valores.aplica_verifactu !== false,
      p_proveedor_fiscal: null,
    });
    if (error) throw error;
    return;
  }

  if (id === 'portal') {
    // El slug es la direccion publica: se fija UNA vez y no se reescribe al
    // volver a pasar por aqui, o los QR y enlaces ya repartidos dejarian de valer.
    const { data: existente } = await supabase
      .from('negocio_portal').select('slug').eq('negocio_id', negocioId).maybeSingle();
    const base = valores.nombre_publico || 'salon';
    let slug = existente?.slug ?? slugDeNombre(base);

    if (!existente?.slug) {
      const { data: ocupado } = await supabase
        .from('negocio_portal').select('negocio_id').eq('slug', slug).maybeSingle();
      if (ocupado && ocupado.negocio_id !== negocioId) {
        slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      }
    }

    const { error } = await supabase.from('negocio_portal').upsert({
      negocio_id: negocioId,
      slug,
      nombre_publico: valores.nombre_publico || null,
      descripcion: valores.descripcion || null,
      mostrar_precios: valores.mostrar_precios || 'catalogo',
      directorio_visible: valores.directorio_visible === true,
      portal_activo: valores.portal_activo !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'negocio_id' });
    if (error) throw error;
    return;
  }
}
