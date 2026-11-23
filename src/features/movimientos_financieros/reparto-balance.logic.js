import { repartirEnSoles, repartirProporcional } from '../../shared/utils/dinero.util.js';
import { elegirPlanPorRegimen, esConceptoLegacy } from '../inscripciones/utils/plan-catalogo.util.js';

/**
 * G-20: año y mes (1-12) en que el Balance cuenta un ciclo. fecha_inicio_ciclo es
 * @db.Date y Prisma la entrega como medianoche UTC: se lee en UTC para que no
 * dependa de la zona horaria del proceso. Mensual y anual usan esta función.
 */
export const mesDelCiclo = (fecha) => {
  const f = new Date(fecha);
  return { anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1 };
};

/**
 * G-17 v2: cuánto del pago le toca a cada link en el Balance.
 *
 * Entre sedes, en proporción al precio del plan del catálogo para los días que el
 * alumno entrena en cada sede (días = links de la cuenta en esa sede), del mismo
 * régimen (antiguo/nuevo) que el concepto de la cuenta. Dentro de una sede, partes
 * iguales por link id. Soles enteros, sobrante por mayor residuo.
 *
 * Si falta el concepto o un plan para esa cantidad de días, partes iguales entre
 * todos los links (regla G-17 original) y aviso en el log.
 *
 * @param {object} pago      { id, cuenta_id, monto_pagado }
 * @param {Array}  links     [{ id, sedeId }] todos los links de la cuenta
 * @param {Array}  catalogo  conceptos activos (orden id asc)
 * @param {object|null} concepto  concepto de la cuenta
 * @returns {Map<number, number>} link id -> monto
 */
export function repartirPagoEntreLinks(pago, links, catalogo, concepto) {
  const porId = [...links].sort((a, b) => a.id - b.id);
  const igual = () => {
    const partes = repartirEnSoles(pago.monto_pagado, porId.length);
    return new Map(porId.map((l, i) => [l.id, partes[i]]));
  };

  const sedes = new Map(); // en orden del menor link id
  for (const l of porId) {
    const k = l.sedeId ?? 'GENERAL';
    if (!sedes.has(k)) sedes.set(k, []);
    sedes.get(k).push(l);
  }
  if (sedes.size <= 1) return igual();

  const avisar = (motivo) => {
    console.warn(`[Balance G-17] pago ${pago.id} cuenta ${pago.cuenta_id}: ${motivo}; se reparte en partes iguales.`);
    return igual();
  };
  if (!concepto) return avisar('la cuenta no tiene concepto');

  const esLegacy = esConceptoLegacy(concepto);
  const delRegimen = catalogo.filter((c) => esConceptoLegacy(c) === esLegacy);
  const grupos = [...sedes.entries()];
  const precios = [];
  for (const [sede, ls] of grupos) {
    const plan = elegirPlanPorRegimen(delRegimen, ls.length, esLegacy);
    if (!plan) return avisar(`no hay plan ${esLegacy ? 'antiguo' : 'nuevo'} de ${ls.length} días (sede ${sede})`);
    precios.push(Number(plan.precio_base));
  }

  const resultado = new Map();
  repartirProporcional(pago.monto_pagado, precios).forEach((parteSede, i) => {
    const ls = grupos[i][1];
    repartirEnSoles(parteSede, ls.length).forEach((m, j) => resultado.set(ls[j].id, m));
  });
  return resultado;
}
