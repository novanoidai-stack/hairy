# PROMPT SESIÓN 2: Portal Competitivo + Fidelización Avanzada

## CONTEXTO
Estás trabajando en Mecha, SaaS de gestión de peluquerías (Expo + Supabase). 
Esta sesión se enfoca en FEATURES COMPETITIVOS frente a Booksy/Fresha (widget, CAPTCHA, analytics) 
y FIDELIZACIÓN AVANZADA (gamificación visible).

## ESTADO DESDE SESIÓN 1
✅ Completado:
- migrations/comisiones-liquidaciones.sql (schema + RPCs)
- migrations/recompensas.sql (schema + RPCs)
- FidelizacionCard actualizado con persistencia

⏳ Pendiente de sesión 1 (UI):
- Pantalla Liquidaciones en informes.web.tsx
- Pantalla Recompensas en configuracion.web.tsx

**Nota:** Estos pendientes de UI se abordan también en esta sesión.

---

## ÁREA 1: PORTAL WIDGET (embebible) - PRIORIDAD ALTA

Estado: Portal funcional en /app/r/[slug]. NO hay widget para embeber en webs externas.

Requerimientos:
1. Crear modo embed: /app/r/[slug]?mode=embed
   - CSS embebible (sin header/footer, diseño compacto, altura dinámica)
   - postMessage API para comunicación con padre
   - Eventos: step_view, booking_completed, error, close

2. Crear SDK JS (web/embed-widget.js) con:
   - Inicialización: MechaWidget.init({ slug, container, onEvent, styles })
   - Métodos: open(), close(), setService(), setProfesional()
   - Styles personalizados: color, borderRadius, fontFamily
   - Auto-resize: ajustar altura del iframe según contenido

3. Página "Integración" en Configuración:
   - Snippet de código para copiar: <script src="https://mecha.app/widget.js" data-slug="tu-salon"></script>
   - Preview del widget en iframe
   - Documentación de eventos API y métodos
   - Opciones de personalización (color, bordes, fuente)

4. (Nice to have) Widget tiny/calendario:
   - Componente compacto con calendario mini
   - Al hacer click: expande modal o redirige

Archivos clave:
- app/r/[slug].web.tsx (modificar para modo embed)
- web/embed-widget.js (nuevo SDK)
- app/(tabs)/configuracion.web.tsx (sección integración)

---

## ÁREA 2: ANTI-ABUSO PORTAL (CAPTCHA) - PRIORIDAD ALTA

Estado: Solo rate limiting. Vulnerable a bots.

Requerimientos:
1. Integrar reCAPTCHA v3 invisible:
   - Añadir script de Google en portal
   - Token en cada crear_cita_publica / crear_resena_publica
   - Validar token en server (RPCs)

2. Modificar RPCs (en migrations o supabase/functions):
   - `crear_cita_publica`: añadir parámetro p_captcha_token
   - `crear_resena_publica`: añadir parámetro p_captcha_token
   - Validar token con Google API antes de insertar

3. UI en portal:
   - Carga automática de script (invisible)
   - Badge "Protegido por reCAPTCHA" (opcional)

4. Configuración:
   - Toggle "Requerir CAPTCHA" en config portal
   - Site key / Secret key en config

Archivos clave:
- app/r/[slug].web.tsx (cargar script, obtener token)
- migrations/portal-captcha.sql (actualizar RPCs)
- app/(tabs)/configuracion.web.tsx (toggle CAPTCHA)

---

## ÁREA 3: ANALYTICS PORTAL - PRIORIDAD MEDIA

Estado: Sin tracking de conversiones.

Requerimientos:
1. Integrar GA4 o Mixpanel:
   - Cargar script de analytics
   - Configurar tracking ID

2. Eventos a trackear:
   - portal_view (slug, referrer)
   - step_view (step, slug, servicio_id?)
   - booking_completed (cita_id, servicio, profesional, importe)
   - booking_abandoned (step, slug)
   - review_submitted (slug, puntuacion)

3. Pantalla "Analytics" en Configuración:
   - Métricas clave: visitas, conversiones, tasa abandono
   - Gráfico: conversiones por día/semana
   - Top servicios reservados
   - Top profesionales
   - Tasa conversión por paso del embudo

4. Export:
   - CSV de métricas
   - PDF reporte mensual

Archivos clave:
- lib/analytics.ts (nuevo - funciones de tracking)
- app/r/[slug].web.tsx (enviar eventos)
- app/(tabs)/configuracion.web.tsx (pantalla analytics)

---

## ÁREA 4: FIDELIZACIÓN AVANZADA - PRIORIDAD MEDIA

Estado: Sesión 1 implementó persistencia básica. Esta sesión añade gamificación visible.

Requerimientos:

1. **Niveles visibles en ficha cliente:**
   - Badge de nivel (Nuevo/Habitual/VIP) con color
   - Llamar a `obtener_nivel_cliente()` al cargar cliente
   - Mostrar en tarjeta de cliente (lista y detalle)

2. **Logros visibles:**
   - Sección "Logros" en ficha cliente
   - Grid de logros desbloqueados (iconos + nombre + fecha)
   - Llamar a `verificar_logros_cliente()` tras cada cita
   - Llamar a `obtener_logros_desbloqueados()` para listar

3. **Notificaciones:**
   - Toast al desbloquear logro
   - Modal al alcanzar nivel nuevo
   - (Nice to have) Email/WhatsApp via n8n (Alexandro)

4. **UI Recompensas en Configuración:**
   - Tab "Recompensas" pendiente de sesión 1
   - Crear/editar: nombre, tipo, valor, umbral, expiración
   - Lista de recompensas con toggle activo
   - Subsección "Niveles" (configurar niveles personalizados)
   - Subsección "Logros" (configurar logros)

Archivos clave:
- app/(tabs)/clientes.web.tsx (añadir nivel + logros)
- app/(tabs)/configuracion.web.tsx (tab recompensas)
- lib/fidelizacion.ts (nuevo - hooks y utilidades)

---

## ÁREA 5: LIQUIDACIONES (PENDIENTE SESIÓN 1) - PRIORIDAD MEDIA

Estado: Schema y RPCs listos. UI pendiente.

Requerimientos:
1. Sección "Liquidaciones" en informes.web.tsx:
   - Selector de mes/periodo
   - Lista de profesionales con:
     - Base del periodo
     - Porcentaje
     - Comisión calculada
     - Estado (pendiente/pagada)
   - Botón "Generar liquidación"
   - Botón "Marcar pagada"
   - Export CSV/PDF

2. Modal "Detalle de liquidación":
   - Desglose: servicios, addons, propinas, descuentos
   - Configuración aplicada (snapshot)

3. Integración con RPCs:
   - Usar `calcular_comisiones_periodo()` para previsualizar
   - Usar `generar_liquidacion()` para persistir
   - Usar `obtener_liquidaciones()` para listar

Archivos clave:
- app/(tabs)/informes.web.tsx (sección liquidaciones)

---

## ÁREA 6: INVENTARIO (SOLO SI HAY TIEMPO) - PRIORIDAD BAJA

Estado: NO existe schema ni UI.

Requerimientos mínimos (MVP):
1. migrations/inventario.sql:
   - Tabla `productos` (sku, nombre, precio, stock, stock_minimo)
   - Tabla `movimientos_inventario` (tipo, cantidad, motivo)
   - RLS por negocio_id

2. app/(tabs)/inventario.web.tsx:
   - Lista de productos con stock actual
   - Alertas de stock bajo (rojo si < stock_minimo)
   - Botón "Ajustar stock"
   - Botón "Añadir producto"

3. Integración con cobro:
   - Al crear cobro con línea tipo='producto', descontar stock
   - Validar: no permitir venta si stock < cantidad

Archivos clave:
- migrations/inventario.sql (nuevo)
- app/(tabs)/inventario.web.tsx (nueva)
- components/pos/CobroSheet.tsx (descontar stock)

---

## ORDEN DE PRIORIDAD

1. **CAPTCHA** (seguridad crítica) - 4h
2. **Widget embebible** (diferencial competitivo) - 1 día
3. **Analytics** (métricas para optimizar) - 4h
4. **Fidelización avanzada** (gamificación) - 1 día
5. **Liquidaciones** (pendiente sesión 1) - 4h
6. **Inventario** (solo si sobra tiempo) - 2 días

---

## ENTREGABLES

- web/embed-widget.js (SDK para embeber portal)
- Modo embed en app/r/[slug].web.tsx
- Integración CAPTCHA en portal + RPCs
- Sistema analytics con eventos
- Pantalla Analytics en configuración
- Niveles y logros visibles en ficha cliente
- Pantalla Recompensas en configuración
- Pantalla Liquidaciones en informes
- (Opcional) Pantalla Inventario básica
- Documentación: Guía de integración widget

---

## CONSTRAINTS

- Widget: Compatible con diferentes sites (CORS, postMessage)
- CAPTCHA: No romper UX (invisible v3)
- Analytics: GDPR compliant (consentimiento)
- Multi-tenant: TODO filtra por negocio_id
- RLS: Políticas en todas las tablas nuevas
- Móvil primero: useResponsive() en todas las pantallas nuevas

---

## NOTAS PARA ALEXANDRO (coordinación)

**Workflow n8n - Lista de espera:**
- Coordinar estado de aprobación plantillas Meta
- Si aprobadas: activar workflow
- Si NO: crear spec alternativa (email/SMS)

**Notificaciones fidelización:**
- Workflow n8n para notificar al completar umbral
- Workflow n8n para notificar logro desbloqueado

---

**Tiempo estimado:** 3-4 días
**Dependencias:** Ninguna bloqueante (todo se puede trabajar en paralelo)