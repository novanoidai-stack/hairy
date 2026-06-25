# ⚖️ ARQUITECTURA FISCAL, CUMPLIMIENTO Y RGPD: PROYECTO MECHA

> **Fecha:** 25 de junio de 2026  
> **Preparado por:** Antigravity (AI Coding & Product Partner)  
> **Destinatarios:** Carlos, Alexandro y José (Product Owner)  
> **Propósito:** Especificar el diseño técnico y legal del software de Mecha para cumplir con las normativas españolas (RGPD, Ley Antifraude 11/2021, VeriFactu) y trazar una línea divisoria clara entre lo que la IA puede implementar automáticamente en código y lo que requiere gestiones manuales del equipo.

---

## 1. División de Tareas: IA Automática vs. Gestión Manual

Para avanzar de forma ordenada y realista, clasificamos el trabajo de cumplimiento legal en dos grupos:

```
                  ┌─────────────────────────────────────────┐
                  │          CUMPLIMIENTO LEGAL             │
                  └────────────────────┬────────────────────┘
                                       ▼
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                                                             ▼
┌───────────────┐                                             ┌───────────────┐
│  IA EN CÓDIGO │                                             │    MANUAL     │
│ (Automático)  │                                             │ (Fundadores)  │
└───────────────┘                                             └───────────────┘
  • Triggers SQL de inmutabilidad                               • Registro de BSP en Meta
  • Encadenamiento de tickets (hash)                            • Carga de DNI/CIF en Twilio
  • URLs firmadas de fotos clientas                             • Registro KYC en Stripe Connect
  • Registro de logs de Consentimiento RGPD                     • Contratación de Fiscalista
```

### A. Tareas que la IA puede implementar automáticamente en el código:
1.  **[HECHO] Inmutabilidad SQL (Anti-fraude):** Bloquear la eliminación física de registros financieros mediante triggers en la base de datos Supabase (Ver [compliance-antifraude-inmutabilidad.sql](file:///c:/Users/carli/OneDrive/Escritorio/novanoidai/Hairy/migrations/compliance-antifraude-inmutabilidad.sql)).
2.  **Cadena de Tickets Inmutables (Pre-VeriFactu):** Generar una función de hashing que enlace cada recibo de cobro con el anterior, impidiendo la manipulación de fechas e importes.
3.  **Protección de Datos Sensibles (RGPD):** Cambiar a privados los buckets de fotos de clientas y generar tokens de acceso temporal (signed URLs) dinámicamente desde el servidor.
4.  **Bitácora de Consentimiento:** Crear una tabla de logs en Supabase para registrar la firma digital del cliente, su dirección IP y el timestamp al aceptar la política de alergias y RGPD.

### B. Tareas manuales que deben realizar los fundadores (Carlos/Alexandro/José):
1.  **KYC de Stripe (Salón):** Cada salón (ej. L'Acanze) debe iniciar sesión en Stripe y subir su DNI de administrador, escrituras del negocio y certificado bancario para poder retirar dinero.
2.  **Meta BSP Registration (Mecha):** Registrar a Mecha como BSP (Business Solution Provider) oficial en Meta para habilitar el *Embedded Signup* de WhatsApp.
3.  **Twilio Regulatory Bundles (Mecha):** Subir la identificación fiscal de la empresa española y comprobante de dirección física local a Twilio para poder comprar números +34.
4.  **Auditoría Fiscal Final (Gestoría):** Contratar a un fiscalista español para que valide el software POS antes de emitir tickets oficiales a Hacienda (POS-3).
5.  **Redacción de Términos y DPA:** Redactar el DPA (Data Processing Agreement) legal en PDF para que los salones firmen digitalmente al contratar Mecha.

---

## 2. Cumplimiento Fiscal Español (Ley Antifraude y VeriFactu)

La **Ley 11/2021 (Medidas de Prevención y Lucha contra el Fraude Fiscal)** prohíbe los softwares de gestión de ventas que permitan ocultar ingresos (los llamados softwares de doble uso).

### A. Inmutabilidad de Cobros (Implementado por la IA en Supabase) [HECHO]
Para evitar que se puedan borrar tickets o alterar importes a fin de mes, se han implementado políticas de seguridad (RLS) y triggers de PostgreSQL en la tabla `cobros` y `cobro_lineas` (ver archivo [compliance-antifraude-inmutabilidad.sql](file:///c:/Users/carli/OneDrive/Escritorio/novanoidai/Hairy/migrations/compliance-antifraude-inmutabilidad.sql)):
*   **Bloqueo de Borrado (DELETE):** Un trigger en `cobros` y `cobro_lineas` impide físicamente cualquier operación `DELETE` devolviendo una excepción del servidor. Se han revocado además las políticas de borrado de RLS.
*   **Bloqueo de Modificación Financiera (UPDATE):** Un trigger en `cobros` impide la modificación de cualquier campo monetario (`total_cents`, `efectivo_cents`, `datafono_cents`, `online_cents`, `propina_cents`, `descuento_cents`), `negocio_id` o `cita_id`.
*   **Correctivas en lugar de borrados:** Si un estilista se equivoca al cobrar una cita, el sistema le obliga a emitir un **"Cobro de Rectificación"** (una fila nueva con importes negativos). El histórico permanece intacto.

### B. Encadenamiento de Registros (Lógica Pre-VeriFactu en BD)
Para que no se puedan inyectar cobros falsos en el pasado, cada cobro se registrará encadenado al anterior mediante una función criptográfica (similar a una cadena de bloques):

```
Fórmula:
hash_actual = SHA256(id_cobro + cobrado_at + total_cents + hash_anterior)
```

#### Estructura propuesta de la tabla en base de datos:
```sql
alter table cobros add column if not exists numero_ticket_secuencial serial;
alter table cobros add column if not exists hash_registro text;
alter table cobros add column if not exists hash_anterior text;

-- Trigger para calcular el hash antes de insertar un cobro
create or replace function public.check_verifactu_hash()
returns trigger as $$
declare
  prev_hash text;
begin
  -- Obtener el hash del último cobro registrado para el negocio
  select hash_registro into prev_hash 
  from public.cobros 
  where negocio_id = new.negocio_id 
  order by numero_ticket_secuencial desc limit 1;
  
  if prev_hash is null then
    prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
  end if;
  
  new.hash_anterior := prev_hash;
  new.hash_registro := encode(digest(
    concat(new.id::text, '|', new.cobrado_at::text, '|', new.total_cents::text, '|', prev_hash),
    'sha256'
  ), 'hex');
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;
```

---

## 3. Privacidad y Datos de Salud del Cliente (RGPD)

El software registra alergias técnicas (de tintes y tratamientos) y fotos del cuero cabelludo/pelo de las clientas de L'Acanze. La Agencia Española de Protección de Datos (AEPD) considera esto **datos de salud** (Art. 9 del RGPD), sometidos a la máxima protección.

### A. Registro de Consentimiento Explícito (En Código)
No basta con marcar una casilla de "Acepto". Ante una inspección, el salón debe demostrar cuándo, desde qué IP y bajo qué términos aceptó la clienta.
*   **Tabla en base de datos `consentimientos_clientes`:**
    ```sql
    create table if not exists consentimientos_clientes (
      id uuid primary key default gen_random_uuid(),
      negocio_id text not null,
      cliente_id uuid not null references clientes(id) on delete cascade,
      tipo_consentimiento text not null check (tipo_consentimiento in ('alergias_salud', 'fotos_imagen', 'marketing')),
      firma_svg text not null, -- Guardar los trazos vectoriales de la firma digital de la tablet
      ip_registro text,
      user_agent text,
      created_at timestamptz not null default now()
    );
    ```

### B. Fotos Privadas de Clientes (En Código)
El bucket de almacenamiento Supabase Storage para fotos de tintes no debe ser público. 
*   **Cambio a Privado:** El bucket `cliente-fotos` se configura como privado.
*   **URLs Firmadas:** En la interfaz de Carlos, la visualización de la galería antes/después llamará a la API de Supabase para obtener una URL de acceso temporal firmada con expiración de 15 minutos (ej. `supabase.storage.from('cliente-fotos').createSignedUrl(path, 900)`). Así, ninguna foto es accesible libremente desde fuera de la sesión de la app.

---

## 4. Consentimiento en Telefonía e IA (Grabaciones)

Dado que la IA de Retell grabará la voz de los clientes llamando por teléfono, debemos cumplir la **Ley General de Telecomunicaciones**.

### A. Diseño de Grabación en Código (Alexandro)
En la configuración del sistema de telefonía (Retell / Twilio), el flujo de entrada de llamadas debe implementar una locución de aviso antes de conectar a la IA de voz:

```
"Para gestionar su cita a través de nuestro asistente inteligente, le informamos que la llamada será grabada. Si continúa en espera, acepta nuestra política de privacidad."
```

---

## 5. Próximos Pasos en el Repositorio

*   **[HECHO] Paso 1 (IA):** Crear los scripts de migración SQL para habilitar los campos de hash inmutable en la tabla `cobros` y la tabla `consentimientos_clientes`. (Triggers de inmutabilidad implementados en [compliance-antifraude-inmutabilidad.sql](file:///c:/Users/carli/OneDrive/Escritorio/novanoidai/Hairy/migrations/compliance-antifraude-inmutabilidad.sql)).
*   **Paso 2 (Carlos):** Cablear el componente de firma en el portal y en la ficha de cliente para registrar los consentimientos en la nueva tabla.
*   **Paso 3 (Alexandro):** Cambiar a privada la lectura de Supabase Storage para las imágenes y generar URLs firmadas.
*   **Paso 4 (Fundadores):** Completar los registros manuales requeridos con Meta, Twilio y Stripe para poder pasar la app a producción.
