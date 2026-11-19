/**
 * Central permission catalogue for TalentFlow.
 * Route handlers should use requirePermission("resource:action") so that
 * authorization is enforced by the API, not only by hidden frontend links.
 */
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["*"],
  COMPANY_ADMIN: [
    "company:read", "company:update", "users:read", "users:create", "users:update",
    "departments:read", "departments:create", "departments:update",
    "jobs:read", "jobs:create", "jobs:update", "jobs:delete",
    "candidates:read", "candidates:create", "candidates:update", "candidates:delete",
    "resumes:read", "interviews:read", "interviews:create", "interviews:update",
    "assessments:read", "assessments:create", "assessments:update",
    "offers:read", "offers:create", "offers:update",
    "onboarding:read", "onboarding:create", "onboarding:update",
    "notifications:read", "notifications:create", "reports:read", "payroll:read", "payroll:create", "payroll:update",
    "employees:read", "employees:create", "employees:update"
  ],
  HR_MANAGER: [
    "users:read", "users:create", "users:update", "departments:read",
    "jobs:read", "jobs:create", "jobs:update",
    "candidates:read", "candidates:create", "candidates:update",
    "resumes:read", "interviews:read", "interviews:create", "interviews:update",
    "assessments:read", "assessments:create", "assessments:update",
    "offers:read", "offers:create", "offers:update",
    "onboarding:read", "onboarding:create", "onboarding:update",
    "notifications:read", "reports:read", "employees:read", "employees:create", "employees:update",
    "payroll:read"
  ],
  RECRUITER: [
    "jobs:read", "candidates:read", "candidates:create", "candidates:update",
    "resumes:read", "interviews:read", "interviews:create", "interviews:update",
    "assessments:read", "assessments:create", "offers:read", "notifications:read"
  ],
  INTERVIEW_PANEL: [
    "interviews:read", "interviews:update", "assessments:read", "assessments:update",
    "candidates:read", "resumes:read", "notifications:read"
  ],
  REPORTING_MANAGER: [
    "jobs:read", "candidates:read", "interviews:read", "employees:read",
    "employees:create", "employees:update", "reports:read", "notifications:read"
  ],
  FINANCE_PAYROLL: [
    "employees:read", "payroll:read", "payroll:create", "payroll:update", "reports:read"
  ],
  EMPLOYEE: [
    "employees:read:self", "payroll:read:self", "onboarding:read:self",
    "onboarding:update:self", "notifications:read:self"
  ],
  CEO: [
    "reports:read", "jobs:read", "candidates:read", "employees:read",
    "interviews:read"
  ]
};

export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action.",
        requiredPermission: permission
      });
    }
    next();
  };
}
