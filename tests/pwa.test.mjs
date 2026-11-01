import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { PWA_ROUTES } from '../src/server/pwa.mjs';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker({ offline = false } = {}) {
  const handlers = new Map(), cached = [], deleted = [];
  const cache = {
    addAll: async paths => cached.push(...paths),
    match: async request => {
      const path = typeof request === 'string' ? request : new URL(request.url).pathname;
      if (path === '/offline.html') return new Response('generic offline page');
      if (path.startsWith('/icons/')) return new Response('public icon');
    },
  };
  const self = {
    location: { origin: 'https://wallet.test' },
    addEventListener: (name, fn) => handlers.set(name, fn),
    skipWaiting: async () => {}, clients: { claim: async () => {} },
  };
  runInNewContext(source, {
    self, URL, Response,
    caches: {
      open: async () => cache,
      keys: async () => ['wallet-lab-offline-v0', 'wallet-lab-offline-v1', 'other-app-cache'],
      delete: async name => deleted.push(name),
    },
    fetch: async () => { if (offline) throw new Error('offline'); return new Response('live page'); },
  });
  return { handlers, cached, deleted };
}

function request(worker, url, { method = 'GET', mode = 'cors' } = {}) {
  let response;
  worker.handlers.get('fetch')({
    request: { url, method, mode },
    respondWith: value => { response = value; },
  });
  return response;
}

test('PWA manifest uses stable identity, standalone display and valid phone icon files', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const [path, type] = PWA_ROUTES.get(icon.src);
    assert.equal(type, 'image/png');
    const bytes = await readFile(new URL("../" + path, import.meta.url));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
  }
});

test('service worker precaches only generic offline assets and removes only its own old caches', async () => {
  const value = worker();
  let finished;
  value.handlers.get('install')({ waitUntil: work => { finished = work; } });
  await finished;
  assert.ok(value.cached.includes('/offline.html'));
  assert.ok(value.cached.every(path => PWA_ROUTES.has(path)));
  assert.ok(!value.cached.includes('/'));
  assert.ok(!value.cached.some(path => path.startsWith('/api/')));
  value.handlers.get('activate')({ waitUntil: work => { finished = work; } });
  await finished;
  assert.deepEqual(value.deleted, ['wallet-lab-offline-v0']);
});

test('APIs, secret submissions, external RPC and live bundles always bypass the service worker', () => {
  const value = worker();
  for (const [url, options] of [
    ['https://wallet.test/api/history', {}],
    ['https://wallet.test/api/history/id/private-key', {}],
    ['https://wallet.test/api/history/id/mnemonic', {}],
    ['https://wallet.test/api/generation', {}],
    ['https://wallet.test/api/history', { method: 'POST' }],
    ['https://wallet.test/api/history/id', { method: 'PATCH' }],
    ['https://rpc.example', { method: 'POST' }],
    ['https://wallet.test/assets/app.js', {}],
    ['https://wallet.test/assets/app.css', {}],
    ['https://wallet.test/api/history', { mode: 'navigate' }],
  ]) assert.equal(request(value, url, options), undefined);
});

test('navigation always reads the live page; offline navigation serves only the generic connection page', async () => {
  const online = await request(worker(), 'https://wallet.test/', { mode: 'navigate' });
  assert.equal(await online.text(), 'live page');
  const offline = await request(worker({ offline: true }), 'https://wallet.test/', { mode: 'navigate' });
  assert.equal(await offline.text(), 'generic offline page');
  const icon = await request(worker({ offline: true }), 'https://wallet.test/icons/icon-192.png');
  assert.equal(await icon.text(), 'public icon');
});
