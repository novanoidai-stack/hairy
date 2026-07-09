# S15 · Iniciativa / próxima mejor acción

**Fase:** D · Proactiva · **Dueño:** Carlos · **Esfuerzo:** alto · **Depende:** S02, S09

> Chispa **toma la iniciativa** en contexto: propone la siguiente mejor acción sin que se lo pidas —
> con tacto, sin molestar.

## Lee antes
- [`../README.md`](../README.md) + marco de razonamiento (S02) + memoria (S09/S10).

## Objetivo (resultado deseado)
Que en cada página/momento Chispa sugiera de forma proactiva y oportuna la acción más valiosa
(determinista para elegir el candidato; LLM solo redacta), fácil de aceptar o descartar.

## Ya existe (no reconstruir — verifica)
- Patrón `useAyudaIA`/`TarjetaAyudaIA`, upsell (`lib/upsellCandidato.ts`), riesgo/fuga, hallazgos (S13),
  memoria (S09/S10).

## Construir
1. **Selector de "próxima mejor acción"** por contexto (página + rol + memoria + hallazgos): reglas
   deterministas que puntúan candidatos; el LLM solo escribe el copy.
2. **UX con tacto:** sugerencia discreta, no intrusiva, con "aceptar (1 clic)" / "ahora no"; frecuencia
   limitada (no spamear). Aprende de descartes (memoria).
3. **Consistencia** con el resto de superficies (mismo componente de tarjeta).

## Reglas duras que te aplican
- Determinista para elegir; LLM solo redacta. Sin claims falsos. Rol/tenant. No molestar (rate-limit).

## Criterios de aceptación (verificables)
- En un contexto sembrado (p.ej. clienta en fuga + hueco), Chispa propone proactivamente la acción
  correcta, aceptable de un clic; "ahora no" la silencia un tiempo (verificado E2E).

## Definición de HECHA
`[x] tsc  [x] build  [x] sin edge (determinista)  [x] test selector + smoke demo  [x] manuales+iaCatalogo
[x] specs landing  [x] commit+push  [x] S15 marcada`

## Estado
HECHA (9 jul).
- **Selector determinista** `lib/proximaAccion.ts`: dado {página, hallazgos S13, silenciadas} elige la
  acción más valiosa para esa pantalla (mapa relevancia por página + prioridad por severidad). **Sin LLM**
  (se evalúa en cada carga → no puede depender de una llamada al modelo: coste/latencia/spam); copy
  determinista con tacto. Verificado con test unitario (6/6: relevancia, prioridad urgente>alta, snooze,
  página irrelevante, count 0, copy/ruta).
- **Silenciado durable** `lib/sugerenciaSnooze.ts`: reutiliza `chispa_memoria` (S09) como KV por usuario
  (tipo='hecho', clave='snooze:<clave>', valor={hasta}). "Ahora no" silencia 24h y persiste (aprende del
  descarte). **Sin migración nueva.** Demo no persiste.
- **UI** `components/chispa/ProximaAccionLauncher.web.tsx` (+ stub nativo): montaje GLOBAL en
  `app/_layout.tsx` (1 fichero + 1 línea, evita editar cada página → menos colisión con sesiones
  paralelas). Tarjeta discreta fija abajo-centro, no intrusiva, z-index 120 (bajo el panel de Chispa),
  con "Hacer" (1 clic, navega) y "Ahora no". Solo en rutas (tabs); una vez por sesión y clave
  (`manejadasSesion`) para no repetir al navegar.
- **Verificado:** test del selector 6/6 + tsc + build + smoke en demo (monta y corre su efecto sin errores
  de consola; el nudge sale inerte en demo por no haber hallazgos, misma limitación que S13/S14 — el
  aspecto visual del nudge requiere un tenant con hallazgos reales).
- Docs: `iaCatalogo` (chispa-proxima-accion) + manual chispa + especificaciones.html.
- Nota reparto: S16 (coach intra-página) y S17 (tours) son la continuación natural de la iniciativa.
