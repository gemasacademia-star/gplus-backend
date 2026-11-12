-- Beneficios marcados como usados que nunca llegaron a un descuento (se perdieron al borrar una reserva).
-- Solo lectura. Revisar cada caso antes de restaurar: UPDATE beneficios_pendientes SET usado=false WHERE id=<id>;
with usados as (
  select b.alumno_id, b.tipo_beneficio_id, count(*) n_usados, max(b.fecha_asignacion) ult
  from beneficios_pendientes b where b.usado group by 1,2),
aplicados as (
  select c.alumno_id, d.tipo_beneficio_id, count(*) n_aplic
  from descuentos_aplicados d join cuentas_por_cobrar c on c.id=d.cuenta_id group by 1,2)
select u.alumno_id, us.nombres||' '||us.apellidos alumno, a.historial, t.nombre beneficio, t.valor_por_defecto monto,
       u.n_usados, coalesce(p.n_aplic,0) n_aplicados, u.n_usados-coalesce(p.n_aplic,0) perdidos, u.ult::date ultima_asignacion,
       (select count(*) from cuentas_por_cobrar c where c.alumno_id=u.alumno_id and c.estado in ('PENDIENTE','POR_VALIDAR','PARCIAL')) cuentas_abiertas
from usados u left join aplicados p using (alumno_id,tipo_beneficio_id)
join usuarios us on us.id=u.alumno_id join alumnos a on a.usuario_id=u.alumno_id join tipos_beneficio t on t.id=u.tipo_beneficio_id
where u.n_usados > coalesce(p.n_aplic,0)
order by u.ult desc;
