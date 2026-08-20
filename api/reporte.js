const { sql } = require("./_db");
const { verificarSesion } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ status: "error", message: "Método no permitido" });
    return;
  }

  const rol = verificarSesion(req);
  if (!rol) {
    res.status(401).json({ status: "error", message: "No autorizado" });
    return;
  }

  try {
    const fecha = req.query && req.query.fecha;
    const docente = req.query && req.query.docente && req.query.docente.trim();
    const docenteLike = docente ? "%" + docente + "%" : null;

    let rows;
    if (fecha && docenteLike) {
      rows = await sql`
        SELECT id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
               cantidad_horas AS "cantidadHoras",
               fecha_reserva AS "fechaReserva"
        FROM reservas
        WHERE fecha = ${fecha} AND (nombre || ' ' || apellido) ILIKE ${docenteLike}
        ORDER BY hora
      `;
    } else if (fecha) {
      rows = await sql`
        SELECT id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
               cantidad_horas AS "cantidadHoras",
               fecha_reserva AS "fechaReserva"
        FROM reservas
        WHERE fecha = ${fecha}
        ORDER BY hora
      `;
    } else if (docenteLike) {
      rows = await sql`
        SELECT id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
               cantidad_horas AS "cantidadHoras",
               fecha_reserva AS "fechaReserva"
        FROM reservas
        WHERE (nombre || ' ' || apellido) ILIKE ${docenteLike}
        ORDER BY fecha DESC, hora
      `;
    } else {
      rows = await sql`
        SELECT id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
               cantidad_horas AS "cantidadHoras",
               fecha_reserva AS "fechaReserva"
        FROM reservas
        ORDER BY fecha DESC, hora
      `;
    }

    res.status(200).json({ status: "ok", reservas: rows, rol: rol });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Error consultando el reporte" });
  }
};
