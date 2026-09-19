// Public browser configuration for BachTranSBO.
// The publishable key and admin email are intentionally browser-visible.
// Never place a Supabase secret key, OpenAI API key, or password in this file.
window.BACH_SBO_CONFIG = {
  supabaseUrl: "https://nfpmngtxebnxueqivxox.supabase.co",
  supabasePublishableKey: "sb_publishable_BxapQvR8UmF6WvcNU7cpdw_YByawY5r",
  adminEmail: "bachtran95@gmail.com"
};

// Native-visible case detail controls. This is deliberately kept inside
// config.js because that file is guaranteed to load in production before the
// main app bootstraps. It does not require access to app.js private state.
(() => {
  "use strict";

  const YEAR = new Date().getFullYear();
  const OPTIONS = [
    ["", "— select —", "— válasszon —"],
    ["omsz", "OMSz transported", "OMSz szállította"],
    ["esetkocsi", "Emergency unit transported", "Esetkocsi szállította"],
    ["walk_in", "Arrived walking", "saját lábán érkezett"],
    ["gp_referral", "With GP referral", "HO beutalóval"],
    ["other", "Other", "egyéb"]
  ];

  const lang = () => document.documentElement.lang === "hu" ? "hu" : "en";
  const label = (en, hu) => lang() === "hu" ? hu : en;
  const ageFromYob = (yob) => {
    const y = Number(yob);
    return Number.isFinite(y) && y > 0 ? String(YEAR - y) : "";
  };
  const yobFromAge = (age) => {
    const a = Number(String(age || "").trim());
    return Number.isInteger(a) && a >= 0 && a <= 130 ? String(YEAR - a) : "";
  };

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

  function selectedId() {
    return document.querySelector("tr.selected[data-id]")?.dataset?.id || "";
  }

  function selectedRow() {
    return document.querySelector("tr.selected[data-id]");
  }

  function selectedCaseLabel() {
    const row = selectedRow();
    return row?.querySelector("td")?.textContent?.trim() || "selected";
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
            <select id="iceSex"><option value="">—</option><option value="M">M</option><option value="F">F</option></select>
          </div>
          <div class="field">
            <label data-ice-label="age">Age</label>
            <input id="iceAge" inputmode="numeric" maxlength="3" placeholder="72" />
          </div>
          <div class="field">
            <label data-ice-label="yob">Year of birth</label>
            <input id="iceYob" inputmode="numeric" maxlength="4" placeholder="1955" />
          </div>
        </div>
        <div class="field">
          <label data-ice-label="arrival">Arrival to SBO</label>
          <select id="iceArrival"></select>
        </div>
        <div class="field hidden" id="iceArrivalOtherWrap">
          <label data-ice-label="arrivalOther">Arrival details</label>
          <input id="iceArrivalOther" placeholder="Describe arrival..." />
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

  async function loadSelected() {
    if (!ensureUi()) return;
    const id = selectedId();
    const client = db();
    if (!id || !client) return;

    const { data, error } = await client
      .from("cases")
      .select("id, sex, year_of_birth, main_complaint, arrival_mode, arrival_other")
      .eq("id", id)
      .maybeSingle();
    if (error || !data || selectedId() !== id) return;

    document.getElementById("iceSex").value = data.sex || "";
    document.getElementById("iceYob").value = data.year_of_birth ? String(data.year_of_birth) : "";
    document.getElementById("iceAge").value = ageFromYob(data.year_of_birth);
    document.getElementById("iceArrival").value = data.arrival_mode || "";
    document.getElementById("iceArrivalOther").value = data.arrival_other || "";
    document.getElementById("iceArrivalOtherWrap")?.classList.toggle("hidden", (data.arrival_mode || "") !== "other");
  }

  function rowUpdate(payload) {
    const row = selectedRow();
    if (!row) return;
    const tds = row.querySelectorAll("td");
    if (tds[1]) tds[1].textContent = payload.sex || "";
    if (tds[2]) tds[2].textContent = ageFromYob(payload.year_of_birth) || "";
    if (tds[3]) tds[3].textContent = document.getElementById("fMainComplaint")?.value || tds[3].textContent || "";
    const subtitle = document.getElementById("recordSubtitle");
    if (subtitle) {
      subtitle.textContent = `${payload.sex || "—"} • ${ageFromYob(payload.year_of_birth) || "—"} y • ${document.getElementById("fMainComplaint")?.value || ""}`;
    }
  }

  async function saveSelected() {
    const id = selectedId();
    const client = db();
    if (!id || !client) return;

    const arrival = document.getElementById("iceArrival")?.value || "";
    const yob = String(document.getElementById("iceYob")?.value || "").trim()
      || yobFromAge(document.getElementById("iceAge")?.value);
    const payload = {
      sex: document.getElementById("iceSex")?.value || null,
      year_of_birth: yob ? Number(yob) : null,
      main_complaint: document.getElementById("fMainComplaint")?.value || "",
      arrival_mode: arrival,
      arrival_other: arrival === "other" ? document.getElementById("iceArrivalOther")?.value || "" : "",
      updated_at: new Date().toISOString()
    };

    const st = document.getElementById("iceStatus");
    if (st) st.textContent = label("Saving case details…", "Esetadatok mentése…");
    const { error } = await client.from("cases").update(payload).eq("id", id);
    if (error) {
      if (st) st.textContent = label("Could not save case details.", "Nem sikerült menteni az esetadatokat.");
      console.warn(error);
      return;
    }
    rowUpdate(payload);
    if (st) st.textContent = label("Case details saved.", "Esetadatok mentve.");
  }

  async function deleteSelectedCase() {
    const id = selectedId();
    const client = db();
    if (!id || !client) return;

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

    const st = document.getElementById("iceStatus");
    const btn = document.getElementById("iceDeleteCase");
    if (btn) btn.disabled = true;
    if (st) st.textContent = label("Deleting case…", "Eset törlése…");

    const { error } = await client.from("cases").delete().eq("id", id);
    if (error) {
      console.warn(error);
      if (btn) btn.disabled = false;
      if (st) st.textContent = label("Could not delete case.", "Nem sikerült törölni az esetet.");
      return;
    }

    window.location.reload();
  }

  function wireUi() {
    const ids = ["iceSex", "iceAge", "iceYob", "iceArrival", "iceArrivalOther", "fMainComplaint"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.iceWired === "true") return;
      el.dataset.iceWired = "true";
      const handler = () => {
        const age = document.getElementById("iceAge");
        const yob = document.getElementById("iceYob");
        const arrival = document.getElementById("iceArrival");
        if (id === "iceAge" && yob) yob.value = yobFromAge(el.value);
        if (id === "iceYob" && age) age.value = ageFromYob(el.value);
        document.getElementById("iceArrivalOtherWrap")?.classList.toggle("hidden", (arrival?.value || "") !== "other");
        clearTimeout(window.__iceTimer);
        window.__iceTimer = setTimeout(saveSelected, 300);
      };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
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
    new MutationObserver(() => {
      clearTimeout(window.__iceRefresh);
      window.__iceRefresh = setTimeout(() => { ensureUi(); loadSelected(); }, 80);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("click", () => setTimeout(loadSelected, 80), true);
    setInterval(ensureUi, 1000);
    setTimeout(loadSelected, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
