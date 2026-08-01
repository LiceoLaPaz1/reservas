CREATE TABLE IF NOT EXISTS reservas (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  fecha DATE NOT NULL,
  turno TEXT NOT NULL,
  hora TEXT NOT NULL,
  recurso TEXT NOT NULL,
  cantidad_horas INT NOT NULL,
  fecha_reserva TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservas_recurso_unico UNIQUE (fecha, turno, hora, recurso)
);

-- Evita que el mismo docente tenga dos reservas (de recursos distintos)
-- para el mismo horario, ya que no puede usar dos cosas a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS reservas_docente_horario_unico
  ON reservas (fecha, turno, hora, lower(trim(nombre)), lower(trim(apellido)));
