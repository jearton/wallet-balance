import { isRetiredAsset } from "./common-tokens.mjs";
import { CHAINS } from "./wallet.mjs";

function amountState(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))
    return "unknown";
  return /[1-9]/.test(value) ? "positive" : "zero";
}

export function summarizeHistoryBalance(record) {
  const amounts = [];
  const rows = record.results.filter(row => !CHAINS[row.network]?.disabled);
  for (const row of rows) {
    if (row.status !== "success") continue;
    const network = CHAINS[row.network]?.name ?? row.network;
    const add = (value, symbol) => {
      const state = amountState(value);
      if (state === "unknown") return;
      amounts.push({ positive: state === "positive", text: `${network} · ${value} ${symbol}`.trim() });
    };
    add(row.native, row.symbol ?? CHAINS[row.network]?.symbol ?? "");
    for (const asset of row.assets ?? []) {
      if (asset.status === "success" && asset.scope !== "associated" && !isRetiredAsset(asset)) add(asset.balance, asset.symbol);
    }
    if (record.token && !row.tokenError && amountState(row.tokenBalance) !== "unknown") {
      amounts.push({ positive: amountState(row.tokenBalance) === "positive", text: `${network} · 代币 ${row.tokenBalance}` });
    }
  }
  // Describe only successfully read balances; missing results never become zero.
  const state = amounts.some(amount => amount.positive) ? "positive" : amounts.length ? "zero" : "unknown";
  const label = rows.length && rows.every(row => row.status === "unqueried")
    ? "未查询余额" : state === "positive" ? "有余额" : state === "zero" ? "已查余额为 0" : "暂无成功结果";
  return { state, label, amounts: amounts.filter(amount => amount.positive).map(amount => amount.text), notes: [] };
}

export const HISTORY_FILTERS = [
  "all",
  "key-positive",
  "private",
  "positive",
  "zero",
  "unknown",
];
export function matchesHistoryFilter(record, filter = "all") {
  if (!HISTORY_FILTERS.includes(filter)) throw new Error("历史筛选条件无效。");
  if (filter === "all") return true;
  if (filter === "private") return record.hasPrivateKey;
  const state = summarizeHistoryBalance(record).state;
  return filter === "key-positive"
    ? record.hasPrivateKey && state === "positive"
    : state === filter;
}
