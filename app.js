let state = defaultState();
let selectedPatientId = null;
let backendReady = false;
let currentUser = null;
let stateDirty = false;
let currentView = "patients";
let uiLang = navigator.language?.toLowerCase().startsWith("hu") ? "hu" : "en";
const I18N = {
  en: {
    noActiveShift:"No active shift", oneShiftOnly:"Only one shift can be active at a time.",
    startShift:"START SHIFT", importPatient:"Import new patient",
    autoId:"ID automatically starts from 01 in each shift.", sex:"Sex", yob:"Year of birth",
    mainComplaint:"Main complaint", addPatient:"ADD PATIENT", patientRecord:"Patient record",
    waitingOnly:"Status shows tests currently waiting for result.",
    diagnoses:"Diagnoses", disposition:"Disposition", finalDecision:"4. Final decision / disposition"
  },
  hu: {
    noActiveShift:"Nincs aktív műszak", oneShiftOnly:"Egyszerre csak egy aktív műszak lehet.",
    startShift:"MŰSZAK INDÍTÁSA", importPatient:"Új beteg felvétele",
    autoId:"A betegazonosító minden műszakban 01-től indul.", sex:"Nem", yob:"Születési év",
    mainComplaint:"Fő panasz", addPatient:"BETEG HOZZÁADÁSA", patientRecord:"Beteglista",
    waitingOnly:"A státusz csak az eredményre váró vizsgálatokat mutatja.",
    diagnoses:"Diagnózisok", disposition:"Diszpozíció", finalDecision:"4. Végső döntés / diszpozíció"
  }
};

function applyLanguage(lang) {
  uiLang = I18N[lang] ? lang : "en";
  document.documentElement.lang = uiLang === "hu" ? "hu" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const value = I18N[uiLang][el.dataset.i18n];
    if (value) el.textContent = value;
  });
  const disposition = document.getElementById("fDisposition");
  if (disposition) {
    const labels = uiLang === "hu"
      ? ["Aktív / folyamatban", "Otthonába bocsátva", "Osztályos felvétel / áthelyezés", "Egyéb"]
      : ["Active / in progress", "Discharged", "Admitted / transferred", "Other"];
    [...disposition.options].forEach((option, i) => {
      if (labels[i]) option.textContent = labels[i];
    });
  }
  document.getElementById("langEnBtn")?.classList.toggle("active", uiLang === "en");
  document.getElementById("langHuBtn")?.classList.toggle("active", uiLang === "hu");
}

function defaultState() {
  return { shift: null, patients: [], references: [] };
}

function persist() {
  // Privacy-aware backend writes are intentionally explicit rather than
  // running on every keystroke. This only marks the in-memory state dirty.
  stateDirty = true;
}

async function persistNow() {
  if (!backendReady || !state.shift) return { removed: 0, report: null };

  const patient = patientById(selectedPatientId);
  if (!patient) {
    stateDirty = false;
    return { removed: 0, report: null };
  }

  const result = await window.BachSBOBackend.savePatient(
    state.shift.id,
    patient
  );
  stateDirty = false;

  if (result?.patient?.id === patient.id) {
    Object.assign(patient, result.patient);

    // The browser form is updated to the same de-identified representation
    // that was permanently stored. Raw identifiers are not kept as the
    // operational in-memory version after an explicit save.
    if (currentView === "patients" && selectedPatientId === patient.id) {
      loadPatientForm();
    }
  }

  if (result?.removed > 0) {
    flash(`Privacy filter removed ${result.removed} identifier(s).`);
  }

  return result;
}

function handleBackendError(error) {
  console.error(error);
  flash("Backend error: " + (error?.message || "Unknown error"));
}

function nowIso() {
  return new Date().toISOString();
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

function normalizeYob(value) {
  const text = String(value ?? "").trim();
  if (/^\d{2}$/.test(text)) {
    const n = Number(text);
    const current2 = new Date().getFullYear() % 100;
    return String(n <= current2 ? 2000 + n : 1900 + n);
  }
  return text;
}

function ageFromYob(yob) {
  const year = parseInt(normalizeYob(yob), 10);
  return year ? new Date().getFullYear() - year : "";
}

function activeShiftPatients() {
  return state.shift ? state.patients.filter((p) => p.shiftId === state.shift.id) : [];
}

function nextPatientId() {
  return String(activeShiftPatients().length + 1).padStart(2, "0");
}

function patientById(id) {
  return state.patients.find((p) => p.id === id);
}

function isCompleted(patient) {
  return Boolean(patient.summaryFinalizedAt);
}

function newEntry(type = "") {
  return {
    id: crypto.randomUUID(),
    type,
    mode: "waiting",
    text: "",
    savedText: ""
  };
}

function radiologyEntry() {
  return {
    ...newEntry(""),
    bodyPart: "",
    modality: "",
    otherTest: ""
  };
}

function normalizeRadiologyEntry(entry) {
  if (!entry) return radiologyEntry();
  if (entry.bodyPart === undefined) entry.bodyPart = "";
  if (entry.modality === undefined) entry.modality = "";
  if (entry.otherTest === undefined) entry.otherTest = "";
  if (!entry.bodyPart && !entry.modality && !entry.otherTest && (entry.type || "").trim()) {
    entry.modality = "other";
    entry.otherTest = (entry.type || "").trim();
  }
  return entry;
}

function radiologyType(entry) {
  normalizeRadiologyEntry(entry);
  const body = (entry.bodyPart || "").trim();
  const modality = (entry.modality || "").trim();
  const other = (entry.otherTest || "").trim();
  if (modality === "other") return [body, other].filter(Boolean).join(" — ") || "Radiology";
  return [body, modality].filter(Boolean).join(" ").trim() || "Radiology";
}

function entryStatus(entry) {
  if (entry.mode === "notordered") return "notordered";
  if (
    (entry.savedText || "").trim() &&
    (entry.text || "").trim() === (entry.savedText || "").trim()
  ) {
    return "result";
  }
  return "waiting";
}

function waitingLabels(patient) {
  const out = [];

  patient.tests.labs.forEach((entry, i) => {
    if (entryStatus(entry) === "waiting") out.push(`Lab ${i + 1}`);
  });

  if (entryStatus(patient.tests.ekg) === "waiting") out.push("EKG");

  if (entryStatus(patient.tests.gas) === "waiting") {
    out.push(/\bVVG\b/i.test(patient.tests.gas.text || "") ? "VVG" : "AVG");
  }

  patient.tests.radiology.forEach((entry, i) => {
    if (entryStatus(entry) === "waiting") {
      out.push(radiologyType(entry) || `Radiology ${i + 1}`);
    }
  });

  patient.tests.consultations.forEach((entry, i) => {
    if (entryStatus(entry) === "waiting") {
      out.push(entry.type?.trim() || `Consultation ${i + 1}`);
    }
  });

  return out;
}

function renderHeader() {
  const meta = document.getElementById("shiftMeta");
  const actions = document.getElementById("topActions");
  meta.innerHTML = "";
  actions.innerHTML = "";

  const hu = uiLang === "hu";
  if (!state.shift) {
    meta.innerHTML = `<span class="metric">${hu ? "Nincs aktív műszak" : "No active shift"}</span>`;
    actions.innerHTML = `<button class="btn" id="signOutBtn">${hu ? "KIJELENTKEZÉS" : "SIGN OUT"}</button>`;
    document.getElementById("signOutBtn").onclick = signOut;
    return;
  }

  const pts = activeShiftPatients();
  const completed = pts.filter(isCompleted).length;
  const active = pts.length - completed;

  meta.innerHTML = `
    <span class="shift-pill"><span class="dot"></span> ${hu ? "AKTÍV MŰSZAK" : "SHIFT ACTIVE"} • ${hu ? "Kezdés" : "Started"} ${fmtTime(state.shift.startedAt)}</span>
    <span class="metric">${hu ? "Betegek" : "Patients"} <b>${pts.length}</b></span>
    <span class="metric">${hu ? "Aktív" : "Active"} <b>${active}</b></span>
    <span class="metric">${hu ? "Lezárt" : "Completed"} <b>${completed}</b></span>
  `;

  actions.innerHTML =
    `<button class="btn danger" id="endShiftBtn">${hu ? "MŰSZAK LEZÁRÁSA" : "END SHIFT"}</button>` +
    `<button class="btn" id="signOutBtn">${hu ? "KIJELENTKEZÉS" : "SIGN OUT"}</button>`;
  document.getElementById("endShiftBtn").onclick = endShiftStep1;
  document.getElementById("signOutBtn").onclick = signOut;
}

function renderApp() {
  renderHeader();

  const learning = currentView === "learning";
  const admin = currentView === "admin";
  const patients = currentView === "patients";

  document.getElementById("patientsNav").classList.toggle("active", patients);
  document.getElementById("aiLearningNav").classList.toggle("active", learning);
  document.getElementById("adminNav").classList.toggle("active", admin);

  document.getElementById("aiLearningView").classList.toggle("hidden", !learning);
  document.getElementById("adminView").classList.toggle("hidden", !admin);

  if (learning || admin) {
    document.getElementById("noShiftView").classList.add("hidden");
    document.getElementById("patientsView").classList.add("hidden");
    if (admin) renderAdminView();
    return;
  }

  document.getElementById("noShiftView").classList.toggle("hidden", Boolean(state.shift));
  document.getElementById("patientsView").classList.toggle("hidden", !state.shift);

  if (state.shift) renderPatients();
}

function setView(view) {
  currentView = view;
  renderApp();

  if (view === "learning") {
    renderLearningDashboard().catch(handleBackendError);
  }
}

function renderAdminView() {
  const email = window.BACH_SBO_CONFIG?.adminEmail || currentUser?.email || "";
  document.getElementById("adminEmailDisplay").value = email;
}

async function changeAdminPassword() {
  const currentPassword = document.getElementById("currentAdminPassword").value;
  const newPassword = document.getElementById("newAdminPassword").value;
  const confirmPassword = document.getElementById("confirmAdminPassword").value;
  const button = document.getElementById("changeAdminPasswordBtn");
  const message = document.getElementById("adminPasswordMessage");

  message.textContent = "";

  if (!currentPassword) {
    message.textContent = "Enter your current password.";
    return;
  }
  if (newPassword.length < 6) {
    message.textContent = "New password must contain at least 6 characters.";
    return;
  }
  if (newPassword !== confirmPassword) {
    message.textContent = "New passwords do not match.";
    return;
  }
  if (newPassword === currentPassword) {
    message.textContent = "New password must be different from the current password.";
    return;
  }

  button.disabled = true;
  button.textContent = "CHANGING…";

  try {
    await window.BachSBOBackend.changeAdminPassword(
      currentPassword,
      newPassword
    );
    document.getElementById("currentAdminPassword").value = "";
    document.getElementById("newAdminPassword").value = "";
    document.getElementById("confirmAdminPassword").value = "";
    message.textContent = "Password changed successfully.";
  } catch (error) {
    message.textContent = error?.message || "Could not change password.";
  } finally {
    button.disabled = false;
    button.textContent = "CHANGE PASSWORD";
  }
}

function renderPatients() {
  document.getElementById("newId").value = nextPatientId();

  const tbody = document.getElementById("patientTbody");
  tbody.innerHTML = "";

  activeShiftPatients().forEach((patient) => {
    const waits = waitingLabels(patient);
    const statusHtml = waits.length
      ? `<div class="wait-stack">${waits
          .map((x) => `<span class="wait-chip">${esc(x)}</span>`)
          .join("")}</div>`
      : '<span class="wait-none">—</span>';

    const tr = document.createElement("tr");
    tr.dataset.id = patient.id;

    if (patient.id === selectedPatientId) tr.classList.add("selected");

    tr.innerHTML = `
      <td>${patient.localId}</td>
      <td>${patient.sex}</td>
      <td>${ageFromYob(patient.yob)}</td>
      <td>${esc(patient.mainComplaint)}</td>
      <td data-status-cell="${patient.id}">${statusHtml}</td>
    `;

    tr.onclick = () => {
      selectedPatientId = patient.id;
      renderPatients();
      loadPatientForm();
    };

    tbody.appendChild(tr);
  });

  if (selectedPatientId) {
    loadPatientForm();
  } else {
    document.getElementById("patientForm").classList.add("hidden");
    document.getElementById("noPatientSelected").classList.remove("hidden");
    document.getElementById("recordTitle").textContent = "Patient detail";
    document.getElementById("recordSubtitle").textContent = "Chọn một bệnh nhân bên trái.";
    document.getElementById("patientStatusBadge").innerHTML = "";
  }
}

function updateStatusCell(patient) {
  const cell = document.querySelector(`[data-status-cell="${patient.id}"]`);
  if (!cell) return;

  const waits = waitingLabels(patient);

  cell.innerHTML = waits.length
    ? `<div class="wait-stack">${waits
        .map((x) => `<span class="wait-chip">${esc(x)}</span>`)
        .join("")}</div>`
    : '<span class="wait-none">—</span>';
}

async function addPatient() {
  if (!state.shift) return;

  const sex = document.getElementById("newSex").value;
  const yob = normalizeYob(document.getElementById("newYob").value);
  const mainComplaint = document.getElementById("newComplaint").value.trim();

  if (!sex || !yob || !mainComplaint) {
    alert("Please enter Sex, Year of birth and Main complaint.");
    return;
  }

  const currentYear = new Date().getFullYear();
  if (!/^\d{4}$/.test(yob) || Number(yob) < 1900 || Number(yob) > currentYear) {
    alert("Year of birth must be 4 digits or a 2-digit shorthand, e.g. 55 = 1955.");
    return;
  }
  document.getElementById("newYob").value = yob;

  const patient = {
    id: crypto.randomUUID(),
    shiftId: state.shift.id,
    localId: nextPatientId(),
    sex,
    yob,
    mainComplaint,
    complaint: "",
    history: "",
    physical: "",
    tests: {
      labs: [newEntry()],
      ekg: newEntry(),
      gas: newEntry(),
      radiology: [radiologyEntry()],
      consultations: [newEntry("")]
    },
    others: "",
    therapy: "",
    course: "",
    diagnoses: "",
    disposition: "",
    recommendations: [""],
    hospital: "",
    ward: "",
    physician: "",
    admissionNote: "",
    otherOutcome: "",
    otherDetails: "",
    summary: "",
    summaryGeneratedText: "",
    summaryGeneratedAt: null,
    summaryFinalizedText: "",
    summaryFinalizedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  state.patients.push(patient);
  persist();

  selectedPatientId = patient.id;

  document.getElementById("newSex").value = "";
  document.getElementById("newYob").value = "";
  document.getElementById("newComplaint").value = "";

  try {
    await persistNow();
  } catch (error) {
    handleBackendError(error);
  }

  renderApp();
}

function loadPatientForm() {
  const patient = patientById(selectedPatientId);
  if (!patient) return;

  document.getElementById("patientForm").classList.remove("hidden");
  document.getElementById("noPatientSelected").classList.add("hidden");

  document.getElementById("recordTitle").textContent = `Patient ${patient.localId}`;
  document.getElementById("recordSubtitle").textContent =
    `${patient.sex} • ${ageFromYob(patient.yob)} y • ${patient.mainComplaint}`;

  document.getElementById("patientStatusBadge").innerHTML =
    `<span class="badge ${isCompleted(patient) ? "done" : "active"}">${isCompleted(patient) ? "COMPLETED" : "ACTIVE / IN PROGRESS"}</span>`;

  const values = {
    fMainComplaint: patient.mainComplaint,
    fComplaint: patient.complaint,
    fHistory: patient.history,
    fPhysical: patient.physical,
    fOthers: patient.others,
    fTherapy: patient.therapy,
    fCourse: patient.course,
    fDiagnoses: patient.diagnoses || "",
    fDisposition: patient.disposition,
    fHospital: patient.hospital,
    fWard: patient.ward,
    fPhysician: patient.physician,
    fAdmissionNote: patient.admissionNote,
    fOtherOutcome: patient.otherOutcome,
    fOtherDetails: patient.otherDetails,
    fSummary: patient.summary
  };

  Object.entries(values).forEach(([id, value]) => {
    document.getElementById(id).value = value || "";
  });

  renderAllTests(patient);
  renderRecommendations(patient);
  updateDispositionVisibility();
  renderSummaryStatus(patient);
}

function renderAllTests(patient) {
  renderGroupCards("labCards", patient.tests.labs, "Lab", "lab");
  renderSingleCard("ekgCard", patient.tests.ekg, "EKG", "ekg");
  renderSingleCard(
    "gasCard",
    patient.tests.gas,
    /\bVVG\b/i.test(patient.tests.gas.text || "") ? "VVG" : "AVG",
    "gas"
  );
  renderRadiologyCards(patient);
  renderDynamicCards(
    "consultCards",
    patient.tests.consultations,
    "Consultation",
    "consultations",
    "Type e.g. Cardiology, Neurology"
  );
}

function modeDots(entry) {
  const status = entryStatus(entry);
  return `<div class="mode-dots" data-mode-dots>
    <button type="button" class="mode-dot-btn waiting ${status === "waiting" ? "active" : ""}" data-mode-choice="waiting" title="Waiting for result" aria-label="Waiting for result"></button>
    <button type="button" class="mode-dot-btn notordered ${status === "notordered" ? "active" : ""}" data-mode-choice="notordered" title="Not ordered" aria-label="Not ordered"></button>
    <span class="mode-dot-btn result ${status === "result" ? "active" : ""}" title="Result available" aria-label="Result available"></span>
  </div>`;
}

function statusBadge(status) {
  return `<span class="test-status ${status}">${status === "result"
    ? "RESULT AVAILABLE"
    : status === "notordered"
    ? "NOT ORDERED"
    : "WAITING FOR RESULT"}</span>`;
}

function renderGroupCards(hostId, entries, label, prefix) {
  const host = document.getElementById(hostId);
  host.innerHTML = "";

  entries.forEach((entry, i) => {
    host.appendChild(makeSimpleCard(`${label} ${i + 1}`, entry, `${prefix}-${i}`));
  });

  document.getElementById("addLabBtn").disabled = entries.length >= 3;
}

function renderSingleCard(hostId, entry, label, key) {
  const host = document.getElementById(hostId);
  host.innerHTML = "";
  host.appendChild(makeSimpleCard(label, entry, key, key === "gas"));
}

function makeSimpleCard(label, entry, key, isGas = false) {
  const status = entryStatus(entry);
  const card = document.createElement("div");
  const canDelete = key.startsWith("lab-") &&
    (patientById(selectedPatientId)?.tests?.labs?.length || 0) > 1;

  card.className =
    `test-card ${status === "result" ? "result" : status === "notordered" ? "notordered" : ""}`;
  card.dataset.card = key;

  card.innerHTML = `
    <div class="test-head">
      <div class="test-name-wrap">
        <span class="test-name">${label}</span>
        ${isGas ? `<span class="gas-type">${label}</span>` : ""}
      </div>
      <div class="card-head-actions">
        ${modeDots(entry)}
        ${canDelete ? '<button class="btn small delete-test" type="button" data-delete-test>DELETE</button>' : ""}
      </div>
    </div>

    <div class="test-grid">

      <textarea data-text="${key}" ${entry.mode === "notordered" ? "disabled" : ""} placeholder="${label} result...">${esc(entry.text || "")}</textarea>

      <button type="button" class="btn small primary test-save" data-save="${key}"
        ${!entry.text.trim() || entry.mode === "notordered" || status === "result" ? "disabled" : ""}>
        SAVE RESULT
      </button>
    </div>
  `;

  const deleteButton = card.querySelector("[data-delete-test]");
  if (deleteButton) {
    deleteButton.onclick = () => {
      const patient = patientById(selectedPatientId);
      if (!patient) return;
      const [prefix, rawIndex] = key.split("-");
      const index = Number(rawIndex);
      if (prefix === "lab" && patient.tests.labs.length > 1) patient.tests.labs.splice(index, 1);
      persist();
      renderAllTests(patient);
      updateStatusCell(patient);
    };
  }

  wireCard(card, entry, key);

  return card;
}

function renderDynamicCards(hostId, entries, label, prefix, placeholder) {
  const host = document.getElementById(hostId);
  host.innerHTML = "";

  entries.forEach((entry, i) => {
    const key = `${prefix}-${i}`;
    const status = entryStatus(entry);
    const card = document.createElement("div");

    card.className =
      `test-card ${status === "result" ? "result" : status === "notordered" ? "notordered" : ""}`;

    card.dataset.card = key;

    card.innerHTML = `
      <div class="test-head">
        <div class="test-name-wrap"><span class="test-name">${label} ${i + 1}</span></div>
        <div class="card-head-actions">
          ${modeDots(entry)}
          ${entries.length > 1 ? '<button class="btn small delete-test" type="button" data-delete-test>DELETE</button>' : ""}
        </div>
      </div>

      <div class="dynamic-grid">
        <input data-type="${key}" value="${attr(entry.type || "")}" placeholder="${placeholder}" />

        <textarea data-text="${key}" ${entry.mode === "notordered" ? "disabled" : ""} placeholder="Result / note...">${esc(entry.text || "")}</textarea>

        <button type="button" class="btn small primary test-save" data-save="${key}"
          ${!entry.text.trim() || entry.mode === "notordered" || status === "result" ? "disabled" : ""}>
          SAVE RESULT
        </button>
      </div>
    `;

    host.appendChild(card);

    const typeInput = card.querySelector(`[data-type="${key}"]`);
    typeInput.oninput = () => {
      entry.type = typeInput.value;
      persist();
      updateStatusCell(patientById(selectedPatientId));
    };

    const deleteButton = card.querySelector("[data-delete-test]");
    if (deleteButton) {
      deleteButton.onclick = () => {
        entries.splice(i, 1);
        persist();
        renderAllTests(patientById(selectedPatientId));
        updateStatusCell(patientById(selectedPatientId));
      };
    }

    wireCard(card, entry, key);
  });
}

function renderRadiologyCards(patient) {
  const host = document.getElementById("radiologyCards");
  host.innerHTML = "";
  patient.tests.radiology.forEach((entry, i) => {
    normalizeRadiologyEntry(entry);
    const key = `radiology-${i}`;
    const status = entryStatus(entry);
    const card = document.createElement("div");
    const bodyParts = ["", "koponya", "mellkas", "has", "mellkas és has", "has és kismedence"];
    const modalities = ["", "RTG", "ultrahang", "CT", "MR", "other"];
    const options = (items, current, labels = {}) => items.map((value) =>
      `<option value="${attr(value)}"${value === current ? " selected" : ""}>${labels[value] || value || "— select —"}</option>`
    ).join("");

    card.className = `test-card ${status === "result" ? "result" : status === "notordered" ? "notordered" : ""}`;
    card.dataset.card = key;
    card.innerHTML = `
      <div class="test-head">
        <div class="test-name-wrap"><span class="test-name">Radiology ${i + 1}</span><span class="subtle" data-rad-label>${esc(radiologyType(entry))}</span></div>
        <div class="card-head-actions">
          ${modeDots(entry)}
          ${patient.tests.radiology.length > 1 ? '<button class="btn small delete-test" type="button" data-delete-test>DELETE</button>' : ""}
        </div>
      </div>
      <div class="radiology-grid${entry.modality === "other" ? " has-other" : ""}">
        <select data-body>${options(bodyParts, entry.bodyPart)}</select>
        <select data-modality>${options(modalities, entry.modality, {other:"Other / specific"})}</select>
        <input data-other class="${entry.modality === "other" ? "" : "hidden"}" value="${attr(entry.otherTest || "")}" placeholder="Specific test e.g. CT angiographia" />
        <textarea data-text="${key}" ${entry.mode === "notordered" ? "disabled" : ""} placeholder="Radiology result...">${esc(entry.text || "")}</textarea>
        <button type="button" class="btn small primary test-save" data-save="${key}" ${!entry.text.trim() || entry.mode === "notordered" || status === "result" ? "disabled" : ""}>SAVE RESULT</button>
      </div>`;

    const body = card.querySelector("[data-body]");
    const modality = card.querySelector("[data-modality]");
    const other = card.querySelector("[data-other]");
    const updateType = () => {
      entry.bodyPart = body.value;
      entry.modality = modality.value;
      entry.otherTest = other.value;
      entry.type = radiologyType(entry);
      other.classList.toggle("hidden", entry.modality !== "other");
      card.querySelector(".radiology-grid").classList.toggle("has-other", entry.modality === "other");
      card.querySelector("[data-rad-label]").textContent = entry.type;
      persist();
      updateStatusCell(patient);
    };
    body.onchange = updateType;
    modality.onchange = updateType;
    other.oninput = updateType;

    const deleteButton = card.querySelector("[data-delete-test]");
    if (deleteButton) {
      deleteButton.onclick = () => {
        patient.tests.radiology.splice(i, 1);
        persist();
        renderRadiologyCards(patient);
        updateStatusCell(patient);
      };
    }
    host.appendChild(card);
    wireCard(card, entry, key);
  });
}

function wireCard(card, entry, key) {
  const modeButtons = [...card.querySelectorAll("[data-mode-choice]")];
  const text = card.querySelector(`[data-text="${key}"]`);
  const save = card.querySelector(`[data-save="${key}"]`);

  function refreshVisual() {
    const status = entryStatus(entry);

    card.className =
      `test-card ${status === "result" ? "result" : status === "notordered" ? "notordered" : ""}`;

    const statusEl = card.querySelector(".test-status");
    if (statusEl) statusEl.outerHTML = statusBadge(status);
    card.querySelectorAll("[data-mode-choice]").forEach((button) => {
      button.classList.toggle("active", button.dataset.modeChoice === status);
    });
    card.querySelector(".mode-dot-btn.result")?.classList.toggle("active", status === "result");
    text.disabled = entry.mode === "notordered";
    save.disabled =
      !entry.text.trim() || entry.mode === "notordered" || status === "result";

    updateStatusCell(patientById(selectedPatientId));
  }

  modeButtons.forEach((button) => {
    button.onclick = () => {
      entry.mode = button.dataset.modeChoice === "notordered" ? "notordered" : "waiting";
      persist();
      refreshVisual();
    };
  });

  text.oninput = () => {
    entry.text = text.value;
    persist();
    refreshVisual();

    if (key === "gas") {
      const label = /\bVVG\b/i.test(entry.text || "") ? "VVG" : "AVG";
      card.querySelector(".test-name").textContent = label;
      card.querySelector(".gas-type").textContent = label;
    }
  };

  text.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      entry.text = text.value;
      if (entry.mode !== "notordered" && entry.text.trim()) save.click();
    }
  });

  save.onclick = async () => {
    if (!entry.text.trim()) return;

    entry.savedText = entry.text;
    entry.mode = "waiting";
    refreshVisual();

    try {
      await persistNow();
      flash("Result saved.");
    } catch (error) {
      handleBackendError(error);
    }
  };
}

function addLab() {
  const patient = patientById(selectedPatientId);
  if (!patient || patient.tests.labs.length >= 3) return;

  patient.tests.labs.push(newEntry());
  persist();
  renderAllTests(patient);
  updateStatusCell(patient);
}

function addRadiology() {
  const patient = patientById(selectedPatientId);
  if (!patient) return;

  patient.tests.radiology.push(radiologyEntry());
  persist();
  renderAllTests(patient);
  updateStatusCell(patient);
}

function addConsult() {
  const patient = patientById(selectedPatientId);
  if (!patient) return;

  patient.tests.consultations.push(newEntry(""));
  persist();
  renderAllTests(patient);
  updateStatusCell(patient);
}

function collectForm() {
  const patient = patientById(selectedPatientId);
  if (!patient) return null;

  patient.mainComplaint = document.getElementById("fMainComplaint").value;
  patient.complaint = document.getElementById("fComplaint").value;
  patient.history = document.getElementById("fHistory").value;
  patient.physical = document.getElementById("fPhysical").value;
  patient.others = document.getElementById("fOthers").value;
  patient.therapy = document.getElementById("fTherapy").value;
  patient.course = document.getElementById("fCourse").value;
  patient.diagnoses = document.getElementById("fDiagnoses").value;
  patient.disposition = document.getElementById("fDisposition").value;
  patient.hospital = document.getElementById("fHospital").value;
  patient.ward = document.getElementById("fWard").value;
  patient.physician = document.getElementById("fPhysician").value;
  patient.admissionNote = document.getElementById("fAdmissionNote").value;
  patient.otherOutcome = document.getElementById("fOtherOutcome").value;
  patient.otherDetails = document.getElementById("fOtherDetails").value;
  patient.summary = document.getElementById("fSummary").value;
  patient.recommendations = [...document.querySelectorAll("[data-rec]")].map(
    (x) => x.value
  );
  patient.updatedAt = nowIso();

  return patient;
}

async function savePatient() {
  const patient = collectForm();
  if (!patient) return;

  try {
    await persistNow();
    renderApp();
    flash("Patient saved.");
  } catch (error) {
    handleBackendError(error);
  }
}

function updateDispositionVisibility() {
  const value = document.getElementById("fDisposition").value;

  document
    .getElementById("dischargedFields")
    .classList.toggle("hidden", value !== "discharged");

  document
    .getElementById("admittedFields")
    .classList.toggle("hidden", value !== "admitted");

  document
    .getElementById("otherFields")
    .classList.toggle("hidden", value !== "other");
}

function renderRecommendations(patient) {
  const recList = document.getElementById("recList");
  recList.innerHTML = "";

  const entries = patient.recommendations?.length
    ? patient.recommendations
    : [""];

  entries.forEach((text, i) => {
    const row = document.createElement("div");
    row.className = "rec-row";

    row.innerHTML = `
      <div class="n">${i + 1}.</div>
      <input data-rec value="${attr(text)}" />
      <button type="button" class="btn small" data-del-rec="${i}">×</button>
    `;

    recList.appendChild(row);
  });

  recList.querySelectorAll("[data-del-rec]").forEach((btn) => {
    btn.onclick = () => {
      collectForm();

      const patient = patientById(selectedPatientId);
      patient.recommendations.splice(Number(btn.dataset.delRec), 1);

      if (!patient.recommendations.length) patient.recommendations = [""];

      persist();
      renderRecommendations(patient);
    };
  });
}

function addRecommendation() {
  collectForm();

  const patient = patientById(selectedPatientId);
  patient.recommendations.push("");

  persist();
  renderRecommendations(patient);
}

async function generateSummary() {
  const patient = collectForm();
  if (!patient) return;

  const button = document.getElementById("generateSummaryBtn");
  const oldLabel = button.textContent;
  button.disabled = true;
  button.textContent = "GENERATING…";

  try {
    // Persist first so the AI only sees the de-identified database copy.
    await persistNow();

    const result = await window.BachSBOBackend.generateSummary(patient.id);

    patient.summary = result.summary || "";
    patient.summaryGeneratedText = patient.summary;
    patient.summaryGeneratedAt = result.generatedAt || nowIso();
    patient.summaryModel = result.model || "";
    patient.summarySkillVersion = result.skillVersion || "";

    document.getElementById("fSummary").value = patient.summary;
    renderSummaryStatus(patient);

    const skillSuffix = result.skillVersion
      ? ` • Skill v${result.skillVersion}`
      : "";
    const retrievalCount = Array.isArray(result.similarCasesUsed)
      ? result.similarCasesUsed.length
      : 0;
    const retrievalSuffix = retrievalCount
      ? ` • ${retrievalCount} similar case(s)`
      : "";
    flash(`Summary generated${skillSuffix}${retrievalSuffix}.`);
  } catch (error) {
    handleBackendError(error);
  } finally {
    button.disabled = false;
    button.textContent = oldLabel;
  }
}

async function finalizeSummary() {
  const patient = collectForm();
  if (!patient) return;

  const text = patient.summary.trim();

  if (!text) {
    alert("Summary is empty.");
    return;
  }

  patient.summaryFinalizedText = text;
  patient.summaryFinalizedAt = nowIso();
  patient.updatedAt = nowIso();

  try {
    await persistNow();
    const revisionResult =
      await window.BachSBOBackend.appendSummaryRevision(patient);

    if (revisionResult?.patient?.id === patient.id) {
      Object.assign(patient, revisionResult.patient);
      document.getElementById("fSummary").value =
        patient.summaryFinalizedText || patient.summary || "";
    }

    if (revisionResult?.removed > 0) {
      flash(
        `Privacy filter removed ${revisionResult.removed} identifier(s) from finalized corpus.`
      );
    }
    if (revisionResult?.embeddingWarning) {
      flash("Summary saved; similar-case embedding will need retry.");
    }
  } catch (error) {
    handleBackendError(error);
    return;
  }

  const clipboardText =
    patient.summaryFinalizedText || patient.summary || text;

  try {
    await navigator.clipboard.writeText(clipboardText);
    flash("Summary finalized and copied to clipboard.");
  } catch {
    flash("Summary finalized. Clipboard unavailable.");
  }

  renderApp();
}

function renderSummaryStatus(patient) {
  const summaryStatus = document.getElementById("summaryStatus");
  const summaryText = document.getElementById("fSummary").value || "";

  if (!patient.summaryFinalizedAt) {
    summaryStatus.innerHTML =
      '<span class="badge active">NOT FINALIZED</span><span class="subtle">Patient vẫn IN PROGRESS.</span>';
    return;
  }

  const changed =
    summaryText.trim() !== patient.summaryFinalizedText.trim();

  summaryStatus.innerHTML = changed
    ? '<span class="badge active">EDITED AFTER FINALIZE</span><span class="subtle">Finalize lại để cập nhật reference.</span>'
    : `<span class="badge done">FINALIZED</span><span class="subtle">Saved ${fmtTime(patient.summaryFinalizedAt)}</span>`;
}

async function startShift() {
  if (state.shift) return;

  try {
    state.shift = await window.BachSBOBackend.startShift();
    selectedPatientId = null;
    renderApp();
  } catch (error) {
    handleBackendError(error);
  }
}

function endShiftStep1() {
  const pts = activeShiftPatients();
  const active = pts.filter((p) => !isCompleted(p)).length;

  modal(`
    <h3>End current shift?</h3>
    <p>Patients: <b>${pts.length}</b><br>Still active / in progress: <b>${active}</b></p>
    <p>This will close the current workspace.</p>
    <div class="modal-actions">
      <button class="btn" data-close>CANCEL</button>
      <button class="btn danger" id="endContinue">CONTINUE</button>
    </div>
  `);

  document.getElementById("endContinue").onclick = endShiftStep2;
}

function endShiftStep2() {
  modal(`
    <h3>Confirm end shift</h3>
    <p>Type <b>END</b> to confirm.</p>
    <input id="endInput" autocomplete="off" placeholder="END" />
    <div class="modal-actions">
      <button class="btn" data-close>CANCEL</button>
      <button class="btn danger" id="endFinal" disabled>END SHIFT</button>
    </div>
  `);

  const input = document.getElementById("endInput");
  const endFinal = document.getElementById("endFinal");

  input.oninput = () => {
    endFinal.disabled = input.value !== "END";
  };

  endFinal.onclick = async () => {
    const closingShiftId = state.shift?.id;
    if (!closingShiftId) return;

    endFinal.disabled = true;

    try {
      await persistNow();
      await window.BachSBOBackend.closeShift(closingShiftId);
      state = defaultState();
      selectedPatientId = null;
      closeModal();
      renderApp();
    } catch (error) {
      endFinal.disabled = false;
      handleBackendError(error);
    }
  };
}

function modal(inner) {
  const host = document.getElementById("modalHost");

  host.innerHTML =
    `<div class="modal-wrap"><div class="modal">${inner}</div></div>`;

  document.querySelectorAll("[data-close]").forEach((x) => {
    x.onclick = closeModal;
  });
}

function closeModal() {
  document.getElementById("modalHost").innerHTML = "";
}

function learningMessage(message, isError = false) {
  const el = document.getElementById("learningMessage");
  if (!message) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }

  el.textContent = message;
  el.classList.remove("hidden");
  el.style.borderColor = isError ? "#fecaca" : "";
  el.style.background = isError ? "#fef2f2" : "";
  el.style.color = isError ? "#991b1b" : "";
}

function renderStyleProfiles(profiles) {
  const host = document.getElementById("styleProfilesList");
  if (!profiles.length) {
    host.innerHTML =
      '<div class="subtle">No style profile yet. Finalize at least 5 cases, then generate a candidate.</div>';
    return;
  }

  host.innerHTML = profiles.map((profile) => `
    <div class="learning-item">
      <div class="learning-item-head">
        <b>Style v${esc(profile.version)}</b>
        <span class="badge ${profile.is_active ? "done" : "pending"}">
          ${profile.is_active ? "ACTIVE" : "CANDIDATE"}
        </span>
      </div>
      <div class="subtle">
        ${profile.source_revision_count || 0} finalized pairs
        ${profile.model ? ` • ${esc(profile.model)}` : ""}
      </div>
      <div class="learning-text">${esc(profile.profile_text || "")}</div>
      ${
        profile.is_active
          ? ""
          : `<div class="learning-actions">
              <button class="btn success small" data-activate-style="${profile.id}">
                ACTIVATE
              </button>
            </div>`
      }
    </div>
  `).join("");

  host.querySelectorAll("[data-activate-style]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await window.BachSBOBackend.activateStyle(
          button.dataset.activateStyle
        );
        learningMessage("Writing style activated.");
        await renderLearningDashboard();
      } catch (error) {
        learningMessage(error?.message || "Style activation failed.", true);
      } finally {
        button.disabled = false;
      }
    };
  });
}

function renderSkillSuggestions(suggestions) {
  const host = document.getElementById("skillSuggestionsList");
  if (!suggestions.length) {
    host.innerHTML =
      '<div class="subtle">No Skill suggestions yet. At least 10 Generated → Finalized pairs are required.</div>';
    return;
  }

  host.innerHTML = suggestions.map((item) => `
    <div class="learning-item">
      <div class="learning-item-head">
        <b>Based on Skill v${esc(item.base_skill_version)}</b>
        <span class="badge ${esc(item.status)}">${esc(String(item.status).toUpperCase())}</span>
      </div>
      <div class="subtle">
        ${item.source_revision_count || 0} finalized pairs
        ${item.model ? ` • ${esc(item.model)}` : ""}
      </div>
      <div class="learning-text">${esc(item.suggestion_text || "")}</div>
      ${
        item.status === "pending"
          ? `<div class="learning-actions">
              <button class="btn success small" data-skill-review="${item.id}" data-decision="accepted">
                ACCEPT FOR FOLLOW-UP
              </button>
              <button class="btn small" data-skill-review="${item.id}" data-decision="rejected">
                REJECT
              </button>
            </div>
            <div class="footer-note">Accepting does not change the master Skill automatically.</div>`
          : ""
      }
    </div>
  `).join("");

  host.querySelectorAll("[data-skill-review]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        const result = await window.BachSBOBackend.reviewSkillSuggestion(
          button.dataset.skillReview,
          button.dataset.decision
        );
        learningMessage(result?.note || "Suggestion reviewed.");
        await renderLearningDashboard();
      } catch (error) {
        learningMessage(error?.message || "Suggestion review failed.", true);
      } finally {
        button.disabled = false;
      }
    };
  });
}

async function renderLearningDashboard() {
  if (!backendReady) return;

  learningMessage("");
  const overview = await window.BachSBOBackend.getLearningOverview();

  document.getElementById("learningFinalizedCount").textContent =
    String(overview.finalizedCount || 0);

  document.getElementById("learningActiveSkill").textContent =
    overview.activeSkill
      ? `${overview.activeSkill.name || "SBO Skill"} v${overview.activeSkill.version}`
      : "Not configured";

  const activeStyle = (overview.styleProfiles || []).find((x) => x.is_active);
  document.getElementById("learningActiveStyle").textContent =
    activeStyle ? `v${activeStyle.version}` : "None";

  renderStyleProfiles(overview.styleProfiles || []);
  renderSkillSuggestions(overview.skillSuggestions || []);

  const styleButton = document.getElementById("generateStyleBtn");
  const skillButton = document.getElementById("generateSkillSuggestionBtn");

  styleButton.disabled = (overview.finalizedCount || 0) < 5;
  skillButton.disabled = (overview.finalizedCount || 0) < 10;
}

async function generateStyleCandidate() {
  const button = document.getElementById("generateStyleBtn");
  button.disabled = true;
  const old = button.textContent;
  button.textContent = "ANALYZING…";

  try {
    const result = await window.BachSBOBackend.analyzeStyle();
    learningMessage(
      `Style candidate v${result?.candidate?.version || "?"} created. Review it before activation.`
    );
    await renderLearningDashboard();
  } catch (error) {
    learningMessage(error?.message || "Style analysis failed.", true);
  } finally {
    button.textContent = old;
  }
}

async function generateSkillSuggestion() {
  const button = document.getElementById("generateSkillSuggestionBtn");
  button.disabled = true;
  const old = button.textContent;
  button.textContent = "ANALYZING…";

  try {
    await window.BachSBOBackend.analyzeSkill();
    learningMessage(
      "Pending Skill suggestion created. It will not change the active Skill."
    );
    await renderLearningDashboard();
  } catch (error) {
    learningMessage(error?.message || "Skill analysis failed.", true);
  } finally {
    button.textContent = old;
  }
}

async function signOut() {
  try {
    await window.BachSBOBackend.signOut();
    state = defaultState();
    selectedPatientId = null;
    backendReady = false;
    window.location.reload();
  } catch (error) {
    handleBackendError(error);
  }
}

function showSetupRequired() {
  modal(`
    <h3>Backend setup required</h3>
    <p>This branch uses Supabase instead of browser clinical-data storage.</p>
    <p>Configure <code>config.js</code>, apply both Supabase migrations, deploy <code>clinical-store</code>, and set its AI privacy secret.</p>
    <p class="subtle">See docs/BACKEND_SETUP.md and docs/PRIVACY.md.</p>
  `);
}

function showSignIn() {
  const adminEmail = window.BACH_SBO_CONFIG?.adminEmail || "";

  modal(`
    <h3>Admin sign in</h3>
    <p class="subtle">${esc(adminEmail)}</p>
    <div class="field">
      <label>Password</label>
      <input id="authPassword" type="password" autocomplete="current-password"
        minlength="6" placeholder="Admin password" />
    </div>
    <div class="modal-actions">
      <button class="btn primary" id="passwordSignIn">SIGN IN</button>
    </div>
    <div id="authMessage" class="subtle"></div>
  `);

  const password = document.getElementById("authPassword");
  const button = document.getElementById("passwordSignIn");
  const message = document.getElementById("authMessage");

  const submit = async () => {
    if (password.value.length < 6) {
      message.textContent = "Password must contain at least 6 characters.";
      return;
    }

    button.disabled = true;
    message.textContent = "Signing in…";

    try {
      const session =
        await window.BachSBOBackend.signInWithPassword(password.value);
      currentUser = session.user;
      state = await window.BachSBOBackend.loadState();
      backendReady = true;
      password.value = "";
      closeModal();
      renderApp();
    } catch (error) {
      message.textContent = error?.message || "Sign in failed.";
      password.value = "";
      password.focus();
      button.disabled = false;
    }
  };

  button.onclick = submit;
  password.onkeydown = (event) => {
    if (event.key === "Enter") submit();
  };
  password.focus();
}

async function bootstrap() {
  try {
    const result = await window.BachSBOBackend.init();

    if (!result.configured) {
      showSetupRequired();
      return;
    }

    if (!result.session) {
      showSignIn();
      return;
    }

    currentUser = result.session.user;
    state = await window.BachSBOBackend.loadState();
    backendReady = true;
    closeModal();
    renderApp();
  } catch (error) {
    console.error(error);
    modal(`
      <h3>Backend initialization failed</h3>
      <p>${esc(error?.message || "Unknown error")}</p>
      <p class="subtle">Check Supabase configuration and database migration.</p>
    `);
  }
}

function flash(message) {
  const el = document.createElement("div");

  el.textContent = message;
  el.style.cssText =
    "position:fixed;right:20px;bottom:20px;background:#111827;color:#fff;padding:11px 14px;border-radius:9px;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.2)";

  document.body.appendChild(el);

  setTimeout(() => el.remove(), 1800);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function attr(value) {
  return esc(value).replace(/`/g, "&#096;");
}

document.getElementById("patientForm").addEventListener("submit", (event) => {
  event.preventDefault();
});

document.getElementById("langEnBtn").onclick = () => { applyLanguage("en"); renderApp(); };
document.getElementById("langHuBtn").onclick = () => { applyLanguage("hu"); renderApp(); };
document.getElementById("patientsNav").onclick = () => setView("patients");
document.getElementById("aiLearningNav").onclick = () => setView("learning");
document.getElementById("adminNav").onclick = () => setView("admin");
document.getElementById("changeAdminPasswordBtn").onclick = changeAdminPassword;
document.getElementById("adminSignOutBtn").onclick = signOut;
document.getElementById("refreshLearningBtn").onclick = () =>
  renderLearningDashboard().catch(handleBackendError);
document.getElementById("generateStyleBtn").onclick = generateStyleCandidate;
document.getElementById("generateSkillSuggestionBtn").onclick =
  generateSkillSuggestion;

document.getElementById("startShiftBtn").onclick = startShift;
document.getElementById("addPatientBtn").onclick = addPatient;
document.getElementById("savePatientBtn").onclick = savePatient;
document.getElementById("fDisposition").onchange = updateDispositionVisibility;
document.getElementById("addRecBtn").onclick = addRecommendation;
document.getElementById("addLabBtn").onclick = addLab;
document.getElementById("addRadiologyBtn").onclick = addRadiology;
document.getElementById("addConsultBtn").onclick = addConsult;
document.getElementById("generateSummaryBtn").onclick = generateSummary;
document.getElementById("finalizeSummaryBtn").onclick = finalizeSummary;

document.getElementById("fSummary").addEventListener("input", () => {
  const patient = patientById(selectedPatientId);
  if (patient) renderSummaryStatus(patient);
});

applyLanguage(uiLang);
bootstrap();
