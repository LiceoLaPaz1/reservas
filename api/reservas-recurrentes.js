const { verificarSesion } = require("./_auth");
const { crearBloqueReserva } = require("./_reservas_helpers");

const DIAS_SEMANA_VALIDOS = [0, 1, 2, 3, 4, 5, 6]; // 0 = domingo ... 6 = sabado (Date#getUTCDay)
const MAX_DIAS_RANGO = 366;
const CONCURRENCIA = 8;

function* fechasEnRango(fechaInicio, fechaFin) {
  const fin = new Date(fechaFin + "T00:00:00Z");
  for (let d = new Date(fechaInicio + "T00:00:00Z"); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    yield { fecha: d.toISOString().slice(0, 10), diaSemana: d.getUTCDay() };
  }
}

// Corre `worker` sobre `items` con a lo sumo `limite` tareas en simultaneo,
// para no abrir mas conexiones de las necesarias contra la base.
async function ejecutarConConcurrenciaLimitada(items, worker, limite) {
  const resultados = new Array(items.length);
  let indice = 0;

  async function tomarSiguiente() {
    while (indice < items.length) {
      const miIndice = indice++;
      resultados[miIndice] = await worker(items[miIndice]);
    }
  }

  const workers = Array.from({ length: Math.min(limite, items.length) }, tomarSiguiente);
  await Promise.all(workers);
  return resultados;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ status: "error", message: "Método no permitido" });
    return;
  }

  if (verificarSesion(req) !== "admin") {
    res.status(401).json({ status: "error", message: "No autorizado" });
    return;
  }

  try {
    const { nombre, apellido, turno, recurso, fechaInicio, fechaFin, reglas } = req.body || {};

    if (
      !nombre || !apellido || !turno || !recurso || !fechaInicio || !fechaFin ||
      !Array.isArray(reglas) || reglas.length === 0
    ) {
      res.status(400).json({ status: "error", message: "Faltan datos para crear las reservas recurrentes" });
      return;
    }

    if (fechaFin < fechaInicio) {
      res.status(400).json({ status: "error", message: "La fecha de fin no puede ser anterior a la de inicio" });
      return;
    }

    for (const regla of reglas) {
      if (!DIAS_SEMANA_VALIDOS.includes(regla.diaSemana) || !regla.hora || !regla.cantidadHoras) {
        res.status(400).json({ status: "error", message: "Alguna regla de día tiene datos inválidos" });
        return;
      }
    }

    const diasEnRango = Math.round(
      (new Date(fechaFin + "T00:00:00Z") - new Date(fechaInicio + "T00:00:00Z")) / 86400000
    ) + 1;
    if (diasEnRango > MAX_DIAS_RANGO) {
      res.status(400).json({
        status: "error",
        message: "El rango de fechas es demasiado largo (máximo " + MAX_DIAS_RANGO + " días)"
      });
      return;
    }

    const reglasPorDia = new Map();
    reglas.forEach(function (r) { reglasPorDia.set(r.diaSemana, r); });

    const tareas = [];
    for (const { fecha, diaSemana } of fechasEnRango(fechaInicio, fechaFin)) {
      const regla = reglasPorDia.get(diaSemana);
      if (regla) {
        tareas.push({ fecha: fecha, diaSemana: diaSemana, hora: regla.hora, cantidadHoras: regla.cantidadHoras });
      }
    }

    if (tareas.length === 0) {
      res.status(400).json({
        status: "error",
        message: "Ese rango de fechas no incluye ningún día de las reglas elegidas"
      });
      return;
    }

    const resultados = await ejecutarConConcurrenciaLimitada(
      tareas,
      async function (tarea) {
        try {
          const resultado = await crearBloqueReserva({
            nombre: nombre,
            apellido: apellido,
            fecha: tarea.fecha,
            turno: turno,
            hora: tarea.hora,
            recurso: recurso,
            cantidadHoras: tarea.cantidadHoras
          });
          return { fecha: tarea.fecha, ok: resultado.ok, message: resultado.message };
        } catch (error) {
          console.error(error);
          return { fecha: tarea.fecha, ok: false, message: "Error interno guardando esta fecha" };
        }
      },
      CONCURRENCIA
    );

    const exitosas = resultados.filter(function (r) { return r.ok; });
    const fallidas = resultados.filter(function (r) { return !r.ok; });

    res.status(200).json({
      status: "ok",
      total: resultados.length,
      creadas: exitosas.length,
      fechasCreadas: exitosas.map(function (r) { return r.fecha; }),
      fallidas: fallidas.map(function (r) { return { fecha: r.fecha, message: r.message }; })
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Error creando las reservas recurrentes" });
  }
};
