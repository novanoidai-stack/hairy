import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from 'react-native';
import { useSegments, useRouter } from 'expo-router';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile, isStaff } from '@/lib/auth';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { Ionicons } from '@expo/vector-icons';

const T = DESIGN_TOKENS;

interface PerfilSuscripcion {
  id: string;
  email: string;
  nombre_negocio?: string;
  plan?: string | null;
  suscripcion_estado?: string | null;
  trial_ends_at?: string | null;
}

export function GuardaSuscripcion() {
  const segments = useSegments();
  const router = useRouter();
  const isPublicRoute = ['r', 'resena', 'cita', 'pago', 'pagar', 'presupuesto', 'contacto'].includes(String(segments[0]));

  const [perfil, setPerfil] = useState<PerfilSuscripcion | null>(null);
  const [esDelStaff, setEsDelStaff] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    if (isPublicRoute || IS_DEMO_MODE) {
      setCargando(false);
      return;
    }

    async function check() {
      try {
        const [p, staffCheck] = await Promise.all([
          getUserProfile(),
          isStaff(),
        ]);
        if (!vivo) return;
        setEsDelStaff(staffCheck);
        setPerfil(p as PerfilSuscripcion);
      } catch (_e) {
        // error de red
      } finally {
        if (vivo) setCargando(false);
      }
    }

    check();
    return () => { vivo = false; };
  }, [isPublicRoute]);

  if (isPublicRoute || IS_DEMO_MODE || cargando || esDelStaff || !perfil) {
    return null;
  }

  // 1) Si tiene suscripción activa de pago, no hay aviso ni bloqueo
  if (perfil.suscripcion_estado === 'activa') {
    return null;
  }

  // 2) Calcular estado del trial de 30 días
  const trialEndsAt = perfil.trial_ends_at ? new Date(perfil.trial_ends_at) : null;
  const now = new Date();

  // Estados que deben bloquear aunque falte o discrepe la fecha: 'caducada'
  // (marcada por p0-007 al vencer la prueba) y 'cancelada' (suscripción de
  // pago extinguida). Sin esto, una cuenta cancelada con fecha de trial vieja
  // en el futuro volvería a ver el banner de "1 mes gratis".
  const estadoBloqueado =
    perfil.suscripcion_estado === 'caducada' || perfil.suscripcion_estado === 'cancelada';

  // Si no tiene fecha de fin de prueba ni estado bloqueante, no hay nada que mostrar
  if (!trialEndsAt && !estadoBloqueado) {
    return null;
  }

  const diffMs = trialEndsAt ? trialEndsAt.getTime() - now.getTime() : -1;
  const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const trialVencido = estadoBloqueado || diasRestantes <= 0;

  // 3) BLOQUEO TOTAL SI LA PRUEBA HA CADUCADO
  if (trialVencido) {
    return (
      <View style={s.lockOverlay}>
        <View style={s.lockCard}>
          <View style={s.lockIconWrap}>
            <Ionicons name="time" size={40} color="#f4501e" />
          </View>

          <Text style={s.lockTitle}>Tu periodo de prueba de 30 días ha finalizado</Text>
          <Text style={s.lockSubtitle}>
            Esperamos que hayas disfrutado de Mecha OS con el <Text style={{ fontWeight: '800', color: '#f4501e' }}>Plan Estudio completo</Text>. Para continuar gestionando tu salón y desbloquear tus datos, elige tu plan:
          </Text>

          {/* Comparativa rápida de planes */}
          <View style={s.planesGrid}>
            <View style={s.planBox}>
              <Text style={s.planBoxName}>Plan Esencial</Text>
              <Text style={s.planBoxPrice}>39 € <Text style={s.planBoxSub}>/mes + IVA</Text></Text>
              <Text style={s.planBoxDesc}>
                Agenda completa, fichas de clientes, caja, informes, recordatorios y VeriFactu legal.
              </Text>
            </View>

            <View style={[s.planBox, s.planBoxFeatured]}>
              <View style={s.badgeEstudio}>
                <Text style={s.badgeEstudioTx}>RECOMENDADO</Text>
              </View>
              <Text style={s.planBoxName}>Plan Estudio</Text>
              <Text style={s.planBoxPrice}>59 € <Text style={s.planBoxSub}>/mes + IVA</Text></Text>
              <Text style={s.planBoxDesc}>
                Todo lo de Esencial + Presupuestos, Inventario, Reseñas, Señales anti no-show, Campañas y Lista de espera.
              </Text>
            </View>
          </View>

          {/* Botones de acción */}
          <View style={s.lockActions}>
            <TouchableOpacity
              style={s.btnPrimary}
              onPress={() => {
              const msg = encodeURIComponent(
                `Hola Alexandru, quiero activar mi suscripción a Mecha OS para mi salón "${perfil.nombre_negocio || perfil.email}".`
              );
              const url = `https://wa.me/34690792975?text=${msg}`;
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.open(url, '_blank');
              } else {
                Linking.openURL(url).catch(() => {});
              }
              }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.btnPrimaryTx}>Activar suscripción por WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.btnSecondary}
              onPress={() => {
              const url = `mailto:contacto@mechaa.es?subject=${encodeURIComponent(
                'Activar suscripción Mecha OS - ' + (perfil.nombre_negocio || perfil.email)
              )}&body=${encodeURIComponent('Hola equipo,\n\nQuiero activar el plan para mi salón.\n\nEmail: ' + perfil.email)}`;
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.href = url;
              } else {
                Linking.openURL(url).catch(() => {});
              }
              }}
            >
              <Ionicons name="mail" size={18} color={T.text} style={{ marginRight: 8 }} />
              <Text style={s.btnSecondaryTx}>Contactar por correo (contacto@mechaa.es)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.btnLogout}
              onPress={async () => {
              await supabase.auth.signOut();
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.href = '/acceso.html';
              } else {
                router.replace('/acceso' as never);
              }
              }}
            >
              <Ionicons name="log-out-outline" size={16} color="#dc2626" style={{ marginRight: 6 }} />
              <Text style={s.btnLogoutTx}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // 4) BANNER SUPERIOR INFORMATIVO SI ESTÁ EN PERIODO DE PRUEBA ACTIVO
  return (
    <View style={s.trialBanner}>
      <View style={s.trialBannerIn}>
        <View style={s.trialLeft}>
          <View style={s.trialPill}>
            <Text style={s.trialPillTx}>1 MES GRATIS</Text>
          </View>
          <Text style={s.trialTx}>
            Prueba gratuita del <Text style={{ fontWeight: '800' }}>Plan Estudio completo</Text>: te quedan{' '}
            <Text style={{ fontWeight: '800', color: '#ffcf4a' }}>
              {diasRestantes} {diasRestantes === 1 ? 'día' : 'días'}
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          style={s.trialBtn}
          onPress={() => router.push('/(tabs)/configuracion' as never)}
        >
          <Text style={s.trialBtnTx}>Ver planes & contratar →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Banner de días restantes de prueba
  trialBanner: {
    backgroundColor: '#1c1814',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(244,80,30,0.3)',
    zIndex: 99,
  },
  trialBannerIn: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    paddingVertical: 7,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  // flex:1 + minWidth:0 son obligatorios: sin ellos este hijo de una fila
  // flex no encoge, y en movil el texto de la prueba se salia del banner
  // cortado por la derecha en vez de partirse en dos lineas.
  trialLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  trialPill: {
    backgroundColor: '#f4501e',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  trialPillTx: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  trialTx: {
    color: '#f6f1ea',
    fontSize: 12.5,
    lineHeight: 17,
    flex: 1,
    minWidth: 0,
  },
  trialBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  trialBtnTx: {
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '700',
  },

  // Pantalla de bloqueo total
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20, 16, 13, 0.94)',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        cursor: 'auto' as const,
      },
    }),
  },
  lockCard: {
    backgroundColor: '#fff',
    maxWidth: 620,
    width: '100%',
    borderRadius: 22,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(244,80,30,0.25)',
  },
  lockIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#fff2eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffd5c2',
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1c1814',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  lockSubtitle: {
    fontSize: 14,
    color: '#6e6256',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  planesGrid: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  planBox: {
    flex: 1,
    minWidth: 230,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#f8f5f0',
    borderWidth: 1,
    borderColor: '#e8dfd3',
    position: 'relative',
  },
  planBoxFeatured: {
    backgroundColor: '#fff9f5',
    borderColor: '#f4501e',
    borderWidth: 1.5,
  },
  badgeEstudio: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#f4501e',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  badgeEstudioTx: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planBoxName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1c1814',
    marginBottom: 4,
  },
  planBoxPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f4501e',
    marginBottom: 8,
  },
  planBoxSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8a7d70',
  },
  planBoxDesc: {
    fontSize: 12,
    color: '#6e6256',
    lineHeight: 16,
  },
  lockActions: {
    width: '100%',
    gap: 10,
  },
  btnPrimary: {
    backgroundColor: '#f4501e',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimaryTx: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: '#f8f5f0',
    borderWidth: 1,
    borderColor: '#e8dfd3',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryTx: {
    color: '#1c1814',
    fontSize: 13.5,
    fontWeight: '600',
  },
  btnLogout: {
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  btnLogoutTx: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default GuardaSuscripcion;
