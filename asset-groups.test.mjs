import test from "node:test";
import assert from "node:assert/strict";
import {
  groupAssets,
  sumAmounts,
  assetGroupSummary,
  assetGroupStatus,
} from "./asset-groups.mjs";
import { COMMON_TOKENS } from "./common-tokens.mjs";
const asset = (network, symbol, balance, extra = {}) => ({
  ...COMMON_TOKENS[network].find((token) => token.symbol === symbol),
  balance,
  status: "success",
  ...extra,
});
const row = (network, native, assets = []) => ({
  network,
  native,
  status: "success",
  assets,
});

test("stablecoins lead token groups and aggregate exact amounts across chains", () => {
  const groups = groupAssets([
    row("ethereum", "1", [
      asset("ethereum", "USDC", "0.000001"),
      asset("ethereum", "USDT", "9007199254740993.000001"),
    ]),
    row("solana", "2", [asset("solana", "USDT", "0.000009")]),
  ]);
  assert.deepEqual(
    groups.slice(0, 2).map((group) => group.id),
    ["USDT", "USDC"],
  );
  assert.equal(groups[0].networks, 2);
  assert.equal(assetGroupSummary(groups[0]), "9007199254740993.00001 USDT");
  assert.equal(
    sumAmounts(["0.000000000000000001", "2.0"]),
    "2.000000000000000001",
  );
  assert.equal(sumAmounts(["10.0", "0.0"]), "10");
});

test("BTC queries only native Bitcoin and omits legacy wrapped Bitcoin results", () => {
  const groups = groupAssets([
    row("bitcoin", "1"),
    row("ethereum", "0", [
      { symbol: "WBTC", address: "old", balance: "2", status: "success" },
    ]),
  ]);
  assert.equal(
    groups.find((group) => group.id === "BTC").totals[0].balance,
    "1",
  );
  assert.ok(
    !groups.some((group) =>
      group.entries.some((entry) => entry.symbol === "WBTC"),
    ),
  );
});

test("stablecoin bridge variants remain separate; failed and partial reads are omitted", () => {
  const groups = groupAssets([
    row("ethereum", "0", [asset("ethereum", "USDC", "1")]),
    row("bsc", "0", [asset("bsc", "USDC (Binance-Peg)", "2")]),
    row("solana", "0", [
      asset("solana", "USDC", undefined, { status: "error" }),
      asset("solana", "USDT", "3", { scope: "associated" }),
    ]),
  ]);
  const usdc = groups.find((group) => group.id === "USDC");
  assert.equal(usdc.incomplete, false);
  assert.equal(assetGroupSummary(usdc), "1 USDC / 2 USDC (Binance-Peg)");
  assert.equal(groups.find((group) => group.id === "USDT"), undefined);
  assert.deepEqual(groupAssets([{ network: "ethereum", status: "pending" }]), []);
});

test("unknown contracts cannot impersonate an allowlisted stablecoin group", () => {
  const groups = groupAssets([
    row("ethereum", "0", [
      { symbol: "USDT", address: "0x1234", status: "success", balance: "999" },
      asset("ethereum", "USDT", "1"),
    ]),
  ]);
  assert.equal(
    groups.find((group) => group.id === "USDT").totals[0].balance,
    "1",
  );
  assert.ok(groups.some((group) => group.id === "ethereum:0x1234"));
});

test("EVM allowlist matching ignores contract letter case", () => {
  const known = asset("ethereum", "USDT", "2");
  const groups = groupAssets([
    row("ethereum", "0", [{ ...known, address: known.address.toLowerCase() }]),
  ]);
  assert.equal(
    groups.find((group) => group.id === "USDT").totals[0].balance,
    "2",
  );
});

test("failed and partial token reads are omitted; complete zero balances remain visible", () => {
  const failed = groupAssets([
    { network: "ethereum", status: "error", error: "节点超时" },
  ]);
  assert.deepEqual(failed, []);
  const partial = groupAssets([
    row("solana", "0", [asset("solana", "USDT", "0", { scope: "associated" })]),
  ]);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].id, "SOL");
  assert.ok(!partial.some(group => group.id === "USDT"));
  const zero = groupAssets([
    row("solana", "0", [
      asset("solana", "USDC", "0"),
      asset("solana", "USDG", "0"),
    ]),
  ]);
  assert.deepEqual(
    zero.slice(0, 2).map((group) => group.id),
    ["USDC", "USDG"],
  );
  assert.equal(assetGroupSummary(zero[0]), "0");
});

test('retired WSOL never contributes to SOL balances, including legacy mint results with another label', () => {
  const groups = groupAssets([row('solana', '2', [
    { symbol: 'WSOL', address: 'So11111111111111111111111111111111111111112', balance: '9', status: 'success' },
    { symbol: 'Wrapped SOL', address: 'So11111111111111111111111111111111111111112', balance: '8', status: 'success' },
  ])]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'SOL');
  assert.equal(groups[0].entries.length, 1);
  assert.equal(assetGroupSummary(groups[0]), '2 SOL');
  assert.ok(!COMMON_TOKENS.solana.some(token => token.symbol === 'WSOL'));
});
