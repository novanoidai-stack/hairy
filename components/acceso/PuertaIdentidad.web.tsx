// Puerta "¿Quién eres?" del modo de acceso compartido.
//
// El salón entra con un solo correo (el del jefe) desde la tablet del mostrador.
// Esta pantalla es lo primero que se ve: se elige la persona y, a partir de ahí,
// el software se comporta como ella. Elegir Propietario o Dirección pide el PIN,
// porque son los roles que abren la caja, los informes y la configuración.
//
// No es un muro de seguridad —la sesión de debajo sigue siendo la del jefe— sino
// la misma barrera que tiene el TPV de cualquier tienda. Está dicho tal cual en
// el panel de staff que enciende el modo.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { elegirIdentidad, pidePin, ROL_ACCESO_DESC, ROL_ACCESO_LABEL, type RolAcceso } from '@/lib/identidadActiva';
import type { FichaElegible } from '@/lib/hooks/useAccesoSalon';

const T = {
  bg: '#f6f1ea',
  panel: '#fffdfb',
  card: '#ffffff',
  border: 'rgba(40,30,24,0.10)',
  borderHi: 'rgba(40,30,24,0.16)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#8a7d70',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  danger: '#e23b34',
};

interface Props {
  fichas: FichaElegible[];
  negocioId: string;
  tienePin: boolean;
  email: string | null;
  nombreSalon?: string | null;
  onElegida: () => void;
}

// Entrada fija del propietario: el jefe no tiene por qué tener ficha en la
// agenda (puede no dar citas) y aun así necesita entrar como propietario.
const ENTRADA_PROPIETARIO = '__propietario__';

export function PuertaIdentidad({ fichas, negocioId, tienePin, email, nombreSalon, onElegida }: Props) {
  const [pendiente, setPendiente] = useState<{ id: string; nombre: string; rol: RolAcceso } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [comprobando, setComprobando] = useState(false);

  useEffect(() => { setPin(''); setError(''); }, [pendiente]);

  async function entrar(id: string, nombre: string, rol: RolAcceso) {
    if (pidePin(rol)) {
      if (!tienePin) {
        // Sin PIN configurado no se puede pedir. Se deja pasar y se avisa: es
        // mejor que dejar al jefe fuera de su propio salón.
        await elegirIdentidad({
          negocioId,
          profesionalId: id === ENTRADA_PROPIETARIO ? null : id,
          nombre,
          rol,
        });
        onElegida();
        return;
      }
      setPendiente({ id, nombre, rol });
      return;
    }
    await elegirIdentidad({
      negocioId,
      profesionalId: id === ENTRADA_PROPIETARIO ? null : id,
      nombre,
      rol,
    });
    onElegida();
  }

  async function confirmarPin() {
    if (!pendiente) return;
    setComprobando(true);
    setError('');
    const { data, error: err } = await supabase.rpc('verificar_pin_propietario', { p_pin: pin });
    setComprobando(false);
    if (err) {
      setError(
        (err.message || '').includes('demasiados_intentos')
          ? 'Demasiados intentos seguidos. Espera unos minutos.'
          : 'No se pudo comprobar el PIN. Inténtalo de nuevo.',
      );
      return;
    }
    if (data !== true) {
      setError('Ese PIN no es correcto.');
      setPin('');
      return;
    }
    await elegirIdentidad({
      negocioId,
      profesionalId: pendiente.id === ENTRADA_PROPIETARIO ? null : pendiente.id,
      nombre: pendiente.nombre,
      rol: pendiente.rol,
    });
    onElegida();
  }

  const iniciales = (n: string) =>
    n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        overflowY: 'auto',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 720 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: T.textTer }}>
            {nombreSalon || 'Tu salón'}
          </div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 30, fontWeight: 800, letterSpacing: -0.6, color: T.text }}>
            ¿Quién eres?
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: T.textSec }}>
            Elige tu nombre para que la agenda y los cobros queden a tu nombre.
          </p>
        </div>

        {!pendiente ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 12,
              }}
            >
              {fichas.map((f) => (
                <button
                  key={f.id}
                  onClick={() => entrar(f.id, f.nombre, f.rol_acceso)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    padding: '20px 12px 16px',
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    borderRadius: 16,
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = f.color || T.primary;
                    e.currentTarget.style.boxShadow = `0 10px 30px ${(f.color || T.primary)}26`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = T.border;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: '50%',
                      background: f.foto_perfil ? `center/cover url(${f.foto_perfil})` : (f.color || T.primary),
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 21,
                      fontWeight: 800,
                    }}
                  >
                    {!f.foto_perfil && iniciales(f.nombre)}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text, textAlign: 'center' }}>{f.nombre}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.textTer }}>
                    {ROL_ACCESO_LABEL[f.rol_acceso]}
                    {pidePin(f.rol_acceso) ? ' · PIN' : ''}
                  </div>
                </button>
              ))}

              <button
                onClick={() => entrar(ENTRADA_PROPIETARIO, 'Propietario', 'owner')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '20px 12px 16px',
                  background: 'transparent',
                  border: `1.5px dashed ${T.borderHi}`,
                  borderRadius: 16,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    border: `1.5px dashed ${T.borderHi}`,
                    color: T.textTer,
                    fontSize: 15,
                    fontWeight: 800,
                    letterSpacing: 1,
                  }}
                >
                  PIN
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Soy el jefe</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textTer }}>Propietario · PIN</div>
              </button>
            </div>

            {fichas.length === 0 && (
              <p style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: T.textSec }}>
                Todavía no hay profesionales dados de alta. Entra como jefe y añádelos en Equipo.
              </p>
            )}
          </>
        ) : (
          <div
            style={{
              maxWidth: 340,
              margin: '0 auto',
              background: T.panel,
              border: `1px solid ${T.borderHi}`,
              borderRadius: 18,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>{pendiente.nombre}</div>
            <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 18 }}>
              {ROL_ACCESO_DESC[pendiente.rol]} Escribe el PIN para entrar.
            </div>
            <input
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={(e) => { if (e.key === 'Enter' && pin.length >= 4) confirmarPin(); }}
              inputMode="numeric"
              type="password"
              placeholder="••••"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 22,
                letterSpacing: 8,
                textAlign: 'center',
                borderRadius: 12,
                border: `1px solid ${error ? T.danger : T.borderHi}`,
                background: '#f6f1ea',
                color: T.text,
                marginBottom: 10,
              }}
            />
            {error && <div style={{ fontSize: 12.5, color: T.danger, marginBottom: 10 }}>{error}</div>}
            <button
              onClick={confirmarPin}
              disabled={pin.length < 4 || comprobando}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 12,
                border: 'none',
                background: pin.length < 4 || comprobando ? 'rgba(244,80,30,0.35)' : `linear-gradient(180deg,#ff7a2e,#f4501e)`,
                color: '#fff',
                fontSize: 14.5,
                fontWeight: 700,
                cursor: pin.length < 4 || comprobando ? 'default' : 'pointer',
              }}
            >
              {comprobando ? 'Comprobando…' : 'Entrar'}
            </button>
            <button
              onClick={() => setPendiente(null)}
              style={{
                marginTop: 10,
                background: 'none',
                border: 'none',
                color: T.textSec,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Volver
            </button>
          </div>
        )}

        <p style={{ marginTop: 22, textAlign: 'center', fontSize: 11.5, color: T.textTer }}>
          Este dispositivo entra con {email || 'el correo del salón'}. Puedes cambiar de persona en cualquier
          momento desde tu nombre, arriba a la derecha.
        </p>
      </div>
    </div>
  );
}

export default PuertaIdentidad;
