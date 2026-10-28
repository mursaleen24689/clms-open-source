# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Use GitHub's private reporting: open the **Security** tab of the repository and choose
  **Report a vulnerability**.
- Or contact the maintainer through the address listed on the GitHub profile
  [@mursaleen24689](https://github.com/mursaleen24689).

Include the affected version, steps to reproduce, the impact you expect and, if possible, a
suggested fix. You will receive an acknowledgement as soon as possible, and a fix or
mitigation will be prepared before any public disclosure.

## Deployment hardening

This application is designed for a trusted local network. Before using it with real data:

- Serve it over HTTPS when the network is not fully trusted. Plain HTTP exposes passwords
  and session cookies to anyone who can observe the traffic.
- Set a unique, long `JWT_SECRET` and keep `.env` readable only by the service account.
- Use a dedicated database account with rights on this database only.
- Restrict access with `ALLOWED_IP_PREFIXES` when the server should be reachable only from
  specific subnets.
- Change the seeded example accounts or delete the ones you do not need.
- Keep Node.js, pnpm and MySQL patched; run `pnpm install` after pulling updates.
- Back up the database, `.env` and `uploads/` regularly, and store the backups encrypted and
  outside the project folder.
- Never commit `.env`, database dumps, backups or uploaded files.

## What the application already does

- Bcrypt password hashes (cost 12 for new passwords) with history checks against the last
  five passwords.
- Server-generated captcha on the login form and a 60-second lockout after five failures.
- Signed JWT session cookies (7 days) and bearer tokens for REST calls (8 hours).
- Role checks on every management endpoint, with audit logging of administrative actions.
- Support attachments are only downloadable through an authenticated administrator route.

## Known limitations

- There is no email delivery, so password reset requests are handled manually by an
  administrator.
- Sessions are not revocable server-side before they expire; changing a password does not
  invalidate existing tokens.
- The audit log is stored in the same database and can be altered by anyone with direct
  database access.
