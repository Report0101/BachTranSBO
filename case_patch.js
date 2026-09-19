(() => {
  "use strict";

  const YEAR = new Date().getFullYear();
  const ARRIVAL_OPTIONS = [
    { value: "", en: "— select —", hu: "— válasszon —" },
    { value: "omsz", en: "OMSz transported", hu: "OMSz szállította" },
    { value: "esetkocsi", en: "Emergency unit transported", hu: "Esetkocsi szállította" },
    { value: "walk_in", en: "Arrived walking", hu: "saját lábán érkezett" },
    { value: "gp_referral", en: "With GP referral", hu: "HO beutalóval" },
    { value: "other", en: "Other", hu: "egyéb" }
  ];

  const lang = () => document.documentElement.lang === "hu" ? "hu" : "en";
  const ageFromYob = (yob) => {
    const y = Number(yob);
    return Number.isFinite(y) && y > 0 ? String(YEAR - y) : "";
  };
  const yobFromAge = (age) => {
    const a = Number(String(age || "").trim());
    if (!Number.isInteger(a) || a < 0 || a > 130) return "";
    return String(YEAR - a);
  };

  function client() {
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

  function selectedCaseId() {
    return document.querySelector("tr.selected[data-id]")?.dataset?.id || "";
  }

  function selectedRow() {
    return document.querySelector("tr.selected[data-id]");
  }

  function labels() {
    const hu = lang() === "hu";
    return {
      sex: hu ? "Nem" : "Sex",
      age: hu ? "Életkor" : "Age",
      yob: hu ? "Születési év" : "Year of birth",
      arrival: hu ? "SBO-ra érkezés módja" : "Arrival to SBO",
      arrivalOther: hu ? "Érkezés részletei" : "Arrival details",
      saved: hu ? "Esetadatok mentve." : "Case details saved.",
      error: hu ? "Nem sikerült menteni az esetadatokat." : "Could not save case details."
    };
  }

  function ensureUi() {
    const mainInput = document.getElementById("fMainComplaint");
    if (!mainInput) return null;

    let box = document.getElementById("casePatchDemographics");
    if (!box) {
      const mainField = mainInput.closest(".field");
      if (!mainField) return null;
      box = document.createElement("div");
      box.id = "casePatchDemographics";
      box.className = "case-patch-box";
      box.innerHTML = `
        <div class="inline3">
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
            <label data-case-patch-label="yob">Year of birth</label>
            <input id="fCaseYob" inputmode="numeric" maxlength="4" placeholder="1955" />
          </div>
        </div>
        <div class="field">
          <label data-case-patch-label="arrival">Arrival to SBO</label>
          <select id="fArrivalMode"></select>
        </div>
        <div class="field hidden" id="arrivalOtherField">
          <label data-case-patch-label="arrivalOther">Arrival details</label>
          <input id="fArrivalOther" placeholder="Describe arrival..." />
        </div>
        <div class="subtle" id="casePatchStatus"></div>
      `;
      mainField.after(box);
    }

    updateLabels();
    return box;
  }

  function updateLabels() {
    const l = labels();
    document.querySelectorAll("[data-case-patch-label]").forEach((node) => {
      const key = node.dataset.casePatchLabel;
      if (l[key]) node.textContent = l[key];
    });

    const select = document.getElementById("fArrivalMode");
    if (select) {
      const current = select.value;
      select.innerHTML = ARRIVAL_OPTIONS.map((item) =>
        `<option value="${item.value}">${item[lang()]}</option>`
      ).join("");
      select.value = current;
    }
  }

  async function loadSelectedCase() {
    const id = selectedCaseId();
    const db = client();
    if (!id || !db) return null;

    const { data, error } = await db
      .from("cases")
      .select("id, sex, year_of_birth, main_complaint, arrival_mode, arrival_other")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.warn("Could not load selected case details", error);
      return null;
    }
    return data;
  }

  function fillUi(row) {
    ensureUi();
    if (!row) return;

    const sex = document.getElementById("fCaseSex");
    const age = document.getElementById("fCaseAge");
    const yob = document.getElementById("fCaseYob");
    const arrival = document.getElementById("fArrivalMode");
    const arrivalOther = document.getElementById("fArrivalOther");
    const arrivalOtherField = document.getElementById("arrivalOtherField");

    if (sex) sex.value = row.sex || "";
    if (yob) yob.value = row.year_of_birth ? String(row.year_of_birth) : "";
    if (age) age.value = row.year_of_birth ? ageFromYob(row.year_of_birth) : "";
    if (arrival) arrival.value = row.arrival_mode || "";
    if (arrivalOther) arrivalOther.value = row.arrival_other || "";
    if (arrivalOtherField) {
      arrivalOtherField.classList.toggle("hidden", (row.arrival_mode || "") !== "other");
    }
  }

  function updateVisibleRow(payload) {
    const tr = selectedRow();
    if (!tr) return;
    const cells = tr.querySelectorAll("td");
    if (cells[1] && payload.sex !== undefined) cells[1].textContent = payload.sex || "";
    if (cells[2] && payload.year_of_birth !== undefined) cells[2].textContent = ageFromYob(payload.year_of_birth) || "";
    if (cells[3]) {
      const mc = document.getElementById("fMainComplaint")?.value || cells[3].textContent || "";
      cells[3].textContent = mc;
    }

    const subtitle = document.getElementById("recordSubtitle");
    if (subtitle) {
      const sex = payload.sex || document.getElementById("fCaseSex")?.value || "—";
      const age = ageFromYob(payload.year_of_birth) || document.getElementById("fCaseAge")?.value || "—";
      const complaint = document.getElementById("fMainComplaint")?.value || "";
      subtitle.textContent = `${sex} • ${age} y • ${complaint}`;
    }
  }

  async function saveSelectedCase() {
    const id = selectedCaseId();
    const db = client();
    if (!id || !db) return;

    const ageInput = document.getElementById("fCaseAge")?.value || "";
    const yobInput = document.getElementById("fCaseYob")?.value || "";
    const calculatedYob = yobInput.trim() || yobFromAge(ageInput);
    const arrivalMode = document.getElementById("fArrivalMode")?.value || "";

    const payload = {
      sex: document.getElementById("fCaseSex")?.value || null,
      year_of_birth: calculatedYob ? Number(calculatedYob) : null,
      main_complaint: document.getElementById("fMainComplaint")?.value || "",
      arrival_mode: arrivalMode,
      arrival_other: arrivalMode === "other" ? document.getElementById("fArrivalOther")?.value || "" : "",
      updated_at: new Date().toISOString()
    };

    const status = document.getElementById("casePatchStatus");
    if (status) status.textContent = "Saving…";

    const { error } = await db.from("cases").update(payload).eq("id", id);
    if (error) {
      console.warn("Could not save case details", error);
      if (status) status.textContent = labels().error;
      return;
    }

    updateVisibleRow(payload);
    if (status) status.textContent = labels().saved;
  }

  function wireUi() {
    ensureUi();
    const sex = document.getElementById("fCaseSex");
    const age = document.getElementById("fCaseAge");
    const yob = document.getElementById("fCaseYob");
    const arrival = document.getElementById("fArrivalMode");
    const arrivalOther = document.getElementById("fArrivalOther");
    const arrivalOtherField = document.getElementById("arrivalOtherField");

    const saveSoon = () => {
      clearTimeout(window.__casePatchSaveTimer);
      window.__casePatchSaveTimer = setTimeout(saveSelectedCase, 350);
    };

    [sex, age, yob, arrival, arrivalOther, document.getElementById("fMainComplaint")].forEach((node) => {
      if (!node || node.dataset.casePatchWired === "true") return;
      node.dataset.casePatchWired = "true";
      node.addEventListener("input", () => {
        if (node === age && yob) yob.value = yobFromAge(age.value);
        if (node === yob && age) age.value = ageFromYob(yob.value);
        if (arrivalOtherField && arrival) {
          arrivalOtherField.classList.toggle("hidden", arrival.value !== "other");
        }
        saveSoon();
      });
      node.addEventListener("change", () => {
        if (arrivalOtherField && arrival) {
          arrivalOtherField.classList.toggle("hidden", arrival.value !== "other");
        }
        saveSoon();
      });
    });
  }

  async function refreshPatch() {
    if (!document.getElementById("patientForm") || document.getElementById("patientForm").classList.contains("hidden")) return;
    ensureUi();
    wireUi();
    const row = await loadSelectedCase();
    fillUi(row);
  }

  function install() {
    if (window.__BachSBOCasePatchV2Installed) return;
    window.__BachSBOCasePatchV2Installed = true;

    const observer = new MutationObserver(() => {
      clearTimeout(window.__casePatchRefreshTimer);
      window.__casePatchRefreshTimer = setTimeout(refreshPatch, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    document.addEventListener("click", () => setTimeout(refreshPatch, 50), true);
    document.addEventListener("change", (event) => {
      if (event.target?.id === "langHuBtn" || event.target?.id === "langEnBtn") updateLabels();
    }, true);

    refreshPatch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
