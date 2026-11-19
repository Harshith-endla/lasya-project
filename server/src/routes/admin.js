import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, uid, now, rowWithId, rowsWithId } from '../config/db.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect);

const clean = value => String(value ?? '').trim();
const allowedRoles = new Set([
  'SUPER_ADMIN','COMPANY_ADMIN','HR_MANAGER','RECRUITER','INTERVIEW_PANEL',
  'REPORTING_MANAGER','FINANCE_PAYROLL','EMPLOYEE','CEO'
]);
const roleCreationPolicy = {
  SUPER_ADMIN: allowedRoles,
  COMPANY_ADMIN: new Set(['HR_MANAGER','RECRUITER','INTERVIEW_PANEL','REPORTING_MANAGER','FINANCE_PAYROLL','EMPLOYEE','CEO']),
  HR_MANAGER: new Set(['RECRUITER','INTERVIEW_PANEL','EMPLOYEE'])
};
const companyFor = req => req.user.role === 'SUPER_ADMIN'
  ? clean(req.query.companyId || req.body.companyId)
  : req.user.companyId;

router.get('/companies', (req,res,next) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({message:'Only Super Admin can view all companies'});
  const rows = db.prepare('SELECT id,name,slug,industry,website,email,phone,address,status,createdAt,updatedAt FROM companies ORDER BY createdAt DESC').all();
  res.json({companies: rowsWithId(rows)});
});

router.post('/companies', (req,res,next) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({message:'Only Super Admin can create companies'});
  const name = clean(req.body.name);
  const slug = clean(req.body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));
  if (!name || !slug) return res.status(400).json({message:'Company name is required'});
  const id = uid(), timestamp = now();
  try {
    db.prepare('INSERT INTO companies(id,name,slug,industry,website,email,phone,address,status,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,name,slug,clean(req.body.industry),clean(req.body.website),clean(req.body.email),clean(req.body.phone),clean(req.body.address),'Active',timestamp,timestamp);
    res.status(201).json({company: rowWithId(db.prepare('SELECT * FROM companies WHERE id=?').get(id))});
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({message:'A company with this slug already exists'});
    next(error);
  }
});

router.get('/users', requirePermission('users:read'), (req,res) => {
  const companyId = companyFor(req);
  if (req.user.role !== 'SUPER_ADMIN' && !companyId) return res.status(403).json({message:'Your account is not assigned to a company'});
  const rows = req.user.role === 'SUPER_ADMIN' && !companyId
    ? db.prepare('SELECT id,name,email,role,department,title,company,companyId,active,createdAt FROM users ORDER BY name').all()
    : db.prepare('SELECT id,name,email,role,department,title,company,companyId,active,createdAt FROM users WHERE companyId=? ORDER BY name').all(companyId);
  res.json({users: rowsWithId(rows)});
});

router.post('/users', requirePermission('users:create'), async (req,res,next) => {
  try {
    const name = clean(req.body.name), email = clean(req.body.email).toLowerCase();
    const role = clean(req.body.role).toUpperCase(), password = String(req.body.password || '');
    const department = clean(req.body.department) || 'People';
    const companyId = companyFor(req);
    if (!name || !email || !role || !password) return res.status(400).json({message:'Name, email, role and temporary password are required'});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({message:'Enter a valid email address'});
    if (password.length < 8) return res.status(400).json({message:'Temporary password must contain at least 8 characters'});
    if (!roleCreationPolicy[req.user.role]?.has(role)) return res.status(403).json({message:'You cannot create an account with this role'});
    if (role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') return res.status(403).json({message:'Only Super Admin can create a Super Admin'});
    if (!companyId) return res.status(400).json({message:'Select a company for this account'});
    const company = db.prepare('SELECT id,name FROM companies WHERE id=?').get(companyId);
    if (!company) return res.status(404).json({message:'Company not found'});
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({message:'An account with this email already exists'});
    const timestamp = now(), id = uid(), hash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users(id,name,email,password,role,department,title,company,companyId,active,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,name,email,hash,role,department,clean(req.body.title),company.name,companyId,1,timestamp,timestamp);
    const created = db.prepare('SELECT id,name,email,role,department,title,company,companyId,active,createdAt FROM users WHERE id=?').get(id);
    res.status(201).json({user: rowWithId(created)});
  } catch (error) { next(error); }
});

router.get('/departments', requirePermission('departments:read'), (req,res) => {
  const companyId = companyFor(req);
  if (!companyId) return res.status(400).json({message:'A company must be selected'});
  const rows = db.prepare('SELECT d.*,u.name AS headName FROM departments d LEFT JOIN users u ON u.id=d.headUserId WHERE d.companyId=? ORDER BY d.name').all(companyId);
  res.json({departments: rowsWithId(rows)});
});

router.post('/departments', requirePermission('departments:create'), (req,res,next) => {
  const name = clean(req.body.name), description = clean(req.body.description);
  const companyId = companyFor(req), headUserId = clean(req.body.headUserId) || null;
  if (!name) return res.status(400).json({message:'Department name is required'});
  if (!companyId) return res.status(400).json({message:'Your account is not assigned to a company'});
  if (headUserId) {
    const head = db.prepare('SELECT id FROM users WHERE id=? AND companyId=?').get(headUserId,companyId);
    if (!head) return res.status(400).json({message:'Department head must belong to the same company'});
  }
  const timestamp = now(), id = uid();
  try {
    db.prepare('INSERT INTO departments(id,companyId,name,description,headUserId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)')
      .run(id,companyId,name,description,headUserId,timestamp,timestamp);
    res.status(201).json({department: rowWithId(db.prepare('SELECT * FROM departments WHERE id=?').get(id))});
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({message:'This department already exists'});
    next(error);
  }
});

export default router;
