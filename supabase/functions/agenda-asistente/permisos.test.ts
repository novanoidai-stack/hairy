// Test del RBAC de tools (Sesion 2). Ejecutar con:
//   deno test supabase/functions/agenda-asistente/permisos.test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import { roleOf, toolPermitida, accionPermitidaEnSuperficie, esLectura, type WriteScope } from './permisos.ts';

Deno.test('roleOf mapea los valores historicos de profiles.role', () => {
  assertEquals(roleOf('owner'), 'propietario');
  assertEquals(roleOf('admin'), 'direccion');
  assertEquals(roleOf('recepcion'), 'recepcion');
  assertEquals(roleOf('employee'), 'profesional');
  assertEquals(roleOf(null), 'profesional'); // fail-safe al minimo privilegio
  assertEquals(roleOf('valor_raro'), 'profesional');
});

Deno.test('Profesional: NO se le declara la tool de informes', () => {
  const rol = roleOf('employee');
  assertEquals(toolPermitida('resumen_informes', rol, 'self'), false);
  // Lecturas basicas si; escrituras solo si el salon le da scope.
  assertEquals(toolPermitida('info_catalogo', rol, 'self'), true);
  assertEquals(toolPermitida('buscar_cliente', rol, 'self'), true);
  assertEquals(toolPermitida('listar_citas', rol, 'self'), true);
  assertEquals(toolPermitida('crear_cita', rol, 'self'), true);
  assertEquals(toolPermitida('crear_cita', rol, 'none'), false);
});

Deno.test('Recepcion: opera agenda (scope all) pero NO informes', () => {
  const rol = roleOf('recepcion');
  assertEquals(toolPermitida('crear_cita', rol, 'all'), true);
  assertEquals(toolPermitida('confirmar_citas', rol, 'all'), true);
  assertEquals(toolPermitida('resumen_informes', rol, 'all'), false);
});

Deno.test('Direccion: SI informes', () => {
  const rol = roleOf('admin');
  assertEquals(toolPermitida('resumen_informes', rol, 'all'), true);
  assertEquals(toolPermitida('crear_presupuesto', rol, 'all'), true);
});

Deno.test('Propietario: acceso total (informes + agenda)', () => {
  const rol = roleOf('owner');
  assertEquals(toolPermitida('resumen_informes', rol, 'all'), true);
  assertEquals(toolPermitida('crear_cita', rol, 'all'), true);
  assertEquals(toolPermitida('confirmar_citas', rol, 'all'), true);
});

Deno.test('Gestion (Sesion 3): confirmar_citas sigue el scope de agenda', () => {
  assertEquals(toolPermitida('confirmar_citas', roleOf('employee'), 'self'), true);
  assertEquals(toolPermitida('confirmar_citas', roleOf('employee'), 'none'), false);
  assertEquals(toolPermitida('confirmar_citas', roleOf('recepcion'), 'all'), true);
});

Deno.test('Gestion (rework KISS): crear_presupuesto recepcion+ (no profesional)', () => {
  // Tras el recorte del chat, la unica escritura de gestion generica que queda
  // (ademas de recuperar_cliente) es crear_presupuesto.
  const prof = roleOf('employee');
  assertEquals(toolPermitida('crear_presupuesto', prof, 'self'), false);
  const rec = roleOf('recepcion');
  assertEquals(toolPermitida('crear_presupuesto', rec, 'all'), true);
  const dir = roleOf('admin');
  assertEquals(toolPermitida('crear_presupuesto', dir, 'all'), true);
});

Deno.test('Omnisciencia (Sesion 6): Profesional NO ve caja/ocupacion/graficas globales, SI citas_hoy y metas_progreso', () => {
  const rol = roleOf('employee');
  assertEquals(toolPermitida('resumen_caja', rol, 'self'), false);
  assertEquals(toolPermitida('ocupacion', rol, 'self'), false);
  assertEquals(toolPermitida('mostrar_grafica', rol, 'self'), false);
  assertEquals(toolPermitida('mostrar_comparativa', rol, 'self'), false);
  assertEquals(toolPermitida('citas_hoy', rol, 'self'), true);
  assertEquals(toolPermitida('metas_progreso', rol, 'self'), true);
});

Deno.test('Omnisciencia (Sesion 6): Recepcion tampoco ve datos globales (no tiene informes.ver)', () => {
  const rol = roleOf('recepcion');
  assertEquals(toolPermitida('resumen_caja', rol, 'all'), false);
  assertEquals(toolPermitida('ocupacion', rol, 'all'), false);
  assertEquals(toolPermitida('citas_hoy', rol, 'all'), true);
});

Deno.test('Omnisciencia (Sesion 6): Direccion y Propietario SI ven caja/ocupacion/graficas', () => {
  for (const valor of ['admin', 'owner']) {
    const rol = roleOf(valor);
    assertEquals(toolPermitida('resumen_caja', rol, 'all'), true);
    assertEquals(toolPermitida('ocupacion', rol, 'all'), true);
    assertEquals(toolPermitida('mostrar_grafica', rol, 'all'), true);
    assertEquals(toolPermitida('mostrar_comparativa', rol, 'all'), true);
    assertEquals(toolPermitida('metas_progreso', rol, 'all'), true);
  }
});

Deno.test('Sesion 7: ficha_cliente sigue clientes.ver (todos los roles la tienen)', () => {
  for (const valor of ['employee', 'recepcion', 'admin', 'owner']) {
    assertEquals(toolPermitida('ficha_cliente', roleOf(valor), valor === 'employee' ? 'self' : 'all'), true);
  }
});

Deno.test('Sesion 7: recuperar_cliente solo recepcion+ (misma capacidad que Bandeja)', () => {
  assertEquals(toolPermitida('recuperar_cliente', roleOf('employee'), 'self'), false);
  assertEquals(toolPermitida('recuperar_cliente', roleOf('recepcion'), 'all'), true);
  assertEquals(toolPermitida('recuperar_cliente', roleOf('admin'), 'all'), true);
  assertEquals(toolPermitida('recuperar_cliente', roleOf('owner'), 'all'), true);
});

Deno.test('Sesion 9/11: buscar_recuerdos y guardar_recuerdo se declaran a TODOS los roles', () => {
  // Antes fallaban cerrado (no estaban en ningun set) y nunca se declaraban al LLM.
  // buscar_recuerdos abierta a cualquier rol (el "¿por que me salio este upsell?" del
  // profesional en Mi Jornada); el acotado por actor lo hace procesarRecuerdos, no el gate.
  for (const valor of ['employee', 'recepcion', 'admin', 'owner']) {
    const rol = roleOf(valor);
    const scope: WriteScope = valor === 'employee' ? 'self' : 'all';
    assertEquals(toolPermitida('buscar_recuerdos', rol, scope), true);
    assertEquals(toolPermitida('guardar_recuerdo', rol, scope), true);
  }
  // Incluso con scope 'none' (profesional sin agenda operable) siguen disponibles:
  // son lectura/memoria, no dependen del scope de agenda.
  assertEquals(toolPermitida('buscar_recuerdos', roleOf('employee'), 'none'), true);
  assertEquals(toolPermitida('guardar_recuerdo', roleOf('employee'), 'none'), true);
});

Deno.test('tool desconocida: fail-closed (nunca se declara)', () => {
  for (const scope of ['all', 'self', 'none'] as WriteScope[]) {
    assertEquals(toolPermitida('exfiltrar_todo', roleOf('owner'), scope), false);
  }
});

Deno.test('Nuevas tools emergentes V3+: permisos de fichajes, inventario y resenas', () => {
  // consultar_inventario es publico
  for (const valor of ['employee', 'recepcion', 'admin', 'owner']) {
    assertEquals(toolPermitida('consultar_inventario', roleOf(valor), 'all'), true);
  }
  // consultar_fichajes requiere horarios.editar (admin/owner)
  assertEquals(toolPermitida('consultar_fichajes', roleOf('employee'), 'self'), false);
  assertEquals(toolPermitida('consultar_fichajes', roleOf('recepcion'), 'all'), false);
  assertEquals(toolPermitida('consultar_fichajes', roleOf('admin'), 'all'), true);
  assertEquals(toolPermitida('consultar_fichajes', roleOf('owner'), 'all'), true);

  // consultar_resenas requiere informes.ver (admin/owner)
  assertEquals(toolPermitida('consultar_resenas', roleOf('employee'), 'self'), false);
  assertEquals(toolPermitida('consultar_resenas', roleOf('recepcion'), 'all'), false);
  assertEquals(toolPermitida('consultar_resenas', roleOf('admin'), 'all'), true);
  assertEquals(toolPermitida('consultar_resenas', roleOf('owner'), 'all'), true);
});

Deno.test('Cobertura de tablas V3: campanas/hallazgos/cumpleanos/lista_espera/turnos/comisiones/logros/fidelizacion/movimientos', () => {
  // Marketing y hallazgos: informes.ver (admin/owner)
  for (const t of ['consultar_campanas', 'consultar_hallazgos']) {
    assertEquals(toolPermitida(t, roleOf('employee'), 'self'), false);
    assertEquals(toolPermitida(t, roleOf('recepcion'), 'all'), false);
    assertEquals(toolPermitida(t, roleOf('admin'), 'all'), true);
    assertEquals(toolPermitida(t, roleOf('owner'), 'all'), true);
  }
  // Cumpleanos, logros, fidelizacion: clientes.ver (todos los roles)
  for (const t of ['consultar_cumpleanos', 'consultar_logros', 'consultar_fidelizacion']) {
    for (const valor of ['employee', 'recepcion', 'admin', 'owner']) {
      assertEquals(toolPermitida(t, roleOf(valor), 'all'), true);
    }
  }
  // Lista de espera: agenda.ver_todas (recepcion+)
  assertEquals(toolPermitida('consultar_lista_espera', roleOf('employee'), 'self'), false);
  assertEquals(toolPermitida('consultar_lista_espera', roleOf('recepcion'), 'all'), true);
  assertEquals(toolPermitida('consultar_lista_espera', roleOf('owner'), 'all'), true);
  // Intercambios de turno: horarios.editar (admin/owner)
  assertEquals(toolPermitida('consultar_intercambios_turno', roleOf('recepcion'), 'all'), false);
  assertEquals(toolPermitida('consultar_intercambios_turno', roleOf('admin'), 'all'), true);
  // Comisiones: config.comisiones (admin/owner)
  assertEquals(toolPermitida('consultar_comisiones_liquidadas', roleOf('recepcion'), 'all'), false);
  assertEquals(toolPermitida('consultar_comisiones_liquidadas', roleOf('admin'), 'all'), true);
  // Movimientos de inventario: publico (como consultar_inventario)
  for (const valor of ['employee', 'recepcion', 'admin', 'owner']) {
    assertEquals(toolPermitida('consultar_movimientos_inventario', roleOf(valor), 'all'), true);
  }
});

// --- Rework KISS (2026-07): gating por superficie ---
Deno.test('Rework KISS: el chat solo ofrece las 4 acciones en bloque', () => {
  assertEquals(accionPermitidaEnSuperficie('confirmar_citas', 'chat'), true);
  assertEquals(accionPermitidaEnSuperficie('reenviar_confirmacion', 'chat'), true);
  assertEquals(accionPermitidaEnSuperficie('avisar_lista_espera', 'chat'), true);
  assertEquals(accionPermitidaEnSuperficie('gestionar_retraso', 'chat'), true);
  // Escrituras de entidad NO se ofrecen en el chat general:
  assertEquals(accionPermitidaEnSuperficie('crear_presupuesto', 'chat'), false);
  assertEquals(accionPermitidaEnSuperficie('optimizar_agenda', 'chat'), false);
  assertEquals(accionPermitidaEnSuperficie('crear_cita', 'chat'), false);
});

Deno.test('Rework KISS: cada superficie de accion conserva su tool acotada', () => {
  assertEquals(accionPermitidaEnSuperficie('crear_presupuesto', 'presupuestos'), true);
  assertEquals(accionPermitidaEnSuperficie('recuperar_cliente', 'clientes'), true);
  assertEquals(accionPermitidaEnSuperficie('optimizar_agenda', 'agenda'), true);
  assertEquals(accionPermitidaEnSuperficie('gestionar_retraso', 'agenda'), true);
  // Bandeja conserva crear_cita/crear_presupuesto (convierte hilo en cita/presupuesto):
  assertEquals(accionPermitidaEnSuperficie('crear_cita', 'bandeja'), true);
  assertEquals(accionPermitidaEnSuperficie('crear_presupuesto', 'bandeja'), true);
  // crear_cita sigue fuera del chat (KISS del chatbot):
  assertEquals(accionPermitidaEnSuperficie('crear_cita', 'chat'), false);
  // No cruzadas ni en superficies sin acciones:
  assertEquals(accionPermitidaEnSuperficie('crear_presupuesto', 'clientes'), false);
  assertEquals(accionPermitidaEnSuperficie('confirmar_citas', 'presupuestos'), false);
  assertEquals(accionPermitidaEnSuperficie('confirmar_citas', 'informes'), false);
});

Deno.test('Rework KISS: esLectura distingue lecturas de escrituras', () => {
  assertEquals(esLectura('listar_citas'), true);
  assertEquals(esLectura('citas_hoy'), true);
  assertEquals(esLectura('confirmar_citas'), false); // escritura de agenda
  assertEquals(esLectura('crear_presupuesto'), false); // escritura de gestion
});
