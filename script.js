// Configuración de recursos por turno
const recursosMatutino = [
  "Cañón",
  "TV Planta Baja",
  "TV Planta Alta",
  'TV 43"',
  'TV 50"',
  "Caja",
];

const recursosVespertino = [
  ...recursosMatutino,
  "Sala de Informática",
  "Salón 10",
];

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

// Almacenamiento de reservas (en producción usarías una base de datos)
let reservas = JSON.parse(localStorage.getItem("reservasLiceo")) || [];

// Inicialización
document.addEventListener("DOMContentLoaded", function () {
  // Establecer fecha actual
  const hoy = new Date().toISOString().split("T")[0];
  document.getElementById("fecha").value = hoy;

  // Actualizar visualización
  actualizarReservas();
  actualizarReportes();
});

function actualizarReservas() {
  const container = document.getElementById("reservas-container");

  // Filtrar reservas activas (no vencidas)
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
      <button class="btn-cancelar" onclick="cancelarReserva(${reserva.id})">
        ❌ Cancelar
      </button>
    `;

    container.appendChild(item);
  });
}

function actualizarHoras() {
  const turno = document.getElementById("turno").value;
  const horaSelect = document.getElementById("hora");

  horaSelect.innerHTML = '<option value="">Seleccionar hora</option>';

  let horas = [];
  if (turno === "matutino") {
    horas = horasMatutino;
  } else if (turno === "vespertino") {
    horas = horasVespertino;
  }

  horas.forEach((hora) => {
    const option = document.createElement("option");
    option.value = hora;
    option.textContent = hora;
    horaSelect.appendChild(option);
  });

  actualizarDisponibilidad();
}

function actualizarDisponibilidad() {
  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;

  if (fecha && turno && hora) {
    consultarDisponibilidad();
  }
}

function consultarDisponibilidad() {
  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;

  if (!fecha || !turno || !hora) {
    alert("⚠️ Por favor selecciona fecha, turno y hora");
    return;
  }

  // Mostrar información de la consulta
  document.getElementById("mensaje-inicial").style.display = "none";
  document.getElementById("info-consulta").style.display = "block";
  document.getElementById("recursos-container").style.display = "block";

  const fechaFormatted = new Date(fecha + "T00:00:00").toLocaleDateString(
    "es-ES",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  document.getElementById("detalles-consulta").innerHTML = `
                      <strong>📅 Fecha:</strong> ${fechaFormatted}<br>
                      <strong>🕒 Turno:</strong> ${
                        turno.charAt(0).toUpperCase() + turno.slice(1)
                      }<br>
                      <strong>⏰ Hora:</strong> ${hora}
                  `;

  // Obtener recursos según el turno
  const recursos = turno === "matutino" ? recursosMatutino : recursosVespertino;

  // Verificar disponibilidad
  const recursosGrid = document.getElementById("recursos-grid");
  recursosGrid.innerHTML = "";

  recursos.forEach((recurso) => {
    const estaReservado = reservas.some(
      (reserva) =>
        reserva.fecha === fecha &&
        reserva.turno === turno &&
        reserva.hora === hora &&
        reserva.recurso === recurso &&
        !esPasado(reserva.fecha, reserva.hora, reserva.turno)
    );

    const card = document.createElement("div");
    card.className = `recurso-card ${estaReservado ? "ocupado" : "disponible"}`;
    card.innerHTML = `
                          <div class="recurso-nombre">${recurso}</div>
                          <div class="recurso-estado ${
                            estaReservado
                              ? "estado-ocupado"
                              : "estado-disponible"
                          }">
                              ${estaReservado ? "❌ Ocupado" : "✅ Disponible"}
                          </div>
                      `;

    if (!estaReservado) {
      card.onclick = () => realizarReserva(fecha, turno, hora, recurso);
    }

    recursosGrid.appendChild(card);
  });
}

// ⭐ FUNCIÓN PRINCIPAL DE RESERVA (CORREGIDA)
function realizarReserva(fecha, turno, hora, recurso) {
  const nombre = document.getElementById("nombre").value.trim();
  const apellido = document.getElementById("apellido").value.trim();

  if (!nombre || !apellido) {
    alert("⚠️ Por favor ingresá nombre y apellido ");
    return;
  }

  const confirmacion = confirm(
    `¿Confirmás la reserva de ${recurso} para el ${fecha} en el turno ${turno}, hora ${hora}, a nombre de ${nombre} ${apellido}?`
  );

  if (!confirmacion) return;

  const nuevaReserva = {
    id: Date.now(),
    fecha: fecha,
    turno: turno,
    hora: hora,
    recurso: recurso,
    nombre: nombre,
    apellido: apellido,
    fechaReserva: new Date().toISOString(),
  };

  // Guardar localmente primero
  reservas.push(nuevaReserva);
  localStorage.setItem("reservasLiceo", JSON.stringify(reservas));

  // Enviar a Google Sheets usando FormData (CORRECTO)
  const endpoint = "https://script.google.com/macros/s/AKfycbxZglN8LQP4UEuyyG4HekWkq4yolrEJARsrFRcXFiSzFaymYJfu-pBqwhngPH0YGZxd/exec";
  
  const formData = new URLSearchParams();
  formData.append('data', JSON.stringify(nuevaReserva));

  console.log("📤 Enviando datos:", JSON.stringify(nuevaReserva));

  fetch(endpoint, {
    method: "POST",
    body: formData
  })
    .then((res) => res.text())
    .then((data) => {
      console.log("📥 Respuesta del servidor:", data);
      
      try {
        const jsonResponse = JSON.parse(data);
        if (jsonResponse.status === "success") {
          alert(
            `✅ Reserva realizada exitosamente!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Hora: ${hora}`
          );
        } else {
          alert("❌ Error al guardar en la hoja: " + jsonResponse.message);
        }
      } catch (parseError) {
        // Si no es JSON válido, pero la respuesta contiene "success"
        if (data.includes("success") || data.includes("exitosa")) {
          alert(
            `✅ Reserva enviada exitosamente!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Hora: ${hora}`
          );
        } else {
          alert("⚠️ Respuesta del servidor: " + data);
        }
      }
      
      // Actualizar interfaz
      consultarDisponibilidad();
      actualizarReservas();
      actualizarReportes();
    })
    .catch((error) => {
      console.error("❌ Error en fetch:", error);
      alert("❌ Error de conexión con el servidor. La reserva se guardó localmente.");
      
      // Actualizar interfaz aunque haya error de conexión
      consultarDisponibilidad();
      actualizarReservas();
      actualizarReportes();
    });
}

function cancelarReserva(id) {
  const confirmacion = confirm(
    "¿Estás seguro de que quieres cancelar esta reserva?"
  );

  if (confirmacion) {
    reservas = reservas.filter((reserva) => reserva.id !== id);
    localStorage.setItem("reservasLiceo", JSON.stringify(reservas));

    alert("✅ Reserva cancelada exitosamente");

    // Actualizar visualización
    actualizarReservas();
    actualizarReportes();
    consultarDisponibilidad();
  }
}

function actualizarReportes() {
  const reservasActivas = reservas.filter(
    (reserva) => !esPasado(reserva.fecha, reserva.hora, reserva.turno)
  );

  const hoy = new Date().toISOString().split("T")[0];
  const reservasHoy = reservasActivas.filter(
    (reserva) => reserva.fecha === hoy
  );

  // Actualizar estadísticas
  document.getElementById("total-reservas").textContent =
    reservasActivas.length;
  document.getElementById("reservas-hoy").textContent = reservasHoy.length;

  // Calcular recursos disponibles totales
  const totalRecursos =
    recursosMatutino.length * horasMatutino.length +
    recursosVespertino.length * horasVespertino.length;
  document.getElementById("recursos-disponibles").textContent =
    totalRecursos - reservasActivas.length;

  // Reporte por recursos
  const reporteRecursos = document.getElementById("reporte-recursos");
  const conteoRecursos = {};

  [...recursosMatutino, "Sala de Informática", "Salón 10"].forEach(
    (recurso) => {
      conteoRecursos[recurso] = reservasActivas.filter(
        (r) => r.recurso === recurso
      ).length;
    }
  );

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

  // Reporte por turnos
  const reporteTurnos = document.getElementById("reporte-turnos");
  const conteoTurnos = {
    matutino: reservasActivas.filter((r) => r.turno === "matutino").length,
    vespertino: reservasActivas.filter((r) => r.turno === "vespertino").length,
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

function cambiarTab(tabName) {
  // Ocultar todos los contenidos
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  // Desactivar todas las pestañas
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.remove("active");
  });

  // Activar pestaña y contenido seleccionados
  document.getElementById(`tab-${tabName}`).classList.add("active");
  event.target.classList.add("active");

  // Actualizar contenido si es necesario
  if (tabName === "reservas") {
    actualizarReservas();
  } else if (tabName === "reportes") {
    actualizarReportes();
  }
}

function limpiarSeleccion() {
  document.getElementById("turno").value = "";
  document.getElementById("hora").innerHTML =
    '<option value="">Seleccionar hora</option>';
  document.getElementById("info-consulta").style.display = "none";
  document.getElementById("recursos-container").style.display = "none";
  document.getElementById("mensaje-inicial").style.display = "block";
}

function esPasado(fecha, hora, turno) {
  const ahora = new Date();
  const fechaReserva = new Date(fecha + "T00:00:00");

  // Si es un día pasado, está vencido
  if (fechaReserva < new Date(ahora.toDateString())) {
    return true;
  }

  // Si es hoy, verificar la hora
  if (fechaReserva.toDateString() === ahora.toDateString()) {
    const horaActual = ahora.getHours();

    // Convertir hora de reserva a número
    let horaReserva;
    if (hora === "0") {
      horaReserva = 13; // 0 hora del vespertino = 13:00
    } else if (hora.includes("era")) {
      const numeroHora = parseInt(hora);
      if (turno === "matutino") {
        horaReserva = 7 + numeroHora; // 1era hora = 8:00
      } else {
        horaReserva = 13 + numeroHora; // 1era hora vespertino = 14:00
      }
    }

    return horaActual > horaReserva;
  }

  return false;
}

// Limpiar reservas vencidas automáticamente
function limpiarReservasVencidas() {
  const reservasActivas = reservas.filter(
    (reserva) => !esPasado(reserva.fecha, reserva.hora, reserva.turno)
  );

  if (reservasActivas.length !== reservas.length) {
    reservas = reservasActivas;
    localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
  }
}

// Ejecutar limpieza cada 5 minutos
setInterval(limpiarReservasVencidas, 5 * 60 * 1000);

// Ejecutar limpieza al cargar
limpiarReservasVencidas();

// Función de prueba para debugging
function debugReserva() {
  console.log("Reservas actuales:", reservas);
  console.log("Fecha actual:", new Date().toISOString().split("T")[0]);
}