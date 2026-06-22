# Diseño — Teléfono internacional: input + almacenamiento + comparación canónicos

> Fecha: 2026-06-22 · Autor: Alexandro (backend/IA/integraciones) · Estado: diseño aprobado por el usuario.
> Origen: un cliente metió su número sin prefijo (`661031365`) al confirmar una cita y dio error,
> porque las RPC comparan el teléfono con **igualdad exacta** (`cl.telefono = trim(p_telefono)`) y los
> teléfonos están guardados en formatos mezclados. Solución de raíz, no parche.

## 1. Objetivo

Que el usuario final pueda introducir su teléfono **como quiera** (con o sin prefijo, con espacios) y
que la comparación funcione siempre. Estándar de la industria: **selector de país + número nacional →
se guarda y compara en formato canónico E.164**. Aplicar en TODA la app y en pantallas futuras.

## 2. Decisiones (fijadas por el usuario, 22 jun)

- **Alcance:** TODOS los sitios con teléfono, **web y nativo**.
- **Datos existentes:** **migrar a E.164** + comparación exacta sobre canónico (no comparación sucia).
- **Librería:** la más profesional → `libphonenumber-js`. Selector **buscable por nombre o prefijo**,
  con bandera, y **mismo estilo que los demás desplegables** de la app.
- **Convención permanente:** de aquí en adelante, cualquier pantalla nueva con teléfono usa este
  componente y formato. (Guardado en memoria + se añade al design system del repo.)

## 3. Formato canónico

**E.164**: `+` + prefijo de país + número nacional, solo dígitos, sin espacios. Ej.: `+34661031365`.
Se guarda así en todas las columnas de teléfono de personas y se compara así.

## 4. Componente `components/ui/PhoneInput` (web `.web.tsx` + nativo `.tsx`)

**Props:** `value` (E.164 string), `onChange(e164: string, isValid: boolean)`, `defaultCountry` (ISO2,
default `'ES'`), `label?`, `placeholder?`, `disabled?`, estilo coherente con `SettingsAtoms`.

**Comportamiento:**
- **Selector de país:** desplegable buscable por **nombre de país o prefijo** (`🇪🇸 España +34`).
  Lista derivada de `getCountries()` de libphonenumber + mapa de bandera (emoji) + nombre localizado.
  Visual idéntico a los desplegables de la app (átomo `SSelect` / patrón del portal; sombra cálida,
  fondo crema, no blanco — misma regla que el resto de campos de Configuración).
- **Campo de número:** formatea según se escribe (`AsYouType` del país elegido) y valida con
  `isValidPhoneNumber`. Si no es válido para ese país → error en línea + `isValid=false` (el formulario
  padre no deja enviar).
- **Salida:** emite el **E.164** (`parsePhoneNumber(...).number`) y la validez.
- **Edición (valor precargado):** parsea el E.164 guardado (`parsePhoneNumber`) → fija país + número
  nacional en los dos controles. Si el valor legado no parsea, cae a país por defecto + texto crudo.
- **País por defecto:** `ES` (más adelante se podrá leer del salón; fuera de alcance ahora).

**Paridad:** misma API en web y nativo; `libphonenumber-js` es JS puro (vale en ambos). El desplegable
nativo reutiliza el patrón de selects nativos existente.

## 5. Backend

**Helper** `public.normalizar_telefono(text) returns text` (immutable): devuelve solo los dígitos
(`regexp_replace(p,'\D','','g')`). Como todo pasa a E.164, comparar esos dígitos es exacto y robusto.

**RPCs a actualizar** (cambiar `cl.telefono = trim(p_telefono)` por
`normalizar_telefono(cl.telefono) = normalizar_telefono(p_telefono)`):
`cita_publica`, `cancelar_cita_publica`, `modificar_cita_publica`, `confirmar_cita_oferta`,
`citas_de_cliente`, `identificar_cliente`, `crear_cita_publica` (esta en sus 3 usos: detección de
bloqueado, conteo de citas y buscar/crear cliente → además evita clientes duplicados por formato).

**Migración de datos** (`migrations/telefono-e164.sql`): normalizar las columnas de teléfono de
personas a E.164:
- Si ya empieza por `+` → quitar espacios/guiones.
- Si empieza por `00` → sustituir `00` por `+`.
- Si es número nacional suelto (sin prefijo internacional) → asumir **España** y anteponer `+34`
  (criterio para lo viejo; documentado).
- Cubre `clientes.telefono` y `lista_espera.telefono`. Reportar (no romper) los casos ambiguos.
- Tras la migración: pasar **advisors de seguridad** de Supabase (regla del repo).

## 6. Pantallas que adoptan `PhoneInput`

- **Cliente (web):** `app/r/[slug].web.tsx` (portal reserva), `app/cita/[id].web.tsx` (gestionar/confirmar).
- **Interno (web):** `app/(tabs)/clientes.web.tsx`, `app/(tabs)/lista-espera.web.tsx`,
  `app/(tabs)/equipo.web.tsx` (contacto), `app/(tabs)/configuracion.web.tsx` (tel. salón/portal).
- **Nativo:** `app/screens/nueva-cita.tsx`, `app/screens/agenda-detalle.tsx`, `app/(tabs)/clientes.tsx`,
  y los equivalentes nativos de config/equipo si tienen campo de teléfono.
- `app/(tabs)/informes.web.tsx` solo **muestra/filtra** teléfono → no lleva input (excluido).

## 7. Dependencia

`libphonenumber-js` (metadata `max` para validación por país fiable). ~145 KB en el bundle web; Vercel lo
instala al desplegar y hay que `npm install` tras el pull. Banderas: emoji derivado del ISO2 (sin
dependencia extra de imágenes).

## 8. Errores y casos límite

- Número inválido para el país elegido → error en línea, submit bloqueado.
- Editar registro con E.164 → prefill correcto; legado no parseable → país por defecto + crudo.
- Migración: número que ya trae prefijo internacional distinto de +34 → respetar (no forzar ES).
- Comparación: al normalizar a dígitos, dos números idénticos con/sin prefijo casan; el `cita_id`
  sigue siendo requisito de propiedad (sin merma de seguridad).

## 9. Pruebas

- **SQL:** la migración convierte bien muestras ES (`661…`→`+34661…`, `34661…`→`+34661…`) y respeta
  E.164 ya válidos; las 7 RPC casan metiendo el número con/sin prefijo.
- **Componente:** ES/MX/AR producen el E.164 correcto; validación de longitud por país; prefill desde
  E.164 al editar; búsqueda del país por nombre y por prefijo.
- **E2E:** confirmar una cita escribiendo el número **sin prefijo** ya funciona (el bug original).

## 10. Convención futura (design system)

Añadir a `hairy-design-system` (skill del repo) y/o a las convenciones de `CLAUDE.md`: «todo campo de
teléfono usa `PhoneInput` (E.164)». Cualquier pantalla nueva con teléfono parte de este componente.

## 11. Pendiente externo / orden

- Ninguna dependencia externa (no Meta/Stripe). Se puede construir y probar de inmediato.
- `npm install` tras añadir `libphonenumber-js`.
