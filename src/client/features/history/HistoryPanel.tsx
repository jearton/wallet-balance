import type { WalletHistoryRecord } from "../../../shared/types.ts";
import { errorMessage } from "../../../shared/types.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { History, RefreshCw, Search } from "lucide-react";
import { summarizeWalletRecords } from "../../../shared/wallet-history.ts";
import { api } from "../../lib/history-client.ts";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../../components/ui/select";
import { Hint, Status, busyIcon } from "../../components/common.tsx";
import { WalletHistory } from "./WalletHistory.tsx";
import { GenerationStatus } from "../generation/GenerationStatus.tsx";
const FILTERS = {
  all: "全部记录",
  "key-positive": "有私钥且有余额",
  private: "有私钥",
  positive: "有余额",
  zero: "已查余额为 0",
  unknown: "暂无成功结果",
};
export function HistoryPanel({ refreshKey }: { refreshKey: number }) {
  const [filter, setFilter] = useState("all"),
    [records, setRecords] = useState<WalletHistoryRecord[]>([]),
    [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [counts, setCounts] = useState<{ total: number; all: number } | null>(null);
  const generation = useRef(0);
  const load = useCallback(
    async (append: boolean, version: number, before: number | null = null) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ filter, groupBy: "wallet" });
        if (append && before) params.set("before", String(before));
        const data = await api<{
          records: WalletHistoryRecord[];
          totalCount: number;
          totalWalletCount: number;
          nextCursor: number | null;
        }>("/api/history?" + params);
        if (version !== generation.current) return;
        setRecords((current) => (append ? [...current, ...data.records] : data.records));
        setCursor(data.nextCursor);
        setCounts({ total: data.totalCount, all: data.totalWalletCount });
      } catch (error) {
        if (version === generation.current) setError(errorMessage(error));
      } finally {
        if (version === generation.current) setLoading(false);
      }
    },
    [filter],
  );
  useEffect(() => {
    const version = ++generation.current;
    setRecords([]);
    setCursor(null);
    setCounts(null);
    load(false, version);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate all in-flight requests when this effect is replaced.
      generation.current++;
    };
  }, [load, refresh, refreshKey]);
  return (
    <Card id="history-section" className="mt-4 scroll-mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker text-violet-600">03 / 本地 SQLite</p>
            <CardTitle className="mt-1 flex items-center gap-2">
              <History className="size-5 text-violet-600" />
              查询历史
            </CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              setNotice("");
              setRefresh((value) => value + 1);
            }}
          >
            <RefreshCw />
            刷新记录
          </Button>
        </div>
        <CardDescription className="pt-1 text-xs">
          一组助记词、一个私钥或一个公开地址各对应一条记录，重复查询更新原记录。余额按代币汇总，展开可查看各网络明细。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <GenerationStatus />
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="history-filter" className="text-sm">
            筛选记录
          </label>
          <Select
            value={filter}
            onValueChange={(value) => {
              setNotice("");
              setFilter(value);
            }}
          >
            <SelectTrigger id="history-filter" className="w-[210px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FILTERS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Hint>有私钥且有余额时高亮；公开测试钱包仅展示橙色标签。</Hint>
        </div>
        <Status error>{error}</Status>
        <Status>{notice}</Status>
        <Status>
          {counts
            ? `已加载 ${records.length} / 共 ${counts.total} 条记录${filter !== "all" ? `（全部 ${counts.all} 条）` : ""}${loading ? " · 加载中…" : ""}`
            : loading
              ? "正在读取历史记录…"
              : ""}
        </Status>
        <div className="space-y-2">
          {records.map((record) => (
            <WalletHistory
              key={record.id}
              wallet={record}
              onUpdated={(updated, message) => {
                setNotice(message);
                setRecords((current) =>
                  current.map((item) =>
                    item.records.some((child) => child.id === updated.id)
                      ? summarizeWalletRecords(
                          item.records.map((child) => (child.id === updated.id ? updated : child)),
                          item.id,
                        )
                      : item,
                  ),
                );
              }}
            />
          ))}
        </div>
        {!loading && !error && records.length === 0 && (
          <div className="empty-history">
            <Search className="mx-auto mb-2 size-6 text-violet-400" />
            <Hint>
              {filter === "all" ? "暂无记录，查询余额后会自动保存。" : "没有符合筛选条件的记录。"}
            </Hint>
          </div>
        )}
        {cursor && (
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => load(true, generation.current, cursor)}
          >
            {loading ? busyIcon : null}加载更多
          </Button>
        )}
        <Hint>历史保存在本地服务端，换浏览器或内网设备也可查看。加载更多会保留已加载记录。</Hint>
      </CardContent>
    </Card>
  );
}
