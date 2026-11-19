import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { db, uid, now, rowWithId } from '../config/db.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { hasPermission } from '../config/permissions.js';

const router = Router();
const workflowStatuses={assessments:['Pending','In Progress','Completed'],offers:['Draft','Sent','Accepted','Declined','Withdrawn'],onboarding:['Pending','In Progress','Completed']};
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
      else if(req.user.role==='INTERVIEW_PANEL'&&key==='assessments') rows=db.prepare('SELECT DISTINCT a.* FROM assessments a JOIN interviews i ON i.candidate=a.candidateId WHERE a.companyId=? AND i.panelist=? ORDER BY a.createdAt DESC').all(req.user.companyId,req.user._id);
      else if(req.user.role==='RECRUITER'&&key==='assessments') rows=db.prepare('SELECT a.* FROM assessments a JOIN candidates c ON c.id=a.candidateId WHERE a.companyId=? AND c.owner=? ORDER BY a.createdAt DESC').all(req.user.companyId,req.user._id);
      else if(req.user.role==='RECRUITER'&&key==='offers') rows=db.prepare('SELECT o.* FROM offers o JOIN candidates c ON c.id=o.candidateId WHERE o.companyId=? AND c.owner=? ORDER BY o.createdAt DESC').all(req.user.companyId,req.user._id);
      else rows = db.prepare('SELECT * FROM ' + cfg.table + ' WHERE companyId=? ORDER BY createdAt DESC').all(req.user.companyId);
      res.json(rows.map(row => { const item = rowWithId(row); if (key === 'assessments') { try { item.questions = JSON.parse(item.questions || '[]').map(({ answer, ...question }) => question); } catch { item.questions = []; } } if (key === 'onboarding') delete item.documentPath; return item; }));
    } catch (error) { next(error); }
  });

  router.post('/' + key, requirePermission(cfg.permission + ':create'), (req, res, next) => {
    try {
      const body = req.body || {};
      if(body.status&&!workflowStatuses[key].includes(body.status))return res.status(400).json({message:'Invalid '+key+' status'});
      for (const field of cfg.required) {
        if (body[field] === undefined || body[field] === null || String(body[field]).trim() === '')
          return res.status(400).json({ message: field + ' is required' });
      }
      const companyId = isSuper(req) ? (body.companyId || req.user.companyId) : req.user.companyId;
      if (!companyId || !db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))
        return res.status(400).json({ message: 'A valid company workspace is required' });
      if (cfg.fields.includes('candidateId') && body.candidateId) {
        const targetCandidate=companyRecord('candidates',body.candidateId,companyId);
        if(!targetCandidate)return res.status(400).json({message:'Candidate must belong to this company'});
        if(req.user.role==='RECRUITER'&&targetCandidate.owner!==req.user._id)return res.status(403).json({message:'You can only create assessments for candidates assigned to you'});
      }
      if (cfg.fields.includes('employeeId') && body.employeeId &&
          !companyRecord('employees', body.employeeId, companyId))
        return res.status(400).json({ message: 'Employee must belong to this company' });
      const id = uid(), timestamp = now();
      if(key==='assessments'&&body.maxScore!==undefined&&(!Number.isFinite(Number(body.maxScore))||Number(body.maxScore)<=0||Number(body.maxScore)>10000))return res.status(400).json({message:'Maximum score must be between 1 and 10,000'});
      const normalizedQuestions=key==='assessments'?validateQuestions(body.questions):null;
      if(key==='assessments'&&(!normalizedQuestions||JSON.parse(normalizedQuestions).length===0))return res.status(400).json({message:'Add at least one valid assessment question'});
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
        if(req.user.role==='INTERVIEW_PANEL'&&key==='assessments'&&!db.prepare('SELECT id FROM interviews WHERE candidate=? AND panelist=? AND companyId=?').get(current.candidateId,req.user._id,current.companyId))return res.status(403).json({message:'You can only update assessments for candidates in your assigned interviews'});
        if (key==='assessments'&&current.status==='Completed')return res.status(409).json({message:'Completed assessments cannot be edited'});
        if (selfEmployee) {
          const assigned = db.prepare('SELECT id FROM employees WHERE id=? AND email=? AND companyId=?')
            .get(current.employeeId, req.user.email, req.user.companyId);
          if (!assigned) return res.status(403).json({ message: 'You can only update your own onboarding tasks' });
        }
        const allowed = selfEmployee ? ['status', 'notes'] : (req.user.role==='INTERVIEW_PANEL'&&key==='assessments'?['status']:cfg.fields);
        if(req.body?.status&&!workflowStatuses[key].includes(req.body.status))return res.status(400).json({message:'Invalid '+key+' status'});
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
  if(assessment.status==='Completed')return res.status(409).json({message:'Completed assessments cannot be graded again'});
  if(req.user.role==='INTERVIEW_PANEL'&&!db.prepare('SELECT id FROM interviews WHERE candidate=? AND panelist=? AND companyId=?').get(assessment.candidateId,req.user._id,assessment.companyId))return res.status(403).json({message:'You can only grade assessments for candidates in your assigned interviews'});
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


function makeSimplePdf(lines){
 const clean=value=>String(value??'').normalize('NFKD').replace(/[^\x20-\x7E]/g,' ').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
 const commands=['BT','/F1 12 Tf','50 760 Td','16 TL',...lines.flatMap((line,index)=>index?['T*','('+clean(line)+') Tj']:['('+clean(line)+') Tj']),'ET'].join('\n');
 const stream=Buffer.from(commands,'ascii');
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+stream.length+' >>\nstream\n'+stream.toString('ascii')+'\nendstream'
 ];
 let pdf='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,'ascii'));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=Buffer.byteLength(pdf,'ascii');pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return Buffer.from(pdf,'ascii');
}

router.get('/offers/:id/letter.pdf', requirePermission('offers:read'), (req,res,next)=>{
 try{
  const offer=isSuper(req)?db.prepare('SELECT o.*,c.name AS candidateName FROM offers o JOIN candidates c ON c.id=o.candidateId WHERE o.id=?').get(req.params.id):db.prepare('SELECT o.*,c.name AS candidateName FROM offers o JOIN candidates c ON c.id=o.candidateId WHERE o.id=? AND o.companyId=?').get(req.params.id,req.user.companyId);
  if(!offer)return res.status(404).json({message:'Offer not found'});
  const pdf=makeSimplePdf(['EMPLOYMENT OFFER','', 'Date: '+new Date().toLocaleDateString('en-IN'),'','Dear '+offer.candidateName+',','', 'We are pleased to offer you the position of '+(offer.jobTitle||'Team Member')+'.','Annual compensation: INR '+(offer.salary||'To be discussed'),'Proposed joining date: '+(offer.joiningDate||'To be confirmed'),'','Additional details:',offer.letterText||'Please contact Human Resources for next steps.','','Regards,','Human Resources']);
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="offer-letter.pdf"');res.send(pdf);
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
    const select="SELECT n.*,CASE WHEN (n.userId=? AND n.status='Read') OR nr.id IS NOT NULL THEN 1 ELSE 0 END AS isRead FROM notifications n LEFT JOIN notification_reads nr ON nr.notificationId=n.id AND nr.userId=? ";
    const rows=isSuper(req)
      ? db.prepare(select+'ORDER BY n.createdAt DESC LIMIT 100').all(req.user._id,req.user._id)
      : db.prepare(select+'WHERE n.companyId=? AND (n.userId IS NULL OR n.userId=?) ORDER BY n.createdAt DESC LIMIT 100').all(req.user._id,req.user._id,req.user.companyId,req.user._id);
    res.json(rows.map(rowWithId));
  } catch (error) { next(error); }
});

router.post('/notifications', requirePermission('notifications:create'), async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });
    if (!req.user.companyId) return res.status(400).json({ message: 'Company workspace required' });
    const userId = req.body.userId || null;
    const channel = String(req.body.channel || 'In-app');
    if (!['In-app','Email','SMS'].includes(channel)) return res.status(400).json({message:'Choose In-app, Email or SMS'});
    const recipient = userId ? db.prepare('SELECT id,email FROM users WHERE id=? AND companyId=?').get(userId, req.user.companyId) : null;
    if (userId && !recipient) return res.status(400).json({ message: 'Recipient must belong to this company' });
    let deliveryStatus='Unread';
    if(channel==='Email'){
      if(!recipient)return res.status(400).json({message:'Select a company user for email delivery'});
      if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return res.status(503).json({message:'Email delivery is not configured. Add RESEND_API_KEY and EMAIL_FROM to the server environment.'});
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[recipient.email],subject:title,text:message})});
      if(!response.ok)return res.status(502).json({message:'Email provider rejected the notification'});
      deliveryStatus='Sent';
    }else if(channel==='SMS'){
      if(!recipient)return res.status(400).json({message:'Select a company user for SMS delivery'});
      const phone=String(req.body.phone||'').trim();
      if(!phone)return res.status(400).json({message:'Enter the recipient phone number for SMS'});
      if(!process.env.TWILIO_ACCOUNT_SID||!process.env.TWILIO_AUTH_TOKEN||!process.env.TWILIO_FROM_NUMBER)return res.status(503).json({message:'SMS delivery is not configured. Add the Twilio environment settings.'});
      const params=new URLSearchParams({To:phone,From:process.env.TWILIO_FROM_NUMBER,Body:title+': '+message});
      const credentials=Buffer.from(process.env.TWILIO_ACCOUNT_SID+':'+process.env.TWILIO_AUTH_TOKEN).toString('base64');
      const response=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+process.env.TWILIO_ACCOUNT_SID+'/Messages.json',{method:'POST',headers:{'Authorization':'Basic '+credentials,'Content-Type':'application/x-www-form-urlencoded'},body:params});
      if(!response.ok)return res.status(502).json({message:'SMS provider rejected the notification'});
      deliveryStatus='Sent';
    }
    const id = uid();
    db.prepare('INSERT INTO notifications(id,companyId,userId,title,message,channel,status,createdAt) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, req.user.companyId, userId, title, message, channel, deliveryStatus, now());
    res.status(201).json(rowWithId(db.prepare('SELECT * FROM notifications WHERE id=?').get(id)));
  } catch (error) { next(error); }
});

router.patch('/notifications/:id/read',(req,res,next)=>{
 try{
  const notification=isSuper(req)
   ? db.prepare('SELECT * FROM notifications WHERE id=?').get(req.params.id)
   : db.prepare('SELECT * FROM notifications WHERE id=? AND companyId=? AND (userId IS NULL OR userId=?)').get(req.params.id,req.user.companyId,req.user._id);
  if(!notification)return res.status(404).json({message:'Notification not found'});
  if(notification.userId===req.user._id){
   db.prepare("UPDATE notifications SET status='Read' WHERE id=? AND companyId=?").run(notification.id,notification.companyId);
  }else if(notification.userId===null){
   db.prepare('INSERT OR IGNORE INTO notification_reads(id,notificationId,userId,readAt) VALUES(?,?,?,?)').run(uid(),notification.id,req.user._id,now());
  }else return res.status(403).json({message:'You cannot mark another user notification as read'});
  res.json({message:'Notification marked as read'});
 }catch(error){next(error);}
});

function decodePdfLiteral(value){
 return value.replace(/\\([0-7]{1,3})/g,(_,oct)=>String.fromCharCode(parseInt(oct,8)))
  .replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t')
  .replace(/\\([()\\])/g,'$1');
}
function extractPdfText(buffer){
 const source=buffer.toString('latin1'),parts=[];
 const streams=source.matchAll(/<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g);
 for(const match of streams){
  let data=Buffer.from(match[2],'latin1');
  try{if(/\/FlateDecode/.test(match[1]))data=inflateSync(data,{maxOutputLength:1024*1024});}catch{continue;}
  const content=data.toString('latin1');
  for(const item of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g))parts.push(decodePdfLiteral(item[1]));
  for(const item of content.matchAll(/\[((?:.|\n)*?)\]\s*TJ/g)){
   const literals=item[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g);
   for(const literal of literals)parts.push(decodePdfLiteral(literal[1]));
  }
  for(const item of content.matchAll(/<([0-9A-Fa-f]{4,})>\s*Tj/g)){
   try{const bytes=Buffer.from(item[1].length%2?'0'+item[1]:item[1],'hex');const text=bytes.length>=2&&bytes[0]===0xfe&&bytes[1]===0xff?Buffer.from(bytes.subarray(2)).swap16().toString('utf16le'):bytes.toString('latin1');parts.push(text);}catch{}
  }
  if(parts.join(' ').length>20000)break;
 }
 return parts.join(' ').replace(/\s+/g,' ').trim().slice(0,20000);
}
router.post('/resume-screening', requirePermission('resumes:read'), (req, res) => {
  try{
   let resumeText='';
   if(req.body?.candidateId){
    const candidate=isSuper(req)?db.prepare('SELECT * FROM candidates WHERE id=?').get(req.body.candidateId):companyRecord('candidates',req.body.candidateId,req.user.companyId);
    if(!candidate)return res.status(404).json({message:'Candidate not found in your company'});
    if(req.user.role==='RECRUITER'&&candidate.owner!==req.user._id)return res.status(403).json({message:'You can only screen candidates assigned to you'});
    if(req.user.role==='INTERVIEW_PANEL'&&!db.prepare('SELECT id FROM interviews WHERE candidate=? AND panelist=? AND companyId=?').get(candidate.id,req.user._id,candidate.companyId))return res.status(403).json({message:'You can only screen candidates in your assigned interviews'});
    if(!candidate.resumeUrl)return res.status(404).json({message:'This candidate has no uploaded resume'});
    const file=path.join(path.resolve(process.env.DATA_DIR||'data','resumes'),path.basename(candidate.resumeUrl));
    if(!fs.existsSync(file))return res.status(404).json({message:'Resume file is unavailable'});
    resumeText=extractPdfText(fs.readFileSync(file));
    if(!resumeText)return res.status(422).json({message:'No selectable text could be extracted. Scanned PDFs require OCR and cannot be parsed by this built-in reader.'});
   }
   const skills=Array.isArray(req.body?.skills)?req.body.skills.map(x=>String(x).trim()).filter(Boolean):[];
   const requirements=String(req.body?.requirements||'').toLowerCase();
   const source=resumeText||skills.join(' ');
   const matchedSkills=skills.filter(skill=>source.toLowerCase().includes(skill.toLowerCase())&&(!requirements||requirements.includes(skill.toLowerCase())));
   res.json({matchedSkills,missingSkills:skills.filter(skill=>!matchedSkills.includes(skill)),matchPercent:skills.length?Math.round(matchedSkills.length/skills.length*100):0,extractedText:resumeText,source:resumeText?'Uploaded PDF':'Manually entered skills',note:'Keyword-based assistance only. It is not an AI assessment or an automated hiring decision. Review the original resume and assess candidates fairly.'});
  }catch(error){next(error);}
});

export default router;
