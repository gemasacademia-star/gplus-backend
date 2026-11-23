import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirDetalleSede,
  construirDetalleTodasSedes,
} from '../src/features/sedes/sede.service.js';
import { sedeSchema } from '../src/features/sedes/sede.schema.js';

const horaUTC = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m));

test('construirDetalleSede agrupa filas, deduplica niveles/profesores y calcula resumen', () => {
  const sedeMock = {
    id: 1,
    nombre: 'Sede Central',
    telefono_contacto: '999111222',
    tipo_instalacion: 'Coliseo',
    activo: true,
    direcciones: {
      id: 10,
      direccion_completa: 'Av. del Deporte 123',
      distrito: 'San Borja',
      ciudad: 'Lima',
      referencia: null,
    },
    canchas: [
      {
        id: 100,
        nombre: 'Cancha A',
        descripcion: 'Principal',
        horarios_clases: [
          {
            id: 1001,
            dia_semana: 1,
            hora_inicio: horaUTC(19, 0),
            hora_fin: horaUTC(21, 0),
            capacidad_max: 12,
            activo: true,
            niveles_entrenamiento: {
              id: 5,
              nombre: 'Intermedio',
              descripcion: 'Nivel intermedio',
              precio_referencial: 280,
            },
            coordinadores: {
              usuario_id: 20,
              especializacion: 'Voley',
              usuarios: {
                id: 20,
                nombres: 'Carlos',
                apellidos: 'Pérez',
                email: 'carlos@gema.com',
                telefono_personal: '988777666',
              },
            },
            _count: { inscripciones: 6 },
          },
          {
            id: 1002,
            dia_semana: 3,
            hora_inicio: horaUTC(19, 0),
            hora_fin: horaUTC(21, 0),
            capacidad_max: 12,
            activo: true,
            niveles_entrenamiento: {
              id: 5,
              nombre: 'Intermedio',
              descripcion: 'Nivel intermedio',
              precio_referencial: 280,
            },
            coordinadores: {
              usuario_id: 20,
              especializacion: 'Voley',
              usuarios: {
                id: 20,
                nombres: 'Carlos',
                apellidos: 'Pérez',
                email: 'carlos@gema.com',
                telefono_personal: '988777666',
              },
            },
            _count: { inscripciones: 6 },
          },
        ],
      },
    ],
  };

  const detalle = construirDetalleSede(sedeMock);

  assert.equal(detalle.sede.id, 1);
  assert.equal(detalle.resumen.total_canchas, 1);
  assert.equal(detalle.resumen.total_horarios, 2);
  assert.equal(detalle.resumen.total_niveles, 1);
  assert.equal(detalle.resumen.total_profesores, 1);
  assert.equal(detalle.resumen.capacidad_total, 24);
  assert.equal(detalle.resumen.inscritos_total, 12);
  assert.equal(detalle.resumen.porcentaje_ocupacion, 50);

  assert.equal(detalle.niveles.length, 1);
  assert.equal(detalle.profesores.length, 1);
  assert.equal(detalle.horarios.length, 2);
  assert.equal(detalle.filas.length, 1);
  assert.equal(detalle.filas[0].horario_texto, 'Lunes y Miércoles, 7:00 pm');
  assert.deepEqual(detalle.filas[0].dias, [1, 3]);
  assert.equal(detalle.filas[0].porcentaje_ocupacion, 50);
});

test('construirDetalleTodasSedes consolida resumen_global, filas globales y omite filas dentro de cada sede', () => {
  const sedesMock = [
    {
      id: 1,
      nombre: 'Sede A',
      activo: true,
      direcciones: null,
      canchas: [
        {
          id: 10,
          nombre: 'Cancha 1',
          horarios_clases: [
            {
              id: 1,
              dia_semana: 2,
              hora_inicio: horaUTC(18, 0),
              hora_fin: horaUTC(20, 0),
              capacidad_max: 10,
              activo: true,
              niveles_entrenamiento: { id: 1, nombre: 'Básico' },
              coordinadores: {
                usuario_id: 50,
                usuarios: { id: 50, nombres: 'Ana', apellidos: 'López' },
              },
              _count: { inscripciones: 5 },
            },
          ],
        },
      ],
    },
    {
      id: 2,
      nombre: 'Sede B',
      activo: true,
      direcciones: null,
      canchas: [
        {
          id: 20,
          nombre: 'Cancha 2',
          horarios_clases: [
            {
              id: 2,
              dia_semana: 4,
              hora_inicio: horaUTC(18, 0),
              hora_fin: horaUTC(20, 0),
              capacidad_max: 10,
              activo: true,
              niveles_entrenamiento: { id: 1, nombre: 'Básico' },
              coordinadores: {
                usuario_id: 50,
                usuarios: { id: 50, nombres: 'Ana', apellidos: 'López' },
              },
              _count: { inscripciones: 10 },
            },
          ],
        },
      ],
    },
  ];

  const consolidado = construirDetalleTodasSedes(sedesMock);

  assert.equal(consolidado.resumen_global.total_sedes, 2);
  assert.equal(consolidado.resumen_global.total_canchas, 2);
  assert.equal(consolidado.resumen_global.total_horarios, 2);
  assert.equal(consolidado.resumen_global.total_niveles, 1);
  assert.equal(consolidado.resumen_global.total_profesores, 1);
  assert.equal(consolidado.resumen_global.capacidad_total, 20);
  assert.equal(consolidado.resumen_global.inscritos_total, 15);
  assert.equal(consolidado.resumen_global.porcentaje_ocupacion, 75);

  assert.equal(consolidado.filas.length, 2);
  assert.equal(consolidado.sedes.length, 2);
  assert.equal('filas' in consolidado.sedes[0], false);
  assert.equal('filas' in consolidado.sedes[1], false);
});

test('sedeDetalleQuerySchema valida incluir_inactivos con default false', () => {
  assert.deepEqual(sedeSchema.sedeDetalleQuerySchema.parse({}), { incluir_inactivos: false });
  assert.deepEqual(sedeSchema.sedeDetalleQuerySchema.parse({ incluir_inactivos: 'true' }), {
    incluir_inactivos: true,
  });
  assert.deepEqual(sedeSchema.sedeDetalleQuerySchema.parse({ incluir_inactivos: 'false' }), {
    incluir_inactivos: false,
  });
  assert.throws(() => sedeSchema.sedeDetalleQuerySchema.parse({ incluir_inactivos: 'invalido' }));
});
