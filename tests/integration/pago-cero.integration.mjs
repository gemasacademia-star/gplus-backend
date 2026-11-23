// G-15: prueba de integración del beneficio / descuento del 100% contra una base REAL.
//
// ⚠️ Solo corre contra una COPIA desechable de la base local, nunca contra la base de
// trabajo ni producción. Escribe datos de verdad (inscripciones, pagos, clases).
//
//   docker exec gema_academy_db psql -U postgres -d postgres \
//     -c "CREATE DATABASE gema_g15_test TEMPLATE gema_academy_db"
//   DATABASE_URL=postgresql://postgres:<clave>@localhost:5433/gema_g15_test \
//     node --test tests/integration/pago-cero.integration.mjs
//   docker exec gema_academy_db psql -U postgres -d postgres -c "DROP DATABASE gema_g15_test"
//
// No entra en `npm test` (no se llama *.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';

import { prisma } from '../../src/config/database.config.js';
import { inscripcionService } from '../../src/features/inscripciones/inscripcion.service.js';
import { inscripcionCronService } from '../../src/features/inscripciones/inscripcion-cron.service.js';
import { pagosService } from '../../src/features/pagos/pagos.service.js';
import { DescuentosAplicadosService } from '../../src/features/descuentos_aplicados/descuentos_aplicados.service.js';
import { CODIGO_PAGO_CERO } from '../../src/features/pagos/utils/pago-cero.util.js';

const BASE_PERMITIDA = 'gema_g15_test';
const ADMIN_ID = 143; // administrador existente en el backup
const TIPO_MES = 7; // beneficio MES (S/ 180)

const [{ db }] = await prisma.$queryRaw`SELECT current_database() AS db`;
if (db !== BASE_PERMITIDA) {
  throw new Error(`Base conectada "${db}": esta prueba solo corre contra ${BASE_PERMITIDA}.`);
}

// Alumnos sin nada en curso, sin deudas abiertas y sin beneficios en cola.
const alumnosLibres = await prisma.$queryRaw`
  SELECT a.usuario_id AS id FROM alumnos a JOIN usuarios u ON u.id = a.usuario_id
  WHERE u.activo
    AND NOT EXISTS (SELECT 1 FROM inscripciones i WHERE i.alumno_id = a.usuario_id
                    AND i.estado IN ('ACTIVO','PENDIENTE_PAGO','POR_VALIDAR'))
    AND NOT EXISTS (SELECT 1 FROM cuentas_por_cobrar c WHERE c.alumno_id = a.usuario_id
                    AND c.estado IN ('PENDIENTE','PARCIAL','POR_VALIDAR'))
    AND NOT EXISTS (SELECT 1 FROM beneficios_pendientes b WHERE b.alumno_id = a.usuario_id AND NOT b.usado)
  ORDER BY a.usuario_id LIMIT 3`;
assert.equal(alumnosLibres.length, 3, 'hacen falta 3 alumnos libres en la copia');

// Dos horarios activos con cupo, para un plan de 2 clases por semana.
const horarios = await prisma.$queryRaw`
  SELECT h.id FROM horarios_clases h
  WHERE h.activo AND h.capacidad_max > (SELECT count(*) FROM inscripciones i
                                        WHERE i.horario_id = h.id AND i.estado IN ('ACTIVO','POR_VALIDAR','PENDIENTE_PAGO')) + 3
  ORDER BY h.id LIMIT 2`;
const horario_ids = horarios.map((h) => h.id);
// Siempre con fecha: sin ella inscribirPaquete falla con 'Invalid time value' (dayjs.tz(TZ_LIMA), error previo).
const fecha_inicio_electiva = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // hoy en Lima
assert.equal(horario_ids.length, 2, 'hacen falta 2 horarios con cupo');

const asignarMes = (alumno_id) =>
  prisma.beneficios_pendientes.create({
    data: { alumno_id, tipo_beneficio_id: TIPO_MES, asignado_por: ADMIN_ID, motivo: 'Prueba G-15', usado: false },
  });
const inscripcionesDe = (cuenta_id) =>
  prisma.inscripciones_deudas_link
    .findMany({ where: { cuenta_id }, select: { inscripciones: { select: { id: true, estado: true } } } })
    .then((ls) => ls.map((l) => l.inscripciones));
const pagoCeroDe = (cuenta_id) => prisma.pagos.findFirst({ where: { cuenta_id, codigo_operacion: CODIGO_PAGO_CERO } });

test('beneficio MES: la inscripción llega a POR_VALIDAR, el cron de zombies no la borra y aprobar la deja ACTIVO con clases', async () => {
  const alumno_id = alumnosLibres[0].id;
  const beneficio = await asignarMes(alumno_id);

  const r = await inscripcionService.inscribirPaquete({ alumno_id, horario_ids, fecha_inicio_electiva });
  assert.equal(r.estado, 'POR_VALIDAR');
  assert.equal(r.total_a_pagar, 0);

  const cuenta = await prisma.cuentas_por_cobrar.findUnique({ where: { id: r.cuenta_id } });
  assert.equal(Number(cuenta.monto_final), 0);
  assert.equal(cuenta.estado, 'POR_VALIDAR');
  const pago = await pagoCeroDe(r.cuenta_id);
  assert.equal(pago.id, r.pago_cero_id);
  assert.equal(Number(pago.monto_pagado), 0);
  assert.equal(pago.estado_validacion, 'PENDIENTE');
  const metodo = await prisma.metodos_pago.findUnique({ where: { id: pago.metodo_pago_id } });
  assert.equal(metodo.nombre, 'EFECTIVO');
  assert.deepEqual((await inscripcionesDe(r.cuenta_id)).map((i) => i.estado), ['POR_VALIDAR', 'POR_VALIDAR']);
  assert.equal((await prisma.beneficios_pendientes.findUnique({ where: { id: beneficio.id } })).usado, true);

  // Cron de zombies con la reserva "vieja" (3 h): no debe tocar POR_VALIDAR.
  const ids = r.inscripciones.map((i) => i.id);
  await prisma.inscripciones.updateMany({ where: { id: { in: ids } }, data: { creado_en: new Date(Date.now() - 3 * 3600e3) } });
  await inscripcionCronService.limpiarReservasZombies();
  assert.equal(await prisma.inscripciones.count({ where: { id: { in: ids } } }), 2, 'el cron borró la reserva');
  assert.ok(await prisma.cuentas_por_cobrar.findUnique({ where: { id: r.cuenta_id } }));

  // Aprobación del admin tal como la hace AdminPaymentValidation.jsx: primer pago ->
  // PATCH /inscripciones/paquete/fecha/:cuentaId, luego validar con monto confirmado 0.
  await inscripcionService.actualizarFechaInicioPorPago(r.cuenta_id, fecha_inicio_electiva);
  await pagosService.validarPago({ pago_id: pago.id, accion: 'APROBAR', usuario_admin_id: ADMIN_ID, notas: '', monto_real_confirmado: 0 });
  assert.deepEqual((await inscripcionesDe(r.cuenta_id)).map((i) => i.estado), ['ACTIVO', 'ACTIVO']);
  assert.ok((await prisma.registros_asistencia.count({ where: { inscripcion_id: { in: ids } } })) > 0, 'no se generaron clases');
  assert.equal((await prisma.cuentas_por_cobrar.findUnique({ where: { id: r.cuenta_id } })).estado, 'PAGADA');
  assert.equal((await prisma.pagos.findUnique({ where: { id: pago.id } })).estado_validacion, 'APROBADO');
});

test('beneficio MES: rechazar el pago de S/0 devuelve el beneficio', async () => {
  const alumno_id = alumnosLibres[1].id;
  const beneficio = await asignarMes(alumno_id);

  const r = await inscripcionService.inscribirPaquete({ alumno_id, horario_ids, fecha_inicio_electiva });
  assert.equal(r.estado, 'POR_VALIDAR');
  const ids = r.inscripciones.map((i) => i.id);

  await pagosService.validarPago({ pago_id: r.pago_cero_id, accion: 'RECHAZAR', usuario_admin_id: ADMIN_ID, notas: 'prueba' });

  assert.equal((await prisma.beneficios_pendientes.findUnique({ where: { id: beneficio.id } })).usado, false);
  assert.equal(await prisma.descuentos_aplicados.count({ where: { cuenta_id: r.cuenta_id } }), 0);
  assert.equal(await prisma.inscripciones.count({ where: { id: { in: ids } } }), 0);
  assert.equal((await prisma.cuentas_por_cobrar.findUnique({ where: { id: r.cuenta_id } })).estado, 'RECHAZADO');
});

test('descuento manual del 100%: lleva a validación, revertirlo lo deshace y aprobarlo activa', async () => {
  const alumno_id = alumnosLibres[2].id;
  const r = await inscripcionService.inscribirPaquete({ alumno_id, horario_ids, fecha_inicio_electiva });
  assert.equal(r.estado, 'PENDIENTE_PAGO');
  assert.equal(r.pago_cero_id, null);
  const ids = r.inscripciones.map((i) => i.id);

  const aplicado = await DescuentosAplicadosService.aplicar({ cuenta_id: r.cuenta_id, tipo_beneficio_id: TIPO_MES, admin_id: ADMIN_ID, motivo: 'Prueba G-15' });
  assert.ok(aplicado.pago_cero_id);
  assert.equal((await prisma.cuentas_por_cobrar.findUnique({ where: { id: r.cuenta_id } })).estado, 'POR_VALIDAR');
  assert.deepEqual((await inscripcionesDe(r.cuenta_id)).map((i) => i.estado), ['POR_VALIDAR', 'POR_VALIDAR']);

  // Revertir el descuento: vuelve a tener saldo, el pago de S/0 desaparece.
  await DescuentosAplicadosService.eliminar(aplicado.descuento.id, true);
  const cuentaRevertida = await prisma.cuentas_por_cobrar.findUnique({ where: { id: r.cuenta_id } });
  assert.equal(cuentaRevertida.estado, 'PENDIENTE');
  assert.ok(Number(cuentaRevertida.monto_final) > 0);
  assert.equal(await pagoCeroDe(r.cuenta_id), null);
  assert.deepEqual((await inscripcionesDe(r.cuenta_id)).map((i) => i.estado), ['PENDIENTE_PAGO', 'PENDIENTE_PAGO']);

  // Aplicarlo otra vez y aprobar: queda ACTIVO con clases.
  const otraVez = await DescuentosAplicadosService.aplicar({ cuenta_id: r.cuenta_id, tipo_beneficio_id: TIPO_MES, admin_id: ADMIN_ID, motivo: 'Prueba G-15' });
  await pagosService.validarPago({ pago_id: otraVez.pago_cero_id, accion: 'APROBAR', usuario_admin_id: ADMIN_ID, notas: '', monto_real_confirmado: 0 });
  assert.deepEqual((await inscripcionesDe(r.cuenta_id)).map((i) => i.estado), ['ACTIVO', 'ACTIVO']);
  assert.ok((await prisma.registros_asistencia.count({ where: { inscripcion_id: { in: ids } } })) > 0);
});

test.after(() => prisma.$disconnect());
