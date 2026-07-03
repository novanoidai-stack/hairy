export interface ManualSeccion {
  titulo: string;
  texto: string;
  captura?: string; // ruta bajo la SPA (montada en /app), p.ej. /app/manuals/agenda/nueva-cita.png
}

export interface ManualContent {
  pageKey: string;
  tituloPagina: string;
  avisoTexto: string; // texto corto del banner de primera visita
  secciones: ManualSeccion[];
}
