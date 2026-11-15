import type { QueryInput, QueryPlan, DerivedWallet, QueryGroup, Source } from "./types.ts";
import {
  CHAINS,
  CHAIN_ORDER,
  PREFERRED_CHAINS,
  validateAddress,
  walletFromPrivateKey,
} from "./wallet.ts";
import { walletFromMnemonic, DERIVATION_PATH } from "./mnemonic.ts";
import { nonEvmWalletFromMnemonic } from "./non-evm.ts";

export function createQueryPlan({
  mode,
  selected = "all",
  phrase,
  wordCount,
  privateKey,
  address,
}: QueryInput): QueryPlan {
  const multiple = selected === "all" || selected === "common";
  if (
    !["mnemonic", "private", "address"].includes(mode) ||
    (!multiple && !CHAIN_ORDER.includes(selected))
  )
    throw new Error("钱包来源或网络无效。");
  const scope = selected === "common" ? PREFERRED_CHAINS : CHAIN_ORDER;
  let names = multiple ? Object.keys(CHAINS).filter((name) => scope.includes(name)) : [selected];
  const wallets: QueryPlan["wallets"] = {};
  const cache = new Map<string, DerivedWallet>();
  for (const name of names) {
    const chain = CHAINS[name];
    const family = chain.family ?? "evm";
    try {
      if (!cache.has(family)) {
        let wallet: DerivedWallet;
        if (mode === "mnemonic")
          wallet = chain.family
            ? nonEvmWalletFromMnemonic(family, phrase!, wordCount)
            : { ...walletFromMnemonic(phrase!, wordCount), path: DERIVATION_PATH };
        if (mode === "private") wallet = walletFromPrivateKey(chain, privateKey!);
        if (mode === "address")
          wallet = { address: validateAddress(chain, address!), privateKey: null };
        cache.set(family, wallet!);
      }
      wallets[name] = cache.get(family)!;
    } catch (error) {
      if (!multiple || mode === "mnemonic") throw error;
    }
  }
  names = CHAIN_ORDER.filter((name) => wallets[name]);
  if (!names.length)
    throw new Error("输入与支持的网络不匹配，请检查地址/私钥格式，或选择具体网络。");
  const groups: QueryGroup[] = [];
  for (const [family, wallet] of cache) {
    groups.push({
      ...wallet,
      source: mode as Source,
      networks: names.filter((name) => (CHAINS[name].family ?? "evm") === family),
    });
  }
  return { names, wallets, groups };
}
