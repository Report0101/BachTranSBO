import { createClient } from "npm:@supabase/supabase-js@2";
import { openAiApiKey } from "../_shared/openai.ts";

const allowedOrigin = Deno.env.get("APP_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
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

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function supabaseNamedKey(variableName: string): string {
  const raw = env(variableName);
  let keys: Record<string, string>;

  try {
    keys = JSON.parse(raw);
  } catch {
    throw new Error(`${variableName} is not valid JSON.`);
  }

  const key = keys.default;
  if (!key) throw new Error(`${variableName} has no default key.`);
  return key;
}

async function getUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Missing Authorization header.");

  const authClient = createClient(env("SUPABASE_URL"), supabaseNamedKey("SUPABASE_PUBLISHABLE_KEYS"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) throw new Error("Invalid authenticated session.");

  const ownerUserId = env("APP_OWNER_USER_ID");
  if (data.user.id !== ownerUserId) {
    throw new Error("This personal application is restricted to its owner account.");
  }

  return data.user;
}

function serviceClient() {
  return createClient(
    env("SUPABASE_URL"),
    supabaseNamedKey("SUPABASE_SECRET_KEYS"),
    { auth: { persistSession: false } },
  );
}

function responseText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();

  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function testStatus(row: any) {
  if (row.mode === "notordered") return "not_ordered";

  const result = String(row.result_text || "").trim();
  const saved = String(row.saved_result_text || "").trim();

  if (saved && result === saved) return "result_available";
  return "waiting_for_result";
}

function casePayload(caseRow: any, tests: any[]) {
  const age = caseRow.year_of_birth
    ? new Date().getUTCFullYear() - Number(caseRow.year_of_birth)
    : null;

  return {
    case_id: caseRow.id,
    sex: caseRow.sex,
    age,
    main_complaint: caseRow.main_complaint,
    complaint: caseRow.complaint,
    history: caseRow.history,
    physical_examination: caseRow.physical_exam,
    diagnoses: caseRow.diagnoses || "",
    tests: tests.map((row) => ({
      category: row.category,
      type: row.subtype || null,
      body_part: row.body_part || null,
      modality: row.modality || null,
      other_test: row.other_test || null,
      sequence: row.sequence,
      status: testStatus(row),
      result:
        testStatus(row) === "result_available"
          ? row.saved_result_text
          : null,
    })),
    others: caseRow.others,
    therapy: caseRow.therapy,
    clinical_course: caseRow.clinical_course,
    disposition: caseRow.disposition,
    recommendations: caseRow.recommendations,
    admission: {
      hospital: caseRow.hospital,
      ward: caseRow.ward,
      accepting_physician: caseRow.accepting_physician,
      note: caseRow.admission_note,
    },
    other_outcome: {
      outcome: caseRow.other_outcome,
      details: caseRow.other_details,
    },
  };
}

async function createEmbedding(input: string) {
  const model = Deno.env.get("EMBEDDING_MODEL") || "text-embedding-3-small";
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Embedding generation failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding API returned no vector.");
  }

  return { embedding, model };
}

async function similarCases(
  db: any,
  ownerId: string,
  caseId: string,
  clinicalCase: any,
) {
  try {
    const embedded = await createEmbedding(JSON.stringify(clinicalCase));
    const { data, error } = await db.rpc("match_finalized_cases", {
      p_owner_id: ownerId,
      p_query_embedding: embedded.embedding,
      p_exclude_case_id: caseId,
      p_match_count: 4,
    });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Similar-case retrieval skipped:", error);
    return [];
  }
}

async function callOpenAI(prompt: string) {
  const apiKey = openAiApiKey();
  const model = Deno.env.get("SUMMARY_MODEL") || "gpt-5.6-terra";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OpenAI summary generation failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }

  const payload = await response.json();
  const text = responseText(payload);
  if (!text) throw new Error("OpenAI returned an empty summary.");

  return { text, model };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const user = await getUser(req);
    const body = await req.json();
    const caseId = String(body?.caseId || "");

    if (!caseId) return json({ error: "caseId is required." }, 400);

    const db = serviceClient();

    const { data: caseRow, error: caseError } = await db
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (caseError) throw caseError;
    if (!caseRow) return json({ error: "Case not found." }, 404);

    if (!caseRow.deidentified_at) {
      throw new Error(
        "Case has not passed permanent-storage de-identification yet.",
      );
    }

    const { data: tests, error: testsError } = await db
      .from("test_entries")
      .select("*")
      .eq("case_id", caseId)
      .eq("owner_id", user.id)
      .order("category", { ascending: true })
      .order("sequence", { ascending: true });

    if (testsError) throw testsError;

    const { data: skill, error: skillError } = await db
      .from("skill_versions")
      .select("id, version, name, instructions")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (skillError) throw skillError;
    if (!skill) {
      throw new Error(
        "No active SBO Documentation Skill version is configured.",
      );
    }

    const { data: style, error: styleError } = await db
      .from("style_profiles")
      .select("version, profile_text")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (styleError) throw styleError;

    const clinicalCase = casePayload(caseRow, tests || []);
    const examples = await similarCases(db, user.id, caseId, clinicalCase);

    const exampleBlock = examples.length
      ? examples.map((example: any, index: number) => [
          `--- APPROVED EXAMPLE ${index + 1} ---`,
          `Similarity: ${Number(example.similarity || 0).toFixed(3)}`,
          "Clinical input:",
          JSON.stringify(example.case_snapshot, null, 2),
          "Doctor-finalized documentation:",
          String(example.finalized_text || ""),
        ].join("\n")).join("\n\n")
      : "(No similar finalized examples available yet.)";

    const prompt = [
      "You are generating the final clinical documentation draft for BachTranSBO.",
      "Use ONLY the de-identified clinical facts supplied below.",
      "Never invent a diagnosis, result, treatment, consultation, disposition, or chronology.",
      "If a fact is absent or a result is still waiting, do not fabricate it.",
      "Follow the SBO Documentation Skill instructions exactly.",
      "Return ONLY the documentation text, without commentary, markdown fences, or explanations.",
      "",
      "=== SBO DOCUMENTATION SKILL ===",
      skill.instructions,
      "",
      "=== WRITING STYLE PROFILE ===",
      style?.profile_text || "(No active style profile yet.)",
      "",
      "=== SIMILAR DOCTOR-APPROVED CASES ===",
      "Use these only as style/structure examples. Never copy patient-specific facts from them into the current case.",
      exampleBlock,
      "",
      "=== CURRENT DE-IDENTIFIED CASE ===",
      JSON.stringify(clinicalCase, null, 2),
    ].join("\n");

    const generated = await callOpenAI(prompt);
    const now = new Date().toISOString();

    const { error: summaryError } = await db.from("summaries").upsert(
      {
        case_id: caseId,
        owner_id: user.id,
        generated_text: generated.text,
        working_text: generated.text,
        generated_at: now,
        model: generated.model,
        skill_version: String(skill.version),
        updated_at: now,
      },
      { onConflict: "case_id" },
    );

    if (summaryError) throw summaryError;

    return json({
      summary: generated.text,
      generatedAt: now,
      model: generated.model,
      skillVersion: String(skill.version),
      styleVersion: style ? String(style.version) : null,
      similarCasesUsed: examples.map((x: any) => ({
        caseId: x.case_id,
        revisionId: x.revision_id,
        similarity: x.similarity,
      })),
    });
  } catch (error) {
    console.error(error);
    return json(
      {
        error: error instanceof Error ? error.message : "Summary generation failed.",
      },
      500,
    );
  }
});
