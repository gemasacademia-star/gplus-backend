-- Revierte prisma/scripts/corregir-fin-ciclo-dia31.sql: devuelve fecha_fin_ciclo al
-- valor guardado en bk_fin_ciclo_dia31 y borra esa tabla, para poder volver a aplicar.
-- Solo toca filas que siguen como las dejó la corrección (fin = fin anterior - 1, que
-- también cubre los ciclos de 31 días); si alguna cambió después, aborta todo
-- (ROLLBACK) y no restaura nada.
--
-- Uso: psql "$DATABASE_URL" -f prisma/scripts/revertir-fin-ciclo-dia31.sql

BEGIN;

UPDATE inscripciones_deudas_link l
SET fecha_fin_ciclo = b.fecha_fin_ciclo_anterior
FROM bk_fin_ciclo_dia31 b
WHERE l.id = b.id
  AND l.fecha_fin_ciclo = b.fecha_fin_ciclo_anterior - 1;

DO $$
DECLARE
  respaldados  int;
  restaurados  int;
BEGIN
  SELECT count(*) INTO respaldados FROM bk_fin_ciclo_dia31;
  SELECT count(*) INTO restaurados
  FROM inscripciones_deudas_link l JOIN bk_fin_ciclo_dia31 b ON b.id = l.id
  WHERE l.fecha_fin_ciclo = b.fecha_fin_ciclo_anterior;
  IF restaurados <> respaldados THEN
    RAISE EXCEPTION 'Restaurados (%) <> respaldados (%). Se revierte todo.', restaurados, respaldados;
  END IF;
  RAISE NOTICE 'Restaurados: %', restaurados;
END $$;

DROP TABLE bk_fin_ciclo_dia31;

COMMIT;
