# Diferenciadores IA para Mecha — investigacion de mercado y oportunidades

> Fecha: 2026-07-04 · Investigacion: competidores + APIs/SDKs disponibles + gaps reales de mercado.
> Complementa (no repite) el roadmap de `informes/PLAN-IA-CHISPA.md`. Criterio: utilidad REAL en el
> dia a dia de un salon (profesional y propietario), no adorno.

## Contexto competitivo (verificado 4 jul 2026)

- **Fresha:** IA solo como add-on de pago ("AI Concierge"). **Booksy:** optimizacion de huecos y
  chatbot basico. **GlossGenius / Mangomint / Vagaro:** sin IA nativa real. Solo Zenoti (enterprise)
  tiene IA seria. Conclusion: el plan Chispa ya nos pone por delante; lo de abajo nos hace inalcanzables.

---

## A. Los 4 "killer" — gaps de mercado confirmados

### 1. Migracion magica desde Booksy/Fresha (el ejemplo del usuario, confirmado como gap)
Nadie lo hace desde Booksy/Fresha (SalonHall tiene "Magic Import" pero solo desde Vagaro/Mindbody/
NailSoft/Fastboy). El coste de cambio es LA barrera de venta de Mecha.
- **Que es:** el prospecto sube lo que sea — CSV/Excel exportado de Booksy o Fresha, o incluso una
  FOTO de su agenda de papel — y un LLM con vision mapea solo: clientas, servicios, precios,
  duraciones, citas futuras. Cero "asigna columnas". Preview -> confirmar -> importado.
- **Tech:** Claude/Gemini vision + structured output (JSON schema) + el importador que ya existe
  (`components/config/TabImportarCitas.tsx` como base). Edge function con la key en secrets.
- **Venta:** CTA en la landing "Cambiate desde Booksy o Fresha en 10 minutos". Mata la objecion #1.

### 2. Dictado manos-libres de formulas de color (gap confirmado — nadie lo tiene)
Existen apps de formulas tecleadas (Gloss, Charm), IA de formulacion (Color Coach, $9.99/mes) y
dictado generico (Dictanote), pero NADIE combina voz + IA + ficha tecnica en el servicio.
- **Que es:** la profesional tiene guantes manchados de tinte. Dice: "Chispa, apunta: 40 gramos de
  7.1 con 20 volumenes, 35 minutos de exposicion" -> STT -> LLM -> ficha tecnica ESTRUCTURADA
  (formula, proporciones, tiempos) guardada en la clienta. Tambien notas post-servicio.
- **Tech:** Web Speech / Whisper / ElevenLabs Scribe (STT) + LLM a JSON. Encaja con la ficha de
  color que ya es diferencial de Mecha (Modular 2) y con la Sesion 5 (voz) del plan.
- **Es EL feature vertical:** util cada dia, imposible en Booksy/Fresha (no tienen ficha tecnica).

### 3. Try-on virtual de color en la consulta
La tech es madura (SDKs: Banuba, LightX API, Segmind, Orbo; L'Oreal lo explota en My Hair iD /
Style My Hair Pro con 87% de aprobacion de profesionales) pero NINGUN software de gestion lo integra
con ficha + reserva. L'Oreal lo tiene en apps de marca, no en el flujo del salon.
- **Que es:** en la consulta, la clienta se prueba tonos sobre su propia foto -> el tono elegido se
  guarda en su ficha tecnica -> se reserva el servicio de color. Sube el ticket medio (el color es
  el servicio caro) y reduce el "no era lo que esperaba".
- **Tech:** API REST (LightX borra inputs en 24h — bien para RGPD) o SDK (Banuba, tiempo real).
  Foto en bucket privado, consentimiento explicito (regla ya definida en el plan). v1: foto estatica
  via API (barato); v2: AR en vivo (SDK).

### 4. Traductor de formulas entre marcas
Color Coach lo vende standalone a $9.99/mes; integrado en la ficha de Mecha es un click.
- **Que es:** "esta formula Wella, damela en Schwarzkopf" — cuando el salon cambia de proveedor o
  la clienta viene de otro salon con su formula. LLM + tabla de equivalencias.

## B. IA en procesos (onboarding, ventas, landing)

5. **Catalogo desde foto de la lista de precios:** el onboarding pide crear servicios a mano; con
   vision, foto de la carta -> servicios con precio/duracion propuestos -> confirmar. (Amplia el
   onboarding Chispa existente.)
6. **Facturas de proveedor -> inventario:** foto del albaran -> entrada de stock (inventario v0 ya
   existe). OCR/vision + confirmacion.
7. **Chispa en la landing (preventa):** RAG sobre los manuales que YA existen (12 paginas con
   capturas) + especificaciones.html -> responde dudas de prospectos y agenda una llamada. Fresha
   cobra por su concierge; aqui es el vendedor. Tech: pgvector en Supabase + edge.
8. **Re-siembra automatica de la demo:** la demo compartida se ensucia y hay que re-sembrarla a
   mano; cron n8n + generacion de datos realistas con LLM. (Proceso interno, ahorra trabajo.)

## C. Dia a dia del profesional

9. **Antes/despues -> post de Instagram:** las fotos ya estan en el bucket privado `cliente-fotos`;
   con consentimiento de la clienta, la IA compone el collage + caption con el tono del salon ->
   descargar/compartir. Marketing sin esfuerzo (hoy las profesionales lo hacen a mano cada dia).
10. **"Quiero este corte" (busqueda visual):** la clienta ensena una foto -> vision la mapea a
    servicios del catalogo + duracion estimada -> propuesta de cita. Util en recepcion y en el portal.
11. **Duracion real aprendida por clienta:** el historial ya dice que el tinte de Ana tarda 15 min
    mas que el estandar del catalogo -> la agenda propone la duracion REAL al reservar. Nadie lo
    hace; los datos ya estan en `citas`. Reduce los retrasos en origen (mejor que resolverlos).
12. **Recompra predictiva por servicio:** "las raices de Ana se notan a las 6 semanas" -> WhatsApp
    con hueco propuesto. (Refuerza la "recompra WhatsApp" ya en backlog de Alexandro con prediccion
    por clienta/servicio.)

## D. Propietario

13. **Hueco muerto cronico:** detectar patrones ("martes tarde siempre vacio") -> sugerir promo/
    precio feliz para ese slot concreto + medir si funciono.
14. **Alertas de negocio proactivas:** caida de reservas semana proxima vs media -> avisar con
    causas probables y acciones (campana, huecos, lista de espera). (Extiende el briefing de la
    Sesion 6 del plan.)

## E. Descartados conscientemente (adorno o riesgo)

- **Benchmark de precios de la zona:** sin fuente de datos fiable -> claims inventables. NO (regla
  "sin claims falsos").
- **Diagnostico capilar medico desde foto:** roza dato de salud (regla dura: salud fuera del LLM).
  Solo v2 con DPO. La version "condicion cosmetica" (porosidad/dano para recomendar producto de
  reventa) es evaluable con cuidado.
- **Precios dinamicos:** en la lista de "no hacer aun" del dossier. Respetar.
- **Musica/ambiente IA, horoscopo de la clienta, etc.:** adorno.

---

## Fallas de coherencia detectadas (revision de esta sesion)

1. **El mayor diferenciador esta APAGADO en la demo:** `asistenteAgendaActivo` default false ->
   ningun prospecto ve la IA en la demo compartida. Incoherencia de marketing total: lo que mas
   vende es invisible. Encenderlo en el tenant demo (con rate-limit para abuso).
2. **Auditoria del asistente incompleta (verificar):** la spec del asistente (§7) dice que las
   escrituras confirmadas dejan rastro en `citas_historial`, pero `lib/agendaOps.ts` no inserta en
   `citas_historial` en ningun case. Si no hay trigger de BD que lo haga, las acciones de la IA no
   quedan auditadas como las manuales. Revisar y cerrar en la Sesion 3 (ejecutor general).
3. **Reagendar via asistente no marca aviso al cliente:** el flujo de retrasos marca
   `retraso_aviso_pendiente` y el motor n8n avisa; `agendaOps.reagendar_cita` no marca nada.
   Verificar que el motor cron-pull detecta el reagendado igualmente; si no, la clienta no se entera
   de que su cita se movio. Cerrar en Sesion 3.
4. **`cambiar_config` con read-merge-write:** lee todo el JSON de config, mezcla y reescribe. Dos
   sesiones concurrentes (propietario + recepcion, o dos pestanas) pueden pisarse cambios. Bajo
   riesgo, pero el ejecutor general deberia mergear por clave o usar RPC atomica.
5. **Restos del "error del pool":** commits duplicados por pares (filter-branch), stash
   `filter-branch: rewrite`, worktree `.claude/worktrees/condescending-murdock-9b0f9d` con specs
   duplicadas, y una copia vieja del arbol en `project/uploads/Hairy/` dentro del repo que ensucia
   los greps. Ademas `dist/` sin ignorar (git status). Limpieza de higiene recomendada.
6. **Voz y Safari/iPad:** Web Speech (STT) va bien en Chrome pero mal/parcial en Safari — y en
   recepcion hay iPads. La Sesion 5 debe tener fallback de STT server-side (Whisper/Scribe via edge).
7. **Demo interactiva + IA con escritura:** si se enciende Chispa en la demo compartida, cualquier
   visitante puede hacerle escribir en los datos compartidos. Necesita: rate-limit por IP, acciones
   destructivas limitadas en demo, y la re-siembra automatica (punto B.8).

## Recomendacion de priorizacion (encaje con PLAN-IA-CHISPA)

- **Anadir como Sesion 11 (ventas):** migracion magica Booksy/Fresha + catalogo desde foto +
  Chispa en la landing. Modelo: Opus 4.8 (parsing/mapeo correctness-critical), esfuerzo alto.
- **Anadir como Sesion 12 (vertical color):** dictado de formulas manos-libres (depende de Sesion 5
  voz) + traductor de formulas. Opus 4.8, esfuerzo alto.
- **Anadir como Sesion 13 (vision):** try-on de color (API estatica v1) + antes/despues Instagram +
  "quiero este corte". Sonnet 5, esfuerzo medio (integracion de APIs).
- **Meter en sesiones ya planificadas:** duracion real aprendida (Sesion 4 o 6), recompra
  predictiva (con Alexandro), hueco muerto cronico y alertas (Sesion 6), fallas 2-4 (Sesion 3),
  fallback STT (Sesion 5), demo guardrails + re-siembra (Sesion 1 al encender la demo).

## Fuentes

- Panorama competidores: goodcall.com (Fresha vs GlossGenius / vs Booksy), glossystack.com,
  bookingpro.ai, dingg.ai, biz.booksy.com, fresha.com/for-business.
- Try-on/segmentacion: banuba.com, lightxeditor.com/api, segmind.com, orbo.ai, glamar.io,
  lorealprofessionnel.com (My Hair iD, Style My Hair Pro), matrix.com.
- Migracion: glossystack.com/blog/switch-salon-software, salonhall.com (Magic Import), getapp.com.
- Formulas/voz: glossapp.club, colorcoachapp.com (Color Coach), dictanote.co, play.google.com (Charm).
