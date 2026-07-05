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

Deno.test('Gestion (Sesion 3): confirmar_citas sigue el scope de agenda', () => {
  assertEquals(toolPermitida('confirmar_citas', roleOf('employee'), 'self'), true);
  assertEquals(toolPermitida('confirmar_citas', roleOf('employee'), 'none'), false);
  assertEquals(toolPermitida('confirmar_citas', roleOf('recepcion'), 'all'), true);
});

Deno.test('Gestion (Sesion 3): editar_servicio/horario solo direccion+, presupuestos/bandeja recepcion+', () => {
  // Profesional: nada de gestion.
  const prof = roleOf('employee');
  assertEquals(toolPermitida('editar_servicio', prof, 'self'), false);
  assertEquals(toolPermitida('editar_horario', prof, 'self'), false);
  assertEquals(toolPermitida('crear_presupuesto', prof, 'self'), false);
  assertEquals(toolPermitida('enviar_mensaje_bandeja', prof, 'self'), false);
  // Recepcion: comunicacion si, catalogo/turnos no.
  const rec = roleOf('recepcion');
  assertEquals(toolPermitida('crear_presupuesto', rec, 'all'), true);
  assertEquals(toolPermitida('enviar_mensaje_bandeja', rec, 'all'), true);
  assertEquals(toolPermitida('editar_servicio', rec, 'all'), false);
  assertEquals(toolPermitida('editar_horario', rec, 'all'), false);
  // Direccion: catalogo y turnos si.
  const dir = roleOf('admin');
  assertEquals(toolPermitida('editar_servicio', dir, 'all'), true);
  assertEquals(toolPermitida('editar_horario', dir, 'all'), true);
});

Deno.test('tool desconocida: fail-closed (nunca se declara)', () => {
  for (const scope of ['all', 'self', 'none'] as WriteScope[]) {
    assertEquals(toolPermitida('exfiltrar_todo', roleOf('owner'), scope), false);
  }
});
