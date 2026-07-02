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

export type AppLang = 'es' | 'en' | 'fr' | 'de' | 'it' | 'pt' | 'ca';
export const APP_LANGS: { code: AppLang; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ca', label: 'Català' },
];

type Dict = Record<string, string>;

const es: Dict = {
  // Navegacion (MobileTabBar + Sidebar)
  nav_agenda: 'Agenda',
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
};

const en: Dict = {
  nav_agenda: 'Schedule', nav_clientes: 'Clients', nav_equipo: 'Team',
  nav_informes: 'Reports', nav_caja: 'Cashier', nav_mi_jornada: 'My day',
  nav_bandeja: 'Inbox', nav_inventario: 'Inventory', nav_configuracion: 'Settings',
  nav_mas: 'More', nav_lista_espera: 'Waitlist',
  guardar: 'Save', cancelar: 'Cancel', eliminar: 'Delete', editar: 'Edit',
  cerrar: 'Close', aceptar: 'Accept', buscar: 'Search', cargando: 'Loading...',
  volver: 'Back',
  hdr_bienvenido: 'Welcome',
  idioma_titulo: 'App language',
  idioma_desc: 'Software interface. Automated client messages use the salon portal language.',
};

const fr: Dict = {
  nav_agenda: 'Agenda', nav_clientes: 'Clients', nav_equipo: 'Équipe',
  nav_informes: 'Rapports', nav_caja: 'Caisse', nav_mi_jornada: 'Ma journée',
  nav_bandeja: 'Boîte', nav_inventario: 'Stock', nav_configuracion: 'Réglages',
  nav_mas: 'Plus', nav_lista_espera: 'Liste d\'attente',
  guardar: 'Enregistrer', cancelar: 'Annuler', eliminar: 'Supprimer', editar: 'Modifier',
  cerrar: 'Fermer', aceptar: 'Valider', buscar: 'Rechercher', cargando: 'Chargement...',
  volver: 'Retour',
  hdr_bienvenido: 'Bienvenue',
  idioma_titulo: 'Langue de l\'application',
  idioma_desc: 'Interface du logiciel. Les messages automatiques aux clientes utilisent la langue du portail.',
};

const de: Dict = {
  nav_agenda: 'Kalender', nav_clientes: 'Kunden', nav_equipo: 'Team',
  nav_informes: 'Berichte', nav_caja: 'Kasse', nav_mi_jornada: 'Mein Tag',
  nav_bandeja: 'Posteingang', nav_inventario: 'Bestand', nav_configuracion: 'Einstellungen',
  nav_mas: 'Mehr', nav_lista_espera: 'Warteliste',
  guardar: 'Speichern', cancelar: 'Abbrechen', eliminar: 'Löschen', editar: 'Bearbeiten',
  cerrar: 'Schließen', aceptar: 'Bestätigen', buscar: 'Suchen', cargando: 'Lädt...',
  volver: 'Zurück',
  hdr_bienvenido: 'Willkommen',
  idioma_titulo: 'App-Sprache',
  idioma_desc: 'Software-Oberfläche. Automatische Kundennachrichten nutzen die Portalsprache.',
};

const it: Dict = {
  nav_agenda: 'Agenda', nav_clientes: 'Clienti', nav_equipo: 'Team',
  nav_informes: 'Report', nav_caja: 'Cassa', nav_mi_jornada: 'La mia giornata',
  nav_bandeja: 'Posta', nav_inventario: 'Magazzino', nav_configuracion: 'Impostazioni',
  nav_mas: 'Altro', nav_lista_espera: 'Lista d\'attesa',
  guardar: 'Salva', cancelar: 'Annulla', eliminar: 'Elimina', editar: 'Modifica',
  cerrar: 'Chiudi', aceptar: 'Conferma', buscar: 'Cerca', cargando: 'Caricamento...',
  volver: 'Indietro',
  hdr_bienvenido: 'Benvenuto/a',
  idioma_titulo: 'Lingua dell\'app',
  idioma_desc: 'Interfaccia del software. I messaggi automatici usano la lingua del portale del salone.',
};

const pt: Dict = {
  nav_agenda: 'Agenda', nav_clientes: 'Clientes', nav_equipo: 'Equipa',
  nav_informes: 'Relatórios', nav_caja: 'Caixa', nav_mi_jornada: 'A minha jornada',
  nav_bandeja: 'Caixa de entrada', nav_inventario: 'Inventário', nav_configuracion: 'Definições',
  nav_mas: 'Mais', nav_lista_espera: 'Lista de espera',
  guardar: 'Guardar', cancelar: 'Cancelar', eliminar: 'Eliminar', editar: 'Editar',
  cerrar: 'Fechar', aceptar: 'Aceitar', buscar: 'Pesquisar', cargando: 'A carregar...',
  volver: 'Voltar',
  hdr_bienvenido: 'Bem-vindo/a',
  idioma_titulo: 'Idioma da aplicação',
  idioma_desc: 'Interface do software. As mensagens automáticas usam o idioma do portal do salão.',
};

const ca: Dict = {
  nav_agenda: 'Agenda', nav_clientes: 'Clients', nav_equipo: 'Equip',
  nav_informes: 'Informes', nav_caja: 'Caixa', nav_mi_jornada: 'La meva jornada',
  nav_bandeja: 'Safata', nav_inventario: 'Inventari', nav_configuracion: 'Configuració',
  nav_mas: 'Més', nav_lista_espera: 'Llista d\'espera',
  guardar: 'Desa', cancelar: 'Cancel·la', eliminar: 'Elimina', editar: 'Edita',
  cerrar: 'Tanca', aceptar: 'Accepta', buscar: 'Cerca', cargando: 'Carregant...',
  volver: 'Torna',
  hdr_bienvenido: 'Benvingut/da',
  idioma_titulo: 'Idioma de l\'aplicació',
  idioma_desc: 'Interfície del programari. Els missatges automàtics fan servir l\'idioma del portal del saló.',
};

const DICTS: Record<AppLang, Dict> = { es, en, fr, de, it, pt, ca };

export type AppTFn = (key: string) => string;

export function makeAppT(lang: AppLang): AppTFn {
  const dict = DICTS[lang] || DICTS.es;
  const fallback = DICTS.es;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}

const STORAGE_KEY = 'mecha_app_lang';

export function readSavedLang(): AppLang {
  try {
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
