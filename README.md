# HireFlow – Recruitment Management System (Frontend)

A responsive React + Vite frontend prototype for the Recruitment Management System. It includes a dedicated sign-in experience, ten role workspaces, role-specific navigation, dashboards, candidate and job views, profile detail drawer, quick-create modal, notifications, and interactive UI feedback.

## Included roles
1. Super Admin
2. Company Admin
3. HR Manager
4. Recruiter
5. Interview Panel
6. Finance/Payroll
7. Management/CEO
8. Reporting Manager
9. Employee
10. Candidate (separate candidate workspace)

## Requirements
- Node.js 18 or newer
- npm

## Run on Windows / VS Code
1. Extract the project ZIP.
2. Open the `Recruitment-Management-System` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:

```powershell
cd client
npm install
npm run dev
```

5. Open the local URL printed by Vite (normally `http://localhost:5173`).
6. Use the sign-in screen's **Preview workspace as** selector to preview any role. This frontend currently uses demo data and client-side interactions; backend authentication and MongoDB integration will be connected in the next phase.

## Frontend structure
```text
client/
├── public/
├── src/
│   ├── components/
│   ├── data/appData.js
│   ├── pages/
│   ├── styles/styles.css
│   └── main.jsx
├── index.html
├── package.json
└── vite.config.js
```

## Current prototype interactions
- Switch between all ten role workspaces.
- Role-specific sidebar navigation.
- Candidate search, profile detail drawer and application list.
- Job listings and quick-create job interaction.
- Notification popover and export/filter feedback.
- Responsive desktop, tablet and mobile layouts.

> This is the frontend-only first milestone. Demo actions are local UI interactions and do not yet persist to a database. API integration, secure role authorization, file upload and real workflows are planned for the backend phase.
