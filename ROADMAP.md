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

## M2: Core Game Systems Refinement — COMPLETE

- [x] Stress-test full match loop (3600 ticks, kills, respawns, pickups)
- [x] Edge cases: simultaneous kills, ammo depletion mid-burst, fuel at zero
- [x] 41 integration tests passing (anchor test)
- [x] Balance tuning: damage, fire rates, dash cooldown, fuel regen
- [x] Verify account sizes stay within limits under max load

## M3: Ephemeral Rollup Integration — COMPLETE

- [x] `#[component(delegate)]` on all 5 components for ER delegation support
- [x] `delegate_match` / `settle_match` systems with correct program IDs
- [x] All 13 programs deployed to Solana devnet
- [x] Full match lifecycle tested on MagicBlock ER devnet (11/11 tests passing)
  - World + entity + component creation on L1
  - Arena init + match creation on L1
  - Delegation of all 6 components to MagicBlock ER
  - process-input, tick-physics, tick-combat, tick-pickups on ER
  - Raw byte deserialization verification (tick, ticksRemaining, inputSeq)
- [x] MagicBlock infrastructure fixtures (DELeGG delegation program + supporting .so files)
- [x] Local dev environment: L1 (:7899) + ER (:8899) + Vite (:3000)
- [x] `InputSender` (client → RPC, 30Hz fire-and-forget)
- [x] `StateSubscriber` (WebSocket `onAccountChange` for all match accounts)
- [x] Verify: input → ER → state update → WebSocket callback

**Known limitation:** Local ER v0.7.0 has fee payer issue; use MagicBlock devnet for ER testing. ER v0.8.2 is broken (silent exit); stick with v0.7.0.

## M4: Client Refactor — IN PROGRESS

- [x] `OnlineArenaScene` renders from on-chain state (not local physics)
- [x] Player/Projectile/Pickup visual-only (positions driven by chain state)
- [x] `ClientPrediction` — apply inputs locally, reconcile on server state via `input_seq`
- [x] Browser-compatible Anchor provider (anchor.setProvider + vite dedupe)
- [x] Raw byte deserialization for all 5 component types in browser
- [x] Client crank: tick-physics, tick-combat, tick-pickups at 10Hz
- [x] Playwright E2E test: menu → ONLINE → on-chain setup → gameplay → timer decrement verified
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

### Component Sizes (verified on devnet)
| Component | Actual Size | Array Limits |
|-----------|------------|-------------|
| PlayerState | 144 bytes | — |
| MatchState | 158 bytes | — |
| ArenaConfig | ~600 bytes | 10 platforms, 5 spawns, 5 pickup positions |
| ProjectilePool | ~400 bytes | 10 projectiles |
| PickupState | ~120 bytes | 5 pickups |

### Deserialization
- Account layout: 8-byte Anchor discriminator + struct fields in IDL order + bolt_metadata (32 bytes) at end
- After ER delegation, account owner changes to delegation program — use raw byte parsing, not anchor.Program.fetch()
- Browser: requires vite dedupe for `@coral-xyz/anchor` + `@solana/web3.js` and explicit `anchor.setProvider()`

### System → Component Mapping
| System | Components | Count |
|--------|-----------|-------|
| init-arena | ArenaConfig, PickupState | 2 |
| create-match | MatchState, P1, P2, ProjectilePool, PickupState | 5 |
| process-input | PlayerState, MatchState, ProjectilePool | 3 |
| tick-physics | MatchState, P1, P2, ArenaConfig | 4 |
| tick-combat | MatchState, P1, P2, ProjectilePool, ArenaConfig | 5 |
| tick-pickups | MatchState, P1, P2, PickupState | 4 |
