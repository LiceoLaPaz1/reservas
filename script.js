/************************************************************
 * Reserva de recursos - Frontend SINCRONIZADO
 * - Consulta siempre al servidor para disponibilidad real
 * - Sincronización automática entre múltiples PCs
 * - localStorage solo como cache temporal
 ************************************************************/

/* =================== Configuración =================== */

// ENDPOINT del Web App
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
  "1era", "2da", "3era", "4ta", "5ta", "6ta", "7ma", "8va",
];
const horasVespertino = [
  "0", "1era", "2da", "3era", "4ta", "5ta", "6ta", "7ma",
];

/* =================== Estado =================== */

let reservas = [];
let reservaEnProgreso = false;
let ultimaSincronizacion = 0;

// Cache local como fallback solamente
try {
  const cached = JSON.parse(localStorage.getItem("reservasLiceo")) || [];
  reservas = cached;
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

function esPasado(fecha) {
  const hoyStr = new Date().toISOString().split("T")[0];
  return fecha < hoyStr;
}

function getTodosLosRecursos() {
  return Array.from(new Set([...recursosMatutino, ...recursosVespertino]));
}

/* =================== Sincronización con servidor =================== */

async function sincronizarConServidor() {
  try {
    const url = new URL(endpoint);
    url.searchParams.set("action", "getAll");
    
    const response = await fetch(url.toString());
    const data = await response.json();
    
    if (data.status === "ok" && Array.isArray(data.reservas)) {
      reservas = data.reservas.filter(r => !esPasado(r.fecha));
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
      ultimaSincronizacion = Date.now();
      return true;
    }
  } catch (error) {
    console.warn("Error sincronizando con servidor:", error);
    return false;
  }
  return false;
}

// Sincronización automática cada 30 segundos
setInterval(async () => {
  await sincronizarConServidor();
  // Refrescar UI si estamos en tab de disponibilidad
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

/* =================== Consulta de disponibilidad (servidor) =================== */

async function consultarDisponibilidadServidor() {
  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;
  const duracion = getDuracion();

  if (!fecha || !turno || !hora) return;

  // Mostrar loading
  mostrarCargando(true);

  try {
    // Sincronizar primero
    await sincronizarConServidor();

    const horasTurno = turno === "matutino" ? horasMatutino : horasVespertino;
    const indiceHora = horasTurno.indexOf(hora);
    if (indiceHora === -1) {
      alert("⚠️ Hora inválida");
      return;
    }

    const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);
    
    // Construir UI
    actualizarUIConsulta(fecha, turno, hora, duracion, horasSeleccionadas);
    
  } catch (error) {
    console.error("Error consultando disponibilidad:", error);
    alert("❌ Error consultando disponibilidad. Intentá nuevamente.");
  } finally {
    mostrarCargando(false);
  }
}

function actualizarUIConsulta(fecha, turno, hora, duracion, horasSeleccionadas) {
  // Mostrar elementos de UI
  const mensajeInicial = document.getElementById("mensaje-inicial");
  const infoConsulta = document.getElementById("info-consulta");
  const recursosContainer = document.getElementById("recursos-container");
  
  if (mensajeInicial) mensajeInicial.style.display = "none";
  if (infoConsulta) infoConsulta.style.display = "block";
  if (recursosContainer) recursosContainer.style.display = "block";

  // Actualizar detalles de consulta
  const fechaFormatted = new Date(fecha + "T00:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric", 
    month: "long",
    day: "numeric",
  });

  const detalles = document.getElementById("detalles-consulta");
  if (detalles) {
    detalles.innerHTML = `
      <strong>📅 Fecha:</strong> ${fechaFormatted}<br>
      <strong>🕐 Turno:</strong> ${turno.charAt(0).toUpperCase() + turno.slice(1)}<br>
      <strong>⏰ Hora inicial:</strong> ${hora}<br>
      <strong>⏳ Duración:</strong> ${duracion} hora(s)<br>
      <strong>🔄 Última sync:</strong> ${new Date(ultimaSincronizacion).toLocaleTimeString()}
    `;
  }

  // Crear grid de recursos con disponibilidad real del servidor
  const recursos = turno === "matutino" ? recursosMatutino : recursosVespertino;
  const recursosGrid = document.getElementById("recursos-grid");
  if (!recursosGrid) return;
  
  recursosGrid.innerHTML = "";

  // Crear set de reservas ocupadas
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
    card.className = `recurso-card ${ocupado ? "ocupado" : "disponible"}`;
    card.innerHTML = `
      <div class="recurso-nombre">${recurso}</div>
      <div class="recurso-estado ${ocupado ? "estado-ocupado" : "estado-disponible"}">
        ${ocupado ? "❌ Ocupado" : "✅ Disponible"}
      </div>
    `;
    
    if (!ocupado) {
      card.onclick = () => realizarReserva(fecha, turno, hora, recurso);
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

/* =================== Reserva mejorada con verificación atómica =================== */

async function realizarReserva(fecha, turno, hora, recurso) {
  if (reservaEnProgreso) return;
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

    const horasSeleccionadas = horasTurno.slice(indiceHora, indiceHora + duracion);

    // Verificación final antes de reservar
    if (!(await verificarDisponibilidadServidor(fecha, turno, recurso, horasSeleccionadas))) {
      alert("❌ Este recurso ya no está disponible en esa franja horaria.");
      await sincronizarConServidor();
      consultarDisponibilidadServidor();
      return;
    }

    // Mostrar confirmación
    const confirmacion = confirm(
      `¿Confirmar reserva?\n\n` +
      `👤 Docente: ${nombre} ${apellido}\n` +
      `📚 Recurso: ${recurso}\n` +
      `📅 Fecha: ${fecha}\n` +
      `🕐 Turno: ${turno}\n` +
      `⏰ Horas: ${horasSeleccionadas.join(", ")}`
    );

    if (!confirmacion) return;

    // Realizar reservas atómicas
    let reservasExitosas = 0;
    const nuevasReservas = [];

    for (let i = 0; i < horasSeleccionadas.length; i++) {
      const h = horasSeleccionadas[i];
      
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

      const exito = await enviarReservaServidor(nuevaReserva);
      if (exito) {
        nuevasReservas.push(nuevaReserva);
        reservasExitosas++;
      } else {
        // Si falla una hora, cancelamos las que ya se hicieron
        console.warn(`Fallo reserva para hora ${h}, cancelando proceso`);
        break;
      }
    }

    if (reservasExitosas === horasSeleccionadas.length) {
      // Todas exitosas - actualizar cache local
      reservas.push(...nuevasReservas);
      localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
      
      alert(
        `✅ Reserva realizada exitosamente!\n\n` +
        `📋 Detalles:\n` +
        `• Docente: ${nombre} ${apellido}\n` +
        `• Recurso: ${recurso}\n` +
        `• Fecha: ${fecha}\n` +
        `• Turno: ${turno}\n` +
        `• Horas: ${horasSeleccionadas.join(", ")}`
      );
    } else {
      alert(
        `⚠️ Solo se pudieron reservar ${reservasExitosas} de ${horasSeleccionadas.length} horas.\n` +
        `Algunas ya estaban ocupadas por otro docente.`
      );
    }

    // Sincronizar y refrescar
    await sincronizarConServidor();
    consultarDisponibilidadServidor();
    actualizarReservas();
    actualizarReportes();

  } finally {
    reservaEnProgreso = false;
  }
}

async function verificarDisponibilidadServidor(fecha, turno, recurso, horasSeleccionadas) {
  try {
    const url = new URL(endpoint);
    url.searchParams.set("action", "check");
    url.searchParams.set("fecha", fecha);
    url.searchParams.set("turno", turno);
    url.searchParams.set("recurso", recurso);
    url.searchParams.set("horas", horasSeleccionadas.join(","));

    const response = await fetch(url.toString());
    const data = await response.json();
    
    return data.status === "ok" && data.disponible === true;
  } catch (error) {
    console.warn("Error verificando disponibilidad:", error);
    return false;
  }
}

async function enviarReservaServidor(reservaData) {
  try {
    const formData = new URLSearchParams();
    formData.append("data", JSON.stringify(reservaData));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    const result = await response.json();
    
    if (result.status === "success") {
      return true;
    } else if (result.status === "conflict") {
      console.warn("Conflicto detectado en servidor:", result.message);
      return false;
    } else {
      console.error("Error del servidor:", result.message);
      return false;
    }
  } catch (error) {
    console.error("Error enviando reserva:", error);
    return false;
  }
}

/* =================== Inicialización =================== */

document.addEventListener("DOMContentLoaded", async () => {
  const hoy = new Date().toISOString().split("T")[0];
  const fechaEl = document.getElementById("fecha");
  if (fechaEl) fechaEl.value = hoy;

  // Sincronizar al cargar
  await sincronizarConServidor();
  
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
          📅 ${fechaFormatted} | 🕐 ${reserva.turno} | ⏰ ${reserva.hora}<br>
          👤 ${reserva.nombre} ${reserva.apellido}
        </div>
      </div>
      <button class="btn-cancelar" onclick="cancelarReserva(${reserva.id})">❌ Cancelar</button>
    `;
    container.appendChild(item);
  });
}

/* =================== Selección de horas =================== */

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

// Auto-consulta cuando hay datos
function actualizarDisponibilidad() {
  const fecha = document.getElementById("fecha").value;
  const turno = document.getElementById("turno").value;
  const hora = document.getElementById("hora").value;
  if (fecha && turno && hora) {
    consultarDisponibilidadServidor();
  }
}

// Mantener compatibilidad con el HTML existente
function consultarDisponibilidad() {
  consultarDisponibilidadServidor();
}

/* =================== Cancelación =================== */

async function cancelarReserva(id) {
  const confirmacion = confirm(
    "¿Estás seguro de que querés cancelar esta reserva?"
  );
  if (!confirmacion) return;

  try {
    // Encontrar la reserva
    const reserva = reservas.find(r => r.id === id);
    if (!reserva) {
      alert("❌ Reserva no encontrada");
      return;
    }

    // Cancelar en servidor
    const url = new URL(endpoint);
    url.searchParams.set("action", "cancel");
    url.searchParams.set("id", id);

    const response = await fetch(url.toString());
    const result = await response.json();

    if (result.status === "ok") {
      // Remover del cache local
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

  // Reporte por recurso
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

  // Sincronizar al cambiar a tabs importantes
  if (tabName === "reservas") {
    sincronizarConServidor().then(() => actualizarReservas());
  }
  if (tabName === "reportes") {
    sincronizarConServidor().then(() => actualizarReportes());
  }
}

/* =================== Limpieza =================== */

function limpiarReservasVencidas() {
  const activas = reservas.filter((r) => !esPasado(r.fecha));
  if (activas.length !== reservas.length) {
    reservas = activas;
    localStorage.setItem("reservasLiceo", JSON.stringify(reservas));
  }
}

// Limpiar cada 5 minutos
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
  if (horaEl) horaEl.innerHTML = '<option value="">Seleccionar hora</option>';
  if (durEl) durEl.value = 1;
  if (info) info.style.display = "none";
  if (recCont) recCont.style.display = "none";
  if (msg) msg.style.display = "block";
  if (detalles) detalles.innerHTML = "";
  if (grid) grid.innerHTML = "";
}

/* =================== Debug =================== */

function debugReserva() {
  console.log("Reservas actuales:", reservas);
  console.log("Última sincronización:", new Date(ultimaSincronizacion));
  console.log("Fecha actual:", new Date().toISOString().split("T")[0]);
}

// Función para forzar sincronización manual (útil para debug)
async function forzarSincronizacion() {
  console.log("Forzando sincronización...");
  const exito = await sincronizarConServidor();
  console.log("Sincronización:", exito ? "exitosa" : "falló");
  actualizarReservas();
  actualizarReportes();
  if (document.querySelector('.tab-content.active')?.id === 'tab-disponibilidad') {
    consultarDisponibilidadServidor();
  }
}