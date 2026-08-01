const { JWT } = require("google-auth-library");

const ENCABEZADO = ["Nombre", "Apellido", "Recurso", "Fecha", "Turno", "Hora", "Cantidad de horas", "Reservado el"];

function crearCliente() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

// Sin prefijo de nombre de hoja: apunta a la primera hoja de la planilla,
// sin importar como se llame la pestaña ("Hoja 1", "Sheet1", etc.).
async function tieneEncabezado(client, sheetId) {
  const url = "https://sheets.googleapis.com/v4/spreadsheets/" + sheetId + "/values/A1";
  const res = await client.request({ url, method: "GET" });
  return Array.isArray(res.data.values) && res.data.values.length > 0;
}

async function agregarFilas(client, sheetId, filas) {
  const url = "https://sheets.googleapis.com/v4/spreadsheets/" + sheetId + "/values/A:H" +
    ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";

  await client.request({
    url: url,
    method: "POST",
    data: { values: filas }
  });
}

async function archivarEnSheet(filas) {
  const client = crearCliente();
  const sheetId = process.env.SHEET_ID;

  const yaTieneEncabezado = await tieneEncabezado(client, sheetId);
  if (!yaTieneEncabezado) {
    await agregarFilas(client, sheetId, [ENCABEZADO]);
  }

  await agregarFilas(client, sheetId, filas);
}

module.exports = { archivarEnSheet };
