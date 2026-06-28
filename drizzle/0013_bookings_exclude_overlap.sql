-- CAPA A (anti-doble-booking): constraint EXCLUDE que hace físicamente imposible
-- que existan dos bookings NO cancelados solapados en la misma cancha. Última
-- línea de defensa: aunque el chequeo de software (capa B) fallara en una carrera
-- concurrente, la base rechaza la segunda inserción.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- El sistema guarda date ('YYYY-MM-DD'), start_time y end_time ('HH:MM') como text.
-- Para detectar solapamiento necesitamos un RANGO temporal. El cast text->timestamp
-- es técnicamente STABLE (depende de DateStyle), así que lo envolvemos en una
-- función propia marcada IMMUTABLE: los strings son ISO de formato fijo, así que
-- el resultado es determinístico y la usamos directo en la expresión del índice
-- (más robusto y simple que una columna generada con casts).
CREATE OR REPLACE FUNCTION booking_tsrange(d text, s text, e text)
  RETURNS tsrange
  LANGUAGE sql
  IMMUTABLE
AS $$
  -- tsrange por defecto es '[)': inicio inclusivo, fin exclusivo. Coincide con el
  -- overlap half-open del resto del sistema (turnos pegados, ej. 19:00-20:30 y
  -- 20:30-22:00, NO se solapan). Medianoche ya está normalizada a '23:59'.
  SELECT tsrange((d || ' ' || s)::timestamp, (d || ' ' || e)::timestamp)
$$;

-- court_id igual (=) y rangos que se solapan (&&). WHERE status <> 'cancelado':
-- las canceladas NO bloquean (coherente con la regla de disponibilidad).
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "court_id" WITH =,
    booking_tsrange("date", "start_time", "end_time") WITH &&
  )
  WHERE ("status" <> 'cancelado');
