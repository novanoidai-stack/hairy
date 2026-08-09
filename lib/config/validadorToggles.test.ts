import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validarConsistenciaConfig, type NegocioConfigPayload } from './validadorToggles.ts';

Deno.test('configuracion coherente devuelve 0 advertencias', () => {
  const cfg: NegocioConfigPayload = {
    listaEsperaMatchingActivo: true,
    listaEsperaVentanaMin: 30,
    listaEsperaMaxBloqueoHoras: 2,
    depositoExigirClientesRiesgo: true,
    depositoPorcentajeDefecto: 30,
    retrasoAvisoAutomatico: true,
    retrasoUmbralMinutos: 10,
  };
  const res = validarConsistenciaConfig(cfg);
  assertEquals(res.coherente, true);
  assertEquals(res.advertencias.length, 0);
});

Deno.test('matching activo sin ventana suficiente reporta advertencia', () => {
  const cfg: NegocioConfigPayload = {
    listaEsperaMatchingActivo: true,
    listaEsperaVentanaMin: 2, // Incoherente: 2 minutos es inviable para responder WhatsApp
  };
  const res = validarConsistenciaConfig(cfg);
  assertEquals(res.coherente, false);
  assertEquals(res.advertencias.length >= 1, true);
});
