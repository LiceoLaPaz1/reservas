const crypto = require("crypto");

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas

function parseCookies(header) {
  const cookies = {};
  (header || "").split(";").forEach(function (part) {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = value;
  });
  return cookies;
}

const ROLES_VALIDOS = ["admin", "lector"];

function firmar(payload) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("hex");
}

function crearTokenSesion(rol) {
  const expiracion = Date.now() + SESSION_DURATION_MS;
  const payload = expiracion + "." + rol;
  return payload + "." + firmar(payload);
}

// Devuelve el rol de la sesión ("admin" | "lector") o false si no hay sesión válida.
function verificarSesion(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session;
  if (!token) return false;

  const partes = token.split(".");
  if (partes.length !== 3) return false;

  const [expStr, rol, firma] = partes;
  const expiracion = parseInt(expStr, 10);

  if (!expiracion || Date.now() > expiracion) return false;
  if (ROLES_VALIDOS.indexOf(rol) === -1) return false;

  const payload = expStr + "." + rol;
  const esperada = firmar(payload);
  const bufA = Buffer.from(firma);
  const bufB = Buffer.from(esperada);
  if (bufA.length !== bufB.length) return false;
  if (!crypto.timingSafeEqual(bufA, bufB)) return false;

  return rol;
}

function cookieSesion(token) {
  return "session=" + token + "; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=" + (SESSION_DURATION_MS / 1000);
}

function cookieLogout() {
  return "session=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0";
}

module.exports = { crearTokenSesion, verificarSesion, cookieSesion, cookieLogout };
