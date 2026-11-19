import {Router} from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {db,uid,now,rowWithId} from '../config/db.js';
import {protect,requirePermission} from '../middleware/auth.js';
const router=Router();router.use(protect);
function getCandidate(id){const r=db.prepare('SELECT c.*,j.title AS jobTitle,j.department AS jobDepartment,u.name AS ownerName FROM candidates c LEFT JOIN jobs j ON j.id=c.job LEFT JOIN users u ON u.id=c.owner WHERE c.id=?').get(id);if(!r)return null;const x=rowWithId(r);try{x.skills=JSON.parse(x.skills||'[]')}catch{x.skills=[]}x.job=x.job?{_id:x.job,title:x.jobTitle,department:x.jobDepartment}:null;x.owner=x.owner?{_id:x.owner,name:x.ownerName}:null;delete x.jobTitle;delete x.jobDepartment;delete x.ownerName;return x}
function findScoped(id,req){return req.user.role==='SUPER_ADMIN'?db.prepare('SELECT * FROM candidates WHERE id=?').get(id):db.prepare('SELECT * FROM candidates WHERE id=? AND companyId=?').get(id,req.user.companyId)}
router.get('/',requirePermission('candidates:read'),(req,res,next)=>{try{let sql='SELECT id FROM candidates',args=[];if(req.user.role!=='SUPER_ADMIN'){sql+=' WHERE companyId=?';args.push(req.user.companyId)}if(req.user.role==='RECRUITER'){sql+=(args.length?' AND ':' WHERE ')+'(owner=? OR owner IS NULL)';args.push(req.user._id)}else if(req.user.role==='INTERVIEW_PANEL'){sql+=(args.length?' AND ':' WHERE ')+'id IN (SELECT candidate FROM interviews WHERE panelist=?)';args.push(req.user._id)}sql+=' ORDER BY createdAt DESC';res.json(db.prepare(sql).all(...args).map(x=>getCandidate(x.id)))}catch(e){next(e)}});
router.post('/',requirePermission('candidates:create'),(req,res,next)=>{try{const b=req.body,id=uid(),t=now(),companyId=req.user.role==='SUPER_ADMIN'?(b.companyId||req.user.companyId):req.user.companyId;if(!b.name||!b.email)return res.status(400).json({message:'Name and email are required'});if(!companyId)return res.status(400).json({message:'A company is required'});if(b.job){const job=req.user.role==='SUPER_ADMIN'?db.prepare('SELECT id FROM jobs WHERE id=? AND companyId=?').get(b.job,companyId):db.prepare('SELECT id FROM jobs WHERE id=? AND companyId=?').get(b.job,companyId);if(!job)return res.status(400).json({message:'Select a job from this company'});}db.prepare('INSERT INTO candidates(id,name,email,phone,job,source,experience,skills,resumeUrl,stage,notes,owner,companyId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,b.name,b.email,b.phone||'',b.job||null,b.source||'Website',Number(b.experience||0),JSON.stringify(b.skills||[]),b.resumeUrl||'',b.stage||'Applied',b.notes||'',req.user._id,companyId,t,t);res.status(201).json(getCandidate(id))}catch(e){next(e)}});
router.patch('/:id',requirePermission('candidates:update'),(req,res,next)=>{try{const c=findScoped(req.params.id,req);if(!c)return res.status(404).json({message:'Candidate not found'});if(req.user.role==='RECRUITER'&&c.owner!==req.user._id)return res.status(403).json({message:'You can only update candidates assigned to you'});const b={...c,...req.body,skills:req.body.skills??JSON.parse(c.skills||'[]')};if(b.job){const job=db.prepare('SELECT id FROM jobs WHERE id=? AND companyId=?').get(b.job?._id||b.job,c.companyId);if(!job)return res.status(400).json({message:'Select a job from this company'});}db.prepare('UPDATE candidates SET name=?,email=?,phone=?,job=?,source=?,experience=?,skills=?,resumeUrl=?,stage=?,notes=?,updatedAt=? WHERE id=?').run(b.name,b.email,b.phone||'',b.job?._id||b.job||null,b.source,b.experience,JSON.stringify(b.skills||[]),b.resumeUrl||'',b.stage,b.notes||'',now(),req.params.id);res.json(getCandidate(req.params.id))}catch(e){next(e)}});
router.delete('/:id',requirePermission('candidates:delete'),(req,res)=>{const r=req.user.role==='SUPER_ADMIN'?db.prepare('DELETE FROM candidates WHERE id=?').run(req.params.id):db.prepare('DELETE FROM candidates WHERE id=? AND companyId=?').run(req.params.id,req.user.companyId);r.changes?res.json({message:'Candidate deleted'}):res.status(404).json({message:'Candidate not found'})});

const resumeDir = path.resolve(process.env.DATA_DIR || 'data', 'resumes');
fs.mkdirSync(resumeDir, { recursive: true });

router.post('/:id/resume', requirePermission('resumes:read'), expressPdfBody(), (req,res,next)=>{
 try {
  const candidate=findScoped(req.params.id,req);
  if(!candidate)return res.status(404).json({message:'Candidate not found'});
  if(req.user.role==='RECRUITER'&&candidate.owner!==req.user._id)
   return res.status(403).json({message:'You can only upload resumes for candidates assigned to you'});
  if(!Buffer.isBuffer(req.body)||req.body.length===0)
   return res.status(400).json({message:'Upload a PDF resume'});
  if(req.body.subarray(0,5).toString()!=='%PDF-')
   return res.status(415).json({message:'Only valid PDF files are accepted'});
  const filename=uid()+'.pdf';
  fs.writeFileSync(path.join(resumeDir,filename),req.body,{flag:'wx'});
  const resumeUrl='/api/candidates/'+req.params.id+'/resume';
  db.prepare('UPDATE candidates SET resumeUrl=?,updatedAt=? WHERE id=? AND companyId=?')
   .run(filename,now(),candidate.id,candidate.companyId);
  res.status(201).json({message:'Resume uploaded successfully',resumeUrl});
 } catch(error){next(error);}
});

router.get('/:id/resume',requirePermission('resumes:read'),(req,res,next)=>{
 try {
  const candidate=findScoped(req.params.id,req);
  if(!candidate)return res.status(404).json({message:'Candidate not found'});
  if(req.user.role==='RECRUITER'&&candidate.owner!==req.user._id)
   return res.status(403).json({message:'You can only view resumes for candidates assigned to you'});
  if(req.user.role==='INTERVIEW_PANEL'){
   const assigned=db.prepare('SELECT id FROM interviews WHERE candidate=? AND panelist=? AND companyId=?')
    .get(candidate.id,req.user._id,candidate.companyId);
   if(!assigned)return res.status(403).json({message:'Resume access is limited to assigned interviews'});
  }
  if(!candidate.resumeUrl)return res.status(404).json({message:'No resume has been uploaded'});
  const filename=path.basename(candidate.resumeUrl);
  const file=path.join(resumeDir,filename);
  if(!fs.existsSync(file))return res.status(404).json({message:'Resume file is unavailable'});
  res.type('application/pdf');
  res.setHeader('Content-Disposition','inline; filename="candidate-resume.pdf"');
  res.sendFile(file);
 } catch(error){next(error);}
});

function expressPdfBody(){
 return (req,res,next)=>{
  if(!req.is('application/pdf'))return res.status(415).json({message:'Content-Type must be application/pdf'});
  const chunks=[];let size=0;let tooLarge=false;
  req.on('data',chunk=>{
   if(tooLarge)return;
   size+=chunk.length;
   if(size>5*1024*1024){tooLarge=true;chunks.length=0;return;}
   chunks.push(chunk);
  });
  req.on('end',()=>{
   if(tooLarge)return res.status(413).json({message:'Resume file must be 5 MB or smaller'});
   req.body=Buffer.concat(chunks);next();
  });
  req.on('error',next);
 };
}

export default router;
