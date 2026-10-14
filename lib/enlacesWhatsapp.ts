// Las plantillas de Meta con boton URL (confirmacion_citas, aviso_lista_espera,
// peticion_resena, enlace_pago_senal) estuvieron aprobadas hasta el 14 oct 2026 con
// un `{{1}}` literal pegado delante de la variable: `.../app/cita/%7B%7B1%7D%7D{{1}}`.
// El enlace llegaba como `/app/cita/{{1}}<uuid>` y la pagina no encontraba la cita.
// Las plantillas ya estan corregidas, pero los mensajes enviados antes siguen en los
// moviles de las clientas con ese prefijo: se quita al leer el parametro de la ruta.
export function paramDeEnlaceWhatsapp(valor: string | string[] | undefined): string {
  const v = String(Array.isArray(valor) ? valor[0] ?? '' : valor ?? '');
  return v.replace(/^(?:\{\{1\}\}|%7B%7B1%7D%7D)+/i, '');
}
