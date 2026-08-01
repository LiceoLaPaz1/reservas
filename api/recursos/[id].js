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
      const { nombre, turnoIds } = req.body || {};

      if (nombre) {
        await sql`UPDATE recursos SET nombre = ${nombre} WHERE id = ${id}`;
      }

      if (Array.isArray(turnoIds)) {
        await sql`DELETE FROM recurso_turnos WHERE recurso_id = ${id}`;
        for (const turnoId of turnoIds) {
          await sql`INSERT INTO recurso_turnos (recurso_id, turno_id) VALUES (${id}, ${turnoId}) ON CONFLICT DO NOTHING`;
        }
      }

      const rows = await sql`SELECT id, nombre FROM recursos WHERE id = ${id}`;
      if (rows.length === 0) {
        res.status(404).json({ status: "error", message: "Recurso no encontrado" });
        return;
      }
      res.status(200).json({ status: "ok", recurso: rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error editando el recurso" });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const rows = await sql`DELETE FROM recursos WHERE id = ${id} RETURNING id`;
      if (rows.length === 0) {
        res.status(404).json({ status: "error", message: "Recurso no encontrado" });
        return;
      }
      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error eliminando el recurso" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
