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
  UNIQUE (fecha, turno, hora, recurso)
);
