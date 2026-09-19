import { createClient } from "npm:@supabase/supabase-js@2";

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

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

async function getUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Missing Authorization header.");

  const authClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) throw new Error("Invalid authenticated session.");
  return data.user;
}

function serviceClient() {
  return createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
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

function clampText(value: unknown, max = 4500) {
  const text = String(value ?? "").trim();
  return text.length <= max ? text : text.slice(0, max) + "…";
}

async function generateStyleProfile(revisions: any[]) {
  const model = Deno.env.get("STYLE_MODEL") || "gpt-5.6-luna";

  const examples = revisions.map((r, index) => [
    `PAIR ${index + 1}`,
    "AI draft:",
    clampText(r.generated_text),
    "Doctor-finalized version:",
    clampText(r.finalized_text),
  ].join("\n")).join("\n\n");

  const prompt = [
    "Analyze the doctor's EDITING AND WRITING STYLE from the de-identified draft/final pairs below.",
    "Create a compact abstract style profile for future Hungarian emergency-department clinical documentation.",
    "Extract only reusable stylistic preferences: structure, chronology, sentence length, terminology, abbreviations, concision, recurring transformations, preferred/avoided phrasing, formatting.",
    "DO NOT include, quote, memorize, or summarize patient-specific facts, diagnoses, medications, lab values, ages, institutions, dates, names, or unique case details.",
    "DO NOT propose changes to the master clinical Skill or clinical rules.",
    "Do not judge clinical decisions.",
    "Return only the style profile as concise reusable instructions.",
    "",
    examples,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env("OPENAI_API_KEY")}`,
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
      `Style analysis failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }

  const payload = await response.json();
  const profile = responseText(payload);
  if (!profile) throw new Error("Style analysis returned an empty profile.");

  return { profile, model };
}

async function analyze(db: any, ownerId: string) {
  const { data: revisions, error } = await db
    .from("summary_revisions")
    .select("id, generated_text, finalized_text, finalized_at")
    .eq("owner_id", ownerId)
    .order("finalized_at", { ascending: false })
    .limit(30);

  if (error) throw error;

  const usable = (revisions || []).filter(
    (r: any) => String(r.finalized_text || "").trim().length > 0,
  );

  if (usable.length < 5) {
    throw new Error(
      "At least 5 finalized summaries are required to generate a style profile candidate.",
    );
  }

  const generated = await generateStyleProfile(usable);

  const { data: latest, error: latestError } = await db
    .from("style_profiles")
    .select("version")
    .eq("owner_id", ownerId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  const nextVersion = Number(latest?.version || 0) + 1;
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await db
    .from("style_profiles")
    .insert({
      owner_id: ownerId,
      version: nextVersion,
      profile_text: generated.profile,
      is_active: false,
      source_revision_count: usable.length,
      model: generated.model,
      generated_at: now,
    })
    .select("id, version, profile_text, is_active, source_revision_count, model, generated_at")
    .single();

  if (insertError) throw insertError;

  return {
    candidate: inserted,
    requiresApproval: true,
  };
}

async function activate(db: any, ownerId: string, profileId: string) {
  if (!profileId) throw new Error("profileId is required.");

  const { data: owned, error: ownedError } = await db
    .from("style_profiles")
    .select("id, version")
    .eq("id", profileId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (ownedError) throw ownedError;
  if (!owned) throw new Error("Style profile not found.");

  const { error: deactivateError } = await db
    .from("style_profiles")
    .update({ is_active: false })
    .eq("owner_id", ownerId);

  if (deactivateError) throw deactivateError;

  const { data: activated, error: activateError } = await db
    .from("style_profiles")
    .update({ is_active: true })
    .eq("id", profileId)
    .eq("owner_id", ownerId)
    .select("id, version, profile_text, is_active, source_revision_count, model, generated_at")
    .single();

  if (activateError) throw activateError;
  return { activeProfile: activated };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const user = await getUser(req);
    const db = serviceClient();
    const body = await req.json();
    const action = String(body?.action || "analyze");

    if (action === "analyze") {
      return json(await analyze(db, user.id));
    }

    if (action === "activate") {
      return json(await activate(db, user.id, String(body?.profileId || "")));
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error(error);
    return json(
      {
        error: error instanceof Error ? error.message : "Style learning failed.",
      },
      500,
    );
  }
});
