const { sql } = require("../_db");
const { verificarSesion } = require("../_auth");

module.exports = async function handler(req, res) {
  if (!verificarSesion(req)) {
    res.status(401).json({ status: "error", message: "No autorizado" });
    return;
  }

  const { id } = req.query;

  if (req.method === "PUT") {
    try {
      const { etiqueta, orden, horaInicio, horaFin } = req.body || {};

      const rows = await sql`
        UPDATE horas
        SET etiqueta = COALESCE(${etiqueta}, etiqueta),
            orden = COALESCE(${orden}, orden),
            hora_inicio = COALESCE(${horaInicio || null}, hora_inicio),
            hora_fin = COALESCE(${horaFin || null}, hora_fin)
        WHERE id = ${id}
        RETURNING id, turno_id AS "turnoId", etiqueta, orden,
                  to_char(hora_inicio, 'HH24:MI') AS "horaInicio",
                  to_char(hora_fin, 'HH24:MI') AS "horaFin"
      `;
      if (rows.length === 0) {
        res.status(404).json({ status: "error", message: "Hora no encontrada" });
        return;
      }
      res.status(200).json({ status: "ok", hora: rows[0] });
    } catch (error) {
      if (error && error.code === "23505") {
        res.status(409).json({ status: "conflict", message: "Ese turno ya tiene una hora con esa etiqueta" });
        return;
      }
      console.error(error);
      res.status(500).json({ status: "error", message: "Error editando la hora" });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const rows = await sql`DELETE FROM horas WHERE id = ${id} RETURNING id`;
      if (rows.length === 0) {
        res.status(404).json({ status: "error", message: "Hora no encontrada" });
        return;
      }
      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error eliminando la hora" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
