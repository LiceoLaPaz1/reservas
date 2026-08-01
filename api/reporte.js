const { sql } = require("./_db");
const { verificarSesion } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ status: "error", message: "Método no permitido" });
    return;
  }

  if (!verificarSesion(req)) {
    res.status(401).json({ status: "error", message: "No autorizado" });
    return;
  }

  try {
    const fecha = req.query && req.query.fecha;

    const rows = fecha
      ? await sql`
          SELECT id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
                 cantidad_horas AS "cantidadHoras",
                 fecha_reserva AS "fechaReserva"
          FROM reservas
          WHERE fecha = ${fecha}
          ORDER BY hora
        `
      : await sql`
          SELECT id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
                 cantidad_horas AS "cantidadHoras",
                 fecha_reserva AS "fechaReserva"
          FROM reservas
          ORDER BY fecha DESC, hora
        `;

    res.status(200).json({ status: "ok", reservas: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Error consultando el reporte" });
  }
};
