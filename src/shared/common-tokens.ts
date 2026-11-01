import type { AssetBalance } from "./types.ts";
import type { TokenDefinition } from "./types.ts";
// Explicit mainnet token allowlist, verified 2026-10-31. Sources are stored per contract.
export const COMMON_TOKENS: Record<string, TokenDefinition[]> = {
  ethereum: [
    {
      symbol: "USDG",
      address: "0xe343167631d89B6Ffc58B88d6b7fB0228795491D",
      decimals: 6,
      source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet",
    },
    {
      symbol: "USDT",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/mainnet.json",
    },
    {
      symbol: "USDC",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    },
    {
      symbol: "SOL (包装)",
      address: "0xD31a59c85aE9D8edEFeC411D448f90841571b89c",
      decimals: 9,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/mainnet.json",
    },
    {
      symbol: "WETH",
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/mainnet.json",
    },
  ],
  bsc: [
    {
      symbol: "USDT (Binance-Peg)",
      address: "0x55d398326f99059fF775485246999027B3197955",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-extended.json",
    },
    {
      symbol: "USDC (Binance-Peg)",
      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-extended.json",
    },
    {
      symbol: "ETH (Binance-Peg)",
      address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-extended.json",
    },
    {
      symbol: "SOL (Binance-Peg)",
      address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-extended.json",
    },
    {
      symbol: "WBNB",
      address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-extended.json",
    },
  ],
  base: [
    {
      symbol: "USDC",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    },
    {
      symbol: "WETH",
      address: "0x4200000000000000000000000000000000000006",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/base.json",
    },
  ],
  arbitrum: [
    {
      symbol: "USDG",
      address: "0x004B506865409877C9fA29bfb1ebA929984B9bbC",
      decimals: 6,
      source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet",
    },
    {
      symbol: "USDT",
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-arbitrum-default.json",
    },
    {
      symbol: "USDC",
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    },
    {
      symbol: "USDC.e",
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-arbitrum-default.json",
    },
    {
      symbol: "WBNB",
      address: "0xa9004A5421372E1D83fB1f85b0fc986c912f91f3",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-arbitrum-default.json",
    },
    {
      symbol: "WETH",
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-arbitrum-default.json",
    },
  ],
  optimism: [
    {
      symbol: "USDT0",
      address: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/optimism.json",
    },
    {
      symbol: "USDC",
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      decimals: 6,
      source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    },
    {
      symbol: "USDC.e",
      address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/optimism.json",
    },
  ],
  polygon: [
    {
      symbol: "USDT",
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/polygon.json",
    },
    {
      symbol: "USDC",
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      decimals: 6,
      source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    },
    {
      symbol: "USDC.e",
      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/polygon.json",
    },
    {
      symbol: "WETH",
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/polygon.json",
    },
  ],
  avalanche: [
    {
      symbol: "USDT",
      address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
      decimals: 6,
      source: "https://tether.to/en/supported-protocols/",
    },
    {
      symbol: "USDC",
      address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      decimals: 6,
      source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    },
  ],
  linea: [
    {
      symbol: "USDT",
      address: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-linea-default.json",
    },
    {
      symbol: "USDC",
      address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
      decimals: 6,
      source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    },
    {
      symbol: "WETH",
      address: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-linea-default.json",
    },
  ],
  scroll: [
    {
      symbol: "USDT",
      address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
      decimals: 6,
      source: "https://raw.githubusercontent.com/scroll-tech/token-list/main/scroll.tokenlist.json",
    },
    {
      symbol: "USDC (桥接)",
      address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
      decimals: 6,
      source: "https://raw.githubusercontent.com/scroll-tech/token-list/main/scroll.tokenlist.json",
    },
    {
      symbol: "WETH",
      address: "0x5300000000000000000000000000000000000004",
      decimals: 18,
      source: "https://raw.githubusercontent.com/scroll-tech/token-list/main/scroll.tokenlist.json",
    },
  ],
  zksync: [
    {
      symbol: "USDT",
      address: "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-zksync-default.json",
    },
    {
      symbol: "USDC",
      address: "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4",
      decimals: 6,
      source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    },
    {
      symbol: "USDC.e",
      address: "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-zksync-default.json",
    },
    {
      symbol: "WETH",
      address: "0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/pancakeswap-zksync-default.json",
    },
  ],
  mantle: [
    {
      symbol: "USDG",
      address: "0x063C1d1ef6e9099Ce3E8e9AD5C6173d12C49C086",
      decimals: 6,
      source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet",
    },
    {
      symbol: "USDT (桥接)",
      address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/mantlenetworkio/mantle-token-lists/main/mantle.tokenlist.json",
    },
    {
      symbol: "USDT0",
      address: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/mantlenetworkio/mantle-token-lists/main/mantle.tokenlist.json",
    },
    {
      symbol: "USDC (桥接)",
      address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/mantlenetworkio/mantle-token-lists/main/mantle.tokenlist.json",
    },
    {
      symbol: "ETH (桥接)",
      address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111",
      decimals: 18,
      source:
        "https://raw.githubusercontent.com/mantlenetworkio/mantle-token-lists/main/mantle.tokenlist.json",
    },
  ],
  solana: [
    {
      symbol: "USDG",
      address: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
      decimals: 6,
      program: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet",
    },
    {
      symbol: "USDT",
      address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/solana.json",
    },
    {
      symbol: "USDC",
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
      source:
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/solana.json",
    },
  ],
  tron: [
    {
      symbol: "USDT",
      address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      decimals: 6,
      source: "https://tether.to/en/supported-protocols/",
    },
  ],
  xlayer: [
    {
      symbol: "USDG",
      address: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
      decimals: 6,
      source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet",
    },
  ],
  bitcoin: [],
};

const stableOrder = (symbol: string) =>
  symbol.startsWith("USDT") ? 0 : symbol.startsWith("USDC") ? 1 : symbol === "USDG" ? 2 : 3;
for (const tokens of Object.values(COMMON_TOKENS))
  tokens.sort((a, b) => stableOrder(a.symbol) - stableOrder(b.symbol));

// Old encrypted histories remain intact; retired assets are excluded from views and summaries.
export function isRetiredAsset(asset: Pick<AssetBalance, "address" | "symbol">) {
  return (
    /^(WBTC|BTCB|WSOL)(?:$| )/.test(asset.symbol ?? "") ||
    asset.address === "So11111111111111111111111111111111111111112"
  );
}
