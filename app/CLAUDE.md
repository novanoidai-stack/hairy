# CLAUDE.md — Hairy Project

## Documentos de referencia — LEER SIEMPRE ANTES DE TRABAJAR

Antes de cualquier tarea en Hairy, leer ambos documentos. Sin excepción, lo diga el usuario o no.

| Documento | Ruta |
|-----------|------|
| Dossier de Requisitos Innegociables | `C:\Users\alexa\Desktop\Projects\Documentacion\` (buscar archivo con "dossier" o "requisitos" en el nombre) |
| Documento Modular 1 — Agenda | `C:\Users\alexa\Desktop\Projects\Documentacion\documento-modular-1-agenda.docx` |

El dossier define el alcance mínimo de v1. El documento modular define cómo debe funcionar la agenda en detalle (reglas de negocio, casos de uso, tiempos muertos productivos, servicios encadenados).

---

## Credenciales de Infraestructura

### Supabase (Hairy)
- **Project URL:** `https://vtrggiogjrhqtwbhbgia.supabase.co`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8`
- **Service Role Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc1NzI5NSwiZXhwIjoyMDkyMzMzMjk1fQ.5ejE9ktV7edy2jC4uaDbBvmj34_yPn8wscX6JGDSTZ4`

⚠️ **IMPORTANTE:** NO usar el Supabase de Novanoid para este proyecto.

---

## Reglas de seguridad — SIEMPRE

- Todo SELECT debe filtrar por `.eq('negocio_id', profile.negocio_id)`
- Todo INSERT debe incluir `negocio_id: negocioId`
- Cada usuario ve SOLO su propia información

---

## Estilo de código

- Sin emojis en ningún archivo del proyecto: ni en JSX, ni en strings, ni en comentarios. Nunca.

---

## Workflow

**Antes de ejecutar cualquier acción** (escribir código, modificar archivos, etc.):
1. Leer los documentos de referencia de arriba.
2. Explica qué vas a hacer y por qué.
3. Espera confirmación explícita del usuario.
4. Solo entonces ejecuta.

Excepciones: Lecturas puras (SELECT, git status/log/diff, leer archivos de memoria).
