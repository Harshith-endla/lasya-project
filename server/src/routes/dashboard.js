import {Router} from 'express';
import {db,rowWithId,parseJson} from '../config/db.js';
import {protect} from '../middleware/auth.js';
const router=Router();router.get('/',protect,(req,res,next)=>{try{
 const scoped=req.user.role!=='SUPER_ADMIN',companyId=req.user.companyId;
 const count=(table,where='',args=[])=>db.prepare(`SELECT COUNT(*) AS n FROM ${table}${where}`).get(...args).n;
 const where=scoped?' WHERE companyId=?':'',args=scoped?[companyId]:[];
 const stats={jobs:count('jobs',where,args),candidates:count('candidates',where,args),interviews:count('interviews',where,args),employees:count('employees',where,args),payroll:count('payroll',where,args)};
 let stageSql='SELECT stage AS _id,COUNT(*) AS count FROM candidates',stageArgs=[];
 if(scoped){stageSql+=' WHERE companyId=?';stageArgs.push(companyId)}stageSql+=' GROUP BY stage ORDER BY count DESC';
 const stages=db.prepare(stageSql).all(...stageArgs);
 let recentSql='SELECT c.*,j.title AS jobTitle FROM candidates c LEFT JOIN jobs j ON j.id=c.job WHERE 1=1',recentArgs=[];
 if(scoped){recentSql+=' AND c.companyId=?';recentArgs.push(companyId)}
 if(req.user.role==='RECRUITER'){recentSql+=' AND (c.owner=? OR c.owner IS NULL)';recentArgs.push(req.user._id)}
 recentSql+=' ORDER BY c.createdAt DESC LIMIT 5';
 const recentCandidates=db.prepare(recentSql).all(...recentArgs).map(r=>{const x=rowWithId(r);x.skills=parseJson(x.skills);x.job=x.job?{_id:x.job,title:r.jobTitle}:null;delete x.jobTitle;return x});
 let upcomingSql=`SELECT i.*,c.name AS candidateName,j.title AS jobTitle FROM interviews i LEFT JOIN candidates c ON c.id=i.candidate LEFT JOIN jobs j ON j.id=i.job WHERE i.scheduledAt>=? AND i.status='Scheduled'`,upcomingArgs=[new Date().toISOString()];
 if(scoped){upcomingSql+=' AND i.companyId=?';upcomingArgs.push(companyId)}
 if(req.user.role==='INTERVIEW_PANEL'){upcomingSql+=' AND i.panelist=?';upcomingArgs.push(req.user._id)}
 upcomingSql+=' ORDER BY i.scheduledAt LIMIT 5';
 const upcoming=db.prepare(upcomingSql).all(...upcomingArgs).map(r=>{const x=rowWithId(r);x.candidate={name:r.candidateName};x.job={title:r.jobTitle};delete x.candidateName;delete x.jobTitle;return x});
 res.json({stats,stages,recentCandidates,upcoming,role:req.user.role});
}catch(e){next(e)}});export default router;
