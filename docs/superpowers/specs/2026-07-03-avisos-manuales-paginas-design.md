# Diseño: Avisos de primera visita + manuales por página

- Fecha: 2026-07-03
- Autor: Carlos + Claude
- Estado: diseño aprobado; pendiente de revisión del spec antes de plan de implementación
- Reparto: Carlos (UI + lógica de solo lectura/escritura en el cliente). No toca mensajería,
  dinero, IA ni OAuth.
- Relación con otros specs: independiente del asistente de onboarding cinematográfico con IA
  (brainstorm paralelo del mismo día) y del checklist de puesta en marcha
  (`2026-06-26-onboarding-checklist-design.md`). Este proyecto es contenido estático, no IA.

## 1. Problema y objetivo

Un usuario que entra por primera vez a una página del software (Agenda, Caja, Clientes...) no
tiene ninguna guía de qué se hace ahí ni cómo. Hoy la única ayuda contextual que existe es el
checklist de puesta en marcha (que cubre "qué configurar", no "cómo se usa cada pantalla").

Objetivo: dos piezas nuevas, ligeras y sin IA:
1. Un **aviso breve** que aparece la primera vez que el usuario visita cada página, explicando
   en 1-2 frases qué se hace ahí.
2. Un **manual detallado** (texto + capturas reales, explicación de cada botón/función) al que
   ese aviso puede redirigir, y al que también se puede volver a acceder cuando se quiera.

## 2. Decisiones de diseño (cerradas con el usuario)

1. **Alcance de esta ronda:** piloto en **Agenda** y **Caja** (las pantallas más complejas). El
   resto de páginas (Bandeja, Clientes, Configuración, Equipo, Informes, Inventario, Lista de
   espera, Mi jornada, Presupuestos, Reseñas) se añaden después, de forma incremental, una vez
   validado el mecanismo. No bloquean el envío del piloto.
2. **Persistencia — por persona, en backend:** se guarda en Supabase (no localStorage), para que
   sea consistente entre dispositivos. Es **por persona** (cada miembro del equipo tiene su
   propio recorrido), no por negocio: un empleado nuevo en un salón con años de antigüedad sigue
   viendo los avisos que le tocan a él.
3. **Sin tabla nueva — columna en `profiles`:** se sigue el patrón ya usado hoy mismo para el
   gate de aceptación de privacidad (`migrations/politica-privacidad-consentimiento.sql`: añadir
   columna a `profiles` y reusar la policy existente `auth.uid() = id` de UPDATE). Cero tablas
   nuevas, cero RLS nueva.
4. **UX del aviso — banner no bloqueante:** una franja/tarjeta arriba de la página, con el texto
   breve, botón "Ver manual" y una X para cerrar. No impide usar la página mientras tanto (a
   diferencia del gate de privacidad, que si bloquea). Coherente con no interrumpir 12 veces la
   primera semana de uso.
5. **Manuales dentro del software:** panel/modal que se abre sin salir de la página ni perder
   contexto (mismo patrón de "panel dedicado" que el checklist de onboarding), no páginas de
   ayuda separadas.
6. **Reapertura bajo demanda:** además del botón "Ver manual" del aviso, cada página con manual
   tiene un **icono de ayuda persistente** en su cabecera que abre el mismo panel en cualquier
   momento (no solo la primera vez).
7. **Contenido en archivos de datos, no JSX a medida:** cada página tiene un archivo de
   contenido (`lib/manuals/<pagina>.ts`) con su lista de secciones. El visor (`ManualPanel`) es
   un único componente genérico que renderiza cualquier archivo de contenido — añadir una página
   nueva no toca el visor, solo su archivo de contenido.
8. **Capturas reales, estáticas en el repo:** imágenes en `public/manuals/<pagina>/*.png|webp`
   (el repo ya tiene una carpeta `public/` en la raíz que Expo copia tal cual al export web),
   referenciadas por ruta absoluta (`/manuals/agenda/nueva-cita.png`) desde el archivo de
   contenido. Se toman a mano; si la UI cambia mucho, se retocan sueltas sin tocar código.
9. **Solo web por ahora:** coherente con el resto del roadmap ("hoy el producto real es la web").
   El nativo puede sumarse más adelante si se decide llevarlo.

## 3. Modelo de datos

```sql
alter table public.profiles
  add column if not exists paginas_manual_vistas jsonb not null default '{}'::jsonb;

comment on column public.profiles.paginas_manual_vistas is
  'Mapa pagina_key -> timestamp ISO de cuando el usuario vio el aviso/manual de esa pagina
  por primera vez. Vacio = no ha visto ninguna. No confundir con privacy_accepted_at.';
```

Ejemplo de valor: `{"agenda": "2026-07-05T10:00:00Z", "caja": "2026-07-06T09:00:00Z"}`.

No hace falta RPC ni policy nueva: la policy "Users can update own profile"
(`UPDATE ... using (auth.uid() = id)`) ya permite que cada usuario actualice esta columna de su
propia fila, igual que se hizo con `privacy_accepted_at`.

## 4. Arquitectura de componentes

- **`usePaginaManualVista(pageKey: string)`** (`lib/hooks/usePaginaManualVista.ts`) — hook que
  lee `paginas_manual_vistas` del perfil ya cargado en contexto de sesión, expone:
  - `visto: boolean` — si `pageKey` ya tiene timestamp.
  - `marcarVisto(): void` — hace `UPDATE profiles SET paginas_manual_vistas =
    paginas_manual_vistas || jsonb_build_object($pageKey, now())` (vía cliente Supabase,
    actualización puntual de esa clave, sin pisar las demás) y actualiza el estado local/contexto
    de perfil de forma optimista.
- **`<AvisoPrimeraVisita pageKey="agenda" texto="..." onVerManual={...} />`**
  (`components/manuals/AvisoPrimeraVisita.web.tsx`) — banner que se monta al principio de la
  pantalla cuando `!visto`. Botón "Ver manual" abre `ManualPanel` y llama `marcarVisto()`; la X
  cierra el banner y también llama `marcarVisto()` (verlo una vez ya cuenta, aunque no se abra
  el manual completo).
- **`<ManualPanel pageKey="agenda" />`** (`components/manuals/ManualPanel.web.tsx`) — panel/modal
  genérico que recibe el `ManualContent` de la página (import directo del archivo de contenido)
  y renderiza sus secciones (título, texto, captura opcional). Un único componente para todas
  las páginas.
- **Icono de ayuda persistente** — un botón pequeño (icono `help-circle-outline` o similar) en la
  cabecera de cada página con manual, que abre `ManualPanel` directamente, disponible siempre
  (no depende de `visto`).
- **Contenido por página** (`lib/manuals/agenda.ts`, `lib/manuals/caja.ts`), tipado:
  ```ts
  export type ManualSeccion = { titulo: string; texto: string; captura?: string };
  export type ManualContent = {
    pageKey: string;
    avisoTexto: string; // texto corto del banner
    secciones: ManualSeccion[];
  };
  ```

## 5. Flujo de datos

1. La página (ej. `AgendaCalendar`) llama `usePaginaManualVista('agenda')`.
2. Si `!visto`, monta `<AvisoPrimeraVisita>` arriba del contenido normal (no bloquea el resto).
3. El usuario cierra el banner o abre el manual → `marcarVisto()` → próxima vez que entre a esa
   página, `visto` ya es `true` y el banner no vuelve a aparecer.
4. En cualquier momento, el icono de ayuda de la cabecera abre el mismo `ManualPanel`,
   independientemente del estado de `visto`.

## 6. Rollout

- **Piloto (esta spec):** mecanismo completo (columna, hook, banner, panel, icono de ayuda) +
  contenido real (texto + capturas) de **Agenda** y **Caja**.
- **Incremental (fuera de esta spec):** por cada página nueva — crear `lib/manuals/<pagina>.ts`,
  tomar sus capturas, montar `<AvisoPrimeraVisita>` + icono de ayuda en esa pantalla. No requiere
  tocar `ManualPanel` ni la migración.

## 7. Fuera de alcance

- Nativo (`.tsx` sin sufijo web) — se deja para una decisión posterior.
- Cualquier generación de contenido con IA (es contenido estático, escrito a mano).
- Analítica de qué manuales se abren más (podría añadirse después reusando `lib/analytics.ts`
  si hace falta medir, no se pide ahora).
- Las 10 páginas restantes del inventario (se listan en la sección "Decisiones de diseño" punto 1
  como referencia, pero su contenido no se escribe en esta ronda).
