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
      '<div class="alert alert-warning">📭 No tenés reservas activas</div>';
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

  // Guardar en LocalStorage (opcional)
  reservas.push(nuevaReserva);
  localStorage.setItem("reservasLiceo", JSON.stringify(reservas));

  // Enviar a Google Sheets
  const endpoint =
    "https://script.google.com/macros/s/AKfycbxZglN8LQP4UEuyyG4HekWkq4yolrEJARsrFRcXFiSzFaymYJfu-pBqwhngPH0YGZxd/exec";
  

  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nuevaReserva), // ⬅️ NO envolvemos en { data: ... }, se envía el JSON directo
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.status === "success") {
        alert(
          `✅ Reserva realizada exitosamente!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Hora: ${hora}`
        );
        consultarDisponibilidad();
        actualizarReservas();
        actualizarReportes();
      } else {
        alert("❌ Error al guardar en la hoja: " + data.message);
        console.error(data);
      }
    })
    .catch((error) => {
      alert("❌ Error de conexión con el servidor.");
      console.error("Error en fetch:", error);
    });
}


function enviarAGoogleSheets(
  url,
  nuevaReserva,
  nombre,
  apellido,
  recurso,
  fecha,
  turno,
  hora
) {
  // Crear un iframe invisible
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.name = "reserva-frame-" + Date.now();
  document.body.appendChild(iframe);

  // Crear formulario
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.target = iframe.name;

  // Agregar datos como campo oculto
  const dataInput = document.createElement("input");
  dataInput.type = "hidden";
  dataInput.name = "data";
  dataInput.value = JSON.stringify(nuevaReserva);
  form.appendChild(dataInput);

  // Agregar formulario al DOM temporalmente
  document.body.appendChild(form);

  // Manejar respuesta
  let responseHandled = false;

  iframe.onload = function () {
    if (!responseHandled) {
      responseHandled = true;

      setTimeout(() => {
        try {
          // Limpiar elementos
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        } catch (e) {
          console.log("Error limpiando elementos (normal)");
        }

        // Mostrar mensaje de éxito
        alert(
          `✅ ¡Reserva guardada en Google Sheets!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Hora: ${hora}\n\n🔍 Revisa tu Google Sheet para confirmar.`
        );

        // Actualizar interfaz
        consultarDisponibilidad();
        actualizarReservas();
        actualizarReportes();
      }, 2000); // Dar tiempo para que se procese
    }
  };

  // Manejar errores de carga
  iframe.onerror = function () {
    if (!responseHandled) {
      responseHandled = true;
      alert(
        "⚠️ Error al conectar con Google Sheets. La reserva se guardó localmente."
      );

      try {
        document.body.removeChild(form);
        document.body.removeChild(iframe);
      } catch (e) {}
    }
  };

  // Enviar formulario
  console.log("Enviando reserva a Google Sheets...");
  form.submit();
}

function enviarPorForm(
  url,
  nuevaReserva,
  nombre,
  apellido,
  recurso,
  fecha,
  turno,
  hora
) {
  // Crear un iframe invisible para enviar los datos
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.name = "reserva-frame";
  document.body.appendChild(iframe);

  // Crear form que se envía al iframe
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.target = "reserva-frame";

  // Agregar el campo de datos
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "data";
  input.value = JSON.stringify(nuevaReserva);
  form.appendChild(input);

  document.body.appendChild(form);

  // Manejar la respuesta del iframe
  iframe.onload = function () {
    setTimeout(() => {
      try {
        // Limpiar elementos
        document.body.removeChild(form);
        document.body.removeChild(iframe);

        // Mostrar mensaje de éxito
        alert(
          `✅ Reserva realizada exitosamente!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Hora: ${hora}`
        );

        // Actualizar interfaz
        consultarDisponibilidad();
        actualizarReservas();
        actualizarReportes();
      } catch (error) {
        console.log("Reserva enviada, posible éxito");
        alert(
          `✅ Reserva enviada a Google Sheets!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Hora: ${hora}`
        );
      }
    }, 1000);
  };

  // Enviar el form
  form.submit();
}

// Función alternativa usando JSONP (si la anterior no funciona)
function enviarPorJSONP(url, data, callback) {
  const callbackName = "jsonp_callback_" + Math.round(100000 * Math.random());

  // Crear función de callback global
  window[callbackName] = function (response) {
    delete window[callbackName];
    document.body.removeChild(script);
    callback(response);
  };

  // Crear script tag para JSONP
  const script = document.createElement("script");
  script.src =
    url +
    "?callback=" +
    callbackName +
    "&data=" +
    encodeURIComponent(JSON.stringify(data));
  document.body.appendChild(script);
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

  // Guardar localmente (opcional)
  reservas.push(nuevaReserva);
  localStorage.setItem("reservasLiceo", JSON.stringify(reservas));

  // Enviar a Google Sheets
  const endpoint =
    "https://script.google.com/macros/s/AKfycbxZglN8LQP4UEuyyG4HekWkq4yolrEJARsrFRcXFiSzFaymYJfu-pBqwhngPH0YGZxd/exec";

  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // 👇 ¡IMPORTANTE! El Apps Script espera el objeto dentro de "data", y como STRING
    body: JSON.stringify({ data: JSON.stringify(nuevaReserva) }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.status === "success") {
        alert(
          `✅ Reserva realizada exitosamente!\n\n📋 Detalles:\n• Docente: ${nombre} ${apellido}\n• Recurso: ${recurso}\n• Fecha: ${fecha}\n• Turno: ${turno}\n• Hora: ${hora}`
        );
        consultarDisponibilidad();
        actualizarReservas();
        actualizarReportes();
      } else {
        alert("❌ Error al guardar en la hoja: " + data.message);
        console.error(data);
      }
    })
    .catch((error) => {
      alert("❌ Error de conexión con el servidor.");
      console.error("Error en fetch:", error);
    });
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


