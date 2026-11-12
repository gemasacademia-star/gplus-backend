// Reversión de beneficios consumidos por una cuenta que se borra.

/**
 * Por cada descuento que tenía la cuenta, devuelve a la cola UN beneficio
 * `usado` de ese tipo (el asignado más recientemente). No usa updateMany: así
 * no "resucita" beneficios viejos ya canjeados en otras cuentas.
 * Devuelve cuántos beneficios restauró.
 */
export const restaurarBeneficiosConsumidos = async (tx, alumnoId, descuentos) => {
  let restaurados = 0;
  for (const d of descuentos ?? []) {
    const consumido = await tx.beneficios_pendientes.findFirst({
      where: { alumno_id: alumnoId, tipo_beneficio_id: d.tipo_beneficio_id, usado: true },
      orderBy: { fecha_asignacion: 'desc' },
      select: { id: true },
    });
    if (!consumido) continue;
    await tx.beneficios_pendientes.update({ where: { id: consumido.id }, data: { usado: false } });
    restaurados++;
  }
  return restaurados;
};
