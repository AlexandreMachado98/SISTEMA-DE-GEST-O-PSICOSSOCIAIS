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
