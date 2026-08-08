# 🎬 PACK DE INFORMACIÓN & ASSETS PARA MOTION DESIGN — MECHA (2026)

Este paquete contiene la información estratégica, propuesta técnica, métricas clave, paleta cromática y todas las **capturas recortadas e aisladas** listas para componer y animar un vídeo comercial o animación publicitaria (Motion Graphics) de **Mecha**.

---

## 📍 UBICACIÓN DE LA CARPETA Y ASSETS

- **Ruta local completa:** `c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\motion_design_pack`
- **Carpeta de capturas recortadas:** `c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\motion_design_pack\capturas_recortadas`

---

## ⚡ 1. QUÉ HACE MECHA EN UNA FRASE (Definición del producto)

> **"Mecha es la plataforma SaaS de gestión inteligente para peluquerías y barberías que sustituye la agenda en papel y las llamadas continuas por un sistema verticalizado (con control de tintes en fases activa/reposo y fichas de color) junto a agentes de IA autónomos (WhatsApp y Voz) que atienden a los clientes, gestionan citas 24/7 y eliminan los plantones sin esfuerzo."**

---

## 🎯 2. A QUIÉN SE LO VENDES (Público Objetivo & Buyer Persona)

- **Tipo de empresa:** Peluquerías, barberías, salones de estilismo y estética (negocios locales independientes o cadenas medianas).
- **Rol que firma / decide la compra:** Propietario/a del salón, director/a de peluquería o gestor/a del negocio.
- **Puntos de dolor principales:**
  1. Suenan el teléfono y el WhatsApp mientras están tintando o cortando el pelo (manos ocupadas con guantes).
  2. Plantones y "No-Shows" (clientes que reservan y no aparecen, perdiendo horas de trabajo).
  3. Descontrol en los tiempos de tinte/coloración y caos en las fichas técnicas de clientas habituales.
  4. Software tradicional genérico (tipo Booksy/Fresha) con comisiones altas, sin voz IA real y con datáfonos caros obligatorios.

---

## 🚀 3. 3-4 CAPACIDADES CLAVE DEL PRODUCTO (Core Features)

1. **Agenda Verticalizada de Peluquería (Fases Activa / Reposo & Cascada de Retrasos):**
   - Gestión nativa de tiempos de exposición de tinte para aprovechar sillones en los reposos de color.
   - Calculador de "efecto dominó" ante retrasos del salón que reordena citas y avisa por WhatsApp automáticamente a las siguientes clientas.

2. **Agente IA Autónomo en WhatsApp & Voz 24/7 (n8n + Retell AI + OpenRouter):**
   - Recepcionista virtual con voz humana y chat de WhatsApp que atiende clientes a cualquier hora, responde dudas sobre servicios y precios, y agenda o modifica citas solo.

3. **Ficha Técnica de Color & Dictado Manos Libres:**
   - Registro minucioso del historial químico de la clienta (fórmulas de color, 40g 7.1 a 20 volúmenes, tiempos de exposición y sensabilidades del cuero cabelludo) dictadas por voz sin quitarse los guantes.

4. **Portal de Reserva Público en 1 Clic + Señal por Stripe / QR (Sin No-Shows):**
   - Web ultra-rápida sin descarga de apps donde la clienta reserva en segundos y abona una señal/depósito que frena el 80%+ de los plantones.

---

## 🥊 4. CONTRA QUIÉN COMPITES Y POR QUÉ ELEGEN A MECHA

- **Competidores directos:** Booksy, Fresha, Vagaro, GlossGenius.
- **Por qué eligen a Mecha:**
  - **1. Especialización Vertical Real:** Booksy y Fresha son agendas genéricas. Mecha entiende el flujo químico de peluquería (fases activa/espera de color, dictado de fórmulas y tintes).
  - **2. Agentes IA Autónomos Reales (Voz + WhatsApp):** En lugar de un formulario estático, Mecha incluye una recepcionista IA que habla por teléfono y responde por WhatsApp 24/7.
  - **3. Sin Peajes Obligatorios de Pasarela ni Hardware Proprietary:** Sin obligar a comprar datáfonos de >149€ ni comisiones opacas.

---

## 📊 5. MÉTRICA DE VALOR (Impacto Cuantitativo)

- ⏱️ **+15 Horas libres a la semana** en atención de llamadas, llamadas perdidas y gestión manual de la agenda.
- 🚫 **>80% de Reducción en Plantones / No-Shows** mediante depósitos automatizados por Stripe y avisos inteligentes por WhatsApp.
- 📈 **+15% a +25% de Incremento en Ocupación de Sillón** aprovechando huecos en reposos de tinte y lista de espera proactiva.

---

## 🎨 6. GUÍA DE ESTILO & TOKENS VISUALES (Motion Guidelines)

- **Color Primario "Fuego":** `#F4501E` (Naranja fuego de alto impacto)
- **Color Fuego Profundo:** `#C0260A`
- **Fondo Oscuro Premium:** `#070A14` / `#0B1020`
- **Fondo Claro Crema:** `#F6F1EA` / `#FFFDFB`
- **Texto Principal:** `#FFFFFF` (Modo Oscuro) / `#1E293B` (Modo Claro)
- **Tipografía Display:** `Bricolage Grotesque` & `Space Grotesk`
- **Tipografía Cuerpo:** `Inter`

---

## 🖼️ 7. INVENTARIO DE CAPTURAS RECORTADAS Y CÓMO ANIMARLAS

En la carpeta `capturas_recortadas/` dispones de los siguientes archivos recortados en resolución 2K:

| Archivo | Elemento | Instrucción de Animación en Motion Design |
|---------|----------|------------------------------------------|
| `01_agenda_semanal_completa.png` | Vista general de la Agenda Semanal | Animación de entrada con Zoom in / Pan desde la mañana a la tarde. |
| `02_cita_desplegada_modal.png` | La cita por dentro (Modal desplegado) | Popup en escala (overshoot 1.05 -> 1.0) al hacer click sobre una cita. |
| `03_sidebar_navegacion_mecha.png` | Barra lateral con el logo Mecha | Slide desde la izquierda (X: -100px -> 0px) al cambiar de sección. |
| `04_topbar_agenda_controles.png` | Cabecera con selector de fecha y nuevo | Fade in + Y translate (-20px -> 0px). |
| `05_ficha_cliente_detalles.png` | Ficha técnica de clienta VIP & Perfil de Riesgo | Revelación de tarjeta con blur (blur 10px -> 0px) destacando el badge VIP. |
| `06_ficha_tecnica_tinte_formula.png` | Ficha de color recortada (Fórmula tinte) | Efecto de texto tippear o resplandor en los gramos y tiempos de exposición. |
| `07_modulo_lista_espera.png` | Módulo de Lista de Espera Inteligente | Deslizamiento vertical simulando la entrada de una clienta en espera. |
| `08_portal_reserva_mobile_hero.png` | Portal público cliente en smartphone | Presentación dentro de mockup 3D de móvil con rotación sutil. |
| `09_dashboard_kpis_resumen.png` | Widgets de Ingresos, Ocupación y Citas | Animación de contadores numéricos de 0 a 100% / € y gráfico ascendente. |
| `10_modulo_resenas_fidelidad.png` | Reseñas 5 estrellas y WhatsApp automatizado | Aparición de las 5 estrellas una a una con sonido 'pop' suave. |
| `11_cascada_retrasos_domino.png` | Card de retardo en cadena | Animación de temblor suave o alerta naranja intermitente ("Retraso +15 min"). |
| `12_portal_reserva_desktop.png` | Vista de escritorio del portal de reserva | Transición de scroll suave simulando el flujo de reserva en 1 clic. |

---

## 🎞️ 8. BUILD V3 — Vídeo actual (`MECHA_motion_v3.html`)

El vídeo en producción es **v3** (3D real / WebGL, oner, ~71 s). Sustituye al v2 (CSS 2D, 10 escenas, 1:41). **Estado: 7 escenas construidas y verificadas con Chrome real (`__qa_ok=true`, 0 errores de consola).**

- **Spec/plan:** `SPEC_motion_v3_2026-08-04.md`, `PLAN_motion_v3_2026-08-04.md`.
- **Guion v4 (canónico, 7 escenas):** `GUION_CHISPA_v4.md`.
- **Handoff técnico (estado exacto + aprendizajes):** `HANDOFF_continuar_v3.md` → leer la sección **§0.5 (actualización 2026-08-06)** primero.
- **Verificación:** `python -m http.server 8889` + `python verify_v3.py` (QA estructural) y `python debug_v3.py` (frames en momentos concretos). Las capturas headless NO renderizan WebGL → mirar siempre con Chrome real (headed).

### ⚠️ Regla de integridad para el VÍDEO (no confundir con el pack general)
Este pack (§§1–7) es un brief estratégico general y contiene cifras aspiracionales (**+15 h, >80 % plantones, +15–25 % ocupación**) y nombres de competidores. **El vídeo v3 NO las usa** (sin piloto que las respalde; comparativa implícita sin nombrar marcas; sin Marketplace). El vídeo solo dice lo trazable en `GUION_CHISPA_v4.md` (agenda vertical real, IA WhatsApp+voz, señal Stripe, portal, y precio real **39 €/mes, sin comisiones, 1 mes gratis, sin permanencia**).


