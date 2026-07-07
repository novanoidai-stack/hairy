import { ejecutarAccion, type AccionPropuesta } from './chispaOps';
import { supabase } from '@/lib/supabase';

// Mock simple para tests de lógica sin red
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: { ok: true }, error: null }),
  }
}));

describe('ChispaOps Edge Cases', () => {
  const MOCK_USER_ID = 'user-123';
  const MOCK_NEGOCIO_ID = 'negocio-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('crear_cita', () => {
    it('debería rechazar citas donde el inicio es igual o posterior al fin', async () => {
      const accion: AccionPropuesta = {
        tipo: 'crear_cita',
        negocio_id: MOCK_NEGOCIO_ID,
        profesional_id: 'prof-1',
        profesional_nombre: 'Ana',
        servicio_id: 'serv-1',
        servicio_nombre: 'Corte',
        cliente_id: 'cli-1',
        cliente_nombre: 'Laura',
        inicio: '2026-07-10T15:00:00Z',
        fin: '2026-07-10T14:30:00Z', // Inverso!
        fin_activa: '2026-07-10T14:30:00Z',
        fin_espera: '2026-07-10T14:30:00Z',
        resumen: 'Corte para Laura',
        solapa: false,
      };

      const res = await ejecutarAccion(accion, MOCK_USER_ID);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/El inicio no puede ser posterior al fin/i);
      }
    });
  });

  describe('crear_presupuesto', () => {
    it('debería rechazar presupuestos con precios o cantidades negativas (anti-fraude / alucinación)', async () => {
      const accion: AccionPropuesta = {
        tipo: 'crear_presupuesto',
        negocio_id: MOCK_NEGOCIO_ID,
        cliente_id: 'cli-1',
        cliente_nombre: 'Pedro',
        titulo: 'Presupuesto Boda',
        lineas: [
          { nombre: 'Corte', precio_cents: 2000, cantidad: 1 },
          { nombre: 'Descuento Alucinado', precio_cents: -5000, cantidad: 1 } // Negativo!
        ],
        total_cents: -3000,
        resumen: 'Boda con descuento extremo'
      };

      const res = await ejecutarAccion(accion, MOCK_USER_ID);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/No se permiten precios o cantidades negativas/i);
      }
    });
  });

  describe('confirmar_citas', () => {
    it('debería fallar si la lista de citas está vacía', async () => {
      const accion: AccionPropuesta = {
        tipo: 'confirmar_citas',
        negocio_id: MOCK_NEGOCIO_ID,
        citas: [],
        resumen: 'Confirmar todas',
      };
      const res = await ejecutarAccion(accion, MOCK_USER_ID);
      expect(res.ok).toBe(false);
    });
  });
});
