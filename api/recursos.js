const { sql } = require("./_db");
const { verificarSesion } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const recursos = await sql`SELECT id, nombre FROM recursos ORDER BY nombre`;
      const vinculos = await sql`
        SELECT rt.recurso_id AS "recursoId", t.nombre AS "turnoNombre"
        FROM recurso_turnos rt
        JOIN turnos t ON t.id = rt.turno_id
      `;

      const resultado = recursos.map(function (r) {
        return {
          id: r.id,
          nombre: r.nombre,
          turnos: vinculos.filter(function (v) { return v.recursoId === r.id; }).map(function (v) { return v.turnoNombre; })
        };
      });

      res.status(200).json({ status: "ok", recursos: resultado });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error consultando recursos" });
    }
    return;
  }

  if (req.method === "POST") {
    if (verificarSesion(req) !== "admin") {
      res.status(401).json({ status: "error", message: "No autorizado" });
      return;
    }

    try {
      const { nombre, turnoIds } = req.body || {};
      if (!nombre) {
        res.status(400).json({ status: "error", message: "Falta el nombre del recurso" });
        return;
      }

      const rows = await sql`INSERT INTO recursos (nombre) VALUES (${nombre}) RETURNING id, nombre`;
      const recurso = rows[0];

      const ids = Array.isArray(turnoIds) ? turnoIds : [];
      for (const turnoId of ids) {
        await sql`INSERT INTO recurso_turnos (recurso_id, turno_id) VALUES (${recurso.id}, ${turnoId}) ON CONFLICT DO NOTHING`;
      }

      res.status(201).json({ status: "success", recurso: recurso });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Error creando el recurso" });
    }
    return;
  }

  res.status(405).json({ status: "error", message: "Método no permitido" });
};
