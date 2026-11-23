import { prisma } from '../../config/database.config.js';
import { ApiError } from '../../shared/utils/error.util.js';
import { formatHoraUTC } from '../../shared/utils/date.util.js';

const DIAS_SEMANA = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

const formatearHora12h = (hhmm) => {
  if (!hhmm || hhmm === '--:--') return '--:--';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  if (Number.isNaN(h)) return hhmm;
  const periodo = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${periodo}`;
};

const unirConY = (items) => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
};

const extraerHHmm = (valor) => {
  if (typeof valor === 'string' && /^\d{2}:\d{2}/.test(valor)) {
    return valor.slice(0, 5);
  }
  return formatHoraUTC(valor);
};

export const buildSedeDetalleSelect = (incluirInactivos = false) => ({
  id: true,
  nombre: true,
  telefono_contacto: true,
  tipo_instalacion: true,
  activo: true,
  direcciones: DIRECCION_SELECT,
  canchas: {
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      horarios_clases: {
        ...(incluirInactivos ? {} : { where: { activo: true } }),
        orderBy: [{ dia_semana: 'asc' }, { hora_inicio: 'asc' }],
        select: {
          id: true,
          dia_semana: true,
          hora_inicio: true,
          hora_fin: true,
          capacidad_max: true,
          activo: true,
          niveles_entrenamiento: {
            select: {
              id: true,
              nombre: true,
              descripcion: true,
              precio_referencial: true,
            },
          },
          coordinadores: {
            select: {
              usuario_id: true,
              especializacion: true,
              usuarios: {
                select: {
                  id: true,
                  nombres: true,
                  apellidos: true,
                  email: true,
                  telefono_personal: true,
                },
              },
            },
          },
          _count: {
            select: {
              inscripciones: {
                where: { estado: 'ACTIVO' },
              },
            },
          },
        },
      },
    },
  },
});

export const construirDetalleSede = (sede) => {
  const canchas = sede.canchas ?? [];
  const nivelesMap = new Map();
  const profesoresMap = new Map();
  const filasMap = new Map();
  const horarios = [];

  let capacidadTotal = 0;
  let inscritosTotal = 0;

  for (const cancha of canchas) {
    for (const h of cancha.horarios_clases ?? []) {
      const horaInicio = extraerHHmm(h.hora_inicio);
      const horaFin = extraerHHmm(h.hora_fin);
      const capacidad = Number(h.capacidad_max ?? 0);
      const inscritos = Number(h._count?.inscripciones ?? 0);
      const diaNombre = DIAS_SEMANA[h.dia_semana] ?? `Día ${h.dia_semana}`;

      capacidadTotal += capacidad;
      inscritosTotal += inscritos;

      const nivel = h.niveles_entrenamiento
        ? {
            id: h.niveles_entrenamiento.id,
            nombre: h.niveles_entrenamiento.nombre,
            descripcion: h.niveles_entrenamiento.descripcion ?? null,
            precio_referencial: h.niveles_entrenamiento.precio_referencial ?? null,
          }
        : null;

      if (nivel && !nivelesMap.has(nivel.id)) {
        nivelesMap.set(nivel.id, nivel);
      }

      const coordId = h.coordinadores?.usuario_id ?? null;
      const coordUser = h.coordinadores?.usuarios ?? null;
      const profesor = coordId
        ? {
            usuario_id: coordId,
            nombre_completo: coordUser
              ? `${coordUser.nombres ?? ''} ${coordUser.apellidos ?? ''}`.trim()
              : 'Sin asignar',
            nombres: coordUser?.nombres ?? null,
            apellidos: coordUser?.apellidos ?? null,
            email: coordUser?.email ?? null,
            telefono_personal: coordUser?.telefono_personal ?? null,
            especializacion: h.coordinadores?.especializacion ?? null,
          }
        : null;

      if (profesor && !profesoresMap.has(profesor.usuario_id)) {
        profesoresMap.set(profesor.usuario_id, profesor);
      }

      horarios.push({
        id: h.id,
        sede_id: sede.id,
        sede_nombre: sede.nombre,
        cancha_id: cancha.id,
        cancha_nombre: cancha.nombre,
        dia_semana: h.dia_semana,
        dia_nombre: diaNombre,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        capacidad_max: capacidad,
        inscritos,
        activo: Boolean(h.activo),
        nivel,
        profesor,
      });

      const groupKey = `${cancha.id}|${nivel?.id ?? 'none'}|${coordId ?? 'none'}|${horaInicio}|${horaFin}`;
      if (!filasMap.has(groupKey)) {
        filasMap.set(groupKey, {
          sede_id: sede.id,
          sede_nombre: sede.nombre,
          cancha_id: cancha.id,
          cancha_nombre: cancha.nombre,
          nivel_id: nivel?.id ?? null,
          nivel_nombre: nivel?.nombre ?? null,
          nivel,
          coordinador_id: coordId,
          profesor_nombre: profesor?.nombre_completo ?? 'Sin asignar',
          profesor,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          dias: [],
          horarios_ids: [],
          capacidad_total: 0,
          inscritos_total: 0,
          activo: false,
        });
      }

      const fila = filasMap.get(groupKey);
      if (!fila.dias.includes(h.dia_semana)) {
        fila.dias.push(h.dia_semana);
      }
      fila.horarios_ids.push(h.id);
      fila.capacidad_total += capacidad;
      fila.inscritos_total += inscritos;
      if (h.activo) fila.activo = true;
    }
  }

  const filas = Array.from(filasMap.values()).map((fila) => {
    const diasOrdenados = [...fila.dias].sort((a, b) => a - b);
    const diasNombres = diasOrdenados.map((d) => DIAS_SEMANA[d] ?? `Día ${d}`);
    const horarioTexto = `${unirConY(diasNombres)}, ${formatearHora12h(fila.hora_inicio)}`;
    const porcentajeOcupacion =
      fila.capacidad_total > 0
        ? Math.round((fila.inscritos_total / fila.capacidad_total) * 100)
        : 0;

    return {
      ...fila,
      dias: diasOrdenados,
      dias_nombres: diasNombres,
      horario_texto: horarioTexto,
      porcentaje_ocupacion: porcentajeOcupacion,
    };
  });

  const niveles = Array.from(nivelesMap.values());
  const profesores = Array.from(profesoresMap.values());
  const porcentajeOcupacionSede =
    capacidadTotal > 0 ? Math.round((inscritosTotal / capacidadTotal) * 100) : 0;

  return {
    sede: {
      id: sede.id,
      nombre: sede.nombre,
      telefono_contacto: sede.telefono_contacto ?? null,
      tipo_instalacion: sede.tipo_instalacion ?? null,
      activo: Boolean(sede.activo),
      direcciones: sede.direcciones ?? null,
    },
    resumen: {
      total_canchas: canchas.length,
      total_horarios: horarios.length,
      total_niveles: niveles.length,
      total_profesores: profesores.length,
      capacidad_total: capacidadTotal,
      inscritos_total: inscritosTotal,
      porcentaje_ocupacion: porcentajeOcupacionSede,
    },
    niveles,
    profesores,
    filas,
    horarios,
  };
};

export const construirDetalleTodasSedes = (sedes = []) => {
  const nivelesGlobal = new Map();
  const profesoresGlobal = new Map();
  const todasFilas = [];

  let totalCanchas = 0;
  let totalHorarios = 0;
  let capacidadTotal = 0;
  let inscritosTotal = 0;

  const sedesSinFilas = sedes.map((sedeRaw) => {
    const detalle = construirDetalleSede(sedeRaw);
    totalCanchas += detalle.resumen.total_canchas;
    totalHorarios += detalle.resumen.total_horarios;
    capacidadTotal += detalle.resumen.capacidad_total;
    inscritosTotal += detalle.resumen.inscritos_total;

    for (const n of detalle.niveles) {
      if (!nivelesGlobal.has(n.id)) nivelesGlobal.set(n.id, n);
    }
    for (const p of detalle.profesores) {
      if (!profesoresGlobal.has(p.usuario_id)) profesoresGlobal.set(p.usuario_id, p);
    }
    todasFilas.push(...detalle.filas);

    const { filas: _omitFilas, ...sedeSinFilas } = detalle;
    return sedeSinFilas;
  });

  const porcentajeGlobal =
    capacidadTotal > 0 ? Math.round((inscritosTotal / capacidadTotal) * 100) : 0;

  return {
    resumen_global: {
      total_sedes: sedes.length,
      total_canchas: totalCanchas,
      total_horarios: totalHorarios,
      total_niveles: nivelesGlobal.size,
      total_profesores: profesoresGlobal.size,
      capacidad_total: capacidadTotal,
      inscritos_total: inscritosTotal,
      porcentaje_ocupacion: porcentajeGlobal,
    },
    filas: todasFilas,
    sedes: sedesSinFilas,
  };
};

const DIRECCION_SELECT = {
  select: { id: true, direccion_completa: true, distrito: true, ciudad: true, referencia: true },
};

const SEDE_SELECT_FIELDS = {
  id: true,
  nombre: true,
  telefono_contacto: true,
  tipo_instalacion: true,
  activo: true,
  direcciones: DIRECCION_SELECT,
  canchas: {
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      horarios_clases: {
        where: { activo: true },
        select: {
          id: true,
          dia_semana: true,
          hora_inicio: true,
          hora_fin: true,
          niveles_entrenamiento: true,
          coordinadores: {
            select: {
              usuarios: {
                select: {
                  nombres: true,
                  apellidos: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  },
  administrador: {
    select: {
      usuarios: {
        select: {
          nombres: true,
          apellidos: true,
          email: true,
          telefono_personal: true,
        },
      },
    },
  },
};

/**
 * Construye el objeto `where` para filtrar sedes.
 */
const buildWhereFilters = ({ activo, distrito, tipo_instalacion }) => {
  const where = {};
  if (activo !== undefined) {
    where.activo = activo === true || activo === 'true';
  }
  if (distrito) {
    where.direcciones = { distrito: { contains: distrito, mode: 'insensitive' } };
  }
  if (tipo_instalacion) {
    where.tipo_instalacion = { contains: tipo_instalacion, mode: 'insensitive' };
  }
  return where;
};

export const sedeService = {
  createSede: async (sedeData) => {
    const { direccion, administrador_id, canchas } = sedeData;

    const adminRelacion = await prisma.administrador.findUnique({
      where: { usuario_id: administrador_id },
      select: { usuario_id: true },
    });

    if (!adminRelacion) throw new ApiError('Administrador no válido', 404);

    return await prisma.$transaction(
      async (tx) => {
        const nuevaDireccion = await tx.direcciones.create({
          data: {
            direccion_completa: direccion.direccion_completa,
            distrito: direccion.distrito,
            ciudad: direccion.ciudad || 'Lima',
            referencia: direccion.referencia || null,
          },
        });

        const sedeCreada = await tx.sedes.create({
          data: {
            nombre: sedeData.nombre,
            telefono_contacto: sedeData.telefono_contacto || null,
            tipo_instalacion: sedeData.tipo_instalacion || null,
            activo: sedeData.activo ?? true,
            direccion_id: nuevaDireccion.id,
            administrador: {
              connect: { usuario_id: adminRelacion.usuario_id },
            },
          },
        });

        if (canchas && canchas.length > 0) {
          await tx.canchas.createMany({
            data: canchas.map((c) => ({
              nombre: c.nombre,
              descripcion: c.descripcion || '',
              sede_id: sedeCreada.id,
            })),
          });
        }

        return await tx.sedes.findUnique({
          where: { id: sedeCreada.id },
          select: SEDE_SELECT_FIELDS,
        });
      },
      { timeout: 10000 }
    );
  },

  getAllSedes: async (filters = {}) => {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const { page: _p, limit: _l, ...rest } = filters;

    const where = buildWhereFilters(rest);
    const skip = (page - 1) * limit;

    const [sedes, total] = await Promise.all([
      prisma.sedes.findMany({
        where,
        select: SEDE_SELECT_FIELDS,
        orderBy: { nombre: 'asc' },
        skip,
        take: limit,
      }),
      prisma.sedes.count({ where }),
    ]);

    return { sedes, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getSedeById: async (id) => {
    const sede = await prisma.sedes.findUnique({
      where: { id },
      select: SEDE_SELECT_FIELDS,
    });

    if (!sede) throw new ApiError('Sede no encontrada', 404);

    return sede;
  },

  getCanchaForSedeCount: async (filters = {}) => {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 10;
    const { page: _p, limit: _l, ...rest } = filters;

    const where = buildWhereFilters(rest);
    const skip = (page - 1) * limit;

    const [sedes, total] = await Promise.all([
      prisma.sedes.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          tipo_instalacion: true,
          activo: true,
          direcciones: DIRECCION_SELECT,
          _count: { select: { canchas: true } },
        },
        orderBy: { nombre: 'asc' },
        skip,
        take: limit,
      }),
      prisma.sedes.count({ where }),
    ]);

    const sedesConConteo = sedes.map(({ _count, ...restSede }) => ({
      ...restSede,
      canchas_count: _count?.canchas ?? 0,
    }));

    return { sedes: sedesConConteo, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  updateSede: async (id, sedeData) => {
    return await prisma.$transaction(async (tx) => {
      // 1. Actualizar datos de Sede y Dirección
      await tx.sedes.update({
        where: { id },
        data: {
          ...(sedeData.nombre && { nombre: sedeData.nombre }),
          ...(sedeData.telefono_contacto !== undefined && {
            telefono_contacto: sedeData.telefono_contacto,
          }),
          ...(sedeData.tipo_instalacion !== undefined && {
            tipo_instalacion: sedeData.tipo_instalacion,
          }),
          ...(sedeData.activo !== undefined && { activo: sedeData.activo }),
          ...(sedeData.direccion && {
            direcciones: {
              update: {
                ...(sedeData.direccion.direccion_completa && {
                  direccion_completa: sedeData.direccion.direccion_completa,
                }),
                ...(sedeData.direccion.distrito && {
                  distrito: sedeData.direccion.distrito,
                }),
                ...(sedeData.direccion.ciudad && {
                  ciudad: sedeData.direccion.ciudad,
                }),
                ...(sedeData.direccion.referencia !== undefined && {
                  referencia: sedeData.direccion.referencia,
                }),
              },
            },
          }),
        },
      });

      // 2. Procesar Canchas en paralelo (Antigravity §3.1)
      if (sedeData.canchas && Array.isArray(sedeData.canchas)) {
        const canchasExistentes = sedeData.canchas.filter((c) => Number.isInteger(c.id));
        const canchasNuevas = sedeData.canchas.filter((c) => !Number.isInteger(c.id));

        // Validamos que los IDs enviados pertenezcan a la sede actual
        if (canchasExistentes.length > 0) {
          const idsEnPayload = canchasExistentes.map((c) => c.id);
          const canchasEncontradas = await tx.canchas.findMany({
            where: { sede_id: id, id: { in: idsEnPayload } },
            select: { id: true },
          });

          if (canchasEncontradas.length !== idsEnPayload.length) {
            throw new ApiError('Una o mas canchas no pertenecen a la sede seleccionada', 400);
          }
        }

        // Borramos solo canchas omitidas del payload si no tienen historial de horarios
        const idsAMantener = canchasExistentes.map((c) => c.id);
        const whereEliminar = {
          sede_id: id,
          ...(idsAMantener.length > 0 ? { id: { notIn: idsAMantener } } : {}),
        };

        const canchasAEliminar = await tx.canchas.findMany({
          where: whereEliminar,
          select: {
            id: true,
            nombre: true,
            _count: { select: { horarios_clases: true } },
          },
        });

        const canchasConHorarios = canchasAEliminar.filter((c) => c._count.horarios_clases > 0);
        if (canchasConHorarios.length > 0) {
          const nombres = canchasConHorarios.map((c) => `"${c.nombre}"`).join(', ');
          throw new ApiError(
            `No se pueden eliminar las canchas ${nombres} porque tienen horarios o inscripciones asociadas`,
            409,
            { cancha_ids: canchasConHorarios.map((c) => c.id) }
          );
        }

        if (canchasAEliminar.length > 0) {
          await tx.canchas.deleteMany({
            where: { id: { in: canchasAEliminar.map((c) => c.id) } },
          });
        }

        // Updates en paralelo
        if (canchasExistentes.length > 0) {
          await Promise.all(
            canchasExistentes.map((c) =>
              tx.canchas.update({
                where: { id: c.id },
                data: { nombre: c.nombre, descripcion: c.descripcion || '' },
              })
            )
          );
        }

        // Nuevas: un solo query para verificar duplicados + createMany
        if (canchasNuevas.length > 0) {
          const canchasNuevasUnicas = [];
          const nombresVistos = new Set();

          for (const cancha of canchasNuevas) {
            const nombreNormalizado = cancha.nombre.trim().toLowerCase();
            if (nombresVistos.has(nombreNormalizado)) continue;
            nombresVistos.add(nombreNormalizado);
            canchasNuevasUnicas.push({
              nombre: cancha.nombre.trim(),
              descripcion: cancha.descripcion || '',
            });
          }

          const nombresNuevos = canchasNuevasUnicas.map((c) => c.nombre);
          const yaExisten =
            nombresNuevos.length > 0
              ? await tx.canchas.findMany({
                where: {
                  sede_id: id,
                  OR: nombresNuevos.map((nombre) => ({
                    nombre: { equals: nombre, mode: 'insensitive' },
                  })),
                },
                select: { nombre: true },
              })
              : [];
          const nombresExistentes = new Set(yaExisten.map((c) => c.nombre.toLowerCase()));
          const canchasParaCrear = canchasNuevasUnicas.filter(
            (c) => !nombresExistentes.has(c.nombre.toLowerCase())
          );

          if (canchasParaCrear.length > 0) {
            await tx.canchas.createMany({
              data: canchasParaCrear.map((c) => ({
                nombre: c.nombre,
                descripcion: c.descripcion || '',
                sede_id: id,
              })),
            });
          }
        }
      }

      // 3. Retornar la sede actualizada
      return await tx.sedes.findUnique({
        where: { id },
        select: SEDE_SELECT_FIELDS,
      });
    });
  },

  updateDefuseSede: async (id) => {
    return await prisma.sedes.update({
      where: { id },
      data: { activo: false },
      select: { id: true, nombre: true, activo: true, direcciones: DIRECCION_SELECT },
    });
  },

  updateActiveSede: async (id) => {
    return await prisma.sedes.update({
      where: { id },
      data: { activo: true },
      select: { id: true, nombre: true, activo: true, direcciones: DIRECCION_SELECT },
    });
  },

  deleteSede: async (id) => {
    return await prisma.$transaction(async (tx) => {
      const sede = await tx.sedes.findUnique({
        where: { id },
        select: { direccion_id: true },
      });

      if (!sede) throw new ApiError('Sede no encontrada', 404);

      await tx.sedes.delete({ where: { id } });

      if (sede.direccion_id) {
        await tx.direcciones.delete({ where: { id: sede.direccion_id } });
      }

      return { success: true, message: 'Sede, canchas y dirección eliminadas correctamente' };
    });
  },
  obtenerOcupacionDashboard: async () => {
    // 1. Traemos solo las columnas necesarias (muy optimizado)
    const sedes = await prisma.sedes.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        canchas: {
          select: {
            horarios_clases: {
              select: {
                inscripciones: {
                  where: { estado: { in: ['ACTIVO'] } },
                  select: { alumno_id: true }
                }
              }
            }
          }
        }
      }
    });

    // 2. Procesamos con la regla: 1 alumno = 1 conteo por Sede
    const resultado = sedes.map(sede => {
      const alumnosUnicos = new Set(); // El Set ignora los IDs duplicados

      sede.canchas.forEach(cancha => {
        cancha.horarios_clases.forEach(horario => {
          horario.inscripciones.forEach(insc => {
            alumnosUnicos.add(insc.alumno_id);
          });
        });
      });

      return {
        nombre: sede.nombre,
        valor: alumnosUnicos.size // El tamaño del Set es la cantidad real de alumnos
      };
    });

    // Retornamos solo las sedes que tienen al menos 1 alumno
    return resultado.filter(r => r.valor > 0);
  },

  getSedeDetalle: async (id, query = {}) => {
    const incluirInactivos = Boolean(query.incluir_inactivos);
    const sede = await prisma.sedes.findUnique({
      where: { id },
      select: buildSedeDetalleSelect(incluirInactivos),
    });

    if (!sede) throw new ApiError('Sede no encontrada', 404);

    return construirDetalleSede(sede);
  },

  getAllSedesDetalle: async (query = {}) => {
    const incluirInactivos = Boolean(query.incluir_inactivos);
    const sedes = await prisma.sedes.findMany({
      ...(incluirInactivos ? {} : { where: { activo: true } }),
      orderBy: { nombre: 'asc' },
      select: buildSedeDetalleSelect(incluirInactivos),
    });

    return construirDetalleTodasSedes(sedes);
  },
};
