# HTTP API reference

The server exposes two interfaces on the same port:

1. **REST endpoints** used by the dashboards. They authenticate with
   `Authorization: Bearer <token>`, where the token comes from `POST /api/login`
   (valid for 8 hours).
2. **tRPC** at `/api/trpc` for the few procedures that use it. These authenticate with the
   `app_session_id` cookie (valid for 7 days).

All request and response bodies are JSON. Role names are `employee`, `hod`, `pa`, `clerk`
and `admin`. `admin` and `hod` roles are required for the management endpoints marked below.

## Public endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/captcha` | Returns `{ success, captcha_id, image }`; the image is a data URL |
| POST | `/api/login` | Sign in |
| POST | `/api/forgot-password` | Ask an administrator to reset a password |

`POST /api/login` body:

```json
{
  "username": "alice",
  "password": "your-password",
  "captcha_id": "from /api/captcha",
  "captcha_answer": "AB12CD"
}
```

Successful response:

```json
{
  "success": true,
  "token": "<jwt>",
  "name": "Dr. Alice Johnson",
  "role": "employee",
  "persNo": null,
  "bps": null,
  "requiresPasswordChange": false
}
```

Five failed attempts from one address lock that address out for 60 seconds.

`POST /api/forgot-password` body: `{ "username": "...", "persNo": "..." }`. It opens a support
ticket for the administrator; it does not change the password.

## Signed-in endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/user-details?username=` | Own profile, or any profile for management roles |
| POST | `/api/submit-leave` | Apply for leave |
| GET | `/api/my-leaves` | Own leave history |
| DELETE | `/api/my-leaves/:id` | Withdraw one of your own pending requests |
| POST | `/api/update-password` | Change own password |
| POST | `/api/profile-update` | Request a profile change (needs approval) |
| GET | `/api/notifications` | Items needing attention for the current role |
| GET | `/api/supervisors` | List staff who can act as supervisors |
| GET, POST | `/api/memos` | List and create memos |
| PUT, DELETE | `/api/memos` | Update a memo; `/api/memos/:id` deletes one |
| POST | `/api/support` | Open a support ticket (optional multipart attachment) |

`POST /api/submit-leave` body: `{ "username", "startDate", "endDate", "numberOfDays", "reason" }`.
Dates are `YYYY-MM-DD`. `numberOfDays` must equal the number of working days between the dates,
excluding weekends and rows in `public_holidays`.

## Management endpoints

Roles shown are the minimum required; `admin` can call everything `hod` or `clerk` can.

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/api/admin/pending-leaves` | hod, admin, clerk, pa | Pending queue |
| POST | `/api/admin/leave-action/:id` | hod, admin | Final decision or supervisor recommendation |
| GET | `/api/admin/employees-detailed` | hod, admin, clerk, pa | Staff list with balances |
| GET | `/api/admin/employee-records/:id` | hod, admin, clerk | One staff record with leave history |
| GET, POST, DELETE | `/api/admin/holidays` | read: any signed-in user; write: admin | Public holidays |
| POST | `/api/admin/reset-yearly-quota` | admin | Set every balance back to 25 days |
| POST | `/api/admin/users` | admin | Create an account |
| PUT | `/api/admin/users/:id/balance` | admin | Set the remaining balance |
| PUT | `/api/admin/users/:id/reset-password` | admin | Issue a temporary password |
| PUT | `/api/admin/users/:id/assign-supervisor` | admin | Link a supervisor |
| PUT | `/api/admin/users/:id/toggle-supervisor` | admin | Enable or disable supervisor duty |
| PUT | `/api/admin/users/:id/delegate` | admin | Delegate an account |
| DELETE | `/api/admin/users/:id` | admin | Deactivate an account |
| GET | `/api/admin/support` | admin | Support tickets |
| GET | `/api/admin/support/:id/attachment` | admin | Download a ticket attachment |
| PUT | `/api/admin/support/:id/resolve` | admin | Close a ticket |
| GET | `/api/admin/profile-requests` | admin | Pending profile changes |
| PUT | `/api/admin/profile-requests/:id/:action` | admin | Approve (`approve`) or reject (`reject`) |

`POST /api/admin/leave-action/:id` body: `{ "status": "approved" | "rejected" | "without_pay"
| "recommend" | "rejected_by_supervisor", "remarks": "optional" }`. Supervisor actions only
apply to requests whose status is `pending_supervisor`.

`POST /api/admin/users` body:
`{ "name", "username", "password", "role", "designation", "persNo", "bps", "employeeId" }`.
`employeeId` is optional and defaults to the username. The password must be at least 12
characters and the account is forced to change it at first sign-in.

## tRPC

| Procedure | Type | Purpose |
| --- | --- | --- |
| `auth.me` | query | Current user from the session cookie |
| `auth.logout` | mutation | Clear the session cookie |
| `employee.getMyApplications` | query | Own leave requests |
| `employee.getMyBalance` | query | Own balance for the current year |
| `employee.submitApplication` | mutation | Submit a request |
| `hod.getPendingApplications` | query | Pending queue |
| `hod.approveApplication`, `hod.rejectApplication`, `hod.markWithoutPay` | mutation | Decisions |
| `pa.getAllEmployees`, `pa.getAllApplications` | query | Reporting data |
| `system.health` | query | Liveness probe |

## Errors

Errors use `{ "error": "message" }` with an appropriate status code (400, 401, 403, 404,
409 or 500). Audit-relevant actions are written to the `audit_logs` table.
