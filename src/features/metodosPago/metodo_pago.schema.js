import { z } from 'zod';

const optionalNullableString = (maxLen, label) =>
  z
    .string()
    .trim()
    .max(maxLen, `${label} no puede exceder ${maxLen} caracteres`)
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional();

const baseSchema = z.object({
  nombre: z
    .string({ required_error: 'El nombre del método de pago es requerido' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(50, 'El nombre no puede exceder 50 caracteres'),
  activo: z.boolean().optional().default(true),
  titular: optionalNullableString(150, 'El titular'),
  numero_telefono: optionalNullableString(30, 'El número de teléfono'),
  numero_cuenta: optionalNullableString(50, 'El número de cuenta'),
  cci: optionalNullableString(50, 'El CCI'),
  banco: optionalNullableString(80, 'El banco'),
  detalle_instrucciones: optionalNullableString(1000, 'El detalle de instrucciones'),
});

export const metodoPagoSchema = {
  createSchema: baseSchema,

  updateSchema: baseSchema
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Debe proporcionar al menos un campo para actualizar',
    }),

  idParamSchema: z.object({
    id: z
      .string()
      .regex(/^\d+$/, 'El ID debe ser un número')
      .transform((val) => parseInt(val, 10))
      .refine((val) => val > 0, 'El ID debe ser mayor a 0'),
  }),
};
