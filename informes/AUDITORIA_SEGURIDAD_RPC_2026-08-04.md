# Auditoría de la superficie pública — 4 ago 2026

Cierra `P1-017` (auditar las 34 funciones `SECURITY DEFINER` ejecutables por `anon`)
y `P1-019` (verificar la versión sin captcha de `crear_cita_publica`).

Hecha contra el proyecto Supabase `vtrggiogjrhqtwbhbgia` en producción. Solo lectura,
salvo una sonda HTTP contra `crear_cita_publica` con un slug inexistente (no crea nada).

---

## 0. Lo más importante: la reserva pública del portal está rota

**No estaba en el plan de lanzamiento ni en el tracker. Es un P0.**

`lib/reservaPublica.ts` enviaba a la vez `p_consiente_ia` **y** `p_captcha_token`.
En la base de datos conviven dos sobrecargas de `crear_cita_publica` y **ninguna acepta
las dos**: una lleva `p_consiente_ia`, la otra `p_captcha_token`. PostgREST resuelve la
sobrecarga por el conjunto exacto de nombres recibidos, así que no encontraba ninguna.

Comprobado con una llamada real a la API con la clave anónima:

| Lo que se manda | Respuesta |
|---|---|
| `p_consiente_ia` + `p_captcha_token` (lo que hacía el frontend) | **404 `PGRST202`** — función no encontrada |
| solo `p_consiente_ia` | 400 `P0001` "Portal no disponible" (resuelve bien) |
| solo `p_captcha_token` | 400 `P0001` "Portal no disponible" (resuelve bien) |

**Desde cuándo:** `p_captcha_token` entró en el frontend el 1-2 jul (`2898baa4`, `8b869e47`)
y `p_consiente_ia` el **6 jul** (`459c73db`, *"add opt-in IA consent to booking portal"*).
Desde ese día, toda reserva individual desde `/app/r/<slug>` devuelve 404.

**Alcance:** solo la reserva **individual**. La de grupo (`crear_cita_publica_grupo`) manda
exactamente los 8 parámetros de su firma y funciona. Las reseñas también (la llamada
coincide con la sobrecarga de 14 argumentos). Las citas por WhatsApp van por otra ruta.

**Arreglo aplicado:** dejar de enviar `p_captcha_token` desde el frontend. Es neutro en
seguridad —ver §2, la función ignora ese token— y restaura la reserva hoy. El arreglo
definitivo es unificar las dos firmas en una (`P1-018`).

---

## 1. Las 34 funciones: el estado real

Las 34 tienen `search_path` fijado, así que **no hay ninguna vulnerable al secuestro de
`search_path`**, que es el fallo clásico de `SECURITY DEFINER`. `crear_solicitud_publica`
es la única con `search_path=public, pg_temp`; el resto usa `public`. Inconsistente, no grave.

Por grupos:

| Grupo | Funciones | Valoración |
|---|---|---|
| Portal de reserva | `portal_info`, `disponibilidad_publica`, `portal_dias_disponibles`, `crear_cita_publica` ×2, `crear_cita_publica_grupo`, `cita_publica`, `modificar_cita_publica`, `cancelar_cita_publica`, `confirmar_cita_oferta` | Correcto por diseño. Todas anclan en `negocio_portal.portal_activo` |
| Reseñas | `crear_resena_publica` ×3, `resenas_publicas` | 3 firmas vivas, ninguna con captcha. Ver §2 |
| Directorio | `buscar_salones_publico`, `salon_directorio_publico`, `ciudades_directorio_publico`, `negocio_contacto_publico` | Correcto |
| Pagos/presupuestos | `pago_info_publica`, `completar_datos_pago_publico`, `presupuesto_publico`, `aceptar_presupuesto_publico`, `presupuesto_enviar_mensaje_publico` | Van por token opaco. Correcto |
| Landing | `crear_solicitud_publica`, `horas_llamada_ocupadas`, `obtener_estadisticas_mecha`, `enviar_mensaje_contacto_publico` | `obtener_estadisticas_mecha` devuelve la media de `mecha_puntuacion` y últimos comentarios: es el widget de valoración de la landing, datos reales, público a propósito |
| **Helpers de RLS** | `is_staff`, `is_team_member`, `is_shared_demo_visitor`, `my_app_role`, `my_negocio_id`, `my_negocio_id_text` | **No deberían estar concedidas a `anon`.** Sin JWT devuelven null/false, así que no filtran nada hoy, pero son helpers internos de RLS y no hay razón para exponerlos. Revocar de `anon` |
| Consentimiento | `actualizar_consentimiento_ia` | Comprueba que la clienta existe y aplica control multi-tenant. Correcto |

**Acción propuesta:** revocar de `anon` los 6 helpers de RLS. Es la única concesión sin
justificación funcional de las 34.

---

## 2. `P1-019` — la premisa de la tarea es falsa

La tarea dice *"verificar que la versión sin captcha de `crear_cita_publica` está revocada"*.
La realidad es distinta y más incómoda: **ninguna de las dos versiones valida el captcha**.

La que recibe `p_captcha_token` lo documenta en su propio cuerpo:

> *"p_captcha_token se acepta para el plumbing anti-bots; la validacion real se activa
> cuando el negocio configure claves de produccion (captcha_activo + edge validate-captcha)."*

Es decir, acepta el token y **no lo comprueba**. La validación real ocurre en el navegador,
que llama a la edge `validate-captcha` antes del RPC (`app/r/[slug].web.tsx:350`).

**Consecuencia:** cualquiera que llame al RPC directamente con la clave anónima —que es
pública— se salta el captcha entero, elija la sobrecarga que elija. Revocar una de las dos
**no cierra nada**. Ninguna de las dos usa `request_ip()` ni límites por IP.

El arreglo de verdad es que la comprobación viva **dentro** de la función (o que el RPC
exija un token emitido por servidor), no reordenar sobrecargas. `P1-018` y `P1-019` hay que
replantearlas con eso en mente antes de tocarlas.

---

## 3. Hallazgo colateral en `profiles` (afecta a P0-002 y P0-005)

La policy `"Users can update own profile"` es `UPDATE USING (auth.uid() = id)` **sin
`WITH CHECK` y sin restricción de columnas**: un usuario autenticado puede escribir
cualquier columna de su propia fila.

Hoy **no es explotable** porque el trigger `guard_profile_identity_columns` revierte
`role`, `negocio_id` y `plan`, y `guard_referral_columns` protege el bloque de referidos
y antifraude. El diseño es correcto.

Pero **`trial_ends_at` no está protegido por ningún guard**. Hoy da igual (0 de 17 perfiles
lo tienen relleno), pero en cuanto `P0-005` lo rellene, cualquier cliente podrá alargarse
el mes gratis indefinidamente con un update. Lo mismo valdría para las columnas de Stripe
de `P0-002`.

Contemplado en `migrations/p0-002-suscripcion-mecha-campos-profiles.sql`, que extiende el
guard existente a `trial_ends_at` y a las cuatro columnas nuevas.

---

## 4. Resumen de acciones

| # | Acción | Prioridad |
|---|---|---|
| 1 | Reserva pública rota — arreglo mínimo aplicado, pendiente de desplegar | **P0** |
| 2 | Unificar las dos firmas de `crear_cita_publica` en una sola | Alta (`P1-018`) |
| 3 | Validar el captcha **dentro** del RPC, o exigir token de servidor | Alta (replantea `P1-019`) |
| 4 | Dejar una sola firma viva de `crear_resena_publica` (hay 3) | Alta (`P1-018`) |
| 5 | Revocar de `anon` los 6 helpers de RLS | Media |
| 6 | Aplicar la migración de P0-002 con el guard extendido | **P0** |
| 7 | Límites por IP en los RPC públicos (ninguno los tiene) | Alta (`P1-020`) |
