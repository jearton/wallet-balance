import { groupAssets, assetGroupSummary, assetGroupStatus } from "../../../shared/asset-groups.mjs";
import { CHAINS } from "../../../shared/wallet.mjs";
import { Hint, Status } from "../../components/common.jsx";
function AssetGroup({ group }) {
  return (
    <details className="balance-row">
      <summary className="cursor-pointer list-none space-y-1 rounded-md outline-offset-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">{group.label}</span>
          <span className="text-right font-mono text-emerald-800">
            {assetGroupSummary(group)}
          </span>
        </div>
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {group.networks} 条链
            {assetGroupStatus(group) ? ` · ${assetGroupStatus(group)}` : ""}
          </span>
          <span className="text-violet-700">网络余额与详情</span>
        </div>
      </summary>
      <div className="space-y-2 pt-2">
        {group.entries.map((entry, index) => (
          <div
            key={`${entry.network}:${entry.contract ?? "native"}:${index}`}
            className="rounded-md bg-violet-50/60 p-2 text-xs"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span>
                {CHAINS[entry.network]?.name ?? entry.network} · {entry.symbol}
              </span>
              <span className="text-right font-mono">
                {entry.status === "success"
                  ? entry.balance
                  : entry.status === "pending"
                    ? "正在查询…"
                    : "查询失败"}
              </span>
            </div>
            <details className="mt-1">
              <summary className="w-fit cursor-pointer text-violet-700">
                详情
              </summary>
              <div className="space-y-1 pt-2">
                {entry.row.address && (
                  <Hint className="break-all font-mono">
                    地址 {entry.row.address}
                  </Hint>
                )}
                {entry.contract && (
                  <Hint className="break-all font-mono">
                    合约 / Mint：{entry.contract}
                  </Hint>
                )}
                {entry.row.path && <Hint>路径 {entry.row.path}</Hint>}
                {entry.row.block && (
                  <Hint>
                    {CHAINS[entry.network]?.family === "solana"
                      ? "Slot"
                      : "区块"}{" "}
                    {entry.row.block}
                  </Hint>
                )}
                {entry.row.note && <Hint>{entry.row.note}</Hint>}
                {entry.error && <Status error>{entry.error}</Status>}
              </div>
            </details>
          </div>
        ))}
      </div>
    </details>
  );
}

export function AssetBalances({ rows, token }) {
  const groups = groupAssets(rows, { token });
  return (
    <div>
      {groups.map((group) => (
        <AssetGroup key={group.id} group={group} />
      ))}
      {!groups.length && (
        <Hint>
          {rows.length && rows.every((row) => row.status === "unqueried")
            ? "钱包已创建，尚未查询余额。"
            : "暂无查询成功的余额，请重试。"}
        </Hint>
      )}
    </div>
  );
}
