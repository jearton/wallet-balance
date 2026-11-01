import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  NON_EVM,
  nonEvmWalletFromMnemonic,
  nonEvmWalletFromPrivateKey,
  validateNonEvmAddress,
  queryNonEvmBalance,
} from "../src/shared/non-evm.mjs";
import { createQueryPlan } from "../src/shared/query-plan.mjs";
import { base58 } from "#wallet-crypto";

// Public BIP-39 test vector, never fund these wallets.
const phrase = "abandon ".repeat(11) + "about";
const expected = {
  bitcoin: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
  solana: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
  tron: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
};

test("BTC, SOL and TRON use independent paths and round-trip their network key formats", () => {
  for (const family of Object.keys(NON_EVM)) {
    const wallet = nonEvmWalletFromMnemonic(family, phrase, 12);
    assert.equal(wallet.address, expected[family]);
    assert.equal(
      nonEvmWalletFromPrivateKey(family, wallet.privateKey).address,
      wallet.address,
    );
    assert.equal(validateNonEvmAddress(family, wallet.address), wallet.address);
  }
  const solana = nonEvmWalletFromMnemonic("solana", phrase, 12);
  const bytes = base58.decode(solana.privateKey);
  assert.equal(
    nonEvmWalletFromPrivateKey("solana", JSON.stringify([...bytes])).address,
    solana.address,
  );
  bytes[63] ^= 1;
  assert.throws(
    () => nonEvmWalletFromPrivateKey("solana", base58.encode(bytes)),
    /公私钥须匹配/,
  );
  assert.throws(() =>
    validateNonEvmAddress("tron", expected.tron.slice(0, -1) + "1"),
  );
  assert.throws(() =>
    validateNonEvmAddress("bitcoin", expected.bitcoin.slice(0, -1) + "q"),
  );
  assert.throws(() => validateNonEvmAddress("solana", expected.tron));
});

test("all-networks mnemonic query has 13 networks and four independently saved wallet groups", () => {
  const plan = createQueryPlan({ mode: "mnemonic", phrase, wordCount: 12 });
  assert.equal(plan.names.length, 13);
  assert.deepEqual(plan.names.slice(0, 6), [
    "bitcoin",
    "solana",
    "ethereum",
    "bsc",
    "mantle",
    "tron",
  ]);
  assert.deepEqual(
    plan.groups.map((group) => group.networks.length),
    [10, 1, 1, 1],
  );
  for (const family of Object.keys(NON_EVM))
    assert.equal(plan.wallets[family].address, expected[family]);
  assert.equal(new Set(plan.groups.map((group) => group.privateKey)).size, 4);
  for (const family of Object.keys(NON_EVM)) {
    const addressPlan = createQueryPlan({
      mode: "address",
      address: expected[family],
    });
    assert.deepEqual(addressPlan.names, [family]);
    assert.equal(addressPlan.groups[0].privateKey, null);
  }
  assert.equal(
    createQueryPlan({
      mode: "address",
      address: "0x0000000000000000000000000000000000000000",
    }).names.length,
    10,
  );
  assert.throws(() =>
    createQueryPlan({
      mode: "address",
      selected: "solana",
      address: expected.bitcoin,
    }),
  );
  const rawKeyPlan = createQueryPlan({
    mode: "private",
    privateKey: "0x" + "0".repeat(63) + "1",
  });
  assert.equal(rawKeyPlan.names.length, 12);
  assert.ok(!rawKeyPlan.names.includes("solana"));
});

async function node(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = { url: req.url, body: body ? JSON.parse(body) : undefined };
    requests.push(request);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(handler(request)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return { endpoint: `http://127.0.0.1:${server.address().port}`, requests };
}

test("Bitcoin reports confirmed satoshis and pending changes separately without float arithmetic", async (t) => {
  const { endpoint, requests } = await node(t, () => ({
    address: expected.bitcoin,
    chain_stats: { funded_txo_sum: 100000001, spent_txo_sum: 0 },
    mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 1 },
  }));
  const result = await queryNonEvmBalance({
    chain: NON_EVM.bitcoin,
    address: expected.bitcoin,
    endpoint,
  });
  assert.equal(result.native, "1.00000001");
  assert.match(result.note, /-0.00000001 BTC/);
  assert.equal(requests[0].url, `/address/${expected.bitcoin}`);
  assert.equal(requests[0].body, undefined);
});

test("Solana uses finalized commitment and exact lamport conversion; rejects invalid API replies", async (t) => {
  const { endpoint, requests } = await node(t, () => ({
    jsonrpc: "2.0",
    id: 1,
    result: { context: { slot: 42 }, value: 1000000001 },
  }));
  const result = await queryNonEvmBalance({
    chain: NON_EVM.solana,
    address: expected.solana,
    endpoint,
  });
  assert.equal(result.native, "1.000000001");
  assert.equal(result.block, "42");
  assert.deepEqual(requests[0].body.params, [
    expected.solana,
    { commitment: "finalized" },
  ]);
  const bad = await node(t, () => ({
    id: 1,
    result: { context: { slot: 42 }, value: 9007199254740992 },
  }));
  await assert.rejects(
    queryNonEvmBalance({
      chain: NON_EVM.solana,
      address: expected.solana,
      endpoint: bad.endpoint,
    }),
    /安全范围/,
  );
});

test("TRON handles funded and unactivated accounts, but never turns an API error into zero", async (t) => {
  const funded = await node(t, () => ({
    address: expected.tron,
    balance: 1000001,
  }));
  assert.equal(
    (
      await queryNonEvmBalance({
        chain: NON_EVM.tron,
        address: expected.tron,
        endpoint: funded.endpoint,
      })
    ).native,
    "1.000001",
  );
  assert.equal(funded.requests[0].url, "/walletsolidity/getaccount");
  assert.deepEqual(funded.requests[0].body, {
    address: expected.tron,
    visible: true,
  });
  const empty = await node(t, () => ({}));
  assert.equal(
    (
      await queryNonEvmBalance({
        chain: NON_EVM.tron,
        address: expected.tron,
        endpoint: empty.endpoint,
      })
    ).native,
    "0.0",
  );
  const error = await node(t, () => ({ Error: "upstream detail" }));
  await assert.rejects(
    queryNonEvmBalance({
      chain: NON_EVM.tron,
      address: expected.tron,
      endpoint: error.endpoint,
    }),
    /节点请求失败/,
  );
});
