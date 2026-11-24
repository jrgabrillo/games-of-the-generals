# Design System
Owner: ui-ux-designer

## Brand
Personality: Tactical, crisp, distraction-free (Chess.com-inspired mobile web)
Theme: Dark slate & tactical olive/emerald accents

## Tokens (`src/index.css` → `@theme` — Tailwind v4+)
- Surface: `--color-bg: #161512`, `--color-panel: #262421`, `--color-panel-elevated: #302e2b`
- Board squares (Red-Wood Mahogany): `--color-sq-light: #8c2d25` (warm mahogany grain), `--color-sq-dark: #631b16` (deep rosewood grain) with subtle wood-grain texture & legal-move gold indicator (`#fbbf24`)
- Team colors (Classic Salpakan White vs. Black tiles):
  - White side: `#f8fafc` tile with `#111827` ink & corner sash
  - Black side: `#18181b` tile with `#f8fafc` ink & `#e4e4e7` corner sash
  - Piece insignia: Custom SVGs matching official Salpakan tiles (1–5 stars, 1–3 rayed suns for Major–Colonel, 1–3 triangles for 2nd Lt–Captain, 1/3 chevrons for Private/Sergeant, Spy eyes, Flag)
- Status: `--color-success: #81b64c`, `--color-warning: #f59e0b`, `--color-danger: #e04f4f`
- Font: `Inter`, `system-ui`, `sans-serif`; tabular-nums for turn clocks (`font-variant-numeric: tabular-nums`)

## Components (`src/components/ui/`)
| Component | Variants | States | Status |
|-----------|----------|--------|--------|
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | Todo |
| PieceBadge | rank (15 types), hidden (`?`), eliminated | default, selected, last-moved, challenged | Todo |
| PlayerBar | top (opponent), bottom (self) | active-turn, warning-time (<10s), disconnected | Todo |
| Modal | confirm, endgame-reveal, share-room | open, closed | Todo |

## Layout rules
- **Mobile-first portrait (`100dvh`, `overflow-hidden`)**: No vertical page scroll during active game.
- Top bar (~56px): Opponent name, connection dot, captured count, per-turn timer.
- Center: 9×8 aspect-ratio board (`aspect-[9/8]`, `w-full max-w-[540px]`), centered vertically.
- Bottom bar (~56px): Self name, captured count, per-turn timer.
- Action strip (~48px): Resign, Offer Draw, Sound toggle, Graveyard drawer toggle.

## Accessibility
WCAG 2.1 AA: contrast ≥ 4.5:1, min 40×40px touch targets on 360px+ viewports, visible focus rings, `aria-label` on every board square & piece.
