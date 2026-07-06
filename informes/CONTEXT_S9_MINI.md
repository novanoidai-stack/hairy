# Contexto MINIMO Sesion 9 — Superficies por pagina

> Version ultra-ligera para evitar quedarse sin contexto. Solo lo esencial.

## 1. Que es Chispa

Asistente IA transversal de Mecha. Responde con BLOQUES interactivos (texto, accion, enlace).
El LLM NUNCA ejecuta escrituras directamente; solo propone -> usuario confirma -> se ejecuta.

## 2. Arquitectura existente (NO reconstruir)

- `lib/chispaBloques.ts`: tipos de bloque
- `components/chispa/BloqueRenderer.web.tsx`: renderiza cada tipo
- `lib/chispaOps.ts`: ejecutor general (crear_presupuesto, enviar_mensaje_bandeja, etc.)
- `supabase/functions/agenda-asistente/`: edge con LLM tool-use

## 3. Reglas

- **PR-12:** IA propone, usuario confirma. El LLM nunca ejecuta escrituras.
- **Alexandro = envios reales:** WhatsApp/publicar = tarea de Alexandro. Deja borradores/flags.
- **Multi-tenant:** todo con negocio_id
- **Sin any:** TypeScript estricto

## 4. Division de S9

**S9-A1:** Resenas + Bandeja
**S9-A2:** Mi Jornada + Upsell
**S9-B1:** Presupuestos + Inventario
**S9-B2:** Equipo + Recompra

## 5. Protocolo de cierre

1. `npm run build:web` + `npx tsc --noEmit`
2. Verifica en demo: `/demo.html?share/1`
3. Commit + push master
4. Actualiza MEGA_INFORME + PLAN-IA-CHISPA.md
