const { sql } = require("../_db");
const { verificarSesion } = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.status(405).json({ status: "error", message: "Método no permitido" });
    return;
  }

  if (!verificarSesion(req)) {
    res.status(401).json({ status: "error", message: "No autorizado" });
    return;
  }

  const { id } = req.query;

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
};
