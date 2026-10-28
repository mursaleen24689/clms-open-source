# Casual Leave Management System (CLMS)

An offline-first web application for managing casual leave in a university department or any
office team. Staff apply online, supervisors and the head of department approve, and office
staff print the official leave form and export monthly reports. The application runs on a
single computer and is used from other computers on the same network through a browser.

This repository is a cleaned, open-source edition. Institution names, personal data and
credentials have been replaced with example values.

## Features

**For staff**

- Sign in with a username and password, protected by a server-side image captcha and a
  brute-force lockout.
- Apply for casual leave with a date range; working days are calculated automatically.
- See the remaining balance, the status of each request and the approval trail.
- Print the official leave application form (two forms per A4 landscape page) with a
  verification QR code.
- Change the password and request profile updates.

**For supervisors and the head of department (HOD)**

- Review pending requests and approve, reject or mark them as leave without pay.
- Optional first-level supervisor recommendation before the final decision.
- Conflict warning when a large share of the department would be on leave at once.
- Printable attendance sheet and leave register, public holiday management.
- Draft and print internal memos.

**For the personal assistant (PA) and office clerk**

- View every staff record, balances and leave history.
- Export monthly and yearly reports as CSV for payroll or finance.

**For administrators**

- Create accounts, reset passwords, adjust balances, assign supervisors.
- Approve profile change requests, read support tickets, review audit logs.
- Reset the yearly quota at the start of a new leave year.

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS, Radix UI, tRPC client |
| Backend | Node.js, Express, tRPC server, TypeScript (run with `tsx`) |
| Database | MySQL 8 or MariaDB 10.4+, accessed with `mysql2` and Drizzle ORM |
| Auth | Bcrypt password hashes, signed JWT session cookie |
| Tests | Vitest |

## Requirements

- Node.js 20.19 or newer (22 LTS recommended) and pnpm 10 (`corepack enable`)
- MySQL 8 or MariaDB 10.4 or newer (an existing XAMPP installation works)
- About 500 MB of free disk space for dependencies and builds

## Quick start

```bash
# 1. Install dependencies
corepack enable
pnpm install

# 2. Create your configuration
cp .env.example .env      # Windows: copy .env.example .env
#    Edit .env and set DATABASE_URL, JWT_SECRET and SEED_DEFAULT_PASSWORD

# 3. Create the database tables (choose one)
mysql -u root -p clms < sql/base_schema.sql
#    or, when the database user may create tables, let Drizzle do it:
#    pnpm db:push

# 4. Create the example accounts
pnpm seed

# 5. Start the application
pnpm dev
```

Open <http://localhost:3000>. The example accounts are listed in `seed-db.mjs`:

| Role | Username |
| --- | --- |
| Head of department | `hod` |
| Personal assistant | `pa` |
| Administrator | `admin` |
| Staff member | `alice`, `robert`, `carol`, ... |

All seeded accounts start with the password you put in `SEED_DEFAULT_PASSWORD` and are
asked to choose a new one at first sign-in.

Detailed setup, production build and network instructions are in [INSTALL.md](INSTALL.md).
The HTTP API is described in [docs/API.md](docs/API.md).

## Configuration

All settings live in `.env` (see `.env.example`). The file must never be committed.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string, for example `mysql://user:pass@127.0.0.1:3306/clms` |
| `JWT_SECRET` | Random signing secret, at least 32 characters |
| `NODE_ENV` | `development` or `production` |
| `PORT` | HTTP port, default `3000` |
| `ALLOWED_IP_PREFIXES` | Optional comma separated list, for example `192.168.1.,10.0.0.`; empty accepts any address |
| `SEED_DEFAULT_PASSWORD` | Initial password for the example accounts (minimum 12 characters) |
| `MYSQLDUMP_PATH` | Optional full path to `mysqldump` when it is not on the system path |

## Project structure

```
client/                 React frontend
  public/               Static assets (replace the placeholder logos)
  src/pages/            Login, employee/HOD dashboards, memos, printable form
  src/components/       Shared UI components
server/                 Express API, authentication, business logic
  _core/index.ts        All REST endpoints and startup
  _core/sdk.ts          Session cookies and JWT helpers
  db.ts, routers.ts     Database helpers and tRPC routes
drizzle/                Database schema and Drizzle configuration
sql/base_schema.sql     Ready-to-import database structure
seed-db.mjs             Example account seeder
emergency-reset.js      Command-line password reset for locked-out administrators
docs/                   API reference
```

## Branding

- Replace `client/public/logo.png` and `client/public/logo2.png` with your own logos.
- Replace `client/public/hod_signature.png` if you want the signature printed on approved
  forms; without the file the signature line stays blank.
- The institution name, department name and footer text appear in `client/src/App.tsx`,
  `client/src/pages/Login.tsx`, `client/src/pages/HODDashboard.tsx` and
  `client/src/pages/PrintableLeaveForm.tsx`.
- The primary colour is defined in `tailwind.config.js` and `client/src/index.css`.

## Security notes

- Passwords are hashed with bcrypt; the last five hashes are kept to block reuse.
- Sessions use a signed cookie that expires after seven days.
- Failed sign-ins are rate limited per IP address.
- Never publish `.env`, database dumps, the `uploads/` folder or backups.
- Report security problems as described in [SECURITY.md](SECURITY.md).

## Release history

See [CHANGELOG.md](CHANGELOG.md) for dated entries, or the
[releases page](https://github.com/mursaleen24689/clms-open-source/releases) for version notes.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull
request; it explains the branch, commit and changelog conventions used here.

## Licence

Released under the MIT Licence. See [LICENSE](LICENSE).
