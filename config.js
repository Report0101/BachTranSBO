// Public browser configuration for BachTranSBO.
// The publishable key and admin email are intentionally browser-visible.
// Never place a Supabase secret key, OpenAI API key, or password in this file.
window.BACH_SBO_CONFIG = {
  supabaseUrl: "https://nfpmngtxebnxueqivxox.supabase.co",
  supabasePublishableKey: "sb_publishable_BxapQvR8UmF6WvcNU7cpdw_YByawY5r",
  adminEmail: "bachtran95@gmail.com"
};

// Native-visible case detail controls. This extension is deliberately small and
// defensive because it runs beside the main app while app.js is still private-scoped.
(() => {
  "use strict";

  const YEAR = new Date().getFullYear();
  const SAVE_DELAY_MS = 900;
  let lastLoadedCaseId = "";
  let lastSaveFailedAt = 0;

  const OPTIONS = [
    ["", "— select —", "— válasszon —"],
    ["omsz", "OMSz transported", "OMSz szállította"],
    ["esetkocsi", "Emergency unit transported", "Esetkocsi szállította"],
    ["walk_in", "Arrived walking", "saját lábán érkezett"],
    ["gp_referral", "With GP referral", "HO beutalóval"],
    ["other", "Other", "egyéb"]
  ];

  const SEX_VALUES = ["Female", "Male", "Other"];
  const SEX_COLORS = {
    Female: { background: "#fce7f3", border: "#f9a8d4", color: "#9d174d" },
    Male: { background: "#e0f2fe", border: "#7dd3fc", color: "#075985" },
    Other: { background: "linear-gradient(90deg,#fee2e2,#fef3c7,#dcfce7,#dbeafe,#f3e8ff)", border: "#c4b5fd", color: "#312e81" }
  };

  const lang = () => document.documentElement.lang === "hu" ? "hu" : "en";
  const label = (en, hu) => lang() === "hu" ? hu : en;

  function ageFromYob(yob) {
    const y = Number(yob);
    if (!Number.isInteger(y) || y < 1900 || y > YEAR) return "";
    return String(YEAR - y);
  }

  function localIdNumber(value) {
    const match = String(value || "").match(/\d+/);
    const n = match ? Number(match[0]) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeSex(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (["f", "female", "woman", "nő", "no", "nőbeteg", "w"].includes(raw)) return "Female";
    if (["m", "male", "man", "férfi", "ferfi", "férfibeteg"].includes(raw)) return "Male";
    if (["o", "other", "egyéb", "egyeb", "x", "nonbinary", "non-binary"].includes(raw)) return "Other";
    return "";
  }

  function sexLabel(value) {
    const normalized = normalizeSex(value);
    if (normalized === "Female") return label("Female", "Nő");
    if (normalized === "Male") return label("Male", "Férfi");
    if (normalized === "Other") return label("Other", "Egyéb");
    return "";
  }

  function sexStyle(value) {
    return SEX_COLORS[normalizeSex(value)] || null;
  }

  function sexBadge(value) {
    const normalized = normalizeSex(value);
    if (!normalized) return "";
    const c = sexStyle(normalized);
    const text = sexLabel(normalized);
    return `<span data-sex-badge="${normalized}" style="display:inline-flex;align-items:center;gap:4px;border:1px solid ${c.border};background:${c.background};color:${c.color};border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700;line-height:1.4;white-space:nowrap">${text}</span>`;
  }

  function sexOptionsHtml(current) {
    const normalized = normalizeSex(current);
    return [""].concat(SEX_VALUES).map((value) => {
      const selected = value === normalized ? " selected" : "";
      const text = value ? sexLabel(value) : "—";
      return `<option value="${value}"${selected}>${text}</option>`;
    }).join("");
  }

  function paintSexSelect(select) {
    if (!select) return;
    const normalized = normalizeSex(select.value);
    if (select.dataset.sexEnhanced !== "true") {
      select.dataset.sexEnhanced = "true";
      select.innerHTML = sexOptionsHtml(normalized);
      select.addEventListener("change", () => paintSexSelect(select));
    } else {
      select.innerHTML = sexOptionsHtml(normalized);
      select.value = normalized;
    }
    const c = sexStyle(normalized);
    select.style.borderColor = c?.border || "";
    select.style.background = c?.background || "";
    select.style.color = c?.color || "";
    select.style.fontWeight = normalized ? "700" : "";
  }

  function visibleTableLocalIds(excludeCaseId = "") {
    const ids = [];
    document.querySelectorAll("tr[data-id]").forEach((row) => {
      if (excludeCaseId && row.dataset.id === excludeCaseId) return;
      const n = localIdNumber(row.querySelector("td")?.textContent || "");
      if (n > 0) ids.push(n);
    });
    return ids;
  }

  function nextVisibleLocalId(excludeCaseId = "") {
    const nums = visibleTableLocalIds(excludeCaseId);
    const next = Math.max(0, ...nums) + 1;
    return String(next).padStart(2, "0");
  }

  function updateNextLocalIdHint() {
    const input = document.getElementById("newId");
    if (!input) return;
    const next = nextVisibleLocalId("");
    if (next !== "01") input.value = next;
  }

  function repairPatientLocalId(patient) {
    if (!patient) return patient;
    const current = String(patient.localId || "").padStart(2, "0");
    const otherIds = visibleTableLocalIds(patient.id).map((n) => String(n).padStart(2, "0"));
    if (!current || otherIds.includes(current)) {
      patient.localId = nextVisibleLocalId(patient.id);
      patient.updatedAt = new Date().toISOString();
      const row = selectedRow();
      const idCell = row?.querySelector("td");
      if (idCell) idCell.textContent = patient.localId;
      const title = document.getElementById("recordTitle");
      if (title) title.textContent = `${label("Case", "Eset")} ${patient.localId}`;
      setStatus(
        `Duplicate case ID repaired to ${patient.localId}.`,
        `Ismétlődő esetazonosító javítva: ${patient.localId}.`,
        false
      );
    } else {
      patient.localId = current;
    }
    return patient;
  }

  function enhanceSexUi() {
    [document.getElementById("iceSex"), document.getElementById("newSex")].forEach((select) => {
      if (!select) return;
      const current = normalizeSex(select.value);
      select.innerHTML = sexOptionsHtml(current);
      select.value = current;
      select.dataset.sexEnhanced = "true";
      paintSexSelect(select);
    });

    document.querySelectorAll("tr[data-id] td:nth-child(2)").forEach((cell) => {
      const text = cell.textContent || "";
      const normalized = normalizeSex(text);
      if (normalized) cell.innerHTML = sexBadge(normalized);
    });

    updateNextLocalIdHint();
  }

  function setStatus(en, hu, isError = false) {
    const st = document.getElementById("iceStatus");
    if (!st) return;
    st.textContent = label(en, hu);
    st.style.color = isError ? "#b91c1c" : "";
  }

  function selectedId() {
    return document.querySelector("tr.selected[data-id]")?.dataset?.id || "";
  }

  function selectedRow() {
    return document.querySelector("tr.selected[data-id]");
  }

  function selectedCaseLabel() {
    return selectedRow()?.querySelector("td")?.textContent?.trim() || "selected";
  }

  function isEditingCaseDetails() {
    const active = document.activeElement;
    return Boolean(active && (active.closest?.("#inlineCaseEditor") || active.id === "fMainComplaint"));
  }

  function backendReady() {
    return Boolean(window.BachSBOBackend?.getSession);
  }

  function db() {
    if (!window.supabase?.createClient) return null;
    if (!window.__BachSBOInlineCaseClient) {
      const c = window.BACH_SBO_CONFIG || {};
      window.__BachSBOInlineCaseClient = window.supabase.createClient(
        c.supabaseUrl,
        c.supabasePublishableKey,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
      );
    }
    return window.__BachSBOInlineCaseClient;
  }

  async function syncedClient() {
    const client = db();
    if (!client) throw new Error("Supabase client is not available.");

    // Use the same authenticated session as the main app. This avoids RLS/session
    // drift between this lightweight editor and backend.js.
    if (backendReady()) {
      const session = await window.BachSBOBackend.getSession();
      if (session?.access_token && session?.refresh_token) {
        await client.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
      }
    }
    return client;
  }

  function ensureUi() {
    const form = document.getElementById("patientForm");
    const main = document.getElementById("fMainComplaint");
    if (!form || form.classList.contains("hidden") || !main) return false;

    let host = document.getElementById("inlineCaseEditor");
    if (!host) {
      host = document.createElement("div");
      host.id = "inlineCaseEditor";
      host.style.margin = "10px 0 14px";
      host.innerHTML = `
        <div class="inline3">
          <div class="field">
            <label data-ice-label="sex">Sex</label>
            <select id="iceSex">${sexOptionsHtml("")}</select>
          </div>
          <div class="field">
            <label data-ice-label="yob">Year of birth</label>
            <input id="iceYob" inputmode="numeric" maxlength="4" placeholder="1955" autocomplete="off" />
          </div>
          <div class="field">
            <label data-ice-label="age">Age</label>
            <input id="iceAge" placeholder="auto" readonly aria-readonly="true" style="background:#f8fafc;color:#64748b" />
          </div>
        </div>
        <div class="field">
          <label data-ice-label="arrival">Arrival to SBO</label>
          <select id="iceArrival"></select>
        </div>
        <div class="field hidden" id="iceArrivalOtherWrap">
          <label data-ice-label="arrivalOther">Arrival details</label>
          <input id="iceArrivalOther" placeholder="Describe arrival..." autocomplete="off" />
        </div>
        <div class="toolbar" style="justify-content:space-between;margin-top:8px">
          <div class="subtle" id="iceStatus"></div>
          <button class="btn small" id="iceDeleteCase" type="button" style="border-color:#fecaca;color:#b91c1c;background:#fff5f5">DELETE CASE</button>
        </div>
      `;
      main.closest(".field")?.after(host);
    }

    updateLabels();
    wireUi();
    enhanceSexUi();
    return true;
  }

  function updateLabels() {
    const labels = {
      sex: label("Sex", "Nem"),
      age: label("Age", "Életkor"),
      yob: label("Year of birth", "Születési év"),
      arrival: label("Arrival to SBO", "SBO-ra érkezés módja"),
      arrivalOther: label("Arrival details", "Érkezés részletei")
    };
    document.querySelectorAll("[data-ice-label]").forEach((el) => {
      el.textContent = labels[el.dataset.iceLabel] || el.textContent;
    });

    const sel = document.getElementById("iceArrival");
    if (sel) {
      const current = sel.value;
      sel.innerHTML = OPTIONS.map(([value, en, hu]) =>
        `<option value="${value}">${label(en, hu)}</option>`
      ).join("");
      sel.value = current;
    }

    const del = document.getElementById("iceDeleteCase");
    if (del) del.textContent = label("DELETE CASE", "ESET TÖRLÉSE");
  }

  async function loadSelected({ force = false } = {}) {
    if (!ensureUi()) return;
    const id = selectedId();
    if (!id) return;

    if (!force) {
      if (id === lastLoadedCaseId && isEditingCaseDetails()) return;
      if (Date.now() - lastSaveFailedAt < 3000) return;
    }

    try {
      const client = await syncedClient();
      const { data, error } = await client
        .from("cases")
        .select("id, sex, year_of_birth, main_complaint, arrival_mode, arrival_other")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data || selectedId() !== id) return;

      const sex = normalizeSex(data.sex);
      document.getElementById("iceSex").value = sex;
      paintSexSelect(document.getElementById("iceSex"));
      document.getElementById("iceYob").value = data.year_of_birth ? String(data.year_of_birth) : "";
      document.getElementById("iceAge").value = ageFromYob(data.year_of_birth);
      document.getElementById("iceArrival").value = data.arrival_mode || "";
      document.getElementById("iceArrivalOther").value = data.arrival_other || "";
      document.getElementById("iceArrivalOtherWrap")?.classList.toggle("hidden", (data.arrival_mode || "") !== "other");
      lastLoadedCaseId = id;
      enhanceSexUi();
    } catch (error) {
      console.warn("Inline case load failed", error);
    }
  }

  function rowUpdate(payload) {
    const row = selectedRow();
    if (!row) return;

    const tds = row.querySelectorAll("td");
    const hasYob = Object.prototype.hasOwnProperty.call(payload, "year_of_birth");
    const displayAge = hasYob ? ageFromYob(payload.year_of_birth) : (document.getElementById("iceAge")?.value || "");
    const sex = normalizeSex(payload.sex);

    if (tds[1]) tds[1].innerHTML = sexBadge(sex) || "";
    if (tds[2] && hasYob) tds[2].textContent = displayAge || "";
    if (tds[3]) tds[3].textContent = document.getElementById("fMainComplaint")?.value || tds[3].textContent || "";

    const subtitle = document.getElementById("recordSubtitle");
    if (subtitle) {
      subtitle.textContent = `${sexLabel(sex) || "—"} • ${displayAge || "—"} y • ${document.getElementById("fMainComplaint")?.value || ""}`;
    }
  }

  function buildPayload() {
    const arrival = document.getElementById("iceArrival")?.value || "";
    const yobText = String(document.getElementById("iceYob")?.value || "").trim();
    const yobNum = Number(yobText);
    const validYob = Number.isInteger(yobNum) && yobNum >= 1900 && yobNum <= YEAR;
    const partialYob = Boolean(yobText) && !validYob;

    document.getElementById("iceAge").value = validYob ? ageFromYob(yobNum) : "";

    const payload = {
      sex: normalizeSex(document.getElementById("iceSex")?.value) || null,
      main_complaint: document.getElementById("fMainComplaint")?.value || "",
      arrival_mode: arrival,
      arrival_other: arrival === "other" ? document.getElementById("iceArrivalOther")?.value || "" : "",
      updated_at: new Date().toISOString()
    };

    if (!yobText || validYob) payload.year_of_birth = validYob ? yobNum : null;
    return { payload, partialYob };
  }

  function mergeInlineDetailsIntoPatient(patient) {
    if (!patient || patient.id !== selectedId()) return patient;
    if (!ensureUi()) return patient;

    repairPatientLocalId(patient);

    const { payload, partialYob } = buildPayload();
    if (partialYob) {
      setStatus(
        "Enter a 4-digit birth year before saving or generating.",
        "Mentés vagy generálás előtt adjon meg 4 jegyű születési évet.",
        true
      );
      return patient;
    }

    patient.sex = payload.sex || "";
    if (Object.prototype.hasOwnProperty.call(payload, "year_of_birth")) {
      patient.yob = payload.year_of_birth ? String(payload.year_of_birth) : "";
    }
    patient.mainComplaint = payload.main_complaint || "";
    patient.arrivalMode = payload.arrival_mode || "";
    patient.arrivalOther = payload.arrival_other || "";
    patient.updatedAt = new Date().toISOString();
    rowUpdate(payload);
    return patient;
  }

  function installBackendPayloadBridge() {
    const backend = window.BachSBOBackend;
    if (!backend || backend.__inlineCaseDetailsBridge === true) return false;

    const originalSavePatient = backend.savePatient;
    if (typeof originalSavePatient === "function") {
      backend.savePatient = function patchedSavePatient(shiftId, patient) {
        mergeInlineDetailsIntoPatient(patient);
        return originalSavePatient.call(this, shiftId, patient);
      };
    }

    const originalFinalizePatient = backend.finalizePatient;
    if (typeof originalFinalizePatient === "function") {
      backend.finalizePatient = function patchedFinalizePatient(shiftId, patient) {
        mergeInlineDetailsIntoPatient(patient);
        return originalFinalizePatient.call(this, shiftId, patient);
      };
    }

    const originalSaveState = backend.saveState;
    if (typeof originalSaveState === "function") {
      backend.saveState = function patchedSaveState(state) {
        const id = selectedId();
        const patients = Array.isArray(state?.patients) ? state.patients : [];
        const patient = patients.find((item) => item?.id === id);
        mergeInlineDetailsIntoPatient(patient);
        return originalSaveState.call(this, state);
      };
    }

    Object.defineProperty(backend, "__inlineCaseDetailsBridge", {
      value: true,
      configurable: true
    });
    return true;
  }

  async function saveSelected() {
    const id = selectedId();
    if (!id) return;

    const { payload, partialYob } = buildPayload();
    if (partialYob) {
      setStatus(
        "Enter a 4-digit birth year between 1900 and current year.",
        "Adjon meg 4 jegyű születési évet 1900 és az aktuális év között.",
        false
      );
      rowUpdate(payload);
      return;
    }

    try {
      setStatus("Saving case details…", "Esetadatok mentése…");
      const client = await syncedClient();
      const { error } = await client.from("cases").update(payload).eq("id", id);
      if (error) throw error;
      rowUpdate(payload);
      lastLoadedCaseId = id;
      setStatus("Case details saved.", "Esetadatok mentve.");
    } catch (error) {
      lastSaveFailedAt = Date.now();
      const detail = error?.message ? ` (${error.message})` : "";
      setStatus(
        `Could not save case details${detail}.`,
        `Nem sikerült menteni az esetadatokat${detail}.`,
        true
      );
      console.warn("Inline case save failed", error);
    }
  }

  async function deleteSelectedCase() {
    const id = selectedId();
    if (!id) return;

    const name = selectedCaseLabel();
    const firstConfirm = confirm(label(
      `Delete case ${name}? This will permanently remove the case, tests, summary and finalized revisions.`,
      `Törli a(z) ${name} esetet? Ez véglegesen törli az esetet, vizsgálatokat, összefoglalót és véglegesített verziókat.`
    ));
    if (!firstConfirm) return;

    const secondConfirm = confirm(label(
      "This cannot be undone. Continue?",
      "Ez nem vonható vissza. Folytatja?"
    ));
    if (!secondConfirm) return;

    const btn = document.getElementById("iceDeleteCase");
    if (btn) btn.disabled = true;

    try {
      setStatus("Deleting case…", "Eset törlése…");
      const client = await syncedClient();
      const { error } = await client.from("cases").delete().eq("id", id);
      if (error) throw error;
      window.location.reload();
    } catch (error) {
      if (btn) btn.disabled = false;
      const detail = error?.message ? ` (${error.message})` : "";
      setStatus(`Could not delete case${detail}.`, `Nem sikerült törölni az esetet${detail}.`, true);
      console.warn("Inline case delete failed", error);
    }
  }

  function scheduleSave(delay = SAVE_DELAY_MS) {
    clearTimeout(window.__iceTimer);
    window.__iceTimer = setTimeout(saveSelected, delay);
  }

  function wireUi() {
    const ids = ["iceSex", "iceYob", "iceArrival", "iceArrivalOther", "fMainComplaint"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.iceWired === "true") return;
      el.dataset.iceWired = "true";

      const handler = () => {
        const yob = document.getElementById("iceYob");
        const age = document.getElementById("iceAge");
        const arrival = document.getElementById("iceArrival");
        if (id === "iceYob" && age && yob) age.value = ageFromYob(yob.value);
        if (id === "iceSex") paintSexSelect(el);
        document.getElementById("iceArrivalOtherWrap")?.classList.toggle("hidden", (arrival?.value || "") !== "other");
        scheduleSave(id === "iceYob" || id === "fMainComplaint" ? SAVE_DELAY_MS : 100);
      };

      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
      el.addEventListener("blur", () => scheduleSave(50));
    });

    const del = document.getElementById("iceDeleteCase");
    if (del && del.dataset.iceWired !== "true") {
      del.dataset.iceWired = "true";
      del.addEventListener("click", deleteSelectedCase);
    }
  }

  function install() {
    if (window.__inlineCaseEditorInstalled) return;
    window.__inlineCaseEditorInstalled = true;

    // Hungarian is the default working language for this app.
    setTimeout(() => window.applyLanguage?.("hu"), 250);
    setTimeout(() => window.applyLanguage?.("hu"), 900);

    new MutationObserver(() => {
      clearTimeout(window.__iceRefresh);
      window.__iceRefresh = setTimeout(() => { ensureUi(); loadSelected(); installBackendPayloadBridge(); enhanceSexUi(); }, 120);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    document.addEventListener("click", () => setTimeout(() => { loadSelected({ force: true }); enhanceSexUi(); }, 100), true);
    document.addEventListener("change", (event) => {
      if (event.target?.id === "newSex") paintSexSelect(event.target);
    }, true);
    setInterval(() => { ensureUi(); installBackendPayloadBridge(); enhanceSexUi(); }, 1200);
    setTimeout(() => { loadSelected({ force: true }); installBackendPayloadBridge(); enhanceSexUi(); }, 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();