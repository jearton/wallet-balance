import { successfulResults } from "../shared/query-results.mjs";
import { PwaInstall } from "./features/pwa/PwaInstall.jsx";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Eye, EyeOff, History, KeyRound, Layers, RefreshCw, ShieldCheck, Sparkles, Wallet, ArrowUpRight, Import } from "lucide-react";
import { queryAssets } from "../shared/asset-query.mjs";
import { COMMON_TOKENS } from "../shared/common-tokens.mjs";
import { getAddress } from "ethers";
import { CHAINS, CHAIN_ORDER, validateRpc } from "../shared/wallet.mjs";
import { generateMnemonic, validateMnemonic, parseMnemonicImport } from "../shared/mnemonic.mjs";
import { createQueryPlan } from "../shared/query-plan.mjs";
import { reserveQuery, saveQuery } from "./lib/history-client.js";
import { cn } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./components/ui/dialog";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./components/ui/collapsible";
import { Hint, Status, IconBadge, busyIcon } from "./components/common.jsx";
import { NetworkSelect } from "./features/wallet/NetworkSelect.jsx";
import { WordInput } from "./features/wallet/WordInput.jsx";
import { AssetBalances } from "./features/balances/AssetBalances.jsx";
import { HistoryPanel } from "./features/history/HistoryPanel.jsx";
import { copyText } from "./lib/clipboard.js";
const chainNames = CHAIN_ORDER;
const safeGenerate = (count) => {
  try {
    return generateMnemonic(count).split(" ");
  } catch {
    return Array(count).fill("");
  }
};
export default function App() {
  const [tab, setTab] = useState("24"),
    [drafts, setDrafts] = useState(() => ({ 24: safeGenerate(24), 12: null }));
  const [hidden, setHidden] = useState(false),
    [privateKey, setPrivateKey] = useState(""),
    [address, setAddress] = useState("");
  const [chain, setChain] = useState("all"),
    [token, setToken] = useState(""),
    [rpc, setRpc] = useState(""),
    [advanced, setAdvanced] = useState(false);
  const [importOpen, setImportOpen] = useState(false),
    [importText, setImportText] = useState(""),
    [manualCopy, setManualCopy] = useState(""),
    [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState(""),
    [saveStatus, setSaveStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false),
    [historyRefresh, setHistoryRefresh] = useState(0);
  const revision = useRef(0),
    inFlight = useRef(false),
    copyRevision = useRef(0);
  const count = tab === "12" ? 12 : 24,
    mode = ["12", "24"].includes(tab) ? "mnemonic" : tab;
  const words = drafts[count] ?? [],
    phrase = words.join(" ");
  let validation = "",
    valid = true;
  if (mode === "mnemonic") {
    try {
      validateMnemonic(phrase, count);
      validation = `✓ ${count} 个单词 · BIP-39 校验通过`;
    } catch (error) {
      validation = error.message;
      valid = false;
    }
  }
  let importMessage = "",
    importValid = false;
  if (importText.trim()) {
    try {
      const parsed = parseMnemonicImport(importText);
      importMessage = `✓ 已识别 ${parsed.split(" ").length} 个词，可以导入`;
      importValid = true;
    } catch (error) {
      importMessage = error.message;
    }
  }
  function invalidate() {
    revision.current++;
    copyRevision.current++;
    setResult(null);
    setError("");
    setSaveStatus("");
    setManualCopy("");
    setCopyStatus("");
  }
  function switchTab(value) {
    if (["12", "24"].includes(value) && !drafts[value])
      setDrafts((current) => ({
        ...current,
        [value]: safeGenerate(Number(value)),
      }));
    setTab(value);
    invalidate();
  }
  function changeWords(index, value) {
    setDrafts((current) => ({
      ...current,
      [count]: current[count].map((word, i) => (i === index ? value : word)),
    }));
    invalidate();
  }
  function importPhrase() {
    try {
      const parsed = parseMnemonicImport(importText);
      const values = parsed.split(" ");
      setDrafts((current) => ({ ...current, [values.length]: values }));
      setTab(String(values.length));
      setImportOpen(false);
      setImportText("");
      invalidate();
    } catch (error) {
      setError(error.message);
    }
  }
  useEffect(() => {
    function clear() {
      revision.current++;
      copyRevision.current++;
      setDrafts({ 12: [], 24: [] });
      setPrivateKey("");
      setImportText("");
      setManualCopy("");
      setHistoryOpen(false);
      setResult(null);
    }
    function resume(event) {
      if (event.persisted) {
        setDrafts({ 24: safeGenerate(24), 12: null });
        setTab("24");
        setBusy(false);
        inFlight.current = false;
      }
    }
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", resume);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", resume);
    };
  }, []);
  async function query() {
    if (inFlight.current) return;
    let plan, contract, endpoint;
    setError("");
    try {
      if ((token.trim() || rpc.trim()) && chain === "all")
        throw new Error("使用代币合约或自定义 RPC 时，请先选择单个网络。");
      if (token.trim()) {
        try {
          contract = getAddress(token.trim());
        } catch {
          throw new Error("代币合约地址格式无效。");
        }
      }
      if (rpc.trim()) {
        endpoint = validateRpc(rpc.trim());
        if (!endpoint.startsWith("https:"))
          throw new Error("网页版自定义 RPC 必须使用 HTTPS。");
      }
      if (chain !== "all" && CHAINS[chain].family && (contract || endpoint))
        throw new Error("BTC、SOL、TRON 目前仅支持内置节点与原生币。");
      plan = createQueryPlan({
        mode,
        selected: chain,
        phrase: mode === "mnemonic" ? phrase : undefined,
        wordCount: count,
        privateKey,
        address,
      });
    } catch (error) {
      setError(error.message);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    const version = ++revision.current;
    let savedMnemonic =
      mode === "mnemonic" ? validateMnemonic(phrase, count) : null;
    const { names, wallets, groups } = plan;
    setResult({
      address:
        groups.length === 1 ? groups[0].address : `EVM · ${groups[0].address}`,
      rows: names.map((network) => ({
        network,
        status: "pending",
        address: wallets[network].address,
      })),
      time: "",
    });
    setSaveStatus("正在查询余额，成功后保存历史…");
    const prepared = [];
    try {
      for (const group of groups) {
        const input = { triggerType: "manual", ...group, token: contract,
          ...(savedMnemonic ? { mnemonic: savedMnemonic } : {}) };
        const reservation = await reserveQuery(input);
        prepared.push({ input, ...reservation });
      }
      const results = await Promise.all(
        names.map(async (network) => {
          const base = {
            network,
            ...(wallets[network].path ? { path: wallets[network].path } : {}),
          };
          let row;
          try {
            const value = await queryAssets({
              chain: CHAINS[network],
              address: wallets[network].address,
              token: contract,
              endpoint: endpoint ?? CHAINS[network].rpc,
            });
            row = {
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
          } catch (error) {
            row = { ...base, status: "error", error: error.message };
          }
          if (version === revision.current)
            setResult((current) =>
              current
                ? {
                    ...current,
                    rows: current.rows.map((previous) =>
                      previous.network === network
                        ? { ...row, address: wallets[network].address }
                        : previous,
                    ),
                  }
                : current,
            );
          return row;
        }),
      );
      let savedCount = 0;
      for (const { input, queryTicket } of prepared) {
        const scoped = results.filter(row => input.networks.includes(row.network));
        if (!successfulResults(scoped).length) continue;
        const saved = await saveQuery({ ...input, results: scoped, queryTicket });
        if (saved.saved) savedCount++;
      }
      if (savedCount) setHistoryRefresh(value => value + 1);
      if (version === revision.current) {
        setSaveStatus(savedCount ? "✓ 查询成功的余额已保存至历史记录" : "未查到有效余额，本次不新增历史记录。");
        setResult((current) =>
          current
            ? { ...current, time: new Date().toLocaleString("zh-CN") }
            : current,
        );
      }
    } catch (error) {
      if (version === revision.current) {
        setError(error.message);
        setSaveStatus("记录保存失败，请恢复本地服务后重试。");
        setResult((current) =>
          current
            ? {
                ...current,
                rows: current.rows.map((row) =>
                  row.status === "pending"
                    ? { ...row, status: "error", error: "查询未完成" }
                    : row,
                ),
              }
            : current,
        );
      }
    } finally {
      for (const entry of prepared) { entry.input.privateKey = null; entry.input.mnemonic = null; }
      savedMnemonic = null;
      groups.forEach((group) => {
        group.privateKey = null;
      });
      Object.values(wallets).forEach((wallet) => {
        wallet.privateKey = null;
      });
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function copyPhrase() {
    if (words.some((word) => !word.trim())) {
      setCopyStatus("请先填完整助记词。");
      return;
    }
    const attempt = ++copyRevision.current;
    const copied = await copyText(phrase);
    if (attempt !== copyRevision.current) return;
    setCopyStatus(copied ? `已复制 ${count} 个助记词。` : "请在下方手动复制。");
    setManualCopy(copied ? "" : phrase);
  }
  return (
    <>
      <header className="site-header">
        <a
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <span className="brand-mark">
            <Wallet className="size-5" />
          </span>
          <span className="text-lg">Wallet Lab</span>
        </a>
        <div className="flex items-center gap-3">
        <PwaInstall />
        <span className="hidden items-center gap-2 text-xs text-teal-700 sm:flex">
          <span className="size-2 rounded-full bg-teal-500" />
          本地运行<span className="hidden sm:inline"> · 隐私优先</span>
        </span>
        </div>
      </header>
      <main>
        <section className="intro">
          <Badge
            variant="outline"
            className="mb-2 border-teal-200 bg-teal-50 text-[10px] tracking-widest text-teal-700"
          >
            YOUR KEYS, YOUR SPACE
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            从助记词，到你的钱包<span className="text-primary">。</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            生成、导入、编辑助记词，轻松查看多链资产。
          </p>
        </section>
        <div className="wallet-layout">
          <Card className="editor-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <p className="section-kicker text-primary">01 / 钱包来源</p>
                  <CardTitle className="mt-1 flex items-center gap-2">
                    <KeyRound className="size-5 text-primary" />
                    准备你的钱包
                  </CardTitle>
                </div>
                <IconBadge className="bg-violet-100 text-violet-700">
                  <Sparkles className="size-3" />
                  {chainNames.length} 条主网
                </IconBadge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={tab} onValueChange={switchTab}>
                <TabsList className="source-tabs grid w-full grid-cols-4 bg-teal-50">
                  {[
                    ["24", "24 个助记词"],
                    ["12", "12 个助记词"],
                    ["private", "私钥"],
                    ["address", "公开地址"],
                  ].map(([value, label]) => (
                    <TabsTrigger key={value} value={value}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {["12", "24"].map((value) => (
                  <TabsContent key={value} value={value} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-violet-700">
                        英文助记词{" "}
                        <span className="hidden text-muted-foreground sm:inline">
                          · 点击单词编辑
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-pressed={hidden}
                        onClick={() => setHidden((value) => !value)}
                      >
                        {hidden ? <Eye /> : <EyeOff />}
                        {hidden ? "显示单词" : "隐藏单词"}
                      </Button>
                    </div>
                    <div className="word-grid">
                      {words.map((word, i) => (
                        <WordInput
                          key={`${value}-${i}`}
                          index={i}
                          value={word}
                          hidden={hidden}
                          onChange={(value) => changeWords(i, value)}
                        />
                      ))}
                    </div>
                    <Hint>输入前缀即可补全 · 隐藏单词时不显示候选</Hint>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setDrafts((current) => ({
                            ...current,
                            [count]: safeGenerate(count),
                          }));
                          invalidate();
                        }}
                      >
                        <RefreshCw />
                        重新生成
                      </Button>
                      <Button variant="outline" size="sm" onClick={copyPhrase}>
                        <Copy />
                        复制助记词
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-violet-700"
                        onClick={() => setImportOpen(true)}
                      >
                        <Import />
                        导入助记词
                      </Button>
                    </div>
                    <Status>{copyStatus}</Status>
                    {manualCopy && (
                      <div>
                        <label className="field-label" htmlFor="manual-copy">
                          手动复制助记词
                        </label>
                        <Textarea
                          id="manual-copy"
                          value={manualCopy}
                          readOnly
                          autoComplete="off"
                        />
                      </div>
                    )}
                    <p
                      role="status"
                      className={cn(
                        "text-xs leading-relaxed",
                        valid ? "text-teal-700" : "text-amber-700",
                      )}
                    >
                      {validation}
                    </p>
                    <Hint>
                      {count === 12 ? "128" : "256"} 位安全随机熵 · BIP-39
                      英文词库 · 无额外口令
                    </Hint>
                  </TabsContent>
                ))}
                <TabsContent value="private" className="space-y-2">
                  <label htmlFor="private-key" className="field-label">
                    钱包私钥
                  </label>
                  <Input
                    id="private-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="EVM/TRON：Hex；BTC：WIF；SOL：Base58 / JSON"
                    value={privateKey}
                    onChange={(event) => {
                      setPrivateKey(event.target.value);
                      invalidate();
                    }}
                  />
                  <Hint>用于推导地址，查询时加密保存至本地 SQLite。</Hint>
                </TabsContent>
                <TabsContent value="address" className="space-y-2">
                  <label htmlFor="public-address" className="field-label">
                    钱包公开地址
                  </label>
                  <Input
                    id="public-address"
                    placeholder="0x… / bc1… / Solana / T…"
                    autoComplete="off"
                    spellCheck={false}
                    value={address}
                    onChange={(event) => {
                      setAddress(event.target.value);
                      invalidate();
                    }}
                  />
                  <Hint>使用公开地址查询，无需提供私钥。</Hint>
                </TabsContent>
              </Tabs>
              <div className="space-y-2 border-t border-border pt-3">
                <label className="field-label">查询网络</label>
                <NetworkSelect
                  value={chain}
                  onChange={(value) => {
                    setChain(value);
                    invalidate();
                  }}
                />
                <Hint>
                  {mode === "address"
                    ? "公开地址只查询格式兼容的网络：Solana 地址对应 Solana，0x 地址可查询多条 EVM 网络。"
                    : "助记词按各链规则派生；BTC 查询第一个原生 SegWit 地址，不扫描整个账户。"}
                </Hint>
              </div>
              <Hint>
                自动查询原生币与
                {chain === "all"
                  ? "各链已收录的常见代币"
                  : COMMON_TOKENS[chain]?.length
                    ? ` ${COMMON_TOKENS[chain].map((item) => item.symbol).join("、")}`
                    : " BTC（该链未收录其他代币）"}
                ，无需填写合约。
              </Hint>
              <Collapsible open={advanced} onOpenChange={setAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between text-muted-foreground"
                  >
                    代币合约与自定义 RPC
                    <ChevronDown className={cn(advanced && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <Hint>使用以下选项时，请选择单个 EVM 网络。</Hint>
                  <div>
                    <label htmlFor="token" className="field-label">
                      ERC-20 代币合约（可选）
                    </label>
                    <Input
                      id="token"
                      value={token}
                      onChange={(event) => {
                        setToken(event.target.value);
                        invalidate();
                      }}
                      autoComplete="off"
                      placeholder="0x…"
                    />
                  </div>
                  <div>
                    <label htmlFor="rpc" className="field-label">
                      HTTPS RPC（可选）
                    </label>
                    <Input
                      id="rpc"
                      type="url"
                      value={rpc}
                      onChange={(event) => {
                        setRpc(event.target.value);
                        invalidate();
                      }}
                      placeholder="https://…"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
          <aside className="space-y-3">
            <Card className="results-card">
              <CardHeader>
                <p className="section-kicker text-violet-600">02 / 链上资产</p>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="size-5 text-violet-600" />
                  钱包概览
                </CardTitle>
                <Button
                  className="mt-2 w-full justify-between"
                  onClick={query}
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <span>正在查询链上余额…</span>
                      {busyIcon}
                    </>
                  ) : (
                    <>
                      <span>
                        {mode === "address"
                          ? "查询钱包余额"
                          : "推导地址并查询余额"}
                      </span>
                      <ArrowUpRight />
                    </>
                  )}
                </Button>
                <Status error>{error}</Status>
                <Status>{saveStatus}</Status>
              </CardHeader>
              <CardContent>
                {result ? (
                  <div className="space-y-2">
                    <div className="balance-list">
                      <AssetBalances rows={result.rows} token={token.trim()} />
                    </div>
                    <details className="text-xs">
                      <summary className="w-fit cursor-pointer py-1 text-violet-700">
                        查询详情
                      </summary>
                      <div className="space-y-2 pt-2">
                        <Hint className="break-all font-mono">
                          公开地址 {result.address}
                        </Hint>
                        {result.time && <Hint>查询时间 {result.time}</Hint>}
                        <Hint>余额不代表转账权限</Hint>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="wallet-empty">
                    <span className="empty-icon">
                      <Wallet />
                    </span>
                    <h3 className="mt-4 text-sm font-medium">
                      你的钱包，即将在这里
                    </h3>
                    <Hint className="mt-2">
                      确认输入并点击查询
                      <br />
                      即可查看地址与各网络余额
                    </Hint>
                  </div>
                )}
              </CardContent>
            </Card>
            <Button
              variant="outline"
              className="w-full border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
              aria-expanded={historyOpen}
              onClick={() => {
                setHistoryOpen((value) => !value);
                if (!historyOpen)
                  requestAnimationFrame(() =>
                    document.getElementById("history-section")?.scrollIntoView({
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "instant"
                        : "smooth",
                      block: "start",
                    }),
                  );
              }}
            >
              <History />
              {historyOpen ? "收起历史记录" : "查看历史记录"}
            </Button>
            <div className="rounded-xl border border-teal-100 bg-teal-50/80 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-teal-600" />
                <div>
                  <h3 className="text-xs font-semibold text-teal-800">
                    你的密钥，留在本地
                  </h3>
                  <Hint className="mt-1">
                    查询时助记词与私钥加密保存至本地 SQLite。RPC
                    仅接收公开地址。
                  </Hint>
                </div>
              </div>
            </div>
            <Hint className="px-1">
              新生成的钱包通常为零余额。自动查询原生币与常见代币，不含 NFT 或
              DeFi 仓位，无交易功能。
            </Hint>
          </aside>
        </div>
        {historyOpen && <HistoryPanel refreshKey={historyRefresh} />}
        <footer>
          <span>WALLET LAB / LOCAL EDITION</span>
          <span>多链查询 · 本地保存 · 无交易功能</span>
        </footer>
      </main>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-800">
              <Import className="size-5" />
              导入助记词
            </DialogTitle>
            <DialogDescription>
              支持 12 / 24
              个英文单词，识别常见标点、连续序号、大小写和多余空白。
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="import-phrase" className="field-label">
            完整助记词
          </label>
          <Textarea
            id="import-phrase"
            value={importText}
            maxLength={8192}
            rows={5}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="在此粘贴完整助记词…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <p
            role="status"
            className={cn(
              "text-xs leading-relaxed",
              importValid ? "text-teal-700" : "text-amber-700",
            )}
          >
            {importMessage || "只整理格式，不猜词、不重排、不修复校验和。"}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button onClick={importPhrase} disabled={!importValid}>
              确认导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
