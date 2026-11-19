-- Revierte prisma/scripts/ajustar-cuenta-3681-antiguo.sql: devuelve la cuenta 3681 y
-- sus links a lo guardado en bk_cuenta_3681 y borra esa tabla.
-- Solo si la cuenta sigue como la dejó el ajuste (concepto 8, S/230, PAGADA, sin pagos
-- nuevos); si no, aborta (ROLLBACK) y no restaura nada.
--
-- Uso: psql "$DATABASE_URL" -f prisma/scripts/revertir-cuenta-3681-antiguo.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cuentas_por_cobrar
                 WHERE id = 3681 AND concepto_id = 8 AND monto_final = 230 AND estado = 'PAGADA') THEN
    RAISE EXCEPTION 'La cuenta 3681 ya no está como la dejó el ajuste. No se revierte.';
  END IF;
  IF (SELECT coalesce(sum(monto_pagado), 0) FROM pagos WHERE cuenta_id = 3681) <> 230 THEN
    RAISE EXCEPTION 'La cuenta 3681 tiene pagos nuevos desde el ajuste. No se revierte.';
  END IF;
END $$;

UPDATE cuentas_por_cobrar c
SET concepto_id = b.concepto_id, monto_final = b.monto_final, estado = b.estado, actualizado_en = b.actualizado_en
FROM bk_cuenta_3681 b
WHERE c.id = 3681 AND b.link_id IS NULL;

UPDATE inscripciones_deudas_link l
SET monto_asignado = b.monto_asignado
FROM bk_cuenta_3681 b
WHERE l.id = b.link_id;

DO $$
DECLARE
  respaldados int;
  restaurados int;
BEGIN
  SELECT count(*) INTO respaldados FROM bk_cuenta_3681 WHERE link_id IS NOT NULL;
  SELECT count(*) INTO restaurados
  FROM inscripciones_deudas_link l JOIN bk_cuenta_3681 b ON b.link_id = l.id
  WHERE l.monto_asignado = b.monto_asignado;
  IF restaurados <> respaldados OR NOT EXISTS (
       SELECT 1 FROM cuentas_por_cobrar c JOIN bk_cuenta_3681 b ON b.link_id IS NULL
       WHERE c.id = 3681 AND c.concepto_id = b.concepto_id AND c.monto_final = b.monto_final AND c.estado = b.estado) THEN
    RAISE EXCEPTION 'La restauración no cuadra con el respaldo. Se revierte todo.';
  END IF;
  RAISE NOTICE 'Cuenta 3681 restaurada (% links).', restaurados;
END $$;

DROP TABLE bk_cuenta_3681;

COMMIT;
