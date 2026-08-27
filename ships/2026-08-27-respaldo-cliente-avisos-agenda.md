# Ship: el respaldo cliente de Avisos analiza la agenda a ciegas (sin jornadas ni cierres)

**Estado:** cerrado 2026-08-27 (código) · Añadidas `horarios_profesional` (columnas mínimas) y `cierres_negocio` (solo `fecha`) al `Promise.all` de `useAvisos.ts` y pasadas a `analizarAgendaDia` como `horariosProfesional`/`cierres`. Pendiente: verificación visual en demo/salón real de que la detección coincide con vigilar-agenda. `npx tsc --noEmit` sin errores nuevos (el de `gridRect` en AgendaCalendar.web.tsx es previo y ajeno).

## Contexto

Desde `eef06d943`, la campana de Avisos reconcilia dos fuentes de problemas de agenda: el hallazgo del servidor (vigilar-agenda + modo ojo) manda cuando existe, y el análisis cliente (`analizarAgendaDia`, ~línea 301) queda como respaldo por tipo — único que se ve en la demo y mientras la vigilancia no haya pasado.

El problema: ese análisis cliente **no pasa `horariosProfesional` ni `cierres`** a `analizarAgendaDia`. Consecuencias:

- `fuera_jornada` es indetectable en el cliente (necesita las jornadas reales por profesional). En la demo no hay hallazgos, así que la demo no verá NUNCA avisos de fuera de jornada.
- Los huecos se calculan contra la ventana del SALÓN para todos: marca huecos en horas que esa persona no trabaja (turnos de mañana/tarde con comida en medio) y ofrece compactar a través de la pausa.

El servidor sí tiene esos datos (sus consultas los traen), por eso el respaldo es estrictamente peor.

## Tarea

1. En `useAvisos.ts`, junto a las consultas existentes de `bloqueos_profesional` / `negocio_horarios`, añadir `horarios_profesional` y `cierres_negocio` del negocio.
2. Pasarlas al `analizarAgendaDia` en las opts `horariosProfesional` y `cierres` (ver la llamada equivalente en `supabase/functions/vigilar-agenda/index.ts` como referencia — ojo ahí se aplican `alRelojDelSalon`; en el navegador NO hace falta, ya corre en hora del salón).
3. Verificar que la detección de `fuera_jornada` y de huecos respetando turnos coincide con `vigilar-agenda` para el mismo día (comparar contra un salón real o la demo con datos sembrados).

**Ojo con el rendimiento:** ese hook es el mayor lastre medido de la app (ver comentario RENDIMIENTO en el propio fichero); dos consultas más por vuelta de sondeo deben justificarse — considerar pedir las columnas mínimas.
