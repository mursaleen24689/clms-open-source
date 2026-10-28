# Contributing

Thanks for helping improve the Casual Leave Management System. This guide explains how to
copy the project, propose a change and get it merged.

## Ways to contribute

- Report a bug or ask for a feature through GitHub Issues.
- Improve documentation, comments or the example data.
- Fix a bug or add a feature through a pull request.
- Translate the interface for another language.

## Setting up a working copy

1. Fork the repository on GitHub, then clone your fork:

   ```bash
   git clone https://github.com/<your-handle>/clms-open-source.git
   cd clms-open-source
   ```

2. Follow [INSTALL.md](INSTALL.md) to install Node.js, pnpm, the database and `.env`.
3. Create a branch for your work:

   ```bash
   git switch -c fix/leave-balance-rounding
   ```

Use a short, descriptive branch name. Recommended prefixes: `feat/`, `fix/`, `docs/`,
`refactor/`, `test/`.

## Making a change

- Keep each pull request focused on one topic.
- Match the existing code style (two-space indentation, TypeScript everywhere).
- Run these checks before you commit:

  ```bash
  pnpm check     # TypeScript
  pnpm test      # Vitest
  pnpm format    # Prettier
  ```

- Never commit real staff names, personal data, passwords, `.env` values, database dumps or
  uploaded files. Use the example values already in the repository.

## Commit messages

Use the Conventional Commits style, for example:

```
feat(leave): show remaining days on the approval card
fix(auth): clear the lockout counter after a successful login
docs(install): add the firewall command for Windows
```

The first line should be under about 70 characters. Add a body only when the reason for the
change is not obvious.

## Changelog entry

Every user-visible change needs one line in [CHANGELOG.md](CHANGELOG.md) under
`## [Unreleased]`, with the date and your GitHub handle:

```markdown
### Fixed

- Approval card shows the remaining balance. (2026-11-04, @your-handle)
```

This is what makes the public changelog show **what changed, when, and who changed it**.
At release time the maintainer moves these lines into a numbered version section.

## Pull request checklist

- [ ] The change is described in the pull request title and description.
- [ ] `pnpm check` and `pnpm test` pass.
- [ ] No secrets, personal data or environment values are included.
- [ ] `CHANGELOG.md` has an entry with the date and my GitHub handle.
- [ ] Screenshots are attached for interface changes.

A maintainer will review the pull request, may ask for changes, and then merge it. Your GitHub
handle stays in the commit history and in the changelog entry.

## Reporting security problems

Do not open a public issue for a security problem. Follow [SECURITY.md](SECURITY.md).
