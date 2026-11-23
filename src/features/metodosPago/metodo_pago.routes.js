import { Router } from 'express';
import { metodoPagoController } from './metodo_pago.controller.js';
import { authenticate } from '../../shared/middlewares/auth.middleware.js';
import { authorize } from '../../shared/middlewares/authorize.middleware.js';
import { validate, validateParams } from '../../shared/middlewares/validate.middleware.js';
import { metodoPagoSchema } from './metodo_pago.schema.js';

const router = Router();

// Endpoint: GET /api/metodos-pago
router.get('/', authenticate, metodoPagoController.getAllMetodos);

// Endpoint: GET /api/metodos-pago/admin
router.get('/admin', authenticate, authorize('Administrador'), metodoPagoController.getAllAdmin);

// Endpoint: POST /api/metodos-pago
router.post(
  '/',
  authenticate,
  authorize('Administrador'),
  validate(metodoPagoSchema.createSchema),
  metodoPagoController.create
);

// Endpoint: PUT /api/metodos-pago/:id
router.put(
  '/:id',
  authenticate,
  authorize('Administrador'),
  validateParams(metodoPagoSchema.idParamSchema),
  validate(metodoPagoSchema.updateSchema),
  metodoPagoController.update
);

// Endpoint: DELETE /api/metodos-pago/:id
router.delete(
  '/:id',
  authenticate,
  authorize('Administrador'),
  validateParams(metodoPagoSchema.idParamSchema),
  metodoPagoController.remove
);

export default router;
