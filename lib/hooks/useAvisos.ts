import { useCallback, useEffect, useState } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { CITA_STATUS } from '@/lib/constants';
import { contarSinLeer } from '@/lib/bandeja';
import { cargarHallazgos, marcarHallazgo, type Hallazgo, type EstadoHallazgo } from '@/lib/hallazgos';

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

        const [citasRes, clientesRes, mensajes, fugaRes, hallazgosRes] = await Promise.all([
          supabase
            .from('citas')
            .select('id, inicio, cliente_id')
            .eq('negocio_id', negocioId)
            .eq('estado', CITA_STATUS.CONFIRMADA)
            .eq('confirmada_cliente', false)
            .eq('oculta_en_calendario', false)
            .gte('inicio', ahora.toISOString())
            .lte('inicio', en48h.toISOString())
            .order('inicio', { ascending: true })
            .limit(20),
          supabase.from('clientes').select('id, nombre, fecha_nacimiento').eq('negocio_id', negocioId).not('fecha_nacimiento', 'is', null),
          contarSinLeer(negocioId).catch(() => 0),
          esGestor && !IS_DEMO_MODE && negocioId !== 'demo_salon_001'
            ? supabase.rpc('clientes_en_riesgo_fuga')
            : Promise.resolve({ data: [], error: null } as any),
          // Hallazgos del escaneo proactivo (S13). El RPC deriva el negocio del auth.uid();
          // en demo devuelve [] (el motor no persiste el tenant compartido).
          IS_DEMO_MODE || negocioId === 'demo_salon_001' ? Promise.resolve([]) : cargarHallazgos().catch(() => []),
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
        const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
        const out: AvisoCumple[] = [];
        (clientesRes.data ?? []).forEach((cl: any) => {
          const fn = new Date(cl.fecha_nacimiento);
          if (isNaN(fn.getTime())) return;
          let next = new Date(ahora.getFullYear(), fn.getMonth(), fn.getDate());
          let diff = Math.ceil((next.getTime() - hoy0) / 86400000);
          if (diff < 0) {
            next = new Date(ahora.getFullYear() + 1, fn.getMonth(), fn.getDate());
            diff = Math.ceil((next.getTime() - hoy0) / 86400000);
          }
          if (diff >= 0 && diff <= 7) out.push({ clienteId: cl.id, nombre: cl.nombre, fecha: next, diff });
        });
        setCumples(out.sort((a, b) => a.diff - b.diff).slice(0, 8));

        setMensajesSinLeer(mensajes || 0);
        setClientesFuga(fugaRes?.error ? 0 : (fugaRes?.data ?? []).length);
        setHallazgos(((hallazgosRes as Hallazgo[]) ?? []).filter((h) => !HALLAZGOS_YA_NATIVOS.has(h.tipo)));
        setLoading(false);
      } catch {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [enabled, tick]);

  const total = sinConfirmar.length + cumples.length + mensajesSinLeer + clientesFuga + hallazgos.length;
  return { sinConfirmar, cumples, mensajesSinLeer, clientesFuga, hallazgos, total, loading, refresh, resolverHallazgo };
}
