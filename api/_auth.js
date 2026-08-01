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

function firmar(expiracion) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(String(expiracion)).digest("hex");
}

function crearTokenSesion() {
  const expiracion = Date.now() + SESSION_DURATION_MS;
  return expiracion + "." + firmar(expiracion);
}

function verificarSesion(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session;
  if (!token) return false;

  const puntoIdx = token.indexOf(".");
  if (puntoIdx === -1) return false;

  const expStr = token.slice(0, puntoIdx);
  const firma = token.slice(puntoIdx + 1);
  const expiracion = parseInt(expStr, 10);

  if (!expiracion || Date.now() > expiracion) return false;

  const esperada = firmar(expiracion);
  const bufA = Buffer.from(firma);
  const bufB = Buffer.from(esperada);
  if (bufA.length !== bufB.length) return false;

  return crypto.timingSafeEqual(bufA, bufB);
}

function cookieSesion(token) {
  return "session=" + token + "; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=" + (SESSION_DURATION_MS / 1000);
}

function cookieLogout() {
  return "session=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0";
}

module.exports = { crearTokenSesion, verificarSesion, cookieSesion, cookieLogout };
