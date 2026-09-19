(() => {
  "use strict";

  const ARRIVAL_OPTIONS = [
    { value: "", en: "— select —", hu: "— válasszon —" },
    { value: "omsz", en: "OMSz transported", hu: "OMSz szállította" },
    { value: "esetkocsi", en: "Emergency unit transported", hu: "Esetkocsi szállította" },
    { value: "walk_in", en: "Arrived walking", hu: "Saját lábán érkezett" },
    { value: "gp_referral", en: "With GP referral", hu: "HO beutalóval" },
    { value: "other", en: "Other", hu: "Egyéb" }
  ];

  const arrivalLabel = (value) => {
    const option = ARRIVAL_OPTIONS.find((item) => item.value === value);
    return option ? option[uiLang === "hu" ? "hu" : "en"] : "";
  };

  function casePatchClient() {
    if (!window.supabase?.createClient) return null;
    const config = window.BACH_SBO_CONFIG || {};
    if (!config.supabaseUrl || !config.supabasePublishableKey) return null;
    if (!window.__BachSBOCasePatchClient) {
      window.__BachSBOCasePatchClient = window.supabase.createClient(
        config.supabaseUrl,
        config.supabasePublishableKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }
    return window.__BachSBOCasePatchClient;
  }

  async function hydrateArrivalFields(appState) {
    const client = casePatchClient();
    const cases = appState?.patients || [];
    if (!client || !cases.length) return appState;

    const ids = cases.map((item) => item.id).filter(Boolean);
    if (!ids.length) return appState;

    const { data, error } = await client
      .from("cases")
      .select("id, arrival_mode, arrival_other")
      .in("id", ids);

    if (error || !Array.isArray(data)) {
      console.warn("Could not load case arrival fields", error);
      return appState;
    }

    const byId = new Map(data.map((row) => [row.id, row]));
    cases.forEach((item) => {
      const row = byId.get(item.id);
      if (!row) return;
      item.arrivalMode = row.arrival_mode || "";
      item.arrivalOther = row.arrival_other || "";
    });

    return appState;
  }

  async function saveArrivalFields(patient) {
    const client = casePatchClient();
    if (!client || !patient?.id) return;

    const { error } = await client
      .from("cases")
      .update({
        arrival_mode: patient.arrivalMode || "",
        arrival_other: patient.arrivalMode === "other" ? patient.arrivalOther || "" : ""
      })
      .eq("id", patient.id);

    if (error) {
      console.warn("Could not save case arrival fields", error);
    }
  }

  function ensureCaseHeaderFields() {
    const mainInput = document.getElementById("fMainComplaint");
    if (!mainInput || document.getElementById("fCaseSex")) return;

    const mainField = mainInput.closest(".field");
    if (!mainField) return;

    const wrapper = document.createElement("div");
    wrapper.className = "inline3 case-demographics";
    wrapper.innerHTML = `
      <div class="field">
        <label data-case-patch-label="sex">Sex</label>
        <select id="fCaseSex">
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </div>
      <div class="field">
        <label data-case-patch-label="age">Age</label>
        <input id="fCaseAge" inputmode="numeric" maxlength="3" placeholder="72" />
      </div>
      <div class="field">
        <label data-case-patch-label="arrival">Arrival to SBO</label>
        <select id="fArrivalMode"></select>
      </div>
    `;

    const other = document.createElement("div");
    other.className = "field hidden";
    other.id = "arrivalOtherField";
    other.innerHTML = `
      <label data-case-patch-label="arrivalOther">Arrival details</label>
      <input id="fArrivalOther" placeholder="Describe arrival..." />
    `;

    mainField.after(wrapper, other);
    updateCasePatchLabels();
  }

  function updateCasePatchLabels() {
    const hu = uiLang === "hu";
    const labels = {
      sex: hu ? "Nem" : "Sex",
      age: hu ? "Életkor" : "Age",
      arrival: hu ? "SBO-ra érkezés módja" : "Arrival to SBO",
      arrivalOther: hu ? "Érkezés részletei" : "Arrival details"
    };

    document.querySelectorAll("[data-case-patch-label]").forEach((node) => {
      const key = node.dataset.casePatchLabel;
      if (labels[key]) node.textContent = labels[key];
    });

    const select = document.getElementById("fArrivalMode");
    if (select) {
      const current = select.value;
      select.innerHTML = ARRIVAL_OPTIONS.map((item) => {
        const text = item[hu ? "hu" : "en"];
        return `<option value="${item.value}">${text}</option>`;
      }).join("");
      select.value = current;
    }
  }

  function readCasePatchFields(patient) {
    if (!patient) return patient;

    const sex = document.getElementById("fCaseSex")?.value || patient.sex || "";
    const ageText = String(document.getElementById("fCaseAge")?.value || "").trim();
    const age = Number(ageText);
    const arrivalMode = document.getElementById("fArrivalMode")?.value || "";
    const arrivalOther = document.getElementById("fArrivalOther")?.value || "";

    patient.sex = sex;
    if (Number.isInteger(age) && age >= 0 && age <= 130) {
      patient.yob = String(new Date().getFullYear() - age);
    }
    patient.arrivalMode = arrivalMode;
    patient.arrivalOther = arrivalMode === "other" ? arrivalOther : "";

    return patient;
  }

  function writeCasePatchFields(patient) {
    ensureCaseHeaderFields();
    if (!patient) return;

    const sex = document.getElementById("fCaseSex");
    const age = document.getElementById("fCaseAge");
    const arrivalMode = document.getElementById("fArrivalMode");
    const arrivalOther = document.getElementById("fArrivalOther");
    const arrivalOtherField = document.getElementById("arrivalOtherField");

    if (sex) sex.value = patient.sex || "";
    if (age) age.value = ageFromYob(patient.yob) || "";
    if (arrivalMode) arrivalMode.value = patient.arrivalMode || "";
    if (arrivalOther) arrivalOther.value = patient.arrivalOther || "";
    if (arrivalOtherField) arrivalOtherField.classList.toggle("hidden", (patient.arrivalMode || "") !== "other");

    const update = () => {
      readCasePatchFields(patient);
      if (arrivalOtherField) arrivalOtherField.classList.toggle("hidden", (patient.arrivalMode || "") !== "other");
      const subtitle = document.getElementById("recordSubtitle");
      if (subtitle) {
        subtitle.textContent = `${patient.sex || "—"} • ${ageFromYob(patient.yob) || "—"} y • ${patient.mainComplaint || ""}`;
      }
      updateStatusCell(patient);
      persist();
    };

    [sex, age, arrivalMode, arrivalOther].forEach((node) => {
      if (!node) return;
      node.oninput = update;
      node.onchange = update;
    });
  }

  function installCasePatch() {
    if (window.__BachSBOCasePatchInstalled) return;
    window.__BachSBOCasePatchInstalled = true;

    if (window.BachSBOBackend?.loadState) {
      const originalLoadState = window.BachSBOBackend.loadState;
      window.BachSBOBackend.loadState = async (...args) => {
        const loaded = await originalLoadState(...args);
        return hydrateArrivalFields(loaded);
      };
    }

    if (window.BachSBOBackend?.savePatient) {
      const originalSavePatient = window.BachSBOBackend.savePatient;
      window.BachSBOBackend.savePatient = async (shiftId, patient) => {
        readCasePatchFields(patient);
        const result = await originalSavePatient(shiftId, patient);
        await saveArrivalFields(patient);
        if (result?.patient) {
          result.patient.arrivalMode = patient.arrivalMode || "";
          result.patient.arrivalOther = patient.arrivalOther || "";
        }
        return result;
      };
    }

    if (typeof collectForm === "function") {
      const originalCollectForm = collectForm;
      collectForm = function patchedCollectForm(...args) {
        const patient = originalCollectForm(...args);
        return readCasePatchFields(patient);
      };
    }

    if (typeof persistNow === "function") {
      const originalPersistNow = persistNow;
      persistNow = async function patchedPersistNow(...args) {
        if (currentView === "patients" && selectedPatientId && typeof collectForm === "function") {
          collectForm();
        }
        return originalPersistNow(...args);
      };
    }

    if (typeof loadPatientForm === "function") {
      const originalLoadPatientForm = loadPatientForm;
      loadPatientForm = function patchedLoadPatientForm(...args) {
        originalLoadPatientForm(...args);
        const patient = patientById(selectedPatientId);
        writeCasePatchFields(patient);
        if (typeof renderCaseEditState === "function" && patient) renderCaseEditState(patient);
      };
    }

    if (typeof applyLanguage === "function") {
      const originalApplyLanguage = applyLanguage;
      applyLanguage = function patchedApplyLanguage(lang) {
        originalApplyLanguage(lang);
        updateCasePatchLabels();
      };
    }

    document.addEventListener("click", (event) => {
      const row = event.target.closest?.("tr[data-id]");
      if (!row || !selectedPatientId || row.dataset.id === selectedPatientId) return;
      if (typeof collectForm === "function") collectForm();
    }, true);

    document.addEventListener("input", (event) => {
      if (!["fMainComplaint", "fComplaint", "fHistory", "fPhysical", "fTherapy", "fCourse"].includes(event.target?.id)) return;
      const patient = patientById(selectedPatientId);
      if (!patient || typeof collectForm !== "function") return;
      collectForm();
    }, true);

    if (typeof renderApp === "function") renderApp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCasePatch, { once: true });
  } else {
    installCasePatch();
  }
})();
