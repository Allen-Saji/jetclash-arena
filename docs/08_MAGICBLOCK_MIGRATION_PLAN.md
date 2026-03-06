# MagicBlock Migration Plan

## Objective
Keep gameplay smooth while progressively moving core authority on-chain.

## Step 1 (Hybrid)
- Gameplay mostly off-chain authoritative server
- End-match settlement commits on-chain

## Step 2 (Delegated sessions)
- Delegate match state accounts to MagicBlock ER
- Process fast action/state updates in ER
- Commit canonical outcomes back to base layer

## Step 3 (On-chain-first ranked)
- Ranked matches use on-chain authoritative state path
- off-chain path remains for casual modes

## Engineering rules
- idempotent settle instructions
- explicit state machine transitions
- rollback-safe commit handling
- deterministic replay/testing harness

## Success criteria
- no user-experience degradation
- verifiable match outcomes
- measurable reduction in trust assumptions for ranked mode