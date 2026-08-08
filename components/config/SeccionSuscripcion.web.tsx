// Suscripcion de Mecha en Ajustes > Cuenta (P0-001).
//
// Es lo que el SALON le paga a Mecha, no lo que el salon le cobra a sus clientas.
// Va SIEMPRE por la cuenta Stripe de plataforma: la pasarela propia del salon
// (Ajustes > Politicas) no pinta nada aqui.
//
// Solo el propietario contrata. El plan del salon se lee de la fila del owner
// (plan_del_negocio) y el equipo lo hereda, asi que una suscripcion sellada en la
// fila de un admin dejaria al salon entero sin plan.
//
// Se venden DOS cosas ortogonales: el software (Esencial 39 / Estudio 59, mismas
// funciones) y el addon de IA "Recepcionistas" (19/29/39). Van como dos lineas de
// la misma suscripcion. El addon se puede cambiar despues sin pasar por Stripe.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { Section, FieldRow, Badge, Btn, StatBox, Segmented } from '@/components/ui/SettingsAtoms';
import {
  PLAN_LABEL, PLAN_PRECIO_EUR, PLANES_CONTRATABLES,
  IA_NIVEL_LABEL, IA_PRECIO_EUR, IA_CONTRATABLES,
  planDe, iaNivelDe, type Plan, type IaNivel,
} from '@/lib/planes';

const T = DESIGN_TOKENS;

interface EstadoCuenta {
  plan: string | null;
  ia_nivel: string | null;
  suscripcion_estado: string | null;
  trial_ends_at: string | null;
  periodo_fin: string | null;
}

// Esencial y Estudio dan el MISMO software desde la reestructura del 7 ago 2026:
// la diferencia de precio no gatea nada. La lista canonica de que entra vive en
// SOFTWARE_COMPLETO (lib/planes.ts); esto es el resumen que se enseña.
const RESUMEN_SOFTWARE =
  'Agenda, fichas de cliente, portal de reserva, recordatorios, caja, informes, equipo, '
  + 'señales, campañas, lista de espera y VeriFactu. Profesionales ilimitados.';

const RESUMEN_IA: Record<IaNivel, string> = {
  ninguna: 'Sin asistente de IA. Puedes activarlo cuando quieras.',
  whatsapp: 'Chispa atiende el WhatsApp del salon 24/7, reserva y cobra la señal sola.',
  voz: 'La IA contesta el telefono del salon y da cita hablando.',
  completa: 'WhatsApp y telefono, los dos. Mas barato que contratarlos por separado.',
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

const esFuturo = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();

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
  // Lo que el salon esta eligiendo antes de contratar.
  const [planElegido, setPlanElegido] = useState<Plan>('esencial');
  const [iaElegida, setIaElegida] = useState<IaNivel>('ninguna');
  // Lo que elige para CAMBIAR el addon cuando ya paga.
  const [iaNueva, setIaNueva] = useState<IaNivel | null>(null);

  const leer = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from('profiles')
      .select('plan, ia_nivel, suscripcion_estado, trial_ends_at, periodo_fin')
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
  const iaActual: IaNivel = iaNivelDe(estado);
  const est = estado?.suscripcion_estado ?? null;
  const badge = est ? ESTADO_BADGE[est] : null;
  // La prueba sigue viva aunque ya haya tarjeta: al contratar durante el mes gratis
  // el estado pasa a 'activa' pero no se cobra hasta que trial_ends_at vence.
  const enPrueba = esFuturo(estado?.trial_ends_at ?? null);
  const diasPrueba = enPrueba ? diasHasta(estado?.trial_ends_at ?? null) : null;
  const tieneSuscripcionStripe = est === 'activa' || est === 'pago_pendiente' || est === 'impagada' || est === 'pausada';

  const totalElegido = PLAN_PRECIO_EUR[planElegido] + IA_PRECIO_EUR[iaElegida];

  const contratar = useCallback(async () => {
    if (demo || !esOwner) return;
    setError(''); setYendoA('checkout');
    const { data, error: err } = await supabase.functions.invoke('crear-checkout-suscripcion', {
      body: { plan: planElegido, ia_nivel: iaElegida },
    });
    const url = (data as { url?: string } | null)?.url;
    if (err || !url) {
      setYendoA(null);
      setError('No se pudo abrir el pago. Vuelve a intentarlo o escribe a soporte.');
      return;
    }
    window.location.href = url;
  }, [demo, esOwner, planElegido, iaElegida]);

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

  const cambiarAddon = useCallback(async (destino: IaNivel) => {
    if (demo || !esOwner) return;
    setError(''); setYendoA('addon');
    const { error: err } = await supabase.functions.invoke('cambiar-addon-ia', {
      body: { ia_nivel: destino },
    });
    if (err) {
      setYendoA(null);
      setError('No se pudo cambiar el asistente de IA. Vuelve a intentarlo o escribe a soporte.');
      return;
    }
    // Igual que tras el checkout: quien escribe ia_nivel es el webhook, asi que se
    // reintenta la lectura en vez de enseñar el valor viejo.
    let intentos = 0;
    const t = setInterval(async () => {
      intentos += 1;
      const fresco = await leer();
      const listo = iaNivelDe(fresco) === destino;
      if (!listo && intentos < 5) return;
      clearInterval(t);
      setYendoA(null);
      setIaNueva(null);
      // Si Stripe acepto el cambio pero su aviso no ha llegado a tiempo, la
      // seleccion vuelve al valor viejo y pareceria que no ha pasado nada.
      if (!listo) setError('El cambio esta hecho en Stripe, pero aun no nos ha llegado la confirmacion. Recarga la pagina en un minuto.');
    }, 2000);
  }, [demo, esOwner, leer]);

  const descripcion = useMemo(() => {
    if (!esOwner) return 'El plan del salon lo contrata y gestiona el propietario.';
    return 'Tu plan de Mecha, la facturacion y la baja. Sin permanencia: puedes cancelar cuando quieras y el plan sigue activo hasta el final del periodo pagado.';
  }, [esOwner]);

  const opcionesIa = [
    { value: 'ninguna', label: 'Sin IA' },
    ...IA_CONTRATABLES.map((n) => ({
      value: n,
      label: `${n === 'whatsapp' ? 'WhatsApp' : n === 'voz' ? 'Voz' : 'Las dos'} · ${IA_PRECIO_EUR[n]} €`,
    })),
  ];

  return (
    <Section title="Tu plan de Mecha" desc={descripcion}>
      {vuelta === 'ok' && (
        <div style={{
          fontSize: 12.5, color: T.success, background: 'rgba(16,185,129,0.10)',
          border: '1px solid rgba(16,185,129,0.28)', borderRadius: 9, padding: '9px 12px', marginBottom: 10,
        }}>
          Tarjeta guardada. En cuanto Stripe nos lo confirme veras el plan activo aqui mismo.
        </div>
      )}
      {vuelta === 'cancelado' && (
        <div style={{
          fontSize: 12.5, color: T.textTertiary, background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 12px', marginBottom: 10,
        }}>
          No se ha completado el alta y no se te ha cobrado nada.
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
          {!cargando && iaActual !== 'ninguna' && <Badge tone="primary">{IA_NIVEL_LABEL[iaActual]}</Badge>}
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
        // Durante la prueba con tarjeta ya puesta no es una renovacion: es el primer
        // cobro de todos, y decir "renovacion" haria pensar que ya se ha pagado algo.
        <FieldRow
          label={enPrueba ? 'Primer cobro' : 'Proxima renovacion'}
          hint={enPrueba
            ? 'Al acabar la prueba. Hasta ese dia no se te cobra nada.'
            : 'Se cobra automaticamente en esa fecha.'}
        >
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

      {/* Ya paga: el addon se cambia aqui mismo; lo demas (plan, tarjeta, facturas,
          baja) sale por el portal de Stripe. */}
      {!cargando && esOwner && tieneSuscripcionStripe && (
        <>
          <FieldRow
            label="Recepcionistas (IA)"
            hint={`${RESUMEN_IA[iaNueva ?? iaActual]} Sin permanencia: quitalo cuando quieras.`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Segmented
                value={iaNueva ?? iaActual}
                onChange={(v: IaNivel) => setIaNueva(v === iaActual ? null : v)}
                options={opcionesIa}
                disabled={demo || yendoA !== null}
              />
              {iaNueva && iaNueva !== iaActual && (
                <Btn
                  variant="primary"
                  size="sm"
                  icon="check"
                  onClick={() => cambiarAddon(iaNueva)}
                  disabled={demo || yendoA !== null}
                >
                  {yendoA === 'addon' ? 'Aplicando...' : 'Confirmar cambio'}
                </Btn>
              )}
            </div>
          </FieldRow>
          {iaNueva && iaNueva !== iaActual && (
            <p style={{ fontSize: 11.5, color: T.textTertiary, margin: '0 0 8px', lineHeight: 1.5 }}>
              {iaNueva === 'ninguna'
                ? 'Se quitara de tu proxima factura. El resto del plan sigue igual.'
                : `Pasaras a pagar ${PLAN_PRECIO_EUR[planActual] + IA_PRECIO_EUR[iaNueva]} €/mes + IVA. `
                  + (enPrueba
                    ? 'Como sigues en el mes de prueba, hoy no se te cobra nada.'
                    : 'La diferencia de lo que queda de mes se ajusta en la proxima factura.')}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <Btn variant="primary" size="sm" icon="lock" onClick={gestionar} disabled={demo || yendoA === 'portal'}>
              {yendoA === 'portal' ? 'Abriendo...' : 'Gestionar suscripcion'}
            </Btn>
          </div>
        </>
      )}

      {/* No paga todavia (prueba, sin plan, caducada o cancelada): puede contratar. */}
      {!cargando && esOwner && !tieneSuscripcionStripe && (
        <>
          <div style={{
            display: 'grid', gap: 12, marginTop: 12,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          }}>
            {PLANES_CONTRATABLES.map((plan) => {
              const activo = planElegido === plan;
              return (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setPlanElegido(plan)}
                  disabled={demo || yendoA !== null}
                  style={{
                    border: `1px solid ${activo ? T.primary : T.border}`,
                    boxShadow: activo ? `0 0 0 1px ${T.primary}` : 'none',
                    borderRadius: 12, padding: 14, background: T.bg, textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 8,
                    cursor: demo ? 'default' : 'pointer', font: 'inherit',
                  }}
                >
                  {/* Todo el contenido va en <span>: un <div> o un <p> dentro de
                      un <button> es anidamiento invalido. */}
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{PLAN_LABEL[plan]}</span>
                    {activo && <Badge tone="primary">Elegido</Badge>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: T.text }}>{PLAN_PRECIO_EUR[plan]} €</span>
                    <span style={{ fontSize: 12, color: T.textTertiary, fontWeight: 600 }}>/mes + IVA</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: T.textSec, lineHeight: 1.5, flex: 1 }}>
                    {RESUMEN_SOFTWARE}
                  </span>
                </button>
              );
            })}
          </div>

          <FieldRow label="Recepcionistas (IA)" hint={RESUMEN_IA[iaElegida]}>
            <Segmented
              value={iaElegida}
              onChange={(v: IaNivel) => setIaElegida(v)}
              options={opcionesIa}
              disabled={demo || yendoA !== null}
            />
          </FieldRow>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap', marginTop: 12, padding: '10px 12px',
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{totalElegido} €<span style={{ fontSize: 12, color: T.textTertiary, fontWeight: 600 }}> /mes + IVA</span></div>
              <div style={{ fontSize: 11.5, color: T.textTertiary }}>
                {PLAN_LABEL[planElegido]}{iaElegida !== 'ninguna' ? ` + ${IA_NIVEL_LABEL[iaElegida]}` : ''}
              </div>
            </div>
            <Btn
              variant="primary"
              size="md"
              icon="check"
              onClick={contratar}
              disabled={demo || yendoA !== null}
            >
              {yendoA === 'checkout' ? 'Abriendo el pago...' : 'Contratar'}
            </Btn>
          </div>

          <p style={{ fontSize: 11.5, color: T.textTertiary, margin: '10px 0 0', lineHeight: 1.5 }}>
            {enPrueba
              ? `Deja la tarjeta ahora y no se te cobrara nada hasta el ${fecha(estado?.trial_ends_at ?? null)}: no pierdes ni un dia de prueba. `
              : ''}
            Profesionales ilimitados, 0% de comision por cita y sin permanencia. El pago lo procesa
            Stripe: Mecha no guarda ningun dato de tu tarjeta.
          </p>
        </>
      )}
    </Section>
  );
}
