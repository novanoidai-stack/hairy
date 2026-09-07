# Auditoría Mecha — Pasada 1: coherencia de cifras y planes

**Fecha:** 7 sep 2026 · **Alcance:** precios, planes y referidos — los invariantes repartidos.
**Método:** ejecutar los vigilantes y leer su salida; grep dirigido para verificar que cubren
de verdad todos los sitios. Cero ficheros leídos enteros.

---

## Veredicto: los tres invariantes repartidos CUADRAN

### Precios — coherentes en los 3 sitios

| Fuente | Esencial | Estudio | WhatsApp | Voz | Completo |
|---|---|---|---|---|---|
| `lib/planes.ts` | 39 | 59 | 19 | 29 | 39 |
| `web/index.html` (texto + JSON-LD) | 39 € / `"39.00"` | 59 € / `"59.00"` | 19 € | 29 € | 39 € |
| `chispa-landing` `SYSTEM_PROMPT` | 39 €/mes | 59 €/mes | +19 €/mes | +29 €/mes | +39 €/mes |

Coincide con lo que declara el `CLAUDE.md`. El prompt de Chispa incluso explica el pack
(`+39 € en vez de 48 € sueltos`), que es la trampa que documenta `IA_PRECIO_EUR`
(*'completa' NO es la suma de los otros dos*). Vigilante `precios`: **ok**.

### Referidos — coherentes en los 4 sitios

Niveles **10 / 4 / 2**, tope **30 %**, bienvenida **15 %**. Presentes en los cuatro:

- `archive/migraciones-legacy/referidos-tope-30-y-meses-gratis.sql` (fuente única)
- `web/index.html` §`#hermano`
- `web/demo.html` (modal "Recomendar")
- `app/(tabs)/configuracion.web.tsx` (`TabReferidos`)

Vigilante `referidos`: **ok**.

### Planes — vigilante `planes`: ok

Es el que cazó en su día los cuatro textos que decían "el mismo software" mientras
`PLAN_FUNCIONES` gateaba seis funciones. Hoy está verde.

---

## Lo único abierto: 4 claims fiscales en `web/index_v5.html`

`ENVIO_AEAT_DISPONIBLE = false` en `lib/fiscal/estadoVerifactu.ts` — el envío a la AEAT
**no existe**. Y `web/index_v5.html` promete tres veces que sí:

- *"...la factura VeriFactu se firma y se envía a la AEAT sola."*
- *"enviada a la AEAT"* (×2)

**Atenuantes, verificados:**

- La landing real (`web/index.html`) está **limpia**: cero claims de envío a la AEAT u
  "homologado". Comprobado por grep.
- `index_v5.html` lleva `noindex` y **no está en `web/sitemap.xml`**.
- Es un boceto que se queda a propósito (ver la nota de las landings v4/v5).

**Pero** el dominio sirve la carpeta `web/` entera, así que la URL responde a quien la teclee.
Prometer envío a Hacienda que no ocurre es el tipo de claim que no conviene tener servido ni
en un boceto. **Recomendación:** quitar esas tres frases de `index_v5.html` (no hace falta
borrar el fichero), o borrarlo si el boceto ya no sirve.

---

## Deriva medida: la foto de Codex ya estaba caducada

Segunda vez en esta auditoría que el snapshot miente por antigüedad. Vale la pena anotarlo
como método: **re-ejecutar siempre antes de informar.**

| | Snapshot 16:56 | Fresco (ahora) |
|---|---|---|
| Bloqueantes | 3 | **0** |
| Avisos | 305 | 295 |
| `fiscal` | 13 | **4** |
| `codigo-muerto` | 26 | 25 |
| `meta` | 11 | 9 |
| `vigilancia` | 1 | 0 |
| `rendimiento` | 250 | 250 |
| `seguridad` | 2 | 2 |

Los 9 avisos fiscales que desaparecieron eran de `web/diseno-aurora.html`,
`web/diseno-brasas.html` y `web/diseno-forja.html`: **los tres ficheros ya no existen.**
Los 3 bloqueantes eran el cebo `trampa-de-prueba.mjs` que creó la propia auditoría.

---

## Los 295 avisos restantes, en contexto

| Ámbito | Nº | Qué son |
|---|---|---|
| `rendimiento` | 250 | línea base congelada, trinquete solo hacia abajo |
| `codigo-muerto` | 25 | deuda heredada con base congelada (knip) |
| `meta` | 9 | vigilantes sin su `.test.mjs`, en `meta-contrato-baseline.json` |
| `codigo` | 5 | `<Modal>` sin `onRequestClose` en `clientes.tsx` y `equipo.tsx` |
| `fiscal` | 4 | los de arriba |
| `seguridad` | 2 | los 2 pasos de `ci.yml` sin `if: always()` |

Los 5 de `codigo` son accesibilidad real y baratos: sin `onRequestClose`, el botón atrás de
móvil y la tecla Escape no cierran el diálogo.

---

## Pendiente para las siguientes pasadas

- **Pasada 2** (portal + backend): advisors, RLS, la regla del parámetro, y las 6 migraciones
  del 1 sep que no constan aplicadas.
- **Pasada 3** (software): smoke, agenda, caja.
- **Pasada 4**: qué falta por construir.
