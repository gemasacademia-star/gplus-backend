-- G-05: Luis Alfredo García Pequeño (usuario 1192). Se le cobró el plan de 3 clases
-- como alumno NUEVO (concepto 3, S/270) porque al inscribirse su historial estaba en
-- null; es alumno Antiguo (concepto 8, S/230) y ya pagó S/230 (pago 2472 aprobado).
-- Deja la cuenta 3681 en concepto 8, S/230, PAGADA y reparte el puente con la regla
-- G-17 v2 (por sede según el plan antiguo del catálogo): Magdalena 2 días = S/150
-- (75 + 75, links 6295 y 6296), Pueblo Libre 1 día = S/80 (link 6294).
--
-- Gerardo confirmó S/230 sin deuda (19/11). Se corre en producción después del
-- despliegue de G-17 v2.
--
-- Aborta (ROLLBACK) si la cuenta no está exactamente como se diagnosticó, y otra vez
-- si el resultado no cuadra. Guarda el estado anterior en bk_cuenta_3681 para revertir.
-- Falla si bk_cuenta_3681 ya existe (no se aplica dos veces).
--
-- Uso:      psql "$DATABASE_URL" -f prisma/scripts/ajustar-cuenta-3681-antiguo.sql
-- Revertir: psql "$DATABASE_URL" -f prisma/scripts/revertir-cuenta-3681-antiguo.sql

-- Antes
SELECT c.id, c.concepto_id, c.monto_final, c.estado,
       (SELECT sum(monto_pagado) FROM pagos WHERE cuenta_id = c.id AND estado_validacion = 'APROBADO') AS pagado,
       (SELECT string_agg(id || ':' || monto_asignado, ' ' ORDER BY id) FROM inscripciones_deudas_link WHERE cuenta_id = c.id) AS links
FROM cuentas_por_cobrar c WHERE c.id = 3681;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cuentas_por_cobrar
                 WHERE id = 3681 AND alumno_id = 1192 AND concepto_id = 3
                   AND monto_final = 270 AND estado = 'PARCIAL') THEN
    RAISE EXCEPTION 'La cuenta 3681 ya no está como se diagnosticó (alumno 1192, concepto 3, S/270, PARCIAL).';
  END IF;
  IF (SELECT coalesce(sum(monto_pagado), 0) FROM pagos
      WHERE cuenta_id = 3681 AND estado_validacion = 'APROBADO') <> 230 THEN
    RAISE EXCEPTION 'Lo pagado y aprobado de la cuenta 3681 no es S/230.';
  END IF;
  IF EXISTS (SELECT 1 FROM pagos WHERE cuenta_id = 3681 AND estado_validacion = 'PENDIENTE') THEN
    RAISE EXCEPTION 'La cuenta 3681 tiene pagos pendientes de validar.';
  END IF;
  IF (SELECT count(*) FROM inscripciones_deudas_link WHERE cuenta_id = 3681) <> 3 THEN
    RAISE EXCEPTION 'La cuenta 3681 no tiene exactamente 3 links.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM catalogo_conceptos
                 WHERE id = 8 AND precio_base = 230 AND cantidad_clases_semanal = 3) THEN
    RAISE EXCEPTION 'El concepto 8 no es el plan antiguo de 3 clases a S/230.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM catalogo_conceptos WHERE id = 6 AND precio_base = 80 AND cantidad_clases_semanal = 1)
     OR NOT EXISTS (SELECT 1 FROM catalogo_conceptos WHERE id = 7 AND precio_base = 150 AND cantidad_clases_semanal = 2) THEN
    RAISE EXCEPTION 'Los planes antiguos de 1 día (S/80) y 2 días (S/150) no están como se diagnosticó.';
  END IF;
  IF (SELECT string_agg(l.id || ':' || ca.sede_id, ',' ORDER BY l.id)
      FROM inscripciones_deudas_link l
      JOIN inscripciones i ON i.id = l.inscripcion_id
      JOIN horarios_clases h ON h.id = i.horario_id
      JOIN canchas ca ON ca.id = h.cancha_id
      WHERE l.cuenta_id = 3681) <> '6294:14,6295:13,6296:13' THEN
    RAISE EXCEPTION 'Los links de la cuenta 3681 no son 6294 (Pueblo Libre) y 6295/6296 (Magdalena).';
  END IF;
END $$;

-- Respaldo: la fila de la cuenta (link_id NULL) y cada link
CREATE TABLE bk_cuenta_3681 AS
SELECT NULL::int AS link_id, concepto_id, monto_final, estado, actualizado_en, NULL::numeric AS monto_asignado
FROM cuentas_por_cobrar WHERE id = 3681
UNION ALL
SELECT id, NULL, NULL, NULL, NULL, monto_asignado
FROM inscripciones_deudas_link WHERE cuenta_id = 3681;

UPDATE cuentas_por_cobrar
SET concepto_id = 8, monto_final = 230, estado = 'PAGADA', actualizado_en = now()
WHERE id = 3681;

-- Reparto G-17 v2: Pueblo Libre (link 6294) S/80; Magdalena S/150 en partes iguales (75 + 75)
UPDATE inscripciones_deudas_link
SET monto_asignado = CASE WHEN id = 6294 THEN 80 ELSE 75 END
WHERE cuenta_id = 3681;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cuentas_por_cobrar
                 WHERE id = 3681 AND concepto_id = 8 AND monto_final = 230 AND estado = 'PAGADA') THEN
    RAISE EXCEPTION 'La cuenta 3681 no quedó en concepto 8, S/230, PAGADA. Se revierte todo.';
  END IF;
  IF (SELECT string_agg(monto_asignado::text, ',' ORDER BY id) FROM inscripciones_deudas_link WHERE cuenta_id = 3681)
     <> '80.00,75.00,75.00' THEN
    RAISE EXCEPTION 'El puente no quedó en 80 (Pueblo Libre), 75, 75 (Magdalena). Se revierte todo.';
  END IF;
  RAISE NOTICE 'Cuenta 3681 ajustada: concepto 8, S/230, PAGADA, links 80 (Pueblo Libre) / 75 / 75 (Magdalena).';
END $$;

COMMIT;

-- Después: monto_final = pagado = suma del puente = 230
SELECT c.id, c.concepto_id, c.monto_final, c.estado,
       (SELECT sum(monto_pagado) FROM pagos WHERE cuenta_id = c.id AND estado_validacion = 'APROBADO') AS pagado,
       (SELECT sum(monto_asignado) FROM inscripciones_deudas_link WHERE cuenta_id = c.id) AS suma_links,
       (SELECT string_agg(id || ':' || monto_asignado, ' ' ORDER BY id) FROM inscripciones_deudas_link WHERE cuenta_id = c.id) AS links
FROM cuentas_por_cobrar c WHERE c.id = 3681;
