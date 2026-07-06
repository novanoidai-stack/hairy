// Modal de propuesta de aviso de lista de espera (IA de agenda, Sesion 8-B).
// Se abre tras cancelar una cita cuando hay candidatas compatibles.
// Muestra la mejor candidata y deja al profesional CONFIRMAR (avisar por WhatsApp)
// o cancelar. Componente aislado: AgendaCalendar lo abre con la candidata ya
// calculada (RPC matching_lista_espera). No toca BD; las acciones se delegan via callbacks.

import { useState } from 'react';
import { DESIGN_TOKENS } from '@/lib/designTokens';

const T = {
  panel: DESIGN_TOKENS.bgPanel,
  card: DESIGN_TOKENS.bgCard,
  border: DESIGN_TOKENS.borderHi,
  text: DESIGN_TOKENS.text,
  textSec: DESIGN_TOKENS.textSecondary,
  textTer: DESIGN_TOKENS.textTertiary,
  primary: DESIGN_TOKENS.primary,
  primaryHi: DESIGN_TOKENS.primaryHi,
  primarySoft: DESIGN_TOKENS.primarySoft,
  cyan: DESIGN_TOKENS.cyan,
  cyanSoft: 'rgba(8,145,178,0.12)',
};
const FIRE = DESIGN_TOKENS.fireGradient;

export interface CandidataListaEspera {
  lista_espera_id: string;
  cliente_id: string;
  nombre: string;
  telefono?: string;
  servicio_id?: string;
  servicio_nombre?: string;
  profesional_id?: string;
  profesional_nombre?: string;
  franja?: string;
  nota?: string;
  prioridad?: number;
  created_at?: string;
  fidelidad_citas?: number;
  gasto_acumulado?: number;
}

export interface CitaOrigen {
  id: string;
  servicio_id: string;
  profesional_id: string;
  inicio: string;
  fin: string;
}

export interface ListaEsperaPropuestaModalProps {
  candidata: CandidataListaEspera;
  citaOrigen: CitaOrigen;
  servicioNombre?: string;
  profesionalNombre?: string;
  enviando?: boolean;
  onConfirmar: (listaEsperaId: string) => void;
  onCancelar: () => void;
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function fmtFranja(franja?: string): string {
  if (!franja || franja === 'cualquiera') return 'Cualquier hora';
  return franja === 'manana' ? 'Mañanas' : 'Tardes';
}

export default function ListaEsperaPropuestaModal({
  candidata,
  citaOrigen,
  servicioNombre,
  profesionalNombre,
  enviando = false,
  onConfirmar,
  onCancelar,
}: ListaEsperaPropuestaModalProps) {
  const tel = (candidata.telefono || '').replace(/\D/g, '');
  const tieneTelefono = tel.length >= 6;
  const fidelidad = candidata.fidelidad_citas ?? 0;

  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,6,4,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', background: T.panel, borderRadius: 20, border: `1px solid ${T.border}`, boxShadow: '0 24px 60px rgba(40,30,24,0.22)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Cabecera */}
        <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 8, background: T.cyanSoft, alignItems: 'center', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${T.cyan}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>` }} />
            <div style={{ fontSize: 16.5, fontWeight: 800, color: T.text }}>Hueco liberado</div>
          </div>
          <div style={{ fontSize: 13, color: T.textSec, marginTop: 6, lineHeight: 1.45 }}>
            Hay una persona en lista de espera compatible con este hueco.
          </div>
        </div>

        {/* Detalle del hueco */}
        <div style={{ padding: '12px 20px', background: T.card, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Hueco disponible</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: T.text }}>
            <span>{fmtFecha(citaOrigen.inicio)}</span>
            <span style={{ color: T.primaryHi }}>{fmtHora(citaOrigen.inicio)}</span>
            {servicioNombre && <span style={{ fontSize: 13, fontWeight: 600, color: T.textSec }}>· {servicioNombre}</span>}
          </div>
          {profesionalNombre && <div style={{ fontSize: 12, color: T.textTer, marginTop: 2 }}>con {profesionalNombre}</div>}
        </div>

        {/* Candidata */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>1a prioridad</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.primaryHi }}>
                {(candidata.nombre || '?')[0].toUpperCase()}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {candidata.nombre || 'Cliente'}
              </div>
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 1 }}>
                {fidelidad === 1 ? `${fidelidad} cita anterior` : fidelidad > 1 ? `${fidelidad} citas anteriores` : 'Nueva clienta'}
                {candidata.franja && <span style={{ color: T.textTer, marginLeft: 6 }}>· {fmtFranja(candidata.franja)}</span>}
              </div>
              {candidata.nota && <div style={{ fontSize: 12, color: T.textTer, marginTop: 2, fontStyle: 'italic' }}>{candidata.nota}</div>}
            </div>
            {tieneTelefono && (
              <a
                href={`https://wa.me/${tel}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, color: '#16a34a', textDecoration: 'none', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Info del aviso */}
        <div style={{ padding: '0 20px 12px', fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
          Al confirmar, se creará una cita tentativa para esta clienta y se encolará un aviso automático por WhatsApp.
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 20px 18px' }}>
          <button onClick={onCancelar} disabled={enviando} style={{ flex: 1, padding: '13px', borderRadius: 13, border: `1.5px solid ${T.border}`, background: T.card, color: T.textSec, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
            No avisar
          </button>
          <button
            onClick={() => onConfirmar(candidata.lista_espera_id)}
            disabled={enviando || !tieneTelefono}
            style={{
              flex: 2,
              padding: '13px',
              borderRadius: 13,
              border: 'none',
              background: tieneTelefono ? FIRE : '#cfc6bd',
              color: '#fff',
              fontSize: 14.5,
              fontWeight: 800,
              cursor: enviando ? 'default' : 'pointer',
              opacity: enviando ? 0.7 : 1,
              boxShadow: tieneTelefono ? '0 10px 26px rgba(192,38,10,0.25)' : 'none',
            }}
          >
            {enviando ? 'Avisando…' : tieneTelefono ? 'Avisar por WhatsApp' : 'Sin teléfono'}
          </button>
        </div>
      </div>
    </div>
  );
}
