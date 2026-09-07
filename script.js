// Sistema de Reservas - Backend propio en Vercel + Postgres (Neon)
// Prevención de colisiones a nivel de base de datos (restricción UNIQUE)

// Configuración
const endpoint = "/api/reservas";

// Estado global
let reservas = [];
let reservaEnProgreso = false;
let ultimaSincronizacion = 0;
let sessionId = generateSessionId();
let rolAdmin = null; // "admin" | "lector" | null (sin sesión)

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

function horaYaPaso(turnoNombre, horaEtiqueta, fecha) {
  const ahora = new Date();
  const hoyStr = ahora.getFullYear() + "-" + String(ahora.getMonth() + 1).padStart(2, "0") + "-" + String(ahora.getDate()).padStart(2, "0");
  if (fecha !== hoyStr) return false;

  const turno = turnosData.find(function (t) { return t.nombre === turnoNombre; });
  if (!turno) return false;
  const horaObj = turno.horas.find(function (h) { return h.etiqueta === horaEtiqueta; });
  if (!horaObj || !horaObj.horaInicio) return false;

  const horaActualStr = String(ahora.getHours()).padStart(2, "0") + ":" + String(ahora.getMinutes()).padStart(2, "0");
  return horaActualStr >= horaObj.horaInicio;
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

    if (esPasado(fecha)) {
      mostrarEstado("No se pueden reservar fechas pasadas", "warning");
      return;
    }

    if (horaYaPaso(turno, hora, fecha)) {
      mostrarEstado("Esa hora ya pasó", "warning");
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

    // Realizar la reserva: una sola llamada al servidor, que guarda todas
    // las horas del rango de forma atómica (todo o nada), así el recurso
    // queda protegido en cada hora y no solo en la de inicio.
    const resultado = await enviarReservaServidor({
      fecha: fecha,
      turno: turno,
      hora: hora,
      recurso: recurso,
      nombre: nombre,
      apellido: apellido,
      cantidadHoras: duracion
    });

    if (resultado.exito) {
      mostrarEstado(
        "Reserva realizada exitosamente!\n" +
        recurso + " - " + fecha + " - " + turno + "\n" +
        "Horas: " + horasSeleccionadas.join(", "),
        "success"
      );
    } else {
      mostrarEstado(
        resultado.mensaje || "Este recurso ya está reservado en alguna de las horas seleccionadas.",
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

  if (horaYaPaso(turno, hora, fecha)) {
    mostrarEstado("Esa hora ya pasó", "warning");
    return;
  }

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
  const fecha = document.getElementById("fecha").value;
  const horaSelect = document.getElementById("hora");
  if (!horaSelect) return;

  horaSelect.innerHTML = '<option value="">Seleccionar hora</option>';

  const horas = getHorasTurno(turno).filter(function (hora) {
    return !horaYaPaso(turno, hora, fecha);
  });

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
  rolAdmin = null;
  document.getElementById("login-admin").style.display = "block";
  document.getElementById("reporte-admin").style.display = "none";
}

async function cargarReporteAdmin(fecha, docente) {
  try {
    const params = new URLSearchParams();
    if (fecha) params.set("fecha", fecha);
    if (docente) params.set("docente", docente);
    const query = params.toString();
    const url = query ? "/api/reporte?" + query : "/api/reporte";
    const response = await fetch(url);

    if (response.status === 401) {
      rolAdmin = null;
      document.getElementById("login-admin").style.display = "block";
      document.getElementById("reporte-admin").style.display = "none";
      return;
    }

    const result = await response.json();
    if (!response.ok || result.status !== "ok") {
      mostrarEstado(result.message || "Error consultando el reporte", "error");
      return;
    }

    rolAdmin = result.rol || null;
    aplicarPermisosAdmin();

    document.getElementById("login-admin").style.display = "none";
    document.getElementById("reporte-admin").style.display = "block";
    renderReporteTabla(result.reservas);
  } catch (error) {
    console.error("Error consultando el reporte:", error);
    mostrarEstado("Error consultando el reporte. Intenta nuevamente.", "error");
  }
}

// Oculta las funciones exclusivas de administrador ("Recursos y turnos",
// archivar) cuando la sesión es de rol "lector" (solo lectura de reportes).
function aplicarPermisosAdmin() {
  const esAdmin = rolAdmin === "admin";

  const tabConfigBtn = document.getElementById("tab-config-btn");
  if (tabConfigBtn) tabConfigBtn.style.display = esAdmin ? "" : "none";

  const tabRecurrentesBtn = document.getElementById("tab-recurrentes-btn");
  if (tabRecurrentesBtn) tabRecurrentesBtn.style.display = esAdmin ? "" : "none";

  const btnArchivar = document.getElementById("btn-archivar");
  if (btnArchivar) btnArchivar.style.display = esAdmin ? "" : "none";

  if (!esAdmin) {
    mostrarPanelAdmin("reporte");
  }
}

function filtrarReporte() {
  const fecha = document.getElementById("reporte-fecha").value;
  const docente = document.getElementById("reporte-docente").value;
  cargarReporteAdmin(fecha || undefined, docente || undefined);
}

function verTodasReporte() {
  document.getElementById("reporte-fecha").value = "";
  document.getElementById("reporte-docente").value = "";
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

  const esAdmin = rolAdmin === "admin";

  if (filas.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">No hay reservas para mostrar</div>';
    return;
  }

  let html = '<table class="tabla-reporte"><thead><tr>' +
    '<th>Docente</th><th>Recurso</th><th>Fecha</th><th>Turno</th><th>Hora</th><th>Duración</th><th>Reservado el</th>' +
    (esAdmin ? "<th></th>" : "") +
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
      (esAdmin ? '<td><button class="btn-cancelar" onclick="borrarReservaAdmin(' + r.id + ')">Borrar</button></td>' : "") +
      "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

async function borrarReservaAdmin(id) {
  const confirmacion = confirm("¿Borrar esta reserva? Esta acción no se puede deshacer.");
  if (!confirmacion) return;

  try {
    const response = await fetch("/api/reservas/" + id, { method: "DELETE" });
    const result = await response.json();

    if (response.ok && result.status === "ok") {
      mostrarEstado("Reserva borrada", "success");
      const fecha = document.getElementById("reporte-fecha").value;
      const docente = document.getElementById("reporte-docente").value;
      cargarReporteAdmin(fecha || undefined, docente || undefined);
    } else {
      mostrarEstado(result.message || "Error borrando la reserva", "error");
    }
  } catch (error) {
    console.error("Error borrando reserva:", error);
    mostrarEstado("Error borrando la reserva. Intenta nuevamente.", "error");
  }
}

// Administración de turnos, horas y recursos (panel admin)
function mostrarPanelAdmin(nombre) {
  if ((nombre === "config" || nombre === "recurrentes") && rolAdmin !== "admin") {
    nombre = "reporte";
  }

  const panelReporte = document.getElementById("panel-reporte");
  const panelConfig = document.getElementById("panel-config");
  const panelRecurrentes = document.getElementById("panel-recurrentes");
  if (panelReporte) panelReporte.style.display = nombre === "reporte" ? "block" : "none";
  if (panelConfig) panelConfig.style.display = nombre === "config" ? "block" : "none";
  if (panelRecurrentes) panelRecurrentes.style.display = nombre === "recurrentes" ? "block" : "none";

  const tabs = document.querySelectorAll("#reporte-admin .tabs .tab");
  tabs.forEach(function (t) { t.classList.remove("active"); });
  const indexByName = { reporte: 0, config: 1, recurrentes: 2 };
  const idx = indexByName[nombre];
  if (tabs[idx]) tabs[idx].classList.add("active");

  if (nombre === "config") {
    cargarAdminConfig();
  }
  if (nombre === "recurrentes") {
    poblarFormularioRecurrente();
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
    const filas = horasOrdenadas.map(function (h) {
      return '<div style="display:flex;align-items:center;gap:6px;margin:4px 0;">' +
        '<span style="min-width:60px;">' + h.etiqueta + '</span>' +
        '<input type="time" id="hora-inicio-' + h.id + '" value="' + (h.horaInicio || "") + '" style="padding:4px;border:1px solid #dee2e6;border-radius:4px;" />' +
        '<span>a</span>' +
        '<input type="time" id="hora-fin-' + h.id + '" value="' + (h.horaFin || "") + '" style="padding:4px;border:1px solid #dee2e6;border-radius:4px;" />' +
        '<button class="btn btn-secondary" style="width:auto;padding:4px 10px;" onclick="guardarHorarioHora(' + h.id + ')">Guardar</button>' +
        '<button onclick="eliminarHora(' + h.id + ')" title="Eliminar hora" style="border:none;background:none;color:#dc3545;cursor:pointer;font-weight:bold;font-size:16px;">×</button>' +
        '</div>';
    }).join("");

    html += '<div class="reserva-item" style="flex-direction:column;align-items:stretch;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<strong>' + t.etiqueta + '</strong>&nbsp;<span style="color:#6c757d;font-size:13px;">(' + t.nombre + ')</span>' +
      '<button class="btn-cancelar" onclick="eliminarTurno(' + t.id + ')">Eliminar turno</button>' +
      '</div>' +
      '<div style="margin-top:8px;">' + (filas || '<em>sin horas</em>') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;">' +
      '<input type="text" id="nueva-hora-' + t.id + '" placeholder="Etiqueta (ej: 9na)" style="flex:1;min-width:100px;padding:8px;border:1px solid #dee2e6;border-radius:6px;" />' +
      '<input type="time" id="nueva-hora-inicio-' + t.id + '" style="padding:8px;border:1px solid #dee2e6;border-radius:6px;" />' +
      '<span>a</span>' +
      '<input type="time" id="nueva-hora-fin-' + t.id + '" style="padding:8px;border:1px solid #dee2e6;border-radius:6px;" />' +
      '<button class="btn btn-secondary" style="width:auto;" onclick="agregarHora(' + t.id + ')">+ Hora</button>' +
      '</div>' +
      '</div>';
  });

  container.innerHTML = html;
}

async function guardarHorarioHora(id) {
  const inicioEl = document.getElementById("hora-inicio-" + id);
  const finEl = document.getElementById("hora-fin-" + id);
  const horaInicio = inicioEl ? inicioEl.value : "";
  const horaFin = finEl ? finEl.value : "";

  try {
    const response = await fetch("/api/horas/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ horaInicio: horaInicio || null, horaFin: horaFin || null })
    });
    const result = await response.json();

    if (response.ok && result.status === "ok") {
      mostrarEstado("Horario guardado", "success");
      await cargarAdminConfig();
    } else {
      mostrarEstado(result.message || "Error guardando el horario", "error");
    }
  } catch (error) {
    console.error("Error guardando horario:", error);
    mostrarEstado("Error guardando el horario. Intenta nuevamente.", "error");
  }
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
  const inicioEl = document.getElementById("nueva-hora-inicio-" + turnoId);
  const finEl = document.getElementById("nueva-hora-fin-" + turnoId);

  if (!etiqueta) {
    mostrarEstado("Escribir la etiqueta de la hora", "warning");
    return;
  }

  try {
    const response = await fetch("/api/turnos/" + turnoId + "/horas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        etiqueta: etiqueta,
        horaInicio: inicioEl && inicioEl.value ? inicioEl.value : null,
        horaFin: finEl && finEl.value ? finEl.value : null
      })
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

// Reservas recurrentes (panel admin): reservar el mismo recurso todas las
// semanas, en uno o más días fijos, para un docente.
const DIAS_SEMANA = [
  { valor: 1, etiqueta: "Lunes" },
  { valor: 2, etiqueta: "Martes" },
  { valor: 3, etiqueta: "Miércoles" },
  { valor: 4, etiqueta: "Jueves" },
  { valor: 5, etiqueta: "Viernes" },
  { valor: 6, etiqueta: "Sábado" },
  { valor: 0, etiqueta: "Domingo" }
];

function poblarFormularioRecurrente() {
  const turnoSelect = document.getElementById("recurrente-turno");
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

  onCambioTurnoRecurrente();
}

function onCambioTurnoRecurrente() {
  const turno = document.getElementById("recurrente-turno").value;

  const recursoSelect = document.getElementById("recurrente-recurso");
  const valorRecursoActual = recursoSelect.value;
  recursoSelect.innerHTML = '<option value="">Seleccionar recurso</option>';
  getRecursosTurno(turno).forEach(function (nombreRecurso) {
    const option = document.createElement("option");
    option.value = nombreRecurso;
    option.textContent = nombreRecurso;
    recursoSelect.appendChild(option);
  });
  if (valorRecursoActual) recursoSelect.value = valorRecursoActual;

  renderDiasRecurrente(turno);
}

function renderDiasRecurrente(turno) {
  const container = document.getElementById("recurrente-dias-container");
  if (!container) return;

  const horas = getHorasTurno(turno);

  if (!turno || horas.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">Elegir un turno para ver sus horas</div>';
    return;
  }

  let html = "";
  DIAS_SEMANA.forEach(function (dia) {
    const opcionesHora = horas.map(function (h) { return '<option value="' + h + '">' + h + "</option>"; }).join("");
    html +=
      '<div class="form-group dia-recurrente" data-dia="' + dia.valor + '">' +
      '<label><input type="checkbox" class="dia-recurrente-check" onchange="onToggleDiaRecurrente(this)" /> ' +
      dia.etiqueta +
      "</label>" +
      '<span class="dia-recurrente-campos" style="display: none; margin-left: 10px">' +
      "Hora inicio: " +
      '<select class="dia-recurrente-hora">' +
      opcionesHora +
      "</select>" +
      " &nbsp; Cantidad de horas: " +
      '<input type="number" class="dia-recurrente-cantidad" min="1" max="' +
      horas.length +
      '" value="1" style="width: 60px" />' +
      "</span>" +
      "</div>";
  });

  container.innerHTML = html;
}

function onToggleDiaRecurrente(checkbox) {
  const campos = checkbox.closest(".dia-recurrente").querySelector(".dia-recurrente-campos");
  if (campos) campos.style.display = checkbox.checked ? "inline-block" : "none";
}

async function crearReservasRecurrentes() {
  const nombre = document.getElementById("recurrente-nombre").value.trim();
  const apellido = document.getElementById("recurrente-apellido").value.trim();
  const turno = document.getElementById("recurrente-turno").value;
  const recurso = document.getElementById("recurrente-recurso").value;
  const fechaInicio = document.getElementById("recurrente-fecha-inicio").value;
  const fechaFin = document.getElementById("recurrente-fecha-fin").value;

  if (!nombre || !apellido || !turno || !recurso || !fechaInicio || !fechaFin) {
    mostrarEstado("Completar todos los campos antes de crear las reservas recurrentes", "warning");
    return;
  }

  if (fechaFin < fechaInicio) {
    mostrarEstado("La fecha de fin no puede ser anterior a la de inicio", "warning");
    return;
  }

  const reglas = [];
  document.querySelectorAll(".dia-recurrente").forEach(function (fila) {
    const check = fila.querySelector(".dia-recurrente-check");
    if (!check || !check.checked) return;
    const hora = fila.querySelector(".dia-recurrente-hora").value;
    const cantidadHoras = parseInt(fila.querySelector(".dia-recurrente-cantidad").value, 10) || 1;
    reglas.push({ diaSemana: parseInt(fila.getAttribute("data-dia"), 10), hora: hora, cantidadHoras: cantidadHoras });
  });

  if (reglas.length === 0) {
    mostrarEstado("Elegir al menos un día de la semana", "warning");
    return;
  }

  const resumenDias = reglas
    .map(function (r) {
      const etiquetaDia = DIAS_SEMANA.find(function (d) { return d.valor === r.diaSemana; }).etiqueta;
      return etiquetaDia + " (" + r.hora + " x " + r.cantidadHoras + "h)";
    })
    .join(", ");

  const confirmacion = confirm(
    "¿Crear reservas recurrentes?\n\n" +
    "Docente: " + nombre + " " + apellido + "\n" +
    "Recurso: " + recurso + "\n" +
    "Turno: " + turno + "\n" +
    "Desde " + fechaInicio + " hasta " + fechaFin + "\n" +
    "Días: " + resumenDias
  );
  if (!confirmacion) return;

  const resultadoDiv = document.getElementById("recurrente-resultado");
  if (resultadoDiv) resultadoDiv.innerHTML = "Creando reservas, puede tardar unos segundos...";

  try {
    const response = await fetch("/api/reservas-recurrentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nombre,
        apellido: apellido,
        turno: turno,
        recurso: recurso,
        fechaInicio: fechaInicio,
        fechaFin: fechaFin,
        reglas: reglas
      })
    });
    const result = await response.json();

    if (!response.ok || result.status !== "ok") {
      mostrarEstado(result.message || "Error creando las reservas recurrentes", "error");
      if (resultadoDiv) resultadoDiv.innerHTML = "";
      return;
    }

    renderResultadoRecurrente(result);
  } catch (error) {
    console.error("Error creando reservas recurrentes:", error);
    mostrarEstado("Error creando las reservas recurrentes. Intenta nuevamente.", "error");
    if (resultadoDiv) resultadoDiv.innerHTML = "";
  }
}

function renderResultadoRecurrente(result) {
  const container = document.getElementById("recurrente-resultado");
  if (!container) return;

  let html =
    '<div class="alert alert-success">Se crearon ' +
    result.creadas +
    " de " +
    result.total +
    " reserva(s).</div>";

  if (result.fallidas.length > 0) {
    html +=
      '<div class="alert alert-warning">No se pudieron crear ' + result.fallidas.length + " fecha(s):</div><ul>";
    result.fallidas.forEach(function (f) {
      html += "<li>" + formatearFecha(f.fecha) + ": " + f.message + "</li>";
    });
    html += "</ul>";
  }

  container.innerHTML = html;
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
  const nombreEl = document.getElementById("nombre");
  const apellidoEl = document.getElementById("apellido");
  const turnoEl = document.getElementById("turno");
  const horaEl = document.getElementById("hora");
  const durEl = document.getElementById("duracion");
  const info = document.getElementById("info-consulta");
  const recCont = document.getElementById("recursos-container");
  const msg = document.getElementById("mensaje-inicial");
  const detalles = document.getElementById("detalles-consulta");
  const grid = document.getElementById("recursos-grid");

  if (nombreEl) nombreEl.value = "";
  if (apellidoEl) apellidoEl.value = "";
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
  if (fechaEl) {
    fechaEl.value = hoy;
    fechaEl.min = hoy;
  }

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