const { sql } = require("../_db");
const { verificarSesion } = require("../_auth");

module.exports = async function handler(req, res) {
  if (verificarSesion(req) !== "admin") {
    res.status(401).json({ status: "error", message: "No autorizado" });
    return;
  }

  const { id } = req.query;

  if (req.method === "PUT") {
    try {
      const { nombre, etiqueta, orden } = req.body || {};
      const rows = await sql`
        UPDATE turnos
        SET nombre = COALESCE(${nombre}, nombre),
            etiqueta = COALESCE(${etiqueta}, etiqueta),
            orden = COALESCE(${orden}, orden)
        WHERE id = ${id}
        RETURNING id, nombre, etiqueta, orden
      `;
      if (rows.length === 0) {
        res.status(404).json({ status: "error", message: "Turno no encontrado" });
        return;
      }
      res.status(200).json({ status: "ok", turno: rows[0] });
    } catch (error) {
      if (error && error.code === "23505") {
        res.status(409).json({ status: "conflict", message: "Ya existe un turno con ese nombre" });
        return;
      }
      console.error(error);
      res.status(500).json({ status: "error", message: "Error editando el turno" });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const rows = await sql`DELETE FROM turnos WHERE id = ${id} RETURNING id`;
      if (rows.length === 0) {
        res.status(404).json({ status: "error", message: "Turno no encontrado" });
        return;
      }
      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error eliminando el turno" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
