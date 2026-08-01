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

-- =================== Turnos, horas y recursos administrables ===================
-- reservas.turno y reservas.hora siguen siendo texto libre (no FK): estas
-- tablas solo alimentan las opciones que se ofrecen en el formulario y en el
-- panel de administración, no restringen lo ya guardado en reservas.

CREATE TABLE IF NOT EXISTS turnos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  etiqueta TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS horas (
  id BIGSERIAL PRIMARY KEY,
  turno_id BIGINT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  etiqueta TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  UNIQUE (turno_id, etiqueta)
);

CREATE TABLE IF NOT EXISTS recursos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recurso_turnos (
  recurso_id BIGINT NOT NULL REFERENCES recursos(id) ON DELETE CASCADE,
  turno_id BIGINT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  PRIMARY KEY (recurso_id, turno_id)
);

-- Semilla de ejemplo (el mismo esquema Matutino/Vespertino de este liceo).
-- Se puede editar o borrar por completo desde el panel de administrador
-- una vez instalada la app.
INSERT INTO turnos (nombre, etiqueta, orden) VALUES
  ('matutino', 'Matutino', 1),
  ('vespertino', 'Vespertino', 2)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO horas (turno_id, etiqueta, orden)
SELECT t.id, h.etiqueta, h.orden
FROM turnos t
JOIN (VALUES
  ('matutino', '1era', 1), ('matutino', '2da', 2), ('matutino', '3era', 3), ('matutino', '4ta', 4),
  ('matutino', '5ta', 5), ('matutino', '6ta', 6), ('matutino', '7ma', 7), ('matutino', '8va', 8),
  ('vespertino', '0', 0), ('vespertino', '1era', 1), ('vespertino', '2da', 2), ('vespertino', '3era', 3),
  ('vespertino', '4ta', 4), ('vespertino', '5ta', 5), ('vespertino', '6ta', 6), ('vespertino', '7ma', 7)
) AS h(turno_nombre, etiqueta, orden) ON h.turno_nombre = t.nombre
ON CONFLICT (turno_id, etiqueta) DO NOTHING;

INSERT INTO recursos (nombre)
SELECT nombre FROM (VALUES
  ('Cañón'), ('TV Planta Baja'), ('TV Planta Alta'), ('TV 43"'), ('Caja TV 50"'), ('Caja TV 43'),
  ('Sala de Informática'), ('Salón 10')
) AS r(nombre)
WHERE NOT EXISTS (SELECT 1 FROM recursos WHERE recursos.nombre = r.nombre);

INSERT INTO recurso_turnos (recurso_id, turno_id)
SELECT r.id, t.id
FROM recursos r
JOIN turnos t ON t.nombre IN ('matutino', 'vespertino')
WHERE r.nombre IN ('Cañón', 'TV Planta Baja', 'TV Planta Alta', 'TV 43"', 'Caja TV 50"', 'Caja TV 43')
ON CONFLICT DO NOTHING;

INSERT INTO recurso_turnos (recurso_id, turno_id)
SELECT r.id, t.id
FROM recursos r
JOIN turnos t ON t.nombre = 'vespertino'
WHERE r.nombre IN ('Sala de Informática', 'Salón 10')
ON CONFLICT DO NOTHING;
