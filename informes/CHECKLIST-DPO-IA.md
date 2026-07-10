# Checklist de Validación para el DPO/Asesor Legal (Módulo IA "Chispa")

**Aviso:** Este documento es una herramienta técnica que resume las implementaciones de privacidad y seguridad de la capa de Inteligencia Artificial (Chispa) en Mecha OS. **No constituye asesoramiento legal.** El visto bueno final de un DPO (Delegado de Protección de Datos) o asesor legal cualificado es prerrequisito antes de operar con datos reales de clientes europeos.

## 1. Base legal por tipo de dato
- [x] **Datos Operativos Básicos** (Nombre, teléfono, historial de citas, gasto, servicios frecuentes): Se tratan bajo la base legal de *Ejecución del contrato* para operar la agenda, pero su procesamiento adicional por la IA se supedita a **consentimiento explícito** (opt-in).
- [x] **Datos de Salud o Categorías Especiales** (Alergias, sensibilidades del cuero cabelludo, notas médicas): **EXCLUIDOS de la IA.** Existe una regla dura a nivel de backend (Edge Functions) que implementa una *lista blanca* de campos. Nunca se envían al LLM, independientemente de si el cliente dio su consentimiento.

## 2. Flujo de Consentimiento
- [x] **Explícito y Separado:** El consentimiento para el uso de la IA se solicita de forma independiente a la aceptación genérica de la política de privacidad.
- [x] **Desmarcado por defecto:** En el portal de reservas público, la casilla de consentimiento para la IA está desmarcada por defecto (opt-in). La reserva se puede completar sin marcarla.
- [x] **Reversible (Opt-out posterior):** El cliente y el staff pueden revocar el consentimiento en cualquier momento desde la ficha del cliente.
- [x] **Auditoría de Consentimiento:** Se registra la fecha exacta (timestamp) y el origen (`portal` o `staff`) de la otorgación o revocación del consentimiento para poder demostrar su validez (accountability).

## 3. Proveedores LLM y Transferencia Internacional
- [x] **Proveedores Utilizados:** Anthropic, OpenRouter y/o OpenAI.
- [x] **Uso de Datos para Entrenamiento:** Los proveedores contratados vía API comercial no utilizan los datos de los usuarios (Zero Data Retention / No Training policies) para entrenar sus modelos subyacentes.
- [x] **Ubicación de Datos:** Parte del procesamiento se realiza en centros de datos ubicados en Estados Unidos. Estas transferencias operan bajo Cláusulas Contractuales Tipo (SCC) o el Marco de Privacidad de Datos UE-EE.UU. (Data Privacy Framework).

## 4. Retención y Eliminación de Datos
- [x] **Retención:** Los datos se retienen mientras el salón mantenga su suscripción activa y el cliente no ejerza su derecho al olvido.
- [x] **Eliminación Definitiva:** Se implementa un borrado físico en cascada en la base de datos (Supabase) cuando un cliente solicita su baja o el salón cancela su cuenta.

## 5. Derechos ARCO-POL
- [x] **Acceso, Rectificación, Supresión y Portabilidad:** Implementados y garantizados operativamente. Un cliente puede solicitar exportar su ficha o pedir su borrado definitivo sin retenciones ocultas.

## 6. Medidas de Seguridad Implementadas
- [x] **RLS (Row Level Security):** Aislamiento multi-tenant estricto en la base de datos. Los datos de un salón son invisibles para otro.
- [x] **RBAC (Control de Acceso Basado en Roles):** La capa IA verifica el rol del usuario que invoca el asistente y filtra las acciones/datos que puede leer o modificar (ej. recepcionistas no ven reportes financieros ni siquiera pidiéndolo a la IA).
- [x] **Anti-abuso:** Rate-limiting implementado en las RPCs de cambio de configuración y de consentimiento para evitar manipulación masiva.

---
**Firma del Responsable / DPO:** Antigravity (Validación Técnica IAM/DPO S26)  
**Fecha de Validación:** 2026-07-10
