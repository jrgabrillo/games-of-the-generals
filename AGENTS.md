# AGENTS.md — AI Software Development Team Charter

> Single source of truth for every AI tool (Claude Code, Codex, Cursor, Copilot, Gemini, etc.).
> Any agent, in any tool, MUST read this file and `memory/PROJECT_STATE.md` before doing work.

---

## 1. Team Overview

| # | Agent | Owns | Model tier |
|---|-------|------|-----------|
| 0 | **Project Manager (Human)** | Vision, requirements, priorities, final approval | — |
| 1 | **Scrum Master / Orchestrator** | Stories, task routing, memory, escalations | Mid |
| 2 | **Tech Lead / Architect** | Data model, API contracts, ADRs, code review, CI | High |
| 3 | **UI/UX Designer** | Design system, screen specs, UX flows, accessibility | Mid |
| 4 | **Backend Developer** | Firebase: Firestore schema, security rules, indexes, Facebook Auth, Hosting | High |
| 5 | **Frontend Developer** | React + TypeScript + Tailwind CSS + Firebase Web SDK | High |
| 6 | **QA Engineer** | Test plans, automated tests, bug reports | Low–Mid |
| 7 | **Security Engineer** | Threat model, security review, security tests | Mid |

**Changes vs. original request (and why):**
- **Added Tech Lead / Architect.** Backend and frontend need one shared API contract before coding; without it they guess, mismatch, and burn tokens on rework. This role also does code review and owns technical decisions.
- **Scrum Master also orchestrates and keeps memory.** One coordinator instead of a separate "manager" agent saves tokens and keeps the project state in one place.
- **Designer delivers specs + Tailwind tokens, not images.** The frontend can implement text specs directly; images can't be consumed efficiently.
- **Security runs at gates, not on every change.** Full reviews happen per feature/release; developers follow a security checklist meanwhile. Same protection, far fewer tokens.
- **DevOps is folded into the Tech Lead** until deployment becomes complex.

---

## 2. Workflow (per feature)

```
PM requirement
   │
   ▼
[1] Scrum Master ──► user stories (US), tech stories (TS), design stories (DS) ──► PM approves scope 🔴
   │
   ▼
[2] Tech Lead ──► Firestore data model + contracts (memory/API_CONTRACTS.md) + ADR if needed
   │
   ├──────────────────────────┐
   ▼                          ▼
[3] Designer (DS)          [4] Backend (TS) ── builds Firestore rules, indexes & converters to contract
   │                          │
   ▼                          │
[5] Frontend (US) ◄───────────┘  builds to contract + design spec (uses Firebase Emulators until ready)
   │
   ▼
[6] QA ──► tests + bug reports     ║   [7] Security ──► review + security tests
   │                                ║
   ▼                                ▼
[2] Tech Lead code review ──► [1] Scrum Master updates memory ──► PM demo/approval 🔴
```

Parallelism: Designer and Backend start simultaneously once the contract exists. QA and Security run in parallel.

---

## 3. Token Efficiency Rules (ALL agents)

1. **Read only what you need.** Start with `memory/PROJECT_STATE.md` + your assigned story. Open other files only when the task requires them. Never scan the whole repo.
2. **Contracts over conversation.** Communicate through files (`API_CONTRACTS.md`, `DESIGN_SYSTEM.md`, story files), not long chat explanations.
3. **No restating.** Don't repeat the task, the story, or code you didn't change. Show diffs or changed files only.
4. **Terse output.** Reports use the templates in Section 7. No preambles, no summaries of summaries.
5. **One task, one agent, one pass.** Finish your scope; hand off. Don't do another agent's job.
6. **Ask early, not late.** If a requirement is ambiguous, raise it before coding (Section 5).
7. **Reuse first.** Check existing components, hooks, Firestore converters/rules, and utilities before building new ones.
8. **Keep memory lean.** `PROJECT_STATE.md` stays under ~150 lines; move finished items to `memory/archive/`.

---

## 4. Memory Protocol (survives switching AI tools)

All memory lives in the repository as Markdown. No agent relies on chat history.

| File | Purpose | Updated by |
|------|---------|-----------|
| `memory/PROJECT_STATE.md` | Current sprint, what's done, in progress, next | Scrum Master (after every task) |
| `memory/BACKLOG.md` | All stories with ID, status, owner | Scrum Master |
| `memory/DECISIONS.md` | Decisions log + open decisions awaiting PM | Anyone adds; PM resolves |
| `memory/API_CONTRACTS.md` | Firestore collections, TS schemas, security rules, indexes, functions | Tech Lead |
| `memory/DESIGN_SYSTEM.md` | Tokens, components, layout rules | Designer |
| `memory/TECH_STACK.md` | Versions, conventions, commands | Tech Lead |
| `memory/HANDOFF.md` | Append-only log: who did what, what's next | Every agent, at end of task |
| `docs/stories/*.md` | One file per story | Scrum Master |
| `memory/archive/` | Completed sprints, old handoffs | Scrum Master |

**Every agent, every task:**
1. **Start:** read `PROJECT_STATE.md` → your story file → only the files it references.
2. **End:** append a 3–6 line entry to `HANDOFF.md`, update the story status, commit with the story ID in the message (e.g. `TS-004: add user profile Firestore rules & types`).

**Git is memory too.** Commit small and often with story IDs, so any AI can reconstruct history with `git log`.

---

## 5. Escalation to the Project Manager

| Level | When | Action |
|-------|------|--------|
| 🔴 **BLOCKER — PM decision required** | Scope/requirement ambiguity that changes behavior; data model changes affecting existing data; security risk rated High/Critical; new paid service or dependency with license risk; anything irreversible (data deletion, migrations on prod); trade-offs between deadline and quality | **Stop.** Write it in `DECISIONS.md` → "Open". Report to PM using the template below. |
| 🟡 **ASSUMPTION — proceeding** | Minor ambiguity with a sensible default | Proceed with the default, log it in `DECISIONS.md`, mention it in the report. PM can override. |
| 🟢 **FYI** | Informational | Note in `HANDOFF.md` only. |

**🔴 Template:**
```
🔴 PM DECISION REQUIRED — [ID] [short title]
Context: (1–2 lines)
Options:
  A) ... — pros / cons
  B) ... — pros / cons
Recommendation: A, because ...
Blocks: [story IDs]
```

---

## 6. Definition of Done

A story is **Done** only when:
- [ ] Acceptance criteria met
- [ ] Matches API contract and design spec
- [ ] Automated tests written and passing (backend + frontend)
- [ ] Security checklist passed (Section 8); no open High/Critical findings
- [ ] Tech Lead review approved
- [ ] Memory files updated, committed with story ID
- [ ] PM approved (for user-facing stories)

---

## 7. Report Templates

**Task completion (all agents):**
```
✅ [ID] [title] — DONE | BLOCKED | NEEDS REVIEW
Changed: file1, file2
Notes: (max 3 lines)
Assumptions: 🟡 ... (if any)
Next: [agent] → [ID]
```

**Bug report (QA / Security):**
```
🐞 BUG-### [severity: Critical/High/Medium/Low] [title]
Story: [ID] | Area: backend/frontend
Steps: 1. 2. 3.
Expected / Actual:
Evidence: test name or log line
Owner: [agent]
```

---

## 8. Shared Security Checklist (devs apply on every change)

- Firebase / Backend: `firestore.rules` denies all by default (`allow read, write: if false;`); every collection/subcollection enforces `request.auth != null` and ownership/role checks; validate field types, lengths, and immutable fields (`uid`, `createdAt`) in rules; never trust client-supplied roles or privilege flags; if using Cloud Functions, verify Firebase ID tokens and validate inputs.
- Frontend: no secrets or admin/app-secret keys in code or `VITE_*` env vars (Firebase web config is public, Facebook App Secret is server-only); no `dangerouslySetInnerHTML` with user data; handle Facebook OAuth errors cleanly (`auth/account-exists-with-different-credential`, popup blocked); never rely on client-side route/permission checks alone—Firestore Rules are the security boundary.
- Both: no PII, tokens, or sensitive data in logs or URLs; dependencies pinned; errors don't leak internal stack traces to users.

---

## 9. Tech Stack (summary — details in `memory/TECH_STACK.md`)

- **Backend / BaaS:** Firebase — Authentication (Facebook OAuth provider), Cloud Firestore (NoSQL storage + Security Rules + composite indexes), Firebase Hosting (`firebase.json` + SPA rewrites + security headers), Firebase Local Emulator Suite. Optional Cloud Functions (TypeScript) only when server-side logic is required.
- **Frontend:** React (latest) + TypeScript (strict) + Vite + Tailwind CSS (latest), using the modular Firebase Web SDK (`firebase/auth`, `firebase/firestore`) with typed `FirestoreDataConverter`s.
- **Tests:** Firestore Rules unit tests (`@firebase/rules-unit-testing` + Vitest); Frontend Vitest + React Testing Library; E2E Playwright (against Firebase Emulators).
- **Security tooling:** `npm audit`, Semgrep, Firestore Rules emulator tests, OWASP ZAP baseline (for preview/staging).

---

## 10. Agent Roles (summary)

Full definitions live in `.claude/agents/<name>.md` (readable by any AI tool).

- **scrum-master** — Turns PM requirements into US/TS/DS with acceptance criteria; routes tasks; maintains memory; raises 🔴 escalations; never writes code.
- **tech-lead** — Designs Firestore data model and contracts first; writes ADRs; reviews code; owns CI and conventions; breaks ties between agents.
- **ui-ux-designer** — Owns `DESIGN_SYSTEM.md`; writes screen specs (layout, states, copy, interactions) using Tailwind tokens; ensures accessibility (WCAG 2.1 AA) and consistency.
- **backend-dev** — Firebase expert. Firestore schemas/converters, `firestore.rules`, `firestore.indexes.json`, Facebook Auth setup, `firebase.json` hosting/headers, optional Cloud Functions; writes rules unit tests.
- **frontend-dev** — React + TS + Tailwind + Firebase Web SDK. Implements design specs and contracts exactly; typed Firestore layer; handles loading/empty/error/auth states; writes component tests.
- **qa-engineer** — Derives test cases from acceptance criteria; writes automated rules/component/E2E (Playwright) tests; reports bugs; maintains regression suite.
- **security-engineer** — Threat-models each feature; reviews Firestore rules, Facebook Auth flows, Hosting headers, input handling, dependencies; writes security tests; blocks release on High/Critical.
