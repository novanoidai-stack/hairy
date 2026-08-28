# 📑 INFORME ESTRATÉGICO DE ARQUITECTURA, STACK Y GESTIÓN DE ESTADO (MECHA OS)

**Fecha:** 27 de Agosto de 2026  
**Autor:** Antigravity (Auditoría Técnica y Arquitectura de Sistemas)  
**Proyecto:** Mecha OS (Repo `Hairy`)  
**Audiencia:** Equipo Técnico y Fundadores  

---

## 🎯 1. Resumen Ejecutivo y Diagnóstico Global

Tras una auditoría exhaustiva y matemática de los **1.379 archivos** y **511.610 líneas de código** del proyecto, este informe evalúa la idoneidad del stack actual, la viabilidad de migración de infraestructuras (Supabase/Vercel vs. VPS propio) y la solución al principal cuello de botella del software: **la gestión de estado y el gigantismo de componentes como la Agenda (25.684 líneas)**.

### Veredicto Rápido de Arquitectura:
- **Base de Datos y Backend (Supabase Postgres + Edge Functions)**: 🟢 **Excelente y de primer nivel.** No se debe migrar a un VPS. Aguanta de 1 a 50.000 salones con costes mínimos (~25 $/mes).
- **Hosting de la App Web (Vercel)**: 🟢 **Óptimo para la fase actual.** Global Edge CDN de alta velocidad. El VPS propio debe reservarse para procesos pesados de fondo (n8n, workers 24/7).
- **Frontend y Gestión de Estado**: 🔴 **Cuello de botella crítico.** La ausencia de un gestor de caché del servidor y el uso de `useState` masivo ha generado componentes monolíticos inmanejables. Debe modularizarse con **TanStack Query + Zustand**.

---

## 🗄️ 2. Supabase vs. Base de Datos Normal Open Source en VPS

### ¿Qué es vuestro Supabase hoy?
Vuestra base de datos en Supabase **YA ES un PostgreSQL estándar puro (Postgres 15/16)**. Todo el modelo de datos (98 tablas, políticas RLS, triggers, funciones en PL/pgSQL, criptografía SHA-256 de VeriFactu) es SQL estándar no propietario.

Sin embargo, Supabase aporta 4 capas de infraestructura críticas integradas:
1. **PostgREST**: Genera la API REST que consume el frontend automáticamente.
2. **GoTrue (Auth)**: Gestión completa de JWTs, sesiones y OAuth.
3. **Storage API**: Servidor S3 con seguridad RLS integrada (fotos privadas de clientas).
4. **Realtime**: WebSockets conectados al WAL de Postgres para actualizar la agenda en vivo.

### Comparativa de Impacto Real:

| Criterio | Supabase Managed (Cloud) | Postgres Normal en VPS Propio |
| :--- | :--- | :--- |
| **Coste Mensual** | 0 € (Free) / ~25 $/mes (Pro) | 10 € - 30 €/mes (Coste del VPS) |
| **Impacto en el Frontend** | **0 líneas de cambio**. Funciona ya. | 🔴 **Reescritura masiva**: Dejarían de funcionar `supabase.from()`, `supabase.auth`, `supabase.storage` y `supabase.realtime`. |
| **Opción Supabase Self-Hosted** | Gestionado y monitorizado por Supabase. | Consume 3-4 GB de RAM en el VPS solo para contenedores auxiliares (Kong, PostgREST, GoTrue, Realtime, Storage). |
| **Mantenimiento & SLA** | Backups diarios automáticos, PITR, alta disponibilidad, parches de seguridad de base de datos. | **Mantenimiento 100% manual**: Si el disco se llena o Postgres se corrompe, los salones no pueden cobrar ni agendar. |
| **Capacidad de Crecimiento** | Escalable a millones de registros sin tocar configuración. | Limitado por hardware y ancho de banda del VPS. |

> 📌 **Recomendación Estratégica**: **MANTENER SUPABASE**. Cambiar a un Postgres pelado en un VPS destruiría la productividad del equipo y generaría semanas de trabajo sin aportar ninguna ventaja técnica real.

---

## ⚡ 3. Vercel vs. Despliegue en VPS Propio

El frontend de Mecha es una **Single Page Application (SPA)** estática generada por Expo (`expo export -p web`).

### Análisis de Despliegue:

| Dimensión | Vercel (Edge CDN) | Servidor VPS (Nginx / Docker / Coolify) |
| :--- | :--- | :--- |
| **Velocidad de Carga (Latencia)** | Ultrarrápida (Edge CDN en más de 300 ciudades). | Depende de la ubicación física única del VPS. |
| **Mantenimiento** | Cero. Despliegues automáticos con `git push`. | Requiere configurar CI/CD, Nginx, SSL (`certbot`) y cortafuegos. |
| **Seguridad de Red** | Protección DDoS Anycast de nivel empresarial. | Requiere configurar Cloudflare delante para no saturar el VPS. |
| **Coste** | 0 € (Hobby) / ~20 $/mes (Pro). | 0 € extra (ya tienes el VPS). |

### 🏆 La Estrategia Híbrida Ganadora:
- **Vercel**: Mantener el hosting de la web y la app estática (máxima velocidad para clientes y peluquerías, cero caídas).
- **Tu VPS Propio**: Alojar los servicios que en la nube son costosos:
  1. **n8n Self-Hosted**: Envíos de WhatsApp y automatizaciones ilimitadas sin pagar licencias SaaS.
  2. **Workers 24/7**: Procesamiento en segundo plano (loop de VeriFactu, sincronizaciones pesadas).

---

## 🛑 4. El Problema Central: Gestión de Estado y la Agenda Monolítica

El verdadero riesgo técnico del proyecto no está en el cloud, sino en el archivo [`components/agenda/AgendaCalendar.web.tsx`](file:///c:/Users/carli/OneDrive/Escritorio/Trabajo/novanoidai/Hairy/components/agenda/AgendaCalendar.web.tsx), que acumula **25.684 líneas de código**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ANATOMÍA DEL PROBLEMA ACTUAL                          │
│                                                                             │
│   AgendaCalendar.web.tsx (25.684 líneas / ~1 MB)                            │
│   ├── 40+ useState y useEffect locales no sincronizados                    │
│   ├── Consultas directas a Supabase (fetch, insert, update manuales)        │
│   ├── Lógica matemática de arrastre (coordenadas, ghosting, rejilla)        │
│   ├── Fases químicas de tintes (fase activa vs. reposo)                     │
│   ├── 8 Modales incrustados en el mismo cuerpo de archivo                   │
│   └── Prop Drilling masivo (pasar callbacks a través de 5 niveles de hijos) │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Síntomas y Riesgos:
1. **Re-renders en Cascada**: Un movimiento de ratón en el drag & drop provoca que React vuelva a evaluar miles de líneas de componentes secundarios.
2. **Fragilidad ante Cambios**: Modificar un botón de cobro puede alterar accidentalmente la física del calendario (ejemplo: el error de tipado `gridRect` detectado en la auditoría).
3. **Peticiones Duplicadas**: La falta de un gestor de caché forzó a crear un deduplicador manual en `lib/supabase.ts` para frenar las 61 peticiones simultáneas del arranque.

---

## 🏛️ 5. La Arquitectura Idílica de la Agenda

La solución definitiva consiste en aplicar el principio de **Separación de Responsabilidades** mediante dos herramientas estándar en la industria:
- **TanStack Query (React Query)**: Para el *Server State* (cargar, cachear y refrescar citas de Supabase en segundo plano).
- **Zustand**: Para el *Client State* (controlar modales, fecha activa y drag & drop sin pasar *props*).

### Nueva Estructura Modular de Carpetas:
```
components/agenda/
├── AgendaCalendar.web.tsx          # Orquestador limpio (< 120 líneas)
├── store/
│   └── useAgendaStore.ts           # Estado visual con Zustand (zoom, fecha, modales)
├── hooks/
│   ├── useAgendaData.ts            # Fetching y caché con TanStack Query
│   ├── useAgendaDragAndDrop.ts     # Lógica matemática de arrastre
│   └── useTimelineGeometry.ts      # Cálculo de carriles y fases de reposo
├── timeline/
│   ├── TimelineGrid.tsx            # Rejilla horaria y líneas guía
│   ├── TimelineProfessionalCol.tsx # Columna de un estilista
│   ├── TimelineAppointmentCard.tsx # Tarjeta de cita con fases (activa/reposo)
│   └── TimelineNowIndicator.tsx    # Indicador de hora actual aislado
└── modals/
    ├── NewAppointmentModal.tsx     # Modal agendar cita
    ├── QuickCheckoutModal.tsx      # Modal de cobro rápido
    └── BlockTimeModal.tsx          # Modal bloqueo de horario
```

---

## 💻 6. Ilustración del Código Idílico

### 1. Store de UI con Zustand (`store/useAgendaStore.ts`)
```typescript
import { create } from 'zustand';

interface AgendaUIState {
  fechaSeleccionada: string;
  citaSeleccionadaId: string | null;
  modalCobroAbierto: boolean;
  modalNuevaCitaAbierto: boolean;
  
  setFecha: (fecha: string) => void;
  abrirCobro: (citaId: string) => void;
  cerrarCobro: () => void;
  abrirNuevaCita: () => void;
}

export const useAgendaStore = create<AgendaUIState>((set) => ({
  fechaSeleccionada: new Date().toISOString().split('T')[0],
  citaSeleccionadaId: null,
  modalCobroAbierto: false,
  modalNuevaCitaAbierto: false,

  setFecha: (fecha) => set({ fechaSeleccionada: fecha }),
  abrirCobro: (citaId) => set({ modalCobroAbierto: true, citaSeleccionadaId: citaId }),
  cerrarCobro: () => set({ modalCobroAbierto: false, citaSeleccionadaId: null }),
  abrirNuevaCita: () => set({ modalNuevaCitaAbierto: true }),
}));
```

### 2. Capa de Datos con TanStack Query (`hooks/useAgendaData.ts`)
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useAgendaData(fecha: string, negocioId: string) {
  const queryClient = useQueryClient();

  const citasQuery = useQuery({
    queryKey: ['citas', negocioId, fecha],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('citas')
        .select('*, clientes(nombre, telefono), servicios(nombre, duracion_min)')
        .eq('negocio_id', negocioId)
        .eq('fecha', fecha);
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60, // 1 minuto en caché sin re-consultar
  });

  const moverCita = useMutation({
    mutationFn: async ({ citaId, nuevaHora, nuevoProfId }: any) => {
      const { error } = await supabase
        .from('citas')
        .update({ hora_inicio: nuevaHora, profesional_id: nuevoProfId })
        .eq('id', citaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas', negocioId, fecha] });
    },
  });

  return {
    citas: citasQuery.data ?? [],
    cargando: citasQuery.isLoading,
    moverCita: moverCita.mutate,
  };
}
```

### 3. Componente Orquestador Principal (`AgendaCalendar.web.tsx`)
```tsx
import React from 'react';
import { useAgendaStore } from './store/useAgendaStore';
import { useAgendaData } from './hooks/useAgendaData';
import { TimelineGrid } from './timeline/TimelineGrid';
import { TimelineProfessionalCol } from './timeline/TimelineProfessionalCol';
import { QuickCheckoutModal } from './modals/QuickCheckoutModal';
import { NewAppointmentModal } from './modals/NewAppointmentModal';

export function AgendaCalendar({ negocioId }: { negocioId: string }) {
  const { fechaSeleccionada } = useAgendaStore();
  const { citas, cargando, moverCita } = useAgendaData(fechaSeleccionada, negocioId);

  if (cargando) return <AgendaSkeletonLoader />;

  return (
    <div className="agenda-root" style={{ display: 'flex', position: 'relative' }}>
      <TimelineGrid />
      <div className="timeline-columns" style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
        {profesionales.map((prof) => (
          <TimelineProfessionalCol
            key={prof.id}
            profesional={prof}
            citas={citas.filter((c) => c.profesional_id === prof.id)}
            onMoverCita={moverCita}
          />
        ))}
      </div>
      <QuickCheckoutModal />
      <NewAppointmentModal />
    </div>
  );
}
```

---

## ⚖️ 7. Matriz de Beneficios vs. Retos (Pros & Cons)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  BALANCE                                    │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 🟢 BENEFICIOS (PROS)                 │ 🔴 RETOS Y COSTES (CONS)             │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 1. **Rendimiento Inmediato**:        │ 1. **Trabajo Metódico**:             │
│    Re-renders quirúrgicos. La agenda │    Exige modularizar paso a paso     │
│    se mueve a 60 FPS sin tirones.    │    para no alterar la física visual. │
│ 2. **Cero Pantallas en Blanco**:     │ 2. **Disciplina de Código**:         │
│    Navegación instantánea entre tabs │    Prohibir volver a meter lógica    │
│    gracias a la caché en memoria.    │    monolítica en un solo archivo.    │
│ 3. **Mantenibilidad Radical**:       │ 3. **Curva Menor de Librería**:      │
│    Archivos de 100 a 300 líneas      │    Uso de hooks estándar Zustand     │
│    fáciles de leer y modificar.      │    y React Query.                    │
│ 4. **Cero Bugs de Desincronización**:│                                      │
│    Invalidación reactiva automática. │                                      │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 🚀 8. Plan de Ejecución Seguro "Zero-Breaking"

Para implementar esta mejora sin riesgo de romper funcionalidades existentes:

1. **Fase 1 (Preparación e Instalación)**:
   - Instalar `zustand` y `@tanstack/react-query` en `package.json`.
   - Corregir el error tipado actual en `AgendaCalendar.web.tsx(9493)`.
2. **Fase 2 (Extracción de Modales)**:
   - Mover los 8 modales incrustados a `components/agenda/modals/`.
   - Conectarlos al `useAgendaStore` para abrir/cerrar.
3. **Fase 3 (Extracción de Tarjetas y Columnas)**:
   - Mover la tarjeta de cita y la columna de profesional a `components/agenda/timeline/`.
4. **Fase 4 (Capa de Datos)**:
   - Conectar las consultas a `useAgendaData` sustituyendo los `useEffect` imperativos.
