-- Cierra los links de ciclo que quedaron con fecha_fin_ciclo NULL en inscripciones que
-- ya terminaron (FINALIZADO / CANCELADO). Se mostraban como "VIGENTE" para siempre.
-- Fin = inicio + 29 días (día 1 = inicio, último día = inicio + 29; misma regla que
-- finCicloEfectivo y el cron VERDUGO desde el fix), nunca posterior a hoy.
-- Uso: psql "$DATABASE_URL" -f prisma/scripts/cerrar-ciclos-huerfanos.sql
-- Primero corre solo el SELECT para revisar; el UPDATE va en transacción.
\echo '--- candidatos'
SELECT count(*) AS links_a_cerrar
FROM inscripciones_deudas_link l JOIN inscripciones i ON i.id = l.inscripcion_id
WHERE l.fecha_fin_ciclo IS NULL AND l.fecha_inicio_ciclo IS NOT NULL
  AND i.estado IN ('FINALIZADO', 'CANCELADO');

BEGIN;
UPDATE inscripciones_deudas_link l
SET fecha_fin_ciclo = LEAST(l.fecha_inicio_ciclo + 29, CURRENT_DATE)
FROM inscripciones i
WHERE i.id = l.inscripcion_id
  AND l.fecha_fin_ciclo IS NULL AND l.fecha_inicio_ciclo IS NOT NULL
  AND i.estado IN ('FINALIZADO', 'CANCELADO');
COMMIT;
