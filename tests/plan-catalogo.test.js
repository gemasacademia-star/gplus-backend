import test from 'node:test';
import assert from 'node:assert/strict';
import { elegirPlanPorRegimen, esConceptoLegacy } from '../src/features/inscripciones/utils/plan-catalogo.util.js';

const plan = (id, codigo, cantidad, vigente, activo = true) => ({ id, codigo_interno: codigo, cantidad_clases_semanal: cantidad, es_vigente: vigente, activo });
const catalogo = [
  plan(2, 'MENSUAL_2_DIA_2026', 2, true),
  plan(7, 'M_LEGACY_2_DIA', 2, false),
  plan(1, 'MENSUAL_1_DIA_2026', 1, true),
  plan(6, 'M_LEGACY_1_DIA', 1, false),
];

test('catálogo normal: Antiguo -> legacy, Nuevo -> vigente', () => {
  assert.equal(elegirPlanPorRegimen(catalogo, 2, true).id, 7);
  assert.equal(elegirPlanPorRegimen(catalogo, 2, false).id, 2);
});

test('legacy marcado es_vigente=true por error: el Antiguo igual recibe su plan y el Nuevo no recibe el legacy', () => {
  const roto = catalogo.map((c) => ({ ...c, es_vigente: true }));
  assert.equal(elegirPlanPorRegimen(roto, 2, true).id, 7);
  assert.equal(elegirPlanPorRegimen(roto, 2, false).id, 2);
});

test('sin plan legacy para esa cantidad, el Antiguo cae al plan vigente (no se bloquea)', () => {
  const sinLegacy = catalogo.filter((c) => c.id !== 7);
  assert.equal(elegirPlanPorRegimen(sinLegacy, 2, true).id, 2);
});

test('sin plan vigente, el Nuevo no recibe un plan legacy por código', () => {
  const soloLegacy = [plan(7, 'M_LEGACY_2_DIA', 2, false)];
  assert.equal(elegirPlanPorRegimen(soloLegacy, 2, false), null);
});

test('ignora planes inactivos y de otra cantidad; esConceptoLegacy por código o por no vigente', () => {
  assert.equal(elegirPlanPorRegimen([plan(7, 'M_LEGACY_2_DIA', 2, false, false)], 2, true), null);
  assert.equal(elegirPlanPorRegimen(catalogo, 5, true), null);
  assert.equal(esConceptoLegacy(plan(9, 'OTRO', 3, false)), true);
  assert.equal(esConceptoLegacy(plan(9, 'X_LEGACY', 3, true)), true);
  assert.equal(esConceptoLegacy(plan(9, 'MENSUAL', 3, true)), false);
});
