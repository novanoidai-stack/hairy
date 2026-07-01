# CHECKLIST — Activación de Lista de Espera (Matching Automático)

> **Versión:** 1.0  
> **Fecha:** 2026-07-01  
> **Ámbito:** Lista de espera con matching automático + oferta de huecos por WhatsApp  
> **Estado:** Pendiente de aprobación de plantillas Meta

---

## 1. VERIFICACIÓN DE DEPENDENCIAS

### 1.1 Infraestructura de datos (Supabase)
- [ ] Migración `lista-espera.sql` aplicada en producción
- [ ] Migración `lista-espera-manual.sql` aplicada en producción
- [ ] Migración `lista-espera-matching.sql` aplicada en producción (vtrggiogjrhqtwbhbgia)
- [ ] Tabla `lista_espera` creada y con políticas RLS activas
- [ ] Tabla `lista_espera_ofertas` creada
- [ ] Tabla `lista_espera_avisos` creada (outbox de WhatsApp)
- [ ] Flags en `citas` añadidos: `es_oferta_espera`, `lista_espera_revisada`
- [ ] Funciones del motor (`procesar_lista_espera`) restringidas a `service_role`
- [ ] Función `confirmar_cita_oferta` accesible para `anon` (portal público)

### 1.2 Plantillas Meta (WhatsApp Business API)
- [ ] Plantilla `aviso_lista_espera` enviada a revisión de Meta
- [ ] Plantilla `aviso_lista_espera` **APROBADA** por Meta
  - Contenido: nombre, servicio, fecha, hora, ventana de respuesta, botón con URL dinámica `/app/cita/{cita_id}`
- [ ] Plantilla `aviso_hueco_caducado` enviada a revisión de Meta
- [ ] Plantilla `aviso_hueco_caducado` **APROBADA** por Meta (opcional)
  - Contenido: mensaje de "el hueco ya está reservado por otra persona"

### 1.3 Workflow n8n
- [ ] Workflow "Mecha — Lista de espera" creado en n8n
- [ ] Schedule configurado (cada 2 min)
- [ ] Conexión a Supabase configurada (service_role)
- [ ] Llamada a `procesar_lista_espera()` en cada tick
- [ ] Drenado de `lista_espera_avisos_pendientes()` implementado
- [ ] Envío de WhatsApp configurado (proveedor, número)
- [ ] Llamada a `marcar_lista_espera_aviso_enviado()` tras envío exitoso
- [ ] Workflow **INACTIVO** hasta que se aprueben las plantillas

---

## 2. CONFIGURACIÓN DEL SALÓN

### 2.1 Acceso a configuración
- [ ] Ir a **Ajustes** > **Notificaciones** (pestaña dentro de Configuración)
- [ ] Verificar que la sub-sección "Lista de espera (avisos de hueco)" es visible

### 2.2 Activación del matching automático
- [ ] **Toggle maestro:** `Ofrecer huecos automaticamente` → `ON` (`listaEsperaMatchingActivo = true`)
- [ ] Configurar **Ventana de respuesta** (`listaEsperaVentanaMin`)
  - Default: 30 min
  - Rango recomendado: 5-180 min
- [ ] Configurar **Tiempo máximo de reserva del hueco** (`listaEsperaMaxBloqueoHoras`)
  - Default: 2 horas
  - Rango recomendado: 1-48 horas
- [ ] Configurar **El tope cuenta desde** (`listaEsperaDesbloqueoDesde`)
  - Default: `primer_aviso`
  - Alternativa: `ultimo_aviso` (reinicia con cada candidato)
- [ ] Configurar **Antelación mínima del hueco** (`listaEsperaAntelacionMinHoras`)
  - Default: 4 horas
  - Rango recomendado: 0-72 horas (0 = ofrecer todo)
- [ ] Configurar **La oferta pide señal** (`listaEsperaOfertaPideSenal`)
  - Default: `false`
  - Si `true`, exige señal solo si el servicio la tiene configurada
- [ ] Configurar **Avisar si el hueco caduca** (`listaEsperaAvisarCaducado`)
  - Default: `false`
  - Si `true`, envía `aviso_hueco_caducado` a los no seleccionados

### 2.3 Guardado de configuración
- [ ] Pulsar **Guardar** (botón flotante o acción en Ajustes)
- [ ] Verificar que `negocio_config.config` se actualizó en Supabase

---

## 3. PRUEBAS (PRE-PRODUCCIÓN)

### 3.1 Creación de solicitudes en lista de espera
- [ ] Ir a **Clientes** > **Lista de espera**
- [ ] Crear 2-3 solicitudes de prueba con distintos parámetros:
  - [ ] Solicitud 1: servicio específico, profesional cualquiera, franja "mañana"
  - [ ] Solicitud 2: servicio cualquiera, profesional específico, franja "cualquiera"
  - [ ] Solicitud 3: fechas concretas (desde/hasta)
- [ ] Verificar que aparecen en la tabla `lista_espera` con estado `esperando`

### 3.2 Simulación de cancelación y matching
- [ ] En la **Agenda**, crear una cita futura con los mismos parámetros que una solicitud
- [ ] Cancelar la cita (simulando que un cliente no acude)
- [ ] Esperar 2-3 minutos (o ejecutar manualmente `procesar_lista_espera()` vía SQL)
- [ ] Verificar que:
  - [ ] Se crea un registro en `lista_espera_ofertas` (estado `activa`)
  - [ ] Se crea una cita `pendiente` con `es_oferta_espera = true`
  - [ ] El candidato pasa a estado `avisado` en `lista_espera`
  - [ ] Se encola un aviso en `lista_espera_avisos` (template `aviso_lista_espera`)

### 3.3 Prueba del workflow n8n (solo con plantillas aprobadas)
- [ ] Activar el workflow "Mecha — Lista de espera"
- [ ] Esperar a que se ejecute el schedule
- [ ] Verificar log de ejecución en n8n (panel de ejecuciones)
- [ ] Comprobar que el aviso se marcó como `enviado` en `lista_espera_avisos`
- [ ] Verificar que el teléfono recibió el WhatsApp de prueba

### 3.4 Aceptación de la oferta (portal público)
- [ ] Usar el enlace recibido en WhatsApp: `/app/cita/{cita_id}`
- [ ] Verificar que la página muestra "Confirmar esta cita" (es oferta)
- [ ] Introducir el teléfono del candidato
- [ ] Pulsar **Confirmar**
- [ ] Si `listaEsperaOfertaPideSenal = true`:
  - [ ] Redirigir a `/app/pago/{ref}`
  - [ ] Completar pago de señal
- [ ] Verificar que:
  - [ ] La cita pasa a estado `confirmada`
  - [ ] La oferta pasa a estado `resuelta`
  - [ ] El candidato pasa a estado `resuelta` en `lista_espera`

### 3.5 Prueba de expiración y avance al siguiente
- [ ] Crear múltiples candidatos compatibles con un hueco
- [ ] Cancelar una cita y dejar expirar la ventana (esperar X minutos)
- [ ] Ejecutar `procesar_lista_espera()` manualmente o esperar al cron
- [ ] Verificar que:
  - [ ] El primer candidato pasa a `esperando` (su cita tentativa se cancela)
  - [ ] La oferta avanza al siguiente candidato
  - [ ] Se encola un nuevo aviso para el segundo candidato
  - [ ] `avisados` contiene los IDs de ambos candidatos

### 3.6 Prueba de aviso de hueco caducado
- [ ] Configurar `listaEsperaAvisarCaducado = true`
- [ ] Repetir flujo con 2+ candidatos
- [ ] Confirmar la oferta del primer candidato
- [ ] Verificar que:
  - [ ] La oferta pasa a `resuelta`
  - [ ] Se encola `aviso_hueco_caducado` para los demás `avisados`
  - [ ] El workflow envía el aviso a los no seleccionados

---

## 4. MONITOREO Y OPERACIONES

### 4.1 Tablero de seguimiento (en Ajustes)
- [ ] Ir a **Ajustes** > **Lista de espera** (o sección equivalente)
- [ ] Ver número de solicitudes `esperando`
- [ ] Ver número de ofertas `activas`
- [ ] Ver historial de avisos enviados

### 4.2 Logs y debugging
- [ ] Revisar log del workflow n8n tras cada ejecución
- [ ] Consultar tabla `lista_espera_avisos`:
  ```sql
  SELECT * FROM lista_espera_avisos WHERE negocio_id = 'XXX' ORDER BY created_at DESC LIMIT 20;
  ```
- [ ] Consultar tabla `lista_espera_ofertas`:
  ```sql
  SELECT * FROM lista_espera_ofertas WHERE negocio_id = 'XXX' AND estado = 'activa';
  ```
- [ ] Verificar que no hay avisos `pendiente` antiguos (possible fallo de envío)

### 4.3 Alertas y problemas comunes
- [ ] Si hay muchas ofertas `activas` con `expira_at < now()`:
  - [ ] El workflow no está ejecutándose o falla
- [ ] Si hay muchos avisos `pendiente` sin marcar como `enviado`:
  - [ ] Verificar conexión WhatsApp o límites de tasa de Meta
- [ ] Si los candidatos no reciben mensajes:
  - [ ] Comprobar que los números tienen formato correcto (+34...)
  - [ ] Verificar que el negocio tiene el WhatsApp Business configurado

---

## 5. PLAN B — SI LAS PLANTILLAS NO ESTÁN APROBADAS

### 5.1 Alternativa via email (RPC existente)
- [ ] Usar la función `send_email` (o RPC equivalente) del sistema
- [ ] Adaptar `lista_espera_avisos` para soportar canal `email`
- [ ] Modificar el workflow n8n para enviar por email en lugar de WhatsApp
- [ ] Plantilla de email:
  - Asunto: "¡Tenemos un hueco para ti!"
  - Cuerpo: datos del hueco + enlace para confirmar

### 5.2 Alternativa via SMS
- [ ] Integrar proveedor SMS (ej: Twilio, MessageBird)
- [ ] Crear función `send_sms_lista_espera` en Supabase
- [ ] Modificar el workflow para usar SMS en lugar de WhatsApp
- [ ] Coste estimado: ~0.05-0.10€ por SMS

### 5.3 Notificación in-app (sin mensajería externa)
- [ ] Añadir badge "Tienes ofertas pendientes" en el panel del negocio
- [ ] Crear vista de "Ofertas de lista de espera" en Ajustes
- [ ] Mostrar lista de candidatos `avisado` con acción "Llamar manualmente"
- [ ] El equipo llama por teléfono y confirma manualmente

### 5.4 Operativa manual mientras tanto
- [ ] Dejar `listaEsperaMatchingActivo = false`
- [ ] Usar la lista de espera como referencia manual
- [ ] El equipo revisa la lista al cancelar citas
- [ ] Llama a los candidatos por teléfono o WhatsApp normal

---

## 6. CHECKLIST FINAL ANTES DE IR A PRODUCCIÓN

### 6.1 Confirmación técnica
- [ ] Todas las migraciones aplicadas en producción
- [ ] Plantillas Meta aprobadas (captura de pantalla guardada)
- [ ] Workflow n8n probado en entorno de staging/demo
- [ ] Funciones RPC validadas con llamadas directas
- [ ] Política RLS de `lista_espera` verificada (solo mismo negocio)

### 6.2 Confirmación de negocio
- [ ] Dueño del salón informado de la funcionalidad
- [ ] Configuración por defecto explicada y aceptada
- [ ] Equipo formado en cómo gestionar ofertas activas
- [ ] Protocolo de "qué hacer si algo falla" documentado

### 6.3 Go-live
- [ ] Activar workflow n8n en producción
- [ ] Verificar primera ejecución con éxito
- [ ] Monitorear durante 24h (ver log y avisos enviados)
- [ ] Ajustar configuración si es necesario (ventanas, bloqueos)

---

## 7. REFERENCIAS

- **Spec del diseño:** `docs/superpowers/specs/2026-06-21-lista-espera-matching-design.md`
- **Migración principal:** `migrations/lista-espera-matching.sql`
- **UI de configuración:** `app/(tabs)/configuracion.web.tsx` → `TabNotificaciones`
- **Workflow n8n:** "Mecha — Lista de espera" (ID por confirmar en n8n)
- **Funciones clave:**
  - `procesar_lista_espera()`
  - `lista_espera_avisos_pendientes()`
  - `marcar_lista_espera_aviso_enviado()`
  - `confirmar_cita_oferta(p_cita_id, p_telefono)`

---

**Nota importante:** Esta funcionalidad nace **OFF por defecto** en todos los salones. No afecta a ningún cliente hasta que el negocio activa explícitamente el toggle en Configuración y las plantillas Meta están aprobadas.
