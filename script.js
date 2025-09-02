// ===== Configuración de recursos por turno =====
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

// ===== Estado =====
let reservas = [];
let reservaEnProgreso = false;

// ===== Helpers generales =====
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

// ===== Inicialización =====
try {
  reservas = JSON.parse(localStorage.getItem("reservasLiceo")) || [];
} catch {
  reservas = [];
}

document.addEventListener("DOMContentLoaded", () => {
  const hoy = new Date().toISOString().split("T")[0];
  const fechaEl = document.getElementById("fecha");
  if (fechaEl) fechaEl.value = hoy;

  actualizarReservas();
  actualizarReportes();
  limpiarReservasVencidas();
});

// ===== Listado de reservas activas =====
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

// ===== Selección de horas según turno =====
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

// ===== Auto-consulta cuando hay datos =====
function actualizarDisponibilidad() {
  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;
  if (fecha && turno && hora) consultarDisponibilidad();
}

// ===== Consulta de disponibilidad (soporta rango de horas) =====
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

  // Set de reservas activas actuales para pintar al instante
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

// ===== Reserva multi-hora (con bloqueo de doble-reserva) =====
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

    // ===== Chequeo local anti-duplicado =====
    const R = buildReservasActivasSet();
    const conflictoLocal = horasSeleccionadas.some((hSel) =>
      R.has(buildKey(fecha, turno, hSel, recurso))
    );
    if (conflictoLocal) {
      alert("❌ Esa franja ya está reservada.");
      return;
    }

    const confirmacion = confirm(
      `¿Confirmás la reserva de ${recurso} para el ${fecha}, turno ${turno}, desde la hora ${hora} por ${duracion} hora(s), a nombre de ${nombre} ${apellido}?`
    );
    if (!confirmacion) return;

    const endpoint =
      new URLSearchParams(location.search).get("api") ||
      "https://script.google.com/macros/s/AKfycbwfQdx0QdsB6zZW6AhE3793Tc0Qu4y0-2eSTcGP9Uj6SkRTiaQ6yFk7Xp5Qze8gp-CZ/exec";

    // Crear y enviar una fila por cada hora seleccionada
    horasSeleccionadas.forEach((h, i) => {
      const nuevaReserva = {
        id: Date.now() + i + Math.floor(Math.random() * 1000),
        fecha: fecha,
        turno: turno,
        hora: h,
        recurso: recurso,
        nombre: nombre,
        apellido: apellido,
        cantidadHoras: duracion, // para la hoja (columna H)
        fechaReserva: new Date().toISOString(),
      };

      // Guardar localmente primero para que la UI se pinte en rojo al instante
      reservas.push(nuevaReserva);

      const formData = new URLSearchParams();
      formData.append("data", JSON.stringify(nuevaReserva));
      // formData.append("debug", "1"); // <- activar si querés ver columnas en respuesta

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      })
        .then((res) => res.text())
        .then((data) => console.log("📥 Respuesta del servidor:", data))
        .catch((error) => console.error("❌ Error en fetch:", error));
    });

    localStorage.setItem("reservasLiceo", JSON.stringify(reservas));

    alert(
      `✅ Reserva realizada!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Horas: ${horasSeleccionadas.join(
        ", "
      )}`
    );

    // Refrescar UI y reportes
    consultarDisponibilidad();
    actualizarReservas();
    actualizarReportes();
  } finally {
    reservaEnProgreso = false;
  }
}

// ===== Cancelar reserva =====
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

// ===== Reportes =====
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

// ===== Tabs =====
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

// ===== Vencimiento de reservas =====
// Simplificado: una reserva es "pasada" sólo si la fecha es anterior a hoy.
function esPasado(fecha) {
  const hoyStr = new Date().toISOString().split("T")[0];
  if (fecha < hoyStr) return true;
  if (fecha > hoyStr) return false;
  return false; // mismo día => activo
}

function limpiarReservasVencidas() {
  const activas = reservas.filter((r) => !esPasado(r.fecha));
  if (activas.length !== reservas.length) {
    reservas = activas;
    localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
  }
}
setInterval(limpiarReservasVencidas, 5 * 60 * 1000);

// ===== Limpiar selección (arreglado) =====
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
    // horaEl.disabled = true; // si querés deshabilitar hasta elegir turno
  }
  if (durEl) durEl.value = 1;
  if (info) info.style.display = "none";
  if (recCont) recCont.style.display = "none";
  if (msg) msg.style.display = "block";
  if (detalles) detalles.innerHTML = "";
  if (grid) grid.innerHTML = "";
}

// ===== Debug =====
function debugReserva() {
  console.log("Reservas actuales:", reservas);
  console.log("Fecha actual:", new Date().toISOString().split("T")[0]);
}
