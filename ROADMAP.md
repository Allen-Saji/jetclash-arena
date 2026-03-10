# JetClash Arena — On-Chain Migration Roadmap

## M1: Scaffold + Static Components — COMPLETE

- [x] Monorepo restructure (`client/` + `programs-ecs/`)
- [x] Anchor/BOLT toolchain setup (bolt-lang 0.2.4, anchor-lang 0.32.1)
- [x] 5 BOLT ECS components: PlayerPool, MatchState, ArenaConfig, ProjectilePool, PickupState
- [x] 6 BOLT ECS systems: init-arena, create-match, process-input, tick-physics, tick-combat, tick-pickups
- [x] System split to respect Solana's 1024-byte `set_return_data` limit
- [x] All numeric values use fixed-point i32 (*1000), no floats on-chain

## M2: Core Game Systems — COMPLETE

- [x] Stress-test full match loop (3600 ticks, kills, respawns, pickups)
- [x] Edge cases: simultaneous kills, ammo depletion mid-burst, fuel at zero
- [x] Balance tuning: damage, fire rates, dash cooldown, fuel regen
- [x] Verify account sizes stay within limits under max load

## M3: Ephemeral Rollup Integration — COMPLETE

- [x] `#[component(delegate)]` on all 5 components for ER delegation support
- [x] `delegate_match` / `settle_match` systems
- [x] All 17 programs deployed to Solana devnet
- [x] Full match lifecycle tested on MagicBlock ER devnet
- [x] MagicBlock infrastructure fixtures (delegation program + supporting .so)
- [x] `InputSender` (client → ER, 10Hz fire-and-forget)
- [x] `StateSubscriber` (WebSocket `onAccountChange` for all match accounts)

## M4: Client + 4-Player Rooms — IN PROGRESS

- [x] 4-player room-based multiplayer (12 systems total)
- [x] LobbyScene: create/join room, ready-up, start match, delegate
- [x] OnlineArenaScene: renders from on-chain state, client-side prediction
- [x] Phantom wallet integration + session keypair (2 popups total)
- [x] `?devnet&key=` mode for automated testing without Phantom
- [x] Devnet: room create, join, ready, delegate, crank all work
- [x] Playwright E2E tests
- [ ] Fix player position sync (crank runs, timer ticks, but positions don't render remotely)
- [ ] Session keys for TX-less input signing

## M5: Token + Matchmaking

- [ ] Deploy $CLASH SPL token with Transfer Fee + Transfer Hook
- [ ] Match escrow vault for entry fees
- [ ] On-chain matchmaking queue
- [ ] `settle_match` — distribute winnings

## M6: Polish

- [ ] Crank automation (MagicBlock scheduling or self-hosted)
- [ ] Disconnect recovery
- [ ] Latency tuning, prediction snap threshold
- [ ] Anti-cheat validation in on-chain systems

## Architecture Notes

### On-Chain Constraints
- **1024-byte return data limit**: Game tick split into 4 systems (physics, projectiles, combat, pickups)
- **Tick rate**: 10Hz on ER (3600 ticks = 360s match)
- **Kill cap**: 15 kills ends match early

### Component Sizes
| Component | Size | Details |
|-----------|------|---------|
| MatchState | ~142 bytes | [Pubkey;4] + counters + tick state |
| PlayerPool | ~304 bytes | [PlayerData;4], 74 bytes each |
| ArenaConfig | ~600 bytes | 10 platforms, 5 spawns, 5 pickups |
| ProjectilePool | ~180 bytes | [ProjectileData;10] |
| PickupState | ~78 bytes | [PickupData;5] |

### Account Layout
8-byte Anchor discriminator + struct fields in declaration order + `bolt_metadata` (32 bytes) at end.
After ER delegation, account owner changes to delegation program — use raw byte parsing, not `anchor.Program.fetch()`.
