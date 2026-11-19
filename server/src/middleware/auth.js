import jwt from 'jsonwebtoken';
import { db, rowWithId } from '../config/db.js';
export async function protect(req,res,next){
  try {
    const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
    if(!token)return res.status(401).json({message:'Authentication required'});
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    const row=db.prepare('SELECT u.id,u.name,u.email,u.role,u.department,u.title,u.company,u.companyId,u.active,c.status AS companyStatus FROM users u LEFT JOIN companies c ON c.id=u.companyId WHERE u.id=?').get(payload.id);
    if(!row||!row.active)return res.status(401).json({message:'Account unavailable'});
    if(row.role!=='SUPER_ADMIN'&&row.companyStatus!=='Active')return res.status(403).json({message:'This company workspace is inactive. Contact your platform administrator.'});
    const user=rowWithId(row);delete user.companyStatus;req.user=user; next();
  } catch { return res.status(401).json({message:'Invalid or expired session'}); }
}
export { requirePermission } from '../config/permissions.js';
export const allow=(...roles)=>(req,res,next)=>req.user&&roles.includes(req.user.role)?next():res.status(403).json({message:'You do not have permission for this action'});
