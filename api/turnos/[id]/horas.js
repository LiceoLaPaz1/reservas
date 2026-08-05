const { sql } = require("../../_db");
const { verificarSesion } = require("../../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ status: "error", message: "Método no permitido" });
    return;
  }

  if (!verificarSesion(req)) {
    res.status(401).json({ status: "error", message: "No autorizado" });
    return;
  }

  const { id } = req.query;

  try {
    const { etiqueta, orden, horaInicio, horaFin } = req.body || {};
    if (!etiqueta) {
      res.status(400).json({ status: "error", message: "Falta la etiqueta de la hora" });
      return;
    }

    const rows = await sql`
      INSERT INTO horas (turno_id, etiqueta, orden, hora_inicio, hora_fin)
      VALUES (${id}, ${etiqueta}, ${orden || 0}, ${horaInicio || null}, ${horaFin || null})
      RETURNING id, turno_id AS "turnoId", etiqueta, orden,
                to_char(hora_inicio, 'HH24:MI') AS "horaInicio",
                to_char(hora_fin, 'HH24:MI') AS "horaFin"
    `;
    res.status(201).json({ status: "success", hora: rows[0] });
  } catch (error) {
    if (error && error.code === "23505") {
      res.status(409).json({ status: "conflict", message: "Ese turno ya tiene una hora con esa etiqueta" });
      return;
    }
    if (error && error.code === "23503") {
      res.status(404).json({ status: "error", message: "Turno no encontrado" });
      return;
    }
    console.error(error);
    res.status(500).json({ status: "error", message: "Error agregando la hora" });
  }
};
