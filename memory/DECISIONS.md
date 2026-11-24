# Decisions

## 🔴 Open (awaiting PM)
- (none)

## 🟡 Assumptions made (PM may override)
- A-001 | Default per-turn timer is 30s (room creator can choose 15s / 30s / 60s) | scrum-master | 2026-11-22
- A-002 | Reconnect grace period before disconnect-forfeit is 60s | scrum-master | 2026-11-22

## ✅ Decided / ADRs

### D-001 Drop PeerJS; use Firebase RTDB only (2026-11-22)
Context: PeerJS + RTDB creates split-brain sync and mobile NAT issues.
Decision: Use Firebase RTDB for all room broadcasting, presence, and move syncing. Drop PeerJS.
Decided by: PM

### D-002 Honor-system RTDB Arbiter (2026-11-22)
Context: Free-to-play concept on Firebase Spark plan without Cloud Functions.
Decision: Resolve challenges client-side via RTDB with path-level read/write rules (casual honor system).
Decided by: PM

### D-003 Public Lobby + Shareable Room Code/Link (2026-11-22)
Context: Room broadcasting requirement.
Decision: Show open `1/2` rooms in a live public lobby list AND support shareable room codes/links (max 2 players).
Decided by: PM

### D-004 Official Flag Back-Rank Win Rule (2026-11-22)
Context: Flag reaching opposite back rank.
Decision: Immediate win if no orthogonally adjacent enemy piece; if an enemy piece is orthogonally adjacent, opponent gets 1 turn to capture it (if they don't, Flag wins).
Decided by: PM

### D-005 Standard 21-Piece Roster (2026-11-22)
Decision: 1× 5-Star, 1× 4-Star, 1× 3-Star, 1× 2-Star, 1× 1-Star, 1× Col, 1× LtCol, 1× Maj, 1× Capt, 1× 1Lt, 1× 2Lt, 1× Sgt, 6× Private, 2× Spy, 1× Flag (21 total, leaving 6 vacant squares on 3×9 setup).
Decided by: PM

### D-006 Per-Turn Timers (2026-11-22)
Decision: Include per-turn timers (Chess.com-style) and random 50/50 first-move selection.
Decided by: PM

### D-007 Update Tech Stack to RTDB + No-Login (2026-11-22)
Decision: Replaced template Firestore + Facebook OAuth with Firebase RTDB + Anonymous Auth (no login UI).
Decided by: PM
