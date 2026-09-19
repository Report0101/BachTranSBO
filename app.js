let state = defaultState();
let selectedPatientId = null;
let backendReady = false;
let currentUser = null;
let persistTimer = null;

function defaultState() {
  return { shift: null, patients: [], references: [] };
}

function persist() {
  if (!backendReady || !state.shift) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistNow().catch(handleBackendError);
  }, 350);
}

async function persistNow() {
  if (!backendReady || !state.shift) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  await window.BachSBOBackend.saveState(state);
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

function ageFromYob(yob) {
  const year = parseInt(yob, 10);
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
      out.push(entry.type?.trim() || `Radiology ${i + 1}`);
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

  if (!state.shift) {
    meta.innerHTML = '<span class="metric">No active shift</span>';
    actions.innerHTML = '<button class="btn" id="signOutBtn">SIGN OUT</button>';
    document.getElementById("signOutBtn").onclick = signOut;
    return;
  }

  const pts = activeShiftPatients();
  const completed = pts.filter(isCompleted).length;
  const active = pts.length - completed;

  meta.innerHTML = `
    <span class="shift-pill"><span class="dot"></span> SHIFT ACTIVE • Started ${fmtTime(state.shift.startedAt)}</span>
    <span class="metric">Patients <b>${pts.length}</b></span>
    <span class="metric">Active <b>${active}</b></span>
    <span class="metric">Completed <b>${completed}</b></span>
  `;

  actions.innerHTML =
    '<button class="btn danger" id="endShiftBtn">END SHIFT</button>' +
    '<button class="btn" id="signOutBtn">SIGN OUT</button>';
  document.getElementById("endShiftBtn").onclick = endShiftStep1;
  document.getElementById("signOutBtn").onclick = signOut;
}

function renderApp() {
  renderHeader();

  document.getElementById("noShiftView").classList.toggle("hidden", Boolean(state.shift));
  document.getElementById("patientsView").classList.toggle("hidden", !state.shift);

  if (state.shift) renderPatients();
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

function addPatient() {
  if (!state.shift) return;

  const sex = document.getElementById("newSex").value;
  const yob = document.getElementById("newYob").value.trim();
  const mainComplaint = document.getElementById("newComplaint").value.trim();

  if (!sex || !yob || !mainComplaint) {
    alert("Please enter Sex, Year of birth and Main complaint.");
    return;
  }

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
      radiology: [newEntry("")],
      consultations: [newEntry("")]
    },
    others: "",
    therapy: "",
    course: "",
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
  renderDynamicCards(
    "radiologyCards",
    patient.tests.radiology,
    "Radiology",
    "radiology",
    "Type e.g. CT, CXR, Ultrasound"
  );
  renderDynamicCards(
    "consultCards",
    patient.tests.consultations,
    "Consultation",
    "consultations",
    "Type e.g. Cardiology, Neurology"
  );
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

  card.className =
    `test-card ${status === "result" ? "result" : status === "notordered" ? "notordered" : ""}`;
  card.dataset.card = key;

  card.innerHTML = `
    <div class="test-head">
      <div class="test-name-wrap">
        <span class="test-name">${label}</span>
        ${isGas ? `<span class="gas-type">${label}</span>` : ""}
      </div>
      ${statusBadge(status)}
    </div>

    <div class="test-grid">
      <select data-mode="${key}">
        <option value="waiting" ${entry.mode !== "notordered" ? "selected" : ""}>Waiting for result</option>
        <option value="notordered" ${entry.mode === "notordered" ? "selected" : ""}>Not ordered</option>
      </select>

      <textarea data-text="${key}" ${entry.mode === "notordered" ? "disabled" : ""} placeholder="${label} result...">${esc(entry.text || "")}</textarea>

      <button type="button" class="btn small primary test-save" data-save="${key}"
        ${!entry.text.trim() || entry.mode === "notordered" || status === "result" ? "disabled" : ""}>
        SAVE RESULT
      </button>
    </div>
  `;

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
        ${statusBadge(status)}
      </div>

      <div class="dynamic-grid">
        <input data-type="${key}" value="${attr(entry.type || "")}" placeholder="${placeholder}" />

        <select data-mode="${key}">
          <option value="waiting" ${entry.mode !== "notordered" ? "selected" : ""}>Waiting for result</option>
          <option value="notordered" ${entry.mode === "notordered" ? "selected" : ""}>Not ordered</option>
        </select>

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

    wireCard(card, entry, key);
  });
}

function wireCard(card, entry, key) {
  const mode = card.querySelector(`[data-mode="${key}"]`);
  const text = card.querySelector(`[data-text="${key}"]`);
  const save = card.querySelector(`[data-save="${key}"]`);

  function refreshVisual() {
    const status = entryStatus(entry);

    card.className =
      `test-card ${status === "result" ? "result" : status === "notordered" ? "notordered" : ""}`;

    card.querySelector(".test-status").outerHTML = statusBadge(status);
    text.disabled = entry.mode === "notordered";
    save.disabled =
      !entry.text.trim() || entry.mode === "notordered" || status === "result";

    updateStatusCell(patientById(selectedPatientId));
  }

  mode.onchange = () => {
    entry.mode = mode.value;
    persist();
    refreshVisual();
  };

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

  patient.tests.radiology.push(newEntry(""));
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

function buildMockSummary(patient) {
  const out = [
    `${patient.sex}, ${ageFromYob(patient.yob)} years, ${patient.mainComplaint}.`
  ];

  if (patient.complaint) out.push(patient.complaint.trim());
  if (patient.history) out.push(`History: ${patient.history.trim()}`);
  if (patient.physical) out.push(`Status: ${patient.physical.trim()}`);

  patient.tests.labs.forEach((entry, i) => {
    const status = entryStatus(entry);

    if (status === "result") {
      out.push(`Lab ${i + 1}: ${entry.savedText.trim()}`);
    } else if (status === "waiting") {
      out.push(`Lab ${i + 1}: waiting for result.`);
    }
  });

  [
    ["EKG", patient.tests.ekg],
    [/\bVVG\b/i.test(patient.tests.gas.text || "") ? "VVG" : "AVG", patient.tests.gas]
  ].forEach(([label, entry]) => {
    const status = entryStatus(entry);

    if (status === "result") {
      out.push(`${label}: ${entry.savedText.trim()}`);
    } else if (status === "waiting") {
      out.push(`${label}: waiting for result.`);
    }
  });

  patient.tests.radiology.forEach((entry, i) => {
    const label = entry.type?.trim() || `Radiology ${i + 1}`;
    const status = entryStatus(entry);

    if (status === "result") {
      out.push(`${label}: ${entry.savedText.trim()}`);
    } else if (status === "waiting") {
      out.push(`${label}: waiting for result.`);
    }
  });

  patient.tests.consultations.forEach((entry, i) => {
    const label = entry.type?.trim() || `Consultation ${i + 1}`;
    const status = entryStatus(entry);

    if (status === "result") {
      out.push(`${label}: ${entry.savedText.trim()}`);
    } else if (status === "waiting") {
      out.push(`${label}: waiting for result.`);
    }
  });

  if (patient.therapy) out.push(`Therapy: ${patient.therapy.trim()}`);
  if (patient.course) out.push(`Course: ${patient.course.trim()}`);

  if (patient.disposition === "discharged") {
    out.push("Final decision: discharged.");

    const recs = (patient.recommendations || []).filter(Boolean);
    if (recs.length) out.push("Plan: " + recs.join("; "));
  } else if (patient.disposition === "admitted") {
    let line = "Final decision: admitted/submitted";

    if (patient.ward) line += ` to ${patient.ward}`;
    if (patient.hospital) line += ` at ${patient.hospital}`;
    if (patient.physician) line += ` under ${patient.physician}`;

    out.push(line + ".");

    if (patient.admissionNote) out.push(patient.admissionNote.trim());
  } else if (patient.disposition === "other") {
    out.push(`Final decision: ${patient.otherOutcome || "other"}.`);

    if (patient.otherDetails) out.push(patient.otherDetails.trim());
  }

  return out.join("\n");
}

function generateSummary() {
  const patient = collectForm();
  if (!patient) return;

  patient.summary = buildMockSummary(patient);
  patient.summaryGeneratedText = patient.summary;
  patient.summaryGeneratedAt = nowIso();

  persist();

  document.getElementById("fSummary").value = patient.summary;
  renderSummaryStatus(patient);
  flash("Summary generated (mock backend skill).");
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
    await window.BachSBOBackend.appendSummaryRevision(patient);
  } catch (error) {
    handleBackendError(error);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
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
    <p>Configure <code>config.js</code> and run <code>supabase/migrations/001_backend_v1.sql</code>.</p>
    <p class="subtle">See docs/BACKEND_SETUP.md.</p>
  `);
}

function showSignIn() {
  modal(`
    <h3>Sign in</h3>
    <p>Enter the email for your personal BachTranSBO account.</p>
    <div class="field">
      <label>Email</label>
      <input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" />
    </div>
    <div class="modal-actions">
      <button class="btn primary" id="sendLoginLink">SEND SIGN-IN LINK</button>
    </div>
    <div id="authMessage" class="subtle"></div>
  `);

  const email = document.getElementById("authEmail");
  const button = document.getElementById("sendLoginLink");
  const message = document.getElementById("authMessage");

  button.onclick = async () => {
    if (!email.value.trim()) return;
    button.disabled = true;
    message.textContent = "Sending…";
    try {
      await window.BachSBOBackend.signInWithOtp(email.value.trim());
      message.textContent = "Sign-in link sent. Open it in this browser.";
    } catch (error) {
      message.textContent = error?.message || "Could not send sign-in link.";
      button.disabled = false;
    }
  };
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

bootstrap();
