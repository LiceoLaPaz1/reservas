/************************************************************
 * Reserva de recursos - Frontend con prevención de colisiones
 * - Verificación atómica en servidor
 * - Sistema de locks distribuidos
 * - Retry automático en caso de conflictos
 ************************************************************/

/* =================== Configuración =================== */

const endpoint =
  new URLSearchParams(location.search).get("api") ||
  "https://script.google.com/macros/s/AKfycbwfQdx0QdsB6zZW6AhE3793Tc0Qu4y0-2eSTcGP9Uj6SkRTiaQ6yFk7Xp5Qze8gp-CZ/exec";

// Recursos por turno
const recursosMatutino = [
  "Cañón", "TV Planta Baja", "TV Planta Alta", 'TV 43"', 'Caja TV 50"', "Caja TV 43"
];

const recursosVespertino = [
  "Cañón", "TV Planta Baja", "TV Planta Alta", 'TV 43"', 'Caja TV 50"', "Caja TV 43",
  "Sala de Informática", "Salón 10"
];

const horasMatutino = ["1era", "2da", "3era", "4ta", "5ta", "6ta", "7ma", "8va"];
const horasVespertino = ["0", "1era", "2da", "3era", "4ta", "5ta", "6ta", "7ma"];

/* =================== Estado =================== */

let reservas = [];
let reservaEnProgreso = false;
let ultimaSincronizacion = 0;
let sessionId = generateSessionId();

// Cache local como fallback
try {
  const cached = JSON.parse(localStorage.getItem("reservasLiceo")) || [];
  reservas = cached;
} catch (error) {
  console.warn("Error cargando cache:", error);
  reservas = [];
}

/* =================== Utilidades =================== */

function generateSessionId() {
  return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getDuracion() {
  const el = document.getElementById("duracion");
  const n = el ? parseInt(el.value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function slotKey(reserva) {
  return `${reserva.fecha}|${reserva.turno}|${reserva.hora}|${reserva.recurso}`;
}

function buildKey(fecha, turno, hora, recurso) {
  return `${fecha}|${turno}|${hora}|${recurso}`;
}

function esPasado(fecha) {
  const hoyStr = new Date().toISOString().split("T")[0];
  return fecha < hoyStr;
}

function getTodosLosRecursos() {
  return Array.from(new Set([...recursosMatutino, ...recursosVespertino]));
}

/* =================== UI para estado de reserva =================== */

function mostrarEstadoReserva(mensaje, tipo) {
  let container = document.getElementById("estado-reserva");
  
  if (!container) {
    container = document.createElement("div");
    container.id = "estado-reserva";
    document.body.appendChild(container);
  }

  const colores = {
    info: "estado-info",
    success: "estado-success", 
    warning: "estado-warning",
    error: "estado-error"
  };

  // Limpiar clases anteriores
  container.className = "";
  container.classList.add(colores[tipo] || "estado-info");
  
  container.textContent = mensaje;
  container.classList.add("show");
}

function limpiarEstadoReserva() {
  const container = document.getElementById("estado-reserva");
  if (container) {
    container.classList.remove("show");
  }
}

/* =================== Indicador de estado de conexión =================== */

function actualizarEstadoConexion(estado, mensaje) {
  let indicator = document.getElementById("conexion-status");
  
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "conexion-status";
    indicator.className = "conexion-status";
    document.body.appendChild(indicator);
  }
  
  // Limpiar clases anteriores
  indicator.className = "conexion-status";
  
  switch (estado) {
    case "online":
      indicator.classList.add("conexion-online");
      indicator.textContent = "🟢 " + (mensaje || "Conectado");
      break;
    case "offline":
      indicator.classList.add("conexion-offline");
      indicator.textContent = "🔴 " + (mensaje || "Sin conexión");
      break;
    case "sincronizando":
      indicator.classList.add("conexion-sincronizando");
      indicator.textContent = "🔄 " + (mensaje || "Sincronizando...");
      break;
  }
}

/* =================== Sincronización con retry =================== */

async function sincronizarConServidor(maxRetries = 3) {
  actualizarEstadoConexion("sincronizando", "Sincronizando con servidor...");
  
  for (let intento = 0; intento < maxRetries; intento++) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set("action", "getAll");
      url.searchParams.set("session", sessionId);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      
      const data = await response.json();
      
      if (data.status === "ok" && Array.isArray(data.reservas)) {
        reservas = data.reservas.filter(r => !esPasado(r.fecha));
        localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
        ultimaSincronizacion = Date.now();
        
        actualizarEstadoConexion("online", "Última sync: " + new Date().toLocaleTimeString());
        return true;
      } else {
        throw new Error(data.message || "Respuesta inválida del servidor");
      }
    } catch (error) {
      console.warn("Intento " + (intento + 1) + " falló:", error);
      if (intento < maxRetries - 1) {
        actualizarEstadoConexion("sincronizando", "Reintentando... (" + (intento + 2) + "/" + maxRetries + ")");
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, intento) * 1000)); // Exponential backoff
      }
    }
  }
  
  actualizarEstadoConexion("offline", "Error de conexión");
  return false;
}

/* =================== Sistema de locks distribuidos =================== */

async function adquirirLockYVerificar(fecha, turno, recurso, horasSeleccionadas, lockId) {
  try {
    const formData = new URLSearchParams();
    formData.append("action", "acquireLockAndCheck");
    formData.append("fecha", fecha);
    formData.append("turno", turno);
    formData.append("recurso", recurso);
    formData.append("horas", horasSeleccionadas.join(","));
    formData.append("lockId", lockId);
    formData.append("sessionId", sessionId);
    formData.append("ttl", "30"); // Lock por 30 segundos

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const result = await response.json();

    return {
      success: result.status === "success" && result.lockAcquired && result.disponible,
      conflict: result.status === "conflict",
      message: result.message
    };

  } catch (error) {
    console.error("Error adquiriendo lock:", error);
    return { success: false, conflict: false, message: error.message };
  }
}

async function liberarLock(lockId) {
  try {
    const formData = new URLSearchParams();
    formData.append("action", "releaseLock");
    formData.append("lockId", lockId);
    formData.append("sessionId", sessionId);

    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData
    });
  } catch (error) {
    console.warn("Error liberando lock:", error);
  }
}

async function crearReservaIndividual(reservaData) {
  try {
    const formData = new URLSearchParams();
    formData.append("action", "createReservation");
    formData.append("data", JSON.stringify(reservaData));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData
    });

    const result = await response.json();
    return result.status === "success";

  } catch (error) {
    console.error("Error creando reserva individual:", error);
    return false;
  }
}

/* =================== Reserva atómica con sistema de locks =================== */

async function realizarReservaAtomica(fecha, turno, hora, recurso) {
  if (reservaEnProgreso) {
    alert("⏳ Ya hay una reserva en progreso. Espera un momento.");
    return;
  }

  reservaEnProgreso = true;
  const lockId = "lock_" + sessionId + "_" + Date.now();

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

    const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);

    // Confirmar antes de proceder
    const confirmacion = confirm(
      "¿Confirmar reserva?\n\n" +
      "👤 Docente: " + nombre + " " + apellido + "\n" +
      "📚 Recurso: " + recurso + "\n" +
      "📅 Fecha: " + fecha + "\n" +
      "🕐 Turno: " + turno + "\n" +
      "⏰ Horas: " + horasSeleccionadas.join(", ")
    );

    if (!confirmacion) return;

    // Mostrar estado de procesamiento
    mostrarEstadoReserva("🔄 Procesando reserva...", "info");

    // Intentar reserva atómica con reintentos
    const resultado = await reservarConReintentos({
      fecha: fecha, 
      turno: turno, 
      recurso: recurso, 
      horasSeleccionadas: horasSeleccionadas, 
      nombre: nombre, 
      apellido: apellido, 
      duracion: duracion, 
      lockId: lockId
    });

    if (resultado.exito) {
      // Actualizar cache local con las nuevas reservas
      reservas.push(...resultado.reservas);
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
      
      mostrarEstadoReserva(
        "✅ ¡Reserva exitosa!\n\n" +
        "📋 Detalles:\n" +
        "• Docente: " + nombre + " " + apellido + "\n" +
        "• Recurso: " + recurso + "\n" +
        "• Fecha: " + fecha + "\n" +
        "• Turno: " + turno + "\n" +
        "• Horas: " + horasSeleccionadas.join(", "),
        "success"
      );
    } else {
      mostrarEstadoReserva(
        "⚠️ " + resultado.mensaje + "\n\n" +
        "Algunas horas pueden haber sido reservadas por otro usuario.",
        "warning"
      );
    }

    // Sincronizar y refrescar UI
    await sincronizarConServidor();
    await consultarDisponibilidadServidor();
    actualizarReservas();
    actualizarReportes();

  } catch (error) {
    console.error("Error en reserva atómica:", error);
    mostrarEstadoReserva(
      "❌ Error procesando la reserva. Por favor intentá nuevamente.",
      "error"
    );
  } finally {
    reservaEnProgreso = false;
    // Limpiar estado visual después de 5 segundos
    setTimeout(() => limpiarEstadoReserva(), 5000);
  }
}

async function reservarConReintentos(params, maxIntentos = 3) {
  const { fecha, turno, recurso, horasSeleccionadas, nombre, apellido, duracion, lockId } = params;
  
  for (let intento = 0; intento < maxIntentos; intento++) {
    try {
      mostrarEstadoReserva("🔄 Intento " + (intento + 1) + "/" + maxIntentos + "...", "info");
      
      // Paso 1: Adquirir lock y verificar disponibilidad
      const lockResult = await adquirirLockYVerificar(fecha, turno, recurso, horasSeleccionadas, lockId);
      
      if (!lockResult.success) {
        if (lockResult.conflict) {
          // Conflicto de reserva - no reintentar
          return {
            exito: false,
            mensaje: "El recurso ya fue reservado por otro usuario durante este proceso"
          };
        } else {
          // Error de comunicación - reintentar
          if (intento < maxIntentos - 1) {
            await new Promise(resolve => setTimeout(resolve, (intento + 1) * 1500));
            continue;
          } else {
            return {
              exito: false,
              mensaje: "Error de comunicación con el servidor"
            };
          }
        }
      }

      // Paso 2: Crear reservas mientras tenemos el lock
      const reservasCreadas = [];
      let horasExitosas = 0;

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
          fechaReserva: new Date().toISOString(),
          sessionId: sessionId,
          lockId: lockId
        };

        const exito = await crearReservaIndividual(nuevaReserva);
        if (exito) {
          reservasCreadas.push(nuevaReserva);
          horasExitosas++;
        } else {
          // Si falla una hora, parar el proceso
          break;
        }
      }

      // Paso 3: Liberar lock
      await liberarLock(lockId);

      // Evaluar resultado
      if (horasExitosas === horasSeleccionadas.length) {
        return {
          exito: true,
          reservas: reservasCreadas,
          mensaje: "Todas las horas fueron reservadas exitosamente"
        };
      } else {
        return {
          exito: false,
          reservas: reservasCreadas,
          mensaje: "Solo se pudieron reservar " + horasExitosas + " de " + horasSeleccionadas.length + " horas"
        };
      }

    } catch (error) {
      console.error("Intento " + (intento + 1) + " falló:", error);
      
      // Asegurar liberación del lock en caso de error
      await liberarLock(lockId);
      
      if (intento < maxIntentos - 1) {
        await new Promise(resolve => setTimeout(resolve, (intento + 1) * 2000));
      }
    }
  }

  return {
    exito: false,
    mensaje: "No se pudo completar la reserva después de varios intentos"
  };
}

/* =================== Consulta de disponibilidad =================== */

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
      alert("⚠️ Hora inválida");
      return;
    }

    const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);
    actualizarUIConsulta(fecha, turno, hora, duracion, horasSeleccionadas);
    
  } catch (error) {
    console.error("Error consultando disponibilidad:", error);
    alert("❌ Error consultando disponibilidad. Intentá nuevamente.");
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
      "<strong>📅 Fecha:</strong> " + fechaFormatted + "<br>" +
      "<strong>🕐 Turno:</strong> " + (turno.charAt(0).toUpperCase() + turno.slice(1)) + "<br>" +
      "<strong>⏰ Hora inicial:</strong> " + hora + "<br>" +
      "<strong>⏳ Duración:</strong> " + duracion + " hora(s)<br>" +
      "<strong>🔄 Última sync:</strong> " + new Date(ultimaSincronizacion).toLocaleTimeString();
  }

  const recursos = turno === "matutino" ? recursosMatutino : recursosVespertino;
  const recursosGrid = document.getElementById("recursos-grid");
  if (!recursosGrid) return;
  
  recursosGrid.innerHTML = "";

  const reservasActivasSet = new Set();
  reservas.forEach(r => {
    if (!esPasado(r.fecha)) {
      reservasActivasSet.add(slotKey(r));
    }
  });

  recursos.forEach((recurso) => {
    const ocupado = horasSeleccionadas.some((hSel) =>
      reservasActivasSet.has(buildKey(fecha, turno, hSel, recurso))
    );

    const card = document.createElement("div");
    card.className = "recurso-card " + (ocupado ? "ocupado" : "disponible");
    card.innerHTML = 
      '<div class="recurso-nombre">' + recurso + '</div>' +
      '<div class="recurso-estado ' + (ocupado ? "estado-ocupado" : "estado-disponible") + '">' +
        (ocupado ? "❌ Ocupado" : "✅ Disponible") +
      '</div>';
    
    if (!ocupado) {
      card.onclick = () => realizarReservaAtomica(fecha, turno, hora, recurso);
    }
    
    recursosGrid.appendChild(card);
  });
}

function mostrarCargando(mostrar) {
  const recursosGrid = document.getElementById("recursos-grid");
  if (!recursosGrid) return;
  
  if (mostrar) {
    recursosGrid.innerHTML = '<div class="alert alert-warning">🔄 Consultando disponibilidad en servidor...</div>';
  }
}

// Función de compatibilidad
function realizarReserva(fecha, turno, hora, recurso) {
  return realizarReservaAtomica(fecha, turno, hora, recurso);
}

/* =================== Funciones de UI existentes =================== */

function actualizarReservas() {
  const container = document.getElementById("reservas-container");
  if (!container) return;

  const reservasActivas = reservas.filter((r) => !esPasado(r.fecha));

  if (reservasActivas.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">🔭 No tenés reservas activas</div>';
    return;
  }

  container.innerHTML = "";
  reservasActivas.forEach((reserva) => {
    const fechaFormatted = new Date(reserva.fecha + "T00:00:00").toLocaleDateString("es-ES");
    const item = document.createElement("div");
    item.className = "reserva-item";
    item.innerHTML = 
      '<div class="reserva-info">' +
        '<div class="reserva-recurso">' + reserva.recurso + '</div>' +
        '<div class="reserva-detalles">' +
          '📅 ' + fechaFormatted + ' | 🕐 ' + reserva.turno + ' | ⏰ ' + reserva.hora + '<br>' +
          '👤 ' + reserva.nombre + ' ' + reserva.apellido +
        '</div>' +
      '</div>' +
      '<button class="btn-cancelar" onclick="cancelarReserva(' + reserva.id + ')">❌ Cancelar</button>';
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

  horas.forEach((hora) => {
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
  const confirmacion = confirm("¿Estás seguro de que querés cancelar esta reserva?");
  if (!confirmacion) return;

  try {
    const reserva = reservas.find(r => r.id === id);
    if (!reserva) {
      alert("❌ Reserva no encontrada");
      return;
    }

    const url = new URL(endpoint);
    url.searchParams.set("action", "cancel");
    url.searchParams.set("id", id);

    const response = await fetch(url.toString());
    const result = await response.json();

    if (result.status === "ok") {
      reservas = reservas.filter((reserva) => reserva.id !== id);
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
      
      alert("✅ Reserva cancelada exitosamente");
      
      actualizarReservas();
      actualizarReportes();
      consultarDisponibilidadServidor();
    } else {
      alert("❌ Error cancelando reserva: " + (result.message || "Error desconocido"));
    }
  } catch (error) {
    console.error("Error cancelando reserva:", error);
    alert("❌ Error cancelando reserva. Intentá nuevamente.");
  }
}

function actualizarReportes() {
  const reservasActivas = reservas.filter((r) => !esPasado(r.fecha));
  const hoy = new Date().toISOString().split("T")[0];
  const reservasHoy = reservasActivas.filter((r) => r.fecha === hoy);

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
    getTodosLosRecursos().forEach((recurso) => {
      conteoRecursos[recurso] = reservasActivas.filter((r) => r.recurso === recurso).length;
    });

    reporteRecursos.innerHTML = "";
    Object.entries(conteoRecursos).forEach(([recurso, cantidad]) => {
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
      matutino: reservasActivas.filter((r) => r.turno === "matutino").length,
      vespertino: reservasActivas.filter((r) => r.turno === "vespertino").length
    };

    reporteTurnos.innerHTML = "";
    Object.entries(conteoTurnos).forEach(([turno, cantidad]) => {
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
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  const target = document.getElementById("tab-" + tabName);
  if (target) target.classList.add("active");

  const tabs = document.querySelectorAll(".tabs .tab");
  tabs.forEach((t) => t.classList.remove("active"));
  const indexByName = { disponibilidad: 0, reservas: 1, reportes: 2 };
  const idx = indexByName[tabName];
  if (typeof idx === "number" && tabs[idx]) tabs[idx].classList.add("active");

  if (tabName === "reservas") {
    sincronizarConServidor().then(() => actualizarReservas());
  }
  if (tabName === "reportes") {
    sincronizarConServidor().then(() => actualizarReportes());
  }
}

function limpiarReservasVencidas() {
  const activas = reservas.filter((r) => !esPasado(r.fecha));
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
  
  // Limpiar también el estado de reserva si existe
  limpiarEstadoReserva();
}

/* =================== Inicialización =================== */

document.addEventListener("DOMContentLoaded", async () => {
  const hoy = new Date().toISOString().split("T")[0];
  const fechaEl = document.getElementById("fecha");
  if (fechaEl) fechaEl.value = hoy;

  await sincronizarConServidor();
  actualizarReservas();
  actualizarReportes();
  limpiarReservasVencidas();
  
  console.log("Sistema iniciado - Session ID:", sessionId);
});

// Sincronización automática cada 30 segundos
setInterval(async () => {
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

/* =================== Debug y utilidades adicionales =================== */

function debugReserva() {
  console.log("=== Estado actual del sistema ===");
  console.log("Reservas en cache:", reservas.length);
  console.log("Última sincronización:", new Date(ultimaSincronizacion).toLocaleString());
  console.log("Session ID:", sessionId);
  console.log("Fecha actual:", new Date().toISOString().split("T")[0]);
  console.log("Reserva en progreso:", reservaEnProgreso);
  console.log("Endpoint:", endpoint);
  console.log("=================================");
  
  return {
    reservas: reservas.length,
    ultimaSync: new Date(ultimaSincronizacion).toLocaleString(),
    sessionId: sessionId,
    reservaEnProgreso: reservaEnProgreso
  };
}

// Función para forzar sincronización manual
async function forzarSincronizacion() {
  console.log("🔄 Forzando sincronización...");
  mostrarEstadoReserva("🔄 Sincronizando datos...", "info");
  
  const exito = await sincronizarConServidor();
  
  if (exito) {
    console.log("✅ Sincronización exitosa");
    mostrarEstadoReserva("✅ Datos sincronizados correctamente", "success");
  } else {
    console.log("❌ Sincronización falló");
    mostrarEstadoReserva("❌ Error en la sincronización", "error");
  }
  
  actualizarReservas();
  actualizarReportes();
  
  if (document.querySelector('.tab-content.active')?.id === 'tab-disponibilidad') {
    consultarDisponibilidadServidor();
  }
  
  setTimeout(() => limpiarEstadoReserva(), 3000);
  return exito;
}

// Función para verificar conectividad
async function verificarConectividad() {
  try {
    const response = await fetch(endpoint + "?action=ping", {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      actualizarEstadoConexion("online", "Servidor disponible");
      return true;
    } else {
      actualizarEstadoConexion("offline", "Error HTTP " + response.status);
      return false;
    }
  } catch (error) {
    actualizarEstadoConexion("offline", "Sin respuesta del servidor");
    return false;
  }
}

// Función para limpiar cache local
function limpiarCacheLocal() {
  if (confirm("¿Estás seguro de que querés limpiar el cache local? Esto eliminará todas las reservas guardadas localmente.")) {
    localStorage.removeItem("reservasLiceo");
    reservas = [];
    ultimaSincronizacion = 0;
    
    mostrarEstadoReserva("🗑️ Cache local limpiado", "info");
    
    actualizarReservas();
    actualizarReportes();
    
    // Forzar sincronización
    setTimeout(() => {
      forzarSincronizacion();
    }, 1000);
    
    setTimeout(() => limpiarEstadoReserva(), 3000);
  }
}

// Exportar funciones de debug para la consola
window.debugSistema = {
  debug: debugReserva,
  sync: forzarSincronizacion,
  ping: verificarConectividad,
  clean: limpiarCacheLocal,
  estado: () => ({
    reservas: reservas,
    sessionId: sessionId,
    ultimaSync: new Date(ultimaSincronizacion),
    enProgreso: reservaEnProgreso
  })
};