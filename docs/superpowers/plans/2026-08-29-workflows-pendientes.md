# Workflows de GitHub pendientes (anotado el 29 ago 2026, NO implementado)

**Estado: aparcado a peticion del usuario.** Esto es la lista, con el porque de cada uno,
para retomarla sin volver a razonarla. Nada de esto esta hecho.

## Contexto: por que merece la pena

Lo que ya hay es solido. `ci.yml` encadena typecheck, lint, cinco suites de tests,
validacion de esquemas Zod, la puerta de claves, el catalogo de modelos de IA, el
chequeo de tipos de tres edge functions y los vigilantes estaticos; `canario.yml`
repite el smoke contra produccion cada hora.

Pero la auditoria del 29 ago encontro **cuatro cosas criticas y ninguna la vio esa CI**,
porque las cuatro viven donde no mira: dentro de Postgres y en la configuracion de
produccion.

| Lo que se encontro | Por que la CI no lo vio |
|---|---|
| 29 RPC definer abiertas a `anon` | Los grants se crean por migracion aplicada en remoto, no por PR |
| `profiles` legible/escribible entre salones | Idem: es una politica RLS, no codigo del repo |
| Trigger que tumbaba el guardado de horarios | Solo se manifiesta ejecutando SQL contra la BD |
| Cron de la agenda mirando un tenant vacio | Es configuracion de `cron.job`, no del repo |

Las cuatro las detecta hoy `public.vigilancia_bd()` (comprobaciones 2, 7, 8, 9, 10 y 11),
**y no la ejecuta nadie automaticamente.** Ese es el hueco numero uno.

## Las seis, por orden de valor

### 1. Ejecutar `vigilancia_bd()` como workflow programado
La capa 2 del diseño de vigilantes existe en la base de datos y solo corre si alguien la
llama a mano. Un job cada 6 h que la invoque con `VIGILANCIA_TOKEN`, publique en la
pestaña Salud y **falle si hay algun `bloqueante`**.

Habria cazado los cuatro criticos de arriba. Es, con diferencia, el de mayor retorno.

### 2. Barrido de secretos en cada push
`gitleaks` como job bloqueante, mas las reglas propias del repo: `eyJ` (JWT heredado),
`sb_secret_`, `service_role` en cualquier fichero versionado.

La decision 9 del CLAUDE.md existe porque aparecieron cinco ficheros con la
`service_role` en claro en un repo que entonces era publico. Hoy la norma esta escrita
y **no la hace cumplir nada**.

### 3. Verificacion posterior al despliegue
Al mergear a `master`: esperar al deploy de Vercel, lanzar el smoke contra produccion ya
—sin esperar hasta una hora al canario— y comprobar **el bundle**, no el codigo fuente:

```bash
grep -rl 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' web/app/   # tiene que dar 0
```

Esa comprobacion esta documentada al detalle en la decision 9 (Metro incrusta los
`EXPO_PUBLIC_*` como literal y cachea por fichero: el bundle salio con la clave vieja
aunque el codigo estaba limpio y los tests pasaban) y **sigue siendo un paso manual que
alguien tiene que acordarse de hacer**.

### 4. Guardia de migraciones
Comparar `supabase/migrations/` con el historial remoto y avisar de ficheros sin aplicar,
salvo los que lleven una marca explicita de *aplicar despues de desplegar*.

"El historial remoto manda" es la norma; sin guardia, dentro de dos semanas nadie
recuerda si un fichero sin aplicar fue a proposito.

### 5. Presupuesto de bundle
Medir `web/app/_expo/**` tras el build y fallar si crece mas de un umbral respecto a
`master`. Comentar el tamaño en el PR.

La decision 7 nacio de un bundle de ~7 MB que se re-descargaba en cada carga. El arreglo
fue la cache; **el tamaño en si no lo vigila nadie, y crece solo**.

### 6. Dependabot, agrupado y semanal
No hay `.github/dependabot.yml`. Con Expo 56, React Native 0.85 y `supabase-js` en
produccion, los avisos de seguridad de dependencias no llegan a ninguna parte.
Agrupado y semanal es un PR al mes, no ruido diario.

## Dos apuntes sobre lo que ya existe

- **`deno task check:edges` cubre 3 edge functions de 44.** Ampliarlo es barato. Ojo al
  intentarlo desde un entorno sin red: mapear `https://esm.sh/@supabase/supabase-js@2` al
  paquete de `node_modules` **NO sirve para juzgar** — los genericos del build de npm no
  son los de esm.sh y salen ~29 errores falsos (el propio codigo lo dice: *"any deliberado:
  los genericos de SupabaseClient derivados de esm.sh no casan"*). Hay que ampliarlo y
  dejar que lo ejecute la CI, que si tiene red.
- **El canario reinstala Chromium entero cada hora**, 24 veces al dia, sin cache.
  `actions/cache` sobre `~/.cache/ms-playwright` se paga solo.
