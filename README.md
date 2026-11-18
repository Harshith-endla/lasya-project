# Recruitment Management Platform — SQLite Edition

A full-stack recruitment and HR management application. The original React + Vite frontend and Express API have been retained; MongoDB/Mongoose have been replaced with SQLite (`better-sqlite3`). The Express server serves the built React app, so a single web-service deployment can host the complete application.

## Technology stack
- React 18, Vite, React Router, Axios, Recharts, Lucide React
- Node.js 20+, Express 4
- SQLite via better-sqlite3 (no separate database server or Atlas account)
- JWT authentication and bcrypt password hashing

## Modules retained
- Nine role-based workspaces: Super Admin, Company Admin, HR Manager, Recruiter, Interview Panel, Reporting Manager, Finance / Payroll, Employee, CEO
- Login, role authorization, dashboard, jobs, candidates, interviews, employees, payroll and reports

## Run in a browser-hosted environment
Import this repository into a Node.js hosting platform that supports a persistent disk if you need records to survive restarts. The included `render.yaml` defines a single web service. Set `DATA_DIR` to the mounted persistent-disk path for durable SQLite storage. On a free ephemeral instance, SQLite data may be lost when the instance restarts or redeploys.

The application automatically creates its demo accounts and sample records the first time it starts on an empty database. To intentionally reset demo data later, run `npm run seed -- --reset` from the server directory. This deletes all existing application records.

## Local development (optional)
Requires Node.js 20+; no MongoDB installation is needed.

```bash
npm install --prefix server
npm install --prefix client
npm --prefix server run seed
npm --prefix client run dev
npm --prefix server run dev
```

Vite proxies `/api` to `http://localhost:5000` during development.

## Demo credentials
All demo accounts use `Demo@123`:
- `superadmin@demo.com`
- `admin@demo.com`
- `hr@demo.com`
- `recruiter@demo.com`
- `panel@demo.com`
- `manager@demo.com`
- `finance@demo.com`
- `employee@demo.com`
- `ceo@demo.com`

## API
`/api/health`, `/api/auth/login`, `/api/auth/me`, `/api/dashboard`, `/api/jobs`, `/api/candidates`, `/api/interviews`, `/api/employees`, `/api/payroll`, `/api/reports/overview`.

## Notes
- SQLite stores data in `DATA_DIR/recruitment.sqlite`. Set `DATA_DIR` to persistent storage in hosted deployments.
- Payroll is a simple record-keeping module, not a statutory payroll/tax engine.
- Resume upload is still represented by a URL field; no file-storage service is configured.
- Change demo passwords and review security settings before production use.
