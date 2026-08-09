# Mensaje para Alexandro — nuevo aviso de WhatsApp: propuesta de cambio de hora

Copia y pega esto tal cual.

---

Álex, te dejo montado un flujo nuevo que necesita el envío por n8n. Va sobre lo
que ya tienes hecho para la lista de espera, así que debería ser poco trabajo.

**Qué hace.** Cuando el organizador de la agenda ve que puede adelantar la cita
de un cliente, ya no se la mueve sin más. Le propone el cambio y espera a que
conteste. Mientras tanto el hueco queda reservado y la cita sigue donde estaba.
Si acepta, se mueve. Si rechaza o no contesta a tiempo, todo se queda como está y
el hueco se libera.

**Lo que necesito de ti:** que el workflow envíe dos plantillas nuevas. Nada más.
El resto (crear la propuesta, retener el hueco, aplicar el cambio, caducar) ya
está en la base y probado.

## Dónde están los avisos

Misma tabla de siempre, `lista_espera_avisos`. **No hay tabla nueva**, lo hice así
a propósito para que sigas drenando un solo sitio. Sigue el mismo patrón: filas
con `estado = 'pendiente'`, las envías, y las marcas `estado = 'enviado'` con
`enviado_at = now()`.

Lo único nuevo son dos valores de `template` y una columna `propuesta_id`.

### Plantilla 1: `propuesta_cambio_cita`

Es la pregunta al cliente. Campos que te vienen rellenos:

| Campo | Ejemplo | Para qué |
|---|---|---|
| `telefono` | `+34612345003` | destinatario |
| `nombre` | `Sofía` | saludo |
| `salon` | `Salon Demo Mecha` | quién le escribe |
| `servicio` | `Corte caballero` | qué tiene reservado |
| `fecha` | `10/08/2026` | la fecha NUEVA que se le propone |
| `hora` | `13:00` | la hora NUEVA que se le propone |
| `ventana_texto` | `2 horas` | cuánto tiene para contestar |
| `propuesta_id` | uuid | lo necesitas para el enlace de respuesta |
| `cita_id` | uuid | por si te hace falta |

Texto sugerido (ajústalo a tu gusto):

> Hola {{nombre}}, te escribimos de {{salon}}. Nos ha quedado un hueco antes y
> podemos adelantarte tu {{servicio}} al {{fecha}} a las {{hora}}. ¿Te viene
> bien? Tienes {{ventana_texto}} para contestar; si no, te mantenemos tu hora
> actual.

**Importante:** el mensaje tiene que dejar claro que si no contesta **no pasa
nada** y conserva su hora. No es una notificación de cambio, es una pregunta.

### Plantilla 2: `propuesta_cambio_aplicada`

Confirmación, sólo se genera cuando el cliente ha aceptado. Mismos campos
(`fecha` y `hora` son ya los definitivos).

> Hecho {{nombre}}. Tu {{servicio}} queda el {{fecha}} a las {{hora}}. ¡Te
> esperamos!

## Cómo contesta el cliente

Con una RPC de Supabase que ya está desplegada y con permisos para `anon`:

```
POST /rest/v1/rpc/responder_propuesta_cambio
{
  "p_slug": "demo",              // slug del portal del salón
  "p_propuesta_id": "<propuesta_id de la fila del aviso>",
  "p_telefono": "+34612345003",  // el del cliente, vale con o sin prefijo
  "p_acepta": true               // false para rechazar
}
```

Devuelve `{"ok": true, "aceptada": true|false}` o `{"ok": false, "error": "..."}`.

El teléfono hace de contraseña, igual que en cancelar y modificar cita: no hay
token. Si prefieres botones de WhatsApp en vez de enlace, con que llames a esa
RPC con `p_acepta` true o false es suficiente.

Casos que ya controla y te devuelve como error, para que los muestres:
- propuesta caducada
- ya contestada
- teléfono que no coincide
- la cita cambió por otro lado mientras tanto

## Caducidad

Hay un cron cada 5 minutos (`caducar-propuestas-cambio`) que marca las vencidas y
suelta el hueco. **No tienes que hacer nada**, pero si quieres avisar al cliente
de que se le pasó el plazo, dímelo y le añado una plantilla.

## Prioridad

Esto no es urgente. Sin tu parte, el salón puede proponer el cambio desde la
agenda y el hueco se reserva y se caduca solo, pero el cliente no se entera. O
sea que la función existe pero no sirve de nada hasta que envíes los mensajes.

Cualquier duda me dices. — Carlos
