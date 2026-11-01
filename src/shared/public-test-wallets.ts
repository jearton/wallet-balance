import type { QueryGroup } from "./types.ts";
import { Mnemonic } from "ethers";
import { createQueryPlan } from "./query-plan.ts";
import { CHAINS } from "./wallet.ts";
import { PUBLIC_COMMUNITY_WALLETS } from "./public-community-wallets.ts";

// Explicit published examples, with no passphrase and the app's default paths.
// This is a known-example list, not a safety verdict.
// https://github.com/trezor/python-mnemonic/blob/master/vectors.json
let knownAddresses: Set<string | null> | undefined;
function addressKey(networks: string[], address: string) {
  const chain = CHAINS[networks?.[0]];
  if (!chain || typeof address !== "string") return null;
  return `${chain.family ?? "evm"}:${chain.family ? address : address.toLowerCase()}`;
}
export function isPublicTestWallet(record: Pick<QueryGroup, "networks" | "address">) {
  if (!knownAddresses) {
    knownAddresses = new Set();
    for (const bytes of [16, 32]) {
      for (const byte of ["00", "7f", "80", "ff"]) {
        const phrase = Mnemonic.fromEntropy("0x" + byte.repeat(bytes)).phrase;
        const plan = createQueryPlan({ mode: "mnemonic", phrase });
        for (const group of plan.groups)
          knownAddresses.add(addressKey(group.networks, group.address));
      }
    }
    // https://www.getfoundry.sh/anvil/index.html
    // https://github.com/circlefin/arc-node/blob/main/ACCOUNTS.md
    // https://solana.com/developers/cookbook/wallets/restore-keypair
    for (const input of [
      ...PUBLIC_COMMUNITY_WALLETS.map((sample) => sample.input),
      { mode: "mnemonic", phrase: "test ".repeat(11) + "junk" },
      {
        mode: "private",
        privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      },
      {
        mode: "private",
        privateKey:
          "5MaiiCavjCmn9Hs1o3eznqDEhRwxo7pXiAYez7keQUviUkauRiTMD8DrESdrNjN8zd9mTmVhRvBJeg5vhyvgrAhG",
      },
      {
        mode: "address",
        selected: "ethereum",
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      },
    ]) {
      for (const group of createQueryPlan(input).groups)
        knownAddresses.add(addressKey(group.networks, group.address));
    }
  }
  return knownAddresses.has(addressKey(record.networks, record.address));
}
