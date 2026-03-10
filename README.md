# JetClash Arena

A fully on-chain 2D jetpack combat game built on Solana with [MagicBlock Ephemeral Rollups](https://docs.magicblock.gg) for real-time multiplayer.

Players battle with jetpacks, guns, and rockets across platform-filled arenas — all game state lives on-chain with sub-second updates via Ephemeral Rollups.

## Tech Stack

- **Client** — Phaser 3.90 + TypeScript + Vite
- **On-chain** — BOLT ECS (Anchor 0.32.1 + bolt-lang 0.2.4) on Solana
- **Multiplayer** — MagicBlock Ephemeral Rollups for low-latency gameplay
- **Wallet** — Phantom (devnet) or auto-generated keypair (local/testing)

## Game Modes

| Mode | Description |
|------|-------------|
| **Singleplayer** | VS AI opponent, fully client-side |
| **Local Multiplayer** | 2P on same keyboard (WASD + Arrows) |
| **Online** | Up to 4 players, fully on-chain via BOLT ECS + MagicBlock ER |

## Project Structure

```
jetclash-arena/
├── client/                     # Phaser game client
│   ├── src/
│   │   ├── scenes/             # Boot, MainMenu, Arena, Lobby, OnlineArena, Result
│   │   ├── entities/           # Player, Projectile, Pickup, AIController
│   │   ├── net/                # InputSender, StateSubscriber, WalletProvider, ClientPrediction
│   │   ├── components/         # HUD, TxLog
│   │   ├── config/             # Game, player, weapon, arena configs
│   │   └── audio/              # Procedural SFX (Web Audio API)
│   └── tests/
│       ├── e2e/                # Playwright browser tests
│       └── scripts/            # Diagnostic & sync test scripts
├── programs-ecs/
│   ├── components/             # 5 BOLT ECS components
│   │   ├── match-state/        # Match lifecycle, player authorities, timer
│   │   ├── player-pool/        # [PlayerData; 4] — positions, HP, ammo, fuel
│   │   ├── arena-config/       # Platforms, spawn points, pickup positions
│   │   ├── projectile-pool/    # [ProjectileData; 10] — active bullets/rockets
│   │   └── pickup-state/       # [PickupData; 5] — health, ammo, speed pickups
│   └── systems/                # 12 BOLT ECS systems
│       ├── init-arena/         # Set up arena platforms and pickups
│       ├── create-match/       # Create room, auto-join host
│       ├── join-match/         # Join existing room
│       ├── ready-up/           # Toggle ready state
│       ├── start-match/        # Start when all ready
│       ├── process-input/      # Apply player input (move, jet, shoot, dash)
│       ├── tick-physics/       # Gravity, velocity, platform collision
│       ├── tick-projectiles/   # Projectile movement and TTL
│       ├── tick-combat/        # Hit detection, damage, kills, respawn
│       ├── tick-pickups/       # Pickup collision and respawn
│       ├── delegate-match/     # Delegate components to Ephemeral Rollup
│       └── settle-match/       # Undelegate and finalize on L1
├── tests/                      # Anchor integration tests (ts-mocha)
│   ├── jetclash.ts             # Main test suite (16 tests)
│   ├── devnet-test.ts          # Devnet + ER lifecycle test
│   ├── er-live-test.ts         # ER delegation test
│   └── fixtures/               # World program + registry fixtures
├── scripts/
│   └── start-local.sh          # Start local dev env (L1 + Vite)
└── ROADMAP.md                  # Milestone progress
```

## Quick Start

### Local Development (Singleplayer / Local Multiplayer)

```bash
cd client
npm install
npx vite --port 3000
```

Open http://localhost:3000 — click **SINGLEPLAYER** or **MULTIPLAYER**.

### On-Chain Development (Online Mode)

```bash
# Start local validator + deploy programs + Vite
bash scripts/start-local.sh
```

Open http://localhost:3000?local — click **ONLINE**.

For devnet testing with pre-funded keypairs (no Phantom):
```
http://localhost:3000?devnet&key=<base58-secret-key>
```

### Run Tests

```bash
# Anchor integration tests (requires local validator)
anchor test

# Playwright E2E tests
cd client && npx playwright test
```

## Online Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Player Client   │────▶│  Solana Devnet    │────▶│  MagicBlock ER  │
│  (Phaser + TS)   │     │  (L1 - Lobby)    │     │  (Gameplay)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
       │                        │                        │
  Local prediction        Create room              Process input
  60fps rendering         Join / Ready              Tick physics
  Input capture           Delegate to ER            Tick combat
  State interpolation     Settle match              State via WS
```

**Flow:** Create room on L1 → Players join & ready → Delegate accounts to ER → Crank game loop at 10Hz on ER → State sync via WebSocket → Settle back to L1.

## Controls

| Action | Player 1 | Player 2 |
|--------|----------|----------|
| Move | WASD | Arrow keys |
| Shoot | F | Numpad 1 |
| Rocket | G | Numpad 2 |
| Dash | Q | Numpad 0 |

## License

Private — all rights reserved.
