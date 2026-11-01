import { rpcCapabilities, capabilityKey, rpcFailure, unsupportedRead } from "./rpc-capabilities.mjs";
import { withNodeRetries } from "./node-retry.mjs";
import { Interface, formatUnits, getAddress, hexlify } from "ethers";
import { base58check, sha256 } from "#wallet-crypto";
import { CHAINS, queryBalance, validateRpc } from "./wallet.mjs";
import { COMMON_TOKENS } from "./common-tokens.mjs";

const erc20 = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);
const checked58 = base58check(sha256);
const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const failure = (token) => ({
  address: token.address,
  symbol: token.symbol,
  status: "error",
  error: "代币查询失败或节点限流，请重试。",
});
export async function queryAssets({
  chain,
  address,
  token,
  endpoint = chain.rpc,
  timeout = 12000,
  common = true,
  capabilities = rpcCapabilities,
}) {
  if (chain.disabled) throw new Error("该网络已停用。");
  const native = await queryBalance({
    chain,
    address,
    token,
    endpoint,
    timeout,
    capabilities,
  });
  const name = Object.keys(CHAINS).find(
    (name) =>
      CHAINS[name] === chain ||
      (CHAINS[name].id && CHAINS[name].id === chain.id) ||
      (chain.family && CHAINS[name].family === chain.family),
  );
  const tokenMethod = chain.family === "tron" ? "/walletsolidity/triggerconstantcontract" : "eth_call";
  const tokens = common
    ? (COMMON_TOKENS[name] ?? []).filter(
        (item) => (!token || item.address.toLowerCase() !== token.toLowerCase()) &&
          !capabilities.blocked(capabilityKey(chain, endpoint, "token", item.address)) &&
          (chain.family === "solana" || !capabilities.blocked(capabilityKey(chain, endpoint, tokenMethod))),
      )
    : [];
  if (!tokens.length) return { ...native, assets: [] };
  let id = 100;
  const base = validateRpc(endpoint).replace(/\/$/, "");
  async function request(url, body) {
    const method = body.method ?? new URL(url).pathname;
    const program = method === 'getTokenAccountsByOwner' ? body.params?.[1]?.programId ?? '' : '';
    if (capabilities.blocked(capabilityKey(chain, endpoint, method)) ||
        (program && capabilities.blocked(capabilityKey(chain, endpoint, method, program)))) throw unsupportedRead();
    return withNodeRetries(async () => {
      if (capabilities.blocked(capabilityKey(chain, endpoint, method)) ||
          (program && capabilities.blocked(capabilityKey(chain, endpoint, method, program)))) throw unsupportedRead();
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
      });
      const result = await response.json().catch(() => null);
      const validError = result?.error && result.jsonrpc === "2.0" && result.id === body.id;
      // An explicit indexed-query auth requirement is definitive even on HTTP 403.
      if (validError && (response.ok || response.status === 403)) {
        const error = rpcFailure(result.error, { registry: capabilities, chain, endpoint, method, program });
        if (response.ok || error.retryable === false) throw error;
      }
      if (!response.ok) {
        if ([404, 405, 501].includes(response.status)) {
          capabilities.remember(capabilityKey(chain, endpoint, method), 'endpoint-unsupported');
          throw unsupportedRead();
        }
        throw new Error("节点请求失败");
      }
      if (
        !result ||
        typeof result !== "object" ||
        result.error ||
        result.Error ||
        result.result?.result === false
      )
        throw new Error("节点结果无效");
      return result;
    });
  }
  async function rpc(method, params) {
    const requestId = ++id;
    const result = await request(base, {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    });
    if (
      result.error ||
      result.jsonrpc !== "2.0" ||
      result.id !== requestId ||
      result.result === undefined
    )
      throw new Error("节点结果无效");
    return result.result;
  }
  const success = (token, amount) => ({
    address: token.address,
    symbol: token.symbol,
    status: "success",
    balance: formatUnits(amount, token.decimals),
  });
  let assets;
  if (chain.family === "solana") {
    async function readProgram(tokenProgram, tokens) {
      let assets;
      try {
        const result = await rpc("getTokenAccountsByOwner", [
          address,
          { programId: tokenProgram },
          {
            encoding: "jsonParsed",
            commitment: "finalized",
            minContextSlot: Number(native.block),
          },
        ]);
        if (
          !Array.isArray(result.value) ||
          result.value.length > 10000 ||
          !Number.isSafeInteger(result.context?.slot) || result.context.slot < Number(native.block)
        )
          throw new Error("SPL 结果无效");
        const sums = new Map(tokens.map((token) => [token.address, 0n]));
        const seen = new Set();
        for (const entry of result.value) {
          const info = entry?.account?.data?.parsed?.info;
          if (!info || !sums.has(info.mint)) continue;
          const token = tokens.find((token) => token.address === info.mint);
          if (
            entry.account.owner !== tokenProgram ||
            info.owner !== address ||
            typeof entry.pubkey !== "string" ||
            seen.has(entry.pubkey) ||
            !/^\d+$/.test(info.tokenAmount?.amount ?? "") ||
            info.tokenAmount.decimals !== token.decimals
          )
            throw new Error("SPL 结果无效");
          seen.add(entry.pubkey);
          sums.set(
            info.mint,
            sums.get(info.mint) + BigInt(info.tokenAmount.amount),
          );
        }
        assets = tokens.map((token) => success(token, sums.get(token.address)));
      } catch {
        // A subset of token accounts is not a wallet balance. Skip this entire
        // token program when complete owner-account enumeration is unavailable.
        assets = [];
      }
      return assets;
    }
    const programs = [
      ...new Set(tokens.map((token) => token.program ?? tokenProgram)),
    ];
    assets = (
      await Promise.all(
        programs.map((program) =>
          readProgram(
            program,
            tokens.filter(
              (token) => (token.program ?? tokenProgram) === program,
            ),
          ),
        ),
      )
    ).flat();
  } else {
    async function one(token) {
      try {
        if (chain.family === "tron") {
          const parameter = hexlify(checked58.decode(address).slice(1))
            .slice(2)
            .padStart(64, "0");
          const result = await request(
            `${base}/walletsolidity/triggerconstantcontract`,
            {
              owner_address: address,
              contract_address: token.address,
              function_selector: "balanceOf(address)",
              parameter,
              visible: true,
            },
          );
          if (
            result.result?.result !== true ||
            result.constant_result?.length !== 1 ||
            !/^[0-9a-fA-F]{64}$/.test(result.constant_result[0])
          )
            throw new Error("TRC20 结果无效");
          return success(token, BigInt("0x" + result.constant_result[0]));
        }
        const block = "0x" + BigInt(native.block).toString(16);
        const contract = getAddress(token.address.toLowerCase());
        const raw = await rpc("eth_call", [
          {
            to: contract,
            data: erc20.encodeFunctionData("balanceOf", [getAddress(address)]),
          },
          block,
        ]);
        const [amount] = erc20.decodeFunctionResult("balanceOf", raw);
        return success(token, amount);
      } catch (error) {
        if (!chain.family && (error.probeContract || error.code === 'BAD_DATA')) {
          try {
            if (await rpc('eth_getCode', [getAddress(token.address.toLowerCase()), 'latest']) === '0x')
              capabilities.remember(capabilityKey(chain, endpoint, 'token', token.address), 'no-contract');
          } catch { /* Inconclusive probes are never remembered. */ }
        }
        return failure(token);
      }
    }
    // Bound concurrency so public RPCs are less likely to rate-limit all assets.
    assets = [];
    for (let i = 0; i < tokens.length; i += 3)
      assets.push(...(await Promise.all(tokens.slice(i, i + 3).map(one))));
  }
  return {
    ...native,
    ...(chain.family === "solana"
      ? { note: "finalized slot；不含质押账户" }
      : chain.family === "tron"
        ? { note: "已确认余额；不含质押与资源" }
        : {}),
    assets,
  };
}
