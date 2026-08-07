const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.resolve(process.env.DB_PATH || path.join(dataDir, 'am-tst.sqlite'));

const db = new DatabaseSync(dbPath);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cnpj TEXT,
  colaboradores INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_user ON companies(user_id);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK(method IN ('hse','copsoq')),
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  positive_wording INTEGER NOT NULL DEFAULT 0,
  multisetorial INTEGER NOT NULL DEFAULT 0,
  sectors_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assessments_user ON assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_company ON assessments(company_id);


CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  birth_date TEXT,
  role TEXT,
  department TEXT,
  admission_date TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','afastado','desligado')),
  esocial_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);

CREATE TABLE IF NOT EXISTS pgr (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'em elaboração' CHECK(status IN ('em elaboração','vigente','revisão','encerrado')),
  elaborated_at TEXT,
  valid_until TEXT,
  responsible TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pgr_company ON pgr(company_id);

CREATE TABLE IF NOT EXISTS pcmso (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'em elaboração' CHECK(status IN ('em elaboração','vigente','revisão','encerrado')),
  elaborated_at TEXT,
  valid_until TEXT,
  responsible TEXT,
  doctor TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pcmso_company ON pcmso(company_id);

CREATE TABLE IF NOT EXISTS ltcat (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'em elaboração' CHECK(status IN ('em elaboração','vigente','revisão','encerrado')),
  elaborated_at TEXT,
  valid_until TEXT,
  responsible TEXT,
  technical_responsible TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ltcat_company ON ltcat(company_id);

CREATE TABLE IF NOT EXISTS risks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sector TEXT NOT NULL DEFAULT '',
  hazard_group TEXT NOT NULL DEFAULT '',
  hazard TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  consequence TEXT NOT NULL DEFAULT '',
  existing_controls TEXT NOT NULL DEFAULT '',
  probability INTEGER NOT NULL DEFAULT 1,
  severity INTEGER NOT NULL DEFAULT 1,
  risk_level TEXT NOT NULL DEFAULT 'baixo',
  responsible TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','em tratamento','concluído')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risks_company ON risks(company_id);

CREATE TABLE IF NOT EXISTS trainings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  nr TEXT NOT NULL DEFAULT '',
  training_date TEXT,
  validity_date TEXT,
  workload TEXT NOT NULL DEFAULT '',
  instructor TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'realizado' CHECK(status IN ('agendado','realizado','vencido')),
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trainings_company ON trainings(company_id);

CREATE TABLE IF NOT EXISTS asos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL DEFAULT 'admissional',
  exam_date TEXT,
  result TEXT NOT NULL DEFAULT 'apto',
  valid_until TEXT,
  doctor TEXT NOT NULL DEFAULT '',
  crm TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asos_company ON asos(company_id);
CREATE INDEX IF NOT EXISTS idx_asos_employee ON asos(employee_id);

CREATE TABLE IF NOT EXISTS cats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  cat_number TEXT NOT NULL DEFAULT '',
  accident_date TEXT,
  accident_type TEXT NOT NULL DEFAULT 'típico',
  description TEXT NOT NULL DEFAULT '',
  cid TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'em análise' CHECK(status IN ('em análise','emitida','encerrada')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cats_company ON cats(company_id);

CREATE TABLE IF NOT EXISTS esocial_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','enviado','processado','erro')),
  sent_at TEXT,
  protocol TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_esocial_company ON esocial_events(company_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  issue_date TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'vigente' CHECK(status IN ('vigente','próximo do vencimento','vencido','em elaboração')),
  responsible TEXT NOT NULL DEFAULT '',
  file_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);
`);

module.exports = { db, dbPath };
