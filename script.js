// ===== Configuración de recursos por turno =====
const recursosMatutino = [
  "Cañón",
  "TV Planta Baja",
  "TV Planta Alta",
  'TV 43"',
  'Caja TV 50"',
  "Caja TV 43"
];

const recursosVespertino = [
  "Cañón",
  "TV Planta Baja",
  "TV Planta Alta",
  'TV 43"',
  'Caja TV 50"',
  "Caja TV 43",
  "Sala de Informática",
  "Salón 10"
];

const horasMatutino = ["1era", "2da", "3era", "4ta", "5ta", "6ta", "7ma", "8va"];
const horasVespertino = ["0", "1era", "2da", "3era", "4ta", "5ta", "6ta", "7ma"];

// ===== Almacenamiento de reservas (localStorage) =====
let reservas = [];
try {
  reservas = JSON.parse(localStorage.getItem("reservasLiceo")) || [];
} catch {
  reservas = [];
}

// ===== Utilidad segura para leer duración =====
function getDuracion() {
  const el = document.getElementById("duracion");
  const n = el ? parseInt(el.value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ===== Inicialización =====
document.addEventListener("DOMContentLoaded", function () {
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

  const reservasActivas = reservas.filter(
    (reserva) => !esPasado(reserva.fecha, reserva.hora, reserva.turno)
  );

  if (reservasActivas.length === 0) {
    container.innerHTML =
      '<div class="alert alert-warning">🔭 No tenés reservas activas</div>';
    return;
  }

  container.innerHTML = "";

  reservasActivas.forEach((reserva) => {
    const fechaFormatted = new Date(reserva.fecha + "T00:00:00").toLocaleDateString("es-ES");
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

// ===== Rellenar horas según turno =====
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
    alert("⚠️ Por favor selecciona fecha, turno y hora");
    return;
  }

  const mensajeInicial = document.getElementById("mensaje-inicial");
  const infoConsulta = document.getElementById("info-consulta");
  const recursosContainer = document.getElementById("recursos-container");
  if (mensajeInicial) mensajeInicial.style.display = "none";
  if (infoConsulta) infoConsulta.style.display = "block";
  if (recursosContainer) recursosContainer.style.display = "block";

  const fechaFormatted = new Date(fecha + "T00:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const detalles = document.getElementById("detalles-consulta");
  if (detalles) {
    detalles.innerHTML = `
      <strong>📅 Fecha:</strong> ${fechaFormatted}<br>
      <strong>🕒 Turno:</strong> ${turno.charAt(0).toUpperCase() + turno.slice(1)}<br>
      <strong>⏰ Hora inicial:</strong> ${hora}<br>
      <strong>⏳ Duración:</strong> ${duracion} hora(s)
    `;
  }

  const horasTurno = turno === "matutino" ? horasMatutino : horasVespertino;
  const indiceHora = horasTurno.indexOf(hora);
  const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);

  const recursos = turno === "matutino" ? recursosMatutino : recursosVespertino;
  const recursosGrid = document.getElementById("recursos-grid");
  if (!recursosGrid) return;
  recursosGrid.innerHTML = "";

  recursos.forEach((recurso) => {
    const estaReservado = reservas.some(
      (reserva) =>
        reserva.fecha === fecha &&
        reserva.turno === turno &&
        horasSeleccionadas.includes(reserva.hora) &&
        reserva.recurso === recurso &&
        !esPasado(reserva.fecha, reserva.hora, reserva.turno)
    );

    const card = document.createElement("div");
    card.className = `recurso-card ${estaReservado ? "ocupado" : "disponible"}`;
    card.innerHTML = `
      <div class="recurso-nombre">${recurso}</div>
      <div class="recurso-estado ${estaReservado ? "estado-ocupado" : "estado-disponible"}">
        ${estaReservado ? "❌ Ocupado" : "✅ Disponible"}
      </div>
    `;
    if (!estaReservado) card.onclick = () => realizarReserva(fecha, turno, hora, recurso);
    recursosGrid.appendChild(card);
  });
}

// ===== Reserva multi-hora =====
function realizarReserva(fecha, turno, hora, recurso) {
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

  const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);

  const conflicto = reservas.some(
    (reserva) =>
      reserva.fecha === fecha &&
      reserva.turno === turno &&
      horasSeleccionadas.includes(reserva.hora) &&
      reserva.recurso === recurso &&
      !esPasado(reserva.fecha, reserva.hora, reserva.turno)
  );
  if (conflicto) {
    alert("❌ Alguna de las horas seleccionadas ya está reservada.");
    return;
  }

  const confirmacion = confirm(
    `¿Confirmás la reserva de ${recurso} para el ${fecha}, turno ${turno}, desde la hora ${hora} por ${duracion} hora(s), a nombre de ${nombre} ${apellido}?`
  );
  if (!confirmacion) return;

  const endpoint =
    "https://script.google.com/macros/s/AKfycbxZglN8LQP4UEuyyG4HekWkq4yolrEJARsrFRcXFiSzFaymYJfu-pBqwhngPH0YGZxd/exec";

  horasSeleccionadas.forEach((h, i) => {
    const nuevaReserva = {
      id: Date.now() + i + Math.floor(Math.random() * 1000), // entero para ID
      fecha: fecha,
      turno: turno,
      hora: h,
      recurso: recurso,
      nombre: nombre,
      apellido: apellido,
      fechaReserva: new Date().toISOString()
    };

    reservas.push(nuevaReserva);

    const formData = new URLSearchParams();
    formData.append("data", JSON.stringify(nuevaReserva));

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData
    })
      .then((res) => res.text())
      .then((data) => console.log("📥 Respuesta del servidor:", data))
      .catch((error) => console.error("❌ Error en fetch:", error));
  });

  localStorage.setItem("reservasLiceo", JSON.stringify(reservas));

  alert(
    `✅ Reserva realizada!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Horas: ${horasSeleccionadas.join(", ")}`
  );

  consultarDisponibilidad();
  actualizarReservas();
  actualizarReportes();
}

// ===== Cancelar reserva =====
function cancelarReserva(id) {
  const confirmacion = confirm("¿Estás seguro de que quieres cancelar esta reserva?");
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
  const reservasActivas = reservas.filter(
    (reserva) => !esPasado(reserva.fecha, reserva.hora, reserva.turno)
  );

  const hoy = new Date().toISOString().split("T")[0];
  const reservasHoy = reservasActivas.filter((reserva) => reserva.fecha === hoy);

  const totalEl = document.getElementById("total-reservas");
  const hoyEl = document.getElementById("reservas-hoy");
  const dispEl = document.getElementById("recursos-disponibles");
  if (totalEl) totalEl.textContent = reservasActivas.length;
  if (hoyEl) hoyEl.textContent = reservasHoy.length;

  const totalRecursos =
    recursosMatutino.length * horasMatutino.length +
    recursosVespertino.length * horasVespertino.length;
  if (dispEl) dispEl.textContent = totalRecursos - reservasActivas.length;

  const reporteRecursos = document.getElementById("reporte-recursos");
  if (reporteRecursos) {
    const conteoRecursos = {};
    [...recursosMatutino, "Sala de Informática", "Salón 10"].forEach((recurso) => {
      conteoRecursos[recurso] = reservasActivas.filter((r) => r.recurso === recurso).length;
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

  const reporteTurnos = document.getElementById("reporte-turnos");
  if (reporteTurnos) {
    const conteoTurnos = {
      matutino: reservasActivas.filter((r) => r.turno === "matutino").length,
      vespertino: reservasActivas.filter((r) => r.turno === "vespertino").length
    };

    reporteTurnos.innerHTML = "";
    Object.entries(conteoTurnos).forEach(([turno, cantidad]) => {
      const div = document.createElement("div");
      div.className = "reserva-item";
      div.innerHTML = `
        <div class="reserva-info">
          <div class="reserva-recurso">Turno ${turno.charAt(0).toUpperCase() + turno.slice(1)}</div>
          <div class="reserva-detalles">${cantidad} reservas activas</div>
        </div>
      `;
      reporteTurnos.appendChild(div);
    });
  }
}

// ===== Tabs (sin depender de "event") =====
function cambiarTab(tabName) {
  // Contenidos
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add("active");

  // Cabeceras
  const tabs = document.querySelectorAll(".tabs .tab");
  tabs.forEach((t) => t.classList.remove("active"));
  const indexByName = { disponibilidad: 0, reservas: 1, reportes: 2 };
  const idx = indexByName[tabName];
  if (typeof idx === "number" && tabs[idx]) tabs[idx].classList.add("active");

  if (tabName === "reservas") actualizarReservas();
  if (tabName === "reportes") actualizarReportes();
}

// ===== Limpiar selección =====
function limpiarSeleccion() {
  const turnoEl = document.getElementById("turno");
  const horaEl = document.getElementById("hora");
  const durEl = document.getElementById("duracion");
  const info = document.getElementById("info-consulta");
  const recCont = document.getElementById("recursos-container");
  const msg = document.getElementById("mensaje-inicial");

  if (turnoEl) turnoEl.value = "";
  if (horaEl) horaEl.innerHTML = '<option value="">Seleccionar hora</option>';
  if (durEl) durEl.value = 1;
  if (info) info.style.display = "none";
  if (recCont) recCont.style.display = "none";
  if (msg) msg.style.display = "block";
}

// ===== Vencimiento de reservas =====
function esPasado(fecha, hora, turno) {
  const ahora = new Date();
  const fechaReserva = new Date(fecha + "T00:00:00");

  if (fechaReserva < new Date(ahora.toDateString())) return true;

  if (fechaReserva.toDateString() === ahora.toDateString()) {
    const horaActual = ahora.getHours();
    let horaReserva;

    if (hora === "0") {
      horaReserva = 13; // 13:00
    } else if (hora.includes("era")) {
      const numeroHora = parseInt(hora, 10);
      horaReserva = turno === "matutino" ? 7 + numeroHora : 13 + numeroHora;
    } else {
      // Respaldo por si aparece un formato inesperado
      horaReserva = 23;
    }
    return horaActual > horaReserva;
  }
  return false;
}

function limpiarReservasVencidas() {
  const activas = reservas.filter(
    (reserva) => !esPasado(reserva.fecha, reserva.hora, reserva.turno)
  );
  if (activas.length !== reservas.length) {
    reservas = activas;
    localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
  }
}
setInterval(limpiarReservasVencidas, 5 * 60 * 1000);

// ===== Debug =====
function debugReserva() {
  console.log("Reservas actuales:", reservas);
  console.log("Fecha actual:", new Date().toISOString().split("T")[0]);
}
