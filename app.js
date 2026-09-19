
const STORAGE_KEY="er_command_center_v6",AI_CONFIG_KEY="er_command_center_ai_config_v1",RETENTION_DAYS=15;
let state=loadState(),selectedPatientId=null;
rebuildStyleProfile();
const UI_LANG_KEY="er_command_center_ui_lang_v1";
const I18N={
  en:{
    noActiveShift:"No active shift",
    oneShiftOnly:"Only one shift can be active at a time.",
    startShift:"START SHIFT",
    importPatient:"Import new patient",
    autoId:"ID automatically starts from 01 in each shift.",
    sex:"Sex",
    yob:"Year of birth",
    mainComplaint:"Main complaint",
    addPatient:"ADD PATIENT",
    patientRecord:"Patient record",
    waitingOnly:"Status shows tests currently waiting for result.",
    age:"Age",status:"Status",
    clinical:"1. Clinical",
    tests:"2. Tests",
    testResultsStatus:"2. Test results and status",
    physicalExam:"Physical examination",
    lab:"Lab",
    radiology:"Radiology",
    consultations:"Consultations",
    others:"Others",
    whatHappens:"3. What happens",
    therapy:"Therapy",
    clinicalCourse:"Clinical course / patient status change",
    diagnoses:"Diagnoses",
    disposition:"Disposition",
    complaint:"Complaint",
    patientHistory:"Patient history",
    treatmentCourse:"3. What happens / treatment",
    finalDecision:"4. Final decision / disposition",
    caseSummary:"5. Case summary",
    backendUrl:"AI backend URL",
    generateSummary:"Summary",
    summaryEditable:"Summary — editable",
    finalizeSummary:"FINALIZE SUMMARY",
    undoFinalize:"UNDO FINALIZE",
    closeCase:"CLOSE CASE",
    reopenCase:"REOPEN CASE",
    savePatient:"SAVE PATIENT",
    addLab:"+ ADD LAB",
    addRadiology:"+ ADD RADIOLOGY",
    addConsultation:"+ ADD CONSULTATION"
  },
  hu:{
    noActiveShift:"Nincs aktív műszak",
    oneShiftOnly:"Egyszerre csak egy aktív műszak lehet.",
    startShift:"MŰSZAK INDÍTÁSA",
    importPatient:"Új beteg felvétele",
    autoId:"A betegazonosító minden műszakban 01-től indul.",
    sex:"Nem",
    yob:"Születési év",
    mainComplaint:"Fő panasz",
    addPatient:"BETEG HOZZÁADÁSA",
    patientRecord:"Beteglista",
    waitingOnly:"A státusz csak a folyamatban lévő vizsgálatokat mutatja.",
    age:"Életkor",status:"Státusz",
    clinical:"1. Klinikai adatok",
    tests:"2. Vizsgálatok",
    testResultsStatus:"2. Vizsgálati eredmények és státusz",
    physicalExam:"Fizikális vizsgálat",
    lab:"Labor",
    radiology:"Radiológia",
    consultations:"Konzíliumok",
    others:"Egyéb",
    whatHappens:"3. Terápia és klinikai lefolyás",
    therapy:"Terápia",
    clinicalCourse:"Klinikai lefolyás / állapotváltozás",
    diagnoses:"Diagnózisok",
    disposition:"Diszpozíció",
    complaint:"Jelen panaszok",
    patientHistory:"Anamnézis",
    treatmentCourse:"3. Terápia / klinikai lefolyás",
    finalDecision:"4. Végső döntés / diszpozíció",
    caseSummary:"5. Esetösszefoglaló",
    backendUrl:"AI backend URL",
    generateSummary:"Összefoglaló",
    summaryEditable:"Összefoglaló — szerkeszthető",
    finalizeSummary:"ÖSSZEFOGLALÓ VÉGLEGESÍTÉSE",
    undoFinalize:"VÉGLEGESÍTÉS VISSZAVONÁSA",
    closeCase:"ESET LEZÁRÁSA",
    reopenCase:"ESET ÚJRANYITÁSA",
    savePatient:"BETEG MENTÉSE",
    addLab:"+ LABOR",
    addRadiology:"+ RADIOLÓGIA",
    addConsultation:"+ KONZÍLIUM"
  }
};
let uiLang=localStorage.getItem(UI_LANG_KEY)||"en";
function applyLanguage(lang){
  if(typeof apiBusy!=="undefined" && apiBusy)return;
  collect();
  uiLang=I18N[lang]?lang:"en";
  localStorage.setItem(UI_LANG_KEY,uiLang);
  document.documentElement.lang=uiLang==="hu"?"hu":"en";
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const key=el.dataset.i18n;
    if(I18N[uiLang][key])el.textContent=I18N[uiLang][key];
  });
  const help=document.getElementById("testStatusHelp");
  if(help){
    help.textContent=uiLang==="hu"
      ?"Narancssárga pont = eredményre vár. Szürke pont = nem történt rendelés. Mentett eredmény = zöld pont."
      :"Orange dot = waiting for result. Grey dot = not ordered. Saved result = green dot.";
  }
  const disp=document.getElementById("fDisposition");
  if(disp){
    const labels=uiLang==="hu"
      ?["Aktív / folyamatban","Otthonába bocsátva","Osztályos felvétel / áthelyezés","Egyéb"]
      :["Active / in progress","Discharged","Admitted / transferred","Other"];
    [...disp.options].forEach((o,i)=>{if(labels[i])o.textContent=labels[i]});
  }
  const en=document.getElementById("langEnBtn"),hu=document.getElementById("langHuBtn");
  if(en)en.classList.toggle("active",uiLang==="en");
  if(hu)hu.classList.toggle("active",uiLang==="hu");
  renderHeader();
}
async function testBackendApi(){return operation(async()=>{
  document.getElementById('headerApiStatus').className='api-dot offline';
  saveAiConfig();await api('/api/test');
  document.getElementById('headerApiStatus').className='api-dot online';
  setAiStatus('Backend, rules, model access and Drive verified.','ok');
});}
function loadAiConfig(){
  try{
    return JSON.parse(localStorage.getItem(AI_CONFIG_KEY))||{backendUrl:window.SBO_CONFIG?.apiBaseUrl||""};
  }catch{
    return{backendUrl:window.SBO_CONFIG?.apiBaseUrl||""};
  }
}
function saveAiConfig(){
  const url=(document.getElementById("aiBackendUrl")?.value||"").trim();
  localStorage.setItem(AI_CONFIG_KEY,JSON.stringify({backendUrl:url}));
}
function renderAiConfig(){
  const input=document.getElementById("aiBackendUrl");
  if(!input)return;
  const cfg=loadAiConfig();
  input.value=cfg.backendUrl||window.SBO_CONFIG?.apiBaseUrl||"";
  input.onchange=saveAiConfig;
  input.onblur=saveAiConfig;
}
function setAiStatus(message,kind=""){
  const el=document.getElementById("aiStatus");
  if(!el)return;
  el.textContent=message;
  el.style.color=kind==="error"?"#b91c1c":kind==="ok"?"#166534":"#475569";
}
function defaultStyleProfile(){
  return{
    version:1,
    finalizedSamples:0,
    editedSamples:0,
    phraseVotes:{},
    preferred:{},
    updatedAt:null
  };
}
function defaultState(){return{shift:null,patients:[],references:[],styleProfile:defaultStyleProfile()}}
function nowIso(){return new Date().toISOString()}
function loadState(){try{return purgeExpired(JSON.parse(sessionStorage.getItem(STORAGE_KEY))||defaultState())}catch{return defaultState()}}
function persist(){state=purgeExpired(state);sessionStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function purgeExpired(s){
  const c=Date.now()-RETENTION_DAYS*86400000;
  s.patients=(s.patients||[]).filter(p=>new Date(p.createdAt).getTime()>=c);
  s.references=(s.references||[]).filter(r=>new Date(r.createdAt).getTime()>=c);
  s.styleProfile=s.styleProfile||defaultStyleProfile();
  s.patients.forEach(p=>{
    if(p.tests?.radiology)p.tests.radiology.forEach(normalizeRadiologyEntry);
    if(!p.caseStatus)p.caseStatus=p.closedAt?"closed":"active";
    if(typeof p.reopenCount!=="number")p.reopenCount=0;
  });
  return s;
}
function fmtTime(x){return x?new Date(x).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}
function normalizeYob(y){
  const s=String(y??"").trim();
  if(/^\d{2}$/.test(s)){
    const n=Number(s), current2=new Date().getFullYear()%100;
    return String(n<=current2?2000+n:1900+n);
  }
  return s;
}
function age(y){
  const year=parseInt(normalizeYob(y),10);
  return year?new Date().getFullYear()-year:"";
}
function pts(){return state.shift?state.patients.filter(p=>p.shiftId===state.shift.id):[]}
function nextId(){return String(pts().length+1).padStart(2,"0")}
function patient(id=selectedPatientId){return state.patients.find(p=>p.id===id)}
function isClosed(p){return p?.caseStatus==="closed"||!!p?.closedAt}
function completed(p){return isClosed(p)}
function entry(type=""){return{type,mode:"waiting",text:"",savedText:""}}
function radiologyEntry(){
  return{type:"",bodyPart:"",modality:"",otherTest:"",mode:"waiting",text:"",savedText:""};
}
function normalizeRadiologyEntry(e){
  if(!e)return radiologyEntry();
  if(e.bodyPart===undefined)e.bodyPart="";
  if(e.modality===undefined)e.modality="";
  if(e.otherTest===undefined)e.otherTest="";
  // Backward compatibility: old free-text radiology type becomes Other.
  if(!e.bodyPart&&!e.modality&&!e.otherTest&&(e.type||"").trim()){
    e.modality="other";
    e.otherTest=(e.type||"").trim();
  }
  return e;
}
function radiologyType(e){
  normalizeRadiologyEntry(e);
  const body=(e.bodyPart||"").trim();
  const modality=(e.modality||"").trim();
  const other=(e.otherTest||"").trim();
  if(modality==="other"){
    if(body&&other)return `${body} — ${other}`;
    return other||body||"Radiology";
  }
  return [body,modality].filter(Boolean).join(" ").trim()||"Radiology";
}
function eStatus(e){if(e.mode==="notordered")return"notordered";if((e.savedText||"").trim()&&(e.text||"").trim()===(e.savedText||"").trim())return"result";return"waiting"}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function attr(v){return esc(v).replace(/`/g,"&#096;")}
function waits(p){const a=[];p.tests.labs.forEach((e,i)=>eStatus(e)==="waiting"&&a.push(`Lab ${i+1}`));if(eStatus(p.tests.ekg)==="waiting")a.push("EKG");if(eStatus(p.tests.gas)==="waiting")a.push(/\bVVG\b/i.test(p.tests.gas.text||"")?"VVG":"AVG");p.tests.radiology.forEach((e,i)=>eStatus(e)==="waiting"&&a.push(radiologyType(e)||`Radiology ${i+1}`));p.tests.consultations.forEach((e,i)=>eStatus(e)==="waiting"&&a.push(e.type?.trim()||`Consultation ${i+1}`));return a}
function renderHeader(){
  const m=document.getElementById("shiftMeta"),a=document.getElementById("topActions");
  m.innerHTML="";a.innerHTML="";
  const hu=uiLang==="hu";
  if(!state.shift){
    m.innerHTML=`<span class="metric">${hu?"Nincs aktív műszak":"No active shift"}</span>`;
    return;
  }
  const p=pts(),d=p.filter(completed).length;
  m.innerHTML=`<span class="pill"><span class="dot"></span> ${hu?"AKTÍV MŰSZAK":"SHIFT ACTIVE"} • ${hu?"Kezdés":"Started"} ${fmtTime(state.shift.startedAt)}</span><span class="metric">${hu?"Betegek":"Patients"} <b>${p.length}</b></span><span class="metric">${hu?"Aktív":"Active"} <b>${p.length-d}</b></span><span class="metric">${hu?"Lezárt":"Completed"} <b>${d}</b></span>`;
  a.innerHTML=`<button class="btn danger" id="endShiftBtn">${hu?"MŰSZAK LEZÁRÁSA":"END SHIFT"}</button>`;
  document.getElementById("endShiftBtn").onclick=endShiftStep1;
}
function renderApp(){renderHeader();noShiftView.classList.toggle("hidden",!!state.shift);patientsView.classList.toggle("hidden",!state.shift);if(state.shift)renderPatients()}
function patientTableStatus(p){
  if(isClosed(p))return '<span class="badge closed">CASE CLOSED</span>';
  const w=waits(p);
  return w.length?`<div class="wait-stack">${w.map(x=>`<span class="wait-chip">${esc(x)}</span>`).join("")}</div>`:"—";
}
function renderPatients(){
  newId.value=nextId();
  patientTbody.innerHTML="";
  pts().forEach(p=>{
    const tr=document.createElement("tr");
    tr.dataset.id=p.id;
    if(p.id===selectedPatientId)tr.classList.add("selected");
    tr.innerHTML=`<td>${esc(p.localId)}</td><td>${esc(p.sex)}</td><td>${age(p.yob)}</td><td>${esc(p.mainComplaint)}</td><td>${patientTableStatus(p)}</td>`;
    tr.onclick=()=>{if(apiBusy)return;collect();persist();selectedPatientId=p.id;renderPatients()};
    patientTbody.appendChild(tr);
  });
  if(selectedPatientId&&patient()){
    loadPatientForm();
  }else{
    patientForm.classList.add("hidden");
    noPatientSelected.classList.remove("hidden");
    recordTitle.textContent="Patient detail";
    recordSubtitle.textContent="Chọn một bệnh nhân bên trái.";
    patientStatusBadge.innerHTML="";
  }
}
function updateStatusCell(p=patient()){
  if(!p)return;
  const row=document.querySelector(`tr[data-id="${p.id}"]`);
  if(!row)return;
  row.children[4].innerHTML=patientTableStatus(p);
}
function addPatient(){
  if(!state.shift)return;
  const sex=newSex.value,yob=normalizeYob(newYob.value),mc=newComplaint.value.trim();
  const currentYear=new Date().getFullYear();
  if(!sex||!yob||!mc)return alert("Please enter Sex, Year of birth and Main complaint.");
  if(!/^\d{4}$/.test(yob)||Number(yob)<1900||Number(yob)>currentYear){
    return alert("Year of birth must be 4 digits or a 2-digit shorthand, e.g. 55 = 1955.");
  }
  newYob.value=yob;const p={id:crypto.randomUUID(),shiftId:state.shift.id,localId:nextId(),sex,yob,mainComplaint:mc,complaint:"",history:"",physical:"",tests:{labs:[entry()],ekg:entry(),gas:entry(),radiology:[radiologyEntry()],consultations:[entry()]},others:"",therapy:"",course:"",diagnoses:"",disposition:"",recommendations:[""],hospital:"",ward:"",physician:"",admissionNote:"",otherOutcome:"",otherDetails:"",summary:"",summaryGeneratedAt:null,summaryFinalizedText:"",summaryFinalizedAt:null,caseStatus:"active",closedAt:null,reopenedAt:null,reopenCount:0,createdAt:nowIso(),updatedAt:nowIso()};state.patients.push(p);selectedPatientId=p.id;newSex.value=newYob.value=newComplaint.value="";persist();renderApp()}
function loadPatientForm(){
  const p=patient();
  if(!p)return;
  patientForm.classList.remove("hidden");
  noPatientSelected.classList.add("hidden");
  recordTitle.textContent=`Patient ${p.localId}`;
  recordSubtitle.textContent=`${p.sex} • ${age(p.yob)} y • ${p.mainComplaint}`;
  patientStatusBadge.innerHTML=isClosed(p)
    ?'<span class="badge closed">CASE CLOSED</span>'
    :'<span class="badge active">ACTIVE / IN PROGRESS</span>';

  const v={
    fMainComplaint:p.mainComplaint,fComplaint:p.complaint,fHistory:p.history,
    fPhysical:p.physical,fOthers:p.others,fTherapy:p.therapy,fCourse:p.course,
    fDiagnoses:p.diagnoses||"",fDisposition:p.disposition,fHospital:p.hospital,
    fWard:p.ward,fPhysician:p.physician,fAdmissionNote:p.admissionNote,
    fOtherOutcome:p.otherOutcome,fOtherDetails:p.otherDetails,fSummary:p.summary
  };
  Object.entries(v).forEach(([id,val])=>document.getElementById(id).value=val||"");
  renderTests(p);
  renderRecs(p);
  dispositionUI();
  renderSummaryStatus(p);
  renderStyleMemory();
  renderBackendPreview();
  renderAiConfig();
  applyCaseLock(p);
}
function badge(s){
  const title=s==="result"?"Result available":s==="notordered"?"Not ordered":"Waiting for result";
  return `<span class="test-status-dot ${s}" title="${title}" aria-label="${title}"></span>`;
}
function deleteTestEntry(group,index){
  const p=patient();
  if(!p)return;
  const labels={labs:"Lab",radiology:"Radiology",consultations:"Consultation"};
  const item=labels[group]||"item";
  if(!confirm(`Delete this ${item}?`))return;
  p.tests[group].splice(index,1);
  persist();
  renderTests(p);
  updateStatusCell(p);
  renderSummaryStatus(p);
  flash(`${item} deleted.`);
}

function modeDots(e){
  const s=eStatus(e);
  return `<div class="mode-dots" data-mode-dots>
    <button type="button" class="mode-dot-btn waiting ${s==="waiting"?"active":""}" data-mode-choice="waiting" title="Waiting for result" aria-label="Waiting for result"></button>
    <button type="button" class="mode-dot-btn notordered ${s==="notordered"?"active":""}" data-mode-choice="notordered" title="Not ordered" aria-label="Not ordered"></button>
    <span class="mode-dot-btn result ${s==="result"?"active":""}" title="Result available" aria-label="Result available"></span>
  </div>`;
}

function simpleCard(label,e,key,isGas=false,onDelete=null){
  const s=eStatus(e),d=document.createElement("div");
  d.className=`test-card ${s==="result"?"result":s==="notordered"?"notordered":""}`;
  d.innerHTML=`
    <div class="test-head">
      <span class="test-name">${label}</span>
      <div class="card-head-actions">
        ${modeDots(e)}
        ${onDelete?'<button class="btn small delete-test" type="button" data-delete>DELETE</button>':""}
      </div>
    </div>
    <div class="test-grid">
      <textarea data-text ${e.mode==="notordered"?"disabled":""} placeholder="${label} result...">${esc(e.text)}</textarea>
      <button class="btn small primary" type="button" data-save ${!e.text.trim()||e.mode==="notordered"||s==="result"?"disabled":""}>SAVE RESULT</button>
    </div>`;
  if(onDelete)d.querySelector("[data-delete]").onclick=onDelete;
  wire(d,e,key,isGas);
  return d;
}

function dynamicCard(label,e,key,ph,onDelete=null){
  const s=eStatus(e),d=document.createElement("div");
  d.className=`test-card ${s==="result"?"result":s==="notordered"?"notordered":""}`;
  d.innerHTML=`
    <div class="test-head">
      <span class="test-name">${label}</span>
      <div class="card-head-actions">
        ${modeDots(e)}
        ${onDelete?'<button class="btn small delete-test" type="button" data-delete>DELETE</button>':""}
      </div>
    </div>
    <div class="dynamic-grid">
      <input data-type value="${attr(e.type||"")}" placeholder="${ph}">
      <textarea data-text ${e.mode==="notordered"?"disabled":""} placeholder="Result / note...">${esc(e.text)}</textarea>
      <button class="btn small primary" type="button" data-save ${!e.text.trim()||e.mode==="notordered"||s==="result"?"disabled":""}>SAVE RESULT</button>
    </div>`;
  const t=d.querySelector("[data-type]");
  t.oninput=()=>{e.type=t.value;persist();updateStatusCell()};
  if(onDelete)d.querySelector("[data-delete]").onclick=onDelete;
  wire(d,e,key,false);
  return d;
}

function radiologyCard(e,index){
  normalizeRadiologyEntry(e);
  const key=`rad-${index}`,s=eStatus(e),d=document.createElement("div");
  const bodyParts=["","koponya","mellkas","has","mellkas és has","has és kismedence"];
  const modalities=["","RTG","ultrahang","CT","MR","other"];
  const options=(arr,current,labels={})=>arr.map(v=>`<option value="${attr(v)}"${v===current?" selected":""}>${labels[v]||v||"— select —"}</option>`).join("");

  d.className=`test-card ${s==="result"?"result":s==="notordered"?"notordered":""}`;
  d.innerHTML=`
    <div class="test-head">
      <span class="test-name">Radiology ${index+1} <span class="subtle" data-rad-label>${esc(radiologyType(e))}</span></span>
      <div class="card-head-actions">
        ${modeDots(e)}
        <button class="btn small delete-test" type="button" data-delete>DELETE</button>
      </div>
    </div>
    <div class="radiology-grid${e.modality==="other"?" has-other":""}">
      <select data-body>
        ${options(bodyParts,e.bodyPart)}
      </select>
      <select data-modality>
        ${options(modalities,e.modality,{other:"Other / specific"})}
      </select>
      <input data-other class="${e.modality==="other"?"":"hidden"}" value="${attr(e.otherTest||"")}" placeholder="Specific test e.g. CT angiographia">
      <textarea data-text ${e.mode==="notordered"?"disabled":""} placeholder="Radiology result...">${esc(e.text)}</textarea>
      <button class="btn small primary" type="button" data-save ${!e.text.trim()||e.mode==="notordered"||s==="result"?"disabled":""}>SAVE RESULT</button>
    </div>`;

  const body=d.querySelector("[data-body]");
  const modality=d.querySelector("[data-modality]");
  const other=d.querySelector("[data-other]");
  const label=d.querySelector("[data-rad-label]");

  const updateType=()=>{
    e.bodyPart=body.value;
    e.modality=modality.value;
    e.otherTest=other.value;
    e.type=radiologyType(e);
    const isOther=e.modality==="other";
    other.classList.toggle("hidden",!isOther);
    d.querySelector(".radiology-grid").classList.toggle("has-other",isOther);
    label.textContent=e.type;
    persist();
    updateStatusCell();
  };
  body.onchange=updateType;
  modality.onchange=updateType;
  other.oninput=updateType;
  d.querySelector("[data-delete]").onclick=()=>deleteTestEntry("radiology",index);
  wire(d,e,key,false);
  return d;
}

function wire(card,e,key,isGas){
  const modeButtons=[...card.querySelectorAll("[data-mode-choice]")];
  const txt=card.querySelector("[data-text]");
  const save=card.querySelector("[data-save]");

  const refresh=()=>{
    const s=eStatus(e);
    card.className=`test-card ${s==="result"?"result":s==="notordered"?"notordered":""}`;
    txt.disabled=e.mode==="notordered";
    save.disabled=!e.text.trim()||e.mode==="notordered"||s==="result";

    modeButtons.forEach(btn=>{
      const choice=btn.dataset.modeChoice;
      btn.classList.toggle("active",choice===s);
    });
    const resultDot=card.querySelector(".mode-dot-btn.result");
    if(resultDot)resultDot.classList.toggle("active",s==="result");

    if(isGas){
      const name=card.querySelector(".test-name");
      if(name)name.textContent=/\bVVG\b/i.test(e.text||"")?"VVG":"AVG";
    }
  };

  modeButtons.forEach(btn=>{
    btn.onclick=()=>{
      e.mode=btn.dataset.modeChoice==="notordered"?"notordered":"waiting";
      persist();
      refresh();
      updateStatusCell();
      renderSummaryStatus(patient());
    };
  });

  txt.oninput=()=>{
    e.text=txt.value;
    persist();
    refresh();
    updateStatusCell();
  };

  txt.addEventListener("keydown",ev=>{
    if(ev.key==="Enter"&&!ev.shiftKey){
      ev.preventDefault();
      e.text=txt.value;
      if(e.mode!=="notordered"&&e.text.trim())save.click();
    }
  });

  save.onclick=()=>{
    if(!e.text.trim()||e.mode==="notordered")return;
    e.savedText=e.text;
    e.mode="waiting";
    persist();
    refresh();
    updateStatusCell();
    renderSummaryStatus(patient());
    flash("Result saved — RESULT AVAILABLE.");
  };
}
function renderTests(p){
  labCards.innerHTML="";
  p.tests.labs.forEach((e,i)=>{
    labCards.appendChild(simpleCard(`Lab ${i+1}`,e,`lab-${i}`,false,()=>deleteTestEntry("labs",i)));
  });
  addLabBtn.disabled=false;

  ekgCard.innerHTML="";
  ekgCard.appendChild(simpleCard("EKG",p.tests.ekg,"ekg"));

  gasCard.innerHTML="";
  gasCard.appendChild(simpleCard(/\bVVG\b/i.test(p.tests.gas.text||"")?"VVG":"AVG",p.tests.gas,"gas",true));

  radiologyCards.innerHTML="";
  p.tests.radiology.forEach((e,i)=>radiologyCards.appendChild(radiologyCard(e,i)));

  consultCards.innerHTML="";
  p.tests.consultations.forEach((e,i)=>{
    consultCards.appendChild(dynamicCard(`Consultation ${i+1}`,e,`con-${i}`,"Type e.g. Cardiology, Neurology",()=>deleteTestEntry("consultations",i)));
  });
}

function addLab(){
  const p=patient();
  if(!p)return;
  p.tests.labs.push(entry());
  persist();renderTests(p);updateStatusCell();
}
function addRadiology(){
  const p=patient();
  if(!p)return;
  p.tests.radiology.push(radiologyEntry());
  persist();renderTests(p);updateStatusCell();
}
function addConsult(){
  const p=patient();
  if(!p)return;
  p.tests.consultations.push(entry());
  persist();renderTests(p);updateStatusCell();
}
function collect(){const p=patient();if(!p)return null;p.mainComplaint=fMainComplaint.value;p.complaint=fComplaint.value;p.history=fHistory.value;p.physical=fPhysical.value;p.others=fOthers.value;p.therapy=fTherapy.value;p.course=fCourse.value;p.diagnoses=fDiagnoses.value;p.disposition=fDisposition.value;p.hospital=fHospital.value;p.ward=fWard.value;p.physician=fPhysician.value;p.admissionNote=fAdmissionNote.value;p.otherOutcome=fOtherOutcome.value;p.otherDetails=fOtherDetails.value;p.summary=fSummary.value;p.recommendations=[...document.querySelectorAll("[data-rec]")].map(x=>x.value);p.updatedAt=nowIso();return p}
function savePatient(){if(collect()){persist();renderApp();flash("Patient saved.")}}
function dispositionUI(){const v=fDisposition.value;dischargedFields.classList.toggle("hidden",v!=="discharged");admittedFields.classList.toggle("hidden",v!=="admitted");otherFields.classList.toggle("hidden",v!=="other")}
function renderRecs(p){recList.innerHTML="";(p.recommendations?.length?p.recommendations:[""]).forEach((x,i)=>{const r=document.createElement("div");r.className="rec-row";r.innerHTML=`<div>${i+1}.</div><input data-rec value="${attr(x)}"><button class="btn small" type="button" data-del="${i}">×</button>`;r.querySelector("[data-del]").onclick=()=>{collect();p.recommendations.splice(i,1);if(!p.recommendations.length)p.recommendations=[""];persist();renderRecs(p)};recList.appendChild(r)})}
function addRec(){collect();const p=patient();p.recommendations.push("");persist();renderRecs(p)}
function rebuildStyleProfile(){}
function renderBackendPreview(){}
function renderStyleMemory(){document.getElementById('styleMemoryStatus').textContent='Finalized references are stored on Google Drive for up to 15 days.';}
function testPayload(e,label=""){
  return{
    label,
    status:eStatus(e),
    result:eStatus(e)==="result"?(e.savedText||"").trim():""
  };
}
function buildSboAiPayload(p){
  return{
    patient:{
      sex:p.sex,
      age:age(p.yob),
      mainComplaint:p.mainComplaint||"",
      complaint:p.complaint||"",
      history:p.history||"",
      physical:p.physical||"",
      diagnoses:String(p.diagnoses||"").split(/\n|;/).map(x=>x.trim()).filter(Boolean),
      tests:{
        labs:(p.tests.labs||[]).map((e,i)=>testPayload(e,`Lab ${i+1}`)),
        ekg:testPayload(p.tests.ekg,"EKG"),
        gas:testPayload(p.tests.gas,/\bVVG\b/i.test(p.tests.gas?.text||"")?"VVG":"AVG"),
        radiology:(p.tests.radiology||[]).map((e,i)=>({
          ...testPayload(e,radiologyType(e)||`Radiology ${i+1}`),
          bodyPart:e.bodyPart||"",
          modality:e.modality||"",
          specificTest:e.otherTest||""
        })),
        consultations:(p.tests.consultations||[]).map((e,i)=>({
          ...testPayload(e,e.type?.trim()||`Consultation ${i+1}`),
          specialty:e.type||""
        }))
      },
      others:p.others||"",
      therapy:p.therapy||"",
      clinicalCourse:p.course||"",
      disposition:p.disposition||"",
      recommendations:(p.recommendations||[]).filter(x=>String(x).trim()),
      admission:{
        hospital:p.hospital||"",
        ward:p.ward||"",
        acceptingPhysician:p.physician||"",
        note:p.admissionNote||""
      },
      otherOutcome:p.otherOutcome||"",
      otherDetails:p.otherDetails||""
    }
  };
}

let apiBusy=false;
let accessToken='';
function apiBase(){
  const u=new URL(loadAiConfig().backendUrl);
  if(u.protocol!=='https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('Use an HTTPS backend URL.');
  if(u.username||u.password||u.search||u.hash)throw new Error('Invalid backend URL');
  return u.origin;
}
async function api(path,method='GET',body){
  accessToken=document.getElementById('accessToken')?.value||accessToken;
  if(!accessToken)throw new Error('Enter your backend access token.');
  const response=await fetch(apiBase()+path,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000),cache:'no-store',redirect:'error'});
  const data=await response.json();
  if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'API request failed');
  return data;
}
function payload(p){return {case_id:p.id,revision:p.serverRevision||0,patient:buildSboAiPayload(p).patient};}
function acceptState(p,data){p.serverRevision=data.revision;p.referenceId=data.reference_id||data.pending_reference_id;p.caseStatus=data.state;p.closedAt=data.state==='closed'?(p.closedAt||nowIso()):null;}
async function operation(task){
  if(apiBusy)return;
  collect();apiBusy=true;
  const controls=[...document.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);
  controls.forEach(([el])=>el.disabled=true);
  try{await task();}catch(e){setAiStatus(e.message,'error');alert(e.message);}
  finally{apiBusy=false;controls.forEach(([el,disabled])=>el.disabled=disabled);persist();renderApp();}
}
async function generateSummary(){return operation(async()=>{
  const p=collect();if(!p)return;
  const fingerprint=clinicalFingerprint(p);
  setAiStatus('Generating summary…');
  const data=await api('/api/summary/generate','POST',payload(p));
  acceptState(p,data);p.summary=data.summary;p.lastGeneratedSummary=data.summary;p.summaryGeneratedAt=nowIso();
  p.generatedFingerprint=fingerprint;p.lastAiMeta=data.meta;
  if(patient()?.id===p.id)fSummary.value=p.summary;
  setAiStatus('Summary generated. Review before Finalize.','ok');
});}
async function finalizeSummary(){return operation(async()=>{
  const p=collect();if(!p)return;
  if(p.generatedFingerprint!==clinicalFingerprint(p))throw new Error('Clinical data changed. Generate again before Finalize.');
  if(!confirm('I have reviewed this summary and removed identifying information from the text saved as a Google Drive reference.'))return;
  const summary=p.summary.trim();const fingerprint=clinicalFingerprint(p);
  const data=await api('/api/summary/finalize','POST',{...payload(p),summary,reference_reviewed:true});
  acceptState(p,data);p.summaryFinalizedText=summary;p.summaryFinalizedAt=nowIso();p.summaryFinalizedClinicalFingerprint=fingerprint;
  try{await navigator.clipboard.writeText(summary);}catch{}
  flash('Finalized summary saved to Google Drive.');
});}
async function syncCaseState(){return operation(async()=>{
  const p=collect();if(!p)return;
  const data=await api('/api/cases/'+p.id);acceptState(p,data);
  if(!data.reference_id){p.summaryFinalizedAt=null;p.summaryFinalizedText='';}
  // A lost finalize response must not be mistaken for a verified local snapshot.
  if(data.reference_id && !p.summaryFinalizedAt)throw new Error('Server has a finalized reference. Reopen if needed, then Undo Finalize before editing.');
});}
function clinicalFingerprint(p){
  return JSON.stringify({
    mainComplaint:p.mainComplaint||"",
    complaint:p.complaint||"",
    history:p.history||"",
    physical:p.physical||"",
    tests:p.tests||{},
    others:p.others||"",
    therapy:p.therapy||"",
    course:p.course||"",
    diagnoses:p.diagnoses||"",
    disposition:p.disposition||"",
    recommendations:p.recommendations||[],
    hospital:p.hospital||"",
    ward:p.ward||"",
    physician:p.physician||"",
    admissionNote:p.admissionNote||"",
    otherOutcome:p.otherOutcome||"",
    otherDetails:p.otherDetails||""
  });
}
function clinicalChangedAfterFinalize(p){
  return !!p.summaryFinalizedAt &&
    !!p.summaryFinalizedClinicalFingerprint &&
    clinicalFingerprint(p)!==p.summaryFinalizedClinicalFingerprint;
}
function summaryChangedAfterFinalize(p){
  return !!p.summaryFinalizedAt&&(fSummary.value||"").trim()!==(p.summaryFinalizedText||"").trim();
}
async function undoFinalize(){return operation(async()=>{
  const p=collect();if(!p)return;
  if(!confirm('Delete this finalized Google Drive reference? The editable summary remains.'))return;
  const data=await api('/api/summary/finalize/'+p.id+'?revision='+(p.serverRevision||0),'DELETE');
  acceptState(p,data);p.summaryFinalizedText='';p.summaryFinalizedAt=null;p.summaryFinalizedClinicalFingerprint=null;
  flash('Finalize undone. Google Drive reference deleted.');
});}
async function closeCase(){return operation(async()=>{
  const p=collect();if(!p)return;
  const data=await api('/api/cases/'+p.id+'/close','POST',{...payload(p),summary:p.summary});acceptState(p,data);
});}
async function reopenCase(){return operation(async()=>{
  const p=patient();if(!p)return;
  const data=await api('/api/cases/'+p.id+'/reopen','POST',payload(p));acceptState(p,data);
});}
function renderCaseActions(p){
  const changed=summaryChangedAfterFinalize(p)||clinicalChangedAfterFinalize(p);
  undoFinalizeBtn.classList.toggle("hidden",isClosed(p)||(!p.summaryFinalizedAt&&!p.referenceId));
  closeCaseBtn.classList.toggle("hidden",isClosed(p)||!p.summaryFinalizedAt||changed);
  reopenCaseBtn.classList.toggle("hidden",!isClosed(p));
}
function applyCaseLock(p){
  const closed=isClosed(p);
  if(closed){
    patientForm.querySelectorAll("input,textarea,select,button").forEach(el=>{
      if(["reopenCaseBtn","accessToken","aiBackendUrl","syncCaseBtn","testApiBtn"].includes(el.id)){el.disabled=false;return;}
      el.disabled=true;
    });
    return;
  }

  patientForm.querySelectorAll("input,textarea,select,button").forEach(el=>{
    if(!el.closest(".test-card"))el.disabled=false;
  });

  // Re-render test controls so Waiting / Not ordered / Result disabled
  // states remain correct after a case is reopened.
  renderTests(p);
}
function renderSummaryStatus(p){
  const t=fSummary.value||"";
  if(isClosed(p)){
    summaryStatus.innerHTML=`<span class="badge closed">CASE CLOSED</span> <span class="subtle">Closed ${fmtTime(p.closedAt)}. Reopen to edit.</span>`;
    renderCaseActions(p);
    return;
  }
  if(!p.summaryFinalizedAt){
    summaryStatus.innerHTML='<span class="badge active">NOT FINALIZED</span> <span class="subtle">Case is still ACTIVE / IN PROGRESS.</span>';
    renderCaseActions(p);
    return;
  }
  const changed=t.trim()!==p.summaryFinalizedText.trim();
  const clinicalChanged=clinicalChangedAfterFinalize(p);
  summaryStatus.innerHTML=clinicalChanged
    ?'<span class="badge active">CLINICAL DATA CHANGED</span> <span class="subtle">Update/Generate Summary and Finalize again before Close Case.</span>'
    :changed
    ?'<span class="badge active">EDITED AFTER FINALIZE</span> <span class="subtle">Finalize again before Close Case.</span>'
    :`<span class="badge done">FINALIZED</span> <span class="subtle">Saved ${fmtTime(p.summaryFinalizedAt)} • ready to Close Case.</span>`;
  renderCaseActions(p);
}
function startShift(){if(state.shift)return;state.shift={id:crypto.randomUUID(),startedAt:nowIso(),status:"active"};selectedPatientId=null;persist();renderApp()}
function modal(x){modalHost.innerHTML=`<div class="modal-wrap"><div class="modal">${x}</div></div>`;modalHost.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>modalHost.innerHTML="")}
function endShiftStep1(){const p=pts(),a=p.filter(x=>!completed(x)).length;modal(`<h3>End current shift?</h3><p>Patients: <b>${p.length}</b><br>Still active: <b>${a}</b></p><div class="modal-actions"><button class="btn" data-close>CANCEL</button><button class="btn danger" id="endContinue">CONTINUE</button></div>`);endContinue.onclick=endShiftStep2}
function endShiftStep2(){modal(`<h3>Confirm end shift</h3><p>Type <b>END</b> to confirm.</p><input id="endInput" placeholder="END"><div class="modal-actions"><button class="btn" data-close>CANCEL</button><button class="btn danger" id="endFinal" disabled>END SHIFT</button></div>`);endInput.oninput=()=>endFinal.disabled=endInput.value!=="END";endFinal.onclick=()=>{state=defaultState();selectedPatientId=null;persist();modalHost.innerHTML="";renderApp()}}
function flash(msg){const e=document.createElement("div");e.textContent=msg;e.style.cssText="position:fixed;right:20px;bottom:20px;background:#111827;color:#fff;padding:11px 14px;border-radius:9px;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.2)";document.body.appendChild(e);setTimeout(()=>e.remove(),1800)}
langEnBtn.onclick=()=>applyLanguage("en");
langHuBtn.onclick=()=>applyLanguage("hu");
if(document.getElementById("testApiBtn"))document.getElementById("testApiBtn").onclick=testBackendApi;
patientForm.addEventListener("submit",e=>e.preventDefault());
startShiftBtn.onclick=startShift;
addPatientBtn.onclick=addPatient;
[newSex,newYob,newComplaint].forEach(el=>el.addEventListener("keydown",ev=>{
  if(ev.key==="Enter"&&newSex.value&&newYob.value.trim()&&newComplaint.value.trim()){
    ev.preventDefault();
    addPatient();
  }
}));
newYob.addEventListener("blur",()=>{if(newYob.value.trim())newYob.value=normalizeYob(newYob.value)});
document.getElementById('accessToken').oninput=e=>accessToken=e.target.value;document.getElementById('syncCaseBtn').onclick=syncCaseState;savePatientBtn.onclick=savePatient;fDisposition.onchange=dispositionUI;addRecBtn.onclick=addRec;addLabBtn.onclick=addLab;addRadiologyBtn.onclick=addRadiology;addConsultBtn.onclick=addConsult;generateSummaryBtn.onclick=generateSummary;finalizeSummaryBtn.onclick=finalizeSummary;undoFinalizeBtn.onclick=undoFinalize;closeCaseBtn.onclick=closeCase;reopenCaseBtn.onclick=reopenCase;fSummary.oninput=()=>patient()&&renderSummaryStatus(patient());renderApp();
applyLanguage(uiLang);

setInterval(()=>{if(!apiBusy){collect();const count=state.patients.length;persist();if(state.patients.length!==count)renderApp();}},60000);
