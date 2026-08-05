const { sql } = require("./_db");
const { verificarSesion } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const turnos = await sql`SELECT id, nombre, etiqueta, orden FROM turnos ORDER BY orden, id`;
      const horas = await sql`
        SELECT id, turno_id AS "turnoId", etiqueta, orden,
               to_char(hora_inicio, 'HH24:MI') AS "horaInicio",
               to_char(hora_fin, 'HH24:MI') AS "horaFin"
        FROM horas
        ORDER BY orden, id
      `;

      const resultado = turnos.map(function (t) {
        return {
          id: t.id,
          nombre: t.nombre,
          etiqueta: t.etiqueta,
          horas: horas.filter(function (h) { return h.turnoId === t.id; })
        };
      });

      res.status(200).json({ status: "ok", turnos: resultado });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error consultando turnos" });
    }
    return;
  }

  if (req.method === "POST") {
    if (!verificarSesion(req)) {
      res.status(401).json({ status: "error", message: "No autorizado" });
      return;
    }

    try {
      const { nombre, etiqueta, orden } = req.body || {};
      if (!nombre || !etiqueta) {
        res.status(400).json({ status: "error", message: "Faltan datos del turno" });
        return;
      }

      const rows = await sql`
        INSERT INTO turnos (nombre, etiqueta, orden)
        VALUES (${nombre}, ${etiqueta}, ${orden || 0})
        RETURNING id, nombre, etiqueta, orden
      `;
      res.status(201).json({ status: "success", turno: rows[0] });
    } catch (error) {
      if (error && error.code === "23505") {
        res.status(409).json({ status: "conflict", message: "Ya existe un turno con ese nombre" });
        return;
      }
      console.error(error);
      res.status(500).json({ status: "error", message: "Error creando el turno" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
