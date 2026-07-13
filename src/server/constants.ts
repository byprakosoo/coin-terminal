import { stableId } from "@/server/ids";

export const providerIds = {
  coingecko: stableId("provider", "coingecko"),
  dexScreener: stableId("provider", "dex-screener"),
  mempool: stableId("provider", "mempool-space"),
  etherscan: stableId("provider", "etherscan"),
  demoFx: stableId("provider", "demo-fx"),
};

export const ruleVersionId = stableId("signal-rule", "btc-daily-v1.3.0");
