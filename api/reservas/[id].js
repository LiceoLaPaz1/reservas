const { sql } = require("../_db");
const { verificarSesion } = require("../_auth");

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "DELETE") {
    if (verificarSesion(req) !== "admin") {
      res.status(401).json({ status: "error", message: "No autorizado" });
      return;
    }

    try {
      const rows = await sql`DELETE FROM reservas WHERE id = ${id} RETURNING id`;
      if (rows.length === 0) {
        res.status(404).json({ status: "error", message: "Reserva no encontrada" });
        return;
      }
      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error cancelando la reserva" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
