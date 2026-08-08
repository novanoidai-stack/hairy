# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> Landing Page E2E Suite - mechaa.es >> 3. Verify CTAs (navLogin and navDemo)
- Location: tests\landing.spec.ts:69:7

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Saltar al contenido" [ref=e2] [cursor=pointer]:
    - /url: "#top"
  - navigation "Principal" [ref=e3]:
    - generic [ref=e4]:
      - link "Mecha, inicio" [ref=e5] [cursor=pointer]:
        - /url: "#top"
        - generic [ref=e8]:
          - generic [ref=e9]: Mecha
          - generic [ref=e10]: OS
      - generic [ref=e11]:
        - link "AI Assistant" [ref=e12] [cursor=pointer]:
          - /url: "#asistente"
        - link "Schedule" [ref=e13] [cursor=pointer]:
          - /url: "#diferenciales"
        - link "Client cards" [ref=e14] [cursor=pointer]:
          - /url: "#fichas"
        - link "Compare" [ref=e15] [cursor=pointer]:
          - /url: "#comparativa"
        - link "Pricing" [ref=e16] [cursor=pointer]:
          - /url: "#precios"
        - link "Specs" [ref=e17] [cursor=pointer]:
          - /url: especificaciones.html
        - link "Contact" [ref=e18] [cursor=pointer]:
          - /url: "#contacto"
      - generic [ref=e19]:
        - group "Idioma / Language" [ref=e20]:
          - button "EN" [ref=e21] [cursor=pointer]
        - link "Sign in" [ref=e27] [cursor=pointer]:
          - /url: acceso.html
        - generic [ref=e28]:
          - generic: 1 Mes Gratis
          - link "Try free demo" [ref=e29] [cursor=pointer]:
            - /url: demo.html
  - main [ref=e31]:
    - generic [ref=e32]:
      - generic [ref=e33]:
        - generic [ref=e34]:
          - generic [ref=e35]: Para salones
          - generic [ref=e36]: Hecho a medida, no una app genérica
        - heading "El teléfono ya no te interrumpe. Tu salón sigue reservando." [level=1] [ref=e37]: El teléfono ya no te interrumpe.Tu salón sigue reservando.
        - paragraph [ref=e38]: La agenda que entiende tu oficio y el asistente de WhatsApp que atiende y cobra por ti.
        - generic [ref=e39]:
          - link "Ver demo gratis" [ref=e40] [cursor=pointer]:
            - /url: demo.html
          - button "¿Quieres el acceso ya?" [ref=e43] [cursor=pointer]
        - link "Valoraciones de Mecha" [ref=e47] [cursor=pointer]:
          - /url: "#resenas"
          - generic [ref=e48]: Reseñas
          - generic [ref=e60]: "4.6"
          - generic [ref=e61]: · 10 salones
          - generic [ref=e62]: Verificadas
        - generic [ref=e66]:
          - generic [ref=e67]:
            - link "Desde 39 €/mes" [ref=e70] [cursor=pointer]:
              - /url: "#precios"
            - text: · 1 mes gratis, sin tarjeta
          - generic [ref=e71]: "Sin permanencia: cancela cuando quieras"
          - generic [ref=e74]: "Sin comisiones: todo lo que factures es tuyo"
      - generic [ref=e77]:
        - generic [ref=e78]: Mecha OS
        - heading "Control total de tu agenda, tiempos de reposo y equipo en tiempo real" [level=3] [ref=e79]
      - img "Captura de la agenda de Mecha con citas, tiempos muertos productivos y la línea de hora actual" [ref=e83]:
        - complementary [ref=e84]:
          - generic [ref=e85]: Mecha
          - navigation [ref=e90]:
            - generic [ref=e91]: Principal
            - generic [ref=e92]: Agenda
            - generic [ref=e97]: Clientes
            - generic [ref=e101]: Equipo
            - generic [ref=e106]: Informes
        - generic [ref=e111]:
          - generic [ref=e112]:
            - generic [ref=e113]:
              - heading "Agenda" [level=3] [ref=e114]
              - generic [ref=e115]: Jueves, 15 octubre · 9 citas hoy · 4 confirmadas
            - generic [ref=e116]:
              - generic [ref=e117]: Hoy
              - generic [ref=e122]: Nueva cita
          - generic [ref=e125]:
            - generic [ref=e127]: Carla
            - generic [ref=e129]: Diego
            - generic [ref=e131]: Sofía
            - generic [ref=e133]:
              - generic [ref=e134]: 09:00
              - generic [ref=e135]: 10:00
              - generic [ref=e136]: 11:00
              - generic [ref=e137]: 12:00
              - generic [ref=e138]: 13:00
            - generic [ref=e139]:
              - generic [ref=e140]:
                - generic [ref=e141]: 09:00–09:45
                - generic [ref=e142]: María L.
                - generic [ref=e143]: Color + corte
              - generic [ref=e144]:
                - generic [ref=e145]: 09:45–10:15
                - generic [ref=e146]: Reposo tinte
              - generic [ref=e147]:
                - generic [ref=e148]: 10:15–10:55
                - generic [ref=e149]: Laura P.
                - generic [ref=e150]: Corte express
              - generic [ref=e151]:
                - generic [ref=e152]: 11:20–12:20
                - generic [ref=e153]: Ana García
                - generic [ref=e154]: Mechas + tratamiento
            - generic [ref=e155]:
              - generic [ref=e156]:
                - generic [ref=e157]: 09:00–09:30
                - generic [ref=e158]: Javier M.
                - generic [ref=e159]: Corte + barba
              - generic [ref=e160]:
                - generic [ref=e161]: 09:30–10:00
                - generic [ref=e162]: Pablo R.
                - generic [ref=e163]: Degradado
              - generic [ref=e164]:
                - generic [ref=e165]: 10:30–11:15
                - generic [ref=e166]: Marc T.
                - generic [ref=e167]: Corte + diseño
            - generic [ref=e168]:
              - generic [ref=e169]:
                - generic [ref=e170]: 09:15–10:15
                - generic [ref=e171]: Carmen V.
                - generic [ref=e172]: Balayage
              - generic [ref=e173]:
                - generic [ref=e174]: 10:15–10:40
                - generic [ref=e175]: Reposo
              - generic [ref=e176]:
                - generic [ref=e177]: 10:40–11:20
                - generic [ref=e178]: Inés D.
                - generic [ref=e179]: Peinado
    - generic [ref=e183]:
      - generic [ref=e184]:
        - generic [ref=e185]: El asistente que nunca cuelga
        - heading "Reserva, confirma y cobra la señal — sola, por WhatsApp" [level=2] [ref=e186]
        - paragraph [ref=e187]: Tu cliente escribe a las 23:40. Tú te despiertas con la cita confirmada y la señal cobrada.
        - generic [ref=e188]:
          - generic [ref=e193]:
            - heading "Habla como una persona" [level=4] [ref=e194]
            - paragraph [ref=e195]: "\"El sábado por la tarde para mechas con Sofía.\""
          - generic [ref=e200]:
            - heading "Cobra la señal por Stripe" [level=4] [ref=e201]
            - paragraph [ref=e202]: La señal bloquea el hueco y mata el no-show.
          - generic [ref=e208]:
            - heading "24/7, también de madrugada" [level=4] [ref=e209]
            - paragraph [ref=e210]: Responde al instante mientras duermes.
        - link "Verlo en una demo gratis" [ref=e211] [cursor=pointer]:
          - /url: demo.html
      - generic [ref=e214]:
        - generic [ref=e219]:
          - generic [ref=e224]:
            - generic [ref=e225]: Mecha · Studio Norte
            - generic [ref=e226]: en línea
          - generic [ref=e229]:
            - textbox "Escribe un mensaje..." [ref=e230]
            - button "Enviar" [ref=e231] [cursor=pointer]
        - button "Ver la conversación" [ref=e236] [cursor=pointer]
    - generic [ref=e242]:
      - generic [ref=e243]:
        - generic [ref=e244]: Cambiarse cuesta 10 minutos
        - heading "¿Ya usas Booksy o Fresha? Tráetelo entero" [level=3] [ref=e245]
        - list [ref=e246]:
          - listitem [ref=e247]:
            - generic [ref=e251]:
              - text: Tus clientes y sus citas
              - strong [ref=e252]: entran de una vez
              - text: ", desde un Excel o una foto de tu agenda."
          - listitem [ref=e253]:
            - generic [ref=e257]:
              - text: Conservas
              - strong [ref=e258]: fichas, historial y contactos
              - text: . No empiezas de cero.
          - listitem [ref=e259]:
            - generic [ref=e263]:
              - text: Sigues con tu app actual
              - strong [ref=e264]: mientras pruebas
              - text: . Cambias a tu ritmo.
        - link "Cámbiate desde Booksy o Fresha en 10 minutos" [ref=e265] [cursor=pointer]:
          - /url: acceso.html?migrar=true
      - generic [ref=e268]:
        - generic [ref=e269]:
          - generic [ref=e270]:
            - generic [ref=e271]: B
            - generic [ref=e272]: Booksy
            - generic [ref=e273]: Clientes + citas
          - generic [ref=e274]:
            - generic [ref=e275]: F
            - generic [ref=e276]: Fresha
            - generic [ref=e277]: Clientes + citas
        - generic [ref=e278]: Se importa a
        - generic [ref=e285]:
          - generic [ref=e286]: Mecha
          - generic [ref=e287]: Tu salón, centralizado
    - generic [ref=e289]:
      - generic [ref=e290]:
        - generic [ref=e291]: Qué te devuelve Mecha
        - heading "Lo que hoy se te escapa, en tu caja" [level=2] [ref=e292]
        - paragraph [ref=e293]: "Escenario de ejemplo de un salón de 3 sillas que cobra señal y aprovecha los reposos. No son resultados medidos: es la cuenta que hacemos contigo, con tus números, en la demo."
        - generic "Escenario de ejemplo" [ref=e294]: Escenario de ejemplo · no son datos reales
      - generic [ref=e295]:
        - generic [ref=e296]:
          - generic [ref=e297]: −93%
          - generic [ref=e303]: 0%
          - generic [ref=e304]: menos no-shows
          - generic [ref=e305]: Recordatorio + señal por Stripe vía IA.
        - generic [ref=e308]:
          - generic [ref=e309]: +32%
          - generic [ref=e315]: 0%
          - generic [ref=e316]: más ocupación
          - generic [ref=e317]: Aprovechando tiempos muertos y huecos liberados.
        - generic [ref=e320]:
          - generic [ref=e321]: +6h
          - generic [ref=e327]: 0h
          - generic [ref=e328]: ahorradas a la semana
          - generic [ref=e329]: Reservas y recordatorios automáticos, sin teléfono.
        - generic [ref=e332]:
          - generic [ref=e333]: +24%
          - generic [ref=e338]: 0%
          - generic [ref=e339]: más ingresos / silla
          - generic [ref=e340]: Misma jornada, más servicios completados.
    - generic [ref=e343]:
      - generic [ref=e344]:
        - generic [ref=e345]:
          - generic [ref=e346]: Por qué Mecha es diferente
          - heading "Hecho para cómo trabaja de verdad un salón" [level=2] [ref=e347]
        - generic [ref=e348]:
          - generic [ref=e349]:
            - generic [ref=e350]: Tiempos muertos productivos
            - heading "Mientras un tinte reposa, atiendes a otro cliente" [level=3] [ref=e354]
            - list [ref=e355]:
              - listitem [ref=e356]:
                - generic [ref=e360]:
                  - text: Mecha
                  - strong [ref=e361]: detecta el reposo
                  - text: de color y mechas.
              - listitem [ref=e362]:
                - generic [ref=e366]:
                  - text: Y te propone
                  - strong [ref=e367]: otra cita en ese hueco
                  - text: ", sin solapes."
              - listitem [ref=e368]:
                - generic [ref=e372]:
                  - strong [ref=e373]: Más facturación
                  - text: sin alargar tu jornada.
          - generic [ref=e375]:
            - generic [ref=e376]: Carla · Estilista — jueves
            - generic [ref=e378]:
              - generic [ref=e379]:
                - generic [ref=e380]: 09:00 – 09:40
                - generic [ref=e381]: María L.
                - generic [ref=e382]: Color
              - generic [ref=e383]:
                - generic [ref=e384]: 09:40 – 10:05 · reposo del tinte
                - generic [ref=e385]:
                  - generic [ref=e386]: +
                  - generic [ref=e387]:
                    - generic [ref=e388]: Laura P. — Corte express
                    - generic [ref=e389]: encaja en el hueco libre
              - generic [ref=e390]:
                - generic [ref=e391]: 10:05 – 10:40
                - generic [ref=e392]: María L.
                - generic [ref=e393]: Lavado y peinado
            - generic [ref=e394]:
              - generic [ref=e397]: +1 servicio
              - text: en la misma franja, sin alargar tu jornada.
        - generic [ref=e398]:
          - generic [ref=e399]:
            - generic [ref=e400]: Servicios encadenados
            - heading "Una cita, varias manos, cero descoordinación" [level=3] [ref=e404]
            - list [ref=e405]:
              - listitem [ref=e406]:
                - generic [ref=e410]:
                  - text: Color, corte y peinado
                  - strong [ref=e411]: en una sola reserva
                  - text: .
              - listitem [ref=e412]:
                - generic [ref=e416]:
                  - text: Cada profesional ve
                  - strong [ref=e417]: solo su parte
                  - text: .
              - listitem [ref=e418]:
                - generic [ref=e422]:
                  - text: El cliente recibe
                  - strong [ref=e423]: una única confirmación
                  - text: .
          - generic [ref=e425]:
            - generic [ref=e426]: CITA · Ana García — Cambio de look completo · 11:20
            - generic [ref=e427]:
              - generic [ref=e428]:
                - generic [ref=e429]: Paso 1
                - generic [ref=e430]: Color
                - generic [ref=e431]: 40 min
              - generic [ref=e432]:
                - generic [ref=e433]: Paso 2
                - generic [ref=e434]: Corte
                - generic [ref=e435]: 25 min
              - generic [ref=e436]:
                - generic [ref=e437]: Paso 3
                - generic [ref=e438]: Peinado
                - generic [ref=e439]: 20 min
            - generic [ref=e440]:
              - generic [ref=e441]:
                - generic [ref=e442]: SL
                - generic [ref=e443]: Sofía LeónColorista
              - generic [ref=e444]:
                - generic [ref=e445]: CM
                - generic [ref=e446]: Carla M.Estilista
              - generic [ref=e447]:
                - generic [ref=e448]: DR
                - generic [ref=e449]: Diego R.Peinado
            - generic [ref=e450]:
              - text: Una sola cita · 3 profesionales ·
              - generic [ref=e453]: 1 confirmación
              - text: para el cliente
        - generic [ref=e454]:
          - generic [ref=e455]:
            - generic [ref=e456]: 100% Legal y Antifraude
            - heading "Facturación oficial y fichaje laboral integrados" [level=3] [ref=e460]
            - list [ref=e461]:
              - listitem [ref=e462]:
                - generic [ref=e466]:
                  - text: Tickets homologados por
                  - strong [ref=e467]: VeriFactu
                  - text: con códigos QR de Hacienda.
              - listitem [ref=e468]:
                - generic [ref=e472]:
                  - text: Cumple la ley de registro de jornada gracias a nuestra colaboración con
                  - strong [ref=e473]: ElevaScore
                  - text: .
              - listitem [ref=e474]:
                - generic [ref=e478]:
                  - text: "Duerme tranquilo: contabilidad blindada y personal"
                  - strong [ref=e479]: 100% legal
                  - text: .
          - generic [ref=e481]:
            - generic [ref=e482]:
              - generic [ref=e483]: "NOVA BEAUTY SALONNIF: B12345678"
              - generic [ref=e484]:
                - text: Corte + Tinte
                - generic [ref=e485]: 123.45 €
              - generic [ref=e486]:
                - text: IVA (21%)
                - generic [ref=e487]: 25.92 €
              - generic [ref=e488]: "TOTAL: 123.45 €"
              - generic [ref=e489]: VeriFactu AEAT
            - generic [ref=e501]:
              - generic [ref=e502]:
                - generic [ref=e503]: ENTRADA REGISTRADA
                - generic [ref=e504]: 08:55 AM
                - generic [ref=e505]: Diego R. — Hoy
              - generic [ref=e506]:
                - text: Powered by
                - generic [ref=e509]: ElevaScore
      - generic [ref=e511]:
        - generic [ref=e512]:
          - generic [ref=e513]: La ficha de cada cliente
          - heading "Una ficha que moldeas tú, no al revés" [level=2] [ref=e514]
          - paragraph [ref=e515]: Fórmulas de color, fotos, notas y preferencias — tú decides qué guardas.
        - generic [ref=e516]:
          - generic [ref=e517]:
            - generic [ref=e518]:
              - generic [ref=e519]:
                - generic [ref=e520]: "1"
                - text: Etiquetas a tu medida
              - text: "\"Fiel\", \"Alérgica al amoníaco\", \"Solo tardes\"… las que quieras."
            - generic [ref=e525]:
              - generic [ref=e526]:
                - generic [ref=e527]: "2"
                - text: Fórmula de color guardada
              - text: La fórmula exacta, el volumen y el tiempo, listos para repetir.
            - generic [ref=e531]:
              - generic [ref=e532]:
                - generic [ref=e533]: "3"
                - text: Notas y campos propios
              - text: Tú decides qué campos importan en tu salón.
          - generic [ref=e538]:
            - generic [ref=e539]:
              - generic [ref=e540]: AG
              - generic [ref=e541]:
                - generic [ref=e542]: Ana García
                - generic [ref=e543]: +34 6·· ··· 412 · cliente desde 2023
            - generic [ref=e544]:
              - generic [ref=e545]: Fiel
              - generic [ref=e546]: Alérgica al amoníaco
              - generic [ref=e547]: Prefiere tardes
              - generic [ref=e548]: + etiqueta
            - generic [ref=e549]:
              - generic [ref=e550]:
                - generic [ref=e551]: "14"
                - generic [ref=e552]: visitas
              - generic [ref=e553]:
                - generic [ref=e554]: 1.240 €
                - generic [ref=e555]: gastado
              - generic [ref=e556]:
                - generic [ref=e557]: 3 sem.
                - generic [ref=e558]: última
            - generic [ref=e559]:
              - generic [ref=e560]:
                - text: Fórmula de color
                - generic [ref=e561]: Editar
              - generic [ref=e562]:
                - generic [ref=e563]: Base 6.0 + 7.3
                - generic [ref=e564]: 30 vol
                - generic [ref=e565]: 35 min reposo
                - generic [ref=e566]: Sin amoníaco
            - generic [ref=e567]:
              - generic [ref=e568]: Notas del profesional
              - generic [ref=e569]: Le gustan las mechas finas y naturales, raya al lado izquierdo. No usar secador muy caliente. Suele pedir cita cada 8 semanas.
            - generic [ref=e570]:
              - generic [ref=e571]: Preferencias
              - generic [ref=e572]:
                - generic [ref=e573]:
                  - text: "Profesional de confianza:"
                  - generic [ref=e577]: Sofía León
                - generic [ref=e578]:
                  - text: "Bebida:"
                  - generic [ref=e582]: café con leche
            - generic [ref=e584]:
              - text: Fotos de servicios
              - generic [ref=e585]: Subir
            - generic [ref=e603]:
              - generic [ref=e604]: La IA te avisa
              - generic [ref=e605]: "\"Ana suele venir cada 8 semanas — ya van 9. ¿Le escribo?\""
          - generic [ref=e606]:
            - generic [ref=e607]:
              - generic [ref=e608]:
                - generic [ref=e609]: "4"
                - text: Preferencias propias
              - text: Profesional de confianza, bebida, manías… cada detalle.
            - generic [ref=e613]:
              - generic [ref=e614]:
                - generic [ref=e615]: "5"
                - text: Fotos de cada servicio
              - text: El antes y el después, sin depender de la memoria.
        - paragraph [ref=e620]: Ficha de ejemplo con datos ilustrativos. Los nombres, fotos y cifras son una representación de cómo se vería tu propia base de clientes en Mecha.
      - generic [ref=e622]:
        - generic [ref=e623]:
          - generic [ref=e624]: Mucho más que una agenda
          - heading "De la reserva al cobro, sin fricción" [level=2] [ref=e625]
        - generic [ref=e626]:
          - generic [ref=e627]:
            - heading "1 · Reserva" [level=5] [ref=e631]
            - paragraph [ref=e632]: WhatsApp, web o QR.
          - generic [ref=e633]:
            - heading "2 · Señal" [level=5] [ref=e637]
            - paragraph [ref=e638]: Bloquea el hueco y evita el no-show.
          - generic [ref=e639]:
            - heading "3 · Servicio" [level=5] [ref=e643]
            - paragraph [ref=e644]: Agenda, ficha y cobro, todo en uno.
      - generic [ref=e646]:
        - generic [ref=e647]:
          - generic [ref=e648]: Organizador con IA
          - heading "Un retraso no te arruina el día" [level=2] [ref=e649]
        - generic [ref=e650]:
          - generic [ref=e651]:
            - generic [ref=e652]: Absorbe retrasos
            - heading "Una cita se alarga y Mecha recoloca el resto" [level=3] [ref=e656]
            - list [ref=e657]:
              - listitem [ref=e658]:
                - generic [ref=e662]:
                  - text: Calcula el
                  - strong [ref=e663]: efecto dominó
                  - text: del retraso en las citas siguientes.
              - listitem [ref=e664]:
                - generic [ref=e668]:
                  - text: Lo
                  - strong [ref=e669]: absorbe
                  - text: con avisos y los tiempos muertos, antes de que crezca.
              - listitem [ref=e670]:
                - generic [ref=e674]:
                  - text: Nada cambia
                  - strong [ref=e675]: sin tu confirmación
                  - text: .
          - generic [ref=e677]:
            - generic [ref=e678]:
              - generic [ref=e679]:
                - generic [ref=e680]: Martes 9 jun · 12:30
                - generic [ref=e681]: María se alarga 15 min — afecta a 3 citas
              - generic [ref=e682]: Retraso · 15 min
            - generic [ref=e685]:
              - generic [ref=e686]: Cómo lo absorbe la IA
              - generic [ref=e690]:
                - generic [ref=e691]: "Avisar a Marco: entra 10 min más tarde"
                - generic [ref=e692]: aviso listo
              - generic [ref=e693]:
                - generic [ref=e694]: Aprovechar el reposo del tinte de Lucía
                - generic [ref=e695]: "-10 min"
              - generic [ref=e696]:
                - generic [ref=e697]: Recuperas el ritmo en la 3ª cita
                - generic [ref=e698]: en hora
              - generic [ref=e699]:
                - generic [ref=e700]: Retraso absorbido · nadie espera de más
                - generic [ref=e701]: Aplicar
      - generic [ref=e703]:
        - generic [ref=e704]:
          - generic [ref=e705]: Lo que ganas al cambiarte
          - heading "Lo que te da Mecha y Booksy o Fresha no" [level=2] [ref=e706]
          - paragraph [ref=e707]: Tráete el que ya usas en 10 minutos y súmale lo que de verdad mueve la caja.
        - generic [ref=e708]:
          - generic [ref=e709]:
            - generic [ref=e710]: Solo Mecha
            - heading "Tiempos muertos productivos" [level=4] [ref=e711]
            - paragraph [ref=e712]: Atiendes a otro cliente mientras un tinte reposa.
            - generic [ref=e713]: En Booksy y Fresha ese hueco se queda vacío.
          - generic [ref=e714]:
            - generic [ref=e715]: Solo Mecha
            - heading "La IA reserva y cobra la señal" [level=4] [ref=e716]
            - paragraph [ref=e717]: Atiende por WhatsApp 24/7, propone hueco y cobra la señal sola.
            - generic [ref=e718]: Ellos no tienen IA conversacional propia.
          - generic [ref=e719]:
            - generic [ref=e720]: Solo Mecha
            - heading "Servicios encadenados" [level=4] [ref=e721]
            - paragraph [ref=e722]: Color, corte y peinado entre varios profesionales en una cita.
            - generic [ref=e723]: En ellos es manual o no existe.
          - generic [ref=e724]:
            - generic [ref=e725]: Tu negocio
            - heading "Tus clientes son tuyos" [level=4] [ref=e726]
            - paragraph [ref=e727]: No es un marketplace que los comparte. Y te traes tu lista desde Booksy o Fresha en 10 minutos.
            - generic [ref=e728]: Allí compartes escaparate con el salón de al lado.
        - paragraph [ref=e729]: Comparativa orientativa basada en funciones públicas de cada plataforma a fecha de publicación. Las funciones de terceros pueden cambiar.
        - link "Leer carta comercial y análisis de ROI" [ref=e731] [cursor=pointer]:
          - /url: carta-comercial.html
      - generic [ref=e735]:
        - generic [ref=e736]:
          - generic [ref=e737]: Precio simple, sin letra pequeña
          - heading "Un precio que se paga solo" [level=2] [ref=e738]
          - paragraph [ref=e739]: Un único software completo, y la IA aparte y opcional si la quieres. Sin permanencia y con el primer mes gratis para probarlo con tu salón real.
        - generic [ref=e741]:
          - generic [ref=e742]: Software Mecha
          - paragraph [ref=e743]: Todo el software, sin recortes
          - generic [ref=e744]: 39 € /mes + IVA
          - list [ref=e745]:
            - listitem [ref=e746]:
              - generic [ref=e750]: Agenda con tiempos de reposo y servicios encadenados
            - listitem [ref=e751]:
              - generic [ref=e755]: "Fichas de cliente: fórmulas de color, fotos y alergias"
            - listitem [ref=e756]:
              - generic [ref=e760]: Portal de reserva online propio, sin comisiones
            - listitem [ref=e761]:
              - generic [ref=e765]: Recordatorios automáticos por WhatsApp
            - listitem [ref=e766]:
              - generic [ref=e770]: Caja, informes y equipo — profesionales ilimitados
            - listitem [ref=e771]:
              - generic [ref=e775]: Señales por Stripe, campañas y lista de espera inteligente
            - listitem [ref=e776]:
              - generic [ref=e780]: Facturación VeriFactu y fichaje de jornada legal
          - button "Empezar con 1 mes gratis" [ref=e781] [cursor=pointer]
        - generic [ref=e782]:
          - generic [ref=e783]: Aparte, opcional, cuando quieras
          - heading "Súmale la IA si la quieres" [level=3] [ref=e784]
          - paragraph [ref=e785]: "No va incluida ni obligada: es un addon que activas o desactivas desde Configuración, con su propio precio y sin permanencia."
        - generic [ref=e786]:
          - generic [ref=e787]:
            - generic [ref=e788]: IA por WhatsApp
            - paragraph [ref=e789]: Chispa atiende, reserva y cobra sola
            - generic [ref=e790]: +19 € /mes + IVA
            - list [ref=e791]:
              - listitem [ref=e792]:
                - generic [ref=e796]: Responde por WhatsApp 24/7, también de madrugada
              - listitem [ref=e797]:
                - generic [ref=e801]: Reserva la cita y cobra la señal por Stripe sola
          - generic [ref=e802]:
            - generic [ref=e803]: IA por voz
            - paragraph [ref=e804]: Contesta el teléfono por ti
            - generic [ref=e805]: +29 € /mes + IVA
            - list [ref=e806]:
              - listitem [ref=e807]:
                - generic [ref=e811]: La IA coge el teléfono y da cita hablando
              - listitem [ref=e812]:
                - generic [ref=e816]: Tú decides si la activas o sigues cogiéndolo tú
          - generic [ref=e817]:
            - generic [ref=e818]: Ahorra 9 €
            - generic [ref=e819]: IA completa
            - paragraph [ref=e820]: WhatsApp + voz, junto y más barato
            - generic [ref=e821]: 39 € /mes + IVA
            - list [ref=e822]:
              - listitem [ref=e823]:
                - generic [ref=e824]: En vez de 48 € sueltos
              - listitem [ref=e825]:
                - generic [ref=e829]: Todo lo de WhatsApp y voz juntos
              - listitem [ref=e830]:
                - generic [ref=e834]: Retrasos absorbidos con un clic y organización del día con IA
        - generic [ref=e835]:
          - button [ref=e836] [cursor=pointer]:
            - heading "Una llamada de 10 minutos" [level=4] [ref=e840]
            - paragraph [ref=e841]: Eliges día y hora. Vemos tu salón, te enseñamos Mecha con tus servicios y horarios y, si te encaja, te lo dejamos montado.
            - generic [ref=e842]: Elegir día y hora
          - button [ref=e845] [cursor=pointer]:
            - heading "Mándanos un mensaje" [level=4] [ref=e850]
            - paragraph [ref=e851]: Sin llamadas. Escríbenos tu duda y te contestamos por correo hoy mismo.
            - generic [ref=e852]: Escribir ahora
          - button [ref=e855] [cursor=pointer]:
            - heading "Quiero el software" [level=4] [ref=e859]
            - paragraph [ref=e860]: Lo tienes claro. Déjanos tus datos y te damos acceso y te lo configuramos.
            - generic [ref=e861]: Empezar ya
        - generic [ref=e864]:
          - generic [ref=e865]: 1 mes gratis, sin tarjeta
          - generic [ref=e868]: Sin permanencia
          - generic [ref=e871]: 0% comisiones por reserva
          - generic [ref=e874]: Te lo montamos todo
        - generic [ref=e877]:
          - heading "¿De dónde sale el precio? La cuenta, clara" [level=3] [ref=e878]
          - paragraph [ref=e879]: "No es un número al azar: es menos de lo que hoy pierdes cada mes por teléfono, huecos y plantones."
          - generic [ref=e880]:
            - generic [ref=e887]:
              - 'heading "Un plantón: ~35 € tirados" [level=5] [ref=e888]'
              - paragraph [ref=e889]: Con la señal por Stripe y los recordatorios, evitar 1-2 no-shows al mes ya paga Mecha entero.
            - generic [ref=e894]:
              - 'heading "Comisiones de marketplace: 0 €" [level=5] [ref=e895]'
              - paragraph [ref=e896]: Otras plataformas se llevan un 20-35% por cliente nuevo. En Mecha, el 100% de cada servicio es tuyo.
            - generic [ref=e902]:
              - heading "Horas de teléfono, a tijera" [level=5] [ref=e903]
              - paragraph [ref=e904]: "El asistente atiende WhatsApp y reservas 24/7: horas a la semana que vuelven a ser para tus clientes."
            - generic [ref=e909]:
              - heading "Los reposos, facturando" [level=5] [ref=e910]
              - paragraph [ref=e911]: Un corte encajado en el reposo de un tinte a la semana son cientos de euros más al mes, sin alargar la jornada.
          - paragraph [ref=e912]: Cifras orientativas de un salón típico — en la demo hacemos la cuenta con los números del tuyo.
      - generic [ref=e914]:
        - generic [ref=e915]:
          - generic [ref=e916]: Lo que todo el mundo pregunta
          - heading "Las dudas, resueltas" [level=2] [ref=e917]
          - paragraph [ref=e918]: Sin letra pequeña. Si te queda alguna, pregúntale a Chispa aquí abajo o te lo contamos en la llamada.
        - generic [ref=e919]:
          - group [ref=e920]:
            - generic "¿Puedo dejarlo si no me convence? Sí." [ref=e921] [cursor=pointer]
          - group [ref=e927]:
            - generic "¿Puedo cambiarme sin perder mis clientes? Sí." [ref=e928] [cursor=pointer]
          - group [ref=e936]:
            - generic "¿Cuánto tardo en tenerlo funcionando?" [ref=e937] [cursor=pointer]
          - group [ref=e942]:
            - generic "Trabajo yo solo o somos pocos. ¿Me compensa?" [ref=e943] [cursor=pointer]
          - group [ref=e951]:
            - generic "¿Los clientes son míos, no compartidos? Sí." [ref=e952] [cursor=pointer]
          - group [ref=e957]:
            - generic "¿Pierdo el control si activo la IA?" [ref=e958] [cursor=pointer]
          - group [ref=e963]:
            - generic "¿Sirve para facturar en regla?" [ref=e964] [cursor=pointer]
          - group [ref=e971]:
            - generic "¿Funciona en el móvil?" [ref=e972] [cursor=pointer]
        - generic [ref=e977]:
          - generic [ref=e978]: ¿Te queda alguna duda?
          - link "Que nos lo pregunten en una llamada" [ref=e979] [cursor=pointer]:
            - /url: reservar.html
      - generic [ref=e984]:
        - generic [ref=e985]: Todo lo que incluye, al detalle
        - heading "¿Quieres ver todo lo que hace Mecha?" [level=2] [ref=e986]
        - paragraph [ref=e987]: "Cada función explicada, una por una: qué hace y para qué te sirve. Gratis y sin registro."
        - link "Ver todas las especificaciones" [ref=e988] [cursor=pointer]:
          - /url: especificaciones.html
      - generic [ref=e993]:
        - generic [ref=e994]: Casos de éxito y Reseñas Reales
        - heading "Lo que opinan de Mecha" [level=2] [ref=e995]
        - generic [ref=e996]:
          - generic [ref=e1008]: "4.6"
          - generic [ref=e1009]: basado en 10 valoraciones
          - generic [ref=e1010]: Personas reales
      - region "Galería visual de Mecha" [ref=e1014]:
        - generic [ref=e1015]:
          - generic [ref=e1016]:
            - generic [ref=e1017]: Mecha en imágenes
            - heading "Tu salón, encendido" [level=2] [ref=e1018]
            - paragraph [ref=e1019]: "Una vista rápida de lo que Mecha pone en tus manos: agenda con IA, ficha de cliente y reservas por WhatsApp que se confirman solas."
          - generic [ref=e1020]:
            - figure "Dashboard de Mecha — Agenda inteligente y control del salón" [ref=e1021]:
              - img "Captura de la interfaz de la agenda de Mecha OS con modo oscuro, vista de calendario y citas para peluquerías" [ref=e1022]
            - figure "Fichas de clientes — Historial y fórmulas de color digitales" [ref=e1024]:
              - img "Ejemplo de la ficha de cliente de peluquería en Mecha con historial de servicios, fórmulas de color y layout moderno" [ref=e1025]
            - figure "Analítica del salón — Gráficos de facturación y métricas en vivo" [ref=e1027]:
              - img "Captura de pantalla de la analítica de ingresos de Mecha OS, panel de control de estadísticas para barberías" [ref=e1028]
      - generic [ref=e1033]:
        - heading "Velo tú mismo o te lo montamos" [level=2] [ref=e1034]:
          - text: Velo tú mismo o
          - generic [ref=e1035]: te lo montamos
        - paragraph [ref=e1036]:
          - text: Mira la
          - strong [ref=e1037]: demo gratis
          - text: ", o"
          - strong [ref=e1038]: habla con nosotros
          - text: y te damos acceso inmediato para empezar a trabajar.
        - generic [ref=e1039]:
          - link "Ver demo gratis" [ref=e1040] [cursor=pointer]:
            - /url: demo.html
          - button "¿Quieres el acceso ya?" [ref=e1043] [cursor=pointer]
        - paragraph [ref=e1047]: Desde 39 €/mes · 1 mes gratis sin tarjeta · Sin permanencia · 0% comisiones
  - generic [ref=e1049]:
    - generic [ref=e1050]:
      - generic [ref=e1051]: Quién está detrás
      - heading "Hecho por desarrolladores, para tu salón" [level=2] [ref=e1052]
      - paragraph [ref=e1053]:
        - text: Si echas algo en falta o lo quieres a tu manera,
        - strong [ref=e1054]: nos lo dices y lo hacemos
        - text: .
    - generic [ref=e1055]:
      - generic [ref=e1056]:
        - generic [ref=e1057]:
          - generic [ref=e1058]: CO
          - generic [ref=e1059]:
            - generic [ref=e1060]: Carlos Ocaña Martínez
            - generic [ref=e1061]: Producto · Frontend / UX
        - paragraph [ref=e1062]: "Diseño y experiencia de Mecha: que todo se entienda a la primera y dé gusto usarlo."
        - link "LinkedIn" [ref=e1064] [cursor=pointer]:
          - /url: https://www.linkedin.com
      - generic [ref=e1067]:
        - generic [ref=e1068]:
          - generic [ref=e1069]: AI
          - generic [ref=e1070]:
            - generic [ref=e1071]: Alexandro Iscrulescu
            - generic [ref=e1072]: Backend · Datos
        - paragraph [ref=e1073]: "El motor de Mecha: base de datos, seguridad y todo lo que hace que funcione sin fallar."
        - link "LinkedIn" [ref=e1075] [cursor=pointer]:
          - /url: https://www.linkedin.com
      - generic [ref=e1078]:
        - generic [ref=e1079]:
          - generic [ref=e1080]: JS
          - generic [ref=e1081]:
            - generic [ref=e1082]: Jose Suárez
            - generic [ref=e1083]: Producto · Sector salón
        - paragraph [ref=e1084]: "El conocimiento del sector: que Mecha encaje con cómo se trabaja de verdad en un salón."
        - link "LinkedIn" [ref=e1086] [cursor=pointer]:
          - /url: https://www.linkedin.com
    - generic [ref=e1089]:
      - generic [ref=e1090]: "¿Una idea o una duda? Hablamos:"
      - link "Email de Mecha" [ref=e1091] [cursor=pointer]:
        - /url: mailto:contacto@mechaa.es
      - link "Instagram" [ref=e1095] [cursor=pointer]:
        - /url: https://www.instagram.com
      - link "LinkedIn" [ref=e1099] [cursor=pointer]:
        - /url: https://www.linkedin.com
  - contentinfo [ref=e1102]:
    - generic [ref=e1103]:
      - generic [ref=e1104]:
        - generic [ref=e1105]:
          - link "Mecha, inicio" [ref=e1106] [cursor=pointer]:
            - /url: "#top"
            - generic [ref=e1109]:
              - generic [ref=e1110]: Mecha
              - generic [ref=e1111]: OS
          - paragraph [ref=e1112]: El sistema operativo de tu salón o barbería. Agenda inteligente, asistente de IA y toda la gestión en un solo sitio.
        - generic [ref=e1113]:
          - heading "Producto" [level=5] [ref=e1114]
          - link "Asistente IA" [ref=e1115] [cursor=pointer]:
            - /url: "#asistente"
          - link "Agenda" [ref=e1116] [cursor=pointer]:
            - /url: "#diferenciales"
          - link "Fichas de cliente" [ref=e1117] [cursor=pointer]:
            - /url: "#fichas"
          - link "Precios" [ref=e1118] [cursor=pointer]:
            - /url: "#precios"
          - link "Especificaciones" [ref=e1119] [cursor=pointer]:
            - /url: especificaciones.html
          - link "Directorio de salones" [ref=e1120] [cursor=pointer]:
            - /url: salones.html
        - generic [ref=e1121]:
          - heading "Migrar" [level=5] [ref=e1122]
          - link "Vengo de Booksy" [ref=e1123] [cursor=pointer]:
            - /url: "#integra"
          - link "Vengo de Fresha" [ref=e1124] [cursor=pointer]:
            - /url: "#integra"
          - link "Todo lo que suma Mecha" [ref=e1125] [cursor=pointer]:
            - /url: "#comparativa"
        - generic [ref=e1126]:
          - heading "Empezar" [level=5] [ref=e1127]
          - link "Ver demo gratis" [ref=e1128] [cursor=pointer]:
            - /url: demo.html
          - link "Precios y planes" [ref=e1129] [cursor=pointer]:
            - /url: "#precios"
          - link "Preguntas frecuentes" [ref=e1130] [cursor=pointer]:
            - /url: "#faq"
          - link "Contacto" [ref=e1131] [cursor=pointer]:
            - /url: "#contacto"
          - link "Habla con nosotros (acceso inmediato)" [ref=e1132] [cursor=pointer]:
            - /url: reservar.html
          - link "Iniciar sesión" [ref=e1133] [cursor=pointer]:
            - /url: acceso.html
          - link "Soporte técnico" [ref=e1134] [cursor=pointer]:
            - /url: mailto:soporte@mechaa.es
          - link "Privacidad y derechos" [ref=e1135] [cursor=pointer]:
            - /url: privacidad.html
      - generic [ref=e1136]:
        - generic [ref=e1137]: © 2026 Mecha · Hecho para salones de peluquería.
        - generic [ref=e1138]:
          - link "Privacidad" [ref=e1139] [cursor=pointer]:
            - /url: privacidad.html
          - link "Términos" [ref=e1140] [cursor=pointer]:
            - /url: terminos.html
          - link "Cookies" [ref=e1141] [cursor=pointer]:
            - /url: cookies.html
          - link "Aviso legal" [ref=e1142] [cursor=pointer]:
            - /url: privacidad.html#aviso
          - link "Acceso equipo" [ref=e1143] [cursor=pointer]:
            - /url: admin.html
        - generic [ref=e1144]:
          - generic "Instagram" [ref=e1145]
          - generic "TikTok" [ref=e1149]
          - generic "WhatsApp" [ref=e1152]
  - button "Abrir chat" [ref=e1156] [cursor=pointer]
  - dialog [ref=e1159]:
    - navigation [ref=e1160]:
      - generic [ref=e1161]: Navegación
      - link [ref=e1162] [cursor=pointer]:
        - /url: "#asistente"
        - generic [ref=e1163]: AI Assistant
      - link [ref=e1166] [cursor=pointer]:
        - /url: "#diferenciales"
        - generic [ref=e1167]: Schedule
      - link [ref=e1170] [cursor=pointer]:
        - /url: "#fichas"
        - generic [ref=e1171]: Client cards
      - link [ref=e1174] [cursor=pointer]:
        - /url: "#comparativa"
        - generic [ref=e1175]: Compare
      - link [ref=e1178] [cursor=pointer]:
        - /url: "#precios"
        - generic [ref=e1179]: Pricing
      - link [ref=e1182] [cursor=pointer]:
        - /url: especificaciones.html
        - generic [ref=e1183]: Specs
      - link [ref=e1186] [cursor=pointer]:
        - /url: "#contacto"
        - generic [ref=e1187]: Contact
    - generic [ref=e1190]:
      - link [ref=e1191] [cursor=pointer]:
        - /url: acceso.html
        - text: Sign in
      - link [ref=e1192] [cursor=pointer]:
        - /url: demo.html
        - text: Try free demo
  - dialog "Aviso de cookies" [ref=e1194]:
    - generic [ref=e1195]:
      - text: Cuidamos tu privacidad. Usamos cookies necesarias para el funcionamiento técnico y analítica de Mecha. Más info en la
      - link "Política de cookies" [ref=e1196] [cursor=pointer]:
        - /url: cookies.html
      - text: .
    - generic [ref=e1197]:
      - button "Configurar cookies" [ref=e1198] [cursor=pointer]
      - button "Rechazar" [ref=e1199] [cursor=pointer]
      - button "Aceptar todas" [ref=e1200] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Landing Page E2E Suite - mechaa.es', () => {
  4   |   let pageErrors: Error[] = [];
  5   | 
  6   |   const gotoLanding = async (page: any) => {
  7   |     for (let attempt = 1; attempt <= 3; attempt++) {
  8   |       try {
  9   |         await page.goto('/', { waitUntil: 'commit', timeout: 10000 });
  10  |         break;
  11  |       } catch (e) {
  12  |         await page.waitForTimeout(500);
  13  |       }
  14  |     }
  15  |     await page.click('#introSkip').catch(() => {});
  16  |     await page.waitForSelector('header, nav, .nav, #navbar', { timeout: 10000 }).catch(() => {});
  17  |   };
  18  | 
  19  |   test.beforeEach(async ({ page }) => {
  20  |     pageErrors = [];
  21  |     page.on('pageerror', (exception) => {
  22  |       console.error('Captured page error:', exception.message);
  23  |       pageErrors.push(exception);
  24  |     });
  25  |   });
  26  | 
  27  |   test.afterEach(() => {
  28  |     expect(
  29  |       pageErrors,
  30  |       `Uncaught JS exceptions detected: ${pageErrors.map((e) => e.message).join(' | ')}`
  31  |     ).toHaveLength(0);
  32  |   });
  33  | 
  34  |   test('1. Navigation & Header Verification', async ({ page }) => {
  35  |     await gotoLanding(page);
  36  | 
  37  |     const title = await page.title();
  38  |     expect(title.length).toBeGreaterThan(0);
  39  |     console.log('Page title verified:', title);
  40  | 
  41  |     const headerNav = page.locator('header, nav, .nav, #navbar').first();
  42  |     await expect(headerNav).toBeVisible();
  43  |   });
  44  | 
  45  |   test('2. Systematically click all header nav links', async ({ page }) => {
  46  |     await gotoLanding(page);
  47  | 
  48  |     const requiredSelectors = [
  49  |       'a[href="#asistente"]',
  50  |       'a[href="#diferenciales"]',
  51  |       'a[href="#fichas"]',
  52  |       'a[href="#precios"]',
  53  |       'a[href="especificaciones.html"]',
  54  |       'a[href="#contacto"]',
  55  |     ];
  56  | 
  57  |     for (const selector of requiredSelectors) {
  58  |       const link = page.locator(selector).first();
  59  |       const count = await link.count();
  60  |       if (count > 0 && await link.isVisible().catch(() => false)) {
  61  |         await link.click({ timeout: 3000 }).catch(async () => {
  62  |           await link.click({ force: true }).catch(() => {});
  63  |         });
  64  |         await page.waitForTimeout(200);
  65  |       }
  66  |     }
  67  |   });
  68  | 
  69  |   test('3. Verify CTAs (navLogin and navDemo)', async ({ page }) => {
  70  |     await gotoLanding(page);
  71  | 
  72  |     const navLogin = page.locator('a#navLogin').first();
  73  |     await expect(navLogin).toBeAttached();
  74  |     const loginHref = await navLogin.getAttribute('href');
  75  |     expect(loginHref).toBeTruthy();
  76  | 
  77  |     const navDemo = page.locator('a#navDemo').first();
  78  |     await expect(navDemo).toBeAttached();
  79  | 
  80  |     if (await navDemo.isVisible().catch(() => false)) {
  81  |       await navDemo.hover().catch(() => {});
> 82  |       await page.waitForTimeout(200);
      |                  ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  83  |     }
  84  |   });
  85  | 
  86  |   test('4. Test interactive modals and buttons', async ({ page }) => {
  87  |     await gotoLanding(page);
  88  | 
  89  |     const interactiveElements = page.locator('button, a.btn, [data-bs-toggle], [data-modal-target]');
  90  |     const count = await interactiveElements.count();
  91  |     expect(count).toBeGreaterThan(0);
  92  | 
  93  |     for (let i = 0; i < Math.min(count, 5); i++) {
  94  |       const el = interactiveElements.nth(i);
  95  |       if (await el.isVisible().catch(() => false)) {
  96  |         const text = (await el.textContent())?.trim() || '';
  97  |         console.log(`Testing interactive element [${i}]: "${text}"`);
  98  |         await el.hover().catch(() => {});
  99  |       }
  100 |     }
  101 |   });
  102 | 
  103 |   test('5. Verify no broken links on landing page', async ({ request, page }) => {
  104 |     await gotoLanding(page);
  105 | 
  106 |     const linkElements = await page.locator('a[href]').all();
  107 |     const hrefSet = new Set<string>();
  108 | 
  109 |     for (const el of linkElements) {
  110 |       const href = await el.getAttribute('href');
  111 |       if (
  112 |         href &&
  113 |         !href.startsWith('javascript:') &&
  114 |         !href.startsWith('mailto:') &&
  115 |         !href.startsWith('tel:') &&
  116 |         !href.startsWith('#')
  117 |       ) {
  118 |         hrefSet.add(href);
  119 |       }
  120 |     }
  121 | 
  122 |     console.log(`Checking ${hrefSet.size} unique links on landing page...`);
  123 |     const brokenLinks: { href: string; status: number }[] = [];
  124 | 
  125 |     const linkArray = Array.from(hrefSet).slice(0, 10);
  126 |     for (const href of linkArray) {
  127 |       try {
  128 |         const targetUrl = new URL(href, 'https://www.mechaa.es').toString();
  129 |         const response = await request.get(targetUrl, {
  130 |           failOnStatusCode: false,
  131 |           timeout: 4000,
  132 |         });
  133 | 
  134 |         if (response.status() >= 400 && response.status() !== 403 && response.status() !== 429) {
  135 |           brokenLinks.push({ href, status: response.status() });
  136 |         }
  137 |       } catch (err) {
  138 |         console.warn(`Warning checking link "${href}":`, (err as Error).message);
  139 |       }
  140 |     }
  141 | 
  142 |     expect(
  143 |       brokenLinks,
  144 |       `Broken links found on landing page: ${JSON.stringify(brokenLinks, null, 2)}`
  145 |     ).toHaveLength(0);
  146 |   });
  147 | });
  148 | 
```