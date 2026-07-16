# Spec — Limites de adelanto configurables por salon (Agenda)

Fecha: 2026-07-16 · Autor: Alexandru (logica/motor) · Estado: aprobado para plan

## Contexto y objetivo

El organizador propone hoy **"Adelantar 180 min"**: mover a una clienta de las 17:00 a las 14:00.
Visto en produccion con datos reales (tenant `prueba_46980`, 16 jul): cuatro avisos de hueco
proponiendo adelantos de 3 horas, y en un solape la estrategia **recomendada** era adelantar a la
clienta 3 horas. Ningun salon aplicaria eso.

Causa: `UMBRAL_HUECO_MIN_DEFAULT = 5` (cualquier hueco desde 5 min genera propuesta) y **no existe
ningun techo de adelanto**. No es que el techo este mal configurado: el concepto no esta en el codigo.

## Decisiones

- **Dos ajustes, no numeros fijos.** El patron del Documento Modular es "(default: X)" configurable
  por salon (RN-AG-031 24h, RN-AG-032 15 min, RN-AG-041 5 min). Decision del usuario, correcta:
  *"al final es eleccion de cada salon"*. Se implementan como claves de `negocio_config`.
- **Claves** (camelCase, como `recolocarRetraso` / `notifRetrasoActiva` / `completarManual`):
  - `agendaMaxAdelantoMin` — **default 60**. Techo: cuanto como maximo se puede adelantar una cita.
    Mas de una hora antes no lo acepta ninguna clienta que ya tiene hora dada.
  - `agendaUmbralHuecoMin` — **default 30**. Ganancia minima para molestar a la clienta. Media hora
    justifica el aviso; 15 min (un slot) es ruido. Sustituye al 5 actual.
- **El techo se aplica acotando la busqueda, no filtrando despues.** `buscarHueco` ya recibe `desde`:
  basta con `desde = max(..., cita.ini - maxAdelantoMs)`. Si no hay slot dentro del techo, no hay
  propuesta. Cero logica nueva, misma primitiva.
- **Solo afecta a lo que ADELANTA.** `mover_reasignar` y `estrategiaMoverUna` buscan hacia adelante
  por diseno -> el techo no les aplica. Afecta a `detectarHuecos`, `estrategiaAdelantarFija` y
  `estrategiaMoverIntrusa` (que puede colocar la intrusa antes de su hora).
- **Chispa podra cambiarlos hablando** ("el maximo, 30 minutos"), pero **acotado a estas dos claves**.
  Ver seccion de seguridad: hay un candado deliberado que el usuario autorizo abrir solo para esto.

## Efecto colateral esperado: el test rojo se pone verde solo

El test **"dia limpio (huecos por debajo del umbral): no reporta ruido"** de `organizarAgenda.test.ts`
lleva meses rojo (ver [[hairy_test_dia_limpio_umbral]]). Su caso: ganancia de 15 min, espera 0 avisos.
Con `agendaUmbralHuecoMin = 30`, `15 < 30` -> se descarta -> **el test pasa sin tocarlo**.

Eso es la confirmacion de que la expectativa del test era correcta desde el principio y lo que estaba
mal era el umbral. Si al implementar hubiera que editar ese test para que pase, es que el default
elegido no resuelve el problema y hay que replantearlo.

## Seguridad: el candado de Chispa

`SUPERFICIE_ACCIONES` en `supabase/functions/agenda-asistente/permisos.ts` es **fail-closed**: solo
las tools listadas por superficie se ofrecen al LLM.

```js
chat:   ['confirmar_citas', 'reenviar_confirmacion', 'avisar_lista_espera', 'gestionar_retraso'],
agenda: ['optimizar_agenda', 'gestionar_retraso'],
```

`cambiar_config` **no esta en ninguna superficie**, y el system prompt dice literal *"Tu no cambias la
configuracion: guias a donde esta el ajuste para que lo cambie el usuario"*. Es una exclusion
deliberada, no un olvido (historico de alucinaciones del modelo, ver [[feedback_model_barberia_agent]]).

**El usuario autorizo abrirlo el 2026-07-16, solo para estas dos claves.** Por tanto:
- `cambiar_config` se ofrece SOLO en la superficie `agenda`.
- El parametro `clave` de la tool se restringe por **enum** a las dos claves. Chispa no puede tocar
  ninguna otra: el LLM no puede ni nombrarlas.
- Se mantienen las defensas existentes: `set_negocio_config_key` exige `role = 'owner'` y bloquea la
  demo compartida, y la accion pasa por tarjeta de confirmacion del usuario antes de aplicarse.
- El prompt se matiza: sigue guiando para todo lo demas, pero puede ajustar estos dos limites.

## Diseño

### 1. Defaults y lectura (`lib/constants.ts`)

```ts
export const AGENDA_MAX_ADELANTO_MIN_DEFAULT = 60;
export const AGENDA_UMBRAL_HUECO_MIN_DEFAULT = 30;
```

`UMBRAL_HUECO_MIN_DEFAULT` (hoy 5, en `organizarAgenda.ts`) pasa a leerse de aqui.

### 2. Motor (`lib/organizarAgenda.ts` + `lib/retrasos.ts`)

- `AnalisisAgendaOpts.umbralHuecoMin` ya existe -> solo cambia su default.
- `AnalisisAgendaOpts` gana `maxAdelantoMin?: number`.
- `EstrategiasOpts` (y el opts de `calcularEstrategiasSolape`) ganan `maxAdelantoMs?: number`.
- `detectarHuecos`: `desde = max(ahoraMs, aperturaMs, propia.ini - maxAdelantoMs)`.
- `estrategiaAdelantarFija`: `desde = max(ahoraMs, aperturaMs, fijaFases.ini - maxAdelantoMs)`.
- `estrategiaMoverIntrusa`: `desde = max(ahoraMs, fija.inicio, aperturaMs, intrusaFases.ini - maxAdelantoMs)`.

Default cuando falta: `Infinity` (= sin techo, comportamiento actual) para no romper llamadores.

### 3. Plumbing

`AgendaCalendar.web.tsx` ya lee `negocio_config` (`cfgResult` -> `cfg`); de ahi salen
`cfg.agendaMaxAdelantoMin` / `cfg.agendaUmbralHuecoMin` al panel. `useAvisos.ts` carga la config
igual que hizo con horarios y bloqueos.

### 4. Chispa (`supabase/functions/agenda-asistente/`)

- `permisos.ts`: `agenda: [..., 'cambiar_config']`.
- Enum de claves permitidas en el schema de la tool.
- Prompt: matiz de que puede ajustar estos dos limites.
- **Requiere redeploy del edge** (ver [[project_hairy_edge_redeploy_pendiente]]: ya iba por detras).

## Testing

Tests Deno. Casos:
1. Ganancia de 180 min con techo 60 -> **no se propone** (hoy si). El caso real de produccion.
2. Ganancia de 45 min con techo 60 y umbral 30 -> si se propone.
3. Ganancia de 15 min con umbral 30 -> no se propone (= el test "dia limpio", que debe ponerse verde).
4. `estrategiaAdelantarFija` no adelanta la fija mas alla del techo.
5. Sin `maxAdelantoMin` en opts -> sin techo (no regresion).
6. El techo no afecta a `mover_reasignar` (que solo va hacia adelante).

## Fuera de alcance

UI de Ajustes para los dos campos (Carlos; Chispa cubre el hueco mientras tanto) · abrir
`cambiar_config` a otras claves · pausas de comida · recurrencia de bloqueos.
