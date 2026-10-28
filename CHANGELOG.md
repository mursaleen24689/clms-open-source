# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each entry states the date of the change and the GitHub handle of the person who made it, so
it is always clear who changed what and when. Add a new entry with your own handle in every
pull request.

## [Unreleased]

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
