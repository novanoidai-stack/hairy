// Suscripcion de Mecha en Ajustes > Cuenta (P0-001).
//
// Es lo que el SALON le paga a Mecha, no lo que el salon le cobra a sus clientas.
// Va SIEMPRE por la cuenta Stripe de plataforma: la pasarela propia del salon
// (Ajustes > Politicas) no pinta nada aqui.
//
// Solo el propietario contrata. El plan del salon se lee de la fila del owner
// (plan_del_negocio) y el equipo lo hereda, asi que una suscripcion sellada en la
// fila de un admin dejaria al salon entero sin plan.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { Section, FieldRow, Badge, Btn, StatBox } from '@/components/ui/SettingsAtoms';
import {
  PLAN_LABEL, PLAN_PRECIO_EUR, PLANES_CONTRATABLES, PLAN_FUNCIONES, FUNCION_LABEL,
  planDe, type Plan,
} from '@/lib/planes';

const T = DESIGN_TOKENS;

interface EstadoCuenta {
  plan: string | null;
  suscripcion_estado: string | null;
  trial_ends_at: string | null;
  periodo_fin: string | null;
}

// Lo que anade Estudio sobre Esencial, sacado de la tabla de planes para que no
// se desincronice si alguien mueve una funcion de sitio.
const EXTRAS_ESTUDIO = [...PLAN_FUNCIONES.estudio].filter((f) => !PLAN_FUNCIONES.esencial.has(f));

const RESUMEN_PLAN: Record<string, string> = {
  esencial: 'Agenda, fichas de cliente, portal de reserva, recordatorios, caja, informes y equipo.',
  estudio: `Todo lo de Esencial, mas ${EXTRAS_ESTUDIO.map((f) => FUNCION_LABEL[f]).join(', ')}.`,
};

const ESTADO_BADGE: Record<string, { tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'; texto: string }> = {
  prueba: { tone: 'primary', texto: 'Mes de prueba' },
  activa: { tone: 'success', texto: 'Activa' },
  pago_pendiente: { tone: 'warning', texto: 'Pago pendiente' },
  impagada: { tone: 'danger', texto: 'Impagada' },
  cancelada: { tone: 'neutral', texto: 'Cancelada' },
  pausada: { tone: 'neutral', texto: 'Pausada' },
  caducada: { tone: 'danger', texto: 'Prueba terminada' },
};

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '--';

const diasHasta = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
};

export function SeccionSuscripcion({ userId, role }: { userId: string; role: string }) {
  const { isMobile } = useResponsive();
  const demo = IS_DEMO_MODE;
  const esOwner = role === 'owner';

  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [yendoA, setYendoA] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Aviso de vuelta del checkout (?suscripcion=ok|cancelado en el success_url).
  const [vuelta, setVuelta] = useState<'ok' | 'cancelado' | null>(null);

  const leer = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from('profiles')
      .select('plan, suscripcion_estado, trial_ends_at, periodo_fin')
      .eq('id', userId)
      .maybeSingle();
    setEstado((data as EstadoCuenta) ?? null);
    return (data as EstadoCuenta) ?? null;
  }, [userId]);

  useEffect(() => {
    void leer().finally(() => setCargando(false));
  }, [leer]);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('suscripcion');
    if (param !== 'ok' && param !== 'cancelado') return;
    setVuelta(param);
    // Se limpia la URL para que un refresco no vuelva a enseñar el aviso.
    const limpia = new URL(window.location.href);
    limpia.searchParams.delete('suscripcion');
    window.history.replaceState({}, '', limpia.toString());
    if (param !== 'ok') return;
    // El webhook tarda un instante en llegar: se reintenta en vez de enseñar el
    // estado viejo justo despues de pagar.
    let intentos = 0;
    const t = setInterval(async () => {
      intentos += 1;
      const fresco = await leer();
      if (fresco?.suscripcion_estado === 'activa' || intentos >= 5) clearInterval(t);
    }, 2000);
    return () => clearInterval(t);
  }, [leer]);

  const planActual: Plan = planDe(estado);
  const est = estado?.suscripcion_estado ?? null;
  const badge = est ? ESTADO_BADGE[est] : null;
  const diasPrueba = est === 'prueba' ? diasHasta(estado?.trial_ends_at ?? null) : null;
  const tieneSuscripcionStripe = est === 'activa' || est === 'pago_pendiente' || est === 'impagada' || est === 'pausada';

  const contratar = useCallback(async (plan: Plan) => {
    if (demo || !esOwner) return;
    setError(''); setYendoA(plan);
    const { data, error: err } = await supabase.functions.invoke('crear-checkout-suscripcion', {
      body: { plan },
    });
    const url = (data as { url?: string } | null)?.url;
    if (err || !url) {
      setYendoA(null);
      setError('No se pudo abrir el pago. Vuelve a intentarlo o escribe a soporte.');
      return;
    }
    window.location.href = url;
  }, [demo, esOwner]);

  const gestionar = useCallback(async () => {
    if (demo || !esOwner) return;
    setError(''); setYendoA('portal');
    const { data, error: err } = await supabase.functions.invoke('portal-suscripcion', { body: {} });
    const url = (data as { url?: string } | null)?.url;
    if (err || !url) {
      setYendoA(null);
      setError('No se pudo abrir la gestion de la suscripcion. Escribe a soporte.');
      return;
    }
    window.location.href = url;
  }, [demo, esOwner]);

  const descripcion = useMemo(() => {
    if (!esOwner) return 'El plan del salon lo contrata y gestiona el propietario.';
    return 'Tu plan de Mecha, la facturacion y la baja. Sin permanencia: puedes cancelar cuando quieras y el plan sigue activo hasta el final del periodo pagado.';
  }, [esOwner]);

  return (
    <Section title="Tu plan de Mecha" desc={descripcion}>
      {vuelta === 'ok' && (
        <div style={{
          fontSize: 12.5, color: T.success, background: 'rgba(16,185,129,0.10)',
          border: '1px solid rgba(16,185,129,0.28)', borderRadius: 9, padding: '9px 12px', marginBottom: 10,
        }}>
          Pago recibido. En cuanto Stripe nos lo confirme veras el plan activo aqui mismo.
        </div>
      )}
      {vuelta === 'cancelado' && (
        <div style={{
          fontSize: 12.5, color: T.textTertiary, background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 12px', marginBottom: 10,
        }}>
          No se ha completado el pago y no se te ha cobrado nada.
        </div>
      )}
      {demo && (
        <div style={{
          fontSize: 12.5, color: T.textTertiary, background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 12px', marginBottom: 10,
        }}>
          Estas en la demo compartida: aqui no se contrata nada.
        </div>
      )}

      <FieldRow label="Estado" hint="Como esta hoy la suscripcion de tu salon.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {cargando
            ? <span style={{ fontSize: 12.5, color: T.textTertiary }}>Cargando...</span>
            : badge
              ? <Badge tone={badge.tone}>{badge.texto}</Badge>
              : <Badge tone="neutral">Sin plan contratado</Badge>}
          {!cargando && planActual !== 'free' && <Badge tone="neutral">{PLAN_LABEL[planActual]}</Badge>}
        </div>
      </FieldRow>

      {diasPrueba !== null && (
        <div style={{ marginTop: 4, marginBottom: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 170}px, 1fr))`, gap: 12 }}>
            <StatBox
              label="Te quedan"
              value={`${diasPrueba} ${diasPrueba === 1 ? 'dia' : 'dias'}`}
              sub={`La prueba termina el ${fecha(estado?.trial_ends_at ?? null)}`}
              accent={diasPrueba <= 7 ? T.danger : undefined}
            />
          </div>
        </div>
      )}

      {est === 'activa' && (
        <FieldRow label="Proxima renovacion" hint="Se cobra automaticamente en esa fecha.">
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{fecha(estado?.periodo_fin ?? null)}</span>
        </FieldRow>
      )}

      {(est === 'pago_pendiente' || est === 'impagada') && (
        <div style={{
          fontSize: 12.5, color: T.danger, background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.24)', borderRadius: 9, padding: '9px 12px', margin: '8px 0',
        }}>
          Hay un recibo sin cobrar. Revisa la tarjeta desde Gestionar suscripcion antes de que
          {est === 'impagada' ? ' recuperemos el acceso al plan.' : ' venza el periodo pagado.'}
        </div>
      )}

      {error ? (
        <div style={{ fontSize: 12, color: T.danger, fontWeight: 600, margin: '6px 0' }}>{error}</div>
      ) : null}

      {/* Ya paga: todo (cambiar de plan, tarjeta, facturas, baja) sale por el portal de Stripe. */}
      {!cargando && esOwner && tieneSuscripcionStripe && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <Btn variant="primary" size="sm" icon="lock" onClick={gestionar} disabled={demo || yendoA === 'portal'}>
            {yendoA === 'portal' ? 'Abriendo...' : 'Gestionar suscripcion'}
          </Btn>
        </div>
      )}

      {/* No paga todavia (prueba, sin plan, caducada o cancelada): puede contratar. */}
      {!cargando && esOwner && !tieneSuscripcionStripe && (
        <div style={{
          display: 'grid', gap: 12, marginTop: 12,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
        }}>
          {PLANES_CONTRATABLES.map((plan) => (
            <div
              key={plan}
              style={{
                border: `1px solid ${plan === 'estudio' ? T.primary : T.border}`,
                borderRadius: 12, padding: 14, background: T.bg,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{PLAN_LABEL[plan]}</span>
                {plan === 'estudio' && <Badge tone="primary">Completo</Badge>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: T.text }}>{PLAN_PRECIO_EUR[plan]} €</span>
                <span style={{ fontSize: 12, color: T.textTertiary, fontWeight: 600 }}>/mes + IVA</span>
              </div>
              <p style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.5, margin: 0, flex: 1 }}>
                {RESUMEN_PLAN[plan]}
              </p>
              <Btn
                variant={plan === 'estudio' ? 'primary' : 'ghost'}
                size="sm"
                icon="check"
                onClick={() => contratar(plan)}
                disabled={demo || yendoA !== null}
              >
                {yendoA === plan ? 'Abriendo el pago...' : `Contratar ${PLAN_LABEL[plan]}`}
              </Btn>
            </div>
          ))}
        </div>
      )}

      {!cargando && esOwner && !tieneSuscripcionStripe && (
        <p style={{ fontSize: 11.5, color: T.textTertiary, margin: '10px 0 0', lineHeight: 1.5 }}>
          Profesionales ilimitados, 0% de comision por cita y sin permanencia. El pago lo procesa
          Stripe: Mecha no guarda ningun dato de tu tarjeta.
        </p>
      )}
    </Section>
  );
}
