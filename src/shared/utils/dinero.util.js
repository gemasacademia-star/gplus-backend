import { ApiError } from './error.util.js';

/**
 * 💰 BL-002: única fuente de verdad para la aritmética de dinero.
 *
 * Todas las columnas de dinero del schema son `Decimal(10, 2)`, pero el código
 * las lee con `Number()` / `parseFloat()` y opera en float64. El problema no es
 * la imprecisión del float (a 2 decimales es irrelevante), sino el REPARTO:
 * `400 / 3 = 133.3333…` se persiste redondeado a `133.33` en los tres slots, y
 * la suma del puente queda en `399.99` contra un `monto_final` de `400.00`.
 *
 * La solución es repartir en céntimos enteros y asignar el residuo, en vez de
 * dividir y dejar que Postgres redondee cada parte por su cuenta.
 */

/** Céntimos enteros de un monto. Mismo criterio de redondeo que Decimal(10,2). */
export function aCentimos(valor) {
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    throw new ApiError(`Monto inválido: ${valor}`, 400);
  }
  return Math.round(num * 100);
}

/** Monto de 2 decimales a partir de céntimos enteros. */
export function aMonto(centimos) {
  return centimos / 100;
}

/** Redondea un monto a 2 decimales, igual que lo haría la columna en BD. */
export function redondear2(valor) {
  return aMonto(aCentimos(valor));
}

/**
 * Reparte `total` en `n` partes de 2 decimales cuya suma es EXACTAMENTE
 * `redondear2(total)`. El residuo de céntimos se asigna a las primeras partes,
 * así el reparto es determinista y reproducible.
 *
 *   repartirMonto(400, 3)  -> [133.34, 133.33, 133.33]   suma 400.00
 *   repartirMonto(280, 2)  -> [140, 140]
 *   repartirMonto(37.5, 1) -> [37.5]
 *
 * @param {number|string|import('@prisma/client').Prisma.Decimal} total
 * @param {number} n Cantidad de partes (> 0, entero).
 * @returns {number[]} Array de `n` montos.
 */
export function repartirMonto(total, n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(
      `No se puede repartir un monto entre ${n} partes: se esperaba un entero mayor a 0.`,
      400
    );
  }

  const totalCentimos = aCentimos(total);
  if (totalCentimos < 0) {
    throw new ApiError(`No se puede repartir un monto negativo: ${total}`, 400);
  }

  const base = Math.floor(totalCentimos / n);
  const residuo = totalCentimos - base * n; // 0 .. n-1

  return Array.from({ length: n }, (_, i) => aMonto(base + (i < residuo ? 1 : 0)));
}

/**
 * G-17 v2: reparte `total` en proporción a `pesos` por mayor residuo. La unidad
 * es 1 sol si el total es en soles enteros, si no 1 céntimo. Los empates de
 * residuo van al índice menor. La suma es siempre exactamente redondear2(total).
 *
 *   repartirProporcional(230, [150, 80]) -> [150, 80]
 *   repartirProporcional(115, [150, 80]) -> [75, 40]
 *   repartirProporcional(230, [1, 1, 1]) -> [77, 77, 76]
 */
export function repartirProporcional(total, pesos) {
  // Mismas validaciones (n entero > 0, total >= 0) que repartirMonto.
  repartirMonto(0, pesos?.length);
  const centimos = aCentimos(total);
  if (centimos < 0) {
    throw new ApiError(`No se puede repartir un monto negativo: ${total}`, 400);
  }
  const ws = pesos.map((p) => aCentimos(p));
  const suma = ws.reduce((a, w) => a + w, 0);
  if (ws.some((w) => w < 0) || suma <= 0) {
    throw new ApiError(`Pesos inválidos para repartir: ${pesos}`, 400);
  }

  const u = centimos % 100 === 0 ? 100 : 1;
  const unidades = centimos / u;
  const base = ws.map((w) => Math.floor((unidades * w) / suma));
  let sobrante = unidades - base.reduce((a, b) => a + b, 0);
  const orden = ws
    .map((w, i) => ({ i, resto: (unidades * w) % suma }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of orden) {
    if (sobrante-- <= 0) break;
    base[i] += 1;
  }
  return base.map((b) => aMonto(b * u));
}

/**
 * G-17: reparto en partes iguales para el Balance (soles enteros si el total los
 * trae, si no céntimos; sobrante a las primeras partes).
 *
 *   repartirEnSoles(230, 3)    -> [77, 77, 76]
 *   repartirEnSoles(100.5, 2)  -> [50.25, 50.25]
 */
export function repartirEnSoles(total, n) {
  repartirMonto(0, n);
  return repartirProporcional(total, Array(n).fill(1));
}

/** Suma una lista de montos sin arrastrar error de float. */
export function sumarMontos(montos) {
  return aMonto(montos.reduce((acc, m) => acc + aCentimos(m), 0));
}
