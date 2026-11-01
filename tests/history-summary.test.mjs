import test from "node:test";
import assert from "node:assert/strict";
import { summarizeHistoryBalance } from "../src/shared/history-summary.ts";

test("history distinguishes tiny positive balances and keeps networks/currencies separate", () => {
  const summary = summarizeHistoryBalance({
    results: [
      {
        network: "ethereum",
        status: "success",
        native: "0.000000000000000001",
        symbol: "ETH",
      },
      { network: "base", status: "success", native: "2.0", symbol: "ETH" },
      { network: "solana", status: "success", native: "3.0", symbol: "SOL" },
    ],
  });
  assert.equal(summary.state, "positive");
  assert.deepEqual(summary.amounts, [
    "Ethereum · 0.000000000000000001 ETH",
    "Base · 2.0 ETH",
    "Solana · 3.0 SOL",
  ]);
});

test("failed, pending and malformed results are skipped without changing successfully read balances", () => {
  for (const row of [
    { status: "error" },
    { status: "pending" },
    { status: "success", native: "invalid" },
  ]) {
    const summary = summarizeHistoryBalance({
      results: [
        {
          network: "ethereum",
          status: "success",
          native: "0.0",
          symbol: "ETH",
        },
        { network: "base", ...row },
      ],
    });
    assert.equal(summary.state, "zero");
    assert.deepEqual(summary.notes, []);
  }
  assert.equal(
    summarizeHistoryBalance({
      results: [
        {
          network: "ethereum",
          status: "success",
          native: "0.0",
          symbol: "ETH",
        },
      ],
    }).state,
    "zero",
  );
});

test("token balances count as assets; failed token reads do not change successful native balances", () => {
  const row = {
    network: "bsc",
    status: "success",
    native: "0.0",
    symbol: "BNB",
    tokenBalance: "12.345678",
  };
  const summary = summarizeHistoryBalance({
    token: "contract",
    results: [row],
  });
  assert.equal(summary.state, "positive");
  assert.equal(summary.amounts[0], "BNB Smart Chain · 代币 12.345678");
  assert.equal(
    summarizeHistoryBalance({
      token: "contract",
      results: [{ ...row, tokenBalance: undefined, tokenError: "failed" }],
    }).state,
    "zero",
  );
});

test("filters require a key and confirmed positive amount without treating errors as funds", async () => {
  const { matchesHistoryFilter } = await import("../src/shared/history-summary.ts");
  const record = {
    hasPrivateKey: true,
    results: [
      {
        network: "ethereum",
        status: "success",
        native: "0.000000000000000001",
      },
    ],
  };
  assert.equal(matchesHistoryFilter(record, "key-positive"), true);
  assert.equal(matchesHistoryFilter({ ...record, hasPrivateKey: false }, "key-positive"), false);
  assert.equal(
    matchesHistoryFilter(
      { ...record, results: [{ network: "ethereum", status: "error" }] },
      "key-positive",
    ),
    false,
  );
  assert.equal(
    matchesHistoryFilter(
      {
        ...record,
        token: "contract",
        results: [
          {
            network: "ethereum",
            status: "success",
            native: "0",
            tokenBalance: "1",
          },
        ],
      },
      "key-positive",
    ),
    true,
  );
  assert.equal(matchesHistoryFilter(record, "zero"), false);
});

test("partial Solana token balances and retired WSOL do not affect history amounts or positive filters", () => {
  const retired = {
    symbol: "WSOL",
    address: "So11111111111111111111111111111111111111112",
    balance: "10",
    status: "success",
    scope: "associated",
  };
  const row = {
    network: "solana",
    status: "success",
    native: "0",
    symbol: "SOL",
    assets: [retired],
  };
  assert.equal(summarizeHistoryBalance({ results: [row] }).state, "zero");
  const partial = summarizeHistoryBalance({
    results: [
      {
        ...row,
        assets: [
          ...row.assets,
          {
            symbol: "USDC",
            address: "mint",
            balance: "100",
            status: "success",
            scope: "associated",
          },
        ],
      },
    ],
  });
  assert.equal(partial.label, "已查余额为 0");
  assert.deepEqual(partial.notes, []);
  assert.equal(partial.state, "zero");
  assert.deepEqual(partial.amounts, []);
});

test("no successful balances never become zero; a positive result survives skipped queries", () => {
  for (const row of [
    { status: "error" },
    { status: "pending" },
    { status: "success", native: "invalid" },
  ]) {
    const empty = summarizeHistoryBalance({ results: [{ network: "ethereum", ...row }] });
    assert.equal(empty.state, "unknown");
    assert.equal(empty.label, "暂无成功结果");
    assert.deepEqual(empty.notes, []);
    const found = summarizeHistoryBalance({
      results: [
        { network: "solana", status: "success", native: "1", symbol: "SOL" },
        { network: "ethereum", ...row },
      ],
    });
    assert.equal(found.state, "positive");
    assert.deepEqual(found.amounts, ["Solana · 1 SOL"]);
  }
});
