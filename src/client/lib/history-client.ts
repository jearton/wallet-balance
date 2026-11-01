import type { HistoryInput, QueryResult } from "../../shared/types.ts";
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      keepalive: method !== "GET",
    });
  } catch {
    throw new Error("无法连接本地历史记录服务，请检查本地服务状态。");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "历史记录读写失败。");
  return result as T;
}
export const reserveQuery = (input: HistoryInput) =>
  api<{ queryTicket: string }>("/api/history/prepare", "POST", input);
export const saveQuery = (input: HistoryInput & { results: QueryResult[]; queryTicket: string }) =>
  api<{ saved: boolean; id?: string }>("/api/history", "POST", input);
export const saveResults = (id: string, results: QueryResult[], queryVersion: string) =>
  api<{ saved: boolean; record: import("../../shared/types.ts").HistoryRecord }>(
    `/api/history/${id}`,
    "PATCH",
    { results, queryVersion },
  );
