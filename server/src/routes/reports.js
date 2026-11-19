import {Router} from 'express';
import {db} from '../config/db.js';
import {protect,allow} from '../middleware/auth.js';
const router=Router();router.get('/overview',protect,allow('SUPER_ADMIN','COMPANY_ADMIN','HR_MANAGER','CEO','REPORTING_MANAGER'),(req,res,next)=>{try{
 const scoped=req.user.role!=='SUPER_ADMIN',args=scoped?[req.user.companyId]:[];
 const filter=scoped?' WHERE companyId=?':'';
 const byStage=db.prepare(`SELECT stage AS _id,COUNT(*) AS count FROM candidates${filter} GROUP BY stage`).all(...args);
 const byDepartment=db.prepare(`SELECT department AS _id,COUNT(*) AS count FROM employees${filter} GROUP BY department ORDER BY count DESC`).all(...args);
 const openJobs=db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status='Open'${scoped?' AND companyId=?':''}`).get(...args).n;
 const activeEmployees=db.prepare(`SELECT COUNT(*) AS n FROM employees WHERE status='Active'${scoped?' AND companyId=?':''}`).get(...args).n;
 res.json({byStage,byDepartment,openJobs,activeEmployees});
}catch(e){next(e)}});export default router;
