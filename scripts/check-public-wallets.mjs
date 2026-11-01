// Live smoke check: queries public samples and writes successful results to local history.
// Run explicitly: node scripts/check-public-wallets.mjs
import assert from "node:assert/strict";
import { createQueryPlan } from "../src/shared/query-plan.ts";
import { readHistoryBalances } from "../src/shared/history-query.ts";
import { successfulResults } from "../src/shared/query-results.ts";
import { PUBLIC_COMMUNITY_WALLETS } from "../src/shared/public-community-wallets.ts";

const url = process.env.WALLET_TEST_URL || "http://127.0.0.1:4173";
const solKey =
  "5MaiiCavjCmn9Hs1o3eznqDEhRwxo7pXiAYez7keQUviUkauRiTMD8DrESdrNjN8zd9mTmVhRvBJeg5vhyvgrAhG";
const solAddress = createQueryPlan({ mode: "private", privateKey: solKey }).groups[0].address;
const samples = process.argv.includes("--community")
  ? PUBLIC_COMMUNITY_WALLETS.map((sample) => [sample.name, sample.input])
  : [
      ["Anvil mnemonic", { mode: "mnemonic", phrase: "test ".repeat(11) + "junk" }],
      [
        "Trezor mnemonic",
        {
          mode: "mnemonic",
          phrase: "legal winner thank year wave sausage worth useful legal winner thank yellow",
        },
      ],
      [
        "Anvil private key",
        {
          mode: "private",
          privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        },
      ],
      ["Solana cookbook private key", { mode: "private", privateKey: solKey }],
      [
        "Anvil public address",
        { mode: "address", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
      ],
      ["Solana cookbook public address", { mode: "address", address: solAddress }],
    ];
async function api(path, body) {
  const response = await fetch(url + path, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: {
      "content-type": "application/json",
      "user-agent": "WalletLab-PublicSample-Smoke/1.0",
    },
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return value;
}
for (const [name, input] of samples) {
  const plan = createQueryPlan(input);
  if (name === "Anvil mnemonic" || name === "Anvil private key") {
    assert.equal(
      plan.wallets.ethereum.address.toLowerCase(),
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
  }
  const checks = [];
  const ids = [];
  for (const group of plan.groups) {
    const body = {
      ...group,
      triggerType: "manual",
      ...(input.phrase ? { mnemonic: input.phrase } : {}),
    };
    const { queryTicket } = await api("/api/history/prepare", body);
    const results = await readHistoryBalances({ ...group, results: [] });
    checks.push(
      ...results.map((row) => ({
        network: row.network,
        status: row.status,
        ...(row.status === "success"
          ? {
              native: row.native,
              symbol: row.symbol,
              tokens: row.assets?.filter((asset) => asset.status === "success").length ?? 0,
            }
          : {}),
      })),
    );
    console.log(
      JSON.stringify({
        name,
        address: group.address,
        networks: results.map((row) => `${row.network}:${row.status}`),
      }),
    );
    const saved = await api("/api/history", { ...body, results, queryTicket });
    assert.equal(saved.saved, successfulResults(results).length > 0);
    if (!saved.saved) continue;
    const record = (await api("/api/history")).records.find((row) => row.id === saved.id);
    assert.ok(record);
    assert.equal(record.publicTestWallet, true);
    assert.equal(record.hasMnemonic, input.mode === "mnemonic");
    assert.equal(record.hasPrivateKey, input.mode !== "address");
    ids.push(saved.id);
    // Repeat the same successful input through the reservation/commit API.
    const next = await api("/api/history/prepare", body);
    const repeated = await api("/api/history", { ...body, results, queryTicket: next.queryTicket });
    assert.equal(repeated.id, saved.id);
    const serialized = JSON.stringify(record);
    if (input.phrase) assert.ok(!serialized.includes(input.phrase));
    if (input.privateKey) assert.ok(!serialized.includes(input.privateKey));
  }
  if (ids.length) {
    const wallets = (await api("/api/history?groupBy=wallet")).records;
    const wallet = wallets.find((item) => item.records.some((record) => record.id === ids[0]));
    assert.ok(wallet);
    for (const id of ids) assert.ok(wallet.records.some((record) => record.id === id));
  }
  console.log(
    JSON.stringify({ name, groupsSaved: ids.length, deduplicated: ids.length > 0, checks }),
  );
  if (!ids.length) process.exitCode = 1;
}
