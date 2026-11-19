import {Router} from 'express';
import {db,rowWithId,parseJson} from '../config/db.js';
import {protect} from '../middleware/auth.js';
import {hasPermission} from '../config/permissions.js';
const router=Router();
router.get('/',protect,(req,res,next)=>{try{
 const role=req.user.role,scoped=role!=='SUPER_ADMIN',companyId=req.user.companyId;
 const can=permission=>hasPermission(role,permission);
 const count=(table,where='',args=[])=>db.prepare(`SELECT COUNT(*) AS n FROM ${table}${where}`).get(...args).n;
 const companyWhere=scoped?' WHERE companyId=?':'',companyArgs=scoped?[companyId]:[];
 const stats={
  jobs:can('jobs:read')?count('jobs',companyWhere,companyArgs):0,
  candidates:can('candidates:read')?count('candidates',companyWhere,companyArgs):0,
  interviews:can('interviews:read')?count('interviews',companyWhere,companyArgs):0,
  employees:can('employees:read')?count('employees',companyWhere,companyArgs):(role==='EMPLOYEE'?count('employees',' WHERE email=? AND companyId=?',[req.user.email,companyId]):0),
  payroll:can('payroll:read')?count('payroll',companyWhere,companyArgs):(role==='EMPLOYEE'?count('payroll',' WHERE employee IN (SELECT id FROM employees WHERE email=? AND companyId=?)',[req.user.email,companyId]):0)
 };
 let stages=[];
 if(can('candidates:read')){
  let stageSql='SELECT stage AS _id,COUNT(*) AS count FROM candidates',stageArgs=[];
  if(scoped){stageSql+=' WHERE companyId=?';stageArgs.push(companyId)}
  stageSql+=' GROUP BY stage ORDER BY count DESC';stages=db.prepare(stageSql).all(...stageArgs);
 }
 let recentCandidates=[];
 if(can('candidates:read')){
  let recentSql='SELECT c.*,j.title AS jobTitle FROM candidates c LEFT JOIN jobs j ON j.id=c.job WHERE 1=1',recentArgs=[];
  if(scoped){recentSql+=' AND c.companyId=?';recentArgs.push(companyId)}
  if(role==='RECRUITER'){recentSql+=' AND (c.owner=? OR c.owner IS NULL)';recentArgs.push(req.user._id)}
  if(role==='INTERVIEW_PANEL'){recentSql+=' AND c.id IN (SELECT candidate FROM interviews WHERE panelist=?)';recentArgs.push(req.user._id)}
  recentSql+=' ORDER BY c.createdAt DESC LIMIT 5';
  recentCandidates=db.prepare(recentSql).all(...recentArgs).map(r=>{const x=rowWithId(r);x.skills=parseJson(x.skills);x.job=x.job?{_id:x.job,title:r.jobTitle}:null;delete x.jobTitle;return x});
 }
 let upcoming=[];
 if(can('interviews:read')){
  let upcomingSql=`SELECT i.*,c.name AS candidateName,j.title AS jobTitle FROM interviews i LEFT JOIN candidates c ON c.id=i.candidate LEFT JOIN jobs j ON j.id=i.job WHERE i.scheduledAt>=? AND i.status='Scheduled'`,upcomingArgs=[new Date().toISOString()];
  if(scoped){upcomingSql+=' AND i.companyId=?';upcomingArgs.push(companyId)}
  if(role==='INTERVIEW_PANEL'){upcomingSql+=' AND i.panelist=?';upcomingArgs.push(req.user._id)}
  upcomingSql+=' ORDER BY i.scheduledAt LIMIT 5';
  upcoming=db.prepare(upcomingSql).all(...upcomingArgs).map(r=>{const x=rowWithId(r);x.candidate={name:r.candidateName};x.job={title:r.jobTitle};delete x.candidateName;delete x.jobTitle;return x});
 }
 res.json({stats,stages,recentCandidates,upcoming,role});
}catch(e){next(e)}});
export default router;
