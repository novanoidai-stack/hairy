import React from 'react';
import { Platform } from 'react-native';
import { reportarError, notificarErrorSoporte } from '@/lib/reportarError';
import { rescatarSiChunkCaducado } from '@/lib/chunkCaducado';
import { MechaMark } from '@/components/ui/MechaMark';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  enviandoCorreo: boolean;
  correoEnviado: boolean;
}

/**
 * Global Error Boundary – catches any unhandled React error and shows
 * a branded "estamos trabajando para arreglarlo" screen instead of a
 * white blank page. Includes a mailto link to contacto@mechaa.es so
 * the user can alert the team instantly.
 */
export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, enviandoCorreo: false, correoEnviado: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, enviandoCorreo: false, correoEnviado: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Pantalla que no llega porque su trozo de codigo es de un build anterior:
    // no es un fallo del producto, se recarga y ya. Ni pantalla de error ni
    // correo a soporte por algo que se arregla solo.
    if (rescatarSiChunkCaducado(error)) return;
    console.error('[GlobalErrorBoundary]', error, info.componentStack);
    // Y ademas se manda, que si no lo de abajo ("nuestro equipo ya esta al
    // tanto") era mentira: el error se quedaba en la consola de su navegador.
    reportarError(error, { pila: info.componentStack ?? error.stack ?? undefined });
    // "Y siguiente se envia automaticamente con cualquier error" -> Se envía el correo en background
    notificarErrorSoporte(error, info.componentStack ?? error.stack ?? undefined).catch(() => {});
  }

  handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  handleContact = async () => {
    if (this.state.enviandoCorreo || this.state.correoEnviado) return;
    this.setState({ enviandoCorreo: true });
    
    try {
      await notificarErrorSoporte(this.state.error, this.state.error?.stack);
      this.setState({ enviandoCorreo: false, correoEnviado: true });
      if (typeof window !== 'undefined') {
        alert('¡Reporte enviado! Nuestro equipo lo revisará lo antes posible.');
      }
    } catch (err) {
      this.setState({ enviandoCorreo: false });
      // Fallback
      if (typeof window !== 'undefined') {
        const subject = encodeURIComponent('Error en Mecha – la app no carga');
        const body = encodeURIComponent(`Error: ${this.state.error?.message || 'desconocido'}`);
        window.location.href = `mailto:contacto@mechaa.es?subject=${subject}&body=${body}`;
      }
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: 'calc(100vh / var(--mecha-zoom, 1))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #fffdfb 0%, #f6f1ea 100%)',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          padding: 32,
          textAlign: 'center',
        }}
      >
        {/* Logo / Icon */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: 'linear-gradient(135deg, rgba(244,80,30,0.12) 0%, rgba(224,52,14,0.06) 100%)',
            border: '1px solid rgba(244,80,30,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            boxShadow: '0 12px 40px rgba(244,80,30,0.15)',
          }}
        >
          <MechaMark size={48} />
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, marginBottom: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#1c1814', letterSpacing: -0.4 }}>Mecha</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#f4501e' }}>.</span>
        </div>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#1c1814',
            margin: '0 0 12px 0',
            letterSpacing: -0.5,
          }}
        >
          Estamos trabajando para arreglarlo
        </h1>

        <p
          style={{
            fontSize: 16,
            color: '#6b5e52',
            maxWidth: 480,
            lineHeight: 1.6,
            margin: '0 0 32px 0',
          }}
        >
          Ha ocurrido un error inesperado. Nuestro equipo ya está al tanto.
          Puedes intentar recargar la página o avisarnos directamente.
        </p>

        {/* Error detail (collapsible, subtle) */}
        {this.state.error && (
          <details
            style={{
              marginBottom: 32,
              maxWidth: 500,
              width: '100%',
              textAlign: 'left',
              background: 'rgba(244,80,30,0.06)',
              borderRadius: 12,
              padding: '12px 16px',
              border: '1px solid rgba(244,80,30,0.15)',
            }}
          >
            <summary
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#a0522d',
                cursor: 'pointer',
              }}
            >
              Detalles técnicos
            </summary>
            <pre
              style={{
                fontSize: 11,
                color: '#6b5e52',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              {this.state.error.message}
            </pre>
          </details>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Reload button */}
          <button
            onClick={this.handleReload}
            style={{
              padding: '14px 32px',
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              background: 'linear-gradient(135deg, #f4501e 0%, #e0340e 100%)',
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(244,80,30,0.3)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.transform = 'translateY(-2px)';
              (e.target as HTMLElement).style.boxShadow = '0 8px 24px rgba(244,80,30,0.4)';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.transform = 'translateY(0)';
              (e.target as HTMLElement).style.boxShadow = '0 4px 16px rgba(244,80,30,0.3)';
            }}
          >
            Recargar página
          </button>

          {/* Contact button */}
          <button
            onClick={this.handleContact}
            style={{
              padding: '14px 32px',
              fontSize: 15,
              fontWeight: 700,
              color: '#f4501e',
              background: 'rgba(244,80,30,0.08)',
              border: '2px solid rgba(244,80,30,0.2)',
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'transform 0.2s, background 0.2s',
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.transform = 'translateY(-2px)';
              (e.target as HTMLElement).style.background = 'rgba(244,80,30,0.14)';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.transform = 'translateY(0)';
              (e.target as HTMLElement).style.background = 'rgba(244,80,30,0.08)';
            }}
            disabled={this.state.enviandoCorreo || this.state.correoEnviado}
          >
            {this.state.enviandoCorreo ? 'Enviando...' : (this.state.correoEnviado ? '✅ Reporte enviado' : '✉️ Alertar al equipo')}
          </button>
        </div>

        <p
          style={{
            fontSize: 12,
            color: '#a09890',
            marginTop: 24,
          }}
        >
          contacto@mechaa.es
        </p>
      </div>
    );
  }
}
