import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Interface } from "ethers";
import { CHAINS } from "../src/shared/wallet.ts";
import { COMMON_TOKENS } from "../src/shared/common-tokens.ts";
import { queryAssets } from "../src/shared/asset-query.ts";
import { summarizeHistoryBalance } from "../src/shared/history-summary.ts";

const publicAddress = "0x0000000000000000000000000000000000000000";
async function node(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ path: req.url, body });
    res.setHeader("content-type", "application/json");
    const { httpStatus = 200, ...payload } = handler(req.url, body);
    res.statusCode = httpStatus;
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return { endpoint: `http://127.0.0.1:${server.address().port}`, requests };
}

test("automatic ERC20 reads preserve exact decimals, bind calls to native block and keep per-token failures unknown", async (t) => {
  const abi = new Interface(["function balanceOf(address) view returns (uint256)"]);
  const usdc = COMMON_TOKENS.ethereum.find((token) => token.symbol === "USDC");
  const { endpoint, requests } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    ...(body.method === "eth_call" && body.params[0].to.toLowerCase() !== usdc.address.toLowerCase()
      ? { error: { message: "rate limit" } }
      : {
          result:
            body.method === "eth_chainId"
              ? "0x1"
              : body.method === "eth_blockNumber"
                ? "0x2a"
                : body.method === "eth_getBalance"
                  ? "0x0"
                  : abi.encodeFunctionResult("balanceOf", [1234567n]),
        }),
  }));
  const result = await queryAssets({
    chain: CHAINS.ethereum,
    address: publicAddress,
    endpoint,
  });
  assert.equal(result.native, "0.0");
  assert.equal(result.assets.find((token) => token.symbol === "USDC").balance, "1.234567");
  assert.ok(result.assets.some((token) => token.status === "error" && token.balance === undefined));
  for (const { body } of requests.filter((row) => row.body.method === "eth_call"))
    assert.equal(body.params[1], "0x2a");
  assert.equal(
    summarizeHistoryBalance({
      results: [{ network: "ethereum", status: "success", ...result }],
    }).state,
    "positive",
  );
});

test("SPL sums multiple token accounts using integer arithmetic and reports zero only after successful enumeration", async (t) => {
  const address = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";
  const mint = COMMON_TOKENS.solana.find((token) => token.symbol === "USDC").address;
  const account = (pubkey, amount) => ({
    pubkey,
    account: {
      owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      data: {
        parsed: {
          info: { owner: address, mint, tokenAmount: { amount, decimals: 6 } },
        },
      },
    },
  });
  const { endpoint } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    result: {
      context: { slot: 42 },
      value: body.method === "getBalance" ? 0 : [account("a", "1000001"), account("b", "2000002")],
    },
  }));
  const result = await queryAssets({ chain: CHAINS.solana, address, endpoint });
  assert.equal(result.assets.find((token) => token.symbol === "USDC").balance, "3.000003");
  assert.equal(result.assets.find((token) => token.symbol === "USDT").balance, "0.0");
});

test("TRC20 queries balanceOf by public address without broadcasting, signing or sending any private key", async (t) => {
  const address = "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH";
  const { endpoint, requests } = await node(t, (path) =>
    path.endsWith("/getaccount")
      ? {}
      : {
          result: { result: true },
          constant_result: [7500000n.toString(16).padStart(64, "0")],
        },
  );
  const result = await queryAssets({ chain: CHAINS.tron, address, endpoint });
  assert.equal(result.assets[0].symbol, "USDT");
  assert.equal(result.assets[0].balance, "7.5");
  const call = requests.find((row) => row.path.endsWith("/triggerconstantcontract"));
  assert.equal(call.path, "/walletsolidity/triggerconstantcontract");
  assert.equal(call.body.function_selector, "balanceOf(address)");
  assert.equal(call.body.parameter.length, 64);
  assert.equal(call.body.owner_address, address);
  assert.ok(!JSON.stringify(requests).includes("privateKey"));
});

test("common token registry uses unique per-chain contracts with verified sources and valid decimals", () => {
  for (const [network, tokens] of Object.entries(COMMON_TOKENS)) {
    assert.ok(CHAINS[network]);
    assert.equal(new Set(tokens.map((token) => token.address.toLowerCase())).size, tokens.length);
    for (const token of tokens) {
      assert.ok(Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 36);
      assert.ok(token.source.startsWith("https://"));
    }
  }
  assert.equal(COMMON_TOKENS.bitcoin.length, 0);
});

test("failed full Solana enumeration skips token balances instead of querying a partial ATA subset", async (t) => {
  const { endpoint, requests } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    ...(body.method === "getTokenAccountsByOwner"
      ? { error: { code: -32601, message: "Method not found" } }
      : {
          result: { context: { slot: 42 }, value: body.method === "getBalance" ? 1000000000 : [] },
        }),
  }));
  const result = await queryAssets({
    chain: CHAINS.solana,
    address: "11111111111111111111111111111111",
    endpoint,
  });
  assert.equal(result.native, "1.0");
  assert.deepEqual(result.assets, []);
  assert.ok(!requests.some(({ body }) => body.method === "getMultipleAccounts"));
});

test("common registry includes USDG Token-2022 and excludes tokenized Bitcoin", () => {
  assert.ok(
    COMMON_TOKENS.solana.find((token) => token.symbol === "USDG").program.startsWith("Tokenz"),
  );
  for (const tokens of Object.values(COMMON_TOKENS))
    assert.ok(!tokens.some((token) => /WBTC|BTCB/.test(token.symbol)));
  for (const network of ["ethereum", "arbitrum", "mantle", "solana", "xlayer"])
    assert.ok(COMMON_TOKENS[network].some((token) => token.symbol === "USDG"));
  assert.equal(CHAINS.xlayer.symbol, "OKB");
  assert.equal(CHAINS.mantle.symbol, "MNT");
});

test("USDG scans Token-2022 independently from legacy SPL token accounts", async (t) => {
  const owner = "11111111111111111111111111111111";
  const usdg = COMMON_TOKENS.solana.find((token) => token.symbol === "USDG");
  const { endpoint, requests } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    result: {
      context: { slot: 42 },
      value:
        body.method === "getBalance"
          ? 0
          : body.params[1].programId === usdg.program
            ? [
                {
                  pubkey: "usdg-account",
                  account: {
                    owner: usdg.program,
                    data: {
                      parsed: {
                        info: {
                          owner,
                          mint: usdg.address,
                          tokenAmount: { amount: "1234567", decimals: 6 },
                        },
                      },
                    },
                  },
                },
              ]
            : [],
    },
  }));
  const result = await queryAssets({
    chain: CHAINS.solana,
    address: owner,
    endpoint,
  });
  assert.equal(result.assets.find((token) => token.symbol === "USDG").balance, "1.234567");
  assert.equal(result.assets.find((token) => token.symbol === "USDC").balance, "0.0");
  assert.deepEqual(
    new Set(
      requests
        .filter((row) => row.body.method === "getTokenAccountsByOwner")
        .map((row) => row.body.params[1].programId),
    ),
    new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", usdg.program]),
  );
});

test("ERC20 node errors retry three times then omit only the failed token from display", async (t) => {
  const { groupAssets } = await import("../src/shared/asset-groups.ts");
  const abi = new Interface(["function balanceOf(address) view returns (uint256)"]);
  const usdg = COMMON_TOKENS.ethereum.find((token) => token.symbol === "USDG");
  let failures = 0;
  const { endpoint } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    ...(body.method === "eth_call" && body.params[0].to.toLowerCase() === usdg.address.toLowerCase()
      ? (failures++, { error: { message: "limited" } })
      : {
          result:
            body.method === "eth_chainId"
              ? "0x1"
              : body.method === "eth_blockNumber"
                ? "0x2a"
                : body.method === "eth_getBalance"
                  ? "0x0"
                  : abi.encodeFunctionResult("balanceOf", [1000000n]),
        }),
  }));
  const result = await queryAssets({
    chain: CHAINS.ethereum,
    address: publicAddress,
    endpoint,
  });
  assert.equal(failures, 4);
  assert.equal(result.assets.find((token) => token.symbol === "USDG").status, "error");
  const groups = groupAssets([{ network: "ethereum", status: "success", ...result }]);
  assert.ok(!groups.some((group) => group.id === "USDG"));
  assert.ok(groups.some((group) => group.id === "USDT"));
});

test("confirmed missing ERC20 contracts are skipped for later wallets without disabling other tokens", async (t) => {
  const { CapabilityRegistry, capabilityKey } = await import("../src/shared/rpc-capabilities.ts");
  const capabilities = new CapabilityRegistry();
  const abi = new Interface(["function balanceOf(address) view returns (uint256)"]);
  const usdc = COMMON_TOKENS.ethereum.find((token) => token.symbol === "USDC");
  const { endpoint, requests } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    result:
      body.method === "eth_chainId"
        ? "0x1"
        : body.method === "eth_blockNumber"
          ? "0x2a"
          : body.method === "eth_getBalance"
            ? "0x0"
            : body.method === "eth_getCode"
              ? "0x"
              : body.params[0].to.toLowerCase() === usdc.address.toLowerCase()
                ? "0x"
                : abi.encodeFunctionResult("balanceOf", [0n]),
  }));
  await queryAssets({ chain: CHAINS.ethereum, address: publicAddress, endpoint, capabilities });
  const calls = () =>
    requests.filter(
      ({ body }) =>
        body.method === "eth_call" &&
        body.params[0].to.toLowerCase() === usdc.address.toLowerCase(),
    ).length;
  assert.equal(calls(), 1);
  assert.equal(
    capabilities.blocked(capabilityKey(CHAINS.ethereum, endpoint, "token", usdc.address)),
    true,
  );
  const next = await queryAssets({
    chain: CHAINS.ethereum,
    address: "0x0000000000000000000000000000000000000001",
    endpoint,
    capabilities,
  });
  assert.equal(calls(), 1);
  assert.ok(!next.assets.some((asset) => asset.address === usdc.address));
  assert.ok(next.assets.some((asset) => asset.status === "success"));
});

test("address-dependent ERC20 reverts do not disable a real contract for other wallets", async (t) => {
  const { CapabilityRegistry, capabilityKey } = await import("../src/shared/rpc-capabilities.ts");
  const capabilities = new CapabilityRegistry();
  const { endpoint, requests } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    ...(body.method === "eth_call"
      ? { error: { code: 3, message: "execution reverted" } }
      : {
          result:
            body.method === "eth_chainId"
              ? "0x1"
              : body.method === "eth_blockNumber"
                ? "0x2a"
                : body.method === "eth_getBalance"
                  ? "0x0"
                  : "0x6000",
        }),
  }));
  const usdc = COMMON_TOKENS.ethereum.find((token) => token.symbol === "USDC");
  await queryAssets({ chain: CHAINS.ethereum, address: publicAddress, endpoint, capabilities });
  assert.equal(
    capabilities.blocked(capabilityKey(CHAINS.ethereum, endpoint, "token", usdc.address)),
    false,
  );
  await queryAssets({
    chain: CHAINS.ethereum,
    address: "0x0000000000000000000000000000000000000001",
    endpoint,
    capabilities,
  });
  assert.equal(
    requests.filter(
      ({ body }) =>
        body.method === "eth_call" &&
        body.params[0].to.toLowerCase() === usdc.address.toLowerCase(),
    ).length,
    2,
  );
});

test("unsupported Solana scans are remembered and skipped on subsequent queries", async (t) => {
  const { CapabilityRegistry } = await import("../src/shared/rpc-capabilities.ts");
  const capabilities = new CapabilityRegistry();
  const { endpoint, requests } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    ...(body.method === "getTokenAccountsByOwner"
      ? { error: { code: -32601, message: "Method not found" } }
      : {
          result: {
            context: { slot: 42 },
            value: body.method === "getBalance" ? 0 : body.params[0].map(() => null),
          },
        }),
  }));
  const query = () =>
    queryAssets({
      chain: CHAINS.solana,
      address: "11111111111111111111111111111111",
      endpoint,
      capabilities,
    });
  await query();
  const attempts = requests.filter(({ body }) => body.method === "getTokenAccountsByOwner").length;
  assert.ok(attempts > 0 && attempts <= 2); // One possible in-flight probe per token program.
  const next = await query();
  assert.equal(
    requests.filter(({ body }) => body.method === "getTokenAccountsByOwner").length,
    attempts,
  );
  assert.deepEqual(next.assets, []);
  assert.ok(!requests.some(({ body }) => body.method === "getMultipleAccounts"));
});

test("HTTP 403 requiring an indexed-query token is remembered without retries or partial fallback", async (t) => {
  const { CapabilityRegistry } = await import("../src/shared/rpc-capabilities.ts");
  const capabilities = new CapabilityRegistry();
  const { endpoint, requests } = await node(t, (_, body) =>
    body.method === "getTokenAccountsByOwner"
      ? {
          httpStatus: 403,
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32602,
            message: "Indexed requests require a personal token. Get one at provider.",
          },
        }
      : { jsonrpc: "2.0", id: body.id, result: { context: { slot: 42 }, value: 0 } },
  );
  const read = () =>
    queryAssets({
      chain: CHAINS.solana,
      address: "11111111111111111111111111111111",
      endpoint,
      capabilities,
    });
  assert.deepEqual((await read()).assets, []);
  const attempts = requests.filter(({ body }) => body.method === "getTokenAccountsByOwner").length;
  assert.ok(attempts > 0 && attempts <= 2);
  assert.deepEqual((await read()).assets, []);
  assert.equal(
    requests.filter(({ body }) => body.method === "getTokenAccountsByOwner").length,
    attempts,
  );
  assert.ok(!requests.some(({ body }) => body.method === "getMultipleAccounts"));
});

test("one unavailable Solana token program does not invalidate complete results from the other program", async (t) => {
  const usdc = COMMON_TOKENS.solana.find((token) => token.symbol === "USDC");
  const { endpoint } = await node(t, (_, body) => ({
    jsonrpc: "2.0",
    id: body.id,
    ...(body.method === "getTokenAccountsByOwner" &&
    body.params[1].programId === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      ? { error: { code: -32010, message: "Token-2022 excluded from account secondary indexes" } }
      : {
          result: {
            context: { slot: 42 },
            value:
              body.method === "getBalance"
                ? 0
                : [
                    {
                      pubkey: "nonstandard-token-account",
                      account: {
                        owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                        data: {
                          parsed: {
                            info: {
                              mint: usdc.address,
                              owner: "11111111111111111111111111111111",
                              tokenAmount: { amount: "2500000", decimals: 6 },
                            },
                          },
                        },
                      },
                    },
                  ],
          },
        }),
  }));
  const value = await queryAssets({
    chain: CHAINS.solana,
    address: "11111111111111111111111111111111",
    endpoint,
  });
  assert.equal(value.assets.find((asset) => asset.symbol === "USDC").balance, "2.5");
  assert.ok(!value.assets.some((asset) => asset.symbol === "USDG"));
  assert.ok(value.assets.every((asset) => asset.scope !== "associated"));
});
