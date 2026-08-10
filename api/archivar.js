const { sql } = require("./_db");
const { verificarSesion } = require("./_auth");
const { archivarEnSheet } = require("./_sheets");
const { fechaActual } = require("./_fecha");

function autorizado(req) {
  const auth = req.headers.authorization || "";
  if (process.env.CRON_SECRET && auth === "Bearer " + process.env.CRON_SECRET) {
    return true;
  }
  return verificarSesion(req) === "admin";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ status: "error", message: "Método no permitido" });
    return;
  }

  if (!autorizado(req)) {
    res.status(401).json({ status: "error", message: "No autorizado" });
    return;
  }

  try {
    const filas = await sql`
      SELECT id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
             cantidad_horas AS "cantidadHoras",
             fecha_reserva AS "fechaReserva"
      FROM reservas
      WHERE fecha < ${fechaActual()}
      ORDER BY fecha, hora
    `;

    if (filas.length === 0) {
      res.status(200).json({ status: "ok", archivadas: 0 });
      return;
    }

    const valores = filas.map(function (r) {
      return [r.nombre, r.apellido, r.recurso, r.fecha, r.turno, r.hora, r.cantidadHoras, r.fechaReserva];
    });

    await archivarEnSheet(valores);

    const ids = filas.map(function (r) { return r.id; });
    await sql`DELETE FROM reservas WHERE id = ANY(${ids})`;

    res.status(200).json({ status: "ok", archivadas: filas.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Error archivando reservas" });
  }
};
