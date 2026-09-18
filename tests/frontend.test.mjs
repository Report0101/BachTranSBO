import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function app() {
 const elements=new Map();
 const document={ getElementById(id) { if(!elements.has(id)) elements.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,classList:{toggle(){},add(){},remove(){}},addEventListener(){}});return elements.get(id); },querySelector(){return null;} };
 const context=vm.createContext({document,localStorage:{getItem(){return null;},setItem(){}},crypto:globalThis.crypto,console,Date,Map,Set,setTimeout,window:{}});
 vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context);
 return code=>vm.runInContext(code,context);
}
test('gold references: latest unique cases, excludes current case, expiry, undo',()=>{
 const run=app();
 run(`state.references=Array.from({length:8},(_,i)=>({patientId:String(i),source:'finalized_summary',text:'style'+i,createdAt:new Date(Date.now()+i).toISOString()}));state.references.push({...state.references[7],text:'replacement'});`);
 assert.deepEqual(Array.from(run(`goldReferences('6')`)),['replacement','style5','style4','style3','style2']);
 run(`invalidateFinalization({id:'7'});`);
 assert.equal(run(`goldReferences('6').includes('replacement')`),false);
 run(`state.references.push({patientId:'old',source:'finalized_summary',text:'expired',createdAt:'2000-01-01'});`);
 assert.equal(run(`goldReferences('6').includes('expired')`),false);
});
test('clinical payload omits identifiers, drafts and unsaved test values',()=>{
 const run=app();
 const result=JSON.parse(run(`JSON.stringify(clinicalPayload({id:'secret',yob:'1955',sex:'M',summary:'old draft',tests:{labs:[{text:'unsaved',savedText:'older',mode:'waiting'}],ekg:{text:'ECG',savedText:'ECG'},gas:{text:'',savedText:''},radiology:[],consultations:[]}}))`));
 assert.equal(result.id,undefined); assert.equal(result.summary,undefined);
 assert.equal(result.tests[0].result,''); assert.equal(result.tests[1].result,'ECG');
});
