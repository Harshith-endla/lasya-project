import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, now, rowWithId } from '../config/db.js';

const router=Router();
function candidateProtect(req,res,next){try{const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;if(!token)return res.status(401).json({message:'Candidate sign-in required'});const payload=jwt.verify(token,process.env.JWT_SECRET);if(!payload.candidateId)return res.status(401).json({message:'Invalid candidate session'});const candidate=db.prepare('SELECT c.id,c.name,c.email,c.phone,c.experience,c.skills,c.companyId,c.stage,c.job,c.createdAt,j.title AS jobTitle FROM candidates c LEFT JOIN jobs j ON j.id=c.job WHERE c.id=?').get(payload.candidateId);if(!candidate)return res.status(401).json({message:'Candidate account unavailable'});req.candidate=candidate;next();}catch{return res.status(401).json({message:'Candidate session expired. Please sign in again.'});}}
const applyLimit=rateLimit({windowMs:60*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:{message:'Too many applications from this connection. Please try again later.'}});
const candidateLoginLimit=rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:{message:'Too many sign-in attempts. Try again later.'}});

router.get('/jobs',(req,res,next)=>{
 try{
  const rows=db.prepare("SELECT j.id,j.title,j.department,j.location,j.employmentType,j.description,j.requirements,j.createdAt,c.name AS companyName FROM jobs j LEFT JOIN companies c ON c.id=j.companyId WHERE j.status='Open' ORDER BY j.createdAt DESC").all();
  res.json(rows.map(rowWithId));
 }catch(error){next(error);}
});

router.post('/apply',applyLimit,(req,res,next)=>{
 try{
  const body=req.body||{};
  const name=String(body.name||'').trim();
  const email=String(body.email||'').trim().toLowerCase();
  const phone=String(body.phone||'').trim();
  const password=String(body.password||'');
  const jobId=String(body.jobId||'').trim();
  const skills=Array.isArray(body.skills)?body.skills.map(x=>String(x).trim()).filter(Boolean):String(body.skills||'').split(',').map(x=>x.trim()).filter(Boolean);
  const experience=Number(body.experience||0);
  if(!name||!email||!jobId||password.length<8)return res.status(400).json({message:'Name, email, job and a password of at least 8 characters are required'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({message:'Enter a valid email address'});
  if(!Number.isFinite(experience)||experience<0||experience>60)return res.status(400).json({message:'Enter a valid experience value'});
  const job=db.prepare("SELECT id,companyId,assignedRecruiter FROM jobs WHERE id=? AND status='Open'").get(jobId);
  if(!job)return res.status(404).json({message:'This job is no longer accepting applications'});
  if(db.prepare('SELECT id FROM candidates WHERE email=? AND job=? AND companyId=?').get(email,jobId,job.companyId))
   return res.status(409).json({message:'An application with this email already exists for this job'});
  const id=uid(),timestamp=now(),passwordHash=await bcrypt.hash(password,12);
  db.prepare("INSERT INTO candidates(id,name,email,passwordHash,phone,job,source,experience,skills,resumeUrl,stage,notes,owner,companyId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,'Careers Portal',?,?,'','Applied','',?,?,?,?)")
   .run(id,name,email,passwordHash,phone,jobId,experience,JSON.stringify(skills),job.assignedRecruiter,job.companyId,timestamp,timestamp);
  const token=jwt.sign({candidateId:id},process.env.JWT_SECRET,{expiresIn:'7d'});
  res.status(201).json({message:'Your application has been submitted successfully.',applicationId:id,token,candidate:{name,email}});
 }catch(error){next(error);}
});


const resumeDir=path.resolve(process.env.DATA_DIR||'data','resumes');
fs.mkdirSync(resumeDir,{recursive:true});
function publicPdf(req,res,next){
 if(!req.is('application/pdf'))return res.status(415).json({message:'Content-Type must be application/pdf'});
 const chunks=[];let size=0,tooLarge=false;
 req.on('data',chunk=>{if(tooLarge)return;size+=chunk.length;if(size>5*1024*1024){tooLarge=true;chunks.length=0;return;}chunks.push(chunk);});
 req.on('end',()=>{if(tooLarge)return res.status(413).json({message:'Resume file must be 5 MB or smaller'});const data=Buffer.concat(chunks);if(data.subarray(0,5).toString()!=='%PDF-')return res.status(415).json({message:'Only valid PDF files are accepted'});req.pdfBuffer=data;next();});
 req.on('error',next);
}
router.post('/apply/:id/resume',candidateProtect,publicPdf,(req,res,next)=>{
 try{
  const candidate=db.prepare("SELECT id,companyId FROM candidates WHERE id=? AND source='Careers Portal'").get(req.params.id);
  if(!candidate||candidate.id!==req.candidate.id)return res.status(404).json({message:'Application not found'});
  const filename=uid()+'.pdf';
  fs.writeFileSync(path.join(resumeDir,filename),req.pdfBuffer,{flag:'wx'});
  db.prepare('UPDATE candidates SET resumeUrl=?,updatedAt=? WHERE id=? AND companyId=?').run(filename,now(),candidate.id,candidate.companyId);
  res.status(201).json({message:'Resume attached to your application'});
 }catch(error){next(error);}
});


router.post('/login',candidateLoginLimit,async(req,res,next)=>{
 try{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  const candidate=db.prepare('SELECT id,name,email,passwordHash FROM candidates WHERE email=? AND passwordHash<>? ORDER BY createdAt DESC').get(email,'');
  if(!candidate||!(await bcrypt.compare(password,candidate.passwordHash)))return res.status(401).json({message:'Invalid candidate email or password'});
  const token=jwt.sign({candidateId:candidate.id},process.env.JWT_SECRET,{expiresIn:'7d'});
  res.json({token,candidate:{_id:candidate.id,name:candidate.name,email:candidate.email}});
 }catch(error){next(error);}
});
router.get('/me',candidateProtect,(req,res)=>res.json({candidate:req.candidate}));
router.patch('/me',candidateProtect,(req,res,next)=>{
 try{
  const name=String(req.body?.name??req.candidate.name).trim(),phone=String(req.body?.phone??req.candidate.phone).trim();
  if(!name)return res.status(400).json({message:'Name is required'});
  db.prepare('UPDATE candidates SET name=?,phone=?,updatedAt=? WHERE id=?').run(name,phone,now(),req.candidate.id);
  const candidate=db.prepare('SELECT id,name,email,phone,experience,skills,companyId FROM candidates WHERE id=?').get(req.candidate.id);
  res.json({candidate:rowWithId(candidate)});
 }catch(error){next(error);}
});
router.get('/my-assessments',candidateProtect,(req,res,next)=>{
 try{
  const rows=db.prepare("SELECT id,title,assessmentType,dueDate,status,instructions,questions,maxScore FROM assessments WHERE candidateId=? AND companyId=? ORDER BY createdAt DESC").all(req.candidate.id,req.candidate.companyId);
  res.json(rows.map(row=>{let questions=[];try{questions=JSON.parse(row.questions||'[]').map(({prompt,options})=>({prompt,options}));}catch{}return {...rowWithId(row),questions};}));
 }catch(error){next(error);}
});
router.post('/my-assessments/:id/submit',candidateProtect,(req,res,next)=>{
 try{
  const assessment=db.prepare('SELECT * FROM assessments WHERE id=? AND candidateId=? AND companyId=?').get(req.params.id,req.candidate.id,req.candidate.companyId);
  if(!assessment)return res.status(404).json({message:'Assessment not found'});
  if(assessment.status==='Completed')return res.status(409).json({message:'This assessment has already been submitted'});
  if(assessment.dueDate&&new Date(assessment.dueDate+'T23:59:59')<new Date())return res.status(400).json({message:'The assessment deadline has passed'});
  let questions=[];try{questions=JSON.parse(assessment.questions||'[]');}catch{}
  if(!questions.length)return res.status(400).json({message:'This assessment has no questions yet'});
  const answers=req.body?.answers;
  if(!answers||typeof answers!=='object'||Array.isArray(answers))return res.status(400).json({message:'Submit your answers'});
  const valid=questions.filter(q=>q.answer!==undefined&&q.answer!==null);
  if(valid.length!==questions.length)return res.status(400).json({message:'This assessment requires valid answer keys'});
  const correct=questions.reduce((n,q,i)=>n+(String(answers[i]??'')===String(q.answer)?1:0),0);
  const score=Math.round(correct/questions.length*Number(assessment.maxScore||100)*100)/100;
  db.prepare("UPDATE assessments SET score=?,status='Completed',submission=?,submittedAt=?,updatedAt=? WHERE id=? AND candidateId=? AND companyId=?")
   .run(score,JSON.stringify(answers),now(),now(),assessment.id,req.candidate.id,req.candidate.companyId);
  res.json({message:'Assessment submitted successfully',score,maxScore:Number(assessment.maxScore||100),correct,total:questions.length});
 }catch(error){next(error);}
});

export default router;
