import { supabase } from '@/lib/supabase';

// Depositos dinamicos en reservas del staff (Entregable 2).
// Si el salon tiene `depositoStaffExigir` activo y el cliente elegido debe senal (segun su
// perfil de riesgo, via deposito_dinamico_cents), pregunta al profesional si quiere pedirla.
// Devuelve los campos a fusionar en el insert de la cita para dejarla pendiente de senal,
// o null si no aplica / el profesional decide confirmarla sin senal.
export interface SenalStaffOverrides {
  estado: 'pendiente';
  deposito_requerido: true;
  deposito_importe: number; // euros
  senal_enviada: false;
}

export async function resolverSenalStaff(
  negocioId: string,
  clienteId: string | null | undefined,
  servicioId: string | null | undefined,
): Promise<SenalStaffOverrides | null> {
  if (!clienteId || !servicioId) return null;

  const { data: cfg } = await supabase
    .from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
  if (!cfg?.config?.depositoStaffExigir) return null;

  const { data: cents } = await supabase.rpc('deposito_dinamico_cents', {
    p_cliente_id: clienteId,
    p_servicio_id: servicioId,
  });
  const c = Number(cents) || 0;
  if (c <= 0) return null;

  const eur = (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const canConfirm = typeof window !== 'undefined' && typeof (window as any).confirm === 'function';
  if (!canConfirm) return null;
  const ok = window.confirm(
    `El perfil de este cliente pide una señal de ${eur} €.\n\n` +
    `Aceptar: crear la cita PENDIENTE de señal (recibirá el enlace de pago por WhatsApp y se confirmará al pagar).\n` +
    `Cancelar: confirmar la cita sin pedir señal.`,
  );
  if (!ok) return null;

  return { estado: 'pendiente', deposito_requerido: true, deposito_importe: c / 100, senal_enviada: false };
}
