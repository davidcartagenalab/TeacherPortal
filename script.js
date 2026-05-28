// ============================================================
// CONSTANTS & BACKEND URLS
// ============================================================

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxS9VmmsG9UppC8vVSAeuVUN82PQuq4mrUdoZXbDNAppPEPzLFicTnhLfY40Gr_9QU/exec";

const BACKEND_URL = "https://backendblinkschedule.onrender.com";

// ============================================================
// 1. TEACHER DROPDOWN (shared by both flows)
// ============================================================

const teacherSelect = document.getElementById("teacherSelect");
const teacherSelectedEl = teacherSelect.querySelector(".selected");
const teacherOptionsEl  = teacherSelect.querySelector(".options");
const teacherOptionList = teacherSelect.querySelectorAll(".option");
const teacherSearchBox  = teacherSelect.querySelector(".search-box");

teacherSelectedEl.addEventListener("click", () => {
  teacherOptionsEl.classList.toggle("show");
  setTimeout(() => teacherSearchBox.focus(), 50);
});

teacherOptionList.forEach((opt) => {
  opt.addEventListener("click", () => {
    teacherSelectedEl.innerText = opt.innerText;
    teacherOptionsEl.classList.remove("show");
  });
});

teacherSearchBox.addEventListener("keyup", () => {
  const filter = teacherSearchBox.value.toLowerCase();
  teacherOptionList.forEach((opt) => {
    opt.style.display = opt.innerText.toLowerCase().includes(filter) ? "block" : "none";
  });
});

document.addEventListener("click", (e) => {
  if (!teacherSelect.contains(e.target)) {
    teacherOptionsEl.classList.remove("show");
  }
});

function getSelectedTeacher() {
  return teacherSelectedEl.innerText.trim();
}

// ============================================================
// 2. MAIN FORM SUBMIT — routes to "view" or "notes"
// ============================================================

let scheduleData = null;
const mainLoader = document.getElementById("main-loader");
const mainForm   = document.getElementById("mainForm");

mainForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const teacher = getSelectedTeacher();
  const email   = mainForm.querySelector('input[type="email"]').value.trim();
  const action  = e.submitter ? e.submitter.value : "view";

  if (!teacher || teacher === "Seleccione una opción") {
    alert("Por favor, seleccione su nombre.");
    return;
  }
  if (!email) {
    alert("Por favor, escriba su correo.");
    return;
  }

  if (action === "view") {
    await handleViewSchedule(teacher, email);
  } else if (action === "notes") {
    await handleOpenNotes(teacher, email);
  }
});

// ============================================================
// 3. VIEW SCHEDULE FLOW
// ============================================================

async function loadTeachers() {
  const res = await fetch("teachers.json");
  return await res.json();
}

async function requestScheduleFromAppsScript(teacher, email, action) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ teacher, email, action }),
  });
  const data = await res.json();
  console.log("Apps Script response:", data);
  return data;
}

async function handleViewSchedule(teacher, email) {
  mainLoader.classList.remove("hidden");

  try {
    const teachers = await loadTeachers();
    const record   = teachers[teacher];

    if (!record) {
      alert("Profesor no encontrado");
      return;
    }
    if (record.email.toLowerCase() !== email.toLowerCase()) {
      alert("El correo no coincide con el profesor seleccionado");
      return;
    }

    scheduleData = await requestScheduleFromAppsScript(teacher, email, "view");

    if (!scheduleData || !scheduleData.schedule) {
      alert("No hay horario disponible para este profesor");
      return;
    }

    renderFullSchedule(scheduleData);
    renderStudents(scheduleData);
    paintGrid(scheduleData);
    renderRooms(scheduleData);

    document.getElementById("right-column").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    alert("Error cargando el horario");
  } finally {
    mainLoader.classList.add("hidden");
  }
}

// ============================================================
// 4. RENDER LEFT-PANEL TIMELINE
// ============================================================

function renderFullSchedule(data) {
  const container = document.getElementById("schedule-container");
  container.innerHTML = "";

  const daysMap = {
    monday:    "LUNES",
    tuesday:   "MARTES",
    wednesday: "MIÉRCOLES",
    thursday:  "JUEVES",
    friday:    "VIERNES",
  };

  let anyDay = false;

  Object.keys(daysMap).forEach((dayKey) => {
    const dayData  = data.schedule[dayKey] || {};
    const hasItems = Object.entries(dayData).some(
      ([type, items]) => type !== "break" && Array.isArray(items) && items.length > 0
    );
    if (!hasItems) return;

    anyDay = true;
    const block = document.createElement("section");
    block.className = "info-box fade-in";
    block.innerHTML = `<h2>${daysMap[dayKey]}</h2><div class="day-container"></div>`;
    renderTimeline(block.querySelector(".day-container"), dayData);
    container.appendChild(block);
  });

  if (anyDay) container.classList.remove("hidden");
}

// ============================================================
// 5. SORT + TIMELINE
// ============================================================

function getAllItemsSorted(dayData) {
  const result = [];
  Object.entries(dayData).forEach(([type, items]) => {
    if (!items || type === "break") return;
    items.forEach((item) => result.push({ ...item, type }));
  });
  return result.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function renderTimeline(container, dayData) {
  container.innerHTML = "";
  const items = getAllItemsSorted(dayData);

  const config = {
    "group blink":   { icon: "assets/Grupo-01.png" },
    "private blink": { icon: "assets/Private-01.png" },
    "master blink":  { icon: "assets/masterClass-01.png" },
    "online blink":  { icon: "assets/Online.png" },
    "nomad private": { icon: "assets/Nomad.png" },
    "nomad group":   { icon: "assets/Nomad.png" },
    event:           { icon: "assets/Eventos.png" },
    break:           { icon: "assets/break.png" },
    other:           { icon: "assets/Private-01.png" },
  };

  items.forEach((item) => {
    const cfg = config[item.type] || config.other;
    const el  = document.createElement("div");
    el.className = "row-header";
    el.innerHTML = `
      <img src="${cfg.icon}" />
      <div>
        <h3>${item.value}</h3>
        <p>${formatTime(item.startTime)} - ${formatTime(item.endTime)}</p>
      </div>
    `;
    container.appendChild(el);
  });
}

// ============================================================
// 6. GRID PAINTING
// ============================================================

function paintGrid(data) {
  const grid = document.getElementById("grid-container");

  // Reset all cells
  document.querySelectorAll(".cell").forEach((cell) => {
    const top    = cell.querySelector(".top");
    const bottom = cell.querySelector(".bottom");
    if (top)    { top.className    = "half top";    delete top.dataset.filled; }
    if (bottom) { bottom.className = "half bottom"; delete bottom.dataset.filled; }
    delete cell.dataset.info;
  });

  const dayIndexMap = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };

  const order = [
    "group blink", "private blink", "master blink", "online blink",
    "nomad private", "nomad group", "event", "other",
  ];

  const colorMap = {
    "group blink":   "group",
    "private blink": "private",
    "master blink":  "master",
    "online blink":  "online",
    "nomad private": "nomad",
    "nomad group":   "nomad",
    event:           "event",
    other:           "other",
  };

  Object.entries(data.schedule).forEach(([day, dayData]) => {
    const col = dayIndexMap[day];

    order.forEach((type) => {
      const items = dayData[type];
      if (!items) return;

      items.forEach((item) => {
        const start = getTimeParts(item.startTime);
        const end   = getTimeParts(item.endTime);
        let current = start.hourIndex;

        while (
          current < end.hourIndex ||
          (current === end.hourIndex && end.isHalf)
        ) {
          const index = current * 6 + col + 6;
          const cell  = grid.children[index];
          if (!cell) break;

          const topHalf    = cell.querySelector(".top");
          const bottomHalf = cell.querySelector(".bottom");
          const isStart    = current === start.hourIndex;
          const isEnd      = current === end.hourIndex;

          if (isStart && start.isHalf) {
            if (bottomHalf.dataset.filled === "1") { current++; continue; }
            bottomHalf.classList.add(colorMap[type]);
            bottomHalf.dataset.filled = "1";
          } else if (isEnd && end.isHalf) {
            if (topHalf.dataset.filled === "1") { current++; continue; }
            topHalf.classList.add(colorMap[type]);
            topHalf.dataset.filled = "1";
          } else {
            if (topHalf.dataset.filled === "1" || bottomHalf.dataset.filled === "1") {
              current++; continue;
            }
            topHalf.classList.add(colorMap[type]);
            bottomHalf.classList.add(colorMap[type]);
            topHalf.dataset.filled    = "1";
            bottomHalf.dataset.filled = "1";
          }

          if (!cell.dataset.info) {
            cell.dataset.info = JSON.stringify({
              type, value: item.value, start: item.startTime, end: item.endTime, day,
            });
          }
          current++;
        }
      });
    });
  });
}

// ============================================================
// 7. GRID POPUP
// ============================================================

document.getElementById("grid-container").addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell || !cell.dataset.info) return;
  showPopup(JSON.parse(cell.dataset.info), e);
});

function showPopup(data, event) {
  let popup = document.getElementById("cell-popup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "cell-popup";
    document.body.appendChild(popup);
  }

  const labels = {
    "group blink":   "Blink Group",
    "private blink": "Private Blink",
    "master blink":  "Master Blink",
    "online blink":  "Online Blink",
    "nomad private": "Nomad Private",
    "nomad group":   "Nomad Group",
    event:           "Event",
    other:           "Other",
  };

  popup.innerHTML = `
    <strong>${data.value}</strong><br>
    ${labels[data.type] || data.type}<br>
    ${data.start} - ${data.end}
  `;
  popup.style.cssText = `
    display: block;
    position: absolute;
    top: ${event.pageY + 10}px;
    left: ${event.pageX + 10}px;
  `;
}

document.addEventListener("click", (e) => {
  const popup = document.getElementById("cell-popup");
  if (popup && !e.target.closest(".cell")) popup.style.display = "none";
});

// ============================================================
// 8. HELPERS
// ============================================================

function getTimeParts(time) {
  const [h, m] = time.split(":").map(Number);
  return { hourIndex: h - 7, isHalf: m >= 30 };
}

function formatTime(time) {
  const [h, m] = time.split(":");
  let hour = parseInt(h);
  const ampm = hour >= 12 ? "P.M." : "A.M.";
  hour = hour % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

// ============================================================
// 9. RENDER STUDENTS
// ============================================================

function renderStudents(data) {
  if (!data.students) return;

  const sections = {
    blinkGroup:   { container: document.getElementById("blink-group-students"),   wrapper: document.getElementById("blink-group-section") },
    nomadGroup:   { container: document.getElementById("nomad-group-students"),   wrapper: document.getElementById("nomad-group-section") },
    privateBlink: { container: document.getElementById("private-blink-students"), wrapper: document.getElementById("private-blink-section") },
    privateNomad: { container: document.getElementById("private-nomad-students"), wrapper: document.getElementById("private-nomad-section") },
  };

  Object.values(sections).forEach(({ container, wrapper }) => {
    if (!container) return;
    wrapper.classList.add("hidden");
    container.innerHTML = `
      <div class="student-row header">
        <span>Nombre</span><span>País</span><span>Grupo</span>
        <span>Nivel</span><span>Profesor Grupo</span><span>Profesor Privado</span>
      </div>`;
  });

  let anyStudents = false;

  Object.entries(sections).forEach(([key, { container, wrapper }]) => {
    if (!container) return;
    const students = data.students[key] || [];
    if (students.length === 0) return;

    anyStudents = true;
    wrapper.classList.remove("hidden");

    students.forEach((s) => {
      const row = document.createElement("div");
      row.className = "student-row";
      row.innerHTML = `
        <span>${capitalize(s.name)}</span>
        <span>${s.country || "-"}</span>
        <span>${capitalize(s.group || "-")}</span>
        <span>${s.level || "-"}</span>
        <span>${(s.groupTeachers || []).join(", ") || "-"}</span>
        <span>${(s.privateTeacher || []).join(", ") || "-"}</span>
      `;
      container.appendChild(row);
    });
  });

  if (anyStudents) document.getElementById("students-section").classList.remove("hidden");
}

function capitalize(text) {
  return text.replace(/\b\w/g, (l) => l.toUpperCase());
}

// ============================================================
// 10. RENDER ROOMS
// ============================================================

function renderRooms(data) {
  if (!data.salones) return;
  const { manana = "", tarde = "", noche = "" } = data.salones;
  if (!manana && !tarde && !noche) return;

  document.getElementById("room-manana").textContent = manana || "-";
  document.getElementById("room-tarde").textContent  = tarde  || "-";
  document.getElementById("room-noche").textContent  = noche  || "-";
  document.getElementById("rooms-box").classList.remove("hidden");
}

// ============================================================
// 11. PDF DOWNLOAD
// ============================================================

function getISOWeekNumber(date) {
  const d      = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week      = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

document.querySelector(".schedule-copy-button").addEventListener("click", async () => {
  const btn = document.querySelector(".schedule-copy-button");
  btn.disabled  = true;
  btn.textContent = "Generando PDF...";

  try {
    const originalArea = document.querySelector(".page-wrapper");
    const { week, year } = getISOWeekNumber(new Date());
    const teacher  = getSelectedTeacher().replace(/\s+/g, "_");
    const filename = `Horario_${teacher}_Semana_${week}_${year}.pdf`;
    const clone    = originalArea.cloneNode(true);

    clone.querySelector(".hero-image")?.remove();
    clone.querySelector(".info-box-teacher")?.remove();
    clone.querySelector(".schedule-copy-button")?.remove();

    clone.querySelectorAll("#students-section > section").forEach((section) => {
      const hasRows = section.querySelectorAll(".student-row:not(.header)").length > 0;
      hasRows ? section.classList.remove("hidden") : section.remove();
    });

    const studentsSection = clone.querySelector("#students-section");
    if (studentsSection) {
      const hasAny = studentsSection.querySelectorAll(".student-row:not(.header)").length > 0;
      hasAny ? studentsSection.classList.remove("hidden") : studentsSection.remove();
    }

    clone.querySelectorAll(".fade-in").forEach((el) => {
      el.classList.remove("fade-in");
      el.style.opacity   = "1";
      el.style.transform = "none";
    });

    const resolvedStyles = document.createElement("style");
    resolvedStyles.textContent = `
      :root {
        --green:#8bc34a; --yellow:#f69729; --gray:#f2f2f2;
        --gray-dark:#9e9e9e; --red:#e53935; --blue:#42a5f5;
        --violet:#d22af4; --nomadRed:#e4233d; --darkBlue:rgb(109,60,254);
        --border:#d4d4d4; --text:#1a1a1a;
      }
      .top.group,   .bottom.group   { background-color:#8bc34a !important; }
      .top.private, .bottom.private { background-color:#f69729 !important; }
      .top.master,  .bottom.master  { background-color:#42a5f5 !important; }
      .top.online,  .bottom.online  { background-color:rgb(109,60,254) !important; }
      .top.nomad,   .bottom.nomad   { background-color:#e4233d !important; }
      .top.event,   .bottom.event   { background-color:#d22af4 !important; }
      .top.other,   .bottom.other   { background-color:#f69729 !important; }
      .cell.header-day  { background-color:#9e9e9e !important; color:black !important;
                          writing-mode:vertical-rl !important; transform:none !important; }
      .cell.header-time { background-color:#9e9e9e !important; color:black !important; }
      .cell.reloj       { background-color:#e53935 !important; }
      .cell             { background-color:#f9f9f9; }
    `;
    clone.prepend(resolvedStyles);

    const RENDER_WIDTH = 1200;
    clone.style.cssText = `
      position: absolute; left: -9999px; top: 0;
      width: ${RENDER_WIDTH}px; background-color: #ffffff; padding: 20px;
    `;
    document.body.appendChild(clone);

    const canvas = await html2canvas(clone, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      width: RENDER_WIDTH,
      windowWidth: RENDER_WIDTH,
    });

    document.body.removeChild(clone);

    const imgData        = canvas.toDataURL("image/png");
    const { jsPDF }      = window.jspdf;
    const PX_PER_MM      = 96 / 25.4;
    const margin         = 8;
    const contentW       = canvas.width / 2 / PX_PER_MM;
    const contentH       = canvas.height / 2 / PX_PER_MM;
    const pageW          = contentW + margin * 2;
    const pageH          = contentH + margin * 2;

    const pdf = new jsPDF({
      orientation: pageW > pageH ? "landscape" : "portrait",
      unit: "mm",
      format: [pageW, pageH],
    });
    pdf.addImage(imgData, "PNG", margin, margin, contentW, contentH);
    pdf.save(filename);

  } catch (err) {
    console.error("PDF error:", err);
    alert("Error al generar el PDF. Por favor intenta de nuevo.");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Descargar horario";
  }
});

// ============================================================
// ============================================================
// NOTES SYSTEM
// ============================================================
// ============================================================

// ── State ──────────────────────────────────────────────────
let notesStudentsData        = [];
let notesCurrentIndex        = 0;
let notesGroupLevelSelected  = "";
let notesGroupLevelInitialized   = false;
let notesStudentNextInitialized  = false;

// ── DOM refs (notes overlay) ─────────────────────────────
const notesOverlay           = document.getElementById("notes-overlay");
const notesModalLoader       = document.getElementById("notes-loader");
const notesBox               = document.querySelector(".notes-box");
const notesConfirmation      = document.querySelector(".notes-confirmation");
const notesProgressContainer = document.getElementById("progressContainer");
const notesNextBtn           = document.getElementById("nextBtn");
const notesPrevBtn           = document.getElementById("prevBtn");
const notesBackBtn           = document.getElementById("backBtn");
const notesCloseBtn          = document.getElementById("notesCloseBtn");

// ============================================================
// 12. OPEN NOTES FLOW
// ============================================================

async function handleOpenNotes(teacher, email) {
  // Open the overlay immediately and show loader
  notesOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  notesModalLoader.classList.remove("hidden");
  resetNotesState();

  try {
    // 1. Authenticate teacher + email against backend
    const authRes  = await fetch(`${BACKEND_URL}/teacher/auth`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: teacher, email }),
    });
    const authJson = await authRes.json();

    if (!authJson.ok) {
      alert("El nombre o el email no coinciden. Verifica tus datos.");
      closeNotesOverlay();
      return;
    }

    // 2. Load students
    const ok = await loadNotesStudents(teacher);
    if (!ok) {
      closeNotesOverlay();
      return;
    }

    // 3. Student notes flow
    if (!notesStudentsData.length) {
      alert("No se encontraron estudiantes para este profesor.");
      closeNotesOverlay();
      return;
    }

    notesBox.classList.remove("hidden");
    initStudentNextLevelSelector();

    const groupLevelBlock = document.getElementById("groupLevelBlock");
    if (groupLevelBlock) {
      groupLevelBlock.style.display = "block";
      initGroupLevelSelector();
    }

    notesCurrentIndex = 0;
    createProgressDots(notesStudentsData.length);
    showStudent(notesCurrentIndex);
    refreshNavButtons();

  } catch (err) {
    console.error("Notes flow error:", err);
    alert("Error al abrir el sistema de notas.");
    closeNotesOverlay();
  } finally {
    notesModalLoader.classList.add("hidden");
  }
}

// ============================================================
// 13. CLOSE / RESET OVERLAY
// ============================================================

function closeNotesOverlay() {
  notesOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

notesCloseBtn.addEventListener("click", closeNotesOverlay);

// Close on backdrop click
notesOverlay.addEventListener("click", (e) => {
  if (e.target === notesOverlay) closeNotesOverlay();
});

// Close on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !notesOverlay.classList.contains("hidden")) {
    closeNotesOverlay();
  }
});

function resetNotesState() {
  notesStudentsData       = [];
  notesCurrentIndex       = 0;
  notesGroupLevelSelected = "";
  notesGroupLevelInitialized  = false;
  notesStudentNextInitialized = false;

  // Hide all notes sections
  if (notesBox)          notesBox.classList.add("hidden");
  if (notesConfirmation) notesConfirmation.classList.add("hidden");

  const groupLevelBlock = document.getElementById("groupLevelBlock");
  if (groupLevelBlock) groupLevelBlock.style.display = "none";

  // Reset group level selector
  const groupSel = document.querySelector("#groupLevelSelect .selected");
  if (groupSel) groupSel.innerText = "Nivel esta semana";
  const plusBtn = document.getElementById("plusButton");
  if (plusBtn) plusBtn.classList.remove("active");

  // Reset student next-level selector
  const studentSel = document.querySelector("#studentNextLevelSelect .selected");
  if (studentSel) studentSel.innerText = "Nivel próxima semana";
  const studentPlus = document.getElementById("studentPlusButton");
  if (studentPlus) studentPlus.classList.remove("active");

  // Reset sliders
  ["grammar", "fluency", "vocab"].forEach((type) => {
    const slider = document.getElementById(`${type}Slider`);
    const val    = document.getElementById(`${type}Value`);
    if (slider) slider.value  = 3;
    if (val)    val.textContent = "3";
  });

  // Clear admin notes, topics, progress
  const adminNotesEl = document.getElementById("adminNotes");
  if (adminNotesEl) adminNotesEl.value = "";

  const topicsContainer = document.getElementById("topicsContainer");
  if (topicsContainer) topicsContainer.innerHTML = "";

  if (notesProgressContainer) notesProgressContainer.innerHTML = "";

  const studentNameEl = document.getElementById("studentName");
  if (studentNameEl) studentNameEl.innerText = "";
}

// ============================================================
// 14. LOAD STUDENTS (notes)
// ============================================================

async function loadNotesStudents(teacherName) {
  try {
    const res  = await fetch(`${BACKEND_URL}/teacher/get-students`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: teacherName }),
    });
    const json = await res.json();

    if (json.status !== "success" || !json.data) {
      alert("No se encontraron datos para este profesor.");
      return false;
    }

    const pack   = json.data;
    const merged = [
      ...(pack.groupStudents   || []).map((s) => ({ ...s, type: "group" })),
      ...(pack.privateStudents || []).map((s) => ({ ...s, type: "private" })),
    ];

    if (merged.length === 0) {
      alert("El profesor no tiene estudiantes esta semana.");
      return false;
    }

    notesStudentsData = merged.map((s) => ({
      studentName: s.studentName || "",
      studentCode: s.studentCode || "",
      group:       s.group       || "",
      level:       s.level       || "",
      type:        s.type,
      nextLevel:   "",
      adminNotes:  "",
      evaluation:  { grammar: 3, fluency: 3, vocabulary: 3 },
      topics:      [],
      levelUsed:   s.level || "",
    }));

    return true;
  } catch (err) {
    console.error("loadNotesStudents error:", err);
    alert("Error cargando información del profesor o estudiantes.");
    return false;
  }
}

// ============================================================
// 15. STUDENT MODE — SHOW STUDENT
// ============================================================

function showStudent(index) {
  const student = notesStudentsData[index];
  if (!student) return;

  // Inherit nextLevel from previous student if not set
  if (!student.nextLevel && index > 0) {
    const prev = notesStudentsData[index - 1];
    if (prev?.nextLevel) student.nextLevel = prev.nextLevel;
  }

  // --- Update next-level selector ---
  const selector      = document.getElementById("studentNextLevelSelect");
  const selectedLevel = selector?.querySelector(".selected");
  const plusBtn       = document.getElementById("studentPlusButton");

  if (selectedLevel) {
    if (student.nextLevel) {
      selectedLevel.innerText = student.nextLevel;
      plusBtn.classList.toggle("active", student.nextLevel.endsWith("+"));
    } else {
      selectedLevel.innerText = "Nivel próxima semana";
      plusBtn.classList.remove("active");
    }
  }

  // --- Effective level for topics ---
  const effectiveLevel  = notesGroupLevelSelected
    || (student.levelUsed || student.level || "");
  student.levelUsed     = effectiveLevel;

  // --- Header ---
  document.getElementById("studentName").innerText = student.studentName || "—";

  const groupNameEl = document.getElementById("groupName");
  if (groupNameEl) groupNameEl.innerText = student.group || "—";

  const currentLevelEl = document.getElementById("currentLevel");
  if (currentLevelEl) currentLevelEl.innerText = student.level || "—";

  // --- Admin notes ---
  const adminNotesEl = document.getElementById("adminNotes");
  if (adminNotesEl) adminNotesEl.value = student.adminNotes || "";

  // --- Sliders ---
  const grammar = student.evaluation?.grammar    ?? 3;
  const fluency = student.evaluation?.fluency    ?? 3;
  const vocab   = student.evaluation?.vocabulary ?? 3;

  document.getElementById("grammarSlider").value   = grammar;
  document.getElementById("fluencySlider").value   = fluency;
  document.getElementById("vocabSlider").value     = vocab;
  document.getElementById("grammarValue").textContent = grammar;
  document.getElementById("fluencyValue").textContent = fluency;
  document.getElementById("vocabValue").textContent   = vocab;

  // --- Topics ---
  renderTopics({ ...student, levelUsed: effectiveLevel });

  // --- Footer ---
  document.getElementById("studentCounter").innerText =
    `Estudiante ${index + 1} de ${notesStudentsData.length}`;

  updateProgressDots(index);
  refreshNavButtons();
}

// ============================================================
// 17. SAVE CURRENT STUDENT INPUTS
// ============================================================

function saveCurrentStudentInputs() {
  const s = notesStudentsData[notesCurrentIndex];
  if (!s) return;

  // Next level
  const selector = document.getElementById("studentNextLevelSelect");
  const sel      = selector?.querySelector(".selected");
  s.nextLevel    = sel ? sel.innerText.trim() : "";

  // Admin notes
  const adminNotesEl = document.getElementById("adminNotes");
  s.adminNotes       = adminNotesEl ? adminNotesEl.value : "";

  // Evaluation
  s.evaluation = {
    grammar:    parseInt(document.getElementById("grammarSlider").value),
    fluency:    parseInt(document.getElementById("fluencySlider").value),
    vocabulary: parseInt(document.getElementById("vocabSlider").value),
  };

  // Topics
  s.topics = [];
  document.querySelectorAll(".topic-row").forEach((row) => {
    const name     = row.querySelector(".topic-name").textContent;
    const selected = row.querySelector(".topic-buttons .selected");
    s.topics.push({ name, score: selected ? selected.dataset.score : "" });
  });
}

// ============================================================
// 18. RENDER TOPICS
// ============================================================

function renderTopics(student) {
  const container = document.getElementById("topicsContainer");
  if (!container) return;
  container.innerHTML = "";

  if (!notesGroupLevelSelected) {
    container.innerHTML = "<p style='font-size:0.85rem;color:#9e9e9e;'>Seleccione el nivel del grupo arriba para cargar los temas.</p>";
    return;
  }

  const topics = (window.topicsByLevel && window.topicsByLevel[student.levelUsed]) || [];

  if (!topics.length) {
    container.innerHTML = "<p style='font-size:0.85rem;color:#9e9e9e;'>No hay temas configurados para este nivel.</p>";
    return;
  }

  topics.forEach((topic) => {
    const row      = document.createElement("div");
    row.classList.add("topic-row");

    const nameEl   = document.createElement("span");
    nameEl.classList.add("topic-name");
    nameEl.textContent = topic;

    const buttonsEl = document.createElement("div");
    buttonsEl.classList.add("topic-buttons");

    ["B", "M", "A"].forEach((label) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.classList.add(label.toLowerCase());
      btn.dataset.score = label;

      const existing = (student.topics || []).find((t) => t.name === topic);
      if (existing && existing.score === label) btn.classList.add("selected");

      btn.addEventListener("click", () => {
        if (btn.classList.contains("selected")) {
          btn.classList.remove("selected");
          return;
        }
        buttonsEl.querySelectorAll("button").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });

      buttonsEl.appendChild(btn);
    });

    row.appendChild(nameEl);
    row.appendChild(buttonsEl);
    container.appendChild(row);
  });
}

// ============================================================
// 19. SLIDER LIVE VALUES
// ============================================================

["grammar", "fluency", "vocab"].forEach((type) => {
  const slider = document.getElementById(`${type}Slider`);
  const value  = document.getElementById(`${type}Value`);
  if (!slider) return;
  slider.addEventListener("input", () => {
    value.textContent = slider.value;
  });
});

// ============================================================
// 20. PROGRESS DOTS
// ============================================================

function createProgressDots(count) {
  notesProgressContainer.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    dot.classList.add("progress-dot");
    if (i === 0) dot.classList.add("active");
    notesProgressContainer.appendChild(dot);
  }
}

function updateProgressDots(index) {
  notesProgressContainer.querySelectorAll(".progress-dot")
    .forEach((d, i) => d.classList.toggle("active", i === index));
}

// ============================================================
// 21. NAV BUTTONS (student mode)
// ============================================================

notesNextBtn.addEventListener("click", async () => {
  saveCurrentStudentInputs();
  const isLast = notesCurrentIndex >= notesStudentsData.length - 1;
  if (!isLast) {
    notesCurrentIndex++;
    showStudent(notesCurrentIndex);
    notesBox.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    await submitAllNotes();
  }
});

notesPrevBtn.addEventListener("click", () => {
  if (notesCurrentIndex > 0) {
    saveCurrentStudentInputs();
    notesCurrentIndex--;
    showStudent(notesCurrentIndex);
    notesBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

function refreshNavButtons() {
  const isLast = notesCurrentIndex >= notesStudentsData.length - 1;
  notesNextBtn.textContent = isLast ? "Enviar" : "Siguiente";

  const blocked = !notesGroupLevelSelected;
  notesNextBtn.disabled = blocked;
  notesPrevBtn.disabled = blocked && notesCurrentIndex === 0;
}

// ============================================================
// 22. SUBMIT ALL NOTES (student mode)
// ============================================================

async function submitAllNotes() {
  if (!notesStudentsData.length) return;

  if (!notesGroupLevelSelected) {
    alert("Seleccione el nivel del grupo para esta semana antes de enviar.");
    return;
  }

  const teacher = getSelectedTeacher();

  const payload = {
    action:   "saveGrades",
    teacher,
    students: notesStudentsData.map((s) => ({
      studentName:    s.studentName    || "",
      studentCode:    s.studentCode    || "",
      group:          s.group          || "",
      level:          s.level          || "",
      levelEvaluated: s.levelUsed      || "",
      nextLevel:      s.nextLevel      || "",
      type:           s.type === "private" ? "Private" : "Group",
      evaluation: {
        grammar:    s.evaluation?.grammar    || "",
        fluidez:    s.evaluation?.fluency    || "",
        vocabulary: s.evaluation?.vocabulary || "",
      },
      topics: s.topics || [],
    })),
  };

  notesNextBtn.disabled    = true;
  notesPrevBtn.disabled    = true;
  notesNextBtn.textContent = "Guardando...";
  notesModalLoader.classList.remove("hidden");

  try {
    const res    = await fetch(APPS_SCRIPT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const result = await res.json();
    console.log("Submit notes response:", result);

    if (result.status === "success") {
      notesBox.classList.add("hidden");
      const groupLevelBlock = document.getElementById("groupLevelBlock");
      if (groupLevelBlock) groupLevelBlock.style.display = "none";
      notesConfirmation.classList.remove("hidden");
    } else {
      console.error("Submit notes error:", result);
      alert("Hubo un problema al guardar las notas.");
    }
  } catch (err) {
    console.error("Submit notes exception:", err);
    alert("Error de conexión al guardar las notas.");
  } finally {
    notesModalLoader.classList.add("hidden");
    notesNextBtn.disabled    = false;
    notesPrevBtn.disabled    = false;
    notesNextBtn.textContent = "Enviar";
  }
}

// ============================================================
// 23. BACK TO START (confirmation → reset)
// ============================================================

notesBackBtn.addEventListener("click", () => {
  resetNotesState();
  closeNotesOverlay();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ============================================================
// 24. GROUP LEVEL SELECTOR (current week, Fri)
// ============================================================

function initGroupLevelSelector() {
  if (notesGroupLevelInitialized) return;
  notesGroupLevelInitialized = true;

  const box       = document.getElementById("groupLevelSelect");
  const plusBtn   = document.getElementById("plusButton");
  if (!box || !plusBtn) return;

  const selectedEl  = box.querySelector(".selected");
  const optionsCont = box.querySelector(".options");
  const optionsList = box.querySelectorAll(".option");

  selectedEl.addEventListener("click", () => {
    optionsCont.classList.toggle("show");
  });

  optionsList.forEach((opt) => {
    opt.addEventListener("click", () => {
      selectedEl.innerText = opt.innerText;
      optionsCont.classList.remove("show");

      notesGroupLevelSelected = plusBtn.classList.contains("active")
        ? opt.innerText.trim() + "+"
        : opt.innerText.trim();

      if (notesStudentsData[notesCurrentIndex]) {
        notesStudentsData[notesCurrentIndex].levelUsed = notesGroupLevelSelected;
      }

      if (notesStudentsData.length) showStudent(notesCurrentIndex);
    });
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!box.contains(e.target)) optionsCont.classList.remove("show");
  });

  plusBtn.addEventListener("click", () => {
    plusBtn.classList.toggle("active");
    let base = selectedEl.innerText.trim().replace(/\+$/, "");

    if (base && base !== "Nivel esta semana") {
      const final = plusBtn.classList.contains("active") ? base + "+" : base;
      selectedEl.innerText     = final;
      notesGroupLevelSelected  = final;

      if (notesStudentsData[notesCurrentIndex]) {
        notesStudentsData[notesCurrentIndex].levelUsed = final;
      }
      if (notesStudentsData.length) showStudent(notesCurrentIndex);
    }
  });
}

// ============================================================
// 25. STUDENT NEXT-LEVEL SELECTOR (Fri)
// ============================================================

function initStudentNextLevelSelector() {
  if (notesStudentNextInitialized) return;
  notesStudentNextInitialized = true;

  const block   = document.getElementById("studentNextLevelSelect");
  const plusBtn = document.getElementById("studentPlusButton");
  if (!block || !plusBtn) return;

  const selected    = block.querySelector(".selected");
  const optionsCont = block.querySelector(".options");
  const optionsList = block.querySelectorAll(".option");

  selected.addEventListener("click", () => {
    optionsCont.classList.toggle("show");
  });

  optionsList.forEach((opt) => {
    opt.addEventListener("click", () => {
      selected.innerText = opt.innerText;
      optionsCont.classList.remove("show");

      const base  = opt.innerText.trim();
      const final = plusBtn.classList.contains("active") ? base + "+" : base;

      if (notesStudentsData[notesCurrentIndex]) {
        notesStudentsData[notesCurrentIndex].nextLevel = final;
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!block.contains(e.target)) optionsCont.classList.remove("show");
  });

  plusBtn.addEventListener("click", () => {
    plusBtn.classList.toggle("active");
    const base  = selected.innerText.trim().replace(/\+$/, "");
    const final = plusBtn.classList.contains("active") ? base + "+" : base;
    selected.innerText = final;

    if (notesStudentsData[notesCurrentIndex]) {
      notesStudentsData[notesCurrentIndex].nextLevel = final;
    }
  });
}
