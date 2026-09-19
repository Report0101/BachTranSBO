import { normalizeOpenAiApiKey } from "./openai.ts";

Deno.test("accepts a normal OpenAI key", () => {
  const key = "sk-proj-abcdefghijklmnopqrstuvwxyz_1234567890";
  if (normalizeOpenAiApiKey(key) !== key) throw new Error("Key changed");
});

Deno.test("recovers a key pasted with env label and smart quotes", () => {
  const expected = "sk-proj-abcdefghijklmnopqrstuvwxyz_1234567890";
  const raw = `OPENAI_API_KEY=“${expected}”`;
  if (normalizeOpenAiApiKey(raw) !== expected) {
    throw new Error("Failed to recover embedded key");
  }
});

Deno.test("removes zero-width characters surrounding the key", () => {
  const expected = "sk-proj-abcdefghijklmnopqrstuvwxyz_1234567890";
  const raw = `\uFEFF${expected}\u200B`;
  if (normalizeOpenAiApiKey(raw) !== expected) {
    throw new Error("Failed to strip hidden characters");
  }
});

Deno.test("rejects malformed keys", () => {
  let failed = false;
  try {
    normalizeOpenAiApiKey("not-an-api-key");
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("Malformed key should be rejected");
});
