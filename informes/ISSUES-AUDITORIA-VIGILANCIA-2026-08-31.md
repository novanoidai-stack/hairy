# INFORME: issues abiertos de la auditoría de vigilancia — 31 ago 2026

> Sesión de origen: auditoría de la mega-observabilidad + forense del 30 ago.
> Todo lo de aquí está verificado contra producción con consultas reales (nada
> es de memoria). Los issues viven también en el panel de Salud (pestaña Salud,
> ámbito correspondiente) y, en cuanto se configuren `TELEGRAM_BOT_TOKEN` y
> `GITHUB_TOKEN`, se escalarán solos con `notificar.mjs` / `issues.mjs`.
>
> **Cómo usar este informe en otra sesión:** cada sección es autónoma (evidencia,
> causa, arreglo propuesto y criterio de cierre). Se puede atacar en cualquier
> orden salvo la dependencia marcada en P1. Los comandos de verificación están
> listos para copiar.

---

## P1 — CRÍTICO: la base de datos NO tiene backups ni PITR

**Ámbito:** `continuidad` · **Nivel:** bloqueante · **Vigilante:** `dr-backups.mjs`

### Evidencia (Management API, 30 ago 2026)
```json
GET /v1/projects/vtrggiogjrhqtwbhbgia/database/backups
{"region":"eu-west-1","pitr_enabled":false,"walg_enabled":true,"backups":[],"physical_backup_data":{}}
```
`backups: []` = cero copias diarias. `pitr_enabled: false` = sin recuperación
punto-en-tiempo. El plan actual es free.

### Qué significa en cristiano
Si Supabase tiene un incidente, o alguien ejecuta un DELETE mal puesto a las
16:00, se pierde TODO: citas, clientes, cobros, fichas de color, cadenas
VeriFactu (que además tienen valor legal). No hay forma de volver atrás.

### Arreglo propuesto
1. **Opción A (recomendada):** subir el proyecto a plan Pro (~25 $/mes). Incluye
   backups diarios con 7 días de retención. El PITR es un add-on aparte: si no
   se contrata, documentar la decisión (el vigilante lo tendrá en aviso).
2. **Opción B (si no se quiere pagar aún):** backup externo propio diario:
   `pg_dump` vía Management API o un GitHub Action diario con el connection
   string del pooler, cifrado y subido a un almacenamiento privado. ES
   SECUNDARIO: sin prueba de restauración no vale (ver P1b).
3. Añadir el secret `SUPABASE_ACCESS_TOKEN` al repo para que `dr-mensual.yml`
   corra con token real (hoy corre "sin token" en aviso).

### P1b — La prueba de restauración (ir con P1)
El vigilante emitirá cada mes el aviso `dr/prueba-restauracion-pendiente` hasta
que exista una restauración de verdad. Procedimiento: crear proyecto efímero →
restaurar el último backup → correr contra él
`select * from public.vigilancia_bd_invariantes()` y `vigilancia_bd_profunda()`
→ anotar duración (es el RTO real) → borrar el efímero. Cerrar el issue solo
después de la primera pasada.

### Criterio de cierre
`node scripts/vigilantes/dr-backups.mjs` (con token) no emite
`dr/sin-backups` ni `dr/backup-viejo`, y existe constancia de una restauración
probada (issue del DR cerrado con la duración anotada).

---

## P2 — Convención de propina: dos formas de apuntarla conviven

**Ámbito:** `coherencia` · **Nivel:** bloqueante (6 hallazgos) · **Vigilante:** `vigilancia_bd_invariantes()`

### Evidencia (producción)
- **Convención A (161 cobros, la del código actual):** `total_cents` YA incluye
  la propina. Verificada contra `components/pos/CobroSheet.tsx:323-325`
  (`totalCents = neto + propinaCents`) y contra el desglose, que suma `total`.
  Ejemplo real: `efectivo=1200, total=1200, propina=200` → cuadra.
- **Convención B (6 cobros, `demo_salon_001`, 24–29 ago, todos `datafono`):**
  `total` NO incluye la propina y el desglose sí. Ejemplo:
  `datafono=2000, total=1800, propina=200` → descuadre de 200 céntimos.
- **Bonus de confusión:** el comentario de la migración `20260830210025`
  (sección 3) declara el invariante como `efectivo+datafono+online+bizum =
  total + propina`, que es la convención B. **Ese comentario está mal** y ya
  engañó una vez (a mí, en la primera versión del vigilante).

### Decisión de producto necesaria (30 segundos)
Confirmar que manda la **convención A** (total siempre incluye propina). Es la
que usa el cliente, la mayoritaria (161 vs 6) y la que hace que "total" signifique
lo que la clienta pagó de verdad.

### Arreglo propuesto (asumiendo A)
1. Corregir los 6 cobros de la demo: `total_cents` de 1800 → 2000 (o repoblar
   el tenant demo con `resembrar_demo()` si el seed ya genera la convención A —
   comprobarlo primero, porque esos 6 cobros salieron de la re-siembra diaria
   del cron de las 16:00 UTC: **si el seed los genera mal, arreglar el seed**,
   no los datos, o volverán a nacer rotos mañana).
2. Corregir el comentario de `20260830210025` no es posible (es historial), pero
   la convención correcta ya está documentada en CLAUDE.md y en el propio
   `20260831000000_vigilancia_bd_invariantes.sql`.
3. Opcional pero recomendable: un CHECK suave no es viable por los históricos;
   en su lugar, el vigilante ya lo vigila en cada corrida.

### Criterio de cierre
`select count(*) from public.vigilancia_bd_invariantes()` donde
`clave like 'bd-invariantes/caja-descuadrada%'` = 0 en dos re-siembras
consecutivas de la demo (para demostrar que el seed ya no los fabrica).

---

## P3 — Citas dobladas: 108 solapes, y NO solo por la carrera del portal

> **AVANCE 1 sep 2026 (sesión de continuación):**
> - **Los 77 de la demo ya NO existen.** Causa raíz encontrada: `resembrar_demo()`
>   fabricaba UN par al día (Mechas de Carmen `ancla..ancla+75` vs Lavado de Sara
>   `ancla+45..ancla+75`, ambas con María); la cita se completaba, se cobraba, y el
>   delete del seed solo borra desde hoy → el par quedaba vivo para siempre desde
>   febrero. Arreglado con parche por ancla (lavado → `ancla+75..ancla+105`) +
>   limpieza de históricos con sus cobros (mismo orden que usa el propio seed) en
>   `supabase/migrations/20260901113000_resembrar_demo_sin_solape_y_limpieza_historica.sql`,
>   aplicada y verificada: **0 pares en dos re-siembras consecutivas**.
> - **Los 30 del salón real, identificados y documentados (pendiente decisión de
>   Carlos):** NO son clientas dobladas. Son **25 citas anónimas (`cliente_id`
>   NULL) del sábado 08-ago 10:00–14:00, todas SUSANA, canal manual, todas
>   `completada` y todas cobradas a 0 céntimos en efectivo**. 12 de ellas se
>   solapan entre sí (30 pares). Pinta inequívoca de carga de prueba/importación
>   del primer día. Opciones: (a) cancelar las 12 solapadas (el candado excluye
>   canceladas; los cobros a 0 no se tocan, que los borra el trigger financiero),
>   (b) dejarlas y eximirlas — descartado, ensucia al vigilante para siempre.
> - **El 1 de `salon_pruebas_mecha`:** tenant de pruebas (Marta Ledo, 18-ago,
>   anticaspa whatsapp vs hidratación manual). Mismo tratamiento que la demo.
> - La migración del candado `20260831220000` sigue SIN aplicar a propósito: su
>   guardia fallaría con los 30+1 vivos. Se aplica cuando Carlos decida.
> - Queda pendiente el test E2E del portal con dos reservas concurrentes.
>
> **CIERRE 1 sep 2026 (tarde, con decisión de Carlos):**
> - **Decisión de Carlos sobre los 30 reales + el 1 de pruebas: NO se tocan.**
>   Es un salón real y no se quiere tocar su histórico; se quedan vivos con su
>   aviso del vigilante (exactamente los 2 avisos actuales: florent_surez y
>   salon_pruebas_mecha).
> - En consecuencia el candado `20260831220000` se aplicó con **fecha de corte
>   2026-09-01**: el EXCLUDE protege toda cita que nazca o se mueva a partir de
>   esa fecha; los 31 pares anteriores quedan exentos y vigilados como dato.
>   Verificado en producción: insert solapado → 23P01; `resembrar_demo()` pasa
>   bajo el candado; `migration repair --status applied` hecho.
> - **Criterio extra cumplido:** `scripts/vigilantes/carrera-reserva.test.mjs`
>   dispara dos `crear_cita_publica` reales en paralelo sobre el mismo hueco de
>   la demo (con captcha tokens sembrados) y exige exactamente una ganadora.
>   Pasa (`node --test`). Se limpia detrás (cita cancelada, tokens y clientes
>   de prueba fuera).
> - **P3 queda CERRADA** en este estado: demo 0 pares (dos re-siembras
>   consecutivas), salón real 30 + pruebas 1 documentados y aceptados como
>   aviso permanente, candado activo para todo lo nuevo. Si algún día se
>   limpian los históricos, quitar el término de corte del WHERE del constraint
>   y el vigilante podrá llegar a 0.

**Ámbito:** `coherencia` · **Nivel:** aviso (deuda heredada) · **Vigilante:** `vigilancia_bd_invariantes()`

### Evidencia (producción)
| negocio | pares solapados |
|---|---|
| demo_salon_001 | 77 |
| florent_surez_peluqueros_15004 (REAL) | 30 |
| salon_pruebas_mecha | 1 |

Consulta de verificación:
```sql
SELECT a.negocio_id, count(*)
FROM public.citas a JOIN public.citas b
  ON a.profesional_id = b.profesional_id AND a.id < b.id
 AND a.estado <> 'cancelada' AND b.estado <> 'cancelada'
 AND a.grupo_id IS NULL AND b.grupo_id IS NULL
 AND tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin)
GROUP BY 1;
```

### Las TRES puertas por las que entra un solape (investigar todas)
1. **Carrera del portal** (la conocida): dos clientas eligen el mismo hueco a
   la vez; `crear_cita_publica` no serializa y entran las dos.
2. **Creación manual en la agenda** (apuntada por Carlos): el formulario de
   cita nueva puede no estar validando solapes contra citas existentes, o
   permitirlo con un warning que nadie lee.
3. **Arrastre en la agenda**: al mover una cita con drag & drop, si la
   validación de hueco no se repite en el UPDATE, se puede soltar encima de
   otra cita. Mismo problema para "alargar" tirando del borde.

**Tarea de diagnóstico previa (importante):** revisar en
`app/(tabs)/*` y `lib/` qué caminos de escritura validan solapes hoy
(`crear_cita*`, `modificar_cita*`, el drag del calendario) y clasificar los 108
pares por origen (`canal`: web/manual/whatsapp) para saber qué puerta produce
qué. Consulta útil:
```sql
SELECT least(a.canal, b.canal) || '-' || greatest(a.canal, b.canal) AS origen, count(*)
FROM public.citas a JOIN public.citas b ON ... GROUP BY 1;
```

### Arreglo de fondo (por capas, en este orden)
1. **BD — el candado de verdad.** Una vez limpios los 108 históricos y
   confirmado que las citas de GRUPO comparten profesional a propósito:
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ALTER TABLE public.citas
     ADD CONSTRAINT citas_solape_profesional_excl
     EXCLUDE USING gist (
       profesional_id WITH =,
       tstzrange(inicio, fin) WITH &&
     )
     WHERE (estado <> 'cancelada' AND grupo_id IS NULL AND profesional_id IS NOT NULL);
   ```
   Con esto, da igual por qué puerta entre: la BD rechaza el solape. Los
   errores 23P01 deben traducirse a mensaje amable en `lib/errores.ts`.
2. **App — validación previa amable.** En creación manual y en el drag:
   comprobar disponibilidad antes de soltar (la llamada a
   `disponibilidad_publica`/equivalente interno ya existe) y ofrecer el hueco
   alternativo más cercano en vez de rechazar en seco. La BD es el candado; la
   UI es la educación.
3. **Limpieza de históricos.** Los 108: revisar los 30 del salón real uno a
   uno (¿fue error o el peluquero apuntó dos servicios a la vez a propósito?),
   los de la demo se van con la re-siembra. DOCUMENTAR qué se decidió antes de
   borrar nada.

### Criterio de cierre
- Constraint creado y vigente (el vigilante de esquema lo ancla).
- La consulta de arriba da 0 para salones reales.
- Test E2E del pilar 2 (portal) con dos reservas concurrentes del mismo hueco:
  exactamente una gana, la otra recibe mensaje amable.

---

## P4 — Mina: `prevent_delete_financial_records` referencia columnas que no existen

**Ámbito:** `base-de-datos` · **Nivel:** aviso · **Vigilante:** `vigilancia_bd_triggers_ciegos()`

### Evidencia
La función (compartida por `cobros` y `cobro_lineas` vía `TG_TABLE_NAME`) tiene:
- Rama de `cobros`: `OLD.negocio_id` (existe) — pero la rama `else` lee
  `OLD.cobro_id`, que NO existe en `cobros`.
- Rama de `cobro_lineas`: `OLD.cobro_id` (existe) — pero la rama del `if` lee
  `OLD.negocio_id`, que NO existe en `cobro_lineas`.

Hoy no explota porque cada tabla ejecuta solo su rama. Pero es la trampa exacta
del 30 ago: renombra alguien una tabla, o reordena el IF, y **borrar un cobro
empieza a fallar con 42703** sin que nadie haya tocado esa lógica.

### Arreglo propuesto
Reescribir la función con la técnica segura del repo:
```sql
declare v record; ...
v := to_jsonb(coalesce(new, old));  -- patrón documentado en CLAUDE.md
v_negocio := (v ->> 'negocio_id');
```
o simplemente separar en dos funciones (una por tabla), que es más simple y
deja de necesitar `TG_TABLE_NAME`.

### Criterio de cierre
`vigilancia_bd_triggers_ciegos()` no emite hallazgos para estos triggers
(pasan a no referenciar nada inexistente) y un DELETE de prueba en rollback
funciona en ambas tablas.

---

## P5 — A `cerrar_caja` le falta el grant de la versión nueva (Bizum)

**Ámbito:** `base-de-datos` · **Nivel:** aviso · **Vigilante:** `vigilancia_bd_sobrecargas_rpc()`

### Evidencia
Dos firmas: 3 argumentos (anon SÍ puede) y 4 argumentos con `p_contado_bizum_cents`
(anon NO puede). La vieja está concedida a `anon`, la nueva no.

### Qué significa
Si algún día se elimina la firma vieja (higiene de sobrecargas, como se hizo con
`vender_bono`), cerrar caja desde el canal que usa anon se rompe con 403/404
sin haber tocado la lógica. Además, mientras ambas existan, si el cliente manda
los 4 argumentos y solo la vieja tiene grant... PostgREST ni llega a probar: es
la mitad del incidente del HTTP 300.

### Arreglo propuesto
Decidir si `cerrar_caja` debe ser accesible a anon (¿lo es hoy de verdad? si
solo la usa la app autenticada, el grant viejo sobra y hay que REVOCARLO, no
conceder el nuevo). Luego homogeneizar: mismo grant en ambas firmas o una sola
firma.

### Criterio de cierre
`vigilancia_bd_sobrecargas_rpc()` no emite
`sobrecarga-grants-incoherentes` para `cerrar_caja`.

---

## P6 — 8 claves foráneas sin índice

**Ámbito:** `rendimiento` · **Nivel:** aviso · **Vigilante:** `vigilancia_bd_profunda()` (vector 1)

### Evidencia
```
cita_fases.cita_fases_profesional_id_fkey
pruebas_alergia.pruebas_alergia_cliente_id_fkey
pruebas_alergia.pruebas_alergia_producto_id_fkey
pruebas_alergia.pruebas_alergia_profesional_id_fkey
cola_dia.cola_dia_cliente_id_fkey
cola_dia.cola_dia_profesional_id_fkey
cola_dia.cola_dia_servicio_id_fkey
vigilancia_diagnosticos_ia.vigilancia_diagnosticos_ia_ejecucion_id_fkey
```

### Qué significa
Borrar o actualizar una fila padre (un cliente, un profesional) obliga a la BD
a leer la tabla hija ENTERA para comprobar referencias. Hoy no se nota; con
50.000 citas, cada baja de cliente es un barrido completo.

### Arreglo propuesto
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cita_fases_profesional ON public.cita_fases(profesional_id);
-- ...equivalente para las demás
```
Migración nueva con los 8 índices `CONCURRENTLY` (ojo: CONCURRENTLY no puede
ir dentro de transacción — aplicar con autocommit o sin CONCURRENTLY si la
tabla es pequeña).

### Criterio de cierre
`vigilancia_bd_profunda()` no emite `fk-sin-indice`.

---

## Orden recomendado de ataque

1. **P1** (hoy mismo, es un click en el dashboard o una decisión de coste).
2. **P2** (30 min: comprobar el seed de la demo, corregir 6 filas o el seed).
3. **P3-diagnóstico** (clasificar los 108 por origen/canal) → luego el candado
   de BD + validación en drag/manual.
4. **P4, P5, P6** en una tarde: son mecánicos y sus criterios de cierre son
   consultas que ya existen.

## Recordatorios de configuración (no son issues de código)
- Secrets del repo para que los canales respiren: `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID`, `SUPABASE_ACCESS_TOKEN` (con rotación; el usado en la
  auditoría era de un uso y ya se comunicó por chat — **tratarlo como
  comprometido y revocarlo**).
- Labels `vigilancia` y `bloqueante` en el repo para los issues automáticos.
