import {useEffect,useMemo,useState} from "react";
import {Building2,Users,Network,Plus,RefreshCw,ShieldCheck} from "lucide-react";
import api from "../api";
import {useAuth} from "../context/AuthContext";
import {roleLabels} from "../roles";

const roleOptions = {
  SUPER_ADMIN:Object.keys(roleLabels),
  COMPANY_ADMIN:["HR_MANAGER","RECRUITER","INTERVIEW_PANEL","REPORTING_MANAGER","FINANCE_PAYROLL","EMPLOYEE","CEO"],
  HR_MANAGER:["RECRUITER","INTERVIEW_PANEL","EMPLOYEE"]
};
const blankCompany={name:"",slug:"",industry:"",email:"",phone:"",website:""};
const blankUser={name:"",email:"",role:"RECRUITER",department:"",title:"",password:""};
const blankDepartment={name:"",description:""};

export default function AdminPage(){
  const {user}=useAuth();
  const isSuper=user.role==="SUPER_ADMIN";
  const [companies,setCompanies]=useState([]);
  const [companyId,setCompanyId]=useState(user.companyId||"");
  const [users,setUsers]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [companyForm,setCompanyForm]=useState(blankCompany);
  const [userForm,setUserForm]=useState(blankUser);
  const [departmentForm,setDepartmentForm]=useState(blankDepartment);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const canManage=useMemo(()=>["SUPER_ADMIN","COMPANY_ADMIN","HR_MANAGER"].includes(user.role),[user.role]);
  async function load(){
    setError("");
    try{
      let target=companyId;
      if(isSuper){
        const c=await api.get("/admin/companies");
        setCompanies(c.data.companies||[]);
        if(!target && c.data.companies?.length){target=c.data.companies[0]._id;setCompanyId(target);}
      }
      const params=isSuper&&target?{companyId:target}:{};
      const [u,d]=await Promise.all([
        api.get("/admin/users",{params}),
        api.get("/admin/departments",{params})
      ]);
      setUsers(u.data.users||[]);
      setDepartments(d.data.departments||[]);
    }catch(e){setError(e.response?.data?.message||"Unable to load administration data.");}
  }
  useEffect(()=>{load();},[companyId]);
  async function submit(action,body){
    setBusy(true);setError("");setSuccess("");
    try{
      const result=await action(body);
      setSuccess(result.data.message||"Saved successfully.");
      await load();
      return true;
    }catch(e){setError(e.response?.data?.message||"The request could not be completed.");return false;}
    finally{setBusy(false);}
  }
  async function createCompany(e){
    e.preventDefault();
    const ok=await submit(body=>api.post("/admin/companies",body),companyForm);
    if(ok){setCompanyForm(blankCompany);setSuccess("Company created successfully.");}
  }
  async function createUser(e){
    e.preventDefault();
    const ok=await submit(body=>api.post("/admin/users",body),{...userForm,companyId});
    if(ok){setUserForm({...blankUser,role:roleOptions[user.role]?.[0]||"RECRUITER"});setSuccess("User account created successfully.");}
  }
  async function createDepartment(e){
    e.preventDefault();
    const ok=await submit(body=>api.post("/admin/departments",body),{...departmentForm,companyId});
    if(ok){setDepartmentForm(blankDepartment);setSuccess("Department created successfully.");}
  }
  if(!canManage)return <div className="alert-error">You do not have permission to access administration.</div>;

  return <div className="module-page">
    <div className="page-title-row"><div><div className="eyebrow">PLATFORM CONTROL</div><h1>Administration</h1><p className="muted">Manage companies, user access and departments for your organization.</p></div><button className="secondary-btn" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    {error&&<div className="alert-error">{error}</div>}
    {success&&<div className="panel" style={{padding:12,marginBottom:14,color:"#23845f",fontSize:12}}>{success}</div>}
    {isSuper&&<section className="panel" style={{marginBottom:18}}>
      <div className="panel-heading"><div><h3><Building2 size={17} style={{verticalAlign:"middle",marginRight:7}}/>Company management</h3><p className="muted">Create a company workspace. Each company has its own users and departments.</p></div></div>
      <form onSubmit={createCompany} className="modal-fields">
        <div className="field"><label>Company name *</label><input required value={companyForm.name} onChange={e=>setCompanyForm({...companyForm,name:e.target.value})} placeholder="Example Technologies"/></div>
        <div className="field"><label>Company slug</label><input value={companyForm.slug} onChange={e=>setCompanyForm({...companyForm,slug:e.target.value})} placeholder="example-technologies"/></div>
        <div className="field"><label>Industry</label><input value={companyForm.industry} onChange={e=>setCompanyForm({...companyForm,industry:e.target.value})} placeholder="Information Technology"/></div>
        <div className="field"><label>Contact email</label><input type="email" value={companyForm.email} onChange={e=>setCompanyForm({...companyForm,email:e.target.value})} placeholder="hr@example.com"/></div>
        <div className="field"><label>Phone</label><input value={companyForm.phone} onChange={e=>setCompanyForm({...companyForm,phone:e.target.value})}/></div>
        <div className="field"><label>Website</label><input value={companyForm.website} onChange={e=>setCompanyForm({...companyForm,website:e.target.value})} placeholder="https://example.com"/></div>
        <div className="modal-actions" style={{gridColumn:"1 / -1"}}><button className="primary-btn" disabled={busy}><Plus size={15}/> Create company</button></div>
      </form>
      <div className="field" style={{marginTop:18,maxWidth:420}}><label>Selected company workspace</label><select value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Select a company</option>{companies.map(c=><option key={c._id} value={c._id}>{c.name} · {c.status}</option>)}</select></div>
      <div className="table-wrap" style={{marginTop:14}}><table><thead><tr><th>Company</th><th>Industry</th><th>Contact</th><th>Status</th></tr></thead><tbody>{companies.map(c=><tr key={c._id}><td><b>{c.name}</b><div className="muted tiny">{c.slug}</div></td><td>{c.industry||"—"}</td><td>{c.email||"—"}</td><td><span className="status-pill active">{c.status}</span></td></tr>)}</tbody></table></div>
    </section>}
    <div className="dashboard-grid" style={{alignItems:"start"}}>
      <section className="panel">
        <div className="panel-heading"><div><h3><Users size={17} style={{verticalAlign:"middle",marginRight:7}}/>User accounts</h3><p className="muted">Create accounts with role-specific access.</p></div></div>
        <form onSubmit={createUser} className="modal-fields">
          <div className="field"><label>Full name *</label><input required value={userForm.name} onChange={e=>setUserForm({...userForm,name:e.target.value})}/></div>
          <div className="field"><label>Email *</label><input required type="email" value={userForm.email} onChange={e=>setUserForm({...userForm,email:e.target.value})}/></div>
          <div className="field"><label>Role *</label><select value={userForm.role} onChange={e=>setUserForm({...userForm,role:e.target.value})}>{(roleOptions[user.role]||[]).map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}</select></div>
          <div className="field"><label>Department</label><input value={userForm.department} onChange={e=>setUserForm({...userForm,department:e.target.value})} placeholder="Human Resources"/></div>
          <div className="field"><label>Job title</label><input value={userForm.title} onChange={e=>setUserForm({...userForm,title:e.target.value})}/></div>
          <div className="field"><label>Temporary password *</label><input required type="password" minLength="8" value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})}/></div>
          <div className="modal-actions" style={{gridColumn:"1 / -1"}}><button className="primary-btn" disabled={busy||!companyId}><Plus size={15}/> Create account</button></div>
        </form>
        <div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Status</th></tr></thead><tbody>{users.map(u=><tr key={u._id}><td><b>{u.name}</b><div className="muted tiny">{u.email}</div></td><td>{roleLabels[u.role]||u.role}</td><td>{u.department||"—"}</td><td><span className={u.active?"status-pill active":"status-pill closed"}>{u.active?"Active":"Inactive"}</span></td></tr>)}</tbody></table>{!users.length&&<div className="empty-state compact">No users found for this company.</div>}</div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h3><Network size={17} style={{verticalAlign:"middle",marginRight:7}}/>Departments</h3><p className="muted">Organize the company into teams.</p></div></div>
        <form onSubmit={createDepartment} className="modal-fields" style={{gridTemplateColumns:"1fr"}}>
          <div className="field"><label>Department name *</label><input required value={departmentForm.name} onChange={e=>setDepartmentForm({...departmentForm,name:e.target.value})} placeholder="Engineering"/></div>
          <div className="field"><label>Description</label><textarea rows="3" value={departmentForm.description} onChange={e=>setDepartmentForm({...departmentForm,description:e.target.value})} placeholder="Department responsibilities"/></div>
          <div className="modal-actions"><button className="primary-btn" disabled={busy||!companyId}><Plus size={15}/> Add department</button></div>
        </form>
        <div style={{display:"grid",gap:9,marginTop:17}}>{departments.map(d=><div key={d._id} style={{border:"1px solid var(--line)",borderRadius:9,padding:12}}><b style={{fontSize:12}}>{d.name}</b><p className="muted tiny" style={{margin:"5px 0 0"}}>{d.description||"No description added"}</p></div>)}{!departments.length&&<div className="empty-state compact">No departments created yet.</div>}</div>
      </section>
    </div>
    <div className="panel" style={{marginTop:18,padding:15,display:"flex",gap:10,alignItems:"center"}}><ShieldCheck color="#5366d9"/><div><b style={{fontSize:12}}>Role-based access is enforced by the API</b><p className="muted tiny" style={{margin:"4px 0 0"}}>Account creation is restricted by your role. Company Admins and HR Managers cannot create a Super Admin account.</p></div></div>
  </div>;
}
