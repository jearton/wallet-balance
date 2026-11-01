import { rpcCapabilities, capabilityKey, rpcFailure, unsupportedRead } from "./rpc-capabilities.mjs";
import { withNodeRetries } from "./node-retry.mjs";
import { computeAddress, formatUnits, getAddress, Interface } from "ethers";
import {
  NON_EVM,
  nonEvmWalletFromPrivateKey,
  validateNonEvmAddress,
  queryNonEvmBalance,
} from "./non-evm.mjs";

export const CHAINS = {
  ethereum: {
    name: "Ethereum",
    id: 1,
    symbol: "ETH",
    rpc: "https://ethereum-rpc.publicnode.com",
  },
  bsc: {
    name: "BNB Smart Chain",
    id: 56,
    symbol: "BNB",
    rpc: "https://bsc-dataseed.bnbchain.org",
  },
  base: {
    name: "Base",
    id: 8453,
    symbol: "ETH",
    rpc: "https://mainnet.base.org",
  },
  arbitrum: {
    name: "Arbitrum One",
    id: 42161,
    symbol: "ETH",
    rpc: "https://arb1.arbitrum.io/rpc",
  },
  polygon: {
    disabled: true,
    name: "Polygon PoS",
    id: 137,
    symbol: "POL",
    rpc: "https://polygon-bor-rpc.publicnode.com",
  },
  optimism: {
    name: "Optimism",
    id: 10,
    symbol: "ETH",
    rpc: "https://optimism-rpc.publicnode.com",
  },
  avalanche: {
    disabled: true,
    name: "Avalanche C-Chain",
    id: 43114,
    symbol: "AVAX",
    rpc: "https://api.avax.network/ext/bc/C/rpc",
  },
  linea: {
    name: "Linea",
    id: 59144,
    symbol: "ETH",
    rpc: "https://rpc.linea.build",
  },
  scroll: {
    name: "Scroll",
    id: 534352,
    symbol: "ETH",
    rpc: "https://rpc.scroll.io",
  },
  zksync: {
    name: "ZKsync Era",
    id: 324,
    symbol: "ETH",
    rpc: "https://mainnet.era.zksync.io",
  },
  mantle: {
    name: "Mantle",
    id: 5000,
    symbol: "MNT",
    rpc: "https://rpc.mantle.xyz",
  },
  xlayer: {
    name: "X Layer",
    id: 196,
    symbol: "OKB",
    rpc: "https://xlayerrpc.okx.com",
  },
  ...NON_EVM,
};

export const PREFERRED_CHAINS = [
  "bitcoin",
  "solana",
  "ethereum",
  "bsc",
  "mantle",
  "tron",
];
export const CHAIN_ORDER = [
  ...PREFERRED_CHAINS,
  ...Object.keys(CHAINS).filter((name) => !PREFERRED_CHAINS.includes(name) && !CHAINS[name].disabled),
];

export function validateAddress(chain, input) {
  if (chain.family) return validateNonEvmAddress(chain.family, input);
  try {
    return getAddress(input.trim());
  } catch {
    throw new Error("EVM 钱包地址格式无效。");
  }
}

export function walletFromPrivateKey(chain, input) {
  if (chain.family) return nonEvmWalletFromPrivateKey(chain.family, input);
  return {
    address: addressFromPrivateKey(input),
    privateKey: "0x" + input.trim().replace(/^0x/i, ""),
  };
}

const erc20 = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export function addressFromPrivateKey(input) {
  const key = input.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("私钥须为 64 位十六进制字符，可带 0x 前缀；不支持助记词。");
  }
  try {
    return computeAddress(`0x${key}`);
  } catch {
    // ethers errors may include their input. Never propagate those errors.
    throw new Error("无效的 secp256k1 私钥。");
  }
}

export function validateRpc(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("RPC URL 格式无效。");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("RPC 必须使用 HTTPS；本机节点可使用 HTTP。");
  }
  return url.href;
}

export async function queryBalance({
  chain,
  address,
  token,
  endpoint = chain.rpc,
  timeout = 12000,
  capabilities = rpcCapabilities,
}) {
  if (chain.family)
    return queryNonEvmBalance({ chain, address, token, endpoint, timeout });
  const url = validateRpc(endpoint);
  const owner = getAddress(address);
  const contract = token ? getAddress(token) : undefined;
  let id = 0;
  async function rpc(method, params = []) {
    if (capabilities.blocked(capabilityKey(chain, endpoint, method))) throw unsupportedRead();
    return withNodeRetries(async () => {
      const requestId = ++id;
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: requestId,
            method,
            params,
          }),
          signal: AbortSignal.timeout(timeout),
          redirect: "error",
        });
      } catch {
        throw new Error("RPC 连接失败或超时，请检查网络或更换 RPC。");
      }
      if (!response.ok)
        throw new Error(`RPC HTTP ${response.status}，请稍后重试或更换 RPC。`);
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error("RPC 返回了无效 JSON。");
      }
      if (payload?.error && payload.jsonrpc === "2.0" && payload.id === requestId) throw rpcFailure(payload.error, { registry: capabilities, chain, endpoint, method });
      if (
        payload?.jsonrpc !== "2.0" ||
        payload.id !== requestId ||
        payload.error ||
        payload.result === undefined
      ) {
        throw new Error("RPC 请求失败或返回格式无效，请检查节点与代币合约。");
      }
      return payload.result;
    });
  }
  function quantity(value) {
    if (
      typeof value !== "string" ||
      !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)
    ) {
      throw new Error("RPC 返回了无效的数值。");
    }
    return BigInt(value);
  }
  if (quantity(await rpc("eth_chainId")) !== BigInt(chain.id)) {
    throw new Error("RPC 链 ID 不匹配，已停止查询。");
  }
  const block = await rpc("eth_blockNumber");
  quantity(block);
  const native = quantity(await rpc("eth_getBalance", [owner, block]));
  const result = {
    native: formatUnits(native, 18),
    symbol: chain.symbol,
    block: BigInt(block).toString(),
  };
  if (contract) {
    if (capabilities.blocked(capabilityKey(chain, endpoint, 'token', contract)) ||
        capabilities.blocked(capabilityKey(chain, endpoint, 'eth_call'))) return result;
    try {
      const call = (name, args = []) =>
        rpc("eth_call", [
          { to: contract, data: erc20.encodeFunctionData(name, args) },
          block,
        ]);
      const [rawBalance, rawDecimals] = await Promise.all([
        call("balanceOf", [owner]),
        call("decimals"),
      ]);
      const [balance] = erc20.decodeFunctionResult("balanceOf", rawBalance);
      const [decimals] = erc20.decodeFunctionResult("decimals", rawDecimals);
      result.token = {
        address: contract,
        balance: formatUnits(balance, Number(decimals)),
      };
    } catch (error) {
      if (error.probeContract || error.code === 'BAD_DATA') {
        try {
          if (await rpc('eth_getCode', [contract, 'latest']) === '0x')
            capabilities.remember(capabilityKey(chain, endpoint, 'token', contract), 'no-contract');
        } catch { /* Transient errors cannot disable a token. */ }
      }
      result.tokenError =
        "代币查询失败：合约需支持 balanceOf 和 decimals，请确认合约与链匹配。";
    }
  }
  return result;
}
