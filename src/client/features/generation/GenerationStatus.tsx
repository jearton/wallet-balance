import type { GenerationStatus } from "../../../shared/types.ts";
import { errorMessage } from "../../../shared/types.ts";
import { useEffect, useState } from "react";
import { api } from "../../lib/history-client.ts";
import { Button } from "../../components/ui/button";
import { Status, Hint, busyIcon } from "../../components/common.tsx";
export function GenerationStatus() {
  const [state, setState] = useState<GenerationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const value = await api<GenerationStatus>("/api/generation");
        if (active) {
          setState(value);
          setError("");
        }
      } catch {
        if (active) setError("无法读取定时任务状态");
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function toggle() {
    if (!state) return;
    setBusy(true);
    try {
      setState(
        await api<GenerationStatus>(
          `/api/generation/${state.paused ? "resume" : "pause"}`,
          "POST",
          {},
        ),
      );
      setError("");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (!state) return error ? <Status error>{error}</Status> : null;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-sky-900">
            定时创建钱包 · {state.paused ? "已暂停" : "运行中"}
          </p>
          <p>
            每轮间隔 {state.intervalMs / 1000} 秒 · {state.wordCount} 词 · 累计{" "}
            {state.generatedCount} 组
          </p>
          <Hint>查询成功后保存。暂停后不再创建钱包，已有查询会继续完成。</Hint>
          {state.balances &&
            (state.balances.remainingRecords > 0 ||
              state.balances.activeRecords > 0 ||
              state.balances.lastError) && (
              <Hint>
                余额补查：待完成 {state.balances.remainingRecords} · 处理中{" "}
                {state.balances.activeRecords}
                {state.balances.lastError ? ` · ${state.balances.lastError}` : ""}
              </Hint>
            )}
          {state.lastCreatedAt && (
            <Hint>最近创建：{new Date(state.lastCreatedAt).toLocaleString("zh-CN")}</Hint>
          )}
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={toggle}>
          {busy ? busyIcon : null}
          {state.paused ? "恢复定时创建" : "暂停定时创建"}
        </Button>
      </div>
      <Status error>{error || state.lastError}</Status>
    </div>
  );
}
