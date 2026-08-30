// Hasta donde llega HOY la parte fiscal de Mecha. Fuente unica, y el ancla del
// vigilante `scripts/vigilantes/claims-fiscales.mjs`.
//
// POR QUE EXISTE ESTE FICHERO
//
// El 30 ago 2026 se encontro que la landing prometia, en texto visible y en el
// FAQ de datos estructurados, "facturacion VeriFactu (AEAT) con QR de cotejo y
// envio a Hacienda" y respondia "Si" a "¿Mecha cumple la normativa VeriFactu?".
// Mientras tanto, los comentarios del propio codigo decian literalmente lo
// contrario ("no hay alta en VeriFactu ni QR de verificacion oficial") y en
// produccion `config_fiscal.proveedor_estado` era `no_configurado` / `sandbox`
// con `apoderamiento_ok = false`: 1.600 tickets encadenados en local y ninguno
// enviado. Es exactamente el tipo de deriva que la decision 5 del CLAUDE.md
// prohibe (sin claims falsos), y no la cazaba nadie porque no habia ningun sitio
// donde constara, en el repo, hasta donde llega el producto de verdad.
//
// COMO SE USA
//
// Mientras `ENVIO_AEAT_DISPONIBLE` sea false, ninguna superficie publica (la
// landing, especificaciones, la carta comercial, los terminos, el prompt de
// chispa-landing, la base de conocimiento de la demo) puede afirmar que Mecha
// envia a la AEAT, que esta homologada, que emite el QR de cotejo o que "cumple
// VeriFactu". Puede decir lo que SI hace, que no es poco y es lo que exige la
// parte de la Ley Antifraude que prohibe el software de doble uso.
//
// Cuando el envio este de verdad en produccion (worker mTLS + apoderamiento +
// `config_fiscal.proveedor_estado = 'produccion'`), se pone a true AQUI, en el
// mismo commit que lo despliega, y el vigilante deja de bloquear esas palabras.
// No al reves: primero funciona, luego se anuncia.
export const ENVIO_AEAT_DISPONIBLE = false;

/** El QR de cotejo se genera en local y NO depende del apoderamiento, asi que
 *  puede llegar antes que el envio. Va aparte a proposito.
 *
 *  A true el 30 ago 2026: `mint_ticket_verifactu` compone la URL de cotejo al
 *  emitir (con el NIF, el numero de serie, la fecha y el importe que de verdad
 *  se sellaron) y `lib/caja/ticketPdf.web.ts` la pinta en el ticket.
 *
 *  OJO CON LO QUE ESTO PERMITE DECIR: que el ticket LLEVA un QR de cotejo, si.
 *  Que ese QR encuentra el registro en la AEAT, NO -- para eso hace falta el
 *  envio, que es ENVIO_AEAT_DISPONIBLE. El pie del ticket lo dice asi. */
export const QR_COTEJO_DISPONIBLE = true;

/** Lo que si esta y se puede prometer sin letra pequena. */
export const LIBRO_TICKETS_INALTERABLE = true;
