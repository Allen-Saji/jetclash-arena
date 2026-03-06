# Tech Architecture

## Frontend
- Phaser 3 + TypeScript
- deterministic client-side simulation baseline
- UI overlays for lobby, queue, result, leaderboard

## Backend (Phase 1)
- Node.js + Fastify (or Nest)
- Postgres for accounts/matches/stats
- Redis optional for queue/session speed

## Services
1. Auth service (wallet sign-in or social login)
2. Match service (queue + room orchestration)
3. Combat state service (authoritative state)
4. Rewards service (credits + missions)
5. Leaderboard service (daily/weekly)

## Data tables (minimum)
- users
- player_profiles
- matches
- match_events
- rewards_ledger
- daily_leaderboard

## Security basics
- server-authoritative hit validation
- anti-speedhack checks
- signed client actions where needed
- replay/resubmit prevention for rewards APIs