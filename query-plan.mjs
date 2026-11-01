import { CHAINS, CHAIN_ORDER, validateAddress, walletFromPrivateKey } from './wallet.mjs';
import { walletFromMnemonic, DERIVATION_PATH } from './mnemonic.mjs';
import { nonEvmWalletFromMnemonic } from './non-evm.mjs';

export function createQueryPlan({ mode, selected = 'all', phrase, wordCount, privateKey, address }) {
  if (!['mnemonic', 'private', 'address'].includes(mode) || (selected !== 'all' && !CHAIN_ORDER.includes(selected))) throw new Error('钱包来源或网络无效。');
  let names = selected === 'all' ? Object.keys(CHAINS).filter(name => CHAIN_ORDER.includes(name)) : [selected];
  const wallets = {};
  const cache = new Map();
  for (const name of names) {
    const chain = CHAINS[name];
    const family = chain.family ?? 'evm';
    try {
      if (!cache.has(family)) {
        let wallet;
        if (mode === 'mnemonic') wallet = chain.family ? nonEvmWalletFromMnemonic(family, phrase, wordCount) : { ...walletFromMnemonic(phrase, wordCount), path: DERIVATION_PATH };
        if (mode === 'private') wallet = walletFromPrivateKey(chain, privateKey);
        if (mode === 'address') wallet = { address: validateAddress(chain, address), privateKey: null };
        cache.set(family, wallet);
      }
      wallets[name] = cache.get(family);
    } catch (error) {
      if (selected !== 'all' || mode === 'mnemonic') throw error;
    }
  }
  names = CHAIN_ORDER.filter(name => wallets[name]);
  if (!names.length) throw new Error('输入与支持的网络不匹配，请检查地址/私钥格式，或选择具体网络。');
  const groups = [];
  for (const [family, wallet] of cache) {
    groups.push({ ...wallet, source: mode, networks: names.filter(name => (CHAINS[name].family ?? 'evm') === family) });
  }
  return { names, wallets, groups };
}
