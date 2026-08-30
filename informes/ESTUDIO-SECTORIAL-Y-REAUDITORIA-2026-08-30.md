# Estudio sectorial y reauditoría de Mecha — 30 ago 2026

> Parte de un informe externo ("Estudio sectorial integral y reauditoría maestra de Mecha OS").
> Aquí se profundiza su Parte 1 y se **contrasta su Parte 2 contra el código y la base de datos
> de producción** (`vtrggiogjrhqtwbhbgia`, medido el 30 ago 2026). Los porcentajes del informe
> original no se han copiado: se han recalculado.
>
> **El pricing no cambia.** Esencial 39 €, Estudio 59 €, addon IA 19/29/39. Todo lo que se
> propone aquí encaja dentro de esa tabla; el §12 dice en qué plan cae cada cosa y por qué.

---

## 0. Veredicto en una página

El informe externo es **bueno en el sector y flojo en la auditoría**. Su Parte 1 describe bien
las cuatro tipologías y acierta en el diagnóstico central (el reposo del tinte es el foso
defendible). Su Parte 2 está construida sobre lo que el repo *dice de sí mismo*, no sobre lo
que la base de datos *hace*, y por eso se equivoca en las tres cosas que importan.

**Lo que el informe dice que falta y ya está hecho:** Realtime (`lib/hooks/useCitasRealtime.ts`
+ `tests/e2e/agenda-realtime.spec.ts`), recursos físicos (tabla `recursos`, 4 RPCs, `lib/recursos.ts`
cableado en agenda y configuración) y cobro por QR/enlace (`crear-checkout-cobro`,
`app/pagar/[token]`, `terminal-cobro-intent` para Stripe Terminal).

**Lo que el informe no vio, y es lo que de verdad bloquea a Mecha:**

| # | Hallazgo | Evidencia |
|---|---|---|
| **A** | **La landing promete a la AEAT algo que el código documenta que no hace.** `web/index.html:154` vende "VeriFactu (AEAT) con cadena SHA-256, QR de cotejo **y envío a Hacienda**"; el FAQ en JSON-LD responde "**Sí**" a "¿cumple la normativa VeriFactu?". `components/pos/CobroSheet.tsx:869` dice literalmente lo contrario: *"no hay alta en VeriFactu ni QR de verificación oficial"*. En producción: `config_fiscal.proveedor_estado` = `no_configurado` / `sandbox`, `apoderamiento_ok = false`, `entorno_aeat = preproduccion`. **1.600 tickets encadenados en local, 0 enviados.** Y `tickets_verifactu` no tiene ni una columna donde anotar un envío. | §7 |
| **B** | **Seis módulos con lógica y tests que no están enchufados a nada** — incluido el de alergias y el de rentabilidad por sillón. Pasan la CI, cuentan como "hecho", y ningún usuario los ha visto nunca. | §8 |
| **C** | **La brecha de activación.** El único salón real tiene **7 de 81 servicios con reposo configurado**, 0 productos tarifados, 2 recursos creados y nunca asignados, y **0 reservas online y 0 señales cobradas en toda la vida del producto**. El producto no está incompleto: está **sin configurar**, y nada en él configura al salón. | §9 |
| **D** | **`anonimizar_cliente` deja atrás los datos de salud.** Borra fotos, consentimientos y `clientes.alergias`, pero **no toca `fichas_tecnicas_color`** (87 filas con `formula`, `nivel_dano`, `incidencias`) ni `notas_internas_cliente` ni `citas.notas`. Es exactamente el dato del art. 9 RGPD el que sobrevive al derecho de supresión. | §6.3 |

**La frase que resume el estado real:** Mecha no tiene un problema de funciones que faltan.
Tiene un problema de **funciones construidas que nadie ha llegado a usar**, y un claim fiscal
que hay que resolver esta semana.

---

# PARTE 1 — El sector, más a fondo

El informe externo describe bien 4 tipologías. Le faltan una tipología entera, la métrica que
convierte el reposo en dinero, y la mitad de las obligaciones legales.

## 1. La quinta tipología que falta: el alquiler de sillón

El informe reparte el 100 % del sector entre barrio (65-70 %), autor (15-20 %), mixto (10-15 %)
y cadenas (~5 %). Falta un modelo que en España lleva años creciendo y que **rompe el modelo de
datos de Mecha de raíz**: el **alquiler de sillón / puesto** (*chair rental*, *booth rent*).

**Cómo funciona:** el titular alquila el puesto a estilistas que son **autónomos independientes**.
Cada uno tiene su propia cartera, factura a su nombre, cobra a su cliente y paga una renta fija
(300–600 €/mes) o un porcentaje. No hay relación laboral.

**Por qué importa para el software, y por qué Mecha hoy no puede servirlo:**

- **Un `negocio_id` = un NIF = una cadena fiscal.** En un salón de alquiler hay **N NIF bajo un
  mismo techo**. `tickets_verifactu` encadena por `negocio_id`; `config_fiscal` guarda un solo
  `nif`. Meter tres autónomos en un `negocio_id` produce una cadena fiscal ilegal (facturas de
  tres emisores en una serie). Meterlos en tres `negocio_id` produce tres agendas que no se ven
  entre sí, tres portales, y ningún control del recurso compartido (los dos lavacabezas).
- **El control horario NO aplica** (no son trabajadores) pero **sí aplica la agenda compartida y
  el reparto de recursos**. Es justo el revés del salón normal.
- **Comercialmente es el mejor cliente posible:** un salón de 6 puestos alquilados son 6
  suscripciones potenciales, no una. Y el titular es el canal de venta.

**Recomendación:** no construirlo ahora, pero **dejar de tomar decisiones que lo cierren**. La
más urgente: cuando se cierre VeriFactu (§7), la cadena debe encadenar por **`(negocio_id, nif_emisor, serie)`**
y no por `negocio_id`. Cambiar eso después de 50.000 tickets emitidos es imposible.

## 2. Las otras dos tipologías que el informe funde con otras

- **Estética / uñas pura** (cabinas, sin peluquería). El informe la trata como una cabina dentro
  de un salón mixto. Como negocio suelto tiene una operativa distinta: **cita larga 1:1 sin
  reposo, bonos de sesiones** (el "bono de 10 sesiones de láser" es el 60 % de su facturación) y
  **consentimiento informado obligatorio por sesión**. Mecha ya tiene `bonos` (3 filas) y
  `consentimientos_cliente`; le falta el **calendario de sesiones de un bono** (sesión 3 de 10,
  caducidad, recordatorio de la siguiente).
- **Barbería pura.** El informe la usa solo como eje comparativo. Como cliente es el **mejor
  primer mercado de Mecha**: alta frecuencia, ticket bajo, **no-show alto**, cero reposo, y un
  dueño joven que ya paga software. Es el segmento donde Mecha compite peor (su foso, el reposo,
  no aplica) y donde la señal y la cola de espera son todo. Conviene saberlo antes de gastar
  marketing ahí.

## 3. La métrica que falta: cuánto vale una hora de sillón

El P&L del informe es correcto (comprobado: 14.500 / 1,21 = 11.983,47 → IVA 2.516,53). Pero se
queda en el beneficio y **no deriva la única cifra que convierte el reposo en un argumento de
venta**. A partir de sus propios números, salón de 3 personas:

```
Capacidad mensual        3 pers. x 40 h/sem x 4,33 sem  =  520 h de sillón
Ingreso neto por hora    11.984 € / 520 h               =  23,05 €/h
Coste variable (químico) 1.450 € / 520 h                =   2,79 €/h
--------------------------------------------------------------------------
MARGEN DE CONTRIBUCIÓN POR HORA DE SILLÓN OCUPADA       =  20,26 €/h

Costes fijos + semifijos (personal, alquiler, suministros, gestoría):
  (4.850 + 1.350 + 680 + 380) / 520 h                   =  13,96 €/h
  -> se pagan esté el sillón lleno o vacío.
```

**Una hora de reposo vacía cuesta 13,96 € que ya están pagados y deja de ingresar 20,26 € de margen.**

Y ahora el tamaño del premio. Con ~400 servicios/mes (11.984 € / ~30 € de ticket neto) y un 30 %
con fase química, son **120 reposos/mes × 33 min ≈ 66 h de tiempo muerto al mes**:

| Si Mecha rellena… | Horas | Margen extra/mes | Coste del plan Estudio | ROI |
|---|---|---|---|---|
| el 15 % de los reposos | 9,9 h | **200 €** | 59 € | 3,4× |
| el 25 % | 16,5 h | **334 €** | 59 € | **5,7×** |
| el 40 % | 26,4 h | **535 €** | 59 € | 9,1× |

**Este es el argumentario de venta de Mecha, y hoy no está escrito en ningún sitio.** La landing
dice "llena los reposos del tinte"; no dice que eso vale 334 €/mes contra una cuota de 59 €.

## 4. Cuánto cuesta de verdad un no-show (y por qué la señal es obligatoria en el autor)

El informe dice "el no-show es letal" pero no lo cifra. Salón de autor, balayage de 160 € PVP:

```
Base imponible                 160 / 1,21          = 132,23 €
Químico NO consumido (no vino)                     =   0,00 €
------------------------------------------------------------
Margen de contribución perdido por no-show         = 132,23 €
(+ 4 h de nómina cargada ya pagada, ~40 €, hundida)
```

Salón de 4 estilistas, 2 servicios largos/día cada uno, 22 días, no-show del 10 %:

```
8 x 22 x 10 %  = 17,6 no-shows/mes  x 132,23 €  =  2.327 €/mes perdidos
```

Una señal de 30 € (19 % del PVP) es el estándar del sector y lleva el no-show al 1-2 %.
Recuperación ≈ **1.860 €/mes**, contra 59 € de plan + ~123 €/mes de comisión Stripe sobre las
señales. **Neto: +1.678 €/mes.** Es un ROI de 20× y es la razón por la que el salón de autor
paga software.

**En Mecha, `citas.deposito_requerido = true` aparece 0 veces en toda la base de datos.** La
función existe, está en Estudio, está probada — y no se ha cobrado una sola señal jamás (§9).

## 5. Diferencia peluquería/barbería: lo que el informe se deja

Su tabla es correcta. Faltan dos ejes que sí condicionan el software:

- **La cola sin cita.** La barbería trabaja mucho a *walk-in*: el cliente entra y espera. Eso no
  es una agenda, es una **cola con tiempo estimado** (y un display en el local, o un WhatsApp
  "eres el 3º, ~25 min"). Mecha tiene `lista_espera` (12 filas) pero está pensada como *lista de
  espera para un hueco futuro*, no como **cola del día**. Son dos productos distintos con el
  mismo nombre.
- **La reserva recurrente.** El cliente de barbería quiere "lo mismo, cada 3 semanas, mismo día
  y hora". Mecha **ya la tiene**: `NewCitaModal.web.tsx` genera la serie y `DetalleCitaModal`
  cancela la serie entera. Pero se ha usado **4 veces en 2.011 citas**, y vive solo en el modal
  web: al generarse en cliente, ni el portal público ni Chispa pueden crear una serie. Es la
  función que más fideliza en barbería, está construida, y está apagada.

## 6. Las obligaciones legales: la lista completa

El informe cita tres. Son las tres más grandes, pero se deja las que más veces provocan una
sanción real, y una contradicción interna que Mecha ya tiene encima.

### 6.1 Las tres que el informe sí cita (con matices)

- **Art. 34.9 ET (registro de jornada).** Correcto. Añadido importante que cambia el diseño:
  el **convenio de peluquerías** admite distribución irregular y jornada partida, así que el
  registro tiene que soportar **varias pausas por día** y que el total diario no cuadre con el
  contrato sin que eso sea una infracción. *Mecha lo hace bien:* `fichajes.tipo` ∈
  `entrada, pausa_inicio, pausa_fin, salida`, con `secuencia`, `hash`, `hash_anterior`,
  `estado`, `corrige_a` y trigger `fichajes_bloquear_cambios`. **Es la pieza mejor construida
  del producto** y la única compliance que Mecha puede defender hoy sin matices.
- **Ley 11/2021 + RD 1007/2023 (VeriFactu).** El calendario vigente tras el RD 254/2025 sitúa
  la obligación en **1 ene 2026** para contribuyentes de Sociedades y **1 jul 2026** para el
  resto (autónomos, que es el 70 % del sector). Hoy, 30 ago 2026, **ya está en vigor para todos**.
  → Esto convierte el §7 en urgente, no en importante. *Confirmar fechas con el fiscalista antes
  de usarlas en copy comercial: CLAUDE.md ya avisa de no improvisar aquí.*
- **RGPD art. 9 (alergias = dato de salud).** Correcto, y Mecha lo tiene mejor cubierto de lo
  que el informe supone: `consentimientos_cliente` con 4 tipos, `exportar_datos_cliente`,
  `exportar_datos_negocio`, `rpc_borrar_eventos_rgpd`, bucket `cliente-fotos` privado con
  signed URLs. **Pero ver §6.3: la anonimización tiene una fuga.**

### 6.2 Las que faltan en el informe

- **Reglamento (CE) 1223/2009 de productos cosméticos.** Obliga a la advertencia de PPD y —lo
  operativo— es lo que respalda que el salón haga y **documente la prueba de alergia 48 h antes**
  de una coloración a una clienta nueva. No es solo buena práctica: es lo primero que pide el
  **seguro de responsabilidad civil** cuando hay una reacción. Mecha guarda `clientes.alergias`
  como texto libre y `fichas_tecnicas_color.incidencias`; **no tiene el flujo de "prueba pendiente,
  hecha el día X, resultado"**, que es justo lo que el módulo huérfano `lib/fichas/colorAlergias.ts`
  intentaba ser (§8).
- **Plazos de conservación contradictorios.** La factura se guarda 4 años (LGT) o 6 (Código de
  Comercio); el dato de salud debe borrarse cuando deja de ser necesario. Mecha no tiene política
  de retención: **nada caduca nunca**. Una ficha de color de 2019 de una clienta que no vuelve
  sigue viva.

### 6.3 La contradicción que Mecha ya tiene: inmutabilidad fiscal vs. derecho de supresión

`cobros_prevent_delete_trigger`, `facturas_prevent_delete` y `fichajes_bloquear_cambios` hacen
los registros **inmutables**, como exige la Ley Antifraude. El art. 17.3.b RGPD lo ampara: no
hay que borrar lo que una obligación legal obliga a conservar. Hasta aquí, bien.

El problema es lo que **no** es fiscal. Leyendo `anonimizar_cliente` en producción:

```sql
-- Sí borra / anonimiza:
delete from cliente_fotos ...
delete from conversaciones_ia ...
delete from consentimientos_cliente ...
update clientes set nombre='Cliente anonimizado', alergias=null,
                    sensibilidades_cuero=null, notas=null ...

-- NO toca, y son los datos más sensibles del producto:
--   fichas_tecnicas_color   (87 filas: formula jsonb, nivel_dano,
--                            porcentaje_canas, incidencias, incidencias_tags)
--   notas_internas_cliente  (contenido libre sobre la clienta)
--   citas.notas / citas.formula_*   (el fixture del propio repo escribe
--                                    ahí "alergia PPD")
```

**Una clienta que ejerce su derecho de supresión queda anonimizada en la ficha y con su historial
clínico-capilar intacto, enlazado por `cliente_id`.** No es un riesgo teórico: `fichas_tecnicas_color.incidencias`
es exactamente donde una estilista escribe *"reacción alérgica, se suspendió el servicio"*.

Es un arreglo de una tarde y va en el bloque 0 (§11).

---

# PARTE 2 — Reauditoría contra el código y la base de datos

Todo lo que sigue está medido el 30 ago 2026 contra el proyecto de producción, no leído de
documentación.

## 7. Hallazgo A — VeriFactu: el claim

**Lo que la web promete.** No es una imprecisión de marketing: son afirmaciones explícitas,
repetidas, y **marcadas como FAQ en datos estructurados** (es decir, candidatas a salir como
respuesta destacada en Google):

| Dónde | Qué dice |
|---|---|
| `web/index.html:154` | "Facturación VeriFactu (AEAT) con cadena SHA-256, QR de cotejo **y envío a Hacienda**" |
| `web/index.html:357-360` (FAQ JSON-LD) | "¿Mecha cumple con la normativa VeriFactu de la AEAT?" → "**Sí.** […] código QR de cotejo […]" |
| `web/index.html:3481` | "VeriFactu con QR, **a la AEAT desde la propia caja**" |
| `web/index.html:2992` | "**Cumple VeriFactu 2026**" |
| `web/especificaciones.html:139` | "facturación VeriFactu **homologada por la AEAT** […] **envío** de facturas encadenadas […] **a la AEAT**" |

**Lo que el código dice de sí mismo.** Los comentarios del propio repo, escritos por el equipo,
son honestos y dicen lo contrario:

```
components/pos/CobroSheet.tsx:869-871
  // No se "firma VeriFactu" nada: el cobro se registra y el […]
  // VeriFactu aqui era prometer un alta en la AEAT que no [existe]

components/informes/FacturasRegistroSection.tsx:9
  // Lo que sigue SIN ser: una factura remitida a la AEAT. No hay alta en VeriFactu
  //   [ni QR de verificacion oficial]
```

**Lo que hay en producción.**

```
config_fiscal (2 filas para 9 negocios):
  demo_salon_001               proveedor_estado=sandbox         apoderamiento_ok=false
  florent_surez_peluqueros…    proveedor_estado=no_configurado  apoderamiento_ok=false  activo=false
  ambas: entorno_aeat = 'preproduccion'

tickets_verifactu: 1.600 filas, 3 negocios, cadena SHA-256 correcta y correlativa
  columnas: id, negocio_id, cobro_id, serie, numero, hash, hash_anterior,
            fecha_emision, payload
  -> NO EXISTE ninguna columna para estado de envío, CSV de la AEAT,
     respuesta, reintentos ni URL de cotejo del QR.
```

El minado sí funciona y es automático (trigger `cobros_mint_ticket_trigger` sobre `cobros`).
El worker de envío (`scripts/verifactu-worker.ts`, 54 líneas) es un boceto: sus propios
comentarios dicen *"Revisar manual técnico AEAT para endpoints exactos"* y *"Si esto falla en
runtime, usaremos axios"*. No está desplegado en ningún sitio.

**Diagnóstico.** Lo construido —cadena SHA-256 inalterable, numeración correlativa, tickets que
se rectifican y no se borran— es un **libro de tickets propio, sólido y útil**, que cubre la
parte de la Ley Antifraude que prohíbe el software de doble uso. **No es VeriFactu.** VeriFactu
es el envío del registro de facturación a la AEAT (o su conservación bajo el modo "no VeriFactu"
con requisitos aún más estrictos) más el QR de cotejo en la factura.

Y esto choca de frente con la decisión 5 del propio CLAUDE.md: *"Sin claims falsos"*.

**Severidad.** Máxima, y por dos vías distintas:
1. **Comercial/legal para Mecha:** publicidad de una característica de cumplimiento normativo
   que no se presta.
2. **Para el cliente:** un salón que contrata Esencial creyendo que ya cumple, y no cumple. El
   perjuicio es suyo y la expectativa se la creó Mecha.

## 8. Hallazgo B — Los módulos huérfanos

Hay lógica de negocio escrita, comentada, con tests que pasan en CI, y **cero consumidores**.
Verificado con búsqueda de importaciones en `app/`, `components/`, `lib/`, `scripts/`, `supabase/`
excluyendo los propios `.test.ts`:

| Módulo | Qué resuelve | Consumidores |
|---|---|---|
| `lib/fichas/colorAlergias.ts` | Diagnóstico de seguridad de una fórmula: alergias declaradas, sensibilidad + 30 vol, exposición > 45 min, aviso de 40 vol. **La pieza del §6.2.** | **0** |
| `lib/informes/rentabilidadSillon.ts` | Rentabilidad por puesto. **La métrica del §3.** | **0** |
| `lib/caja/verifactuHash.ts` | Cálculo y verificación del encadenamiento | **0** (la cadena real la mina el trigger SQL) |
| `lib/fiscal/huella.ts` | Huella AEAT con el formato oficial de cadena | **0** |
| `lib/agenda/desinfeccionPausas.ts` | Pausa de desinfección entre clientes | **0** |
| `lib/agenda/serviciosCompatiblesReposo.ts` | Qué servicio cabe en un reposo | **0** — pero ver nota |

Y su equivalente en la base de datos — RPCs desplegadas que **no llama ni el cliente ni otra
función**:

| RPC | Para qué se creó |
|---|---|
| `registrar_consumo_cita(cita, producto, cantidad)` | El escandallo en gramos. `cita_consumos`: **0 filas** |
| `recurso_hay_hueco` / `recursos_ocupados` / `recurso_tramo_de_cita` | El cuello de botella de cabinas y lavacabezas |
| `candidatos_para_hueco` / `asignar_candidato_hueco` | El matching de lista de espera (pendiente nº 4 del roadmap — **ya está escrito**) |
| `crear_factura_borrador` | Factura nominativa con NIF. `facturas`: **0 filas** |

**Dos lecturas distintas, y conviene no confundirlas:**

- **Duplicados superficiales.** `serviciosCompatiblesReposo.ts` (12 líneas útiles) reimplementa
  peor algo que `lib/retrasos.ts` ya hace bien y **sí está cableado** (`fasesDe`, `ventanasActivas`,
  estrategia `aprovechar_reposo`, usada en `OrganizarAgendaPanel.web.tsx` y en el Timeline).
  Igual `verifactuHash.ts` frente al trigger SQL. **Estos hay que borrarlos**: mantener dos
  implementaciones del mismo invariante es la fábrica de regresiones que describe la decisión 10
  de CLAUDE.md.
- **Valor real sin enchufar.** `colorAlergias.ts`, `rentabilidadSillon.ts`, `registrar_consumo_cita`,
  `recurso_hay_hueco`, `candidatos_para_hueco`. Aquí lo caro ya está hecho: falta el cable.

**La lección de proceso.** Un test verde sobre una función pura no demuestra que el producto
haga nada. La capa de vigilantes de Mecha (13 vigilantes, `vigilancia_bd()`, smoke) vigila
**regresiones**; nadie vigila **desconexiones**. Un vigilante nuevo de 30 líneas —"todo módulo
de `lib/` con test tiene al menos un consumidor fuera de tests, o está en una lista de exención
razonada"— habría cazado los seis. Va en el bloque 3.

## 9. Hallazgo C — La brecha de activación

Este es el hallazgo que reordena el roadmap. Estado del **único salón real** en producción
(`florent_surez_peluqueros_15004`, plan Estudio, 5 profesionales, 779 clientas):

```
Servicios en catálogo ......................  81
  de ellos con reposo configurado ..........   7   (8,6 %)
Productos en inventario ....................  ~200
  de ellos tarifados (envase + coste) ......   0   -> escandallo IMPOSIBLE
Recursos creados (lavacabezas/cabina) ......   2
  de ellos usados en una cita ..............   0
Portal público ............................. ACTIVO
  citas con canal = 'online' ...............   0
Señales: citas con deposito_requerido ......   0
```

Y en **toda** la base de datos, los cuatro negocios juntos, 2.011 citas:

```
citas con canal 'online' ...................   0
citas con deposito_requerido ...............   0
filas en cita_consumos .....................   0
filas en comisiones ........................   0
filas en facturas ..........................   0
```

**Lo que esto significa, ordenado de menos a más incómodo:**

1. **El reposo funciona y es lo único que se usa.** 34 de 189 citas del salón real (18 %) tienen
   fase de reposo, y eso con solo 7 servicios configurados de 81. La función no falla: la
   **configuración** es lo que falta. Si los 81 servicios estuvieran técnificados, ese 18 %
   subiría al 35-40 % — que es justo el 334 €/mes del §3.
2. **El portal de reserva ha producido 0 citas.** Está activo, probado con Playwright,
   con anti-abuso, con reseñas… y el salón sigue metiendo el 100 % de las citas a mano. El
   producto funciona; **nadie ha llevado la clienta hasta él** (QR en el local, enlace en el
   Instagram, firma del WhatsApp).
3. **La señal —el ROI de 20× del §4— no se ha cobrado nunca.** Ni una vez.
4. **El escandallo, los recursos, las comisiones y las facturas nominativas están al 0 absoluto.**

**Diagnóstico.** Mecha se ha estado midiendo por *funciones entregadas* y el mercado lo mide por
*funciones en uso*. Con esa vara, el pilar "App SaaS" no está al 80 %: está al **80 % construido
y ~25 % activado**. Y el trabajo que falta no es de ingeniería de funciones nuevas — es de
**onboarding, valores por defecto y activación**, que es más barato y hoy no está en el roadmap.

## 10. Reauditoría, pilar por pilar

Sustituye a la tabla de estado del informe externo. "Construido" = existe y funciona;
"Activado" = un salón real lo usa.

| Pilar / módulo | Informe decía | Construido | Activado | Nota |
|---|---|---|---|---|
| Agenda con fases activa/reposo | — | **95 %** | **~20 %** | `lib/retrasos.ts` es excelente. Falta técnificar el catálogo |
| Fichas de color | — | **90 %** | **Sí** (87 fichas) | Falta el flujo de prueba de alergia 48 h |
| Portal público de reserva | 95 % | **90 %** | **0 %** | 0 citas online en toda la vida del producto |
| Control horario art. 34.9 | — | **95 %** | **Sí** (43 fichajes) | Lo mejor del producto. Defendible tal cual |
| Caja / arqueo Z | — | **90 %** | **Sí** (1.180 cobros, 9 sesiones) | Bizum contabilizado como "online" (§11-B4) |
| **VeriFactu** | "hecho" | **40 %** | **0 %** | Cadena local sí; AEAT, QR y envío no. **§7** |
| Señales anti no-show | "hecho" | **85 %** | **0 %** | Stripe + expiración + página de pago. Sin estrenar |
| Recursos (cabina/lavacabezas) | "falta" | **60 %** | **0 %** | Tablas + 4 RPCs + UI de config. Sin cablear a disponibilidad |
| Escandallo en gramos | — | **70 %** | **0 %** | Esquema y `lib/inventario/escandallo.ts` listos; 0 productos tarifados |
| Comisiones | — | **75 %** | **0 %** | Tramos + RPC + UI de liquidaciones. 0 liquidaciones |
| Citas recurrentes | — | **70 %** | **~0 %** | Solo en el modal web. 4 series en 2.011 citas |
| Lista de espera → matching | "pendiente" | **80 %** | **0 %** | `candidatos_para_hueco` **ya existe**. Solo falta llamarla |
| Realtime | "falta" | **Hecho** | Sí | `useCitasRealtime.ts` + e2e |
| Cobro por QR / TPV | "falta" | **Hecho** | Parcial | `crear-checkout-cobro`, `terminal-cobro-intent` |
| Multi-sucursal / cadenas | — | **0 %** | — | No existe el concepto. ~5 % del mercado inalcanzable |
| Alquiler de sillón | — | **0 %** | — | Bloqueado por el diseño de la cadena fiscal (§1) |

### Defectos concretos encontrados de paso

- **`disponibilidad_publica` fija `v_tz := 'Europe/Madrid'`** aunque la zona del salón sí es
  configurable (`negocio_config.config->>'timezone'`, y `avisos_del_negocio` la lee bien). Un
  salón canario ofrece huecos con **1 hora de desfase** en su portal público.
- **`disponibilidad_publica` no consulta `recurso_hay_hueco`.** Ofrece un hueco aunque las dos
  pilas de lavacabezas estén ocupadas — exactamente el cuello de botella del salón mixto que
  describe el informe.
- **Bizum se guarda en `online_cents`** (292 cobros, 10.494 €). El arqueo Z lo suma como "online",
  pero **Bizum entra en la cuenta del salón al instante y Stripe llega a T+2 neto de comisión**:
  son dos conciliaciones bancarias distintas metidas en una sola cifra, que por eso nunca cuadra.

---

# PARTE 3 — La solución

Cuatro bloques, en orden de ejecución. El criterio de orden no es la dificultad: es
**riesgo primero, activación después, funciones nuevas al final**.

## 11. El plan

### Bloque 0 — Riesgo. Esta semana. (Carlos) — ✅ HECHO el 30 ago 2026

> **Lo que se hizo, y lo que enseñó.** Commit `16927001`. Reescritas las 37 apariciones del
> claim en `index.html` (texto y los 6 bloques JSON-LD), `especificaciones.html`,
> `carta-comercial.html`, `terminos.html`, el prompt de `chispa-landing`, la base de
> conocimiento de la demo y `lib/planes.ts`. Dos migraciones validadas contra producción en
> una transacción revertida (el portal siguió devolviendo sus 52 huecos). Vigilantes: ya son
> 15; `npm run vigilar` da 0 bloqueantes y 133/133 tests pasan.
>
> Tres cosas que no estaban en el plan y salieron al hacerlo:
>
> 1. **Un segundo claim falso, en el prompt del asistente:** *"DOS PLANES DE SOFTWARE, mismo
>    contenido en los dos"*, listando señales, campañas y lista de espera. Es la trampa que
>    CLAUDE.md da por corregida — viva en el único de los tres sitios donde `planes.mjs` no
>    miraba. `precios.mjs` sí lee el prompt (para los números); `planes.mjs` no lo leía (para
>    el contenido). **Un vigilante con un punto ciego es peor que ninguno, porque da por
>    cerrado justo lo que vigila.** Arreglado: ahora mira los tres sitios, y se comprobó que
>    caza los cuatro claims del texto viejo.
> 2. **`\w` en JavaScript no incluye acentos**, así que el vigilante nuevo dejaba pasar
>    *"adaptado a los requisitos **técnicos** de la AEAT"* — la comadreja exacta que estaba
>    publicada. En un vigilante escrito en español eso es un fallo de clase, no un caso borde.
> 3. **Cinco páginas de `web/` que no enlaza nadie** (`index_v4`, `index_v5`, `diseno-*`)
>    publican 24 claims viejos; una llega a decir *"9 facturas VeriFactu enviadas a la AEAT"*.
>    El dominio sirve la carpeta entera, así que son públicas e indexables. Salen como aviso;
>    el arreglo bueno es borrarlas, como ya se hizo con `demo_v2.html`, y esa es decisión del
>    equipo.
>
> Y un dato que quita urgencia a una parte: **ninguna clienta se había anonimizado todavía**,
> así que la fuga del RGPD no dejó backlog que reparar. El arreglo es solo hacia delante.

**0.1 · Alinear el claim de VeriFactu con la verdad — hoy.**
Mientras el envío a la AEAT no exista, ninguna superficie puede decir "envío a Hacienda",
"homologado por la AEAT", "QR de cotejo" ni "cumple VeriFactu". Hay que tocar a la vez, como
manda el patrón de invariante repartido de CLAUDE.md:
`web/index.html` (secciones + **JSON-LD, incluido el FAQ**), `web/especificaciones.html`,
`lib/planes.ts` (`FUNCION_LABEL.verifactu`) y el `SYSTEM_PROMPT` de `chispa-landing`.
(Los manuales de `lib/manuals/` no mencionan VeriFactu: comprobado, no hay que tocarlos.)

Redacción honesta y **que sigue vendiendo** — porque lo construido tiene valor real:

> **Libro de tickets inalterable.** Cadena SHA-256 y numeración correlativa según el RD 1007/2023:
> los tickets no se borran, se rectifican. Es la base del registro de facturación exigido por la
> Ley Antifraude. *El envío automático a la AEAT y el QR de cotejo llegan en [fecha]; tu histórico
> se enviará sin que tengas que hacer nada.*

Y un **vigilante nuevo** (`scripts/vigilantes/claims-fiscales.mjs`, bloqueante) que falla si
esas palabras reaparecen en cualquier superficie pública. El ancla **no** es
`config_fiscal.proveedor_estado` —la capa 1 no toca red— sino `lib/fiscal/estadoVerifactu.ts`,
un fichero nuevo con `ENVIO_AEAT_DISPONIBLE = false` que se pone a `true` **en el mismo commit
que despliega el worker**. Primero funciona, luego se anuncia.

Perdona a propósito la redacción honesta que NOMBRA lo que falta ("el envío a la AEAT está en
desarrollo"): un vigilante que obliga a callarse en vez de a ser exacto es peor que no tenerlo.

**0.2 · Tapar la fuga de `anonimizar_cliente`.**
Una migración. Añadir al RPC: borrado de `fichas_tecnicas_color` y `notas_internas_cliente` del
cliente, y limpieza de `citas.notas` / `citas.formula_*` de sus citas (la fila de la cita se
conserva por el vínculo con el cobro; el texto libre, no). Test en `tests/e2e` que anonimice y
compruebe que no queda ni una fila con `cliente_id` en las tres tablas.

**0.3 · La zona horaria del portal.**
`disponibilidad_publica` debe leer `negocio_config.config->>'timezone'` con
`coalesce(..., 'Europe/Madrid')`. Tres líneas. Hoy un salón canario da citas mal.

### Bloque 1 — Cerrar VeriFactu de verdad (Alexandro, 3-4 semanas)

Es la única forma de sostener el precio de Esencial, que **vende VeriFactu como incluido**.

1. **Migración de esquema, con la decisión que no se puede deshacer.** Añadir a `tickets_verifactu`:
   `estado_envio` (`pendiente|enviado|aceptado|rechazado|anulado`), `csv_aeat`, `respuesta_aeat jsonb`,
   `enviado_at`, `intentos`, `qr_url`. Y **encadenar por `(negocio_id, nif_emisor, serie)`**, no
   por `negocio_id` — es lo que deja la puerta abierta al alquiler de sillón (§1) y cambiarlo
   después es imposible.
2. **El QR de cotejo primero.** Es la parte visible para el cliente final, se genera en local
   (URL de cotejo de la AEAT con NIF + nº de factura + fecha + importe) y **no depende del
   apoderamiento**. Va en `lib/caja/ticketPdf.web.ts`, que hoy ya avisa en un comentario de que
   no lo lleva.
3. **El worker real.** `scripts/verifactu-worker.ts` hay que rehacerlo: `undici.Agent` con mTLS
   (el `...{agent}` sobre `fetch` nativo que hay ahora no funciona y el propio comentario lo
   admite), SOAP contra el endpoint de preproducción, reintentos con backoff, idempotencia por
   `ticket_id`. Como edge function o como cron, no como script suelto.
4. **Lo que no es código y bloquea todo lo demás:** el sello de entidad como Colaborador Social,
   el apoderamiento y la declaración responsable. **Empezar por aquí**, no por el código: es lo
   que tiene plazo externo.
5. **Reutilizar los huérfanos** `lib/fiscal/huella.ts` y `lib/fiscal/xmlAlta.ts` en vez de
   reescribirlos, y **borrar** `lib/caja/verifactuHash.ts` (duplica el trigger SQL).

### Bloque 2 — Activación: que lo construido se use (Carlos, 2-3 semanas) ← **el mayor ROI del plan**

Nada nuevo. Solo hacer que los 81 servicios se conviertan en 81 servicios técnificados sin que
la dueña teclee nada.

1. **El técnificador de catálogo.** Una pasada de IA (por la puerta única `openrouterClient.ts`)
   sobre `servicios` que proponga, servicio a servicio: `duracion_activa_min`,
   **`duracion_espera_min`** y `recurso_tipo`/`recurso_fase`. "Mechas con papel de plata" → 45
   activa / 35 reposo / lavacabezas en fase final. La dueña **revisa y acepta en bloque**; no
   rellena 81 formularios. *Esta sola pantalla es la que convierte el 8,6 % en 100 %, y con él
   los 334 €/mes del §3.*
2. **Tarifar el inventario igual.** ~200 productos sin `capacidad_envase` ni `coste_envase_cents`.
   Con el código de barras y la marca, la IA propone envase y coste; la dueña confirma. Sin esto
   el escandallo **no puede existir**, por bien escrito que esté `lib/inventario/escandallo.ts`.
3. **Llevar la clienta al portal.** 0 reservas online no es un fallo del portal. Falta el
   material: QR imprimible para el mostrador y el espejo, texto listo para la bio de Instagram,
   firma de WhatsApp, y un aviso en la campana cuando lleven 30 días con el portal activo y 0
   reservas. Es marketing dentro del producto, no ingeniería.
4. **Encender la señal donde duele.** Un aviso en la agenda: *"12 servicios de más de 90 € sin
   señal este mes. Un no-show te cuesta 132 €. ¿Activo la señal de 30 € para estos?"*, con un
   botón que ponga `prepago_requerido` en esos servicios. Todo el motor ya existe.
5. **La cifra del reposo, visible.** Enseñar en Informes lo que se ha ganado rellenando reposos y
   lo que queda sobre la mesa. Enchufar `lib/informes/rentabilidadSillon.ts`, que lleva escrito
   desde hace meses sin que nadie lo vea.

### Bloque 3 — Enchufar los huérfanos (Carlos, 1-2 semanas)

1. **Recursos en la disponibilidad.** `disponibilidad_publica` y el modal de nueva cita llaman a
   `recurso_hay_hueco`. Cierra el cuello de botella del salón mixto (10-15 % del mercado).
2. **Escandallo en el flujo de la cita.** Al cerrar una cita con fórmula, `registrar_consumo_cita`
   descuenta los gramos y `cita_consumos` deja de estar a 0. Con eso el margen por servicio pasa
   a ser real y no estimado.
3. **Matching de lista de espera.** El pendiente nº 4 del roadmap **ya está escrito**:
   `candidatos_para_hueco` + `asignar_candidato_hueco`. Falta dispararlo al cancelar una cita y
   enchufarlo al motor de avisos que Alexandro ya tiene funcionando.
4. **Prueba de alergia 48 h.** Enchufar `lib/fichas/colorAlergias.ts` a la ficha y a la creación
   de cita: si es coloración + clienta nueva o con sensibilidad declarada → propone la prueba,
   la agenda 48 h antes y la registra. Cubre el §6.2 y es un argumento de venta y de seguro.
5. **Borrar los duplicados** (`serviciosCompatiblesReposo.ts`, `verifactuHash.ts`) y **añadir el
   vigilante de módulos desconectados** del §8.

### Bloque 4 — Las funciones que faltan

Esto ya no son erratas: son funciones que el salón necesita y Mecha no tiene. Están
especificadas una a una —modelo de datos, reglas, UI, orden de migración y criterio de
aceptación— en **`informes/SPECS-LO-QUE-FALTA-2026-08-30.md`**. Resumen:

| # | Spec | Coste | La carencia, en una línea |
|---|---|---|---|
| **1** | **Reposos asíncronos múltiples** | Alto | El foso de Mecha son 4 marcas de tiempo en `citas`: **un solo reposo**. Un balayage tiene dos, y una permanente también |
| **2** | **Gramajes de verdad** | Alto | `inventario.unidades` es `integer` y `cita_consumos.cantidad` también: **no se pueden restar 35 g de un bote de 60** |
| 3 | Fórmula ligada al producto | Medio | Las 87 fichas guardan `{gramos:"30", numero:"6.2"}` — texto, y sin `producto_id`. Es el puente que le falta a la 2 |
| 4 | Reloj de reposo en vivo | Bajo | Mecha planifica el reposo y no lo cuenta. El tinte pasado de tiempo es el fallo nº 1 de cabina |
| 5 | Prueba de alergia 48 h | Bajo | Reglamento 1223/2009 y el seguro de RC. `colorAlergias.ts` ya está escrito y huérfano |
| 6 | Bono con calendario de sesiones | Medio | `bonos` es un contador; la estética vende «la sesión 3 de 10 el jueves» |
| 7 | Cola del día (walk-in) | Medio | `lista_espera` mira al futuro. La barbería trabaja a puerta |
| 8 | Reserva de grupo (novia, comunión) | Medio | Ticket de 400-900 €, el más alto del año, hoy cuadrado a mano |
| 9 | Recursos en la disponibilidad | Bajo | Las 5 RPC están desplegadas y no las llama nadie |
| 10 | Bizum como método propio | Bajo | 292 cobros en `online_cents` que no cuadran con ningún extracto |
| 11 | Comisiones: cerrar el ciclo | Bajo | Se calcula y no se liquida: 0 filas en `comisiones` |
| 12 | Series al servidor | Bajo | Solo en el modal web: ni el portal ni Chispa pueden crear una, y no es atómico |
| 13 | Retención y caducidad | Medio | Hoy no caduca nada: fichas de color de 2019 de clientas que no vuelven |
| 14 | Alquiler de sillón (multi-NIF) | Alto | **Condiciona la decisión de encadenado del bloque 1, que no se deshace** |

Multi-sucursal (las cadenas, ~5 % del mercado) sigue fuera: es otro producto y otro comprador.

**Las dos grandes tienen la misma forma, y por eso no se hacen a la vez:** una tabla nueva
(`cita_fases`, `cantidad_base`), las columnas viejas degradadas a resumen mantenido por
trigger, y los lectores migrados de uno en uno. Así el día del despliegue nada de lo viejo se
entera. Comparten el cierre de la cita, así que chocarían.

## 12. Encaje con el pricing (que no cambia)

Todo lo anterior cabe en la tabla actual sin tocar un precio. Solo hay **una** decisión de
reparto, y es de coherencia, no de precio:

| Bloque | Plan | Razón |
|---|---|---|
| VeriFactu completo (envío + QR) | **Esencial** | Ya está prometido ahí. Moverlo a Estudio sería subir el precio por la puerta de atrás |
| Prueba de alergia 48 h | **Esencial** | Va con `clientes`, y es seguridad, no lujo |
| Bizum, recurrentes, cola del día | **Esencial** | Son caja y agenda |
| Técnificador de catálogo e inventario | **Ambos** | Es onboarding: cuanto antes active el salón, antes deja de plantearse la baja |
| Recursos, escandallo, matching de espera, rentabilidad por sillón | **Estudio** | Coherente: inventario y lista de espera ya son Estudio |
| Bonos con calendario | **Estudio** | Va con el bloque de estética |
| Multi-sucursal / alquiler de sillón | **Fuera de la tabla** | Otro producto y otro comprador. Precio por sede, cuando exista |

**Y un aviso sobre el reparto:** `lib/planes.ts` es la fuente única y `scripts/vigilantes/planes.mjs`
la vigila. Toda función nueva de esta lista entra en `PLAN_FUNCIONES` **en el mismo commit** que
la construye. La trampa de los cuatro textos diciendo "el mismo software" mientras el código
gateaba seis funciones no puede repetirse.

## 13. Orden recomendado

```
HECHO        B0   Claim VeriFactu + fuga RGPD + zona horaria       Carlos      RIESGO
Semana 1     B1.1 Apoderamiento AEAT (papeleo, es lo que tiene     Alexandro
                  plazo externo: empezar por aqui, no por codigo)
Semanas 2-4  B2   Tecnificador + tarifar inventario + QR del       Carlos      ROI
                  portal  -> es lo que da DATOS a las specs 1 y 2
Semanas 2-5  B1   VeriFactu real (esquema -> QR -> worker -> AEAT) Alexandro   RIESGO
                  El esquema decide el encadenado: (negocio_id,
                  nif_emisor, serie). Esa no se deshace.
Semanas 5-6  B3   Enchufar huerfanos + vigilante de desconexion    Carlos
                  specs 9, 12, 10, 11 -- baratas y validan patron
Semana 7+    B4   Las specs grandes, en este orden:
                    3 formula->producto  (prepara la 2)
                    1 reposos multiples  (la grande de agenda)
                    2 gramajes           (encima de la 3)
                    4 reloj de reposo    (cae solo con la 1)
                    5, 13, y 6/7/8 segun lo que pida el cliente
```

**Las tres frases con las que quedarse:**

1. **Lo urgente no era construir: era dejar de prometer a Hacienda lo que no se hace, y dejar
   de guardar datos de salud de quien pidió que se borraran.** Hecho el 30 ago.
2. **Lo rentable no es una función nueva: es que las 81 filas del catálogo de un salón real
   tengan puesto el reposo.** Eso vale 334 €/mes para el salón, contra una cuota de 59 €, y hoy
   está al 8,6 %.
3. **Y de las catorce specs, ninguna se da por hecha cuando compila: se da por hecha cuando el
   salón real la ha usado una vez.** Es la lección del hallazgo C, y aplica igual a lo que se
   construya a partir de ahora. Si al empezar una spec no se sabe decir quién la va a activar y
   cómo se entera de que existe, esa spec todavía no está lista para empezarse.

---

*Medido contra `vtrggiogjrhqtwbhbgia` y contra el árbol de `master` el 30 ago 2026. Las
referencias de calendario fiscal deben confirmarse con el fiscalista antes de usarse en copy
comercial (CLAUDE.md, pendiente nº 7).*
