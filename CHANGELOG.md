# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each entry states the date of the change and the GitHub handle of the person who made it, so
it is always clear who changed what and when. Add a new entry with your own handle in every
pull request.

## [Unreleased]

Prepared by [@mursaleen24689](https://github.com/mursaleen24689) while closing the last two
CodeScanning (CodeQL) `js/missing-rate-limiting` alerts on this repository.

### Documentation

- `SECURITY.md` has a new "Controls deliberately not added" section. Two alerts remained
  after 0.1.1, both on a `app.use("*", ...)` route in `server/_core/vite.ts`. Neither is a
  request an attacker needs to slow down - one is compiled out of a production start, the
  other is the single-page-app history fallback that returns one static file - and the
  GitHub alert API stores only a reason code, not an explanation, so the reasoning is
  written where a reader will find it instead. The alerts are dismissed as *won't fix*
  against it. ([@mursaleen24689](https://github.com/mursaleen24689))

## [0.1.1] - 2026-11-05

Prepared by [@mursaleen24689](https://github.com/mursaleen24689) in response to the
CodeScanning (CodeQL) `js/missing-rate-limiting` alerts on this repository.

### Security

- Request limits on the whole API, added with `express-rate-limit` in the new
  `server/_core/rateLimits.ts`. A route that is called too often now answers
  `429 Too Many Requests` with `{ "error": "..." }`, the shape the login page and the
  dashboards already display, plus the standard `RateLimit-*` and `Retry-After` headers
  (`standardHeaders: "draft-7"`, the deprecated `X-RateLimit-*` headers stay off).
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Limits chosen and why. The counts are per client address:
  - 600 requests/minute on every path under `/api`, including `/api/trpc`. This is an
    intranet system for a few hundred staff at their workstations, not a public API: a
    full dashboard load fires roughly ten requests, so the ceiling leaves more than an
    order of magnitude of headroom and still stops a script.
  - 300 requests/minute for the ordinary record reads and the tRPC procedures, so a
    runaway refresh loop cannot starve the shared MySQL server.
  - 10 rejected sign-ins per 15 minutes for `POST /api/login` and `POST /api/auth/login`
    (successful sign-ins do not count, so a shared workstation is never locked out on
    another person's behalf) and 60 captchas per 5 minutes, which also bounds how much
    memory the captcha map can be forced to hold. The existing five-failures/60-second
    lockout is kept as the faster layer.
  - 5 requests per hour for the password workflow (`POST /api/forgot-password`, which is
    unauthenticated and opens a support ticket, and `POST /api/update-password`, which
    runs several bcrypt hashes).
  - 90 per 5 minutes for administrative writes, 120 per 5 minutes for leave submissions,
    decisions and withdrawals, and 40 per 10 minutes for memo writes.
  - 30 uploads per 10 minutes and 60 attachment downloads per 10 minutes, because these
    decode up to 5 MB of base64 and touch the disk, and 30 per minute for the wide
    reports (`employees-detailed` reads every leave row in the database and is what the
    printable and Excel exports are built from).
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Documented what an administrator has to do for those counts to be meaningful: see
  `TRUSTED_PROXY_HOPS` below and the new "Rate limiting" section of `INSTALL.md`. Without
  it, a deployment behind a reverse proxy sees the proxy's address for every request and
  the whole building shares one allowance.
  ([@mursaleen24689](https://github.com/mursaleen24689))

### Fixed

- The client address used by the audit log, `ALLOWED_IP_PREFIXES` and the login lockout is
  taken from `req.ip` instead of the first `X-Forwarded-For` value, so it agrees with the
  key the rate limiters use and a caller can no longer vary the header to obtain a fresh
  bucket or a blank audit identity.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- `patches/wouter@3.9.0.patch` carried a hunk header that counted six old lines and
  twenty-three new lines while the hunk itself contains five and twenty-two, so
  `pnpm install` aborted with `ERR_PNPM_INVALID_PATCH: hunk header integrity check failed`
  and no dependency could be installed at all. The header now matches the hunk; the patch
  content is unchanged and still applies.
  ([@mursaleen24689](https://github.com/mursaleen24689))

### Added

- `TRUSTED_PROXY_HOPS` in `.env.example`, with the proxy note in `INSTALL.md`, the
  deployment hardening list in `SECURITY.md`, a rate limiting section in `docs/API.md`
  and a troubleshooting row for HTTP 429.
  ([@mursaleen24689](https://github.com/mursaleen24689))

## [0.1.0] - 2026-10-28

First public release, prepared by [@mursaleen24689](https://github.com/mursaleen24689).

### Added

- Staff self-service leave applications with automatic working-day calculation, public
  holiday awareness, balance tracking and status history.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Two-step approval: optional supervisor recommendation followed by the head of department
  decision (approve, reject or leave without pay) with remarks and audit trail.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Printable leave application form, two forms per A4 landscape page, with a verification
  QR code, digital signature image and office-use section.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Attendance sheet and leave register printing, internal memo drafting and printing.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Reporting for the personal assistant and clerk roles, including monthly and yearly CSV
  export for finance. ([@mursaleen24689](https://github.com/mursaleen24689))
- Administration area: account creation, password reset, balance adjustment, supervisor
  assignment, profile change requests, support tickets and audit log review.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Ready-to-import database structure in `sql/base_schema.sql`, an example account seeder
  (`pnpm seed`) and a command-line password reset (`pnpm emergency-reset`).
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Documentation: installation guide, API reference, contribution guide and security policy.
  ([@mursaleen24689](https://github.com/mursaleen24689))

### Changed

- Institution names, department names, staff records and document references are replaced
  with neutral example values; all credentials and uploaded data were removed before
  publication. ([@mursaleen24689](https://github.com/mursaleen24689))
- The API network allow-list is now configured with `ALLOWED_IP_PREFIXES` instead of a
  hard-coded subnet, and it is disabled when the setting is empty.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- The HTTP port can be set with `PORT`.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Placeholder logos replace the institution logos; the signature image is optional.
  ([@mursaleen24689](https://github.com/mursaleen24689))

### Fixed

- Creating an account from the administration area now stores the employee identifier, so
  the insert no longer fails on the required `employeeId` column.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- The scheduled database backup now uses the configured database port and honours a
  configurable `mysqldump` location.
  ([@mursaleen24689](https://github.com/mursaleen24689))

### Removed

- Third-party analytics script, preview-platform telemetry plugins, internal build notes,
  stale migrations that did not match the application schema, and a database-coupled test
  that could not run without a live database.
  ([@mursaleen24689](https://github.com/mursaleen24689))

### Security

- Passwords are bcrypt hashes; the last five hashes are retained to block reuse and every
  new account must change its initial password.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Server-generated captcha and per-address login throttling protect the sign-in form.
  ([@mursaleen24689](https://github.com/mursaleen24689))
- Sessions use signed JWT cookies; REST calls require a bearer token and role checks are
  enforced on every management endpoint.
  ([@mursaleen24689](https://github.com/mursaleen24689))

[Unreleased]: https://github.com/mursaleen24689/clms-open-source/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mursaleen24689/clms-open-source/releases/tag/v0.1.0
