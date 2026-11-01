import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryPlan } from '../src/shared/query-plan.mjs';
import { isPublicTestWallet } from '../src/shared/public-test-wallets.mjs';
import { PUBLIC_COMMUNITY_WALLETS } from '../src/shared/public-community-wallets.mjs';

test('third-party teaching examples derive the published addresses and are tagged', () => {
  for (const sample of PUBLIC_COMMUNITY_WALLETS) {
    const plan = createQueryPlan(sample.input);
    if (sample.ethereumAddress) assert.equal(plan.wallets.ethereum.address, sample.ethereumAddress);
    for (const group of plan.groups) assert.equal(isPublicTestWallet(group), true);
  }
});

test('published development samples are tagged across input types and derived chains', () => {
  for (const input of [
    { mode: 'mnemonic', phrase: 'test '.repeat(11) + 'junk' },
    { mode: 'private', privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
    { mode: 'private', privateKey: '5MaiiCavjCmn9Hs1o3eznqDEhRwxo7pXiAYez7keQUviUkauRiTMD8DrESdrNjN8zd9mTmVhRvBJeg5vhyvgrAhG' },
    { mode: 'address', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  ]) {
    for (const group of createQueryPlan(input).groups) {
      assert.equal(isPublicTestWallet({ networks: group.networks, address: group.address }), true);
    }
  }
  assert.equal(isPublicTestWallet({ networks: ['ethereum'], address: '0x0000000000000000000000000000000000000001' }), false);
});
