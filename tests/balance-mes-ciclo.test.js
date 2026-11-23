import test from 'node:test';
import assert from 'node:assert/strict';

import { mesDelCiclo } from '../src/features/movimientos_financieros/reparto-balance.logic.js';

// Prisma entrega fecha_inicio_ciclo (@db.Date) como medianoche UTC.
const ciclo = (iso) => new Date(`${iso}T00:00:00.000Z`);

for (const tz of ['America/Lima', 'UTC']) {
  test(`G-20: el mes del ciclo no depende de la zona horaria (TZ=${tz})`, (t) => {
    const previa = process.env.TZ;
    process.env.TZ = tz;
    t.after(() => { if (previa === undefined) delete process.env.TZ; else process.env.TZ = previa; });

    assert.deepEqual(mesDelCiclo(ciclo('2026-11-01')), { anio: 2026, mes: 11 });
    assert.deepEqual(mesDelCiclo(ciclo('2026-11-30')), { anio: 2026, mes: 11 });
    assert.deepEqual(mesDelCiclo(ciclo('2026-10-01')), { anio: 2026, mes: 10 });
    assert.deepEqual(mesDelCiclo(ciclo('2027-01-01')), { anio: 2027, mes: 1 });
  });
}
