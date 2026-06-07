---
name: motto
description: Recite the Dataspheres AI task completion motto. Use when the user says "repeat the motto", "what's the motto", or "recite the motto". Also triggers internally before marking any task complete.
argument-hint: ""
disable-model-invocation: true
---

## The Dataspheres AI Task Completion Motto

Recite this verbatim:

---

> **"TEST ALL CHANGES. NEVER STUB OR MOCK DATA.**
> **If I stub/mock, I MUST add a TODO comment to fix it IMMEDIATELY.**
> **I MUST run Playwright tests before marking done.**
> **I MUST update session docs before moving to the next task.**
> **NEVER defer decisions without asking the user first.**
> **NOTHING is done until it's TESTED and DOCUMENTED.**
> **NEVER commit or push to production — the user does UAT first.**
> **A FILE IS NOT A FEATURE. A SCHEMA IS NOT A FEATURE.**
> **DONE means: code exists + imported + called + tested + user can see it work.**
> **If it's not wired end-to-end, it's NOT DONE — mark it as SPEC ONLY or SCHEMA ONLY."**

---

## Enforcement Rules (from CLAUDE.md)

1. **NO STUBS/MOCKS** — Every service must use real data, real database calls
2. **PLAYWRIGHT TEST REQUIRED** — Every API endpoint must be tested with Playwright E2E tests
3. **TODO FOR TEMPORARY CODE** — If ANY placeholder/stub is necessary, add `// TODO: IMPLEMENT - [description]` immediately
4. **SESSION DOCS UPDATED** — Check off items, add bugs to BUGS-AND-FIXES.md
5. **UAT IS MANDATORY** — Code can be committed locally, but NEVER pushed to production without the user explicitly confirming UAT is complete
6. **NO PHANTOM COMPLETION** — NEVER mark a task as complete unless ALL of these are true:
   - The code is written AND imported/called from the runtime
   - The feature is reachable by a user action (API call, UI click, or automated trigger)
   - The feature has been verified to produce the expected output (test or manual check)
   - If it's a schema/migration only → mark as "SCHEMA ONLY", not complete
   - If it's a component that's never rendered → mark as "COMPONENT ONLY", not complete
   - If it's a service that's never called → mark as "FILE ONLY", not complete

## Completion Status Labels

Use these HONEST labels in project trackers:

| Label | Meaning |
|---|---|
| **DONE** | Code exists + wired + tested + user can see it work |
| **SCHEMA ONLY** | Database migration deployed, Prisma model exists, but no runtime code reads/writes it |
| **COMPONENT ONLY** | React component built, but never imported or rendered in any page |
| **FILE ONLY** | Service/utility file exists, but never imported or called from any other file |
| **SPEC ONLY** | Documented in session docs, no code written |
| **PARTIAL** | Some code works, but key integration points are missing |
| **WIRED BUT UNUSED** | Code is imported and called, but the trigger condition never fires |

## What UAT Covers (minimum)
- New UI flows work end-to-end in the browser
- No console errors on the happy path
- Edge cases mentioned in the session doc don't crash the page
- Any schema migrations ran cleanly on the target environment

## Audit Check (run before updating any tracker)

Before marking ANY task as complete, answer these questions:
1. Can I trigger this feature right now? (API call, UI click, or automated event)
2. Does it produce the expected output when triggered?
3. If I removed this file, would anything break? (If no → it's not wired)
4. Is there a test that verifies it works?

If ANY answer is NO → it's not DONE. Use the appropriate status label above.

**Source of truth**: `CLAUDE.md` lines 47–53 in `/Users/bunnarithbao/ship/dataspheres-ai/`
