/************************************************************
 * Reserva de recursos - Frontend
 * - Chequeo server-side (doGet?action=check)
 * - Alta atómica (doPost) y actualización local condicionada
 ************************************************************/

/* =================== Configuración =================== */

// ENDPOINT del Web App (podés sobreescribirlo con ?api=URL en la barra)
const endpoint =
  new URLSearchParams(location.search).get("api") ||
  "https://script.google.com/macros/s/AKfycbwfQdx0QdsB6zZW6AhE3793Tc0Qu4y0-2eSTcGP9Uj6SkRTiaQ6yFk7Xp5Qze8gp-CZ/exec";

// Recursos por turno
const recursosMatutino = [
  "Cañón",
  "TV Planta Baja",
  "TV Planta Alta",
  'TV 43"',
  'Caja TV 50"',
  "Caja TV 43",
];

const recursosVespertino = [
  "Cañón",
  "TV Planta Baja",
  "TV Planta Alta",
  'TV 43"',
  'Caja TV 50"',
  "Caja TV 43",
  "Sala de Informática",
  "Salón 10",
];

// Horas por turno
const horasMatutino = [
  "1era",
  "2da",
  "3era",
  "4ta",
  "5ta",
  "6ta",
  "7ma",
  "8va",
];
const horasVespertino = [
  "0",
  "1era",
  "2da",
  "3era",
  "4ta",
  "5ta",
  "6ta",
  "7ma",
];

/* =================== Estado =================== */

let reservas = [];
let reservaEnProgreso = false;

// Carga robusta desde localStorage
try {
  reservas = JSON.parse(localStorage.getItem("reservasLiceo")) || [];
} catch {
  reservas = [];
}

/* =================== Helpers generales =================== */

function getDuracion() {
  const el = document.getElementById("duracion");
  const n = el ? parseInt(el.value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function slotKey({ fecha, turno, hora, recurso }) {
  return `${fecha}|${turno}|${hora}|${recurso}`;
}
function buildKey(fecha, turno, hora, recurso) {
  return `${fecha}|${turno}|${hora}|${recurso}`;
}

// Conjunto de reservas activas (clave: fecha|turno|hora|recurso)
function buildReservasActivasSet() {
  const s = new Set();
  reservas.forEach((r) => {
    if (!esPasado(r.fecha)) s.add(slotKey(r));
  });
  return s;
}

// Unificar recursos (evitar duplicados entre turnos)
function getTodosLosRecursos() {
  return Array.from(new Set([...recursosMatutino, ...recursosVespertino]));
}

// Simplificado: una reserva es "pasada" solo si la fecha < hoy
function esPasado(fecha) {
  const hoyStr = new Date().toISOString().split("T")[0];
  if (fecha < hoyStr) return true;
  if (fecha > hoyStr) return false;
  return false; // mismo día => activo
}

/* =================== Inicialización =================== */

document.addEventListener("DOMContentLoaded", () => {
  const hoy = new Date().toISOString().split("T")[0];
  const fechaEl = document.getElementById("fecha");
  if (fechaEl) fechaEl.value = hoy;

  actualizarReservas();
  actualizarReportes();
  limpiarReservasVencidas();
});

/* =================== UI: listado de reservas =================== */

function actualizarReservas() {
  const container = document.getElementById("reservas-container");
  if (!container) return;

  const reservasActivas = reservas.filter((r) => !esPasado(r.fecha));

  if (reservasActivas.length === 0) {
    container.innerHTML =
      '<div class="alert alert-warning">🔭 No tenés reservas activas</div>';
    return;
  }

  container.innerHTML = "";
  reservasActivas.forEach((reserva) => {
    const fechaFormatted = new Date(
      reserva.fecha + "T00:00:00"
    ).toLocaleDateString("es-ES");
    const item = document.createElement("div");
    item.className = "reserva-item";
    item.innerHTML = `
      <div class="reserva-info">
        <div class="reserva-recurso">${reserva.recurso}</div>
        <div class="reserva-detalles">
          📅 ${fechaFormatted} | 🕒 ${reserva.turno} | ⏰ ${reserva.hora}<br>
          👤 ${reserva.nombre} ${reserva.apellido}
        </div>
      </div>
      <button class="btn-cancelar" onclick="cancelarReserva(${reserva.id})">❌ Cancelar</button>
    `;
    container.appendChild(item);
  });
}

/* =================== UI: selección de horas =================== */

function actualizarHoras() {
  const turno = document.getElementById("turno").value;
  const horaSelect = document.getElementById("hora");
  if (!horaSelect) return;

  horaSelect.innerHTML = '<option value="">Seleccionar hora</option>';

  let horas = [];
  if (turno === "matutino") horas = horasMatutino;
  if (turno === "vespertino") horas = horasVespertino;

  horas.forEach((hora) => {
    const option = document.createElement("option");
    option.value = hora;
    option.textContent = hora;
    horaSelect.appendChild(option);
  });

  actualizarDisponibilidad();
}

// Auto-consulta cuando hay datos
function actualizarDisponibilidad() {
  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;
  if (fecha && turno && hora) consultarDisponibilidad();
}

/* =================== Consulta de disponibilidad (UI local) =================== */

function consultarDisponibilidad() {
  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;
  const duracion = getDuracion();

  if (!fecha || !turno || !hora) {
    alert("⚠️ Por favor seleccioná fecha, turno y hora");
    return;
  }

  const horasTurno = turno === "matutino" ? horasMatutino : horasVespertino;
  const indiceHora = horasTurno.indexOf(hora);
  if (indiceHora === -1) {
    alert("⚠️ Hora inválida");
    return;
  }

  const mensajeInicial = document.getElementById("mensaje-inicial");
  const infoConsulta = document.getElementById("info-consulta");
  const recursosContainer = document.getElementById("recursos-container");
  if (mensajeInicial) mensajeInicial.style.display = "none";
  if (infoConsulta) infoConsulta.style.display = "block";
  if (recursosContainer) recursosContainer.style.display = "block";

  const fechaFormatted = new Date(fecha + "T00:00:00").toLocaleDateString(
    "es-ES",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  const detalles = document.getElementById("detalles-consulta");
  if (detalles) {
    detalles.innerHTML = `
      <strong>📅 Fecha:</strong> ${fechaFormatted}<br>
      <strong>🕒 Turno:</strong> ${
        turno.charAt(0).toUpperCase() + turno.slice(1)
      }<br>
      <strong>⏰ Hora inicial:</strong> ${hora}<br>
      <strong>⏳ Duración:</strong> ${duracion} hora(s)
    `;
  }

  const horasSeleccionadas = horasTurno.slice(
    indiceHora,
    indiceHora + duracion
  );

  const recursos = turno === "matutino" ? recursosMatutino : recursosVespertino;
  const recursosGrid = document.getElementById("recursos-grid");
  if (!recursosGrid) return;
  recursosGrid.innerHTML = "";

  // Set de reservas activas actuales (local) para pintar al instante
  const R = buildReservasActivasSet();

  recursos.forEach((recurso) => {
    const ocupado = horasSeleccionadas.some((hSel) =>
      R.has(buildKey(fecha, turno, hSel, recurso))
    );

    const card = document.createElement("div");
    card.className = `recurso-card ${ocupado ? "ocupado" : "disponible"}`;
    card.innerHTML = `
      <div class="recurso-nombre">${recurso}</div>
      <div class="recurso-estado ${
        ocupado ? "estado-ocupado" : "estado-disponible"
      }">
        ${ocupado ? "❌ Ocupado" : "✅ Disponible"}
      </div>
    `;
    if (!ocupado)
      card.onclick = () => realizarReserva(fecha, turno, hora, recurso);
    recursosGrid.appendChild(card);
  });
}

/* =================== Reserva multi-hora con chequeo server-side =================== */

async function realizarReserva(fecha, turno, hora, recurso) {
  if (reservaEnProgreso) return; // evita doble click
  reservaEnProgreso = true;

  try {
    const nombre = document.getElementById("nombre").value.trim();
    const apellido = document.getElementById("apellido").value.trim();
    const duracion = getDuracion();

    if (!nombre || !apellido) {
      alert("⚠️ Por favor ingresá nombre y apellido");
      return;
    }

    const horasTurno = turno === "matutino" ? horasMatutino : horasVespertino;
    const indiceHora = horasTurno.indexOf(hora);
    if (indiceHora === -1) {
      alert("⚠️ Hora inválida");
      return;
    }
    if (indiceHora + duracion > horasTurno.length) {
      alert("⚠️ No hay suficientes horas disponibles en este turno.");
      return;
    }

    const horasSeleccionadas = horasTurno.slice(
      indiceHora,
      indiceHora + duracion
    );

    // --- 1) Chequeo server-side de todo el bloque de horas ---
    const url = new URL(endpoint);
    url.searchParams.set("action", "check");
    url.searchParams.set("fecha", fecha);
    url.searchParams.set("turno", turno);
    url.searchParams.set("recurso", recurso);
    url.searchParams.set("horas", horasSeleccionadas.join(","));

    let checkOk = true;
    try {
      const resp = await fetch(url.toString());
      const data = await resp.json();
      if (data.status !== "ok" || !data.disponible) {
        checkOk = false;
      }
    } catch (e) {
      console.warn(
        "No se pudo verificar disponibilidad en servidor (continuará con intento atómico por hora):",
        e
      );
      // seguimos igual: el POST atómico igual bloqueará si hay conflicto
    }

    if (!checkOk) {
      alert("❌ Esa franja ya está reservada por otro docente.");
      consultarDisponibilidad();
      actualizarReservas();
      actualizarReportes();
      return;
    }

    // --- 2) POST por cada hora (con bloqueo en backend) ---
    const posts = horasSeleccionadas.map((h, i) => {
      const nuevaReserva = {
        id: Date.now() + i + Math.floor(Math.random() * 1000),
        fecha,
        turno,
        hora: h,
        recurso,
        nombre,
        apellido,
        cantidadHoras: duracion,
        fechaReserva: new Date().toISOString(),
      };

      const formData = new URLSearchParams();
      formData.append("data", JSON.stringify(nuevaReserva));

      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      })
        .then((r) => r.json())
        .then((r) => {
          if (r.status === "success") {
            // Recién acá impactamos localmente (quedará rojo)
            reservas.push(nuevaReserva);
            return true;
          }
          if (r.status === "conflict") {
            console.warn("Conflicto detectado por el servidor:", r);
            return false;
          }
          throw new Error(r.message || "Error desconocido al reservar");
        })
        .catch((err) => {
          console.error("❌ Error en POST:", err);
          return false;
        });
    });

    const results = await Promise.all(posts);
    const okCount = results.filter(Boolean).length;

    if (okCount === horasSeleccionadas.length) {
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
      alert(
        `✅ Reserva realizada!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Horas: ${horasSeleccionadas.join(
          ", "
        )}`
      );
    } else if (okCount > 0) {
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
      alert(
        "⚠️ La reserva se concretó parcialmente (algunas horas ya estaban tomadas)."
      );
    } else {
      alert(
        "❌ No se pudo realizar la reserva. Puede que la franja ya esté ocupada."
      );
    }

    // Refrescar UI
    consultarDisponibilidad();
    actualizarReservas();
    actualizarReportes();
  } finally {
    reservaEnProgreso = false;
  }
}

/* =================== Cancelación =================== */

function cancelarReserva(id) {
  const confirmacion = confirm(
    "¿Estás seguro de que querés cancelar esta reserva?"
  );
  if (!confirmacion) return;

  reservas = reservas.filter((reserva) => reserva.id !== id);
  localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
  alert("✅ Reserva cancelada exitosamente");

  actualizarReservas();
  actualizarReportes();
  consultarDisponibilidad();
}

/* =================== Reportes =================== */

function actualizarReportes() {
  const reservasActivas = reservas.filter((r) => !esPasado(r.fecha));

  const hoy = new Date().toISOString().split("T")[0];
  const reservasHoy = reservasActivas.filter((r) => r.fecha === hoy);

  const totalEl = document.getElementById("total-reservas");
  const hoyEl = document.getElementById("reservas-hoy");
  const dispEl = document.getElementById("recursos-disponibles");
  if (totalEl) totalEl.textContent = reservasActivas.length;
  if (hoyEl) hoyEl.textContent = reservasHoy.length;

  const totalRecursos =
    recursosMatutino.length * horasMatutino.length +
    recursosVespertino.length * horasVespertino.length;
  if (dispEl) dispEl.textContent = totalRecursos - reservasActivas.length;

  // Reporte por recurso (sin duplicados)
  const reporteRecursos = document.getElementById("reporte-recursos");
  if (reporteRecursos) {
    const conteoRecursos = {};
    getTodosLosRecursos().forEach((recurso) => {
      conteoRecursos[recurso] = reservasActivas.filter(
        (r) => r.recurso === recurso
      ).length;
    });

    reporteRecursos.innerHTML = "";
    Object.entries(conteoRecursos).forEach(([recurso, cantidad]) => {
      const div = document.createElement("div");
      div.className = "reserva-item";
      div.innerHTML = `
        <div class="reserva-info">
          <div class="reserva-recurso">${recurso}</div>
          <div class="reserva-detalles">${cantidad} reservas activas</div>
        </div>
      `;
      reporteRecursos.appendChild(div);
    });
  }

  // Reporte por turno
  const reporteTurnos = document.getElementById("reporte-turnos");
  if (reporteTurnos) {
    const conteoTurnos = {
      matutino: reservasActivas.filter((r) => r.turno === "matutino").length,
      vespertino: reservasActivas.filter((r) => r.turno === "vespertino")
        .length,
    };

    reporteTurnos.innerHTML = "";
    Object.entries(conteoTurnos).forEach(([turno, cantidad]) => {
      const div = document.createElement("div");
      div.className = "reserva-item";
      div.innerHTML = `
        <div class="reserva-info">
          <div class="reserva-recurso">Turno ${
            turno.charAt(0).toUpperCase() + turno.slice(1)
          }</div>
          <div class="reserva-detalles">${cantidad} reservas activas</div>
        </div>
      `;
      reporteTurnos.appendChild(div);
    });
  }
}

/* =================== Tabs =================== */

function cambiarTab(tabName) {
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add("active");

  const tabs = document.querySelectorAll(".tabs .tab");
  tabs.forEach((t) => t.classList.remove("active"));
  const indexByName = { disponibilidad: 0, reservas: 1, reportes: 2 };
  const idx = indexByName[tabName];
  if (typeof idx === "number" && tabs[idx]) tabs[idx].classList.add("active");

  if (tabName === "reservas") actualizarReservas();
  if (tabName === "reportes") actualizarReportes();
}

/* =================== Limpieza / mantenimiento =================== */

function limpiarReservasVencidas() {
  const activas = reservas.filter((r) => !esPasado(r.fecha));
  if (activas.length !== reservas.length) {
    reservas = activas;
    localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
  }
}
setInterval(limpiarReservasVencidas, 5 * 60 * 1000);

// Botón Limpiar: resetea la UI de consulta
function limpiarSeleccion() {
  const turnoEl = document.getElementById("turno");
  const horaEl = document.getElementById("hora");
  const durEl = document.getElementById("duracion");
  const info = document.getElementById("info-consulta");
  const recCont = document.getElementById("recursos-container");
  const msg = document.getElementById("mensaje-inicial");
  const detalles = document.getElementById("detalles-consulta");
  const grid = document.getElementById("recursos-grid");

  if (turnoEl) turnoEl.value = "";
  if (horaEl) {
    horaEl.innerHTML = '<option value="">Seleccionar hora</option>';
  }
  if (durEl) durEl.value = 1;
  if (info) info.style.display = "none";
  if (recCont) recCont.style.display = "none";
  if (msg) msg.style.display = "block";
  if (detalles) detalles.innerHTML = "";
  if (grid) grid.innerHTML = "";
}

/* =================== Debug (opcional) =================== */

function debugReserva() {
  console.log("Reservas actuales:", reservas);
  console.log("Fecha actual:", new Date().toISOString().split("T")[0]);
}
