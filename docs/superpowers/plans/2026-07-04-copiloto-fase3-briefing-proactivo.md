# Copiloto Fase 3 — Briefing proactivo · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el copiloto, al abrir su panel en Agenda, muestre un briefing proactivo de señales que requieren atención (operativas + puesta en marcha) con acciones que reusan flujos existentes.

**Architecture:** Detección determinista. Un RPC nuevo `agenda_briefing(p_scope)` agrega las 4 señales operativas (reusando `clientes_en_riesgo_fuga()`, la disponibilidad citas+bloqueos, y dos predicados SQL nuevos simples) y devuelve un array de señales. Las señales de puesta en marcha salen del hook existente `useOnboardingStatus`. Un componente `BriefingAgenda` fusiona y rankea ambas fuentes dentro del panel `AsistenteAgenda`. El briefing no escribe: cada acción reusa el flujo propone→confirma existente.

**Tech Stack:** Supabase Postgres (RPC `security definer`), Deno edge (sin cambios en esta fase), Expo + react-native-web, TypeScript.

**Proyecto Supabase:** `vtrggiogjrhqtwbhbgia`. Migraciones a `migrations/` + aplicar en remoto. Tras cada migración: pasar advisors de seguridad.

---

## Estructura de archivos

- Crear `migrations/copiloto-briefing-proactivo.sql` — RPC `agenda_briefing` + grants.
- Crear `migrations/tests/briefing-asserts.sql` — asserts de detección por señal.
- Crear `lib/briefing.ts` — tipos `BriefingSignal`, llamada al RPC, construcción de señales de setup desde `useOnboardingStatus`, y `rankearSenales()`.
- Crear `components/agenda/BriefingAgenda.web.tsx` — render del briefing (cabecera + tarjetas).
- Crear `components/agenda/BriefingAgenda.tsx` — stub nativo (paridad del split).
- Modificar `components/agenda/AsistenteAgenda.web.tsx` — montar `BriefingAgenda` al abrir, gateado por toggle.
- Modificar `components/agenda/AgendaCalendar.web.tsx:407` — leer `cfg.briefingProactivoActivo`.
- Modificar `app/(tabs)/configuracion.web.tsx` — switch de `briefingProactivoActivo` (pestaña Agenda).

**Convenciones:** código en inglés, comentarios en español, sin emojis. Móvil primero (`useResponsive`). RPC nueva no ejecutable por `anon` (grant explícito a `authenticated`).

---

## Task 1: RPC `agenda_briefing` — predicados nuevos (citas en riesgo + señales sin pagar)

Empezamos por los dos detectores nuevos y simples; huecos y fuga se añaden en Task 2 (reuso).

**Files:**
- Create: `migrations/copiloto-briefing-proactivo.sql`
- Test: `migrations/tests/briefing-asserts.sql`

- [ ] **Step 1: Escribir el assert que falla (detección de citas en riesgo y señales sin pagar)**

En `migrations/tests/briefing-asserts.sql`:
```sql
-- Ejecuta como service_role en un negocio de prueba con datos sembrados.
-- Requiere: un negocio v_neg con (a) una cita 'pendiente' sin depósito en <48h,
-- (b) una cita con deposito_requerido y no pagado a futuro.
do $$
declare
  v_res jsonb;
  v_riesgo int;
  v_senal int;
begin
  select public.agenda_briefing_operativa('__TEST_NEG__', 'all') into v_res;
  select (s->>'count')::int into v_riesgo from jsonb_array_elements(v_res) s where s->>'tipo' = 'citas_en_riesgo';
  select (s->>'count')::int into v_senal  from jsonb_array_elements(v_res) s where s->>'tipo' = 'senales_sin_pagar';
  assert coalesce(v_riesgo,0) >= 1, 'esperaba >=1 cita en riesgo';
  assert coalesce(v_senal,0)  >= 1, 'esperaba >=1 senal sin pagar';
  raise notice 'OK citas_en_riesgo=% senales_sin_pagar=%', v_riesgo, v_senal;
end $$;
```
Nota: usamos una función interna `agenda_briefing_operativa(negocio_id, scope)` que recibe el negocio por parámetro para poder testear con service_role. La RPC pública `agenda_briefing(scope)` (Task 3) la envuelve derivando el negocio del `auth.uid()`.

- [ ] **Step 2: Ejecutar el assert y verlo fallar**

Run (MCP Supabase `execute_sql` contra `vtrggiogjrhqtwbhbgia`, o `psql`): ejecutar `migrations/tests/briefing-asserts.sql`.
Expected: FAIL con `function public.agenda_briefing_operativa(unknown, unknown) does not exist`.

- [ ] **Step 3: Implementar `agenda_briefing_operativa` con los dos predicados nuevos**

En `migrations/copiloto-briefing-proactivo.sql`:
```sql
-- Detector interno (recibe negocio_id explícito; la RPC pública lo envuelve).
-- Columnas usadas de citas: estado, inicio, deposito_requerido, deposito_pagado,
-- negocio_id, cliente_id, servicio_id, profesional_id (verificado en migraciones existentes).
create or replace function public.agenda_briefing_operativa(p_negocio text, p_scope text default 'all', p_prof uuid default null)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with riesgo as (  -- citas 'pendiente' (sin confirmar) proximas, que NO son de deposito (esas van en senales)
    select c.id, c.inicio
    from public.citas c
    where c.negocio_id = p_negocio
      and (p_prof is null or c.profesional_id = p_prof)
      and c.estado = 'pendiente'
      and coalesce(c.deposito_requerido, false) = false
      and c.inicio > now() and c.inicio <= now() + interval '48 hours'
  ),
  senal as (  -- deposito requerido y no pagado, aun a futuro
    select c.id, c.inicio
    from public.citas c
    where c.negocio_id = p_negocio
      and (p_prof is null or c.profesional_id = p_prof)
      and c.estado in ('pendiente','confirmada')
      and coalesce(c.deposito_requerido, false) = true
      and coalesce(c.deposito_pagado, false) = false
      and c.inicio > now()
  )
  select jsonb_build_array(
    jsonb_build_object(
      'tipo','citas_en_riesgo','familia','operativa','severidad','media',
      'titulo','Citas sin confirmar','detalle','Próximas 48 h sin confirmar',
      'count',(select count(*) from riesgo),
      'items',coalesce((select jsonb_agg(jsonb_build_object('cita_id',id)) from riesgo),'[]'::jsonb),
      'accion',jsonb_build_object('tipo','recordar_cita','label','Enviar recordatorio','payload','{}'::jsonb)
    ),
    jsonb_build_object(
      'tipo','senales_sin_pagar','familia','operativa','severidad','alta',
      'titulo','Señales sin pagar','detalle','Depósito requerido y pendiente',
      'count',(select count(*) from senal),
      'items',coalesce((select jsonb_agg(jsonb_build_object('cita_id',id)) from senal),'[]'::jsonb),
      'accion',jsonb_build_object('tipo','reenviar_pago','label','Reenviar enlace de pago','payload','{}'::jsonb)
    )
  );
$function$;
```

- [ ] **Step 4: Ejecutar el assert y verlo pasar**

Run: ejecutar `migrations/tests/briefing-asserts.sql`.
Expected: `NOTICE: OK citas_en_riesgo=1 senales_sin_pagar=1` y sin fallo de assert.

- [ ] **Step 5: Commit**

```bash
git add migrations/copiloto-briefing-proactivo.sql migrations/tests/briefing-asserts.sql
git commit -m "feat(briefing): detector operativo citas_en_riesgo + senales_sin_pagar"
```

---

## Task 2: Añadir huecos rellenables y clientes a recuperar (reuso)

**Files:**
- Modify: `migrations/copiloto-briefing-proactivo.sql` (extender `agenda_briefing_operativa`)
- Modify: `migrations/tests/briefing-asserts.sql`

**Reuso confirmado:**
- `clientes_a_recuperar` → función existente `public.clientes_en_riesgo_fuga()` (migración `alerta-fuga-clientas.sql`). Verificar sus columnas de salida antes de mapear.
- `huecos_rellenables` → misma primitiva que `consultar_disponibilidad` del edge: `citas` (`inicio, fin, fin_activa, fin_espera, profesional_id`, estado='confirmada') + `bloqueos_profesional`, cruzadas con `negocio_horarios`/`horarios_profesional`. El cálculo de franjas libres es la parte compleja: al implementarla, **cargar la skill `hairy-agenda-rules`** (fases activa/reposo, tiempos muertos) para no romper la semántica. v1: contar franjas libres ≥ duración mínima de servicio activo para **hoy y mañana**; si hay entradas en `lista_espera` que encajen (servicio/ventana), la acción es "avisar lista de espera" (motor `lista-espera-matching.sql`), si no, informativa.

- [ ] **Step 1: Ampliar el assert (huecos + fuga)**

Añadir al `do $$` de `briefing-asserts.sql`, tras las dos comprobaciones previas:
```sql
  declare v_hueco int; v_fuga int;
  select (s->>'count')::int into v_hueco from jsonb_array_elements(v_res) s where s->>'tipo' = 'huecos_rellenables';
  select (s->>'count')::int into v_fuga  from jsonb_array_elements(v_res) s where s->>'tipo' = 'clientes_a_recuperar';
  assert v_hueco is not null, 'faltaba la senal huecos_rellenables';
  assert v_fuga  is not null, 'faltaba la senal clientes_a_recuperar';
```
(`is not null`: basta con que la señal exista aunque el seed tenga 0, para no acoplar el test al cálculo complejo de huecos.)

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `briefing-asserts.sql`.
Expected: FAIL `faltaba la senal huecos_rellenables`.

- [ ] **Step 3: Verificar columnas de `clientes_en_riesgo_fuga` y extender el detector**

Primero leer la firma real:
Run: `select proname, pg_get_function_result(oid) from pg_proc where proname = 'clientes_en_riesgo_fuga';`
Luego, en `agenda_briefing_operativa`, añadir al `jsonb_build_array(...)` dos elementos más:
```sql
    -- clientes a recuperar: reusa la funcion de fuga existente (mapea sus columnas reales)
    (select jsonb_build_object(
      'tipo','clientes_a_recuperar','familia','operativa','severidad','baja',
      'titulo','Clientes a recuperar','detalle','Sin volver desde hace tiempo',
      'count', coalesce(count(f.*),0),
      'items', coalesce(jsonb_agg(jsonb_build_object('cliente_id', f.cliente_id)) filter (where f.cliente_id is not null), '[]'::jsonb),
      'accion', null
     )
     from public.clientes_en_riesgo_fuga() f
     where p_scope <> 'self'),  -- profesional (self) no ve esta senal de negocio
    -- huecos rellenables: v1 cuenta franjas libres hoy/manana (ver reuso arriba)
    public.briefing_huecos(p_negocio, p_prof)
```
Y crear la función auxiliar `briefing_huecos(p_negocio text, p_prof uuid)` que devuelve un `jsonb_build_object` con `tipo='huecos_rellenables'`, calculando franjas libres con la primitiva de disponibilidad (cargar `hairy-agenda-rules` al implementar). Debe devolver siempre el objeto (count 0 si no hay), nunca null.

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `briefing-asserts.sql`.
Expected: NOTICE OK, sin fallos de assert (las 4 señales presentes).

- [ ] **Step 5: Commit**

```bash
git add migrations/copiloto-briefing-proactivo.sql migrations/tests/briefing-asserts.sql
git commit -m "feat(briefing): huecos rellenables + clientes a recuperar (reuso fuga/disponibilidad)"
```

---

## Task 3: RPC pública `agenda_briefing(p_scope)` + grants + advisors

**Files:**
- Modify: `migrations/copiloto-briefing-proactivo.sql`

- [ ] **Step 1: Assert de la RPC pública (scope self oculta señales de negocio)**

En `briefing-asserts.sql`, añadir un bloque que llame a la pública simulando un usuario. Si no es viable simular `auth.uid()` en el test SQL, dejar la verificación de scope para la prueba manual (Task 7) y en su lugar afirmar que la función pública existe:
```sql
assert exists(select 1 from pg_proc where proname = 'agenda_briefing'), 'falta RPC publica agenda_briefing';
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `briefing-asserts.sql`.
Expected: FAIL `falta RPC publica agenda_briefing`.

- [ ] **Step 3: Implementar la RPC pública (deriva negocio/rol del auth.uid) + grants**

```sql
create or replace function public.agenda_briefing(p_scope text default 'all')
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_neg text; v_role text; v_prof uuid; v_scope text;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null then return '[]'::jsonb; end if;  -- sin negocio: nada
  -- scope efectivo: recepcion/owner/admin ven todo; profesional se limita a lo suyo
  v_scope := case when v_role in ('owner','admin','recepcion') then coalesce(p_scope,'all') else 'self' end;
  if v_scope = 'self' then
    select id into v_prof from public.profesionales where negocio_id = v_neg and perfil_id = auth.uid() limit 1;
  end if;
  return public.agenda_briefing_operativa(v_neg, v_scope, v_prof);
end $function$;

revoke execute on function public.agenda_briefing(text) from public, anon;
grant execute on function public.agenda_briefing(text) to authenticated;
revoke execute on function public.agenda_briefing_operativa(text, text, uuid) from public, anon, authenticated;
grant execute on function public.agenda_briefing_operativa(text, text, uuid) to service_role;
```
Nota: verificar el nombre real de la columna que enlaza `profesionales` con el usuario (`perfil_id`/`user_id`); ajustar si difiere. Si existe un helper de "negocio del usuario", usarlo en vez del select a `profiles`.

- [ ] **Step 4: Ejecutar y ver pasar + advisors**

Run: `briefing-asserts.sql` (Expected: OK). Después, MCP Supabase `get_advisors(type=security)` sobre `vtrggiogjrhqtwbhbgia`.
Expected: sin nuevos hallazgos de seguridad por estas funciones.

- [ ] **Step 5: Aplicar migración en remoto y commit**

```bash
git add migrations/copiloto-briefing-proactivo.sql migrations/tests/briefing-asserts.sql
git commit -m "feat(briefing): RPC publica agenda_briefing con scope por rol + grants"
```
Aplicar en remoto vía MCP `apply_migration` (name: `copiloto_briefing_proactivo`).

---

## Task 4: `lib/briefing.ts` — tipos, llamada al RPC y señales de setup

**Files:**
- Create: `lib/briefing.ts`
- Test: verificación por typecheck (`npx tsc --noEmit`) — no hay runner JS en el repo; el test real es el manual (Task 7).

- [ ] **Step 1: Definir tipos y la llamada al RPC**

```ts
import { supabase } from '@/lib/supabase';
import type { OnboardingStatus } from '@/lib/hooks/useOnboardingStatus';

export interface BriefingSignal {
  tipo: string;
  familia: 'operativa' | 'setup';
  severidad: 'alta' | 'media' | 'baja';
  titulo: string;
  detalle: string;
  count: number;
  items: Array<Record<string, unknown>>;
  accion?: { tipo: string; label: string; payload: Record<string, unknown> } | null;
}

export async function cargarSenalesOperativas(scope: 'all' | 'self'): Promise<BriefingSignal[]> {
  const { data, error } = await supabase.rpc('agenda_briefing', { p_scope: scope });
  if (error || !Array.isArray(data)) return [];
  return (data as BriefingSignal[]).filter((s) => s && (s.count > 0 || s.familia === 'operativa'));
}
```

- [ ] **Step 2: Construir señales de setup desde `useOnboardingStatus`**

```ts
const SETUP_DEF: Array<{ paso: keyof OnboardingStatus['done']; titulo: string; destino: string }> = [
  { paso: 'datos_negocio', titulo: 'Completa los datos del negocio', destino: 'configuracion:negocio' },
  { paso: 'servicios', titulo: 'Añade tus servicios', destino: 'configuracion:servicios' },
  { paso: 'equipo', titulo: 'Añade tu equipo', destino: 'configuracion:equipo' },
  { paso: 'horario_salon', titulo: 'Fija el horario del salón', destino: 'configuracion:horario' },
  { paso: 'reserva_online', titulo: 'Activa la reserva online', destino: 'configuracion:reserva' },
  { paso: 'notificaciones', titulo: 'Activa los recordatorios', destino: 'configuracion:notificaciones' },
];

export function senalesSetup(status: OnboardingStatus): BriefingSignal[] {
  if (!status.ready) return [];
  return SETUP_DEF.filter((d) => status.done[d.paso] === false).map((d) => ({
    tipo: `setup_${String(d.paso)}`,
    familia: 'setup',
    severidad: 'media',
    titulo: d.titulo,
    detalle: 'Pendiente de configurar',
    count: 1,
    items: [],
    accion: { tipo: 'ir_a', label: 'Configurar', payload: { destino: d.destino } },
  }));
}
```
(Verificar que las claves de `SETUP_DEF.paso` existen en `OnboardingStepId`; ajustar nombres a los reales del tipo.)

- [ ] **Step 3: Fusionar y rankear**

```ts
export function rankearSenales(setup: BriefingSignal[], operativas: BriefingSignal[], coreDone: boolean): BriefingSignal[] {
  const conValor = operativas.filter((s) => s.count > 0);
  const sev = { alta: 0, media: 1, baja: 2 } as const;
  const ordenar = (a: BriefingSignal[]) => [...a].sort((x, y) => sev[x.severidad] - sev[y.severidad]);
  return coreDone ? [...ordenar(conValor), ...setup] : [...setup, ...ordenar(conValor)];
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `lib/briefing.ts` (ignorar errores Deno de `supabase/functions`).

- [ ] **Step 5: Commit**

```bash
git add lib/briefing.ts
git commit -m "feat(briefing): lib de senales (RPC operativas + setup + ranking)"
```

---

## Task 5: Componente `BriefingAgenda`

**Files:**
- Create: `components/agenda/BriefingAgenda.web.tsx`
- Create: `components/agenda/BriefingAgenda.tsx` (stub nativo)

- [ ] **Step 1: Stub nativo (paridad del split)**

`components/agenda/BriefingAgenda.tsx`:
```tsx
// El briefing rico vive en la web (.web.tsx). En nativo no se renderiza (paridad de import).
export default function BriefingAgenda() {
  return null;
}
```

- [ ] **Step 2: Componente web**

`components/agenda/BriefingAgenda.web.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { useOnboardingStatus } from '@/lib/hooks/useOnboardingStatus';
import { cargarSenalesOperativas, senalesSetup, rankearSenales, type BriefingSignal } from '@/lib/briefing';

export default function BriefingAgenda({ negocioId, scope, onAccion }: {
  negocioId: string | null;
  scope: 'all' | 'self';
  onAccion: (s: BriefingSignal) => void;
}) {
  const { isMobile } = useResponsive();
  const status = useOnboardingStatus(negocioId, true);
  const [ops, setOps] = useState<BriefingSignal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setCargando(true); setErr(false);
      try {
        const s = await cargarSenalesOperativas(scope);
        if (!cancel) setOps(s);
      } catch { if (!cancel) setErr(true); }
      finally { if (!cancel) setCargando(false); }
    })();
    return () => { cancel = true; };
  }, [scope, negocioId]);

  if (cargando || !status.ready) return null;
  if (err) return <div style={{ padding: 12, opacity: 0.7 }}>No pude cargar el briefing.</div>;

  const senales = rankearSenales(senalesSetup(status), ops, status.coreDone);
  if (senales.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: isMobile ? 10 : 12 }}>
      <div style={{ fontWeight: 700 }}>Esto es lo que veo hoy</div>
      {senales.map((s) => (
        <div key={s.tipo} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
          <div style={{ fontWeight: 600 }}>{s.titulo}{s.count > 1 ? ` (${s.count})` : ''}</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{s.detalle}</div>
          {s.accion ? (
            <button onClick={() => onAccion(s)} style={{ marginTop: 6 }}>{s.accion.label}</button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
```
(Los estilos son mínimos; en implementación usar los TOKENS de marca del proyecto y los átomos existentes del panel para no derivar del sistema de diseño.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add components/agenda/BriefingAgenda.web.tsx components/agenda/BriefingAgenda.tsx
git commit -m "feat(briefing): componente BriefingAgenda (web + stub nativo)"
```

---

## Task 6: Montar en el panel + toggle de config

**Files:**
- Modify: `components/agenda/AsistenteAgenda.web.tsx`
- Modify: `components/agenda/AgendaCalendar.web.tsx` (~línea 407)
- Modify: `app/(tabs)/configuracion.web.tsx`

- [ ] **Step 1: Leer el toggle en AgendaCalendar**

En `AgendaCalendar.web.tsx`, junto a `setAsistenteActivo(cfg.asistenteAgendaActivo === true)` (~línea 407), añadir estado `briefingActivo` y `setBriefingActivo(cfg.briefingProactivoActivo !== false)` (default ON). Pasarlo como prop a `AsistenteAgenda`.

- [ ] **Step 2: Renderizar el briefing al abrir el panel**

En `AsistenteAgenda.web.tsx`, cuando el panel está abierto y `briefingActivo`, renderizar `<BriefingAgenda negocioId={negocioId} scope={asistenteWriteScope(...)} onAccion={manejarAccionBriefing} />` encima del hilo de chat. `manejarAccionBriefing(s)`: según `s.accion.tipo` (`ir_a` → navegar al destino; `recordar_cita`/`reenviar_pago` → precargar el input del asistente con la propuesta correspondiente, que ya pasa por propone→confirma). No introducir escrituras nuevas.

- [ ] **Step 3: Switch en Configuración**

En `configuracion.web.tsx` (pestaña Agenda, junto a `asistenteAgendaActivo`), añadir un `Switch` para `briefingProactivoActivo` que hace upsert en `negocio_config.config` con el patrón existente. Etiqueta: "Briefing proactivo del copiloto".

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit` y `npm run build:web`
Expected: compila sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add components/agenda/AsistenteAgenda.web.tsx components/agenda/AgendaCalendar.web.tsx "app/(tabs)/configuracion.web.tsx"
git commit -m "feat(briefing): montar en panel del copiloto + toggle briefingProactivoActivo"
```

---

## Task 7: Verificación manual en navegador

**Files:** ninguno (verificación).

- [ ] **Step 1: Servir y entrar con cuenta REAL (no demo)**

Run: `npm run build:web` y `node scripts/serve-web.mjs`. Entrar por `/acceso.html` con cuenta de acceso completo (owner), ir a Agenda, abrir el copiloto.

- [ ] **Step 2: Comprobar briefing**

- Con el toggle ON: el panel abre con "Esto es lo que veo hoy" y tarjetas rankeadas.
- Sembrar/asegurar en el negocio de prueba: una cita pendiente sin depósito (<48h), una señal impaga futura, un cliente en fuga → aparecen sus tarjetas.
- Con datos de setup incompletos: las tarjetas de puesta en marcha aparecen primero.
- Como profesional (scope self): no aparecen `senales_sin_pagar` ni `clientes_a_recuperar`.
- Toggle OFF (en Configuración): el panel abre sin briefing.

- [ ] **Step 3: Comprobar acciones**

Pulsar "Configurar" navega al destino correcto; "Enviar recordatorio"/"Reenviar enlace de pago" dejan la propuesta lista para confirmar (propone→confirma), sin ejecutar solo.

---

## Notas de implementación / riesgos

- **Fuera de alcance v1:** motor de reactivación de clientes (la acción de `clientes_a_recuperar` queda en informativa), señales inline en el calendario, analítica conversacional, y unificar la fontanería con el edge `onboarding-agent` de Carlos (limpieza a coordinar; riesgo de conflicto/revert conocido).
- **Huecos (Task 2)** es la parte más compleja: cargar `hairy-agenda-rules` al implementar y reusar la primitiva de disponibilidad; no reinventar la matemática de franjas.
- **Nombres a verificar en el código real antes de codificar:** columna que enlaza `profesionales`↔usuario (`perfil_id`/`user_id`), columnas de salida de `clientes_en_riesgo_fuga()`, y claves de `OnboardingStepId`.
- Tras aplicar la migración: advisors de seguridad (regla del proyecto).
```
