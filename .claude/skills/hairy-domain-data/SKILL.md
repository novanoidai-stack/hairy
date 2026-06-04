---
name: hairy-domain-data
description: Dominio de negocio de Hairy fuera de la agenda (clientes, equipo/horarios, catalogo de servicios, caja/cobros con fiscalidad, capa de IA) mas patrones de datos Supabase y multi-tenant negocio_id. Resumen consultable para no releer los PDFs modulares 2-6 cada vez. Cargar al disenar pantallas de clientes, equipo, servicios, caja o cualquier feature de IA.
---

# Hairy — Dominio y datos (modulos 2-6 + Supabase)

Resumen destilado de `hairy/docs/socio/documento-modular-{2,3,4,5,6}-*.pdf`. Para el detalle fino de una regla concreta, releer el PDF correspondiente. Cada modulo tiene su set de reglas (RN-CL, RN-EQ, RN-SV, RN-CJ, RN-IA).

## Clientes y fichas (Modular 2)

- Ficha de cliente con historial.
- **Ficha tecnica de color** (diferencial): formulas, tonos, tiempos de exposicion por cliente. Pantalla con densidad de datos tecnicos; pensada para profesional, no consumidor.
- **Perfil de riesgo de no-show**: indicador por cliente que la UI puede mostrar (sin estigmatizar de forma agresiva).
- **RGPD**: consentimientos, derecho a borrado. Cuidado con exponer datos personales.

## Equipo y horarios (Modular 3)

- **Jerarquia de 5 niveles**: auxiliar, oficial, oficial mayor, estilista senior, direccion artistica. Afecta a que servicios puede dar cada profesional (categoria minima del servicio).
- **Roles de acceso**: Profesional, Recepcion, Direccion, Propietario, Personalizado. La UI muestra/oculta segun rol.
- **Turnos partidos** y excepciones de horario (impacta directamente en columnas de agenda).
- **Modelos de comision**: % fijo, % por categoria, cantidad fija, tramos, venta de producto, mixto. Pantallas de configuracion con varios modos.
- **Sillon en alquiler**: profesional autonomo que opera dentro del salon (caso especial de datos/comisiones).

## Catalogo de servicios (Modular 4)

- Servicio con **fases activa/reposo/transicion** (esto alimenta la agenda — ver [[hairy-agenda-rules]]).
- **Duracion variable por subtipos** (ej. corte segun largo de pelo).
- Precios por categoria de profesional, **categoria minima** requerida para dar el servicio.
- Servicios **combinables** y **encadenables**, reservables online, con prepago/politica de cancelacion opcionales.

## Caja y cobros (Modular 5)

- **Fiscalidad real**: VeriFactu, RD 1619/2012, IVA 21%. Requiere asesoria fiscal antes de lanzar; NO improvisar logica fiscal en la UI.
- Estructura de ticket; metodos de pago; descuentos.
- Diferenciales: **cuenta familiar/grupo** (un pagador, varios servicios/personas), **tickets pendientes "a deber"**, asumir tickets de terceros.
- **Arqueo diario** (cierre de caja): pantalla de cuadre.
- Devoluciones y comisiones ligadas al cobro.

## Capa de IA (Modular 6) — el gran diferencial

Tres servicios: **IA-VZ** (agente de voz 24/7), **IA-CV** (chat WhatsApp/web), **IA-RC** (recordatorios inteligentes anti no-show).

Principios que marcan la UI:
- **Transparencia**: la IA SIEMPRE se identifica como IA.
- **"IA propone, profesional dispone"** (PR-12): la IA sugiere; el humano decide y puede sobreescribir.
- **Escalado a humano** siempre disponible.
- **PR02: la IA es transversal, NO hay una "pantalla de IA" separada.** Sus efectos (citas creadas, sugerencias) aparecen integrados en las pantallas normales, no en un modulo aparte.

La capa de voz YA esta construida y operando: ver [[project-hairy-voice-agent]]. Las citas pueden entrar por IA; distinguir origen en la agenda.

## Datos y seguridad (aplica a TODA pantalla con datos)

- **Supabase propio de Hairy** (NO el de Novanoid). Credenciales en `hairy/CLAUDE.md`.
- **Multi-tenant estricto**: todo SELECT filtra `.eq('negocio_id', profile.negocio_id)`; todo INSERT incluye `negocio_id`. Cada usuario ve SOLO lo suyo.
- Campos reales conocidos en BD: `negocio_id` (tenant), `barbero_asignado`, `precio_cobrado`, `calendar_id` (clave unica de cita, ligada a la sync con Google Calendar).
- Existe sincronizacion con Google Calendar externo cada 10 min (la disponibilidad se calcula desde Supabase, no consultando GCal en vivo).

## Invariantes de UI para todo el dominio

- Sobrio/profesional/atemporal, no estetica startup. Velocidad > belleza. ≤3 toques. Sin emojis. Espanol.
- Reutiliza componentes existentes (ver [[hairy-design-system]]) antes de crear nuevos.
- No inventes campos ni reglas que no esten en los docs: pregunta.

Relacionado: [[hairy-design-system]], [[hairy-agenda-rules]], [[project-hairy-voice-agent]], router en [[hairy-design-router]].
