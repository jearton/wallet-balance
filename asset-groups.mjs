import { CHAINS } from "./wallet.mjs";
import { COMMON_TOKENS, isRetiredAsset } from "./common-tokens.mjs";

const validAmount = (value) =>
  typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value);
export const positiveAmount = (value) =>
  validAmount(value) && /[1-9]/.test(value);

// Decimal strings stay exact, including balances smaller than Number precision.
export function sumAmounts(values) {
  const scale = Math.max(
    0,
    ...values.map((value) => (value.split(".")[1] ?? "").length),
  );
  const sum = values
    .reduce((total, value) => {
      const [whole, fraction = ""] = value.split(".");
      return total + BigInt(whole + fraction.padEnd(scale, "0"));
    }, 0n)
    .toString()
    .padStart(scale + 1, "0");
  return scale
    ? `${sum.slice(0, -scale)}.${sum.slice(-scale)}`.replace(/\.?0+$/, "")
    : sum;
}

function identity(symbol) {
  if (/^USDT(?:$|[ .(0])/.test(symbol))
    return { id: "USDT", label: "USDT", rank: 0 };
  if (/^USDC(?:$|[ .(])/.test(symbol))
    return { id: "USDC", label: "USDC", rank: 1 };
  if (symbol === "USDG") return { id: "USDG", label: "USDG", rank: 2 };
  const base = symbol.replace(/^W(?=SOL$|ETH$|BNB$)/, "").split(" ")[0];
  const order = ["SOL", "ETH", "BNB", "TRX", "MNT", "OKB", "BTC"];
  return {
    id: base,
    label: base,
    rank: 3 + (order.includes(base) ? order.indexOf(base) : order.length),
  };
}

export function groupAssets(rows, { token } = {}) {
  const groups = new Map();
  const add = (
    row,
    symbol,
    balance,
    status,
    contract,
    scope,
    error,
    trusted = true,
  ) => {
    if (status !== "success" || !validAmount(balance)) return;
    if (/^(WBTC|BTCB)(?:$| )/.test(symbol)) return;
    const category = trusted
      ? identity(symbol)
      : { id: `${row.network}:${contract}`, label: symbol, rank: 99 };
    let group = groups.get(category.id);
    if (!group) groups.set(category.id, (group = { ...category, entries: [] }));
    group.entries.push({
      network: row.network,
      symbol,
      balance,
      status:
        status === "success" && validAmount(balance)
          ? "success"
          : status === "pending"
            ? "pending"
            : "error",
      contract,
      scope,
      error,
      row,
    });
  };
  for (const row of rows) {
    const chain = CHAINS[row.network];
    if (chain?.disabled) continue;
    add(
      row,
      chain?.symbol ?? row.symbol ?? row.network,
      row.native,
      row.status,
      null,
      null,
      row.error,
    );
    const assets =
      row.assets ??
      (COMMON_TOKENS[row.network] ?? []).map((known) => ({
        ...known,
        status: row.status === "pending" ? "pending" : "error",
        error:
          row.status === "success"
            ? "此旧记录未查询常见代币，请重新查询"
            : row.error,
      }));
    for (const asset of assets) {
      if (isRetiredAsset(asset) || asset.scope === "associated") continue;
      const match = COMMON_TOKENS[row.network]?.find((known) =>
        !chain?.family
          ? known.address.toLowerCase() === asset.address.toLowerCase()
          : known.address === asset.address,
      );
      add(
        row,
        match?.symbol ?? asset.symbol,
        asset.balance,
        asset.status,
        asset.address,
        asset.scope,
        asset.reason === "authority-mismatch"
          ? "关联账户权限已变更"
          : asset.error,
        Boolean(match),
      );
    }
    if (token && (row.tokenBalance !== undefined || row.tokenError))
      add(
        row,
        "自定义代币",
        row.tokenBalance,
        row.tokenError ? "error" : "success",
        token,
        null,
        row.tokenError,
        false,
      );
  }
  return [...groups.values()]
    .map((group) => {
      const variants = new Map();
      for (const entry of group.entries) {
        if (!variants.has(entry.symbol)) variants.set(entry.symbol, []);
        if (entry.status === "success")
          variants.get(entry.symbol).push(entry.balance);
      }
      return {
        ...group,
        totals: [...variants].map(([symbol, values]) => ({
          symbol,
          balance: values.length ? sumAmounts(values) : null,
        })),
        positive: group.entries.some(
          (entry) =>
            entry.status === "success" && positiveAmount(entry.balance),
        ),
        incomplete: group.entries.some(
          (entry) => entry.status !== "success" || entry.scope === "associated",
        ),
        networks: new Set(group.entries.map((entry) => entry.network)).size,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
}

export function assetGroupStatus(group) {
  const labels = [];
  const pending = group.entries.filter(
    (entry) => entry.status === "pending",
  ).length;
  const failed = group.entries.filter(
    (entry) => entry.status === "error",
  ).length;
  if (pending) labels.push(`${pending} 项查询中`);
  if (failed) labels.push(`${failed} 项查询失败`);
  return labels.join(" · ");
}

export function assetGroupSummary(group) {
  const positive = group.totals
    .filter((total) => positiveAmount(total.balance))
    .map((total) => `${total.balance} ${total.symbol}`)
    .join(" / ");
  if (positive) return positive;
  if (group.entries.some((entry) => entry.status === "success"))
    return "0";
  return group.entries.some((entry) => entry.status === "pending")
    ? "正在查询…"
    : "查询失败";
}
