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
- Set `TRUSTED_PROXY_HOPS` to the number of reverse-proxy hops when a proxy (nginx, Caddy,
  IIS ARR) runs in front of Node. The request limits below count per client address, and
  without that setting every user arrives as the proxy's address and shares one allowance.
  Never enable Express's permissive `trust proxy: true`, which lets a caller choose the
  address the limits are keyed on.
- Change the seeded example accounts or delete the ones you do not need.
- Keep Node.js, pnpm and MySQL patched; run `pnpm install` after pulling updates.
- Back up the database, `.env` and `uploads/` regularly, and store the backups encrypted and
  outside the project folder.
- Never commit `.env`, database dumps, backups or uploaded files.

## What the application already does

- Bcrypt password hashes (cost 12 for new passwords) with history checks against the last
  five passwords.
- Server-generated captcha on the login form and a 60-second lockout after five failures.
- Layered request limits on the whole API, tightened on sign-in, the password workflow,
  administrative writes, uploads and downloads, and the wide reports (`server/_core/rateLimits.ts`).
  Blocked callers receive HTTP 429 with the wait time in the `Retry-After` header.
- Signed JWT session cookies (7 days) and bearer tokens for REST calls (8 hours).
- Role checks on every management endpoint, with audit logging of administrative actions.
- Support attachments are only downloadable through an authenticated administrator route.

## Controls deliberately not added

Code scanning reports two `js/missing-rate-limiting` findings on the catch-all routes in
`server/_core/vite.ts`. Both are dismissed as *won't fix*, and the reasoning lives here rather
than only in the alert, because the reason is a design fact about this application:

- `vite.ts:24` is inside `setupVite`, and `server/_core/index.ts:1408` calls it only when
  `NODE_ENV` is `development`. A production start takes the `else` branch and serves the built
  client instead, so this route is not reachable in a deployment. It re-reads and transforms
  `client/index.html` on every request because that is what hot reload depends on.
- `vite.ts:64` is the single-page-application history fallback. Any path that is not an API call
  or a built asset answers with the same `index.html`, which is how a client-side route such as
  `/leave/12` still loads after a refresh. The response is one static file, identical for every
  caller, and it is never reached for a path that matches a real asset.

Limiting either route would not slow an attacker in a useful way. It would answer HTTP 429 to
staff refreshing the page during a busy minute, which is an outage this project would be
causing itself. The surface that is both expensive and reachable is the API, and that is the one
carrying limits: `readLimiter` guards `/api/trpc` at `server/_core/index.ts:1406`, with the
tighter per-route tiers in `server/_core/rateLimits.ts`. That work closed the other 68 findings
in the same rule.

## Known limitations

- There is no email delivery, so password reset requests are handled manually by an
  administrator.
- Sessions are not revocable server-side before they expire; changing a password does not
  invalidate existing tokens.
- The audit log is stored in the same database and can be altered by anyone with direct
  database access.
