import { groupAssets } from "../src/shared/asset-groups.mjs";
import { summarizeHistoryBalance } from "../src/shared/history-summary.mjs";
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import * as requireCryptoForMigration from 'node:crypto';
import { ownerId as ownerHashForMigration } from '../src/server/history.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { openHistory } from '../src/server/history.mjs';
import { handleHistory } from '../src/server/history-api.mjs';
import { CHAINS, walletFromPrivateKey } from '../src/shared/wallet.mjs';
import { createQueryPlan } from '../src/shared/query-plan.mjs';

const token = 'a'.repeat(64);
const other = 'b'.repeat(64);
const privateKey = '0x' + '0'.repeat(63) + '1'; // Public test vector only.
const address = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const input = { privateKey, address, source: 'private', networks: ['ethereum', 'base'] };
function temp(t) {
  const path = mkdtempSync(join(tmpdir(), 'wallet-history-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('SQLite reuses the private-key record, encrypts keys, and survives reopening', t => {
  const path = temp(t);
  let store = openHistory(path);
  const record = store.create(token, input);
  const second = store.create(token, input);
  assert.equal(record.id, second.id);
  assert.equal(store.list(token).records.length, 1);
  assert.equal(store.list(token).records[0].results[0].status, 'pending');
  assert.equal(store.update(token, record.id, [
    { network: 'ethereum', status: 'success', native: '1.000000000000000001', symbol: 'ETH', block: '42' },
    { network: 'base', status: 'error', error: 'RPC timeout' },
  ]), true);
  assert.equal(store.privateKey(token, record.id), privateKey);
  assert.equal(store.privateKey(other, record.id), privateKey);
  assert.equal(store.update(other, "missing", []), false);
  assert.equal(store.list(other).records.length, 1);
  assert.ok(!JSON.stringify(store.list(token)).includes(privateKey));
  for (const file of readdirSync(path).filter(name => name.startsWith('history.sqlite'))) {
    assert.ok(!readFileSync(join(path, file)).includes(Buffer.from(privateKey)));
  }
  store.close();
  store = openHistory(path);
  try {
    assert.equal(store.privateKey(token, record.id), privateKey);
    const saved = store.list(token).records.find(row => row.id === record.id);
    assert.equal(saved.results[0].native, '1.000000000000000001');
    assert.equal(saved.results[1].status, 'error');
  } finally { store.close(); }
});

test('history validates key/address matching and networks; supports address-only records and pagination', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  assert.throws(() => store.create(token, { ...input, address: '0x0000000000000000000000000000000000000000' }));
  assert.throws(() => store.create(token, { ...input, networks: ['__proto__'] }));
  assert.throws(() => store.create(token, { ...input, networks: ['ethereum', 'ethereum'] }));
  for (let i = 0; i < 21; i++) store.create(token, { ...input, address: '0x' + (i + 1).toString(16).padStart(40, '0'), privateKey: null, source: 'address' });
  const first = store.list(token);
  assert.equal(first.records.length, 20);
  assert.equal(first.records[0].hasPrivateKey, false);
  assert.equal(store.privateKey(token, first.records[0].id), null);
  const last = store.list(token, first.nextCursor);
  assert.equal(last.records.length, 1);
  assert.equal(last.nextCursor, null);
  assert.ok(!first.records.some(row => row.id === last.records[0].id));
});

test('missing encryption key never silently replaces the existing database key', t => {
  const path = temp(t);
  const store = openHistory(path);
  store.create(token, input);
  store.close();
  unlinkSync(join(path, 'history.key'));
  assert.throws(() => openHistory(path), /加密密钥缺失/);
});

test('history persists every configured EVM network together, including expanded networks', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  const networks = Object.keys(CHAINS).filter(name => !CHAINS[name].family && !CHAINS[name].disabled);
  const { id } = store.create(token, { ...input, networks });
  const results = networks.map(network => ({ network, status: 'success', native: '0.0', symbol: CHAINS[network].symbol, block: '1' }));
  assert.equal(store.update(token, id, results), true);
  const [record] = store.list(token).records;
  assert.deepEqual(record.networks, networks);
  assert.deepEqual(record.results, results);
});

test('multi-chain mnemonic history encrypts and restores the correct key for each address family', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  const plan = createQueryPlan({ mode: 'mnemonic', phrase: 'abandon '.repeat(11) + 'about', wordCount: 12 });
  for (const group of plan.groups) {
    const { id } = store.create(token, group);
    assert.equal(store.privateKey(token, id), group.privateKey);
    const saved = store.list(token).records.find(row => row.id === id);
    assert.equal(saved.address, group.address);
    assert.deepEqual(saved.networks, group.networks);
  }
  assert.equal(store.list(token).records.length, 4);
  assert.throws(() => store.create(token, { ...plan.groups[0], networks: ['ethereum', 'tron'] }), /分别保存/);
});

test('requery updates the same record with the same wallet and token', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  const contract = '0x0000000000000000000000000000000000000002';
  const original = store.create(token, { ...input, networks: ['ethereum'], token: contract });
  const previous = [{ network: 'ethereum', status: 'success', native: '1.0', symbol: 'ETH', block: '42', tokenBalance: '12.5', path: "m/44'/60'/0'/0/0" }];
  store.update(token, original.id, previous);
  assert.equal(store.get(other, original.id).id, original.id);
  const next = store.requery(token, original.id);
  assert.equal(next.id, original.id);
  assert.equal(next.address, address);
  assert.equal(next.token, contract);
  assert.equal(next.source, 'private');
  assert.equal(next.hasPrivateKey, true);
  assert.ok(!JSON.stringify(next).includes(privateKey));
  assert.equal(store.privateKey(token, next.id), privateKey);
  assert.deepEqual(next.results, [{ network: 'ethereum', status: 'pending', path: "m/44'/60'/0'/0/0" }]);
  const updated = [{ network: 'ethereum', status: 'error', error: 'RPC timeout' }];
  store.update(token, next.id, updated);
  assert.equal(store.list(token).records.length, 1);
  assert.deepEqual(store.list(token).records[0].results, updated);
});

test('requery supports all address families and address-only records without a private key', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  const plan = createQueryPlan({ mode: 'mnemonic', phrase: 'abandon '.repeat(11) + 'about', wordCount: 12 });
  for (const group of plan.groups) {
    const original = store.create(token, { ...group, source: 'address', privateKey: null });
    const next = store.requery(token, original.id);
    assert.equal(next.address, group.address);
    assert.deepEqual(next.networks, group.networks);
    assert.equal(next.hasPrivateKey, false);
    assert.equal(store.privateKey(token, next.id), null);
  }
});

test('history HTTP API shares across browsers and enforces origin; never leaks input errors', async t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  const server = createServer((req, res) => handleHistory(req, res, store));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Wallet-Token': token, 'Content-Type': 'application/json', Origin: base };
  assert.equal((await fetch(base + '/api/history')).status, 200);
  assert.equal((await fetch(base + '/api/history', { headers: { ...headers, Origin: 'http://evil.example' } })).status, 403);
  async function saveCompleted(value) {
    const reservation = await (await fetch(base + '/api/history/prepare', { method: 'POST', headers, body: JSON.stringify(value) })).json();
    return fetch(base + '/api/history', { method: 'POST', headers, body: JSON.stringify({ ...value, ...reservation,
      results: value.networks.map(network => ({ network, status: 'success', native: '0.0', symbol: CHAINS[network].symbol })) }) });
  }
  const created = await saveCompleted(input);
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const list = await (await fetch(base + '/api/history', { headers })).json();
  assert.equal(list.records.length, 1);
  assert.ok(!JSON.stringify(list).includes(privateKey));
  const keyResult = await (await fetch(base + `/api/history/${id}/private-key`, { headers })).json();
  assert.equal(keyResult.privateKey, privateKey);
  assert.equal((await fetch(base + `/api/history/${id}/private-key`)).status, 200);
  assert.equal((await fetch(base + `/api/history/${id}/requery`, { method: 'POST' })).status, 201);
  const retryResponse = await fetch(base + `/api/history/${id}/requery`, { method: 'POST', headers });
  assert.equal(retryResponse.status, 201);
  const retried = await retryResponse.json();
  assert.equal(retried.id, id);
  assert.equal(retried.hasPrivateKey, true);
  assert.ok(!JSON.stringify(retried).includes(privateKey));
  assert.equal((await fetch(base + `/api/history/${id}/requery`, { headers })).status, 404);
  const phrase = 'abandon '.repeat(11) + 'about';
  const group = createQueryPlan({ mode: 'mnemonic', selected: 'bitcoin', phrase }).groups[0];
  const saved = await (await saveCompleted({ ...group, mnemonic: phrase })).json();
  const phraseUrl = base + `/api/history/${saved.id}/mnemonic`;
  assert.equal((await fetch(phraseUrl)).status, 200);
  assert.deepEqual(await (await fetch(phraseUrl, { headers })).json(), { mnemonic: phrase });
  assert.equal((await fetch(phraseUrl, { method: 'POST', headers })).status, 404);
  const failure = await fetch(base + '/api/history', { method: 'POST', headers, body: JSON.stringify({ ...input, privateKey: 'secret-invalid' }) });
  assert.equal(failure.status, 400);
  assert.ok(!(await failure.text()).includes('secret-invalid'));
});

test('mnemonics are encrypted, shared, validated and retained when requerying and reopening', t => {
  const path = temp(t);
  let store = openHistory(path);
  const phrase = 'abandon '.repeat(11) + 'about';
  const plan = createQueryPlan({ mode: 'mnemonic', phrase });
  const ids = [];
  for (const group of plan.groups) {
    const { id } = store.create(token, { ...group, mnemonic: phrase });
    ids.push(id);
    assert.equal(store.mnemonic(token, id), phrase);
    assert.equal(store.mnemonic(other, id), phrase);
    assert.equal(store.list(token).records.find(row => row.id === id).hasMnemonic, true);
    const next = store.requery(token, id);
    assert.equal(next.hasMnemonic, true);
    assert.equal(store.mnemonic(token, next.id), phrase);
    assert.ok(!JSON.stringify(next).includes(phrase));
  }
  assert.ok(!JSON.stringify(store.list(token)).includes(phrase));
  assert.throws(() => store.create(token, { ...input, mnemonic: phrase }));
  assert.throws(() => store.create(token, { ...input, source: 'mnemonic', mnemonic: phrase }));
  const legacy = store.create(token, plan.groups[0]);
  assert.equal(store.mnemonic(token, legacy.id), phrase);
  assert.equal(store.requery(token, legacy.id).hasMnemonic, true);
  store.close();
  for (const file of readdirSync(path).filter(name => name.startsWith('history.sqlite'))) {
    assert.ok(!readFileSync(join(path, file)).includes(Buffer.from(phrase)));
  }
  store = openHistory(path);
  try { for (const id of ids) assert.equal(store.mnemonic(token, id), phrase); }
  finally { store.close(); }
});

 test('existing SQLite schema migrates without losing old records', t => {
  const path = temp(t);
  let store = openHistory(path);
  const record = store.create(token, input);
  store.close();
  const db = new DatabaseSync(join(path, 'history.sqlite'));
  db.exec('ALTER TABLE history DROP COLUMN mnemonic_secret');
  db.close();
  store = openHistory(path);
  try {
    assert.equal(store.privateKey(token, record.id), privateKey);
    assert.equal(store.list(token).records[0].hasMnemonic, false);
    assert.equal(store.mnemonic(token, record.id), null);
  } finally { store.close(); }
});

test('history filters scan beyond unmatching pages, share results and paginate matching balances', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  for (let i = 0; i < 21; i++) {
    const wallet = walletFromPrivateKey(CHAINS.ethereum, '0x' + (i + 1).toString(16).padStart(64, '0'));
    const record = store.create(token, { ...input, ...wallet });
    store.update(token, record.id, input.networks.map(network => ({ network, status: 'success', native: '0.000000000000000001', symbol: 'ETH' })));
  }
  for (let i = 0; i < 105; i++) store.create(token, { ...input, address: '0x' + (i + 1).toString(16).padStart(40, '0'), source: 'address', privateKey: null });
  const first = store.list(token, undefined, 'key-positive');
  assert.equal(first.records.length, 20);
  assert.ok(first.records.every(record => record.hasPrivateKey));
  const last = store.list(token, first.nextCursor, 'key-positive');
  assert.equal(last.records.length, 1);
  assert.equal(last.nextCursor, null);
  assert.ok(!first.records.some(record => record.id === last.records[0].id));
  assert.equal(store.list(other, undefined, 'key-positive').records.length, 20);
  assert.equal(store.list(token, undefined, 'zero').records.length, 0);
  assert.equal(store.list(token, undefined, 'unknown').records[0].hasPrivateKey, false);
  assert.throws(() => store.list(token, undefined, 'invalid'));
});

 test('normalized private keys reuse IDs across query scopes and reject stale results', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  const first = store.create(token, input);
  const second = store.create(token, { ...input, privateKey: privateKey.slice(2), networks: ['bsc'] });
  assert.equal(first.id, second.id);
  assert.notEqual(first.queryVersion, second.queryVersion);
  assert.equal(store.update(token, first.id, [{ network: 'bsc', status: 'success', native: '9' }], first.queryVersion), false);
  assert.equal(store.update(token, second.id, [{ network: 'bsc', status: 'success', native: '1' }], second.queryVersion), true);
  assert.deepEqual(store.list(token).records[0].networks, ['bsc']);
  assert.equal(store.list(token).records.length, 1);
  assert.equal(store.create(other, input).id, first.id);
  assert.equal(store.list(other).records.length, 1);
});

 test('legacy duplicate migration preserves latest balance and older mnemonic with a unique SQL index', t => {
  const path = temp(t);
  const phrase = 'abandon '.repeat(11) + 'about';
  const group = createQueryPlan({ mode: 'mnemonic', selected: 'ethereum', phrase }).groups[0];
  let store = openHistory(path);
  const original = store.create(token, { ...group, mnemonic: phrase });
  store.close();
  let db = new DatabaseSync(join(path, 'history.sqlite'));
  // Emulate a pre-upgrade database by removing only the newly introduced uniqueness/version fields.
  db.exec('DROP INDEX IF EXISTS history_owner_private_key; DROP INDEX IF EXISTS history_private_key; ALTER TABLE history DROP COLUMN key_fingerprint; ALTER TABLE history DROP COLUMN query_version');
  db.close();
  // Create a second legacy row with its own valid ciphertext/AAD using another temporary store.
  const otherPath = temp(t);
  const secondStore = openHistory(otherPath);
  const latest = secondStore.create(token, { ...group, source: 'private' });
  secondStore.close();
  // Re-encrypt a key under the original database key without exposing it in assertions or logs.
  const { createCipheriv, randomBytes } = requireCryptoForMigration;
  const originalKey = readFileSync(join(path, 'history.key'));
  const owner = ownerHashForMigration(token);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', originalKey, iv);
  cipher.setAAD(Buffer.from(owner + latest.id));
  const encrypted = Buffer.concat([cipher.update(group.privateKey, 'utf8'), cipher.final()]);
  const secret = JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
  db = new DatabaseSync(join(path, 'history.sqlite'));
  db.prepare('INSERT INTO history (id,owner,created_at,address,secret,source,networks,token,results) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(latest.id, owner, new Date().toISOString(), group.address, secret, 'private', JSON.stringify(group.networks), null, JSON.stringify([{ network: 'ethereum', status: 'success', native: '7', symbol: 'ETH' }]));
  db.close();
  store = openHistory(path);
  try {
    const records = store.list(token).records;
    assert.equal(records.length, 1);
    assert.equal(records[0].id, latest.id);
    assert.equal(records[0].results[0].native, '7');
    assert.equal(store.mnemonic(token, latest.id), phrase);
    assert.equal(store.privateKey(token, latest.id), group.privateKey);
    assert.equal(store.privateKey(token, original.id), undefined);
    assert.equal(store.create(token, { ...group, mnemonic: phrase }).id, latest.id);
    assert.notEqual(store.create(token, { ...group, source: 'private' }).id, latest.id);
    db = new DatabaseSync(join(path, 'history.sqlite'));
    assert.throws(() => db.exec(`INSERT INTO history (id,owner,created_at,address,secret,source,networks,token,results,key_fingerprint,wallet_group) SELECT id || 'x',owner,created_at,address,secret,source,networks,token,results,key_fingerprint,wallet_group FROM history LIMIT 1`), /UNIQUE/);
    db.close();
  } finally { store.close(); }
});

test('public test wallets are tagged in old, address-only and private-key histories without exposing phrases', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  const phrase = 'abandon '.repeat(11) + 'about';
  const plan = createQueryPlan({ mode: 'mnemonic', phrase });
  for (const group of plan.groups) {
    const created = store.create(token, { ...group, source: 'address', privateKey: null });
    const record = store.list(token).records.find(row => row.id === created.id);
    assert.equal(record.publicTestWallet, true);
    assert.equal(record.hasMnemonic, false);
    const keyed = store.create(token, { ...group, source: 'private' });
    assert.equal(store.list(token).records.find(row => row.id === keyed.id).publicTestWallet, true);
    assert.equal(store.requery(token, keyed.id).publicTestWallet, true);
  }
  const normal = store.create(token, input);
  assert.equal(store.list(token).records.find(row => row.id === normal.id).publicTestWallet, false);
  assert.ok(!JSON.stringify(store.list(token)).includes(phrase));
});

test('shared history records browser metadata, selected networks and per-token outcomes without losing secrets', t => {
  const store=openHistory(temp(t));t.after(()=>store.close());
  const created=store.create(token,input,{userAgent:'Browser One',platform:'desktop'});
  assert.equal(store.list(undefined).records[0].createdBrowser.userAgent,'Browser One');
  const next=store.requery(undefined,created.id,{networks:['bsc']},{userAgent:'Browser Two',platform:'mobile'});
  assert.equal(next.id,created.id);
  assert.deepEqual(next.networks,['bsc']);
  assert.equal(next.createdBrowser.userAgent,'Browser One');
  assert.equal(next.lastBrowser.userAgent,'Browser Two');
  assert.equal(store.privateKey(undefined,created.id),privateKey);
  assert.throws(()=>store.requery(undefined,created.id,{networks:['solana']}));
  assert.throws(()=>store.requery(undefined,created.id,{networks:['__proto__']}));
  const results=[{network:'bsc',status:'success',native:'0.0',symbol:'BNB',assets:[{address:'0x0000000000000000000000000000000000000002',symbol:'USDT',status:'success',balance:'12.345678'},{address:'0x0000000000000000000000000000000000000003',symbol:'USDC',status:'error',error:'timeout'}]}];
  assert.equal(store.update(other,next.id,results,next.queryVersion),true);
  assert.equal(store.get(undefined,next.id).results[0].assets[0].balance,'12.345678');
  assert.equal(store.list(undefined,undefined,'key-positive').records.length,1);
  assert.throws(()=>store.update(undefined,next.id,[{...results[0],assets:[{...results[0].assets[0],balance:'NaN'}]}],next.queryVersion));
});


test('public addresses reuse a global family/address unique key across browsers and networks', t => {
  const path = temp(t);
  let store = openHistory(path);
  const first = store.create(token, { address, source: 'address', networks: ['ethereum'] }, { userAgent: 'First browser' });
  const next = store.create(other, { address: address.toLowerCase(), source: 'address', networks: ['bsc', 'mantle'] }, { userAgent: 'Second browser' });
  assert.equal(first.id, next.id);
  assert.notEqual(first.queryVersion, next.queryVersion);
  assert.equal(store.update(undefined, first.id, [{ network: 'ethereum', status: 'success', native: '9' }], first.queryVersion), false);
  assert.equal(store.update(undefined, next.id, ['bsc', 'mantle'].map(network => ({ network, status: 'success', native: '1' })), next.queryVersion), true);
  assert.equal(store.list().records.length, 1);
  assert.equal(store.get(undefined, next.id).createdBrowser.userAgent, 'First browser');
  assert.equal(store.get(undefined, next.id).lastBrowser.userAgent, 'Second browser');
  const privateRecord = store.create(token, input);
  assert.notEqual(privateRecord.id, next.id);
  assert.equal(store.privateKey(undefined, privateRecord.id), privateKey);
  store.close();
  store = openHistory(path);
  try {
    assert.equal(store.create(undefined, { address, source: 'address', networks: ['xlayer'] }).id, next.id);
    assert.equal(store.list().records.length, 2);
    const db = new DatabaseSync(join(path, 'history.sqlite'));
    try { assert.throws(() => db.exec(`INSERT INTO history (id,owner,created_at,address,source,networks,results,address_fingerprint) SELECT id || 'x',owner,created_at,address,source,networks,results,address_fingerprint FROM history WHERE secret IS NULL LIMIT 1`), /UNIQUE/); } finally { db.close(); }
  } finally { store.close(); }
});

test('legacy address duplicates migrate to latest row with backup and preserve keyed records', t => {
  const path = temp(t);
  let store = openHistory(path);
  const original = store.create(token, { address, source: 'address', networks: ['ethereum'] }, { userAgent: 'Original browser' });
  const keyed = store.create(token, input);
  store.close();
  unlinkSync(join(path, 'history-before-address-dedup.sqlite'));
  const db = new DatabaseSync(join(path, 'history.sqlite'));
  db.exec('DROP INDEX history_public_address; PRAGMA user_version=2');
  db.prepare('INSERT INTO history (id,owner,created_at,address,source,networks,results,query_version,last_browser) VALUES (?,?,?,?,?,?,?,?,?)').run('latest-address-row', 'shared', new Date().toISOString(), address.toLowerCase(), 'address', '["mantle"]', '[{"network":"mantle","status":"success","native":"7"}]', 'latest-version', '{"userAgent":"Latest browser"}');
  db.close();
  store = openHistory(path);
  try {
    assert.equal(store.list().records.length, 2);
    const latest = store.get(undefined, 'latest-address-row');
    assert.equal(latest.results[0].native, '7');
    assert.equal(latest.createdBrowser.userAgent, 'Original browser');
    assert.equal(latest.lastBrowser.userAgent, 'Latest browser');
    assert.equal(store.get(undefined, original.id), undefined);
    assert.equal(store.privateKey(undefined, keyed.id), privateKey);
    assert.equal(store.create(undefined, { address, source: 'address', networks: ['base'] }).id, latest.id);
    const backup = new DatabaseSync(join(path, 'history-before-address-dedup.sqlite'));
    try { assert.equal(backup.prepare('SELECT count(*) AS count FROM history').get().count, 3); } finally { backup.close(); }
  } finally { store.close(); }
});

test('public Bitcoin Bech32 case variants deduplicate while Solana addresses retain their case', t => {
  const store = openHistory(temp(t));
  t.after(() => store.close());
  const plan = createQueryPlan({ mode: 'mnemonic', phrase: 'abandon '.repeat(11) + 'about', wordCount: 12 });
  const bitcoin = plan.groups.find(group => group.networks[0] === 'bitcoin').address;
  const solana = plan.groups.find(group => group.networks[0] === 'solana').address;
  const first = store.create(token, { address: bitcoin, source: 'address', networks: ['bitcoin'] });
  assert.equal(store.create(other, { address: bitcoin.toUpperCase(), source: 'address', networks: ['bitcoin'] }).id, first.id);
  const sol = store.create(token, { address: solana, source: 'address', networks: ['solana'] });
  assert.equal(store.create(other, { address: solana, source: 'address', networks: ['solana'] }).id, sol.id);
  assert.equal(store.get(undefined, sol.id).address, solana);
  assert.equal(store.list().records.length, 2);
});


test('trigger labels persist, follow latest query and stay independent of wallet source', t => {
 const path = temp(t);
 let store = openHistory(path);
 const manual = store.create(token, input);
 assert.equal(manual.triggerType, 'manual');
 assert.equal(store.get(undefined, manual.id).triggerType, 'manual');
 const automatic = store.create(other, { ...input, triggerType: 'automatic' });
 assert.equal(automatic.id, manual.id);
 assert.equal(store.get(undefined, manual.id).triggerType, 'automatic');
 const next = store.requery(token, manual.id, { triggerType: 'manual' });
 assert.equal(next.triggerType, 'manual');
 assert.equal(store.privateKey(token, next.id), privateKey);
 assert.throws(() => store.create(token, { ...input, triggerType: 'unknown' }), /触发方式/);
 assert.throws(() => store.requery(token, manual.id, { triggerType: 'invalid' }), /触发方式/);
 store.requery(token, next.id, { triggerType: 'automatic' });
 store.close();
 store = openHistory(path);
 try { assert.equal(store.list().records[0].triggerType, 'automatic'); } finally { store.close(); }
});

test('legacy records keep unknown trigger rather than inventing manual provenance', t => {
 const path = temp(t);
 let store = openHistory(path);
 const saved = store.create(token, input);
 store.close();
 const db = new DatabaseSync(join(path, 'history.sqlite'));
 db.exec('ALTER TABLE history DROP COLUMN trigger_type; PRAGMA user_version=3');
 db.close();
 store = openHistory(path);
 try {
  assert.equal(store.get(undefined, saved.id).triggerType, 'unknown');
  assert.equal(store.privateKey(undefined, saved.id), privateKey);
  assert.equal(store.requery(undefined, saved.id).triggerType, 'manual');
 } finally { store.close(); }
});

test('wallet history groups a mnemonic across all address families before pagination and filtering', t => {
 const store = openHistory(temp(t)); t.after(() => store.close());
 const phrase = 'abandon '.repeat(11) + 'about';
 const plan = createQueryPlan({mode:'mnemonic',phrase,wordCount:12});
 for(const group of plan.groups) store.create(token,{...group,mnemonic:phrase,triggerType:'automatic'},undefined,{unqueried:true});
 let page=store.listWallets();
 assert.equal(page.records.length,1);
 const wallet=page.records[0];
 assert.equal(wallet.records.length,4); assert.equal(wallet.networks.length,13);
 assert.equal(wallet.hasMnemonic,true);
 assert.ok(!JSON.stringify(wallet).includes(phrase));
 const sol=wallet.records.find(record=>record.networks[0]==='solana');
 store.update(undefined,sol.id,[{network:'solana',status:'success',native:'1.5',symbol:'SOL'}],sol.queryVersion);
 assert.equal(store.listWallets(undefined,undefined,'key-positive').records.length,1);
 assert.equal(store.listWallets(undefined,undefined,'key-positive').records[0].records.length,4);
 for(let i=1;i<=21;i++)store.create(token,{source:'address',address:'0x'+i.toString(16).padStart(40,'0'),networks:['ethereum']});
 page=store.listWallets();
 assert.equal(page.records.length,20);
 const last=store.listWallets(undefined,page.nextCursor);
 assert.equal(last.records.length,2);
 assert.equal(last.nextCursor,null);
 assert.equal(last.records.find(row=>row.hasMnemonic).records.length,4);
 assert.ok(!page.records.some(row=>last.records.some(other=>other.id===row.id)));
});

test('legacy encrypted mnemonics backfill wallet grouping without changing record IDs or secrets', t => {
 const path=temp(t);let store=openHistory(path);
 const phrase='abandon '.repeat(11)+'about';
 const plan=createQueryPlan({mode:'mnemonic',phrase,wordCount:12});
 const ids=plan.groups.map(group=>store.create(token,{...group,mnemonic:phrase}).id);
 store.close();
 const db=new DatabaseSync(join(path,'history.sqlite'));
 db.exec('DROP INDEX history_wallet_group; DROP INDEX history_private_key; ALTER TABLE history DROP COLUMN wallet_group; PRAGMA user_version=5'); db.close();
 store=openHistory(path);
 try {
  const [wallet]=store.listWallets().records;
  assert.equal(wallet.records.length,4);
  assert.deepEqual(new Set(wallet.records.map(row=>row.id)),new Set(ids));
  assert.equal(store.mnemonic(undefined,ids[0]),phrase);
  assert.ok(store.privateKey(undefined,ids[0]));
 }finally{store.close();}
});

test('grouped wallet summaries retain custom-token balances for filtering', t => {
 const store=openHistory(temp(t));t.after(()=>store.close());
 const phrase='abandon '.repeat(11)+'about';
 const group=createQueryPlan({mode:'mnemonic',selected:'ethereum',phrase,wordCount:12}).groups[0];
 const saved=store.create(token,{...group,mnemonic:phrase,token:'0x0000000000000000000000000000000000000001'});
 store.update(undefined,saved.id,[{network:'ethereum',status:'success',native:'0',tokenBalance:'3.5'}],saved.queryVersion);
 const [wallet]=store.listWallets(undefined,undefined,'positive').records;
 assert.equal(wallet.results[0].assets[0].balance,'3.5');
 assert.equal(wallet.results[0].assets[0].symbol,'自定义代币');
});


test('wallet totals count complete wallets across pages and respect filters', t => {
 const store=openHistory(temp(t));t.after(()=>store.close());
 const phrase='abandon '.repeat(11)+'about';
 const plan=createQueryPlan({mode:'mnemonic',phrase,wordCount:12});
 for(const group of plan.groups) store.create(token,{...group,mnemonic:phrase},undefined,{unqueried:true});
 for(let i=1;i<=21;i++) {
  const row=store.create(token,{source:'address',address:'0x'+i.toString(16).padStart(40,'0'),networks:['ethereum']});
  store.update(undefined,row.id,[{network:'ethereum',status:'success',native:i<=3?'1':'0'}],row.queryVersion);
 }
 const first=store.listWallets();assert.equal(first.totalCount,22);assert.equal(first.totalWalletCount,22);assert.equal(first.records.length,20);
 const second=store.listWallets(undefined,first.nextCursor);assert.equal(second.totalCount,22);assert.equal(second.records.length,2);
 const positive=store.listWallets(undefined,undefined,'positive');assert.equal(positive.totalCount,3);assert.equal(positive.totalWalletCount,22);
 const emptyPage=store.listWallets(undefined,1,'positive');assert.equal(emptyPage.totalCount,3);assert.equal(emptyPage.records.length,0);
 const keys=store.listWallets(undefined,undefined,'private');assert.equal(keys.totalCount,1);assert.equal(keys.records[0].records.length,4);
});

test('one normalized input is one unique history item across chains, clicks and restarts', t => {
 const path = temp(t);
 let store = openHistory(path);
 const phrase = 'abandon '.repeat(11) + 'about';
 const mnemonicPlan = createQueryPlan({ mode: 'mnemonic', phrase });
 const keyPlan = createQueryPlan({ mode: 'private', privateKey });
 for (let repeat = 0; repeat < 2; repeat++) {
  for (const group of mnemonicPlan.groups) store.create(undefined, { ...group, mnemonic: phrase });
  for (const group of keyPlan.groups) store.create(undefined, group);
  store.create(undefined, { source: 'address', address: address.toLowerCase(), networks: ['ethereum'] });
  store.create(undefined, { source: 'address', address, networks: ['base'] });
 }
 let items = store.listWallets().records;
 assert.equal(items.length, 3);
 assert.equal(items.find(item => item.source === 'mnemonic').records.length, 4);
 assert.equal(items.find(item => item.source === 'private').records.length, 3);
 assert.equal(items.find(item => item.source === 'address').records.length, 1);
 const ids = items.map(item => item.id).sort();
 store.close();
 store = openHistory(path);
 try { assert.deepEqual(store.listWallets().records.map(item => item.id).sort(), ids); }
 finally { store.close(); }
});

test('a mnemonic and its derived private key have separate input identities', t => {
 const store = openHistory(temp(t)); t.after(() => store.close());
 const phrase = 'abandon '.repeat(11) + 'about';
 const group = createQueryPlan({ mode: 'mnemonic', phrase, selected: 'ethereum' }).groups[0];
 const mnemonicRecord = store.create(undefined, { ...group, mnemonic: phrase });
 const keyRecord = store.create(undefined, { ...group, source: 'private' });
 assert.notEqual(mnemonicRecord.id, keyRecord.id);
 assert.equal(store.listWallets().records.length, 2);
 assert.equal(store.create(undefined, { ...group, mnemonic: phrase }).id, mnemonicRecord.id);
 assert.equal(store.create(undefined, { ...group, source: 'private' }).id, keyRecord.id);
});

test('retired networks are excluded from new plans, rechecks, displayed assets and balance summaries', t => {
 const store = openHistory(temp(t)); t.after(() => store.close());
 for (const selected of ['polygon', 'avalanche']) {
  assert.throws(() => createQueryPlan({ mode: 'address', selected, address }));
  assert.throws(() => store.create(undefined, { source: 'address', address, networks: [selected] }));
 }
 const plan = createQueryPlan({ mode: 'address', address });
 assert.ok(plan.names.every(name => !['polygon', 'avalanche'].includes(name)));
 const saved = store.create(undefined, { ...input });
 assert.throws(() => store.requery(undefined, saved.id, { networks: ['polygon'] }));
 const retiredResults = ['polygon', 'avalanche'].map(network => ({ network, status: 'success', native: '100', symbol: CHAINS[network].symbol }));
 assert.deepEqual(groupAssets(retiredResults), []);
 assert.equal(summarizeHistoryBalance({ results: retiredResults }).state, 'unknown');
});

test('query reservations never create history; only successful zero/positive results commit atomically', t => {
 const path = temp(t), store = openHistory(path); t.after(() => store.close());
 const prepared = store.reserveQuery(input);
 assert.equal(store.listWallets().records.length, 0);
 const failures = input.networks.map(network => ({ network, status: 'error' }));
 assert.deepEqual(store.create(undefined, input, undefined, { completedResults: failures, queryTicket: prepared.queryTicket }), { saved: false });
 assert.equal(store.list().records.length, 0);
 const results = [{ network: 'ethereum', status: 'success', native: '0.0', symbol: 'ETH', assets: [
  { address: 'known', symbol: 'USDC', status: 'success', balance: '0' },
  { address: 'failed', symbol: 'USDT', status: 'error' },
 ] }, failures[1]];
 const saved = store.create(undefined, input, undefined, { completedResults: results, queryTicket: prepared.queryTicket });
 const record = store.get(undefined, saved.id);
 assert.equal(saved.saved, true);
 assert.deepEqual(record.networks, ['ethereum']);
 assert.equal(record.results.length, 1);
 assert.equal(record.results[0].assets.length, 1);
 assert.equal(record.results[0].assets[0].balance, '0');
 assert.equal(store.listWallets().records.length, 1);
 const db = new DatabaseSync(join(path, 'history.sqlite'), { readOnly: true });
 const reservation = JSON.stringify(db.prepare('SELECT * FROM query_reservations').all());
 assert.ok(!reservation.includes(privateKey)); assert.ok(!reservation.includes(address));
 db.close();
});

test('newer query reservations supersede stale completions without damaging the previous successful record', t => {
 const store = openHistory(temp(t)); t.after(() => store.close());
 const results = input.networks.map(network => ({ network, status: 'success', native: '1', symbol: 'ETH' }));
 const first = store.reserveQuery(input);
 const saved = store.create(undefined, input, undefined, { completedResults: results, queryTicket: first.queryTicket });
 const before = store.get(undefined, saved.id);
 const older = store.reserveQuery(input), latest = store.reserveQuery(input);
 assert.throws(() => store.create(undefined, input, undefined, { completedResults: results, queryTicket: older.queryTicket }));
 assert.deepEqual(store.get(undefined, saved.id), before);
 const none = store.create(undefined, input, undefined, { completedResults: results.map(row => ({ network: row.network, status: 'error' })), queryTicket: latest.queryTicket });
 assert.equal(none.saved, false);
 assert.deepEqual(store.get(undefined, saved.id), before);
});

test('preparing and failing a requery preserves old balances, timestamps, metadata and encrypted secrets', t => {
 const store = openHistory(temp(t)); t.after(() => store.close());
 const original = store.create(undefined, input);
 const results = input.networks.map(network => ({ network, status: 'success', native: '7', symbol: 'ETH' }));
 store.update(undefined, original.id, results, original.queryVersion);
 const before = store.get(undefined, original.id);
 const prepared = store.prepareRequery(undefined, original.id, { networks: ['bsc'], triggerType: 'automatic' });
 const unchanged = store.get(undefined, original.id);
 assert.deepEqual(unchanged.results, before.results);
 assert.deepEqual(unchanged.networks, before.networks);
 assert.equal(unchanged.createdAt, before.createdAt);
 assert.equal(unchanged.cursor, before.cursor);
 assert.equal(unchanged.triggerType, before.triggerType);
 const failed = store.commitRequery(undefined, original.id, [{ network: 'bsc', status: 'error' }], prepared.queryVersion);
 assert.equal(failed.saved, false);
 assert.deepEqual(store.get(undefined, original.id), unchanged);
 assert.equal(store.privateKey(undefined, original.id), privateKey);
 const old = store.prepareRequery(undefined, original.id), latest = store.prepareRequery(undefined, original.id);
 assert.equal(store.commitRequery(undefined, original.id, results, old.queryVersion), null);
 const committed = store.commitRequery(undefined, original.id, results, latest.queryVersion);
 assert.equal(committed.saved, true);
 assert.equal(store.listWallets().records.length, 1);
});

test('HTTP preparation is metadata only, completion is required, and failed requery leaves balances intact', async t => {
 const store = openHistory(temp(t)); t.after(() => store.close());
 const server = createServer((req, res) => handleHistory(req, res, store));
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 t.after(() => { server.closeAllConnections(); server.close(); });
 const base = `http://127.0.0.1:${server.address().port}`;
 const headers = { 'content-type': 'application/json', origin: base };
 const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
 assert.equal((await post('/api/history', input)).status, 400);
 const reservation = await (await post('/api/history/prepare', input)).json();
 assert.equal(store.list().records.length, 0);
 const results = input.networks.map(network => ({ network, status: 'success', native: '0', symbol: 'ETH' }));
 const saved = await (await post('/api/history', { ...input, ...reservation, results })).json();
 const before = store.get(undefined, saved.id);
 const prepared = await (await post(`/api/history/${saved.id}/requery`, {})).json();
 assert.deepEqual(store.get(undefined, saved.id).results, before.results);
 const response = await fetch(base + `/api/history/${saved.id}`, { method: 'PATCH', headers,
  body: JSON.stringify({ queryVersion: prepared.queryVersion, results: input.networks.map(network => ({ network, status: 'error' })) }) });
 assert.equal(response.status, 200);
 assert.equal((await response.json()).saved, false);
 assert.deepEqual(store.get(undefined, saved.id).results, before.results);
 assert.equal(store.listWallets().records.length, 1);
});

test('manual preparation prevents background compensation from claiming the same unfinished record', t => {
 const store = openHistory(temp(t)); t.after(() => store.close());
 const legacy = store.create(undefined, input, undefined, { unqueried: true });
 store.reserveQuery(input);
 assert.equal(store.claimBalance(), null);
 const prepared = store.prepareRequery(undefined, legacy.id);
 assert.equal(store.claimBalance(), null);
 store.commitRequery(undefined, legacy.id, input.networks.map(network => ({ network, status: 'success', native: '0', symbol: 'ETH' })), prepared.queryVersion);
 assert.equal(store.balanceQueueStatus().remainingRecords, 0);
});
