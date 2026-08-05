// Sistema de Reservas - Backend propio en Vercel + Postgres (Neon)
// Prevención de colisiones a nivel de base de datos (restricción UNIQUE)

// Configuración
const endpoint = "/api/reservas";

// Estado global
let reservas = [];
let reservaEnProgreso = false;
let ultimaSincronizacion = 0;
let sessionId = generateSessionId();

// Turnos, horas y recursos: se cargan desde la base (administrables desde el panel)
let turnosData = [];
let recursosData = [];

async function cargarConfiguracion() {
  try {
    const [rTurnos, rRecursos] = await Promise.all([fetch("/api/turnos"), fetch("/api/recursos")]);
    const bTurnos = await rTurnos.json();
    const bRecursos = await rRecursos.json();
    turnosData = bTurnos.turnos || [];
    recursosData = bRecursos.recursos || [];
    poblarSelectTurnos();
  } catch (error) {
    console.error("Error cargando turnos/recursos:", error);
  }
}

function poblarSelectTurnos() {
  const turnoSelect = document.getElementById("turno");
  if (!turnoSelect) return;
  const valorActual = turnoSelect.value;

  turnoSelect.innerHTML = '<option value="">Seleccionar turno</option>';
  turnosData.forEach(function (t) {
    const option = document.createElement("option");
    option.value = t.nombre;
    option.textContent = t.etiqueta;
    turnoSelect.appendChild(option);
  });

  if (valorActual) turnoSelect.value = valorActual;
}

function getHorasTurno(turnoNombre) {
  const turno = turnosData.find(function (t) { return t.nombre === turnoNombre; });
  if (!turno) return [];
  return turno.horas
    .slice()
    .sort(function (a, b) { return a.orden - b.orden; })
    .map(function (h) { return h.etiqueta; });
}

function getRecursosTurno(turnoNombre) {
  return recursosData
    .filter(function (r) { return r.turnos.indexOf(turnoNombre) !== -1; })
    .map(function (r) { return r.nombre; });
}

function normalizarFecha(fechaServidor) {
  if (!fechaServidor) return null;
  
  try {
    // Si ya viene en formato YYYY-MM-DD, devolverla tal como está
    if (typeof fechaServidor === 'string' && fechaServidor.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return fechaServidor;
    }
    
    // Si viene como Date string completo o timestamp, parsearlo
    var fecha = new Date(fechaServidor);
    
    if (isNaN(fecha.getTime())) {
      console.warn("Fecha inválida:", fechaServidor);
      return null;
    }
    
    // Convertir a formato YYYY-MM-DD
    var year = fecha.getFullYear();
    var month = String(fecha.getMonth() + 1).padStart(2, '0');
    var day = String(fecha.getDate()).padStart(2, '0');
    
    return year + "-" + month + "-" + day;
  } catch (error) {
    console.error("Error normalizando fecha:", fechaServidor, error);
    return null;
  }
}

// Cargar cache local
try {
  const cached = JSON.parse(localStorage.getItem("reservasLiceo")) || [];
  reservas = cached;
} catch (error) {
  console.warn("Error cargando cache:", error);
  reservas = [];
}

// Utilidades
function generateSessionId() {
  return Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

function getDuracion() {
  const el = document.getElementById("duracion");
  const n = el ? parseInt(el.value, 10) : 1;
  const max = el && el.max ? parseInt(el.max, 10) : null;

  if (!Number.isFinite(n) || n < 1) return 1;
  if (Number.isFinite(max) && n > max) return max;
  return n;
}

function actualizarMaxDuracion() {
  const duracionEl = document.getElementById("duracion");
  if (!duracionEl) return;

  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;
  const horasTurno = getHorasTurno(turno);
  const indiceHora = horasTurno.indexOf(hora);

  const maxHoras = indiceHora === -1
    ? (horasTurno.length || 1)
    : (horasTurno.length - indiceHora);

  duracionEl.max = maxHoras || 1;
  if (parseInt(duracionEl.value, 10) > maxHoras) {
    duracionEl.value = maxHoras || 1;
  }
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const partes = fechaStr.split("-");
  if (partes.length !== 3) return fechaStr;
  return partes[2] + "/" + partes[1] + "/" + partes[0].slice(-2);
}

function formatearFechaHora(fechaISO) {
  if (!fechaISO) return "";
  const d = new Date(fechaISO);
  if (isNaN(d.getTime())) return fechaISO;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = String(d.getFullYear()).slice(-2);
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return dia + "/" + mes + "/" + anio + " " + hora + ":" + min;
}

function slotKey(reserva) {
  return reserva.fecha + "|" + reserva.turno + "|" + reserva.hora + "|" + reserva.recurso;
}

function buildKey(fecha, turno, hora, recurso) {
  return fecha + "|" + turno + "|" + hora + "|" + recurso;
}

function esPasado(fecha) {
  const hoyStr = new Date().toISOString().split("T")[0];
  return fecha < hoyStr;
}

let estadoTimeoutId = null;
function mostrarEstado(mensaje, tipo) {
  const el = document.getElementById("estado-reserva");
  if (!el) return;

  if (estadoTimeoutId) clearTimeout(estadoTimeoutId);
  el.textContent = mensaje;
  el.className = "estado-" + (tipo || "info") + " show";
  estadoTimeoutId = setTimeout(function () {
    el.classList.remove("show");
  }, 5000);
}

// Sincronización mejorada con manejo de errores
async function sincronizarConServidor(maxRetries) {
  if (!maxRetries) maxRetries = 3;
  
  for (let intento = 0; intento < maxRetries; intento++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(function() { controller.abort(); }, 10000);

      const response = await fetch(endpoint, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = await response.json();

      if (data.status === "ok" && Array.isArray(data.reservas)) {
        var reservasNormalizadas = data.reservas.map(function(reserva) {
  var fechaNormalizada = normalizarFecha(reserva.fecha);
  return {
    id: reserva.id,
    nombre: reserva.nombre,
    apellido: reserva.apellido,
    fecha: fechaNormalizada,
    turno: reserva.turno,
    hora: reserva.hora,
    recurso: reserva.recurso,
    cantidadHoras: reserva.cantidadHoras,
    fechaReserva: reserva.fechaReserva
  };
}).filter(function(r) { 
  return r.fecha && !esPasado(r.fecha);
});

reservas = reservasNormalizadas;
console.log("Reservas normalizadas:", reservas.length);
        localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
        ultimaSincronizacion = Date.now();
        return true;
      } else if (data.status === "ok") {
        // Respuesta OK pero sin reservas array, asumir lista vacía
        reservas = [];
        localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
        ultimaSincronizacion = Date.now();
        return true;
      } else {
        throw new Error(data.message || "Respuesta inválida del servidor");
      }
    } catch (error) {
      console.warn("Intento " + (intento + 1) + " falló:", error);
      if (intento < maxRetries - 1) {
        await new Promise(function(resolve) { 
          setTimeout(resolve, Math.pow(2, intento) * 1000); 
        });
      }
    }
  }
  
  console.warn("No se pudo sincronizar después de " + maxRetries + " intentos");
  return false;
}

// Reserva simple con verificación previa
async function realizarReserva(fecha, turno, hora, recurso) {
  if (reservaEnProgreso) {
    mostrarEstado("Ya hay una reserva en progreso. Espera un momento.", "warning");
    return;
  }

  reservaEnProgreso = true;

  try {
    const nombre = document.getElementById("nombre").value.trim();
    const apellido = document.getElementById("apellido").value.trim();
    const duracion = getDuracion();

    if (!nombre || !apellido) {
      mostrarEstado("Por favor ingresa nombre y apellido", "warning");
      return;
    }

    const horasTurno = getHorasTurno(turno);
    const indiceHora = horasTurno.indexOf(hora);

    if (indiceHora === -1) {
      mostrarEstado("Hora inválida", "error");
      return;
    }

    if (indiceHora + duracion > horasTurno.length) {
      mostrarEstado("No hay suficientes horas disponibles en este turno.", "warning");
      return;
    }

    const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);

    // Sincronizar antes de verificar
    await sincronizarConServidor();

    // Verificar disponibilidad local primero
    const ocupado = horasSeleccionadas.some(function(hSel) {
      return reservas.some(function(r) {
        return !esPasado(r.fecha) && 
               r.fecha === fecha && 
               r.turno === turno && 
               r.hora === hSel && 
               r.recurso === recurso;
      });
    });

    if (ocupado) {
      mostrarEstado("Este recurso ya está reservado en alguna de las horas seleccionadas.", "warning");
      return;
    }

    const yaTieneOtraReserva = horasSeleccionadas.some(function(hSel) {
      return reservas.some(function(r) {
        return !esPasado(r.fecha) &&
               r.fecha === fecha &&
               r.turno === turno &&
               r.hora === hSel &&
               r.nombre.trim().toLowerCase() === nombre.toLowerCase() &&
               r.apellido.trim().toLowerCase() === apellido.toLowerCase();
      });
    });

    if (yaTieneOtraReserva) {
      mostrarEstado("Ya tenés otra reserva en alguna de esas horas.", "warning");
      return;
    }

    // Confirmar reserva
    const confirmacion = confirm(
      "¿Confirmar reserva?\n\n" +
      "Docente: " + nombre + " " + apellido + "\n" +
      "Recurso: " + recurso + "\n" +
      "Fecha: " + fecha + "\n" +
      "Turno: " + turno + "\n" +
      "Horas: " + horasSeleccionadas.join(", ")
    );

    if (!confirmacion) return;

    // Realizar reservas
    let reservasExitosas = 0;
    let mensajeFallo = null;
    const nuevasReservas = [];

    for (let i = 0; i < horasSeleccionadas.length; i++) {
      const h = horasSeleccionadas[i];

      const nuevaReserva = {
        id: Date.now() + i + Math.floor(Math.random() * 1000),
        fecha: fecha,
        turno: turno,
        hora: h,
        recurso: recurso,
        nombre: nombre,
        apellido: apellido,
        cantidadHoras: duracion,
        fechaReserva: new Date().toISOString()
      };

      const resultado = await enviarReservaServidor(nuevaReserva);
      if (resultado.exito) {
        nuevasReservas.push(nuevaReserva);
        reservasExitosas++;
      } else {
        console.warn("Fallo reserva para hora " + h + ", cancelando proceso");
        mensajeFallo = resultado.mensaje;
        break;
      }
    }

    if (reservasExitosas === horasSeleccionadas.length) {
      // Todas exitosas
      reservas = reservas.concat(nuevasReservas);
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));

      mostrarEstado(
        "Reserva realizada exitosamente!\n" +
        recurso + " - " + fecha + " - " + turno + "\n" +
        "Horas: " + horasSeleccionadas.join(", "),
        "success"
      );
    } else {
      mostrarEstado(
        (mensajeFallo || "Algunas horas ya estaban ocupadas.") +
        "\nSolo se pudieron reservar " + reservasExitosas + " de " + horasSeleccionadas.length + " horas.",
        "warning"
      );
    }

    // Sincronizar y refrescar
    await sincronizarConServidor();
    consultarDisponibilidadServidor();
    actualizarReservas();

  } catch (error) {
    console.error("Error en reserva:", error);
    mostrarEstado("Error procesando la reserva. Intenta nuevamente.", "error");
  } finally {
    reservaEnProgreso = false;
  }
}

async function enviarReservaServidor(reservaData) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reservaData)
    });

    const result = await response.json();

    if (response.status === 409) {
      console.warn("Conflicto detectado:", result.message);
      return { exito: false, mensaje: result.message };
    }

    return { exito: response.ok && result.status === "success", mensaje: result.message };
  } catch (error) {
    console.error("Error enviando reserva:", error);
    return { exito: false, mensaje: null };
  }
}

// Consulta de disponibilidad
async function consultarDisponibilidadServidor() {
  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;
  const duracion = getDuracion();

  if (!fecha || !turno || !hora) return;

  mostrarCargando(true);

  try {
    await sincronizarConServidor();

    const horasTurno = getHorasTurno(turno);
    const indiceHora = horasTurno.indexOf(hora);
    if (indiceHora === -1) {
      mostrarEstado("Hora inválida", "error");
      return;
    }

    const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);
    actualizarUIConsulta(fecha, turno, hora, duracion, horasSeleccionadas);

  } catch (error) {
    console.error("Error consultando disponibilidad:", error);
    mostrarEstado("Error consultando disponibilidad. Intenta nuevamente.", "error");
  } finally {
    mostrarCargando(false);
  }
}

function actualizarUIConsulta(fecha, turno, hora, duracion, horasSeleccionadas) {
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
    detalles.innerHTML = 
      "<strong>Fecha:</strong> " + fechaFormatted + "<br>" +
      "<strong>Turno:</strong> " + (turno.charAt(0).toUpperCase() + turno.slice(1)) + "<br>" +
      "<strong>Hora inicial:</strong> " + hora + "<br>" +
      "<strong>Duración:</strong> " + duracion + " hora(s)<br>" +
      "<strong>Última sync:</strong> " + new Date(ultimaSincronizacion).toLocaleTimeString();
  }

  const recursos = getRecursosTurno(turno);
  const recursosGrid = document.getElementById("recursos-grid");
  if (!recursosGrid) return;
  
  recursosGrid.innerHTML = "";

  const reservasActivasSet = new Set();
  reservas.forEach(function(r) {
    if (!esPasado(r.fecha)) {
      reservasActivasSet.add(slotKey(r));
    }
  });

  const recursosDisponibles = recursos.filter(function(recurso) {
    const ocupado = horasSeleccionadas.some(function(hSel) {
      return reservasActivasSet.has(buildKey(fecha, turno, hSel, recurso));
    });
    return !ocupado;
  });

  if (recursosDisponibles.length === 0) {
    recursosGrid.innerHTML = '<div class="alert alert-warning">No hay recursos disponibles para ese horario</div>';
    return;
  }

  recursosDisponibles.forEach(function(recurso) {
    const card = document.createElement("div");
    card.className = "recurso-card disponible";
    card.innerHTML =
      '<div class="recurso-nombre">' + recurso + '</div>' +
      '<div class="recurso-estado estado-disponible">Disponible</div>';

    card.onclick = function() {
      realizarReserva(fecha, turno, hora, recurso);
    };

    recursosGrid.appendChild(card);
  });
}

function mostrarCargando(mostrar) {
  const recursosGrid = document.getElementById("recursos-grid");
  if (!recursosGrid) return;
  
  if (mostrar) {
    recursosGrid.innerHTML = '<div class="alert alert-warning">Consultando disponibilidad en servidor...</div>';
  }
}

// Funciones de UI
function actualizarReservas() {
  const container = document.getElementById("reservas-container");
  if (!container) return;

  const nombre = (document.getElementById("nombre") || {}).value || "";
  const apellido = (document.getElementById("apellido") || {}).value || "";
  const nombreNorm = nombre.trim().toLowerCase();
  const apellidoNorm = apellido.trim().toLowerCase();

  if (!nombreNorm || !apellidoNorm) {
    container.innerHTML = '<div class="alert alert-warning">Ingresar nombre y apellido en el panel de la izquierda para ver tus reservas</div>';
    return;
  }

  const reservasActivas = reservas.filter(function(r) {
    return !esPasado(r.fecha) &&
      r.nombre.trim().toLowerCase() === nombreNorm &&
      r.apellido.trim().toLowerCase() === apellidoNorm;
  });

  if (reservasActivas.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">No tienes reservas activas</div>';
    return;
  }

  container.innerHTML = "";
  reservasActivas.forEach(function(reserva) {
    const fechaFormatted = formatearFecha(reserva.fecha);
    const item = document.createElement("div");
    item.className = "reserva-item";
    item.innerHTML = 
      '<div class="reserva-info">' +
        '<div class="reserva-recurso">' + reserva.recurso + '</div>' +
        '<div class="reserva-detalles">' +
          fechaFormatted + ' | ' + reserva.turno + ' | ' + reserva.hora + '<br>' +
          reserva.nombre + ' ' + reserva.apellido +
        '</div>' +
      '</div>' +
      '<button class="btn-cancelar" onclick="cancelarReserva(' + reserva.id + ')">Cancelar</button>';
    container.appendChild(item);
  });
}

function actualizarHoras() {
  const turno = document.getElementById("turno").value;
  const horaSelect = document.getElementById("hora");
  if (!horaSelect) return;

  horaSelect.innerHTML = '<option value="">Seleccionar hora</option>';

  const horas = getHorasTurno(turno);

  horas.forEach(function(hora) {
    const option = document.createElement("option");
    option.value = hora;
    option.textContent = hora;
    horaSelect.appendChild(option);
  });

  actualizarMaxDuracion();
  consultarDisponibilidadServidor();
}

function actualizarDisponibilidad() {
  actualizarMaxDuracion();

  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;
  if (fecha && turno && hora) {
    consultarDisponibilidadServidor();
  }
}

function consultarDisponibilidad() {
  consultarDisponibilidadServidor();
}

async function cancelarReserva(id) {
  const confirmacion = confirm("¿Estás seguro de que quieres cancelar esta reserva?");
  if (!confirmacion) return;

  try {
    const reserva = reservas.find(function(r) { return r.id == id; });
    if (!reserva) {
      mostrarEstado("Reserva no encontrada", "error");
      return;
    }

    const response = await fetch(endpoint + "/" + id, {
      method: "DELETE"
    });

    const result = await response.json();

    if (response.ok && result.status === "ok") {
      reservas = reservas.filter(function(reserva) { return reserva.id != id; });
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
      
      mostrarEstado("Reserva cancelada exitosamente", "success");

      actualizarReservas();
      consultarDisponibilidadServidor();
    } else {
      mostrarEstado("Error cancelando reserva: " + (result.message || "Error desconocido"), "error");
    }
  } catch (error) {
    console.error("Error cancelando reserva:", error);
    mostrarEstado("Error cancelando reserva. Intenta nuevamente.", "error");
  }
}

// Reporte de administrador (protegido con login)
async function loginAdmin() {
  const usuario = document.getElementById("admin-usuario").value.trim();
  const contrasena = document.getElementById("admin-contrasena").value;

  if (!usuario || !contrasena) {
    mostrarEstado("Ingresar usuario y contraseña", "warning");
    return;
  }

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuario, contrasena: contrasena })
    });
    const result = await response.json();

    if (response.ok && result.status === "ok") {
      document.getElementById("admin-contrasena").value = "";
      await cargarReporteAdmin();
    } else {
      mostrarEstado(result.message || "Usuario o contraseña incorrectos", "error");
    }
  } catch (error) {
    console.error("Error en login:", error);
    mostrarEstado("Error iniciando sesión. Intenta nuevamente.", "error");
  }
}

async function logoutAdmin() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch (error) {
    console.error("Error cerrando sesión:", error);
  }
  document.getElementById("login-admin").style.display = "block";
  document.getElementById("reporte-admin").style.display = "none";
}

async function cargarReporteAdmin(fecha) {
  try {
    const url = fecha ? "/api/reporte?fecha=" + encodeURIComponent(fecha) : "/api/reporte";
    const response = await fetch(url);

    if (response.status === 401) {
      document.getElementById("login-admin").style.display = "block";
      document.getElementById("reporte-admin").style.display = "none";
      return;
    }

    const result = await response.json();
    if (!response.ok || result.status !== "ok") {
      mostrarEstado(result.message || "Error consultando el reporte", "error");
      return;
    }

    document.getElementById("login-admin").style.display = "none";
    document.getElementById("reporte-admin").style.display = "block";
    renderReporteTabla(result.reservas);
  } catch (error) {
    console.error("Error consultando el reporte:", error);
    mostrarEstado("Error consultando el reporte. Intenta nuevamente.", "error");
  }
}

function filtrarReporte() {
  const fecha = document.getElementById("reporte-fecha").value;
  cargarReporteAdmin(fecha || undefined);
}

function verTodasReporte() {
  document.getElementById("reporte-fecha").value = "";
  cargarReporteAdmin();
}

async function archivarAhora() {
  const confirmacion = confirm("¿Archivar en la planilla y borrar de la base todas las reservas ya vencidas?");
  if (!confirmacion) return;

  try {
    const response = await fetch("/api/archivar", { method: "POST" });
    const result = await response.json();

    if (response.ok && result.status === "ok") {
      mostrarEstado("Se archivaron " + result.archivadas + " reserva(s) vencida(s).", "success");
      cargarReporteAdmin();
    } else {
      mostrarEstado(result.message || "Error archivando reservas", "error");
    }
  } catch (error) {
    console.error("Error archivando reservas:", error);
    mostrarEstado("Error archivando reservas. Intenta nuevamente.", "error");
  }
}

function renderReporteTabla(filas) {
  const container = document.getElementById("reporte-tabla-container");
  if (!container) return;

  if (filas.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">No hay reservas para mostrar</div>';
    return;
  }

  let html = '<table class="tabla-reporte"><thead><tr>' +
    '<th>Docente</th><th>Recurso</th><th>Fecha</th><th>Turno</th><th>Hora</th><th>Duración</th><th>Reservado el</th>' +
    '</tr></thead><tbody>';

  filas.forEach(function (r) {
    const fechaFormatted = formatearFecha(r.fecha);
    const fechaReservaFormatted = formatearFechaHora(r.fechaReserva);
    html += "<tr>" +
      "<td>" + r.nombre + " " + r.apellido + "</td>" +
      "<td>" + r.recurso + "</td>" +
      "<td>" + fechaFormatted + "</td>" +
      "<td>" + r.turno + "</td>" +
      "<td>" + r.hora + "</td>" +
      "<td>" + r.cantidadHoras + "</td>" +
      "<td>" + fechaReservaFormatted + "</td>" +
      "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// Administración de turnos, horas y recursos (panel admin)
function mostrarPanelAdmin(nombre) {
  const panelReporte = document.getElementById("panel-reporte");
  const panelConfig = document.getElementById("panel-config");
  if (panelReporte) panelReporte.style.display = nombre === "reporte" ? "block" : "none";
  if (panelConfig) panelConfig.style.display = nombre === "config" ? "block" : "none";

  const tabs = document.querySelectorAll("#reporte-admin .tabs .tab");
  tabs.forEach(function (t) { t.classList.remove("active"); });
  const idx = nombre === "reporte" ? 0 : 1;
  if (tabs[idx]) tabs[idx].classList.add("active");

  if (nombre === "config") {
    cargarAdminConfig();
  }
}

async function cargarAdminConfig() {
  await cargarConfiguracion();
  renderTurnosAdmin();
  renderRecursosAdmin();
}

function renderTurnosAdmin() {
  const container = document.getElementById("turnos-admin-container");
  if (!container) return;

  if (turnosData.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">No hay turnos cargados</div>';
    return;
  }

  let html = "";
  turnosData.forEach(function (t) {
    const horasOrdenadas = t.horas.slice().sort(function (a, b) { return a.orden - b.orden; });
    const chips = horasOrdenadas.map(function (h) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;background:#e9ecef;border-radius:12px;padding:3px 10px;margin:3px;">' +
        h.etiqueta +
        '<button onclick="eliminarHora(' + h.id + ')" title="Eliminar hora" style="border:none;background:none;color:#dc3545;cursor:pointer;font-weight:bold;">×</button>' +
        '</span>';
    }).join("");

    html += '<div class="reserva-item" style="flex-direction:column;align-items:stretch;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<strong>' + t.etiqueta + '</strong>&nbsp;<span style="color:#6c757d;font-size:13px;">(' + t.nombre + ')</span>' +
      '<button class="btn-cancelar" onclick="eliminarTurno(' + t.id + ')">Eliminar turno</button>' +
      '</div>' +
      '<div style="margin-top:8px;">' + (chips || '<em>sin horas</em>') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
      '<input type="text" id="nueva-hora-' + t.id + '" placeholder="Nueva hora (ej: 9na)" style="flex:1;padding:8px;border:1px solid #dee2e6;border-radius:6px;" />' +
      '<button class="btn btn-secondary" style="width:auto;" onclick="agregarHora(' + t.id + ')">+ Hora</button>' +
      '</div>' +
      '</div>';
  });

  container.innerHTML = html;
}

async function agregarTurno() {
  const nombre = document.getElementById("nuevo-turno-nombre").value.trim().toLowerCase();
  const etiqueta = document.getElementById("nuevo-turno-etiqueta").value.trim();

  if (!nombre || !etiqueta) {
    mostrarEstado("Completar nombre interno y nombre a mostrar del turno", "warning");
    return;
  }

  try {
    const response = await fetch("/api/turnos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombre, etiqueta: etiqueta, orden: turnosData.length + 1 })
    });
    const result = await response.json();

    if (response.ok && result.status === "success") {
      document.getElementById("nuevo-turno-nombre").value = "";
      document.getElementById("nuevo-turno-etiqueta").value = "";
      mostrarEstado("Turno agregado", "success");
      await cargarAdminConfig();
    } else {
      mostrarEstado(result.message || "Error agregando el turno", "error");
    }
  } catch (error) {
    console.error("Error agregando turno:", error);
    mostrarEstado("Error agregando el turno. Intenta nuevamente.", "error");
  }
}

async function eliminarTurno(id) {
  const confirmacion = confirm("¿Eliminar este turno? También se eliminan sus horas y deja de poder reservarse en él.");
  if (!confirmacion) return;

  try {
    const response = await fetch("/api/turnos/" + id, { method: "DELETE" });
    const result = await response.json();

    if (response.ok && result.status === "ok") {
      mostrarEstado("Turno eliminado", "success");
      await cargarAdminConfig();
    } else {
      mostrarEstado(result.message || "Error eliminando el turno", "error");
    }
  } catch (error) {
    console.error("Error eliminando turno:", error);
    mostrarEstado("Error eliminando el turno. Intenta nuevamente.", "error");
  }
}

async function agregarHora(turnoId) {
  const input = document.getElementById("nueva-hora-" + turnoId);
  const etiqueta = input ? input.value.trim() : "";

  if (!etiqueta) {
    mostrarEstado("Escribir la etiqueta de la hora", "warning");
    return;
  }

  try {
    const response = await fetch("/api/turnos/" + turnoId + "/horas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiqueta: etiqueta })
    });
    const result = await response.json();

    if (response.ok && result.status === "success") {
      mostrarEstado("Hora agregada", "success");
      await cargarAdminConfig();
    } else {
      mostrarEstado(result.message || "Error agregando la hora", "error");
    }
  } catch (error) {
    console.error("Error agregando hora:", error);
    mostrarEstado("Error agregando la hora. Intenta nuevamente.", "error");
  }
}

async function eliminarHora(id) {
  const confirmacion = confirm("¿Eliminar esta hora?");
  if (!confirmacion) return;

  try {
    const response = await fetch("/api/horas/" + id, { method: "DELETE" });
    const result = await response.json();

    if (response.ok && result.status === "ok") {
      mostrarEstado("Hora eliminada", "success");
      await cargarAdminConfig();
    } else {
      mostrarEstado(result.message || "Error eliminando la hora", "error");
    }
  } catch (error) {
    console.error("Error eliminando hora:", error);
    mostrarEstado("Error eliminando la hora. Intenta nuevamente.", "error");
  }
}

function renderRecursosAdmin() {
  const container = document.getElementById("recursos-admin-container");
  if (container) {
    if (recursosData.length === 0) {
      container.innerHTML = '<div class="alert alert-warning">No hay recursos cargados</div>';
    } else {
      let html = "";
      recursosData.forEach(function (r) {
        html += '<div class="reserva-item">' +
          '<div class="reserva-info">' +
          '<div class="reserva-recurso">' + r.nombre + '</div>' +
          '<div class="reserva-detalles">' + (r.turnos.length ? r.turnos.join(", ") : "sin turno asignado") + '</div>' +
          '</div>' +
          '<button class="btn-cancelar" onclick="eliminarRecurso(' + r.id + ')">Eliminar</button>' +
          '</div>';
      });
      container.innerHTML = html;
    }
  }

  const checkboxesDiv = document.getElementById("nuevo-recurso-turnos");
  if (checkboxesDiv) {
    checkboxesDiv.innerHTML = "<label>Disponible en:</label><br>" +
      turnosData.map(function (t) {
        return '<label style="margin-right:15px;font-weight:normal;display:inline-flex;align-items:center;gap:4px;">' +
          '<input type="checkbox" class="nuevo-recurso-turno-checkbox" value="' + t.id + '" /> ' + t.etiqueta +
          '</label>';
      }).join("");
  }
}

async function agregarRecurso() {
  const nombre = document.getElementById("nuevo-recurso-nombre").value.trim();

  if (!nombre) {
    mostrarEstado("Escribir el nombre del recurso", "warning");
    return;
  }

  const turnoIds = Array.from(document.querySelectorAll(".nuevo-recurso-turno-checkbox:checked"))
    .map(function (cb) { return parseInt(cb.value, 10); });

  try {
    const response = await fetch("/api/recursos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombre, turnoIds: turnoIds })
    });
    const result = await response.json();

    if (response.ok && result.status === "success") {
      document.getElementById("nuevo-recurso-nombre").value = "";
      mostrarEstado("Recurso agregado", "success");
      await cargarAdminConfig();
    } else {
      mostrarEstado(result.message || "Error agregando el recurso", "error");
    }
  } catch (error) {
    console.error("Error agregando recurso:", error);
    mostrarEstado("Error agregando el recurso. Intenta nuevamente.", "error");
  }
}

async function eliminarRecurso(id) {
  const confirmacion = confirm("¿Eliminar este recurso? Ya no va a poder reservarse.");
  if (!confirmacion) return;

  try {
    const response = await fetch("/api/recursos/" + id, { method: "DELETE" });
    const result = await response.json();

    if (response.ok && result.status === "ok") {
      mostrarEstado("Recurso eliminado", "success");
      await cargarAdminConfig();
    } else {
      mostrarEstado(result.message || "Error eliminando el recurso", "error");
    }
  } catch (error) {
    console.error("Error eliminando recurso:", error);
    mostrarEstado("Error eliminando el recurso. Intenta nuevamente.", "error");
  }
}

function cambiarTab(tabName) {
  document.querySelectorAll(".tab-content").forEach(function(c) { 
    c.classList.remove("active"); 
  });
  
  const target = document.getElementById("tab-" + tabName);
  if (target) target.classList.add("active");

  const navPrincipal = document.querySelector(".right-panel > .tabs");
  const tabs = navPrincipal ? navPrincipal.querySelectorAll(".tab") : [];
  tabs.forEach(function(t) { t.classList.remove("active"); });

  const indexByName = { disponibilidad: 0, reservas: 1, reportes: 2 };
  const idx = indexByName[tabName];
  if (typeof idx === "number" && tabs[idx]) {
    tabs[idx].classList.add("active");
  }

  if (tabName === "reservas") {
    sincronizarConServidor().then(function() { actualizarReservas(); });
  }
  if (tabName === "reportes") {
    cargarReporteAdmin();
  }
}

function limpiarReservasVencidas() {
  const activas = reservas.filter(function(r) { return !esPasado(r.fecha); });
  if (activas.length !== reservas.length) {
    reservas = activas;
    localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
  }
}

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
  if (horaEl) horaEl.innerHTML = '<option value="">Seleccionar hora</option>';
  if (durEl) durEl.value = 1;
  if (info) info.style.display = "none";
  if (recCont) recCont.style.display = "none";
  if (msg) msg.style.display = "block";
  if (detalles) detalles.innerHTML = "";
  if (grid) grid.innerHTML = "";
}

// Inicialización
document.addEventListener("DOMContentLoaded", async function() {
  const hoy = new Date().toISOString().split("T")[0];
  const fechaEl = document.getElementById("fecha");
  if (fechaEl) fechaEl.value = hoy;

  console.log("Iniciando sistema - Session ID:", sessionId);
  console.log("Endpoint:", endpoint);

  await cargarConfiguracion();

  const sincronizado = await sincronizarConServidor();
  if (sincronizado) {
    console.log("Sincronización inicial exitosa");
  } else {
    console.warn("Sincronización inicial falló, trabajando offline");
  }
  
  actualizarReservas();
  limpiarReservasVencidas();
});

// Sincronización automática cada 30 segundos
setInterval(async function() {
  await sincronizarConServidor();
  const tabActivo = document.querySelector('.tab-content.active');
  if (tabActivo && tabActivo.id === 'tab-disponibilidad') {
    const fecha = document.getElementById("fecha").value;
    const turno = document.getElementById("turno").value; 
    const hora = document.getElementById("hora").value;
    if (fecha && turno && hora) {
      await consultarDisponibilidadServidor();
    }
  }
  actualizarReservas();
}, 30000);

// Limpiar reservas vencidas cada 5 minutos
setInterval(limpiarReservasVencidas, 5 * 60 * 1000);

// Debug mejorado
function debugReserva() {
  console.log("=== NUEVO DEBUG - Estado actual del sistema ===");
  console.log("Reservas en cache:", reservas.length);
  
  if (reservas.length > 0) {
    console.log("=== Analisis de fechas ===");
    reservas.forEach(function(reserva, index) {
      console.log("Reserva " + index + ":");
      console.log("  - Fecha original:", reserva.fecha);
      console.log("  - Recurso:", reserva.recurso);
      console.log("  - Turno/Hora:", reserva.turno, reserva.hora);
    });
  }
  
  return {
    reservas: reservas.length,
    ultimaSync: new Date(ultimaSincronizacion).toLocaleString(),
    sessionId: sessionId
  };
}

async function forzarSincronizacion() {
  console.log("Forzando sincronización...");
  const exito = await sincronizarConServidor();
  console.log("Sincronización:", exito ? "exitosa" : "falló");
  
  actualizarReservas();

  if (document.querySelector('.tab-content.active') && document.querySelector('.tab-content.active').id === 'tab-disponibilidad') {
    consultarDisponibilidadServidor();
  }
  
  return exito;
}

// Exportar funciones de debug
window.debugSistema = {
  debug: debugReserva,
  sync: forzarSincronizacion,
  estado: function() {
    return {
      reservas: reservas,
      sessionId: sessionId,
      ultimaSync: new Date(ultimaSincronizacion),
      enProgreso: reservaEnProgreso
    };
  }
};