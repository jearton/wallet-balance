import type { HistoryRecord, WalletHistoryRecord } from "./types.ts";
import { CHAIN_ORDER } from "./wallet.ts";

// Summary groups contain only public record metadata; mnemonic text never leaves storage.
export function summarizeWalletRecords(
  records: HistoryRecord[],
  walletId = records[0]?.walletId,
): WalletHistoryRecord {
  const latest = [...records].sort((a, b) => b.cursor - a.cursor)[0];
  const networks = new Set(records.flatMap((record) => record.networks));
  return {
    id: walletId ?? latest.id,
    cursor: latest.cursor,
    createdAt: latest.createdAt,
    triggerType: latest.triggerType,
    source: records.some((record) => record.hasMnemonic)
      ? "mnemonic"
      : records.some((record) => record.hasPrivateKey)
        ? "private"
        : "address",
    hasPrivateKey: records.some((record) => record.hasPrivateKey),
    hasMnemonic: records.some((record) => record.hasMnemonic),
    publicTestWallet: records.some((record) => record.publicTestWallet),
    networks: CHAIN_ORDER.filter((network) => networks.has(network)),
    results: records.flatMap((record) =>
      record.results.map((row) =>
        record.token && (row.tokenBalance !== undefined || row.tokenError)
          ? {
              ...row,
              assets: [
                ...(row.assets ?? []),
                {
                  address: record.token,
                  symbol: "自定义代币",
                  status: row.tokenError ? "error" : "success",
                  ...(row.tokenError ? { error: row.tokenError } : { balance: row.tokenBalance }),
                },
              ],
            }
          : row,
      ),
    ),
    records,
  };
}
