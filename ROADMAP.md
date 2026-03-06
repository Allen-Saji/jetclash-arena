# JetClash Arena — MagicBlock On-Chain Migration Roadmap

## M1: Scaffold + Static Components — COMPLETE

- [x] Monorepo restructure (`client/` + `programs-ecs/`)
- [x] Anchor/BOLT toolchain setup (bolt-lang 0.2.4, anchor-lang 0.32.1)
- [x] session-keys patch for anchor-lang 0.32.1 compatibility
- [x] 5 BOLT ECS components: PlayerState, MatchState, ArenaConfig, ProjectilePool, PickupState
- [x] 6 BOLT ECS systems: init-arena, create-match, process-input, tick-physics, tick-combat, tick-pickups
- [x] System split to respect Solana's 1024-byte `set_return_data` limit
- [x] 10 integration tests passing against solana-test-validator
- [x] All numeric values use fixed-point i32 (*100), no floats on-chain

**Branch:** `feat/magicblock-onchain`

## M2: Core Game Systems Refinement

- [ ] Stress-test full match loop (3600 ticks, kills, respawns, pickups)
- [ ] Edge cases: simultaneous kills, ammo depletion mid-burst, fuel at zero
- [ ] Deterministic Rust unit tests for physics and combat math
- [ ] Balance tuning: damage, fire rates, dash cooldown, fuel regen
- [ ] Verify account sizes stay within limits under max load

## M3: Ephemeral Rollup Integration

- [ ] `delegate_match` instruction — delegate all 5 match accounts to ER
- [ ] `commit_result` instruction — undelegate, write final result to L1
- [ ] Deploy to MagicBlock devnet, test delegation round-trip
- [ ] Build `InputSender` (client → ER RPC, 30Hz)
- [ ] Build `StateSubscriber` (WebSocket `onAccountChange` for all match accounts)
- [ ] Verify: input → ER → state update → WebSocket callback

## M4: Client Refactor

- [ ] ArenaScene renders from on-chain state (not local physics)
- [ ] Player/Projectile/Pickup become visual-only (no local simulation)
- [ ] `ClientPrediction` — apply inputs locally, reconcile on server state via `input_seq`
- [ ] Privy embedded wallet integration (server-side signing for gameplay txs)
- [ ] Local render at 60fps, reconcile at 30Hz
- [ ] AI practice mode stays fully client-side (no ER)

## M5: Token + Matchmaking

- [ ] Deploy $CLASH SPL token with Transfer Fee + Transfer Hook extensions
- [ ] `MatchEscrowVault` — hold entry fees during match
- [ ] `RewardVault` — season reward pool
- [ ] `TreasuryVault` — protocol fees from transfer fee extension
- [ ] On-chain matchmaking queue (`join_queue` / `leave_queue`)
- [ ] `settle_match` — distribute escrow to winner, fees to treasury

## M6: Polish

- [ ] Crank automation (MagicBlock scheduling or self-hosted)
- [ ] Error handling and disconnect recovery
- [ ] Latency tuning, prediction snap threshold
- [ ] Anti-cheat validation in on-chain systems
- [ ] Timeout: no tick for 10s → auto-draw

## Architecture Notes

### On-Chain Constraints
- **1024-byte return data limit**: Game tick split into 3 systems (physics, combat, pickups)
- **Max components per system**: 5 (tick-combat is the largest)
- **Tick rate**: 30Hz (3600 ticks = 120s match)
- **Kill cap**: 15 kills ends match early

### Component Sizes
| Component | Max Size | Array Limits |
|-----------|----------|-------------|
| PlayerState | ~131 bytes | — |
| MatchState | ~150 bytes | — |
| ArenaConfig | ~600 bytes | 10 platforms, 5 spawns, 5 pickup positions |
| ProjectilePool | ~400 bytes | 10 projectiles |
| PickupState | ~120 bytes | 5 pickups |

### System → Component Mapping
| System | Components | Count |
|--------|-----------|-------|
| init-arena | ArenaConfig, PickupState | 2 |
| create-match | MatchState, P1, P2, ProjectilePool, PickupState | 5 |
| process-input | PlayerState, MatchState, ProjectilePool | 3 |
| tick-physics | MatchState, P1, P2, ArenaConfig | 4 |
| tick-combat | MatchState, P1, P2, ProjectilePool, ArenaConfig | 5 |
| tick-pickups | MatchState, P1, P2, PickupState | 4 |
