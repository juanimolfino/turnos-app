-- Paso 1: migrar datos. 'flex' queda obsoleto y 'simple' lo reemplaza en
-- significado. NO se borra ninguna fila: solo se reasigna el type.
-- (El valor 'flex' se retira del enum en una migración posterior, una vez que
-- esta corrió y no quedan filas con type='flex'.)
UPDATE "bookings" SET "type" = 'simple' WHERE "type" = 'flex';
