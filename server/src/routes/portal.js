import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, now, rowWithId } from '../config/db.js';

const router=Router();
const applyLimit=rateLimit({windowMs:60*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:{message:'Too many applications from this connection. Please try again later.'}});

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
  const jobId=String(body.jobId||'').trim();
  const skills=Array.isArray(body.skills)?body.skills.map(x=>String(x).trim()).filter(Boolean):String(body.skills||'').split(',').map(x=>x.trim()).filter(Boolean);
  const experience=Number(body.experience||0);
  if(!name||!email||!jobId)return res.status(400).json({message:'Name, email and job are required'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({message:'Enter a valid email address'});
  if(!Number.isFinite(experience)||experience<0||experience>60)return res.status(400).json({message:'Enter a valid experience value'});
  const job=db.prepare("SELECT id,companyId,assignedRecruiter FROM jobs WHERE id=? AND status='Open'").get(jobId);
  if(!job)return res.status(404).json({message:'This job is no longer accepting applications'});
  if(db.prepare('SELECT id FROM candidates WHERE email=? AND job=? AND companyId=?').get(email,jobId,job.companyId))
   return res.status(409).json({message:'An application with this email already exists for this job'});
  const id=uid(),timestamp=now();
  db.prepare("INSERT INTO candidates(id,name,email,phone,job,source,experience,skills,resumeUrl,stage,notes,owner,companyId,createdAt,updatedAt) VALUES(?,?,?,?,?,'Careers Portal',?,?,'','Applied','',?,?,?,?)")
   .run(id,name,email,phone,jobId,experience,JSON.stringify(skills),job.assignedRecruiter,job.companyId,timestamp,timestamp);
  res.status(201).json({message:'Your application has been submitted successfully.',applicationId:id});
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
router.post('/apply/:id/resume',applyLimit,publicPdf,(req,res,next)=>{
 try{
  const candidate=db.prepare("SELECT id,companyId FROM candidates WHERE id=? AND source='Careers Portal'").get(req.params.id);
  if(!candidate)return res.status(404).json({message:'Application not found'});
  const filename=uid()+'.pdf';
  fs.writeFileSync(path.join(resumeDir,filename),req.pdfBuffer,{flag:'wx'});
  db.prepare('UPDATE candidates SET resumeUrl=?,updatedAt=? WHERE id=? AND companyId=?').run(filename,now(),candidate.id,candidate.companyId);
  res.status(201).json({message:'Resume attached to your application'});
 }catch(error){next(error);}
});

export default router;
