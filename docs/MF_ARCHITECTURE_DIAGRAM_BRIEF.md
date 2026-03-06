# MF — JetClash Architecture + Diagram Build Brief

Use this file as the single source brief to generate architecture docs and visuals for JetClash.

## Objective
Create a complete technical architecture package for **JetClash Arena** covering:
1. System architecture
2. End-to-end flowcharts
3. Individual game mechanics loops
4. Solana state/account model
5. MagicBlock interaction model
6. Token + Token Extension usage model

Output should be implementation-oriented, not just pitch-level.

---

## Product Context (compressed)
- Real-time competitive arena game
- Start with MVP using in-game credits logic and scalable architecture
- Migrate/highlight real-time simulation on **MagicBlock Ephemeral Rollups**
- Settlement, custody, and reward accounting on **Solana L1**
- Jetpack for wallet/session UX and transaction routing
- Token economy enabled with **SPL Token Extensions**

---

## Required Deliverables

### D1) Master Architecture Diagram
Create a top-level architecture diagram with these boundaries:
- Client (Web/Mobile)
- Jetpack session/wallet layer
- Relayer/API/indexer layer
- Solana L1 program layer (Anchor)
- MagicBlock ER simulation layer
- Treasury/token layer

Must show:
- account delegation from L1 -> ER
- action submission path
- result commit path ER -> L1
- settlement/payout path
- telemetry/indexing path

### D2) Flowchart Set (separate diagrams)
Create separate sequence/flow diagrams for:
1. Match create + join + start
2. In-match action loop (ER)
3. Match end + commit + settle
4. Timeout/disconnect/forfeit recovery path
5. Reward distribution + leaderboard update

### D3) Gameplay Mechanics Breakdown
For each core mechanic, provide state transition diagram + validation rules:
- movement/combat/cooldown tick loop
- energy/stamina model
- hit resolution/damage formula hooks
- anti-spam / rate-limit controls
- win condition evaluation

### D4) Solana State Model
Provide explicit account/state model:
- `GlobalConfig`
- `SeasonConfig`
- `PlayerProfile`
- `MatchLobby`
- `MatchEscrowVault`
- `RewardVault`
- `TokenPolicy`
- `MatchResultReceipt`

For each account include:
- seed strategy
- owner/program
- mutability
- who can write
- lifecycle (create/update/close)
- rent/size considerations

### D5) MagicBlock Interaction Design
Document delegated state lifecycle:
1. prepare/delegate
2. simulate actions in ER
3. produce deterministic result hash
4. commit back to L1
5. unlock/cleanup

Include constraints:
- deterministic simulation only
- replay protection / action nonce
- timer enforcement
- max compute and safety guards

### D6) Token + Extension Usage Diagram
Provide token architecture with:
- utility map (entry fees, rewards, sinks, cosmetics)
- transfer fee usage (treasury split)
- optional transfer-hook policy points
- anti-abuse controls (rate limits, match gating)
- season reward emissions and claim model

---

## Smart Contract Instruction Surface (target)
Define and diagram these instruction groups:
- `initialize_global`
- `create_season`
- `register_player`
- `create_lobby`
- `join_lobby`
- `cancel_lobby`
- `delegate_match_state`
- `submit_action` (ER side)
- `commit_match_result`
- `settle_match`
- `claim_rewards`
- `close_match`
- admin: `pause`, `unpause`, `update_fees`

For each instruction provide:
- signer requirements
- required accounts
- expected preconditions
- postconditions/events

---

## Non-Functional Requirements
- Fast UX: sub-second action acknowledgment in match loop
- Correctness over fancy visuals
- No client-authoritative gameplay outcomes
- Recoverable from relayer or player disconnect
- Indexable event model for analytics and anti-cheat review

---

## Diagram Format Requirements
Generate all diagrams in:
1. Mermaid (`.md` friendly)
2. Excalidraw-ready structure notes (so diagrams can be redrawn quickly)

Use **separate diagrams** for:
- high-level system architecture
- game-state transitions
- Solana account relationships
- MagicBlock delegation/commit lifecycle
- token economy flow

---

## Suggested Output File Set
- `docs/11_ARCHITECTURE_OVERVIEW.md`
- `docs/12_FLOWCHARTS.md`
- `docs/13_GAME_MECHANICS_STATE_MODEL.md`
- `docs/14_SOLANA_STATE_AND_INSTRUCTIONS.md`
- `docs/15_MAGICBLOCK_INTERACTIONS.md`
- `docs/16_TOKEN_EXTENSION_USAGE.md`

---

## Acceptance Checklist
- [ ] At least 5 separate diagrams included
- [ ] Solana accounts + seeds defined clearly
- [ ] MagicBlock delegation and commit flow is explicit
- [ ] Token extension usage is concrete (not generic)
- [ ] Instruction-level contract spec provided
- [ ] Includes timeout/dispute/forfeit path

---

## Notes
- Keep MVP-first; avoid overengineering.
- Anything not needed for first playable testnet build should be marked as Phase 2.
