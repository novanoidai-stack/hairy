// Test del RBAC de tools (Sesion 2). Ejecutar con:
//   deno test supabase/functions/agenda-asistente/permisos.test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import { roleOf, toolPermitida, type WriteScope } from './permisos.ts';

Deno.test('roleOf mapea los valores historicos de profiles.role', () => {
  assertEquals(roleOf('owner'), 'propietario');
  assertEquals(roleOf('admin'), 'direccion');
  assertEquals(roleOf('recepcion'), 'recepcion');
  assertEquals(roleOf('employee'), 'profesional');
  assertEquals(roleOf(null), 'profesional'); // fail-safe al minimo privilegio
  assertEquals(roleOf('valor_raro'), 'profesional');
});

Deno.test('Profesional: NO se le declara la tool de informes ni cambiar_config', () => {
  const rol = roleOf('employee');
  assertEquals(toolPermitida('resumen_informes', rol, 'self'), false);
  assertEquals(toolPermitida('cambiar_config', rol, 'self'), false);
  // Lecturas basicas si; escrituras solo si el salon le da scope.
  assertEquals(toolPermitida('info_catalogo', rol, 'self'), true);
  assertEquals(toolPermitida('buscar_cliente', rol, 'self'), true);
  assertEquals(toolPermitida('listar_citas', rol, 'self'), true);
  assertEquals(toolPermitida('crear_cita', rol, 'self'), true);
  assertEquals(toolPermitida('crear_cita', rol, 'none'), false);
});

Deno.test('Recepcion: opera agenda (scope all) pero NO informes ni config', () => {
  const rol = roleOf('recepcion');
  assertEquals(toolPermitida('crear_cita', rol, 'all'), true);
  assertEquals(toolPermitida('cancelar_cita', rol, 'all'), true);
  assertEquals(toolPermitida('resumen_informes', rol, 'all'), false);
  assertEquals(toolPermitida('cambiar_config', rol, 'all'), false);
});

Deno.test('Direccion: SI informes, NO cambiar_config', () => {
  const rol = roleOf('admin');
  assertEquals(toolPermitida('resumen_informes', rol, 'all'), true);
  assertEquals(toolPermitida('cambiar_config', rol, 'all'), false);
});

Deno.test('Propietario: acceso total (informes + config + agenda)', () => {
  const rol = roleOf('owner');
  assertEquals(toolPermitida('resumen_informes', rol, 'all'), true);
  assertEquals(toolPermitida('cambiar_config', rol, 'all'), true);
  assertEquals(toolPermitida('bloquear_hueco', rol, 'all'), true);
});

Deno.test('tool desconocida: fail-closed (nunca se declara)', () => {
  for (const scope of ['all', 'self', 'none'] as WriteScope[]) {
    assertEquals(toolPermitida('exfiltrar_todo', roleOf('owner'), scope), false);
  }
});
