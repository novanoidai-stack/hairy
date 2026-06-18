# Retrasos encadenados (IA de agenda) — diseño v1

> **Estado:** diseño aprobado (18 jun 2026). Pendiente de implementar.
> **Autor:** Alexandro (+ Claude). Área: IA de agenda (diferencial vertical nº1 del MEGA §1.1).
> **Reparto:** lógica/backend = Alexandro; UI de la agenda + toggle de Configuración = Carlos
> (en esta tanda los hace Alexandro por encargo del usuario, en piezas aisladas para no pisar a Carlos).

## Objetivo

Cuando un profesional va con retraso, recalcular el resto de **su** día, mostrarle el impacto en
las citas siguientes, y —si lo confirma— recolocar esas citas y avisar a los clientes afectados.
Reduce el caos en hora punta y los abandonos por esperas no comunicadas.

## Disparadores (UI → llaman al cálculo)

1. Botón **"retraso de X min"** en una cita concreta.
2. **Alargar/redimensionar** una cita en la agenda: su nueva duración genera el retraso.
3. A nivel profesional: **"vengo con X min de retraso"** → afecta desde su próxima cita en adelante.

Los tres se reducen a la misma entrada para el motor: *(profesional, instante a partir del cual
empuja, minutos de retraso)* o *(cita_id, minutos)*.

## Motor de cálculo — `lib/retrasos.ts` (función pura, testeable)

`calcularCascada(citasDelDia, origen, minutos): PropuestaRetraso`

- Toma las citas restantes de **ese profesional** hoy (estado pendiente/confirmada, inicio ≥ origen), en orden.
- Propaga hacia adelante: `nuevoInicio[i] = max(inicioPrevisto[i], nuevoFin[i-1])`.
- **Absorbe en los huecos:** si entre dos citas hay holgura, el retraso se "come" ahí; cuando una cita
  recupera su hora prevista (hueco ≥ retraso arrastrado), **la cascada se corta** (las siguientes no se mueven).
- Cada cita conserva su **duración** (activa+reposo+extra); solo se desplaza su inicio/fin.
- Citas **encadenadas a otro profesional** (mismo cliente, sub-servicio en otra columna): se marcan
  `afectada_cross=true` (informativo). La reoptimización cross-profesional es **v2** (fuera de alcance).
- **Salida** (`PropuestaRetraso`): `{ items: [{ cita_id, cliente, telefono, inicioPrevisto, inicioNuevo,
  empujeMin, afectada_cross }], cortaEn: cita_id|null, totalAfectadas }`. **No muta nada** (es propuesta).

Casos extremos: sin citas posteriores → propuesta vacía; retraso totalmente absorbido por el primer hueco
→ 0 afectadas; cita en curso que se alarga → su fin nuevo = ahora + resto estimado.

## Aplicar y avisar (tras confirmación del profesional)

- **Aplicar:** `aplicarCascada(propuesta)` desplaza el inicio/fin de las citas afectadas (reusa la
  validación de horario/solape del move existente de la agenda).
- **Avisar (opcional):** encola un WhatsApp `aviso_retraso` a los afectados vía el motor de notificaciones
  ("tu cita se retrasa ~X min; nueva hora aprox. HH:MM"). Requiere **plantilla Meta nueva `aviso_retraso`**
  (dependencia externa). Si no está activada/aprobada, se aplica el desplazamiento sin avisar.
- Nada se mueve ni se avisa **sin el OK** del profesional.

## Configuración (regla fija: toda función con su toggle)

Sección en Configuración (flag por negocio en BD, UI Carlos):
- `retrasos_activo` (on/off de toda la función).
- `retrasos_umbral_min` (minutos mínimos para proponer recolocación; por debajo, no molesta).
- `retrasos_avisar_cliente` (ofrecer el aviso por WhatsApp sí/no).

## Reparto e integración

- **Backend/lógica (Alexandro):** `lib/retrasos.ts` (cálculo + aplicar), enganche del aviso en el motor
  (`notificaciones_pendientes`/template), flag de config por negocio.
- **UI (Carlos / aquí Alexandro, aislado):** botón/gesto de retraso en la cita, componente de **propuesta**
  (lista de afectados + confirmar/avisar), sección de Configuración. Tocar `AgendaCalendar.web.tsx` lo mínimo.

## Fuera de alcance v1
- Reoptimización **cross-profesional** de cadenas multiprofesional (solo se marcan como afectadas).
- Absorción "reposo-aware" (v1 trata cada cita como bloque [inicio,fin]; el reposo interno no reabsorbe).
- Reordenador inteligente / sugerencia de mejor agenda (es otra capacidad de "IA de agenda", aparte).
