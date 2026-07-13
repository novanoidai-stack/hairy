/**
 * lib/fiscal/xmlAlta.ts
 * Generador del XML de Alta (RegFactuSistemaFacturacion) para VeriFactu.
 */

export interface FacturaVerifactu {
  idEmisor: string;
  nombreEmisor: string;
  numSerieFactura: string;
  fechaExpedicion: string; // DD-MM-YYYY
  tipoFactura: string; // F1, F2, etc
  baseImponible: string; // "12.00"
  tipoIva: string; // "21.00"
  cuotaIva: string; // "2.52"
  importeTotal: string; // "14.52"
  huella: string;
  huellaAnterior?: string;
  fechaHoraHusoGenRegistro: string; // ISO con huso
  qrUrl: string;
}

export interface ConfiguracionColaborador {
  nifColaborador: string;
  nombreColaborador: string;
  esColaboradorSocial: boolean;
}

export function generarXmlAlta(
  factura: FacturaVerifactu,
  colaborador: ConfiguracionColaborador
): string {
  // Nota: Estructura base simplificada segun esquema Verifactu (SuministroLR.xsd)
  // namespace sum: https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd
  // namespace sum1: https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd

  return `<?xml version="1.0" encoding="UTF-8"?>
<sum:RegFactuSistemaFacturacion xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd" xmlns:sum1="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">
  <sum:Cabecera>
    <sum1:ObligadoEmision>
      <sum1:NombreRazon>${factura.nombreEmisor}</sum1:NombreRazon>
      <sum1:NIF>${factura.idEmisor}</sum1:NIF>
    </sum1:ObligadoEmision>
${colaborador.esColaboradorSocial ? `    <sum1:Representante>
      <sum1:NombreRazon>${colaborador.nombreColaborador}</sum1:NombreRazon>
      <sum1:NIF>${colaborador.nifColaborador}</sum1:NIF>
    </sum1:Representante>` : ''}
  </sum:Cabecera>
  <sum:RegistroFactura>
    <sum:RegistroAlta>
      <sum:IDFactura>
        <sum1:IDEmisorFactura>${factura.idEmisor}</sum1:IDEmisorFactura>
        <sum1:NumSerieFactura>${factura.numSerieFactura}</sum1:NumSerieFactura>
        <sum1:FechaExpedicionFactura>${factura.fechaExpedicion}</sum1:FechaExpedicionFactura>
      </sum:IDFactura>
      <sum:FacturaExpedida>
        <sum:TipoFactura>${factura.tipoFactura}</sum:TipoFactura>
        <sum:ImporteTotal>${factura.importeTotal}</sum:ImporteTotal>
        <sum:Desglose>
          <sum1:DetalleDesglose>
            <sum1:ClaveRegimen>01</sum1:ClaveRegimen> <!-- Regimen general -->
            <sum1:BaseImponible>${factura.baseImponible}</sum1:BaseImponible>
            <sum1:TipoImpositivo>${factura.tipoIva}</sum1:TipoImpositivo>
            <sum1:CuotaRepercutida>${factura.cuotaIva}</sum1:CuotaRepercutida>
          </sum1:DetalleDesglose>
        </sum:Desglose>
      </sum:FacturaExpedida>
      <sum:Encadenamiento>
${factura.huellaAnterior ? `        <sum:RegistroAnterior>
          <sum1:IDEmisorFactura>${factura.idEmisor}</sum1:IDEmisorFactura>
          <sum1:Huella>${factura.huellaAnterior}</sum1:Huella>
        </sum:RegistroAnterior>` : ''}
      </sum:Encadenamiento>
      <sum:SistemaInformatico>
        <sum1:NombreRazon>Novanoid AI S.L.</sum1:NombreRazon>
        <sum1:NIF>B00000000</sum1:NIF> <!-- NIF de la empresa de software -->
        <sum1:NombreSistemaInformatico>Mecha Salon Management</sum1:NombreSistemaInformatico>
        <sum1:IdSistemaInformatico>MECHA01</sum1:IdSistemaInformatico>
        <sum1:Version>1.0</sum1:Version>
        <sum1:NumeroInstalacion>1</sum1:NumeroInstalacion>
        <sum1:TipoUsoPosibleSoloVerifactu>S</sum1:TipoUsoPosibleSoloVerifactu>
        <sum1:TipoUsoDatosMultiplesDeclarantes>S</sum1:TipoUsoDatosMultiplesDeclarantes>
        <sum1:IndicadorAlteracion>N</sum1:IndicadorAlteracion>
      </sum:SistemaInformatico>
      <sum:FechaHoraHusoGenRegistro>${factura.fechaHoraHusoGenRegistro}</sum:FechaHoraHusoGenRegistro>
      <sum:Huella>${factura.huella}</sum:Huella>
    </sum:RegistroAlta>
  </sum:RegistroFactura>
</sum:RegFactuSistemaFacturacion>`;
}
