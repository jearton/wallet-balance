import { isIP } from 'node:net';

export function isAllowedHost(header, { allowLan = false, extraHosts = [] } = {}) {
  if (typeof header !== 'string' || !/^[a-zA-Z0-9.\-\[\]:]+$/.test(header)) return false;
  let url;
  try { url = new URL(`http://${header}`); } catch { return false; }
  const host = url.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '[::1]', ...extraHosts].includes(host)) return true;
  if (!allowLan || isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
