# Control horario / registro de jornada — implementación (9 ago 2026)

Carlos + Claude. Estado: **desplegado en producción** (BD verificada, bundle web
compilando, flujo probado de punta a punta contra el tenant de pruebas).

---

## 1. Qué pide la ley española

**Norma vigente:** art. 34.9 del Estatuto de los Trabajadores, en la redacción del
**Real Decreto-ley 8/2019**. Obliga desde el 12 de mayo de 2019 a toda empresa con
personal por cuenta ajena a llevar un **registro diario de jornada** con el horario
concreto de inicio y finalización de cada persona, a **conservarlo cuatro años** y a
tenerlo **a disposición de la persona trabajadora, de su representación legal y de la
Inspección de Trabajo**. No especifica requisitos técnicos: ahí está el agujero que
tapa el RD en tramitación.

**Norma en tramitación (a fecha de hoy NO publicada en el BOE):** proyecto de Real
Decreto de registro de jornada. Tramitación urgente aprobada en septiembre de 2025;
informe crítico del Consejo de Estado el 23 de marzo de 2026 (impacto económico,
encaje jurídico y protección de datos). Lo que exige el borrador:

| Requisito del borrador | Cómo lo cumple Mecha |
|---|---|
| Registro **digital obligatorio** (fuera papel y Excel) | Tabla `fichajes` + RPC `fichar_jornada` |
| **Identificación exacta** de la persona trabajadora | `profesional_id` obligatorio (antes era opcional y venía nulo en el 99 % de los asientos) |
| **Inalterabilidad e integridad** | Triggers que prohíben `UPDATE`/`DELETE` + cadena SHA-256 encadenada por negocio |
| **Trazabilidad** de cualquier cambio: quién, cuándo, por qué | Tabla `jornada_correcciones`, indeleble |
| Cambios con **autorización de empresa Y persona trabajadora**, con constancia de discrepancias | Doble conformidad en `resolver_correccion_jornada`, campo `discrepancia` |
| **Pausas no computables** como trabajo efectivo | `pausa_inicio` / `pausa_fin`, excluidas de `minutos` de trabajo |
| Diferenciar **presencial y remoto** | Campo `modalidad` |
| **Totalización diaria y mensual** | `jornada_totales()` |
| **Conservación 4 años** y disponibilidad permanente | Sin purga (ver `gdpr-anonimizacion-y-retencion.sql`) |
| **Acceso y copia inmediata** por la persona trabajadora | "Mi jornada → Registro": consulta y descarga PDF/CSV sin pedir permiso a nadie |
| Acceso de la **Inspección** | Informe PDF con detalle de asientos y huella de integridad |
| **Resumen mensual** con el recibo de salarios | PDF por persona y periodo |
| **Sin biometría** (prohibida salvo excepción) | No se implementa |
| Geolocalización solo puntual y justificada (AEPD) | No se implementa |

---

## 2. Qué había antes

- `fichajes` con cinco campos útiles: `tipo`, `marcado_at`, `negocio_id`, `user_id`,
  `profesional_id` **nulo en 341 de 343 asientos**.
- Hora puesta por `now()` de Postgres pero **insertada directamente desde el cliente**
  (`supabase.from('fichajes').insert`), con políticas RLS que permitían `UPDATE` y
  `DELETE` a cualquiera del negocio. Es decir: cualquiera podía reescribir sus horas.
- **Ninguna pantalla para consultar ni descargar el registro.** Ni el trabajador ni la
  empresa podían sacar las entradas y salidas. Informes no tenía nada de control horario.
- `mi_jornada_resumen` calculaba las horas por `user_id`: en un salón con acceso
  compartido (un correo para todos) **a cada persona se le sumaban las horas de las demás**,
  y las pausas contaban como trabajo.

---

## 3. Qué se ha hecho

### Base de datos (`migrations/control-horario-legal.sql`)
- `fichajes` amplía: `modalidad`, `origen`, `dispositivo`, `ip`, `estado`,
  `anulado_at/por`, `corrige_a`, `correccion_id`, `secuencia`, `hash`, `hash_anterior`.
- **Backfill**: los 343 asientos históricos quedan con `profesional_id` resuelto (0 nulos)
  y sellados con la cadena de hash.
- Trigger `fichajes_sellar` (numeración correlativa por negocio + SHA-256 encadenado).
- Triggers `fichajes_bloquear_cambios`: `DELETE` siempre prohibido; `UPDATE` solo desde
  la RPC de correcciones y solo para anular. **Probado: bloquea incluso con la clave de
  servicio** (que se salta RLS).
- RLS: se retiran `UPDATE`/`DELETE` del cliente; el `INSERT` directo exige `user_id =
  auth.uid()` y `marcado_at` dentro de ±2 minutos de `now()` (antirretroactividad).
- Tabla `jornada_correcciones` con doble conformidad, indeleble.
- `jornada_config()`: ajustes por salón en `negocio_config.config`.

### RPCs (`migrations/control-horario-rpcs.sql`)
`jornada_contexto`, `jornada_tramos`, `fichar_jornada`, `jornada_estado`,
`jornada_totales`, `jornada_registro`, `solicitar_correccion_jornada`,
`resolver_correccion_jornada`, `listar_correcciones_jornada`,
`jornada_verificar_integridad`.

Reglas duras que impone el servidor (no la UI): hora del servidor, secuencia coherente
(no dos entradas seguidas, no pausa sin estar trabajando), y alcance —un empleado solo
ve lo suyo aunque pida el centro entero—.

También se corrige `mi_jornada_resumen`: las horas salen ya de `jornada_tramos` por
`profesional_id` y descontando pausas.

### Aplicación
- `lib/jornada.ts` — única capa de acceso a las RPC + formato + filas para CSV.
- `lib/jornadaPdf.web.ts` — informe PDF (totalización diaria, resumen, detalle de
  asientos con huella, pie legal). Stub nativo en `lib/jornadaPdf.ts`.
- `components/jornada/RegistroJornada.web.tsx` — panel reutilizable: navegación por mes,
  totales, tabla diaria, asientos, solicitud y aprobación de correcciones, verificación
  de integridad, descargas.
- **Mi jornada**: pestaña "Registro" con el registro propio; selector presencial/remoto
  al fichar; el fichaje pasa por la RPC.
- **Informes → Control horario**: `components/informes/ControlHorarioSection.web.tsx`,
  vista de empresa con filtro por persona.
- **Configuración → Control horario**: recordar fichar, exigir fichar, jornada semanal,
  zona horaria.
- `components/jornada/GateFichaje.web.tsx` — aviso (o bloqueo si el salón lo activa) al
  entrar sin haber fichado. **Desactivado de fábrica.**
- Manuales de mi-jornada, informes y configuración actualizados.
- Edge `agenda-asistente`: `consultar_fichajes` ya filtra anulados y nombra bien las pausas.

---

## 4. Decisión de producto: ¿bloquear la app si no fichas?

**La ley no lo exige.** El art. 34.9 obliga a *registrar* la jornada, no a que el software
se bloquee. Por eso hay tres niveles y el de fábrica es el más suave:

1. **Nada** (por defecto): fichas cuando quieras desde Mi jornada.
2. **Recordar fichar al entrar**: aviso arriba, no estorba.
3. **Exigir fichar para trabajar**: pantalla completa hasta fichar.

En el nivel 3 **nunca** se tapa "Mi jornada": el derecho a consultar y obtener copia del
propio registro es inmediato y no se puede condicionar a nada.

---

## 5. Verificado

- Migraciones aplicadas en `vtrggiogjrhqtwbhbgia`; 343 asientos con hash y secuencia,
  0 sin `profesional_id`, cadena íntegra en los 3 negocios con datos.
- `UPDATE` y `DELETE` directos bloqueados (probado con clave de servicio).
- Flujo de corrección completo: solicitud → autorización → asiento nuevo encadenado →
  la incidencia del 3 de julio desaparece y la cadena sigue íntegra (319 asientos).
- `npx tsc --noEmit`: limpio. `expo export -p web`: compila (jornadaPdf sale en su
  propio chunk, la carga diferida funciona).
- E2E en navegador con cuenta real (`chispa.test.s18@mecha.app`): fichar entrada → pausa
  → reanudar → salida; la tabla diaria y los asientos numerados salen correctos.

Bugs encontrados y corregidos durante la verificación:
- `fmtHoras` devolvía "60m" cuando el reloj del navegador iba un segundo por detrás del
  servidor (tramo negativo). Ahora se clampa y 0,999 h se muestra como "1h".
- "Agosto De 2026" (CSS `capitalize` sobre "agosto de 2026") → solo la inicial.
- El registro no se recargaba al fichar en la misma pantalla → `recargarToken`.
- `dias_trabajados` contaba días con una entrada huérfana y 0 minutos.

---

## 6. Pendiente / avisos

- **Esto no es asesoramiento jurídico.** Antes de venderlo como "100 % legal" conviene
  que lo revise un laboralista, sobre todo el encaje con el convenio de peluquerías
  (jornada semanal, descansos obligatorios) y el registro de horas extra.
- **El RD sigue en tramitación.** Se ha implementado el escenario exigente del borrador
  para no rehacerlo, pero el texto puede cambiar antes del BOE. Revisar al publicarse.
- **Representación legal de los trabajadores**: la ley les da derecho de acceso al
  registro. Hoy no existe un rol "representante sindical" en Mecha; se cubre de facto
  entregándoles el PDF. Si algún salón lo necesita, hay que crear el rol.
- **Horas extra y límites de jornada**: Mecha registra y totaliza, pero no avisa de
  exceso de jornada ni de descanso mínimo entre turnos (12 h) ni del descanso semanal.
  Es el siguiente paso natural.
- **Nativo (móvil)**: el registro y el PDF son solo web por ahora; el stub nativo lanza
  un error claro. Fichar sí funciona en nativo (la RPC es la misma).
- **Un asiento de prueba en `nose_03801`**: durante la verificación se autorizó una
  corrección real (salida del 3 de julio de Carlos Ocaña, sobre datos sembrados). Por
  diseño no se puede borrar; queda como corrección trazada.
- **Landing**: se ha quitado "Powered by ElevaScore" y "gracias a nuestra colaboración
  con ElevaScore" de `web/index.html` porque no hay ninguna integración con ElevaScore
  en el código y ahora el control horario es nativo. Si esa colaboración existe de
  verdad, hay que reponerlo (y conectarlo).
