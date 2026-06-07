---
name: workspace-router
description: Routes commands to the correct project root across the dataspheres-ai monorepo workspace. Use this skill implicitly whenever the user says "start a branch", "run tests", "check the schema", "update session docs", or any command that targets a specific project. Prevents "not a git repository" errors by ensuring the correct working directory.
argument-hint: ""
---

## Workspace Layout

The Dataspheres AI platform spans three workspaces under `/Users/bunnarithbao/ship/`:

| Workspace | Root Path | Git Repo | Purpose |
|-----------|-----------|----------|---------|
| **dataspheres-ai** | `/Users/bunnarithbao/ship/dataspheres-ai/` | Yes (main repo) | Express backend, React frontend, Prisma schema, all application code |
| **docusaurus** | `/Users/bunnarithbao/ship/docusaurus/` | No (lives under `ship/`) | Session docs, release notes, architecture docs |
| **playwright (e2e)** | `/Users/bunnarithbao/ship/dataspheres-ai/e2e/` | Inside dataspheres-ai | End-to-end tests |

---

## Routing Rules

**ALWAYS prefix commands with the correct `cd` or use absolute paths.** The Claude Code session working directory may not match the target project.

### Git Operations (branch, commit, merge, log, status, diff, tag)
```bash
cd /Users/bunnarithbao/ship/dataspheres-ai && git <command>
```
Git lives ONLY in `dataspheres-ai`. Docusaurus is NOT a separate git repo.

### Application Code (routes, services, components, middleware, prisma)
```bash
# All source code lives here:
/Users/bunnarithbao/ship/dataspheres-ai/src/
/Users/bunnarithbao/ship/dataspheres-ai/prisma/
/Users/bunnarithbao/ship/dataspheres-ai/package.json
```

### Docusaurus Session Docs (session doc, update docs, document this)
```bash
# Session docs live here:
/Users/bunnarithbao/ship/docusaurus/docs/sessions/
# Sidebar config:
/Users/bunnarithbao/ship/docusaurus/sidebars.ts
# Docusaurus config:
/Users/bunnarithbao/ship/docusaurus/docusaurus.config.ts
```

### Playwright Tests (run tests, write tests, test this)
```bash
cd /Users/bunnarithbao/ship/dataspheres-ai && npx playwright test <spec>
# Test files live in:
/Users/bunnarithbao/ship/dataspheres-ai/e2e/
```

### NPM / Package Operations (install, build, dev server)
```bash
cd /Users/bunnarithbao/ship/dataspheres-ai && npm <command>
```

### Database / Prisma (migrate, seed, schema)
```bash
cd /Users/bunnarithbao/ship/dataspheres-ai && npx prisma <command>
```

---

## Common Mistakes This Skill Prevents

1. **"fatal: not a git repository"** — Running `git` from `ship/` or `docusaurus/` instead of `dataspheres-ai/`
2. **"Cannot find module"** — Running `npm` from the wrong directory
3. **"No tests found"** — Running Playwright from outside `dataspheres-ai/`
4. **Editing wrong sidebars.ts** — There's only one, at `docusaurus/sidebars.ts`
5. **Schema edits in wrong location** — Prisma schema is at `dataspheres-ai/prisma/schema.prisma`

---

## Cross-Workspace Workflows

When a task spans multiple workspaces (e.g., "implement feature + write tests + document it"), execute steps in this order:

1. **Code** — `cd /Users/bunnarithbao/ship/dataspheres-ai/` — write the feature
2. **Test** — `cd /Users/bunnarithbao/ship/dataspheres-ai/` — run Playwright E2E
3. **Document** — edit files in `/Users/bunnarithbao/ship/docusaurus/docs/sessions/` — update session docs
4. **Commit** — `cd /Users/bunnarithbao/ship/dataspheres-ai/` — git add + commit (code only, docusaurus is separate)

---

## Quick Reference

```bash
# Git status
cd /Users/bunnarithbao/ship/dataspheres-ai && git status

# Start new branch
cd /Users/bunnarithbao/ship/dataspheres-ai && git checkout -b feature/my-feature

# Run all Playwright tests
cd /Users/bunnarithbao/ship/dataspheres-ai && npx playwright test

# Run specific test
cd /Users/bunnarithbao/ship/dataspheres-ai && npx playwright test e2e/surveys.spec.ts

# Prisma migrate
cd /Users/bunnarithbao/ship/dataspheres-ai && npx prisma migrate dev --name my_migration

# Check Docusaurus dev server
lsof -i -P -n | grep LISTEN | grep node | grep -E ':(3000|3001|3002|3003|4000)' | head -5

# Verify session doc
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/docs/sessions/YYYY-MM-DD-topic/"
```
