import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { AvisosBell } from '@/components/avisos/AvisosBell';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import {
  CATEGORIAS_MANUALES,
  TODOS_LOS_MANUALES,
  FAQS_INICIALES,
  type ManualContent,
  type FAQItem,
} from '@/lib/manuals';
import { HubIA } from '@/components/config/HubIA';
import { getUserProfile } from '@/lib/auth';
import { useEffect } from 'react';

const T = {
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  purple: '#8b5cf6',
  purpleSoft: 'rgba(139,92,246,0.12)',
  teal: '#0891b2',
  pink: '#e11d6b',
  success: '#0f9d6b',
};

const ANIMATIONS = `
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .ayuda-card { animation: slideInUp 0.35s cubic-bezier(0.16,1,0.3,1) both; }
  .ayuda-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(40,30,24,0.08); }
`;

export default function AyudaScreen() {
  const router = useRouter();
  const { isMobile } = useResponsive();

  const [busqueda, setBusqueda] = useState('');
  const [catSel, setCatSel] = useState<string>('todas');
  const [manualActivo, setManualActivo] = useState<ManualContent | null>(null);
  const [faqAbierta, setFaqAbierta] = useState<string | null>(null);
  const [preguntaChispa, setPreguntaChispa] = useState('');
  const [negocioId, setNegocioId] = useState<string>('');
  const [rolStr, setRolStr] = useState<string>('');

  useEffect(() => {
    getUserProfile().then(user => {
      if (user) {
        setNegocioId(user.negocioId || user.id);
        setRolStr(user.role || '');
      }
    });
  }, []);

  // Filtrado de manuales
  const manualesFiltrados = useMemo(() => {
    const query = busqueda.trim().toLowerCase();
    return Object.values(TODOS_LOS_MANUALES).filter((m) => {
      // Filtro por categoría
      if (catSel !== 'todas' && catSel !== 'faqs') {
        const catObj = CATEGORIAS_MANUALES.find((c) => c.id === catSel);
        if (catObj && !catObj.manuales.some((item) => item.pageKey === m.pageKey)) {
          return false;
        }
      }
      if (!query) return true;
      const coincideTitulo = m.tituloPagina.toLowerCase().includes(query);
      const coincideAviso = m.avisoTexto.toLowerCase().includes(query);
      const coincideSecciones = m.secciones.some(
        (s) => s.titulo.toLowerCase().includes(query) || s.texto.toLowerCase().includes(query),
      );
      return coincideTitulo || coincideAviso || coincideSecciones;
    });
  }, [busqueda, catSel]);

  // Filtrado de FAQs
  const faqsFiltradas = useMemo(() => {
    const query = busqueda.trim().toLowerCase();
    return FAQS_INICIALES.filter((f) => {
      if (catSel !== 'todas' && catSel !== 'faqs') {
        // Mapear categorías de FAQ a las pestañas de UI
        if (catSel === 'operativa' && !['primeros_pasos', 'agenda'].includes(f.categoria)) return false;
        if (catSel === 'gestion' && !['caja', 'equipo', 'configuracion', 'planes', 'bonos'].includes(f.categoria)) return false;
        if (catSel === 'crm' && !['reserva', 'mensajes'].includes(f.categoria)) return false;
        if (catSel === 'analisis_ia' && !['ia'].includes(f.categoria)) return false;
      }
      if (!query) return true;
      return (
        f.pregunta.toLowerCase().includes(query) ||
        f.respuesta.toLowerCase().includes(query)
      );
    });
  }, [busqueda, catSel]);

  const abrirChispaConConsulta = () => {
    if (!preguntaChispa.trim()) return;
    // Redirige al panel o tab de Chispa con la pregunta precargada
    router.push({
      pathname: '/(tabs)/bandeja',
      params: { promptIA: preguntaChispa.trim() },
    });
  };

  return (
    <div style={{ height: '100%', flex: 1, overflowY: 'auto', background: T.bg, color: T.text, padding: isMobile ? 12 : 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIMATIONS }} />

      {/* ── Cabecera Superior ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.primary }}>
            Soporte & Formación
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: -0.5 }}>
            Centro de Ayuda y Manuales
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AvisosBell />
        </div>
      </div>

      {/* ── Banner / Buscador con Chispa (IA) ── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${T.bgCardHi} 0%, #ffffff 100%)`,
          border: `1px solid ${T.borderHi}`,
          borderRadius: 20,
          padding: isMobile ? 18 : 24,
          marginBottom: 24,
          boxShadow: '0 8px 24px rgba(40,30,24,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: T.purpleSoft,
              color: T.purple,
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            ✨
          </div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 18, fontWeight: 700, color: T.text }}>
            Pregunta a Chispa o busca en los manuales
          </h2>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: T.textSec, lineHeight: 1.5 }}>
          Resuelve cualquier duda sobre la configuración de tu salón, funciones de la agenda, cobros o herramientas de IA.
        </p>

        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              value={preguntaChispa || busqueda}
              onChange={(e) => {
                setPreguntaChispa(e.target.value);
                setBusqueda(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') abrirChispaConConsulta();
              }}
              placeholder="Ej: ¿Cómo configuro la caja? / ¿Cómo activo el modo compartido con PIN?"
              style={{
                width: '100%',
                padding: '12px 16px',
                paddingLeft: 42,
                borderRadius: 12,
                border: `1px solid ${T.borderHi}`,
                background: '#fff',
                fontSize: 14,
                color: T.text,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.textTer, fontSize: 16 }}>
              🔍
            </span>
          </div>
          <button
            onClick={abrirChispaConConsulta}
            style={{
              padding: '12px 20px',
              borderRadius: 12,
              background: `linear-gradient(135deg, ${T.primary}, ${T.primaryHi})`,
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: 13.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(244,80,30,0.25)',
            }}
          >
            <span>Preguntar a Chispa</span>
            <span>✨</span>
          </button>
        </div>
      </div>

      {/* ── Filtros de Categoría ── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 8,
          marginBottom: 20,
          scrollbarWidth: 'none',
        }}
      >
        <button
          onClick={() => setCatSel('todas')}
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: `1px solid ${catSel === 'todas' ? T.primary : T.border}`,
            background: catSel === 'todas' ? T.primarySoft : T.bgCard,
            color: catSel === 'todas' ? T.primaryHi : T.textSec,
            fontWeight: catSel === 'todas' ? 700 : 500,
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          📚 Todos los manuales ({Object.keys(TODOS_LOS_MANUALES).length})
        </button>

        {CATEGORIAS_MANUALES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCatSel(c.id)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: `1px solid ${catSel === c.id ? c.color : T.border}`,
              background: catSel === c.id ? `${c.color}15` : T.bgCard,
              color: catSel === c.id ? c.color : T.textSec,
              fontWeight: catSel === c.id ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {c.titulo}
          </button>
        ))}

        <button
          onClick={() => setCatSel('faqs')}
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: `1px solid ${catSel === 'faqs' ? T.purple : T.border}`,
            background: catSel === 'faqs' ? T.purpleSoft : T.bgCard,
            color: catSel === 'faqs' ? T.purple : T.textSec,
            fontWeight: catSel === 'faqs' ? 700 : 500,
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ❓ Preguntas Frecuentes ({FAQS_INICIALES.length})
        </button>

        <button
          onClick={() => setCatSel('hub_ia')}
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: `1px solid ${catSel === 'hub_ia' ? T.teal : T.border}`,
            background: catSel === 'hub_ia' ? T.bgCardHi : T.bgCard,
            color: catSel === 'hub_ia' ? T.teal : T.textSec,
            fontWeight: catSel === 'hub_ia' ? 700 : 500,
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ✨ Qué hace la IA
        </button>
      </div>

      {catSel === 'hub_ia' && (
        <div style={{ marginBottom: 32 }}>
          <HubIA negocioId={negocioId} rolStr={rolStr} />
        </div>
      )}

      {/* ── Sección de Manuales ── */}
      {catSel !== 'faqs' && catSel !== 'hub_ia' && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 14 }}>
            {catSel === 'todas'
              ? 'Guías de uso por módulo'
              : CATEGORIAS_MANUALES.find((c) => c.id === catSel)?.titulo}
          </h2>

          {manualesFiltrados.length === 0 ? (
            <div style={{ padding: 24, background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, textAlign: 'center', color: T.textSec }}>
              No encontramos ningún manual con el término "{busqueda}".
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 14,
              }}
            >
              {manualesFiltrados.map((m) => (
                <div
                  key={m.pageKey}
                  className="ayuda-card"
                  onClick={() => setManualActivo(m)}
                  style={{
                    background: T.bgCard,
                    border: `1px solid ${T.border}`,
                    borderRadius: 16,
                    padding: 18,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{m.tituloPagina}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.primary, background: T.primarySoft, padding: '2px 8px', borderRadius: 999 }}>
                        {m.secciones.length} secciones
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: T.textSec, lineHeight: 1.5 }}>
                      {m.avisoTexto}
                    </p>
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.primary }}>Ver manual completo →</span>
                    <span style={{ fontSize: 11, color: T.textTer }}>Guía interactiva</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sección de Preguntas Frecuentes (FAQ) ── */}
      {(catSel === 'faqs' || catSel === 'todas') && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>
              Preguntas Frecuentes y Configuración Inicial
            </h2>
            <span style={{ fontSize: 12, color: T.textTer }}>Dudas clásicas respondidas</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {faqsFiltradas.map((faq) => {
              const abierta = faqAbierta === faq.id;
              return (
                <div
                  key={faq.id}
                  style={{
                    background: T.bgCard,
                    border: `1px solid ${abierta ? T.borderHi : T.border}`,
                    borderRadius: 14,
                    padding: 16,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <button
                    onClick={() => setFaqAbierta(abierta ? null : faq.id)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{faq.pregunta}</span>
                    <span style={{ fontSize: 16, color: T.textTer, marginLeft: 10 }}>{abierta ? '▲' : '▼'}</span>
                  </button>

                  {abierta && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.textSec, lineHeight: 1.6 }}>
                      {faq.respuesta}
                      {faq.linkManualKey && TODOS_LOS_MANUALES[faq.linkManualKey] && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            onClick={() => setManualActivo(TODOS_LOS_MANUALES[faq.linkManualKey!])}
                            style={{
                              background: T.primarySoft,
                              border: `1px solid ${T.primary}33`,
                              color: T.primaryHi,
                              borderRadius: 8,
                              padding: '5px 10px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Abrir manual de {TODOS_LOS_MANUALES[faq.linkManualKey].tituloPagina} →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Banner de Contacto / Soporte ── */}
      <div
        style={{
          background: T.bgCardHi,
          border: `1px solid ${T.borderHi}`,
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>¿No encuentras lo que buscas?</div>
          <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 2 }}>
            El equipo de soporte de Mecha está disponible para ayudarte a configurar tu salón o resolver cualquier incidencia.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 6 }}>
          <button
            onClick={() => window.open('https://wa.me/34690792975', '_blank')}
            style={{
              padding: '9px 16px',
              borderRadius: 10,
              background: T.bgCard,
              border: `1px solid ${T.borderHi}`,
              color: T.text,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Soporte (Llamada o WhatsApp)
          </button>
          <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600 }}>+34 690 792 975</div>
        </div>
      </div>

      {/* ── Modal de Manual Detallado ── */}
      {manualActivo && (
        <ManualPanel
          content={manualActivo}
          isMobile={isMobile}
          onClose={() => setManualActivo(null)}
        />
      )}
    </div>
  );
}
