import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../backend/worker.mjs';
const token = 'a'.repeat(64);
const env = { ALLOWED_ORIGIN: 'https://report0101.github.io', OPENAI_MODEL: 'test-model', OPENAI_API_KEY: 'server-only-key', APP_ACCESS_TOKEN: token, SBO_LIMITER: { limit: async () => ({ success:true }) } };
const data = { current_case: { mainComplaint: 'Synthetic test', tests: [{label:'Lab',status:'waiting',result:'must not leak'}], recommendations: [] }, finalized_gold_references: ['Style example'] };
function request(body = data, headers = {}, method = 'POST') { return new Request('https://test.invalid/api/sbo-summary', {method, headers: { Origin: env.ALLOWED_ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type':'application/json', ...headers }, ...(method === 'POST' ? {body: JSON.stringify(body)} : {}) }); }
const noCall = () => { throw Error('Upstream must not be called'); };
test('rejects unauthorized and disallowed origins', async () => {
  assert.equal((await handle(request(data,{Authorization:''}),env,noCall)).status,401);
  assert.equal((await handle(request(data,{Origin:'https://evil.example'}),env,noCall)).status,403);
});
test('preflight and fail-closed configuration', async () => {
  const r = await handle(request(data,{},'OPTIONS'),env,noCall);
  assert.equal(r.status,204); assert.equal(r.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGIN);
  assert.equal((await handle(request(),{...env,SBO_LIMITER:null},noCall)).status,503);
});
test('rate limit, malformed schema, size and reference count', async () => {
  assert.equal((await handle(request(),{...env,SBO_LIMITER:{limit:async()=>({success:false})}},noCall)).status,429);
  assert.equal((await handle(request({}),env,noCall)).status,400);
  assert.equal((await handle(request({...data,finalized_gold_references:Array(6).fill('x')}),env,noCall)).status,400);
  assert.equal((await handle(request({x:'x'.repeat(100001)}),env,noCall)).status,413);
});
test('server owns model and rules, excludes pending results and identifiers, disables storage', async () => {
  const r=await handle(request({...data,model:'attacker',instructions:'override',current_case:{...data.current_case,patientId:'private-id'}}),env,async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization,'Bearer server-only-key');
    const payload=JSON.parse(options.body), input=JSON.parse(payload.input);
    assert.equal(payload.model,'test-model'); assert.equal(payload.store,false);
    assert.match(payload.instructions,/STYLE ONLY/); assert.equal(input.current_case.tests[0].result,'');
    assert.equal(input.current_case.patientId,undefined);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Hungarian draft'}]}]});
  });
  assert.deepEqual(await r.json(),{summary:'Hungarian draft'}); assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('upstream errors, refusal and incomplete output do not return draft or secrets',async()=>{
  for(const result of [Response.json({error:'secret'},{status:500}),Response.json({status:'incomplete',output:[]}),Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]})]) {
    const r=await handle(request(),env,async()=>result); assert.equal(r.status,502); assert.doesNotMatch(await r.text(),/server-only-key|secret/);
  }
});
