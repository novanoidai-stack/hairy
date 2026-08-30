# Lo que le falta a Mecha para ser el software entero de un salón — specs

> Complemento de `informes/ESTUDIO-SECTORIAL-Y-REAUDITORIA-2026-08-30.md`, que audita
> **lo que hay**. Esto es **lo que falta**: funciones, no erratas. Cada spec sale de una
> carencia comprobada contra el esquema de producción (`vtrggiogjrhqtwbhbgia`, 30 ago 2026),
> no de una lluvia de ideas.
>
> **El pricing no cambia.** El §15 reparte cada spec entre Esencial y Estudio.
>
> Formato de cada una: el problema con su evidencia · el modelo de datos · las reglas ·
> la UI · el orden de migración · cómo se sabe que está hecha.

## Índice y tamaño

| # | Spec | Coste | Por qué ahora |
|---|---|---|---|
| **1** | **Reposos asíncronos múltiples** | Alto | El foso de Mecha soporta hoy UN reposo. Un balayage tiene dos |
| **2** | **Gramajes de verdad en inventario** | Alto | El inventario es `integer`: no puede restar 35 g de un bote de 60 |
| 3 | Fórmula ligada al producto | Medio | El puente que falta entre la ficha de color y el stock |
| 4 | Reloj de reposo en vivo | Bajo | El tinte pasado de tiempo es el fallo nº 1 de cabina |
| 5 | Prueba de alergia 48 h | Bajo | Reglamento 1223/2009 y el seguro de RC |
| 6 | Bono con calendario de sesiones | Medio | El 60 % de la facturación de la estética |
| 7 | Cola del día (walk-in) | Medio | El flujo real de la barbería |
| 8 | Reserva de grupo (novia, comunión) | Medio | Ticket de 400-900 € que hoy se cuadra a mano |
| 9 | Recursos en la disponibilidad | Bajo | Las RPC ya existen y no las llama nadie |
| 10 | Bizum como método propio | Bajo | 292 cobros que no cuadran con ningún extracto |
| 11 | Comisiones: cerrar el ciclo | Bajo | Tramos y RPC hechos, 0 liquidaciones |
| 12 | Series al servidor | Bajo | Existe solo en el modal web: 4 usos en 2.011 citas |
| 13 | Retención y caducidad de datos | Medio | Hoy no caduca nada |
| 14 | Alquiler de sillón (multi-NIF) | Alto | **Condiciona una decisión de esquema que no se deshace** |

---

## 1 · Reposos asíncronos múltiples

### El problema

El diferencial nº 1 de Mecha —vender el tiempo muerto del tinte— está construido sobre
**cuatro marcas de tiempo en la fila de la cita**:

```
citas: inicio · fin_activa · fin_espera · fin
       └ activa ┘└ reposo  ┘└ final ────┘
```

Eso son **exactamente tres fases y un solo reposo**. Y el trabajo técnico real casi nunca
tiene uno solo:

| Servicio | Fases reales |
|---|---|
| Balayage con matiz | aplicación 45 → **reposo 40** → lavado 10 → matiz 15 → **reposo 10** → secado 35 |
| Permanente | montaje 40 → **reposo 20** → neutralizado 10 → **reposo 10** → lavado y peinado 25 |
| Mechas + tratamiento | papeles 50 → **reposo 35** → lavado 10 → K18 5 → **reposo 10** → acabado 30 |
| Alisado de keratina | lavado 15 → aplicación 30 → **reposo 30** → planchado 60 |

Con el modelo de hoy, la segunda pausa se pierde: o se mete dentro de la fase «final» (y el
profesional aparece ocupado media hora que está libre — se deja de vender justo lo que Mecha
existe para vender), o se parte la cita en dos y se pierde la unidad de la clienta.

Y falta la otra mitad de la palabra, **asíncrono**: hoy las fases son un plan fijo escrito al
crear la cita. En cabina eso no se cumple nunca — la colorista mira la mecha y decide que le
faltan diez minutos. Mover ese límite hoy obliga a arrastrar el bloque entero, y con él todo
lo que se le había encajado dentro.

**La spec canónica ya lo pedía.** `.claude/skills/hairy-agenda-rules` describe tres tipos de
fase —activa, **reposo** y **transición**— y dice que «un bloque de cita puede verse partido
en activa-reposo-activa». La transición (lavar, preparar) no existe como concepto en la base
de datos: hoy se come dentro de una activa.

### El modelo de datos

```sql
create table cita_fases (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    text not null,
  cita_id       uuid not null references citas(id) on delete cascade,
  orden         smallint not null,
  tipo          text not null check (tipo in ('activa','reposo','transicion')),
  inicio        timestamptz not null,
  fin           timestamptz not null,
  -- Quien atiende ESTA fase. Distinto por fase = servicio encadenado
  -- multiprofesional nativo (color con A, peinado con B) sin grupo_id.
  profesional_id uuid references profesionales(id),
  -- La clienta sigue sentada durante el reposo: ocupa sillon aunque no ocupe
  -- profesional. Por eso el recurso se declara POR FASE y no por servicio.
  recurso_tipo   text,
  etiqueta       text,                  -- "aplicación", "matiz", "neutralizado"
  -- Reloj real (spec 4): cuando se pulsa de verdad.
  iniciada_at    timestamptz,
  cerrada_at     timestamptz,
  unique (cita_id, orden)
);
```

Y la plantilla, en el catálogo:

```sql
alter table servicios add column fases jsonb;
-- [{"tipo":"activa","min":45,"etiqueta":"aplicación","recurso_tipo":null},
--  {"tipo":"reposo","min":40},
--  {"tipo":"transicion","min":10,"etiqueta":"lavado","recurso_tipo":"lavacabezas"},
--  {"tipo":"activa","min":15,"etiqueta":"matiz"},
--  {"tipo":"reposo","min":10},
--  {"tipo":"activa","min":35,"etiqueta":"secado"}]
```

### La migración, que es la parte delicada

Hay 2.011 citas vivas y **seis sitios** que leen las cuatro marcas
(`disponibilidad_publica`, `citas_normalizar_fases`, `lib/retrasos.ts`, el Timeline, el
organizador y `revisar_hueco_lista_espera`). Reescribirlos a la vez es cómo se rompe una
agenda en producción.

**Se hace al revés: las cuatro columnas se quedan y pasan a ser un RESUMEN mantenido por
trigger desde `cita_fases`.**

```
inicio       = min(fase.inicio)
fin          = max(fase.fin)
fin_activa   = fin de la PRIMERA fase activa
fin_espera   = fin del PRIMER reposo
```

Con eso, el día que se despliega, **todo lo viejo sigue funcionando exactamente igual** para
citas de un solo reposo, y las de varios se ven degradadas (correctas pero conservadoras: se
pierde la venta del segundo reposo, no se corrompe nada). Después se van migrando los seis
lectores de uno en uno, con su vigilante. Cuando el último lea `cita_fases`, las cuatro
columnas se quedan como caché de lectura o se retiran.

Migración de datos: una fila `activa` + una `reposo` + una `activa` por cada cita existente,
derivadas de sus marcas. Reversible.

### Las reglas

1. **Solape real = activa contra activa** del mismo profesional. Activa sobre `reposo` de otra
   cita es válido y es el producto (`lib/retrasos.ts` ya lo dice así: `ventanasActivas` excluye
   el reposo a propósito).
2. **`transicion` ocupa al profesional** (lavar es trabajo) pero es **partible**: si hay que
   meter algo, la transición se puede desplazar dentro de su reposo anterior. Es la única fase
   con holgura.
3. **El reposo ocupa recurso, no profesional.** Es la regla que hoy no existe y por la que la
   clienta de la tercera pila espera con el color pasado (spec 9).
4. **Estirar un reposo empuja solo lo suyo.** Alargar la fase `k` desplaza `k+1..n` de esa cita
   y dispara la cascada de `lib/retrasos.ts` sobre lo que se hubiera encajado dentro. La cita
   entera NO se mueve: su `inicio` no cambia.
5. **Una cita sin `cita_fases` es legal** y significa una sola fase activa. La agenda no puede
   exigir que se técnifique todo el catálogo para funcionar.

### La UI

- El bloque se dibuja en N tramos, no en tres. Reposo con el tratamiento visual que ya define
  `designTokens`; **transición con el suyo propio**, que hoy no existe.
- Arrastrar **el borde entre dos fases** reparte minutos entre ellas sin mover la cita.
- En cada reposo, la cinta de «aquí cabe»: los servicios que entran (esto es lo que el módulo
  huérfano `lib/agenda/serviciosCompatiblesReposo.ts` quiso ser; se rehace bien y se borra).
- Móvil: las fases se apilan; el borde arrastrable pasa a ser dos botones de ±5 min, porque
  arrastrar un borde de 3 px con el dedo manchado de tinte no funciona.

### Hecha cuando

- Un balayage con dos reposos se guarda, se pinta y se puede encajar algo **en los dos**.
- Estirar el primer reposo 10 min no mueve el `inicio` ni rompe lo encajado en el segundo.
- `disponibilidad_publica` ofrece huecos dentro del segundo reposo.
- Las 2.011 citas existentes se ven idénticas a antes de la migración (test de regresión con
  captura previa).

---

## 2 · Gramajes de verdad en el inventario

### El problema

Está escrito por todas partes que Mecha descuenta gramos de tinte, y **el esquema no puede**:

```
inventario.unidades               integer      ← el stock son botes enteros
movimientos_inventario.unidades   integer
cita_consumos.cantidad            integer      ← ni siquiera admite 12,5 g
cita_productos.cantidad           integer
```

Un tubo de tinte son 60 g y una cobertura de canas gasta 35. Con `integer` solo hay dos
respuestas posibles: restar un tubo entero (y el stock miente por 25 g cada servicio) o no
restar nada. Hoy no resta nada: **`cita_consumos` tiene 0 filas** y **0 productos tienen
`capacidad_envase` puesto** en el único salón real.

Lo llamativo es que la mitad cara ya está hecha y bien hecha: `productos` tiene
`unidad_medida`, `capacidad_envase` y `coste_envase_cents`; `lib/inventario/escandallo.ts`
calcula en **micros de euro** —y su comentario explica por qué no en céntimos: un gramo cuesta
0,1417 €, redondear a 0,14 desvía casi un 2 % en 50 g y mucho más en una decoloración de 200.
Ese cuidado está perfecto. Lo que falta es que alguien pueda guardar el 12,5.

### El modelo de datos

```sql
-- El stock deja de contar botes y pasa a contar unidad base (g, ml o ud).
alter table inventario            add column cantidad_base numeric(12,3);
alter table movimientos_inventario add column cantidad_base numeric(12,3);
alter table cita_consumos          alter column cantidad type numeric(10,2);

-- El bote ABIERTO. Sin esto no se puede restar 35 g: o descuentas un tubo
-- entero o no descuentas. Un salón tiene siempre uno empezado de cada tono.
alter table inventario add column envases_cerrados integer default 0;
alter table inventario add column abierto_restante numeric(10,2);

-- Merma: lo que queda en el bol y en el tinte del guante. El sector cuenta
-- entre un 5 y un 15 %. Sin declararla, el escandallo sale siempre optimista.
-- Va en negocio_config.config (jsonb), que es donde viven los ajustes del salon:
--   config->>'merma_pct'   por defecto 8
```

`inventario.unidades` se queda un tiempo como resumen (`ceil(cantidad_base / capacidad_envase)`)
para no romper las pantallas de stock, igual que en la spec 1.

### Las reglas

1. **Se consume del bote abierto primero.** Si `abierto_restante < lo pedido`, se cierra ese
   envase, se abre otro (`envases_cerrados -= 1`) y se sigue. El movimiento queda con las dos
   líneas, para que un arqueo de stock se pueda seguir a mano.
2. **La merma se aplica al consumo, no a la venta.** 35 g de fórmula con 8 % de merma
   descuentan 37,8 g de stock y **cuestan 37,8** en el escandallo. El margen que se enseña es
   el real, no el teórico.
3. **Un producto sin tarifar no cuenta como cero.** `escandallo.ts` ya lo hace bien
   (`sinTarifar`); la UI tiene que decir «faltan datos de X» y no un margen que parece bueno
   solo porque falta media fórmula.
4. **El oxidante también es producto.** Hoy solo se guarda su volumen (20, 30, 40). Una garrafa
   de 1.000 ml a 8 € son 0,008 €/ml y una decoloración se lleva 200. Sin él, el escandallo de
   una decoloración se equivoca en más que el tinte.
5. **Stock negativo se permite y se avisa**, no se bloquea: en un salón el bote existe aunque
   nadie lo haya dado de alta, y una caja que no deja cobrar es una caja que se deja de usar.

### La UI

- En el cierre de la cita, la fórmula ya escrita (spec 3) trae sus gramos: un toque en
  «descontar» y se acabó. **Sin pantalla nueva.** Si esto pide teclear, no se usará jamás.
- En la ficha del producto: envase, coste y **coste por gramo calculado**, que es la cifra que
  la dueña nunca ha visto y la que le cambia la conversación con el proveedor.
- En Informes: margen real por servicio, y el aviso que lo justifica todo — *«las mechas con
  matiz te dejan 18 € de margen; el corte, 22»*.

### Hecha cuando

- Un tinte de 35 g descuenta 37,8 g del bote abierto y deja 22,2 g, no un tubo.
- `cita_consumos` deja de estar a 0 en el salón real.
- El margen por servicio de Informes cuadra a mano con un escandallo hecho en papel.

---

## 3 · La fórmula ligada al producto

### El problema

Es el puente que falta entre las specs 1-2 y lo que ya existe. Las 87 fichas de color de
producción guardan la fórmula **ya estructurada**:

```json
[{"gramos": "30", "numero": "6.2"}, {"gramos": "20", "numero": "7.1"}]
   marca_producto: "Wella"   ·   oxidante_volumen: 30
```

Dos cosas la dejan a medias: `gramos` es **texto** (no se puede sumar), y `numero` es el tono
de la carta, **no un `producto_id`**. Así que el sistema sabe que se gastaron 30 g del 6.2 de
Wella y no sabe **qué bote** del inventario es ese. Sin ese puente, la spec 2 no puede
descontar nada.

Y la parte difícil ya está construida: `color-formula-parser` convierte lo que la colorista
dicta o una foto de la fórmula escrita a mano en esa estructura, con cortafuegos de salud
incluido; `traductor-marcas` pasa una fórmula entre fabricantes.

### El modelo

```sql
alter table productos add column tono text;          -- "6.2"
alter table productos add column marca text;         -- "Wella"
create unique index on productos (negocio_id, marca, tono) where tono is not null;
```

Y la fórmula pasa a `[{"producto_id": "...", "tono": "6.2", "gramos": 30}]`, con `tono`
conservado como texto por si el producto se borra: **la ficha de color de una clienta tiene que
sobrevivir a que el salón cambie de proveedor.**

Resolución `marca + tono → producto_id` en una RPC, y cuando no case, la fila se guarda igual
con `producto_id` nulo y sale en el aviso de «tarifa tu inventario».

### Hecha cuando

- Dictar «treinta de seis dos con veinte volúmenes» deja la fórmula guardada, resuelta contra
  el inventario y con su coste en euros.
- **«Repetir la fórmula de la última vez»** es un botón. Es la función que más pide el sector
  (la clienta vuelve a los 4 meses y la fórmula exacta es lo que la retiene) y hoy no está.

---

## 4 · Reloj de reposo en vivo

**El problema.** El fallo nº 1 de cabina no es de agenda, es de reloj: el tinte que se pasa de
tiempo. Hoy Mecha planifica el reposo y no lo **cuenta**.

**El modelo.** Ya está en la spec 1: `cita_fases.iniciada_at` / `cerrada_at`.

**Las reglas.** Al pulsar «empieza el reposo» corre el temporizador real. A falta de 5 min,
aviso a quien atiende. Pasado el tiempo, aviso rojo escalado a toda la barra. Y —esto es lo
que lo hace valioso y no un cronómetro— **el desvío se guarda**: `cerrada_at - iniciada_at`
contra lo planificado alimenta la duración estimada de ese servicio para ese profesional
(`duraciones_profesional`, hoy con 0 filas). El catálogo se técnifica solo con el uso.

**Hecha cuando.** Un reposo pasado de tiempo se ve desde la otra punta del salón, y a los dos
meses la duración estimada de «mechas» se parece a la que esa colorista tarda de verdad.

---

## 5 · Prueba de alergia 48 h

**El problema.** El Reglamento (CE) 1223/2009 sostiene la advertencia de PPD, y el seguro de
responsabilidad civil pide la prueba documentada antes de una coloración a una clienta nueva.
Mecha guarda `clientes.alergias` como texto libre y `fichas_tecnicas_color.incidencias`, pero
no tiene el flujo. El módulo `lib/fichas/colorAlergias.ts` —que evalúa alergias declaradas,
sensibilidad de cuero con 30 vol y exposición de más de 45 min— **existe, tiene tests y no lo
importa nadie**.

**El modelo.**

```sql
create table pruebas_alergia (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null, cliente_id uuid not null,
  solicitada_at timestamptz not null default now(),
  realizada_at  timestamptz,
  resultado     text check (resultado in ('negativa','positiva','no_concluyente')),
  producto_id   uuid, profesional_id uuid, nota text
);
```

**Las reglas.** Al crear una cita de coloración para clienta nueva o con sensibilidad
declarada, se propone la prueba y se agenda 48 h antes (es una cita corta de verdad, no un
recordatorio: alguien tiene que atenderla). Un resultado `positiva` **bloquea** ese producto en
la ficha con aviso permanente. Una prueba caduca (>6 meses) se pide otra vez. **Nunca bloquea
la cita**: avisa y deja constancia de quién decidió seguir. Un software que impide trabajar se
desinstala.

**Hecha cuando.** `colorAlergias.ts` tiene consumidores, y una clienta nueva de tinte no se
puede agendar sin que salga la propuesta.

---

## 6 · Bono con calendario de sesiones

**El problema.** `bonos` guarda `sesiones_totales`, `sesiones_disponibles` y `fecha_caducidad`
— un contador. La estética pura (láser, presoterapia, tratamientos faciales) vende **la sesión
3 de 10 el jueves que viene**: el bono ES un calendario, y es el 60 % de su facturación.

**El modelo.** `bono_sesiones(bono_id, numero, cita_id, prevista_para, consumida_at)`, con la
cita de cada sesión enganchada.

**Las reglas.** Al vender el bono se pueden proponer las N citas de golpe con su cadencia (el
láser tiene intervalos clínicos: 4-6 semanas). El dinero **entra el día de la venta** y no se
reparte por sesión: es un cobro, no un ingreso diferido. Una sesión cancelada devuelve el
saldo al bono. Al quedar 2 sesiones, aviso de renovación — que es donde está el negocio.

---

## 7 · Cola del día (walk-in)

**El problema.** `lista_espera` está pensada para un hueco **futuro** (`desde`, `hasta`,
`franja`). La barbería trabaja a puerta: el cliente entra y espera. Son dos productos con el
mismo nombre. Es el segmento donde Mecha compite peor —su foso, el reposo, allí no aplica— y
donde esto es la mitad del valor.

**El modelo.** `cola_dia(negocio_id, fecha, cliente_id|nombre, servicio_id, profesional_id
null, llegada_at, llamado_at, atendido_at, estado)`.

**Las reglas.** La espera estimada sale de la cola por delante y de la duración real por
profesional (spec 4), no de una media. `profesional_id` nulo = «el primero que quede libre».
La cola convive con la agenda: un walk-in **no puede** comerse un hueco reservado, y el aviso
por WhatsApp («eres el 3º, ~25 min») usa el motor de envío que ya funciona.

---

## 8 · Reserva de grupo

**El problema.** Novia + 3 madrinas + madre: cinco personas, tres profesionales, un horario que
tiene que encajar entre sí y terminar antes de una hora fija. Ticket de 400-900 €, el más alto
del año. Hoy se cuadra a mano en cinco citas sueltas y no hay forma de cobrar una señal del
conjunto.

**El modelo.** `citas.grupo_id` **ya existe** con `orden_en_grupo`. Falta la reserva como
unidad: un `reservas_grupo(id, negocio_id, nombre, hora_fin_objetivo, senal_cents, contacto)`
del que cuelgan las citas.

**Las reglas.** Se planifica **hacia atrás** desde `hora_fin_objetivo` (la ceremonia es a las
12:00 y de ahí sale todo). Una señal por el grupo entero, no por persona. Cancelar el grupo
cancela sus citas con una sola confirmación.

---

## 9 · Recursos en la disponibilidad

**El problema.** `recursos`, `recursos_capacidad`, `recursos_ocupados`, `recurso_hay_hueco` y
`recurso_tramo_de_cita` **están desplegadas en producción y no las llama nadie**.
`servicios.recurso_tipo` y `recurso_fase` existen. `lib/recursos.ts` está cableado en
configuración y en el modal de nueva cita — pero `disponibilidad_publica` **no consulta el
recurso**, así que el portal ofrece hueco aunque las dos pilas de lavacabezas estén ocupadas.
Es el cuello de botella exacto del salón mixto, que es el 10-15 % del mercado.

**El trabajo.** Un `and public.recurso_hay_hueco(...)` en `disponibilidad_publica` y la misma
comprobación al soltar una cita en la agenda. Con la spec 1, el recurso se pide **por fase**:
el lavacabezas solo en la transición de lavado, la cabina de punta a punta.

---

## 10 · Bizum como método propio

**El problema.** 292 cobros y 10.494 € entran hoy en `online_cents` junto a Stripe. Pero Bizum
cae en la cuenta del salón **al instante** y Stripe llega **a T+2 neto de comisión**: son dos
conciliaciones bancarias distintas metidas en una cifra, y por eso el arqueo nunca cuadra.

**El trabajo.** `cobros.bizum_cents`, `sesiones_caja.teorico_bizum_cents` y su línea en
`cerrar_caja`. Migración de datos: los cobros con `metodo='bizum'` mueven su importe de
`online_cents` a `bizum_cents`. **Ojo al invariante que hay que preservar**:
`efectivo + datafono + online + bizum = total + propina` (la propina va dentro del método con
que se pagó; comprobado en los 1.180 cobros).

---

## 11 · Comisiones: cerrar el ciclo

`comisiones_tramos` tiene 3 filas, `calcular_comisiones_periodo` existe y
`LiquidacionesSection.tsx` la llama. **`comisiones` tiene 0 filas.** Se calcula y no se liquida.

Falta el paso final: cerrar el periodo, congelar el importe, marcar pagada y **que cada
profesional vea la suya** — que es lo que convierte la función en algo que el equipo pide usar
en vez de algo que la dueña tiene que acordarse de mirar. Con la retención y la base de
cotización, deja de ser un Excel de fin de mes.

---

## 12 · Series al servidor

Las citas recurrentes existen: `NewCitaModal.web.tsx` genera la serie y `DetalleCitaModal`
cancela la serie entera. Se han usado **4 veces en 2.011 citas**, y viven solo en el modal web:
al generarse en cliente, **ni el portal público ni Chispa pueden crear una serie**, y no hay
transacción (si falla la quinta ocurrencia, quedan cuatro sueltas).

Subirlo a RPC (`crear_serie_citas`) es barato, lo abre a los otros dos canales y hace atómico
lo que hoy no lo es. Es lo que más fideliza en barbería y en tinte de raíz.

---

## 13 · Retención y caducidad de datos

Hoy en Mecha **no caduca nada**. Una ficha de color de 2019 de una clienta que no vuelve sigue
viva, con sus alergias y sus incidencias. El RGPD pide borrar el dato de salud cuando deja de
ser necesario; la factura, en cambio, se conserva 4 o 6 años. Son plazos distintos sobre la
misma clienta y hoy no hay ninguno.

**El trabajo.** Política por negocio (con un valor por defecto sensato), un cron que anonimiza
lo vencido reutilizando `anonimizar_cliente` —ya corregida el 30 ago para que sí borre los
datos de salud— y un aviso previo al salón, porque borrar sin avisar a quien vive de su
cartera es peor que no borrar.

---

## 14 · Alquiler de sillón — y la decisión que no se deshace

**Esto no es para construir ahora. Es para no cerrarlo.**

En el alquiler de sillón el titular alquila el puesto a estilistas **autónomos**: cada uno con
su cartera, su factura y **su NIF**. Son N NIF bajo un techo. Hoy un `negocio_id` es un NIF
(`config_fiscal.nif`) y una cadena fiscal (`tickets_verifactu` encadena por `negocio_id`).
Juntarlos produce una serie ilegal con tres emisores; separarlos produce tres agendas ciegas
que se pelean por los mismos dos lavacabezas.

**La decisión, y va en el bloque 1 de VeriFactu:** encadenar por
**`(negocio_id, nif_emisor, serie)`** y no por `negocio_id`. Cuesta lo mismo hacerlo ahora, y
con 50.000 tickets emitidos ya no se puede: reencadenar es reescribir la cadena, que es
exactamente lo que la cadena existe para impedir.

Comercialmente es el mejor cliente posible: seis puestos alquilados son seis suscripciones, no
una, y el titular es el canal de venta.

---

## 15 · Reparto por plan (el pricing no cambia)

| Spec | Plan | Por qué |
|---|---|---|
| 1 · Reposos múltiples · 4 · Reloj de reposo | **Esencial** | Es la agenda, y la agenda es Esencial. El foso no se cobra aparte |
| 3 · Fórmula ligada al producto · 5 · Prueba de alergia | **Esencial** | Van con las fichas de cliente, y la prueba es seguridad |
| 10 · Bizum · 12 · Series · 7 · Cola del día | **Esencial** | Caja y agenda |
| 11 · Comisiones | **Esencial** | «equipo» ya incluye comisiones |
| 2 · Gramajes · 9 · Recursos | **Estudio** | Van con inventario, que ya es Estudio |
| 6 · Bonos con calendario · 8 · Reserva de grupo | **Estudio** | Van con señales y presupuestos, que ya son Estudio |
| 13 · Retención | **Ambos** | Es cumplimiento, no una función que se vende |
| 14 · Alquiler de sillón | **Fuera** | Otro producto y otro comprador. Precio por puesto, cuando exista |

Toda spec que se construya entra en `PLAN_FUNCIONES` de `lib/planes.ts` **en el mismo commit**,
y `scripts/vigilantes/planes.mjs` —que desde el 30 ago mira también el prompt del asistente— lo
comprueba.

---

## 16 · Orden

Las specs 1 y 2 son las grandes y las dos tienen la misma forma: **una tabla nueva, las
columnas viejas degradadas a resumen por trigger, y los lectores migrados de uno en uno.** No
se hacen a la vez — comparten el cierre de la cita y chocarían.

```
Después del bloque 0 (hecho) y en paralelo al bloque 1 (VeriFactu, Alexandro):

  Bloque 2, activación      El técnificador rellena servicios.fases y tarifa el
                            inventario. Es el que HACE FALTA para que 1 y 2
                            tengan datos con los que trabajar.
  Luego, en este orden:
    9  Recursos             barato, RPC ya hechas, valida el patrón
    12 Series · 10 Bizum    baratos, cierran deuda
    3  Fórmula → producto   prepara la 2
    1  Reposos múltiples    la grande de agenda
    2  Gramajes             la grande de inventario, encima de la 3
    4  Reloj de reposo      cae solo con la 1
    5  Prueba de alergia    independiente, se puede colar en cualquier hueco
    11 Comisiones · 13 Retención
    6  Bonos · 7 Cola · 8 Grupo   según lo que pida el primer cliente de pago
```

**Y el aviso que vale para todas.** El hallazgo C de la reauditoría es que Mecha no tiene un
problema de funciones que faltan, sino de funciones construidas que nadie usa: 0 reservas
online, 0 señales, 0 consumos, 0 liquidaciones. Ninguna de estas catorce specs se libra de eso.
**Ninguna se da por hecha cuando compila: se da por hecha cuando el salón real la ha usado una
vez.** Si al construir una spec no se sabe decir quién la va a activar y cómo se entera de que
existe, esa spec todavía no está lista para empezarse.
