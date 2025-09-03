// Sistema de Reservas - Versión compatible con servidor actual
// Prevención básica de colisiones + sincronización mejorada

// Configuración
const endpoint = new URLSearchParams(location.search).get("api") || 
 "https://script.google.com/macros/s/AKfycbyfXzc9nEEQuI0dXLjMnlCOmxy78ZFYD9SevyGNahXr5hI-ZKJmEYTrIizTSOlnatDS/exec";

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

// Sincronización mejorada con manejo de errores
async function sincronizarConServidor(maxRetries) {
  if (!maxRetries) maxRetries = 3;
  
  for (let intento = 0; intento < maxRetries; intento++) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set("action", "getAll");
      
      const controller = new AbortController();
      const timeoutId = setTimeout(function() { controller.abort(); }, 10000);
      
      const response = await fetch(url.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      
      // Intentar parsear como JSON, si falla, asumir que es texto
      let data;
      const responseText = await response.text();
      
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.warn("Respuesta no es JSON válido:", responseText);
        // Si no es JSON, asumir que la conexión funciona pero no hay datos
        return true;
      }
      
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
    alert("Ya hay una reserva en progreso. Espera un momento.");
    return;
  }

  reservaEnProgreso = true;

  try {
    const nombre = document.getElementById("nombre").value.trim();
    const apellido = document.getElementById("apellido").value.trim();
    const duracion = getDuracion();

    if (!nombre || !apellido) {
      alert("Por favor ingresa nombre y apellido");
      return;
    }

    const horasTurno = turno === "matutino" ? horasMatutino : horasVespertino;
    const indiceHora = horasTurno.indexOf(hora);
    
    if (indiceHora === -1) {
      alert("Hora inválida");
      return;
    }
    
    if (indiceHora + duracion > horasTurno.length) {
      alert("No hay suficientes horas disponibles en este turno.");
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
      alert("Este recurso ya está reservado en alguna de las horas seleccionadas.");
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
      
      alert(
        "Reserva realizada exitosamente!\n\n" +
        "Detalles:\n" +
        "Docente: " + nombre + " " + apellido + "\n" +
        "Recurso: " + recurso + "\n" +
        "Fecha: " + fecha + "\n" +
        "Turno: " + turno + "\n" +
        "Horas: " + horasSeleccionadas.join(", ")
      );
    } else {
      alert(
        "Solo se pudieron reservar " + reservasExitosas + " de " + horasSeleccionadas.length + " horas.\n" +
        "Algunas ya estaban ocupadas por otro docente."
      );
    }

    // Sincronizar y refrescar
    await sincronizarConServidor();
    consultarDisponibilidadServidor();
    actualizarReservas();
    actualizarReportes();

  } catch (error) {
    console.error("Error en reserva:", error);
    alert("Error procesando la reserva. Intenta nuevamente.");
  } finally {
    reservaEnProgreso = false;
  }
}

async function enviarReservaServidor(reservaData) {
  try {
    const formData = new URLSearchParams();
    formData.append("data", JSON.stringify(reservaData));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData
    });

    // Manejar respuesta que puede no ser JSON
    const responseText = await response.text();
    
    try {
      const result = JSON.parse(responseText);
      return result.status === "success";
    } catch (parseError) {
      // Si no es JSON, verificar si contiene indicadores de éxito
      const textoLower = responseText.toLowerCase();
      if (textoLower.includes("success") || textoLower.includes("exitoso")) {
        return true;
      } else if (textoLower.includes("conflict") || textoLower.includes("ocupado")) {
        console.warn("Conflicto detectado:", responseText);
        return false;
      } else {
        console.error("Respuesta del servidor no reconocida:", responseText);
        return false;
      }
    }
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
      alert("Hora inválida");
      return;
    }

    const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);
    actualizarUIConsulta(fecha, turno, hora, duracion, horasSeleccionadas);
    
  } catch (error) {
    console.error("Error consultando disponibilidad:", error);
    alert("Error consultando disponibilidad. Intenta nuevamente.");
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

  recursos.forEach(function(recurso) {
    const ocupado = horasSeleccionadas.some(function(hSel) {
      return reservasActivasSet.has(buildKey(fecha, turno, hSel, recurso));
    });

    const card = document.createElement("div");
    card.className = "recurso-card " + (ocupado ? "ocupado" : "disponible");
    card.innerHTML = 
      '<div class="recurso-nombre">' + recurso + '</div>' +
      '<div class="recurso-estado ' + (ocupado ? "estado-ocupado" : "estado-disponible") + '">' +
        (ocupado ? "Ocupado" : "Disponible") +
      '</div>';
    
    if (!ocupado) {
      card.onclick = function() { 
        realizarReserva(fecha, turno, hora, recurso); 
      };
    }
    
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

  const reservasActivas = reservas.filter(function(r) { return !esPasado(r.fecha); });

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
      alert("Reserva no encontrada");
      return;
    }

    // Usar POST en lugar de GET para cancelar
    const formData = new URLSearchParams();
    formData.append("action", "cancel");
    formData.append("id", id);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData
    });
    
    // Manejar respuesta
    const responseText = await response.text();
    let result;
    
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      // Verificar si el texto indica éxito
      if (responseText.toLowerCase().includes("cancel") || responseText.toLowerCase().includes("exitoso")) {
        result = { status: "ok" };
      } else {
        result = { status: "error", message: "Error desconocido" };
      }
    }

    if (result.status === "ok") {
      reservas = reservas.filter(function(reserva) { return reserva.id != id; });
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
      
      alert("Reserva cancelada exitosamente");
      
      actualizarReservas();
      actualizarReportes();
      consultarDisponibilidadServidor();
    } else {
      alert("Error cancelando reserva: " + (result.message || "Error desconocido"));
    }
  } catch (error) {
    console.error("Error cancelando reserva:", error);
    alert("Error cancelando reserva. Intenta nuevamente.");
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