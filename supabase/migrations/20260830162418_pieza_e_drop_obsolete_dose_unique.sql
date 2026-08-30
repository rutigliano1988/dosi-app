-- La clave natural de `doses` es el PK `id` = `${medId}-${YYYY-MM-DD}-${HH:MM}`
-- desde Pieza A; todos los upserts usan onConflict:'id'. Esta UNIQUE quedo
-- obsoleta y ademas rompe posponer una toma sobre la hora exacta de otra
-- (Pieza E #6). Sin riesgo: ningun codigo usa (user_id, med_id, date, time)
-- como clave de conflicto.
alter table doses drop constraint if exists doses_user_id_med_id_date_time_key;
