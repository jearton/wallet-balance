import test from 'node:test';
import assert from 'node:assert/strict';
import { successfulResults } from '../src/shared/query-results.mjs';

test('history commits retain complete token and native balances but drop legacy partial account results', () => {
  const rows = successfulResults([{ network: 'solana', status: 'success', native: '1', symbol: 'SOL', assets: [
    { symbol: 'USDC', status: 'success', balance: '900', scope: 'associated' },
    { symbol: 'USDT', status: 'success', balance: '2' },
  ] }]);
  assert.equal(rows[0].native, '1');
  assert.deepEqual(rows[0].assets.map(asset => asset.symbol), ['USDT']);
});
