import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enviarAValidacionSiMontoCero,
  deshacerPagoCeroPendiente,
  esPagoCero,
  CODIGO_PAGO_CERO,
} from '../src/features/pagos/utils/pago-cero.util.js';

// BD mínima en memoria: solo lo que tocan los helpers de G-15.
const crearTx = ({ monto = 0, estados = ['PENDIENTE_PAGO', 'PENDIENTE_PAGO'], pagos = [], metodos } = {}) => {
  const db = {
    cuenta: { id: 10, monto_final: monto, estado: monto <= 0.01 ? 'PAGADA' : 'PENDIENTE' },
    inscripciones: estados.map((estado, i) => ({ id: 100 + i, estado })),
    pagos: [...pagos],
    metodos: metodos ?? [{ id: 1, nombre: 'YAPE' }, { id: 4, nombre: 'EFECTIVO' }],
  };
  const enIds = (where) => db.inscripciones.filter((i) => where.id.in.includes(i.id) && i.estado === where.estado);
  const coincide = (p, w) => Object.entries(w).every(([k, v]) => p[k] === v);
  db.tx = {
    cuentas_por_cobrar: {
      findUnique: async () => db.cuenta,
      update: async ({ data }) => Object.assign(db.cuenta, data),
    },
    inscripciones_deudas_link: {
      findMany: async () => db.inscripciones.map((i) => ({ inscripcion_id: i.id })),
    },
    inscripciones: {
      count: async ({ where }) => enIds(where).length,
      updateMany: async ({ where, data }) => {
        const filas = enIds(where);
        filas.forEach((i) => Object.assign(i, data));
        return { count: filas.length };
      },
    },
    pagos: {
      count: async ({ where }) => db.pagos.filter((p) => coincide(p, where)).length,
      create: async ({ data }) => {
        const pago = { id: 900 + db.pagos.length, ...data };
        db.pagos.push(pago);
        return pago;
      },
      deleteMany: async ({ where }) => {
        const antes = db.pagos.length;
        db.pagos = db.pagos.filter((p) => !coincide(p, where));
        return { count: antes - db.pagos.length };
      },
    },
    metodos_pago: {
      findFirst: async ({ where }) => db.metodos.find((m) => m.nombre === where.nombre) ?? null,
    },
  };
  return db;
};

test('G-15: cuenta en S/0 crea pago de S/0 EFECTIVO pendiente y pasa todo a POR_VALIDAR', async () => {
  const db = crearTx();
  const pago = await enviarAValidacionSiMontoCero(db.tx, 10);

  assert.equal(pago.monto_pagado, 0);
  assert.equal(pago.metodo_pago_id, 4); // EFECTIVO buscado por nombre
  assert.equal(pago.estado_validacion, 'PENDIENTE');
  assert.equal(pago.codigo_operacion, CODIGO_PAGO_CERO);
  assert.equal(pago.tipo_transaccion, 'MATRICULA');
  assert.equal(db.cuenta.estado, 'POR_VALIDAR');
  assert.deepEqual(db.inscripciones.map((i) => i.estado), ['POR_VALIDAR', 'POR_VALIDAR']);
});

test('G-15: con saldo no hace nada', async () => {
  const db = crearTx({ monto: 180 });
  assert.equal(await enviarAValidacionSiMontoCero(db.tx, 10), null);
  assert.equal(db.pagos.length, 0);
  assert.deepEqual(db.inscripciones.map((i) => i.estado), ['PENDIENTE_PAGO', 'PENDIENTE_PAGO']);
});

test('G-15: sin inscripciones en PENDIENTE_PAGO (cuenta suelta o ya activa) no hace nada', async () => {
  for (const estados of [[], ['ACTIVO', 'ACTIVO'], ['POR_VALIDAR']]) {
    const db = crearTx({ estados });
    assert.equal(await enviarAValidacionSiMontoCero(db.tx, 10), null);
    assert.equal(db.pagos.length, 0);
    assert.equal(db.cuenta.estado, 'PAGADA');
  }
});

test('G-15: si ya hay un pago PENDIENTE no crea otro', async () => {
  const db = crearTx({ pagos: [{ id: 1, cuenta_id: 10, estado_validacion: 'PENDIENTE', monto_pagado: 180 }] });
  assert.equal(await enviarAValidacionSiMontoCero(db.tx, 10), null);
  assert.equal(db.pagos.length, 1);
});

test('G-15: sin método EFECTIVO falla y no crea métodos nuevos', async () => {
  const db = crearTx({ metodos: [{ id: 1, nombre: 'YAPE' }] });
  await assert.rejects(() => enviarAValidacionSiMontoCero(db.tx, 10), /EFECTIVO/);
  assert.equal(db.metodos.length, 1);
  assert.equal(db.pagos.length, 0);
});

test('G-15: revertir el descuento borra el pago de S/0 pendiente y devuelve a PENDIENTE_PAGO', async () => {
  const db = crearTx();
  await enviarAValidacionSiMontoCero(db.tx, 10);
  assert.equal(await deshacerPagoCeroPendiente(db.tx, 10), true);
  assert.equal(db.pagos.length, 0);
  assert.deepEqual(db.inscripciones.map((i) => i.estado), ['PENDIENTE_PAGO', 'PENDIENTE_PAGO']);
});

test('G-15: revertir no toca un pago de S/0 ya aprobado ni pagos normales', async () => {
  const db = crearTx({
    estados: ['ACTIVO'],
    pagos: [
      { id: 1, cuenta_id: 10, codigo_operacion: CODIGO_PAGO_CERO, monto_pagado: 0, estado_validacion: 'APROBADO' },
      { id: 2, cuenta_id: 10, codigo_operacion: 'S/N', monto_pagado: 180, estado_validacion: 'PENDIENTE' },
    ],
  });
  assert.equal(await deshacerPagoCeroPendiente(db.tx, 10), false);
  assert.equal(db.pagos.length, 2);
  assert.equal(db.inscripciones[0].estado, 'ACTIVO');
});

test('G-15: esPagoCero', () => {
  assert.equal(esPagoCero({ monto_pagado: 0 }), true);
  assert.equal(esPagoCero({ monto_pagado: '0.00' }), true);
  assert.equal(esPagoCero({ monto_pagado: 180 }), false);
});
