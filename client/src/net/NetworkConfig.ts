import { PublicKey } from '@solana/web3.js';
import type { NetworkConfig } from './types';

const PROGRAM_IDS = {
  playerState: new PublicKey('SVqcqnh6iqyyUTpzLPpV2zjY2eh96wjDkt8Cvs8feoF'),
  matchState: new PublicKey('23fHYfpHxeCdc38an2CzTkkoGAinN45XodaxVpofuJ1y'),
  arenaConfig: new PublicKey('7UHeP4BPqSjfsgcezw3M64TSQYi4BaaWhwH1PkEX96eB'),
  projectilePool: new PublicKey('3vwaQkFZVMvpPFuMvTtUfa1qwrbBDPrLCZhXVtcA4DC8'),
  pickupState: new PublicKey('mXNgrxeBx2tiTCh1XxMREergiJ3XgK7YZhNvLA2e5wJ'),
  processInput: new PublicKey('BnhdpxbxwTx4EABpRazimuSR9FGmQADAVdzi8HkDXAaG'),
  tickPhysics: new PublicKey('BHwje821iKJ3TCWwtRCQkiuBefJym41zRePDwQQ5ci6r'),
  tickCombat: new PublicKey('BRdU8TEqfja1aCwhpTznxs7N5wtsEK9XwMrQpgAcXYj'),
  tickPickups: new PublicKey('6svTwtJNorS61WgrVuBUeJGFZZCniK5zifffikmjZDqQ'),
  delegateMatch: new PublicKey('Do5E78fp5F741nkNuxvk76nPndqM7pVqtCtiif7BKANA'),
  settleMatch: new PublicKey('6EFGnRNoSJyjPgaoUR4LpT8Lq9C6eQ716m1iwFJtvRgn'),
  initArena: new PublicKey('Ep4V1sF7RM1o2kBwQG3y86oxrYhd9F9FaCfjdfBYwSyh'),
  createMatch: new PublicKey('4vrZHTpdz97cCtyhbQuAd2XmvipjuyBQGzqfF4SEgrKX'),
};

/** Local L1 validator (solana-test-validator on :8899) */
export const LOCAL_CONFIG: NetworkConfig = {
  rpcUrl: 'http://127.0.0.1:8899',
  wsUrl: 'ws://127.0.0.1:8900',
  programIds: PROGRAM_IDS,
};

/** Local Ephemeral Rollup validator (:9900) — gameplay runs here */
export const LOCAL_ER_CONFIG: NetworkConfig = {
  rpcUrl: 'http://127.0.0.1:9900',
  wsUrl: 'ws://127.0.0.1:9901',
  programIds: PROGRAM_IDS,
};

/** MagicBlock devnet */
export const DEVNET_CONFIG: NetworkConfig = {
  rpcUrl: 'https://rpc.magicblock.app/devnet/',
  wsUrl: 'wss://rpc.magicblock.app/devnet/',
  programIds: PROGRAM_IDS,
};
