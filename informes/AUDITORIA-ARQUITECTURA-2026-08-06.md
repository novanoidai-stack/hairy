# Auditoría de arquitectura del ecosistema — 6 de agosto de 2026

Repaso de punta a punta: landing → alta → login → software → portal público →
base de datos → despliegue. La pregunta era una sola: **¿hay algún fallo de
sistema que deje una función a medias o un hueco sin cubrir para un cliente de
verdad?**

Todo lo que hay aquí está comprobado contra **producción**, no leído. Cuando
digo "arreglado", quiere decir aplicado en la base de datos o desplegado, y
verificado después.

---

## 1. Lo que estaba roto y ya no lo está

### 1.1 El consentimiento de IA no se podía cambiar (y cualquiera podía cambiarlo)

`actualizar_consentimiento_ia` mueve `clientes.consiente_ia`, la bandera que
decide si los datos de una clienta pueden viajar a la IA. Material de RGPD.
Estaba rota por los dos lados a la vez:

- **Desde el software no funcionaba nunca.** La comprobación de tenant era
  `IF v_negocio <> auth.uid()`: negocio_id (texto) contra id de usuario (uuid).
  Ese operador no existe en Postgres, así que la función reventaba **siempre**
  con `operator does not exist: text <> uuid`. Y la ficha de cliente no miraba
  el error: pintaba el interruptor cambiado y en la base de datos no cambiaba
  nada. El salón creía haber quitado el consentimiento; no lo había quitado.
- **Desde fuera era una puerta abierta.** Con el rol anónimo bastaba con conocer
  el UUID de una clienta para cambiarle el consentimiento. El "rate limit" que
  había contaba filas de toda la tabla y luego ejecutaba `NULL;`, o sea nada.

**Arreglado**: dentro, la clienta tiene que ser de tu salón; fuera, hay que
traer su teléfono (la misma prueba que para ver o cancelar su cita) y hay freno
por IP. La ficha ahora enseña el error y devuelve el interruptor a su sitio.

### 1.2 La clienta no podía gestionar su cita si su teléfono tenía prefijo

`normalizar_telefono` quitaba lo que no fueran dígitos y el `00` de delante, y
ya. El mismo número daba dos resultados:

```
'+34 611 22 33 44'  ->  '34611223344'
'611223344'         ->  '611223344'
```

Y esa comparación es la que usan **todas** las pantallas públicas para saber que
una cita es tuya: verla, cancelarla, cambiarla, confirmar una oferta, pagar. El
salón guarda el teléfono con `+34` (es lo que produce el selector de país del
formulario), la clienta teclea sus nueve dígitos en el enlace que le ha llegado,
y el portal le contesta que esa cita no existe. En la base de datos había de las
dos formas a la vez (26 con `+34`, 3 pelados), así que saltaba de verdad.

**Arreglado**: se canoniza a número nacional. De paso deja de crear clientas
duplicadas cuando la misma persona reserva escribiendo el teléfono de otra forma.

### 1.3 La Migración Mágica no importaba nada

Es la función con la que un salón trae sus datos de Booksy/Fresha el primer día.
Fallaba en silencio por dos motivos a la vez:

- Los `upsert` apuntaban a índices únicos que **no existían** (`42P10`), así que
  ni un cliente ni un servicio entraban.
- Las citas y los productos se insertaban con **cinco columnas inventadas**
  (`cliente_nombre`, `servicio_nombre`, `importe_esperado`, `precio`,
  `stock_actual`): `PGRST204` en cada fila.

**Arreglado**: existen las claves y las columnas son las de verdad. Comprobado
por REST contra producción: con las columnas viejas responde `PGRST204`, con las
nuevas la cita entra; reinsertar la misma clienta la actualiza en vez de fallar.

> Queda pendiente lo que ya sabíais: el importador manda el archivo entero al
> LLM, así que si el CSV lleva notas de salud, esas notas viajan. Eso choca con
> la regla dura de "salud nunca al LLM" y es parte del rediseño aprobado.

### 1.4 Tres RPC con la versión vieja y la nueva conviviendo

Cuando dos versiones de la misma función tienen parámetros con `DEFAULT`,
PostgREST no sabe cuál quieres y devuelve `42725`. Con el cobro ya pasó en
producción en julio ("No se pudo registrar el cobro"): se arregló la llamada,
pero la versión vieja se quedó ahí, con la trampa armada para el siguiente que
llamara sin ese parámetro.

**Arreglado**: fuera las viejas de `crear_cobro_desde_cita`,
`guardar_pasarela_redsys` y `crear_resena_publica` (esta tenía **tres**, dos de
ellas accesibles anónimamente y muertas). Cero sobrecargas ambiguas ahora mismo.

### 1.5 Si la app petaba en un salón, aquí no se enteraba nadie

No había **nada**. El error se quedaba en el `console.error` del navegador de la
peluquera. La propia pantalla de error decía "nuestro equipo ya está al tanto", y
era literalmente falso. Para un software que se vende como que no falla, no
saber si falla es el agujero que tapa a todos los demás.

**Arreglado**: tabla `errores_cliente`, RPC para escribir con freno, RPC para
que solo el equipo de Mecha lea, enganche al boundary de React **y** a los
errores globales (promesas sin capturar, que se perdían enteras), y una pestaña
"Errores" en el panel de staff agrupada por huella. Purga automática a 60 días.

### 1.6 La vista de mes enseñaba datos inventados

Los festivos estaban escritos a mano (Navidad, Reyes, Hispanidad…) y salían para
todos los salones aunque ese día trabajaran; y el día 15 de cada mes ponía
"Cumpleaños Cliente", fuese verdad o no. **Arreglado**: cierres reales del salón
(`cierres_negocio`) y cumpleaños reales de la clientela.

---

## 2. Lo que está sano (comprobado, no supuesto)

| Qué | Cómo se comprobó |
|---|---|
| **Aislamiento entre salones** | Con una cuenta real de un salón, leyendo `clientes`, `citas`, `cobros`, `profesionales`, `servicios`, `profiles`, `fichajes` y `presupuestos`: **cero filas de otros salones** en las ocho |
| **RLS en todo lo multi-tenant** | Ninguna tabla con `negocio_id` sin RLS. Las cinco sin políticas son a propósito (solo service_role) |
| **Puertas anónimas** | 33 funciones ejecutables sin login, todas del portal público (reservar, reseñas, presupuestos, pagos, directorio). Ninguna sobra |
| **Cabeceras en producción** | CSP en modo bloqueo, HSTS con preload, `nosniff`, `frame-ancestors 'self'`, `object-src none` |
| **Tareas programadas** | Los 6 cron con 0 fallos en 3 días (autocompletar citas, hallazgos IA, keep-warm de voz, retención, resiembra de demo, vigilar agenda) |
| **Portal público de reservas** | Cadena completa contra producción: `portal_info` → días disponibles → huecos reales |
| **La demo compartida** | Es interactiva a propósito (crear y mover citas, crear clientas) y los bloqueos funcionan de verdad: el `DELETE` de un visitante borra **cero** filas |
| **Dominio** | `mechaa.es` → 308 a `www`; todas las páginas responden 200 |

---

## 3. Lo que sigue abierto (no lo toco: es decisión tuya)

### 3.1 🟡 El cobro está construido y desenchufado — a propósito

> **Aclaración de Carlos (6 ago)**: no se activa todavía porque falta cerrar la parte de
> facturación/alta por su lado. La base está hecha y se enciende cuando toque. O sea: no es
> un descuido, es una espera. Lo dejo escrito igual porque el día que se encienda hay una
> pieza que sigue faltando: **nadie lee el estado de la suscripción**, así que encender el
> checkout no basta para que un impago cierre el acceso.

Toda la fontanería de cobro está construida… y desenchufada:

- `crear-checkout-suscripcion` **no se llama desde ningún sitio** del software ni
  de la landing. El botón "Empezar con 1 mes gratis" abre el alta gratis y
  "Quiero el software" abre el formulario de contacto.
- `suscripcion_estado` está a `NULL` en las 18 cuentas y **nadie lo lee**: si un
  salón deja de pagar, no se le cierra nada. El acceso lo sigue dando a mano el
  panel de staff (`plan`).
- `trial_ends_at` existe y está a `NULL` en las 18: **el mes gratis no lo empieza
  nadie y no termina nunca**. Y hoy el plan `free` no incluye ninguna función,
  así que "1 mes gratis" en realidad da acceso a la demo, no al producto.

Mientras la venta sea a mano y cara a cara, esto no rompe nada. Si quieres que
Mecha se venda sola, es lo primero que hay que cerrar (y el cierre incluye qué
pasa cuando una tarjeta falla).

### 3.2 🟡 La IA del teléfono no vive en el repositorio (y no pasa nada)

Frase literal de `web/index.html`:

> «…la opción de que la IA conteste el teléfono del salón y dé cita hablando…»

No hay ni una línea de telefonía aquí: `ia_voz` es solo una etiqueta en
`lib/planes.ts` y una categoría vacía en el catálogo de IA.

> **Aclaración de Carlos (6 ago)**: eso se monta a mano para cada cliente con n8n +
> Retell, fuera de este repositorio. Así que la landing no miente: el servicio existe,
> se entrega por otra vía. Queda anotado para que el siguiente que audite esto no lo
> vuelva a marcar como agujero.

Lo que sí conviene tener presente es que, como los recordatorios (§3.3), es una
pieza **fuera del producto**: si se cae, Mecha no se entera ni lo dice. Y como
`ia_voz` no está cableado a nada, el gate de plan no la enciende ni la apaga: se
enciende dándole de alta el n8n a ese salón, a mano.

Aparte, en la misma sección: «en ambos planes los profesionales son **ilimitados**»,
mientras el software cortaba en 15. Eso lo he dejado a medio camino a propósito:
el tope ya **no es un muro escrito en el código**, vive en
`negocio_config.limiteProfesionales` (15 por defecto) y se lo subes a un salón
concreto desde el panel. Pero decidir entre cambiar el texto o quitar el límite
es cosa tuya.

Recuerda que el copy vive en **tres** sitios (`web/index.html`, el prompt de
`chispa-landing` y `carta-comercial.html`): si se cambia, se cambia en los tres.

### 3.3 🟡 Los recordatorios dependen de algo que no vigila nadie

Confirmaciones, recordatorios, avisos de retraso y peticiones de reseña **no los
manda Mecha**: los sirve la RPC `notificaciones_pendientes` y los envía un n8n
externo, que además es quien marca `marcar_notificacion_enviada`.

El contrato está bien hecho. El problema es que **no hay latido**: si ese n8n se
para, las clientas dejan de recibir confirmaciones y recordatorios, suben los
no-shows, y en Mecha no salta absolutamente nada. Y "recordatorios automáticos"
se vende dentro del plan Esencial.

Propuesta (media hora): guardar la marca de tiempo del último envío y sacar un
aviso en el panel de staff cuando haya notificaciones pendientes y ninguna
enviada en X horas.

### 3.4 🟡 La app nativa está a medias

Ocho pantallas (`caja`, `citas`, `inventario`, `campañas`, `bandeja`,
`lista-espera`, `mi jornada`, `presupuestos`, `reseñas`) son un cartel que dice
"usa la versión web". Hoy no afecta a nadie porque **no está publicada** (no hay
`eas.json` ni carpetas `ios/android`: es Expo en desarrollo). Pero tal cual no se
puede subir a las tiendas.

### 3.5 🟡 El alta autoconfirma el correo

`signup-free` crea cuentas ya confirmadas sin comprobar que el buzón sea tuyo.
Lo dejé mitigado con freno por IP (4 altas/hora). Verificar de verdad el correo
cambia el embudo de alta, y esa es una decisión de negocio.

### 3.6 ⚪ Un correo no puede estar en dos salones

Es de Supabase Auth (email único global). Si una profesional cambia de salón, el
anterior tiene que retirarle el acceso primero. Cambiarlo es rediseñar la
identidad; hoy no compensa.

---

## 4. Veredicto

Los cimientos están bien: el aislamiento entre salones aguanta de verdad, la
seguridad de la base de datos es seria (RLS en todo, triggers que protegen la
identidad, funciones con `security definer` bien acotadas) y el despliegue tiene
las cabeceras que tiene que tener.

Lo que fallaba no eran los cimientos, sino **cosas que nadie había vuelto a
mirar después de escribirlas**: una comparación de tipos que hacía reventar una
función siempre, un teléfono que no casaba consigo mismo, un importador que
escribía en columnas que no existen. Ninguno de esos fallos daba la cara: todos
fallaban en silencio, que es la peor forma de fallar. De ahí que lo más
importante que se ha arreglado hoy sea, probablemente, el registro de errores:
a partir de ahora el siguiente fallo de esta familia se ve solo.

De lo que marqué como abierto, Carlos aclaró dos cosas el mismo día: el cobro
está parado a conciencia hasta cerrar su parte de facturación, y la IA del
teléfono sí existe, montada con n8n + Retell por cliente y fuera de este
repositorio. Con eso, lo que de verdad queda pendiente es más pequeño de lo que
parecía:

- **Cuando se encienda el cobro**, que alguien lea el estado de la suscripción:
  hoy un impago no cierra nada porque el acceso depende de `plan`, que se pone a
  mano.
- **Decidir el texto de "profesionales ilimitados"** o subir el tope a los
  salones que lo necesiten (ya se hace desde el panel, sin desplegar).
- **Las piezas que viven fuera** (recordatorios por n8n, IA de teléfono con
  Retell): el latido nuevo cubre la primera; la segunda sigue sin vigilancia.
- **La app nativa**, que no se puede publicar como está.
