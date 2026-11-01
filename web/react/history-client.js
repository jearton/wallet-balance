export async function api(path, method = "GET", body) {
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
  return result;
}
export const reserveQuery = (input) => api("/api/history/prepare", "POST", input);
export const saveQuery = (input) => api("/api/history", "POST", input);
export const saveResults = (id, results, queryVersion) =>
  api(`/api/history/${id}`, "PATCH", { results, queryVersion });
