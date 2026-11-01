import type { BalanceQueryOptions } from "./wallet.ts";
import type { Chain } from "./types.ts";
import { withNodeRetries } from "./node-retry.ts";
import {
  HDNodeWallet,
  Mnemonic,
  SigningKey,
  computeAddress,
  getBytes,
  hexlify,
  ripemd160,
  sha256 as ethersSha256,
  formatUnits,
} from "ethers";
import {
  base58,
  base58check,
  bech32,
  bech32m,
  ed25519,
  hmac,
  sha512,
  sha256,
} from "#wallet-crypto";
import { validateMnemonic } from "./mnemonic.ts";

export const NON_EVM: Record<string, Chain> = {
  bitcoin: {
    name: "Bitcoin",
    family: "bitcoin",
    symbol: "BTC",
    rpc: "https://mempool.space/api",
    path: "m/84'/0'/0'/0/0",
  },
  solana: {
    name: "Solana",
    family: "solana",
    symbol: "SOL",
    rpc: "https://solana-rpc.publicnode.com",
    path: "m/44'/501'/0'/0'",
  },
  tron: {
    name: "TRON",
    family: "tron",
    symbol: "TRX",
    rpc: "https://api.trongrid.io",
    path: "m/44'/195'/0'/0/0",
  },
};
const checked58 = base58check(sha256);
const concat = (...arrays: (Uint8Array | number[])[]) =>
  new Uint8Array(arrays.flatMap((array) => [...array]));
const hash160 = (value: Uint8Array) => getBytes(ripemd160(ethersSha256(value)));

function secpKey(input: string, bitcoin = false) {
  if (bitcoin && !/^(0x)?[a-f\d]{64}$/i.test(input.trim())) {
    const decoded = checked58.decode(input.trim());
    if (decoded.length !== 34 || decoded[0] !== 0x80 || decoded[33] !== 1)
      throw new Error("仅支持主网压缩 WIF 私钥。");
    return hexlify(decoded.slice(1, 33));
  }
  if (!/^(0x)?[a-f\d]{64}$/i.test(input.trim())) throw new Error("需要 32 字节十六进制私钥。");
  const key = "0x" + input.trim().replace(/^0x/i, "");
  computeAddress(key); // Validate scalar range, including zero.
  return key;
}

// Canonical key identity for grouping one imported private key across address families.
export function privateKeyIdentity(family: string, input: string) {
  return family === "solana"
    ? `ed25519:${nonEvmWalletFromPrivateKey(family, input).privateKey}`
    : `secp256k1:${secpKey(input, family === "bitcoin").toLowerCase()}`;
}

export function nonEvmWalletFromPrivateKey(family: string, input: string) {
  try {
    if (family === "solana") {
      let bytes;
      if (input.trim().startsWith("[")) {
        const array = JSON.parse(input);
        if (
          !Array.isArray(array) ||
          !array.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
        )
          throw new Error();
        bytes = new Uint8Array(array);
      } else bytes = base58.decode(input.trim());
      if (![32, 64].includes(bytes.length)) throw new Error();
      const seed = bytes.slice(0, 32);
      const publicKey = ed25519.getPublicKey(seed);
      if (bytes.length === 64 && !bytes.slice(32).every((byte, i) => byte === publicKey[i]))
        throw new Error();
      return {
        address: base58.encode(publicKey),
        privateKey: base58.encode(concat(seed, publicKey)),
      };
    }
    const key = secpKey(input, family === "bitcoin");
    if (family === "bitcoin") {
      const publicKey = getBytes(SigningKey.computePublicKey(key, true));
      const address = bech32.encode("bc", [0, ...bech32.toWords(hash160(publicKey))]);
      return {
        address,
        privateKey: checked58.encode(concat([0x80], getBytes(key), [1])),
      };
    }
    if (family === "tron")
      return {
        address: checked58.encode(concat([0x41], getBytes(computeAddress(key)))),
        privateKey: key,
      };
    throw new Error();
  } catch {
    throw new Error(
      family === "solana"
        ? "Solana 私钥需为 Base58 或 JSON 格式的 32 字节 seed / 64 字节密钥对，且公私钥须匹配。"
        : family === "bitcoin"
          ? "Bitcoin 私钥需为主网压缩 WIF 或有效的 32 字节十六进制私钥。"
          : "TRON 私钥需为有效的 32 字节十六进制私钥。",
    );
  }
}

export function nonEvmWalletFromMnemonic(family: string, phrase: string, wordCount?: number) {
  const normalized = validateMnemonic(phrase, wordCount);
  if (!Object.hasOwn(NON_EVM, family)) throw new Error("不支持的网络。");
  const path = NON_EVM[family].path;
  if (family !== "solana") {
    const wallet = HDNodeWallet.fromPhrase(normalized, "", path);
    return { ...nonEvmWalletFromPrivateKey(family, wallet.privateKey), path };
  }
  // SLIP-0010 ed25519: only hardened child derivations are valid.
  let digest = hmac(
    sha512,
    new TextEncoder().encode("ed25519 seed"),
    getBytes(Mnemonic.fromPhrase(normalized).computeSeed()),
  );
  for (const index of [44, 501, 0, 0]) {
    const child = new Uint8Array(4);
    new DataView(child.buffer).setUint32(0, index + 0x80000000, false);
    digest = hmac(sha512, digest.slice(32), concat([0], digest.slice(0, 32), child));
  }
  return {
    ...nonEvmWalletFromPrivateKey("solana", base58.encode(digest.slice(0, 32))),
    path,
  };
}

export function validateNonEvmAddress(family: string, input: string) {
  try {
    const address = input.trim();
    if (family === "solana") {
      if (base58.decode(address).length !== 32) throw new Error();
      return address;
    }
    if (family === "tron") {
      const bytes = checked58.decode(address);
      if (bytes.length !== 21 || bytes[0] !== 0x41) throw new Error();
      return address;
    }
    if (family === "bitcoin") {
      if (/^bc1/i.test(address)) {
        const version = address.toLowerCase()[3] === "q" ? 0 : undefined;
        const codec = version === 0 ? bech32 : bech32m;
        const decoded = codec.decode(address);
        const witnessVersion = decoded.words[0];
        const program = codec.fromWords(decoded.words.slice(1));
        if (
          decoded.prefix !== "bc" ||
          witnessVersion > 16 ||
          program.length < 2 ||
          program.length > 40 ||
          (witnessVersion === 0 && ![20, 32].includes(program.length)) ||
          (witnessVersion === 0) !== (codec === bech32)
        )
          throw new Error();
        return address.toLowerCase();
      }
      const bytes = checked58.decode(address);
      if (bytes.length !== 21 || ![0, 5].includes(bytes[0])) throw new Error();
      return address;
    }
    throw new Error();
  } catch {
    throw new Error(`${NON_EVM[family]?.name ?? "钱包"} 主网地址格式或校验和无效。`);
  }
}

export async function queryNonEvmBalance({
  chain,
  address,
  endpoint = chain.rpc,
  token,
  timeout = 12000,
}: BalanceQueryOptions) {
  if (token) throw new Error("这条网络目前仅查询原生币，不支持此处的 ERC-20 合约选项。");
  const owner = validateNonEvmAddress(chain.family!, address);
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("查询节点必须使用 HTTPS。");
  async function request(path: string, body?: unknown) {
    return withNodeRetries(async () => {
      try {
        const response = await fetch(path, {
          ...(body
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
          redirect: "error",
          signal: AbortSignal.timeout(timeout),
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!result || result.error || result.Error) throw new Error();
        return result;
      } catch {
        throw new Error("节点请求失败、限流或超时，请更换节点后重试。");
      }
    });
  }
  function integer(value: number) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("节点返回了无效或超出安全范围的数值。");
    return BigInt(value);
  }
  const base = url.href.replace(/\/$/, "");
  if (chain.family === "bitcoin") {
    const result = await request(`${base}/address/${encodeURIComponent(owner)}`);
    if (result.address !== owner) throw new Error("节点返回地址不匹配。");
    const balance =
      integer(result.chain_stats?.funded_txo_sum) - integer(result.chain_stats?.spent_txo_sum);
    const pending =
      integer(result.mempool_stats?.funded_txo_sum) - integer(result.mempool_stats?.spent_txo_sum);
    if (balance < 0n) throw new Error("节点返回了无效余额。");
    return {
      native: formatUnits(balance, 8),
      symbol: "BTC",
      block: "",
      note: `已确认余额；未确认净变化 ${formatUnits(pending, 8)} BTC`,
    };
  }
  if (chain.family === "solana") {
    const result = await request(base, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [owner, { commitment: "finalized" }],
    });
    if (result.error || result.id !== 1 || !result.result?.context)
      throw new Error("Solana 节点返回错误或格式无效。");
    return {
      native: formatUnits(integer(result.result.value), 9),
      symbol: "SOL",
      block: integer(result.result.context.slot).toString(),
      note: "finalized slot；不含 SPL 代币或质押账户",
    };
  }
  if (chain.family === "tron") {
    const result = await request(`${base}/walletsolidity/getaccount`, {
      address: owner,
      visible: true,
    });
    if (
      !result ||
      Array.isArray(result) ||
      typeof result !== "object" ||
      result.Error ||
      result.error
    )
      throw new Error("TRON 节点返回错误。");
    if (Object.keys(result).length === 0)
      return {
        native: "0.0",
        symbol: "TRX",
        block: "",
        note: "账户未激活；不含 TRC-20 或质押余额",
      };
    if (result.address !== owner) throw new Error("TRON 节点返回地址不匹配。");
    return {
      native: formatUnits(integer(result.balance ?? 0), 6),
      symbol: "TRX",
      block: "",
      note: "已确认可用余额；不含 TRC-20 或质押余额",
    };
  }
  throw new Error("不支持的网络。");
}
