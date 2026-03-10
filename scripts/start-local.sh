#!/usr/bin/env bash
# Start local development environment for JetClash Arena
# 1. mb-test-validator (L1) on port 7899 — loads full delegation infrastructure
# 2. Vite dev server on port 3000
#
# NOTE: Local ER v0.7.0 has fee payer limitation — all game TXs get
# "InvalidWritableAccount" because ER rejects non-delegated fee payers.
# v0.8.x fails to start locally (WS connection errors).
# Use MagicBlock devnet for ER testing: DEVNET_CONFIG in NetworkConfig.ts.
#
# Launch client with ?local to use local validator instead of devnet.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

LOG_DIR="/tmp/jc-logs"
mkdir -p "$LOG_DIR"

cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  kill $L1_PID $VITE_PID 2>/dev/null || true
  wait $L1_PID $VITE_PID 2>/dev/null || true
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT

echo -e "${GREEN}=== JetClash Arena Local Dev ===${NC}\n"

# Build programs
echo -e "${YELLOW}Building programs...${NC}"
anchor build 2>&1 | tail -3

# Start L1 validator via mb-test-validator (loads delegation infra: 7 programs + 10 accounts)
echo -e "\n${YELLOW}Starting L1 validator (mb-test-validator) on :7899...${NC}"
mb-test-validator \
  --ledger .bolt/test-ledger \
  --reset \
  --bind-address 127.0.0.1 \
  --rpc-port 7899 \
  --bpf-program C98REzdiMKjPdL3FLdYHspMRT1ftfFCb6dwke3siFiVo target/deploy/arena_config.so \
  --bpf-program 57jUShxEaZPCx5jHtCA2rrXbxXhoEG2gVvAKezmaEV1g target/deploy/create_match.so \
  --bpf-program 5FDD7CHTMqtdZzQKykJxhFEU7r7UFCGkVnSt1jGWp63v target/deploy/init_arena.so \
  --bpf-program 5ycjVn86LtopfCGL8hLVYp3KTQzTvGyDfTVSXGAKirnB target/deploy/match_state.so \
  --bpf-program SCWJ6A48uueEiDN9a88bWoee4R3FSYsazoL9fjP3tHF target/deploy/pickup_state.so \
  --bpf-program 4n1pmeKn5BkXqPDSuaTnrC8kJqo17tM9AVQbfpTExnbz target/deploy/player_pool.so \
  --bpf-program 9wPRRXi3yManMXSadD8QU2QzEzNyEbFbj5t8fCFuSUS8 target/deploy/process_input.so \
  --bpf-program HeLceFEFqD9JxWSGaLLCMtwkA6QL53xAWzUvsWGbJCqy target/deploy/projectile_pool.so \
  --bpf-program FLneDscsPFESuhmBeiJ7K3fe685hNFyWdTg3jvzCXyWr target/deploy/tick_combat.so \
  --bpf-program 2KRfGTD6TqhLxhr65vkhoJ2oty6LEEgTrXVBF63DmbwG target/deploy/tick_physics.so \
  --bpf-program 4XDGJ41VJHB8XcfohkKA5qRPYg14XhrBq1jFQ38TNMYS target/deploy/tick_pickups.so \
  --bpf-program 58sdUMi9zYfrVGaE7PTYmeSTcF6HyKtP4EoS53JaaV6Z target/deploy/tick_projectiles.so \
  --bpf-program tFnVHnpwChv6nRP21yoRijab1FrRaUX51sAY8fGzQ1a target/deploy/delegate_match.so \
  --bpf-program 9wwqiBZ9zVDYoH5gMfHhh74M1BziEvupqgGDPwn2zne7 target/deploy/settle_match.so \
  --bpf-program uznR74kSGF5g4rXg6BU7xA5mwA1NaSZUyQuctwcsQxY target/deploy/join_match.so \
  --bpf-program 7nm5gwNyTvCzxQ2VXg5FsXey6f5kfUFwRkmSN8tZ5URx target/deploy/ready_up.so \
  --bpf-program EEsbBTCJmubjjmKcLEgk4aQivRKyG5D8kGzALx2TTN1e target/deploy/start_match.so \
  --bpf-program WorLD15A7CrDwLcLy4fRqtaTb9fbd8o8iqiEMUDse2n tests/fixtures/world.so \
  --account EHLkWwAT9oebVv9ht3mtqrvHhRVMKrt54tF3MfHTey2K tests/fixtures/registry.json \
  > "$LOG_DIR/l1-validator.log" 2>&1 &
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

# Start Vite dev server
echo -e "\n${YELLOW}Starting Vite dev server on :3000...${NC}"
cd client
npx vite --port 3000 > "$LOG_DIR/vite.log" 2>&1 &
VITE_PID=$!
cd "$ROOT"
sleep 2
echo -e "${GREEN}  Vite ready (PID: $VITE_PID)${NC}"

echo -e "\n${GREEN}=== Services running ===${NC}"
echo -e "  L1 (Solana):  http://127.0.0.1:7899"
echo -e "  Client:       http://localhost:3000?local"
echo -e "  Logs:         $LOG_DIR/"
echo -e "\n  NOTE: No local ER — use devnet for ER/delegation testing."
echo -e "\nPress Ctrl+C to stop.\n"

wait
