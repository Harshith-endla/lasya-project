import {Router} from 'express';
import {db} from '../config/db.js';
import {protect,requirePermission} from '../middleware/auth.js';
const router=Router();router.get('/overview',protect,requirePermission('reports:read'),(req,res,next)=>{try{
 const scoped=req.user.role!=='SUPER_ADMIN',args=scoped?[req.user.companyId]:[];
 const filter=scoped?' WHERE companyId=?':'';
 const byStage=db.prepare(`SELECT stage AS _id,COUNT(*) AS count FROM candidates${filter} GROUP BY stage`).all(...args);
 const byDepartment=db.prepare(`SELECT department AS _id,COUNT(*) AS count FROM employees${filter} GROUP BY department ORDER BY count DESC`).all(...args);
 const openJobs=db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status='Open'${scoped?' AND companyId=?':''}`).get(...args).n;
 const activeEmployees=db.prepare(`SELECT COUNT(*) AS n FROM employees WHERE status='Active'${scoped?' AND companyId=?':''}`).get(...args).n;
 const grouped = (table, field) => db.prepare('SELECT '+field+' AS _id,COUNT(*) AS count FROM '+table+(scoped?' WHERE companyId=?':'')+' GROUP BY '+field+' ORDER BY count DESC').all(...args);
 const hiringTrend=db.prepare("SELECT substr(createdAt,1,7) AS month,COUNT(*) AS hires FROM employees WHERE status='Active'"+(scoped?' AND companyId=?':'')+' GROUP BY substr(createdAt,1,7) ORDER BY month DESC LIMIT 12').all(...args).reverse();
 const interviewOutcomes=grouped('interviews','status');
 const offerStatus=grouped('offers','status');
 const assessmentStatus=grouped('assessments','status');
 res.json({byStage,byDepartment,openJobs,activeEmployees,hiringTrend,interviewOutcomes,offerStatus,assessmentStatus});
}catch(e){next(e)}});export default router;
