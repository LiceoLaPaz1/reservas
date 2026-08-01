// Sistema de Reservas - Backend propio en Vercel + Postgres (Neon)
// Prevención de colisiones a nivel de base de datos (restricción UNIQUE)

// Configuración
const endpoint = "/api/reservas";

// Recursos por turno
const recursosMatutino = [
  "Cañón", "TV Planta Baja", "TV Planta Alta", "TV 43\"", "Caja TV 50\"", "Caja TV 43"
];

const recursosVespertino = [
  "Cañón", "TV Planta Baja", "TV Planta Alta", "TV 43\"", "Caja TV 50\"", "Caja TV 43",
  "Sala de Informática", "Salón 10"
];

const horasMatutino = ["1era", "2da", "3era", "4ta", "5ta", "6ta", "7ma", "8va"];
const horasVespertino = ["0", "1era", "2da", "3era", "4ta", "5ta", "6ta", "7ma"];

// Estado global
let reservas = [];
let reservaEnProgreso = false;
let ultimaSincronizacion = 0;
let sessionId = generateSessionId();

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
  return Number.isFinite(n) && n > 0 ? n : 1;
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

function getTodosLosRecursos() {
  return Array.from(new Set([].concat(recursosMatutino, recursosVespertino)));
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

    const horasTurno = turno === "matutino" ? horasMatutino : horasVespertino;
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

      const exito = await enviarReservaServidor(nuevaReserva);
      if (exito) {
        nuevasReservas.push(nuevaReserva);
        reservasExitosas++;
      } else {
        console.warn("Fallo reserva para hora " + h + ", cancelando proceso");
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
        "Solo se pudieron reservar " + reservasExitosas + " de " + horasSeleccionadas.length + " horas.\n" +
        "Algunas ya estaban ocupadas por otro docente.",
        "warning"
      );
    }

    // Sincronizar y refrescar
    await sincronizarConServidor();
    consultarDisponibilidadServidor();
    actualizarReservas();
    actualizarReportes();

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

    if (response.status === 409) {
      console.warn("Conflicto detectado: el recurso ya estaba reservado");
      return false;
    }

    const result = await response.json();
    return response.ok && result.status === "success";
  } catch (error) {
    console.error("Error enviando reserva:", error);
    return false;
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

    const horasTurno = turno === "matutino" ? horasMatutino : horasVespertino;
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

  const recursos = turno === "matutino" ? recursosMatutino : recursosVespertino;
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
    const fechaFormatted = new Date(reserva.fecha + "T00:00:00").toLocaleDateString("es-ES");
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

  let horas = [];
  if (turno === "matutino") horas = horasMatutino;
  if (turno === "vespertino") horas = horasVespertino;

  horas.forEach(function(hora) {
    const option = document.createElement("option");
    option.value = hora;
    option.textContent = hora;
    horaSelect.appendChild(option);
  });

  consultarDisponibilidadServidor();
}

function actualizarDisponibilidad() {
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
      actualizarReportes();
      consultarDisponibilidadServidor();
    } else {
      mostrarEstado("Error cancelando reserva: " + (result.message || "Error desconocido"), "error");
    }
  } catch (error) {
    console.error("Error cancelando reserva:", error);
    mostrarEstado("Error cancelando reserva. Intenta nuevamente.", "error");
  }
}

function actualizarReportes() {
  const reservasActivas = reservas.filter(function(r) { return !esPasado(r.fecha); });
  const hoy = new Date().toISOString().split("T")[0];
  const reservasHoy = reservasActivas.filter(function(r) { return r.fecha === hoy; });

  const totalEl = document.getElementById("total-reservas");
  const hoyEl = document.getElementById("reservas-hoy");
  const dispEl = document.getElementById("recursos-disponibles");
  
  if (totalEl) totalEl.textContent = reservasActivas.length;
  if (hoyEl) hoyEl.textContent = reservasHoy.length;

  const totalRecursos = recursosMatutino.length * horasMatutino.length + recursosVespertino.length * horasVespertino.length;
  if (dispEl) dispEl.textContent = totalRecursos - reservasActivas.length;

  const reporteRecursos = document.getElementById("reporte-recursos");
  if (reporteRecursos) {
    const conteoRecursos = {};
    getTodosLosRecursos().forEach(function(recurso) {
      conteoRecursos[recurso] = reservasActivas.filter(function(r) { return r.recurso === recurso; }).length;
    });

    reporteRecursos.innerHTML = "";
    Object.entries(conteoRecursos).forEach(function(entry) {
      const recurso = entry[0];
      const cantidad = entry[1];
      const div = document.createElement("div");
      div.className = "reserva-item";
      div.innerHTML = 
        '<div class="reserva-info">' +
          '<div class="reserva-recurso">' + recurso + '</div>' +
          '<div class="reserva-detalles">' + cantidad + ' reservas activas</div>' +
        '</div>';
      reporteRecursos.appendChild(div);
    });
  }

  const reporteTurnos = document.getElementById("reporte-turnos");
  if (reporteTurnos) {
    const conteoTurnos = {
      matutino: reservasActivas.filter(function(r) { return r.turno === "matutino"; }).length,
      vespertino: reservasActivas.filter(function(r) { return r.turno === "vespertino"; }).length
    };

    reporteTurnos.innerHTML = "";
    Object.entries(conteoTurnos).forEach(function(entry) {
      const turno = entry[0];
      const cantidad = entry[1];
      const div = document.createElement("div");
      div.className = "reserva-item";
      div.innerHTML = 
        '<div class="reserva-info">' +
          '<div class="reserva-recurso">Turno ' + (turno.charAt(0).toUpperCase() + turno.slice(1)) + '</div>' +
          '<div class="reserva-detalles">' + cantidad + ' reservas activas</div>' +
        '</div>';
      reporteTurnos.appendChild(div);
    });
  }
}

function cambiarTab(tabName) {
  document.querySelectorAll(".tab-content").forEach(function(c) { 
    c.classList.remove("active"); 
  });
  
  const target = document.getElementById("tab-" + tabName);
  if (target) target.classList.add("active");

  const tabs = document.querySelectorAll(".tabs .tab");
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
    sincronizarConServidor().then(function() { actualizarReportes(); });
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

  const sincronizado = await sincronizarConServidor();
  if (sincronizado) {
    console.log("Sincronización inicial exitosa");
  } else {
    console.warn("Sincronización inicial falló, trabajando offline");
  }
  
  actualizarReservas();
  actualizarReportes();
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
  actualizarReportes();
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
  actualizarReportes();
  
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