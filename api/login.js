const bcrypt = require("bcryptjs");
const { crearTokenSesion, cookieSesion } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ status: "error", message: "Método no permitido" });
    return;
  }

  try {
    const { usuario, contrasena } = req.body || {};

    if (!usuario || !contrasena) {
      res.status(400).json({ status: "error", message: "Faltan usuario o contraseña" });
      return;
    }

    let rol = null;

    if (usuario === process.env.ADMIN_USER) {
      const valida = await bcrypt.compare(contrasena, process.env.ADMIN_PASSWORD_HASH || "");
      if (valida) rol = "admin";
    } else if (usuario === process.env.LECTOR_USER) {
      const valida = await bcrypt.compare(contrasena, process.env.LECTOR_PASSWORD_HASH || "");
      if (valida) rol = "lector";
    }

    if (!rol) {
      res.status(401).json({ status: "error", message: "Usuario o contraseña incorrectos" });
      return;
    }

    const token = crearTokenSesion(rol);
    res.setHeader("Set-Cookie", cookieSesion(token));
    res.status(200).json({ status: "ok", rol: rol });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Error iniciando sesión" });
  }
};
