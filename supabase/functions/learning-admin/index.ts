import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("APP_ORIGIN") || "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
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

async function overview(db: any, ownerId: string) {
  const [
    revisionsResult,
    skillResult,
    profilesResult,
    suggestionsResult,
  ] = await Promise.all([
    db.from("summary_revisions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId),

    db.from("skill_versions")
      .select("id, version, name, is_active, created_at")
      .eq("owner_id", ownerId)
      .eq("is_active", true)
      .maybeSingle(),

    db.from("style_profiles")
      .select(
        "id, version, profile_text, is_active, source_revision_count, model, generated_at, created_at",
      )
      .eq("owner_id", ownerId)
      .order("version", { ascending: false })
      .limit(10),

    db.from("skill_suggestions")
      .select(
        "id, base_skill_version, source_revision_count, suggestion_text, status, model, generated_at, reviewed_at",
      )
      .eq("owner_id", ownerId)
      .order("generated_at", { ascending: false })
      .limit(10),
  ]);

  for (const result of [
    revisionsResult,
    skillResult,
    profilesResult,
    suggestionsResult,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    finalizedCount: revisionsResult.count || 0,
    activeSkill: skillResult.data || null,
    styleProfiles: profilesResult.data || [],
    skillSuggestions: suggestionsResult.data || [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const user = await getUser(req);
    const db = serviceClient();
    const body = await req.json();
    const action = String(body?.action || "overview");

    if (action === "overview") {
      return json(await overview(db, user.id));
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error(error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Learning admin failed.",
      },
      500,
    );
  }
});
