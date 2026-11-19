import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dataDir = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });
export const db = new Database(path.join(dataDir, 'recruitment.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(item => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function connectDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      industry TEXT DEFAULT '', website TEXT DEFAULT '', email TEXT DEFAULT '',
      phone TEXT DEFAULT '', address TEXT DEFAULT '', status TEXT DEFAULT 'Active',
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY, companyId TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT DEFAULT '', headUserId TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      UNIQUE(companyId, name), FOREIGN KEY(companyId) REFERENCES companies(id),
      FOREIGN KEY(headUserId) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, role TEXT NOT NULL, department TEXT DEFAULT 'People',
      title TEXT DEFAULT '', company TEXT DEFAULT 'Demo Company', companyId TEXT,
      active INTEGER DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, department TEXT NOT NULL, location TEXT DEFAULT 'Hybrid',
      employmentType TEXT DEFAULT 'Full-time', description TEXT DEFAULT '', requirements TEXT DEFAULT '',
      openings INTEGER DEFAULT 1, status TEXT DEFAULT 'Open', assignedRecruiter TEXT,
      createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      FOREIGN KEY(assignedRecruiter) REFERENCES users(id), FOREIGN KEY(createdBy) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT DEFAULT '', job TEXT,
      source TEXT DEFAULT 'Website', experience REAL DEFAULT 0, skills TEXT DEFAULT '[]', resumeUrl TEXT DEFAULT '',
      stage TEXT DEFAULT 'Applied', notes TEXT DEFAULT '', owner TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      FOREIGN KEY(job) REFERENCES jobs(id), FOREIGN KEY(owner) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY, user TEXT, employeeId TEXT UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL,
      department TEXT DEFAULT '', title TEXT DEFAULT '', manager TEXT, joiningDate TEXT,
      status TEXT DEFAULT 'Preboarding', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY, candidate TEXT NOT NULL, job TEXT, panelist TEXT, scheduledAt TEXT NOT NULL,
      mode TEXT DEFAULT 'Online', meetingLink TEXT DEFAULT '', status TEXT DEFAULT 'Scheduled',
      rating REAL, recommendation TEXT, feedback TEXT DEFAULT '', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      FOREIGN KEY(candidate) REFERENCES candidates(id), FOREIGN KEY(job) REFERENCES jobs(id)
    );
    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY, employee TEXT NOT NULL, period TEXT NOT NULL, gross REAL NOT NULL,
      deductions REAL DEFAULT 0, net REAL NOT NULL, status TEXT DEFAULT 'Draft',
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      FOREIGN KEY(employee) REFERENCES employees(id)
    );
  `);

  // Upgrade databases created by earlier versions without deleting existing records.
  ensureColumn('users', 'companyId', 'TEXT');
  ensureColumn('jobs', 'companyId', 'TEXT');
  ensureColumn('candidates', 'companyId', 'TEXT');
  ensureColumn('employees', 'companyId', 'TEXT');
  ensureColumn('interviews', 'companyId', 'TEXT');
  ensureColumn('payroll', 'companyId', 'TEXT');

  const timestamp = now();
  let defaultCompany = db.prepare('SELECT id FROM companies WHERE slug = ?').get('demo-company');
  if (!defaultCompany) {
    const id = uid();
    db.prepare('INSERT INTO companies(id,name,slug,createdAt,updatedAt) VALUES(?,?,?,?,?)')
      .run(id, 'Demo Company', 'demo-company', timestamp, timestamp);
    defaultCompany = { id };
  }
  db.prepare("UPDATE users SET companyId = ? WHERE companyId IS NULL OR companyId = ''")
    .run(defaultCompany.id);
  db.prepare("UPDATE jobs SET companyId = ? WHERE companyId IS NULL OR companyId = ''")
    .run(defaultCompany.id);
  db.prepare("UPDATE candidates SET companyId = ? WHERE companyId IS NULL OR companyId = ''")
    .run(defaultCompany.id);
  db.prepare("UPDATE employees SET companyId = ? WHERE companyId IS NULL OR companyId = ''")
    .run(defaultCompany.id);
  db.prepare("UPDATE interviews SET companyId = ? WHERE companyId IS NULL OR companyId = ''")
    .run(defaultCompany.id);
  db.prepare("UPDATE payroll SET companyId = ? WHERE companyId IS NULL OR companyId = ''")
    .run(defaultCompany.id);

  const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
  if (!userColumns.includes('companyId')) db.exec('ALTER TABLE users ADD COLUMN companyId TEXT');
  console.log(`SQLite database ready: ${path.join(dataDir, 'recruitment.sqlite')}`);
}

export const now = () => new Date().toISOString();
export const uid = () => randomUUID();
export function rowWithId(row) {
  if (!row) return null;
  const { id, password, ...rest } = row;
  return { _id: id, ...rest };
}
export function rowsWithId(rows) { return rows.map(rowWithId); }
export function parseJson(value, fallback = []) {
  try { return JSON.parse(value ?? ''); } catch { return fallback; }
}
