/**
 * Registro de jornada — panel reutilizable.
 *
 * Se usa en dos sitios con el mismo codigo:
 *   · "Mi jornada" (alcance="propio"): la persona trabajadora consulta y
 *     descarga SU registro. El art. 34.9 ET obliga a que pueda hacerlo de forma
 *     inmediata, sin pedirselo a nadie.
 *   · "Informes > Control horario" (alcance="centro"): la empresa saca el
 *     registro de todo el equipo para la nomina o para la Inspeccion.
 *
 * El alcance real lo impone el servidor (jornada_totales / jornada_registro):
 * si un empleado pide "centro", la RPC le devuelve igualmente solo lo suyo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { mensajeDeError } from '@/lib/errores';
import { reportarError } from '@/lib/reportarError';
import { descargarCSV } from '@/lib/exportadorUniversal';
import {
  cargarTotales, cargarRegistro, listarCorrecciones, solicitarCorreccion,
  resolverCorreccion, verificarIntegridad,
  asientosACSV, diasACSV, fmtMinutos, minutosADecimal, fmtHoraCorta, fmtDiaLargo,
  rangoMes, nombreMes, MARCA_LABEL, ORIGEN_LABEL,
  type JornadaTotales, type AsientoJornada, type CorreccionJornada, type TipoMarca,
} from '@/lib/jornada';

const T = DESIGN_TOKENS;

export interface RegistroJornadaProps {
  alcance: 'propio' | 'centro';
  salon?: { nombre?: string | null; cif?: string | null; direccion?: string | null };
  /** Solo para alcance="centro": permite filtrar por persona. */
  profesionales?: Array<{ id: string; nombre: string }>;
  /** Persona preseleccionada en el filtro (p. ej. al venir de su ficha). */
  profesionalInicial?: string | null;
  /** Ficha del profesional que mira (para saber si puede pedir correcciones).
   *  Con alcance="propio" ademas ACOTA lo que se pide al servidor: en modo de
   *  acceso compartido la cuenta es la del jefe, asi que sin esto "Mi jornada"
   *  enseñaria el registro de todo el salon en vez del de quien esta delante. */
  miProfesionalId?: string | null;
  /** Cambia este valor desde fuera para que el panel se recargue (p. ej. al
   *  fichar en la misma pantalla: si no, la tabla se queda con lo de antes). */
  recargarToken?: string | number;
  isMobile?: boolean;
}

const card: React.CSSProperties = {
  background: T.bgCard,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
};

function Boton({ children, onClick, disabled, tono = 'neutro' }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  tono?: 'neutro' | 'primario' | 'peligro' | 'exito';
}) {
  const estilos: Record<string, React.CSSProperties> = {
    neutro: { background: T.bgCard, border: `1px solid ${T.borderHi}`, color: T.text },
    primario: { background: T.primary, border: 'none', color: '#fff' },
    peligro: { background: T.dangerSoft, border: `1px solid ${T.danger}55`, color: T.danger },
    exito: { background: T.success, border: 'none', color: '#fff' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn-interactive"
      style={{
        ...estilos[tono],
        padding: '8px 13px',
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function Stat({ label, valor, sub, color = T.text }: {
  label: string; valor: string; sub?: string; color?: string;
}) {
  return (
    <div style={{ ...card, padding: '12px 14px', flex: '1 1 150px', minWidth: 140 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 21, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function RegistroJornada({
  alcance, salon, profesionales, profesionalInicial, miProfesionalId, recargarToken, isMobile = false,
}: RegistroJornadaProps) {
  const [mesRef, setMesRef] = useState(() => new Date());
  const [profFiltro, setProfFiltro] = useState<string>(profesionalInicial ?? '');
  const [totales, setTotales] = useState<JornadaTotales | null>(null);
  const [asientos, setAsientos] = useState<AsientoJornada[]>([]);
  const [correcciones, setCorrecciones] = useState<CorreccionJornada[]>([]);
  const [verAsientos, setVerAsientos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [integridad, setIntegridad] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { asiento?: AsientoJornada }>(null);

  const { desde, hasta } = useMemo(() => rangoMes(mesRef), [mesRef]);
  const esCentro = alcance === 'centro';
  const profArg = esCentro ? (profFiltro || null) : (miProfesionalId ?? null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tot, asi, corr] = await Promise.all([
        cargarTotales(desde, hasta, profArg),
        cargarRegistro(desde, hasta, profArg),
        listarCorrecciones(undefined, esCentro ? (profFiltro || null) : (miProfesionalId ?? null)),
      ]);
      setTotales(tot);
      setAsientos(asi);
      setCorrecciones(corr);
    } catch (err) {
      reportarError(err, { origen: 'app', tipo: 'operativo' });
      setError(mensajeDeError(err));
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, profArg, recargarToken]);

  useEffect(() => { cargar(); }, [cargar]);

  const zona = totales?.zona ?? 'Europe/Madrid';
  const dias = totales?.dias ?? [];
  const personas = totales?.personas ?? [];
  const pendientes = correcciones.filter((c) => c.estado === 'pendiente');
  const meTocan = pendientes.filter((c) => c.me_toca);

  const nombrePeriodo = nombreMes(mesRef);
  const nombreProf = esCentro
    ? (profFiltro ? (profesionales?.find((p) => p.id === profFiltro)?.nombre ?? 'Profesional') : 'Todo el equipo')
    : (personas[0]?.profesional ?? 'Mi registro');

  const descargarPdf = async () => {
    setDescargando(true);
    setError(null);
    try {
      const { generarJornadaPdf, descargarBlob } = await import('@/lib/jornadaPdf.web');
      const blob = await generarJornadaPdf({
        salonNombre: salon?.nombre || 'Centro de trabajo',
        salonCif: salon?.cif ?? null,
        salonDireccion: salon?.direccion ?? null,
        profesional: nombreProf,
        desde, hasta, zona,
        dias,
        totalMinutos: totales?.total_minutos ?? 0,
        totalPausaMinutos: totales?.total_pausa_minutos ?? 0,
        incidencias: totales?.incidencias ?? 0,
        asientos,
      });
      descargarBlob(blob, `registro-jornada-${desde}-${hasta}.pdf`);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setDescargando(false);
    }
  };

  const comprobarIntegridad = async () => {
    setIntegridad(null);
    try {
      const r = await verificarIntegridad();
      if (r.ok === false) { setError(r.error || 'No se ha podido verificar.'); return; }
      setIntegridad(
        r.integra
          ? `Cadena integra: ${r.asientos} asientos verificados, ninguno alterado.`
          : `ATENCION: la cadena se rompe en el asiento nº ${r.primer_asiento_alterado}. Alguien ha modificado el registro por fuera de la aplicacion.`
      );
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const resolver = async (id: string, aprobar: boolean) => {
    setError(null);
    try {
      const nota = aprobar
        ? undefined
        : (typeof window !== 'undefined'
            ? window.prompt('Motivo del rechazo (queda registrado como discrepancia):') ?? undefined
            : undefined);
      const r = await resolverCorreccion(id, aprobar, nota, miProfesionalId ?? null);
      if (r.ok === false) { setError(r.error || 'No se ha podido resolver.'); return; }
      setAviso(aprobar ? 'Correccion autorizada y aplicada al registro.' : 'Correccion rechazada. La discrepancia queda registrada.');
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const mesAnterior = () => setMesRef((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const mesSiguiente = () => setMesRef((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const esMesActual = useMemo(() => {
    const hoy = new Date();
    return mesRef.getFullYear() === hoy.getFullYear() && mesRef.getMonth() === hoy.getMonth();
  }, [mesRef]);

  // Sin ficha de profesional no hay jornada propia que enseñar. Sin este corte,
  // una cuenta de gestor sin ficha veria aqui el registro de TODO el salon, que
  // no es lo que promete "Mi jornada".
  if (!esCentro && !miProfesionalId) {
    return (
      <div style={{ ...card, padding: 20, textAlign: 'center', color: T.textSec, fontSize: 13.5, lineHeight: 1.55 }}>
        Tu cuenta no está vinculada a ninguna ficha de profesional, así que todavía no tienes
        registro de jornada propio. Pídele al responsable que te vincule desde <b>Equipo</b>.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Barra de periodo + filtro + descargas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Boton onClick={mesAnterior}>‹</Boton>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, minWidth: 150, textAlign: 'center' }}>
            {nombrePeriodo}
          </div>
          <Boton onClick={mesSiguiente} disabled={esMesActual}>›</Boton>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {esCentro && profesionales && profesionales.length > 0 && (
            <select
              value={profFiltro}
              onChange={(e) => setProfFiltro(e.target.value)}
              style={{
                padding: '8px 10px', borderRadius: 9, border: `1px solid ${T.borderHi}`,
                background: T.bgCard, color: T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <option value="">Todo el equipo</option>
              {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
          <Boton onClick={() => descargarCSV(`jornada-totales-${desde}-${hasta}`, diasACSV(dias))} disabled={dias.length === 0}>
            CSV totales
          </Boton>
          <Boton onClick={() => descargarCSV(`jornada-asientos-${desde}-${hasta}`, asientosACSV(asientos))} disabled={asientos.length === 0}>
            CSV asientos
          </Boton>
          <Boton onClick={descargarPdf} disabled={descargando || loading} tono="primario">
            {descargando ? 'Generando…' : 'Descargar informe PDF'}
          </Boton>
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: `${T.danger}55`, background: T.dangerSoft, padding: '10px 14px', fontSize: 13, color: T.text }}>
          {error}
        </div>
      )}
      {aviso && (
        <div style={{ ...card, borderColor: `${T.success}55`, background: T.successSoft, padding: '10px 14px', fontSize: 13, color: T.text, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTer }}>×</button>
        </div>
      )}

      {/* Totales del periodo */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat
          label="Tiempo efectivo"
          valor={fmtMinutos(totales?.total_minutos ?? 0)}
          sub={`${minutosADecimal(totales?.total_minutos ?? 0)} h decimales`}
        />
        <Stat
          label="Pausas"
          valor={fmtMinutos(totales?.total_pausa_minutos ?? 0)}
          sub="No computan como trabajo"
        />
        <Stat
          label="Dias con registro"
          valor={String(new Set(dias.map((d) => d.dia)).size)}
        />
        <Stat
          label="Incidencias"
          valor={String(totales?.incidencias ?? 0)}
          sub={(totales?.incidencias ?? 0) > 0 ? 'Falta fichar la salida' : 'Todo cuadrado'}
          color={(totales?.incidencias ?? 0) > 0 ? T.danger : T.success}
        />
      </div>

      {/* Correcciones que esperan a quien mira */}
      {meTocan.length > 0 && (
        <div style={{ ...card, borderColor: `${T.warning}55`, background: T.warningSoft, padding: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            {meTocan.length === 1 ? 'Hay 1 correccion esperando tu autorizacion' : `Hay ${meTocan.length} correcciones esperando tu autorizacion`}
          </div>
          <div style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>
            Un asiento de jornada solo puede cambiarse con la conformidad de la empresa y de la persona trabajadora.
            Tu decision queda registrada de forma indeleble.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meTocan.map((c) => (
              <div key={c.id} style={{ ...card, padding: '10px 12px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                    {c.profesional} · {c.tipo_solicitud === 'anadir' ? 'Anadir marca' : c.tipo_solicitud === 'anular' ? 'Anular marca' : 'Corregir marca'}
                    {c.propuesta?.tipo && ` · ${MARCA_LABEL[c.propuesta.tipo]} ${fmtHoraCorta(c.propuesta.marcado_at, zona)}`}
                  </div>
                  <div style={{ fontSize: 12, color: T.textSec }}>«{c.motivo}» — pedida por {c.solicitada_por_nombre || (c.solicitada_por_rol === 'empresa' ? 'la empresa' : 'la persona trabajadora')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Boton onClick={() => resolver(c.id, true)} tono="exito">Autorizar</Boton>
                  <Boton onClick={() => resolver(c.id, false)} tono="peligro">Rechazar</Boton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totalizacion diaria */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Totalizacion diaria</div>
            <div style={{ fontSize: 11.5, color: T.textSec }}>Horario del centro ({zona}). Las pausas no cuentan como tiempo de trabajo.</div>
          </div>
          <Boton onClick={() => setVerAsientos((v) => !v)}>
            {verAsientos ? 'Ocultar asientos' : 'Ver asientos'}
          </Boton>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: T.textSec, fontSize: 13 }}>Cargando registro…</div>
        ) : dias.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: T.textSec, fontSize: 13 }}>
            No hay fichajes registrados en {nombrePeriodo}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.bgCardHi }}>
                  <th style={th}>Dia</th>
                  {esCentro && !profFiltro && <th style={th}>Persona</th>}
                  <th style={th}>Entrada</th>
                  <th style={th}>Salida</th>
                  <th style={{ ...th, textAlign: 'right' }}>Trabajado</th>
                  <th style={{ ...th, textAlign: 'right' }}>Pausas</th>
                </tr>
              </thead>
              <tbody>
                {dias.map((d, i) => (
                  <tr key={`${d.dia}-${d.profesional_id}-${i}`} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={td}>
                      <span style={{ textTransform: 'capitalize' }}>{fmtDiaLargo(d.dia)}</span>
                      {d.incidencia && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: T.danger, fontWeight: 700 }}>
                          falta la salida
                        </span>
                      )}
                      {d.en_curso && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: T.success, fontWeight: 700 }}>en curso</span>
                      )}
                    </td>
                    {esCentro && !profFiltro && <td style={td}>{d.profesional}</td>}
                    <td style={td}>{fmtHoraCorta(d.entrada, zona)}</td>
                    <td style={td}>{d.en_curso ? '—' : fmtHoraCorta(d.salida, zona)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtMinutos(d.minutos)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: T.textSec, fontVariantNumeric: 'tabular-nums' }}>
                      {d.minutos_pausa > 0 ? fmtMinutos(d.minutos_pausa) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Resumen por persona: es lo que se adjunta al recibo de salarios */}
        {personas.length > 1 && (
          <div style={{ borderTop: `1px solid ${T.borderHi}`, padding: '12px 16px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 8 }}>Resumen mensual por persona</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {personas.map((p) => (
                <div key={p.profesional_id ?? p.profesional} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  <span style={{ color: T.text }}>{p.profesional}</span>
                  <span style={{ color: T.textSec, fontVariantNumeric: 'tabular-nums' }}>
                    {p.dias_trabajados} dias · <b style={{ color: T.text }}>{fmtMinutos(p.minutos)}</b>
                    {p.incidencias > 0 && <span style={{ color: T.danger }}> · {p.incidencias} incidencia(s)</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Asientos en crudo */}
      {verAsientos && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Asientos del registro</div>
              <div style={{ fontSize: 11.5, color: T.textSec }}>
                Inalterables. Para cambiar algo se pide una correccion, que necesita el visto bueno de las dos partes.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Boton onClick={() => setModal({})}>Falta un fichaje</Boton>
              {esCentro && <Boton onClick={comprobarIntegridad}>Verificar integridad</Boton>}
            </div>
          </div>

          {integridad && (
            <div style={{
              padding: '10px 16px', fontSize: 12.5,
              background: integridad.startsWith('ATENCION') ? T.dangerSoft : T.successSoft,
              color: T.text, borderBottom: `1px solid ${T.border}`,
            }}>
              {integridad}
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: T.bgCardHi }}>
                  <th style={th}>Nº</th>
                  {esCentro && !profFiltro && <th style={th}>Persona</th>}
                  <th style={th}>Fecha</th>
                  <th style={th}>Hora</th>
                  <th style={th}>Marca</th>
                  <th style={th}>Modalidad</th>
                  <th style={th}>Origen</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {asientos.map((a) => {
                  const anulado = a.estado === 'anulado';
                  const puedoPedir = esCentro || !miProfesionalId || a.profesional_id === miProfesionalId;
                  return (
                    <tr key={a.id} style={{ borderTop: `1px solid ${T.border}`, opacity: anulado ? 0.55 : 1 }}>
                      <td style={{ ...td, color: T.textTer, fontVariantNumeric: 'tabular-nums' }}>{a.secuencia}</td>
                      {esCentro && !profFiltro && <td style={td}>{a.profesional}</td>}
                      <td style={td}>{a.dia}</td>
                      <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{a.hora}</td>
                      <td style={{ ...td, textDecoration: anulado ? 'line-through' : 'none' }}>
                        {MARCA_LABEL[a.tipo] ?? a.tipo}
                        {anulado && <span style={{ marginLeft: 6, fontSize: 11, color: T.danger, fontWeight: 700 }}>anulado</span>}
                        {a.corrige_a && <span style={{ marginLeft: 6, fontSize: 11, color: T.warning, fontWeight: 700 }}>correccion</span>}
                      </td>
                      <td style={{ ...td, color: T.textSec }}>{a.modalidad === 'remoto' ? 'Remoto' : 'Presencial'}</td>
                      <td style={{ ...td, color: T.textSec }}>{ORIGEN_LABEL[a.origen] ?? a.origen}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {!anulado && puedoPedir && (
                          <button
                            onClick={() => setModal({ asiento: a })}
                            className="btn-interactive"
                            style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Corregir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {asientos.length === 0 && (
                  <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: T.textSec }}>Sin asientos en el periodo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial de correcciones */}
      {correcciones.length > 0 && (
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 4 }}>Historial de correcciones</div>
          <div style={{ fontSize: 11.5, color: T.textSec, marginBottom: 10 }}>
            Constancia indeleble de quien pidio cada cambio, cuando, por que y quien lo autorizo o lo rechazo.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {correcciones.map((c) => {
              const color = c.estado === 'aprobada' ? T.success : c.estado === 'rechazada' ? T.danger : T.warning;
              return (
                <div key={c.id} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
                  <div style={{ fontSize: 12.5, color: T.text }}>
                    <b>{c.profesional}</b> · {c.tipo_solicitud === 'anadir' ? 'anadir' : c.tipo_solicitud === 'anular' ? 'anular' : 'corregir'}
                    {c.propuesta?.tipo && ` ${MARCA_LABEL[c.propuesta.tipo]} ${fmtHoraCorta(c.propuesta.marcado_at, zona)}`}
                    {' — '}
                    <span style={{ color, fontWeight: 700 }}>{c.estado}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: T.textSec }}>
                    «{c.motivo}» · pedida por {c.solicitada_por_nombre || c.solicitada_por_rol} el {new Date(c.created_at).toLocaleDateString('es-ES')}
                    {c.resuelta_at && ` · resuelta por ${c.resuelta_por_nombre || '—'} el ${new Date(c.resuelta_at).toLocaleDateString('es-ES')}`}
                  </div>
                  {c.discrepancia && (
                    <div style={{ fontSize: 11.5, color: T.danger }}>Discrepancia: {c.discrepancia}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal && (
        <ModalCorreccion
          asiento={modal.asiento}
          profesionales={esCentro ? profesionales : undefined}
          profesionalPorDefecto={modal.asiento?.profesional_id ?? miProfesionalId ?? (esCentro ? (profFiltro || null) : null)}
          zona={zona}
          onClose={() => setModal(null)}
          onHecho={async (msg) => { setModal(null); setAviso(msg); await cargar(); }}
        />
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '9px 14px', fontSize: 11, fontWeight: 700,
  color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '9px 14px', color: T.text, whiteSpace: 'nowrap' };

// ─────────────────────────────────────────────────────────────────────────────

function ModalCorreccion({
  asiento, profesionales, profesionalPorDefecto, zona, onClose, onHecho,
}: {
  asiento?: AsientoJornada;
  profesionales?: Array<{ id: string; nombre: string }>;
  profesionalPorDefecto?: string | null;
  zona: string;
  onClose: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const editando = !!asiento;
  const [accion, setAccion] = useState<'corregir' | 'anular'>('corregir');
  const [tipo, setTipo] = useState<TipoMarca>(asiento?.tipo ?? 'entrada');
  const [fecha, setFecha] = useState(() => asiento?.dia ?? new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState(() => (asiento?.hora ?? '09:00:00').slice(0, 5));
  const [profId, setProfId] = useState<string>(profesionalPorDefecto ?? '');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const enviar = async () => {
    setErr(null);
    if (motivo.trim().length < 5) { setErr('Explica el motivo (minimo 5 caracteres).'); return; }
    setGuardando(true);
    try {
      const tipoSolicitud = editando ? accion : 'anadir';
      // La hora se manda como instante local del navegador: el usuario la teclea
      // en la hora del centro, que es la misma en la que trabaja.
      const marcadoAt = tipoSolicitud === 'anular' ? null : new Date(`${fecha}T${hora}:00`).toISOString();
      const r = await solicitarCorreccion({
        tipoSolicitud,
        motivo: motivo.trim(),
        fichajeId: asiento?.id ?? null,
        profesionalId: asiento?.profesional_id ?? (profId || null),
        tipo: tipoSolicitud === 'anular' ? null : tipo,
        marcadoAt,
      });
      if (r.ok === false) { setErr(r.error || 'No se ha podido enviar la solicitud.'); return; }
      onHecho(r.mensaje || 'Solicitud enviada.');
    } catch (e) {
      setErr(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const input: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 9,
    border: `1px solid ${T.borderHi}`, background: T.bgCard, color: T.text, fontSize: 14,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(8,6,4,0.42)', display: 'grid',
        placeItems: 'center', zIndex: 1000, padding: 16,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, padding: 20, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 17, color: T.text }}>
          {editando ? 'Corregir un fichaje' : 'Falta un fichaje'}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: T.textSec, lineHeight: 1.5 }}>
          El asiento original no se borra: queda anulado y a la vista, y el nuevo apunta a el.
          El cambio necesita la conformidad de las dos partes y se guarda con tu nombre y el motivo.
        </p>

        {editando && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['corregir', 'anular'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAccion(a)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${accion === a ? T.primary : T.borderHi}`,
                  background: accion === a ? T.primarySoft : T.bgCard,
                  color: accion === a ? T.primaryHi : T.text,
                }}
              >
                {a === 'corregir' ? 'Cambiar la hora' : 'Anular la marca'}
              </button>
            ))}
          </div>
        )}

        {!editando && profesionales && profesionales.length > 0 && (
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={lbl}>Persona trabajadora</span>
            <select value={profId} onChange={(e) => setProfId(e.target.value)} style={input}>
              <option value="">— Selecciona —</option>
              {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        )}

        {(!editando || accion === 'corregir') && (
          <>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={lbl}>Tipo de marca</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMarca)} style={input}>
                {(Object.keys(MARCA_LABEL) as TipoMarca[]).map((t) => (
                  <option key={t} value={t}>{MARCA_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <label style={{ flex: 1 }}>
                <span style={lbl}>Fecha</span>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={input} />
              </label>
              <label style={{ flex: 1 }}>
                <span style={lbl}>Hora real ({zona})</span>
                <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={input} />
              </label>
            </div>
          </>
        )}

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={lbl}>Motivo (obligatorio)</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej.: me fui a las 20:00 pero olvide fichar la salida."
            style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>

        {err && (
          <div style={{ fontSize: 12.5, color: T.danger, marginBottom: 12 }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Boton onClick={onClose}>Cancelar</Boton>
          <Boton onClick={enviar} disabled={guardando} tono="primario">
            {guardando ? 'Enviando…' : 'Enviar solicitud'}
          </Boton>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: T.textTer,
  textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5,
};
