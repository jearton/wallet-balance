import { queryAssets } from '../shared/asset-query.mjs';
import { CHAINS } from '../shared/wallet.mjs';

export async function completeBalance(history, record, query = queryAssets) {
  const results = record.results.map(row => ({ ...row }));
  const pending = results.filter(row => row.status === 'pending' && !CHAINS[row.network]?.disabled);
  // Limit node pressure and commit only successful reads. Version checks protect manual queries.
  for (let offset = 0; offset < pending.length; offset += 3) {
    await Promise.all(pending.slice(offset, offset + 3).map(async row => {
      try {
        const value = await query({ chain: CHAINS[row.network], address: record.address, token: record.token ?? undefined });
        Object.assign(row, {
          status: 'success', native: value.native, symbol: value.symbol,
          block: value.block, assets: value.assets ?? [],
          ...(value.note ? { note: value.note } : {}),
          ...(value.token ? { tokenBalance: value.token.balance } : {}),
          ...(value.tokenError ? { tokenError: value.tokenError } : {}),
        });
      } catch {
        Object.assign(row, { status: 'error', error: '自动余额查询失败或节点限流，请重新查询。' });
      }

    }));
    if (history.get(undefined, record.id)?.queryVersion !== record.queryVersion) break;
  }
  if (pending.some(row => row.status === 'success')) history.completeBackfill(record.id, results, record.queryVersion);
}

export function createBalanceAutomation(history, {
  query = queryAssets, concurrency = 4, intervalMs = 1000,
  schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  let stopped = true, timer = null, work = null, activeRecords = 0, lastError = null;
  async function run() {
    timer = null;
    if (stopped) return;
    try {
      const outcomes = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
        const record = history.claimBalance();
        if (!record) return;
        activeRecords++;
        try { await completeBalance(history, record, query); }
        finally { activeRecords--; }
      }));
      if (outcomes.some(outcome => outcome.status === 'rejected')) throw new Error('background query failed');
      lastError = null;
    } catch {
      lastError = '自动查询暂时失败，未完成记录将在稍后补查。';
    } finally {
      if (!stopped) {
        timer = schedule(() => { work = run(); }, intervalMs);
        timer?.unref?.();
      }
    }
  }
  return {
    status: () => ({ ...history.balanceQueueStatus(), activeRecords, lastError }),
    start() {
      if (!stopped) return;
      stopped = false;
      work = run();
    },
    async stop() {
      stopped = true;
      if (timer !== null) cancel(timer);
      timer = null;
      await work;
    },
  };
}
