import type { QueryResult } from "./types.ts";
const amount = (value: unknown) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value);

// Failed and unfinished reads never replace a saved balance or create a history row.
export function successfulResults(results: QueryResult[]): QueryResult[] {
  return results
    .filter((row) => row.status === "success" && amount(row.native))
    .map((row) => {
      const { tokenError, tokenBalance, assets, ...saved } = row;
      return {
        ...saved,
        ...(assets
          ? {
              assets: assets.filter(
                (asset) =>
                  asset.status === "success" &&
                  asset.scope !== "associated" &&
                  amount(asset.balance),
              ),
            }
          : {}),
        ...(!tokenError && amount(tokenBalance) ? { tokenBalance } : {}),
      };
    });
}
