import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {db,connectDB,uid,now} from './config/db.js';
export async function seedDemoData({ reset = false } = {}) {
const t=now();
const company = db.prepare('SELECT id,name FROM companies WHERE slug=?').get('demo-company');
if (!company) throw new Error('Default demo company was not initialized');
const companyId = company.id;
if (!reset && db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
if (reset) for(const table of ['payroll','interviews','candidates','employees','jobs','users'])db.prepare(`DELETE FROM ${table}`).run();
const userRows=[
 ['Platform Administrator','superadmin@demo.com','SUPER_ADMIN','Platform'],['Company Administrator','admin@demo.com','COMPANY_ADMIN','Operations'],['Priya Sharma','hr@demo.com','HR_MANAGER','Human Resources'],['Arjun Rao','recruiter@demo.com','RECRUITER','Talent Acquisition'],['Neha Iyer','panel@demo.com','INTERVIEW_PANEL','Engineering'],['Rahul Mehta','manager@demo.com','REPORTING_MANAGER','Engineering'],['Finance Team','finance@demo.com','FINANCE_PAYROLL','Finance'],['Ananya Das','employee@demo.com','EMPLOYEE','Engineering'],['Chief Executive Officer','ceo@demo.com','CEO','Management']
];
const insertUser=db.prepare('INSERT INTO users(id,name,email,password,role,department,title,company,companyId,active,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
const ids={};const hash=await bcrypt.hash('Demo@123',12);
for(const [name,email,role,department] of userRows){const id=uid();ids[email]=id;insertUser.run(id,name,email,hash,role,department,role.replaceAll('_',' '),company.name,companyId,1,t,t)}
const insertJob=db.prepare('INSERT INTO jobs(id,title,department,location,employmentType,description,requirements,openings,status,assignedRecruiter,createdBy,companyId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const jobIds=[uid(),uid(),uid()];
insertJob.run(jobIds[0],'Senior React Developer','Engineering','Bengaluru','Full-time','Build accessible, performant web applications.','React, JavaScript, API integration',2,'Open',ids['recruiter@demo.com'],ids['hr@demo.com'],companyId,t,t);
insertJob.run(jobIds[1],'HR Operations Associate','Human Resources','Hybrid','Full-time','Support people operations and onboarding.','Communication, Excel, HR operations',1,'Open',ids['recruiter@demo.com'],ids['hr@demo.com'],companyId,t,t);
insertJob.run(jobIds[2],'Product Analyst','Product','Remote','Full-time','Translate product data into insights.','SQL, analytics, stakeholder communication',1,'On Hold',ids['recruiter@demo.com'],ids['hr@demo.com'],companyId,t,t);
const insertCandidate=db.prepare('INSERT INTO candidates(id,name,email,phone,job,source,experience,skills,resumeUrl,stage,notes,owner,companyId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const candidateIds=[uid(),uid(),uid(),uid()];
const cand=[['Kavya Reddy','kavya@example.com','+91 98765 43210',jobIds[0],'LinkedIn',4,['React','JavaScript','CSS'],'Interview'],['Rohan Nair','rohan@example.com','+91 98765 43211',jobIds[0],'Referral',3,['React','Node.js'],'Shortlisted'],['Meera Shah','meera@example.com','+91 98765 43212',jobIds[1],'Careers page',2,['Excel','HR Operations'],'Screening'],['Aditya Kumar','aditya@example.com','+91 98765 43213',jobIds[2],'Job board',5,['SQL','Power BI'],'Selected']];
cand.forEach((c,i)=>insertCandidate.run(candidateIds[i],c[0],c[1],c[2],c[3],c[4],c[5],JSON.stringify(c[6]),'',c[7],'',ids['recruiter@demo.com'],companyId,t,t));
const empId=uid();db.prepare('INSERT INTO employees(id,user,employeeId,name,email,department,title,manager,joiningDate,status,companyId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(empId,ids['employee@demo.com'],'EMP-1001','Ananya Das','employee@demo.com','Engineering','Software Engineer',ids['manager@demo.com'],'2025-08-18','Active',companyId,t,t);
db.prepare('INSERT INTO interviews(id,candidate,job,panelist,scheduledAt,mode,meetingLink,status,companyId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(uid(),candidateIds[0],jobIds[0],ids['panel@demo.com'],new Date(Date.now()+86400000).toISOString(),'Online','','Scheduled',companyId,t,t);
db.prepare('INSERT INTO payroll(id,employee,period,gross,deductions,net,status,companyId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),empId,'2026-10',65000,5000,60000,'Paid',companyId,t,t);
console.log('Seed complete. All demo accounts use password: Demo@123');
}

if (process.argv[1]?.replaceAll('\\','/').endsWith('/seed.js')) {
  connectDB();
  await seedDemoData({ reset: process.argv.includes('--reset') });
}
