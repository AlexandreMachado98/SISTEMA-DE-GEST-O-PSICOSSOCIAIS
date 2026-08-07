const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db } = require('./db');
const auth = require('./auth');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon' };
function json(res,status,data){ res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
function getToken(req){ const h=req.headers.authorization||''; return h.startsWith('Bearer ')?h.slice(7):''; }
function requireAuth(req,res){ const user=auth.getUserFromToken(getToken(req)); if(!user){ json(res,401,{error:'Não autenticado.'}); return null;} return user; }
function readBody(req){ return new Promise((resolve,reject)=>{let raw=''; req.on('data',c=>{raw+=c;if(raw.length>1e6)req.destroy();}); req.on('end',()=>{if(!raw)return resolve({});try{resolve(JSON.parse(raw));}catch(e){reject(new Error('JSON inválido.'));}});req.on('error',reject);}); }
function safePath(urlPath){ const decoded=decodeURIComponent(urlPath.split('?')[0]); const target=path.normalize(path.join(PUBLIC,decoded==='/'?'am-tst-sistema.html':decoded)); return target.startsWith(PUBLIC+path.sep)||target===PUBLIC?target:null; }
function mapCompany(r){return {id:r.id,name:r.name,cnpj:r.cnpj,colaboradores:r.colaboradores,createdAt:r.created_at};}
function mapAssessment(r){return {id:r.id,method:r.method,companyId:r.company_id,companyName:r.company_name,title:r.title,description:r.description,startDate:r.start_date,endDate:r.end_date,active:!!r.active,positiveWording:!!r.positive_wording,multisetorial:!!r.multisetorial,sectors:JSON.parse(r.sectors_json||'[]'),createdAt:r.created_at};}

function mapRow(r){
  const out={};
  for(const [k,v] of Object.entries(r)){
    const camel=k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
    if(['active','positive_wording','multisetorial'].includes(k)) out[camel]=!!v; else if(k.endsWith('_json')) { try{out[camel.replace(/Json$/,'')]=JSON.parse(v||'[]');}catch{out[camel.replace(/Json$/,'')]=v;} } else out[camel]=v;
  }
  return out;
}
function companyFor(user,id){ return db.prepare('SELECT id,name FROM companies WHERE id=? AND user_id=?').get(id,user.id); }
function employeeFor(user,id){ return db.prepare('SELECT id,company_id FROM employees WHERE id=? AND user_id=?').get(id,user.id); }
function cleanDate(v){ return v ? String(v).slice(0,30) : null; }
function insertRecord(table, fields, body){
  const id=`${table}_${crypto.randomUUID()}`, now=Date.now();
  const cols=['id','user_id',...Object.keys(fields),'created_at'];
  const vals=[id,body.__userId,...Object.values(fields),now];
  const marks=cols.map(()=>'?').join(',');
  db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${marks})`).run(...vals);
  return mapRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
}
function updateRecord(table,id,userId,fields){
  const allowed=Object.keys(fields); if(!allowed.length)return null;
  const set=allowed.map(k=>`${k}=?`).join(',');
  const vals=allowed.map(k=>fields[k]); vals.push(id,userId);
  const r=db.prepare(`UPDATE ${table} SET ${set} WHERE id=? AND user_id=?`).run(...vals);
  return r.changes ? mapRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)) : null;
}
function deleteRecord(table,id,userId){ return db.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).run(id,userId).changes>0; }
function companyRows(table,userId){ return db.prepare(`SELECT * FROM ${table} WHERE user_id=? ORDER BY created_at DESC`).all(userId).map(mapRow); }

async function router(req,res){
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const p=url.pathname; const method=req.method;
  if(p==='/api/health'&&method==='GET') return json(res,200,{ok:true,time:new Date().toISOString()});
  try{
    if(p==='/api/auth/register'&&method==='POST'){const b=await readBody(req); return json(res,201,auth.register(b));}
    if(p==='/api/auth/login'&&method==='POST'){const b=await readBody(req); return json(res,200,auth.login(b));}
    if(p==='/api/auth/me'&&method==='GET'){const user=requireAuth(req,res); if(!user)return; return json(res,200,{user});}
    if(p==='/api/auth/logout'&&method==='POST'){const user=requireAuth(req,res); if(!user)return; auth.destroySession(getToken(req)); return json(res,200,{ok:true});}

    const user=requireAuth(req,res); if(!user)return;
    if(p==='/api/state'&&method==='GET'){
      const companies=db.prepare('SELECT * FROM companies WHERE user_id=? ORDER BY created_at DESC').all(user.id).map(mapCompany);
      const assessments=db.prepare('SELECT * FROM assessments WHERE user_id=? ORDER BY created_at DESC').all(user.id).map(mapAssessment);
      return json(res,200,{companies,assessments});
    }

    if(p==='/api/sst/summary'&&method==='GET'){
      const tables=['employees','pgr','pcmso','ltcat','risks','trainings','asos','cats','esocial_events','documents'];
      const counts={}; for(const t of tables) counts[t]=db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id=?`).get(user.id).n;
      const expiring=db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE user_id=? AND expiry_date IS NOT NULL AND expiry_date<>'' AND date(expiry_date)<=date('now','+30 day')`).get(user.id).n;
      const expired=db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE user_id=? AND expiry_date IS NOT NULL AND expiry_date<>'' AND date(expiry_date)<date('now')`).get(user.id).n;
      return json(res,200,{counts,expiringDocuments:expiring,expiredDocuments:expired});
    }
    if(p==='/api/employees'&&method==='GET') return json(res,200,{employees:companyRows('employees',user.id)});
    if(p==='/api/employees'&&method==='POST'){
      const b=await readBody(req); if(!companyFor(user,b.companyId))return json(res,400,{error:'Empresa não encontrada.'});
      if(!String(b.name||'').trim())return json(res,400,{error:'Informe o nome do colaborador.'});
      b.__userId=user.id;
      const row=insertRecord('employees',{company_id:b.companyId,name:String(b.name).trim(),cpf:b.cpf||null,birth_date:cleanDate(b.birthDate),role:b.role||'',department:b.department||'',admission_date:cleanDate(b.admissionDate),status:b.status||'ativo',esocial_id:b.esocialId||null},b);
      return json(res,201,{employee:row});
    }
    const em=p.match(/^\/api\/employees\/([^/]+)$/);
    if(em&&method==='PUT'){const b=await readBody(req); const row=updateRecord('employees',em[1],user.id,{name:b.name,cpf:b.cpf,birth_date:cleanDate(b.birthDate),role:b.role,department:b.department,admission_date:cleanDate(b.admissionDate),status:b.status,esocial_id:b.esocialId}); if(!row)return json(res,404,{error:'Colaborador não encontrado.'}); return json(res,200,{employee:row});}
    if(em&&method==='DELETE'){if(!deleteRecord('employees',em[1],user.id))return json(res,404,{error:'Colaborador não encontrado.'});return json(res,200,{ok:true});}

    const sstConfigs={
      pgr:{required:['companyId'], fields:b=>({company_id:b.companyId,version:b.version||'1.0',status:b.status||'em elaboração',elaborated_at:cleanDate(b.elaboratedAt),valid_until:cleanDate(b.validUntil),responsible:b.responsible||'',notes:b.notes||''})},
      pcmso:{required:['companyId'], fields:b=>({company_id:b.companyId,version:b.version||'1.0',status:b.status||'em elaboração',elaborated_at:cleanDate(b.elaboratedAt),valid_until:cleanDate(b.validUntil),responsible:b.responsible||'',doctor:b.doctor||'',notes:b.notes||''})},
      ltcat:{required:['companyId'], fields:b=>({company_id:b.companyId,version:b.version||'1.0',status:b.status||'em elaboração',elaborated_at:cleanDate(b.elaboratedAt),valid_until:cleanDate(b.validUntil),responsible:b.responsible||'',technical_responsible:b.technicalResponsible||'',notes:b.notes||''})},
      risks:{required:['companyId','hazard'], fields:b=>({company_id:b.companyId,sector:b.sector||'',hazard_group:b.hazardGroup||'',hazard:String(b.hazard).trim(),source:b.source||'',consequence:b.consequence||'',existing_controls:b.existingControls||'',probability:Number(b.probability)||1,severity:Number(b.severity)||1,risk_level:b.riskLevel||'baixo',responsible:b.responsible||'',due_date:cleanDate(b.dueDate),status:b.status||'aberto'})},
      trainings:{required:['companyId','title'], fields:b=>({company_id:b.companyId,title:String(b.title).trim(),nr:b.nr||'',training_date:cleanDate(b.trainingDate),validity_date:cleanDate(b.validityDate),workload:b.workload||'',instructor:b.instructor||'',status:b.status||'realizado',notes:b.notes||''})},
      documents:{required:['companyId','documentType','title'], fields:b=>({company_id:b.companyId,document_type:b.documentType,title:String(b.title).trim(),issue_date:cleanDate(b.issueDate),expiry_date:cleanDate(b.expiryDate),status:b.status||'vigente',responsible:b.responsible||'',file_url:b.fileUrl||'',notes:b.notes||''})}
    };
    for(const [table,cfg] of Object.entries(sstConfigs)){
      if(p===`/api/${table}`&&method==='GET')return json(res,200,{[table]:companyRows(table,user.id)});
      if(p===`/api/${table}`&&method==='POST'){
        const b=await readBody(req); if(cfg.required.some(k=>!b[k]))return json(res,400,{error:'Preencha os campos obrigatórios.'}); if(!companyFor(user,b.companyId))return json(res,400,{error:'Empresa não encontrada.'}); b.__userId=user.id; const row=insertRecord(table,cfg.fields(b),b); return json(res,201,{[table.slice(0,-1)]:row});
      }
      const rx=new RegExp(`^/api/${table}/([^/]+)$`); const m=rx.exec(p);
      if(m&&method==='PUT'){
        const b=await readBody(req); if(b.companyId&&!companyFor(user,b.companyId))return json(res,400,{error:'Empresa não encontrada.'});
        const mapped=cfg.fields({...b,companyId:b.companyId||undefined}); delete mapped.company_id;
        const row=updateRecord(table,m[1],user.id,mapped); if(!row)return json(res,404,{error:'Registro não encontrado.'}); return json(res,200,{record:row});
      }
      if(m&&method==='DELETE'){if(!deleteRecord(table,m[1],user.id))return json(res,404,{error:'Registro não encontrado.'});return json(res,200,{ok:true});}
    }
    if(p==='/api/asos'&&method==='GET') return json(res,200,{asos:companyRows('asos',user.id)});
    if(p==='/api/asos'&&method==='POST'){
      const b=await readBody(req); const c=companyFor(user,b.companyId), e=employeeFor(user,b.employeeId); if(!c||!e||e.company_id!==c.id)return json(res,400,{error:'Empresa ou colaborador inválido.'}); b.__userId=user.id;
      const row=insertRecord('asos',{company_id:b.companyId,employee_id:b.employeeId,exam_type:b.examType||'admissional',exam_date:cleanDate(b.examDate),result:b.result||'apto',valid_until:cleanDate(b.validUntil),doctor:b.doctor||'',crm:b.crm||'',notes:b.notes||''},b); return json(res,201,{aso:row});
    }
    const asoM=p.match(/^\/api\/asos\/([^/]+)$/); if(asoM&&method==='DELETE'){if(!deleteRecord('asos',asoM[1],user.id))return json(res,404,{error:'ASO não encontrado.'});return json(res,200,{ok:true});}
    if(p==='/api/cats'&&method==='GET') return json(res,200,{cats:companyRows('cats',user.id)});
    if(p==='/api/cats'&&method==='POST'){
      const b=await readBody(req); if(!companyFor(user,b.companyId))return json(res,400,{error:'Empresa não encontrada.'}); if(b.employeeId&&!employeeFor(user,b.employeeId))return json(res,400,{error:'Colaborador inválido.'}); b.__userId=user.id;
      const row=insertRecord('cats',{company_id:b.companyId,employee_id:b.employeeId||null,cat_number:b.catNumber||'',accident_date:cleanDate(b.accidentDate),accident_type:b.accidentType||'típico',description:b.description||'',cid:b.cid||'',status:b.status||'em análise'},b); return json(res,201,{cat:row});
    }
    const catM=p.match(/^\/api\/cats\/([^/]+)$/); if(catM&&method==='DELETE'){if(!deleteRecord('cats',catM[1],user.id))return json(res,404,{error:'CAT não encontrada.'});return json(res,200,{ok:true});}
    if(p==='/api/esocial'&&method==='GET') return json(res,200,{events:companyRows('esocial_events',user.id)});
    if(p==='/api/esocial'&&method==='POST'){
      const b=await readBody(req); if(!companyFor(user,b.companyId))return json(res,400,{error:'Empresa não encontrada.'}); if(b.employeeId&&!employeeFor(user,b.employeeId))return json(res,400,{error:'Colaborador inválido.'}); b.__userId=user.id;
      const row=insertRecord('esocial_events',{company_id:b.companyId,employee_id:b.employeeId||null,event_type:b.eventType||'S-2240',reference:b.reference||'',status:b.status||'pendente',sent_at:cleanDate(b.sentAt),protocol:b.protocol||'',details:b.details||''},b); return json(res,201,{event:row});
    }
    const esM=p.match(/^\/api\/esocial\/([^/]+)$/); if(esM&&method==='DELETE'){if(!deleteRecord('esocial_events',esM[1],user.id))return json(res,404,{error:'Evento não encontrado.'});return json(res,200,{ok:true});}
    if(p==='/api/companies'&&method==='GET') return json(res,200,{companies:db.prepare('SELECT * FROM companies WHERE user_id=? ORDER BY created_at DESC').all(user.id).map(mapCompany)});
    if(p==='/api/companies'&&method==='POST'){
      const b=await readBody(req); const name=String(b.name||'').trim(); if(!name)return json(res,400,{error:'Informe o nome da empresa.'});
      const id=`emp_${crypto.randomUUID()}`, now=Date.now(); db.prepare('INSERT INTO companies (id,user_id,name,cnpj,colaboradores,created_at) VALUES (?,?,?,?,?,?)').run(id,user.id,name,b.cnpj||null,Number(b.colaboradores)||0,now);
      return json(res,201,{company:mapCompany(db.prepare('SELECT * FROM companies WHERE id=?').get(id))});
    }
    const cm=p.match(/^\/api\/companies\/([^/]+)$/);
    if(cm&&method==='DELETE'){
      const id=cm[1]; const exists=db.prepare('SELECT id FROM companies WHERE id=? AND user_id=?').get(id,user.id); if(!exists)return json(res,404,{error:'Empresa não encontrada.'});
      db.prepare('DELETE FROM companies WHERE id=? AND user_id=?').run(id,user.id); return json(res,200,{ok:true});
    }
    if(p==='/api/assessments'&&method==='POST'){
      const b=await readBody(req); const company=db.prepare('SELECT * FROM companies WHERE id=? AND user_id=?').get(b.companyId,user.id); if(!company)return json(res,400,{error:'Empresa não encontrada para este usuário.'});
      const methodName=['hse','copsoq'].includes(b.method)?b.method:null; if(!methodName)return json(res,400,{error:'Método de avaliação inválido.'});
      const id=b.id||`av_${crypto.randomUUID()}`, now=Date.now();
      db.prepare(`INSERT INTO assessments (id,user_id,company_id,method,company_name,title,description,start_date,end_date,active,positive_wording,multisetorial,sectors_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,user.id,company.id,methodName,company.name,String(b.title||'').trim(),b.description||'',b.startDate||'',b.endDate||'',b.active?1:0,b.positiveWording?1:0,b.multisetorial?1:0,JSON.stringify(Array.isArray(b.sectors)?b.sectors:[]),Number(b.createdAt)||now);
      return json(res,201,{assessment:mapAssessment(db.prepare('SELECT * FROM assessments WHERE id=?').get(id))});
    }
    const am=p.match(/^\/api\/assessments\/([^/]+)$/);
    if(am&&method==='DELETE'){
      const id=am[1]; const exists=db.prepare('SELECT id FROM assessments WHERE id=? AND user_id=?').get(id,user.id); if(!exists)return json(res,404,{error:'Avaliação não encontrada.'});
      db.prepare('DELETE FROM assessments WHERE id=? AND user_id=?').run(id,user.id); return json(res,200,{ok:true});
    }
    if(p==='/api/admin/users'&&method==='GET'){
      if(user.role!=='admin')return json(res,403,{error:'Acesso restrito ao administrador.'});
      return json(res,200,{users:db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY created_at').all().map(r=>({id:r.id,name:r.name,email:r.email,role:r.role,createdAt:r.created_at}))});
    }
    return json(res,404,{error:'Rota não encontrada.'});
  }catch(err){ console.error(err); return json(res,400,{error:err.message||'Erro interno.'}); }
}

const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/')) return router(req,res);
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  const target=safePath(req.url); if(!target){res.writeHead(403);return res.end('Forbidden');}
  fs.stat(target,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);return res.end('Not found');} const ext=path.extname(target); res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'}); if(req.method==='HEAD')return res.end(); fs.createReadStream(target).pipe(res);});
});
server.listen(PORT,()=>console.log(`AM TST backend rodando em http://localhost:${PORT}`));
