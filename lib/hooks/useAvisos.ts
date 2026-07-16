import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { CITA_STATUS } from '@/lib/constants';
import { contarSinLeer } from '@/lib/bandeja';
import { cargarHallazgos, marcarHallazgo, type Hallazgo, type EstadoHallazgo } from '@/lib/hallazgos';
import {
  categoriaDeHallazgo, ordenarAvisos,
  type AvisoItem, type AvisoUrgencia,
} from '@/lib/avisosCategorias';
import { analizarAgendaDia, type ProblemaAgenda } from '@/lib/organizarAgenda';

// Hallazgos (S13/S14) que YA se muestran como su propia seccion nativa de Avisos:
// se excluyen de la seccion "Chispa esta vigilando" para no duplicar.
const HALLAZGOS_YA_NATIVOS = new Set(['cita_sin_confirmar', 'bandeja_sin_responder', 'fuga_clienta']);

// Avisos globales del negocio (campana). Misma logica que el panel de la agenda,
// pero autocontenida para poder montarse en cualquier pagina (Sidebar / tab bar):
// citas sin confirmar en 48h, mensajes sin leer, clientas en riesgo de fuga y
// cumpleanos proximos. Cada aviso lleva lo necesario para navegar a resolverlo.

export interface AvisoCitaSinConfirmar {
  id: string;
  inicio: string;
  clienteNombre: string;
}

export interface AvisoCumple {
  clienteId: string;
  nombre: string;
  fecha: Date;
  diff: number; // dias hasta el cumple (0 = hoy)
}

export interface AvisosData {
  sinConfirmar: AvisoCitaSinConfirmar[];
  cumples: AvisoCumple[];
  mensajesSinLeer: number;
  clientesFuga: number;
  // Hallazgos del escaneo proactivo (S13) que no tienen ya seccion nativa
  // (senal sin pagar, presupuesto sin respuesta, stock bajo).
  hallazgos: Hallazgo[];
  ineficiencias: ProblemaAgenda[];
  // Vista unificada de TODOS los avisos, normalizada y ordenada (urgencia +
  // cercania temporal). La consumen la campana web y la hoja movil para pintar
  // categorias, urgencia y orden cronologico de forma identica.
  items: AvisoItem[];
  total: number;
  loading: boolean;
  refresh: () => void;
  // Resolver/descartar un hallazgo desde Avisos (cierra el bucle: estado + notif).
  resolverHallazgo: (id: string, estado: Extract<EstadoHallazgo, 'resuelto' | 'descartado'>) => Promise<void>;
}

export function useAvisos(enabled = true): AvisosData {
  const [sinConfirmar, setSinConfirmar] = useState<AvisoCitaSinConfirmar[]>([]);
  const [cumples, setCumples] = useState<AvisoCumple[]>([]);
  const [mensajesSinLeer, setMensajesSinLeer] = useState(0);
  const [clientesFuga, setClientesFuga] = useState(0);
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([]);
  const [ineficiencias, setIneficiencias] = useState<ProblemaAgenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const resolverHallazgo = useCallback(
    async (id: string, estado: Extract<EstadoHallazgo, 'resuelto' | 'descartado'>) => {
      // Optimista: quita el hallazgo de la lista al instante; refresh reconcilia.
      setHallazgos((prev) => prev.filter((h) => h.id !== id));
      await marcarHallazgo(id, estado);
      setTick((t) => t + 1);
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      try {
        const profile = await getUserProfile();
        const negocioId = profile?.negocio_id;
        if (!negocioId || !alive) { setLoading(false); return; }

        const ahora = new Date();
        const en48h = new Date(ahora.getTime() + 48 * 3600000);
        const esGestor = profile?.role === 'owner' || profile?.role === 'admin';

        const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        const manana0 = new Date(hoy0.getTime() + 86400000);

        const [citasRes, clientesRes, mensajes, fugaRes, hallazgosRes, citasHoyRes, profsRes] = await Promise.all([
          supabase
            .from('citas')
            .select('id, inicio, cliente_id')
            .eq('negocio_id', negocioId)
            .eq('estado', CITA_STATUS.CONFIRMADA)
            .eq('confirmada_cliente', false)
            .eq('oculta_en_calendario', false)
            .gte('inicio', ahora.toISOString())
            .lte('inicio', en48h.toISOString())
            .order('inicio', { ascending: true }),
          supabase.from('clientes').select('id, nombre, fecha_nacimiento').eq('negocio_id', negocioId).not('fecha_nacimiento', 'is', null),
          contarSinLeer(negocioId).catch(() => 0),
          esGestor && !IS_DEMO_MODE && negocioId !== 'demo_salon_001'
            ? supabase.rpc('clientes_en_riesgo_fuga')
            : Promise.resolve({ data: [], error: null } as any),
          // Hallazgos del escaneo proactivo (S13). El RPC deriva el negocio del auth.uid();
          // en demo devuelve [] (el motor no persiste el tenant compartido).
          IS_DEMO_MODE || negocioId === 'demo_salon_001' ? Promise.resolve([]) : cargarHallazgos().catch(() => []),
          // Citas de hoy para detectar ineficiencias de agenda
          supabase
            .from('citas')
            .select('id, inicio, fin, fin_activa, fin_espera, profesional_id, cliente_id, estado, grupo_id, servicio_id')
            .eq('negocio_id', negocioId)
            .eq('oculta_en_calendario', false)
            .in('estado', [CITA_STATUS.PENDIENTE, CITA_STATUS.CONFIRMADA])
            .gte('inicio', hoy0.toISOString())
            .lt('inicio', manana0.toISOString()),
          // Profesionales para analizar la agenda
          supabase.from('profesionales').select('id, nombre, categoria').eq('negocio_id', negocioId).eq('activo', true),
        ]);
        if (!alive) return;

        const citas = citasRes.data ?? [];
        const clienteIds = Array.from(new Set(citas.map((c: any) => c.cliente_id).filter(Boolean)));
        let nombreMap = new Map<string, string>();
        if (clienteIds.length > 0) {
          const { data: cls } = await supabase.from('clientes').select('id, nombre').in('id', clienteIds);
          nombreMap = new Map((cls ?? []).map((c: any) => [c.id, c.nombre]));
        }
        if (!alive) return;
        setSinConfirmar(citas.map((c: any) => ({ id: c.id, inicio: c.inicio, clienteNombre: nombreMap.get(c.cliente_id) || 'Cliente' })));

        // Cumpleanos en los proximos 7 dias (misma logica que la agenda)
        const hoy0Ms = hoy0.getTime();
        const out: AvisoCumple[] = [];
        (clientesRes.data ?? []).forEach((cl: any) => {
          const fn = new Date(cl.fecha_nacimiento);
          if (isNaN(fn.getTime())) return;
          let next = new Date(ahora.getFullYear(), fn.getMonth(), fn.getDate());
          let diff = Math.ceil((next.getTime() - hoy0Ms) / 86400000);
          if (diff < 0) {
            next = new Date(ahora.getFullYear() + 1, fn.getMonth(), fn.getDate());
            diff = Math.ceil((next.getTime() - hoy0Ms) / 86400000);
          }
          if (diff >= 0 && diff <= 7) out.push({ clienteId: cl.id, nombre: cl.nombre, fecha: next, diff });
        });
        setCumples(out.sort((a, b) => a.diff - b.diff).slice(0, 8));

        setMensajesSinLeer(mensajes || 0);
        setClientesFuga(fugaRes?.error ? 0 : (fugaRes?.data ?? []).length);
        setHallazgos(((hallazgosRes as Hallazgo[]) ?? []).filter((h) => !HALLAZGOS_YA_NATIVOS.has(h.tipo)));
        
        // --- Analizar ineficiencias de hoy ---
        const citasHoy = citasHoyRes.data ?? [];
        const profesionales = profsRes.data ?? [];
        
        // Necesitamos mapear nombre de cliente y telefono si estuvieran para las tarjetas (no es critico si faltan)
        const clienteIdsHoy = Array.from(new Set(citasHoy.map((c: any) => c.cliente_id).filter(Boolean)));
        if (clienteIdsHoy.length > 0) {
          const clsFaltantes = clienteIdsHoy.filter(id => !nombreMap.has(id));
          if (clsFaltantes.length > 0) {
            const { data: cls } = await supabase.from('clientes').select('id, nombre').in('id', clsFaltantes);
            (cls ?? []).forEach((c: any) => nombreMap.set(c.id, c.nombre));
          }
        }
        
        const citasOrganizar = citasHoy.map((c: any) => ({
          ...c,
          cliente: nombreMap.get(c.cliente_id) || 'El cliente',
          telefono: '', // no estricto para Avisos
          servicio: 'Servicio', 
        }));
        
        const { data: bloqueosData } = await supabase
          .from('bloqueos_profesional')
          .select('profesional_id, inicio, fin')
          .eq('negocio_id', negocioId);

        const problemas = analizarAgendaDia(citasOrganizar, profesionales, {
          ahoraMs: ahora.getTime(),
          bloqueos: bloqueosData ?? [],
        });
        setIneficiencias(problemas);
        // --- Fin ineficiencias ---

        setLoading(false);
      } catch {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [enabled, tick]);

  const total = sinConfirmar.length + cumples.length + mensajesSinLeer + clientesFuga + hallazgos.length + ineficiencias.length;

  // Vista unificada: normaliza cada fuente a AvisoItem (categoria + urgencia + ts
  // + ruta) y ordena por urgencia y cercania temporal. Un solo lugar de verdad
  // para que campana y hoja movil sean identicas.
  const items = useMemo<AvisoItem[]>(() => {
    const ahora = Date.now();
    const out: AvisoItem[] = [];

    // Citas sin confirmar (proximas 48h): agrupadas en un solo aviso.
    if (sinConfirmar.length > 0) {
      const subItems: AvisoItem[] = sinConfirmar.map((c) => {
        const ts = new Date(c.inicio).getTime();
        return {
          id: `cita:${c.id}`,
          categoria: 'citas',
          urgencia: ts - ahora < 24 * 3600000 ? 'alta' : 'media',
          titulo: c.clienteNombre,
          subtitulo: 'Sin confirmar por el cliente',
          ts,
          ruta: `/(tabs)/?cita=${c.id}`,
        };
      });
      // El grupo principal hereda la urgencia maxima de sus items y el ts mas cercano.
      const maxUrgencia = subItems.some((i) => i.urgencia === 'alta') ? 'alta' : 'media';
      const minTs = Math.min(...subItems.map((i) => i.ts));
      out.push({
        id: 'citas_sin_confirmar_grupo',
        categoria: 'citas',
        urgencia: maxUrgencia,
        titulo: `${sinConfirmar.length} citas sin confirmar por el cliente`,
        subtitulo: 'Pendientes de confirmación SMS/link',
        ts: minTs,
        ruta: '', // No navega, se expande en la campana
        meta: String(sinConfirmar.length),
        subItems,
      });
    }

    // Mensajes sin leer (agregado): un aviso con el total.
    if (mensajesSinLeer > 0) {
      out.push({
        id: 'mensajes',
        categoria: 'mensajes',
        urgencia: 'media',
        titulo: `${mensajesSinLeer} ${mensajesSinLeer === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}`,
        subtitulo: 'En Bandeja',
        ts: ahora,
        ruta: '/(tabs)/bandeja',
        meta: String(mensajesSinLeer),
      });
    }

    // Clientas en riesgo de fuga (agregado).
    if (clientesFuga > 0) {
      out.push({
        id: 'fuga',
        categoria: 'clientes',
        urgencia: 'media',
        titulo: `${clientesFuga} ${clientesFuga === 1 ? 'clienta en riesgo de fuga' : 'clientas en riesgo de fuga'}`,
        subtitulo: 'Hace tiempo que no vienen',
        ts: ahora,
        ruta: '/(tabs)/clientes?filtro=fuga',
        meta: String(clientesFuga),
      });
    }

    // Cumpleanos proximos (prioridad baja).
    cumples.forEach((b) => {
      const cuando = b.diff === 0 ? 'Hoy cumple años' : b.diff === 1 ? 'Mañana cumple años' : `Cumple en ${b.diff} días`;
      out.push({
        id: `cumple:${b.clienteId}`,
        categoria: 'clientes',
        urgencia: 'baja',
        titulo: b.nombre,
        subtitulo: cuando,
        ts: b.fecha.getTime(),
        ruta: `/(tabs)/clientes?clienteId=${b.clienteId}`,
      });
    });

    // Hallazgos del escaneo proactivo (senal sin pagar, stock bajo, retrasos...).
    hallazgos.forEach((h) => {
      const cnt = h.datos?.count ?? 0;
      out.push({
        id: `hallazgo:${h.id}`,
        categoria: categoriaDeHallazgo(h),
        urgencia: h.severidad,
        titulo: h.resumen,
        subtitulo: h.detalle || undefined,
        ts: new Date(h.creado_en).getTime() || ahora,
        ruta: rutaHallazgo(h.tipo, h.accion_sugerida?.payload as Record<string, unknown>),
        hallazgoId: h.id,
        meta: cnt > 0 ? `${cnt} ${cnt === 1 ? 'caso' : 'casos'}` : undefined,
      });
    });

    // Ineficiencias de agenda (huecos, retrasos severos)
    ineficiencias.forEach((prob) => {
      if (prob.tipo === 'hueco_muerto') return; // The user asked to remove "huecos muertos" notifications
      out.push({
        id: `ineficiencia:${prob.id}`,
        categoria: 'ineficiencia',
        urgencia: prob.tipo === 'retraso' || prob.tipo === 'solape' ? 'alta' : 'media',
        titulo: prob.titulo,
        subtitulo: prob.descripcion,
        ts: ahora,
        ruta: '/(tabs)/', // abre la agenda
      });
    });

    return ordenarAvisos(out);
  }, [sinConfirmar, cumples, mensajesSinLeer, clientesFuga, hallazgos, ineficiencias]);

  return { sinConfirmar, cumples, mensajesSinLeer, clientesFuga, hallazgos, ineficiencias, items, total, loading, refresh, resolverHallazgo };
}

// Ruta destino de un hallazgo segun su accion sugerida (o por tipo como
// fallback). Compartida por la vista unificada de items.
function rutaHallazgo(tipo: string, payload?: Record<string, unknown>): string {
  const destino = (payload?.destino as string) || '';
  const mapa: Record<string, string> = {
    agenda: '/(tabs)/', bandeja: '/(tabs)/bandeja', presupuestos: '/(tabs)/presupuestos',
    inventario: '/(tabs)/inventario', clientes: '/(tabs)/clientes',
  };
  if (destino && mapa[destino]) return mapa[destino];
  if (tipo === 'senal_sin_pagar') return '/(tabs)/';
  if (tipo === 'presupuesto_sin_respuesta') return '/(tabs)/presupuestos';
  if (tipo === 'stock_bajo') return '/(tabs)/inventario';
  return '/(tabs)/';
}
