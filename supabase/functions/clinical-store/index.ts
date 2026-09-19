import { createClient } from "npm:@supabase/supabase-js@2";
import {
  deidentifyPatient,
  deidentifyState,
  reportTotal,
} from "../_shared/deidentify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Missing Authorization header.");

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) throw new Error("Invalid authenticated session.");
  return data.user;
}

function serviceClient() {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

function flattenTests(patient: any, ownerId: string) {
  const rows: any[] = [];
  const now = new Date().toISOString();

  const add = (entry: any, category: string, sequence: number) => {
    if (!entry?.id) return;
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
      updated_at: now,
    });
  };

  (patient.tests?.labs || []).forEach((x: any, i: number) =>
    add(x, "lab", i + 1)
  );
  add(patient.tests?.ekg, "ekg", 1);
  add(patient.tests?.gas, "gas", 1);
  (patient.tests?.radiology || []).forEach((x: any, i: number) =>
    add(x, "radiology", i + 1)
  );
  (patient.tests?.consultations || []).forEach((x: any, i: number) =>
    add(x, "consultation", i + 1)
  );

  return rows;
}

async function saveState(db: any, ownerId: string, inputState: any) {
  const { state, report } = await deidentifyState(inputState);

  if (!state?.shift?.id) throw new Error("Missing active shift.");

  const { data: shift, error: shiftError } = await db
    .from("shifts")
    .select("id, owner_id, status")
    .eq("id", state.shift.id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (shiftError) throw shiftError;
  if (!shift) throw new Error("Shift does not belong to authenticated user.");

  const patients = (state.patients || []).filter(
    (p: any) => p.shiftId === state.shift.id
  );

  const now = new Date().toISOString();

  if (patients.length) {
    const caseRows = patients.map((p: any) => ({
      id: p.id,
      shift_id: p.shiftId,
      owner_id: ownerId,
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
      updated_at: p.updatedAt || now,
      deidentified_at: now,
      deidentification_version: "v1",
    }));

    const { error: caseError } = await db
      .from("cases")
      .upsert(caseRows, { onConflict: "id" });
    if (caseError) throw caseError;

    const testRows = patients.flatMap((p: any) => flattenTests(p, ownerId));
    if (testRows.length) {
      const { error: testError } = await db
        .from("test_entries")
        .upsert(testRows, { onConflict: "id" });
      if (testError) throw testError;
    }

    const summaryRows = patients
      .filter(
        (p: any) =>
          p.summary ||
          p.summaryGeneratedAt ||
          p.summaryFinalizedAt ||
          p.summaryFinalizedText
      )
      .map((p: any) => ({
        case_id: p.id,
        owner_id: ownerId,
        generated_text: p.summaryGeneratedText || p.summary || "",
        working_text: p.summary || "",
        finalized_text: p.summaryFinalizedText || "",
        generated_at: p.summaryGeneratedAt || null,
        finalized_at: p.summaryFinalizedAt || null,
        updated_at: now,
      }));

    if (summaryRows.length) {
      const { error: summaryError } = await db
        .from("summaries")
        .upsert(summaryRows, { onConflict: "case_id" });
      if (summaryError) throw summaryError;
    }
  }

  return { state, report, removed: reportTotal(report) };
}

async function appendRevision(db: any, ownerId: string, patientInput: any) {
  const { patient, report } = await deidentifyPatient(patientInput);

  if (!patient?.summaryFinalizedAt || !patient?.summaryFinalizedText) {
    throw new Error("Finalized summary is required.");
  }

  const { data: ownedCase, error: caseError } = await db
    .from("cases")
    .select("id")
    .eq("id", patient.id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (caseError) throw caseError;
  if (!ownedCase) throw new Error("Case does not belong to authenticated user.");

  const { data: summaryMeta, error: summaryMetaError } = await db
    .from("summaries")
    .select("model, skill_version")
    .eq("case_id", patient.id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (summaryMetaError) throw summaryMetaError;

  const { error } = await db.from("summary_revisions").insert({
    case_id: patient.id,
    owner_id: ownerId,
    generated_text: patient.summaryGeneratedText || patient.summary || "",
    finalized_text: patient.summaryFinalizedText,
    finalized_at: patient.summaryFinalizedAt,
    model: summaryMeta?.model || null,
    skill_version: summaryMeta?.skill_version || null,
    deidentification_version: "v1",
  });

  if (error) throw error;
  return { patient, report, removed: reportTotal(report) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const user = await authenticatedUser(req);
    const db = serviceClient();
    const body = await req.json();

    if (body?.action === "save_state") {
      return json(await saveState(db, user.id, body.state));
    }

    if (body?.action === "append_revision") {
      return json(await appendRevision(db, user.id, body.patient));
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error(error);
    return json(
      {
        error: error instanceof Error ? error.message : "Clinical store failed.",
      },
      500,
    );
  }
});
