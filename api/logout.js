const { cookieLogout } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ status: "error", message: "Método no permitido" });
    return;
  }

  res.setHeader("Set-Cookie", cookieLogout());
  res.status(200).json({ status: "ok" });
};
