-- Normaliza la hora de fin inválida "24:00" → "23:59" en bookings existentes.
-- El formato es HH:MM 24h (máx 23:59); "24:00" rompería la lógica de
-- disponibilidad. Se usa 23:59 (no "00:00", que al ser < cualquier start
-- rompería la comparación de solapamiento dentro del día).
UPDATE "bookings" SET "end_time" = '23:59' WHERE "end_time" = '24:00';
