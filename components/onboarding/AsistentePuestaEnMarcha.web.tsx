// Asistente de puesta en marcha: pantalla completa, la primera vez que el duenio
// entra al software. No es el checklist (OnboardingPanel sigue existiendo aparte
// como recordatorio): esto configura el salon de verdad, bloque a bloque.
//
// QUE se pregunta y DONDE se guarda vive en lib/onboardingWizard.ts. Aqui solo
// esta la pantalla. Anadir un bloque nuevo no deberia obligar a tocar este archivo
// salvo que necesite una UI propia (los bloques 'especial').
//
// Reutiliza en vez de duplicar:
//   - lib/onboardingAgent.ts para escribir horario, servicios y equipo (las
//     mismas acciones que usa Chispa: una sola implementacion de cada escritura).
//   - TabMigracionMagica para importar de otro programa.
//   - lib/onboardingWizard.ts para los bloques de formulario.
//
// Motion: una sola curva para todo, escenas que entran con desenfoque, contenido
// escalonado. Todo se apaga con prefers-reduced-motion.

import { useCallback, useEffect, useMemo, useState } from 'react';
// @ts-ignore react-dom no tiene @types instalado en este proyecto; createPortal existe en runtime.
import { createPortal } from 'react-dom';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';
import { CORE_STEP_IDS, ONBOARDING_STEPS } from '@/lib/onboarding';
import {
  BLOQUES, cargarBloque, guardarBloque,
  type BloqueDef, type BloqueId, type CampoDef, type Nivel,
} from '@/lib/onboardingWizard';
import { ejecutarAccion, HORARIO_PRESETS, type ContextoEjecucion } from '@/lib/onboardingAgent';
import { TabMigracionMagica } from '@/components/config/TabMigracionMagica';
import { OIcon } from './OnboardingIcons';

const CURVA = 'cubic-bezier(0.16,1,0.3,1)';

interface Props {
  isMobile: boolean;
  negocioId: string;
  nombre: string;
  nombreSalon: string;
  trialEndsAt: string | null;
  onCerrar: (abrirChecklist: boolean) => void;
}

// Dias que quedan de prueba, o null si no hay prueba viva. Se redondea hacia
// arriba para no decir "0 dias" a alguien que aun tiene la tarde por delante.
function diasDePrueba(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const fin = new Date(trialEndsAt).getTime();
  if (Number.isNaN(fin)) return null;
  const dias = Math.ceil((fin - Date.now()) / 86400000);
  return dias > 0 ? dias : null;
}

const NIVEL_META: Record<Nivel, { label: string; color: string; soft: string }> = {
  imprescindible: { label: 'Imprescindible', color: T.primaryHi, soft: T.primarySoft },
  importante: { label: 'Recomendado', color: T.warning, soft: 'rgba(224,138,0,0.14)' },
  opcional: { label: 'Opcional', color: T.textTer, soft: 'rgba(115,102,88,0.12)' },
};

const ANIM = `
  @keyframes apFondo  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes apEntra  { from { opacity: 0; transform: translateY(16px) scale(0.988); filter: blur(6px); }
                        to   { opacity: 1; transform: translateY(0) scale(1);        filter: blur(0); } }
  @keyframes apSube   { from { opacity: 0; transform: translateY(12px); }
                        to   { opacity: 1; transform: translateY(0); } }
  @keyframes apAurora { 0%   { transform: translate3d(-6%, -4%, 0) scale(1); }
                        50%  { transform: translate3d(6%, 4%, 0) scale(1.12); }
                        100% { transform: translate3d(-6%, -4%, 0) scale(1); } }

  .ap-escena > * { animation: apSube 0.55s ${CURVA} both; }
  .ap-escena > *:nth-child(1) { animation-delay: 0.04s; }
  .ap-escena > *:nth-child(2) { animation-delay: 0.10s; }
  .ap-escena > *:nth-child(3) { animation-delay: 0.16s; }
  .ap-escena > *:nth-child(4) { animation-delay: 0.22s; }
  .ap-escena > *:nth-child(5) { animation-delay: 0.28s; }

  .ap-opcion { transition: transform 0.3s ${CURVA}, border-color 0.2s ease, box-shadow 0.3s ${CURVA}, background 0.2s ease; }
  .ap-opcion:hover { transform: translateY(-3px); }
  .ap-cta { transition: transform 0.26s ${CURVA}, box-shadow 0.26s ${CURVA}, filter 0.2s ease; }
  .ap-cta:hover { transform: translateY(-2px); filter: saturate(1.06); }
  .ap-cta:active { transform: translateY(0) scale(0.985); }
  .ap-mapa-item { transition: background 0.2s ease, color 0.2s ease; }

  @media (prefers-reduced-motion: reduce) {
    .ap-raiz, .ap-raiz * { animation: none !important; transition: none !important; filter: none !important; }
  }
`;

type EscenaId = 'saludo' | 'acceso' | BloqueId | 'final';

// Aviso para el usuario (un campo sin rellenar), NO un fallo del sistema. Va
// aparte de mensajeDeError a proposito: esa funcion ademas registra el error en
// el servidor, y un formulario incompleto no es una incidencia que investigar.
class Aviso extends Error {}

export default function AsistentePuestaEnMarcha({
  isMobile, negocioId, nombre, nombreSalon, trialEndsAt, onCerrar,
}: Props) {
  const diasPrueba = useMemo(() => diasDePrueba(trialEndsAt), [trialEndsAt]);

  // null = aun no sabemos si hay que preguntar el modo de acceso. No se pinta
  // nada hasta saberlo: que una escena aparezca y desaparezca es peor que esperar.
  const [preguntarModo, setPreguntarModo] = useState<boolean | null>(null);
  const [idx, setIdx] = useState(0);
  const [modo, setModo] = useState<'individual' | 'compartido'>('individual');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Valores por bloque, cargados de la BD al entrar en cada uno.
  const [valores, setValores] = useState<Partial<Record<BloqueId, Record<string, any>>>>({});
  const [hechos, setHechos] = useState<Set<BloqueId>>(new Set());
  const [cargandoBloque, setCargandoBloque] = useState(false);

  // Estado de los bloques con UI propia.
  const [partida, setPartida] = useState<'sin_elegir' | 'importar' | 'cero'>('sin_elegir');
  const [presetHorario, setPresetHorario] = useState<number | null>(null);
  const [servicios, setServicios] = useState([{ nombre: '', precio: '', duracion: '30' }]);
  const [equipo, setEquipo] = useState([{ nombre: '' }]);

  const ctx: ContextoEjecucion = useMemo(
    () => ({ negocioId, profesionalesCreados: [], serviciosCreados: [] }),
    [negocioId],
  );

  useEffect(() => {
    let vivo = true;
    supabase.rpc('acceso_salon_estado').then(({ data, error: err }) => {
      if (!vivo) return;
      // Si la RPC falla preferimos NO preguntar: el selector vive tambien en
      // Ajustes > Accesos y roles y alli no se pierde nada.
      const d = (data ?? {}) as { configurado?: boolean };
      setPreguntarModo(!err && d.configurado !== true);
    });
    return () => { vivo = false; };
  }, []);

  const escenas: EscenaId[] = useMemo(() => [
    'saludo',
    ...(preguntarModo ? (['acceso'] as EscenaId[]) : []),
    ...BLOQUES.map((b) => b.id),
    'final',
  ], [preguntarModo]);

  const escena = escenas[idx];
  const bloque: BloqueDef | undefined = BLOQUES.find((b) => b.id === escena);

  // Al entrar en un bloque de formulario se cargan sus valores reales.
  useEffect(() => {
    if (!bloque || bloque.especial) return;
    if (valores[bloque.id]) return;
    let vivo = true;
    setCargandoBloque(true);
    cargarBloque(bloque.id, negocioId)
      .then((v) => { if (vivo) setValores((prev) => ({ ...prev, [bloque.id]: v })); })
      .catch(() => { /* se queda con los defectos del formulario */ })
      .finally(() => { if (vivo) setCargandoBloque(false); });
    return () => { vivo = false; };
  }, [bloque, negocioId, valores]);

  const marcarVista = useCallback(async () => {
    const { data: row } = await supabase
      .from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
    const cfg: Record<string, unknown> = (row?.config && typeof row.config === 'object')
      ? (row.config as Record<string, unknown>) : {};
    await supabase.from('negocio_config').upsert(
      { negocio_id: negocioId, config: { ...cfg, bienvenidaVista: true }, updated_at: new Date().toISOString() },
      { onConflict: 'negocio_id' },
    );
  }, [negocioId]);

  const salir = useCallback((abrirChecklist: boolean) => {
    // Se cierra ya y se persiste por detras: esperar a la red para quitar un
    // overlay que el usuario acaba de despedir se nota como lentitud.
    onCerrar(abrirChecklist);
    void marcarVista();
  }, [marcarVista, onCerrar]);

  const irA = useCallback((n: number) => {
    setError('');
    if (n >= escenas.length) { salir(true); return; }
    setIdx(Math.max(0, n));
  }, [escenas.length, salir]);

  const setValor = useCallback((id: BloqueId, key: string, valor: any) => {
    setValores((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: valor } }));
  }, []);

  // Guarda lo que el usuario ha escrito en un bloque con UI propia.
  //
  // OJO CON LAS DEPENDENCIAS: esta funcion lee presetHorario, servicios y equipo.
  // Si `continuar` se memoriza sin ellas, se queda con la closure del primer
  // render (lista vacia, preset a null), filtra "no hay nada que guardar" y avanza
  // sin escribir NADA, sin ningun error. Paso exactamente eso.
  const guardarEspecial = useCallback(async (id: BloqueId) => {
    if (id === 'punto_partida') return; // no guarda nada por si mismo

    if (id === 'horario') {
      // Avanzar en silencio sin haber guardado nada engania: el usuario cree que
      // lo dejo hecho. Si no quiere hacerlo ahora, para eso esta "Ahora no".
      if (presetHorario === null) throw new Aviso('Elige un horario, o pulsa "Ahora no" para dejarlo para luego.');
      const r = await ejecutarAccion('fijar_horario_salon', { dias: HORARIO_PRESETS[presetHorario].dias }, ctx);
      if (!r.ok) throw new Error(r.resumen);
      return;
    }

    if (id === 'servicios') {
      const limpios = servicios
        .filter((s) => s.nombre.trim())
        .map((s) => ({
          nombre: s.nombre.trim(),
          precio: Number(String(s.precio).replace(',', '.')) || 0,
          duracion_min: Number(s.duracion) || 30,
        }));
      if (limpios.length === 0) throw new Aviso('Escribe al menos un servicio, o pulsa "Ahora no".');
      const r = await ejecutarAccion('crear_servicios', { servicios: limpios }, ctx);
      if (!r.ok) throw new Error(r.resumen);
      return;
    }

    if (id === 'equipo') {
      const limpios = equipo.filter((p) => p.nombre.trim()).map((p) => ({ nombre: p.nombre.trim() }));
      if (limpios.length === 0) throw new Aviso('Escribe al menos una persona, o pulsa "Ahora no".');
      const r = await ejecutarAccion('crear_profesionales', { profesionales: limpios }, ctx);
      if (!r.ok) throw new Error(r.resumen);
      // Que el equipo herede el horario del salon: sin horario propio no genera
      // huecos reservables, y ese es el fallo que mas deja la agenda vacia.
      // `aplicar: true` es obligatorio: sin ese argumento la accion responde
      // "sin aplicar por ahora" y devuelve ok, asi que no se nota que no hizo nada.
      const r2 = await ejecutarAccion('aplicar_horario_profesionales', { aplicar: true }, ctx);
      // Si el salon aun no tiene horario, esto falla y es normal (se puede haber
      // saltado ese bloque): no se corta el asistente por ello.
      if (!r2.ok) console.warn('horario del equipo sin aplicar:', r2.resumen);
      return;
    }
  }, [ctx, equipo, presetHorario, servicios]);

  // Guarda el bloque actual (si tiene algo que guardar) y avanza.
  const continuar = useCallback(async () => {
    setError('');

    if (escena === 'acceso') {
      setGuardando(true);
      const { error: err } = await supabase.rpc('set_acceso_salon_modo', { p_modo: modo });
      setGuardando(false);
      // Un fallo aqui no bloquea: se puede cambiar en Ajustes y el valor por
      // defecto (individual) es justo el recomendado.
      if (err) console.error('set_acceso_salon_modo:', err.message);
      irA(idx + 1);
      return;
    }

    if (!bloque) { irA(idx + 1); return; }

    setGuardando(true);
    try {
      if (bloque.especial) {
        await guardarEspecial(bloque.id);
      } else {
        const v = valores[bloque.id] ?? {};
        // Los campos marcados como requeridos se comprueban aqui: sin esto se
        // guardaba el bloque vacio y se avanzaba, dejando el salon sin nombre ni
        // telefono y sin que nadie se enterara.
        const falta = bloque.campos.find(
          (c) => c.requerido
            && (!c.visibleSi || c.visibleSi(v))
            && String(v[c.key] ?? '').trim() === '',
        );
        if (falta) throw new Aviso(`Falta rellenar "${falta.label}", o pulsa "Ahora no" para dejarlo para luego.`);
        await guardarBloque(bloque.id, negocioId, v);
      }
      setHechos((prev) => new Set(prev).add(bloque.id));
      irA(idx + 1);
    } catch (e) {
      // Un aviso se enseña tal cual; un fallo de verdad pasa por mensajeDeError,
      // que ademas lo registra para que podamos investigarlo.
      setError(e instanceof Aviso ? e.message : mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }, [escena, bloque, guardarEspecial, idx, irA, modo, negocioId, valores]);

  if (preguntarModo === null) return null;

  const nombreCorto = (nombre || '').trim().split(/\s+/)[0] || '';
  const bloquesHechos = hechos.size;

  const contenido = (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div
        className="ap-raiz"
        role="dialog"
        aria-modal="true"
        aria-label="Puesta en marcha de tu salon"
        style={{
          // Por encima de TODO, incluido el cajon de Chispa (z 2147483000).
          position: 'fixed', inset: 0, zIndex: 2147483100, background: T.bg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'apFondo 0.45s ease both',
        }}
      >
        <Aurora />

        {/* Cabecera */}
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '16px 18px' : '20px 30px', flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: T.fireGradient, flexShrink: 0 }}>
              <OIcon name="sparkles" size={16} color="#fff" />
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2, color: T.text }}>Mecha</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {escena !== 'saludo' && escena !== 'final' && (
              <span style={{ fontSize: 12.5, color: T.textTer, fontWeight: 600 }}>
                {bloquesHechos} de {BLOQUES.length}
              </span>
            )}
            <button
              onClick={() => salir(true)}
              style={{ background: 'none', border: 'none', color: T.textTer, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 4px' }}
            >
              Terminar luego
            </button>
          </div>
        </div>

        {/* Cuerpo: mapa lateral (escritorio) + escena */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', gap: 0 }}>
          {!isMobile && escena !== 'saludo' && escena !== 'final' && (
            <MapaLateral
              bloques={BLOQUES}
              actual={escena as BloqueId}
              hechos={hechos}
              onIr={(id) => irA(escenas.indexOf(id))}
            />
          )}

          <div style={{
            flex: 1, minWidth: 0, overflowY: 'auto',
            display: 'flex', alignItems: escena === 'saludo' ? 'center' : 'flex-start', justifyContent: 'center',
            padding: isMobile ? '6px 18px 26px' : '10px 30px 30px',
          }}>
            <div
              key={escena}
              className="ap-escena"
              style={{ width: '100%', maxWidth: 640, animation: `apEntra 0.6s ${CURVA} both`, paddingTop: escena === 'saludo' ? 0 : 8 }}
            >
              {escena === 'saludo' && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.primaryHi, marginBottom: 14 }}>
                    Todo listo
                  </div>
                  <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 50, lineHeight: 1.05, letterSpacing: -1.3, fontWeight: 800, color: T.text }}>
                    {nombreCorto ? `Hola, ${nombreCorto}.` : 'Hola.'}
                    <br />
                    <span style={{ background: T.fireGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                      {nombreSalon || 'Tu salón'}
                    </span>{' '}
                    ya es tuyo aquí.
                  </h1>
                  <p style={{ margin: '20px 0 0', fontSize: isMobile ? 15.5 : 17, lineHeight: 1.55, color: T.textSec, maxWidth: 520 }}>
                    {diasPrueba !== null
                      ? `Tienes ${diasPrueba} ${diasPrueba === 1 ? 'día' : 'días'} con el software completo, sin tarjeta y sin permanencia. Vamos a dejarlo funcionando: son unos minutos y puedes parar cuando quieras.`
                      : 'Vamos a dejar tu salón funcionando. Son unos minutos y puedes parar cuando quieras.'}
                  </p>
                  <div style={{ marginTop: 32 }}>
                    <Cta isMobile={isMobile} onClick={() => irA(idx + 1)}>Empezar</Cta>
                  </div>
                </>
              )}

              {escena === 'acceso' && (
                <>
                  <Titulo isMobile={isMobile}>¿Cómo entrará tu equipo?</Titulo>
                  <Intro>Puedes cambiarlo cuando quieras en Ajustes.</Intro>
                  <div style={{ display: 'grid', gap: 13, marginTop: 24, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
                    <Opcion
                      activa={modo === 'individual'} onClick={() => setModo('individual')}
                      icono="users" titulo="Cada uno con su correo" etiqueta="Recomendado"
                      desc="Cada profesional entra desde su móvil con su cuenta. Queda registrado quién hace qué."
                    />
                    <Opcion
                      activa={modo === 'compartido'} onClick={() => setModo('compartido')}
                      icono="store" titulo="Un solo correo para el salón"
                      desc="Se entra con la cuenta del propietario desde el mostrador y se elige la ficha al empezar."
                    />
                  </div>
                  <Pie
                    isMobile={isMobile} guardando={guardando} cargando={false} error={error}
                    onContinuar={continuar} onSaltar={() => irA(idx + 1)}
                    ajustesEn="Más tarde en: Ajustes > Accesos y roles"
                  />
                </>
              )}

              {bloque && (
                <>
                  <Etiqueta nivel={bloque.nivel} />
                  <Titulo isMobile={isMobile}>{bloque.titulo}</Titulo>
                  <Intro>{bloque.intro}</Intro>

                  <div style={{ marginTop: 22 }}>
                    {bloque.id === 'punto_partida' && (
                      <BloquePartida
                        isMobile={isMobile} negocioId={negocioId}
                        eleccion={partida} onElegir={setPartida}
                      />
                    )}

                    {bloque.id === 'horario' && (
                      <BloqueHorario preset={presetHorario} onElegir={setPresetHorario} />
                    )}

                    {bloque.id === 'servicios' && (
                      <BloqueLista
                        filas={servicios}
                        columnas={[
                          { key: 'nombre', label: 'Servicio', placeholder: 'Corte de caballero', ancho: '1fr' },
                          { key: 'precio', label: 'Precio', placeholder: '15', ancho: '90px' },
                          { key: 'duracion', label: 'Minutos', placeholder: '30', ancho: '90px' },
                        ]}
                        onCambiar={(i, k, v) => setServicios((prev) => prev.map((f, j) => j === i ? { ...f, [k]: v } : f))}
                        onAnadir={() => setServicios((prev) => [...prev, { nombre: '', precio: '', duracion: '30' }])}
                        onQuitar={(i) => setServicios((prev) => prev.filter((_, j) => j !== i))}
                        textoAnadir="Añadir otro servicio"
                        isMobile={isMobile}
                      />
                    )}

                    {bloque.id === 'equipo' && (
                      <BloqueLista
                        filas={equipo}
                        columnas={[{ key: 'nombre', label: 'Nombre', placeholder: 'Marta', ancho: '1fr' }]}
                        onCambiar={(i, k, v) => setEquipo((prev) => prev.map((f, j) => j === i ? { ...f, [k]: v } : f))}
                        onAnadir={() => setEquipo((prev) => [...prev, { nombre: '' }])}
                        onQuitar={(i) => setEquipo((prev) => prev.filter((_, j) => j !== i))}
                        textoAnadir="Añadir a otra persona"
                        isMobile={isMobile}
                      />
                    )}

                    {!bloque.especial && (
                      <Formulario
                        campos={bloque.campos}
                        valores={valores[bloque.id] ?? {}}
                        cargando={cargandoBloque}
                        isMobile={isMobile}
                        onCambiar={(k, v) => setValor(bloque.id, k, v)}
                      />
                    )}
                  </div>

                  <Pie
                    isMobile={isMobile} guardando={guardando} cargando={cargandoBloque && !bloque.especial} error={error}
                    onContinuar={continuar} onSaltar={() => irA(idx + 1)}
                    ajustesEn={`Más tarde en: ${bloque.ajustesEn}`}
                  />
                </>
              )}

              {escena === 'final' && (
                <Final
                  isMobile={isMobile}
                  hechos={hechos}
                  onIrABloque={(id) => irA(escenas.indexOf(id))}
                  onTerminar={() => salir(true)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Progreso inferior */}
        <div style={{
          position: 'relative', display: 'flex', gap: 5, justifyContent: 'center',
          padding: isMobile ? '0 18px 20px' : '0 30px 24px', flexShrink: 0, flexWrap: 'wrap',
        }}>
          {escenas.map((e, i) => (
            <span key={e} style={{
              width: 26, height: 3, borderRadius: 999,
              background: i <= idx ? T.primary : 'rgba(40,30,24,0.12)',
              transition: `background 0.4s ${CURVA}`,
            }} />
          ))}
        </div>
      </div>
    </>
  );

  // PORTAL AL BODY, obligatorio: la agenda anida esto dentro de ~14 divs con
  // `z-index: 0`, y cada uno crea su propio contexto de apilamiento. Desde
  // dentro, ningun z-index puede superar al cajon de Chispa, que cuelga del body.
  return typeof document !== 'undefined' ? createPortal(contenido, document.body) : contenido;
}

// ---------------------------------------------------------------------------
// Piezas de la pantalla
// ---------------------------------------------------------------------------

function Aurora() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', top: '-28%', left: '-12%', width: '70vw', height: '70vw',
        background: 'radial-gradient(circle at 50% 50%, rgba(244,80,30,0.16), rgba(244,80,30,0) 62%)',
        animation: 'apAurora 22s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '-34%', right: '-16%', width: '62vw', height: '62vw',
        background: 'radial-gradient(circle at 50% 50%, rgba(255,207,74,0.18), rgba(255,207,74,0) 60%)',
        animation: 'apAurora 27s ease-in-out infinite reverse',
      }} />
    </div>
  );
}

function Titulo({ children, isMobile }: { children: React.ReactNode; isMobile: boolean }) {
  return (
    <h2 style={{ margin: 0, fontSize: isMobile ? 25 : 33, lineHeight: 1.12, letterSpacing: -0.8, fontWeight: 800, color: T.text }}>
      {children}
    </h2>
  );
}

function Intro({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.55, color: T.textSec }}>{children}</p>;
}

function Etiqueta({ nivel }: { nivel: Nivel }) {
  const m = NIVEL_META[nivel];
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
        color: m.color, background: m.soft, borderRadius: 999, padding: '4px 10px',
      }}>
        {m.label}
      </span>
    </div>
  );
}

function MapaLateral({ bloques, actual, hechos, onIr }: {
  bloques: BloqueDef[];
  actual: BloqueId;
  hechos: Set<BloqueId>;
  onIr: (id: BloqueId) => void;
}) {
  return (
    <nav style={{
      width: 232, flexShrink: 0, overflowY: 'auto', padding: '8px 12px 24px 30px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      {bloques.map((b) => {
        const esActual = b.id === actual;
        const hecho = hechos.has(b.id);
        return (
          <button
            key={b.id}
            className="ap-mapa-item"
            onClick={() => onIr(b.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10,
              background: esActual ? T.bgCard : 'transparent', border: 'none', cursor: 'pointer',
              textAlign: 'left', font: 'inherit',
              boxShadow: esActual ? '0 2px 10px rgba(20,12,6,0.06)' : 'none',
            }}
          >
            <span style={{
              display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              background: hecho ? 'rgba(15,157,107,0.14)' : esActual ? T.primarySoft : 'rgba(40,30,24,0.06)',
            }}>
              <OIcon name={hecho ? 'check' : b.icono} size={13} color={hecho ? T.success : esActual ? T.primaryHi : T.textTer} />
            </span>
            <span style={{
              fontSize: 13, fontWeight: esActual ? 700 : 600,
              color: esActual ? T.text : hecho ? T.textSec : T.textTer,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {b.titulo}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function Pie({ isMobile, guardando, cargando, error, onContinuar, onSaltar, ajustesEn }: {
  isMobile: boolean;
  guardando: boolean;
  // Mientras el bloque carga sus valores no se puede guardar: se escribiria vacio.
  cargando: boolean;
  error: string;
  onContinuar: () => void;
  onSaltar: () => void;
  ajustesEn: string;
}) {
  return (
    <div style={{ marginTop: 26 }}>
      {error && (
        <div style={{
          marginBottom: 14, padding: '10px 13px', borderRadius: 10, fontSize: 13,
          background: 'rgba(226,59,52,0.10)', color: T.danger, border: '1px solid rgba(226,59,52,0.25)',
        }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Cta isMobile={false} onClick={onContinuar} disabled={guardando || cargando}>
          {guardando ? 'Guardando...' : cargando ? 'Cargando...' : 'Guardar y seguir'}
        </Cta>
        {(
          <button
            onClick={onSaltar}
            disabled={guardando}
            style={{
              padding: isMobile ? '13px 16px' : '13px 18px', background: 'transparent',
              border: `1px solid ${T.border}`, borderRadius: 12, color: T.textSec,
              fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Ahora no
          </button>
        )}
      </div>
      {/* Se muestra SIEMPRE, no solo al saltar: saber que no es irreversible es
          lo que hace que la gente avance en vez de abandonar el asistente. */}
      <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 11 }}>{ajustesEn}</div>
    </div>
  );
}

function Cta({ children, onClick, disabled, isMobile }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; isMobile: boolean;
}) {
  return (
    <button
      className="ap-cta"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        width: isMobile ? '100%' : undefined,
        padding: isMobile ? '15px 22px' : '13px 24px',
        background: T.fireGradient, border: 'none', borderRadius: 12, color: '#fff',
        fontSize: 14.5, fontWeight: 700, letterSpacing: -0.1,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
        boxShadow: '0 10px 24px rgba(244,80,30,0.26)',
      }}
    >
      {children}
      <OIcon name="arrowRight" size={16} color="#fff" />
    </button>
  );
}

function Opcion({ activa, onClick, icono, titulo, desc, etiqueta }: {
  activa: boolean; onClick: () => void; icono: string; titulo: string; desc: string; etiqueta?: string;
}) {
  return (
    <button
      className="ap-opcion"
      onClick={onClick}
      aria-pressed={activa}
      style={{
        textAlign: 'left', padding: 17, borderRadius: 15, cursor: 'pointer',
        background: activa ? T.bgCard : 'rgba(255,255,255,0.55)',
        border: `1px solid ${activa ? T.primary : T.border}`,
        boxShadow: activa ? '0 12px 30px rgba(244,80,30,0.15)' : '0 2px 10px rgba(20,12,6,0.04)',
        display: 'flex', flexDirection: 'column', gap: 8, font: 'inherit',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: activa ? T.primary : T.primarySoft,
        }}>
          <OIcon name={icono} size={17} color={activa ? '#fff' : T.primaryHi} />
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{titulo}</span>
        {etiqueta && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
            color: T.primaryHi, background: T.primarySoft, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap',
          }}>
            {etiqueta}
          </span>
        )}
      </span>
      <span style={{ fontSize: 12.5, lineHeight: 1.5, color: T.textSec }}>{desc}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Formulario generico (bloques declarativos)
// ---------------------------------------------------------------------------

function Formulario({ campos, valores, onCambiar, cargando, isMobile }: {
  campos: CampoDef[];
  valores: Record<string, any>;
  onCambiar: (key: string, valor: any) => void;
  cargando: boolean;
  isMobile: boolean;
}) {
  if (cargando) {
    return <div style={{ fontSize: 13, color: T.textTer, padding: '10px 0' }}>Cargando lo que ya tienes...</div>;
  }

  const visibles = campos.filter((c) => !c.visibleSi || c.visibleSi(valores));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {visibles.map((c) => (
        <div key={c.key} style={{
          display: c.tipo === 'switch' ? 'flex' : 'block',
          alignItems: 'center', justifyContent: 'space-between', gap: 14,
        }}>
          <div style={{ minWidth: 0, flex: c.tipo === 'switch' ? 1 : undefined }}>
            <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: T.text, marginBottom: c.tipo === 'switch' ? 2 : 7 }}>
              {c.label}
              {c.requerido && <span style={{ color: T.primary }}> *</span>}
            </label>
            {c.ayuda && (
              <div style={{ fontSize: 12, color: T.textTer, lineHeight: 1.45, marginBottom: c.tipo === 'switch' ? 0 : 7 }}>{c.ayuda}</div>
            )}
          </div>
          <ControlCampo campo={c} valor={valores[c.key]} onCambiar={(v) => onCambiar(c.key, v)} isMobile={isMobile} />
        </div>
      ))}
    </div>
  );
}

const estiloInput: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10,
  border: `1px solid ${T.border}`, background: T.bgCard, color: T.text,
  fontSize: 14, font: 'inherit', boxSizing: 'border-box',
};

function ControlCampo({ campo, valor, onCambiar, isMobile }: {
  campo: CampoDef; valor: any; onCambiar: (v: any) => void; isMobile: boolean;
}) {
  if (campo.tipo === 'switch') {
    const activo = valor === true;
    return (
      <button
        role="switch"
        aria-checked={activo}
        aria-label={campo.label}
        onClick={() => onCambiar(!activo)}
        style={{
          width: 46, height: 27, borderRadius: 999, flexShrink: 0, cursor: 'pointer', position: 'relative',
          background: activo ? T.primary : 'rgba(40,30,24,0.16)', border: 'none',
          transition: `background 0.25s ${CURVA}`,
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: activo ? 22 : 3, width: 21, height: 21, borderRadius: 999,
          background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: `left 0.25s ${CURVA}`,
        }} />
      </button>
    );
  }

  if (campo.tipo === 'opciones') {
    return (
      <select
        value={String(valor ?? '')}
        onChange={(e) => onCambiar(e.target.value)}
        style={{ ...estiloInput, cursor: 'pointer' }}
      >
        {(campo.opciones ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (campo.tipo === 'color') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="color"
          value={String(valor ?? '#f4501e')}
          onChange={(e) => onCambiar(e.target.value)}
          style={{ width: 46, height: 40, padding: 2, borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13, color: T.textSec }}>{String(valor ?? '#f4501e')}</span>
      </div>
    );
  }

  if (campo.tipo === 'textoLargo') {
    return (
      <textarea
        value={String(valor ?? '')}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={campo.placeholder}
        rows={3}
        style={{ ...estiloInput, resize: 'vertical' }}
      />
    );
  }

  const esNumero = campo.tipo === 'numero';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <input
        type={esNumero ? 'number' : campo.tipo === 'email' ? 'email' : campo.tipo === 'tel' ? 'tel' : 'text'}
        value={valor === undefined || valor === null ? '' : String(valor)}
        onChange={(e) => onCambiar(esNumero ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
        placeholder={campo.placeholder}
        style={{ ...estiloInput, maxWidth: esNumero && !isMobile ? 130 : undefined }}
      />
      {campo.sufijo && <span style={{ fontSize: 13, color: T.textTer, whiteSpace: 'nowrap' }}>{campo.sufijo}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloques con UI propia
// ---------------------------------------------------------------------------

function BloquePartida({ isMobile, negocioId, eleccion, onElegir }: {
  isMobile: boolean;
  negocioId: string;
  eleccion: 'sin_elegir' | 'importar' | 'cero';
  onElegir: (v: 'sin_elegir' | 'importar' | 'cero') => void;
}) {
  return (
    <div>
      <div style={{ display: 'grid', gap: 13, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
        <Opcion
          activa={eleccion === 'importar'} onClick={() => onElegir('importar')}
          icono="upload" titulo="Traer mis datos"
          desc="Sube el archivo que te dé tu programa actual (o una foto de tu lista de precios) y lo importamos."
        />
        <Opcion
          activa={eleccion === 'cero'} onClick={() => onElegir('cero')}
          icono="sparkles" titulo="Empezar de cero"
          desc="Creamos tus servicios y tu equipo aquí mismo, en los siguientes pasos."
        />
      </div>

      {eleccion === 'importar' && (
        <div style={{ marginTop: 18, borderRadius: 14, border: `1px solid ${T.border}`, background: T.bgCard, padding: isMobile ? 12 : 16 }}>
          {/* La misma pantalla de Ajustes > Migracion Magica, sin duplicar nada. */}
          <TabMigracionMagica negocioId={negocioId} />
        </div>
      )}
    </div>
  );
}

function BloqueHorario({ preset, onElegir }: { preset: number | null; onElegir: (i: number) => void }) {
  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {HORARIO_PRESETS.map((p, i) => {
        const activo = preset === i;
        return (
          <button
            key={p.label}
            className="ap-opcion"
            onClick={() => onElegir(i)}
            aria-pressed={activo}
            style={{
              textAlign: 'left', padding: 15, borderRadius: 14, cursor: 'pointer', font: 'inherit',
              background: activo ? T.bgCard : 'rgba(255,255,255,0.55)',
              border: `1px solid ${activo ? T.primary : T.border}`,
              boxShadow: activo ? '0 12px 28px rgba(244,80,30,0.14)' : 'none',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{p.label}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              {p.dias.map((d, j) => (
                <span
                  key={j}
                  style={{
                    display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8,
                    fontSize: 11, fontWeight: 700,
                    background: d.abierto ? T.primarySoft : 'rgba(40,30,24,0.05)',
                    color: d.abierto ? T.primaryHi : T.textMuted,
                  }}
                >
                  {DIAS[j]}
                </span>
              ))}
            </span>
          </button>
        );
      })}
      <div style={{ fontSize: 12, color: T.textTer, lineHeight: 1.5 }}>
        Elige el que más se parezca. Los días sueltos, las pausas de mediodía y los festivos
        se ajustan luego en Ajustes &gt; Horarios.
      </div>
    </div>
  );
}

function BloqueLista({ filas, columnas, onCambiar, onAnadir, onQuitar, textoAnadir, isMobile }: {
  filas: Record<string, string>[];
  columnas: { key: string; label: string; placeholder: string; ancho: string }[];
  onCambiar: (i: number, key: string, valor: string) => void;
  onAnadir: () => void;
  onQuitar: (i: number) => void;
  textoAnadir: string;
  isMobile: boolean;
}) {
  // En movil cada fila se apila: una rejilla de columnas fijas aplasta la
  // primera columna hasta hacerla inservible (trampa conocida del proyecto).
  const plantilla = isMobile ? '1fr' : `${columnas.map((c) => c.ancho).join(' ')} 34px`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: plantilla, gap: 9, padding: '0 2px' }}>
          {columnas.map((c) => (
            <span key={c.key} style={{ fontSize: 11.5, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {c.label}
            </span>
          ))}
          <span />
        </div>
      )}

      {filas.map((fila, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: plantilla, gap: 9, alignItems: 'center' }}>
          {columnas.map((c) => (
            <input
              key={c.key}
              value={fila[c.key] ?? ''}
              onChange={(e) => onCambiar(i, c.key, e.target.value)}
              placeholder={isMobile ? `${c.label}: ${c.placeholder}` : c.placeholder}
              style={{ ...estiloInput, minWidth: 0 }}
            />
          ))}
          {filas.length > 1 && (
            <button
              onClick={() => onQuitar(i)}
              aria-label="Quitar"
              style={{
                display: 'grid', placeItems: 'center', width: isMobile ? '100%' : 34, height: 34,
                borderRadius: 9, background: 'transparent', border: `1px solid ${T.border}`,
                color: T.textTer, cursor: 'pointer',
              }}
            >
              <OIcon name="x" size={15} />
            </button>
          )}
        </div>
      ))}

      <button
        onClick={onAnadir}
        style={{
          alignSelf: 'flex-start', marginTop: 2, padding: '9px 13px', borderRadius: 10,
          background: 'transparent', border: `1px dashed ${T.border}`, color: T.textSec,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {textoAnadir}
      </button>
    </div>
  );
}

function Final({ isMobile, hechos, onIrABloque, onTerminar }: {
  isMobile: boolean;
  hechos: Set<BloqueId>;
  onIrABloque: (id: BloqueId) => void;
  onTerminar: () => void;
}) {
  const pendientes = BLOQUES.filter((b) => !hechos.has(b.id));
  const pasosCore = ONBOARDING_STEPS.filter((s) => CORE_STEP_IDS.includes(s.id));

  return (
    <>
      <Titulo isMobile={isMobile}>
        {pendientes.length === 0 ? 'Tu salón está listo.' : 'Ya puedes trabajar.'}
      </Titulo>
      <Intro>
        {pendientes.length === 0
          ? 'Todo configurado. Puedes cambiar cualquier cosa en Ajustes cuando quieras.'
          : 'Lo que has dejado para luego sigue disponible aquí abajo y en Ajustes. Nada se pierde.'}
      </Intro>

      {pendientes.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {pendientes.map((b, i) => (
            <button
              key={b.id}
              onClick={() => onIrABloque(b.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', background: 'none',
                border: 'none', borderBottom: i < pendientes.length - 1 ? `1px solid ${T.border}` : 'none',
                cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%',
              }}
            >
              <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 10, background: NIVEL_META[b.nivel].soft, flexShrink: 0 }}>
                <OIcon name={b.icono} size={15} color={NIVEL_META[b.nivel].color} />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.text }}>{b.titulo}</span>
              <OIcon name="arrowRight" size={15} color={T.textTer} />
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 15, borderRadius: 14, background: T.bgCardHi, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 8 }}>
          Lo que necesita la agenda para funcionar
        </div>
        <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.6 }}>
          {pasosCore.map((p) => p.titulo).join(' · ')}
        </div>
        <div style={{ fontSize: 11.5, color: T.textTer, marginTop: 8 }}>
          Al salir te queda el recordatorio con lo que falte, en la propia agenda.
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <Cta isMobile={isMobile} onClick={onTerminar}>Entrar a mi agenda</Cta>
      </div>
    </>
  );
}
