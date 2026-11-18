import {Router} from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {db,rowWithId} from '../config/db.js';
import {protect} from '../middleware/auth.js';
const router=Router();
router.post('/login',async(req,res,next)=>{try{
 const email=String(req.body.email||'').toLowerCase().trim(), password=String(req.body.password||'');
 if(!email||!password)return res.status(400).json({message:'Email and password are required'});
 const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
 if(!user||!user.active||!(await bcrypt.compare(password,user.password)))return res.status(401).json({message:'Incorrect email or password'});
 const token=jwt.sign({id:user.id},process.env.JWT_SECRET,{expiresIn:'8h'});
 const safe=rowWithId(user); delete safe.password; delete safe.active;
 res.json({token,user:safe});
}catch(e){next(e)}});
router.get('/me',protect,(req,res)=>res.json({user:req.user}));
export default router;
