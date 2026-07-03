# Avisos de primera visita + manuales por página — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar un aviso no bloqueante la primera vez que un usuario visita Agenda o Caja,
con acceso a un manual detallado (texto + capturas reales) reabrible en cualquier momento
desde un icono de ayuda persistente.

**Architecture:** Una columna jsonb en `profiles` guarda qué páginas ya vio cada usuario
(reutilizando la policy de UPDATE ya existente). Un hook (`usePaginaManualVista`) lee/escribe
esa columna. Dos componentes compartidos y genéricos (`AvisoPrimeraVisita`, `ManualPanel`)
se alimentan de un archivo de contenido por página (`lib/manuals/<pagina>.ts`) y se montan en
`AgendaCalendar.web.tsx` y `caja.web.tsx`.

**Tech Stack:** Expo Router (react-native-web), TypeScript, Supabase (jsonb + RLS existente),
sin CSS-in-JS (estilos inline `style={{}}`, igual que el resto de `.web.tsx` del repo).

## Global Constraints

- Código en inglés, comentarios en español, sin emojis en código/UI (CLAUDE.md).
- Sin `any` en TypeScript nuevo (los archivos existentes que se editan ya usan `any` en sitios
  puntuales — no hace falta limpiarlos, solo no añadir `any` nuevo).
- Mobile-first: usar `useResponsive()` (`isMobile`) en los dos componentes nuevos, igual que
  el resto de la pantalla que los monta.
- Tokens de diseño: `DESIGN_TOKENS` de `lib/designTokens.ts` (importado como `T` o `TOKENS`
  según el archivo que se edite — respetar el alias que ya usa cada archivo).
- **No hay framework de tests en este repo** (no jest/vitest, no carpetas `__tests__`). La
  verificación del proyecto es: `npx tsc --noEmit` (typecheck) + verificación manual en el
  preview del navegador. Los pasos de este plan siguen ese patrón en vez de TDD con test
  runner.
- Multi-tenant: no aplica en esta feature (la tabla que se toca, `profiles`, ya filtra por
  `auth.uid() = id`, no por `negocio_id`, para estas columnas de "preferencias propias").
- Proyecto Supabase: `vtrggiogjrhqtwbhbgia` (usar ese `project_id` en las tools de Supabase).
- Deploy: producción despliega desde `master` vía Vercel al hacer push. Tras cada tarea con
  cambios de código, commit; al final de todo el plan, push a `master`.
- Spec de referencia: `docs/superpowers/specs/2026-07-03-avisos-manuales-paginas-design.md`.

---

### Task 1: Migración — columna `paginas_manual_vistas` en `profiles`

**Files:**
- Create: `migrations/manuales-paginas-vistas.sql`

**Interfaces:**
- Produces: columna `public.profiles.paginas_manual_vistas jsonb not null default '{}'::jsonb`,
  legible/escribible por su propietario vía la policy ya existente `Users can update own
  profile` (`UPDATE ... using (auth.uid() = id)`, verificada por consulta directa a
  `pg_policies` — no hace falta crear ninguna policy nueva).

- [ ] **Step 1: Escribir el archivo de migración**

```sql
-- Mapa pagina_key -> timestamp ISO de cuando el usuario vio el aviso/manual de esa
-- pagina por primera vez. Reutiliza la policy "Users can update own profile" (UPDATE,
-- auth.uid() = id) que ya existe: no hace falta RPC ni policy nueva, igual que se hizo
-- con privacy_accepted_at en politica-privacidad-consentimiento.sql.
alter table public.profiles
  add column if not exists paginas_manual_vistas jsonb not null default '{}'::jsonb;

comment on column public.profiles.paginas_manual_vistas is
  'Mapa pagina_key -> timestamp ISO de cuando el usuario vio el aviso/manual de esa pagina
  por primera vez. Vacio = no ha visto ninguna. No confundir con privacy_accepted_at.';
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Usar la tool `apply_migration` con `project_id: "vtrggiogjrhqtwbhbgia"`,
`name: "manuales_paginas_vistas"` y el SQL del Step 1.

- [ ] **Step 3: Verificar la columna y la policy**

Ejecutar con `execute_sql` (mismo `project_id`):
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'profiles' and column_name = 'paginas_manual_vistas';
```
Esperado: una fila, `data_type = 'jsonb'`, `column_default` conteniendo `'{}'::jsonb`.

- [ ] **Step 4: Pasar los advisors de seguridad**

Ejecutar `get_advisors` con `project_id: "vtrggiogjrhqtwbhbgia"` y `type: "security"`.
Esperado: ningún advisor nuevo relacionado con `profiles` o `paginas_manual_vistas` (columna
sin RLS propia porque no la necesita — hereda las policies de fila ya auditadas de la tabla).

- [ ] **Step 5: Commit**

```bash
git add migrations/manuales-paginas-vistas.sql
git commit -m "feat(db): columna paginas_manual_vistas en profiles para avisos de primera visita"
```

---

### Task 2: Tipo de perfil + hook `usePaginaManualVista`

**Files:**
- Modify: `lib/auth.ts:4-20` (interface `UserProfile`)
- Create: `lib/hooks/usePaginaManualVista.ts`

**Interfaces:**
- Consumes: `getUserProfile(): Promise<UserProfile | null>` (ya existe en `lib/auth.ts`),
  `supabase` y `IS_DEMO_MODE` de `@/lib/supabase`.
- Produces:
  ```ts
  export interface PaginaManualVista {
    loading: boolean;
    visto: boolean;
    marcarVisto: () => void;
  }
  export function usePaginaManualVista(pageKey: string): PaginaManualVista
  ```
  Task 5 y Task 6 consumen este hook exactamente con esta firma.

- [ ] **Step 1: Añadir el campo a `UserProfile`**

En `lib/auth.ts`, dentro de la interface `UserProfile` (después de la línea
`privacy_policy_version?: string | null;`), añadir:

```ts
  paginas_manual_vistas?: Record<string, string>;
```

- [ ] **Step 2: Crear el hook**

Crear `lib/hooks/usePaginaManualVista.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

// Aviso de primera visita a una pagina + reapertura del manual bajo demanda. El estado
// de "visto" vive en profiles.paginas_manual_vistas (por persona, cruza dispositivos).
// La cuenta demo compartida queda exenta: nunca escribe en el perfil compartido, y no
// muestra el aviso (igual que el gate de privacidad hace con IS_DEMO_MODE).

export interface PaginaManualVista {
  loading: boolean;
  visto: boolean;
  marcarVisto: () => void;
}

export function usePaginaManualVista(pageKey: string): PaginaManualVista {
  const [loading, setLoading] = useState(true);
  // Por defecto true mientras carga: evita que el banner parpadee un instante en cada
  // visita antes de saber el estado real.
  const [visto, setVisto] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [vistas, setVistas] = useState<Record<string, string>>({});

  useEffect(() => {
    if (IS_DEMO_MODE) { setLoading(false); setVisto(true); return; }
    let cancel = false;
    (async () => {
      const profile = await getUserProfile();
      if (cancel) return;
      const v = profile?.paginas_manual_vistas ?? {};
      setUserId(profile?.id ?? null);
      setVistas(v);
      setVisto(!!v[pageKey]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [pageKey]);

  const marcarVisto = useCallback(() => {
    if (IS_DEMO_MODE || !userId || visto) return;
    const actualizadas = { ...vistas, [pageKey]: new Date().toISOString() };
    setVisto(true);
    setVistas(actualizadas);
    supabase.from('profiles').update({ paginas_manual_vistas: actualizadas }).eq('id', userId).then();
  }, [userId, pageKey, visto, vistas]);

  return { loading, visto, marcarVisto };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `lib/auth.ts` ni `lib/hooks/usePaginaManualVista.ts`
(pueden preexistir errores en `supabase/functions/**`, son Deno — ignorarlos, ya lo advierte
`CLAUDE.md`).

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts lib/hooks/usePaginaManualVista.ts
git commit -m "feat(manuals): tipo de perfil y hook usePaginaManualVista"
```

---

### Task 3: Contenido de los manuales (Agenda y Caja)

**Files:**
- Create: `lib/manuals/types.ts`
- Create: `lib/manuals/agenda.ts`
- Create: `lib/manuals/caja.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ManualSeccion { titulo: string; texto: string; captura?: string; }
  export interface ManualContent { pageKey: string; tituloPagina: string; avisoTexto: string; secciones: ManualSeccion[]; }
  export const manualAgenda: ManualContent;
  export const manualCaja: ManualContent;
  ```
  Task 4 (`ManualPanel`) consume `ManualContent`. Task 5/6 consumen `manualAgenda`/`manualCaja`.
- Nota de alcance: `captura` se deja sin asignar en esta tarea (campo opcional). Task 9 añade
  las rutas reales una vez capturadas las imágenes — no se inventan rutas placeholder aquí.

- [ ] **Step 1: Crear los tipos**

Crear `lib/manuals/types.ts`:

```ts
export interface ManualSeccion {
  titulo: string;
  texto: string;
  captura?: string; // ruta publica, p.ej. /manuals/agenda/nueva-cita.png
}

export interface ManualContent {
  pageKey: string;
  tituloPagina: string;
  avisoTexto: string; // texto corto del banner de primera visita
  secciones: ManualSeccion[];
}
```

- [ ] **Step 2: Escribir el contenido de Agenda**

Crear `lib/manuals/agenda.ts`:

```ts
import type { ManualContent } from './types';

export const manualAgenda: ManualContent = {
  pageKey: 'agenda',
  tituloPagina: 'Agenda',
  avisoTexto: 'Aquí gestionas las citas del día: crealas, edítalas, cóbralas y controla avisos y lista de espera.',
  secciones: [
    {
      titulo: 'Crear una cita',
      texto: 'Pulsa "Nueva cita" arriba a la derecha, o haz clic directamente sobre un hueco vacío de la rejilla para prellenar la hora y el profesional. Elige servicio, profesional y cliente para confirmarla.',
    },
    {
      titulo: 'Cambiar de vista',
      texto: 'Los botones "Día", "Semana" y "Mes" arriba a la izquierda cambian el rango de la agenda que se muestra. La vista de día es la que usarás la mayor parte del tiempo.',
    },
    {
      titulo: 'Editar, cobrar o cancelar una cita',
      texto: 'Haz clic sobre cualquier cita de la rejilla para abrir su ficha: desde ahí puedes cambiar la hora, marcarla como completada, cobrarla o cancelarla.',
    },
    {
      titulo: 'El panel de Avisos',
      texto: 'El icono de campana, arriba a la derecha, agrupa citas sin confirmar en las próximas 48h, el progreso de puesta en marcha del salón y otros avisos operativos del día.',
    },
    {
      titulo: 'Lista de espera',
      texto: 'El botón "Lista de espera" de la barra de filtros abre la gestión de clientes que quieren hueco antes de su próxima cita disponible.',
    },
  ],
};
```

- [ ] **Step 3: Escribir el contenido de Caja**

Crear `lib/manuals/caja.ts`:

```ts
import type { ManualContent } from './types';

export const manualCaja: ManualContent = {
  pageKey: 'caja',
  tituloPagina: 'Caja',
  avisoTexto: 'Aquí cobras las citas completadas, controlas el arqueo del día y registras ventas o fichajes del equipo.',
  secciones: [
    {
      titulo: 'Cobrar una cita',
      texto: 'Marca una o varias citas de la lista con la casilla de selección y pulsa "Cobrar". El importe ya descuenta cualquier señal pagada por adelantado.',
    },
    {
      titulo: 'Cobro rápido y venta de producto',
      texto: 'Los botones "Cobro rápido" y "Vender producto", arriba a la derecha, sirven para cobros que no vienen de una cita: un cliente sin reserva o la venta de un producto suelto.',
    },
    {
      titulo: 'Arqueo del día',
      texto: 'Las tarjetas resumen (efectivo, datáfono, propinas) muestran lo cobrado hoy en tiempo real. Solo las ve el propietario o dirección del salón.',
    },
    {
      titulo: 'Registros descargables',
      texto: 'El botón de descarga exporta un CSV con los cobros y fichajes del periodo seleccionado, listo para llevar a gestoría.',
    },
  ],
};
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `lib/manuals/*.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/manuals/
git commit -m "feat(manuals): contenido de los manuales de Agenda y Caja"
```

---

### Task 4: Componentes compartidos `AvisoPrimeraVisita` y `ManualPanel`

**Files:**
- Create: `components/manuals/AvisoPrimeraVisita.web.tsx`
- Create: `components/manuals/ManualPanel.web.tsx`

**Interfaces:**
- Consumes: `ManualContent` de `@/lib/manuals/types`, `DESIGN_TOKENS` de `@/lib/designTokens`.
- Produces:
  ```ts
  export function AvisoPrimeraVisita(props: {
    content: ManualContent;
    isMobile: boolean;
    onVerManual: () => void;
    onCerrar: () => void;
  }): JSX.Element;

  export function ManualPanel(props: {
    content: ManualContent;
    isMobile: boolean;
    onClose: () => void;
  }): JSX.Element;
  ```
  Task 5 y Task 6 importan ambos sin sufijo `.web` (`from '@/components/manuals/AvisoPrimeraVisita'`
  / `from '@/components/manuals/ManualPanel'`) — el bundler resuelve `.web.tsx` en build web,
  igual que ya hace con `components/agenda/RetrasoPropuestaModal.web.tsx` (sin hermano `.tsx`,
  ya en producción). Alcance web-only: no se crea hermano nativo en este plan.

- [ ] **Step 1: Crear `AvisoPrimeraVisita.web.tsx`**

```tsx
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import type { ManualContent } from '@/lib/manuals/types';

interface Props {
  content: ManualContent;
  isMobile: boolean;
  onVerManual: () => void;
  onCerrar: () => void;
}

// Banner no bloqueante que aparece la primera vez que el usuario visita una pagina con
// manual (ver usePaginaManualVista). No impide usar la pagina mientras esta visible.
// Spec: docs/superpowers/specs/2026-07-03-avisos-manuales-paginas-design.md
export function AvisoPrimeraVisita({ content, isMobile, onVerManual, onCerrar }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: 12,
        padding: isMobile ? '12px 14px' : '10px 18px',
        margin: isMobile ? '10px 14px 0' : '10px 20px 0',
        background: T.primarySoft,
        border: `1px solid ${T.primaryGlow}`,
        borderRadius: 12,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: T.primary, flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` }}
      />
      <div style={{ flex: 1, minWidth: isMobile ? '100%' : 0, fontSize: 12.5, color: T.text, lineHeight: 1.4 }}>
        {content.avisoTexto}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: isMobile ? 42 : 0 }}>
        <button
          onClick={onVerManual}
          style={{ padding: '7px 14px', background: T.primary, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Ver manual
        </button>
        <button
          onClick={onCerrar}
          title="Cerrar"
          style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', borderRadius: 8, color: T.textSec, cursor: 'pointer' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `ManualPanel.web.tsx`**

```tsx
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import type { ManualContent } from '@/lib/manuals/types';

interface Props {
  content: ManualContent;
  isMobile: boolean;
  onClose: () => void;
}

const PANEL_ANIM = `
  @keyframes mpFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes mpPop { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes mpSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) {
    .mp-backdrop, .mp-card { animation: none !important; }
  }
`;

// Panel/modal generico de manual de uso: recibe el contenido de una pagina (lib/manuals/*)
// y renderiza sus secciones. Se abre desde AvisoPrimeraVisita o desde el icono de ayuda
// persistente de la cabecera de la pagina — mismo componente para ambos casos.
// Spec: docs/superpowers/specs/2026-07-03-avisos-manuales-paginas-design.md
export function ManualPanel({ content, isMobile, onClose }: Props) {
  const cardStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', animation: 'mpSheet 0.3s cubic-bezier(0.16,1,0.3,1)' }
    : { position: 'relative', width: 'min(560px, 94vw)', maxHeight: '88vh', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, boxShadow: '0 30px 80px rgba(20,12,6,0.35)', display: 'flex', flexDirection: 'column', animation: 'mpPop 0.32s cubic-bezier(0.16,1,0.3,1)' };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PANEL_ANIM }} />
      <div
        className="mp-backdrop"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(20,12,6,0.45)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20, animation: 'mpFade 0.2s ease' }}
      >
        <div className="mp-card" style={cardStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '16px 16px 12px' : '20px 22px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, background: T.primary, flexShrink: 0 }}
              dangerouslySetInnerHTML={{ __html: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 16 : 17, fontWeight: 800, color: T.text }}>{content.tituloPagina}</div>
              <div style={{ fontSize: 12.5, color: T.textSec }}>Manual de uso</div>
            </div>
            <button onClick={onClose} title="Cerrar" style={{ display: 'grid', placeItems: 'center', width: isMobile ? 38 : 34, height: isMobile ? 38 : 34, borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: isMobile ? '14px 16px 24px' : '16px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {content.secciones.map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>{s.titulo}</div>
                <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5, marginBottom: s.captura ? 10 : 0 }}>{s.texto}</div>
                {s.captura && (
                  <img src={s.captura} alt={s.titulo} style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.border}`, display: 'block' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `components/manuals/*.web.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/manuals/
git commit -m "feat(manuals): componentes AvisoPrimeraVisita y ManualPanel"
```

---

### Task 5: Integrar en Agenda (`AgendaCalendar.web.tsx`)

**Files:**
- Modify: `components/agenda/AgendaCalendar.web.tsx`

**Interfaces:**
- Consumes: `usePaginaManualVista` (Task 2), `manualAgenda` (Task 3), `AvisoPrimeraVisita` y
  `ManualPanel` (Task 4).

- [ ] **Step 1: Añadir imports**

En `components/agenda/AgendaCalendar.web.tsx`, tras la línea
`import { contarSinLeer } from '@/lib/bandeja';`, añadir:

```ts
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualAgenda } from '@/lib/manuals/agenda';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita';
import { ManualPanel } from '@/components/manuals/ManualPanel';
```

- [ ] **Step 2: Añadir estado y hook**

Buscar esta línea dentro de `export default function AgendaCalendar() {`:

```ts
  const [showNotif, setShowNotif] = useState(false);
```

Justo después, añadir:

```ts
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('agenda');
```

- [ ] **Step 3: Icono de ayuda persistente en la cabecera**

Buscar este bloque (cabecera, botón de la campana de Avisos):

```tsx
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotif((v) => !v)}
              title="Avisos"
```

Insertar el botón de ayuda justo antes de ese `<div style={{ position: 'relative' }}>`:

```tsx
          <button
            onClick={() => setShowManualPanel(true)}
            title="Manual de esta pagina"
            className="m-btn-icon"
            style={{ padding: 7, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 9, color: TOKENS.textSec, cursor: 'pointer', width: 33, height: 33, display: 'grid', placeItems: 'center' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotif((v) => !v)}
              title="Avisos"
```

(El resto del bloque original de la campana sigue igual a continuación — solo se añade el
botón nuevo delante.)

- [ ] **Step 4: Banner de primera visita**

Buscar este bloque (cierre de la topbar, antes de la barra de filtros):

```tsx
            <Icon name="plus" size={15} color="#fff" />
            {isMobile ? 'Cita' : 'Nueva cita'}
          </button>
        </div>
      </div>

      {/* 8.3+8.4: Barra de filtros y buscador */}
```

Reemplazar por:

```tsx
            <Icon name="plus" size={15} color="#fff" />
            {isMobile ? 'Cita' : 'Nueva cita'}
          </button>
        </div>
      </div>

      {!paginaManual.loading && !paginaManual.visto && (
        <AvisoPrimeraVisita
          content={manualAgenda}
          isMobile={isMobile}
          onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
          onCerrar={paginaManual.marcarVisto}
        />
      )}

      {/* 8.3+8.4: Barra de filtros y buscador */}
```

- [ ] **Step 5: Renderizar el panel**

Buscar este bloque (donde ya se renderiza `RetrasoPropuestaModal`):

```tsx
      {propRetraso && (
        <RetrasoPropuestaModal
          propuesta={propRetraso}
          minutos={retrasoMin}
          profesionalNombre={prof?.nombre}
          avisarDisponible={avisarRetrasoActivo}
          enviando={aplicandoRetraso}
          onConfirmar={aplicarRetraso}
          onCancelar={() => setPropRetraso(null)}
        />
      )}
```

Justo después de ese bloque (antes de `{showCancelModal && (`), añadir:

```tsx
      {showManualPanel && (
        <ManualPanel
          content={manualAgenda}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `components/agenda/AgendaCalendar.web.tsx`.

- [ ] **Step 7: Commit**

```bash
git add components/agenda/AgendaCalendar.web.tsx
git commit -m "feat(manuals): aviso de primera visita y manual de uso en Agenda"
```

---

### Task 6: Integrar en Caja (`caja.web.tsx`)

**Files:**
- Modify: `app/(tabs)/caja.web.tsx`

**Interfaces:**
- Consumes: `usePaginaManualVista` (Task 2), `manualCaja` (Task 3), `AvisoPrimeraVisita` y
  `ManualPanel` (Task 4).

- [ ] **Step 1: Añadir imports**

En `app/(tabs)/caja.web.tsx`, tras la línea `import { categoryColorHex } from '@/lib/categoryColors';`,
añadir:

```ts
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualCaja } from '@/lib/manuals/caja';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita';
import { ManualPanel } from '@/components/manuals/ManualPanel';
```

- [ ] **Step 2: Añadir estado y hook**

Buscar esta línea dentro de `function CajaScreen() {`:

```ts
  const { isMobile } = useResponsive();
```

Justo después, añadir:

```ts
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('caja');
```

- [ ] **Step 3: Icono de ayuda junto al título**

Buscar este bloque (cabecera de la pantalla):

```tsx
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: T.text, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="wallet" size={isMobile ? 22 : 28} color={T.primary} />
            Caja
          </h1>
```

Reemplazar por:

```tsx
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: T.text, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="wallet" size={isMobile ? 22 : 28} color={T.primary} />
            Caja
            <button
              onClick={() => setShowManualPanel(true)}
              title="Manual de esta pagina"
              style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: T.card, border: `1px solid ${T.borderHi}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          </h1>
```

- [ ] **Step 4: Banner de primera visita**

Buscar este bloque (cierre del header, antes del bloque de arqueo):

```tsx
          </div>
        )}
      </div>

      {/* Arqueo del dia — solo propietario/dirección (todo lo del dinero) */}
```

Reemplazar por:

```tsx
          </div>
        )}
      </div>

      {!paginaManual.loading && !paginaManual.visto && (
        <div style={{ marginBottom: isMobile ? 16 : 20 }}>
          <AvisoPrimeraVisita
            content={manualCaja}
            isMobile={isMobile}
            onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
            onCerrar={paginaManual.marcarVisto}
          />
        </div>
      )}

      {/* Arqueo del dia — solo propietario/dirección (todo lo del dinero) */}
```

- [ ] **Step 5: Renderizar el panel**

Buscar el cierre del componente:

```tsx
      )}
    </div>
  );
}
```

Reemplazar por:

```tsx
      )}
      {showManualPanel && (
        <ManualPanel
          content={manualCaja}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `app/(tabs)/caja.web.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/caja.web.tsx"
git commit -m "feat(manuals): aviso de primera visita y manual de uso en Caja"
```

---

### Task 7: Build web y verificación visual en preview

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Build web**

Run: `npm run build:web`
Expected: build sin errores (compila `app/`, `lib/`, `components/` a `web/app/`).

- [ ] **Step 2: Levantar el preview y comprobar Agenda**

Usar `preview_start` (o el servidor local `node scripts/serve-web.mjs` si ya está corriendo)
y navegar a `http://localhost:8080/demo.html?share=1`. Dentro del iframe de la demo, comprobar
con `preview_snapshot`/`preview_eval` (`iframe.src` a `/app/(tabs)?demo=1` o la ruta de Agenda
correspondiente):
- El icono de ayuda nuevo aparece en la cabecera, junto a la campana.
- **No** aparece el banner de primera visita en modo demo (comportamiento esperado:
  `IS_DEMO_MODE` desactiva el hook).
- Al pulsar el icono de ayuda se abre `ManualPanel` con el título "Agenda" y las 5 secciones
  del Step 2 de la Task 3, y al pulsar la X o el fondo se cierra.

- [ ] **Step 3: Comprobar Caja**

Repetir para la pantalla de Caja: icono de ayuda junto al título "Caja", panel con las 4
secciones de `manualCaja`, cierre correcto.

- [ ] **Step 4: Comprobar el banner con una cuenta real (no demo)**

Si hay credenciales de prueba disponibles (cuenta de staff no-demo), entrar con ellas,
confirmar que el banner SÍ aparece la primera vez en Agenda y Caja (perfil real, columna
`paginas_manual_vistas` vacía), que "Ver manual" abre el panel y marca visto, que recargar la
página ya no muestra el banner, y que el icono de ayuda lo sigue reabriendo. Si no hay
credenciales de prueba a mano, documentar esto como pendiente de verificación manual por el
usuario y seguir adelante (el modo demo ya confirma que el mecanismo no rompe nada).

- [ ] **Step 5: Capturar pantalla de prueba**

Usar `preview_screenshot` para dejar constancia visual del panel abierto en Agenda y en Caja.

---

### Task 8: Capturas reales para los manuales

**Files:**
- Create: `public/manuals/agenda/*.png` (varias)
- Create: `public/manuals/caja/*.png` (varias)
- Modify: `lib/manuals/agenda.ts` (añadir `captura` a las secciones que la tengan)
- Modify: `lib/manuals/caja.ts` (añadir `captura` a las secciones que la tengan)

**Interfaces:** ninguna nueva — solo se completa el campo opcional `captura` de `ManualSeccion`
(Task 3) con rutas reales.

- [ ] **Step 1: Preparar la carpeta de destino**

Run: `mkdir -p public/manuals/agenda public/manuals/caja`

- [ ] **Step 2: Navegar la demo con chrome-devtools-mcp**

Usar las tools de `chrome-devtools-mcp` (`new_page`/`navigate_page` a
`http://localhost:8080/app/(tabs)?demo=1` o la URL de Agenda embebida, `take_snapshot` para
obtener los `uid` de los elementos a capturar: el botón "Nueva cita", el selector de vista
Día/Semana/Mes, una cita de la rejilla, la campana de Avisos abierta, el botón "Lista de
espera").

- [ ] **Step 3: Capturar Agenda**

Para cada sección de `manualAgenda` con un elemento identificable, usar `take_screenshot` con
`uid` (o `fullPage`/viewport si el elemento no es recortable limpiamente) y `filePath`:
- `public/manuals/agenda/nueva-cita.png`
- `public/manuals/agenda/vistas.png`
- `public/manuals/agenda/ficha-cita.png`
- `public/manuals/agenda/avisos.png`
- `public/manuals/agenda/lista-espera.png`

- [ ] **Step 4: Capturar Caja**

Repetir para Caja: navegar a la pantalla, capturar la lista de citas con selección, los
botones "Cobro rápido"/"Vender producto", las tarjetas de arqueo, el botón de descarga CSV:
- `public/manuals/caja/cobrar.png`
- `public/manuals/caja/cobro-rapido.png`
- `public/manuals/caja/arqueo.png`
- `public/manuals/caja/registros.png`

- [ ] **Step 5: Enlazar las capturas en el contenido**

En `lib/manuals/agenda.ts` y `lib/manuals/caja.ts`, añadir `captura: '/manuals/<pagina>/<archivo>.png'`
a cada sección con imagen correspondiente (mismo orden que los Steps 3 y 4). Si alguna
captura no salió aprovechable, dejar esa sección sin `captura` (es opcional) en vez de forzar
una imagen de baja calidad.

- [ ] **Step 6: Typecheck y build**

Run: `npx tsc --noEmit && npm run build:web`
Expected: sin errores.

- [ ] **Step 7: Verificación visual**

Repetir Task 7 Step 2-3 y confirmar que las imágenes cargan dentro del panel (sin roturas de
imagen), con `preview_network` o `preview_screenshot`.

- [ ] **Step 8: Commit**

```bash
git add public/manuals/ lib/manuals/agenda.ts lib/manuals/caja.ts
git commit -m "feat(manuals): capturas reales de Agenda y Caja en los manuales"
```

---

### Task 9: Deploy

**Files:** ninguno.

- [ ] **Step 1: Confirmar rama y estado**

Run: `git status` y `git log --oneline -12`
Expected: rama `master`, todos los commits de las Tasks 1-8 presentes, sin cambios sin commitear
(aparte de `dist/` si sigue sin trackear, que ya estaba así al empezar).

- [ ] **Step 2: Push a master**

Run: `git push origin master`
Expected: push aceptado; Vercel despliega automáticamente desde `master` (deploy vía Git,
sin paso manual adicional).

- [ ] **Step 3: Verificar el deploy**

Comprobar en los logs/estado de Vercel (o revisitando `https://www.mechaa.es/demo.html?share=1`
una vez propagado) que el build de producción terminó en success y que el icono de ayuda es
visible en Agenda y Caja.

---

## Self-Review

**Cobertura de la spec:** Alcance piloto Agenda+Caja (Tasks 5-6), persistencia por persona en
`profiles` (Task 1-2), banner no bloqueante (Task 4-6), manuales en panel dentro del software
(Task 4), reapertura por icono persistente (Task 5-6 Step 3), contenido en archivo de datos
(Task 3), capturas estáticas reales (Task 8), solo web (todos los archivos nuevos son `.web.tsx`
o `.ts` sin JSX) — todos los puntos de la sección 2 del diseño tienen tarea. Cubierto.

**Placeholders:** ninguno — todo el código de cada step está completo; `captura` se deja
opcional/vacío explícitamente en Task 3 con la tarea de completarlo (Task 8) ya definida, no
es un TODO suelto.

**Consistencia de tipos:** `PaginaManualVista`, `ManualContent`, `ManualSeccion`,
`AvisoPrimeraVisita`/`ManualPanel` props — mismos nombres y formas en todas las tasks que los
usan (Task 2 produce, Tasks 3-4 definen, Tasks 5-6 consumen sin redefinir).
