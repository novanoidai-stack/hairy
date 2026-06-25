# 💳 ESTRATEGIA DE PAGOS Y POS: EL CAMINO HACIA LA SUPERIORIDAD EN EL MERCADO

> **Fecha:** 25 de junio de 2026  
> **Preparado por:** Antigravity (AI Coding & Product Partner)  
> **Destinatarios:** Carlos, Alexandro y José (Product Owner)  
> **Propósito:** Definir la hoja de ruta técnica y comercial para construir un sistema de pagos en Mecha que no solo iguale, sino que supere la propuesta de valor de gigantes consolidados como Booksy y Fresha.

---

## 1. El Diagnóstico del Mercado: Las Vulnerabilidades de Booksy y Fresha

Para vencer a los líderes, primero debemos entender dónde hacen daño a los salones y dónde son vulnerables:

1.  **Monopolio de Tasas (El Dolor del Salón):**
    *   *Fresha* es "gratuito", pero te obliga a procesar todos tus cobros a través de su pasarela de pagos, cobrando comisiones abusivas (~2.29% + 0.20€ por transacción).
    *   *Booksy* cobra suscripción y además comisiones por procesamiento similares.
    *   *La Realidad:* En España, un salón mediano/grande (como L'Acanze) factura de 20.000€ a 50.000€ al mes. Pagar un 2.5% de comisión significa perder entre **500€ y 1.250€ mensuales** solo en pasarela. Los bancos tradicionales españoles ofrecen TPVs físicos con tasas locales de entre **0.3% y 0.6%**. Booksy/Fresha son carísimos para salones de volumen.
2.  **Hardware Propietario Costoso:** Obligan a comprar sus datáfonos físicos (~149€) que a menudo fallan, requieren actualizaciones de firmware y atan al salón a su ecosistema cerrado.
3.  **Rigidez en Políticas de Reserva (Fricción vs. Seguridad):** Obligan al salón a elegir entre: pedir el 100% de la reserva (ahuyenta a clientes nuevos) o no pedir nada (riesgo de no-shows). No hay término medio inteligente.

---

## 2. La Propuesta de Superioridad de Mecha: Los 4 Pilares de Valor Absoluto

Para posicionar a Mecha por encima de la competencia en el ecosistema de pagos, debemos implementar la siguiente estrategia:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SISTEMA DE PAGOS MECHA                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
 ┌─────────────────────────┐ ┌─────────────────────────┐ ┌───────────────────┐
 │   1. MODELO DE TASAS    │ │  2. DATÁFONO VIRTUAL    │ │ 3. DEPOSITOS      │
 │        HÍBRIDO          │ │   (TAP-TO-PAY / QR)     │ │    DINÁMICOS      │
 └───────────┬─────────────┘ └───────────┬─────────────┘ └─────────┬─────────┘
             │                           │                         │
             ▼                           ▼                         ▼
   • Mecha Pay (Stripe)        • NFC móvil (Stripe SDK)  • Hold vs. Cobro real
   • BYOP (Trae tu propio      • QR dinámico en tablet   • Fianza según riesgo
     TPV/Redsýs por +19€/mes)  • Apple/Google/Bizum      • VIPs exentos (0%)
```

### Pilar 1: Modelo de Tasas Híbrido y Abierto ("Bring Your Own Processor" - BYOP)
*   **Cómo funciona:** En lugar de forzar a todos los salones a usar nuestra pasarela, ofrecemos dos caminos:
    1.  **Mecha Pay (Por defecto - Stripe):** Ideal para salones pequeños. Rápido, integrado, con una comisión estándar competitiva (ej. 1.9% + 0.10€).
    2.  **Bring Your Own TPV (BYOP - Licencia Premium):** Si el salón es grande y tiene tarifas bajas con su banco (ej. 0.4% con BBVA o Santander), le permitimos conectar su propia pasarela virtual (Redsýs / Bizum) a Mecha. Cobramos una **cuota fija mensual (ej. +19€ o +29€/mes)** por este conector.
*   **Por qué nos hace superiores:** El salón calcula el ahorro: *“Si pago 29€ al mes a Mecha por usar mi propio banco, me ahorro 800€ de comisiones de Fresha”*. Es una decisión financiera obvia para salones de alto volumen.

### Pilar 2: El Datáfono Virtual (Sin Hardware Propietario)
*   **Cómo funciona:** Eliminamos la necesidad de comprar datáfonos físicos dedicados.
    1.  **Tap to Pay en el móvil:** Integramos la SDK de Stripe Terminal en la app móvil. Cualquier estilista del salón puede usar su propio smartphone como datáfono. El cliente simplemente acerca su tarjeta física o Apple/Google Pay al teléfono del estilista para pagar.
    2.  **QR Dinámico de Pago en Mostrador:** Al marcar la cita como cobrada, la pantalla del mostrador muestra un QR único. El cliente lo escanea con su móvil y paga al instante con Bizum, Apple Pay o Google Pay. Sin contacto físico, higiénico y en menos de 5 segundos.

### Pilar 3: Depósitos Inteligentes por Perfil de Riesgo (CRM + AI)
*   **Cómo funciona:** Fresha/Booksy son estáticos (piden prepago a todos). Mecha utilizará el **perfil de riesgo** del CRM (que Carlos ya ha dejado modelado en Supabase) para aplicar reglas dinámicas al reservar:
    1.  **Holds en lugar de Cobros (Pre-autorizaciones):** Para no molestar al cliente cobrándole antes de ir, Stripe retiene el dinero temporalmente (*Hold*). Si asiste, se libera o se usa para el cobro final. Si no asiste, se ejecuta la penalización.
    2.  **Tarifa de Fianza Dinámica por Cliente:**
        *   *Cliente VIP/Habitual (Confianza 100%):* 0% de depósito. Reservas en 1 clic sin meter tarjeta.
        *   *Cliente Nuevo:* Se le pide un 20% de depósito o pre-autorización de tarjeta.
        *   *Cliente con Historial de No-Show / Cancelación Tardía:* Se le exige un 50% o 100% de depósito para poder reservar.
*   **Por qué nos hace superiores:** Protege al salón del 95% de los no-shows sin ahuyentar a sus clientes fieles con fricción de pago innecesaria.

### Pilar 4: Automatización Financiera E2E (POS-3 Fiscal y Propinas)
*   **Cómo funciona:** Conectar la operativa del salón con la contabilidad del negocio en un clic.
    1.  **Propinas Gamificadas e Inteligentes:** Al pagar a través del QR dinámico en su móvil, se le sugiere al cliente una propina para el estilista que le atendió. El sistema calcula y asigna esa propina directamente a la cuenta del profesional en "Mi Jornada" para su nómina.
    2.  **Pago Familiar / Grupal Dividido:** Permitir que una persona pague la cuenta de varios miembros de la familia (Modular 5) de forma nativa en la UI, pudiendo dividir el pago (ej. 30€ en efectivo y 45€ con tarjeta).
    3.  **Fiscalidad VeriFactu (España):** Diseñar el backend para que cada cobro genere un hash inmutable y correlativo, cumpliendo la normativa fiscal al 100%. Generación de facturas simplificadas automáticas exportables para el gestor del salón.

---

## 🛠️ 3. Qué hace falta Técnicamente para Implementarlo (Ruta de Desarrollo)

Para que Carlos (UI) y Alexandro (Backend/Pagos) lo construyan sin bloqueos, esta es la arquitectura de desarrollo recomendada:

### Fase 1: El Enlace de Pago y Webhook Stripe (Inmediato - Desbloquea MVP)
*   **Modelo de Datos:** Crear la tabla `cita_pago_enlaces` con tokens opacos e inadivinables en Supabase (evitando que el cliente final vea su `cita_id` o datos de otros clientes en la URL de pago).
*   **Flujo del Webhook:**
    1.  El webhook de Stripe recibe `checkout.session.completed` de la señal.
    2.  Actualiza `citas.deposito_pagado = true` and `citas.estado = 'confirmada'`.
    3.  Envía confirmación automática de cita por WhatsApp (n8n).
*   **Idempotencia obligatoria:** Usar la columna `cobros.idempotency_key` en cada inserción para evitar cobros dobles si el webhook se dispara dos veces.

### Fase 2: Bizum Directo y Conector Redsýs (Diferenciador en España)
*   **Integración de Redsýs API:** Programar las llamadas al gateway de Redsýs para procesar pagos con tarjeta y Bizum.
*   **Flujo de Conciliación:** Integrar la respuesta del webhook de Redsýs de la misma forma que Stripe para actualizar el estado de las citas en Supabase.

### Fase 3: Integración de SDK Stripe Terminal (Datáfono Virtual)
*   **Desarrollo en React Native / Expo:** Integrar la librería `@stripe/stripe-terminal-react-native`.
*   **Configuración del Dispositivo:** Programar el flujo de conexión Bluetooth / red local para datáfonos físicos (si el salón los quiere) y habilitar **Tap to Pay** usando el chip NFC del smartphone.

---

## 🎯 4. Conclusión: El Pitch de Ventas Ganador para José

Con este sistema de pagos, Mecha no compite en "quién tiene más usuarios en su app", compite en **"quién cuida mejor el dinero de tu salón"**. El argumento para salones premium como **L'Acanze** es demoledor:

> *"Booksy y Fresha te cobran un 2.5% de cada tarjeta por obligarte a usar su datáfono, lo que te cuesta más de 1.000€ al mes. Con Mecha, puedes usar los TPVs de tu propio banco (BBVA/Santander) con tu tasa del 0.4% pagándonos solo una cuota fija de 29€. Además, protegemos tu agenda exigiendo fianza con tarjeta solo a clientes nuevos o con riesgo de no-show, mientras que tus clientas VIP de toda la vida reservan al instante sin fricciones. Y al final del día, tu equipo ve su propina y comisión real en su panel móvil al instante".*
