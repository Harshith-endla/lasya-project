import {Routes,Route,Navigate} from "react-router-dom";
import {useAuth} from "./context/AuthContext";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import ModulePage from "./pages/ModulePage";
import Reports from "./pages/Reports";
import AdminPage from "./pages/AdminPage";
function Protected({children}){const {user,loading}=useAuth();if(loading)return <div className="loading-screen">Loading your workspace…</div>;return user?children:<Navigate to="/login" replace/>;}
export default function App(){const {user}=useAuth();return <Routes>
 <Route path="/login" element={user?<Navigate to="/" replace/>:<Login/>}/>
 <Route path="/" element={<Protected><Layout/></Protected>}>
  <Route index element={<Dashboard/>}/>
  <Route path="admin" element={<AdminPage/>}/>
  <Route path="jobs" element={<ModulePage type="jobs"/>}/>
  <Route path="candidates" element={<ModulePage type="candidates"/>}/>
  <Route path="interviews" element={<ModulePage type="interviews"/>}/>
  <Route path="employees" element={<ModulePage type="employees"/>}/>
  <Route path="payroll" element={<ModulePage type="payroll"/>}/>
  <Route path="reports" element={<Reports/>}/>
 </Route>
 <Route path="*" element={<Navigate to="/" replace/>}/>
 </Routes>;}
