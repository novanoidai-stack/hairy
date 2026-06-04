---
name: hairy-agenda-rules
description: Reglas de negocio de la AGENDA de Hairy destiladas del Documento Modular 1 (la parte mas compleja del producto y la que mas condiciona la UI). Estados de cita, fases activa/reposo/transicion, tiempos muertos productivos, servicios encadenados multiprofesional, reorganizaciones y bloqueos. Cargar antes de tocar cualquier pantalla o componente de agenda/calendario/cita.
---

# Hairy — Reglas de Agenda (implicaciones para la UI)

Fuente canonica: `hairy/docs/socio/documento-modular-1-agenda.pdf` (~112 reglas RN-AG, casos CU-AG, casos extremos CE-AG). En contradiccion, el Modular 1 manda sobre el Dossier. Esto NO es backend: cada regla aqui tiene consecuencia visual o de interaccion. Releer el PDF para el detalle fino de una regla concreta.

## Conceptos base

- **Slot** = 15 min por defecto. La rejilla temporal de la agenda se dibuja en slots.
- Una cita ocupa uno o varios slots de uno o varios profesionales.
- **Origen de la cita**: puede crearla un profesional/recepcion a mano O la capa de IA (agente de voz / chat). Ver [[project-hairy-voice-agent]]. La UI deberia poder distinguir origen IA vs manual.

## Fases de un servicio (el diferencial visual nº1)

Un servicio no es un bloque macizo. Tiene fases:
- **Activa**: el profesional esta trabajando sobre el cliente (ocupado de verdad).
- **Reposo**: algo actua solo (tinte, decoloracion, permanente). El cliente esta, pero el profesional queda LIBRE.
- **Transicion**: paso entre fases (lavar, preparar).

**Implicacion UI critica:** los slots de reposo deben renderizarse visualmente distintos de los activos (color/patron/opacidad diferente), porque sobre ese hueco se puede encajar otra cita. Un bloque de cita puede verse "partido" en activa-reposo-activa.

## Tiempos muertos productivos (diferencial nº1)

Durante el reposo de un cliente, el profesional puede atender a otro. La agenda debe:
- Mostrar el hueco de reposo como aprovechable, no como ocupado.
- Permitir asignar una segunda cita encajada en ese hueco.
- Avisar/validar solapamientos reales (fase activa contra fase activa) vs solapamientos permitidos (activa de uno sobre reposo de otro).

## Servicios encadenados multiprofesional (diferencial nº2)

Un cliente pasa por varios profesionales en secuencia (ej. corte con A → color con B). La UI debe:
- Representar la cadena como una sola cita-cliente repartida entre columnas/profesionales.
- Mantener la continuidad temporal entre sub-servicios.
- Permitir reordenar/reasignar sin romper la cadena.

## Estados de cita (maquina de estados — afecta color y acciones)

Propuesta → Confirmada → En curso → Finalizada → Cobrada. Ramas: Cancelada, No presentada, Interrumpida, Historica.

**Implicacion UI:** cada estado tiene su tratamiento visual (ver `STATUS_META` en `designTokens.ts`) y su set de acciones disponibles. La transicion de estado (ej. confirmada→en curso) deberia tener feedback animado (cambio de color con intencion, ver [[hairy-ui-craft]]). No inventes estados ni colores nuevos: usa los definidos.

## Reorganizaciones, bloqueos y excepciones

- **Drag&drop**: mover/redimensionar citas debe revalidar solapamientos y horarios del profesional en tiempo real, con feedback fisico (sombra de arrastre, snap a slot).
- **Bloqueos**: huecos no reservables (descanso, ausencia, formacion). Distintos visualmente de citas reales.
- **Excepciones de horario**: un profesional puede tener un horario distinto un dia concreto; la columna debe reflejarlo (zonas fuera de turno atenuadas/no dropables).
- **Linea AHORA**: marcador temporal en vivo, pulsante (ver micro-interacciones en [[hairy-ui-craft]]).

## Vistas, filtros y busqueda

La agenda tiene varias vistas (dia/semana, por profesional, por recurso) y filtros. Mantener densidad de informacion alta sin perder legibilidad (principio: invisible en hora punta, velocidad > belleza, ≤3 toques).

## Antes de dar por hecha una pantalla de agenda

- [ ] Fases activa/reposo/transicion diferenciadas visualmente.
- [ ] Hueco de reposo se ve aprovechable y permite encajar cita.
- [ ] Cadena multiprofesional legible como una unidad.
- [ ] Cada estado de cita con su color (STATUS_META) y sus acciones.
- [ ] Drag&drop revalida solapamientos/horarios con feedback.
- [ ] Bloqueos y fuera-de-turno claramente distintos de citas.
- [ ] Linea AHORA presente.
- [ ] Origen IA vs manual distinguible si aplica.
- [ ] ≤3 toques para la accion comun (crear/mover cita).

Relacionado: [[hairy-design-system]], [[hairy-ui-craft]], [[hairy-domain-data]], router en [[hairy-design-router]].
