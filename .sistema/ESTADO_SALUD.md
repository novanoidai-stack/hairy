# 🛡️ Estado de Salud del Sistema — MECHA OS

**Última compilación**: `2026-08-30T21:39:16.904Z`  
**Estado Global**: **🟡 DEGRADADA**  
**Git**: Rama `fix/auditoria-specs-30ago` · Commit `502ca780` (con cambios locales)  
**Duración compilación**: 1402 ms  

## 📊 Resumen Ejecutivo

| Métrica | Valor |
|---|---|
| **Salud del Sistema** | **🟡 DEGRADADA** |
| **Hallazgos Bloqueantes** | `0` |
| **Avisos / Deuda Vigilada** | `41` |
| **Vigilantes Ejecutados** | `16` |

## 🏛️ Desglose de las 5 Capas

### 1. Capa 1: Invariantes Estáticos (Sin Red)
- Vigilantes evaluados: **16**
- Bloqueantes: **0** | Avisos: **41**

### 2. Capa 2: Base de Datos PostgreSQL
- Estado conexión: **Modo Local / Desconectado**
- Hallazgos registrados: **0**

### 3. Capa 3: Vigilancia Visual en 3 Pilares (Landing, Portal, SPA)
- Pilares monitorizados: **3**
- Hallazgos visuales: **0**

### 4. Capa 4: Rendimiento y Calidad de Código
- Hallazgos de complejidad / código muerto: **24**

### 5. Capa 5: Meta-Vigilancia (Guardianes de Integridad)
- Anclas vivas: **✓ 100% Intactas**

## 🔍 Detalle de Hallazgos Activos (41)

### 1. [🟡 AVISO] web/diseno-aurora.html no la enlaza nadie y publica 3 claim(s) fiscales viejos
- **Clave**: `claims-fiscales/copia-muerta`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-aurora.html`
- **Detalle**: El dominio sirve la carpeta web/ entera, asi que esta pagina es publica y indexable aunque no haya ningun enlace hacia ella. Como no la ve casi nadie esto es aviso y no bloqueante, pero el arreglo bueno es borrarla --igual que se hizo con demo_v2.html-- y no ir actualizandole el texto a una copia muerta.

### 2. [🟡 AVISO] Se promete "homologados" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/homologado`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-aurora.html:769`
- **Detalle**: web/diseno-aurora.html dice:

  ...<li><span class="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg></span><span>Tickets homologados por <...

"Homologado" no significa nada en VeriFactu: la AEAT no homologa software, el fabricante emite una declaracion responsable y el sistema envia (o conserva) los registros. Decirlo sugiere una certificacion que no existe.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 3. [🟡 AVISO] Se promete "homologados" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/homologado`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-aurora.html:1332`
- **Detalle**: web/diseno-aurora.html dice:

  ...<div class="faq-a">Sí: tickets homologados <b>VeriFactu</b> con QR de la AEAT y registro de jornada del equipo conforme a la ley, dentro del software, sin addon aparte....

"Homologado" no significa nada en VeriFactu: la AEAT no homologa software, el fabricante emite una declaracion responsable y el sistema envia (o conserva) los registros. Decirlo sugiere una certificacion que no existe.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 4. [🟡 AVISO] Se promete "envío a Hacienda" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/envio-aeat`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-aurora.html:141`
- **Detalle**: web/diseno-aurora.html dice:

  ..."Facturación VeriFactu (AEAT) con cadena SHA-256, QR de cotejo y envío a Hacienda",...

No hay envio. No existe ni la columna donde anotar el resultado de uno.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 5. [🟡 AVISO] web/diseno-brasas.html no la enlaza nadie y publica 3 claim(s) fiscales viejos
- **Clave**: `claims-fiscales/copia-muerta`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-brasas.html`
- **Detalle**: El dominio sirve la carpeta web/ entera, asi que esta pagina es publica y indexable aunque no haya ningun enlace hacia ella. Como no la ve casi nadie esto es aviso y no bloqueante, pero el arreglo bueno es borrarla --igual que se hizo con demo_v2.html-- y no ir actualizandole el texto a una copia muerta.

### 6. [🟡 AVISO] Se promete "homologados" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/homologado`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-brasas.html:769`
- **Detalle**: web/diseno-brasas.html dice:

  ...<li><span class="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg></span><span>Tickets homologados por <...

"Homologado" no significa nada en VeriFactu: la AEAT no homologa software, el fabricante emite una declaracion responsable y el sistema envia (o conserva) los registros. Decirlo sugiere una certificacion que no existe.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 7. [🟡 AVISO] Se promete "homologados" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/homologado`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-brasas.html:1332`
- **Detalle**: web/diseno-brasas.html dice:

  ...<div class="faq-a">Sí: tickets homologados <b>VeriFactu</b> con QR de la AEAT y registro de jornada del equipo conforme a la ley, dentro del software, sin addon aparte....

"Homologado" no significa nada en VeriFactu: la AEAT no homologa software, el fabricante emite una declaracion responsable y el sistema envia (o conserva) los registros. Decirlo sugiere una certificacion que no existe.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 8. [🟡 AVISO] Se promete "envío a Hacienda" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/envio-aeat`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-brasas.html:141`
- **Detalle**: web/diseno-brasas.html dice:

  ..."Facturación VeriFactu (AEAT) con cadena SHA-256, QR de cotejo y envío a Hacienda",...

No hay envio. No existe ni la columna donde anotar el resultado de uno.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 9. [🟡 AVISO] web/diseno-forja.html no la enlaza nadie y publica 3 claim(s) fiscales viejos
- **Clave**: `claims-fiscales/copia-muerta`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-forja.html`
- **Detalle**: El dominio sirve la carpeta web/ entera, asi que esta pagina es publica y indexable aunque no haya ningun enlace hacia ella. Como no la ve casi nadie esto es aviso y no bloqueante, pero el arreglo bueno es borrarla --igual que se hizo con demo_v2.html-- y no ir actualizandole el texto a una copia muerta.

### 10. [🟡 AVISO] Se promete "homologados" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/homologado`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-forja.html:769`
- **Detalle**: web/diseno-forja.html dice:

  ...<li><span class="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg></span><span>Tickets homologados por <...

"Homologado" no significa nada en VeriFactu: la AEAT no homologa software, el fabricante emite una declaracion responsable y el sistema envia (o conserva) los registros. Decirlo sugiere una certificacion que no existe.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 11. [🟡 AVISO] Se promete "homologados" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/homologado`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-forja.html:1332`
- **Detalle**: web/diseno-forja.html dice:

  ...<div class="faq-a">Sí: tickets homologados <b>VeriFactu</b> con QR de la AEAT y registro de jornada del equipo conforme a la ley, dentro del software, sin addon aparte....

"Homologado" no significa nada en VeriFactu: la AEAT no homologa software, el fabricante emite una declaracion responsable y el sistema envia (o conserva) los registros. Decirlo sugiere una certificacion que no existe.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 12. [🟡 AVISO] Se promete "envío a Hacienda" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/envio-aeat`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/diseno-forja.html:141`
- **Detalle**: web/diseno-forja.html dice:

  ..."Facturación VeriFactu (AEAT) con cadena SHA-256, QR de cotejo y envío a Hacienda",...

No hay envio. No existe ni la columna donde anotar el resultado de uno.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 13. [🟡 AVISO] web/index_v5.html no la enlaza nadie y publica 4 claim(s) fiscales viejos
- **Clave**: `claims-fiscales/copia-muerta`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/index_v5.html`
- **Detalle**: El dominio sirve la carpeta web/ entera, asi que esta pagina es publica y indexable aunque no haya ningun enlace hacia ella. Como no la ve casi nadie esto es aviso y no bloqueante, pero el arreglo bueno es borrarla --igual que se hizo con demo_v2.html-- y no ir actualizandole el texto a una copia muerta.

### 14. [🟡 AVISO] Se promete "enviadas a la AEAT" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/envio-aeat`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/index_v5.html:144`
- **Detalle**: web/index_v5.html dice:

  ...<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">9 facturas VeriFactu enviadas a la AEAT</div><div style="font-size:11px;color:var(--ink-3)">con su QR y su hash encadenado</...

No hay envio. No existe ni la columna donde anotar el resultado de uno.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 15. [🟡 AVISO] Se promete "envía a la AEAT" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/envio-aeat`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/index_v5.html:192`
- **Detalle**: web/index_v5.html dice:

  ...<p style="margin:0 0 10px;font-size:15px;color:var(--ink-2)">Cobras y la factura <b>VeriFactu</b> se firma y se envía a la AEAT sola....

No hay envio. No existe ni la columna donde anotar el resultado de uno.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 16. [🟡 AVISO] Se promete "enviada a la AEAT" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/envio-aeat`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/index_v5.html:304`
- **Detalle**: web/index_v5.html dice:

  ...5px">enviada a la AEAT</div></div>...

No hay envio. No existe ni la columna donde anotar el resultado de uno.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 17. [🟡 AVISO] Se promete "enviada a la AEAT" y el envio a la AEAT no existe
- **Clave**: `claims-fiscales/envio-aeat`
- **Ámbito**: `fiscal`
- **Ubicación**: `web/index_v5.html:635`
- **Detalle**: web/index_v5.html dice:

  ...{ tema:"Facturación española", otros:"Fuera del programa: otro software y la gestoría", mecha:"VeriFactu con hash y QR, enviada a la AEAT desde la propia caja" },...

No hay envio. No existe ni la columna donde anotar el resultado de uno.

Mientras ENVIO_AEAT_DISPONIBLE sea false en lib/fiscal/estadoVerifactu.ts, esto es un claim falso (decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.

### 18. [🟡 AVISO] components/agenda/optimizacionTouchAgenda.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/components/agenda/optimizacionTouchAgenda.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `components/agenda/optimizacionTouchAgenda.ts`
- **Detalle**: TRIAR. Probable duplicado de useResponsive() (lib/hooks/useResponsive.ts), que es la via oficial segun el CLAUDE.md.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 19. [🟡 AVISO] components/marketplace/tarjetaSalonResponsive.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/components/marketplace/tarjetaSalonResponsive.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `components/marketplace/tarjetaSalonResponsive.ts`
- **Detalle**: TRIAR. El marketplace funciona y tiene sus e2e; comprobar si esto duplica lo que ya pinta.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 20. [🟡 AVISO] components/portal/optimizacionTouchPortal.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/components/portal/optimizacionTouchPortal.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `components/portal/optimizacionTouchPortal.ts`
- **Detalle**: TRIAR. La misma sospecha que su gemelo de agenda, pero el portal lo ve una clienta desde su movil y ahi el movil-primero SI importa de verdad: comprobar que useResponsive() cubre el caso tactil del portal antes de borrarlo.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 21. [🟡 AVISO] lib/agenda/bonificacionReasignacion.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/agenda/bonificacionReasignacion.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/agenda/bonificacionReasignacion.ts`
- **Detalle**: TRIAR. Suena a incentivo por aceptar un hueco reasignado. Decidir si es producto antes de nada.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 22. [🟡 AVISO] lib/agenda/desinfeccionPausas.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/agenda/desinfeccionPausas.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/agenda/desinfeccionPausas.ts`
- **Detalle**: SIN ENCHUFAR. Encaja en la spec 1 como fase 'transicion', que hoy no existe en la base de datos.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 23. [🟡 AVISO] lib/agenda/serviciosCompatiblesReposo.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/agenda/serviciosCompatiblesReposo.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/agenda/serviciosCompatiblesReposo.ts`
- **Detalle**: DUPLICA. Reimplementa en 12 lineas lo que lib/retrasos.ts ya hace bien y SI esta cableado (fasesDe, ventanasActivas, estrategia aprovechar_reposo). Borrar; la version buena crece con la spec 1.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 24. [🟡 AVISO] lib/agenda/validadorFestivosTurnos.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/agenda/validadorFestivosTurnos.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/agenda/validadorFestivosTurnos.ts`
- **Detalle**: DUPLICA. cierres_negocio + el control de festivos de configuracion.web.tsx y NewCitaModal. Borrar.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 25. [🟡 AVISO] lib/bonos/consumoBonos.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/bonos/consumoBonos.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/bonos/consumoBonos.ts`
- **Detalle**: SIN ENCHUFAR. Va con la spec 6 (bono con calendario de sesiones).

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 26. [🟡 AVISO] lib/caja/arqueoCajaPropinas.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/caja/arqueoCajaPropinas.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/caja/arqueoCajaPropinas.ts`
- **Detalle**: DUPLICA. El arqueo funciona: sesiones_caja + cerrar_caja, 9 sesiones con numero_z y descuadre. Borrar.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 27. [🟡 AVISO] lib/caja/cobroMultiPago.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/caja/cobroMultiPago.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/caja/cobroMultiPago.ts`
- **Detalle**: DUPLICA. El multi-pago funciona: cobros.metodo='mixto' con efectivo_cents/datafono_cents, 16 cobros reales. Vive en caja.web.tsx. Borrar.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 28. [🟡 AVISO] lib/caja/propinasAcumuladas.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/caja/propinasAcumuladas.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/caja/propinasAcumuladas.ts`
- **Detalle**: DUPLICA. cobros.propina_cents esta en produccion y en la caja. Borrar.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 29. [🟡 AVISO] lib/caja/verifactuHash.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/caja/verifactuHash.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/caja/verifactuHash.ts`
- **Detalle**: DUPLICA. La cadena real la mina el trigger cobros_mint_ticket_trigger en SQL. Borrar. Ojo: lib/fiscal/huella.ts NO es esto y si se reutiliza (ver abajo).

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 30. [🟡 AVISO] lib/clientes/detectarDuplicados.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/clientes/detectarDuplicados.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/clientes/detectarDuplicados.ts`
- **Detalle**: DUPLICA. Fusionar duplicados esta en clientes.web.tsx. Borrar.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 31. [🟡 AVISO] lib/config/validadorToggles.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/config/validadorToggles.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/config/validadorToggles.ts`
- **Detalle**: TRIAR. Comprobar contra lo que ya valida configuracion.web.tsx.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 32. [🟡 AVISO] lib/fidelizacion/insigniasCliente.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/fidelizacion/insigniasCliente.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/fidelizacion/insigniasCliente.ts`
- **Detalle**: DUPLICA. logros / logros_desbloqueados / niveles_fidelizacion estan en produccion y se pintan en clientes.web.tsx. Borrar.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 33. [🟡 AVISO] lib/fiscal/huella.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/fiscal/huella.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/fiscal/huella.ts`
- **Detalle**: SIN ENCHUFAR. Calcula la huella con el formato de cadena OFICIAL de la AEAT. Se reutiliza en el bloque 1 (VeriFactu real) en vez de reescribirla.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 34. [🟡 AVISO] lib/inventario/alertasStockMinimo.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/inventario/alertasStockMinimo.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/inventario/alertasStockMinimo.ts`
- **Detalle**: DUPLICA. productos.stock_minimo se usa en inventario.web.tsx y el aviso sale por la campana (useAvisos). Borrar.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 35. [🟡 AVISO] lib/legal/contratoRgpdTablet.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/legal/contratoRgpdTablet.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/legal/contratoRgpdTablet.ts`
- **Detalle**: SIN ENCHUFAR. consentimientos_cliente ya guarda 4 tipos; esto es la firma en tablet. Mirar contra la spec 13 (retencion) antes de tocarlo.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 36. [🟡 AVISO] lib/marketing/campanasFranjasValle.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/marketing/campanasFranjasValle.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/marketing/campanasFranjasValle.ts`
- **Detalle**: SIN ENCHUFAR. La tabla campanas existe y el motor de envio de Alexandro funciona; falta esta segmentacion por franja valle, que es justo la que llena los huecos.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 37. [🟡 AVISO] lib/marketplace/rankingMarketplace.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/marketplace/rankingMarketplace.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/marketplace/rankingMarketplace.ts`
- **Detalle**: TRIAR. salones_externos tiene 2.388 filas y el marketplace esta al 95%: ver si el ranking real ya se calcula en otro sitio.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 38. [🟡 AVISO] lib/nominas/liquidacionNominas.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/nominas/liquidacionNominas.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/nominas/liquidacionNominas.ts`
- **Detalle**: SIN ENCHUFAR. Roza la spec 11 (cerrar el ciclo de comisiones) pero no es lo mismo: comisiones != nomina. Decidir si Mecha entra en nominas antes de enchufarlo.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 39. [🟡 AVISO] lib/pos/qrPagoRapido.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/pos/qrPagoRapido.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/pos/qrPagoRapido.ts`
- **Detalle**: DUPLICA. El cobro por enlace/QR existe: edge crear-checkout-cobro + app/pagar/[token] + terminal-cobro-intent. Borrar.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 40. [🟡 AVISO] lib/security/sanitizadorCliente.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/security/sanitizadorCliente.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/security/sanitizadorCliente.ts`
- **Detalle**: BORRAR, mismo motivo. Escapar HTML en el cliente no es un limite de seguridad; React ya escapa al pintar y el limite de verdad esta en el servidor. Si se quiere validar el telefono en E.164, eso es validacion de formulario y va donde esta el formulario.

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

### 41. [🟡 AVISO] lib/security/validadorRPC.ts sigue sin enchufar (solo lo usa su test)
- **Clave**: `modulos-desconectados/lib/security/validadorRPC.ts`
- **Ámbito**: `codigo-muerto`
- **Ubicación**: `lib/security/validadorRPC.ts`
- **Detalle**: BORRAR, y por un motivo que conviene dejar escrito: detectar 'inyeccion SQL' en el cliente antes de una RPC no es una defensa. Las RPC de Supabase van parametrizadas y el control real es RLS + la regla del parametro (exige_mi_negocio), que es lo que documenta el CLAUDE.md. Enchufar esto seria PEOR que borrarlo: da confianza falsa y bloquea entradas legitimas (una nota que diga 'union' o un apellido con guion).

Sigue en la linea base de scripts/vigilantes/modulos-desconectados-baseline.json. Cuando se enchufe, quitarlo de ahi: el trinquete solo gira hacia abajo.

