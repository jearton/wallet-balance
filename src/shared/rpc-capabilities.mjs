import { id } from 'ethers';

const TTL = 24 * 60 * 60 * 1000;
const reasons = new Set(['method-not-found', 'index-disabled', 'no-contract', 'endpoint-unsupported']);
export function capabilityKey(chain, endpoint, method, target = '') {
  const url = new URL(endpoint);
  url.hash = '';
  return id(JSON.stringify(['rpc-capability-v1', chain.id ?? chain.family, url.href.replace(/\/$/, ''), method,
    chain.family ? target : target.toLowerCase()]));
}
export function unsupportedRead() {
  const error = new Error('该节点的此项查询不可用，已跳过。');
  error.retryable = false;
  return error;
}

export class CapabilityRegistry {
  constructor({ now = Date.now } = {}) { this.now = now; this.items = new Map(); this.write = null; }
  restore(entries) {
    for (const entry of Array.isArray(entries) ? entries.slice(-2048) : []) {
      if (/^0x[a-f0-9]{64}$/.test(entry?.key) && reasons.has(entry.reason) &&
        Number.isSafeInteger(entry.expires) && entry.expires > this.now() && entry.expires <= this.now() + TTL)
        this.items.set(entry.key, entry);
    }
  }
  entries() { return [...this.items.values()].filter(entry => entry.expires > this.now()); }
  blocked(key) {
    const entry = this.items.get(key);
    if (!entry || entry.expires <= this.now()) { this.items.delete(key); return false; }
    return true;
  }
  remember(key, reason) {
    if (!reasons.has(reason)) return;
    if (this.items.size >= 2048) this.items.delete(this.items.keys().next().value);
    this.items.set(key, { key, reason, expires: this.now() + TTL });
    try { this.write?.(this.entries()); } catch { /* Storage failure must not break a balance read. */ }
  }
  useStorage({ read, write }) {
    try { this.restore(read()); } catch { /* Browser storage may be disabled. */ }
    this.write = write;
  }
}
export const rpcCapabilities = new CapabilityRegistry();

// Only explicit, address-independent capability errors are remembered.
export function rpcFailure(payload, { registry, chain, endpoint, method, program = '' }) {
  if (payload?.code === -32601) {
    registry.remember(capabilityKey(chain, endpoint, method), 'method-not-found');
    return unsupportedRead();
  }
  if (method === 'getTokenAccountsByOwner' && payload?.code === -32602 &&
      /indexed requests require a personal token/i.test(payload.message ?? '')) {
    registry.remember(capabilityKey(chain, endpoint, method), 'index-disabled');
    return unsupportedRead();
  }
  if (method === 'getTokenAccountsByOwner' && program && payload?.code === -32010 &&
      /excluded from account secondary indexes/i.test(payload.message ?? '')) {
    registry.remember(capabilityKey(chain, endpoint, method, program), 'index-disabled');
    return unsupportedRead();
  }
  const error = new Error('RPC 请求失败，请稍后重试。');
  // A contract revert may depend on the owner address. Never blacklist it alone.
  if (method === 'eth_call' && (payload?.code === 3 || /execution reverted/i.test(payload?.message ?? ''))) {
    error.retryable = false;
    error.probeContract = true;
  }
  return error;
}
