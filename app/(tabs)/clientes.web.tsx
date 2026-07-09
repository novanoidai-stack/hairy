import { useEffect, useMemo, useRef, useState } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { useCalendarRefresh } from '@/lib/calendarContext';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { TAG_RESENO_SALON, TAG_RESENO_MECHA, TAGS_RESENA, CITA_STATUS_ACTIVOS } from '@/lib/constants';
import { PageLoader } from '@/components/ui/DesignComponents';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { RiesgoNoShowIndicator, type RiesgoNoShow } from '@/components/clientes/RiesgoNoShowIndicator.web';
import { useAyudaIA } from '@/lib/hooks/useAyudaIA';
import { BloqueRenderer, type AccionEstado } from '@/components/chispa/BloqueRenderer.web';
import { ejecutarAccion, type AccionPropuesta } from '@/lib/chispaOps';
import * as XLSX from 'xlsx';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualClientes } from '@/lib/manuals/clientes';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { AvisosBell } from '@/components/avisos/AvisosBell';
import { useChispaVoz } from '@/lib/hooks/useChispaVoz.web';
import { ColorTryOnModal } from '@/components/clientes/ColorTryOnModal.web';
import { InstagramPostModal } from '@/components/clientes/InstagramPostModal.web';

// Iconos SVG simples
const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  const icons: any = {
    search: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    filter: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    phone: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    edit: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    moreVertical: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
    star: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    cake: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>`,
    clock: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    mail: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    check: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
    user: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    sparkle: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 5.7a2 2 0 0 0 1.4 1.4L21 12l-5.7 1.9a2 2 0 0 0-1.4 1.4L12 21l-1.9-5.7a2 2 0 0 0-1.4-1.4L3 12l5.7-1.9a2 2 0 0 0 1.4-1.4L12 3z"/></svg>`,
    droplet: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
    chevronLeft: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevronRight: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    maximize: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    minimize: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    download: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    upload: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    mic: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>`,
    refreshCcw: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

// Design tokens
const TOKENS = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  primaryGlow: 'rgba(244,80,30,0.30)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.14)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.16)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
  violet: '#c0260a',
  violetSoft: 'rgba(192,38,10,0.14)',
  cyan: '#0891b2',
  cyanSoft: 'rgba(8,145,178,0.14)',
};

// Normalizar texto: quitar tildes para busquedas sin discriminar acentos
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Umbral para alerta de inactividad
const INACTIVIDAD_DIAS = 90;

interface Cita {
  id: string;
  cliente_id: string;
  inicio: string;
  fin: string;
  estado?: string;
  servicio_id?: string;
  profesional_id?: string;
  notas?: string | null;
  formula_producto?: string | null;
  formula_tono?: string | null;
  formula_tiempo_min?: number | null;
  formula_resultado?: string | null;
  formula_notas?: string | null;
}

type TagValor = 'VIP' | 'Habitual' | 'Nuevo';
type TagActividad = 'Activa' | 'Riesgo abandono' | 'Inactiva';
type TagRiesgo = 'Fiable' | 'Incidencias' | 'Alto riesgo';

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  fecha_nacimiento?: string | null;
  alergias?: string | null;
  notas?: string | null;
  visitas?: number;
  ultimaVisita?: Date | null;
  ultimaVisitaStr?: string;
  primeraVisita?: Date | null;
  gastado?: number;
  fav?: string;
  favCount?: number;
  tag?: TagValor;
  actividad?: TagActividad;
  riesgo?: TagRiesgo;
  noshows_count?: number;
  diasInactiva?: number;
  profHabitual?: string;
  bloqueado?: boolean;
  bloqueo_motivo?: string | null;
  etiquetas?: string[];
  deposito_perfil_override?: string | null;
  consiente_ia?: boolean;
  consiente_ia_origen?: string;
  consiente_ia_fecha?: string;
  frecuencia_dias?: number | null;
  enRiesgoFuga?: boolean;
  diasFugaRetraso?: number;
  recompensaFugaNombre?: string;
  riesgoNoShow?: RiesgoNoShow | null;
  tocaRecompra?: boolean;
  diasRecompra?: number;
}

type Tab = 'resumen' | 'notas' | 'color' | 'historial';

function computeTag(visitas: number, gastado: number): TagValor {
  if (visitas > 10 || gastado > 500) return 'VIP';
  if (visitas >= 3) return 'Habitual';
  return 'Nuevo';
}

function computeActividad(ultimaVisita: Date | null): TagActividad {
  if (!ultimaVisita) return 'Inactiva';
  const dias = Math.floor((Date.now() - ultimaVisita.getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 45) return 'Activa';
  if (dias <= INACTIVIDAD_DIAS) return 'Riesgo abandono';
  return 'Inactiva';
}

function computeRiesgo(noshows: number): TagRiesgo {
  if (noshows >= 3) return 'Alto riesgo';
  if (noshows >= 1) return 'Incidencias';
  return 'Fiable';
}

// Alertas que se muestran en el panel detalle
type Alert = {
  // 'no-allergy'/'no-phone' son capsulas informativas (sin alergias conocidas / sin telefono);
  // cada alerta lleva su propio color/bg/border/icon, asi que el render no necesita switch por tipo.
  type: 'allergy' | 'no-allergy' | 'inactive' | 'birthday' | 'new' | 'no-phone';
  message: string;
  color: string;
  icon: string;
  bg: string;
  border: string;
};

function computeAlerts(cl: Cliente): Alert[] {
  const alerts: Alert[] = [];

  // Alergias: cualquier contenido en alergias (campo dedicado a alergias)
  const alergiasTexto = (cl.alergias ?? '').trim();
  if (alergiasTexto.length > 0) {
    const preview = alergiasTexto.length > 90 ? alergiasTexto.slice(0, 90) + '...' : alergiasTexto;
    alerts.push({
      type: 'allergy',
      message: `Alergias: ${preview}`,
      color: TOKENS.danger,
      bg: TOKENS.dangerSoft,
      border: 'rgba(239,68,68,0.35)',
      icon: 'alert',
    });
  } else {
    alerts.push({
      type: 'no-allergy',
      message: 'Sin alergias registradas.',
      color: TOKENS.success,
      bg: TOKENS.successSoft,
      border: 'rgba(15,157,107,0.16)',
      icon: 'check',
    });
  }

  // Falta de teléfono
  if (!cl.telefono || cl.telefono.trim().length === 0) {
    alerts.push({
      type: 'no-phone',
      message: 'Este cliente no tiene configurado número de teléfono en su ficha.',
      color: TOKENS.warning,
      bg: TOKENS.warningSoft,
      border: 'rgba(224,138,0,0.25)',
      icon: 'alert',
    });
  }

  // Inactividad (amarillo)
  if (cl.ultimaVisita && (cl.visitas || 0) > 0) {
    const dias = Math.floor((Date.now() - cl.ultimaVisita.getTime()) / 86400000);
    if (dias > INACTIVIDAD_DIAS) {
      alerts.push({
        type: 'inactive',
        message: `Sin visita desde hace ${dias} dias`,
        color: TOKENS.warning,
        bg: TOKENS.warningSoft,
        border: 'rgba(245,158,11,0.30)',
        icon: 'clock',
      });
    }
  }

  // Cumpleanos (naranja claro)
  if (cl.fecha_nacimiento) {
    const fn = new Date(cl.fecha_nacimiento);
    if (!isNaN(fn.getTime())) {
      const today = new Date();
      const thisYear = new Date(today.getFullYear(), fn.getMonth(), fn.getDate());
      let diff = Math.ceil((thisYear.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
      if (diff < 0) {
        const nextYear = new Date(today.getFullYear() + 1, fn.getMonth(), fn.getDate());
        diff = Math.ceil((nextYear.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
      }
      if (diff >= 0 && diff <= 7) {
        const fechaFmt = fn.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' });
        const msg = diff === 0 ? `Cumple hoy (${fechaFmt})` : diff === 1 ? `Cumple manana (${fechaFmt})` : `Cumple en ${diff} dias (${fechaFmt})`;
        alerts.push({
          type: 'birthday',
          message: msg,
          color: '#fb923c',
          bg: 'rgba(251,146,60,0.14)',
          border: 'rgba(251,146,60,0.30)',
          icon: 'cake',
        });
      }
    }
  }

  // Cliente nuevo sin historial (verde)
  if ((cl.visitas || 0) === 0) {
    alerts.push({
      type: 'new',
      message: 'Primera vez aqui',
      color: TOKENS.success,
      bg: TOKENS.successSoft,
      border: 'rgba(16,185,129,0.30)',
      icon: 'sparkle',
    });
  }

  return alerts;
}

function ClientesWeb() {
  const { isMobile, isTablet } = useResponsive();
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('clientes');
  const params = useLocalSearchParams<{ clienteId?: string; filtro?: string }>();
  const router = useRouter();
  const { refreshTrigger, triggerRefresh } = useCalendarRefresh();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<any[]>([]);
  const [catalogoAlergias, setCatalogoAlergias] = useState<string[]>([]);
  // Plantillas de notas del salon (Configuracion > Plantillas) para la ficha
  const [plantillasNota, setPlantillasNota] = useState<{ nombre: string; texto: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // Fusion de duplicadas: la clienta abierta actua de maestra; se elige la duplicada.
  const [fusionMaestro, setFusionMaestro] = useState<Cliente | null>(null);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [negocioId, setNegocioId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  const [activeTagFilter, setActiveTagFilter] = useState<string>('Todos');
  const [panelExpanded, setPanelExpanded] = useState(false);
  // Demo guiada: si la guia pide abrir una ficha antes de que carguen los clientes,
  // dejamos la peticion pendiente y la resolvemos en cuanto haya datos.
  const demoFichaPending = useRef(false);

  // Sesion 7 V2: pastilla de riesgo/fuga ACCIONABLE (Recuperar/Avisar de un
  // clic) + Q&A de ficha. Estado por ficha abierta; se resetea al cambiar de
  // clienta para no arrastrar la respuesta de la anterior.
  const [estadoRecuperar, setEstadoRecuperar] = useState<{ tipo: 'idle' | 'cargando' | 'ok' | 'error'; mensaje?: string }>({ tipo: 'idle' });
  const [estadoAvisar, setEstadoAvisar] = useState<{ tipo: 'idle' | 'cargando' | 'ok' | 'error' | 'sin_citas'; mensaje?: string }>({ tipo: 'idle' });
  const [preguntaFicha, setPreguntaFicha] = useState('');
  const ayudaFichaIA = useAyudaIA();
  const [accionEstadoFichaIA, setAccionEstadoFichaIA] = useState<AccionEstado>('pendiente');

  useEffect(() => {
    setEstadoRecuperar({ tipo: 'idle' });
    setEstadoAvisar({ tipo: 'idle' });
    setPreguntaFicha('');
    ayudaFichaIA.reset();
    setAccionEstadoFichaIA('pendiente');
    // Reset intencional SOLO al cambiar de clienta (no en cada render de ayudaFichaIA).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // "Recuperar" (fuga): registra la propuesta de vuelta REAL via el mismo
  // ejecutor que usa el chatbot (chispaOps.ejecutarAccion + RPC
  // registrar_aviso_fuga), sin pasar por el LLM: el pill YA es la propuesta.
  const recuperarClienteUnClic = async (cl: Cliente) => {
    setEstadoRecuperar({ tipo: 'cargando' });
    if (negocioId === 'demo_salon_001') {
      setEstadoRecuperar({ tipo: 'ok', mensaje: 'Hecho (demostración): en tu cuenta esto registraría una propuesta de vuelta real para el equipo.' });
      return;
    }
    const profile = await getUserProfile();
    const accion: AccionPropuesta = {
      tipo: 'recuperar_cliente',
      negocio_id: negocioId,
      cliente_id: cl.id,
      cliente_nombre: cl.nombre,
      dias_sin_venir: cl.diasFugaRetraso ?? 0,
      resumen: `Recuperar a ${cl.nombre}, sin volver hace ${cl.diasFugaRetraso ?? '?'} dias.`,
    };
    const res = await ejecutarAccion(accion, profile?.id || '');
    setEstadoRecuperar(res.ok ? { tipo: 'ok', mensaje: res.mensaje } : { tipo: 'error', mensaje: mensajeDeError({ message: res.error }) });
  };

  // "Avisar" (riesgo de no-show): busca la PROXIMA cita confirmada de la
  // clienta y resetea sus flags de notificacion para que el motor real de
  // WhatsApp (n8n cron-pull) la reenvie de verdad — mismo mecanismo ya usado
  // al reagendar/reorganizar (ver modificar_cita_publica y "Organizar mi
  // agenda"). Sin cita proxima, no hay nada que reforzar: se dice con franqueza.
  const avisarRiesgoNoShowUnClic = async (cl: Cliente) => {
    setEstadoAvisar({ tipo: 'cargando' });
    const { data, error } = await supabase
      .from('citas')
      .select('id, inicio')
      .eq('negocio_id', negocioId)
      .eq('cliente_id', cl.id)
      .in('estado', CITA_STATUS_ACTIVOS)
      .gt('inicio', new Date().toISOString())
      .order('inicio', { ascending: true })
      .limit(1);
    if (error) { setEstadoAvisar({ tipo: 'error', mensaje: mensajeDeError(error) }); return; }
    const proxima = (data ?? [])[0] as { id: string; inicio: string } | undefined;
    if (!proxima) { setEstadoAvisar({ tipo: 'sin_citas' }); return; }
    const fechaFmt = new Date(proxima.inicio).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (negocioId === 'demo_salon_001') {
      setEstadoAvisar({ tipo: 'ok', mensaje: `Hecho (demostración): en tu cuenta esto reforzaría el aviso de confirmación de su cita del ${fechaFmt}.` });
      return;
    }
    const { error: updErr } = await supabase.from('citas').update({ confirmacion_enviada: false, recordatorio_enviado: false }).eq('id', proxima.id);
    if (updErr) { setEstadoAvisar({ tipo: 'error', mensaje: mensajeDeError(updErr) }); return; }
    setEstadoAvisar({ tipo: 'ok', mensaje: `Se reforzará el aviso de confirmación de su cita del ${fechaFmt}.` });
  };

  // Q&A de ficha: el id de la clienta viaja en el propio texto (ver
  // FichaPreguntaIA) para que ficha_cliente la resuelva sin ambiguedad.
  const preguntarFichaIA = (cl: Cliente) => {
    const texto = preguntaFicha.trim();
    if (!texto) return;
    setAccionEstadoFichaIA('pendiente');
    ayudaFichaIA.analizar(
      `Pregunta del equipo sobre una clienta concreta. Su id EXACTO es "${cl.id}" (nombre: "${cl.nombre}"). ` +
      `Usa la tool ficha_cliente con id="${cl.id}" para consultarla (no busques por nombre, ya tienes el id exacto). ` +
      `Pregunta: ${texto}`,
    );
  };

  const confirmarAccionFichaIA = async () => {
    if (ayudaFichaIA.estado.tipo !== 'listo') return;
    const bloqueAccion = ayudaFichaIA.estado.bloques.find((b) => b.tipo === 'accion');
    if (!bloqueAccion || bloqueAccion.tipo !== 'accion') return;
    setAccionEstadoFichaIA('aplicando');
    const profile = await getUserProfile();
    const res = await ejecutarAccion(bloqueAccion.accion, profile?.id || '');
    setAccionEstadoFichaIA(res.ok ? 'aplicada' : 'pendiente');
  };

  const eliminarClienteDirecto = async (cli: Cliente) => {
    if (!window.confirm(`¿Seguro que quieres eliminar al cliente "${cli.nombre}"? Si tiene citas asociadas, no se podrá eliminar.`)) return;
    const { error } = await supabase.from('clientes').delete().eq('id', cli.id);
    if (error) {
      alert('No se pudo eliminar al cliente. Probablemente tiene citas asociadas.');
    } else {
      setSelected(null);
      setPanelExpanded(false);
      await cargar();
      triggerRefresh();
    }
  };

  async function cargar() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) {
      setLoading(false);
      return;
    }
    setNegocioId(profile.negocio_id);

    const [{ data: clts }, { data: citsData }, { data: srvData }, { data: profData }, { data: fichasData }, { data: cfgRow }, { data: fugaData }, { data: riesgoNoShowData }] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, nombre, telefono, email, fecha_nacimiento, alergias, notas, canal_preferido, bebida_preferida, sensibilidades_cuero, noshows_count, perfil_riesgo, ticket_medio, frecuencia_dias, bloqueado, bloqueo_motivo, etiquetas, deposito_perfil_override, consiente_ia, consiente_ia_origen, consiente_ia_fecha')
        .eq('negocio_id', profile.negocio_id)
        .order('nombre'),
      supabase
        .from('citas')
        .select('id, cliente_id, inicio, fin, estado, servicio_id, profesional_id, notas, formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('servicios')
        .select('id, nombre, precio')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('profesionales')
        .select('id, nombre, color')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('fichas_tecnicas_color')
        .select('*')
        .eq('negocio_id', profile.negocio_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('negocio_config')
        .select('config')
        .eq('negocio_id', profile.negocio_id)
        .maybeSingle(),
      supabase.rpc('clientes_en_riesgo_fuga'),
      supabase.rpc('clientes_riesgo_no_show'),
      supabase.rpc('rpc_clientes_toca_recompra', { p_negocio_id: profile.negocio_id }),
    ]);

    // Riesgo de fuga: mapa cliente_id -> datos del RPC (dias de retraso, recompensa sugerida)
    const fugaPorCliente = new Map<string, { dias: number; recompensa?: string }>();
    (fugaData ?? []).forEach((f: any) => {
      fugaPorCliente.set(f.cliente_id, { dias: f.dias_desde_ultima_visita, recompensa: f.recompensa_nombre ?? undefined });
    });

    // Riesgo de no-show (Sesion 7): mapa cliente_id -> score (solo medio/alto; el RPC
    // ya excluye a las fiables). Derivado del historial server-side, sin datos de salud.
    const riesgoPorCliente = new Map<string, RiesgoNoShow>();
    (riesgoNoShowData ?? []).forEach((r: any) => {
      riesgoPorCliente.set(r.cliente_id, { nivel: r.nivel, score: r.score, no_shows: r.no_shows, cancelaciones_tardias: r.cancelaciones_tardias });
    });

    const recompraPorCliente = new Map<string, { dias: number }>();
    ((arguments[2] as any)?.data ?? []).forEach((r: any) => {
      recompraPorCliente.set(r.id, { dias: r.dias_desde_ultima_visita });
    });

    const cfg: any = (cfgRow?.config && typeof cfgRow.config === 'object') ? cfgRow.config : {};
    setCatalogoAlergias(Array.isArray(cfg.catalogoAlergias) ? cfg.catalogoAlergias : []);
    setPlantillasNota(Array.isArray(cfg.plantillasNota) ? cfg.plantillasNota : []);

    const enrichedClients = (clts ?? []).map((cl: any) => {
      const clientCitas = (citsData ?? []).filter((c: Cita) => c.cliente_id === cl.id);
      const sortedAsc = [...clientCitas].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
      const visitas = clientCitas.length;
      const gastado = clientCitas.reduce((sum, c: Cita) => sum + ((srvData ?? []).find((s: any) => s.id === c.servicio_id)?.precio || 0), 0);
      const ultimaVisita = sortedAsc.length > 0 ? new Date(sortedAsc[sortedAsc.length - 1].inicio) : null;
      const primeraVisita = sortedAsc.length > 0 ? new Date(sortedAsc[0].inicio) : null;
      const ultimaVisitaStr = ultimaVisita
        ? ultimaVisita.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';

      const serviceCount: Record<string, number> = {};
      clientCitas.forEach((c: Cita) => {
        const sname = (srvData ?? []).find((s: any) => s.id === c.servicio_id)?.nombre || 'Servicio';
        serviceCount[sname] = (serviceCount[sname] || 0) + 1;
      });
      const favEntry = Object.keys(serviceCount).length > 0 ? Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0] : null;
      const fav = favEntry ? favEntry[0] : undefined;
      const favCount = favEntry ? favEntry[1] : 0;
      const tag = computeTag(visitas, gastado);
      const actividad = computeActividad(ultimaVisita);
      const noshows = cl.noshows_count ?? 0;
      const riesgo = computeRiesgo(noshows);
      const diasInactiva = ultimaVisita ? Math.floor((Date.now() - ultimaVisita.getTime()) / (1000 * 60 * 60 * 24)) : null;

      // Profesional habitual: el que mas citas tiene con este cliente
      const profCount: Record<string, number> = {};
      clientCitas.forEach((c: Cita) => { if (c.profesional_id) profCount[c.profesional_id] = (profCount[c.profesional_id] || 0) + 1; });
      const topProf = Object.entries(profCount).sort((a, b) => b[1] - a[1])[0];
      const profHabitual = topProf ? ((profData ?? []).find((p: any) => p.id === topProf[0])?.nombre ?? undefined) : undefined;

      const fuga = fugaPorCliente.get(cl.id);
      const riesgoNoShow = riesgoPorCliente.get(cl.id) ?? null;
      const recompra = recompraPorCliente.get(cl.id);

      return { ...cl, visitas, gastado, ultimaVisita, primeraVisita, ultimaVisitaStr, fav, favCount, tag, actividad, riesgo, riesgoNoShow, noshows_count: noshows, diasInactiva, profHabitual, enRiesgoFuga: !!fuga, diasFugaRetraso: fuga?.dias, recompensaFugaNombre: fuga?.recompensa, tocaRecompra: !!recompra, diasRecompra: recompra?.dias } as Cliente;
    });

    setClientes(enrichedClients);
    setCitas(citsData ?? []);
    setServicios(srvData ?? []);
    setProfesionales(profData ?? []);
    setFichasTecnicas(fichasData ?? []);
    // Solo pre-seleccionar si llega clienteId por URL (p.ej. "ver cliente" desde agenda).
    // Por defecto NO se abre ninguna ficha: la lista queda a pantalla completa.
    const targetId = (params?.clienteId as string | undefined) || null;
    if (targetId && enrichedClients.find((cl) => cl.id === targetId)) {
      setSelected(targetId);
    }
    setLoading(false);
  }

  // Guarda una alergia nueva en el catalogo del salon (negocio_config),
  // sin pisar el resto de la configuracion existente.
  async function addAlergiaToCatalog(term: string) {
    const t = term.trim();
    if (!t || !negocioId) return;
    if (catalogoAlergias.some((a) => a.toLowerCase() === t.toLowerCase())) return;
    const next = [...catalogoAlergias, t];
    setCatalogoAlergias(next);
    const { data: row } = await supabase.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
    const cfg: any = (row?.config && typeof row.config === 'object') ? row.config : {};
    await supabase.from('negocio_config').upsert(
      { negocio_id: negocioId, config: { ...cfg, catalogoAlergias: next }, updated_at: new Date().toISOString() },
      { onConflict: 'negocio_id' }
    );
  }

  // Recarga al montar y cada vez que algo dispara el refresh global
  // (p.ej. al guardar/editar una cita en la agenda)
  useEffect(() => { cargar(); }, [refreshTrigger]);

  // Deep-link desde el aviso de "clientas en riesgo de fuga" en la agenda.
  useEffect(() => {
    if (params?.filtro === 'fuga') setActiveTagFilter('Fuga');
  }, [params?.filtro]);

  // Si cambia el clienteId del URL, sincronizar la seleccion
  useEffect(() => {
    const id = params?.clienteId as string | undefined;
    if (id && clientes.find((cl) => cl.id === id)) {
      setSelected(id);
      setActiveTab('resumen');
    }
  }, [params?.clienteId, clientes]);

  // Demo guiada: abrir/cerrar la ficha de un cliente de ejemplo desde la guia.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDemo = (e: Event) => {
      const action = (e as CustomEvent).detail?.action;
      if (action === 'ficha') {
        // En el tour abrimos la ficha del primer cliente. El modo "expandido"
        // (ancho completo, estilo escritorio) agranda de mas en movil: alli la
        // ficha ya ocupa toda la pantalla, asi que solo lo activamos en escritorio.
        const wide = typeof window !== 'undefined' && window.innerWidth >= 768;
        if (clientes.length > 0) {
          setSelected(clientes[0].id);
          setActiveTab('resumen');
          setPanelExpanded(wide);
        } else {
          // Aun no hay datos: lo resolvemos cuando lleguen.
          demoFichaPending.current = true;
        }
      } else if (action === 'cerrar') {
        setSelected(null);
        setPanelExpanded(false);
      }
    };
    window.addEventListener('mecha-demo', onDemo);
    return () => window.removeEventListener('mecha-demo', onDemo);
  }, [clientes]);

  // Resuelve una peticion de ficha que llego antes de tener clientes cargados.
  useEffect(() => {
    if (demoFichaPending.current && clientes.length > 0) {
      demoFichaPending.current = false;
      const wide = typeof window !== 'undefined' && window.innerWidth >= 768;
      setSelected(clientes[0].id);
      setActiveTab('resumen');
      setPanelExpanded(wide);
    }
  }, [clientes]);

  const c = clientes.find((x) => x.id === selected) || null;
  const alerts = useMemo(() => (c ? computeAlerts(c) : []), [c]);

  const visibleClientes = useMemo(() => {
    let list = clientes;
    const q = norm(searchText.trim());
    if (q) {
      list = list.filter((cl) =>
        norm(cl.nombre).includes(q) ||
        (cl.telefono ?? '').includes(q) ||
        norm(cl.email ?? '').includes(q)
      );
    }
    if (activeTagFilter !== 'Todos') {
      if (activeTagFilter === 'Inactivas') list = list.filter((cl) => cl.actividad === 'Inactiva');
      else if (activeTagFilter === 'Riesgo') list = list.filter((cl) => cl.riesgo === 'Alto riesgo' || cl.riesgo === 'Incidencias');
      else if (activeTagFilter === 'Fuga') list = list.filter((cl) => cl.enRiesgoFuga);
      else if (activeTagFilter === 'Recompra') list = list.filter((cl) => cl.tocaRecompra);
      else list = list.filter((cl) => cl.tag === activeTagFilter);
    }
    return list;
  }, [clientes, searchText, activeTagFilter]);

  if (loading) return <PageLoader message="Cargando clientes..." />;

  const tagCounts: Record<string, number> = {
    Todos: clientes.length,
    VIP: clientes.filter((x) => x.tag === 'VIP').length,
    Habitual: clientes.filter((x) => x.tag === 'Habitual').length,
    Nuevo: clientes.filter((x) => x.tag === 'Nuevo').length,
    Inactivas: clientes.filter((x) => x.actividad === 'Inactiva').length,
    Riesgo: clientes.filter((x) => x.riesgo === 'Alto riesgo' || x.riesgo === 'Incidencias').length,
    Fuga: clientes.filter((x) => x.enRiesgoFuga).length,
    Recompra: clientes.filter((x) => x.tocaRecompra).length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .import-info-trigger:hover .import-info-tooltip {
          opacity: 1 !important;
          visibility: visible !important;
        }
      `}} />
      {/* Topbar */}
      <div className="m-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '12px 16px' : '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 700, letterSpacing: -0.4, display: 'flex', alignItems: 'center', gap: 10 }}>
            Clientes
            <button
              onClick={() => setShowManualPanel(true)}
              title="Manual de esta pagina"
              style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.borderHi}`, color: TOKENS.textSec, cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <AvisosBell mode="header" />
          </h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>{clientes.length} clientes activos</p>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 8 : 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setShowImportModal(true)}
              title="Importar Excel"
              style={{ padding: isMobile ? '9px 11px' : '9px 14px', background: '#ffffff', color: TOKENS.text, border: `1px solid ${TOKENS.border}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 6, transition: 'all 0.15s ease' }}
            >
              <Icon name="upload" size={16} color={TOKENS.text} />
              {!isMobile && 'Importar Excel'}
            </button>
            <div 
              className="import-info-trigger"
              style={{
                marginLeft: 8,
                cursor: 'pointer',
                display: isMobile ? 'none' : 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'rgba(28,24,20,0.06)',
                color: TOKENS.textSec,
                fontSize: 12,
                fontWeight: 'bold',
                position: 'relative'
              }}
              title="¿Tienes una base de datos y quieres meterla en Mecha? Hazlo desde aquí."
            >
              i
              <div 
                className="import-info-tooltip"
                style={{
                  position: 'absolute',
                  top: '125%',
                  right: 0,
                  width: 260,
                  background: '#1e293b',
                  color: '#f8fafc',
                  padding: '12px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 'normal',
                  lineHeight: '1.4',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  pointerEvents: 'none',
                  opacity: 0,
                  visibility: 'hidden',
                  transition: 'opacity 0.15s ease, visibility 0.15s ease',
                  zIndex: 999
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#ff7a2e' }}>¿Tienes una base de datos?</div>
                Puedes subir tu archivo de Booksy u otros sistemas de gestión desde aquí. Aceptamos múltiples formatos como Excel (.xlsx, .xls) y archivos .csv.
              </div>
            </div>
          </div>
          <button
            className="m-btn-primary"
            onClick={() => { setEditingCliente(null); setShowClienteModal(true); }}
            title="Nuevo cliente"
            style={{ padding: isMobile ? '9px 11px' : '9px 14px', background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`, display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 6 }}
          >
            <Icon name="plus" size={16} color="#fff" />
            {!isMobile && 'Nuevo cliente'}
          </button>
        </div>
      </div>

      {!paginaManual.loading && !paginaManual.visto && (
        <div style={{ padding: isMobile ? '12px 12px 0' : '16px 24px 0' }}>
          <AvisoPrimeraVisita
            content={manualClientes}
            isMobile={isMobile}
            onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
            onCerrar={paginaManual.marcarVisto}
          />
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (!c ? '1fr 0px' : (panelExpanded ? '0fr 1fr' : '1fr 420px')), overflow: 'hidden', transition: 'grid-template-columns 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
        {/* List */}
        <div style={{ display: (isMobile && selected) ? 'none' : 'block', overflowY: 'auto', overflowX: 'hidden', padding: (panelExpanded || (isMobile && selected)) ? 0 : (isMobile ? '12px 12px 88px' : 24), minWidth: 0 }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: '11px 14px', marginBottom: 16 }}>
            <Icon name="search" size={16} color={TOKENS.textSec} />
            <input placeholder={isMobile ? 'Buscar cliente...' : 'Buscar por nombre, telefono o email...'} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: TOKENS.text, fontSize: 13 }} />
            {/* En movil el contador chocaba con el placeholder dentro del input: solo se muestra cuando hay busqueda activa */}
            {(!isMobile || searchText.trim().length > 0) && (
              <span style={{ fontSize: 11, color: TOKENS.textTer, flexShrink: 0, whiteSpace: 'nowrap' }}>{visibleClientes.length} resultados</span>
            )}
          </div>

          {/* Tag chips */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {(['Todos', 'VIP', 'Habitual', 'Nuevo', 'Inactivas', 'Riesgo', 'Fuga', 'Recompra'] as const).map((t) => {
              const color = t === 'VIP' ? TOKENS.warning : t === 'Habitual' ? TOKENS.primary : t === 'Nuevo' ? TOKENS.success : t === 'Inactivas' ? TOKENS.textTer : t === 'Riesgo' ? TOKENS.danger : t === 'Fuga' ? TOKENS.cyan : t === 'Recompra' ? '#8b5cf6' : TOKENS.primary;
              const active = activeTagFilter === t;
              return (
                <button
                  key={t}
                  className="m-chip"
                  onClick={() => setActiveTagFilter(t)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '7px 12px',
                    borderRadius: 999,
                    background: active ? `${color}22` : TOKENS.bgCard,
                    border: `1px solid ${active ? `${color}55` : TOKENS.border}`,
                    color: active ? color : TOKENS.textSec,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>{t}</span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: active ? `${color}44` : 'rgba(148,163,184,0.10)', color: active ? color : TOKENS.textSec }}>
                    {tagCounts[t]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 80px 32px' : '2fr 1fr 1fr 0.8fr 32px', padding: '10px 16px', fontSize: 10, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, background: 'rgba(244,80,30,0.04)' }}>
              <div>Cliente</div>
              {!isMobile && <div>Ultima visita</div>}
              {!isMobile && <div>Total gastado</div>}
              <div style={{ textAlign: 'right' }}>{isMobile ? 'Visitas' : 'Visitas'}</div>
              <div />
            </div>
            {visibleClientes.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: TOKENS.textTer, fontSize: 13 }}>Sin resultados</div>
            )}
            <div className="m-stagger">
            {visibleClientes.map((cl, i) => {
              const tagColor = cl.tag === 'VIP' ? TOKENS.warning : cl.tag === 'Habitual' ? TOKENS.primary : TOKENS.success;
              const isSel = cl.id === selected;
              return (
                <div
                  key={cl.id}
                  className="m-card-hover"
                  onClick={() => { setSelected(cl.id); setActiveTab('resumen'); }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr 80px 32px' : '2fr 1fr 1fr 0.8fr 32px',
                    padding: '12px 16px',
                    borderBottom: i < visibleClientes.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isSel ? 'rgba(244,80,30,0.08)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <Avatar name={cl.nombre} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.nombre}</div>
                        <Pill color={tagColor}>{cl.tag}</Pill>
                        {!isMobile && cl.actividad === 'Inactiva' && <Pill color={TOKENS.textTer}>Inactiva</Pill>}
                        {!isMobile && cl.actividad === 'Riesgo abandono' && <Pill color={TOKENS.warning}>Riesgo</Pill>}
                        {!isMobile && cl.riesgo === 'Alto riesgo' && <Pill color={TOKENS.danger}>No-show</Pill>}
                        {!isMobile && cl.enRiesgoFuga && (
                          <Pill
                            color={TOKENS.cyan}
                            title={cl.recompensaFugaNombre
                              ? `Sin volver hace ${cl.diasFugaRetraso} dias (su media es ${cl.frecuencia_dias}). Oferta sugerida: ${cl.recompensaFugaNombre}`
                              : `Sin volver hace ${cl.diasFugaRetraso} dias (su media es ${cl.frecuencia_dias})`}
                          >
                            Fuga · {cl.diasFugaRetraso}d
                          </Pill>
                        )}
                        {!isMobile && cl.tocaRecompra && (
                          <Pill color="#8b5cf6">Recompra</Pill>
                        )}
                        {/* Alergias Pill */}
                        {(() => {
                          const alergiasTexto = (cl.alergias ?? '').trim();
                          if (alergiasTexto.length > 0) {
                            return (
                              <Pill color={TOKENS.danger} style={{ background: TOKENS.dangerSoft, borderColor: 'rgba(226,59,52,0.2)' }} title={`Alergias: ${alergiasTexto}`}>
                                ⚠️ Alergias
                              </Pill>
                            );
                          } else if (!isMobile) {
                            // En movil ocultamos "Sin alergias" (ruido en cada fila): solo
                            // se marca cuando SI hay alergias. Asi la fila no envuelve.
                            return (
                              <Pill color="#64748b" style={{ background: 'rgba(148,163,184,0.06)', borderColor: 'rgba(148,163,184,0.12)' }}>
                                Sin alergias
                              </Pill>
                            );
                          } else {
                            return null;
                          }
                        })()}

                        {/* Teléfono Pill */}
                        {!cl.telefono && (
                          <Pill color={TOKENS.warning} style={{ background: TOKENS.warningSoft, borderColor: 'rgba(224,138,0,0.2)' }}>
                            📞 Sin tlf
                          </Pill>
                        )}

                        {(() => {
                          // Cumpleanos proximo (proximos 7 dias): mismo criterio que la ficha y los avisos
                          if (!cl.fecha_nacimiento) return null;
                          const fn = new Date(cl.fecha_nacimiento);
                          if (isNaN(fn.getTime())) return null;
                          const today = new Date();
                          const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                          let next = new Date(today.getFullYear(), fn.getMonth(), fn.getDate());
                          let diff = Math.ceil((next.getTime() - t0) / 86400000);
                          if (diff < 0) { next = new Date(today.getFullYear() + 1, fn.getMonth(), fn.getDate()); diff = Math.ceil((next.getTime() - t0) / 86400000); }
                          if (diff < 0 || diff > 7) return null;
                          const txt = diff === 0 ? 'Cumple hoy' : diff === 1 ? 'Cumple mañana' : `Cumple en ${diff} días`;
                          return (
                            <span title={txt} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, background: 'rgba(251,146,60,0.14)', flexShrink: 0 }}>
                              <Icon name="cake" size={11} color="#fb923c" />
                            </span>
                          );
                        })()}
                      </div>
                      <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isMobile ? `${cl.visitas} vis. · ${cl.gastado}€` : (cl.telefono || cl.email || '—')}
                      </div>
                    </div>
                  </div>
                  {!isMobile && <div style={{ fontSize: 12, color: TOKENS.textSec }}>{cl.ultimaVisitaStr || '—'}</div>}
                  {!isMobile && <div style={{ fontSize: 13, color: TOKENS.success, fontWeight: 600 }}>{cl.gastado} €</div>}
                  <div style={{ textAlign: 'right', fontSize: 13, color: TOKENS.text, fontWeight: 600 }}>{cl.visitas}</div>
                  <div style={{ color: TOKENS.textTer, display: 'grid', placeItems: 'center' }}>
                    <Icon name="moreVertical" size={16} color={TOKENS.textTer} />
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {c && (
          <div key={c.id} className="m-slide-right" style={{ borderLeft: isMobile ? 'none' : `1px solid ${TOKENS.border}`, padding: panelExpanded ? '24px 0' : (isMobile ? '12px 0' : 24), overflowY: 'auto', background: 'linear-gradient(180deg, rgba(244,80,30,0.04), transparent 30%)', minWidth: 0 }}>
          <div style={{ maxWidth: panelExpanded ? 1400 : 'none', margin: panelExpanded ? '0 auto' : 0, padding: panelExpanded ? '0 32px' : (isMobile ? '0 16px' : 0) }}>
            {/* Toggle expand / Back button. En movil la barra queda fija (sticky)
                para que "Volver al listado" siga a mano aunque se baje por la ficha. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, position: isMobile ? 'sticky' : undefined, top: 0, zIndex: 5, background: isMobile ? TOKENS.bg : undefined, paddingTop: isMobile ? 8 : 0, paddingBottom: isMobile ? 8 : 0 }}>
              {isMobile ? (
                <button
                  onClick={() => { setSelected(null); setPanelExpanded(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                >
                  <Icon name="chevronLeft" size={16} color={TOKENS.text} />
                  <span>Volver</span>
                </button>
              ) : <span />}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => { setEditingCliente(c); setShowClienteModal(true); }}
                  style={{ padding: '6px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 8, color: TOKENS.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Icon name="edit" size={12} color={TOKENS.textSec} />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => eliminarClienteDirecto(c)}
                  style={{ padding: '6px 12px', background: 'transparent', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 8, color: TOKENS.danger, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Icon name="trash" size={12} color={TOKENS.danger} />
                  <span>Eliminar</span>
                </button>
                {!isMobile && (
                  <button
                    className="m-btn-icon"
                    onClick={() => setPanelExpanded((v) => !v)}
                    title={panelExpanded ? 'Reducir ficha' : 'Expandir ficha'}
                    style={{ width: 30, height: 30, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                  >
                    <Icon name={panelExpanded ? 'minimize' : 'maximize'} size={14} color={TOKENS.textSec} />
                  </button>
                )}
              </div>
            </div>
            {/* Ficha formal del cliente */}
            {(() => {
              const tagColor = c.tag === 'VIP' ? TOKENS.warning : c.tag === 'Habitual' ? TOKENS.primary : TOKENS.success;
              const cumpleStr = c.fecha_nacimiento
                ? (() => { const d = new Date(c.fecha_nacimiento); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' }); })()
                : '—';
              const desdeStr = c.primeraVisita
                ? c.primeraVisita.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                : null;
              return (
                <div style={{ position: 'relative', overflow: 'hidden', background: panelExpanded ? 'linear-gradient(135deg,#ffffff 0%,#fff7f2 58%,#ffe9dc 100%)' : TOKENS.bgCard, border: `1px solid ${panelExpanded ? 'rgba(244,80,30,0.20)' : TOKENS.border}`, borderRadius: panelExpanded ? 20 : 16, padding: panelExpanded ? 28 : (isMobile ? 16 : 18), marginBottom: 14, boxShadow: panelExpanded ? '0 18px 48px rgba(244,80,30,0.10), 0 2px 10px rgba(40,30,24,0.06)' : '0 1px 3px rgba(40,30,24,0.05)' }}>
                  {panelExpanded && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg,#e0340e,#ff7a2e,#ffcf4a)' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Avatar name={c.nombre} size={panelExpanded ? 66 : 56} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: panelExpanded ? 23 : 20, fontWeight: 700, color: TOKENS.text, letterSpacing: -0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</div>
                      <div style={{ fontSize: 12, color: TOKENS.textTer, fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {desdeStr ? `Cliente desde ${desdeStr}` : 'Cliente nuevo'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <Pill color={tagColor} title="Tipo por fidelidad (automatico): VIP = +10 visitas o +500 EUR gastados; Habitual = 3+ visitas; Nuevo = el resto. Informativo.">
                          <Icon name="star" size={11} color={tagColor} />
                          <span style={{ marginLeft: 4 }}>{c.tag}</span>
                        </Pill>
                        {c.actividad === 'Inactiva' && <Pill color={TOKENS.textTer} title="Sin visitas recientes. Informativo (util para campanas de recuperacion).">Inactiva</Pill>}
                        {c.actividad === 'Riesgo abandono' && <Pill color={TOKENS.warning} title="Hace tiempo que no viene. Informativo.">Riesgo abandono</Pill>}
                        {/* Riesgo de no-show (Sesion 7): score neutro derivado del historial
                            (ausencias, cancelaciones tardias, antiguedad). Solo medio/alto.
                            Sesion 7 V2: ahora ACCIONABLE de un clic ("Avisar" refuerza el
                            recordatorio de su proxima cita via el motor real de WhatsApp). */}
                        <RiesgoNoShowIndicator riesgo={c.riesgoNoShow} />
                        {c.riesgoNoShow && c.riesgoNoShow.nivel !== 'bajo' && (
                          <button
                            title="Refuerza el aviso de confirmacion de su proxima cita (lo reenvia el motor real de WhatsApp)."
                            onClick={() => avisarRiesgoNoShowUnClic(c)}
                            disabled={estadoAvisar.tipo === 'cargando'}
                            style={{ padding: '3px 10px', borderRadius: 999, border: `1px solid rgba(224,138,0,0.40)`, background: 'transparent', color: TOKENS.warning, fontSize: 11, fontWeight: 600, cursor: estadoAvisar.tipo === 'cargando' ? 'default' : 'pointer' }}
                          >
                            {estadoAvisar.tipo === 'cargando' ? 'Avisando...' : 'Avisar'}
                          </button>
                        )}
                        {/* Fuga (Sesion 7 V2): antes solo se veia en la lista, no en la ficha.
                            "Recuperar" registra la propuesta de vuelta real (mismo camino que el chatbot). */}
                        {c.enRiesgoFuga && (
                          <>
                            <Pill
                              color={TOKENS.cyan}
                              title={c.recompensaFugaNombre
                                ? `Sin volver hace ${c.diasFugaRetraso} dias (su media es ${c.frecuencia_dias}). Oferta sugerida: ${c.recompensaFugaNombre}`
                                : `Sin volver hace ${c.diasFugaRetraso} dias (su media es ${c.frecuencia_dias})`}
                            >
                              Fuga · {c.diasFugaRetraso}d
                            </Pill>
                            <button
                              title="Registra una propuesta de vuelta para que el equipo se la mande."
                              onClick={() => recuperarClienteUnClic(c)}
                              disabled={estadoRecuperar.tipo === 'cargando'}
                              style={{ padding: '3px 10px', borderRadius: 999, border: `1px solid rgba(8,145,178,0.40)`, background: 'transparent', color: TOKENS.cyan, fontSize: 11, fontWeight: 600, cursor: estadoRecuperar.tipo === 'cargando' ? 'default' : 'pointer' }}
                            >
                              {estadoRecuperar.tipo === 'cargando' ? 'Recuperando...' : 'Recuperar'}
                            </button>
                          </>
                        )}
                        {c.tocaRecompra && <Pill color="#8b5cf6" title="Ciclo habitual superado. Es probable que necesite agendar de nuevo.">Oportunidad Recompra</Pill>}
                        {c.bloqueado && <Pill color={TOKENS.danger} title="No puede reservar online. Se gestiona con el boton Bloquear.">Bloqueado</Pill>}
                        <button
                          title={c.bloqueado && c.bloqueo_motivo ? `Motivo: ${c.bloqueo_motivo}` : (c.bloqueado ? 'Cliente bloqueado' : 'Impedir que reserve online')}
                          onClick={async () => {
                            const nuevo = !c.bloqueado;
                            const motivo = nuevo ? (window.prompt('Motivo del bloqueo (opcional):', c.bloqueo_motivo || '') || null) : null;
                            const { error } = await supabase.from('clientes').update({ bloqueado: nuevo, bloqueo_motivo: motivo }).eq('id', c.id);
                            if (!error) setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, bloqueado: nuevo, bloqueo_motivo: motivo } : x)));
                          }}
                          style={{ marginLeft: 4, padding: '3px 10px', borderRadius: 999, border: `1px solid ${c.bloqueado ? TOKENS.border : 'rgba(226,59,52,0.40)'}`, background: 'transparent', color: c.bloqueado ? TOKENS.textSec : TOKENS.danger, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}
                        >
                          {c.bloqueado ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      </div>
                      {/* Resultado visible de Recuperar/Avisar (Sesion 7 V2): nunca un fallo
                          silencioso — siempre texto de exito o error, nunca solo un toast que desaparece. */}
                      {estadoRecuperar.tipo !== 'idle' && estadoRecuperar.tipo !== 'cargando' && (
                        <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6, color: estadoRecuperar.tipo === 'ok' ? TOKENS.success : TOKENS.danger }}>
                          {estadoRecuperar.mensaje}
                        </div>
                      )}
                      {estadoAvisar.tipo !== 'idle' && estadoAvisar.tipo !== 'cargando' && (
                        <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6, color: estadoAvisar.tipo === 'ok' ? TOKENS.success : estadoAvisar.tipo === 'sin_citas' ? TOKENS.textTer : TOKENS.danger }}>
                          {estadoAvisar.tipo === 'sin_citas' ? 'No tiene ninguna cita proxima a la que reforzar el aviso.' : estadoAvisar.mensaje}
                        </div>
                      )}
                      {/* Deposito segun tipo de cliente (senal al reservar online). Se configura en Ajustes > Politicas. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        <span title="Cuanto paga de senal este cliente al reservar online. 'Automatico' lo decide su historial (no-shows / citas completadas); las demas opciones lo fuerzan a mano. El comportamiento global se ajusta en Ajustes > Politicas." style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSec }}>Deposito (senal):</span>
                        <select
                          value={c.deposito_perfil_override ?? ''}
                          onChange={async (e) => {
                            const v = e.target.value || null;
                            const { error } = await supabase.from('clientes').update({ deposito_perfil_override: v }).eq('id', c.id);
                            if (!error) setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, deposito_perfil_override: v } : x)));
                          }}
                          style={{ padding: '7px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', transition: 'border-color 0.15s ease' }}
                        >
                          <option value="">Automatico (por historial)</option>
                          <option value="exento">Exento (no paga senal)</option>
                          <option value="normal">Normal (senal del servicio)</option>
                          <option value="riesgo">Riesgo (senal aumentada)</option>
                          <option value="alto">Prepago total</option>
                        </select>
                      </div>
                      {/* C6: etiquetas manuales (las reservadas de resena se gestionan abajo) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {(c.etiquetas ?? []).filter((et) => !TAGS_RESENA.includes(et)).map((et) => (
                          <span key={et} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, background: TOKENS.violetSoft, color: TOKENS.violet, fontSize: 11, fontWeight: 600 }}>
                            {et}
                            <button
                              aria-label={`Quitar ${et}`}
                              onClick={async () => {
                                const next = (c.etiquetas ?? []).filter((x) => x !== et);
                                await supabase.from('clientes').update({ etiquetas: next }).eq('id', c.id);
                                setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, etiquetas: next } : x)));
                              }}
                              style={{ border: 'none', background: 'transparent', color: TOKENS.violet, cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
                            >×</button>
                          </span>
                        ))}
                        <button
                          onClick={async () => {
                            const nueva = (window.prompt('Nueva etiqueta:', '') || '').trim();
                            if (!nueva) return;
                            const next = Array.from(new Set([...(c.etiquetas ?? []), nueva]));
                            await supabase.from('clientes').update({ etiquetas: next }).eq('id', c.id);
                            setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, etiquetas: next } : x)));
                          }}
                          style={{ padding: '2px 9px', borderRadius: 999, border: `1px dashed ${TOKENS.borderHi}`, background: 'transparent', color: TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >+ etiqueta</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : (panelExpanded ? 'repeat(4, 1fr)' : '1fr 1fr'), gap: isMobile ? '10px 14px' : '14px 18px', marginTop: isMobile ? 12 : 16, paddingTop: isMobile ? 12 : 16, borderTop: `1px solid ${TOKENS.border}` }}>
                    <ContactRow icon="phone" label="Teléfono" value={c.telefono || '—'} accent={c.telefono ? TOKENS.primary : undefined} />
                    <ContactRow icon="mail" label="Email" value={c.email || '—'} accent={c.email ? TOKENS.cyan : undefined} />
                    <ContactRow icon="cake" label="Cumpleaños" value={cumpleStr} accent={cumpleStr !== '—' ? '#fb923c' : undefined} />
                    <ContactRow icon="user" label="Prof. habitual" value={c.profHabitual || '—'} accent={c.profHabitual ? TOKENS.violet : undefined} />
                  </div>
                  {/* Seguimiento de resena (flag manual; las resenas del portal son anonimas) */}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${TOKENS.border}`, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.4 }}>¿Ha dejado reseña?</span>
                    {[{ tag: TAG_RESENO_SALON, label: 'Salón' }, { tag: TAG_RESENO_MECHA, label: 'Mecha' }].map(({ tag, label }) => {
                      const has = (c.etiquetas ?? []).includes(tag);
                      return (
                        <button
                          key={tag}
                          title={has ? `Marcado: ${tag}. Toca para quitar.` : `Marcar ${tag}`}
                          onClick={async () => {
                            const next = has
                              ? (c.etiquetas ?? []).filter((x) => x !== tag)
                              : Array.from(new Set([...(c.etiquetas ?? []), tag]));
                            const { error } = await supabase.from('clientes').update({ etiquetas: next }).eq('id', c.id);
                            if (!error) setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, etiquetas: next } : x)));
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, border: `1px solid ${has ? TOKENS.success : TOKENS.borderHi}`, background: has ? TOKENS.successSoft : 'transparent', color: has ? TOKENS.success : TOKENS.textSec, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {has && <Icon name="check" size={12} color={TOKENS.success} />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Alertas */}
            {alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className={a.type === 'allergy' ? 'm-slide-down m-pulse-red' : 'm-slide-down'}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: a.bg, border: `1px solid ${a.border}`, borderRadius: 10, color: a.color, fontSize: 12, fontWeight: 600, animationDelay: `${i * 0.06}s` }}
                  >
                    <div style={{ flexShrink: 0, marginTop: 1 }}><Icon name={a.icon} size={14} color={a.color} /></div>
                    <div style={{ flex: 1, color: a.color }}>{a.message}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { l: 'Reservar cita', icon: 'calendar', p: true, action: () => router.push({ pathname: '/screens/nueva-cita', params: { clienteId: c.id } } as any) },
                { l: 'Llamar', icon: 'phone', action: () => { if (c.telefono) window.location.href = `tel:${c.telefono}`; } },
                { l: 'Ficha PDF', icon: 'download', action: () => { void exportFichaPDF(c, citas, servicios); } },
                // Portabilidad RGPD (art. 20): descarga JSON con todos los datos de ESTA
                // clienta. El RPC valida owner/admin en servidor (igual que anonimizar).
                { l: 'Exportar (RGPD)', icon: 'download', action: () => { void exportDatosClienteJSON(c.id, c.nombre); } },
                // Fusionar una duplicada dentro de ESTA (que actua de maestra).
                { l: 'Fusionar dupl.', icon: 'copy', action: () => setFusionMaestro(c) },
              ].map((a, i) => (
                <button
                  key={i}
                  className={a.p ? 'm-btn-primary' : 'm-btn-secondary'}
                  onClick={a.action}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 8px',
                    background: a.p ? 'linear-gradient(180deg,#ff7a2e,#f4501e)' : TOKENS.bgCard,
                    border: a.p ? '1px solid rgba(255,255,255,0.12)' : `1px solid ${TOKENS.border}`,
                    borderRadius: 12,
                    color: a.p ? '#fff' : TOKENS.text,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: a.p ? '0 4px 14px rgba(244,80,30,0.4)' : 'none',
                  }}
                >
                  <Icon name={a.icon} size={18} color={a.p ? '#fff' : TOKENS.text} />
                  <span>{a.l}</span>
                </button>
              ))}
            </div>

            {/* Q&A de ficha (Sesion 7 V2): pregunta libre sobre ESTA clienta, con
                el id embebido en el prompt (ficha_cliente la resuelve sin ambiguedad).
                Regla dura de salud: la aplica el edge/tool, no hay logica aqui. */}
            {c.consiente_ia === false ? (
              <div style={{ background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14, fontSize: 12.5, color: TOKENS.textTer }}>
                Esta clienta no ha dado consentimiento para que la IA use sus datos.
              </div>
            ) : (
              <FichaPreguntaIA
                nombreCliente={c.nombre}
                pregunta={preguntaFicha}
                onChangePregunta={setPreguntaFicha}
                onPreguntar={() => preguntarFichaIA(c)}
                estado={ayudaFichaIA.estado}
                onReintentar={ayudaFichaIA.reintentar}
                accionEstado={accionEstadoFichaIA}
                onConfirmarAccion={confirmarAccionFichaIA}
                onCancelarAccion={() => setAccionEstadoFichaIA('cancelada')}
              />
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: panelExpanded ? 14 : 8, marginBottom: panelExpanded ? 18 : 14 }}>
              <div className="m-stat"><MiniStat label="Visitas" value={c.visitas} tone={TOKENS.primary} big={panelExpanded} /></div>
              <div className="m-stat"><MiniStat label="Total" value={`${c.gastado}€`} tone={TOKENS.success} big={panelExpanded} /></div>
              <div className="m-stat"><MiniStat label="Ticket medio" value={`${Math.round((c.gastado || 0) / Math.max(c.visitas || 1, 1))}€`} tone={TOKENS.warning} big={panelExpanded} /></div>
            </div>

            {/* Tabs (solo en modo compacto) */}
            {!panelExpanded && <Tabs active={activeTab} onChange={setActiveTab} />}

            {!panelExpanded ? (
              // Modo compacto: contenido segun pestaña activa
              <div key={activeTab} className="m-tab-content">
                {activeTab === 'resumen' && (
                  <>
                    <ResumenTab cliente={c} citas={citas} servicios={servicios} />
                    <NotasClienteSection cliente={c} plantillas={plantillasNota} onUpdated={(updated) => {
                      setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                    }} />
                    <div style={{ marginTop: 14 }}><FotosClienteSection cliente={c} negocioId={negocioId} /></div>
                  </>
                )}
                {activeTab === 'notas' && <NotasTab cliente={c} catalogoAlergias={catalogoAlergias} onSaveToCatalog={addAlergiaToCatalog} onUpdated={(updated) => {
                  setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                  triggerRefresh();
                }} />}
                {activeTab === 'color' && <ColorTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} negocioId={negocioId} onChanged={async () => { await cargar(); triggerRefresh(); }} onGoToNotas={() => setActiveTab('notas')} />}
                {activeTab === 'historial' && <HistorialTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} />}
              </div>
            ) : (
              // Modo expandido: todas las secciones a la vez en cuadricula
              <div className="m-tab-content m-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Fila 1: Resumen (banda completa) */}
                <Panel title="Resumen" accent={TOKENS.primary}>
                  <ResumenTab cliente={c} citas={citas} servicios={servicios} />
                </Panel>

                {/* Fila 1.5: Notas y preferencias persistentes del cliente */}
                <Panel title="Notas y preferencias" accent={TOKENS.primary}>
                  <NotasClienteSection cliente={c} plantillas={plantillasNota} bare onUpdated={(updated) => {
                    setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                  }} />
                </Panel>

                {/* Fila 1.6: Fotos de servicios (galeria de cortes/colores, como la landing) */}
                <Panel title="Fotos de servicios" accent={TOKENS.primary}>
                  <FotosClienteSection cliente={c} negocioId={negocioId} bare />
                </Panel>

                {/* Fila 1.7: Consentimientos RGPD */}
                <Panel title="Consentimientos" accent={TOKENS.cyan}>
                  <ConsentimientosSection cliente={c} negocioId={negocioId} />
                </Panel>

                {/* Fila 1.8: Fidelizacion */}
                <Panel title="Fidelización" accent={TOKENS.warning}>
                  <FidelizacionCard
                    clienteId={c.id}
                    visitas={c.visitas || 0}
                    negocioId={negocioId}
                  />
                </Panel>

                {/* Fila 1.9: Bonos */}
                <Panel title="Bonos activos" accent={TOKENS.success}>
                  <BonosClienteSection clienteId={c.id} />
                </Panel>

                {/* Fila 2: Notas + Color/Quimica (50/50) */}
                <div style={{ display: 'grid', gridTemplateColumns: (isMobile || isTablet) ? '1fr' : '1fr 1fr', gap: 18 }}>
                  <Panel title="Alergias" accent={TOKENS.danger}>
                    <NotasTab cliente={c} catalogoAlergias={catalogoAlergias} onSaveToCatalog={addAlergiaToCatalog} onUpdated={(updated) => {
                      setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                      triggerRefresh();
                    }} />
                  </Panel>
                  <Panel title="Color / Química" accent={TOKENS.violet}>
                    <ColorTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} negocioId={negocioId} onChanged={async () => { await cargar(); triggerRefresh(); }} onGoToNotas={() => setActiveTab('notas')} />
                  </Panel>
                </div>

                {/* Fila 3: Historial completo */}
                <Panel title="Historial completo" accent={TOKENS.success}>
                  <HistorialTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} />
                </Panel>
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {showImportModal && (
        <ImportModal
          negocioId={negocioId}
          onClose={() => setShowImportModal(false)}
          onSaved={async () => { setShowImportModal(false); await cargar(); triggerRefresh(); }}
        />
      )}

      {showClienteModal && (
        <ClienteModal
          cliente={editingCliente}
          negocioId={negocioId}
          onClose={() => { setShowClienteModal(false); setEditingCliente(null); }}
          onSaved={async () => { setShowClienteModal(false); setEditingCliente(null); await cargar(); triggerRefresh(); }}
          onDeleted={async () => { setShowClienteModal(false); setEditingCliente(null); setSelected(null); await cargar(); triggerRefresh(); }}
        />
      )}
      {showManualPanel && (
        <ManualPanel
          content={manualClientes}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
      {fusionMaestro && (
        <FusionClienteModal
          maestro={fusionMaestro}
          clientes={clientes}
          isMobile={isMobile}
          onClose={() => setFusionMaestro(null)}
          onDone={async () => { setFusionMaestro(null); await cargar(); triggerRefresh(); }}
        />
      )}
    </div>
  );
}

// Fusion de clientas duplicadas: la 'maestra' es la ficha abierta; el gestor elige la
// duplicada a absorber. Todo (citas, cobros, historial...) se mueve a la maestra y la
// duplicada se borra, via RPC transaccional fusionar_clientes (owner/admin, server-side).
function FusionClienteModal({ maestro, clientes, isMobile, onClose, onDone }: {
  maestro: Cliente; clientes: Cliente[]; isMobile: boolean;
  onClose: () => void; onDone: () => Promise<void> | void;
}) {
  const [q, setQ] = useState('');
  const [dup, setDup] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const candidatos = useMemo(() => {
    const term = norm(q.trim());
    return clientes
      .filter((x) => x.id !== maestro.id)
      .filter((x) => {
        if (!term) {
          // Sin busqueda, sugiere las que comparten telefono o nombre con la maestra.
          const mismoTel = !!maestro.telefono && x.telefono === maestro.telefono;
          const mismoNombre = norm(x.nombre || '') === norm(maestro.nombre || '');
          return mismoTel || mismoNombre;
        }
        return norm(x.nombre || '').includes(term) || (x.telefono || '').includes(q.trim());
      })
      .slice(0, 8);
  }, [q, clientes, maestro]);

  const fusionar = async () => {
    if (!dup) return;
    setLoading(true);
    setError('');
    type Resp = { ok: boolean; error?: string; citas_movidas?: number };
    const { data, error: err } = await supabase.rpc('fusionar_clientes', { p_maestro: maestro.id, p_duplicado: dup.id });
    const resp = (data ?? null) as Resp | null;
    setLoading(false);
    if (err || !resp?.ok) {
      setError(err ? mensajeDeError(err, 'No se pudo fusionar.') : (resp?.error || 'No se pudo fusionar.'));
      return;
    }
    await onDone();
  };

  return (
    <div className="m-overlay-enter" style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 120, padding: isMobile ? 12 : 24 }}>
      <div className="m-modal-enter" style={{ width: isMobile ? '100%' : 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: isMobile ? 16 : 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>Fusionar duplicada</h3>
          <button className="m-btn-icon" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={14} color={TOKENS.textSec} />
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: TOKENS.textSec, lineHeight: 1.5, marginBottom: 14 }}>
          Todo (citas, cobros, historial, notas...) pasara a <strong style={{ color: TOKENS.text }}>{maestro.nombre}</strong> y la clienta duplicada se eliminara. Esta accion no se puede deshacer.
        </div>

        <div style={{ marginBottom: 10 }}>
          <input value={q} onChange={(e) => { setQ(e.target.value); setDup(null); }} placeholder="Buscar la clienta duplicada (nombre o telefono)"
            style={{ width: '100%', height: 44, padding: '0 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {candidatos.length === 0 ? (
            <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '6px 2px' }}>
              {q.trim() ? 'Sin coincidencias.' : 'Escribe para buscar la duplicada.'}
            </div>
          ) : candidatos.map((x) => {
            const sel = dup?.id === x.id;
            return (
              <button key={x.id} onClick={() => setDup(x)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: sel ? 'rgba(244,80,30,0.10)' : TOKENS.bgCard, border: `1px solid ${sel ? TOKENS.primary : TOKENS.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>{x.nombre}</div>
                  <div style={{ fontSize: 11.5, color: TOKENS.textTer }}>{x.telefono || 'Sin telefono'}</div>
                </div>
                {sel ? <Icon name="check" size={16} color={TOKENS.primary} /> : null}
              </button>
            );
          })}
        </div>

        {error ? <div style={{ padding: '10px 12px', background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 10, color: TOKENS.danger, fontSize: 12, marginBottom: 12 }}>{error}</div> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${TOKENS.border}` }}>
          <button className="m-btn-secondary" onClick={onClose} disabled={loading} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
          <button className="m-btn-primary" onClick={fusionar} disabled={loading || !dup} style={{ padding: '9px 14px', background: dup ? `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)` : TOKENS.bgCard, color: dup ? '#fff' : TOKENS.textTer, border: 'none', borderRadius: 10, cursor: loading || !dup ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
            {loading ? 'Fusionando...' : 'Fusionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tabs
function Tabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'notas', label: 'Alergias' },
    { key: 'color', label: 'Color/Quimica' },
    { key: 'historial', label: 'Historial' },
  ];
  return (
    <div style={{ display: 'flex', gap: 4, padding: 3, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, marginBottom: 14 }}>
      {items.map((it) => {
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            className="m-chip"
            onClick={() => onChange(it.key)}
            style={{
              flex: 1,
              padding: '7px 6px',
              background: isActive ? TOKENS.bgCardHi : 'transparent',
              border: 'none',
              borderRadius: 8,
              color: isActive ? TOKENS.text : TOKENS.textSec,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: isActive ? '0 1px 0 rgba(255,255,255,0.06)' : 'none',
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tab: Resumen
function ResumenTab({ cliente, citas, servicios }: { cliente: Cliente; citas: Cita[]; servicios: any[] }) {
  const now = new Date();
  const nextCita = citas
    .filter((cit) => cit.cliente_id === cliente.id && new Date(cit.inicio) > now)
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0];

  return (
    <>
      {cliente.fav && (
        <Section title="Servicio preferido">
          <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{cliente.fav}</div>
              <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 2 }}>Solicitado {cliente.favCount} veces</div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.14)', color: TOKENS.warning, display: 'grid', placeItems: 'center' }}>
              <Icon name="star" size={18} color={TOKENS.warning} />
            </div>
          </div>
        </Section>
      )}

      <Section title="Proxima cita">
        {!nextCita && <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '10px 0' }}>Sin citas proximas</div>}
        {nextCita && (() => {
          const citaDate = new Date(nextCita.inicio);
          const dateStr = citaDate.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase();
          const srv = servicios.find((s) => s.id === nextCita.servicio_id);
          const serviceName = srv?.nombre || 'Servicio';
          const price = srv?.precio ?? '-';
          const duration = Math.round((new Date(nextCita.fin).getTime() - new Date(nextCita.inicio).getTime()) / 60000);
          return (
            <div style={{ background: 'linear-gradient(180deg, rgba(244,80,30,0.12), rgba(244,80,30,0.04))', border: `1px solid rgba(244,80,30,0.30)`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.primaryHi, letterSpacing: 0.4 }}>{dateStr}</span>
                <Pill color={TOKENS.primary}>Programada</Pill>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{serviceName}</div>
              <div style={{ fontSize: 11, color: TOKENS.textSec, marginTop: 2 }}>{duration} min · {price} €</div>
            </div>
          );
        })()}
      </Section>
    </>
  );
}

// ── Notas y preferencias persistentes del cliente (campo clientes.notas).
// Siempre visible en la ficha; admite cargar plantillas de notas del salon.
function NotasClienteSection({ cliente, plantillas = [], onUpdated, bare = false }: {
  cliente: Cliente;
  plantillas?: { nombre: string; texto: string }[];
  onUpdated: (updated: Partial<Cliente> & { id: string }) => void;
  bare?: boolean;
}) {
  const [notas, setNotas] = useState((cliente.notas ?? '').trim());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { setNotas((cliente.notas ?? '').trim()); }, [cliente.id]);

  async function persist(next: string) {
    const trimmed = next.trim();
    setError(''); setSaving(true);
    const payload = { notas: trimmed || null };
    const { error } = await supabase.from('clientes').update(payload).eq('id', cliente.id);
    setSaving(false);
    if (error) { setError(mensajeDeError(error)); return; }
    onUpdated({ id: cliente.id, ...payload });
  }
  function save() { void persist(notas); }

  // Inserta una plantilla: si ya hay notas, la anade en una linea nueva.
  function aplicarPlantilla(texto: string) {
    const base = notas.trim();
    const next = base ? `${base}\n${texto}` : texto;
    setNotas(next);
    setPickerOpen(false);
    void persist(next);
  }

  const body = (
    <>
      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        onBlur={save}
        placeholder="Preferencias y detalles del cliente: 'le gusta el pelo mas corto', 'acabado con mas brillo', bebida, conversacion, etc."
        style={{
          width: '100%', minHeight: 120, padding: 12,
          background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`,
          borderRadius: 10, color: TOKENS.text, fontSize: 12, fontFamily: 'inherit',
          outline: 'none', resize: 'vertical', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, color: error ? TOKENS.danger : TOKENS.textTer }}>
          {saving ? 'Guardando...' : (error || 'Se guarda al salir del campo')}
        </div>
        {plantillas.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
                borderRadius: 8, cursor: 'pointer', background: TOKENS.bgCardHi,
                border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec,
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              <Icon name="plus" size={12} color={TOKENS.textTer} /> Plantillas
            </button>
            {pickerOpen && (
              <div style={{
                position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', zIndex: 20,
                minWidth: 230, maxHeight: 240, overflowY: 'auto', background: TOKENS.bgPanel,
                border: `1px solid ${TOKENS.borderHi}`, borderRadius: 10,
                boxShadow: '0 12px 30px rgba(0,0,0,0.35)', padding: 6,
              }}>
                {plantillas.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => aplicarPlantilla(p.texto)}
                    title={p.texto}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                      borderRadius: 7, cursor: 'pointer', background: 'transparent', border: 'none',
                      color: TOKENS.text, fontSize: 12, fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = TOKENS.bgCardHi; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: TOKENS.textTer, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.texto}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
  return bare ? body : <Section title="Notas y preferencias">{body}</Section>;
}

// ── Tab: Alergias
function NotasTab({ cliente, onUpdated, catalogoAlergias = [], onSaveToCatalog }: {
  cliente: Cliente;
  citas?: Cita[];
  profesionales?: any[];
  servicios?: any[];
  onUpdated: (updated: Partial<Cliente> & { id: string }) => void;
  catalogoAlergias?: string[];
  onSaveToCatalog?: (term: string) => Promise<void>;
}) {
  const [alergias, setAlergias] = useState((cliente.alergias ?? '').trim());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState('');
  const [guardarEnCatalogo, setGuardarEnCatalogo] = useState(false);

  useEffect(() => {
    setAlergias((cliente.alergias ?? '').trim());
  }, [cliente.id]);

  // Términos actuales (separados por coma o salto de línea)
  const terms = alergias.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
  const hasTerm = (t: string) => terms.some((x) => x.toLowerCase() === t.toLowerCase());

  async function persist(next: string) {
    const trimmed = next.trim();
    setAlergias(trimmed);
    setError('');
    setSaving(true);
    const payload = { alergias: trimmed || null };
    const { error } = await supabase.from('clientes').update(payload).eq('id', cliente.id);
    setSaving(false);
    if (error) { setError(mensajeDeError(error)); return; }
    onUpdated({ id: cliente.id, ...payload });
  }

  function save() { void persist(alergias); }

  function toggleTerm(t: string) {
    if (hasTerm(t)) {
      void persist(terms.filter((x) => x.toLowerCase() !== t.toLowerCase()).join(', '));
    } else {
      void persist(terms.length ? `${terms.join(', ')}, ${t}` : t);
    }
  }

  async function addCustom() {
    const t = custom.trim();
    if (!t) return;
    if (!hasTerm(t)) {
      await persist(terms.length ? `${terms.join(', ')}, ${t}` : t);
    }
    if (guardarEnCatalogo && onSaveToCatalog) await onSaveToCatalog(t);
    setCustom('');
    setGuardarEnCatalogo(false);
  }

  const hayAlergias = alergias.trim().length > 0;

  return (
    <>
      {/* Aviso visible cuando hay alergias */}
      {hayAlergias && (
        <div className="m-pulse-red" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.35)`, borderRadius: 10, marginBottom: 12 }}>
          <Icon name="alert" size={16} color={TOKENS.danger} />
          <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: TOKENS.danger, whiteSpace: 'pre-wrap' as any, lineHeight: 1.4 }}>
            Atencion: este cliente tiene alergias registradas
          </div>
        </div>
      )}

      {/* Alergias frecuentes: toggle rápido desde el catálogo del centro */}
      {catalogoAlergias.length > 0 && (
        <Section title="Alergias frecuentes">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {catalogoAlergias.map((a) => {
              const active = hasTerm(a);
              return (
                <button
                  key={a}
                  onClick={() => toggleTerm(a)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
                    background: active ? TOKENS.dangerSoft : TOKENS.bgCardHi,
                    border: `1px solid ${active ? 'rgba(239,68,68,0.45)' : TOKENS.border}`,
                    color: active ? TOKENS.danger : TOKENS.textSec,
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  }}
                >
                  <Icon name={active ? 'check' : 'plus'} size={12} color={active ? TOKENS.danger : TOKENS.textTer} />
                  {a}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 8 }}>
            Toca para añadir o quitar. Gestiona la lista en Configuracion &gt; Plantillas.
          </div>
        </Section>
      )}

      <Section title="Alergias del cliente">
        <textarea
          value={alergias}
          onChange={(e) => setAlergias(e.target.value)}
          onBlur={() => save()}
          placeholder="Anota cualquier alergia o reaccion previa relevante (parafenilendiamina, amoniaco, fragancias, latex...)"
          style={{
            width: '100%',
            minHeight: 130,
            padding: 12,
            background: hayAlergias ? 'rgba(239,68,68,0.06)' : TOKENS.bgCard,
            border: `1px solid ${hayAlergias ? 'rgba(239,68,68,0.35)' : TOKENS.border}`,
            borderRadius: 10,
            color: hayAlergias ? TOKENS.danger : TOKENS.text,
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4, height: 12 }}>
          {saving ? 'Guardando...' : 'Se guarda al salir del campo'}
        </div>

        {/* Añadir alergia personalizada con opción de guardar en el catálogo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addCustom(); } }}
            placeholder="Añadir otra alergia..."
            style={{
              flex: 1, minWidth: 160, padding: '8px 11px',
              background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`,
              borderRadius: 9, color: TOKENS.text, fontSize: 12,
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => setGuardarEnCatalogo((v) => !v)}
            title="Guardar tambien en alergias frecuentes del centro"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
              background: guardarEnCatalogo ? TOKENS.bgCardHi : 'transparent',
              border: `1px solid ${guardarEnCatalogo ? TOKENS.borderHi : TOKENS.border}`,
              color: guardarEnCatalogo ? TOKENS.text : TOKENS.textSec,
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <span style={{
              width: 16, height: 16, borderRadius: 5, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              background: guardarEnCatalogo ? TOKENS.primary : 'transparent',
              border: `1px solid ${guardarEnCatalogo ? TOKENS.primary : TOKENS.borderHi}`,
            }}>
              {guardarEnCatalogo && <Icon name="check" size={10} color="#fff" />}
            </span>
            Guardar en frecuentes
          </button>
          <button
            onClick={() => void addCustom()}
            disabled={!custom.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 9,
              cursor: custom.trim() ? 'pointer' : 'not-allowed',
              background: custom.trim() ? TOKENS.primary : TOKENS.bgCardHi,
              border: `1px solid ${custom.trim() ? TOKENS.primary : TOKENS.border}`,
              color: custom.trim() ? '#fff' : TOKENS.textTer,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            <Icon name="plus" size={13} color={custom.trim() ? '#fff' : TOKENS.textTer} />
            Añadir
          </button>
        </div>
      </Section>

      {error && <div style={{ fontSize: 11, color: TOKENS.danger, marginTop: 4 }}>{error}</div>}
    </>
  );
}

// ── Tab: Color/Quimica (usa fichas_tecnicas_color + fallback a campos legacy en citas)
function ColorTab({ cliente, citas, servicios, profesionales, fichasTecnicas, negocioId, onChanged, onGoToNotas }: { cliente: Cliente; citas: Cita[]; servicios: any[]; profesionales: any[]; fichasTecnicas: any[]; negocioId: string; onChanged: () => Promise<void>; onGoToNotas?: () => void; }) {
  const [editingFicha, setEditingFicha] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showTryOn, setShowTryOn] = useState(false);
  const [traduciendoId, setTraduciendoId] = useState<string | null>(null);

  async function handleTraducirFormula(ficha: any, marcaDestino: string) {
    if (!marcaDestino.trim()) return;
    setTraduciendoId(ficha.id);
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error('Sin sesion');
      const r = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/traductor-marcas`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ formula: ficha, marca_destino: marcaDestino }),
      });
      if (!r.ok) throw new Error('Error al traducir formula');
      const res = await r.json();
      
      const disclaimer = res.disclaimer || "orientativo, verifica con tu carta de color";

      const oxNum = parseInt(String(res.oxidante ?? ''), 10);

      // Se construye una ficha nueva (sin id) con las columnas reales de
      // fichas_tecnicas_color. Se conserva ...ficha para heredar tipo_servicio
      // (NOT NULL) y demas campos de la ficha origen.
      const nuevaFicha = {
        ...ficha,
        id: undefined,
        marca_producto: res.producto || marcaDestino,
        formula: [{ numero: res.tono || '', gramos: res.gramos ? String(res.gramos) : '' }],
        oxidante_volumen: Number.isFinite(oxNum) ? oxNum : null,
        resultado_notas: `Traducción: ${res.formula_nueva}\n\nATENCIÓN: ${disclaimer}`,
        cerrada: false
      };
      
      setEditingFicha(nuevaFicha);
    } catch (e) {
      alert('No se pudo traducir la fórmula.');
    } finally {
      setTraduciendoId(null);
    }
  }

  const clientCitas = citas
    .filter((cit) => cit.cliente_id === cliente.id)
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());

  // Fichas estructuradas de la nueva tabla
  const fichasCliente = fichasTecnicas.filter((f: any) => f.cliente_id === cliente.id);

  // Formulas legacy (campos texto en citas, para retrocompatibilidad)
  const formulasLegacy = clientCitas.filter((cit) => (
    (cit.formula_producto && cit.formula_producto.trim()) ||
    (cit.formula_tono && cit.formula_tono.trim()) ||
    (cit.formula_tiempo_min != null) ||
    (cit.formula_resultado && cit.formula_resultado.trim()) ||
    (cit.formula_notas && cit.formula_notas.trim())
  ));

  // Si no tiene fichas estructuradas, mostrar las legacy
  const usarLegacy = fichasCliente.length === 0 && formulasLegacy.length > 0;
  const totalFormulas = fichasCliente.length + (usarLegacy ? formulasLegacy.length : 0);

  const hasCitas = clientCitas.length > 0;

  const TIPOS_SERVICIO_MAP: Record<string, string> = {
    coloracion_global: 'Color global', color_raiz: 'Color raiz', mechas: 'Mechas',
    balayage: 'Balayage', decoloracion: 'Decoloracion', matiz: 'Matiz',
    bano_color: 'Bano de color', correccion_color: 'Correccion', color_fantasia: 'Color fantasia', otro: 'Otro',
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600 }}>
          {totalFormulas} {totalFormulas === 1 ? 'formula' : 'formulas'} registrada{totalFormulas === 1 ? '' : 's'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="m-btn-secondary"
            onClick={() => setShowTryOn(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.primary}`, color: TOKENS.primary, borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          >
            <Icon name="sparkle" size={12} color={TOKENS.primary} />
            Probar Color IA ✨
          </button>
          <button
            className="m-btn-secondary"
            onClick={() => setShowAdd(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          >
            <Icon name="plus" size={12} color={TOKENS.text} />
            Nueva formula
          </button>
        </div>
      </div>

      {totalFormulas === 0 ? (
        <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 18, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: 10, background: 'rgba(192,38,10,0.10)', borderRadius: 999, color: TOKENS.violet, marginBottom: 8 }}>
            <Icon name="droplet" size={20} color={TOKENS.violet} />
          </div>
          <div style={{ fontSize: 12, color: TOKENS.textSec, marginBottom: 4 }}>Sin formulas registradas</div>
          <div style={{ fontSize: 11, color: TOKENS.textTer }}>Pulsa "Nueva formula" para anadir una</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Fichas estructuradas (nueva tabla) */}
          {fichasCliente.map((ficha: any) => {
            const fecha = new Date(ficha.created_at);
            const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            const prof = profesionales.find((p: any) => p.id === ficha.profesional_id);
            const tipoLabel = TIPOS_SERVICIO_MAP[ficha.tipo_servicio] || ficha.tipo_servicio;
            const formulaArr = Array.isArray(ficha.formula) ? ficha.formula : [];

            return (
              <div
                key={ficha.id}
                onClick={() => setEditingFicha(ficha)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(192,38,10,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateY(0)'; }}
                style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12, cursor: 'pointer', transition: 'transform 0.15s ease, border-color 0.15s ease' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.violet, letterSpacing: 0.4, textTransform: 'uppercase' }}>{fechaStr}</span>
                    <Pill color={TOKENS.violet}>{tipoLabel}</Pill>
                    {ficha.cerrada && (
                      <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.10)', color: TOKENS.warning, fontSize: 9, fontWeight: 700, letterSpacing: 0.4 }}>CERRADA</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {prof && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: TOKENS.textSec }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: prof.color }} />
                        {prof.nombre}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const marca = prompt('¿A qué marca quieres traducir esta fórmula? (Ej. Wella, Schwarzkopf)');
                        if (marca) handleTraducirFormula(ficha, marca);
                      }}
                      disabled={traduciendoId === ficha.id}
                      style={{ padding: '4px 8px', borderRadius: 6, background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: traduciendoId === ficha.id ? 'wait' : 'pointer', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Icon name="refreshCcw" size={10} color={TOKENS.textSec} />
                      {traduciendoId === ficha.id ? 'Traduciendo...' : 'Traducir marca'}
                    </button>
                    <Icon name="edit" size={11} color={TOKENS.textTer} />
                  </div>
                </div>

                {/* Formula estructurada (jsonb array de {numero, gramos}) */}
                {formulaArr.length > 0 && (
                  <div style={{ background: TOKENS.bgCardHi, borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontFamily: 'monospace' }}>
                    <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Formula</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text }}>
                      {formulaArr.map((f: any) => `${f.numero || '?'}${f.gramos ? ` (${f.gramos}g)` : ''}`).join('  +  ')}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {ficha.marca_producto && <FieldKV label="Marca" value={ficha.marca_producto} />}
                  {ficha.oxidante_volumen != null && <FieldKV label="Oxidante" value={`${ficha.oxidante_volumen} vol`} />}
                  {ficha.tiempo_exposicion_min != null && <FieldKV label="Tiempo" value={`${ficha.tiempo_exposicion_min} min`} />}
                  {Array.isArray(ficha.tecnica_aplicacion) && ficha.tecnica_aplicacion.length > 0 && <FieldKV label="Tecnica" value={ficha.tecnica_aplicacion.join(', ')} />}
                </div>

                {ficha.resultado_notas && (
                  <div style={{ marginTop: 8, fontSize: 12, color: TOKENS.textSec, background: TOKENS.bgCardHi, padding: '6px 8px', borderRadius: 6, fontStyle: 'italic' }}>
                    <span>{ficha.resultado_notas}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Formulas legacy (retrocompatibilidad) */}
          {usarLegacy && formulasLegacy.map((cit) => {
            const fecha = new Date(cit.inicio);
            const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            const srv = servicios.find((s: any) => s.id === cit.servicio_id);
            const prof = profesionales.find((p: any) => p.id === cit.profesional_id);
            return (
              <div
                key={cit.id}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(192,38,10,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateY(0)'; }}
                style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12, transition: 'transform 0.15s ease, border-color 0.15s ease' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.violet, letterSpacing: 0.4, textTransform: 'uppercase' }}>{fechaStr}</div>
                    <Pill color={TOKENS.textTer}>Legacy</Pill>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {prof && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: TOKENS.textSec }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: prof.color }} />
                        {prof.nombre}
                      </div>
                    )}
                    <Icon name="edit" size={11} color={TOKENS.textTer} />
                  </div>
                </div>
                {srv?.nombre && <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text, marginBottom: 6 }}>{srv.nombre}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {cit.formula_producto && <FieldKV label="Producto" value={cit.formula_producto} />}
                  {cit.formula_tono && <FieldKV label="Tono" value={cit.formula_tono} />}
                  {cit.formula_tiempo_min != null && <FieldKV label="Tiempo" value={`${cit.formula_tiempo_min} min`} />}
                  {cit.formula_resultado && <FieldKV label="Resultado" value={cit.formula_resultado} full />}
                  {cit.formula_notas && <FieldKV label="Notas" value={cit.formula_notas} full />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(editingFicha || showAdd) && (
        <FichaColorModal
          mode={editingFicha ? 'edit' : 'add'}
          ficha={editingFicha}
          clienteId={cliente.id}
          negocioId={negocioId}
          citasCliente={clientCitas}
          servicios={servicios}
          profesionales={profesionales}
          onClose={() => { setEditingFicha(null); setShowAdd(false); }}
          onSaved={async () => { setEditingFicha(null); setShowAdd(false); await onChanged(); }}
          onGoToNotas={onGoToNotas}
        />
      )}
      {showTryOn && (
        <ColorTryOnModal 
          cliente={cliente}
          negocioId={negocioId}
          onClose={() => setShowTryOn(false)}
          onSaved={async () => { setShowTryOn(false); await onChanged(); }}
        />
      )}
    </>
  );
}

export function FichaColorModal({ mode, ficha, clienteId, negocioId, citasCliente, servicios, profesionales, onClose, onSaved, onGoToNotas }: {
  mode: 'add' | 'edit';
  ficha: any | null;
  clienteId: string;
  negocioId: string;
  citasCliente: Cita[];
  servicios: any[];
  profesionales: any[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onGoToNotas?: () => void;
}) {
  const { isMobile } = useResponsive();
  const isLocked = false;

  const TIPOS_SERVICIO = [
    { key: 'coloracion_global', label: 'Color global' }, { key: 'color_raiz', label: 'Color raiz' },
    { key: 'mechas', label: 'Mechas' }, { key: 'balayage', label: 'Balayage' },
    { key: 'decoloracion', label: 'Decoloracion' }, { key: 'matiz', label: 'Matiz' },
    { key: 'bano_color', label: 'Bano de color' }, { key: 'correccion_color', label: 'Correccion' },
    { key: 'color_fantasia', label: 'Color fantasia' }, { key: 'otro', label: 'Otro' },
  ];

  const TECNICAS = ['Pincel', 'Peine', 'Mano', 'Papel meche', 'Gorro', 'Balayage libre', 'Foilyage'];
  const OXIDANTES_VOL = [10, 20, 30, 40];

  const [marcaProducto, setMarcaProducto] = useState(ficha?.marca_producto ?? '');
  const [formulaEntries, setFormulaEntries] = useState<{ numero: string; gramos: string }[]>(
    Array.isArray(ficha?.formula) && ficha.formula.length > 0
      ? ficha.formula.map((f: any) => ({ numero: f.numero ?? '', gramos: f.gramos != null ? String(f.gramos) : '' }))
      : [{ numero: '', gramos: '' }]
  );
  const [tipoServicio, setTipoServicio] = useState(ficha?.tipo_servicio ?? 'coloracion_global');
  const [tecnicas, setTecnicas] = useState<string[]>(Array.isArray(ficha?.tecnica_aplicacion) ? ficha.tecnica_aplicacion : []);
  const [oxidanteVol, setOxidanteVol] = useState(ficha?.oxidante_volumen != null ? String(ficha.oxidante_volumen) : '');
  const [tiempoExp, setTiempoExp] = useState(ficha?.tiempo_exposicion_min != null ? String(ficha.tiempo_exposicion_min) : '');
  const [resultadoNotas, setResultadoNotas] = useState(ficha?.resultado_notas ?? '');
  const [profesionalId, setProfesionalId] = useState(ficha?.profesional_id ?? '');
  const [citaId, setCitaId] = useState(ficha?.cita_id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { estado: estadoVoz, errorVoz, iniciarEscucha, detenerEscucha } = useChispaVoz();
  const [dictadoWarn, setDictadoWarn] = useState('');

  async function procesarDictado(texto: string) {
    if (!texto.trim()) return;
    setLoading(true);
    setDictadoWarn('');
    try {
      const { data: parsed, error: fnError } = await supabase.functions.invoke('color-formula-parser', {
        body: { texto },
      });
      if (fnError) throw fnError;

      if (parsed.health_warning) {
        setDictadoWarn('Las notas de salud van en su ficha, a mano. No se ha guardado información médica.');
      } else {
        if (parsed.producto) setMarcaProducto(parsed.producto);
        if (parsed.tono || parsed.gramos) {
          setFormulaEntries([{ numero: parsed.tono || '', gramos: String(parsed.gramos || '') }]);
        }
        if (parsed.oxidante) {
          setOxidanteVol(parsed.oxidante);
        }
        if (parsed.tiempos) {
          setTiempoExp(parsed.tiempos);
        }
        if (parsed.notas) setResultadoNotas(parsed.notas);
      }
    } catch (e) {
      setError('Error al procesar el dictado: ' + String(e));
    } finally {
      setLoading(false);
    }
  }

  function addFormulaEntry() { setFormulaEntries([...formulaEntries, { numero: '', gramos: '' }]); }
  function removeFormulaEntry(i: number) { setFormulaEntries(formulaEntries.filter((_, idx) => idx !== i)); }
  function updateFormulaEntry(i: number, field: 'numero' | 'gramos', val: string) {
    const copy = [...formulaEntries];
    copy[i] = { ...copy[i], [field]: val };
    setFormulaEntries(copy);
  }



  async function duplicarUltimaFormula() {
    const { data } = await supabase
      .from('fichas_tecnicas_color')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('negocio_id', negocioId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) { setError('No hay formulas anteriores para copiar'); return; }

    setMarcaProducto(data.marca_producto ?? '');
    setFormulaEntries(
      Array.isArray(data.formula) && data.formula.length > 0
        ? data.formula.map((f: any) => ({ numero: f.numero ?? '', gramos: f.gramos != null ? String(f.gramos) : '' }))
        : [{ numero: '', gramos: '' }]
    );
    if (data.tipo_servicio) setTipoServicio(data.tipo_servicio);
    setTecnicas(Array.isArray(data.tecnica_aplicacion) ? data.tecnica_aplicacion : []);
    setOxidanteVol(data.oxidante_volumen != null ? String(data.oxidante_volumen) : '');
    setTiempoExp(data.tiempo_exposicion_min != null ? String(data.tiempo_exposicion_min) : '');
    setError('');
  }



  async function handleSave() {
    setLoading(true);
    setError('');

    // La formula se guarda como jsonb array de {numero, gramos} en la columna real `formula`.
    const cleanEntries = formulaEntries
      .filter(f => f.numero.trim() || f.gramos.trim())
      .map(f => ({ numero: f.numero.trim(), gramos: f.gramos.trim() ? Number(f.gramos) : null }));
    const oxNum = parseInt(oxidanteVol, 10);
    const tNum = parseInt(tiempoExp, 10);

    const row: Record<string, any> = {
      negocio_id: negocioId,
      cliente_id: clienteId,
      tipo_servicio: tipoServicio || 'otro', // NOT NULL en la tabla
      marca_producto: marcaProducto.trim() || null,
      formula: cleanEntries,
      oxidante_volumen: Number.isFinite(oxNum) ? oxNum : null,
      tiempo_exposicion_min: Number.isFinite(tNum) ? tNum : null,
      tecnica_aplicacion: tecnicas,
      resultado_notas: resultadoNotas.trim() || null,
      profesional_id: profesionalId || null,
      cita_id: citaId || null,
    };

    let err;
    if (mode === 'edit' && ficha?.id) {
      ({ error: err } = await supabase.from('fichas_tecnicas_color').update(row).eq('id', ficha.id));
    } else {
      ({ error: err } = await supabase.from('fichas_tecnicas_color').insert(row));
    }
    setLoading(false);
    if (err) { setError(mensajeDeError(err)); return; }
    await onSaved();
  }

  async function handleDelete() {
    if (!ficha?.id) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.from('fichas_tecnicas_color').delete().eq('id', ficha.id);
    setLoading(false);
    if (err) { setError(mensajeDeError(err)); return; }
    await onSaved();
  }

  const selectStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' };
  const textareaStyle: React.CSSProperties = { width: '100%', minHeight: 54, padding: '10px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' };

  return createPortal(
    <div className="m-overlay-enter" style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div className="m-modal-enter" style={{ width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(192,38,10,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(192,38,10,0.14)', color: TOKENS.violet, display: 'grid', placeItems: 'center' }}>
              <Icon name="droplet" size={16} color={TOKENS.violet} />
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TOKENS.text }}>{isLocked ? 'Ficha de color (cerrada)' : mode === 'edit' ? 'Editar ficha de color' : 'Nueva ficha de color'}</h3>
            {isLocked && (
              <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: TOKENS.warning, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>CERRADA</span>
            )}
          </div>
          <button className="m-btn-icon m-btn-icon-close" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={14} color={TOKENS.textSec} />
          </button>
        </div>

        {mode === 'add' && (
          <button
            onClick={duplicarUltimaFormula}
            style={{ width: '100%', padding: '10px 14px', background: 'rgba(244,80,30,0.08)', border: '1px solid rgba(244,80,30,0.25)', borderRadius: 10, color: TOKENS.primaryHi, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 14, textAlign: 'center' }}
          >
            Copiar ultima formula de este cliente
          </button>
        )}

        <div style={{ marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => {
              if (estadoVoz === 'inactivo') iniciarEscucha(procesarDictado);
              else detenerEscucha();
            }}
            disabled={loading}
            style={{
              width: '100%', padding: '18px 24px', 
              background: estadoVoz === 'inactivo' ? TOKENS.bgCardHi : 'rgba(192,38,10,0.1)', 
              border: `2px dashed ${estadoVoz === 'inactivo' ? TOKENS.borderHi : TOKENS.primary}`, 
              borderRadius: 16, 
              color: estadoVoz === 'inactivo' ? TOKENS.text : TOKENS.primary, 
              fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', 
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: estadoVoz !== 'inactivo' ? '0 8px 24px rgba(192,38,10,0.2)' : 'none'
            }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 24, background: estadoVoz === 'inactivo' ? TOKENS.border : TOKENS.primary, color: '#fff', display: 'grid', placeItems: 'center' }}>
              <Icon name="mic" size={24} color="#fff" />
            </div>
            {estadoVoz === 'inactivo' ? 'Dictar Fórmula (Manos libres)' : 
             estadoVoz === 'escuchando' ? 'Escuchando... (pulsa para detener)' : 'Procesando dictado...'}
          </button>
          {errorVoz && <div style={{ fontSize: 12, color: TOKENS.danger, marginTop: 8, textAlign: 'center' }}>{errorVoz}</div>}
          {dictadoWarn && (
            <div style={{ padding: '12px 16px', background: TOKENS.danger, borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, boxShadow: '0 4px 12px rgba(239,68,68,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="alert" size={20} color="#fff" />
                <span>{dictadoWarn}</span>
              </div>
              {onGoToNotas && (
                <button onClick={() => { onClose(); onGoToNotas(); }} style={{ background: '#fff', color: TOKENS.danger, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Ir a Notas de Salud
                </button>
              )}
            </div>
          )}
        </div>

        {/* Form wrapper - disabled when locked */}
        <div style={{ pointerEvents: isLocked ? 'none' : 'auto', opacity: isLocked ? 0.6 : 1 }}>

        {/* Seccion: Profesional */}
        <SectionLabel>Profesional</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 14 }}>
          <Field label="Profesional">
            <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} style={selectStyle}>
              <option value="">Sin asignar</option>
              {profesionales.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Field>
        </div>
        {citasCliente.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <Field label="Asociar a cita (opcional)">
              <select value={citaId} onChange={(e) => setCitaId(e.target.value)} style={selectStyle}>
                <option value="">Sin cita asociada</option>
                {citasCliente.map((cit) => {
                  const srv = servicios.find((s: any) => s.id === cit.servicio_id);
                  const fecha = new Date(cit.inicio).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                  return <option key={cit.id} value={cit.id}>{fecha} - {srv?.nombre || 'Servicio'}</option>;
                })}
              </select>
            </Field>
          </div>
        )}

        {/* Seccion: Formula */}
        <SectionLabel>Formula</SectionLabel>
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <Field label="Tipo de servicio">
            <select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)} style={selectStyle}>
              {TIPOS_SERVICIO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Marca / producto"><Input value={marcaProducto} onChange={setMarcaProducto} placeholder="Ej. Wella Koleston, L'Oreal Majirel" /></Field>
          <Field label="Mezcla de color">
            {formulaEntries.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <Input value={entry.numero} onChange={(v) => updateFormulaEntry(i, 'numero', v)} placeholder="Numero/tono (ej. 7/0)" style={{ flex: 2 }} />
                <Input value={entry.gramos} onChange={(v) => updateFormulaEntry(i, 'gramos', v)} placeholder="g" style={{ flex: 1 }} />
                {formulaEntries.length > 1 && (
                  <button onClick={() => removeFormulaEntry(i)} style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.textTer, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="x" size={10} color={TOKENS.textTer} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addFormulaEntry} style={{ padding: '4px 10px', background: 'transparent', border: `1px dashed ${TOKENS.border}`, borderRadius: 8, color: TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 2 }}>
              + Anadir tono
            </button>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <Field label="Oxidante (vol)"><Input value={oxidanteVol} onChange={setOxidanteVol} placeholder="Ej. 20" /></Field>
            <Field label="Tiempo (min)"><Input value={tiempoExp} onChange={setTiempoExp} placeholder="35" /></Field>
          </div>
          <Field label="Tecnica de aplicacion">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TECNICAS.map((t) => {
                const active = tecnicas.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTecnicas(active ? tecnicas.filter((x) => x !== t) : [...tecnicas, t])}
                    style={{
                      padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: active ? 'rgba(244,80,30,0.12)' : TOKENS.bgCard,
                      border: `1px solid ${active ? TOKENS.primary : TOKENS.border}`,
                      color: active ? TOKENS.primaryHi : TOKENS.textSec,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        {/* Seccion: Notas */}
        <SectionLabel>Notas Extra</SectionLabel>
        <div style={{ marginBottom: 14 }}>
          <Field label="Instrucciones o Apuntes"><textarea value={resultadoNotas} onChange={(e) => setResultadoNotas(e.target.value)} placeholder="Observaciones adicionales, tiempos específicos, etc." style={textareaStyle} /></Field>
        </div>
        </div>{/* End form wrapper */}

        {error && <div style={{ padding: '10px 12px', background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 10, color: TOKENS.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {isLocked ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14, borderTop: `1px solid ${TOKENS.border}` }}>
            <button onClick={onClose} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Cerrar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 14, borderTop: `1px solid ${TOKENS.border}` }}>
            {mode === 'edit' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="m-btn-danger"
                  onClick={handleDelete}
                  disabled={loading}
                  style={{ padding: '9px 14px', background: 'transparent', border: `1px solid rgba(239,68,68,0.35)`, color: TOKENS.danger, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="trash" size={14} color={TOKENS.danger} />
                  Eliminar
                </button>
              </div>
            ) : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="m-btn-secondary" onClick={onClose} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button className="m-btn-primary" onClick={handleSave} disabled={loading} style={{ padding: '9px 14px', background: 'linear-gradient(180deg,#e0340e 0%,#c0260a 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(192,38,10,0.40)' }}>
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8, marginTop: 4 }}>
      {children}
    </div>
  );
}

function FieldKV({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: TOKENS.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// Fila de dato de contacto para la ficha formal del cliente
function ContactRow({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: string }) {
  const isEmpty = value === '—' || !value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={15} color={accent || TOKENS.textTer} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 13, color: isEmpty ? TOKENS.textTer : TOKENS.text, fontWeight: isEmpty ? 500 : 600, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={isEmpty ? undefined : value}>{value}</div>
      </div>
    </div>
  );
}

// ── Tab: Historial
function HistorialTab({ cliente, citas, servicios, profesionales = [], fichasTecnicas = [] }: { cliente: Cliente; citas: Cita[]; servicios: any[]; profesionales?: any[]; fichasTecnicas?: any[] }) {
  const [detailCita, setDetailCita] = useState<Cita | null>(null);
  const clientCitas = citas
    .filter((cit) => cit.cliente_id === cliente.id)
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());

  if (clientCitas.length === 0) {
    return <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '10px 0' }}>Sin historial</div>;
  }

  const estadoStyle: Record<string, { bg: string; color: string; label: string }> = {
    confirmada: { bg: 'rgba(244,80,30,0.12)', color: TOKENS.primaryHi, label: 'Confirmada' },
    completada: { bg: 'rgba(15,157,107,0.12)', color: TOKENS.success, label: 'Completada' },
    cancelada: { bg: 'rgba(226,59,52,0.12)', color: TOKENS.danger, label: 'Cancelada' },
    no_presentada: { bg: 'rgba(224,138,0,0.12)', color: TOKENS.warning, label: 'No presentada' },
  };

  const completadas = clientCitas.filter((c) => c.estado === 'completada').length;
  const canceladas = clientCitas.filter((c) => c.estado === 'cancelada' || c.estado === 'no_presentada').length;
  const totalGastado = clientCitas
    .filter((c) => c.estado === 'completada')
    .reduce((sum, c) => sum + (servicios.find((s) => s.id === c.servicio_id)?.precio || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Stats resumen */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ padding: '5px 10px', background: 'rgba(244,80,30,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: TOKENS.primaryHi }}>
          {clientCitas.length} citas totales
        </div>
        {completadas > 0 && (
          <div style={{ padding: '5px 10px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#22c55e' }}>
            {completadas} completadas
          </div>
        )}
        {canceladas > 0 && (
          <div style={{ padding: '5px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#ef4444' }}>
            {canceladas} cancel./no-show
          </div>
        )}
        {totalGastado > 0 && (
          <div style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: TOKENS.success }}>
            {totalGastado} EUR facturado
          </div>
        )}
      </div>

      {/* Lista de citas */}
      {clientCitas.map((h, idx) => {
        const fecha = new Date(h.inicio);
        const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: fecha.getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined });
        const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const srv = servicios.find((s) => s.id === h.servicio_id);
        const prof = profesionales.find((p: any) => p.id === h.profesional_id);
        const estado = h.estado || 'confirmada';
        const est = estadoStyle[estado] || estadoStyle.confirmada;
        const precio = srv?.precio ?? 0;

        const tieneFicha = fichasTecnicas.some((f: any) => f.cita_id === h.id);
        const tieneFormula = !!(h.formula_producto || h.formula_tono || h.formula_resultado || h.formula_notas || h.formula_tiempo_min != null);
        return (
          <div
            key={h.id}
            onClick={() => setDetailCita(h)}
            title="Ver detalle completo de la cita"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
              transition: 'all 0.15s ease', cursor: 'pointer',
              animation: `fadeIn 0.2s ease ${idx * 0.03}s both`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.borderHi; e.currentTarget.style.transform = 'translateX(2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'none'; }}
          >
            <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: prof?.color || TOKENS.primary, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{srv?.nombre || 'Servicio'}</div>
                {(tieneFicha || tieneFormula) && (
                  <span title="Tiene ficha de color / quimica" style={{ display: 'inline-flex', color: TOKENS.violet }}>
                    <Icon name="droplet" size={11} color={TOKENS.violet} />
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 2 }}>
                {prof?.nombre || 'Profesional'} · {fechaStr} · {horaStr}
              </div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 4,
              background: est.bg, color: est.color, textTransform: 'uppercase', flexShrink: 0,
            }}>
              {est.label}
            </span>
            {precio > 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: estado === 'completada' ? TOKENS.success : TOKENS.textSec, minWidth: 45, textAlign: 'right', flexShrink: 0 }}>
                {precio} EUR
              </div>
            )}
            <Icon name="chevronRight" size={14} color={TOKENS.textTer} />
          </div>
        );
      })}

      {detailCita && (
        <CitaDetalleModal
          cita={detailCita}
          cliente={cliente}
          servicio={servicios.find((s) => s.id === detailCita.servicio_id)}
          profesional={profesionales.find((p: any) => p.id === detailCita.profesional_id)}
          ficha={fichasTecnicas.find((f: any) => f.cita_id === detailCita.id) || null}
          onClose={() => setDetailCita(null)}
        />
      )}
    </div>
  );
}

// ── Modal full-screen: detalle completo de una cita (servicio + quimica + notas)
function CitaDetalleModal({ cita, cliente, servicio, profesional, ficha, onClose }: {
  cita: Cita; cliente: Cliente; servicio?: any; profesional?: any; ficha: any | null; onClose: () => void;
}) {
  const { isMobile } = useResponsive();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const TIPOS: Record<string, string> = {
    coloracion_global: 'Color global', color_raiz: 'Color raiz', mechas: 'Mechas',
    balayage: 'Balayage', decoloracion: 'Decoloracion', matiz: 'Matiz',
    bano_color: 'Bano de color', correccion_color: 'Correccion', color_fantasia: 'Color fantasia', otro: 'Otro',
  };
  const estadoStyle: Record<string, { bg: string; color: string; label: string }> = {
    confirmada: { bg: 'rgba(244,80,30,0.12)', color: TOKENS.primaryHi, label: 'Confirmada' },
    completada: { bg: 'rgba(15,157,107,0.14)', color: TOKENS.success, label: 'Completada' },
    cancelada: { bg: 'rgba(226,59,52,0.12)', color: TOKENS.danger, label: 'Cancelada' },
    no_presentada: { bg: 'rgba(224,138,0,0.14)', color: TOKENS.warning, label: 'No presentada' },
  };

  const fecha = new Date(cita.inicio);
  const fin = cita.fin ? new Date(cita.fin) : null;
  const fechaLarga = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const horaIni = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const horaFin = fin ? fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null;
  const est = estadoStyle[cita.estado || 'confirmada'] || estadoStyle.confirmada;
  const precio = servicio?.precio ?? 0;
  const duracionMin = fin ? Math.round((fin.getTime() - fecha.getTime()) / 60000) : (servicio?.duracion_activa_min ?? null);
  const alergiasTexto = (cliente.alergias ?? '').trim();

  const formulaArr = Array.isArray(ficha?.formula) ? ficha!.formula : [];
  const tecnicas: string[] = Array.isArray(ficha?.tecnica_aplicacion) ? ficha!.tecnica_aplicacion : [];
  const hayQuimicaLegacy = !ficha && !!(cita.formula_producto || cita.formula_tono || cita.formula_resultado || cita.formula_notas || cita.formula_tiempo_min != null);

  return createPortal(
    <div
      className="m-overlay-enter"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(28,24,20,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        className="m-modal-enter"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 880, maxHeight: '92vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 20, boxShadow: '0 40px 90px rgba(28,24,20,0.35)' }}
      >
        {/* Cabecera */}
        <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '22px 26px', borderBottom: `1px solid ${TOKENS.border}`, background: 'linear-gradient(180deg, rgba(244,80,30,0.06), transparent)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: TOKENS.text }}>{servicio?.nombre || 'Servicio'}</h2>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 6, background: est.bg, color: est.color, textTransform: 'uppercase' }}>{est.label}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: TOKENS.textSec, textTransform: 'capitalize' }}>{fechaLarga}</div>
            <div style={{ marginTop: 2, fontSize: 12, color: TOKENS.textTer }}>
              {horaIni}{horaFin ? `–${horaFin}` : ''}{duracionMin ? ` · ${duracionMin} min` : ''}
            </div>
          </div>
          <button className="m-btn-icon-close" onClick={onClose} title="Cerrar (Esc)" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={16} color={TOKENS.textSec} />
          </button>
        </div>

        <div style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Datos clave */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
            <DetailStat label="Profesional" value={profesional?.nombre || '—'} dot={profesional?.color} />
            <DetailStat label="Precio" value={precio > 0 ? `${precio} EUR` : '—'} tone={cita.estado === 'completada' ? TOKENS.success : TOKENS.text} />
            <DetailStat label="Cliente" value={cliente.nombre} />
          </div>

          {/* Alergias relevantes */}
          {alergiasTexto && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(226,59,52,0.07)', border: `1px solid rgba(226,59,52,0.30)`, borderRadius: 12 }}>
              <Icon name="alert" size={16} color={TOKENS.danger} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.danger, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alergias del cliente</div>
                <div style={{ fontSize: 13, color: TOKENS.text, marginTop: 2 }}>{alergiasTexto}</div>
              </div>
            </div>
          )}

          {/* Quimica / formula */}
          {(ficha || hayQuimicaLegacy) ? (
            <Panel title="Color / Química" accent={TOKENS.violet}>
              {ficha ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Pill color={TOKENS.violet}>{TIPOS[ficha.tipo_servicio] || ficha.tipo_servicio}</Pill>
                    {ficha.marca_producto && <span style={{ fontSize: 12, color: TOKENS.textSec }}>{ficha.marca_producto}</span>}
                  </div>
                  {formulaArr.length > 0 && (
                    <div style={{ background: TOKENS.bgCardHi, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace' }}>
                      <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Formula</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.text }}>
                        {formulaArr.map((f: any) => `${f.numero || '?'} (${f.gramos || '?'}g)`).join('  +  ')}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {ficha.oxidante_volumen && <FieldKV label="Oxidante" value={`${ficha.oxidante_volumen} vol${ficha.oxidante_proporcion ? ` (${ficha.oxidante_proporcion})` : ''}`} />}
                    {ficha.tiempo_exposicion_min && <FieldKV label="Tiempo exposicion" value={`${ficha.tiempo_exposicion_min} min`} />}
                    {ficha.base_natural && <FieldKV label="Base natural" value={ficha.base_natural} />}
                    {ficha.color_previo && <FieldKV label="Color previo" value={ficha.color_previo} />}
                    {ficha.porcentaje_canas != null && <FieldKV label="Canas" value={`${ficha.porcentaje_canas}%`} />}
                    {ficha.resultado_color && <FieldKV label="Resultado color" value={ficha.resultado_color} full />}
                    {ficha.resultado_notas && <FieldKV label="Notas resultado" value={ficha.resultado_notas} full />}
                  </div>
                  {tecnicas.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {tecnicas.map((t) => <Pill key={t} color={TOKENS.cyan}>{t}</Pill>)}
                    </div>
                  )}
                  {ficha.incidencias && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '9px 11px', background: TOKENS.dangerSoft, border: `1px solid rgba(226,59,52,0.30)`, borderRadius: 9, fontSize: 12, color: TOKENS.danger }}>
                      <Icon name="alert" size={13} color={TOKENS.danger} />
                      <span>{ficha.incidencias}</span>
                    </div>
                  )}
                  {ficha.resultado_satisfactorio != null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: ficha.resultado_satisfactorio ? TOKENS.success : TOKENS.warning }} />
                      <span style={{ fontSize: 11, color: ficha.resultado_satisfactorio ? TOKENS.success : TOKENS.warning, fontWeight: 600 }}>
                        {ficha.resultado_satisfactorio ? 'Resultado satisfactorio' : 'Resultado a revisar'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {cita.formula_producto && <FieldKV label="Producto" value={cita.formula_producto} />}
                  {cita.formula_tono && <FieldKV label="Tono" value={cita.formula_tono} />}
                  {cita.formula_tiempo_min != null && <FieldKV label="Tiempo" value={`${cita.formula_tiempo_min} min`} />}
                  {cita.formula_resultado && <FieldKV label="Resultado" value={cita.formula_resultado} full />}
                  {cita.formula_notas && <FieldKV label="Notas" value={cita.formula_notas} full />}
                </div>
              )}
            </Panel>
          ) : (
            <Panel title="Color / Química" accent={TOKENS.violet}>
              <div style={{ fontSize: 12, color: TOKENS.textTer }}>Esta cita no tiene ficha de color registrada.</div>
            </Panel>
          )}

          {/* Notas de la cita */}
          {cita.notas && (
            <Panel title="Notas de la cita" accent={TOKENS.primary}>
              <div style={{ fontSize: 13, color: TOKENS.text, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{cita.notas}</div>
            </Panel>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Stat compacto para el detalle de cita
function DetailStat({ label, value, tone, dot }: { label: string; value: string; tone?: string; dot?: string }) {
  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, letterSpacing: 0.6, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flexShrink: 0 }} />}
        <span style={{ fontSize: 15, fontWeight: 700, color: tone || TOKENS.text }}>{value}</span>
      </div>
    </div>
  );
}

// ── Modal: Importar base de datos
function ImportModal({ negocioId, onClose, onSaved }: {
  negocioId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [preview, setPreview] = useState<any[]>([]);
  const [error, setError] = useState('');

  const handleDrag = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: any) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (selectedFile: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setError('Formato no válido. Sube un archivo Excel (.xlsx, .xls) o CSV (.csv).');
      setFile(null);
      setPreview([]);
      return;
    }

    setFile(selectedFile);
    setError('');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Obtener filas de forma matricial
        const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        if (rawData.length === 0) {
          setError('El archivo está vacío.');
          return;
        }

        // Buscar fila de cabeceras
        let headerRowIdx = 0;
        let foundHeader = false;
        
        for (let i = 0; i < Math.min(rawData.length, 15); i++) {
          const row = rawData[i];
          if (!row) continue;
          
          const isHeader = row.some(cell => {
            if (typeof cell !== 'string') return false;
            const normCell = cell.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return normCell.includes('nombre') || normCell.includes('apellido') || normCell === 'name' || normCell.includes('telefono') || normCell.includes('email') || normCell.includes('correo') || normCell.includes('reservas') || normCell.includes('visitas');
          });
          
          if (isHeader) {
            headerRowIdx = i;
            foundHeader = true;
            break;
          }
        }

        const headers = foundHeader ? rawData[headerRowIdx] : rawData[0];
        const dataStartIdx = foundHeader ? headerRowIdx + 1 : 0;
        
        // Encontrar índices de columnas
        let nombreIdx = -1;
        let telefonoIdx = -1;
        let emailIdx = -1;
        let notasIdx = -1;
        let alergiasIdx = -1;
        let gruposIdx = -1;
        let fechaNacimientoIdx = -1;
        
        headers.forEach((header, idx) => {
          if (!header) return;
          const normHeader = String(header).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          
          if (normHeader.includes('nombre') || normHeader.includes('cliente') || normHeader === 'name' || normHeader.includes('completo')) {
            if (nombreIdx === -1) nombreIdx = idx;
          } else if (normHeader.includes('telefono') || normHeader.includes('movil') || normHeader === 'tel' || normHeader.includes('phone') || normHeader.includes('contacto')) {
            if (telefonoIdx === -1) telefonoIdx = idx;
          } else if (normHeader.includes('email') || normHeader.includes('correo') || normHeader === 'mail') {
            if (emailIdx === -1) emailIdx = idx;
          } else if (normHeader.includes('nota') || normHeader.includes('comentario') || normHeader.includes('observaci') || normHeader.includes('descrip')) {
            if (notasIdx === -1) notasIdx = idx;
          } else if (normHeader.includes('alergia') || normHeader.includes('sensibil')) {
            if (alergiasIdx === -1) alergiasIdx = idx;
          } else if (normHeader.includes('grupo') || normHeader.includes('etiqueta') || normHeader.includes('tag')) {
            if (gruposIdx === -1) gruposIdx = idx;
          } else if (normHeader.includes('nacimiento') || normHeader.includes('cumple') || normHeader.includes('fecha')) {
            if (fechaNacimientoIdx === -1) fechaNacimientoIdx = idx;
          }
        });

        if (nombreIdx === -1) {
          nombreIdx = headers.findIndex(h => h && String(h).trim() !== '');
          if (nombreIdx === -1) nombreIdx = 0;
        }

        const clients: any[] = [];
        for (let i = dataStartIdx; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0) continue;
          
          const nombre = row[nombreIdx] ? String(row[nombreIdx]).trim() : '';
          if (!nombre || nombre === '' || nombre.toLowerCase().includes('total') || nombre.toLowerCase().includes('periodo')) {
            continue;
          }
          
          const telefono = telefonoIdx !== -1 && row[telefonoIdx] ? String(row[telefonoIdx]).trim() : null;
          const email = emailIdx !== -1 && row[emailIdx] ? String(row[emailIdx]).trim() : null;
          let notasVal = notasIdx !== -1 && row[notasIdx] ? String(row[notasIdx]).trim() : null;
          const alergias = alergiasIdx !== -1 && row[alergiasIdx] ? String(row[alergiasIdx]).trim() : null;
          
          let fechaNacimientoVal = null;
          const extraInfo: string[] = [];

          if (fechaNacimientoIdx !== -1 && row[fechaNacimientoIdx]) {
            const rawBday = row[fechaNacimientoIdx];
            let parsedDate = new Date(rawBday);
            if (typeof rawBday === 'number') {
              parsedDate = new Date((rawBday - 25569) * 86400 * 1000);
            }
            if (!isNaN(parsedDate.getTime())) {
              fechaNacimientoVal = parsedDate.toISOString().split('T')[0];
            } else {
              extraInfo.push(`- Fecha de nacimiento (sin parsear): ${rawBday}`);
            }
          }
          
          const gruposRaw = gruposIdx !== -1 && row[gruposIdx] ? String(row[gruposIdx]).trim() : '';
          const etiquetas = gruposRaw ? gruposRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

          // Enriquecer notas con columnas adicionales no mapeadas
          headers.forEach((hdr, hIdx) => {
            if (hIdx === nombreIdx || hIdx === telefonoIdx || hIdx === emailIdx || hIdx === notasIdx || hIdx === alergiasIdx || hIdx === gruposIdx || hIdx === fechaNacimientoIdx) {
              return;
            }
            if (row[hIdx] !== undefined && String(row[hIdx]).trim() !== '') {
              extraInfo.push(`- ${hdr}: ${row[hIdx]}`);
            }
          });
          
          if (extraInfo.length > 0) {
            const extraStr = `Datos importados de la fila:\n` + extraInfo.join('\n');
            notasVal = notasVal ? `${notasVal}\n\n${extraStr}` : extraStr;
          }

          clients.push({
            nombre,
            telefono,
            email,
            notas: notasVal,
            alergias,
            etiquetas,
            fecha_nacimiento: fechaNacimientoVal
          });
        }

        if (clients.length === 0) {
          setError('No se encontraron clientes importables válidos.');
          return;
        }

        setPreview(clients);
      } catch (err: any) {
        setError(`Error al interpretar el Excel: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleImport = async () => {
    if (preview.length === 0 || !negocioId) return;
    setLoading(true);
    setProgress({ current: 0, total: preview.length });
    
    let exitos = 0;
    const batchSize = 50;
    
    try {
      for (let i = 0; i < preview.length; i += batchSize) {
        const batch = preview.slice(i, i + batchSize).map(c => ({
          ...c,
          negocio_id: negocioId
        }));
        
        const { error: insError } = await supabase.from('clientes').insert(batch);
        
        if (insError) {
          for (const client of batch) {
            const { error: singleError } = await supabase.from('clientes').insert(client);
            if (!singleError) exitos++;
          }
        } else {
          exitos += batch.length;
        }
        
        setProgress({ current: Math.min(i + batchSize, preview.length), total: preview.length });
      }
      
      onSaved();
    } catch (err: any) {
      setError(`Error al guardar en base de datos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(28,24,20,0.45)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} className="ca-modal-overlay">
      <div style={{ background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 16, width: '100%', maxWidth: 640, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 10px 10px -5px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} className="ca-modal">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${TOKENS.border}` }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>Importar base de datos</h3>
            <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: TOKENS.textSec }}>Sube tu archivo de Booksy, Excel o CSV para añadir múltiples clientes</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }} disabled={loading}>
            <Icon name="x" size={16} color={TOKENS.textSec} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ background: TOKENS.dangerSoft, border: `1px solid rgba(226,59,52,0.2)`, borderRadius: 10, padding: '12px 16px', color: TOKENS.danger, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Icon name="alert" size={16} color={TOKENS.danger} />
              <span>{error}</span>
            </div>
          )}

          {!file ? (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragActive ? TOKENS.primary : TOKENS.borderHi}`,
                background: dragActive ? TOKENS.primarySoft : 'rgba(40,30,24,0.02)',
                borderRadius: 12,
                padding: '40px 20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onClick={() => document.getElementById('excel-file-input')?.click()}
            >
              <input
                id="excel-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleChange}
              />
              <div style={{ background: TOKENS.primarySoft, borderRadius: '50%', padding: 12, display: 'inline-flex', color: TOKENS.primary }}>
                <Icon name="download" size={24} color={TOKENS.primary} />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: TOKENS.text }}>Arrastra tu archivo aquí</p>
                <p style={{ margin: 0, marginTop: 4, fontSize: 12, color: TOKENS.textSec }}>o haz clic para buscar en tu ordenador</p>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: TOKENS.textTer }}>Formatos admitidos: Excel (.xlsx, .xls) o CSV (.csv)</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* File Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(40,30,24,0.03)', border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="check" size={18} color={TOKENS.success} />
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: TOKENS.text }}>{file.name}</p>
                    <p style={{ margin: 0, marginTop: 2, fontSize: 11, color: TOKENS.textTer }}>{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                {!loading && (
                  <button onClick={() => { setFile(null); setPreview([]); setError(''); }} style={{ background: 'transparent', border: 'none', color: TOKENS.danger, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Cambiar
                  </button>
                )}
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TOKENS.text, marginBottom: 8 }}>Previsualización de la importación ({preview.length} clientes detectados)</h4>
                  <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 10, overflow: 'hidden', background: TOKENS.bgCard }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(40,30,24,0.03)', borderBottom: `1px solid ${TOKENS.border}` }}>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: TOKENS.textSec }}>Nombre</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: TOKENS.textSec }}>Teléfono</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: TOKENS.textSec }}>Email</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: TOKENS.textSec }}>Etiquetas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, 5).map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: idx < 4 ? `1px solid ${TOKENS.border}` : 'none' }}>
                            <td style={{ padding: '8px 12px', color: TOKENS.text }}>{p.nombre}</td>
                            <td style={{ padding: '8px 12px', color: TOKENS.textSec }}>{p.telefono || '—'}</td>
                            <td style={{ padding: '8px 12px', color: TOKENS.textSec }}>{p.email || '—'}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {p.etiquetas.slice(0, 2).map((t: string, tIdx: number) => (
                                  <span key={tIdx} style={{ fontSize: 9, background: TOKENS.primarySoft, color: TOKENS.primary, padding: '2px 6px', borderRadius: 4 }}>{t}</span>
                                ))}
                                {p.etiquetas.length > 2 && <span style={{ fontSize: 9, color: TOKENS.textTer }}>+{p.etiquetas.length - 2}</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.length > 5 && (
                      <div style={{ padding: '8px 12px', background: 'rgba(40,30,24,0.01)', borderTop: `1px solid ${TOKENS.border}`, textAlign: 'center', fontSize: 11, color: TOKENS.textTer }}>
                        Y {preview.length - 5} clientes más...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: TOKENS.textSec }}>
                <span>Importando clientes...</span>
                <span>{progress.current} de {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)</span>
              </div>
              <div style={{ width: '100%', height: 6, background: 'rgba(40,30,24,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(progress.current / progress.total) * 100}%`, height: '100%', background: `linear-gradient(90deg,#ff7a2e,#f4501e)`, transition: 'width 0.1s ease' }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: `1px solid ${TOKENS.border}`, background: 'rgba(40,30,24,0.01)' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', background: '#fff', border: `1px solid ${TOKENS.border}`, borderRadius: 8, color: TOKENS.textSec, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            disabled={loading}
          >
            Cancelar
          </button>
          {file && preview.length > 0 && (
            <button
              onClick={handleImport}
              style={{ padding: '8px 16px', background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 4px 12px ${TOKENS.primaryGlow}` }}
              disabled={loading}
            >
              {loading ? 'Importando...' : `Importar ${preview.length} clientes`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal: Crear/Editar cliente
function ClienteModal({ cliente, negocioId, onClose, onSaved, onDeleted }: {
  cliente: Cliente | null;
  negocioId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { isMobile } = useResponsive();
  const isEdit = !!cliente;
  const initialBday = (() => {
    if (!cliente?.fecha_nacimiento) return { mm: null as number | null, dd: null as number | null };
    const parts = cliente.fecha_nacimiento.split('-');
    if (parts.length !== 3) return { mm: null, dd: null };
    const mm = parseInt(parts[1], 10) - 1;
    const dd = parseInt(parts[2], 10);
    if (isNaN(mm) || isNaN(dd)) return { mm: null, dd: null };
    return { mm, dd };
  })();
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [bdayMM, setBdayMM] = useState<number | null>(initialBday.mm);
  const [bdayDD, setBdayDD] = useState<number | null>(initialBday.dd);
  const [notas, setNotas] = useState((cliente?.alergias ?? '').trim());
  const [loading, setLoading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Email no valido');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const fechaToSave = (bdayMM != null && bdayDD != null)
        ? `1900-${pad(bdayMM + 1)}-${pad(bdayDD)}`
        : null;

      const payload = {
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        fecha_nacimiento: fechaToSave,
        alergias: notas.trim() || null,
      };

      if (isEdit && cliente) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', cliente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').insert({ ...payload, negocio_id: negocioId });
        if (error) throw error;
      }
      onSaved();
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo guardar la clienta.'));
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!cliente) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.from('clientes').delete().eq('id', cliente.id);
    setLoading(false);
    if (error) {
      setError(mensajeDeError(error, 'No se puede eliminar la clienta. Probablemente tiene citas asociadas.'));
      setShowConfirmDelete(false);
      return;
    }
    onDeleted();
  };

  // Derecho de supresion RGPD: la RPC anonimiza la PII en BD (conserva citas y
  // cobros por obligacion fiscal) y devuelve las rutas de los archivos con
  // datos personales (fotos, PDFs de presupuestos) para borrarlos del bucket.
  const handleAnonimizar = async () => {
    if (!cliente) return;
    setLoading(true);
    setError('');
    type AnonimizarResp = { ok: boolean; error?: string; fotos_paths?: string[]; pdf_paths?: string[] };
    const { data, error } = await supabase.rpc('anonimizar_cliente', { p_cliente_id: cliente.id });
    const resp = (data ?? null) as AnonimizarResp | null;
    if (error || !resp?.ok) {
      setLoading(false);
      setError(error ? mensajeDeError(error, 'No se pudo anonimizar la clienta.') : (resp?.error || 'No se pudo anonimizar la clienta.'));
      setShowConfirmDelete(false);
      return;
    }
    if (resp.fotos_paths && resp.fotos_paths.length > 0) {
      await supabase.storage.from('cliente-fotos').remove(resp.fotos_paths);
    }
    if (resp.pdf_paths && resp.pdf_paths.length > 0) {
      await supabase.storage.from('presupuestos').remove(resp.pdf_paths);
    }
    setLoading(false);
    onDeleted();
  };

  return (
    <div className="m-overlay-enter" style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: isMobile ? 12 : 24 }}>
      <div className="m-modal-enter" style={{ width: isMobile ? '100%' : 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: isMobile ? 16 : 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(244,80,30,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <button className="m-btn-icon m-btn-icon-close" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={14} color={TOKENS.textSec} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
          <Field label="Nombre*">
            <Input value={nombre} onChange={setNombre} placeholder="Ej. Maria Garcia" style={{ height: 46 }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 12 }}>
            <Field label="Telefono">
              <PhoneInput value={telefono} onChange={(e164) => setTelefono(e164)} placeholder="611 234 567" />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={setEmail} placeholder="cliente@correo.com" style={{ height: 46 }} />
            </Field>
          </div>
          <Field label="Cumpleanos (dia y mes)">
            <BirthdayPicker mm={bdayMM} dd={bdayDD} onChange={(mm, dd) => { setBdayMM(mm); setBdayDD(dd); }} />
          </Field>
          <Field label="Alergias">
            {(() => {
              const tieneAlergia = notas.trim().length > 0;
              return (
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Alergias o reacciones previas relevantes (parafenilendiamina, amoniaco, fragancias, latex...)"
                  style={{
                    width: '100%',
                    minHeight: 110,
                    padding: '10px 12px',
                    background: tieneAlergia ? 'rgba(239,68,68,0.06)' : TOKENS.bgCard,
                    border: `1px solid ${tieneAlergia ? 'rgba(239,68,68,0.35)' : TOKENS.border}`,
                    borderRadius: 10,
                    color: tieneAlergia ? TOKENS.danger : TOKENS.text,
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              );
            })()}
          </Field>
        </div>

        {error && (
          <div style={{ padding: '10px 12px', background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 10, color: TOKENS.danger, fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 14, borderTop: `1px solid ${TOKENS.border}` }}>
          {isEdit ? (
            <button
              className="m-btn-danger"
              onClick={() => setShowConfirmDelete(true)}
              disabled={loading}
              style={{ padding: '9px 14px', background: 'transparent', border: `1px solid rgba(239,68,68,0.35)`, color: TOKENS.danger, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="trash" size={14} color={TOKENS.danger} />
              Eliminar
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="m-btn-secondary" onClick={onClose} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Cancelar
            </button>
            <button className="m-btn-primary" onClick={handleGuardar} disabled={loading} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}` }}>
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </div>

        {showConfirmDelete && (
          <div className="m-overlay-enter" style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.85)', display: 'grid', placeItems: 'center', zIndex: 200, padding: 24 }}>
            <div className="m-modal-enter" style={{ width: 360, maxWidth: '100%', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.text, marginBottom: 6 }}>Eliminar cliente</div>
              <div style={{ fontSize: 12, color: TOKENS.textSec, marginBottom: 10, lineHeight: 1.5 }}>
                Vas a eliminar a {cliente?.nombre}. Si tiene citas asociadas no se podra eliminar.
              </div>
              <div style={{ fontSize: 12, color: TOKENS.textSec, marginBottom: 14, lineHeight: 1.5 }}>
                Alternativa (RGPD): <strong style={{ color: TOKENS.text }}>Anonimizar</strong> borra sus datos personales y fotos,
                pero conserva el historial de citas y cobros. Solo disponible para gestores.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="m-btn-secondary" onClick={() => setShowConfirmDelete(false)} style={{ padding: '8px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancelar</button>
                <button className="m-btn-secondary" onClick={handleAnonimizar} disabled={loading} style={{ padding: '8px 12px', background: TOKENS.bgCard, border: `1px solid rgba(239,68,68,0.35)`, color: TOKENS.danger, borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {loading ? '...' : 'Anonimizar (RGPD)'}
                </button>
                <button className="m-btn-primary" onClick={handleDelete} disabled={loading} style={{ padding: '8px 12px', background: TOKENS.danger, border: 'none', color: '#fff', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {loading ? '...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mini-calendario para seleccionar dia y mes (sin ano)
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAY_NAMES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function BirthdayPicker({ mm, dd, onChange }: { mm: number | null; dd: number | null; onChange: (mm: number | null, dd: number | null) => void }) {
  const [viewMonth, setViewMonth] = useState<number>(mm ?? new Date().getMonth());

  // Usamos 2024 (bisiesto) como ano de referencia para layout de cuadricula
  const REF_YEAR = 2024;
  const daysInMonth = new Date(REF_YEAR, viewMonth + 1, 0).getDate();
  const firstDay = new Date(REF_YEAR, viewMonth, 1).getDay(); // 0=Sun..6=Sat
  // Layout L-D: convertir Sun(0) -> 6, Mon(1) -> 0...
  const firstOffset = (firstDay + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function prevMonth() { setViewMonth((m) => (m + 11) % 12); }
  function nextMonth() { setViewMonth((m) => (m + 1) % 12); }

  const hasSelection = mm != null && dd != null;
  const summaryStr = hasSelection
    ? new Date(REF_YEAR, mm!, dd!).toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })
    : 'Sin fecha';

  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button
          type="button"
          className="m-btn-icon m-btn-icon-rotate-l"
          onClick={prevMonth}
          style={{ width: 28, height: 28, borderRadius: 7, background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
        >
          <Icon name="chevronLeft" size={14} color={TOKENS.textSec} />
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text }}>{MONTH_NAMES[viewMonth]}</div>
        <button
          type="button"
          className="m-btn-icon m-btn-icon-rotate-r"
          onClick={nextMonth}
          style={{ width: 28, height: 28, borderRadius: 7, background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
        >
          <Icon name="chevronRight" size={14} color={TOKENS.textSec} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
        {DAY_NAMES.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: TOKENS.textTer, letterSpacing: 0.5, padding: 3 }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} style={{ height: 30 }} />;
          const isSel = mm === viewMonth && dd === d;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(viewMonth, d)}
              onMouseEnter={(e) => {
                if (!isSel) {
                  e.currentTarget.style.transform = 'scale(1.12)';
                  e.currentTarget.style.background = 'rgba(244,80,30,0.12)';
                  e.currentTarget.style.borderColor = TOKENS.primary;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = isSel ? 'rgba(244,80,30,0.18)' : 'transparent';
                e.currentTarget.style.borderColor = isSel ? TOKENS.primary : 'transparent';
              }}
              style={{
                height: 30,
                borderRadius: 7,
                background: isSel ? 'rgba(244,80,30,0.18)' : 'transparent',
                border: `1px solid ${isSel ? TOKENS.primary : 'transparent'}`,
                color: isSel ? TOKENS.primaryHi : TOKENS.textSec,
                fontSize: 11,
                fontWeight: isSel ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${TOKENS.border}` }}>
        <div style={{ fontSize: 11, color: hasSelection ? TOKENS.text : TOKENS.textTer, fontWeight: 600, textTransform: 'capitalize' }}>{summaryStr}</div>
        {hasSelection && (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', border: `1px solid ${TOKENS.border}`, borderRadius: 7, color: TOKENS.textSec, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon name="x" size={10} color={TOKENS.textSec} />
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, labelColor, children }: { label: string; labelColor?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 1, color: labelColor || TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type, style: extraStyle }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties }) {
  return (
    <input
      type={type || 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        ...extraStyle,
        padding: '10px 12px',
        background: TOKENS.bgCard,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 10,
        color: TOKENS.text,
        fontSize: 13,
        outline: 'none',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ── Avatar
function Avatar({ name, size = 38 }: any) {
  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('');
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: `linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${(hue + 30) % 360} 70% 50%))`,
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.36,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function Pill({ children, color = TOKENS.primary, style = {}, title }: any) {
  const bg = `${color}22`;
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 999, background: bg, color, fontSize: 11, fontWeight: 600, letterSpacing: 0.2, border: `1px solid ${color}33`, cursor: title ? 'help' : undefined, ...style }}>
      {children}
    </span>
  );
}

function MiniStat({ label, value, tone, big }: any) {
  return (
    <div style={{
      background: big ? `linear-gradient(180deg, ${tone}10 0%, ${tone}04 100%)` : TOKENS.bgCard,
      border: `1px solid ${big ? `${tone}22` : TOKENS.border}`,
      borderRadius: big ? 14 : 10,
      padding: big ? 16 : 10,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: big ? 10 : 9, letterSpacing: 1, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: big ? 26 : 16, fontWeight: 700, color: tone, marginTop: big ? 6 : 2, letterSpacing: -0.5 }}>{value}</div>
    </div>
  );
}

// Q&A de ficha (Sesion 7 V2): caja de pregunta libre sobre UNA clienta concreta.
// Reutiliza useAyudaIA (mismo patron "AyudaIA por pagina") + BloqueRenderer;
// el id de la clienta viaja embebido en el propio texto del prompt para que
// ficha_cliente la resuelva directo (sin ambiguedad de nombre) sin tener que
// tocar el edge (que hoy no lee "contexto"). La regla dura de salud la aplica
// el edge/tool (lista blanca + assertSinCamposProhibidos); aqui no hay logica
// de salud que reimplementar.
function FichaPreguntaIA({
  nombreCliente,
  pregunta,
  onChangePregunta,
  onPreguntar,
  estado,
  onReintentar,
  accionEstado,
  onConfirmarAccion,
  onCancelarAccion,
}: {
  nombreCliente: string;
  pregunta: string;
  onChangePregunta: (v: string) => void;
  onPreguntar: () => void;
  estado: ReturnType<typeof useAyudaIA>['estado'];
  onReintentar: () => void;
  accionEstado: AccionEstado;
  onConfirmarAccion: () => void;
  onCancelarAccion: () => void;
}) {
  const cargando = estado.tipo === 'cargando';
  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.primary}40`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
      <style>{'@keyframes fpia-spin { to { transform: rotate(360deg) } }'}</style>
      <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text, marginBottom: 8 }}>Pregúntale a Chispa sobre {nombreCliente}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={pregunta}
          onChange={(e) => onChangePregunta(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !cargando && pregunta.trim()) onPreguntar(); }}
          placeholder="¿Cada cuánto viene? ¿Cuánto gasta de media?"
          style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 9, border: `1px solid ${TOKENS.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: TOKENS.text }}
        />
        <button
          type="button"
          onClick={onPreguntar}
          disabled={cargando || !pregunta.trim()}
          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: TOKENS.primarySoft, color: TOKENS.primaryHi, fontSize: 13, fontWeight: 700, cursor: cargando ? 'not-allowed' : 'pointer', flexShrink: 0 }}
        >
          {cargando ? 'Preguntando...' : 'Preguntar'}
        </button>
      </div>
      {estado.tipo !== 'idle' && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${TOKENS.border}` }}>
          {estado.tipo === 'cargando' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TOKENS.textSec }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${TOKENS.primary}`, borderTopColor: 'transparent', flexShrink: 0, animation: 'fpia-spin 0.8s linear infinite' }} />
              Consultando la ficha...
            </div>
          )}
          {estado.tipo === 'vacio' && <div style={{ fontSize: 13, color: TOKENS.textTer }}>Chispa no ha encontrado nada que responder.</div>}
          {estado.tipo === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 8, background: TOKENS.dangerSoft, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: TOKENS.danger }}>{estado.mensaje}</span>
              <button type="button" onClick={onReintentar} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${TOKENS.danger}`, background: 'transparent', color: TOKENS.danger, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                Reintentar
              </button>
            </div>
          )}
          {estado.tipo === 'listo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {estado.bloques.map((b, i) => (
                <BloqueRenderer
                  key={i}
                  bloque={b}
                  accionEstado={b.tipo === 'accion' ? accionEstado : undefined}
                  onConfirmar={onConfirmarAccion}
                  onCancelar={onCancelarAccion}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Panel decorado para vista expandida (con titulo, accent y borde sutil)
function Panel({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: TOKENS.bgCard,
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 16,
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(40,30,24,0.05)',
    }}>
      {/* Accent bar superior */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accent} 0%, ${accent}33 100%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
        <div style={{ width: 4, height: 16, borderRadius: 2, background: accent }} />
        <div style={{ fontSize: 12, fontWeight: 800, color: TOKENS.text, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

function BonosClienteSection({ clienteId }: { clienteId: string }) {
  const [bonos, setBonos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    supabase
      .from('bonos')
      .select('*, servicios(nombre)')
      .eq('cliente_id', clienteId)
      .eq('estado', 'activo')
      .gt('sesiones_disponibles', 0)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancel) {
          setBonos(data || []);
          setLoading(false);
        }
      });
    return () => { cancel = true; };
  }, [clienteId]);

  if (loading) return <div style={{ fontSize: 13, color: TOKENS.textSec }}>Cargando bonos...</div>;
  if (bonos.length === 0) return <div style={{ fontSize: 13, color: TOKENS.textSec }}>No hay bonos activos.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bonos.map((b) => (
        <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.text }}>
              Bono {b.servicios?.nombre || 'Servicio'}
            </span>
            <span style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 2 }}>
              {b.sesiones_disponibles} de {b.sesiones_totales} sesiones disponibles
            </span>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {Array.from({ length: b.sesiones_totales }).map((_, i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < b.sesiones_disponibles ? TOKENS.success : TOKENS.borderHi }} />
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.success }}>
              {(b.precio_cents / 100).toFixed(2)}€
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Galeria de fotos de servicios del cliente (cortes/colores). Sube a Supabase
// Storage (bucket cliente-fotos) y guarda la referencia en cliente_fotos. Asi el
// cliente ve sus cortes anteriores, igual que en la ficha de la landing.
// C11: tarjeta de fidelizacion (sellos). Cuenta las visitas completadas del
// cliente; cada OBJETIVO visitas = un premio. v2 con persistencia en BD.
function FidelizacionCard({ clienteId, visitas, negocioId }: { clienteId: string; visitas: number; negocioId: string }) {
  const [recompensas, setRecompensas] = useState<any[]>([]);
  const [canjes, setCanjes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [canjeando, setCanjeando] = useState(false);

  // Cargar recompensas configuradas del negocio
  useEffect(() => {
    let cancel = false;
    supabase
      .rpc('obtener_recompensas_negocio', { p_negocio_id: negocioId, p_solo_activas: true })
      .then(({ data }) => {
        if (cancel) return;
        if (data?.ok) {
          setRecompensas(data.recompensas || []);
        }
        setLoading(false);
      });
    return () => { cancel = true; };
  }, [negocioId]);

  // Cargar canjes del cliente
  useEffect(() => {
    if (!clienteId) return;
    let cancel = false;
    supabase
      .from('recompensas_canjeadas')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('negocio_id', negocioId)
      .in('estado', ['canjeado', 'usado'])
      .then(({ data }) => {
        if (cancel) return;
        setCanjes(data || []);
      });
    return () => { cancel = true; };
  }, [clienteId, negocioId]);

  // Función para canjear recompensa
  const canjear = async (recompensaId: string) => {
    if (!clienteId) return;
    setCanjeando(true);
    const { data, error } = await supabase.rpc('canjear_recompensa', {
      p_recompensa_id: recompensaId,
      p_cliente_id: clienteId
    });
    setCanjeando(false);
    if (error) {
      alert('Error al canjear: ' + error.message);
    } else if (data?.ok) {
      // Recargar canjes
      supabase
        .from('recompensas_canjeadas')
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('negocio_id', negocioId)
        .in('estado', ['canjeado', 'usado'])
        .then(({ data }) => setCanjes(data || []));
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: TOKENS.textTer }}>
        Cargando recompensas...
      </div>
    );
  }

  // Si no hay recompensas configuradas, usar versión simple (bug fixeado)
  if (recompensas.length === 0) {
    const OBJETIVO = 10;
    const premios = Math.floor(visitas / OBJETIVO);
    const progreso = visitas % OBJETIVO;
    return (
      <div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {Array.from({ length: OBJETIVO }).map((_, i) => (
            <div key={i} style={{
              width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${i < progreso ? TOKENS.primary : TOKENS.border}`,
              background: i < progreso ? TOKENS.primarySoft : 'transparent',
              color: i < progreso ? TOKENS.primary : TOKENS.textTer, fontSize: 12, fontWeight: 700,
            }}>{i + 1}</div>
          ))}
        </div>
        <div style={{ fontSize: 13, color: TOKENS.textSec }}>
          {progreso}/{OBJETIVO} sellos · {progreso === 0 ? 'Tarjeta nueva' : `faltan ${OBJETIVO - progreso} visita${OBJETIVO - progreso === 1 ? '' : 's'} para el premio`}
          {premios > 0 && ` · ${premios} premio${premios === 1 ? '' : 's'} ya conseguido${premios === 1 ? '' : 's'}`}
        </div>
      </div>
    );
  }

  // Con recompensas configuradas: mostrar la próxima disponible
  const recompensasOrdenadas = [...recompensas].sort((a, b) => a.umbral_visitas - b.umbral_visitas);
  const sigRecompensa = recompensasOrdenadas.find(r => visitas < r.umbral_visitas);
  const recompensaDisponible = recompensasOrdenadas.find(r => visitas >= r.umbral_visitas && !canjes.find(c => c.recompensa_id === r.id));

  return (
    <div>
      {/* Sellos visuales (círculos) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {Array.from({ length: Math.min(sigRecompensa?.umbral_visitas || 10, 12) }).map((_, i) => (
          <div key={i} style={{
            width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${i < visitas ? TOKENS.primary : TOKENS.border}`,
            background: i < visitas ? TOKENS.primarySoft : 'transparent',
            color: i < visitas ? TOKENS.primary : TOKENS.textTer, fontSize: 12, fontWeight: 700,
          }}>{i + 1}</div>
        ))}
      </div>

      {/* Texto de estado */}
      <div style={{ fontSize: 13, color: TOKENS.textSec, marginBottom: 8 }}>
        {visitas} visita{visitas === 1 ? '' : 's'}
        {sigRecompensa && ` · Faltan ${sigRecompensa.umbral_visitas - visitas} para "${sigRecompensa.nombre}"`}
      </div>

      {/* Botón de canje si hay recompensa disponible */}
      {recompensaDisponible && (
        <button
          onClick={() => canjear(recompensaDisponible.id)}
          disabled={canjeando}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: TOKENS.primary,
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: canjeando ? 'wait' : 'pointer',
            opacity: canjeando ? 0.7 : 1,
          }}
        >
          {canjeando ? 'Canjeando...' : `Canjear "${recompensaDisponible.nombre}"`}
        </button>
      )}

      {/* Lista de canjes realizados */}
      {canjes.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: TOKENS.textTer }}>
          Canjes realizados: {canjes.map(c => {
            const rec = recompensas.find(r => r.id === c.recompensa_id);
            return rec?.nombre;
          }).filter(Boolean).join(', ')}
        </div>
      )}
    </div>
  );
}

// C7: consentimientos RGPD del cliente. Cada cambio se registra (log) en
// consentimientos_cliente; el estado actual es el ultimo registro por tipo.
function ConsentimientosSection({ cliente, negocioId }: { cliente: Cliente; negocioId: string }) {
  const TIPOS = [
    { key: 'tratamiento_datos', label: 'Tratamiento de datos (RGPD)' },
    { key: 'imagen', label: 'Uso de imagen (fotos antes/después)' },
    { key: 'comunicaciones_comerciales', label: 'Comunicaciones comerciales' },
  ];
  const [estado, setEstado] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  // Consentimiento especifico de la capa de IA (Chispa). Vive en la columna
  // clientes.consiente_ia, que es la que consulta el edge del asistente. Si es
  // false, la IA trata a este cliente como inexistente (no aparece en sus
  // respuestas). Los datos de salud (alergias) NUNCA viajan a la IA, con
  // independencia de este flag.
  const [consienteIA, setConsienteIA] = useState<boolean>(cliente.consiente_ia !== false);
  const toggleIA = async () => {
    const nuevo = !consienteIA;
    setConsienteIA(nuevo);
    await supabase.rpc('actualizar_consentimiento_ia', {
      p_cliente_id: cliente.id,
      p_consentimiento: nuevo,
      p_origen: 'staff'
    });
  };

  useEffect(() => {
    let cancel = false;
    supabase
      .from('consentimientos_cliente')
      .select('tipo, aceptado, revocado, fecha')
      .eq('cliente_id', cliente.id)
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        if (cancel) return;
        const m: Record<string, boolean> = {};
        (data ?? []).forEach((r: any) => { if (!(r.tipo in m)) m[r.tipo] = !!r.aceptado && !r.revocado; });
        setEstado(m);
        setLoading(false);
      });
    return () => { cancel = true; };
  }, [cliente.id]);

  const toggle = async (tipo: string) => {
    const nuevo = !estado[tipo];
    setEstado((prev) => ({ ...prev, [tipo]: nuevo }));
    await supabase.from('consentimientos_cliente').insert({
      negocio_id: negocioId,
      cliente_id: cliente.id,
      tipo,
      aceptado: nuevo,
      revocado: !nuevo,
      metodo_obtencion: 'app',
      fecha: new Date().toISOString(),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Consentimiento de la capa de IA (Chispa): controla si el asistente
          puede ver/usar los datos operativos de este cliente. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: TOKENS.text }}>Asistente de IA (Chispa)</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 12, background: consienteIA ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: consienteIA ? '#166534' : '#991b1b' }}>
              Consiente IA: {consienteIA ? 'Sí' : 'No'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 4 }}>
            Si lo desactivas, la IA no verá ni usará datos de este cliente. Salud NUNCA se envía.
            <div style={{ marginTop: 2, fontStyle: 'italic' }}>
              Auditoría: {cliente.consiente_ia_fecha ? `${new Date(cliente.consiente_ia_fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })} (origen: ${cliente.consiente_ia_origen || 'desconocido'})` : 'Sin registro'}
            </div>
          </div>
        </div>
        <button
          onClick={toggleIA}
          aria-label="Consentimiento del asistente de IA"
          style={{ width: 42, height: 24, borderRadius: 12, border: 'none', background: consienteIA ? TOKENS.success : 'rgba(40,30,24,0.15)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.18s ease' }}
        >
          <span style={{ position: 'absolute', top: 3, left: consienteIA ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.18s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
        </button>
      </div>
      {TIPOS.map((t) => (
        <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${TOKENS.border}` }}>
          <span style={{ fontSize: 13, color: TOKENS.text }}>{t.label}</span>
          <button
            onClick={() => toggle(t.key)}
            disabled={loading}
            aria-label={t.label}
            style={{ width: 42, height: 24, borderRadius: 12, border: 'none', background: estado[t.key] ? TOKENS.success : 'rgba(40,30,24,0.15)', cursor: loading ? 'default' : 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.18s ease' }}
          >
            <span style={{ position: 'absolute', top: 3, left: estado[t.key] ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.18s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
          </button>
        </div>
      ))}
      <span style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 4 }}>Cada cambio queda registrado con su fecha (RGPD).</span>
    </div>
  );
}

function FotosClienteSection({ cliente, negocioId, bare = false, gridRef }: { cliente: Cliente; negocioId: string; bare?: boolean; gridRef?: (el: HTMLElement | null) => void }) {
  const [fotos, setFotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showInstagram, setShowInstagram] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('cliente_fotos')
      .select('id, storage_path, url, nota, created_at')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false });
    const rows = data ?? [];
    // El bucket es PRIVADO (las fotos de clientas son dato personal): se pintan
    // con URLs firmadas temporales a partir de storage_path. La columna url
    // (publica, de la epoca del bucket abierto) ya no sirve para renderizar.
    const paths = rows.map((r: any) => r.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from('cliente-fotos').createSignedUrls(paths, 3600);
      const byPath = new Map((signed ?? []).map((s: any) => [s.path, s.signedUrl]));
      rows.forEach((r: any) => { r.url = byPath.get(r.storage_path) || null; });
    }
    setFotos(rows.filter((r: any) => !!r.url));
    setLoading(false);
  }
  useEffect(() => { load(); }, [cliente.id]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0 || !negocioId) return;
    setUploading(true); setErr('');
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id ?? null;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        // Validar tamaño de archivo (máximo 5MB para prevenir DoS)
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
          setErr(`La foto "${file.name}" excede 5MB. Por favor, usa una imagen más pequeña.`);
          continue;
        }
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const c: any = (globalThis as any).crypto;
        const rand = c && typeof c.randomUUID === 'function' ? c.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const path = `${negocioId}/${cliente.id}/${rand}.${ext}`;
        const up = await supabase.storage.from('cliente-fotos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
        if (up.error) { setErr('No se pudo subir alguna foto.'); continue; }
        // Bucket privado: no se guarda URL publica; load() firma desde storage_path.
        await supabase.from('cliente_fotos').insert({ cliente_id: cliente.id, negocio_id: negocioId, storage_path: path, url: null, created_by: uid });
      }
      await load();
    } catch {
      setErr('No se pudo subir alguna foto.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(f: any) {
    setFotos((prev) => prev.filter((x) => x.id !== f.id));
    try {
      await supabase.storage.from('cliente-fotos').remove([f.storage_path]);
      await supabase.from('cliente_fotos').delete().eq('id', f.id);
    } catch { await load(); }
  }

  const subirBtn = (
    <div style={{ display: 'flex', gap: 8 }}>
      {fotos.length >= 2 && (
        <button
          onClick={() => {
            if (!cliente.consiente_ia) {
              alert('Para crear un post con IA, marca la casilla de consentimiento de IA en la ficha de la clienta.');
              return;
            }
            setShowInstagram(true);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: `1px solid ${TOKENS.primary}`, background: 'transparent', color: TOKENS.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !cliente.consiente_ia ? 0.5 : 1 }}
          title={!cliente.consiente_ia ? 'Requiere consentimiento de IA' : 'Generar post para Instagram'}
        >
          <Icon name="sparkle" size={13} color={TOKENS.primary} />
          Crear post Instagram
        </button>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: `1px solid ${TOKENS.primary}`, background: TOKENS.primarySoft, color: TOKENS.primaryHi, fontSize: 12, fontWeight: 700, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}
      >
        <Icon name="plus" size={13} color={TOKENS.primaryHi} />
        {uploading ? 'Subiendo…' : 'Subir foto'}
      </button>
    </div>
  );

  return (
    <div ref={(el) => { gridRef?.(el); }}>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => onFiles((e.target as HTMLInputElement).files)} />
      {!bare && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: TOKENS.text, letterSpacing: 0.5, textTransform: 'uppercase' }}>Fotos de servicios</div>
          {subirBtn}
        </div>
      )}
      {bare && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>{subirBtn}</div>}
      {err ? <div style={{ fontSize: 11, color: TOKENS.danger, marginBottom: 8 }}>{err}</div> : null}
      {loading ? (
        <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '8px 0' }}>Cargando fotos…</div>
      ) : fotos.length === 0 ? (
        <button onClick={() => fileRef.current?.click()} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '26px 16px', borderRadius: 14, border: `1.5px dashed ${TOKENS.borderHi}`, background: TOKENS.bgCardHi, cursor: 'pointer' }}>
          <Icon name="sparkle" size={22} color={TOKENS.primary} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: TOKENS.textSec }}>Sube el antes y el después de cada corte</span>
          <span style={{ fontSize: 11, color: TOKENS.textTer }}>La próxima vez sabes exactamente cómo quedó</span>
        </button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
          {fotos.map((f) => (
            <div key={f.id} onClick={() => setLightbox(f.url)} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', border: `1px solid ${TOKENS.border}`, background: TOKENS.bgCardHi, cursor: 'pointer' }}>
              <img src={f.url} alt="Foto de servicio" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button title="Eliminar foto" onClick={(e) => { e.stopPropagation(); remove(f); }} style={{ position: 'absolute', top: 2, right: 2, width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(18,13,10,0.7)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <Icon name="trash" size={15} color="#fff" />
              </button>
            </div>
          ))}
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ aspectRatio: '1 / 1', borderRadius: 12, border: `1.5px dashed ${TOKENS.primary}`, background: TOKENS.primarySoft, color: TOKENS.primaryHi, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <Icon name="plus" size={20} color={TOKENS.primaryHi} />
          </button>
        </div>
      )}
      {lightbox && createPortal(
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(8,6,4,0.86)', display: 'grid', placeItems: 'center', padding: 28, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="Foto de servicio" style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }} />
        </div>,
        document.body
      )}
      
      {showInstagram && (
        <InstagramPostModal 
          fotos={fotos} 
          onClose={() => setShowInstagram(false)} 
        />
      )}
    </div>
  );
}

// Portabilidad RGPD (art. 20) de UNA clienta: descarga un JSON con todos sus datos
// (ficha, citas, cobros, presupuestos, fichas tecnicas, consentimientos, resenas,
// lista de espera). El RPC exportar_datos_cliente valida el rol owner/admin en
// servidor; para no-gestores devuelve un error que mostramos por alerta.
async function exportDatosClienteJSON(clienteId: string, nombre?: string | null) {
  type ExportResp = { ok: boolean; error?: string } & Record<string, unknown>;
  const { data, error } = await supabase.rpc('exportar_datos_cliente', { p_cliente_id: clienteId });
  const resp = (data ?? null) as ExportResp | null;
  if (error || !resp?.ok) {
    window.alert(error ? mensajeDeError(error, 'No se pudieron exportar los datos.') : (resp?.error || 'No se pudieron exportar los datos.'));
    return;
  }
  const blob = new Blob([JSON.stringify(resp, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const slug = String(nombre ?? 'cliente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cliente';
  link.download = `mecha-cliente-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Descarga la ficha del cliente como PDF (ventana imprimible con marca Mecha,
// el navegador la guarda como PDF). Mismo enfoque que el export de Informes.
async function exportFichaPDF(c: any, citas: Cita[], servicios: any[]) {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (ch) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[ch]));
  const srvMap = new Map(servicios.map((s: any) => [s.id, s]));

  const hist = citas
    .filter((x) => x.cliente_id === c.id)
    .slice()
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());
  const histHtml = hist.slice(0, 40).map((x: any) => {
    const d = new Date(x.inicio);
    const srv = srvMap.get(x.servicio_id);
    return `<tr><td>${esc(d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }))}</td><td>${esc(srv?.nombre || '—')}</td><td>${esc(x.estado || '')}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="empty">Sin historial</td></tr>';

  const ultFormula: any = hist.find((x: any) => x.formula_producto || x.formula_tono);
  const formulaHtml = ultFormula
    ? `<div class="chips">${[ultFormula.formula_producto, ultFormula.formula_tono, ultFormula.formula_tiempo_min ? `${ultFormula.formula_tiempo_min} min` : '', ultFormula.formula_resultado].filter(Boolean).map((t: any) => `<span class="chip">${esc(t)}</span>`).join('')}</div>${ultFormula.formula_notas ? `<p class="muted">${esc(ultFormula.formula_notas)}</p>` : ''}`
    : '<p class="muted">Sin fórmula registrada</p>';

  let fotosHtml = '';
  try {
    const { data: fts } = await supabase.from('cliente_fotos').select('url').eq('cliente_id', c.id).order('created_at', { ascending: false });
    if (fts && fts.length) {
      fotosHtml = `<h2>Fotos de servicios</h2><div class="photos">${fts.slice(0, 12).map((f: any) => `<img src="${esc(f.url)}" />`).join('')}</div>`;
    }
  } catch { /* las fotos son opcionales en el PDF */ }

  const generado = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const desde = c.primeraVisita ? c.primeraVisita.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '—';
  const ticket = `${Math.round((c.gastado || 0) / Math.max(c.visitas || 1, 1))} €`;
  const alergias = (c.alergias ?? '').trim();
  const notas = (c.notas ?? '').trim();

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ficha — ${esc(c.nombre)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1c1814; background:#fff; padding:30px 34px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .head { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:3px solid #f4501e; padding-bottom:14px; margin-bottom:20px; }
  .brand { font-size:25px; font-weight:800; letter-spacing:-0.6px; }
  .brand .dot { color:#f4501e; }
  .meta { text-align:right; font-size:12px; color:#5c5249; line-height:1.6; }
  .meta strong { color:#1c1814; }
  h1 { font-size:22px; font-weight:800; letter-spacing:-0.5px; margin-bottom:2px; }
  .sub { font-size:12.5px; color:#736658; font-weight:600; }
  h2 { font-size:13px; font-weight:700; margin:20px 0 9px; padding-left:9px; border-left:4px solid #f4501e; text-transform:uppercase; letter-spacing:0.4px; }
  .stats { display:flex; gap:10px; margin-top:14px; }
  .stat { flex:1; border:1px solid rgba(40,30,24,0.12); border-radius:12px; padding:12px; text-align:center; }
  .stat .v { font-size:20px; font-weight:800; }
  .stat .k { font-size:10px; color:#736658; text-transform:uppercase; letter-spacing:0.6px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th,td { text-align:left; padding:7px 9px; border-bottom:1px solid rgba(40,30,24,0.08); }
  th { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#736658; }
  .empty { color:#736658; font-style:italic; }
  .muted { color:#5c5249; font-size:12.5px; line-height:1.5; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { background:rgba(244,80,30,0.10); color:#c0260a; border:1px solid rgba(244,80,30,0.25); border-radius:999px; padding:4px 10px; font-size:11.5px; font-weight:600; }
  .alert { background:rgba(226,59,52,0.08); border:1px solid rgba(226,59,52,0.3); color:#b91c1c; border-radius:10px; padding:10px 12px; font-size:12.5px; font-weight:600; }
  .photos { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .photos img { width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:8px; border:1px solid rgba(40,30,24,0.1); }
  @media print { body { padding:0; } }
</style></head><body>
  <div class="head">
    <div class="brand">Mecha<span class="dot">.</span></div>
    <div class="meta">Ficha de cliente<br><strong>${esc(generado)}</strong></div>
  </div>
  <h1>${esc(c.nombre)}</h1>
  <div class="sub">${esc(c.telefono || 'Sin teléfono')}${c.email ? ' · ' + esc(c.email) : ''} · cliente desde ${esc(desde)}</div>
  <div class="stats">
    <div class="stat"><div class="v">${esc(c.visitas ?? 0)}</div><div class="k">visitas</div></div>
    <div class="stat"><div class="v">${esc(c.gastado ?? 0)} €</div><div class="k">gastado</div></div>
    <div class="stat"><div class="v">${esc(ticket)}</div><div class="k">ticket medio</div></div>
  </div>
  ${alergias ? `<h2>Alergias</h2><div class="alert">${esc(alergias)}</div>` : ''}
  <h2>Fórmula de color</h2>${formulaHtml}
  ${notas ? `<h2>Notas</h2><p class="muted">${esc(notas)}</p>` : ''}
  ${fotosHtml}
  <h2>Historial</h2>
  <table><thead><tr><th>Fecha</th><th>Servicio</th><th>Estado</th></tr></thead><tbody>${histHtml}</tbody></table>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { window.alert('Activa las ventanas emergentes para descargar la ficha en PDF.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch { /* el usuario puede imprimir manualmente */ } }, 400);
}

function Section({ title, children }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

export default withClientDataGate(ClientesWeb, 'Clientes');
