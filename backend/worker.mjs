import { MASTER_RULES } from './master-rules.mjs';
const MAX_BYTES = 100000;
const fields = ['sex','age','mainComplaint','complaint','history','physical','diagnoses','others','therapy','course','disposition','hospital','ward','physician','admissionNote','otherOutcome','otherDetails'];
function invalid(message = 'Invalid request.') { throw Object.assign(new Error(message), { status: 400 }); }
function string(value, max = 12000) {
  if (typeof value !== 'string' || value.length > max) invalid();
  return value;
}
export function validate(data) {
  if (!data || typeof data !== 'object' || !data.current_case || typeof data.current_case !== 'object') invalid();
  const source = data.current_case, current_case = {};
  for (const key of fields) current_case[key] = string(source[key] ?? '');
  if (!current_case.mainComplaint.trim()) invalid('Main complaint is required.');
  if (!Array.isArray(source.tests) || source.tests.length > 200) invalid();
  current_case.tests = source.tests.map(t => {
    if (!t || !['result','waiting','notordered'].includes(t.status)) invalid();
    return { label: string(t.label, 200), status: t.status, result: t.status === 'result' ? string(t.result) : '' };
  });
  if (!Array.isArray(source.recommendations) || source.recommendations.length > 100) invalid();
  current_case.recommendations = source.recommendations.map(x => string(x, 2000));
  const refs = data.finalized_gold_references ?? [];
  if (!Array.isArray(refs) || refs.length > 5) invalid('At most five finalized references are allowed.');
  return { current_case, finalized_gold_references: refs.map(x => string(x, 16000)) };
}
async function readBounded(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw Object.assign(new Error('Request too large.'), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) invalid();
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES) { await reader.cancel(); throw Object.assign(new Error('Request too large.'), { status: 413 }); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { invalid('Invalid JSON.'); }
}
async function sameToken(a, b) {
  const digest = async x => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)));
  const [x,y] = await Promise.all([digest(a),digest(b)]); let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export async function handle(request, env, upstream = fetch) {
  const origin = request.headers.get('origin');
  const allowed = Boolean(origin && origin === env.ALLOWED_ORIGIN && origin !== 'null');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
  if (allowed) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' });
  const reply = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers });
  if (!allowed) return reply(403, { error: 'Origin not allowed.' });
  if (new URL(request.url).pathname !== '/api/sbo-summary') return reply(404, { error: 'Not found.' });
  if (request.method === 'OPTIONS') return reply(204, null);
  if (request.method !== 'POST') return reply(405, { error: 'POST required.' });
  if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL || !env.APP_ACCESS_TOKEN || env.APP_ACCESS_TOKEN.length < 32 || !env.SBO_LIMITER) return reply(503, { error: 'Backend configuration incomplete.' });
  try {
    const auth = request.headers.get('authorization') || '';
    if (auth.length > 512 || !await sameToken(auth, `Bearer ${env.APP_ACCESS_TOKEN}`)) return reply(401, { error: 'Invalid app access token.' });
    if (!(await env.SBO_LIMITER.limit({ key: 'sbo-authorized' })).success) return reply(429, { error: 'Too many requests. Wait one minute.' });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return reply(415, { error: 'JSON required.' });
    const input = validate(await readBounded(request));
    const response = await upstream('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ model: env.OPENAI_MODEL, store: false, instructions: MASTER_RULES, input: JSON.stringify(input), max_output_tokens: 6000 })
    });
    if (!response.ok) return reply(response.status === 429 ? 429 : 502, { error: 'AI provider unavailable. Retry later or check backend configuration.' });
    const result = await response.json();
    const parts = (result.output || []).filter(x => x.type === 'message').flatMap(x => x.content || []);
    if (result.status !== 'completed' || parts.some(x => x.type === 'refusal')) return reply(502, { error: 'AI did not return a complete summary. Existing text was preserved.' });
    const summary = parts.filter(x => x.type === 'output_text').map(x => x.text).join('\n').trim();
    if (!summary) return reply(502, { error: 'AI returned no summary.' });
    return reply(200, { summary });
  } catch (error) {
    return reply(error.status || (['TimeoutError','AbortError'].includes(error.name) ? 504 : 502), { error: error.status ? error.message : 'Generation failed. Existing text was preserved.' });
  }
}
export default { fetch: (request, env) => handle(request, env) };
