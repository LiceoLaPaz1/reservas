const { sql } = require("./_db");

function hoyISO() {
  return new Date().toISOString().split("T")[0];
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const rows = await sql`
        SELECT id, nombre, apellido, fecha, turno, hora, recurso,
               cantidad_horas AS "cantidadHoras",
               fecha_reserva AS "fechaReserva"
        FROM reservas
        WHERE fecha >= ${hoyISO()}
        ORDER BY fecha, hora
      `;
      res.status(200).json({ status: "ok", reservas: rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error consultando reservas" });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { nombre, apellido, fecha, turno, hora, recurso, cantidadHoras } = req.body || {};

      if (!nombre || !apellido || !fecha || !turno || !hora || !recurso) {
        res.status(400).json({ status: "error", message: "Faltan datos de la reserva" });
        return;
      }

      const rows = await sql`
        INSERT INTO reservas (nombre, apellido, fecha, turno, hora, recurso, cantidad_horas)
        VALUES (${nombre}, ${apellido}, ${fecha}, ${turno}, ${hora}, ${recurso}, ${cantidadHoras || 1})
        RETURNING id, nombre, apellido, fecha, turno, hora, recurso,
                  cantidad_horas AS "cantidadHoras",
                  fecha_reserva AS "fechaReserva"
      `;
      res.status(201).json({ status: "success", reserva: rows[0] });
    } catch (error) {
      if (error && error.code === "23505") {
        res.status(409).json({ status: "conflict", message: "Ese recurso ya está reservado en ese horario" });
        return;
      }
      console.error(error);
      res.status(500).json({ status: "error", message: "Error guardando la reserva" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
