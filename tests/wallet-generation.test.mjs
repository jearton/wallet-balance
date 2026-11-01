import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { openHistory } from "../src/server/history.ts";
import {
  createWalletBatch,
  createWalletGeneration,
  handleWalletGeneration,
} from "../src/server/wallet-generation.ts";
import { summarizeHistoryBalance } from "../src/shared/history-summary.ts";

function storeFor(t) {
  const path = mkdtempSync(join(tmpdir(), "wallet-generation-"));
  const store = openHistory(path);
  t.after(() => {
    store.close();
    rmSync(path, { recursive: true, force: true });
  });
  return { store, path };
}
test("batch creates one 24-word wallet and four encrypted address records only after successful queries", async (t) => {
  const { store, path } = storeFor(t);
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => {
    requests++;
    throw new Error("must not access network");
  };
  try {
    assert.deepEqual(
      await createWalletBatch(store, 24, {
        query: async ({ chain }) => ({
          native: "0.0",
          symbol: chain.symbol,
          block: "1",
          assets: [],
        }),
      }),
      {
        wallets: 1,
        addressRecords: 4,
      },
    );
    const rows = store.list().records;
    assert.equal(rows.length, 4);
    const phrases = rows.map((row) => store.mnemonic(undefined, row.id));
    assert.equal(new Set(phrases).size, 1);
    assert.equal(phrases[0].split(" ").length, 24);
    for (const row of rows) {
      assert.equal(row.triggerType, "automatic");
      assert.ok(row.results.every((result) => result.status === "success"));
      assert.equal(summarizeHistoryBalance(row).label, "已查余额为 0");
      assert.ok(row.hasPrivateKey && row.hasMnemonic);
      assert.ok(!JSON.stringify(row).includes(phrases[0]));
    }
    assert.ok(!readFileSync(join(path, "history.sqlite")).includes(Buffer.from(phrases[0])));
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("scheduler runs once per tick, persists pause, avoids overlapping work and resumes once", async (t) => {
  const { store } = storeFor(t);
  const timers = new Map();
  let sequence = 0,
    calls = 0,
    finish;
  const options = {
    enabled: true,
    intervalMs: 5000,
    wordCount: 24,
    now: () => 10000,
    schedule: (fn, delay) => {
      assert.equal(delay, 5000);
      timers.set(++sequence, fn);
      return sequence;
    },
    cancel: (id) => timers.delete(id),
    generate: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const job = createWalletGeneration(store, options);
  job.start();
  job.start();
  assert.equal(timers.size, 1);
  const tick = timers.get(sequence);
  timers.delete(sequence);
  const work = tick();
  assert.equal(calls, 1);
  assert.equal(job.status().running, true);
  await tick();
  assert.equal(calls, 1);
  job.pause();
  finish();
  await work;
  assert.equal(timers.size, 0);
  assert.equal(job.status().generatedCount, 1);
  job.stop();
  const restarted = createWalletGeneration(store, options);
  restarted.start();
  assert.equal(restarted.status().paused, true);
  assert.equal(timers.size, 0);
  restarted.resume();
  restarted.resume();
  assert.equal(timers.size, 1);
  restarted.stop();
  assert.equal(timers.size, 0);
});

test("generation control rejects cross-site requests and allows local pause/resume", async (t) => {
  const { store } = storeFor(t);
  const job = createWalletGeneration(store, { enabled: true });
  const server = createServer((req, res) => handleWalletGeneration(req, res, job));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    job.stop();
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + "/api/generation")).status, 200);
  const bad = await fetch(base + "/api/generation/pause", {
    method: "POST",
    headers: {
      origin: "https://example.com",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(bad.status, 403);
  assert.equal(job.status().paused, false);
  const paused = await fetch(base + "/api/generation/pause", {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal((await paused.json()).paused, true);
  const resumed = await fetch(base + "/api/generation/resume", {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal((await resumed.json()).paused, false);
});

test("automatic batches remain absent from history until queries finish and all-failure batches save nothing", async (t) => {
  const { store } = storeFor(t);
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const work = createWalletBatch(store, 24, {
    query: async ({ chain }) => {
      await gate;
      if (chain.family !== "solana") throw new Error("temporary");
      return { native: "0", symbol: "SOL", block: "1", assets: [] };
    },
  });
  assert.equal(store.listWallets().records.length, 0);
  finish();
  assert.deepEqual(await work, { wallets: 1, addressRecords: 1 });
  assert.equal(store.listWallets().records.length, 1);
  assert.deepEqual(store.list().records[0].networks, ["solana"]);
  assert.deepEqual(
    await createWalletBatch(store, 24, {
      query: async () => {
        throw new Error("offline");
      },
    }),
    { wallets: 0, addressRecords: 0 },
  );
  assert.equal(store.listWallets().records.length, 1);
});
