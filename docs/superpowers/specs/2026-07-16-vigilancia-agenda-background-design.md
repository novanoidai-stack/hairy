# Spec — Vigilancia de la agenda en segundo plano (Informe #1, "Deteccion Omnipresente")

Fecha: 2026-07-16 · Autor: Alexandru (logica/motor) · Estado: pendiente de aprobar

## Contexto y objetivo

`INFORME_TAREAS_AGENDA.md` #1: *"El sistema no debe limitarse a reaccionar cuando el usuario hace
una accion. Debe estar continuamente analizando la agenda en segundo plano y darse cuenta, **por su
propio merito**, de cualquier anomalia, hueco desaprovechado o ineficiencia."*

Hoy `analizarAgendaDia` solo corre cuando el usuario pulsa "Organizar mi agenda" o abre la pagina de
Avisos (`useAvisos`, en el **cliente**). Si nadie mira, nadie se entera.

## Lo que YA existe (y no hay que construir)

**La vigilancia 24/7 esta montada y activa.** `pg_cron` jobid 3: `select public.procesar_hallazgos_todos()`
cada 15 min (`*/15 * * * *`, active). Escribe en `hallazgos_ia` via `_upsert_hallazgo` (idempotente),
con severidades, acciones por hallazgo y categorias. La pagina de Avisos ya los pinta (`useAvisos` +
`avisosCategorias`), y `cargarHallazgos` / `marcarHallazgo` ya existen.

**Pero es CIEGA a la agenda.** `procesar_hallazgos_negocio` detecta exactamente 6 tipos, ninguno de
agenda: `senal_sin_pagar`, `cita_sin_confirmar`, `bandeja_sin_responder`, `presupuesto_sin_respuesta`,
`stock_bajo`, `fuga_clienta`. Nada de retraso / solape / hueco_muerto / reposo_desaprovechado.

**El motivo es arquitectonico**, y es el nudo de este slice: el barrido es **plpgsql** y el motor de
agenda es **TypeScript** (`lib/organizarAgenda.ts`, 57 tests). El SQL no puede llamar al motor.

## Decisiones

- **NO reimplementar el analisis en SQL.** Seria un segundo motor divergiendo del primero, y el
  informe insiste en que la agenda sea "fuente de verdad perfecta" (#4). Un solo motor.
- **El cron llama a un edge function que importa el motor real.** `pg_net` YA esta instalado (se
  verifico), asi que `procesar_hallazgos_todos` (o un cron nuevo) puede hacer `net.http_post` a un
  edge Deno nuevo (`vigilar-agenda`) que importa `lib/organizarAgenda.ts` tal cual y escribe los
  hallazgos por RPC. Cero duplicacion de logica.
- **Reusar `_upsert_hallazgo`**, que ya es idempotente (no duplica en cada barrido de 15 min).
- **Categoria `ineficiencia`**: ya existe en `avisosCategorias.ts`. Los 4 tipos del organizador
  (`retraso`, `solape`, `hueco_muerto`, `reposo_desaprovechado`) mapean ahi.

## PELIGRO: los hallazgos urgentes mandan WhatsApp

Al final de `procesar_hallazgos_negocio`:

```sql
insert into public.hallazgos_notificaciones (..., canal)
select ..., 'whatsapp' from public.hallazgos_ia h
where h.severidad = 'urgente'
```

**Todo hallazgo marcado `urgente` entra en la cola de WhatsApp real.** Un solape detectado cada 15
min podria disparar mensajes al salon en bucle.

Por tanto: **los hallazgos de agenda nacen con severidad `alta` como maximo, NUNCA `urgente`**, hasta
que se decida explicitamente que un solape merece un WhatsApp. Es la diferencia entre una feature
util y spam a los clientes. Requiere test que lo blinde.

## Diseño (borrador, pendiente de aprobar)

1. Edge `supabase/functions/vigilar-agenda/index.ts` (Deno): recibe `negocio_id`, carga citas del dia
   + profesionales + horarios + bloqueos + config (lo mismo que cablea hoy `AgendaCalendar`), corre
   `analizarAgendaDia` e inserta los `ProblemaAgenda` como hallazgos via RPC.
2. RPC `upsert_hallazgo_agenda` (security definer, service_role): envoltorio sobre `_upsert_hallazgo`
   con severidad acotada a `alta`.
3. `procesar_hallazgos_negocio` gana un `net.http_post` al edge, o un cron propio cada 15 min.
4. La pagina de Avisos no cambia: ya pinta cualquier hallazgo.

## Cuestiones abiertas (para Alexandru/Jose)

- **Coste**: un edge cada 15 min por cada negocio activo. Con 3 negocios es trivial; hay que ver el
  numero al que se quiere escalar.
- **Ruido**: el organizador propone por profesional. ¿Un hallazgo por profesional o uno agregado
  ("3 ineficiencias hoy")? Propuesta: **uno agregado por negocio**, con el detalle en `items`.
- **Horario**: ¿vigilar 24/7 o solo dentro de la jornada? Analizar la agenda a las 4:00 no aporta.
  Propuesta: solo si el negocio esta abierto ahora (ya se sabe con `ventanaDelDia`).

## Fuera de alcance

Los otros dos frentes de #1 (comprension profunda del salon: necesita esquema nuevo + Jose;
optimizacion global del dia) · "retrasar cuando es beneficioso" (#3) · compresion de servicios (#2,
bloqueada por Jose).
