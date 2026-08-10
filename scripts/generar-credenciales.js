// Genera las variables de entorno necesarias para instalar esta app en
// una institución nueva, o para agregar el usuario "lector" (acceso de
// solo lectura al reporte, sin poder editar recursos/turnos). Uso:
//
//   node scripts/generar-credenciales.js <usuario> <contraseña> [admin|lector]
//
// El tercer argumento es opcional y por defecto es "admin".
//
// Requiere tener las dependencias instaladas (npm install) porque usa
// bcryptjs, ya declarado en package.json.

const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const usuario = process.argv[2];
const contrasena = process.argv[3];
const rol = process.argv[4] || "admin";

if (!usuario || !contrasena) {
  console.error("Uso: node scripts/generar-credenciales.js <usuario> <contraseña> [admin|lector]");
  process.exit(1);
}

if (rol !== "admin" && rol !== "lector") {
  console.error('El tercer argumento debe ser "admin" o "lector".');
  process.exit(1);
}

const hash = bcrypt.hashSync(contrasena, 10);

console.log("Cargar estas variables de entorno en Vercel (Settings -> Environment Variables, Production):\n");

if (rol === "admin") {
  const sessionSecret = crypto.randomBytes(32).toString("hex");
  const cronSecret = crypto.randomBytes(24).toString("hex");
  console.log("ADMIN_USER=" + usuario);
  console.log("ADMIN_PASSWORD_HASH=" + hash);
  console.log("SESSION_SECRET=" + sessionSecret);
  console.log("CRON_SECRET=" + cronSecret);
} else {
  console.log("LECTOR_USER=" + usuario);
  console.log("LECTOR_PASSWORD_HASH=" + hash);
  console.log(
    "\n(No se genera un SESSION_SECRET nuevo: el usuario lector usa el mismo que ya está" +
      " cargado para el admin. No lo sobrescribas o vas a cerrar la sesión de todos.)"
  );
}

console.log("\nLa contraseña en texto plano no queda guardada en ningún lado, solo el hash de arriba.");
