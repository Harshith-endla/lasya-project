# Role and Permission Design

This document defines the intended access model for the Recruitment Management Platform.

## Roles

| Role | Main responsibility | Key restrictions |
| --- | --- | --- |
| Super Admin | Platform-wide company, account, configuration and audit control | Only role with unrestricted platform administration |
| Company Admin | Manage one company's users, departments and recruitment settings | Must not access another company's tenant data |
| HR Manager | Own company's recruitment lifecycle, employee records, offers and onboarding | Cannot manage platform-wide settings or other companies |
| Recruiter | Work on assigned vacancies and candidate pipeline | No company settings, user administration or payroll |
| Interview Panel | View assigned interviews and submit evaluations | Cannot create vacancies, manage users or change candidate ownership |
| Reporting Manager | Team staffing visibility and permitted employee oversight | No payroll administration or platform configuration |
| Finance / Payroll | Payroll records and compensation reporting | No candidate pipeline or interview administration |
| Employee | Own profile, onboarding tasks and own payroll information | Self-service only |
| CEO | Executive-level hiring and workforce reports | Read-only access to operational data |

## Permission naming

Permissions use resource:action, for example jobs:read, jobs:create, candidates:update, interviews:update, offers:create, onboarding:update and reports:read.

The API permission catalogue lives in server/src/config/permissions.js. Use requirePermission("resource:action") in Express routes. Frontend navigation is a usability feature only; API authorization is the security boundary.

## Tenant isolation

Company-scoped records must carry a company/tenant identifier. Every list, read, update and delete query must constrain records to the authenticated user's company, except for explicitly platform-wide Super Admin operations. Do not rely on a hidden menu or client-supplied company ID.

## Implementation sequence

1. Add and review the permission catalogue.
2. Add company/tenant identifiers and enforce tenant-scoped queries.
3. Protect each API endpoint with a permission check.
4. Add record-level ownership checks for recruiter assignments, interview panel assignments and employee self-service.
5. Derive frontend navigation and action visibility from the same permission model.
6. Test positive and negative access for all nine roles.
