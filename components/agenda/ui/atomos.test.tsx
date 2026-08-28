import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, Pill, SummaryCell } from './atomos.web';

// Primeras pruebas de COMPONENTE del repo.
//
// Hasta ahora solo habia dos suites y entre las dos quedaba un hueco: Deno prueba
// logica pura (no monta React) y Playwright monta un navegador entero (~7 min).
// Comprobar que un componente pinta lo que debe no necesita ninguna de las dos.
//
// Se empieza por los atomos porque son lo que se acaba de extraer del monolito:
// si la mudanza rompio algo, es aqui donde se ve, y en segundos.

describe('Avatar', () => {
  it('saca las iniciales del nombre', () => {
    render(<Avatar name="Carmen Ruiz" size={32} />);
    expect(screen.getByText('CR')).toBeInTheDocument();
  });

  it('se queda con dos iniciales aunque el nombre traiga mas palabras', () => {
    render(<Avatar name="Maria del Carmen Ruiz Lopez" size={32} />);
    expect(screen.getByText('MD')).toBeInTheDocument();
  });

  it('sin nombre no revienta: pinta un interrogante', () => {
    // Es el caso real de una cita sin clienta asignada. Antes de tener esta
    // prueba, `name.split` sobre undefined tiraba el render entero.
    render(<Avatar name={undefined} size={32} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('el color se deriva del nombre y es estable', () => {
    // Misma clienta, mismo color siempre: si el color cambiara entre renders,
    // la agenda parpadearia de color en cada actualizacion.
    const { container: a } = render(<Avatar name="Carmen Ruiz" size={32} />);
    const { container: b } = render(<Avatar name="Carmen Ruiz" size={32} />);
    const color = (el: HTMLElement) => (el.firstChild as HTMLElement).style.color;
    expect(color(a)).toBe(color(b));
    expect(color(a)).not.toBe('');
  });
});

describe('Pill', () => {
  it('pinta su contenido', () => {
    render(<Pill color="#f4501e" soft="#fee">Confirmada</Pill>);
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
  });
});

describe('SummaryCell', () => {
  it('muestra etiqueta y valor', () => {
    render(<SummaryCell label="Total" value="16,00 €" color="#111" />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('16,00 €')).toBeInTheDocument();
  });
});
