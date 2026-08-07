const crypto = require('node:crypto');
const { db } = require('./db');

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1;

function id(prefix){ return `${prefix}_${crypto.randomUUID()}`; }
function normalizeEmail(email){ return String(email || '').trim().toLowerCase(); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')){
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt){
  const candidate = Buffer.from(hashPassword(password, salt).hash, 'hex');
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}
function publicUser(row){ return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at }; }
function createSession(userId){
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)').run(id('ses'),userId,tokenHash,expires,now);
  return { token, expiresAt: expires };
}
function getUserFromToken(token){
  if(!token) return null;
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const row=db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash,Date.now());
  return row ? publicUser(row) : null;
}
function destroySession(token){
  if(!token)return;
  const h=crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(h);
}
function register({name,email,password}){
  name=String(name||'').trim(); email=normalizeEmail(email);
  if(name.length<2) throw new Error('Informe um nome válido.');
  if(!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Informe um e-mail válido.');
  if(String(password||'').length<8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
  const exists=db.prepare('SELECT id FROM users WHERE email=?').get(email); if(exists) throw new Error('Este e-mail já está cadastrado.');
  const count=db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const {hash,salt}=hashPassword(password); const userId=id('usr'); const now=Date.now(); const role=count===0?'admin':'user';
  db.prepare('INSERT INTO users (id,name,email,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,?,?)').run(userId,name,email,hash,salt,role,now);
  const user=publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(userId));
  return { user, ...createSession(userId) };
}
function login({email,password}){
  email=normalizeEmail(email);
  const row=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if(!row || !verifyPassword(String(password||''),row.password_hash,row.password_salt)) throw new Error('E-mail ou senha inválidos.');
  return { user:publicUser(row), ...createSession(row.id) };
}
module.exports={register,login,getUserFromToken,destroySession,publicUser};
