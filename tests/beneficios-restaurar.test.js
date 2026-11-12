import test from 'node:test';
import assert from 'node:assert/strict';
import { restaurarBeneficiosConsumidos } from '../src/features/inscripciones/utils/beneficios.util.js';

const txFalso = (beneficios) => ({
  beneficios_pendientes: {
    findFirst: async ({ where }) =>
      beneficios
        .filter((b) => b.alumno_id === where.alumno_id && b.tipo_beneficio_id === where.tipo_beneficio_id && b.usado === where.usado)
        .sort((a, b) => b.fecha_asignacion - a.fecha_asignacion)[0] ?? null,
    update: async ({ where, data }) => { beneficios.find((b) => b.id === where.id).usado = data.usado; },
  },
});

test('restaura solo el beneficio usado más reciente del tipo del descuento', async () => {
  const bs = [
    { id: 1, alumno_id: 9, tipo_beneficio_id: 8, usado: true, fecha_asignacion: new Date('2026-01-01') },
    { id: 2, alumno_id: 9, tipo_beneficio_id: 8, usado: true, fecha_asignacion: new Date('2026-11-10') },
  ];
  const n = await restaurarBeneficiosConsumidos(txFalso(bs), 9, [{ tipo_beneficio_id: 8 }]);
  assert.equal(n, 1);
  assert.equal(bs[1].usado, false);
  assert.equal(bs[0].usado, true);
});

test('sin descuentos o sin beneficio usado no hace nada', async () => {
  const bs = [{ id: 1, alumno_id: 9, tipo_beneficio_id: 8, usado: false, fecha_asignacion: new Date() }];
  assert.equal(await restaurarBeneficiosConsumidos(txFalso(bs), 9, []), 0);
  assert.equal(await restaurarBeneficiosConsumidos(txFalso(bs), 9, [{ tipo_beneficio_id: 8 }]), 0);
  assert.equal(bs[0].usado, false);
});
