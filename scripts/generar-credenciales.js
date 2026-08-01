// Genera las variables de entorno necesarias para instalar esta app en
// una institución nueva. Uso:
//
//   node scripts/generar-credenciales.js <usuario> <contraseña>
//
// Requiere tener las dependencias instaladas (npm install) porque usa
// bcryptjs, ya declarado en package.json.

const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const usuario = process.argv[2];
const contrasena = process.argv[3];

if (!usuario || !contrasena) {
  console.error("Uso: node scripts/generar-credenciales.js <usuario> <contraseña>");
  process.exit(1);
}

const hash = bcrypt.hashSync(contrasena, 10);
const sessionSecret = crypto.randomBytes(32).toString("hex");
const cronSecret = crypto.randomBytes(24).toString("hex");

console.log("Cargar estas variables de entorno en Vercel (Settings -> Environment Variables, Production):\n");
console.log("ADMIN_USER=" + usuario);
console.log("ADMIN_PASSWORD_HASH=" + hash);
console.log("SESSION_SECRET=" + sessionSecret);
console.log("CRON_SECRET=" + cronSecret);
console.log("\nLa contraseña en texto plano no queda guardada en ningún lado, solo el hash de arriba.");
