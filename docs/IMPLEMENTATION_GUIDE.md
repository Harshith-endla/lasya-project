# TalentFlow implementation guide

## Candidate experience
- Public careers page: `/careers`
- Applicants create a candidate portal password while applying.
- Candidate portal: `/candidate-portal`
- Candidates can update their name, phone, experience, skills and resume, see their application stage, and complete assigned multiple-choice assessments.
- Candidate resume uploads are PDF-only and limited to 5 MB.
- Existing candidate records created by staff before candidate accounts were added do not automatically have candidate portal credentials.

## Hiring workflow
- HR/Recruiters create assessments from Talent operations.
- Assessment questions are configured as JSON. Each question requires a prompt, 2–8 options, and a zero-based correct option index.
- Candidates sign into the candidate portal to submit assigned assessments. Scoring is automatic for these multiple-choice questions.
- Offer letters can be downloaded as a basic PDF from the Offers list.
- Onboarding tasks support PDF document upload and employee self-service completion.
- Resume screening can inspect selectable text in uploaded PDFs and compare user-specified skill keywords. It is not an AI hiring recommendation.

## Notifications
In-app notifications work without external credentials.
Optional outbound delivery:
- Resend: set `RESEND_API_KEY` and `EMAIL_FROM`.
- Twilio SMS: set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.
These values belong in the server environment, never in frontend code or GitHub commits.

## File storage
Uploaded PDFs are stored under `DATA_DIR` (default `server/data`) in private subfolders. Keep this directory on persistent storage in deployment and include it in secure backups. Do not expose it as a public static directory.

## Known boundaries
- Resume text extraction supports common text-bearing PDF streams; scanned/image-only PDFs need an OCR service.
- Resume matching is transparent keyword matching, not AI ranking or an automated hiring decision.
- Assessments currently support multiple-choice questions, not an isolated code-execution environment.
- Offer PDFs are basic printable documents; they are not digitally signed or legally reviewed.
- Assessment delivery supports multiple-choice tests; it does not execute submitted code or provide a secure coding sandbox.
- Email/SMS delivery remains inactive until provider credentials and sender details are configured.
- Candidate portal accounts are created by new careers-page applications; older staff-created records need a separate identity-verification migration before account claiming should be enabled.

## Security reminders
- Use a long, unique `JWT_SECRET` and HTTPS in deployment.
- Keep the SQLite data directory and uploaded documents private and persistent.
- Use separate candidate and staff sessions; do not share tokens.
- Super Admin can activate or deactivate company workspaces; inactive company users are blocked from staff API access.
- Review role permissions and company scoping before production use.
