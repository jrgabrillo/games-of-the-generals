# Tech Stack & Conventions
Owner: tech-lead. Updated for Games of the Generals (2026-11-22).

## Versions
- React: 19.x · TypeScript: 5.x (strict) · Vite: 6.x · Tailwind CSS: 4.x
- Firebase Web SDK: modular (`firebase/app`, `firebase/auth`, `firebase/database`) · Firebase CLI: latest
- Auth: Firebase Anonymous Authentication (zero-login session identity for RTDB rules & reconnects)
- DB: Firebase Realtime Database (RTDB) — rooms, game state, presence (`onDisconnect`), honor-system challenge resolution
- Hosting: Firebase Hosting
- Testing: Vitest · React Testing Library · Playwright (mobile viewport E2E) · Node: LTS

## Repo structure
```
src/
  api/              # typed Firebase RTDB repositories & presence helpers
  engine/           # pure TS game engine (9x8 board, 21-piece roster, movement, challenge matrix, win checks)
  components/ui/    # shared design-system primitives
  features/         # feature modules (lobby, setup, board, modals)
  pages/            # route pages (LobbyPage, GamePage)
  hooks/            # custom React hooks (useSession, useRoom, useTurnTimer)
  lib/              # firebase.ts init, env validation, sound/haptics utilities
tests/
  engine/           # pure unit tests for all game rules
e2e/                # Playwright E2E specs (2-player mobile viewport)
database.rules.json
firebase.json
.firebaserc
```

## Commands
- Emulators: `firebase emulators:start --only auth,database,hosting`
- Frontend dev: `npm run dev` · unit tests: `npm test` · typecheck: `npm run typecheck` · build: `npm run build`
- E2E: `npx playwright test` (against Firebase Emulators)
- Deploy: `firebase deploy --only hosting,database`
- Security: `npm audit`

## Conventions
- TypeScript: ESLint + Prettier, `strict: true`, no `any`
- Tailwind CSS: CSS-first `@theme` tokens in `src/index.css` (v4+)
- Branches: `feature/<ID>-short-name` · Commits: `<ID>: message`
