# 🚀 Informe de Viabilidad y Arquitectura: IA Self-Service en Mecha

> **Nota para otros agentes/AIs:** Este documento es un **informe de análisis estratégico e informativo**. No representa una especificación obligatoria de tareas activas en el sprint actual, sino una guía de arquitectura y viabilidad para futuras fases de escalabilidad de Mecha.

---

## 1. El Paradigma Actual vs. El Objetivo Self-Service

### Diagnóstico del Cuello de Botella
Hoy en día, Mecha es un "SaaS híbrido". La agenda y gestión de clientes funcionan de forma autónoma (autoservicio), pero la **capa de inteligencia artificial** (agente telefónico de voz y bot de WhatsApp) es artesanal:
*   La compra de números de teléfono se realiza en la consola de Twilio/Telnyx de la agencia.
*   La configuración del bot de WhatsApp requiere acceso de administrador a la consola de Meta Developers.
*   Los workflows de n8n se copian, pegan y modifican manualmente para cada cliente.

Este modelo manual **impide la escalabilidad**. No podemos permitir que un cliente descargue la app, pague su suscripción y empiece a usar la IA al instante porque requiere que Carlos o Alexandro realicen tareas manuales de aprovisionamiento en segundo plano.

### El Objetivo de Mecha "Zero-Touch"
El objetivo es lograr que **el 100% de la infraestructura se autoconfigure en base a acciones del usuario**. Al realizar el pago de la suscripción, la app y la plataforma web de administración guían al usuario para que él mismo conecte sus cuentas e identidades, mientras que el backend de Mecha realiza las llamadas API pertinentes para aprovisionar los recursos de forma segura y automatizada.

---

## 2. Viabilidad Técnica por Componente

Para que la automatización sea viable, cada pilar técnico debe abordarse con un diseño de autoservicio específico:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND DE MECHA                              │
│                                                                         │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────┐  │
│  │   Meta APIs          │  │   Twilio / Telnyx    │  │  Retell API   │  │
│  │   (Embedded Signup)  │  │   (Regulatory/KYC)   │  │  (Agents)     │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └───────┬───────┘  │
└─────────────┼─────────────────────────┼──────────────────────┼──────────┘
              ▼                         ▼                      ▼
 ┌────────────────────────┐  ┌──────────────────────┐  ┌───────────────┐
 │   WhatsApp Autónomo    │  │  Telefonía Validada  │  │ Agente de Voz │
 │  (Webhook y Plantillas)│  │    (Número +34)      │  │ (Dinamizado)  │
 └────────────────────────┘  └──────────────────────┘  └───────────────┘
```

### A. Telefonía y Agente de Voz (Retell AI / ElevenLabs)
*   **Aprovisionamiento de agentes de voz:** **100% Viable mediante API.**
    Retell AI dispone de una API REST sólida. Cuando un salón se registra, el backend de Mecha puede hacer una llamada a `POST /create-agent` pasando el prompt base alimentado con los datos del salón (nombre, servicios, profesionales, horarios, dirección) que el usuario ya rellenó.
*   **Adquisición de números de teléfono (+34 España):** **Límite regulatorio infranqueable.**
    No es posible comprar de forma invisible un número de teléfono en España mediante API sin aportar pruebas de identidad. La CNMC exige que cada número esté asociado a un titular real (persona física o jurídica) con domicilio local verificado.
    *   *Solución Self-Service:* En lugar de hacerlo nosotros a mano, el backend debe exponer una interfaz en el panel de Ajustes de Mecha. El usuario debe rellenar su CIF/DNI y subir los PDF de su registro de empresa/autónomo. Nuestro backend utilizará las APIs de **Twilio Hosted Regulatory Bundles** para enviar esa documentación a Twilio de forma automática.
    *   *Tiempo de espera:* El proceso de aprobación de Twilio tarda de 24h a 72h. En cuanto el webhook de Twilio nos notifique que el "Bundle" está aprobado, el backend compra el número automáticamente y lo asocia al agente de Retell AI.

### B. WhatsApp Business (Meta Cloud API)
*   **Restricciones de Meta:** Meta no permite crear cuentas de WhatsApp en nombre de otros negocios usando llamadas a APIs de backend silenciosas. El negocio final debe aceptar los términos de uso y verificar su propiedad.
*   **La solución: WhatsApp Embedded Signup (Autoservicio):**
    Es el flujo estándar utilizado por plataformas como Shopify o Booksy.
    1.  Integramos el botón oficial de Meta en el panel de administración de Mecha.
    2.  Al pulsarlo, el cliente inicia sesión en su cuenta de Facebook Business en un popup nativo de Meta.
    3.  El cliente selecciona su negocio, ingresa el número que quiere usar para WhatsApp y lo verifica mediante un SMS u OTP de voz enviado por Meta.
    4.  Meta nos envía un webhook con el `WhatsApp Business Account ID` (WABA ID) y el token de acceso correspondiente.
    5.  A partir de ahí, nuestro backend toma el control de forma 100% automatizada para configurar los webhooks y subir las plantillas de confirmación.

### C. Integración con Terceros (Booksy / Fresha)
*   **El problema de la API cerrada:** Booksy y Fresha no tienen un ecosistema de APIs abiertas que permita a cualquier desarrollador de software conectar una IA externa de forma transparente y bidireccional (para leer y escribir citas).
*   **Alternativas de viabilidad:**
    1.  **Mecha como Agenda Principal (Recomendado):** La IA solo funciona en tiempo real si Mecha es el software gestor de la agenda. Esto es lo más robusto y lo que ya está en desarrollo en el repositorio.
    2.  **Integraciones de Calendarios Abiertos:** Sincronizar mediante APIs estándar (Google Calendar, Outlook) si el software de terceros permite exportación/importación ICS, aunque esto suele perder el detalle de la ficha técnica de tinte/fase de reposo.

### D. La Arquitectura de n8n: Evitando el "Infierno del Copiar-Pegar"
*   **Diseño incorrecto:** Crear o duplicar un workflow de n8n por cada cliente registrado. Si tenemos 500 clientes, tendremos 500 workflows. Si hay un bug o queremos añadir una funcionalidad (como detectar si un cliente es VIP), tendríamos que reprogramar los 500 workflows vía API.
*   **Diseño correcto: Enrutamiento Dinámico Multi-Tenant.**
    Debemos tener **un único workflow de n8n maestro** para las llamadas de voz (conectado al webhook de Retell AI) y **un único workflow maestro** para WhatsApp.
    1.  Cuando entra un evento a n8n, el workflow recibe el número de teléfono emisor (el cliente) y el número receptor (el salón).
    2.  n8n hace una consulta rápida HTTP a la base de datos de Mecha preguntando: *"¿A qué negocio pertenece el número receptor y cuáles son sus parámetros?"*
    3.  El backend de Mecha responde con un JSON que contiene: el prompt de la IA, la lista de servicios activos en la base de datos de Mecha, los horarios del salón y el slug del negocio.
    4.  El workflow de n8n ejecuta la llamada a Retell/ElevenLabs o envía el mensaje de WhatsApp usando esos parámetros en caliente.
    *   *Resultado:* Cero aprovisionamiento de workflows para nuevos salones. Todo el comportamiento de la IA está condicionado por los datos en nuestra base de datos.

---

## 3. Seguridad, Fraude y Viabilidad Financiera (Unit Economics)

La IA conversacional por voz tiene costes variables significativos. Permitir un onboarding inmediato y gratuito sin restricciones es una invitación abierta a la ruina financiera debido a bots de spam o ataques de denegación de servicio (DoS) telefónicos.

### Coste Variable Estimado de una Conversación de Voz (5 minutos)
*   **Transcripción y LLM (GPT-4o/Claude):** ~0.08$ - 0.15$
*   **Síntesis de voz (ElevenLabs de alta calidad):** ~0.30$ - 0.50$ (según caracteres)
*   **Telefonía (Twilio trunking + número mensual):** ~0.05$ - 0.10$
*   **Capa intermedia (Retell AI por minuto):** ~0.10$
*   **Coste total para Mecha por cada llamada de 5 minutos:** **~0.53$ - 0.85$**

### Estrategia de Mitigación Financiera e Innegociables
1.  **Tarjeta obligatoria previa a la IA:** Ningún cliente puede activar su número de teléfono o bot de WhatsApp sin haber contratado y pagado la suscripción a través de Stripe (o haber introducido una tarjeta de crédito válida con verificación 3D Secure).
2.  **Límite de minutos por suscripción:** Los planes de suscripción no deben ser "IA ilimitada". Deben incluir una bolsa de minutos/créditos de IA (ejemplo: Plan Básico incluye 100 minutos de IA de voz al mes). Si el salón consume sus minutos, las llamadas entrantes se desvían al buzón de voz o se le cobra un coste por minuto adicional directamente de su cuenta Stripe.
3.  **Límites de llamadas por origen (Anti-DoS):** La base de datos debe almacenar las IPs y números de teléfono entrantes. Si un número de teléfono llama 5 veces seguidas en un lapso de 10 minutos, el sistema debe bloquear ese número temporalmente para evitar que consuma el saldo de IA del salón de forma maliciosa.

---

## 4. Estrategia de Lanzamiento en las App Stores

Apple (App Store Review Guidelines 3.1.1) y Google obligan a pasar por sus pasarelas de pago internas (IAP), cobrando un 15%-30% de comisión, por cualquier servicio digital que se contrate dentro de la app móvil.

*   **Estrategia Ganadora (SaaS "Lector"):**
    La app que se sube a la App Store y Google Play debe publicarse como una herramienta de gestión interna de salones (un visualizador y organizador de agenda). 
    *   La app móvil **no debe incluir botones de compra, tarifas ni suscripciones de IA**.
    *   En su lugar, al iniciar sesión, se le indica que es una cuenta de Mecha.
    *   El registro de la cuenta, la introducción de la tarjeta bancaria en Stripe y la configuración de la IA (carga de documentos, Embedded Signup) se realizan **exclusivamente a través del panel de administración web** de Mecha en un navegador.
    *   Esta estructura nos libra del 30% de comisión de Apple y simplifica el proceso de aprobación en las tiendas.

---

## 5. Hoja de Ruta de Desarrollo para la Automatización (Alexandro + Carlos)

Para hacer realidad este flujo de autoservicio sin intervención manual, se proponen las siguientes etapas de desarrollo:

### Fase 1: Migración a Base de Datos Dinámica
*   Sustituir las variables hardcodeadas en los scripts y funciones por columnas en la tabla `negocios` (p. ej., `twilio_number`, `retell_agent_id`, `openai_custom_prompt`).
*   Reescribir el workflow maestro de n8n para que consuma de forma dinámica los datos de la base de datos de Mecha en cada ejecución mediante peticiones HTTP.

### Fase 2: Integración de Stripe Webhook
*   Conectar el registro de usuario al checkout de Stripe.
*   Crear el webhook de Stripe para actualizar la columna `plan_activo` y `staff_grant_full_access` de forma inmediata cuando el pago sea exitoso.

### Fase 3: Portal del Cliente para Carga de Bundles (Twilio API)
*   Desarrollar en la sección de Ajustes web el formulario para subir DNI/CIF y dirección de facturación.
*   Conectar este formulario a la API de Twilio para enviar los "Regulatory Bundles" automáticamente a validación.

### Fase 4: Implementación de Meta Embedded Signup
*   Registrar la aplicación de Mecha en Meta for Developers como un BSP (Business Solution Provider).
*   Integrar el botón de login de Meta en la interfaz de configuración web del salón para automatizar la obtención de las WABA IDs del cliente.

---

## Conclusión
La transición de Mecha a un modelo **Self-Service** es perfectamente viable y representa el verdadero factor diferencial y escalable del producto. La intervención manual actual se puede reducir a cero si el diseño del software expone y automatiza las conexiones de API directamente al usuario final (autoservicio guiado), protegiendo siempre las finanzas de Mecha mediante pasarelas de pago previas y límites estrictos de consumo.
