import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Section, SSelect, Btn, Badge, IconBtn } from '@/components/ui/SettingsAtoms';
import { useResponsive } from '@/lib/hooks/useResponsive';

// Ajustes -> Servicios -> "Lo que se suele añadir".
//
// Es el lado del DUEÑO del paso "¿te falta algo?" del portal de reserva: con
// que servicio proponer que otro. La clienta da por incluidos el lavado, el
// peinado o el matiz, no los marca, y la cita se va de hora. Aqui se decide
// que se le propone antes de que elija la hora, para poder reservar el tiempo
// de verdad.
//
// Dos origenes en la misma tabla (`servicios_sugeridos`):
//   manual     lo pone el dueño aqui. Manda siempre.
//   aprendido  lo deduce el historial del salon (>= 8 visitas con el servicio
//              base en 180 dias y el sugerido en >= 30% de ellas). Se puede
//              apagar, y apagado se queda: el recalculo no reactiva lo que el
//              dueño ha desactivado a mano... salvo que vuelva a cumplir; por
//              eso desactivar de verdad se hace convirtiendolo en manual.
//
// Escribe directo a la tabla: RLS ya limita a `negocio_id` propio.

// `id` opcional porque un servicio recien creado en el formulario aun no lo
// tiene; esos se filtran antes de pintar nada.
interface ServicioMin {
  id?: string;
  nombre: string;
  activo?: boolean;
  reservable_online?: boolean;
}

interface Fila {
  id: string;
  servicio_id: string;
  sugerido_id: string;
  origen: 'manual' | 'aprendido';
  visitas: number;
  confianza: number;
  activo: boolean;
}

export function SugerenciasServicios({
  negocioId,
  services,
}: {
  negocioId: string | null;
  services: ServicioMin[];
}) {
  const { isMobile } = useResponsive();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [base, setBase] = useState<string>('');
  const [sugerido, setSugerido] = useState<string>('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Solo tiene sentido sugerir lo que la clienta puede reservar online.
  const reservables = useMemo(
    () => services.filter((s): s is ServicioMin & { id: string } =>
      !!s.id && s.activo !== false && !!s.reservable_online),
    [services],
  );
  const nombrePorId = useMemo(
    () => new Map(services.filter((s) => !!s.id).map((s) => [s.id as string, s.nombre])),
    [services],
  );

  const cargar = useCallback(async () => {
    if (!negocioId) return;
    setCargando(true);
    const { data, error: e } = await supabase
      .from('servicios_sugeridos')
      .select('id, servicio_id, sugerido_id, origen, visitas, confianza, activo')
      .eq('negocio_id', negocioId)
      .order('origen', { ascending: true })
      .order('confianza', { ascending: false });
    if (e) setError(e.message);
    else setFilas((data ?? []) as Fila[]);
    setCargando(false);
  }, [negocioId]);

  useEffect(() => { cargar(); }, [cargar]);

  const anadir = async () => {
    if (!negocioId || !base || !sugerido || base === sugerido) return;
    setGuardando(true);
    setError('');
    const { error: e } = await supabase
      .from('servicios_sugeridos')
      .upsert(
        { negocio_id: negocioId, servicio_id: base, sugerido_id: sugerido, origen: 'manual', activo: true },
        { onConflict: 'servicio_id,sugerido_id' },
      );
    if (e) setError(e.message);
    else { setSugerido(''); await cargar(); }
    setGuardando(false);
  };

  const alternar = async (f: Fila) => {
    // Al tocar una fila aprendida pasa a manual: es una decision del dueño y el
    // recalculo nocturno no debe revertirla.
    const { error: e } = await supabase
      .from('servicios_sugeridos')
      .update({ activo: !f.activo, origen: 'manual', updated_at: new Date().toISOString() })
      .eq('id', f.id);
    if (e) setError(e.message);
    else await cargar();
  };

  const borrar = async (f: Fila) => {
    const { error: e } = await supabase.from('servicios_sugeridos').delete().eq('id', f.id);
    if (e) setError(e.message);
    else await cargar();
  };

  // Agrupadas por servicio base: se lee mucho mejor que una lista plana.
  const grupos = useMemo(() => {
    const m = new Map<string, Fila[]>();
    for (const f of filas) {
      const arr = m.get(f.servicio_id) ?? [];
      arr.push(f);
      m.set(f.servicio_id, arr);
    }
    return [...m.entries()].sort(
      (a, b) => (nombrePorId.get(a[0]) ?? '').localeCompare(nombrePorId.get(b[0]) ?? '', 'es'),
    );
  }, [filas, nombrePorId]);

  return (
    <Section
      title="Lo que se suele añadir"
      desc="Cuando una clienta elige un servicio en tu página de reservas, le proponemos estos antes de que elija la hora. Así reservas el tiempo real de la visita en vez de quedarte corta."
    >
      {error ? (
        <div style={{ marginBottom: 10, fontSize: 12.5, color: '#c0260a' }}>{error}</div>
      ) : null}

      <div
        style={{
          display: isMobile ? 'flex' : 'grid',
          flexDirection: 'column',
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto',
          gap: 8,
          alignItems: 'end',
          marginBottom: 14,
        }}
      >
        <SSelect
          value={base}
          onChange={setBase}
          placeholder="Cuando pidan…"
          width={isMobile ? undefined as unknown as number : 240}
          options={reservables.map((s) => ({ value: s.id, label: s.nombre }))}
        />
        <SSelect
          value={sugerido}
          onChange={setSugerido}
          placeholder="…propón añadir"
          width={isMobile ? undefined as unknown as number : 240}
          options={reservables
            .filter((s) => s.id !== base)
            .map((s) => ({ value: s.id, label: s.nombre }))}
        />
        <Btn
          variant="primary"
          onClick={anadir}
          disabled={!base || !sugerido || base === sugerido || guardando}
        >
          Añadir
        </Btn>
      </div>

      {cargando ? (
        <div style={{ fontSize: 12.5, color: '#8a7d6e' }}>Cargando…</div>
      ) : grupos.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#8a7d6e', lineHeight: 1.6 }}>
          Todavía no hay ninguna. Puedes añadirlas aquí, y en cuanto tengas histórico
          suficiente Mecha te propondrá sola las que ya se dan en tu salón.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grupos.map(([servicioId, items]) => (
            <div key={servicioId}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#3a332c', marginBottom: 6 }}>
                Cuando pidan «{nombrePorId.get(servicioId) ?? 'servicio'}»
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      padding: '8px 12px', borderRadius: 10,
                      border: '1px solid rgba(40,30,24,0.10)',
                      background: f.activo ? '#fffdfb' : 'rgba(40,30,24,0.04)',
                      opacity: f.activo ? 1 : 0.62,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 140, fontSize: 13, color: '#2b2620' }}>
                      {nombrePorId.get(f.sugerido_id) ?? 'servicio'}
                    </span>
                    {f.origen === 'aprendido' ? (
                      <Badge tone="neutral">
                        Aprendido · {Math.round(f.confianza)}% de {f.visitas} visitas
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Tuya</Badge>
                    )}
                    <Btn size="sm" onClick={() => alternar(f)}>
                      {f.activo ? 'Desactivar' : 'Activar'}
                    </Btn>
                    <IconBtn icon="trash" tone="danger" title="Quitar" onClick={() => borrar(f)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
