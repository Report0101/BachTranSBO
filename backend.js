(() => {
  "use strict";

  let client = null;

  function config() {
    return window.BACH_SBO_CONFIG || {};
  }

  function isConfigured() {
    const c = config();
    return Boolean(
      c.supabaseUrl &&
      c.supabasePublishableKey &&
      !c.supabaseUrl.includes("YOUR_PROJECT") &&
      !c.supabasePublishableKey.includes("YOUR_PUBLISHABLE_KEY")
    );
  }

  function requireClient() {
    if (!client) throw new Error("Supabase backend is not initialized.");
    return client;
  }

  function assertOk(error, context) {
    if (error) {
      const err = new Error(`${context}: ${error.message || "Unknown Supabase error"}`);
      err.cause = error;
      throw err;
    }
  }

  async function init() {
    if (!isConfigured()) {
      return { configured: false, session: null };
    }

    if (!window.supabase?.createClient) {
      throw new Error("Supabase JavaScript client failed to load.");
    }

    const c = config();
    client = window.supabase.createClient(
      c.supabaseUrl,
      c.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    const { data, error } = await client.auth.getSession();
    assertOk(error, "Get auth session");

    return { configured: true, session: data.session };
  }

  async function getSession() {
    const { data, error } = await requireClient().auth.getSession();
    assertOk(error, "Get auth session");
    return data.session;
  }

  async function getUser() {
    const { data, error } = await requireClient().auth.getUser();
    assertOk(error, "Get authenticated user");
    if (!data.user) throw new Error("Not authenticated.");
    return data.user;
  }

  async function signInWithOtp(email) {
    const redirectTo =
      config().authRedirectTo ||
      window.location.origin + window.location.pathname;

    const { error } = await requireClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });

    assertOk(error, "Send sign-in link");
  }

  async function signOut() {
    const { error } = await requireClient().auth.signOut();
    assertOk(error, "Sign out");
  }

  function blankEntry(type = "") {
    return {
      id: crypto.randomUUID(),
      type,
      mode: "waiting",
      text: "",
      savedText: ""
    };
  }

  function rowToEntry(row, defaultType = "") {
    if (!row) return blankEntry(defaultType);
    return {
      id: row.id,
      type: row.subtype || defaultType,
      mode: row.mode || "waiting",
      text: row.result_text || "",
      savedText: row.saved_result_text || ""
    };
  }

  async function getActiveShift() {
    const db = requireClient();
    const { data, error } = await db
      .from("shifts")
      .select("id, started_at, status")
      .eq("status", "active")
      .maybeSingle();

    assertOk(error, "Load active shift");
    return data;
  }

  async function startShift() {
    const db = requireClient();
    const user = await getUser();

    const existing = await getActiveShift();
    if (existing) {
      return {
        id: existing.id,
        startedAt: existing.started_at,
        status: existing.status
      };
    }

    const row = {
      id: crypto.randomUUID(),
      owner_id: user.id,
      started_at: new Date().toISOString(),
      status: "active"
    };

    const { data, error } = await db
      .from("shifts")
      .insert(row)
      .select("id, started_at, status")
      .single();

    if (error) {
      // A partial unique index permits only one ACTIVE shift per owner.
      // If another device won the race, recover the existing shift.
      const active = await getActiveShift();
      if (active) {
        return {
          id: active.id,
          startedAt: active.started_at,
          status: active.status
        };
      }
      assertOk(error, "Start shift");
    }

    return {
      id: data.id,
      startedAt: data.started_at,
      status: data.status
    };
  }

  async function closeShift(shiftId) {
    const { error } = await requireClient()
      .from("shifts")
      .update({
        status: "closed",
        ended_at: new Date().toISOString()
      })
      .eq("id", shiftId);

    assertOk(error, "Close shift");
  }

  async function loadState() {
    const db = requireClient();
    await getUser();

    const shiftRow = await getActiveShift();
    if (!shiftRow) {
      return { shift: null, patients: [], references: [] };
    }

    const { data: caseRows, error: caseError } = await db
      .from("cases")
      .select("*")
      .eq("shift_id", shiftRow.id)
      .order("created_at", { ascending: true });

    assertOk(caseError, "Load cases");

    const caseIds = (caseRows || []).map((x) => x.id);
    let testRows = [];
    let summaryRows = [];

    if (caseIds.length) {
      const testsResult = await db
        .from("test_entries")
        .select("*")
        .in("case_id", caseIds)
        .order("sequence", { ascending: true });

      assertOk(testsResult.error, "Load test entries");
      testRows = testsResult.data || [];

      const summariesResult = await db
        .from("summaries")
        .select("*")
        .in("case_id", caseIds);

      assertOk(summariesResult.error, "Load summaries");
      summaryRows = summariesResult.data || [];
    }

    const testsByCase = new Map();
    for (const row of testRows) {
      if (!testsByCase.has(row.case_id)) testsByCase.set(row.case_id, []);
      testsByCase.get(row.case_id).push(row);
    }

    const summariesByCase = new Map(
      summaryRows.map((row) => [row.case_id, row])
    );

    const patients = (caseRows || []).map((row) => {
      const rows = testsByCase.get(row.id) || [];
      const byCategory = (category) =>
        rows.filter((x) => x.category === category)
          .sort((a, b) => a.sequence - b.sequence);

      const labs = byCategory("lab").map((x) => rowToEntry(x));
      const radiology = byCategory("radiology").map((x) => rowToEntry(x));
      const consultations = byCategory("consultation").map((x) => rowToEntry(x));
      const ekg = byCategory("ekg")[0];
      const gas = byCategory("gas")[0];
      const summary = summariesByCase.get(row.id);

      return {
        id: row.id,
        shiftId: row.shift_id,
        localId: row.local_id,
        sex: row.sex || "",
        yob: row.year_of_birth ? String(row.year_of_birth) : "",
        mainComplaint: row.main_complaint || "",
        complaint: row.complaint || "",
        history: row.history || "",
        physical: row.physical_exam || "",
        tests: {
          labs: labs.length ? labs : [blankEntry()],
          ekg: rowToEntry(ekg),
          gas: rowToEntry(gas),
          radiology: radiology.length ? radiology : [blankEntry("")],
          consultations: consultations.length ? consultations : [blankEntry("")]
        },
        others: row.others || "",
        therapy: row.therapy || "",
        course: row.clinical_course || "",
        disposition: row.disposition || "",
        recommendations: Array.isArray(row.recommendations)
          ? row.recommendations
          : [""],
        hospital: row.hospital || "",
        ward: row.ward || "",
        physician: row.accepting_physician || "",
        admissionNote: row.admission_note || "",
        otherOutcome: row.other_outcome || "",
        otherDetails: row.other_details || "",
        summary: summary?.generated_text || summary?.working_text || "",
        summaryGeneratedAt: summary?.generated_at || null,
        summaryFinalizedText: summary?.finalized_text || "",
        summaryFinalizedAt: summary?.finalized_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    return {
      shift: {
        id: shiftRow.id,
        startedAt: shiftRow.started_at,
        status: shiftRow.status
      },
      patients,
      references: []
    };
  }

  function flattenTests(patient, ownerId) {
    const rows = [];

    function add(entry, category, sequence) {
      if (!entry.id) entry.id = crypto.randomUUID();
      rows.push({
        id: entry.id,
        case_id: patient.id,
        owner_id: ownerId,
        category,
        sequence,
        subtype: entry.type || "",
        mode: entry.mode || "waiting",
        result_text: entry.text || "",
        saved_result_text: entry.savedText || "",
        updated_at: new Date().toISOString()
      });
    }

    (patient.tests?.labs || []).forEach((x, i) => add(x, "lab", i + 1));
    add(patient.tests?.ekg || blankEntry(), "ekg", 1);
    add(patient.tests?.gas || blankEntry(), "gas", 1);
    (patient.tests?.radiology || []).forEach((x, i) =>
      add(x, "radiology", i + 1)
    );
    (patient.tests?.consultations || []).forEach((x, i) =>
      add(x, "consultation", i + 1)
    );

    return rows;
  }

  async function saveState(state) {
    if (!state?.shift) return;

    const db = requireClient();
    const user = await getUser();
    const now = new Date().toISOString();

    const { error: shiftError } = await db.from("shifts").upsert({
      id: state.shift.id,
      owner_id: user.id,
      started_at: state.shift.startedAt,
      status: state.shift.status || "active"
    });
    assertOk(shiftError, "Save shift");

    const patients = (state.patients || []).filter(
      (p) => p.shiftId === state.shift.id
    );

    if (!patients.length) return;

    const caseRows = patients.map((p) => ({
      id: p.id,
      shift_id: p.shiftId,
      owner_id: user.id,
      local_id: p.localId,
      sex: p.sex || null,
      year_of_birth: p.yob ? Number(p.yob) : null,
      main_complaint: p.mainComplaint || "",
      complaint: p.complaint || "",
      history: p.history || "",
      physical_exam: p.physical || "",
      others: p.others || "",
      therapy: p.therapy || "",
      clinical_course: p.course || "",
      disposition: p.disposition || "",
      recommendations: p.recommendations || [""],
      hospital: p.hospital || "",
      ward: p.ward || "",
      accepting_physician: p.physician || "",
      admission_note: p.admissionNote || "",
      other_outcome: p.otherOutcome || "",
      other_details: p.otherDetails || "",
      status: p.summaryFinalizedAt ? "completed" : "active",
      completed_at: p.summaryFinalizedAt || null,
      created_at: p.createdAt || now,
      updated_at: p.updatedAt || now
    }));

    const { error: caseError } = await db
      .from("cases")
      .upsert(caseRows, { onConflict: "id" });
    assertOk(caseError, "Save cases");

    const testRows = patients.flatMap((p) => flattenTests(p, user.id));
    if (testRows.length) {
      const { error: testError } = await db
        .from("test_entries")
        .upsert(testRows, { onConflict: "id" });
      assertOk(testError, "Save test entries");
    }

    const summaryRows = patients
      .filter(
        (p) =>
          p.summary ||
          p.summaryGeneratedAt ||
          p.summaryFinalizedAt ||
          p.summaryFinalizedText
      )
      .map((p) => ({
        case_id: p.id,
        owner_id: user.id,
        generated_text: p.summary || "",
        working_text: p.summary || "",
        finalized_text: p.summaryFinalizedText || "",
        generated_at: p.summaryGeneratedAt || null,
        finalized_at: p.summaryFinalizedAt || null,
        updated_at: now
      }));

    if (summaryRows.length) {
      const { error: summaryError } = await db
        .from("summaries")
        .upsert(summaryRows, { onConflict: "case_id" });
      assertOk(summaryError, "Save summaries");
    }
  }

  async function appendSummaryRevision(patient) {
    if (!patient?.summaryFinalizedAt || !patient.summaryFinalizedText) return;

    const db = requireClient();
    const user = await getUser();

    const { error } = await db.from("summary_revisions").insert({
      case_id: patient.id,
      owner_id: user.id,
      generated_text: patient.summary || "",
      finalized_text: patient.summaryFinalizedText,
      finalized_at: patient.summaryFinalizedAt
    });

    assertOk(error, "Save finalized summary revision");
  }

  window.BachSBOBackend = {
    init,
    isConfigured,
    getSession,
    getUser,
    signInWithOtp,
    signOut,
    startShift,
    closeShift,
    loadState,
    saveState,
    appendSummaryRevision
  };
})();
