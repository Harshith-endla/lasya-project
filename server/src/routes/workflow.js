import { Router } from 'express';
import { db, uid, now, rowWithId } from '../config/db.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { hasPermission } from '../config/permissions.js';

const router = Router();
router.use(protect);

const configs = {
  assessments: {
    table: 'assessments', permission: 'assessments',
    fields: ['candidateId', 'title', 'assessmentType', 'dueDate', 'score', 'status'],
    required: ['candidateId', 'title'], defaults: { assessmentType: 'Technical', status: 'Pending' }
  },
  offers: {
    table: 'offers', permission: 'offers',
    fields: ['candidateId', 'jobTitle', 'salary', 'joiningDate', 'status'],
    required: ['candidateId'], defaults: { status: 'Draft' }
  },
  onboarding: {
    table: 'onboarding_tasks', permission: 'onboarding',
    fields: ['employeeId', 'title', 'dueDate', 'status', 'notes'],
    required: ['employeeId', 'title'], defaults: { status: 'Pending' }
  }
};

function companyRecord(table, id, companyId) {
  return db.prepare(`SELECT * FROM ${table} WHERE id=? AND companyId=?`).get(id, companyId);
}
function isSuper(req) { return req.user.role === 'SUPER_ADMIN'; }

for (const [key, cfg] of Object.entries(configs)) {
  router.get('/' + key, (req, res, next) => {
    const selfEmployee = key === 'onboarding' && req.user.role === 'EMPLOYEE';
    if (!selfEmployee && !hasPermission(req.user.role, cfg.permission + ':read')) return res.status(403).json({ message: 'You do not have permission to view this module.' });
    try {
      let rows;
      if (isSuper(req)) rows = db.prepare('SELECT * FROM ' + cfg.table + ' ORDER BY createdAt DESC').all();
      else if (selfEmployee) rows = db.prepare(
        'SELECT t.* FROM onboarding_tasks t JOIN employees e ON e.id=t.employeeId WHERE t.companyId=? AND e.email=? ORDER BY t.createdAt DESC'
      ).all(req.user.companyId, req.user.email);
      else rows = db.prepare('SELECT * FROM ' + cfg.table + ' WHERE companyId=? ORDER BY createdAt DESC').all(req.user.companyId);
      res.json(rows.map(rowWithId));
    } catch (error) { next(error); }
  });

  router.post('/' + key, requirePermission(cfg.permission + ':create'), (req, res, next) => {
    try {
      const body = req.body || {};
      for (const field of cfg.required) {
        if (body[field] === undefined || body[field] === null || String(body[field]).trim() === '')
          return res.status(400).json({ message: field + ' is required' });
      }
      const companyId = isSuper(req) ? (body.companyId || req.user.companyId) : req.user.companyId;
      if (!companyId || !db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))
        return res.status(400).json({ message: 'A valid company workspace is required' });
      if (cfg.fields.includes('candidateId') && body.candidateId &&
          !companyRecord('candidates', body.candidateId, companyId))
        return res.status(400).json({ message: 'Candidate must belong to this company' });
      if (cfg.fields.includes('employeeId') && body.employeeId &&
          !companyRecord('employees', body.employeeId, companyId))
        return res.status(400).json({ message: 'Employee must belong to this company' });
      const id = uid(), timestamp = now();
      const values = cfg.fields.map(field => body[field] ?? cfg.defaults[field] ?? null);
      db.prepare('INSERT INTO ' + cfg.table + '(id,companyId,' + cfg.fields.join(',') +
        ',createdAt,updatedAt) VALUES(' + Array(cfg.fields.length + 4).fill('?').join(',') + ')')
        .run(id, companyId, ...values, timestamp, timestamp);
      res.status(201).json(rowWithId(db.prepare('SELECT * FROM ' + cfg.table + ' WHERE id=?').get(id)));
    } catch (error) { next(error); }
  });

  router.patch('/' + key + '/:id', (req, res, next) => {
    const selfEmployee = key === 'onboarding' && req.user.role === 'EMPLOYEE';
    const permission = selfEmployee ? 'onboarding:update:self' : cfg.permission + ':update';
    requirePermission(permission)(req, res, () => {
      try {
        const current = isSuper(req)
          ? db.prepare('SELECT * FROM ' + cfg.table + ' WHERE id=?').get(req.params.id)
          : companyRecord(cfg.table, req.params.id, req.user.companyId);
        if (!current) return res.status(404).json({ message: 'Record not found' });
        if (selfEmployee) {
          const assigned = db.prepare('SELECT id FROM employees WHERE id=? AND email=? AND companyId=?')
            .get(current.employeeId, req.user.email, req.user.companyId);
          if (!assigned) return res.status(403).json({ message: 'You can only update your own onboarding tasks' });
        }
        const allowed = selfEmployee ? ['status', 'notes'] : cfg.fields;
        const updates = allowed.filter(field => req.body?.[field] !== undefined);
        if (!updates.length) return res.json(rowWithId(current));
        if (req.body.candidateId && cfg.fields.includes('candidateId') &&
            !companyRecord('candidates', req.body.candidateId, current.companyId))
          return res.status(400).json({ message: 'Candidate must belong to this company' });
        if (req.body.employeeId && cfg.fields.includes('employeeId') &&
            !companyRecord('employees', req.body.employeeId, current.companyId))
          return res.status(400).json({ message: 'Employee must belong to this company' });
        db.prepare('UPDATE ' + cfg.table + ' SET ' + updates.map(field => field + '=?').join(',') +
          ',updatedAt=? WHERE id=? AND companyId=?')
          .run(...updates.map(field => req.body[field]), now(), req.params.id, current.companyId);
        res.json(rowWithId(db.prepare('SELECT * FROM ' + cfg.table + ' WHERE id=?').get(req.params.id)));
      } catch (error) { next(error); }
    });
  });
}

router.get('/notifications', (req, res, next) => {
  if (!hasPermission(req.user.role, 'notifications:read') && !hasPermission(req.user.role, 'notifications:read:self'))
    return res.status(403).json({ message: 'You do not have permission to view notifications.' });
  try {
    const rows = isSuper(req)
      ? db.prepare('SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 100').all()
      : req.user.role === 'EMPLOYEE'
        ? db.prepare('SELECT * FROM notifications WHERE companyId=? AND userId=? ORDER BY createdAt DESC LIMIT 100').all(req.user.companyId, req.user._id)
        : db.prepare('SELECT * FROM notifications WHERE companyId=? AND (userId IS NULL OR userId=?) ORDER BY createdAt DESC LIMIT 100').all(req.user.companyId, req.user._id);
    res.json(rows.map(rowWithId));
  } catch (error) { next(error); }
});

router.post('/notifications', requirePermission('notifications:create'), (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });
    if (!req.user.companyId) return res.status(400).json({ message: 'Company workspace required' });
    const userId = req.body.userId || null;
    if (userId && !db.prepare('SELECT id FROM users WHERE id=? AND companyId=?').get(userId, req.user.companyId))
      return res.status(400).json({ message: 'Recipient must belong to this company' });
    const id = uid();
    db.prepare('INSERT INTO notifications(id,companyId,userId,title,message,channel,status,createdAt) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, req.user.companyId, userId, title, message, 'In-app', 'Unread', now());
    res.status(201).json(rowWithId(db.prepare('SELECT * FROM notifications WHERE id=?').get(id)));
  } catch (error) { next(error); }
});

router.post('/resume-screening', requirePermission('resumes:read'), (req, res) => {
  const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
  const requirements = String(req.body?.requirements || '').toLowerCase();
  const matchedSkills = skills.filter(skill => requirements.includes(String(skill).toLowerCase()));
  res.json({
    matchedSkills,
    missingSkills: skills.filter(skill => !matchedSkills.includes(skill)),
    matchPercent: skills.length ? Math.round(matchedSkills.length / skills.length * 100) : 0,
    note: 'Keyword-based screening only. Review the original resume and assess candidates fairly; this is not an automated hiring decision.'
  });
});

export default router;
