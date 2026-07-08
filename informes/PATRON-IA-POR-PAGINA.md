# Patrón "IA proactiva por página" (Sesión 4, PLAN-IA-CHISPA-V2-REDISENO.md)

> Construido en la Sesión 4 (dependía de la 1). Primera víctima arreglada: Mi Jornada
> (`app/(tabs)/mi-jornada.web.tsx`). Las Sesiones 5-8 se apoyan en esto — léelo antes
> de montar una tarjeta de IA nueva en Agenda/Caja/Presupuestos/Clientes/Informes/
> Reseñas/Bandeja.

## Por qué existe

El diagnóstico de la Sesión 0 del plan V2: Mi Jornada, Caja, Reseñas y Bandeja llamaban
al edge `agenda-asistente` cada una a su manera, sin estado de error — si el edge
fallaba o no devolvía nada útil, la tarjeta se quedaba en blanco sin avisar (bug
confirmado en `mi-jornada.web.tsx`: `analizarDiaIA` hacía `if (!err && data) {...}` y
si `err` era verdad no pasaba NADA, ni loading eterno ni mensaje). Regla global del
plan: **"PROHIBIDOS los fallos silenciosos"**. Este patrón lo hace estructuralmente
imposible: el componente solo sabe pintar 5 estados y no hay un sexto "no sé qué pasó".

De camino se encontró y arregló un bug gemelo en el hook compartido
`useChispaSugerencia`: declaraba un estado `bloques` pero nunca llamaba a
`setBloques` (una constante local tapaba el nombre), así que **Equipo, Inventario y
Presupuestos llevaban con su sugerencia de IA completamente invisible** (`chispaBloques.length > 0` era
siempre `false`). Corregido como parte de esta sesión — esas tres pantallas ya
deberían mostrar su bloque de IA si el edge responde con algo.

**Bug gemelo pendiente (Sesión 8):** `app/(tabs)/bandeja.web.tsx`, función
`proponerAccionIA` (botones "Cita (IA)"/"Presupuesto (IA)"), tiene el MISMO patrón
`if (!err && data)` que Mi Jornada — si falla, no pasa nada visible. No se tocó en
esta sesión (Bandeja es Sesión 8); adóptese `useAyudaIA` ahí y se arregla solo.

## Las dos piezas

### 1. `lib/hooks/useAyudaIA.ts` — el estado

```ts
const ayudaIA = useAyudaIA();
// ayudaIA.estado: { tipo: 'idle' | 'cargando' | 'vacio' | 'listo' | 'error' }
ayudaIA.analizar(prompt, contexto?);  // lanza/relanza
ayudaIA.reintentar();                 // repite la ULTIMA llamada tal cual
ayudaIA.reset();                      // vuelve a idle
```

- Envuelve `invocarChispa` (extraído de `useChispaSugerencia.ts`, mismo edge
  `agenda-asistente`) — no hay una segunda forma de "llamar a Chispa"; solo un hook
  más de estados por encima de la misma función de invocación.
- `vacio` es un estado real, no un `listo` con array vacío: si el edge responde pero
  sin bloques con contenido útil (ver `hayContenidoUtil`), no se confunde con éxito.
- `error` lleva un mensaje ya humanizado con `mensajeDeError` (mismo helper que el
  resto del software, `lib/errores.ts`) — nunca un `err.message` crudo en la UI.
- `reintentar()` no repite lo que haya en el formulario/estado de la página en ESE
  momento: repite EXACTAMENTE el último `prompt`/`contexto` pasado a `analizar()`.

### 2. `components/chispa/TarjetaAyudaIA.web.tsx` — la vista

Un solo componente que pinta los 5 estados de forma consistente (mismo borde
`${T.primary}40`, mismo icono de chispa en SVG — nunca emoji, mismo formato de
fila de error con botón "Reintentar"). Props clave:

- `resumenDeterminista?: ReactNode` — el bloque que se ve SIEMPRE, sea cual sea
  `estado`. Aquí va lo que se pueda calcular en cliente sin LLM.
- `estado`, `onAnalizar`, `onReintentar?` — el contrato de `useAyudaIA`.
- `accionEstado` / `onConfirmarAccion` / `onCancelarAccion` — passthrough a
  `BloqueRenderer` para cuando la respuesta trae un bloque `'accion'` (propone→confirma,
  PR-12). Solo se aplica al PRIMER bloque de tipo `'accion'`; si una página necesita
  varias acciones independientes con confirmación propia, hay que extender
  `accionEstado` a un mapa por id de bloque — no hecho aún porque ninguna página lo
  necesita todavía.

## Regla "determinista primero"

No esperes al LLM para lo que ya tienes en cliente. Patrón usado en Mi Jornada
(`resumenIADeterminista` en `mi-jornada.web.tsx`): una función pura `(datosYaCargados) => string`
que arma la frase con los números reales (citas/horas/comisión) SIN llamar al edge,
y se pasa como `resumenDeterminista`. El botón "Analizar" solo añade la lectura/
sugerencia del LLM ENCIMA de eso. Consecuencia directa: si el edge está caído, el
usuario sigue viendo algo correcto y útil, no un hueco.

Para las próximas sesiones, el dato determinista suele ya existir en la página:

| Sesión | Página | Determinista candidato (sin LLM) |
|---|---|---|
| 6 | Caja | servicio cobrado + candidatos de upsell por categoría/ficha (el LLM solo redacta el copy) |
| 6 | Presupuestos | días sin respuesta ya está en la fila del presupuesto |
| 7 | Clientes | score de riesgo de no-show/fuga ya es determinista (Sesión 7 v1) |
| 7 | Informes | cifras de `resumen_caja`/`ocupacion`/`citas_hoy` (tools ya existentes) |
| 8 | Reseñas | rating medio y distribución ya están cargados |
| 8 | Bandeja | nº de mensajes sin responder / tiempo desde el último |

## Dónde va la tarjeta y cómo se gatea por rol

- La tarjeta vive **en el flujo normal de la página** (sin `position: fixed/absolute`).
  Es una `<div>` más entre las demás secciones — exactamente como se colocó en Mi
  Jornada, entre la tarjeta de fichaje y las métricas del periodo. Esto es lo que
  evita el choque de z-index con `AvisosBell` (`zIndex: 200`, `position: fixed`/
  `absolute`) y con cualquier overlay del dashboard: si nunca flota, nunca puede
  taparlos ni que la tapen (bug de solape que cierra la Sesión 10). Si alguna vez
  hiciera falta una variante flotante, coordinar el z-index con la Sesión 10 antes.
- Rol: no hay un flag global "IA activa" para estas tarjetas — `asistenteAgendaActivo`
  solo gatea el panel conversacional (Chispa) y la config guiada (Sesiones 1-3), no
  las tarjetas por página. Cada tarjeta se gatea con las MISMAS reglas de rol que ya
  usa el resto de la página: en Mi Jornada, `puede_ver_comision`/`puede_ver_importes`
  ya vienen del RPC con gate server-side, así que el resumen determinista los respeta
  gratis. Para páginas nuevas: si el dato ya está oculto a cierto rol en la UI normal,
  ocúltalo igual en el resumen determinista y en el prompt que arma el LLM.

## Cómo se degrada

1. Sin `resumen`/datos aún cargados → el `resumenDeterminista` no se muestra (pásalo
   como `null`), pero el botón "Analizar" sigue disponible si tiene sentido.
2. LLM/edge caído → `estado.tipo === 'error'`, mensaje humanizado + botón
   "Reintentar" que repite la misma petición. El determinista de arriba sigue ahí.
3. LLM responde pero sin nada útil → `estado.tipo === 'vacio'`, mensaje neutro
   personalizable con `mensajeVacio`.
4. Todo bien → `estado.tipo === 'listo'`, se pintan los bloques con `BloqueRenderer`
   (texto con markdown ligero, y opcionalmente un bloque `accion` propone→confirma).

## Qué NO hace (todavía) este patrón

- No decide solo si mostrarse o no según permisos — eso lo sigue decidiendo la
  página (igual que hacía antes).
- No cachea entre sesiones/reloads (cada `analizar()` es una llamada nueva al edge).
  Si una página futura necesita persistencia, es una extensión de la página, no del
  hook.
- No soporta bloques `'formulario'`/`'opciones'` interactivos dentro de la tarjeta
  (esos son del panel conversacional guiado, Sesiones 1-3). Si una sesión futura los
  necesita aquí, `TarjetaAyudaIA` tendría que empezar a aceptar
  `onRespuestaInteractiva` igual que `BloqueRenderer` — no añadido porque ninguna
  tarjeta de página lo pide aún.
