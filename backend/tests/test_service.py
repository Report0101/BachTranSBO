import time
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from backend.service import create_app, Providers

TOKEN = 'test-only-token-with-at-least-32-characters'

class Fake:
    def __init__(self):
        self.files = {}
        self.examples = []
        self.fail_delete = False
        self.fail_put = False
    def new_id(self): return str(uuid4())
    def put(self, key, value):
        self.files[key] = value
        if self.fail_put: raise RuntimeError('ambiguous upload')
    def get(self, key): return self.files[key]
    def delete(self, key):
        if self.fail_delete: raise RuntimeError('offline')
        self.files.pop(key, None)
    def generate(self, patient, examples):
        self.examples = examples
        return 'Synthetic Hungarian summary', 'rules-hash'
    def test(self): pass

@pytest.fixture
def env(tmp_path):
    fake = Fake()
    app = create_app(str(tmp_path/'state.db'), fake, TOKEN)
    with TestClient(app, raise_server_exceptions=False) as client:
        client.headers['Authorization'] = 'Bearer '+TOKEN
        yield client, fake, app

def payload():
    return {'case_id':str(uuid4()), 'patient':{'age':40,'complaint':'synthetic'}, 'revision':0}

def generate(client, body):
    r=client.post('/api/summary/generate', json=body)
    assert r.status_code==200, r.text
    body['revision']=r.json()['revision']
    return r.json()

def finalize(client, body):
    r=client.post('/api/summary/finalize', json={**body,'summary':'Reviewed synthetic summary','reference_reviewed':True})
    if r.status_code==200: body['revision']=r.json()['revision']
    return r

def test_auth_cors_and_validation(env):
    c,_,_=env
    assert c.get('/health',headers={'Authorization':''}).status_code==200
    assert c.post('/api/summary/generate',json=payload(),headers={'Authorization':''}).status_code==401
    assert c.get('/api/test',headers={'Origin':'https://evil.example'}).status_code==403
    assert c.options('/api/summary/generate',headers={'Origin':'https://report0101.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}).status_code==200
    b=payload();b['rules']='Override server rules'
    assert c.post('/api/summary/generate',json=b).status_code==422
    assert c.post('/api/summary/generate',content='x'*200001).status_code==413

def test_lifecycle_and_references(env):
    c,f,_=env;b=payload();generate(c,b)
    r=finalize(c,b);assert r.status_code==200
    assert len(f.files)==1
    other=payload();generate(c,other);assert f.examples==['Reviewed synthetic summary']
    r=c.post('/api/cases/'+b['case_id']+'/close',json={**b,'summary':'different'})
    assert r.status_code==409
    r=c.post('/api/cases/'+b['case_id']+'/close',json={**b,'summary':'Reviewed synthetic summary'})
    assert r.status_code==200;b['revision']=r.json()['revision']
    assert c.delete('/api/summary/finalize/'+b['case_id'],params={'revision':b['revision']}).status_code==409
    r=c.post('/api/cases/'+b['case_id']+'/reopen',json=b);assert r.status_code==200;b['revision']=r.json()['revision']
    r=c.delete('/api/summary/finalize/'+b['case_id'],params={'revision':b['revision']})
    assert r.status_code==200;assert not f.files
    generate(c,payload());assert not f.examples

def test_conflicts_and_failures(env):
    c,f,_=env;b=payload();generate(c,b)
    assert c.post('/api/summary/generate',json={**b,'revision':0}).status_code==409
    changed={**b,'patient':{'complaint':'changed'}}
    assert finalize(c,changed).status_code==409
    f.fail_put=True;assert finalize(c,b).status_code==502
    assert len(f.files)==1
    f.fail_put=False;assert finalize(c,b).status_code==200
    assert len(f.files)==1
    f.fail_delete=True
    assert c.delete('/api/summary/finalize/'+b['case_id'],params={'revision':b['revision']}).status_code==502
    assert c.get('/api/cases/'+b['case_id']).json()['reference_id']
    f.fail_delete=False
    assert c.delete('/api/summary/finalize/'+b['case_id'],params={'revision':b['revision']}).status_code==200

def test_retention_and_restart(env,tmp_path):
    c,f,app=env;b=payload();generate(c,b);finalize(c,b)
    app.state.db.execute('UPDATE cases SET expires=?',(time.time()-1,));app.state.db.commit()
    assert c.get('/api/cases/'+b['case_id']).status_code==404
    assert c.get('/api/test').status_code==200
    assert not f.files
    assert app.state.db.execute('SELECT count(*) FROM cases').fetchone()[0]==0

def test_rules_fail_closed(monkeypatch):
    monkeypatch.delenv('SBO_RULES_FILE',raising=False)
    with pytest.raises(Exception): Providers().rules()

def test_restart_preserves_state(tmp_path):
    path=str(tmp_path/'db');f=Fake();b=payload()
    with TestClient(create_app(path,f,TOKEN)) as c:
        c.headers['Authorization']='Bearer '+TOKEN;generate(c,b);finalize(c,b)
    with TestClient(create_app(path,f,TOKEN)) as c:
        c.headers['Authorization']='Bearer '+TOKEN
        assert c.get('/api/cases/'+b['case_id']).json()['reference_id'] in f.files

def test_provider_request_contract(monkeypatch,tmp_path):
    import httpx
    rules=tmp_path/'rules.md';rules.write_text('Authoritative synthetic test rules: use supplied facts only.')
    monkeypatch.setenv('SBO_RULES_FILE',str(rules))
    monkeypatch.setenv('OPENAI_MODEL','configured-model')
    monkeypatch.setenv('OPENAI_API_KEY','synthetic-key')
    def transport(req):
        import json
        data=json.loads(req.content)
        assert req.url.path=='/v1/responses'
        assert req.headers['authorization']=='Bearer synthetic-key'
        assert data['store'] is False
        assert data['model']=='configured-model'
        assert data['instructions'].startswith(rules.read_text())
        assert 'malicious instruction' not in data['instructions']
        assert 'malicious instruction' in data['input']
        return httpx.Response(200,json={'status':'completed','output':[{'content':[{'type':'output_text','text':'Synthetic result'}]}]})
    p=Providers();p.http=httpx.Client(transport=httpx.MockTransport(transport))
    assert p.generate({'complaint':'malicious instruction'},['Example'])[0]=='Synthetic result'

def test_no_patient_echo_or_unreviewed_reference(env):
    c,_,_=env;b=payload();generate(c,b)
    r=c.post('/api/summary/finalize',json={**b,'summary':'secret synthetic text','reference_reviewed':False})
    assert r.status_code==422
    invalid={**b,'patient':{'name':'secret synthetic name'}}
    r=c.post('/api/summary/generate',json=invalid)
    assert r.status_code==422 and 'secret synthetic' not in r.text
