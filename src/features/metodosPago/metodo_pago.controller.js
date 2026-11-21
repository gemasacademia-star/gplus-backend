import { metodoPagoService } from './metodo_pago.service.js';
import { apiResponse } from '../../shared/utils/response.util.js';
import { catchAsync } from '../../shared/utils/catchAsync.util.js';

export const metodoPagoController = {
  getAllMetodos: catchAsync(async (req, res) => {
    const metodos = await metodoPagoService.getAllActivos();
    return apiResponse.success(res, {
      message: 'Métodos de pago obtenidos exitosamente',
      data: metodos,
    });
  }),

  getAllAdmin: catchAsync(async (req, res) => {
    const metodos = await metodoPagoService.getAllAdmin();
    return apiResponse.success(res, {
      message: 'Métodos de pago obtenidos exitosamente',
      data: metodos,
    });
  }),

  create: catchAsync(async (req, res) => {
    const metodo = await metodoPagoService.create(req.body);
    return apiResponse.created(res, {
      message: 'Método de pago creado exitosamente',
      data: metodo,
    });
  }),

  update: catchAsync(async (req, res) => {
    const metodo = await metodoPagoService.update(req.params.id, req.body);
    return apiResponse.success(res, {
      message: 'Método de pago actualizado exitosamente',
      data: metodo,
    });
  }),

  remove: catchAsync(async (req, res) => {
    await metodoPagoService.remove(req.params.id);
    return apiResponse.success(res, {
      message: 'Método de pago eliminado exitosamente',
      data: null,
    });
  }),
};
