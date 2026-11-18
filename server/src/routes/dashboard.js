import {Router} from 'express';import {db,rowWithId,parseJson} from '../config/db.js';import {protect} from '../middleware/auth.js';
const router=Router();router.get('/',protect,(req,res,next)=>{try{
 const stats={};for(const t of ['jobs','candidates','interviews','employees','payroll'])stats[t]=db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
 const stages=db.prepare('SELECT stage AS _id,COUNT(*) AS count FROM candidates GROUP BY stage ORDER BY count DESC').all();
 const recentCandidates=db.prepare(`SELECT c.*,j.title AS jobTitle FROM candidates c LEFT JOIN jobs j ON j.id=c.job ORDER BY c.createdAt DESC LIMIT 5`).all().map(r=>{const x=rowWithId(r);x.skills=parseJson(x.skills);x.job=x.job?{_id:x.job,title:r.jobTitle}:null;delete x.jobTitle;return x});
 const upcoming=db.prepare(`SELECT i.*,c.name AS candidateName,j.title AS jobTitle FROM interviews i LEFT JOIN candidates c ON c.id=i.candidate LEFT JOIN jobs j ON j.id=i.job WHERE i.scheduledAt>=? AND i.status='Scheduled' ORDER BY i.scheduledAt LIMIT 5`).all(new Date().toISOString()).map(r=>{const x=rowWithId(r);x.candidate={name:r.candidateName};x.job={title:r.jobTitle};delete x.candidateName;delete x.jobTitle;return x});
 res.json({stats,stages,recentCandidates,upcoming,role:req.user.role});
}catch(e){next(e)}});export default router;
