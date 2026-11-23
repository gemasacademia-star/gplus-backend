import test from 'node:test';
import assert from 'node:assert/strict';

import { repartirEnSoles, repartirMonto, repartirProporcional, sumarMontos, redondear2 } from '../src/shared/utils/dinero.util.js';
import { repartirPagoEntreLinks } from '../src/features/movimientos_financieros/reparto-balance.logic.js';

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

test('G-17 v2: repartirProporcional por mayor residuo', () => {
  assert.deepEqual(repartirProporcional(230, [150, 80]), [150, 80]);
  assert.deepEqual(repartirProporcional(115, [150, 80]), [75, 40]); // pago parcial
  assert.deepEqual(repartirProporcional(230, [180, 90]), [153, 77]);
  assert.deepEqual(repartirProporcional(300, [90, 180, 90]), [75, 150, 75]);
  assert.deepEqual(repartirProporcional(1, [1, 1]), [1, 0]); // empate -> índice menor
  assert.deepEqual(repartirProporcional(100.5, [1, 2]), [33.5, 67]);
  assert.throws(() => repartirProporcional(10, []), /entero mayor a 0/);
  assert.throws(() => repartirProporcional(10, [0, 0]), /Pesos inválidos/);
  assert.throws(() => repartirProporcional(-1, [1]), /monto negativo/);
});

// Catálogo real (base local 22/11): antiguos M_LEGACY_* no vigentes, nuevos *_2026.
const plan = (id, codigo_interno, precio_base, cantidad_clases_semanal, es_vigente) =>
  ({ id, codigo_interno, precio_base, cantidad_clases_semanal, es_vigente, activo: true });
const CATALOGO = [
  plan(1, 'MENSUAL_1_DIA_2026', 90, 1, true), plan(2, 'MENSUAL_2_DIA_2026', 180, 2, true),
  plan(3, 'MENSUAL_3_DIA_2026', 270, 3, true), plan(4, 'MENSUAL_4_DIA_2026', 300, 4, true),
  plan(6, 'M_LEGACY_1_DIA', 80, 1, false), plan(7, 'M_LEGACY_2_DIA', 150, 2, false),
  plan(8, 'M_LEGACY_3_DIA', 230, 3, false),
];
const [NUEVO_3, ANTIGUO_3] = [CATALOGO[2], CATALOGO[6]];
const MAGDALENA = 13, PUEBLO_LIBRE = 14;
const LINKS_LUIS = [{ id: 6294, sedeId: PUEBLO_LIBRE }, { id: 6295, sedeId: MAGDALENA }, { id: 6296, sedeId: MAGDALENA }];
const pagoDe = (monto_pagado) => ({ id: 2472, cuenta_id: 3681, monto_pagado });
const obj = (m) => Object.fromEntries(m);

test('G-17 v2: Luis Alfredo antiguo paga 230 -> Magdalena 150 (75+75), Pueblo Libre 80', () => {
  assert.deepEqual(obj(repartirPagoEntreLinks(pagoDe('230.00'), LINKS_LUIS, CATALOGO, ANTIGUO_3)),
    { 6294: 80, 6295: 75, 6296: 75 });
  // Parcial: 115 se reparte 75/40 entre sedes
  assert.deepEqual(obj(repartirPagoEntreLinks(pagoDe(115), LINKS_LUIS, CATALOGO, ANTIGUO_3)),
    { 6294: 40, 6295: 38, 6296: 37 });
});

test('G-17 v2: con concepto nuevo usa precios nuevos (180/90)', () => {
  assert.deepEqual(obj(repartirPagoEntreLinks(pagoDe(230), LINKS_LUIS, CATALOGO, NUEVO_3)),
    { 6294: 77, 6295: 77, 6296: 76 });
});

test('G-17 v2: una sola sede = partes iguales por link id', () => {
  const links = [{ id: 9, sedeId: 1 }, { id: 3, sedeId: 1 }, { id: 5, sedeId: 1 }];
  assert.deepEqual(obj(repartirPagoEntreLinks({ id: 1, monto_pagado: 230 }, links, CATALOGO, NUEVO_3)),
    { 3: 77, 5: 77, 9: 76 });
});

test('G-17 v2: sin plan para esos días o sin concepto -> partes iguales y aviso', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const cincoDias = [1, 2, 3, 4, 5].map((id) => ({ id, sedeId: 1 }));
  const links = [...cincoDias, { id: 6, sedeId: 2 }];
  assert.deepEqual(obj(repartirPagoEntreLinks({ id: 7, monto_pagado: 600 }, links, CATALOGO, NUEVO_3)),
    { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 });
  assert.match(warn.mock.calls[0].arguments[0], /no hay plan nuevo de 5 días/);
  assert.deepEqual(obj(repartirPagoEntreLinks(pagoDe(230), LINKS_LUIS, CATALOGO, null)),
    { 6294: 77, 6295: 77, 6296: 76 });
  assert.match(warn.mock.calls[1].arguments[0], /no tiene concepto/);
});

test('G-17 v2: la suma de los links es siempre el pago', () => {
  for (let i = 0; i < 500; i++) {
    const total = i % 2 ? Math.round(Math.random() * 1000) : Math.round(Math.random() * 100000) / 100;
    const links = Array.from({ length: 1 + Math.floor(Math.random() * 4) },
      (_, k) => ({ id: k + 1, sedeId: 1 + Math.floor(Math.random() * 3) }));
    const partes = [...repartirPagoEntreLinks({ id: i, monto_pagado: total }, links, CATALOGO, i % 3 ? NUEVO_3 : ANTIGUO_3).values()];
    assert.equal(sumarMontos(partes), redondear2(total), `total=${total}`);
  }
});
