const { sql } = require("./_db");
const { fechaActual } = require("./_fecha");
const { crearBloqueReserva } = require("./_reservas_helpers");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const rows = await sql`
        SELECT id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
               cantidad_horas AS "cantidadHoras",
               fecha_reserva AS "fechaReserva"
        FROM reservas
        WHERE fecha >= ${fechaActual()}
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

      const resultado = await crearBloqueReserva({ nombre, apellido, fecha, turno, hora, recurso, cantidadHoras });

      if (!resultado.ok) {
        res.status(resultado.status).json({
          status: resultado.status === 409 ? "conflict" : "error",
          message: resultado.message
        });
        return;
      }

      res.status(201).json({ status: "success", reserva: resultado.reservas[0], reservas: resultado.reservas });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error guardando la reserva" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
