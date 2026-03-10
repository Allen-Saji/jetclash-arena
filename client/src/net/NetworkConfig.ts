import { PublicKey } from '@solana/web3.js';
import type { NetworkConfig } from './types';

const PROGRAM_IDS = {
  playerPool: new PublicKey('4n1pmeKn5BkXqPDSuaTnrC8kJqo17tM9AVQbfpTExnbz'),
  matchState: new PublicKey('5ycjVn86LtopfCGL8hLVYp3KTQzTvGyDfTVSXGAKirnB'),
  arenaConfig: new PublicKey('C98REzdiMKjPdL3FLdYHspMRT1ftfFCb6dwke3siFiVo'),
  projectilePool: new PublicKey('HeLceFEFqD9JxWSGaLLCMtwkA6QL53xAWzUvsWGbJCqy'),
  pickupState: new PublicKey('SCWJ6A48uueEiDN9a88bWoee4R3FSYsazoL9fjP3tHF'),
  processInput: new PublicKey('9wPRRXi3yManMXSadD8QU2QzEzNyEbFbj5t8fCFuSUS8'),
  tickPhysics: new PublicKey('2KRfGTD6TqhLxhr65vkhoJ2oty6LEEgTrXVBF63DmbwG'),
  tickCombat: new PublicKey('FLneDscsPFESuhmBeiJ7K3fe685hNFyWdTg3jvzCXyWr'),
  tickPickups: new PublicKey('4XDGJ41VJHB8XcfohkKA5qRPYg14XhrBq1jFQ38TNMYS'),
  tickProjectiles: new PublicKey('58sdUMi9zYfrVGaE7PTYmeSTcF6HyKtP4EoS53JaaV6Z'),
  delegateMatch: new PublicKey('tFnVHnpwChv6nRP21yoRijab1FrRaUX51sAY8fGzQ1a'),
  settleMatch: new PublicKey('9wwqiBZ9zVDYoH5gMfHhh74M1BziEvupqgGDPwn2zne7'),
  initArena: new PublicKey('5FDD7CHTMqtdZzQKykJxhFEU7r7UFCGkVnSt1jGWp63v'),
  createMatch: new PublicKey('57jUShxEaZPCx5jHtCA2rrXbxXhoEG2gVvAKezmaEV1g'),
  joinMatch: new PublicKey('uznR74kSGF5g4rXg6BU7xA5mwA1NaSZUyQuctwcsQxY'),
  readyUp: new PublicKey('7nm5gwNyTvCzxQ2VXg5FsXey6f5kfUFwRkmSN8tZ5URx'),
  startMatch: new PublicKey('EEsbBTCJmubjjmKcLEgk4aQivRKyG5D8kGzALx2TTN1e'),
};

/**
 * Local dev: L1 only via mb-test-validator on :7899.
 * No ER — local ER v0.7.0 has fee payer limitation (InvalidWritableAccount).
 * All TXs (lobby, crank, input) run directly on L1.
 * Use DEVNET_CONFIG for ER testing (MagicBlock devnet handles fees properly).
 */
export const LOCAL_CONFIG: NetworkConfig = {
  rpcUrl: 'http://127.0.0.1:7899',
  wsUrl: 'ws://127.0.0.1:7900',
  programIds: PROGRAM_IDS,
};

/** MagicBlock devnet: Solana devnet L1 + MagicBlock ER for gameplay */
export const DEVNET_CONFIG: NetworkConfig = {
  rpcUrl: 'https://api.devnet.solana.com',
  wsUrl: 'wss://api.devnet.solana.com/',
  erRpcUrl: 'https://devnet.magicblock.app',
  erWsUrl: 'wss://devnet.magicblock.app',
  programIds: PROGRAM_IDS,
};
