import { useEffect, useState } from 'react';
import { View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TText } from '@/components/ui/TText';
import { Btn } from '@/components/ui/DesignComponents';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { getUserProfile, type UserProfile } from '@/lib/auth';
import { IS_DEMO_MODE } from '@/lib/supabase';
import { incluyePlan, planDe, PLAN_LABEL, FUNCION_LABEL, type FuncionPlan } from '@/lib/planes';

// Gating por PLAN contratado (distinto del gating por rol y del de privacidad).
// Si el salon no tiene el plan que incluye la funcion, la pantalla no se monta:
// asi no dispara sus consultas y no se ve a medias. La demo compartida queda
// exenta a proposito, para que el visitante pueda verlo TODO antes de comprar.
export function withPlanGate<P extends object>(
  Screen: React.ComponentType<P>,
  funcion: FuncionPlan,
) {
  return function PlanGatedScreen(props: P) {
    const { permitido, cargando } = usePlan(funcion);
    if (cargando) return null;
    if (!permitido) return <PlanGateOverlay funcion={funcion} />;
    return <Screen {...props} />;
  };
}

// Hook suelto para gatear un boton o una tarjeta dentro de una pantalla que si
// entra en el plan (p.ej. el boton de cobrar senal dentro de la ficha de cita).
export function usePlan(funcion: FuncionPlan): { permitido: boolean; cargando: boolean; plan: string } {
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    getUserProfile().then((p) => { if (vivo) setProfile(p); }).catch(() => { if (vivo) setProfile(null); });
    return () => { vivo = false; };
  }, []);
  // En la demo compartida se ve todo (es el escaparate). Mientras carga el
  // perfil tampoco se bloquea nada: se evita el parpadeo de "no tienes el plan".
  if (IS_DEMO_MODE) return { permitido: true, cargando: false, plan: 'estudio' };
  if (profile === undefined) return { permitido: false, cargando: true, plan: '' };
  return {
    permitido: incluyePlan(profile, funcion),
    cargando: false,
    plan: planDe(profile),
  };
}

export function PlanGateOverlay({ funcion }: { funcion: FuncionPlan }) {
  const queEs = FUNCION_LABEL[funcion] || 'esta función';
  const irAPrecios = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      (window.top || window).location.href = '/#precios';
    } catch (_e) {
      window.location.href = '/#precios';
    }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: T.bg }}>
      <View style={{ maxWidth: 400, alignItems: 'center', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: T.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Ionicons name="sparkles-outline" size={22} color={T.primary} />
        </View>
        <TText style={{ fontSize: T.fontSize.lg, fontWeight: 700 as const, color: T.text, textAlign: 'center' }}>
          {queEs.charAt(0).toUpperCase() + queEs.slice(1)} entra en el plan {PLAN_LABEL.estudio}
        </TText>
        <TText style={{ fontSize: T.fontSize.sm, color: T.textSecondary, textAlign: 'center', lineHeight: 20 }}>
          Tu salón tiene el plan {PLAN_LABEL.esencial}. Cambiar de plan se hace en un momento y lo tienes activo el mismo día, sin permanencia.
        </TText>
        <Btn variant="primary" style={{ marginTop: 8 }} onPress={irAPrecios}>
          Ver qué incluye el plan Estudio
        </Btn>
      </View>
    </View>
  );
}
