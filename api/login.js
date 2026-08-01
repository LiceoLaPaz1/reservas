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

    if (usuario !== process.env.ADMIN_USER) {
      res.status(401).json({ status: "error", message: "Usuario o contraseña incorrectos" });
      return;
    }

    const valida = await bcrypt.compare(contrasena, process.env.ADMIN_PASSWORD_HASH || "");
    if (!valida) {
      res.status(401).json({ status: "error", message: "Usuario o contraseña incorrectos" });
      return;
    }

    const token = crearTokenSesion();
    res.setHeader("Set-Cookie", cookieSesion(token));
    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Error iniciando sesión" });
  }
};
