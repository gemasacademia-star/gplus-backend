import test from 'node:test';
import assert from 'node:assert/strict';

import { repartirEnSoles, repartirMonto, sumarMontos, redondear2 } from '../src/shared/utils/dinero.util.js';

test('G-17: 230 entre 3 se reparte en soles enteros, sobrante a los primeros', () => {
  assert.deepEqual(repartirEnSoles(230, 3), [77, 77, 76]);
  assert.deepEqual(repartirEnSoles('230.00', 3), [77, 77, 76]);
  assert.deepEqual(repartirEnSoles(270, 3), [90, 90, 90]);
  assert.deepEqual(repartirEnSoles(180, 2), [90, 90]);
  assert.deepEqual(repartirEnSoles(400, 3), [134, 133, 133]);
  assert.deepEqual(repartirEnSoles(2, 3), [1, 1, 0]);
  assert.deepEqual(repartirEnSoles(0, 2), [0, 0]);
});

test('G-17: si el pago trae céntimos se reparte en céntimos (repartirMonto)', () => {
  assert.deepEqual(repartirEnSoles(100.5, 2), repartirMonto(100.5, 2));
  assert.deepEqual(repartirEnSoles(37.5, 3), [12.5, 12.5, 12.5]);
  assert.deepEqual(repartirEnSoles(428.34, 3), [142.78, 142.78, 142.78]);
});

test('G-17: mismas validaciones que repartirMonto', () => {
  assert.throws(() => repartirEnSoles(230, 0), /entero mayor a 0/);
  assert.throws(() => repartirEnSoles(230, 1.5), /entero mayor a 0/);
  assert.throws(() => repartirEnSoles(-30, 2), /monto negativo/);
  assert.throws(() => repartirEnSoles(undefined, 2), /Monto inválido/);
});

// Réplica en JS de la fórmula SQL de obtenerResumenAnual, para que mensual y anual no se separen.
const parteSql = (monto, n, rn) => {
  const c = Math.round(Number(monto) * 100);
  const u = c % 100 === 0 ? 100 : 1;
  const unidades = c / u;
  return ((Math.floor(unidades / n) + (rn <= unidades % n ? 1 : 0)) * u) / 100;
};

test('G-17: la fórmula del resumen anual (SQL) da las mismas partes que el mensual', () => {
  for (let i = 0; i < 1000; i++) {
    const total = i % 2 ? Math.round(Math.random() * 1000) : Math.round(Math.random() * 100000) / 100;
    const n = 1 + Math.floor(Math.random() * 6);
    const partes = repartirEnSoles(total, n);
    partes.forEach((p, idx) => assert.equal(p, parteSql(total, n, idx + 1), `total=${total} n=${n}`));
    assert.equal(sumarMontos(partes), redondear2(total), `total=${total} n=${n}`);
  }
});
