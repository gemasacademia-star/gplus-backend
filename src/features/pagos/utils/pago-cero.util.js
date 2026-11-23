import { ApiError } from '../../../shared/utils/error.util.js';
import { TIPO_TRANSACCION } from '../../merch/logic/merch.logic.js';

/**
 * G-15: cuenta que queda en S/ 0 por un beneficio o descuento del 100%.
 *
 * Antes la cuenta pasaba a PAGADA y las inscripciones se quedaban en
 * PENDIENTE_PAGO: el alumno no podía reportar pago (la cuenta ya estaba PAGADA),
 * nadie las activaba y el cron de zombies las borraba, perdiendo el beneficio.
 *
 * Ahora se crea un pago de S/ 0 PENDIENTE y las inscripciones pasan a POR_VALIDAR,
 * así llegan a la bandeja del admin como cualquier pago: validarPago las activa y
 * genera las clases. Es la versión automática del arreglo manual de Jenny (pago 2491).
 */

/** Mismo método de pago que el arreglo manual de Jenny (pago 2491); se busca por nombre. */
export const METODO_PAGO_CERO = 'EFECTIVO';
export const CODIGO_PAGO_CERO = 'BENEFICIO_100';

const montoEsCero = (monto) => Number(monto) <= 0.01;

/** Pago de S/ 0 (el de un beneficio del 100%). */
export const esPagoCero = (pago) => montoEsCero(pago?.monto_pagado);

const inscripcionesDeLaCuenta = async (tx, cuentaId) => {
  const links = await tx.inscripciones_deudas_link.findMany({
    where: { cuenta_id: cuentaId },
    select: { inscripcion_id: true },
  });
  return links.map((l) => l.inscripcion_id);
};

/**
 * Si la cuenta quedó en S/ 0 y tiene inscripciones esperando pago, crea el pago de
 * S/ 0 PENDIENTE y pasa cuenta e inscripciones a POR_VALIDAR.
 * No hace nada (devuelve null) si la cuenta tiene saldo, si no hay inscripciones en
 * PENDIENTE_PAGO o si ya hay un pago PENDIENTE (ese pago ya está en la bandeja).
 *
 * @returns {Promise<object|null>} el pago creado, o null
 */
export const enviarAValidacionSiMontoCero = async (tx, cuentaId) => {
  const cuenta = await tx.cuentas_por_cobrar.findUnique({
    where: { id: cuentaId },
    select: { id: true, monto_final: true },
  });
  if (!cuenta || !montoEsCero(cuenta.monto_final)) return null;

  const idsInscripciones = await inscripcionesDeLaCuenta(tx, cuentaId);
  const porActivar = await tx.inscripciones.count({
    where: { id: { in: idsInscripciones }, estado: 'PENDIENTE_PAGO' },
  });
  if (porActivar === 0) return null;

  const pagoPendiente = await tx.pagos.count({
    where: { cuenta_id: cuentaId, estado_validacion: 'PENDIENTE' },
  });
  if (pagoPendiente > 0) return null;

  const metodo = await tx.metodos_pago.findFirst({
    where: { nombre: METODO_PAGO_CERO },
    select: { id: true },
  });
  if (!metodo) {
    throw new ApiError(`No existe el método de pago ${METODO_PAGO_CERO} para registrar el pago de S/ 0.`, 500);
  }

  const pago = await tx.pagos.create({
    data: {
      cuenta_id: cuentaId,
      metodo_pago_id: metodo.id,
      monto_pagado: 0,
      codigo_operacion: CODIGO_PAGO_CERO,
      notas_validacion: 'Beneficio del 100%: sin monto a pagar.',
      estado_validacion: 'PENDIENTE',
      tipo_transaccion: TIPO_TRANSACCION.MATRICULA,
      fecha_pago: new Date(),
    },
  });

  // POR_VALIDAR, igual que registrarPago: el cron de zombies solo borra PENDIENTE_PAGO
  // y las limpiezas de cuentas solo tocan PENDIENTE.
  await tx.cuentas_por_cobrar.update({
    where: { id: cuentaId },
    data: { estado: 'POR_VALIDAR', actualizado_en: new Date() },
  });
  await tx.inscripciones.updateMany({
    where: { id: { in: idsInscripciones }, estado: 'PENDIENTE_PAGO' },
    data: { estado: 'POR_VALIDAR', actualizado_en: new Date() },
  });

  return pago;
};

/**
 * Deshace enviarAValidacionSiMontoCero cuando la cuenta vuelve a tener saldo (se
 * revierte el descuento manual): borra el pago de S/ 0 si sigue PENDIENTE y devuelve
 * las inscripciones de POR_VALIDAR a PENDIENTE_PAGO. Un pago ya aprobado no se toca.
 *
 * @returns {Promise<boolean>} true si había un pago de S/ 0 pendiente que deshacer
 */
export const deshacerPagoCeroPendiente = async (tx, cuentaId) => {
  const { count } = await tx.pagos.deleteMany({
    where: {
      cuenta_id: cuentaId,
      codigo_operacion: CODIGO_PAGO_CERO,
      monto_pagado: 0,
      estado_validacion: 'PENDIENTE',
    },
  });
  if (count === 0) return false;

  const idsInscripciones = await inscripcionesDeLaCuenta(tx, cuentaId);
  await tx.inscripciones.updateMany({
    where: { id: { in: idsInscripciones }, estado: 'POR_VALIDAR' },
    data: { estado: 'PENDIENTE_PAGO', actualizado_en: new Date() },
  });
  return true;
};
