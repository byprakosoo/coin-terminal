import type { WalletClassification, WalletChain } from "@/lib/types";

export interface TrackedWalletDefinition {
  key: string;
  chain: WalletChain;
  address: string;
  label: string;
  classification: WalletClassification;
  qualityScore: string;
  enabled: boolean;
  holderRank: number;
  sourceRank: number;
  observedBalance: string;
  assetSymbol: "BTC" | "ETH" | "SOL";
  entityType: string;
  snapshotDate: string;
  sourceUrl: string;
}

const bitcoinSource = "https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html";
const ethereumSource = "https://etherscan.io/accounts";
const solanaSource = "https://www.coincarp.com/currencies/solana/richlist/";

/**
 * A reviewed largest-holder snapshot, not a list of proven profitable traders.
 * Custodial/service addresses are intentionally excluded from Smart Money scoring.
 */
export const trackedWhaleWallets = [
  {
    key: "btc-1-binance-cold",
    chain: "Bitcoin",
    address: "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
    label: "Binance cold wallet #1",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 1,
    sourceRank: 1,
    observedBalance: "248,598",
    assetSymbol: "BTC",
    entityType: "Custodian / exchange",
    snapshotDate: "2026-07-13",
    sourceUrl: bitcoinSource,
  },
  {
    key: "btc-2-binance-cold",
    chain: "Bitcoin",
    address: "3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6",
    label: "Binance cold wallet #2",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 2,
    sourceRank: 2,
    observedBalance: "181,321",
    assetSymbol: "BTC",
    entityType: "Custodian / exchange",
    snapshotDate: "2026-07-13",
    sourceUrl: bitcoinSource,
  },
  {
    key: "btc-3-robinhood-cold",
    chain: "Bitcoin",
    address: "bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2",
    label: "Robinhood cold wallet",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 3,
    sourceRank: 3,
    observedBalance: "140,850",
    assetSymbol: "BTC",
    entityType: "Custodian / broker",
    snapshotDate: "2026-07-13",
    sourceUrl: bitcoinSource,
  },
  {
    key: "btc-4-bitfinex-cold",
    chain: "Bitcoin",
    address: "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97",
    label: "Bitfinex cold wallet",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 4,
    sourceRank: 4,
    observedBalance: "130,010",
    assetSymbol: "BTC",
    entityType: "Custodian / exchange",
    snapshotDate: "2026-07-13",
    sourceUrl: bitcoinSource,
  },
  {
    key: "btc-5-tether-treasury",
    chain: "Bitcoin",
    address: "bc1qjasf9z3h7w3jspkhtgatgpyvvzgpa2wwd2lr0eh5tx44reyn2k7sfc27a4",
    label: "Tether treasury",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 5,
    sourceRank: 5,
    observedBalance: "96,932",
    assetSymbol: "BTC",
    entityType: "Known entity treasury",
    snapshotDate: "2026-07-13",
    sourceUrl: bitcoinSource,
  },
  {
    key: "eth-1-binance-7",
    chain: "Ethereum",
    address: "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8",
    label: "Binance 7",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 1,
    sourceRank: 3,
    observedBalance: "1,996,008",
    assetSymbol: "ETH",
    entityType: "Custodian / exchange",
    snapshotDate: "2026-07-13",
    sourceUrl: ethereumSource,
  },
  {
    key: "eth-2-robinhood",
    chain: "Ethereum",
    address: "0x40b38765696e3d5d8d9d834d8aad4bb6e418e489",
    label: "Robinhood",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 2,
    sourceRank: 4,
    observedBalance: "1,220,495",
    assetSymbol: "ETH",
    entityType: "Custodian / broker",
    snapshotDate: "2026-07-13",
    sourceUrl: ethereumSource,
  },
  {
    key: "eth-3-upbit-41",
    chain: "Ethereum",
    address: "0x0e58e8993100f1cbe45376c410f97f4893d9bfcd",
    label: "Upbit 41",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 3,
    sourceRank: 5,
    observedBalance: "1,050,088",
    assetSymbol: "ETH",
    entityType: "Custodian / exchange",
    snapshotDate: "2026-07-13",
    sourceUrl: ethereumSource,
  },
  {
    key: "eth-4-binance-hot-20",
    chain: "Ethereum",
    address: "0xf977814e90da44bfa03b6295a0616a897441acec",
    label: "Binance hot wallet 20",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 4,
    sourceRank: 8,
    observedBalance: "739,596",
    assetSymbol: "ETH",
    entityType: "Custodian / exchange",
    snapshotDate: "2026-07-13",
    sourceUrl: ethereumSource,
  },
  {
    key: "eth-5-binance-peg",
    chain: "Ethereum",
    address: "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503",
    label: "Binance-Peg token reserve",
    classification: "EXCLUDED",
    qualityScore: "0",
    enabled: true,
    holderRank: 5,
    sourceRank: 9,
    observedBalance: "454,999",
    assetSymbol: "ETH",
    entityType: "Custodian / reserve",
    snapshotDate: "2026-07-13",
    sourceUrl: ethereumSource,
  },
  {
    key: "sol-1-unattributed",
    chain: "Solana",
    address: "MJKqp326RZCHnAAbew9MDdui3iCKWco7fsK9sVuZTX2",
    label: "Unattributed SOL account #1",
    classification: "UNVERIFIED_WHALE",
    qualityScore: "0",
    enabled: false,
    holderRank: 1,
    sourceRank: 1,
    observedBalance: "5,178,991",
    assetSymbol: "SOL",
    entityType: "Unattributed large account",
    snapshotDate: "2026-07-13",
    sourceUrl: solanaSource,
  },
  {
    key: "sol-2-stake-account",
    chain: "Solana",
    address: "52C9T2T7JRojtxumYnYZhyUmrN7kqzvCLc4Ksvjk7TxD",
    label: "Large SOL stake account #2",
    classification: "UNVERIFIED_WHALE",
    qualityScore: "0",
    enabled: false,
    holderRank: 2,
    sourceRank: 2,
    observedBalance: "4,371,056",
    assetSymbol: "SOL",
    entityType: "Stake account / pooled value possible",
    snapshotDate: "2026-07-13",
    sourceUrl: solanaSource,
  },
  {
    key: "sol-3-unattributed",
    chain: "Solana",
    address: "8BseXT9EtoEhBTKFFYkwTnjKSUZwhtmdKY2Jrj8j45Rt",
    label: "Unattributed SOL account #3",
    classification: "UNVERIFIED_WHALE",
    qualityScore: "0",
    enabled: false,
    holderRank: 3,
    sourceRank: 3,
    observedBalance: "3,927,080",
    assetSymbol: "SOL",
    entityType: "Unattributed large account",
    snapshotDate: "2026-07-13",
    sourceUrl: solanaSource,
  },
  {
    key: "sol-4-unattributed",
    chain: "Solana",
    address: "GitYucwpNcg6Dx1Y15UQ9TQn8LZMX1uuqQNn8rXxEWNC",
    label: "Unattributed SOL account #4",
    classification: "UNVERIFIED_WHALE",
    qualityScore: "0",
    enabled: false,
    holderRank: 4,
    sourceRank: 4,
    observedBalance: "3,628,341",
    assetSymbol: "SOL",
    entityType: "Unattributed large account",
    snapshotDate: "2026-07-13",
    sourceUrl: solanaSource,
  },
  {
    key: "sol-5-unattributed",
    chain: "Solana",
    address: "9QgXqrgdbVU8KcpfskqJpAXKzbaYQJecgMAruSWoXDkM",
    label: "Unattributed SOL account #5",
    classification: "UNVERIFIED_WHALE",
    qualityScore: "0",
    enabled: false,
    holderRank: 5,
    sourceRank: 5,
    observedBalance: "3,141,238",
    assetSymbol: "SOL",
    entityType: "Unattributed large account",
    snapshotDate: "2026-07-13",
    sourceUrl: solanaSource,
  },
] as const satisfies readonly TrackedWalletDefinition[];

const trackedByAddress = new Map(
  trackedWhaleWallets.map((wallet) => [walletKey(wallet.chain, wallet.address), wallet]),
);

export function getTrackedWalletMetadata(chain: WalletChain, address: string) {
  return trackedByAddress.get(walletKey(chain, address));
}

export function walletExplorerUrl(chain: WalletChain, address: string) {
  const encoded = encodeURIComponent(address);
  if (chain === "Bitcoin") return `https://mempool.space/address/${encoded}`;
  if (chain === "Solana") return `https://solscan.io/account/${encoded}`;
  if (chain === "Base") return `https://basescan.org/address/${encoded}`;
  if (chain === "Arbitrum") return `https://arbiscan.io/address/${encoded}`;
  return `https://etherscan.io/address/${encoded}`;
}

function walletKey(chain: WalletChain, address: string) {
  return `${chain}:${chain === "Solana" || chain === "Bitcoin" ? address : address.toLowerCase()}`;
}
