import { readHistoryBalances } from "./history-query.mjs";
import { queryAssets } from "./asset-query.mjs";
import { successfulResults } from "./query-results.mjs";
import { generateMnemonic } from "./mnemonic.mjs";
import { createQueryPlan } from "./query-plan.mjs";

// Generate and query in memory; only successful balances become history.
export async function createWalletBatch(history, wordCount = 24, { query = queryAssets } = {}) {
  let phrase = generateMnemonic(wordCount);
  let plan;
  const pending = [];
  try {
    plan = createQueryPlan({ mode: "mnemonic", phrase, wordCount });
    const browser = { userAgent: "Server wallet generation task", platform: "server" };
    for (const group of plan.groups) {
      const input = { ...group, mnemonic: phrase, triggerType: "automatic" };
      const { queryTicket } = history.reserveQuery(input, browser);
      pending.push({ input, queryTicket });
    }
    const completed = await Promise.all(pending.map(async entry => ({ ...entry,
      results: await readHistoryBalances({ ...entry.input, results: entry.input.networks.map(network => ({ network, path: entry.input.path })) }, query) })));
    let saved = 0;
    for (const entry of completed) {
      if (!successfulResults(entry.results).length) continue;
      history.create(undefined, entry.input, browser, { completedResults: entry.results, queryTicket: entry.queryTicket });
      saved++;
    }
    return { wallets: saved ? 1 : 0, addressRecords: saved };
  } finally {
    phrase = null;
    for (const entry of pending) { entry.input.privateKey = null; entry.input.mnemonic = null; }
    for (const group of plan?.groups ?? []) group.privateKey = null;
    for (const wallet of Object.values(plan?.wallets ?? {}))
      wallet.privateKey = null;
  }
}

export function createWalletGeneration(
  history,
  {
    intervalMs = 5000,
    wordCount = 24,
    enabled = false,
    generate = createWalletBatch,
    schedule = setTimeout,
    cancel = clearTimeout,
    now = Date.now,
  } = {},
) {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1000 ||
    ![12, 24].includes(wordCount)
  )
    throw new Error("定时创建参数无效");
  const saved = history.generationState();
  let state = {
    paused: saved?.paused ?? !enabled,
    generatedCount: saved?.generatedCount ?? 0,
    lastCreatedAt: saved?.lastCreatedAt ?? null,
    lastError: null,
  };
  let timer = null,
    stopped = true,
    running = false,
    nextRunAt = null,
    activeWork = Promise.resolve();
  const persist = () => history.saveGenerationState(state);
  function status() {
    return { ...state, intervalMs, wordCount, running, nextRunAt };
  }
  function queue() {
    if (stopped || state.paused || running) return;
    nextRunAt = new Date(now() + intervalMs).toISOString();
    timer = schedule(() => { if (running) return; activeWork = run(); return activeWork; }, intervalMs);
    timer?.unref?.();
  }
  async function run() {
    timer = null;
    nextRunAt = null;
    if (stopped || state.paused || running) return;
    running = true;
    try {
      const outcome = await generate(history, wordCount);
      const created = outcome?.wallets ?? 1;
      state = {
        ...state,
        generatedCount: state.generatedCount + created,
        lastCreatedAt: created ? new Date(now()).toISOString() : state.lastCreatedAt,
        lastError: null,
      };
    } catch {
      state.lastError = "本次钱包创建失败，稍后自动重试。";
    } finally {
      running = false;
      persist();
      queue();
    }
  }
  return {
    status,
    start() {
      if (!stopped) return;
      stopped = false;
      persist();
      queue();
    },
    async stop() {
      stopped = true;
      if (timer !== null) cancel(timer);
      timer = null;
      nextRunAt = null;
      await activeWork;
    },
    pause() {
      state.paused = true;
      if (timer !== null) cancel(timer);
      timer = null;
      nextRunAt = null;
      persist();
      return status();
    },
    resume() {
      if (state.paused) {
        state.paused = false;
        persist();
        queue();
      }
      return status();
    },
  };
}

export async function handleWalletGeneration(req, res, job) {
  const send = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data));
  };
  const path = new URL(req.url, "http://localhost").pathname;
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (
        origin.host !== req.headers.host ||
        !["http:", "https:"].includes(origin.protocol)
      )
        throw new Error();
    } catch {
      send(403, { error: "不允许跨站访问。" });
      return;
    }
  }
  if (req.method === "GET" && path === "/api/generation") {
    send(200, job.status());
    return;
  }
  if (
    req.method === "POST" &&
    ["/api/generation/pause", "/api/generation/resume"].includes(path)
  ) {
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      send(400, { error: "需要 JSON 请求。" });
      return;
    }
    send(200, path.endsWith("/pause") ? job.pause() : job.resume());
    return;
  }
  send(404, { error: "接口不存在。" });
}
