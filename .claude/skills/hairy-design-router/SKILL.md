---
name: hairy-design-router
description: Router de tareas para Hairy. Al inicio de cualquier tarea de Hairy, determina qué skills cargar para minimizar tokens. Úsalo si no sabes qué skills activar.
---

# Hairy — Task Router

Decide qué cargar según la tarea. Carga solo lo necesario.

## Mapa de decisión

| Tarea | Cargar |
|-------|--------|
| Cualquier cambio de UI (leer/editar pantallas, componentes, estilos) | [[hairy-design-system]] (siempre) |
| Pulir, animar, elevar el diseño a nivel mercado, partir de referencias | + [[hairy-ui-craft]] |
| Crear pantalla/feature nueva de diseño | [[hairy-design-system]] + [[hairy-ui-craft]] |
| Agenda / calendario / cualquier pantalla o componente de cita | [[hairy-design-system]] + [[hairy-agenda-rules]] (+ [[hairy-ui-craft]] si se pule) |
| Clientes, equipo/horarios, catálogo de servicios, caja/cobros, features de IA | [[hairy-design-system]] + [[hairy-domain-data]] |
| Configuración (tabs, ajustes) | [[hairy-design-system]] + `docs/brief-configuracion-claude-design.md` |
| Backend / datos / Supabase / multi-tenant | [[hairy-domain-data]] (sección datos y seguridad), credenciales en `CLAUDE.md` |

## Invariantes (aplican siempre)

- Stack Expo/RN + react-native-web (no Next.js). Dark theme. Español. Sin emojis.
- Reutiliza componentes existentes antes de crear nuevos.
- No inventes diseño no definido — pregunta (ver anti-deriva en design-system).
- Multi-tenant: filtra/inserta por `negocio_id`.
