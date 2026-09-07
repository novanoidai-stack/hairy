# Tutorial: cómo auditar Mecha sin quedarte sin cuota

Escrito el 7 sep 2026, después de que una auditoría se comiera 5,69 M de tokens en 7 minutos
sin entregar informe. Esto es lo que haces tú, paso a paso.

---

## Parte 1 — Ahora mismo (5 minutos)

### 1.1 Revocar el token que se filtró

El token personal que pegaste en el chat sigue vivo. Un token `sbp_` **no abre una base de
datos: abre la cuenta entera de la organización** (Management API). Está en claro en tres
ficheros de tu disco y viajó a OpenAI.

1. Entra en https://supabase.com/dashboard/account/tokens
2. Busca el token de la lista y pulsa **Revoke**.
3. Si lo necesitas para scripts, genera uno nuevo y **guárdalo en `.env`**, nunca en el chat:

   ```
   SUPABASE_ACCESS_TOKEN=<token-nuevo>
   ```

   Ábrelo con un editor. **NUNCA con `echo "..." >> .env` desde PowerShell** — escribe UTF-16
   y deja el fichero ilegible (decisión 9 del `CLAUDE.md`).

### 1.2 (Opcional) Borrar los rastros locales

Los ficheros donde quedó el token en claro:

```
~/.codex/sessions/2026/09/07/rollout-2026-09-07T16-52-46-*.jsonl
~/.codex/logs_2.sqlite
~/.codex/thread_history_1.sqlite
```

Borrarlos NO desactiva el token. Revócalo igual. Esto es solo higiene.

---

## Parte 2 — Cómo pedir cada pasada

**Ya no tienes que explicarle las reglas.** Están en `AGENTS.md`, sección
*"Presupuesto de contexto"*, y Codex lo lee solo al arrancar.

Lo único que tienes que hacer es **acotar el alcance**. Abre una sesión **nueva** (no sigas
una vieja: arrastra todo el contexto) y pega:

```
Auditoría de Mecha — SOLO [ÁREA]. No audites nada más.
Respeta la sección "Presupuesto de contexto" de AGENTS.md.
Termina escribiendo informes/auditoria-<fecha>/INFORME-<area>.md.
```

Sustituyendo `[ÁREA]` por **una** de estas, nunca varias:

| Pasada | `[ÁREA]` | Qué mira |
|---|---|---|
| 1 | `coherencia de cifras y planes` | precios (3 sitios), referidos (4 sitios), qué incluye cada plan |
| 2 | `portal público y backend: seguridad, RLS y RPC` | advisors, la regla del parámetro, políticas |
| 3 | `software: lógica, agenda y caja` | smoke, tests, invariantes de datos |
| 4 | `funcionalidades que faltan` | qué construir, contra los informes de `informes/` |

**Una pasada = una sesión = un informe.** Cuando termine, cierra la sesión y abre otra.
No encadenes dos pasadas en la misma conversación.

---

## Parte 3 — Cómo saber si se está desmadrando

Señales de alarma, en orden de gravedad. Si ves alguna, **párale** y recuérdale AGENTS.md:

1. **Lee ficheros enteros.** Si ves `Get-Content -Raw` o `cat` de un `.ts`/`.mjs` completo,
   mal. Debe usar `grep` y leer fragmentos.
2. **Encadena lecturas.** `Get-Content -Raw a; Get-Content -Raw b; Get-Content -Raw c` es la
   forma más rápida de fundir la cuota. Uno de esos llegó a 174 KB (~43k tokens).
3. **Abre subagentes.** Si dice que va a lanzar tareas en paralelo, dile que no. Cada fork
   hereda el contexto entero y lo multiplica.
4. **Lee el código de los vigilantes.** Si abre `precios.mjs`, `planes.mjs`, `referidos.mjs`
   o `bd-comun.mjs`, está a punto de recalcular a mano lo que `npm run vigilar:rapido` da en
   2,5 segundos. Párale.
5. **Lleva 10 minutos sin escribir nada en `informes/`.** El informe es el entregable.

**Regla de oro:** un informe corto entregado vale infinitamente más que un barrido exhaustivo
que se queda sin cuota antes de la conclusión.

---

## Parte 4 — Lo que puedes correr tú, gratis, sin IA

Esto es lo más importante del tutorial. **Gran parte de la auditoría ya está automatizada.**
Estos comandos no gastan un solo token y contestan la mayoría de las preguntas:

```bash
npm run vigilar:rapido
```
33 vigilantes en ~2,5 segundos. Te dice bloqueantes y avisos. **Si da 0 bloqueantes, no hay
nada roto que el repo sepa detectar.** Es el primer comando que debes correr siempre.

```bash
npm run vigilar
```
El completo, incluida la parte lenta.

```bash
npm run vigilar:bd
```
Los invariantes que solo se pueden comprobar dentro de Postgres: la regla del parámetro,
RLS sin InitPlan, ayudantes volátiles, triggers ciegos, solapes de agenda, arqueo de caja.

```bash
npx tsc --noEmit
```
Typecheck. Silencio = limpio.

```bash
npm run test:componentes
```

```bash
npm run vigilar:test
```
Los tests de los propios vigilantes (que no estén ciegos).

**Flujo recomendado antes de pedir nada a una IA:** corre `vigilar:rapido`. Si sale limpio,
ya sabes que lo detectable está bien y la IA solo tiene que mirar lo que ningún vigilante
sabe mirar. Eso reduce el alcance —y el gasto— muchísimo.

---

## Parte 5 — Por qué pasó, en una tabla

Para que no se te olvide por qué existen estas reglas:

| | |
|---|---|
| Sesiones | 4 (1 principal + 3 subagentes forkeados) |
| Turnos | 73 |
| Tokens totales | **5.688.801** |
| — entrada | 5.663.506 |
| — salida | 25.295 (**0,4%**) |
| Contexto por turno | 104.000–135.000 |
| Resultados >20 KB | **121** (el mayor: 174 KB) |
| Informes entregados | **0** |

El 99,6% del gasto fue *releer*, no *escribir*. Y tu documentación (`CLAUDE.md` + `AGENTS.md`)
es solo el 15% del contexto por turno: **el problema nunca fue la documentación.**
