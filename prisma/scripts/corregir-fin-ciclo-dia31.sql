-- Corrige los ciclos que el cron VERDUGO cerró en fecha_inscripcion + 30 (día 31) antes
-- del fix de fix/soporte-jorge. Regla actual: último día = fecha_inscripcion + 29, que es
-- lo que escribe hoy el VERDUGO.
--
-- ⚠️ Correr DESPUÉS de desplegar el código del fix. Mientras el código viejo siga
-- corriendo, el VERDUGO sigue cerrando ciclos con +30 y quedarían sin corregir.
--
-- Selecciona por CONDICIÓN (no por ids ni por un conteo fijo), así que en cada base
-- toma todas las filas que cumplan:
--   - fecha_fin_ciclo - fecha_inicio_ciclo = 30, en cualquier fecha, o
--     fecha_fin_ciclo - fecha_inicio_ciclo = 31 con fin >= 01/10/2026 (pedido de Valerio:
--     ciclos cuya fecha_inscripcion quedó 1 día después del inicio del link)
--     Los de 33, 35, 36, 39 días NO entran: requieren otra decisión.
--   - la inscripción está FINALIZADO
--   - fin = día de Lima de fecha_inscripcion + 30 (lo que escribía el VERDUGO)
--   - no hay un link posterior en la misma inscripción (no abre huecos)
--   - no hay asistencia registrada justo en el día que se quita
--
-- La corrección es fin = fin - 1 (= fecha_inscripcion + 29): solo se quita el día 31.
-- En los de diferencia 30 es lo mismo que inicio + 29.
--
-- Guarda el fin anterior en bk_fin_ciclo_dia31 y aborta todo (ROLLBACK) si lo
-- corregido no coincide con lo respaldado. Falla si la tabla de respaldo ya existe,
-- así no se aplica dos veces sobre el mismo respaldo.
--
-- Uso:     psql "$DATABASE_URL" -f prisma/scripts/corregir-fin-ciclo-dia31.sql
-- Revertir: psql "$DATABASE_URL" -f prisma/scripts/revertir-fin-ciclo-dia31.sql
--          (restaura el fin anterior desde bk_fin_ciclo_dia31 y borra esa tabla).
-- Cuando ya no haga falta revertir: DROP TABLE bk_fin_ciclo_dia31;

-- Antes: candidatos (total y por tipo)
SELECT count(*) AS candidatos,
       count(*) FILTER (WHERE l.fecha_fin_ciclo - l.fecha_inicio_ciclo = 30) AS de_30,
       count(*) FILTER (WHERE l.fecha_fin_ciclo - l.fecha_inicio_ciclo = 31) AS de_31_desde_0110
FROM inscripciones_deudas_link l
JOIN inscripciones i ON i.id = l.inscripcion_id
WHERE ( l.fecha_fin_ciclo - l.fecha_inicio_ciclo = 30
     OR (l.fecha_fin_ciclo - l.fecha_inicio_ciclo = 31 AND l.fecha_fin_ciclo >= DATE '2026-10-01') )
  AND i.estado = 'FINALIZADO'
  AND l.fecha_fin_ciclo = (timezone('America/Lima', i.fecha_inscripcion AT TIME ZONE 'UTC'))::date + 30
  AND NOT EXISTS (SELECT 1 FROM inscripciones_deudas_link n
                  WHERE n.inscripcion_id = l.inscripcion_id AND n.id <> l.id
                    AND n.fecha_inicio_ciclo > l.fecha_inicio_ciclo)
  AND NOT EXISTS (SELECT 1 FROM registros_asistencia r
                  WHERE r.inscripcion_id = l.inscripcion_id AND r.fecha = l.fecha_fin_ciclo);

BEGIN;

CREATE TABLE bk_fin_ciclo_dia31 AS
SELECT l.id, l.fecha_fin_ciclo AS fecha_fin_ciclo_anterior, now() AS respaldado_en
FROM inscripciones_deudas_link l
JOIN inscripciones i ON i.id = l.inscripcion_id
WHERE ( l.fecha_fin_ciclo - l.fecha_inicio_ciclo = 30
     OR (l.fecha_fin_ciclo - l.fecha_inicio_ciclo = 31 AND l.fecha_fin_ciclo >= DATE '2026-10-01') )
  AND i.estado = 'FINALIZADO'
  AND l.fecha_fin_ciclo = (timezone('America/Lima', i.fecha_inscripcion AT TIME ZONE 'UTC'))::date + 30
  AND NOT EXISTS (SELECT 1 FROM inscripciones_deudas_link n
                  WHERE n.inscripcion_id = l.inscripcion_id AND n.id <> l.id
                    AND n.fecha_inicio_ciclo > l.fecha_inicio_ciclo)
  AND NOT EXISTS (SELECT 1 FROM registros_asistencia r
                  WHERE r.inscripcion_id = l.inscripcion_id AND r.fecha = l.fecha_fin_ciclo);

UPDATE inscripciones_deudas_link l
SET fecha_fin_ciclo = l.fecha_fin_ciclo - 1
FROM bk_fin_ciclo_dia31 b
WHERE l.id = b.id
  AND l.fecha_fin_ciclo = b.fecha_fin_ciclo_anterior;

DO $$
DECLARE
  respaldados int;
  corregidos  int;
BEGIN
  SELECT count(*) INTO respaldados FROM bk_fin_ciclo_dia31;
  SELECT count(*) INTO corregidos
  FROM inscripciones_deudas_link l JOIN bk_fin_ciclo_dia31 b ON b.id = l.id
  WHERE l.fecha_fin_ciclo = b.fecha_fin_ciclo_anterior - 1;
  IF corregidos <> respaldados THEN
    RAISE EXCEPTION 'Corregidos (%) <> respaldados (%). Se revierte todo.', corregidos, respaldados;
  END IF;
  RAISE NOTICE 'Respaldados: %, corregidos: %', respaldados, corregidos;
END $$;

COMMIT;

-- Después: quedan 0 candidatos y todos los respaldados tienen fin = anterior - 1
SELECT count(*) AS respaldados,
       count(*) FILTER (WHERE l.fecha_fin_ciclo = b.fecha_fin_ciclo_anterior - 1) AS corregidos
FROM bk_fin_ciclo_dia31 b JOIN inscripciones_deudas_link l ON l.id = b.id;
