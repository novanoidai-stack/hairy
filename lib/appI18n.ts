// i18n del software de gestion (Expo/react-native-web).
//
// MVP: misma API que lib/portalI18n.ts (makeT), pero para la app interna.
// Solo se traducen aqui los textos globales mas visibles (nav, botones comunes,
// cabeceras). El resto del software queda en español; anadir mas es añadir la
// clave a `es` y a las traducciones. La arquitectura ya soporta ampliar sin
// tocar componentes.
//
// La preferencia se guarda en localStorage (web) o AsyncStorage (nativo). El
// hook useAppLang lo expone. Selector visible en Configuracion > Cuenta.

import { IS_DEMO_MODE } from '@/lib/supabase';

export type AppLang = 'es' | 'en';
export const APP_LANGS: { code: AppLang; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
];

type Dict = Record<string, string>;

const es: Dict = {
  // Navegacion (MobileTabBar + Sidebar)
  nav_agenda: 'Agenda',
  nav_citas: 'Citas',
  nav_clientes: 'Clientes',
  nav_equipo: 'Equipo',
  nav_informes: 'Informes',
  nav_caja: 'Caja',
  nav_mi_jornada: 'Mi jornada',
  nav_bandeja: 'Bandeja',
  nav_inventario: 'Inventario',
  nav_configuracion: 'Configuración',
  nav_mas: 'Más',
  nav_lista_espera: 'Lista de espera',
  nav_lista_espera_corta: 'Espera',
  nav_presupuestos: 'Presupuestos',
  nav_resenas: 'Reseñas',
  nav_campanas: 'Campañas',
  nav_grp_principal: 'Principal',
  nav_grp_gestion: 'Gestión',
  // Comunes
  guardar: 'Guardar',
  cancelar: 'Cancelar',
  eliminar: 'Eliminar',
  editar: 'Editar',
  cerrar: 'Cerrar',
  aceptar: 'Aceptar',
  buscar: 'Buscar',
  cargando: 'Cargando...',
  volver: 'Volver',
  // Cabeceras
  hdr_bienvenido: 'Bienvenido/a',
  // Idioma
  idioma_titulo: 'Idioma de la aplicación',
  idioma_desc: 'Interfaz del software. Los mensajes automáticos a clientas usan el idioma del portal del salón.',
  // Inventario
  inv_todos: 'Todos',
  inv_titulo: 'Inventario & Stock',
  inv_subtitulo: 'Gestión, trazabilidad y control de existencias de tu salón',
  inv_total_refs: 'Total Referencias',
  inv_bajo_min: 'Bajo Mínimo',
  inv_valor: 'Valor del Inventario',
  inv_categorias: 'Familias/Categorías',
  inv_critico_title: 'Productos con Stock Insuficiente',
  inv_critico_desc: 'Hay {count} productos por debajo de su cantidad mínima establecida.',
  inv_ver_criticos: 'Ver Sólo Críticos',
  inv_mostrar_todos: 'Mostrar Todos',
  inv_nuevo_prod: 'Nuevo Producto',
  inv_no_resultados: 'No se encontraron referencias',
  inv_buscar_placeholder: 'Buscar por nombre, código de barras o descripción...',
  inv_mosaico: 'Mosaico',
  inv_tabla: 'Tabla',
  inv_vacio_title: 'Inventario vacío',
  inv_vacio_desc: 'Aún no has registrado ningún producto. Empieza creando tu primera referencia.',
  inv_col_producto: 'Producto / Referencia',
  inv_col_categoria: 'Categoría',
  inv_col_precio: 'Precio PVP',
  inv_col_ubicacion: 'Ubicación',
  inv_col_stock_min: 'Stock Mínimo',
  inv_col_stock_act: 'Stock Actual',
  inv_col_estado: 'Estado',
  inv_col_acciones: 'Acciones',
  inv_disponible: 'Disponible',
  inv_bajo_stock: 'Stock Bajo',
  inv_ajustar_stock: 'Ajustar Stock',
  inv_historial: 'Historial',
  inv_btn_crear: 'Crear Referencia',
};

const en: Dict = {
  nav_agenda: 'Schedule', nav_citas: 'Appointments', nav_clientes: 'Clients', nav_equipo: 'Team',
  nav_informes: 'Reports', nav_caja: 'Cashier', nav_mi_jornada: 'My day',
  nav_bandeja: 'Inbox', nav_inventario: 'Inventory', nav_configuracion: 'Settings',
  nav_mas: 'More', nav_lista_espera: 'Waitlist', nav_lista_espera_corta: 'Waitlist', nav_presupuestos: 'Estimates',
  nav_resenas: 'Reviews', nav_campanas: 'Campaigns',
  nav_grp_principal: 'Core', nav_grp_gestion: 'Management',
  guardar: 'Save', cancelar: 'Cancel', eliminar: 'Delete', editar: 'Edit',
  cerrar: 'Close', aceptar: 'Accept', buscar: 'Search', cargando: 'Loading...',
  volver: 'Back',
  hdr_bienvenido: 'Welcome',
  idioma_titulo: 'App language',
  idioma_desc: 'Software interface. Automated client messages use the salon portal language.',
  inv_todos: 'All',
  inv_titulo: 'Inventory & Stock',
  inv_subtitulo: 'Management, traceability and stock control of your salon',
  inv_total_refs: 'Total Products',
  inv_bajo_min: 'Low Stock',
  inv_valor: 'Inventory Value',
  inv_categorias: 'Categories',
  inv_critico_title: 'Products with Insufficient Stock',
  inv_critico_desc: 'There are {count} products below their minimum quantity.',
  inv_ver_criticos: 'View Low Stock Only',
  inv_mostrar_todos: 'Show All',
  inv_nuevo_prod: 'New Product',
  inv_no_resultados: 'No references found',
  inv_buscar_placeholder: 'Search by name, barcode or description...',
  inv_mosaico: 'Grid',
  inv_tabla: 'Table',
  inv_vacio_title: 'Inventory is empty',
  inv_vacio_desc: 'You haven\'t registered any products yet. Start by creating your first product.',
  inv_col_producto: 'Product / Reference',
  inv_col_categoria: 'Category',
  inv_col_precio: 'Retail Price',
  inv_col_ubicacion: 'Location',
  inv_col_stock_min: 'Min Stock',
  inv_col_stock_act: 'Current Stock',
  inv_col_estado: 'Status',
  inv_col_acciones: 'Actions',
  inv_disponible: 'Available',
  inv_btn_crear: 'Create Product',
};

const DICTS: Record<AppLang, Dict> = { es, en };

export type AppTFn = (key: string) => string;

export function makeAppT(lang: AppLang): AppTFn {
  const dict = DICTS[lang] || DICTS.es;
  const fallback = DICTS.es;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}

const STORAGE_KEY = 'mecha_app_lang';

export function readSavedLang(): AppLang {
  try {
    if (IS_DEMO_MODE) return 'es';
    if (typeof window !== 'undefined' && window.localStorage) {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v && (DICTS as any)[v]) return v as AppLang;
    }
    const navLang = typeof navigator !== 'undefined' ? (navigator.language || 'es').slice(0, 2).toLowerCase() : 'es';
    if ((DICTS as any)[navLang]) return navLang as AppLang;
  } catch {}
  return 'es';
}

export function saveLang(lang: AppLang) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

