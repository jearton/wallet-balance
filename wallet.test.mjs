import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { Interface } from 'ethers';
import { CHAINS, addressFromPrivateKey, queryBalance, validateRpc } from './wallet.mjs';

// Public, deliberately insecure test vector. Never fund this address.
const key = '0'.repeat(63) + '1';
const address = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const token = '0x0000000000000000000000000000000000000002';
const abi = new Interface(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)']);

async function mockRpc(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push(request);
    const result = await handler(request);
    if (res.destroyed) return;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { endpoint: `http://127.0.0.1:${server.address().port}`, requests };
}

test('derives known address; rejects malformed and out-of-range keys without echoing them', () => {
  assert.equal(addressFromPrivateKey(key), address);
  assert.equal(addressFromPrivateKey(` 0x${key} `), address);
  for (const input of ['secret', '0'.repeat(64), 'f'.repeat(64)]) {
    assert.throws(() => addressFromPrivateKey(input), error => !error.message.includes(input));
  }
});

test('native balance preserves wei precision and only sends public read requests', async t => {
  const { endpoint, requests } = await mockRpc(t, ({ method }) => ({ result: {
    eth_chainId: '0x1', eth_blockNumber: '0x42', eth_getBalance: '0xde0b6b3a7640001',
  }[method] }));
  const result = await queryBalance({ chain: CHAINS.ethereum, address, endpoint });
  assert.deepEqual(result, { native: '1.000000000000000001', symbol: 'ETH', block: '66' });
  assert.deepEqual(requests.map(r => r.method), ['eth_chainId', 'eth_blockNumber', 'eth_getBalance']);
  assert.deepEqual(requests[2].params, [address, '0x42']);
  assert.ok(!JSON.stringify(requests).includes(key));
});

test('chain mismatch stops before requesting a balance', async t => {
  const { endpoint, requests } = await mockRpc(t, () => ({ result: '0x38' }));
  await assert.rejects(queryBalance({ chain: CHAINS.ethereum, address, endpoint }), /链 ID 不匹配/);
  assert.equal(requests.length, 1);
});

test('ERC-20 uses contract decimals and same block as native balance', async t => {
  const { endpoint, requests } = await mockRpc(t, ({ method, params }) => {
    if (method === 'eth_chainId') return { result: '0x1' };
    if (method === 'eth_blockNumber') return { result: '0x42' };
    if (method === 'eth_getBalance') return { result: '0x0' };
    const name = params[0].data.startsWith('0x70a08231') ? 'balanceOf' : 'decimals';
    return { result: abi.encodeFunctionResult(name, [name === 'balanceOf' ? 1234567n : 6]) };
  });
  const result = await queryBalance({ chain: CHAINS.ethereum, address, token, endpoint });
  assert.equal(result.native, '0.0');
  assert.deepEqual(result.token, { address: token, balance: '1.234567' });
  assert.ok(requests.filter(r => r.method === 'eth_call').every(r => r.params[1] === '0x42'));
});

test('RPC errors are not treated as zero and untrusted error details are hidden', async t => {
  const { endpoint } = await mockRpc(t, () => ({ error: { code: -32000, message: 'untrusted-secret' } }));
  await assert.rejects(queryBalance({ chain: CHAINS.ethereum, address, endpoint }), error =>
    /RPC 请求失败/.test(error.message) && !error.message.includes('untrusted-secret'));
});

test('token failures preserve successful native balance', async t => {
  const { endpoint } = await mockRpc(t, ({ method }) => ({ result: {
    eth_chainId: '0x1', eth_blockNumber: '0x42', eth_getBalance: '0x0', eth_call: '0x',
  }[method] }));
  const result = await queryBalance({ chain: CHAINS.ethereum, address, token, endpoint });
  assert.equal(result.native, '0.0');
  assert.match(result.tokenError, /代币查询失败/);
});

test('RPC timeout finishes with a useful error', async t => {
  const { endpoint } = await mockRpc(t, async () => {
    await new Promise(resolve => setTimeout(resolve, 60));
    return { result: '0x1' };
  });
  await assert.rejects(queryBalance({ chain: CHAINS.ethereum, address, endpoint, timeout: 10 }), /超时/);
});

test('only HTTPS or loopback HTTP endpoints are accepted', () => {
  assert.equal(validateRpc('http://localhost:8545'), 'http://localhost:8545/');
  assert.throws(() => validateRpc('http://example.com'), /HTTPS/);
  assert.throws(() => validateRpc('file:///tmp/test'), /HTTPS/);
});

test('CLI refuses piped private keys and never echoes unknown arguments', () => {
  const options = { cwd: import.meta.dirname, encoding: 'utf8' };
  const piped = spawnSync(process.execPath, ['cli.mjs'], { ...options, input: key });
  assert.equal(piped.status, 1);
  assert.match(piped.stderr, /交互式终端/);
  const arg = spawnSync(process.execPath, ['cli.mjs', '--private-key', key], options);
  assert.equal(arg.status, 1);
  assert.ok(!`${arg.stdout}${arg.stderr}`.includes(key));
});
