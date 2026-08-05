const { sql } = require("./_db");
const { fechaActual, horaActual } = require("./_fecha");

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

      if (!nombre || !apellido || !fecha || !turno || !hora || !recurso) {
        res.status(400).json({ status: "error", message: "Faltan datos de la reserva" });
        return;
      }

      const hoy = fechaActual();

      if (fecha < hoy) {
        res.status(400).json({ status: "error", message: "No se pueden reservar fechas pasadas" });
        return;
      }

      if (fecha === hoy) {
        const filasHora = await sql`
          SELECT to_char(h.hora_inicio, 'HH24:MI') AS "horaInicio"
          FROM horas h
          JOIN turnos t ON t.id = h.turno_id
          WHERE t.nombre = ${turno} AND h.etiqueta = ${hora}
        `;
        const horaInicio = filasHora[0] && filasHora[0].horaInicio;
        if (horaInicio && horaInicio <= horaActual()) {
          res.status(400).json({ status: "error", message: "Esa hora ya pasó" });
          return;
        }
      }

      const rows = await sql`
        INSERT INTO reservas (nombre, apellido, fecha, turno, hora, recurso, cantidad_horas)
        VALUES (${nombre}, ${apellido}, ${fecha}, ${turno}, ${hora}, ${recurso}, ${cantidadHoras || 1})
        RETURNING id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
                  cantidad_horas AS "cantidadHoras",
                  fecha_reserva AS "fechaReserva"
      `;
      res.status(201).json({ status: "success", reserva: rows[0] });
    } catch (error) {
      if (error && error.code === "23505") {
        const esConflictoDocente = error.constraint && error.constraint.indexOf("docente") !== -1;
        res.status(409).json({
          status: "conflict",
          message: esConflictoDocente
            ? "Ya tenés otra reserva en ese mismo horario"
            : "Ese recurso ya está reservado en ese horario"
        });
        return;
      }
      console.error(error);
      res.status(500).json({ status: "error", message: "Error guardando la reserva" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
