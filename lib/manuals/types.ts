export interface ManualSeccion {
  titulo: string;
  texto: string;
  captura?: string; // ruta publica, p.ej. /manuals/agenda/nueva-cita.png
}

export interface ManualContent {
  pageKey: string;
  tituloPagina: string;
  avisoTexto: string; // texto corto del banner de primera visita
  secciones: ManualSeccion[];
}
