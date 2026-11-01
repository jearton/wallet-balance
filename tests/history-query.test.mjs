import test from 'node:test';
import assert from 'node:assert/strict';
import { readHistoryBalances } from '../src/shared/history-query.mjs';
import { CHAINS } from '../src/shared/wallet.mjs';

test('manual recheck returns token results for the original address and contract, preserving paths and failures', async () => {
  const address = 'public-address', token = 'custom-contract';
  const result = await readHistoryBalances({ address, token, networks: ['ethereum', 'base'], results: [{ network: 'ethereum', path: 'test-path' }] }, async input => {
    assert.equal(input.address, address);
    assert.equal(input.token, token);
    if (input.chain === CHAINS.base) throw new Error('not exposed');
    return { native: '0', symbol: 'ETH', block: '42', assets: [{ address: 'token', symbol: 'USDT', status: 'success', balance: '5' }] };
  });
  assert.equal(result[0].assets[0].balance, '5');
  assert.equal(result[0].path, 'test-path');
  assert.equal(result[1].status, 'error');
  assert.ok(!JSON.stringify(result).includes('not exposed'));
});
