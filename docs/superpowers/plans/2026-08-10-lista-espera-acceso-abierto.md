# Lista de espera: acceso abierto y prioridad por fidelidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir la lista de espera del portal público a cualquier cliente (no solo VIP existentes), eliminar el concepto de "cita exprés" (auto-book muerto + pestaña separada), y hacer que la prioridad en la cola dependa del nivel de fidelidad del cliente en vez de un valor plano.

**Architecture:** Una nueva función SQL `lista_espera_unirse_publica` sustituye a `lista_espera_express_publica` (que hoy falla siempre: inserta un `estado` que viola el CHECK constraint de la tabla). El portal público pierde la pestaña "Reserva exprés" y unifica todo en un único botón/modal "Únete a la lista de espera", ya existente en el código, extendido con franja horaria y consentimiento. El panel interno gana un badge de fidelidad (derivado del `prioridad` guardado) y un ajuste manual puntual que usa la política RLS `authenticated` ya existente sobre `lista_espera` — no hace falta una RPC nueva para eso.

**Tech Stack:** Next.js/Expo Router (`app/`), TypeScript, Supabase (Postgres + RPCs `security definer`), proyecto Supabase `vtrggiogjrhqtwbhbgia` (aplicar migraciones vía MCP de Supabase, no hay Supabase local en este repo).

## Global Constraints

- Código en inglés, comentarios en español, sin emojis en código/UI (`CLAUDE.md`).
- Toda RPC pública nueva necesita `grant execute ... to anon` explícito (no nace ejecutable por defecto desde el round 4 de seguridad).
- Nunca `select` directo a `anon` sobre tablas de negocio — solo vía RPC `security definer`.
- `negocio_id` (text) en toda consulta/política multi-tenant.
- Tras cualquier migración, pasar los advisors de Supabase (`get_advisors`, tipo `security`).
- Verificación TS: `npx tsc --noEmit` desde la raíz del repo (ignorar errores bajo `supabase/functions/`, son Deno).
- No hay test runner de Postgres local: las RPCs se verifican con `execute_sql` contra el proyecto real tras aplicar la migración.

---

## File Structure

- **`migrations/lista-espera-acceso-abierto.sql`** (nuevo): la función pública `lista_espera_unirse_publica` (Task 1) y, al final del trabajo, los `drop` de las funciones/columnas de "exprés" que quedan huérfanas (Task 8). Un solo archivo, aplicado en dos pasadas vía `apply_migration` (una por task) para que cada commit del plan tenga su propio cambio de esquema aplicado y verificado.
- **`lib/reservaPublica.ts`** (modificar): quita los wrappers de auto-book exprés, añade `unirseListaEsperaPublica`.
- **`app/r/[slug].web.tsx`** (modificar): portal público — quita la pestaña/flujo "Reserva exprés", extiende el modal de lista de espera ya existente.
- **`app/(tabs)/lista-espera.web.tsx`** (modificar): panel interno — badge de fidelidad + ajuste manual de prioridad.
- **`components/config/TabRecompensas.web.tsx`** (modificar): quita el toggle "Acceso a citas exprés" del editor de nivel.
- **`lib/avisosCategorias.ts`**, **`lib/hooks/useAvisos.ts`**, **`lib/constants.ts`** (modificar): quita la categoría de aviso `express` y el código muerto asociado.

---

### Task 1: SQL — nueva función `lista_espera_unirse_publica`

**Files:**
- Create: `migrations/lista-espera-acceso-abierto.sql`
- Verify: contra el proyecto Supabase `vtrggiogjrhqtwbhbgia` (MCP `apply_migration` + `execute_sql`)

**Interfaces:**
- Produces: RPC Postgres `lista_espera_unirse_publica(p_slug text, p_telefono text, p_cliente_nombre text, p_servicio_id uuid default null, p_profesional_id uuid default null, p_franja text default 'cualquiera', p_desde date default null, p_hasta date default null, p_consentimiento_datos boolean default true) returns jsonb` — usada por Task 3.

**Contexto necesario (ya verificado contra el proyecto real):**
- `lista_espera.estado` tiene `CHECK (estado = ANY (ARRAY['esperando','avisado','resuelta','cancelada']))`. La función vieja (`lista_espera_express_publica`) inserta `'pendiente'`, que viola este check — **hoy la función falla siempre que se llega a invocar**, incluso para clientes elegibles. La nueva función debe insertar `'esperando'`.
- `lista_espera.franja` tiene `CHECK (franja = ANY (ARRAY['manana','tarde','cualquiera']))`.
- El patrón find-or-create de cliente por teléfono (con `normalizar_telefono` y bloqueo de `bloqueado=true`) ya existe en `crear_cita_publica` (`migrations/portal-reserva-publica.sql` y redefiniciones posteriores) — se replica aquí, sin el resto de su lógica de cita (duración, depósito, horario).
- `obtener_nivel_cliente(p_cliente_id)` (existe, verificado) devuelve `jsonb` con `nivel.orden` (`smallint`), resolviendo el override manual (`clientes.nivel_fidelizacion_override`) antes que el cálculo automático por visitas/gasto. Un cliente sin nivel calculado devuelve `orden: 0` ("Nuevo").

- [ ] **Step 1: Escribir la migración**

```sql
-- migrations/lista-espera-acceso-abierto.sql
-- Sustituye a lista_espera_express_publica (rechaza clientes nuevos/no-VIP, e inserta un
-- estado 'pendiente' que viola el CHECK de la tabla, asi que hoy falla siempre). Acceso
-- abierto a cualquier cliente; la fidelidad ya no es gate de entrada, solo orden de cola.

create or replace function public.lista_espera_unirse_publica(
  p_slug text,
  p_telefono text,
  p_cliente_nombre text,
  p_servicio_id uuid default null,
  p_profesional_id uuid default null,
  p_franja text default 'cualquiera',
  p_desde date default null,
  p_hasta date default null,
  p_consentimiento_datos boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_cliente uuid;
  v_prioridad smallint := 0;
  v_franja text;
begin
  if not coalesce(p_consentimiento_datos, false) then
    return jsonb_build_object('ok', false, 'error', 'Debes aceptar el tratamiento de datos para apuntarte.');
  end if;

  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Negocio no encontrado');
  end if;

  if coalesce(length(trim(p_cliente_nombre)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Indica tu nombre.');
  end if;
  if coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 then
    return jsonb_build_object('ok', false, 'error', 'Indica un telefono valido.');
  end if;

  v_franja := case when p_franja in ('manana', 'tarde', 'cualquiera') then p_franja else 'cualquiera' end;

  -- Anti-abuso por negocio/canal, mismo umbral que crear_cita_publica.
  if (select count(*) from public.lista_espera where negocio_id = v_negocio and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'No es posible apuntarse en este momento. Llama al salon, por favor.');
  end if;

  -- 1. Resolver o crear cliente (mismo patron de find-or-create que crear_cita_publica).
  select id into v_cliente from public.clientes where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono) limit 1;

  if v_cliente is not null and exists (select 1 from public.clientes where id = v_cliente and bloqueado = true) then
    return jsonb_build_object('ok', false, 'error', 'No es posible completar la solicitud con estos datos. Por favor, contacta directamente con el salon.');
  end if;

  if v_cliente is null then
    insert into public.clientes (negocio_id, nombre, telefono)
    values (v_negocio, left(trim(p_cliente_nombre), 120), trim(p_telefono))
    returning id into v_cliente;
  end if;

  -- Tope de solicitudes activas por cliente (evita acumular entradas sin limite).
  if (select count(*) from public.lista_espera where negocio_id = v_negocio and cliente_id = v_cliente and estado in ('esperando', 'avisado')) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes varias solicitudes activas en la lista de espera.');
  end if;

  -- 2. Prioridad = snapshot del nivel de fidelidad resuelto (automatico u override manual).
  v_prioridad := coalesce((public.obtener_nivel_cliente(v_cliente) -> 'nivel' ->> 'orden')::smallint, 0);

  -- 3. Insertar. estado debe ser 'esperando' (CHECK de la tabla).
  insert into public.lista_espera (
    negocio_id, cliente_id, nombre, telefono, servicio_id, profesional_id,
    franja, desde, hasta, estado, prioridad, nota
  ) values (
    v_negocio, v_cliente, left(trim(p_cliente_nombre), 120), trim(p_telefono), p_servicio_id, p_profesional_id,
    v_franja,
    coalesce(p_desde, current_date),
    coalesce(p_hasta, current_date + 21),
    'esperando',
    v_prioridad,
    'Alta desde el portal'
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.lista_espera_unirse_publica(text, text, text, uuid, uuid, text, date, date, boolean) from public;
grant execute on function public.lista_espera_unirse_publica(text, text, text, uuid, uuid, text, date, date, boolean) to anon, authenticated;
```

- [ ] **Step 2: Aplicar la migración al proyecto real**

Usa la herramienta MCP de Supabase `apply_migration` con `project_id: vtrggiogjrhqtwbhbgia`, `name: lista_espera_acceso_abierto`, y el SQL del Step 1.

- [ ] **Step 3: Verificar con una llamada de prueba (cliente nuevo, sin nivel)**

Ejecuta con `execute_sql` (usa un slug de portal real de pruebas del proyecto, p.ej. `demo` si existe, o el slug del negocio de pruebas que ya uses; sustituye `<slug>`):

```sql
select public.lista_espera_unirse_publica(
  p_slug := '<slug>',
  p_telefono := '+34600999888',
  p_cliente_nombre := 'Prueba Plan Lista Espera'
);
```

Expected: `{"ok": true}`. Luego limpia el dato de prueba:

```sql
delete from public.lista_espera where telefono = '+34600999888';
delete from public.clientes where telefono = '+34600999888' and nombre = 'Prueba Plan Lista Espera';
```

- [ ] **Step 4: Verificar que respeta el CHECK y no revienta con estado invalido**

```sql
select conname from pg_constraint
where conrelid = 'public.lista_espera'::regclass and contype = 'c';
-- confirma visualmente que 'lista_espera_estado_check' sigue ahi; la llamada del Step 3
-- ya probo en la practica que el insert con estado='esperando' no lo viola.
```

- [ ] **Step 5: Advisors de seguridad**

Ejecuta la herramienta MCP `get_advisors` con `project_id: vtrggiogjrhqtwbhbgia`, `type: security`. Revisa que no aparezca un advisor nuevo sobre `lista_espera_unirse_publica` (function search_path mutable, etc. — la función ya fija `search_path to 'public'`).

- [ ] **Step 6: Commit**

```bash
git add migrations/lista-espera-acceso-abierto.sql
git commit -m "feat(lista-espera): rpc publica de alta abierta con prioridad por fidelidad"
```

---

### Task 2: Portal — quitar la pestaña/flujo "Reserva exprés"

**Files:**
- Modify: `app/r/[slug].web.tsx`

**Interfaces:**
- Consumes: nada nuevo (usa el modal `showWlModal` ya existente, sin tocar su lógica interna todavía — eso es Task 4).
- Produces: el componente ya no tiene modo "exprés"; solo queda el flujo guiado. El botón lateral de la aside pasa a abrir el modal de lista de espera con la copy nueva.

- [ ] **Step 1: Quitar el estado y las referencias del modo exprés**

En `app/r/[slug].web.tsx`, elimina las líneas 154 y 172 (declaradas junto al resto de estado del componente):

```tsx
  const [isExpress, setIsExpress] = useState(false);
```
```tsx
  // Expres extra states
  const [eFranja, setEFranja] = useState('cualquiera');
```

- [ ] **Step 2: Simplificar `confirmar()` — quitar la rama muerta de auto-book exprés**

Reemplaza el cuerpo de `confirmar` (líneas 344-398) por la versión sin la rama `isExpress` (que nunca se ejecutaba, porque el botón que activaba `isExpress` siempre limpiaba `servicio` a `null`):

```tsx
  const confirmar = useCallback(async () => {
    if (!servicio || !slotSel) return;
    setError('');
    if (!nombre.trim()) { setError(t('err_nombre')); return; }
    if (telefono.trim().length < 6) { setError(t('err_tel')); return; }
    if (!consent) { setError(t('err_consent')); return; }
    setEnviando(true);
    try {
      let captchaToken: string | undefined;
      const SITE_KEY = (info?.negocio as any)?.captcha_site_key;
      if (captchaReady && SITE_KEY && (window as any).grecaptcha) {
        try { captchaToken = await (window as any).grecaptcha.execute(SITE_KEY, { action: 'submit' }); } catch (e) { console.error(e); }
      }

      const r = await crearCitaPublica({
        slug, servicioId: servicio.id, profesionalId: slotSel.profesional_id, inicioISO: slotSel.slot,
        clienteNombre: nombre.trim(), clienteTelefono: telefono.trim(),
        clienteEmail: email.trim() || undefined, notas: notas.trim() || undefined,
        consentimientoDatos: consent, consienteIa: consentIa, captchaToken,
      });
      setResultado(r); setStep('confirmado');
      if (analyticsConsent) {
        AnalyticsEvents.bookingCompleted(r.cita_id, servicio.nombre, slotSel.profesional_nombre, servicio.precio || 0, slug);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('err_generic');
      if (/ocupado|disponib|antelacion|horario/i.test(msg)) { setError(t('err_ocupado')); setStep('fecha'); } else { setError(msg); }
    } finally { setEnviando(false); }
  }, [servicio, slotSel, nombre, telefono, email, notas, consent, slug, t, captchaReady, consentIa, analyticsConsent, info]);
```

- [ ] **Step 3: Quitar `submitExpress` por completo**

Elimina la función `submitExpress` (líneas 400-421 del archivo original):

```tsx
  const submitExpress = useCallback(async () => {
    // Basic validation
    if (!nombre.trim()) { setError('Escribe tu nombre.'); return; }
    if (telefono.trim().length < 6) { setError('Escribe un teléfono válido.'); return; }
    if (!consent) { setError('Acepta la política de privacidad para continuar.'); return; }
    setEnviando(true);
    try {
      // Simulate backend request for express
      const wl = await crearListaEsperaExpressPublica({
        slug, servicioId: '', telefono: telefono.trim(), profesionalId: null,
      });
      if (!wl.ok) { setError(wl.error || 'Error al solicitar cita exprés'); }
      else {
        setResultado({ cita_id: 'waitlist-expres', cliente_id: '', estado: 'pendiente', deposito_requerido: false, deposito_importe: 0, inicio: '', fin: '' });
        setStep('confirmado');
      }
    } catch(e: any) {
      setError(e.message || 'Error');
    } finally {
      setEnviando(false);
    }
  }, [nombre, telefono, consent, slug]);
```

- [ ] **Step 4: Simplificar `reiniciar()` — quitar el reset de `isExpress`**

Cambia:
```tsx
  function reiniciar() {
    setServicio(null); setProfId(ANY_PRO); setSlotSel(null); setDiasDisp(new Set());
    setIsExpress(false);
    setNombre(''); setTelefono(''); setEmail(''); setNotas(''); setConsent(false); setConsentIa(false);
    setResultado(null); setError(''); setStep('servicio');
  }
```
por:
```tsx
  function reiniciar() {
    setServicio(null); setProfId(ANY_PRO); setSlotSel(null); setDiasDisp(new Set());
    setNombre(''); setTelefono(''); setEmail(''); setNotas(''); setConsent(false); setConsentIa(false);
    setResultado(null); setError(''); setStep('servicio');
  }
```

- [ ] **Step 5: Quitar las variables derivadas del modo exprés**

Cambia:
```tsx
  const isGuiada = !isExpress;
  const isExpresMode = isExpress && !servicio; // purely express
  const showForm = step !== 'confirmado' && isGuiada;
  const showSuccess = step === 'confirmado' && isGuiada;
  const showExpresForm = isExpresMode && step !== 'confirmado';
  const showExpresSuccess = isExpresMode && step === 'confirmado';
  const servicioElegido = !!servicio;
```
por:
```tsx
  const showForm = step !== 'confirmado';
  const showSuccess = step === 'confirmado';
  const servicioElegido = !!servicio;
```

- [ ] **Step 6: Quitar el selector de pestañas del header**

Elimina el `<div>` de pestañas (líneas 559-568 del original) y deja solo el indicador de confianza:

Busca:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
            <div style={{ display: 'inline-flex', maxWidth: '100%', overflowX: 'auto', padding: 4, background: '#f6f1ea', borderRadius: 14, gap: 4 }}>
              <button onClick={() => setIsExpress(false)} style={{ flex: '0 0 auto', padding: '10px 20px', borderRadius: 11, border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', ...(isGuiada ? { background: '#fff', color: '#1c1814', boxShadow: '0 2px 8px rgba(40,30,24,0.10)' } : { background: 'transparent', color: '#5c5249' }) }}>Reserva guiada</button>
              <button onClick={() => { setIsExpress(true); setServicio(null); setStep('datos'); }} style={{ flex: '0 0 auto', padding: '10px 20px', borderRadius: 11, border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', ...(isExpresMode ? { background: '#fff', color: '#1c1814', boxShadow: '0 2px 8px rgba(40,30,24,0.10)' } : { background: 'transparent', color: '#5c5249' }) }}>Reserva exprés</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#736658', fontWeight: 600 }}>
              <Icon name="check" size={14} color="#0f9d6b" /> Confirmación inmediata · Sin registro
            </div>
          </div>

          {/* RESERVA GUIADA */}
          {isGuiada && (
            <>
```
Reemplaza por:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#736658', fontWeight: 600 }}>
              <Icon name="check" size={14} color="#0f9d6b" /> Confirmación inmediata · Sin registro
            </div>
          </div>

          <>
```

Y en el cierre correspondiente (línea ~798-799 del original, justo antes del bloque `{/* RESERVA EXPRES */}`):
```tsx
            </>
          )}

          {/* RESERVA EXPRES */}
          {isExpresMode && (
            <>
```
Reemplaza por:
```tsx
            </>
```

Y elimina por completo el bloque `{/* RESERVA EXPRES */}` ... hasta su cierre (el bloque `showExpresForm`/`showExpresSuccess`, líneas ~801-864 del original), incluido su `</>` y `)}` de cierre — deja el `</div>` que le sigue (el cierre del panel blanco `#fffdfb`) intacto.

- [ ] **Step 7: Sustituir el atajo "Reserva exprés en 10 segundos" por el enlace a la lista de espera**

Cambia:
```tsx
                    <button onClick={() => { setIsExpress(true); setServicio(null); setStep('datos'); }} style={{ width: '100%', marginTop: 12, padding: '13px 14px', borderRadius: 14, border: `1px dashed ${T.primary}`, background: T.primarySoft, color: '#1c1814', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ minWidth: 0 }}>¿Tienes prisa? Reserva exprés en 10 segundos</span>
                      <Icon name="chevronRight" size={16} color={T.primaryHi} />
                    </button>
```
por:
```tsx
                    <button onClick={() => { setWlNombre(nombre); setWlTelefono(telefono); setShowWlModal(true); }} style={{ width: '100%', marginTop: 12, padding: '13px 14px', borderRadius: 14, border: `1px dashed ${T.primary}`, background: T.primarySoft, color: '#1c1814', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ minWidth: 0 }}>¿No te encaja ninguna hora? Únete a la lista de espera</span>
                      <Icon name="chevronRight" size={16} color={T.primaryHi} />
                    </button>
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `app/r/[slug].web.tsx` (puede seguir habiendo errores preexistentes en `supabase/functions/`, son Deno — ignóralos).

- [ ] **Step 9: Comprobación manual en navegador**

Levanta el preview del portal (`/app/r/<slug>` de un negocio de pruebas). Confirma:
- Ya no aparece la pestaña "Reserva exprés" en la cabecera.
- El flujo guiado (servicio → profesional → fecha/hora → datos) funciona igual que antes.
- El botón de la aside dice "¿No te encaja ninguna hora? Únete a la lista de espera" y abre el modal existente (aunque el modal todavía llama a la RPC vieja hasta el Task 4 — puede fallar al enviar, es esperado en este punto).

- [ ] **Step 10: Commit**

```bash
git add app/r/\[slug\].web.tsx
git commit -m "feat(portal): elimina el flujo muerto de reserva expres, unifica en lista de espera"
```

---

### Task 3: `lib/reservaPublica.ts` — sustituir los wrappers de exprés

**Files:**
- Modify: `lib/reservaPublica.ts:101-122` (borra `SlotDisponibleExpress` + `getDisponibilidadExpress`)
- Modify: `lib/reservaPublica.ts:162-179` (borra `crearCitaPublicaExpress`)
- Modify: `lib/reservaPublica.ts:226-245` (sustituye `crearListaEsperaExpressPublica` por `unirseListaEsperaPublica`)

**Interfaces:**
- Consumes: RPC `lista_espera_unirse_publica` de Task 1.
- Produces: `unirseListaEsperaPublica(args): Promise<{ ok: boolean; error?: string }>` — la usa Task 4.

- [ ] **Step 1: Borrar `SlotDisponibleExpress` y `getDisponibilidadExpress`**

Borra por completo (líneas 101-122 del archivo original):
```tsx
export interface SlotDisponibleExpress extends SlotDisponible {
  error_msg: string | null;
}

// Búsqueda del primer hueco disponible para clientes con beneficio exprés.
export async function getDisponibilidadExpress(
  slug: string,
  servicioId: string,
  telefono: string,
  profesionalId?: string | null,
  dias = 21,
): Promise<SlotDisponibleExpress[]> {
  const { data, error } = await supabase.rpc('disponibilidad_express_publica', {
    p_slug: slug,
    p_servicio_id: servicioId,
    p_telefono: telefono,
    p_profesional_id: profesionalId ?? null,
    p_dias: dias,
  });
  if (error) throw error;
  return (data as SlotDisponibleExpress[] | null) ?? [];
}
```

- [ ] **Step 2: Borrar `crearCitaPublicaExpress`**

Borra por completo (líneas 162-179 del archivo original):
```tsx
// Crea la cita express.
export async function crearCitaPublicaExpress(args: CrearCitaArgs): Promise<CrearCitaResult> {
  const { data, error } = await supabase.rpc('crear_cita_publica_express', {
    p_slug: args.slug,
    p_servicio_id: args.servicioId,
    p_profesional_id: args.profesionalId,
    p_inicio: args.inicioISO,
    p_cliente_nombre: args.clienteNombre,
    p_cliente_telefono: args.clienteTelefono,
    p_cliente_email: args.clienteEmail ?? null,
    p_notas: args.notas ?? null,
    p_consentimiento_datos: args.consentimientoDatos ?? true,
    p_consiente_ia: args.consienteIa ?? false,
    p_captcha_token: args.captchaToken ?? null,
  });
  if (error) throw error;
  return data as CrearCitaResult;
}
```

- [ ] **Step 3: Sustituir `crearListaEsperaExpressPublica` por `unirseListaEsperaPublica`**

Cambia (líneas 226-245 del archivo original):
```tsx
// Inserta al cliente en la lista de espera con prioridad express
export async function crearListaEsperaExpressPublica(args: {
  slug: string;
  servicioId: string;
  telefono: string;
  profesionalId?: string | null;
  desde?: string | null;
  hasta?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('lista_espera_express_publica', {
    p_slug: args.slug,
    p_servicio_id: args.servicioId,
    p_telefono: args.telefono,
    p_profesional_id: args.profesionalId ?? null,
    p_desde: args.desde ?? null,
    p_hasta: args.hasta ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}
```
por:
```tsx
// Apunta al cliente a la lista de espera. Abierto a cualquiera (crea el cliente si no
// existe); la prioridad la calcula el servidor a partir de su nivel de fidelidad.
export async function unirseListaEsperaPublica(args: {
  slug: string;
  telefono: string;
  nombre: string;
  servicioId?: string | null;
  profesionalId?: string | null;
  franja?: 'manana' | 'tarde' | 'cualquiera';
  desde?: string | null;
  hasta?: string | null;
  consentimientoDatos?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('lista_espera_unirse_publica', {
    p_slug: args.slug,
    p_telefono: args.telefono,
    p_cliente_nombre: args.nombre,
    p_servicio_id: args.servicioId ?? null,
    p_profesional_id: args.profesionalId ?? null,
    p_franja: args.franja ?? 'cualquiera',
    p_desde: args.desde ?? null,
    p_hasta: args.hasta ?? null,
    p_consentimiento_datos: args.consentimientoDatos ?? true,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errores en `app/r/[slug].web.tsx` señalando que `crearListaEsperaExpressPublica` ya no existe (se arregla en Task 4) — confirma que el compilador detecta el cambio de nombre. Ningún otro archivo del repo debe fallar (ya se verificó por grep que nada más importa estas funciones).

- [ ] **Step 5: Commit**

```bash
git add lib/reservaPublica.ts
git commit -m "refactor(portal): sustituye los wrappers de cita expres por unirseListaEsperaPublica"
```

---

### Task 4: Portal — modal de lista de espera con franja, consentimiento y aviso de "sin huecos en el horizonte"

**Files:**
- Modify: `app/r/[slug].web.tsx`

**Interfaces:**
- Consumes: `unirseListaEsperaPublica` de `lib/reservaPublica.ts` (Task 3).

- [ ] **Step 1: Actualizar el import**

Cambia (línea 8-12 del archivo original):
```tsx
import {
  getPortalInfo, getDisponibilidad, getDiasDisponibles, crearCitaPublica, fechaISOaClave, getResenasPublicas,
  getDisponibilidadExpress, crearCitaPublicaExpress, crearListaEsperaExpressPublica,
  type PortalInfo, type PortalServicio, type SlotDisponible, type CrearCitaResult, type ResenaResumen,
} from '@/lib/reservaPublica';
```
por:
```tsx
import {
  getPortalInfo, getDisponibilidad, getDiasDisponibles, crearCitaPublica, fechaISOaClave, getResenasPublicas,
  unirseListaEsperaPublica,
  type PortalInfo, type PortalServicio, type SlotDisponible, type CrearCitaResult, type ResenaResumen,
} from '@/lib/reservaPublica';
```

- [ ] **Step 2: Añadir el estado de consentimiento del modal**

Junto al resto de estado del modal (línea 175-182 del archivo original), añade una línea nueva:
```tsx
  // Waitlist modal state
  const [showWlModal, setShowWlModal] = useState(false);
  const [wlRango, setWlRango] = useState<'dia' | 'semanal'>('semanal');
  const [wlFranja, setWlFranja] = useState<'manana' | 'tarde' | 'cualquiera'>('cualquiera');
  const [wlNombre, setWlNombre] = useState('');
  const [wlTelefono, setWlTelefono] = useState('');
  const [wlConsent, setWlConsent] = useState(false);
  const [wlEnviando, setWlEnviando] = useState(false);
  const [wlExito, setWlExito] = useState(false);
  const [wlError, setWlError] = useState('');
```
(la única línea nueva es `const [wlConsent, setWlConsent] = useState(false);`).

- [ ] **Step 3: Calcular "no hay hueco en todo el horizonte"**

Junto a `const sinHuecos = ...` (línea 506 del archivo original), añade debajo:
```tsx
  const sinHuecos = !diasLoading && diasDisp.size > 0 && horas.length === 0;
  const sinHuecoHorizonte = servicioElegido && !diasLoading && diasDisp.size === 0;
```

- [ ] **Step 4: Banner adaptado para el caso "sin huecos en 21 días"**

Cambia (líneas 661-669 del archivo original):
```tsx
                        {sinHuecos && (
                          <div style={{ padding: '26px 20px', textAlign: 'center', border: '1px dashed rgba(40,30,24,0.14)', borderRadius: 16, background: '#fbf6f0' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: T.text }}>Sin huecos disponibles este día</div>
                            <div style={{ fontSize: 13, color: '#5c5249', marginBottom: 14 }}>Prueba otro día o apúntate a la lista de espera para avisarte si alguien cancela.</div>
                            <button onClick={() => { setWlNombre(nombre); setWlTelefono(telefono); setShowWlModal(true); }} style={{ padding: '10px 20px', borderRadius: 12, background: T.primary, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
                              ⚡ Apuntarme a la Lista de Espera
                            </button>
                          </div>
                        )}
```
por:
```tsx
                        {(sinHuecos || sinHuecoHorizonte) && (
                          <div style={{ padding: '26px 20px', textAlign: 'center', border: '1px dashed rgba(40,30,24,0.14)', borderRadius: 16, background: '#fbf6f0' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: T.text }}>
                              {sinHuecoHorizonte ? 'No hay hueco libre en las próximas 3 semanas' : 'Sin huecos disponibles este día'}
                            </div>
                            <div style={{ fontSize: 13, color: '#5c5249', marginBottom: 14 }}>
                              {sinHuecoHorizonte ? 'Apúntate a la lista de espera y te avisamos por WhatsApp en cuanto se libere un hueco.' : 'Prueba otro día o apúntate a la lista de espera para avisarte si alguien cancela.'}
                            </div>
                            <button onClick={() => { setWlNombre(nombre); setWlTelefono(telefono); setShowWlModal(true); }} style={{ padding: '10px 20px', borderRadius: 12, background: T.primary, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
                              Unirme a la Lista de Espera
                            </button>
                          </div>
                        )}
```

- [ ] **Step 5: Reescribir el modal — franja, consentimiento y llamada a `unirseListaEsperaPublica`**

Cambia el bloque completo del modal (líneas 1027-1082 del archivo original):
```tsx
      {showWlModal && (
        <div onClick={() => setShowWlModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(6,7,10,0.75)', zIndex: 310, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', border: '1px solid ' + T.border, borderRadius: 18, padding: 24, maxWidth: 440, width: '100%' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>⚡ Apuntarme a la Lista de Espera</div>
            <div style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>Te notificaremos por WhatsApp en cuanto se libere un hueco compatible.</div>

            {wlExito ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.primary, marginBottom: 6 }}>¡Apuntado correctamente!</div>
                <div style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>Te avisaremos por WhatsApp si se abre un hueco.</div>
                <button onClick={() => { setShowWlModal(false); setWlExito(false); }} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!wlNombre.trim() || !wlTelefono.trim()) { setWlError('Introduce nombre y teléfono'); return; }
                setWlEnviando(true); setWlError('');
                try {
                  const res = await crearListaEsperaExpressPublica({
                    slug,
                    servicioId: servicio?.id || '',
                    telefono: wlTelefono,
                    profesionalId: profId === ANY_PRO ? null : profId,
                    desde: wlRango === 'dia' && fecha ? fechaISOaClave(fecha) : null,
                    hasta: wlRango === 'dia' && fecha ? fechaISOaClave(fecha) : null,
                  });
                  if (res.ok) { setWlExito(true); } else { setWlError(res.error || 'Error al guardar'); }
                } catch (err: any) {
                  setWlError(err.message || 'Error de conexión');
                } finally { setWlEnviando(false); }
              }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Alcance del aviso</label>
                  <select value={wlRango} onChange={(e) => setWlRango(e.target.value as any)} style={inputStyle}>
                    <option value="semanal">Cualquier día de las próximas 2 semanas (Global)</option>
                    <option value="dia">Solo este día específico ({fecha ? fecha.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' }) : ''})</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Tu nombre</label>
                  <input value={wlNombre} onChange={e => setWlNombre(e.target.value)} placeholder="Nombre" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Tu teléfono WhatsApp</label>
                  <PhoneInput value={wlTelefono} onChange={setWlTelefono} placeholder="600 000 000" />
                </div>
                {wlError && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 12 }}>{wlError}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowWlModal(false)} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid ' + T.border, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                  <button type="submit" disabled={wlEnviando} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: wlEnviando ? 0.6 : 1 }}>{wlEnviando ? 'Guardando…' : 'Confirmar e inscribir'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
```
por:
```tsx
      {showWlModal && (
        <div onClick={() => setShowWlModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(6,7,10,0.75)', zIndex: 310, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', border: '1px solid ' + T.border, borderRadius: 18, padding: 24, maxWidth: 440, width: '100%' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>Únete a la Lista de Espera</div>
            <div style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>Te notificaremos por WhatsApp en cuanto se libere un hueco compatible.</div>

            {wlExito ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.primary, marginBottom: 6 }}>¡Apuntado correctamente!</div>
                <div style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>Te avisaremos por WhatsApp si se abre un hueco.</div>
                <button onClick={() => { setShowWlModal(false); setWlExito(false); }} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!wlNombre.trim() || !wlTelefono.trim()) { setWlError('Introduce nombre y teléfono'); return; }
                if (!wlConsent) { setWlError('Acepta la política de privacidad para continuar.'); return; }
                setWlEnviando(true); setWlError('');
                try {
                  const res = await unirseListaEsperaPublica({
                    slug,
                    nombre: wlNombre,
                    telefono: wlTelefono,
                    servicioId: servicio?.id ?? null,
                    profesionalId: profId === ANY_PRO ? null : profId,
                    franja: wlFranja,
                    desde: wlRango === 'dia' && fecha ? fechaISOaClave(fecha) : null,
                    hasta: wlRango === 'dia' && fecha ? fechaISOaClave(fecha) : null,
                    consentimientoDatos: wlConsent,
                  });
                  if (res.ok) { setWlExito(true); } else { setWlError(res.error || 'Error al guardar'); }
                } catch (err: any) {
                  setWlError(err.message || 'Error de conexión');
                } finally { setWlEnviando(false); }
              }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Alcance del aviso</label>
                  <select value={wlRango} onChange={(e) => setWlRango(e.target.value as any)} style={inputStyle}>
                    <option value="semanal">Cualquier día de las próximas 2 semanas (Global)</option>
                    <option value="dia">Solo este día específico ({fecha ? fecha.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' }) : ''})</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Preferencia horaria</label>
                  <select value={wlFranja} onChange={(e) => setWlFranja(e.target.value as any)} style={inputStyle}>
                    <option value="cualquiera">Cualquier hora</option>
                    <option value="manana">Mañana</option>
                    <option value="tarde">Tarde</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Tu nombre</label>
                  <input value={wlNombre} onChange={e => setWlNombre(e.target.value)} placeholder="Nombre" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5249', marginBottom: 4 }}>Tu teléfono WhatsApp</label>
                  <PhoneInput value={wlTelefono} onChange={setWlTelefono} placeholder="600 000 000" />
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
                  <input type="checkbox" checked={wlConsent} onChange={e => setWlConsent(e.target.checked)} style={{ marginTop: 2 }} />
                  <span style={{ fontSize: 12, color: '#5c5249', lineHeight: 1.4 }}>Acepto la política de privacidad para que me contacten sobre esta solicitud.</span>
                </label>
                {wlError && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 12 }}>{wlError}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowWlModal(false)} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid ' + T.border, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                  <button type="submit" disabled={wlEnviando} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: wlEnviando ? 0.6 : 1 }}>{wlEnviando ? 'Guardando…' : 'Confirmar e inscribir'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `app/r/[slug].web.tsx` ni en `lib/reservaPublica.ts`.

- [ ] **Step 7: Comprobación manual en navegador (flujo completo)**

Con el preview del portal levantado, en un negocio de pruebas:
1. Elige un servicio y navega hasta que no haya huecos un día concreto (o usa uno que sepas vacío) → aparece el banner "Sin huecos disponibles este día" → clic en "Unirme a la Lista de Espera" → se abre el modal con Alcance, Preferencia horaria, Nombre, Teléfono y el checkbox de consentimiento.
2. Rellena y envía sin marcar el checkbox → debe bloquear con "Acepta la política de privacidad para continuar."
3. Márcalo y envía con un teléfono nuevo (que no exista como cliente) → debe mostrar "¡Apuntado correctamente!" (antes fallaba siempre por el `estado` inválido).
4. Verifica en la tabla `lista_espera` (o en la pantalla interna del Task 5) que la fila nueva tiene `franja` distinto de `'cualquiera'` si elegiste una preferencia, y `prioridad = 0` (cliente nuevo, nivel "Nuevo").

- [ ] **Step 8: Commit**

```bash
git add app/r/\[slug\].web.tsx lib/reservaPublica.ts
git commit -m "feat(portal): modal de lista de espera con franja, consentimiento y aviso sin huecos en 21 dias"
```

---

### Task 5: Panel interno — badge de fidelidad y ajuste manual de prioridad

**Files:**
- Modify: `app/(tabs)/lista-espera.web.tsx`

**Interfaces:**
- Consumes: tabla `niveles_fidelizacion` (columnas `id, nombre, color, orden`, ya existen) vía `select` directo (RLS `authenticated` ya scoped por `negocio_id` — mismo patrón que el resto de la pantalla). Tabla `lista_espera` vía `update` directo (política `lista_espera_negocio_all`, `ALL` para `authenticated` scoped por `negocio_id` — ya usada hoy por `marcarAvisado`/`marcarResuelta` en este mismo archivo, así que el ajuste de prioridad NO necesita una RPC nueva).

- [ ] **Step 1: Cargar los niveles de fidelidad**

Añade la interfaz y el estado, junto a las demás interfaces del archivo (tras `interface Cliente` en la línea 103):
```tsx
interface Nivel { id: string; nombre: string; color: string; orden: number; }
```

En el componente, junto a `const [clientes, setClientes] = useState<Cliente[]>([]);` (línea 120), añade:
```tsx
  const [niveles, setNiveles] = useState<Nivel[]>([]);
```

En `cargar()`, añade la consulta al `Promise.all` (líneas 132-137 del original):
```tsx
    const [le, srv, prof, cli] = await Promise.all([
      supabase.from('lista_espera').select('*').eq('negocio_id', nId).order('prioridad', { ascending: false }).order('created_at', { ascending: true }),
      supabase.from('servicios').select('id, nombre').eq('negocio_id', nId),
      supabase.from('profesionales').select('id, nombre, color').eq('negocio_id', nId).eq('activo', true),
      supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', nId).order('nombre').limit(500),
    ]);
    setItems(le.data ?? []);
    setServicios(srv.data ?? []);
    setProfesionales(prof.data ?? []);
    setClientes(cli.data ?? []);
```
por:
```tsx
    const [le, srv, prof, cli, niv] = await Promise.all([
      supabase.from('lista_espera').select('*').eq('negocio_id', nId).order('prioridad', { ascending: false }).order('created_at', { ascending: true }),
      supabase.from('servicios').select('id, nombre').eq('negocio_id', nId),
      supabase.from('profesionales').select('id, nombre, color').eq('negocio_id', nId).eq('activo', true),
      supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', nId).order('nombre').limit(500),
      supabase.from('niveles_fidelizacion').select('id, nombre, color, orden').eq('negocio_id', nId).eq('activo', true).order('orden', { ascending: false }),
    ]);
    setItems(le.data ?? []);
    setServicios(srv.data ?? []);
    setProfesionales(prof.data ?? []);
    setClientes(cli.data ?? []);
    setNiveles(niv.data ?? []);
```

- [ ] **Step 2: Helper para resolver el nivel a partir de la prioridad guardada**

Junto a `const profMap = useMemo(...)` (línea 153), añade:
```tsx
  const nivelParaPrioridad = useCallback((prioridad: number): Nivel | null => {
    if (niveles.length === 0) return null;
    const exacto = niveles.find(n => n.orden === prioridad);
    if (exacto) return exacto;
    // Fallback: el nivel de mayor orden que no supere la prioridad guardada.
    const candidatos = niveles.filter(n => n.orden <= prioridad).sort((a, b) => b.orden - a.orden);
    return candidatos[0] ?? null;
  }, [niveles]);
```

- [ ] **Step 3: Acción de ajuste manual (misma RLS que `marcarAvisado`/`marcarResuelta`)**

Junto a `const marcarResuelta = useCallback(...)` (línea 172-175), añade:
```tsx
  const ajustarPrioridad = useCallback(async (item: ListaItem, delta: number) => {
    const nueva = Math.max(item.prioridad + delta, 0);
    await supabase.from('lista_espera').update({ prioridad: nueva }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, prioridad: nueva } : i));
  }, []);
```

- [ ] **Step 4: Pintar el badge + los botones de ajuste en la fila de escritorio**

En la fila de escritorio (líneas 364-373 del original), justo debajo del `<span>` del nombre y antes del bloque de fecha, añade el badge. Cambia:
```tsx
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.nombre || 'Sin nombre'}</span>
                      <EstadoBadge estado={item.estado} />
                    </div>
```
por:
```tsx
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.nombre || 'Sin nombre'}</span>
                      <EstadoBadge estado={item.estado} />
                      {(() => { const niv = nivelParaPrioridad(item.prioridad); return niv ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: niv.color + '22', color: niv.color }}>{niv.nombre}</span>
                      ) : null; })()}
                    </div>
```

Y en el bloque de acciones de escritorio (líneas 385-410 del original), añade los botones de ajuste manual antes del botón "Agendar". Cambia:
```tsx
                  {!resueltaOCancelada && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button className="le-btn" onClick={() => {
```
por:
```tsx
                  {!resueltaOCancelada && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button className="le-btn" title="Subir prioridad" onClick={() => ajustarPrioridad(item, 1)} style={iconBtn(T.textSec)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                      </button>
                      <button className="le-btn" title="Bajar prioridad" onClick={() => ajustarPrioridad(item, -1)} style={iconBtn(T.textSec)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                      </button>
                      <button className="le-btn" onClick={() => {
```

- [ ] **Step 5: Mismo badge en la tarjeta móvil**

En la cabecera de la tarjeta móvil (líneas 281-285 del original), aplica el mismo cambio que el Step 4:
```tsx
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{item.nombre || 'Sin nombre'}</span>
                          <EstadoBadge estado={item.estado} />
                        </div>
```
por:
```tsx
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{item.nombre || 'Sin nombre'}</span>
                          <EstadoBadge estado={item.estado} />
                          {(() => { const niv = nivelParaPrioridad(item.prioridad); return niv ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: niv.color + '22', color: niv.color }}>{niv.nombre}</span>
                          ) : null; })()}
                        </div>
```

(No hace falta añadir los botones de subir/bajar en la tarjeta móvil — el ajuste puntual es una acción de escritorio/mostrador; en móvil la tarjeta ya está apretada de acciones.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `app/(tabs)/lista-espera.web.tsx`.

- [ ] **Step 7: Comprobación manual en navegador**

Con el panel interno abierto en `/lista-espera` de un negocio de pruebas con al menos un nivel de fidelidad configurado (Ajustes → Recompensas → Niveles):
- Cada fila con `cliente_id` resuelto muestra un badge de color con el nombre del nivel correspondiente a su `prioridad` guardada (o ninguno si `prioridad` no coincide con ningún nivel activo, p.ej. tras borrar un nivel).
- Los botones ▲▼ cambian visiblemente la prioridad guardada y, si cruza el umbral de otro nivel, el badge cambia también (recarga o revisa tras el `setItems` optimista).

- [ ] **Step 8: Commit**

```bash
git add app/\(tabs\)/lista-espera.web.tsx
git commit -m "feat(lista-espera): badge de nivel de fidelidad y ajuste manual puntual de prioridad"
```

---

### Task 6: Quitar el toggle "Acceso a citas exprés" del editor de nivel

**Files:**
- Modify: `components/config/TabRecompensas.web.tsx`

- [ ] **Step 1: Quitar el campo de la interfaz `Nivel`**

Cambia (líneas 35-44 del original):
```tsx
interface Nivel {
  id: string;
  nombre: string;
  umbral_visitas?: number;
  umbral_gastado?: number;
  color: string;
  orden: number;
  sin_deposito: boolean;
  acceso_express: boolean;
}
```
por:
```tsx
interface Nivel {
  id: string;
  nombre: string;
  umbral_visitas?: number;
  umbral_gastado?: number;
  color: string;
  orden: number;
  sin_deposito: boolean;
}
```

- [ ] **Step 2: Quitar del mapeo de carga**

Busca (alrededor de la línea 133-138):
```tsx
      setNiveles((data || []).map((n: any) => ({
        ...n,
        umbral_gastado: n.umbral_gastado_cents != null ? n.umbral_gastado_cents / 100 : undefined,
        sin_deposito: !!n.sin_deposito,
        acceso_express: !!n.acceso_express,
      })));
```
por:
```tsx
      setNiveles((data || []).map((n: any) => ({
        ...n,
        umbral_gastado: n.umbral_gastado_cents != null ? n.umbral_gastado_cents / 100 : undefined,
        sin_deposito: !!n.sin_deposito,
      })));
```

- [ ] **Step 3: Quitar del guardado**

Busca (alrededor de la línea 260-265):
```tsx
        umbral_gastado_cents: nivel.umbral_gastado ? Math.round(nivel.umbral_gastado * 100) : null,
        color: nivel.color,
        orden: nivel.orden,
        sin_deposito: nivel.sin_deposito,
        acceso_express: nivel.acceso_express,
      };
```
por:
```tsx
        umbral_gastado_cents: nivel.umbral_gastado ? Math.round(nivel.umbral_gastado * 100) : null,
        color: nivel.color,
        orden: nivel.orden,
        sin_deposito: nivel.sin_deposito,
      };
```

- [ ] **Step 4: Quitar del valor por defecto al crear un nivel nuevo**

Busca (alrededor de la línea 517-526):
```tsx
          action={
          <Btn variant="primary" size="md" icon="plus" onClick={() => setEditNivel({
            id: '',
            nombre: '',
            umbral_visitas: 0,
            umbral_gastado: 0,
            color: T.primary,
            orden: niveles.length,
            sin_deposito: false,
            acceso_express: false,
          })}>
```
por:
```tsx
          action={
          <Btn variant="primary" size="md" icon="plus" onClick={() => setEditNivel({
            id: '',
            nombre: '',
            umbral_visitas: 0,
            umbral_gastado: 0,
            color: T.primary,
            orden: niveles.length,
            sin_deposito: false,
          })}>
```

- [ ] **Step 5: Quitar el `FieldRow` del toggle en el editor**

Borra por completo (líneas 1187-1193 del original):
```tsx
            <FieldRow label="Acceso a citas exprés" hint='Los clientes de este nivel pueden usar "Lo antes posible" en el portal de reservas.'>
              <Toggle
                on={form.acceso_express}
                onChange={v => setForm({ ...form, acceso_express: v })}
                label={form.acceso_express ? 'Con acceso' : 'Sin acceso'}
              />
            </FieldRow>
```

Deja el `FieldRow` de "Sin depósito" (líneas 1179-1185) tal cual, no se toca.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `components/config/TabRecompensas.web.tsx`.

- [ ] **Step 7: Comprobación manual en navegador**

Ajustes → Recompensas → editar o crear un nivel: ya no aparece el toggle "Acceso a citas exprés"; "Sin depósito" sigue ahí y funciona igual.

- [ ] **Step 8: Commit**

```bash
git add components/config/TabRecompensas.web.tsx
git commit -m "chore(recompensas): quita el toggle de acceso a citas expres, ya no existe el concepto"
```

---

### Task 7: Limpieza — aviso de "citas exprés" y constante huérfana

**Files:**
- Modify: `lib/avisosCategorias.ts`
- Modify: `lib/hooks/useAvisos.ts`
- Modify: `lib/constants.ts`

- [ ] **Step 1: Quitar la categoría `express` de la taxonomía de avisos**

En `lib/avisosCategorias.ts`, cambia:
```tsx
export type AvisoCategoria =
  | 'citas'        // citas sin confirmar
  | 'pagos'        // senales sin pagar
  | 'agenda'       // retrasos, solapes, huecos (familia operativa)
  | 'ineficiencia' // ineficiencias de organizarAgenda (huecos, reposos desaprovechados)
  | 'mensajes'     // bandeja sin responder
  | 'clientes'     // riesgo de fuga, cumpleanos, recuperar
  | 'inventario'   // stock bajo
  | 'presupuestos' // presupuestos sin respuesta
  | 'express'      // citas express prioritarias
  | 'otros';       // resto de hallazgos de Chispa
```
por:
```tsx
export type AvisoCategoria =
  | 'citas'        // citas sin confirmar
  | 'pagos'        // senales sin pagar
  | 'agenda'       // retrasos, solapes, huecos (familia operativa)
  | 'ineficiencia' // ineficiencias de organizarAgenda (huecos, reposos desaprovechados)
  | 'mensajes'     // bandeja sin responder
  | 'clientes'     // riesgo de fuga, cumpleanos, recuperar
  | 'inventario'   // stock bajo
  | 'presupuestos' // presupuestos sin respuesta
  | 'otros';       // resto de hallazgos de Chispa
```

Y:
```tsx
export const CATEGORIA_META: Record<AvisoCategoria, CategoriaMeta> = {
  citas:        { label: 'Citas',        ionicon: 'calendar-outline',      tint: T.primary },
  pagos:        { label: 'Señales',      ionicon: 'card-outline',          tint: T.warning },
  agenda:       { label: 'Agenda',       ionicon: 'time-outline',          tint: T.primaryHi },
  ineficiencia: { label: 'Eficiencia',   ionicon: 'sparkles',              tint: T.primaryHi },
  mensajes:     { label: 'Mensajes',     ionicon: 'mail-outline',          tint: T.cyan },
  clientes:     { label: 'Clientas',     ionicon: 'people-outline',        tint: T.rose },
  inventario:   { label: 'Inventario',   ionicon: 'cube-outline',          tint: T.warning },
  presupuestos: { label: 'Presupuestos', ionicon: 'document-text-outline', tint: T.cyan },
  express:      { label: 'Citas Exprés', ionicon: 'flash-outline',         tint: T.rose },
  otros:        { label: 'Otros',        ionicon: 'sparkles-outline',      tint: T.textTertiary },
};

// Orden de aparicion de los chips de categoria (los vacios se ocultan en la UI).
export const CATEGORIA_ORDEN: AvisoCategoria[] = [
  'citas', 'express', 'pagos', 'agenda', 'ineficiencia', 'mensajes', 'clientes', 'inventario', 'presupuestos', 'otros',
];
```
por:
```tsx
export const CATEGORIA_META: Record<AvisoCategoria, CategoriaMeta> = {
  citas:        { label: 'Citas',        ionicon: 'calendar-outline',      tint: T.primary },
  pagos:        { label: 'Señales',      ionicon: 'card-outline',          tint: T.warning },
  agenda:       { label: 'Agenda',       ionicon: 'time-outline',          tint: T.primaryHi },
  ineficiencia: { label: 'Eficiencia',   ionicon: 'sparkles',              tint: T.primaryHi },
  mensajes:     { label: 'Mensajes',     ionicon: 'mail-outline',          tint: T.cyan },
  clientes:     { label: 'Clientas',     ionicon: 'people-outline',        tint: T.rose },
  inventario:   { label: 'Inventario',   ionicon: 'cube-outline',          tint: T.warning },
  presupuestos: { label: 'Presupuestos', ionicon: 'document-text-outline', tint: T.cyan },
  otros:        { label: 'Otros',        ionicon: 'sparkles-outline',      tint: T.textTertiary },
};

// Orden de aparicion de los chips de categoria (los vacios se ocultan en la UI).
export const CATEGORIA_ORDEN: AvisoCategoria[] = [
  'citas', 'pagos', 'agenda', 'ineficiencia', 'mensajes', 'clientes', 'inventario', 'presupuestos', 'otros',
];
```

- [ ] **Step 2: Quitar `citasExpress` de `useAvisos`**

En `lib/hooks/useAvisos.ts`, borra la interfaz (líneas 43-47):
```tsx
export interface AvisoCitaExpress {
  id: string;
  inicio: string;
  clienteNombre: string;
}
```

Quita el campo de `AvisosData` (línea 59):
```tsx
  citasExpress: AvisoCitaExpress[];
```

Quita el estado (línea 79):
```tsx
  const [citasExpress, setCitasExpress] = useState<AvisoCitaExpress[]>([]);
```

Quita la consulta `expressRes` del `Promise.all` (líneas 111 y 154-163). Cambia:
```tsx
        const [citasRes, clientesRes, mensajes, fugaRes, hallazgosRes, citasHoyRes, profsRes, cobrosPendRes, expressRes] = await Promise.all([
```
por:
```tsx
        const [citasRes, clientesRes, mensajes, fugaRes, hallazgosRes, citasHoyRes, profsRes, cobrosPendRes] = await Promise.all([
```
y borra, dentro del mismo array de promesas, el bloque:
```tsx
          // Citas express inminentes/recientes
          supabase
            .from('citas')
            .select('id, inicio, cliente_id, clientes(nombre)')
            .eq('negocio_id', negocioId)
            .eq('origen_express', true)
            .in('estado', [CITA_STATUS.PENDIENTE, CITA_STATUS.CONFIRMADA])
            .gte('inicio', ahora.toISOString())
            .order('inicio', { ascending: true })
            .limit(10),
```
(el elemento anterior, `cobrosPendRes`, pasa a ser el último del array — quita la coma que le seguía).

Quita el mapeo (líneas 187-193):
```tsx
        // Citas exprés
        const expr = (expressRes.data ?? []).map((c: any) => ({
          id: c.id,
          inicio: c.inicio,
          clienteNombre: c.clientes?.nombre || nombreMap.get(c.cliente_id) || 'Cliente',
        }));
        setCitasExpress(expr);
```

Quita el push de items (líneas 427-438):
```tsx
    // Citas exprés (alta prioridad)
    citasExpress.forEach((c) => {
      out.push({
        id: `express:${c.id}`,
        categoria: 'express',
        urgencia: 'alta',
        titulo: `${c.clienteNombre}`,
        subtitulo: 'Nueva cita exprés VIP',
        ts: new Date(c.inicio).getTime(),
        ruta: `/(tabs)/?cita=${c.id}`,
      });
    });
```

Actualiza las dependencias del `useMemo` (línea 441) y el `return` (línea 443). Cambia:
```tsx
  }, [sinConfirmar, cobrosPendientes, cumples, mensajesSinLeer, clientesFuga, hallazgos, ineficiencias, citasExpress]);

  return { sinConfirmar, cobrosPendientes, cumples, mensajesSinLeer, clientesFuga, hallazgos, ineficiencias, citasExpress, items, total, loading, refresh, resolverHallazgo };
```
por:
```tsx
  }, [sinConfirmar, cobrosPendientes, cumples, mensajesSinLeer, clientesFuga, hallazgos, ineficiencias]);

  return { sinConfirmar, cobrosPendientes, cumples, mensajesSinLeer, clientesFuga, hallazgos, ineficiencias, items, total, loading, refresh, resolverHallazgo };
```

- [ ] **Step 3: Quitar la constante huérfana**

En `lib/constants.ts`, borra (líneas 34-35):
```tsx
// Prioridad en lista de espera al fallar una cita express
export const EXPRESS_LISTA_ESPERA_PRIORIDAD_DEFAULT = 5;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en los tres archivos ni en sus consumidores (`AvisosBell.web.tsx`, `AvisosSheet.tsx` solo leen `.items`, ya verificado por grep que no referencian `citasExpress`/`AvisoCitaExpress` directamente).

- [ ] **Step 5: Comprobación manual en navegador**

Con la campana de Avisos abierta en cualquier pantalla del panel interno: sigue funcionando igual (citas sin confirmar, señales, mensajes, etc.); ya no puede aparecer nunca un chip "Citas Exprés" (antes tampoco aparecía casi nunca porque la columna `origen_express` va a dejar de escribirse tras el Task 8, pero el tipo y el código muerto ya no existen).

- [ ] **Step 6: Commit**

```bash
git add lib/avisosCategorias.ts lib/hooks/useAvisos.ts lib/constants.ts
git commit -m "chore(avisos): quita la categoria de citas expres y la constante de prioridad huerfana"
```

---

### Task 8: SQL — borrar las funciones y columnas de exprés que quedan huérfanas

**Files:**
- Modify: `migrations/lista-espera-acceso-abierto.sql` (añade los `drop` al final del mismo archivo del Task 1)
- Verify: contra el proyecto Supabase `vtrggiogjrhqtwbhbgia`

**Precondición:** Tasks 2-7 completados y desplegados (el frontend ya no llama a `lista_espera_express_publica`, `disponibilidad_express_publica`, `crear_cita_publica_express`, ni lee `acceso_express`/`origen_express`). Confirmado por grep en el repo que, tras esos tasks, ningún archivo TS/TSX referencia estos nombres.

- [ ] **Step 1: Añadir los `drop` a la migración**

Añade al final de `migrations/lista-espera-acceso-abierto.sql`:

```sql
-- Limpieza: huerfanos tras eliminar el concepto de "cita expres" (auto-book +
-- gate de elegibilidad). lista_espera_unirse_publica (arriba) los sustituye.
drop function if exists public.lista_espera_express_publica(text, uuid, text, uuid, date, date);
drop function if exists public.disponibilidad_express_publica(text, uuid, text, uuid, integer);
drop function if exists public.crear_cita_publica_express(text, uuid, uuid, timestamptz, text, text, text, text, boolean, boolean, text);

alter table public.niveles_fidelizacion drop column if exists acceso_express;
alter table public.citas drop column if exists origen_express;
```

- [ ] **Step 2: Aplicar**

Usa `apply_migration` (MCP Supabase, `project_id: vtrggiogjrhqtwbhbgia`, `name: lista_espera_acceso_abierto_cleanup`) con el SQL del Step 1.

- [ ] **Step 3: Verificar que ya no existen**

```sql
select proname from pg_proc
where proname in ('lista_espera_express_publica', 'disponibilidad_express_publica', 'crear_cita_publica_express');
-- Expected: 0 filas.

select column_name from information_schema.columns
where (table_name = 'niveles_fidelizacion' and column_name = 'acceso_express')
   or (table_name = 'citas' and column_name = 'origen_express');
-- Expected: 0 filas.
```

- [ ] **Step 4: Advisors de seguridad**

Ejecuta `get_advisors` (`project_id: vtrggiogjrhqtwbhbgia`, `type: security`) y confirma que no quedan advisors apuntando a las funciones borradas (deberían desaparecer del listado, no aparecer nuevos).

- [ ] **Step 5: Comprobación de humo end-to-end**

Repite el flujo del Task 4 Step 7 una vez más (portal → lista de espera → modal → envío) contra el proyecto ya limpio, para confirmar que `lista_espera_unirse_publica` sigue funcionando tras borrar las funciones viejas (no comparten dependencias).

- [ ] **Step 6: Commit**

```bash
git add migrations/lista-espera-acceso-abierto.sql
git commit -m "chore(lista-espera): borra las rpc y columnas huerfanas de cita expres"
```

---

## Self-Review

**Cobertura del spec** (`docs/superpowers/specs/2026-08-10-lista-espera-acceso-abierto-design.md`):
- §1 Concepto → Task 2, 3, 8 (elimina auto-book y pestaña separada).
- §2 Portal → Task 2 (quita exprés), Task 4 (modal unificado, franja, banner de horizonte vacío).
- §3.1 Nueva función de alta → Task 1.
- §3.2 Ajuste manual → Task 5 (resuelto sin RPC nueva: la política RLS `authenticated` ya cubre el `update`, más simple que lo previsto en el spec y consistente con `marcarAvisado`/`marcarResuelta` del mismo archivo).
- §3.3 Motor de matching sin cambios → no hay task, correcto (no se toca `procesar_lista_espera` ni `_lista_espera_mejor_candidato`).
- §3.4 Limpieza de huérfanos → Task 6, 7, 8.
- §4 Panel interno → Task 5.
- §5 Migración de datos existentes → cubierto implícitamente: ningún task recalcula `prioridad` de filas ya existentes.
- §6 Seguridad → Task 1 (grants, anti-abuso), Task 8 (advisors).

**Desviación consciente del spec:** el spec (§3.2) proponía una función `ajustar_prioridad_lista_espera_manual` nueva. Al verificar las políticas RLS reales de `lista_espera` (`lista_espera_negocio_all`, `ALL` para `authenticated` por `negocio_id`), resultó innecesaria — el patrón que ya usan `marcarAvisado`/`marcarResuelta` en el mismo archivo (`supabase.from('lista_espera').update(...)`) cubre el caso sin código SQL nuevo. Task 5 lo implementa así.

**Placeholders:** ninguno — todos los pasos llevan código completo o comandos SQL exactos de verificación.

**Consistencia de tipos:** `unirseListaEsperaPublica` (Task 3) coincide en firma con la RPC `lista_espera_unirse_publica` (Task 1) y con su uso en el modal (Task 4). `Nivel` en `lista-espera.web.tsx` (Task 5) es un tipo local nuevo, distinto del `Nivel` de `TabRecompensas.web.tsx` (Task 6) — no colisionan porque viven en módulos distintos sin import cruzado.
