import type { HistoryRecord, QueryResult } from "./types.ts";
import { CHAINS } from "./wallet.ts";
import { queryAssets } from "./asset-query.ts";

// One result shape for both single-address and whole-input manual rechecks.
export async function readHistoryBalances(
  record: Pick<HistoryRecord, "address" | "networks" | "results"> & { token?: string | null },
  query = queryAssets,
) {
  const results: QueryResult[] = [];
  for (let offset = 0; offset < record.networks.length; offset += 3) {
    results.push(
      ...(await Promise.all(
        record.networks.slice(offset, offset + 3).map(async (network): Promise<QueryResult> => {
          const path = record.results.find((row) => row.network === network)?.path;
          const base = { network, ...(path ? { path } : {}) };
          try {
            const value = await query({
              chain: CHAINS[network],
              address: record.address,
              token: record.token ?? undefined,
            });
            return {
              ...base,
              status: "success",
              native: value.native,
              symbol: value.symbol,
              block: value.block,
              assets: value.assets,
              ...(value.note ? { note: value.note } : {}),
              ...(value.token ? { tokenBalance: value.token.balance } : {}),
              ...(value.tokenError ? { tokenError: value.tokenError } : {}),
            };
          } catch {
            return { ...base, status: "error", error: "余额查询失败或节点限流，请重试。" };
          }
        }),
      )),
    );
  }
  return results;
}
