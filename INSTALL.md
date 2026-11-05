# Installation and deployment

This guide assumes a single server computer on a local network (LAN). It works the same on
Windows, Linux and macOS. Commands are shown for a shell such as Git Bash, PowerShell or
bash.

## 1. Install the tools

1. **Node.js 20.19+** (22 LTS recommended) from <https://nodejs.org>. Verify with `node -v`.
2. **pnpm 10** – run `corepack enable` once, then verify with `pnpm -v`.
3. **MySQL 8 or MariaDB 10.4+**. If XAMPP is already installed, its MariaDB is enough; start
   MySQL from the XAMPP control panel.

## 2. Get the code

```bash
git clone https://github.com/mursaleen24689/clms-open-source.git
cd clms-open-source
pnpm install
```

`pnpm install` also applies the small `wouter` patch in `patches/`; do not delete that folder.

## 3. Create the database

Open a MySQL console (`mysql -u root -p`, or phpMyAdmin in XAMPP) and run:

```sql
CREATE DATABASE clms CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'clms_user'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON clms.* TO 'clms_user'@'localhost';
FLUSH PRIVILEGES;
```

Then import the structure with either method:

```bash
# Method A: import the ready-made schema
mysql -u clms_user -p clms < sql/base_schema.sql

# Method B: let Drizzle generate and apply migrations from drizzle/schema.ts
pnpm db:push
```

Method A is the quickest. Method B is preferred when you plan to change the schema later.

## 4. Configure the application

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Edit `.env`:

- `DATABASE_URL` – for example `mysql://clms_user:choose-a-strong-password@127.0.0.1:3306/clms`.
  Special characters in the password must be percent-encoded.
- `JWT_SECRET` – generate one with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `SEED_DEFAULT_PASSWORD` – any temporary password of 12 characters or more.
- `ALLOWED_IP_PREFIXES` – optional. When set, only addresses starting with one of the listed
  prefixes may use the API. When empty, every address that can reach the server is accepted.
- `TRUSTED_PROXY_HOPS` – optional, and only needed when a reverse proxy runs in front of
  Node. See [Rate limiting](#rate-limiting) below.

Set `MYSQLDUMP_PATH` when the `mysqldump` program is not on the system path (for example
`C:/xampp/mysql/bin/mysqldump.exe`). Keep `.env` out of version control and back it up
separately.

## 5. Create the first accounts

```bash
pnpm seed
```

This adds one head of department, one personal assistant, one administrator and a few staff
accounts (see `seed-db.mjs`). Existing users and leave records are never deleted. Every new
account is forced to choose a new password at first sign-in. Change the example list before
using the system for real staff.

## 6. Run the application

**Development (auto reload):**

```bash
pnpm dev
```

**Production:**

```bash
pnpm build
pnpm start        # serves the compiled client and API on PORT (default 3000)
```

Open <http://localhost:3000> on the server, or `http://<server-ip>:3000` from another
computer on the same network.

## 7. Allow access from other computers

- Give the server computer a fixed IP address (a DHCP reservation on the router is enough).
- Allow the port through the firewall. On Windows:

  ```powershell
  New-NetFirewallRule -DisplayName "CLMS 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
  ```

- Test from another computer with `http://<server-ip>:3000`.

## 8. Keep it running (optional, production)

The application is a normal Node.js process. Use a process manager so it restarts after a
crash or reboot:

- Windows: [NSSM](https://nssm.cc/) or a Task Scheduler task at startup, command
  `node dist/index.js`, working folder the repository root.
- Linux: `systemd` unit running `node dist/index.js` with `Restart=always`.

## Rate limiting

The API answers with HTTP 429 and a short message in `error` when a computer
exceeds its allowance, and the standard `RateLimit-*` plus `Retry-After`
headers say how long to wait. The limits live in
`server/_core/rateLimits.ts`: 600 requests a minute for everything under `/api`,
300 a minute for the ordinary record reads, and much smaller budgets for the
routes that are expensive or worth abusing (10 rejected sign-ins per 15 minutes,
5 password requests per hour, 30 uploads per 10 minutes, 30 wide reports per
minute). They count per client address, never per account, and they are a
backstop against scripts and runaway refresh loops - normal office use does not
come close to them.

**If a browser proxy sits in front of Node, set `TRUSTED_PROXY_HOPS` in `.env`**
to the number of proxy hops (1 for nginx or IIS ARR on the same machine, 2 if a
CDN is in front of that). Without it the server only ever sees the proxy's own
address, so the whole building shares one allowance and one person's repeated
429 blocks everybody else; the startup log then prints
`Reverse proxy mode: trusting N hop(s)`. Leave it empty when staff connect
straight to `http://<server-ip>:3000`, which is the arrangement described in
this guide - setting it while no proxy is present would let a client choose its
own recorded address. Never set it to `true`.

## Backups

The server writes a database dump into `backups/` shortly after startup and then once a day
between 08:30 and 16:30 local time. That folder is excluded from version control. Independently,
back up three things regularly:

1. The database: `mysqldump -u clms_user -p clms > clms-backup.sql`
2. The `.env` file (contains the signing secret).
3. The `uploads/` folder, if staff attach files to support tickets.

Store them outside the project folder, and never commit them.

## Updating

```bash
git pull
pnpm install
pnpm build
# restart the service
```

If `drizzle/schema.ts` changed, run `pnpm db:push` after taking a backup.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `DATABASE_URL must be configured` | `.env` is missing or in the wrong folder |
| `JWT_SECRET must be configured with at least 32 characters` | Generate a longer secret |
| `ER_ACCESS_DENIED_ERROR` | Database user, password or host in `DATABASE_URL` |
| `Access blocked: this server only accepts connections...` | `ALLOWED_IP_PREFIXES` does not include the client address |
| Login page loads but every call returns 403 | Same as above; clear the setting to disable filtering |
| `Too many requests ...` (HTTP 429) on one workstation only | That machine really is looping; if it happens to everyone at once, a proxy is in front of Node and `TRUSTED_PROXY_HOPS` is missing |
| Blank page after `pnpm build` | Run `pnpm build` again; the client output must be in `dist/public` |
| Forgot the administrator password | `pnpm emergency-reset admin "new-password-12+"` |

## Replacing the example branding

- Logos: `client/public/logo.png` and `client/public/logo2.png`.
- Signature image: `client/public/hod_signature.png` (optional).
- Institution and department names: search the `client/src` folder for
  "Example Technical University" and "Department of Engineering".
