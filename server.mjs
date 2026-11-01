import { rpcCapabilities } from "./rpc-capabilities.mjs";
import { PWA_ROUTES } from "./pwa.mjs";
import { createBalanceAutomation } from "./balance-automation.mjs";
import {
  createWalletGeneration,
  handleWalletGeneration,
} from "./wallet-generation.mjs";
import { createServer } from "node:http";
import { readFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { isAllowedHost } from "./server-config.mjs";
import { openHistory } from "./history.mjs";
import { handleHistory } from "./history-api.mjs";

const listenHost = process.env.HOST || "127.0.0.1";
const hostOptions = {
  allowLan: process.env.ALLOW_LAN === "true",
  extraHosts: (process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
};

const root = new URL("./", import.meta.url);
await access(new URL("dist/app.js", root));
await access(new URL("dist/app.css", root));
const history = openHistory(
  process.env.DATA_DIR || new URL("./data/", root).pathname,
);
rpcCapabilities.useStorage({ read: () => history.rpcCapabilities(), write: value => history.saveRpcCapabilities(value) });
const balances = createBalanceAutomation(history);
const generation = createWalletGeneration(history, {
  enabled: process.env.WALLET_GENERATION_ENABLED === "true",
  intervalMs: Number(process.env.WALLET_GENERATION_INTERVAL_MS ?? 5000),
  wordCount: 24,
});
const routes = new Map([
  ...PWA_ROUTES,
  ["/", ["web/index.html", "text/html; charset=utf-8"]],
  ["/assets/app.js", ["dist/app.js", "text/javascript; charset=utf-8"]],
  ["/assets/app.css", ["dist/app.css", "text/css; charset=utf-8"]],
]);

const server = createServer(async (req, res) => {
  const styleNonce = randomBytes(18).toString("base64");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-${styleNonce}'; connect-src 'self' https:; img-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  if (!isAllowedHost(req.headers.host, hostOptions)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (req.url === "/api/generation" || req.url.startsWith("/api/generation/")) {
    await handleWalletGeneration(req, res, { ...generation, status: () => ({ ...generation.status(), balances: balances.status() }) });
    return;
  }
  if (req.url.startsWith("/api/")) {
    await handleHistory(req, res, history);
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  const route = routes.get(req.url);
  if (req.url === "/sw.js") res.setHeader("Service-Worker-Allowed", "/");
  if (!route) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const file = await readFile(new URL(route[0], root));
    const body =
      route[0] === "web/index.html"
        ? Buffer.from(
            file.toString("utf8").replace("__STYLE_NONCE__", styleNonce),
          )
        : file;
    res.writeHead(200, { "Content-Type": route[1] });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(500);
    res.end(
      "Unable to load local assets. Run npm ci --ignore-scripts and npm run build.",
    );
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "端口 4173 已占用，请打开 http://127.0.0.1:4173 或关闭原进程后重试。"
      : "本地网页服务启动失败。",
  );
  process.exitCode = 1;
});
server.listen(4173, listenHost, () => {
  generation.start();
  balances.start();
  console.log(`钱包工具已启动，监听 ${listenHost}:4173`);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await Promise.all([generation.stop(), balances.stop()]);
    server.close(() => {
      history.close();
      process.exit(0);
    });
  });
