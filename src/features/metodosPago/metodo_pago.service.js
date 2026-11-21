import { prisma } from '../../config/database.config.js';
import { ApiError } from '../../shared/utils/error.util.js';

export const metodoPagoService = {
  /**
   * Obtiene todos los métodos de pago activos
   */
  getAllActivos: async () => {
    return await prisma.metodos_pago.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  },

  /**
   * Obtiene todos los métodos de pago (activos e inactivos) para administración
   */
  getAllAdmin: async () => {
    return await prisma.metodos_pago.findMany({
      orderBy: { nombre: 'asc' },
    });
  },

  /**
   * Obtiene un método de pago por ID
   */
  getById: async (id) => {
    return await prisma.metodos_pago.findUnique({
      where: { id: Number(id) },
    });
  },

  /**
   * Crea un nuevo método de pago validando nombre único (case-insensitive)
   */
  create: async (data) => {
    const existente = await prisma.metodos_pago.findFirst({
      where: { nombre: { equals: data.nombre, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existente) {
      throw new ApiError('Ya existe un método de pago con ese nombre', 409);
    }

    return await prisma.metodos_pago.create({ data });
  },

  /**
   * Actualiza un método de pago existente
   */
  update: async (id, data) => {
    const metodo = await prisma.metodos_pago.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!metodo) {
      throw new ApiError('Método de pago no encontrado', 404);
    }

    if (data.nombre) {
      const duplicado = await prisma.metodos_pago.findFirst({
        where: {
          nombre: { equals: data.nombre, mode: 'insensitive' },
          id: { not: id },
        },
        select: { id: true },
      });

      if (duplicado) {
        throw new ApiError('Ya existe otro método de pago con ese nombre', 409);
      }
    }

    return await prisma.metodos_pago.update({
      where: { id },
      data,
    });
  },

  /**
   * Elimina un método de pago si no tiene pagos o movimientos asociados
   */
  remove: async (id) => {
    const metodo = await prisma.metodos_pago.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            pagos: true,
            movimientos_financieros: true,
          },
        },
      },
    });

    if (!metodo) {
      throw new ApiError('Método de pago no encontrado', 404);
    }

    if (metodo._count.pagos > 0 || metodo._count.movimientos_financieros > 0) {
      throw new ApiError(
        'No se puede eliminar el método de pago porque tiene pagos o movimientos financieros asociados',
        409
      );
    }

    return await prisma.metodos_pago.delete({
      where: { id },
    });
  },
};
