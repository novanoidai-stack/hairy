import { useEffect, useMemo, useState } from 'react';
import { useGlobalSearchParams } from 'expo-router';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { ejecutarAccion } from '@/lib/chispaOps';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import {
  analizarAgendaDia,
  estrategiaAMovimientos,
  type ProblemaAgenda,
  type CitaOrganizar,
} from '@/lib/organizarAgenda';
import type { EstrategiaRetraso, UpdateRetraso } from '@/lib/retrasos';
import RetrasoEstrategiasModal from './RetrasoEstrategiasModal';

// Panel "Organizar mi agenda" (Sesion 5, PLAN-IA-CHISPA-V2-REDISENO.md): analiza
// el dia de HOY (determinista, sin LLM: lib/organizarAgenda.ts) y ofrece un
// arreglo de un clic por cada retraso/solape/hueco/reposo detectado. Funciona
// sin usar el chatbot. Aplica escribiendo via chispaOps.ejecutarAccion con la
// MISMA accion 'optimizar_agenda' que usa Chispa (mismo camino de escritura +
// auditoria en citas_historial).
//
// Guardrail de demo: igual que ChispaPanel, en la demo compartida (IS_DEMO_MODE
// o negocio_id === 'demo_salon_001') las escrituras se SIMULAN — el visitante ve
// el flujo completo pero no se toca la fila real.

const T = {
  panel: DESIGN_TOKENS.bgPanel,
  card: DESIGN_TOKENS.bgCard,
  cardHi: DESIGN_TOKENS.bgCardHi,
  border: DESIGN_TOKENS.borderHi,
  text: DESIGN_TOKENS.text,
  textSec: DESIGN_TOKENS.textSecondary,
  textTer: DESIGN_TOKENS.textTertiary,
  primary: DESIGN_TOKENS.primary,
  primaryHi: DESIGN_TOKENS.primaryHi,
  primarySoft: DESIGN_TOKENS.primarySoft,
  amber: DESIGN_TOKENS.warning,
  amberSoft: DESIGN_TOKENS.warningSoft,
  success: DESIGN_TOKENS.success,
  successSoft: DESIGN_TOKENS.successSoft,
  danger: DESIGN_TOKENS.danger,
  dangerSoft: DESIGN_TOKENS.dangerSoft,
};
const FIRE = DESIGN_TOKENS.fireGradient;

interface CitaCruda {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string | null;
  fin_espera?: string | null;
  estado: string;
  profesional_id: string;
  servicio_id?: string | null;
  cliente_id?: string | null;
  grupo_id?: string | null;
}

export interface OrganizarAgendaPanelProps {
  citas: CitaCruda[];
  profesionales: { id: string; nombre: string; categoria?: string | null; activo?: boolean }[];
  clientes: { id: string; nombre: string; telefono?: string | null }[];
  servicios: { id: string; nombre: string; categoria_minima?: string | null }[];
  negocioId: string;
  isMobile?: boolean;
  onClose: () => void;
  onAplicado: (updates: UpdateRetraso[]) => void;
}

function iconoTipo(tipo: ProblemaAgenda['tipo']) {
  switch (tipo) {
    case 'retraso':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case 'solape':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
    default:
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>;
  }
}
function fondoTipo(tipo: ProblemaAgenda['tipo']): string {
  if (tipo === 'retraso') return T.amberSoft;
  if (tipo === 'solape') return T.dangerSoft;
  return T.primarySoft;
}

export default function OrganizarAgendaPanel({
  citas, profesionales, clientes, servicios, negocioId, isMobile, onClose, onAplicado,
}: OrganizarAgendaPanelProps) {
  const esDemoCompartida = IS_DEMO_MODE || negocioId === 'demo_salon_001';
  // Arnes de pruebas SOLO con ?orgnow=<ISO> en la URL (mismo espiritu que
  // ?chispatest=1/?vozab=1 en ChispaPanel): fija la hora "ahora" del analisis
  // para poder verificar retrasos/huecos sin depender del reloj real ni de
  // que la hora de cierre del negocio ya haya pasado.
  const { orgnow } = useGlobalSearchParams<{ orgnow?: string }>();
  const ahoraOverrideMs = useMemo(() => {
    if (!orgnow) return undefined;
    const t = new Date(orgnow).getTime();
    return Number.isNaN(t) ? undefined : t;
  }, [orgnow]);
  const [userId, setUserId] = useState<string | null>(null);
  const [aplicandoId, setAplicandoId] = useState<string | null>(null);
  const [aplicandoTodo, setAplicandoTodo] = useState(false);
  const [resueltasDemo, setResueltasDemo] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [avisoDemo, setAvisoDemo] = useState('');
  const [retrasoAbierto, setRetrasoAbierto] = useState<ProblemaAgenda | null>(null);

  useEffect(() => {
    let cancel = false;
    getUserProfile().then((p) => { if (!cancel) setUserId(p?.id ?? null); });
    return () => { cancel = true; };
  }, []);

  const citasHoy: CitaOrganizar[] = useMemo(() => {
    const clienteMap = new Map(clientes.map((c) => [c.id, c]));
    const servicioMap = new Map(servicios.map((s) => [s.id, s.nombre]));
    const servicioCatMinMap = new Map(servicios.map((s) => [s.id, s.categoria_minima ?? null]));
    return citas.map((c) => {
      const cliente = c.cliente_id ? clienteMap.get(c.cliente_id) : undefined;
      return {
        id: c.id,
        inicio: c.inicio,
        fin: c.fin,
        fin_activa: c.fin_activa,
        fin_espera: c.fin_espera,
        estado: c.estado,
        profesional_id: c.profesional_id,
        grupoId: c.grupo_id ?? null,
        cliente: cliente?.nombre ?? null,
        telefono: cliente?.telefono ?? null,
        servicio: c.servicio_id ? (servicioMap.get(c.servicio_id) ?? null) : null,
        categoriaMinima: c.servicio_id ? (servicioCatMinMap.get(c.servicio_id) ?? null) : null,
      };
    });
  }, [citas, clientes, servicios]);

  const citasPorId = useMemo(() => new Map(citasHoy.map((c) => [c.id, c])), [citasHoy]);

  const problemas = useMemo(
    () => analizarAgendaDia(citasHoy, profesionales, { ahoraMs: ahoraOverrideMs }),
    [citasHoy, profesionales, ahoraOverrideMs],
  );
  const pendientes = problemas.filter((p) => !resueltasDemo.has(p.id));

  async function aplicarEstrategia(problema: ProblemaAgenda, estrategia: EstrategiaRetraso) {
    setError('');
    setAplicandoId(problema.id);
    try {
      if (esDemoCompartida) {
        // Guardrail: la demo compartida nunca escribe de verdad (igual que ChispaPanel).
        await new Promise((r) => setTimeout(r, 350)); // da tiempo a ver el estado "Aplicando..."
        setResueltasDemo((prev) => new Set(prev).add(problema.id));
        setAvisoDemo('Hecho (demostracion). En tu cuenta esto se aplicaria de verdad; en la demo no se guardan cambios.');
        return true;
      }
      if (!userId) {
        setError('No se pudo obtener tu perfil de usuario.');
        return false;
      }
      const movimientos = estrategiaAMovimientos(estrategia, citasPorId);
      const hoyIso = new Date().toISOString().slice(0, 10);
      const res = await ejecutarAccion(
        { tipo: 'optimizar_agenda', negocio_id: negocioId, fecha: hoyIso, movimientos, resumen: problema.titulo },
        userId,
      );
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      onAplicado(estrategia.updates);
      return true;
    } finally {
      setAplicandoId(null);
    }
  }

  async function aplicarRecomendada(problema: ProblemaAgenda) {
    const recomendada = problema.estrategias.find((e) => e.recomendada) ?? problema.estrategias[0];
    await aplicarEstrategia(problema, recomendada);
  }

  async function aplicarTodos() {
    setAplicandoTodo(true);
    setError('');
    for (const p of pendientes) {
      const recomendada = p.estrategias.find((e) => e.recomendada) ?? p.estrategias[0];
      const ok = await aplicarEstrategia(p, recomendada);
      if (!ok) break; // se detiene y muestra el error; lo ya aplicado queda aplicado
    }
    setAplicandoTodo(false);
  }

  const bloqueado = aplicandoTodo || aplicandoId !== null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,6,4,0.42)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: isMobile ? '86vh' : '85vh', overflowY: 'auto',
          background: T.panel, borderRadius: isMobile ? '20px 20px 0 0' : 20, border: `1px solid ${T.border}`,
          boxShadow: '0 24px 60px rgba(40,30,24,0.22)', fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, background: T.panel, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: 10, background: T.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.primaryHi} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>
            </span>
            <div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: T.text }}>Organizar mi agenda</div>
              <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 2 }}>
                {pendientes.length === 0 ? 'Tu agenda de hoy esta en orden' : `${pendientes.length} problema${pendientes.length > 1 ? 's' : ''} detectado${pendientes.length > 1 ? 's' : ''} hoy`}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ padding: 6, background: 'transparent', border: 'none', color: T.textTer, cursor: 'pointer', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '14px 20px 20px' }}>
          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: T.dangerSoft, color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}
          {avisoDemo && !error && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: T.successSoft, color: T.success, fontSize: 13, marginBottom: 12 }}>{avisoDemo}</div>
          )}

          {pendientes.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 10px', textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 999, background: T.successSoft, alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <div style={{ fontSize: 14, color: T.textSec, maxWidth: 320 }}>
                Sin retrasos, solapes ni huecos muertos por resolver. Vuelve a pulsar este boton si algo cambia durante el dia.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendientes.map((p) => {
                const recomendada = p.estrategias.find((e) => e.recomendada) ?? p.estrategias[0];
                const aplicandoEsta = aplicandoId === p.id;
                return (
                  <div key={p.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, background: fondoTipo(p.tipo), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {iconoTipo(p.tipo)}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text, flex: 1, minWidth: 0 }}>{p.titulo}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.textTer, whiteSpace: 'nowrap' }}>{p.profesionalNombre}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.45, marginLeft: 34 }}>{p.descripcion}</div>
                    <div style={{ fontSize: 12.5, color: T.primaryHi, lineHeight: 1.4, marginLeft: 34, fontWeight: 600 }}>→ {recomendada.resumen}</div>
                    <div style={{ display: 'flex', gap: 8, marginLeft: 34, marginTop: 2, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => aplicarRecomendada(p)}
                        disabled={bloqueado}
                        style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: aplicandoEsta ? T.primarySoft : FIRE, color: aplicandoEsta ? T.primaryHi : '#fff', fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado && !aplicandoEsta ? 0.5 : 1 }}
                      >
                        {aplicandoEsta ? 'Aplicando...' : 'Aplicar'}
                      </button>
                      {p.tipo === 'retraso' && p.estrategias.length > 1 && (
                        <button
                          onClick={() => setRetrasoAbierto(p)}
                          disabled={bloqueado}
                          style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSec, fontSize: 12.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado ? 0.5 : 1 }}
                        >
                          Ver opciones
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, padding: isMobile ? '4px 20px 88px' : '4px 20px 20px' }}>
          <button onClick={onClose} disabled={bloqueado} style={{ flex: 1, padding: '13px', borderRadius: 13, border: `1.5px solid ${T.border}`, background: T.card, color: T.textSec, fontSize: 14.5, fontWeight: 700, cursor: bloqueado ? 'default' : 'pointer' }}>
            Cerrar
          </button>
          {pendientes.length > 1 && (
            <button
              onClick={aplicarTodos}
              disabled={bloqueado}
              style={{ flex: 2, padding: '13px', borderRadius: 13, border: 'none', background: FIRE, color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado ? 0.7 : 1, boxShadow: '0 10px 26px rgba(192,38,10,0.25)' }}
            >
              {aplicandoTodo ? 'Aplicando todo...' : `Aplicar los ${pendientes.length}`}
            </button>
          )}
        </div>
      </div>

      {retrasoAbierto && (
        <RetrasoEstrategiasModal
          estrategias={retrasoAbierto.estrategias}
          minutos={retrasoAbierto.minutos ?? 0}
          profesionalNombre={retrasoAbierto.profesionalNombre}
          avisarDisponible={false}
          enviando={aplicandoId === retrasoAbierto.id}
          onConfirmar={async (estrategia: EstrategiaRetraso) => {
            const problema = retrasoAbierto;
            const ok = await aplicarEstrategia(problema, estrategia);
            if (ok) setRetrasoAbierto(null);
          }}
          onCancelar={() => setRetrasoAbierto(null)}
        />
      )}
    </div>
  );
}
