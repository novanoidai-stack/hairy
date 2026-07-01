// Pantalla "Mi perfil" para el rol profesional: autoservicio de su propia ficha
// (telefono/email/especialidades via RPC actualizar_mi_perfil_profesional) +
// cambio de contrasena. Comision/categoria/estado quedan solo lectura (los
// gestiona el propietario en Equipo). Reemplaza el bloqueo total que veia antes
// este rol al entrar a Ajustes.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { Section, FieldRow, STextInput, Badge, Btn } from '@/components/ui/SettingsAtoms';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PageLoader } from '@/components/ui/DesignComponents';

const T = DESIGN_TOKENS;

interface ProfesionalPropio {
  id: string;
  nombre: string;
  categoria: string | null;
  comision_pct: number | null;
  activo: boolean;
  telefono: string | null;
  email: string | null;
  especialidades: string[] | null;
}

export function MiPerfilProfesional({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [prof, setProf] = useState<ProfesionalPropio | null>(null);
  const [noVinculado, setNoVinculado] = useState(false);

  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [especialidades, setEspecialidades] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from('profesionales')
        .select('id, nombre, categoria, comision_pct, activo, telefono, email, especialidades')
        .eq('profile_id', userId)
        .maybeSingle();
      if (cancel) return;
      if (!data) { setNoVinculado(true); setLoading(false); return; }
      const p = data as ProfesionalPropio;
      setProf(p);
      setTelefono(p.telefono || '');
      setEmail(p.email || '');
      setEspecialidades((p.especialidades || []).join(', '));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [userId]);

  const especialidadesGuardadas = (prof?.especialidades || []).join(', ');
  const dirty = !!prof && (telefono !== (prof.telefono || '') || email !== (prof.email || '') || especialidades !== especialidadesGuardadas);

  const guardar = async () => {
    setSaving(true); setMsg(null);
    const especialidadesArr = especialidades.split(',').map((s) => s.trim()).filter(Boolean);
    const { data, error } = await supabase.rpc('actualizar_mi_perfil_profesional', {
      p_telefono: telefono.trim() || null,
      p_email: email.trim() || null,
      p_especialidades: especialidadesArr,
    });
    setSaving(false);
    if (error) { setMsg({ ok: false, text: mensajeDeError(error) }); return; }
    const p = data as ProfesionalPropio;
    setProf(p);
    setTelefono(p.telefono || '');
    setEmail(p.email || '');
    setEspecialidades((p.especialidades || []).join(', '));
    setMsg({ ok: true, text: 'Guardado.' });
    setTimeout(() => setMsg(null), 2200);
  };

  const changePassword = async () => {
    setPassMsg(null);
    if (pass1.length < 8) { setPassMsg({ ok: false, text: 'La contraseña necesita al menos 8 caracteres.' }); return; }
    if (pass1 !== pass2) { setPassMsg({ ok: false, text: 'Las dos contraseñas no coinciden.' }); return; }
    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({ password: pass1 });
    setSavingPass(false);
    if (error) { setPassMsg({ ok: false, text: 'No se pudo cambiar. Cierra sesion, vuelve a entrar e intentalo de nuevo.' }); return; }
    setPass1(''); setPass2('');
    setPassMsg({ ok: true, text: 'Contraseña actualizada correctamente.' });
  };

  if (loading) return <PageLoader message="Cargando tu perfil..." />;

  if (noVinculado) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' as const }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>Sin ficha de profesional</div>
          <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
            Tu cuenta todavia no esta vinculada a ninguna ficha del equipo. Pide a tu gestor que te dé de alta en Equipo.
          </div>
        </div>
      </div>
    );
  }

  const rowMsg = (m: { ok: boolean; text: string } | null) =>
    m ? <span style={{ fontSize: 12, color: m.ok ? T.success : T.danger, fontWeight: 600 }}>{m.text}</span> : null;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '28px 24px 60px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: '0 0 4px' }}>Mi perfil</h1>
        <p style={{ fontSize: 13, color: T.textSecondary, margin: '0 0 20px' }}>
          Tus datos de contacto como profesional. La comisión, la categoría, el estado y tu horario los gestiona tu salón.
        </p>

        <Section title="Contacto" desc="Tu correo puede usarse para que te lleguen las respuestas de los presupuestos que envíes a tus clientas.">
          <FieldRow label="Teléfono">
            <div style={{ width: 240 }}>
              <PhoneInput compact value={telefono} onChange={setTelefono} placeholder="600 000 000" />
            </div>
          </FieldRow>
          <FieldRow label="Correo de contacto">
            <STextInput value={email} onChange={setEmail} width={260} type="email" leadingIcon="mail" placeholder="tu@correo.com" />
          </FieldRow>
          <FieldRow label="Especialidades" hint="Separadas por comas, por ejemplo: Color, Mechas, Alisado.">
            <STextInput value={especialidades} onChange={setEspecialidades} width={320} placeholder="Color, Mechas..." />
          </FieldRow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            {rowMsg(msg)}
            <Btn variant="primary" size="sm" icon="check" onClick={guardar} disabled={!dirty || saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Btn>
          </div>
        </Section>

        <Section title="Tu ficha" desc="Datos que gestiona tu salón.">
          <FieldRow label="Categoría"><Badge tone="neutral">{prof?.categoria || 'Sin categoría'}</Badge></FieldRow>
          <FieldRow label="Comisión"><Badge tone="primary">{prof?.comision_pct != null ? `${prof.comision_pct}%` : '--'}</Badge></FieldRow>
          <FieldRow label="Estado"><Badge tone={prof?.activo ? 'success' : 'neutral'}>{prof?.activo ? 'Activo' : 'Inactivo'}</Badge></FieldRow>
        </Section>

        <Section title="Contraseña" desc="Cambia tu contraseña de acceso al software.">
          <FieldRow label="Nueva contraseña" hint="Mínimo 8 caracteres.">
            <STextInput value={pass1} onChange={setPass1} width={220} type="password" leadingIcon="lock" placeholder="Nueva contraseña" />
          </FieldRow>
          <FieldRow label="Repite la contraseña">
            <STextInput value={pass2} onChange={setPass2} width={220} type="password" leadingIcon="lock" placeholder="Repite la contraseña" />
          </FieldRow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            {rowMsg(passMsg)}
            <Btn variant="primary" size="sm" icon="lock" onClick={changePassword} disabled={savingPass || !pass1 || !pass2}>
              {savingPass ? 'Guardando...' : 'Cambiar contraseña'}
            </Btn>
          </div>
        </Section>
      </div>
    </div>
  );
}
