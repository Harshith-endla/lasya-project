import jwt from 'jsonwebtoken';
import { db, rowWithId } from '../config/db.js';
export async function protect(req,res,next){
  try {
    const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
    if(!token)return res.status(401).json({message:'Authentication required'});
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    const row=db.prepare('SELECT id,name,email,role,department,title,company,companyId,active FROM users WHERE id=?').get(payload.id);
    if(!row||!row.active)return res.status(401).json({message:'Account unavailable'});
    req.user=rowWithId(row); next();
  } catch { return res.status(401).json({message:'Invalid or expired session'}); }
}
export { requirePermission } from '../config/permissions.js';
export const allow=(...roles)=>(req,res,next)=>req.user&&roles.includes(req.user.role)?next():res.status(403).json({message:'You do not have permission for this action'});
