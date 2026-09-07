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

      // Etiquetas de hora del turno, en orden, para poder expandir la
      // cantidad de horas pedida a la lista real de horas que cubre
      // (ej. inicio "1era" + 3 horas -> ["1era", "2da", "3era"]).
      const filasHorasTurno = await sql`
        SELECT h.etiqueta, to_char(h.hora_inicio, 'HH24:MI') AS "horaInicio"
        FROM horas h
        JOIN turnos t ON t.id = h.turno_id
        WHERE t.nombre = ${turno}
        ORDER BY h.orden
      `;
      const etiquetasTurno = filasHorasTurno.map(function (h) { return h.etiqueta; });
      const indiceHora = etiquetasTurno.indexOf(hora);

      if (indiceHora === -1) {
        res.status(400).json({ status: "error", message: "Hora inválida para ese turno" });
        return;
      }

      const cantidad = cantidadHoras || 1;
      if (indiceHora + cantidad > etiquetasTurno.length) {
        res.status(400).json({ status: "error", message: "No hay suficientes horas disponibles en ese turno" });
        return;
      }

      const horasCubiertas = etiquetasTurno.slice(indiceHora, indiceHora + cantidad);

      if (fecha === hoy) {
        const horaInicio = filasHorasTurno[indiceHora].horaInicio;
        if (horaInicio && horaInicio <= horaActual()) {
          res.status(400).json({ status: "error", message: "Esa hora ya pasó" });
          return;
        }
      }

      // Se inserta una fila por cada hora cubierta (no solo la de inicio),
      // todas en una misma transacción: así el recurso queda protegido en
      // todo el rango reservado, no solo en la primera hora, y si alguna
      // hora del rango choca con otra reserva, no queda guardada ninguna.
      const inserts = horasCubiertas.map(function (h) {
        return sql`
          INSERT INTO reservas (nombre, apellido, fecha, turno, hora, recurso, cantidad_horas)
          VALUES (${nombre}, ${apellido}, ${fecha}, ${turno}, ${h}, ${recurso}, ${cantidad})
          RETURNING id, nombre, apellido, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, hora, recurso,
                    cantidad_horas AS "cantidadHoras",
                    fecha_reserva AS "fechaReserva"
        `;
      });

      const resultados = await sql.transaction(inserts);
      const filasCreadas = resultados.map(function (filas) { return filas[0]; });

      res.status(201).json({ status: "success", reserva: filasCreadas[0], reservas: filasCreadas });
    } catch (error) {
      if (error && error.code === "23505") {
        const esConflictoDocente = error.constraint && error.constraint.indexOf("docente") !== -1;
        res.status(409).json({
          status: "conflict",
          message: esConflictoDocente
            ? "Ya tenés otra reserva en ese mismo horario"
            : "Ese recurso ya está reservado en alguna de las horas seleccionadas"
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
