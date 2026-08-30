// Tests para el motor de fases múltiples (Spec 1)
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  construirFasesDesdePlantilla,
  calcularMarcasResumen,
  desplazarFases,
  recalcularFasesDesdeOrden,
  extraerVentanasFases,
  type FasePlantilla,
} from './citaFases.ts';

describe('citaFases: múltiples fases y reposos asíncronos', () => {
  it('construye la secuencia completa de fases para un balayage con 2 reposos', () => {
    const plantilla: FasePlantilla[] = [
      { tipo: 'activa', min: 45, etiqueta: 'Aplicación decoloración' },
      { tipo: 'reposo', min: 40, etiqueta: 'Reposo aclarado' },
      { tipo: 'transicion', min: 10, etiqueta: 'Lavado', recurso_tipo: 'lavacabezas' },
      { tipo: 'activa', min: 15, etiqueta: 'Matiz' },
      { tipo: 'reposo', min: 10, etiqueta: 'Reposo matiz' },
      { tipo: 'activa', min: 35, etiqueta: 'Secado y peinado' },
    ];

    const inicio = new Date('2026-09-01T10:00:00.000Z');
    const fases = construirFasesDesdePlantilla(inicio, plantilla, 'prof-1');

    expect(fases.length).toBe(6);
    expect(fases[0].orden).toBe(1);
    expect(fases[0].tipo).toBe('activa');
    expect(fases[0].inicio).toBe('2026-09-01T10:00:00.000Z');
    expect(fases[0].fin).toBe('2026-09-01T10:45:00.000Z');

    // Reposo 1
    expect(fases[1].orden).toBe(2);
    expect(fases[1].tipo).toBe('reposo');
    expect(fases[1].inicio).toBe('2026-09-01T10:45:00.000Z');
    expect(fases[1].fin).toBe('2026-09-01T11:25:00.000Z');

    // Transición
    expect(fases[2].orden).toBe(3);
    expect(fases[2].tipo).toBe('transicion');
    expect(fases[2].recurso_tipo).toBe('lavacabezas');
    expect(fases[2].inicio).toBe('2026-09-01T11:25:00.000Z');
    expect(fases[2].fin).toBe('2026-09-01T11:35:00.000Z');

    // Reposo 2
    expect(fases[4].orden).toBe(5);
    expect(fases[4].tipo).toBe('reposo');
    expect(fases[4].inicio).toBe('2026-09-01T11:50:00.000Z');
    expect(fases[4].fin).toBe('2026-09-01T12:00:00.000Z');

    // Fin total (10:00 + 45 + 40 + 10 + 15 + 10 + 35 = 155 min -> 12:35)
    expect(fases[5].fin).toBe('2026-09-01T12:35:00.000Z');
  });

  it('calcula las marcas de resumen clásicas sin perder compatibilidad', () => {
    const plantilla: FasePlantilla[] = [
      { tipo: 'activa', min: 30, etiqueta: 'Tinte' },
      { tipo: 'reposo', min: 35, etiqueta: 'Exposición' },
      { tipo: 'activa', min: 20, etiqueta: 'Lavado y peinado' },
    ];
    const inicio = new Date('2026-09-01T09:00:00.000Z');
    const fases = construirFasesDesdePlantilla(inicio, plantilla);
    const resumen = calcularMarcasResumen(fases);

    expect(resumen.inicio).toBe('2026-09-01T09:00:00.000Z');
    expect(resumen.fin_activa).toBe('2026-09-01T09:30:00.000Z');
    expect(resumen.fin_espera).toBe('2026-09-01T10:05:00.000Z');
    expect(resumen.fin).toBe('2026-09-01T10:25:00.000Z');
  });

  it('desplaza todas las fases sincrónicamente al arrastrar la cita en agenda', () => {
    const plantilla: FasePlantilla[] = [
      { tipo: 'activa', min: 30 },
      { tipo: 'reposo', min: 30 },
    ];
    const inicio = new Date('2026-09-01T10:00:00.000Z');
    const fases = construirFasesDesdePlantilla(inicio, plantilla);

    const deltaMs = 30 * 60 * 1000; // +30 min
    const desplazadas = desplazarFases(fases, deltaMs);

    expect(desplazadas[0].inicio).toBe('2026-09-01T10:30:00.000Z');
    expect(desplazadas[0].fin).toBe('2026-09-01T11:00:00.000Z');
    expect(desplazadas[1].inicio).toBe('2026-09-01T11:00:00.000Z');
    expect(desplazadas[1].fin).toBe('2026-09-01T11:30:00.000Z');
  });

  it('modificar la duración de un reposo desplaza solo las fases siguientes sin mover el inicio', () => {
    const plantilla: FasePlantilla[] = [
      { tipo: 'activa', min: 40 }, // 10:00 - 10:40
      { tipo: 'reposo', min: 30 }, // 10:40 - 11:10 -> se alarga a 40 min (10:40 - 11:20)
      { tipo: 'activa', min: 20 }, // 11:10 - 11:30 -> debe pasar a 11:20 - 11:40
    ];
    const inicio = new Date('2026-09-01T10:00:00.000Z');
    const fases = construirFasesDesdePlantilla(inicio, plantilla);

    // Alargar reposo (orden 2) a 40 min (+10 min)
    const recalculo = recalcularFasesDesdeOrden(fases, 2, 40);

    // Fase 1 permanece intacta
    expect(recalculo[0].inicio).toBe('2026-09-01T10:00:00.000Z');
    expect(recalculo[0].fin).toBe('2026-09-01T10:40:00.000Z');

    // Fase 2 tiene la nueva duración
    expect(recalculo[1].inicio).toBe('2026-09-01T10:40:00.000Z');
    expect(recalculo[1].fin).toBe('2026-09-01T11:20:00.000Z');

    // Fase 3 se desplaza a partir de las 11:20
    expect(recalculo[2].inicio).toBe('2026-09-01T11:20:00.000Z');
    expect(recalculo[2].fin).toBe('2026-09-01T11:40:00.000Z');
  });

  it('extrae correctamente las ventanas activas y los reposos múltiples', () => {
    const plantilla: FasePlantilla[] = [
      { tipo: 'activa', min: 45 },
      { tipo: 'reposo', min: 30 },
      { tipo: 'transicion', min: 15 },
      { tipo: 'reposo', min: 20 },
      { tipo: 'activa', min: 30 },
    ];
    const inicio = new Date('2026-09-01T10:00:00.000Z');
    const fases = construirFasesDesdePlantilla(inicio, plantilla);
    const { activas, reposos } = extraerVentanasFases(fases);

    expect(activas.length).toBe(3); // 2 activas + 1 transición (todas ocupan al profesional)
    expect(reposos.length).toBe(2); // 2 reposos donde el profesional está libre
  });
});
