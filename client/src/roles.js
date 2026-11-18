export const roleLabels={
 SUPER_ADMIN:"Super Admin",COMPANY_ADMIN:"Company Admin",HR_MANAGER:"HR Manager",
 RECRUITER:"Recruiter",INTERVIEW_PANEL:"Interview Panel",REPORTING_MANAGER:"Reporting Manager",
 FINANCE_PAYROLL:"Finance / Payroll",EMPLOYEE:"Employee",CEO:"Management / CEO"
};
export const navItems=[
 {label:"Overview",path:"/",icon:"LayoutDashboard",roles:Object.keys(roleLabels)},
 {label:"Job openings",path:"/jobs",icon:"BriefcaseBusiness",roles:["SUPER_ADMIN","COMPANY_ADMIN","HR_MANAGER","RECRUITER","REPORTING_MANAGER","CEO"]},
 {label:"Candidates",path:"/candidates",icon:"Users",roles:["SUPER_ADMIN","COMPANY_ADMIN","HR_MANAGER","RECRUITER","INTERVIEW_PANEL","REPORTING_MANAGER","CEO"]},
 {label:"Interviews",path:"/interviews",icon:"CalendarDays",roles:["SUPER_ADMIN","COMPANY_ADMIN","HR_MANAGER","RECRUITER","INTERVIEW_PANEL","REPORTING_MANAGER"]},
 {label:"Employees",path:"/employees",icon:"ContactRound",roles:["SUPER_ADMIN","COMPANY_ADMIN","HR_MANAGER","REPORTING_MANAGER","EMPLOYEE","CEO"]},
 {label:"Payroll",path:"/payroll",icon:"Wallet",roles:["SUPER_ADMIN","COMPANY_ADMIN","HR_MANAGER","FINANCE_PAYROLL","EMPLOYEE"]},
 {label:"Reports",path:"/reports",icon:"ChartNoAxesCombined",roles:["SUPER_ADMIN","COMPANY_ADMIN","HR_MANAGER","REPORTING_MANAGER","CEO"]}
];
export const roleDescriptions={
 SUPER_ADMIN:"Platform health, tenant administration and access control.",
 COMPANY_ADMIN:"Company setup, users, departments and recruitment governance.",
 HR_MANAGER:"Workforce planning, vacancies, hiring operations and onboarding.",
 RECRUITER:"Your hiring pipeline, candidate conversations and open requisitions.",
 INTERVIEW_PANEL:"Your interview schedule, candidate reviews and evaluation feedback.",
 REPORTING_MANAGER:"Team hiring requests, staffing visibility and employee oversight.",
 FINANCE_PAYROLL:"Compensation records, payroll processing status and cost visibility.",
 EMPLOYEE:"Your employee profile, employment information and payslips.",
 CEO:"Executive hiring overview, workforce trends and business-level reporting."
};
