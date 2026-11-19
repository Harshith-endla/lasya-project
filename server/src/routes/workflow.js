import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, now, rowWithId } from '../config/db.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { hasPermission } from '../config/permissions.js';

const router = Router();
router.use(protect);

const configs = {
  assessments: {
    table: 'assessments', permission: 'assessments',
    fields: ['candidateId', 'title', 'assessmentType', 'dueDate', 'score', 'status', 'instructions', 'questions', 'maxScore'],
    required: ['candidateId', 'title'], defaults: { assessmentType: 'Technical', status: 'Pending' }
  },
  offers: {
    table: 'offers', permission: 'offers',
    fields: ['candidateId', 'jobTitle', 'salary', 'joiningDate', 'status', 'letterText'],
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
function validateQuestions(value){
 if(value===undefined)return null;
 if(!Array.isArray(value))throw Object.assign(new Error('Questions must be a JSON array'),{status:400});
 if(value.length>100)throw Object.assign(new Error('An assessment can contain at most 100 questions'),{status:400});
 return JSON.stringify(value.map((q,index)=>{
  if(!q||typeof q.prompt!=='string'||!q.prompt.trim())throw Object.assign(new Error('Question '+(index+1)+' needs a prompt'),{status:400});
  if(!Array.isArray(q.options)||q.options.length<2||q.options.length>8)throw Object.assign(new Error('Question '+(index+1)+' must have 2 to 8 options'),{status:400});
  const answer=Number(q.answer);
  if(!Number.isInteger(answer)||answer<0||answer>=q.options.length)throw Object.assign(new Error('Question '+(index+1)+' has an invalid correct option index'),{status:400});
  return {prompt:q.prompt.trim(),options:q.options.map(option=>String(option).slice(0,500)),answer};
 }));
}

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
      res.json(rows.map(row => { const item = rowWithId(row); if (key === 'assessments') { try { item.questions = JSON.parse(item.questions || '[]').map(({ answer, ...question }) => question); } catch { item.questions = []; } } if (key === 'onboarding') delete item.documentPath; return item; }));
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
      if(key==='assessments'&&body.maxScore!==undefined&&(!Number.isFinite(Number(body.maxScore))||Number(body.maxScore)<=0||Number(body.maxScore)>10000))return res.status(400).json({message:'Maximum score must be between 1 and 10,000'});
      const normalizedQuestions=key==='assessments'?validateQuestions(body.questions):null;
      const values = cfg.fields.map(field => { const value = body[field] ?? cfg.defaults[field] ?? null; return field === 'questions' ? (normalizedQuestions ?? (Array.isArray(value)?JSON.stringify(value):value)) : value; });
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
        if(key==='assessments'&&req.body?.maxScore!==undefined&&(!Number.isFinite(Number(req.body.maxScore))||Number(req.body.maxScore)<=0||Number(req.body.maxScore)>10000))return res.status(400).json({message:'Maximum score must be between 1 and 10,000'});
        const normalizedQuestions=key==='assessments'?validateQuestions(req.body?.questions):null;
        if (!updates.length) return res.json(rowWithId(current));
        if (req.body.candidateId && cfg.fields.includes('candidateId') &&
            !companyRecord('candidates', req.body.candidateId, current.companyId))
          return res.status(400).json({ message: 'Candidate must belong to this company' });
        if (req.body.employeeId && cfg.fields.includes('employeeId') &&
            !companyRecord('employees', req.body.employeeId, current.companyId))
          return res.status(400).json({ message: 'Employee must belong to this company' });
        db.prepare('UPDATE ' + cfg.table + ' SET ' + updates.map(field => field + '=?').join(',') +
          ',updatedAt=? WHERE id=? AND companyId=?')
          .run(...updates.map(field => field === 'questions' ? normalizedQuestions : req.body[field]), now(), req.params.id, current.companyId);
        res.json(rowWithId(db.prepare('SELECT * FROM ' + cfg.table + ' WHERE id=?').get(req.params.id)));
      } catch (error) { next(error); }
    });
  });
}



const onboardingDir=path.resolve(process.env.DATA_DIR||'data','onboarding-documents');
fs.mkdirSync(onboardingDir,{recursive:true});
function pdfUpload(req,res,next){
 if(!req.is('application/pdf'))return res.status(415).json({message:'Content-Type must be application/pdf'});
 const chunks=[];let size=0,tooLarge=false;
 req.on('data',chunk=>{if(tooLarge)return;size+=chunk.length;if(size>5*1024*1024){tooLarge=true;chunks.length=0;return;}chunks.push(chunk);});
 req.on('end',()=>{if(tooLarge)return res.status(413).json({message:'Document must be 5 MB or smaller'});req.pdfBuffer=Buffer.concat(chunks);if(req.pdfBuffer.subarray(0,5).toString()!=='%PDF-')return res.status(415).json({message:'Only valid PDF files are accepted'});next();});
 req.on('error',next);
}
function onboardingRecord(id,req){
 return isSuper(req)?db.prepare('SELECT * FROM onboarding_tasks WHERE id=?').get(id):companyRecord('onboarding_tasks',id,req.user.companyId);
}
function canAccessOwnTask(task,req){
 if(req.user.role!=='EMPLOYEE')return true;
 return !!db.prepare('SELECT id FROM employees WHERE id=? AND email=? AND companyId=?').get(task.employeeId,req.user.email,req.user.companyId);
}
router.post('/onboarding/:id/document',(req,res,next)=>{
 const permission=req.user.role==='EMPLOYEE'?'onboarding:update:self':'onboarding:update';
 requirePermission(permission)(req,res,()=>pdfUpload(req,res,()=>{
  try{
   const task=onboardingRecord(req.params.id,req);
   if(!task)return res.status(404).json({message:'Onboarding task not found'});
   if(!canAccessOwnTask(task,req))return res.status(403).json({message:'You can only upload documents for your own onboarding'});
   const filename=uid()+'.pdf';
   fs.writeFileSync(path.join(onboardingDir,filename),req.pdfBuffer,{flag:'wx'});
   db.prepare('UPDATE onboarding_tasks SET documentName=?,documentPath=?,updatedAt=? WHERE id=? AND companyId=?')
    .run('onboarding-document.pdf',filename,now(),task.id,task.companyId);
   res.status(201).json({message:'Document uploaded',documentName:'onboarding-document.pdf'});
  }catch(error){next(error);}
 }));
});
router.get('/onboarding/:id/document',(req,res,next)=>{
 const permitted=hasPermission(req.user.role,'onboarding:read')||hasPermission(req.user.role,'onboarding:read:self');
 if(!permitted)return res.status(403).json({message:'You do not have permission to view onboarding documents'});
 try{
  const task=onboardingRecord(req.params.id,req);
  if(!task)return res.status(404).json({message:'Onboarding task not found'});
  if(!canAccessOwnTask(task,req))return res.status(403).json({message:'You can only view your own onboarding documents'});
  if(!task.documentPath)return res.status(404).json({message:'No document uploaded'});
  const file=path.join(onboardingDir,path.basename(task.documentPath));
  if(!fs.existsSync(file))return res.status(404).json({message:'Document file unavailable'});
  res.type('application/pdf').setHeader('Content-Disposition','inline; filename="onboarding-document.pdf"');
  res.sendFile(file);
 }catch(error){next(error);}
});

router.post('/assessments/:id/grade', requirePermission('assessments:update'), (req,res,next)=>{
 try {
  const assessment=isSuper(req)
   ? db.prepare('SELECT * FROM assessments WHERE id=?').get(req.params.id)
   : companyRecord('assessments',req.params.id,req.user.companyId);
  if(!assessment)return res.status(404).json({message:'Assessment not found'});
  let questions=[];
  try{questions=JSON.parse(assessment.questions||'[]');}catch{}
  if(!questions.length)return res.status(400).json({message:'This assessment has no configured questions'});
  const answers=req.body?.answers;
  if(!answers||typeof answers!=='object'||Array.isArray(answers))
   return res.status(400).json({message:'Provide an answer for each question'});
  const valid=questions.filter(q=>q.answer!==undefined&&q.answer!==null);
  if(!valid.length)return res.status(400).json({message:'Questions need answer keys before automatic scoring'});
  const correct=questions.reduce((total,q,index)=>total+(q.answer!==undefined&&q.answer!==null&&String(answers[index]??'')===String(q.answer)?1:0),0);
  const score=Math.round((correct/valid.length)*Number(assessment.maxScore||100)*100)/100;
  db.prepare("UPDATE assessments SET score=?,status='Completed',submission=?,submittedAt=?,updatedAt=? WHERE id=? AND companyId=?")
   .run(score,JSON.stringify(answers),now(),now(),assessment.id,assessment.companyId);
  res.json({message:'Assessment graded',score,maxScore:Number(assessment.maxScore||100),correct,total:valid.length});
 }catch(error){next(error);}
});

router.get('/offers/:id/letter', requirePermission('offers:read'), (req,res,next)=>{
 try{
  const offer=isSuper(req)?db.prepare('SELECT o.*,c.name AS candidateName,c.email AS candidateEmail FROM offers o JOIN candidates c ON c.id=o.candidateId WHERE o.id=?').get(req.params.id)
   :db.prepare('SELECT o.*,c.name AS candidateName,c.email AS candidateEmail FROM offers o JOIN candidates c ON c.id=o.candidateId WHERE o.id=? AND o.companyId=?').get(req.params.id,req.user.companyId);
  if(!offer)return res.status(404).json({message:'Offer not found'});
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Offer letter</title><style>body{font:15px Arial,sans-serif;max-width:760px;margin:50px auto;line-height:1.65;color:#222}h1{font-size:24px}button{padding:10px 16px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>Employment Offer</h1><p>Date: '+esc(new Date().toLocaleDateString('en-IN'))+'</p><p>Dear '+esc(offer.candidateName)+',</p><p>We are pleased to offer you the position of <b>'+esc(offer.jobTitle||'')+'</b>.</p><p>Annual compensation: '+esc(offer.salary||'To be discussed')+'</p><p>Proposed joining date: '+esc(offer.joiningDate||'To be confirmed')+'</p><p>'+esc(offer.letterText||'Please contact the HR team for further details and next steps.')+'</p><p>Regards,<br>Human Resources</p></body></html>';
  res.type('html').send(html);
 }catch(error){next(error);}
});

router.get('/notifications', (req, res, next) => {
  if (!hasPermission(req.user.role, 'notifications:read') && !hasPermission(req.user.role, 'notifications:read:self'))
    return res.status(403).json({ message: 'You do not have permission to view notifications.' });
  try {
    const rows = isSuper(req)
      ? db.prepare('SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 100').all()
      : req.user.role === 'EMPLOYEE'
        ? db.prepare('SELECT * FROM notifications WHERE companyId=? AND (userId IS NULL OR userId=?) ORDER BY createdAt DESC LIMIT 100').all(req.user.companyId, req.user._id)
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

router.patch('/notifications/:id/read',(req,res,next)=>{
 try{
  const notification=isSuper(req)
   ? db.prepare('SELECT * FROM notifications WHERE id=?').get(req.params.id)
   : db.prepare('SELECT * FROM notifications WHERE id=? AND companyId=? AND (userId IS NULL OR userId=?)').get(req.params.id,req.user.companyId,req.user._id);
  if(!notification)return res.status(404).json({message:'Notification not found'});
  db.prepare("UPDATE notifications SET status='Read' WHERE id=? AND companyId=?").run(notification.id,notification.companyId);
  res.json({message:'Notification marked as read'});
 }catch(error){next(error);}
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
