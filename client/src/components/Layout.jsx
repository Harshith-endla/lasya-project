import {NavLink,Outlet,useLocation,useNavigate} from "react-router-dom";
import * as Icons from "lucide-react";
import {useAuth} from "../context/AuthContext";
import {navItems,roleLabels} from "../roles";
export default function Layout(){
 const {user,logout}=useAuth();const location=useLocation();const navigate=useNavigate();
 function handleLogout(){logout();navigate("/login",{replace:true});}
 const visible=navItems.filter(n=>n.roles.includes(user.role));
 const active=visible.find(n=>n.path===location.pathname);
 const Icon=Icons[active?.icon]||Icons.LayoutDashboard;
 return <div className="app-shell">
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark">T</div><div><b>talentflow</b><small>PEOPLE & RECRUITMENT</small></div></div>
   <div className="workspace-label">WORKSPACE</div>
   <nav>{visible.map(item=>{const I=Icons[item.icon]||Icons.Circle;return <NavLink key={item.path} to={item.path} end={item.path==="/"} className={({isActive})=>isActive?"nav-link active":"nav-link"}><I size={18}/><span>{item.label}</span></NavLink>})}</nav>
   <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Icons.Sparkles size={17}/></div><b>Need a hand?</b><p>Explore your workspace and keep your team moving.</p></div><div className="profile-mini"><div className="avatar">{user.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div className="profile-info"><b>{user.name}</b><small>{roleLabels[user.role]}</small></div><button className="logout-btn" type="button" title="Log out and return to login" onClick={handleLogout}><Icons.LogOut size={16}/><span>Log out</span></button></div></div>
  </aside>
  <main className="main-area">
   <header className="topbar"><div className="crumb"><span>Workspace</span><Icons.ChevronRight size={14}/><b>{active?.label||"Overview"}</b></div><div className="top-actions"><span className="date-label">{new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</span><button className="icon-btn notification" title="Notifications"><Icons.Bell size={18}/><i/></button><div className="top-avatar">{user.name[0]}</div><button className="logout-btn top-logout" type="button" title="Log out and return to login" onClick={handleLogout}><Icons.LogOut size={15}/><span>Log out</span></button></div></header>
   <div className="page-wrap"><Outlet/></div>
  </main>
 </div>
}
