import React from 'react';
import { Platform } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
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
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GlobalErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  handleContact = () => {
    const subject = encodeURIComponent('Error en Mecha – la app no carga');
    const body = encodeURIComponent(
      `Hola equipo,\n\nLa aplicación ha dejado de funcionar.\n\nError: ${this.state.error?.message || 'desconocido'}\n\nNavegador: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}\nFecha: ${new Date().toLocaleString('es-ES')}\n\nGracias.`
    );
    const mailto = `mailto:contacto@mechaa.es?subject=${subject}&body=${body}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = mailto;
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
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
            background: 'linear-gradient(135deg, #f4501e 0%, #e0340e 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32,
            boxShadow: '0 12px 40px rgba(244,80,30,0.25)',
          }}
        >
          <span style={{ fontSize: 40 }}>🔧</span>
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
          >
            ✉️ Alertar al equipo
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
