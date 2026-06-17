import { MechaMark } from '@/components/ui/MechaMark';

// Pantalla de exito tras pagar la senal (success_url de Stripe). El webhook ya ha
// confirmado la cita en la BD de forma asincrona; aqui solo damos feedback al cliente.
const T = { border: 'rgba(40,30,24,0.10)', text: '#241a14', textSec: '#5c5249', primary: '#f4501e' };
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const ANIM = `
  @keyframes okRing { 0% { transform: scale(0.6); opacity: 0.55 } 100% { transform: scale(1.9); opacity: 0 } }
  @keyframes okFlicker { 0%,100% { transform: rotate(-1deg) scale(1) } 45% { transform: rotate(1.5deg) scale(1.05) } 70% { transform: rotate(-0.5deg) scale(0.99) } }
  .ok-flame { animation: okFlicker 3.4s ease-in-out infinite; transform-origin: 50% 80% }
  @media (prefers-reduced-motion: reduce) { .ok-flame { animation: none !important } }
`;

export default function PagoOkWeb() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #fdf6ee 0%, #f7ede1 60%, #f3e7d8 100%)', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIM }} />
      <div style={{ maxWidth: 380 }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <span style={{ position: 'absolute', width: 84, height: 84, borderRadius: '50%', background: 'rgba(244,80,30,0.10)', animation: 'okRing 1.8s ease-out infinite' }} />
          <span style={{ position: 'relative', display: 'inline-flex', width: 84, height: 84, borderRadius: '50%', background: '#fff', border: `1px solid ${T.border}`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(192,38,10,0.18)' }}>
            <span className="ok-flame"><MechaMark size={44} /></span>
          </span>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 36, color: T.text, lineHeight: 1.02, marginBottom: 10 }}>¡Pago recibido!</div>
        <div style={{ fontSize: 15.5, color: T.textSec, lineHeight: 1.5 }}>
          Tu señal está confirmada y tu cita queda reservada. Te esperamos. Puedes cerrar esta ventana.
        </div>
      </div>
    </div>
  );
}
