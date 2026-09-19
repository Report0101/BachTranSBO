const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 let revision=0,closed=false,ref=null;
 await page.route('https://backend.example/**',async route=>{
  const req=route.request(); const path=new URL(req.url()).pathname;
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,DELETE'}});
  if(req.headers().authorization!=='Bearer synthetic-test-access-token')throw Error('Missing authorization');
  if(path.endsWith('/generate'))revision++;
  if(path.endsWith('/finalize')){revision++;ref='ref-test';}
  if(req.method()==='DELETE'){revision++;ref=null;}
  if(path.endsWith('/close')){revision++;closed=true;}
  if(path.endsWith('/reopen')){revision++;closed=false;}
  await route.fulfill({json:{ok:true,revision,state:closed?'closed':'active',reference_id:ref,summary:'Synthetic summary for UI test',meta:{}},headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto('http://127.0.0.1:8765');await page.locator('#startShiftBtn').click();
 await page.locator('#newSex').selectOption('F');await page.locator('#newYob').fill('1980');await page.locator('#newComplaint').fill('Synthetic test');await page.locator('#addPatientBtn').click();
 await page.locator('#langHuBtn').click();if(await page.locator('#generateSummaryBtn').innerText()!=='Összefoglaló')throw Error('HU label failed');
 await page.locator('#langEnBtn').click();await page.locator('#aiBackendUrl').fill('https://backend.example');await page.locator('#accessToken').fill('synthetic-test-access-token');
 await page.locator('#testApiBtn').click();await page.locator('#generateSummaryBtn').click();await page.waitForFunction(()=>document.querySelector('#fSummary').value==='Synthetic summary for UI test');
 await page.locator('#finalizeSummaryBtn').click();await page.locator('#closeCaseBtn').waitFor({state:'visible'});await page.locator('#closeCaseBtn').click();await page.locator('#reopenCaseBtn').waitFor({state:'visible'});await page.locator('#reopenCaseBtn').click();await page.locator('#undoFinalizeBtn').click();
 await page.waitForFunction(()=>!document.querySelector('#summaryStatus').textContent.includes('FINALIZED') || document.querySelector('#summaryStatus').textContent.includes('NOT FINALIZED'));
 const stored=await page.evaluate(()=>JSON.stringify(localStorage));if(stored.includes('synthetic-test-access-token')||stored.includes('Synthetic test'))throw Error('Sensitive localStorage');
 await browser.close();if(errors.length)throw Error(errors.join('\n'));console.log('UI workflow passed');
})();
