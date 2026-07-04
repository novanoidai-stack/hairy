export interface ManualHighlight {
  // Porcentajes (no px): el recuadro se posiciona relativo al contenedor que
  // envuelve la imagen, que siempre coincide con su tamaño ya escalado
  // (objectFit:contain). Con px fijos el recuadro se desalinearia en cuanto
  // la imagen se renderizase a un tamano distinto al asumido al anotarlo.
  top: string;
  left: string;
  width: string;
  height: string;
}

export interface ManualSeccion {
  titulo: string;
  texto: string;
  captura?: string; // ruta bajo la SPA (montada en /app), p.ej. /manuals/agenda/nueva-cita.png
  highlight?: ManualHighlight; // recuadro pulsante que señala la zona exacta descrita en el texto
}

export interface ManualContent {
  pageKey: string;
  tituloPagina: string;
  avisoTexto: string; // texto corto del banner de primera visita
  secciones: ManualSeccion[];
}
