import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularEstadoCiclo,
  agruparCiclosPorCuenta,
  horariosYaEnCurso,
} from '../src/features/inscripciones/utils/historial-ciclos.util.js';
import { elegirConceptoVigente } from '../src/features/inscripciones/utils/renovacion.util.js';

const d = (s) => new Date(`${s}T00:00:00.000Z`);

test('calcularEstadoCiclo: abierto vencido (María 9/11 con hoy 10/11) no es VIGENTE', () => {
  const base = { fechaFin: null, estadoInscripcion: 'ACTIVO' };
  assert.equal(calcularEstadoCiclo({ ...base, corte: d('2026-11-09'), hoy: d('2026-11-10') }), 'VENCIDO');
  assert.equal(calcularEstadoCiclo({ ...base, corte: d('2026-11-09'), hoy: d('2026-11-09') }), 'VIGENTE');
  assert.equal(calcularEstadoCiclo({ ...base, corte: d('2026-12-10'), hoy: d('2026-11-10') }), 'VIGENTE');
});

test('calcularEstadoCiclo: con fin, o con inscripción terminada, está CERRADO', () => {
  assert.equal(calcularEstadoCiclo({ fechaFin: d('2026-10-09'), corte: d('2026-10-09'), estadoInscripcion: 'ACTIVO', hoy: d('2026-11-10') }), 'CERRADO');
  assert.equal(calcularEstadoCiclo({ fechaFin: null, corte: d('2026-07-12'), estadoInscripcion: 'FINALIZADO', hoy: d('2026-11-10') }), 'CERRADO');
});

const fila = (insc, cuenta, monto, extra = {}) => ({
  inscripcion_id: insc, cuenta_id: cuenta, monto_mes: monto, fecha_inicio_ciclo: d('2026-10-10'),
  tipo_inscripcion: 'REGULAR', sede: 'S', nivel: 'N', profesor: 'P', estado_inscripcion: 'ACTIVO', ...extra,
});

test('agruparCiclosPorCuenta: 2 inscripciones de una misma cuenta y ciclo -> 1 fila con el monto de la cuenta', () => {
  const r = agruparCiclosPorCuenta([fila(6726, 3627, 90), fila(6727, 3627, 90)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].monto_mes, 180);
  assert.deepEqual(r[0].inscripcion_ids, [6726, 6727]);
  assert.equal(r[0].horarios.length, 2);
});

test('agruparCiclosPorCuenta: ciclos o cuentas distintos no se mezclan; sin cuenta e INDIVIDUAL quedan sueltos', () => {
  const r = agruparCiclosPorCuenta([
    fila(1, 10, 90), fila(2, 10, 90),
    fila(1, 11, 90, { fecha_inicio_ciclo: d('2026-09-05') }), fila(2, 11, 90, { fecha_inicio_ciclo: d('2026-09-05') }),
    fila(3, null, 0), fila(4, null, 0),
    fila(5, 12, 25, { tipo_inscripcion: 'INDIVIDUAL' }), fila(6, 12, 25, { tipo_inscripcion: 'INDIVIDUAL' }),
  ]);
  assert.deepEqual(r.map((x) => x.monto_mes), [180, 180, 0, 0, 25, 25]);
});

test('agruparCiclosPorCuenta: fusiona el desglose de clases ordenado por fecha', () => {
  const des = (fechas) => ({
    dias_del_ciclo_en_el_mes: 30, total_clases: fechas.length, clases_presente: fechas.length,
    clases_falta: 0, clases_programadas: 0, clases: fechas.map((f) => ({ fecha: d(f), estado: 'PRESENTE' })),
  });
  const [g] = agruparCiclosPorCuenta([
    fila(1, 10, 90, { desglose_mes: des(['2026-10-12', '2026-10-26']) }),
    fila(2, 10, 90, { desglose_mes: des(['2026-10-14']) }),
  ]);
  assert.equal(g.desglose_mes.total_clases, 3);
  assert.deepEqual(g.desglose_mes.clases.map((c) => c.fecha.toISOString().slice(8, 10)), ['12', '14', '26']);
});

test('horariosYaEnCurso detecta solapes con los horarios pedidos', () => {
  assert.deepEqual(horariosYaEnCurso([39, 42], [{ horario_id: 39 }, { horario_id: 40 }]), [39]);
  assert.deepEqual(horariosYaEnCurso([50], [{ horario_id: 39 }]), []);
});

test('elegirConceptoVigente respeta el régimen: Antiguo -> legacy, Nuevo -> vigente', () => {
  const cand = [
    { id: 6, activo: true, es_vigente: false, cantidad_clases_semanal: 1, codigo_interno: 'L' },
    { id: 1, activo: true, es_vigente: true, cantidad_clases_semanal: 1, codigo_interno: 'V' },
  ];
  assert.equal(elegirConceptoVigente(cand, null, 1, { esLegacy: true }).id, 6);
  assert.equal(elegirConceptoVigente(cand, null, 1, { esLegacy: false }).id, 1);
  assert.equal(elegirConceptoVigente(cand, null, 1).id, 1);
});
