// Puestos fisicos del salon: lavacabezas, cabinas, sillones y aparatos.
//
// Para que sirve: la agenda sabia si la profesional estaba libre, pero no si
// quedaba sitio donde sentar a la clienta. Con tres tintes saliendo del reposo a
// la vez y dos pilas, la tercera espera con el color pasado de tiempo.
//
// Dar de alta puestos es OPCIONAL. Mientras no haya ninguno, nada cambia: la
// agenda no avisa de nada. Se dice en pantalla para que nadie lo active a
// ciegas pensando que ya estaba funcionando.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { mensajeDeError } from '@/lib/errores';
import { RECURSO_LABEL, TIPOS_RECURSO, type Recurso, type TipoRecurso } from '@/lib/recursos';
import {
  Section, FieldRow, NumberInput, STextInput, SSelect, Toggle, Badge, Btn, IconBtn,
} from '@/components/ui/SettingsAtoms';

const T = DESIGN_TOKENS;

const AYUDA_TIPO: Record<TipoRecurso, string> = {
  lavacabezas: 'Se ocupa al salir del reposo, en el lavado y el acabado.',
  cabina: 'Se ocupa toda la cita, de principio a fin.',
  sillon: 'Puesto de trabajo con espejo.',
  aparatologia: 'Laser, presoterapia, radiofrecuencia.',
};

type Borrador = { nombre: string; tipo: TipoRecurso; capacidad: number };

const BORRADOR_VACIO: Borrador = { nombre: '', tipo: 'lavacabezas', capacidad: 1 };

export function TabRecursos({ negocioId }: { negocioId: string }) {
  const { isMobile } = useResponsive();
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('recursos')
      .select('id, nombre, tipo, capacidad, activo')
      .order('tipo')
      .order('orden');
    if (err) setError(mensajeDeError(err));
    else setRecursos((data ?? []) as Recurso[]);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const anadir = async () => {
    const nombre = borrador.nombre.trim() || RECURSO_LABEL[borrador.tipo];
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.from('recursos').insert({
      negocio_id: negocioId,
      nombre,
      tipo: borrador.tipo,
      capacidad: borrador.capacidad,
      orden: recursos.length,
    });
    setGuardando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    setBorrador(BORRADOR_VACIO);
    void cargar();
  };

  const actualizar = async (id: string, cambios: Partial<Recurso>) => {
    // Optimista: el interruptor tiene que responder al dedo, no al servidor.
    setRecursos((prev) => prev.map((r) => (r.id === id ? { ...r, ...cambios } : r)));
    const { error: err } = await supabase.from('recursos').update(cambios).eq('id', id);
    if (err) { setError(mensajeDeError(err)); void cargar(); }
  };

  const borrar = async (id: string) => {
    const { error: err } = await supabase.from('recursos').delete().eq('id', id);
    if (err) { setError(mensajeDeError(err)); return; }
    setRecursos((prev) => prev.filter((r) => r.id !== id));
  };

  const totalActivos = recursos.filter((r) => r.activo).length;

  return (
    <>
      <Section
        title="Puestos del salón"
        desc="Cuántos lavacabezas, cabinas o sillones tienes. La agenda avisa cuando una hora concreta se queda sin sitio."
      >
        {error && (
          <div style={{
            background: T.dangerSoft, border: `1px solid ${T.danger}`,
            borderRadius: 10, padding: '10px 12px', marginBottom: 12,
            fontSize: 13, color: T.danger,
          }}>{error}</div>
        )}

        {!cargando && totalActivos === 0 && (
          <div style={{
            background: T.bgCardHi, border: `1px dashed ${T.border}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 14,
            fontSize: 13, color: T.textMuted, lineHeight: 1.5,
          }}>
            Todavía no has dado de alta ningún puesto, así que la agenda no
            controla el sitio: funciona exactamente igual que hasta ahora.
          </div>
        )}

        {recursos.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex', flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center', gap: 10,
              padding: '12px 0', borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <STextInput
                value={r.nombre}
                onChange={(v) => actualizar(r.id, { nombre: v })}
                placeholder={RECURSO_LABEL[r.tipo]}
              />
            </div>
            <Badge tone="neutral">{RECURSO_LABEL[r.tipo]}</Badge>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: T.textMuted }}>Puestos</span>
              <NumberInput
                value={r.capacidad}
                onChange={(v) => actualizar(r.id, { capacidad: Math.max(1, Number(v) || 1) })}
                min={1}
                max={50}
                width={92}
              />
            </div>
            <Toggle
              on={r.activo}
              onChange={(v) => actualizar(r.id, { activo: v })}
              label="En uso"
            />
            <IconBtn icon="trash" tone="danger" title="Quitar" onClick={() => borrar(r.id)} />
          </div>
        ))}
      </Section>

      <Section title="Añadir un puesto" desc={AYUDA_TIPO[borrador.tipo]}>
        <FieldRow label="Tipo">
          <SSelect
            value={borrador.tipo}
            onChange={(v) => setBorrador((b) => ({ ...b, tipo: v as TipoRecurso }))}
            options={TIPOS_RECURSO.map((t) => ({ value: t, label: RECURSO_LABEL[t] }))}
          />
        </FieldRow>
        <FieldRow label="Nombre" hint="Si lo dejas vacío se llama como el tipo.">
          <STextInput
            value={borrador.nombre}
            onChange={(v) => setBorrador((b) => ({ ...b, nombre: v }))}
            placeholder={RECURSO_LABEL[borrador.tipo]}
          />
        </FieldRow>
        <FieldRow label="Cuántos" hint="Puestos idénticos que puedes usar a la vez.">
          <NumberInput
            value={borrador.capacidad}
            onChange={(v) => setBorrador((b) => ({ ...b, capacidad: Math.max(1, Number(v) || 1) }))}
            min={1}
            max={50}
            width={110}
          />
        </FieldRow>
        <Btn variant="primary" icon="plus" onClick={anadir} disabled={guardando}>
          {guardando ? 'Añadiendo...' : 'Añadir puesto'}
        </Btn>
      </Section>
    </>
  );
}
