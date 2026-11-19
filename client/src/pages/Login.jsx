import {useState} from "react";
import {useAuth} from "../context/AuthContext";
import {Navigate,Link} from "react-router-dom";
import {ArrowRight,BriefcaseBusiness,ShieldCheck,Users,ChartNoAxesCombined} from "lucide-react";
const demos=[
 ["Super Admin","superadmin@demo.com"],["Company Admin","admin@demo.com"],["HR Manager","hr@demo.com"],
 ["Recruiter","recruiter@demo.com"],["Interview Panel","panel@demo.com"],["Reporting Manager","manager@demo.com"],
 ["Finance / Payroll","finance@demo.com"],["Employee","employee@demo.com"],["Management / CEO","ceo@demo.com"]
];
export default function Login(){
 const {login,user}=useAuth();const [email,setEmail]=useState("hr@demo.com"),[password,setPassword]=useState("Demo@123"),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 if(user)return <Navigate to="/" replace/>;
 async function submit(e){e.preventDefault();setError("");setBusy(true);try{await login(email,password);}catch(err){setError(err.response?.data?.message||"Unable to sign in. Check the API and database.");}finally{setBusy(false);}}
 return <div className="login-page"><section className="login-visual"><div className="login-brand"><div className="brand-mark">T</div><b>talentflow</b></div><div className="visual-copy"><div className="eyebrow light">THE PEOPLE OPERATIONS PLATFORM</div><h1>Great teams<br/>start with <em>great people.</em></h1><p>One connected workspace for every step of your hiring journey — from first conversation to first day.</p><div className="visual-stats"><div><Users/><b>People first</b><small>Built around your team</small></div><div><ChartNoAxesCombined/><b>Insight led</b><small>Make every hire count</small></div><div><ShieldCheck/><b>Connected</b><small>One shared workspace</small></div></div></div><div className="visual-footer">© 2026 TalentFlow · Recruitment & People Operations</div></section>
 <section className="login-panel"><div className="login-form-wrap"><div className="mobile-brand"><div className="brand-mark">T</div><b>talentflow</b></div><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your workspace</h2><p className="muted">Enter your work credentials to continue.</p>
 <form onSubmit={submit}><label>Work email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><div className="form-row"><span className="muted tiny">Demo environment</span><span className="tiny">Password: Demo@123</span></div>{error&&<div className="alert-error">{error}</div>}<button className="primary-btn full" disabled={busy}>{busy?"Signing in…":"Sign in"}<ArrowRight size={17}/></button></form>
 <div className="demo-box"><b>Quick demo access</b><p>Select a role to prefill its demo account.</p><div className="demo-grid">{demos.map(([label,mail])=><button key={mail} onClick={()=>{setEmail(mail);setPassword("Demo@123");}}>{label}</button>)}</div></div><div className="login-note"><ShieldCheck size={15}/> Secure role-based access</div><p className="muted tiny" style={{textAlign:"center",marginTop:16}}>Looking for a role? <Link to="/careers" className="text-link">Browse open jobs and apply</Link> · <Link to="/candidate-portal" className="text-link">Candidate sign in</Link></p></div></section></div>
}
