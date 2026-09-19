export function normalizeOpenAiApiKey(rawInput: unknown): string {
  const raw = String(rawInput ?? "");
  if (!raw.trim()) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const cleaned = raw
    .normalize("NFKC")
    .trim()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u00A0\s]+/g, "")
    .replace(/^[\`'"“”‘’]+|[\`'"“”‘’]+$/g, "");

  // Recover a key that was pasted together with an env-var label, quotes,
  // or other surrounding text. OpenAI API keys use the sk- prefix.
  const embedded = cleaned.match(/sk-[A-Za-z0-9_-]{20,}/)?.[0];
  const key = embedded || cleaned;

  if (/[^\x21-\x7E]/.test(key)) {
    throw new Error(
      "OPENAI_API_KEY contains invalid hidden or non-ASCII characters. Re-save the key as plain text in Supabase Edge Function secrets.",
    );
  }

  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) {
    throw new Error(
      "OPENAI_API_KEY has an invalid format. Re-save the OpenAI API key in Supabase Edge Function secrets.",
    );
  }

  return key;
}

export function openAiApiKey(): string {
  return normalizeOpenAiApiKey(Deno.env.get("OPENAI_API_KEY"));
}
