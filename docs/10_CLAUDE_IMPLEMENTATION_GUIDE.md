# Claude Implementation Guide

This repo is docs-first. Build in focused, shippable increments.

## Build order
1. Scaffold Phaser project + scene architecture
2. Implement movement/combat core loop
3. Add match rules + timer + score
4. Build lobby/queue/result UI
5. Integrate backend match service
6. Add credits economy + reward ledger
7. Add daily leaderboard
8. Stabilize and optimize

## Scene structure suggestion
- BootScene
- MainMenuScene
- QueueScene
- ArenaScene
- ResultScene
- LeaderboardScene

## Code quality requirements
- strict TypeScript
- deterministic simulation where possible
- no giant god files; feature modules by domain
- add tests for scoring and rewards logic

## Commit strategy
Use small commits with clear scope:
- feat(game): movement and jetpack fuel system
- feat(game): weapons and collision damage
- feat(match): timer win conditions and scoring
- feat(economy): credits reward ledger and caps

## MVP acceptance checklist
- play full match from queue to result without crash
- rewards granted correctly
- rematch works
- leaderboard updates
- build and run scripts documented

## Non-goals for initial implementation
- token integration
- on-chain match authority
- marketplace
- clan wars

Ship fast, validate retention, then expand.