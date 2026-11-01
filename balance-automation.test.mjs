import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openHistory } from './history.mjs';
import { generateMnemonic } from './mnemonic.mjs';
import { createQueryPlan } from './query-plan.mjs';
function legacyBatch(store) {
  const phrase = generateMnemonic(24);
  for (const group of createQueryPlan({ mode: 'mnemonic', phrase }).groups) store.create(undefined, { ...group, mnemonic: phrase, triggerType: 'automatic' }, undefined, { unqueried: true });
}
import { completeBalance, createBalanceAutomation } from './balance-automation.mjs';

function storeFor(t) {
  const directory = mkdtempSync(join(tmpdir(), 'balance-automation-'));
  const store = openHistory(directory);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return store;
}
const zero = async ({ chain }) => ({ native: '0.0', symbol: chain.symbol, block: '1', assets: [] });

test('claims all generated address records once and persists balances without replacing wallet metadata', async t => {
  const store = storeFor(t);
  legacyBatch(store);
  const originals = store.list().records;
  for (let index = 0; index < 4; index++) {
    const record = store.claimBalance();
    assert.ok(record);
    const before = originals.find(row => row.id === record.id);
    const secret = store.privateKey(undefined, record.id);
    const phrase = store.mnemonic(undefined, record.id);
    await completeBalance(store, record, zero);
    const saved = store.get(undefined, record.id);
    assert.equal(saved.cursor, before.cursor);
    assert.equal(saved.walletId, before.walletId);
    assert.equal(store.privateKey(undefined, record.id), secret);
    assert.equal(store.mnemonic(undefined, record.id), phrase);
    assert.ok(saved.results.every(row => row.status === 'success'));
  }
  assert.equal(store.claimBalance(), null);
});

test('backfill preserves IDs, ordering, secrets and completed networks; failed backfill leaves the existing record unchanged', async t => {
  const store = storeFor(t);
  const first = store.create(undefined, { source: 'address', address: '0x0000000000000000000000000000000000000001', networks: ['ethereum', 'base'] }, undefined, { unqueried: true });
  const original = store.get(undefined, first.id);
  store.update(undefined, first.id, [{ network: 'ethereum', status: 'success', native: '2', symbol: 'ETH', block: '1' }, { network: 'base', status: 'unqueried', path: 'test-path' }], first.queryVersion);
  const record = store.claimBalance();
  let calls = 0;
  await completeBalance(store, record, async () => { calls++; throw new Error('do not expose'); });
  const saved = store.get(undefined, first.id);
  assert.equal(calls, 1);
  assert.equal(saved.cursor, original.cursor);
  assert.equal(saved.createdAt, original.createdAt);
  assert.equal(saved.results[0].native, '2');
  assert.equal(saved.results[1].status, 'pending');
  assert.equal(saved.results[1].path, 'test-path');
  assert.equal(saved.results[1].error, undefined);
  assert.equal(store.claimBalance(), null);
});

test('manual requery supersedes background results; interrupted claims become eligible after lease expiry', async t => {
  const store = storeFor(t);
  legacyBatch(store);
  const original = store.claimBalance();
  const manual = store.requery(undefined, original.id);
  await completeBalance(store, original, zero);
  assert.equal(store.get(undefined, original.id).queryVersion, manual.queryVersion);
  assert.ok(store.get(undefined, original.id).results.every(row => row.status === 'pending'));
  // Drain other records to isolate the interrupted manual query.
  for (let i = 0; i < 3; i++) await completeBalance(store, store.claimBalance(), zero);
  assert.equal(store.claimBalance(), null);
  const recovered = store.claimBalance(Date.now() + 11 * 60 * 1000);
  assert.equal(recovered.id, original.id);
  await completeBalance(store, recovered, zero);
  assert.equal(store.balanceQueueStatus().remainingRecords, 0);
});

test('worker bounds concurrency, drains existing backlog, and stops without scheduling more work', async t => {
  const store = storeFor(t);
  legacyBatch(store);
  const timers = [];
  const worker = createBalanceAutomation(store, { query: zero, schedule: fn => { timers.push(fn); return 1; }, cancel: () => timers.pop() });
  worker.start();
  assert.equal(worker.status().activeRecords, 4);
  await worker.stop();
  assert.equal(worker.status().remainingRecords, 0);
  assert.equal(timers.length, 0);
});
