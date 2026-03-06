#!/usr/bin/env bash
# Start local development environment for JetClash Arena
# 1. Solana test validator (L1) on port 7899
# 2. MagicBlock Ephemeral Rollup validator on port 8899
# 3. Vite dev server on port 3000

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  kill $L1_PID $ER_PID $VITE_PID 2>/dev/null || true
  wait $L1_PID $ER_PID $VITE_PID 2>/dev/null || true
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT

echo -e "${GREEN}=== JetClash Arena Local Dev ===${NC}\n"

# Build programs
echo -e "${YELLOW}Building programs...${NC}"
anchor build 2>&1 | tail -3

# Start Solana test validator (L1)
echo -e "\n${YELLOW}Starting Solana L1 validator on :7899...${NC}"
solana-test-validator \
  --ledger .bolt/test-ledger \
  --reset \
  --bind-address 127.0.0.1 \
  --rpc-port 7899 \
  --bpf-program 7UHeP4BPqSjfsgcezw3M64TSQYi4BaaWhwH1PkEX96eB target/deploy/arena_config.so \
  --bpf-program 4vrZHTpdz97cCtyhbQuAd2XmvipjuyBQGzqfF4SEgrKX target/deploy/create_match.so \
  --bpf-program Ep4V1sF7RM1o2kBwQG3y86oxrYhd9F9FaCfjdfBYwSyh target/deploy/init_arena.so \
  --bpf-program 23fHYfpHxeCdc38an2CzTkkoGAinN45XodaxVpofuJ1y target/deploy/match_state.so \
  --bpf-program mXNgrxeBx2tiTCh1XxMREergiJ3XgK7YZhNvLA2e5wJ target/deploy/pickup_state.so \
  --bpf-program SVqcqnh6iqyyUTpzLPpV2zjY2eh96wjDkt8Cvs8feoF target/deploy/player_state.so \
  --bpf-program BnhdpxbxwTx4EABpRazimuSR9FGmQADAVdzi8HkDXAaG target/deploy/process_input.so \
  --bpf-program 3vwaQkFZVMvpPFuMvTtUfa1qwrbBDPrLCZhXVtcA4DC8 target/deploy/projectile_pool.so \
  --bpf-program BRdU8TEqfja1aCwhpTznxs7N5wtsEK9XwMrQpgAcXYj target/deploy/tick_combat.so \
  --bpf-program BHwje821iKJ3TCWwtRCQkiuBefJym41zRePDwQQ5ci6r target/deploy/tick_physics.so \
  --bpf-program 6svTwtJNorS61WgrVuBUeJGFZZCniK5zifffikmjZDqQ target/deploy/tick_pickups.so \
  --bpf-program EM73uGdmeq4tev2BwpwZpsbrqkYf4Uf6E2pzSXKPwQ1C target/deploy/delegate_match.so \
  --bpf-program juvewJJY9UutyiH5jGJ2BS3n2RcWNhcKfMHwVvr6quz target/deploy/settle_match.so \
  --bpf-program WorLD15A7CrDwLcLy4fRqtaTb9fbd8o8iqiEMUDse2n tests/fixtures/world.so \
  --account EHLkWwAT9oebVv9ht3mtqrvHhRVMKrt54tF3MfHTey2K tests/fixtures/registry.json \
  > /dev/null 2>&1 &
L1_PID=$!

echo -n "  Waiting for L1 validator..."
for i in $(seq 1 30); do
  if solana cluster-version -u http://127.0.0.1:7899 > /dev/null 2>&1; then
    break
  fi
  sleep 1
  echo -n "."
done
echo ""

solana airdrop 100 -u http://127.0.0.1:7899 > /dev/null 2>&1 || true
echo -e "${GREEN}  L1 Validator ready (PID: $L1_PID)${NC}"

# Start Ephemeral Rollup validator
echo -e "\n${YELLOW}Starting MagicBlock ER validator on :8899...${NC}"
npx @magicblock-labs/ephemeral-validator@0.7.0 \
  --rpc-port 8899 \
  --remote-rpc-url "http://127.0.0.1:7899" \
  --ledger-path .bolt/er-ledger \
  --clone-mode programs-replica \
  > /dev/null 2>&1 &
ER_PID=$!

echo -n "  Waiting for ER validator..."
for i in $(seq 1 30); do
  if solana cluster-version -u http://127.0.0.1:8899 > /dev/null 2>&1; then
    break
  fi
  sleep 1
  echo -n "."
done
echo ""
echo -e "${GREEN}  ER Validator ready (PID: $ER_PID)${NC}"

# Start Vite dev server
echo -e "\n${YELLOW}Starting Vite dev server on :3000...${NC}"
cd client
npx vite --port 3000 > /dev/null 2>&1 &
VITE_PID=$!
cd "$ROOT"
sleep 2
echo -e "${GREEN}  Vite ready (PID: $VITE_PID)${NC}"

echo -e "\n${GREEN}=== Services running ===${NC}"
echo -e "  L1 (Solana):  http://127.0.0.1:7899"
echo -e "  ER (MagicBlock): http://127.0.0.1:8899"
echo -e "  Client:       http://localhost:3000"
echo -e "\nPress Ctrl+C to stop.\n"

wait
