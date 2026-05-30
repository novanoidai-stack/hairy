# Hairy -- Roadmap de producto

Documento generado a partir de la lectura completa de los documentos de referencia. Cubre todos los puntos del Documento Modular 1.

## Documentos de referencia

| Documento | Ruta | Prioridad |
|-----------|------|-----------|
| Documento Modular 1 -- Agenda | Documentacion/documento-modular-1-agenda.docx | MAXIMA -- define el COMO |
| Dossier de Requisitos Innegociables | Documentacion/dossier_requisitos_innegociables.html | Define el QUE minimo de v1 |
| Documento 1 -- Vision y Principios | Documentacion/documento-1-vision-principios-rectores(1).docx | Marco estrategico |

**Regla de jerarquia:** En caso de contradiccion, el Documento Modular 1 tiene prioridad sobre el Dossier.

## Estado actual

- **Completado** = Item implementado y funcionando
- **En progreso** = Item en desarrollo activo
- **Pendiente** = Item no iniciado

## Orden de fases

Las fases puramente de app van primero. Todo lo que requiere servicios externos (n8n, APIs de mensajeria, IA, chatbots) va al final, siendo chatbots lo ultimo.

---

# BLOQUE 1 -- FUNCIONALIDAD CORE (sin dependencias externas)

---

## Fase 1 -- Nucleo de la cita (edicion en tiempo real) -- 8/8

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 1.1 | PA-01 + CE-AG-02 | Editar hora/duracion de cita EN_CURSO. Si el fin se extiende, desplazar citas siguientes del mismo profesional en cadena. | Completado |
| 1.2 | RN-AG-002 | Validar solapamientos al mover/editar una cita (mismo profesional, misma franja) | Completado |
| 1.3 | RN-AG-010 | Respetar el minimo de antelacion configurable al crear cita | Completado |
| 1.4 | RN-AG-014 | Bloquear franjas fuera del horario laboral del profesional | Completado |
| 1.5 | PA-05 + CE-AG-05 | Drag & drop para reasignar hora/profesional directamente desde el calendario | Completado |
| 1.6 | RN-AG-032 | Sistema de confirmacion de cita (propuesta a confirmada) con accion manual o automatica | Completado |
| 1.7 | CE-AG-08 | Reasignacion automatica cuando un profesional se bloquea con citas ya confirmadas | Completado |
| 1.8 | CU-AG-05 | Flujo completo de cancelacion desde clienta + PA-06 (nunca borrado fisico) | Completado |

---

## Fase 3 -- Tiempos muertos productivos [DIFERENCIAL CLAVE] -- 8/8

Durante el tiempo de reposo (ej. tinte procesando) el profesional puede atender a otra clienta. Feature diferencial frente a Booksy y Fresha.

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 3.1 | RN-AG-040 | Cada servicio tiene duracion_activa + tiempo_reposo separados | Completado |
| 3.2 | RN-AG-041 | Durante tiempo de reposo el profesional puede atender otra cita (solapamiento gestionado) | Completado |
| 3.3 | RN-AG-042 | El slot de reposo se muestra visualmente diferenciado en el calendario | Completado |
| 3.4 | RN-AG-043 | Al calcular disponibilidad, solo bloquear duracion_activa, no el reposo | Completado |
| 3.5 | RN-AG-070 | Motor de asignacion inteligente: maximizar uso de tiempos de reposo para citas adicionales | Completado |
| 3.6 | RN-AG-071 | Sugerir hueco optimo al crear nueva cita aprovechando reposos existentes | Completado |
| 3.7 | RN-AG-072 | Alerta si se solapa activo+activo (prohibido) vs activo+reposo (permitido) | Completado |
| 3.8 | RN-AG-073-074 | Metricas de aprovechamiento: % tiempos muertos aprovechados por profesional/dia | Completado |

---

## Fase 5 -- Servicios encadenados multi-profesional [DIFERENCIAL CLAVE] -- 7/8

Una cita puede requerir varios profesionales en secuencia (ej. corte + tinte + secado por distintas personas).

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 5.1 | CU-AG-02 | Crear cita con multiples servicios encadenados | Completado |
| 5.2 | RN-AG-080 | Cada sub-servicio puede tener profesional diferente asignado | Completado |
| 5.3 | RN-AG-081 | Los sub-servicios se encadenan en tiempo (fin de uno = inicio del siguiente) | Completado |
| 5.4 | RN-AG-082 | Validar disponibilidad de todos los profesionales implicados simultaneamente | Completado |
| 5.5 | RN-AG-083 | Calendario muestra la cita encadenada como bloque unificado con secciones por profesional | Completado |
| 5.6 | RN-AG-004-005 | Sub-tipos de servicio: servicio principal + add-ons opcionales | Completado |
| 5.7 | CE-AG-04 | Excepcion: un profesional del encadenado no esta disponible, sugerir reorganizacion | Completado |
| 5.8 | -- | Asignacion inteligente: sugerir combinacion optima de profesionales para encadenado | Pendiente |

---

## Fase 6 -- Reorganizaciones y casos de excepcion -- 9/10

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 6.1 | CE-AG-01 | Profesional llega tarde, ajustar citas del dia sin perder informacion | Completado |
| 6.2 | CE-AG-02 | Cita se alarga mas de lo previsto, aviso de impacto en citas siguientes | Completado |
| 6.3 | CE-AG-03 | Clienta llega tarde, opciones: reducir servicio, mover, cancelar | Completado |
| 6.4 | CE-AG-07 | Salon cierra inesperadamente, cancelacion masiva con notificacion a todas las clientas | Completado |
| 6.5 | RN-AG-090 | Reagendado: mover cita a otra franja conservando todo el historial | Completado |
| 6.6 | RN-AG-091 | Al reagendar, verificar disponibilidad del profesional en nuevo slot | Completado |
| 6.7 | RN-AG-092 | Notificacion automatica a clienta cuando se reagenda su cita | Pendiente |
| 6.8 | RN-AG-100 | Bloqueo de agenda del profesional (vacaciones, reunion, baja) | Completado |
| 6.9 | RN-AG-101 | Al crear bloqueo sobre citas existentes, opcion de reagendar o cancelar afectadas | Completado |
| 6.10 | RN-AG-102 | Bloqueo recurrente (ej. reunion semanal todos los lunes a las 9h) | Completado |

---

## Fase 8 -- Vistas y busqueda avanzada -- 5/5

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 8.1 | -- | Vista por profesional: columna unica con toda su agenda | Completado |
| 8.2 | -- | Vista por clienta: historial cronologico de todas sus citas | Completado |
| 8.3 | -- | Filtros en calendario: por profesional, servicio, estado, fecha | Completado |
| 8.4 | -- | Buscador global: encontrar cita por nombre clienta, telefono, servicio | Completado |
| 8.5 | -- | Vista semana / mes ademas de vista dia actual | Completado |

---

## Fase 10 -- Gestion de equipo avanzada -- 0/5

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 10.1 | -- | Especialidades por profesional (que servicios puede hacer cada uno) | Pendiente |
| 10.2 | -- | Horario partido: dos turnos en el mismo dia con pausa en medio | Pendiente |
| 10.3 | -- | Precios diferenciados por categoria de profesional (senior vs junior) | Pendiente |
| 10.4 | -- | Sub-tipos de servicio: mismo servicio con variantes de precio/duracion | Pendiente |
| 10.5 | -- | Rol de recepcionista: gestionar agenda sin acceso a configuracion ni informes | Pendiente |

---

## Fase 9 -- Metricas e informes -- 10/10

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 9.1 | M-01 | % ocupacion por profesional / franja horaria / dia semana | Completado |
| 9.2 | M-02 | Tasa de no-shows por profesional / servicio / periodo | Completado |
| 9.3 | M-03 | Tiempo medio de espera entre citas (eficiencia de agenda) | Completado |
| 9.4 | M-04 | % tiempos de reposo aprovechados (citas adicionales metidas) | Completado |
| 9.5 | M-05 | Ingresos por profesional, servicio, clienta, periodo | Completado |
| 9.6 | M-06 | Servicios mas solicitados y combinaciones mas frecuentes | Completado |
| 9.7 | M-07 | Retencion de clientas: frecuencia de visita, tiempo desde ultima cita | Completado |
| 9.8 | M-08 | Comisiones por profesional calculadas automaticamente | Completado |
| 9.9 | -- | Informes exportables (PDF/CSV) | Completado |
| 9.10 | -- | Dashboard visual con KPIs principales en pantalla inicio | Completado |

---

## Fase 2 -- Ciclo de cobro y post-cita -- 0/5

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 2.1 | CU-AG-06 | Flujo cobro: finalizada a cobrada a historica (boton Cobrar en detalle de cita) | Pendiente |
| 2.2 | RN-AG-061 | Importe final editable al cobrar (descuentos, ajustes) | Pendiente |
| 2.3 | RN-AG-062 | Registro del metodo de pago al cobrar (efectivo, tarjeta, bizum) | Pendiente |
| 2.4 | -- | Cobro familiar: una transaccion cubre multiples citas del mismo grupo | Pendiente |
| 2.5 | -- | Post-cita: pantalla resumen tras cobrar (productos usados, propina, nota) | Pendiente |

---

# BLOQUE 2 -- DEPENDENCIAS EXTERNAS (n8n, APIs, integraciones)

---

## Fase 4 -- Anti no-show y comunicaciones -- 0/9

Requiere: APIs de mensajeria (WhatsApp, SMS, email), n8n para automatizaciones, pasarela de pago para depositos.

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 4.1 | RN-AG-050 | Recordatorio automatico configurable (24h, 2h antes) por WhatsApp/SMS/email | Pendiente |
| 4.2 | RN-AG-051 | Deposito/senal: cobro parcial al confirmar para reducir no-shows | Pendiente |
| 4.3 | RN-AG-052 | Marcar cita como NO_PRESENTADA tras X minutos de no llegada | Pendiente |
| 4.4 | RN-AG-053 | Historial de no-shows por clienta (visible en ficha clienta) | Pendiente |
| 4.5 | RN-AG-110 | Plantillas de mensaje personalizables por salon | Pendiente |
| 4.6 | RN-AG-111 | Mensajes de confirmacion, recordatorio, cancelacion y post-cita | Pendiente |
| 4.7 | RN-AG-112 | Log de comunicaciones enviadas visible desde la cita | Pendiente |
| 4.8 | RN-AG-031 | Lista de espera: cuando cita cancelada libera hueco, notificar a clientas en espera | Pendiente |
| 4.9 | RN-AG-033-034 | Gestion de lista de espera: prioridad, notificacion, confirmacion con deadline | Pendiente |

---

## Fase 7 -- Reserva omnicanal -- 0/5

Requiere: portal web publico, integraciones con plataformas externas, widgets embebibles.

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 7.1 | CU-AG-03 | Portal de reserva publica para clientas (web/app sin login) | Pendiente |
| 7.3 | -- | Walk-ins: registrar cita al momento sin reserva previa | Pendiente |
| 7.4 | -- | QR de reserva para mostrar en el salon | Pendiente |
| 7.5 | -- | Widget embebible en web propia del salon | Pendiente |

---

## Fase 11 -- IA avanzada -- 0/4

Requiere: modelos de ML, APIs de IA, procesamiento de lenguaje natural.

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 11.1 | IA-NS | Prediccion de no-shows: modelo que puntua probabilidad por clienta + franja + historial | Pendiente |
| 11.2 | IA-OA | Optimizacion automatica de agenda: sugerir reordenacion del dia para maximizar ingresos | Pendiente |
| 11.3 | -- | Analisis lenguaje natural: reportes en texto (ej. "este mes bajaron los cortes un 12%") | Pendiente |
| 11.4 | -- | Sugerencia de servicios: "esta clienta suele pedir tinte cada 8 semanas, ya van 9" | Pendiente |

---

## Fase 12 -- Chatbots y reservas automatizadas -- 0/3

Requiere: WhatsApp Business API, Instagram API, n8n, agente conversacional. VA AL FINAL DE TODO.

| # | Regla | Descripcion | Estado |
|---|-------|-------------|--------|
| 12.1 | CU-AG-04 | Chatbot WhatsApp: reservar, cancelar y consultar citas via conversacion | Pendiente |
| 12.2 | -- | Chatbot Instagram: reservas desde DMs de Instagram | Pendiente |
| 12.3 | -- | Integracion Google: reservas desde Google Maps / Google Search | Pendiente |

---

## Decisiones pendientes (seccion 17 del Documento Modular 1)

Deben resolverse antes o durante la fase correspondiente.

1. Deposito minimo: importe fijo, % del servicio, o configurable por servicio?
2. Politica de cancelacion tardia: cobrar penalizacion? en que plazo? % del servicio?
3. Reagendado automatico vs manual: proponer opciones a la clienta o dejar que elija libremente?
4. Encadenado multi-salon: una cita puede tener profesionales de distintas sedes?
5. Tiempo de reposo compartido: dos profesionales pueden compartir el mismo hueco de reposo?
6. Visibilidad de precios en portal publico: mostrar precios antes de reservar o solo al confirmar?
7. Integracion calendario externo: sincronizar con Google Calendar / Apple Calendar?
8. App clienta independiente: app separada para que las clientas gestionen sus citas?

---

*Basado en lectura completa de los documentos de referencia -- mayo 2026*
