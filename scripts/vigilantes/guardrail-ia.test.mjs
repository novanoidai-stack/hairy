// Tests para el guardrail de la IA

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import guardrailIA, { validarDiagnosticoIA } from './guardrail-ia.mjs';

describe('guardrail-ia', () => {
  it('se declara con nombre y ámbito seguridad', () => {
    assert.equal(guardrailIA.nombre, 'guardrail-ia');
    assert.equal(guardrailIA.ambito, 'seguridad');
    assert.equal(typeof guardrailIA.ejecutar, 'function');
  });

  it('detecta una alucinación de archivo inexistente', () => {
    const diagAlucinado = {
      fichero: 'lib/seguridad/archivo_inventado_por_ia.ts',
      linea: 10,
      causa_raiz: 'Fallo de autenticación',
    };
    const res = validarDiagnosticoIA(diagAlucinado);
    assert.equal(res.valido, false);
    assert.ok(res.motivos.some((m) => m.includes('Alucinación de archivo')));
  });

  it('detecta líneas fuera de rango en archivos reales', () => {
    const diagLineaLoca = {
      fichero: 'package.json',
      linea: 99999,
      causa_raiz: 'Dependencia rota',
    };
    const res = validarDiagnosticoIA(diagLineaLoca);
    assert.equal(res.valido, false);
    assert.ok(res.motivos.some((m) => m.includes('Línea fuera de rango')));
  });

  it('bloquea diagnósticos que contengan posibles claves o tokens secretos', () => {
    const secretoSimulado = ['sb', 'secret', 'abcdef123456789012345678'].join('_');
    const diagConSecreto = {
      fichero: 'package.json',
      linea: 1,
      causa_raiz: `Usa la clave ${secretoSimulado} para probar`,
    };
    const res = validarDiagnosticoIA(diagConSecreto);
    assert.equal(res.valido, false);
    assert.ok(res.motivos.some((m) => m.includes('secretos o credenciales')));
  });

  it('acepta diagnósticos válidos con archivos existentes', () => {
    const diagValido = {
      fichero: 'package.json',
      linea: 2,
      causa_raiz: 'Actualizar script de test',
      prompt_correccion: '{\n  "test": "node --test"\n}',
    };
    const res = validarDiagnosticoIA(diagValido);
    assert.equal(res.valido, true);
    assert.equal(res.motivos.length, 0);
  });
});
