const { sql } = require("./_db");
const { fechaActual, horaActual } = require("./_fecha");

// Crea una reserva que puede cubrir varias horas seguidas, insertando una
// fila por cada hora cubierta (no solo la de inicio) en una misma
// transacción: así el recurso queda protegido en todo el rango, y si
// alguna hora del rango choca con otra reserva, no queda guardada ninguna.
//
// Devuelve { ok: true, reservas } o { ok: false, status, message }.
async function crearBloqueReserva({ nombre, apellido, fecha, turno, hora, recurso, cantidadHoras }) {
  if (!nombre || !apellido || !fecha || !turno || !hora || !recurso) {
    return { ok: false, status: 400, message: "Faltan datos de la reserva" };
  }

  const hoy = fechaActual();

  if (fecha < hoy) {
    return { ok: false, status: 400, message: "No se pueden reservar fechas pasadas" };
  }

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
    return { ok: false, status: 400, message: "Hora inválida para ese turno" };
  }

  const cantidad = cantidadHoras || 1;
  if (indiceHora + cantidad > etiquetasTurno.length) {
    return { ok: false, status: 400, message: "No hay suficientes horas disponibles en ese turno" };
  }

  const horasCubiertas = etiquetasTurno.slice(indiceHora, indiceHora + cantidad);

  if (fecha === hoy) {
    const horaInicio = filasHorasTurno[indiceHora].horaInicio;
    if (horaInicio && horaInicio <= horaActual()) {
      return { ok: false, status: 400, message: "Esa hora ya pasó" };
    }
  }

  try {
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

    return { ok: true, reservas: filasCreadas };
  } catch (error) {
    if (error && error.code === "23505") {
      const esConflictoDocente = error.constraint && error.constraint.indexOf("docente") !== -1;
      return {
        ok: false,
        status: 409,
        message: esConflictoDocente
          ? "Ya tenés otra reserva en ese mismo horario"
          : "Ese recurso ya está reservado en alguna de las horas seleccionadas"
      };
    }
    throw error;
  }
}

module.exports = { crearBloqueReserva };
