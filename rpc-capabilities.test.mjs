import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry, capabilityKey, rpcFailure } from './rpc-capabilities.mjs';
import { CHAINS } from './wallet.mjs';
const endpoint = 'https://rpc.example/key-secret';

test('capability memory persists hashed keys, expires, and isolates endpoints, chains, methods and token contracts', () => {
  let now = 1000, saved;
  const registry = new CapabilityRegistry({ now: () => now });
  registry.useStorage({ read: () => [], write: value => { saved = value; } });
  const key = capabilityKey(CHAINS.ethereum, endpoint, 'token', '0xabc');
  registry.remember(key, 'no-contract');
  assert.equal(registry.blocked(key), true);
  assert.equal(registry.blocked(capabilityKey(CHAINS.base, endpoint, 'token', '0xabc')), false);
  assert.equal(registry.blocked(capabilityKey(CHAINS.ethereum, 'https://other.example', 'token', '0xabc')), false);
  assert.equal(registry.blocked(capabilityKey(CHAINS.ethereum, endpoint, 'token', '0xdef')), false);
  assert.ok(!JSON.stringify(saved).includes('key-secret'));
  const restarted = new CapabilityRegistry({ now: () => now }); restarted.restore(saved);
  assert.equal(restarted.blocked(key), true);
  now += 24 * 60 * 60 * 1000 + 1;
  assert.equal(restarted.blocked(key), false);
});

test('only explicit unsupported methods and Solana indexes are remembered; reverts and temporary failures are not blacklisted', () => {
  const registry = new CapabilityRegistry();
  const context = { registry, chain: CHAINS.solana, endpoint, method: 'getTokenAccountsByOwner', program: 'SPL' };
  for (const payload of [{ code: -32005, message: 'rate limit' }, { message: 'timeout' }, { code: -32000, message: 'execution reverted' }]) rpcFailure(payload, context);
  assert.equal(registry.entries().length, 0);
  const index = rpcFailure({ code: -32010, message: 'SPL excluded from account secondary indexes' }, context);
  assert.equal(index.retryable, false);
  assert.equal(registry.blocked(capabilityKey(CHAINS.solana, endpoint, context.method, 'SPL')), true);
  assert.equal(registry.blocked(capabilityKey(CHAINS.solana, endpoint, context.method, 'Token-2022')), false);
  const unsupported = rpcFailure({ code: -32601, message: 'Method not found' }, context);
  assert.equal(unsupported.retryable, false);
  assert.equal(registry.blocked(capabilityKey(CHAINS.solana, endpoint, context.method)), true);
});
