import { rpcCapabilities } from "../../rpc-capabilities.mjs";
import { successfulResults } from "../../query-results.mjs";
import { PwaInstall } from "./pwa-install.jsx";
import { readHistoryBalances } from "../../history-query.mjs";
import React, { useEffect, useRef, useState } from "react";
import { setNonce } from "get-nonce";
import { createRoot } from "react-dom/client";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Layers,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  ArrowUpRight,
  Import,
  Globe2,
  AlertTriangle,
} from "lucide-react";
import { queryAssets } from "../../asset-query.mjs";
import {
  groupAssets,
  assetGroupSummary,
  assetGroupStatus,
} from "../../asset-groups.mjs";
import { COMMON_TOKENS } from "../../common-tokens.mjs";
import { getAddress } from "ethers";
import {
  CHAINS,
  CHAIN_ORDER,
  PREFERRED_CHAINS,
  validateRpc,
} from "../../wallet.mjs";
import {
  generateMnemonic,
  validateMnemonic,
  parseMnemonicImport,
  mnemonicSuggestions,
} from "../../mnemonic.mjs";
import { createQueryPlan } from "../../query-plan.mjs";
import { summarizeWalletRecords } from "../../wallet-history.mjs";
import { summarizeHistoryBalance } from "../../history-summary.mjs";
import { api, reserveQuery, saveQuery, saveResults } from "./history-client.js";
import { cn } from "./lib/utils";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./components/ui/select";
import {
  Popover,
  PopoverAnchor,
  PopoverTrigger,
  PopoverContent,
} from "./components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./components/ui/command";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./components/ui/collapsible";

const chainNames = CHAIN_ORDER;
const FILTERS = {
  all: "全部记录",
  "key-positive": "有私钥且有余额",
  private: "有私钥",
  positive: "有余额",
  zero: "已查余额为 0",
  unknown: "暂无成功结果",
};
const safeGenerate = (count) => {
  try {
    return generateMnemonic(count).split(" ");
  } catch {
    return Array(count).fill("");
  }
};
const Hint = ({ children, className }) => (
  <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
    {children}
  </p>
);
const Status = ({ children, error = false }) =>
  children ? (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "text-xs leading-relaxed",
        error ? "text-rose-600" : "text-teal-700",
      )}
    >
      {children}
    </p>
  ) : null;
const IconBadge = ({ children, className }) => (
  <Badge variant="secondary" className={cn("gap-1 font-medium", className)}>
    {children}
  </Badge>
);
const busyIcon = <LoaderCircle className="animate-spin" />;

function NetworkSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected =
    value === "all"
      ? `全部匹配网络 · ${chainNames.length} 条主网`
      : `${CHAINS[value].name} · ${CHAINS[value].symbol}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label="查询网络"
          aria-expanded={open}
          className="w-full justify-between bg-white"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe2 className="text-primary" />
            <span className="truncate">{selected}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="network-popover p-0">
        <Command>
          <CommandInput
            placeholder="搜索网络或币种…"
            aria-label="搜索网络或币种"
          />
          <CommandList>
            <CommandEmpty>没有匹配的网络</CommandEmpty>
            <CommandGroup heading="查询范围">
              <CommandItem
                value="全部 all"
                onSelect={() => {
                  onChange("all");
                  setOpen(false);
                }}
              >
                <Layers />
                全部匹配网络
                <Check
                  className={cn("ml-auto", value !== "all" && "invisible")}
                />
              </CommandItem>
            </CommandGroup>
            {[
              ["常用网络", PREFERRED_CHAINS],
              [
                "其他网络",
                chainNames.filter((name) => !PREFERRED_CHAINS.includes(name)),
              ],
            ].map(([heading, names]) => (
              <CommandGroup key={heading} heading={heading}>
                {names.map((name) => (
                  <CommandItem
                    key={name}
                    value={`${name} ${CHAINS[name].name} ${CHAINS[name].symbol}`}
                    onSelect={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                  >
                    <span
                      className={cn(
                        "network-dot",
                        CHAINS[name].family && "bg-violet-400",
                      )}
                    />
                    <span>{CHAINS[name].name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {CHAINS[name].symbol}
                    </span>
                    {value === name && <Check />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function WordInput({ index, value, hidden, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef(null);
  const matches = hidden ? [] : mnemonicSuggestions(value);
  const candidates = matches.slice(0, 8);
  const show =
    open &&
    !hidden &&
    candidates.length > 0 &&
    !(matches.length === 1 && matches[0] === value);
  const listId = `word-list-${index}`;
  function choose(word) {
    onChange(word);
    setOpen(false);
    setActive(-1);
    ref.current?.focus();
  }
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);
  return (
    <Popover open={Boolean(show)} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="word-cell">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <Input
            ref={ref}
            aria-label={`第 ${index + 1} 个助记词`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(show)}
            aria-controls={listId}
            aria-activedescendant={
              show && active >= 0 ? `${listId}-${active}` : undefined
            }
            type={hidden ? "password" : "text"}
            value={value}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => {
              onChange(event.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape" || event.key === "Tab") {
                setOpen(false);
                return;
              }
              if (
                ["ArrowDown", "ArrowUp"].includes(event.key) &&
                candidates.length &&
                !hidden
              ) {
                event.preventDefault();
                setOpen(true);
                setActive(
                  (current) =>
                    (current +
                      (event.key === "ArrowDown" ? 1 : current < 0 ? 0 : -1) +
                      candidates.length) %
                    candidates.length,
                );
              }
              if (event.key === "Enter" && show && active >= 0) {
                event.preventDefault();
                choose(candidates[active]);
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="word-popover p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target === ref.current) event.preventDefault();
        }}
      >
        <div
          id={listId}
          role="listbox"
          aria-label="BIP-39 单词补全"
          className="grid grid-cols-2 gap-1"
        >
          {candidates.map((word, i) => (
            <Button
              key={word}
              id={`${listId}-${i}`}
              variant="ghost"
              role="option"
              aria-selected={active === i}
              tabIndex={-1}
              className={cn(
                "justify-start font-mono text-sm",
                active === i && "bg-accent",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(word)}
            >
              {word}
            </Button>
          ))}
        </div>
        <Hint className="px-1 pt-2">
          {matches.length > 8
            ? `共 ${matches.length} 个匹配，继续输入缩小范围`
            : "点击选择 · ↑↓ 选择 · Enter 确认"}
        </Hint>
      </PopoverContent>
    </Popover>
  );
}

async function copyText(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.className = "clipboard-buffer";
  field.value = text;
  field.readOnly = true;
  document.body.append(field);
  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.value = "";
    field.remove();
    previous?.focus({ preventScroll: true });
  }
}

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

function AssetBalances({ rows, token }) {
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

function WalletMnemonic({ wallet }) {
  const record = wallet.records.find(record => record.hasMnemonic);
  const revision = wallet.records.map(record => record.queryVersion).join(":");
  const [mnemonic, setMnemonic] = useState("");
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current++;
    setMnemonic("");
    setReading(false);
    setMessage("");
    return () => { requestVersion.current++; };
  }, [wallet.id, revision]);

  async function toggle() {
    const version = ++requestVersion.current;
    setMessage("");
    if (mnemonic) { setMnemonic(""); return; }
    setReading(true);
    try {
      const value = await api(`/api/history/${record.id}/mnemonic`);
      if (version === requestVersion.current) {
        if (value.mnemonic) setMnemonic(value.mnemonic);
        else setMessage("这条记录没有保存助记词。");
      }
    } catch (error) {
      if (version === requestVersion.current) setMessage(error.message);
    } finally {
      if (version === requestVersion.current) setReading(false);
    }
  }

  async function copy() {
    const version = requestVersion.current;
    const copied = await copyText(mnemonic);
    if (version === requestVersion.current) setMessage(copied ? "助记词已复制。" : "复制失败，请手动选择单词复制。");
  }

  if (!record) return null;
  const words = mnemonic.split(/\s+/).filter(Boolean);
  return (
    <section className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/60 p-3" aria-label="钱包助记词">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-teal-900">钱包助记词{words.length ? ` · ${words.length} 词` : ""}</h4>
          <Hint>这一组助记词对应本条记录下的所有派生地址。</Hint>
        </div>
        <Button variant="secondary" size="sm" disabled={reading} onClick={toggle} aria-expanded={Boolean(mnemonic)}>
          {reading ? busyIcon : mnemonic ? <EyeOff /> : <Eye />}
          {mnemonic ? "隐藏助记词" : "显示助记词"}
        </Button>
      </div>
      {mnemonic && (
        <>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" aria-label="助记词单词列表">
            {words.map((word, index) => (
              <li key={index} className="flex items-center gap-2 rounded-md border border-teal-100 bg-white px-2.5 py-2">
                <span className="text-[10px] text-muted-foreground" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 break-all font-mono text-xs">{word}</span>
              </li>
            ))}
          </ol>
          <Button variant="outline" size="sm" onClick={copy}><Copy />复制助记词</Button>
        </>
      )}
      <Status>{message}</Status>
    </section>
  );
}

function AddressDetails({ record }) {
  const [privateKey, setPrivateKey] = useState("");
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");
  const revealVersion = useRef(0);
  useEffect(() => {
    revealVersion.current++;
    setPrivateKey("");
    setReading(false);
    setMessage("");
    return () => { revealVersion.current++; };
  }, [record.queryVersion]);
  async function reveal() {
    const version = ++revealVersion.current;
    setMessage("");
    if (privateKey) { setPrivateKey(""); return; }
    setReading(true);
    try {
      const value = await api(`/api/history/${record.id}/private-key`);
      if (version === revealVersion.current) setPrivateKey(value.privateKey ?? "");
    } catch (error) {
      if (version === revealVersion.current) setMessage(error.message);
    } finally {
      if (version === revealVersion.current) setReading(false);
    }
  }
  const family = CHAINS[record.networks[0]]?.family;
  return (
    <div className="space-y-3 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-64 items-baseline gap-2">
          <span className="shrink-0 text-xs font-medium">{family ? CHAINS[record.networks[0]].name : "EVM"} 地址</span>
          <span className="min-w-0 break-all font-mono text-xs">{record.address}</span>
        </div>
        {record.hasPrivateKey && (
          <Button className="shrink-0" variant="secondary" size="sm" disabled={reading} onClick={reveal} aria-expanded={Boolean(privateKey)}>
            {reading ? busyIcon : privateKey ? <EyeOff /> : <Eye />}
            {privateKey ? "隐藏私钥" : "显示私钥"}
          </Button>
        )}
      </div>
      <Hint>网络：{record.networks.filter(name => !CHAINS[name]?.disabled).map(name => CHAINS[name].name).join(" / ") || "原查询网络已停用，可重新选择网络查询"}</Hint>
      {record.publicTestWallet && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">公开测试钱包，密钥已公开，请勿存入资产。</p>}
      {privateKey && <p className="secret-text">{privateKey}</p>}
      <details className="text-xs">
        <summary className="w-fit cursor-pointer text-muted-foreground">查询来源信息</summary>
        <Hint className="break-words">首次浏览器：{record.createdBrowser?.userAgent ?? "旧记录未记录"}<br />最近查询浏览器：{record.lastBrowser?.userAgent ?? "未记录"}</Hint>
      </details>
      <Status error>{message}</Status>
    </div>
  );
}

function WalletHistory({ wallet, onUpdated }) {
  const publicAddress = wallet.source === "address" ? wallet.records[0]?.address : null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [requeryOpen, setRequeryOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState("all");
  const availableNetworks = CHAIN_ORDER.filter(name => wallet.records.some(record =>
    CHAINS[record.networks[0]].family === CHAINS[name].family));
  async function requeryWallet() {
    if (busy) return;
    setRequeryOpen(false);
    setBusy(true);
    setMessage("正在重新查询余额…");
    let savedCount = 0;
    try {
      for (const record of wallet.records) {
        const networks = selectedNetwork === "all"
          ? availableNetworks.filter(name => CHAINS[name].family === CHAINS[record.networks[0]].family)
          : CHAINS[selectedNetwork].family === CHAINS[record.networks[0]].family ? [selectedNetwork] : [];
        if (!networks.length) continue;
        const next = await api(`/api/history/${record.id}/requery`, "POST", { triggerType: "manual", networks });
        const results = await readHistoryBalances(next);
        const saved = await saveResults(next.id, results, next.queryVersion);
        if (saved.saved) { savedCount++; onUpdated(saved.record, ""); }
      }
      setMessage(savedCount ? "记录已更新。" : "未查到有效余额，已保留原记录。");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  const summary = summarizeHistoryBalance(wallet);
  const balances = groupAssets(wallet.results).filter(
    (group) => group.positive,
  );
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "history-entry",
        wallet.hasPrivateKey &&
          summary.state === "positive" &&
          "history-highlight",
      )}
    >
      <div className="history-row">
      <CollapsibleTrigger asChild>
        <button
          className="history-summary w-full"
          aria-label={`${open ? "收起" : "展开"}钱包 ${publicAddress ?? wallet.id.slice(0, 8)}`}
        >
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-medium">
              {wallet.hasMnemonic ? "助记词钱包" : wallet.hasPrivateKey ? "私钥钱包" : "公开地址钱包"}{!publicAddress && ` · ${wallet.id.slice(0, 8)}`}
            </span>
            <time className="text-xs text-muted-foreground">
              {new Date(wallet.createdAt).toLocaleString("zh-CN")}
            </time>
          </div>
          {publicAddress && (
            <span className="block break-all font-mono text-xs text-foreground">
              {publicAddress}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <IconBadge className="bg-teal-100 text-teal-800">
              {wallet.networks.length} 条网络 · {wallet.records.length} 个地址
            </IconBadge>
            <IconBadge
              className={
                wallet.triggerType === "automatic"
                  ? "bg-sky-100 text-sky-800"
                  : "bg-violet-100 text-violet-700"
              }
            >
              {wallet.triggerType === "automatic"
                ? "自动触发"
                : wallet.triggerType === "manual"
                  ? "手动触发"
                  : "触发方式未记录"}
            </IconBadge>
            <IconBadge>{summary.label}</IconBadge>
            {wallet.publicTestWallet && (
              <IconBadge className="bg-amber-100 text-amber-800">
                公开测试钱包
              </IconBadge>
            )}
            <span className="ml-auto flex items-center gap-1 text-xs text-violet-700">
              {open ? "收起详情" : "详情"}
              <ChevronDown className={cn("size-4", open && "rotate-180")} />
            </span>
          </div>
          {balances.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-emerald-800">
              {balances.slice(0, 2).map((group) => (
                <span key={group.id}>
                  {group.label} · {assetGroupSummary(group)}
                </span>
              ))}
              {balances.length > 2 && <span>另 {balances.length - 2} 项</span>}
            </div>
          )}
        </button>
      </CollapsibleTrigger>
      <Button variant="outline" size="sm" className="history-requery" disabled={busy}
        onClick={() => { setSelectedNetwork("all"); setRequeryOpen(true); }}>
        {busy ? busyIcon : <RefreshCw />}{busy ? "正在查询" : "重新查询余额"}
      </Button>
      </div>
      <CollapsibleContent className="history-details">
        {wallet.hasMnemonic && <WalletMnemonic wallet={wallet} />}
        <Hint>
          覆盖网络：
          {wallet.networks
            .map((network) => CHAINS[network]?.name ?? network)
            .join(" / ")}
        </Hint>
        <p className="text-sm font-medium">代币余额</p>
        <AssetBalances rows={wallet.results} />
        <p className="text-sm font-medium">{wallet.hasPrivateKey ? "各链地址与私钥" : "地址详情"}</p>
        {wallet.records.map((record) => (
          <AddressDetails
            key={record.id}
            record={record}
          />
        ))}
      </CollapsibleContent>
      <Status>{message}</Status>
      <Dialog open={requeryOpen} onOpenChange={setRequeryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>重新查询余额</DialogTitle>
            <DialogDescription>更新当前这条历史记录，按代币汇总各网络余额。</DialogDescription></DialogHeader>
          <label className="field-label" htmlFor={`wallet-network-${wallet.id}`}>查询网络</label>
          <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
            <SelectTrigger id={`wallet-network-${wallet.id}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部适用网络</SelectItem>
              {availableNetworks.map(name => <SelectItem key={name} value={name}>{CHAINS[name].name} · {CHAINS[name].symbol}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter><Button variant="outline" onClick={() => setRequeryOpen(false)}>取消</Button>
            <Button disabled={busy} onClick={requeryWallet}>开始查询</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

function GenerationStatus() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const value = await api("/api/generation");
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
    setBusy(true);
    try {
      setState(
        await api(
          `/api/generation/${state.paused ? "resume" : "pause"}`,
          "POST",
          {},
        ),
      );
      setError("");
    } catch (error) {
      setError(error.message);
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
            每轮间隔 {state.intervalMs / 1000} 秒 · {state.wordCount} 词 ·
            累计 {state.generatedCount} 组
          </p>
          <Hint>
            查询成功后保存。暂停后不再创建钱包，已有查询会继续完成。
          </Hint>
          {state.balances && (state.balances.remainingRecords > 0 || state.balances.activeRecords > 0 || state.balances.lastError) && (
            <Hint>余额补查：待完成 {state.balances.remainingRecords} · 处理中 {state.balances.activeRecords}{state.balances.lastError ? ` · ${state.balances.lastError}` : ""}</Hint>
          )}
          {state.lastCreatedAt && (
            <Hint>
              最近创建：{new Date(state.lastCreatedAt).toLocaleString("zh-CN")}
            </Hint>
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

function HistoryPanel({ refreshKey }) {
  const [filter, setFilter] = useState("all"),
    [records, setRecords] = useState([]),
    [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [counts, setCounts] = useState(null);
  const generation = useRef(0);
  async function load(append, version) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ filter, groupBy: "wallet" });
      if (append && cursor) params.set("before", cursor);
      const data = await api("/api/history?" + params);
      if (version !== generation.current) return;
      setRecords((current) =>
        append ? [...current, ...data.records] : data.records,
      );
      setCursor(data.nextCursor);
      setCounts({ total: data.totalCount, all: data.totalWalletCount });
    } catch (error) {
      if (version === generation.current) setError(error.message);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const version = ++generation.current;
    setRecords([]);
    setCursor(null);
    setCounts(null);
    load(false, version);
    return () => {
      generation.current++;
    };
  }, [filter, refresh, refreshKey]);
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
          {counts ? `已加载 ${records.length} / 共 ${counts.total} 条记录${filter !== "all" ? `（全部 ${counts.all} 条）` : ""}${loading ? " · 加载中…" : ""}` : loading ? "正在读取历史记录…" : ""}
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
                          item.records.map((child) =>
                            child.id === updated.id ? updated : child,
                          ),
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
              {filter === "all"
                ? "暂无记录，查询余额后会自动保存。"
                : "没有符合筛选条件的记录。"}
            </Hint>
          </div>
        )}
        {cursor && (
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => load(true, generation.current)}
          >
            {loading ? busyIcon : null}加载更多
          </Button>
        )}
        <Hint>
          历史保存在本地服务端，换浏览器或内网设备也可查看。加载更多会保留已加载记录。
        </Hint>
      </CardContent>
    </Card>
  );
}

function App() {
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

rpcCapabilities.useStorage({
  read: () => JSON.parse(localStorage.getItem("wallet-lab-rpc-capabilities-v1") ?? "[]"),
  write: entries => localStorage.setItem("wallet-lab-rpc-capabilities-v1", JSON.stringify(entries)),
});
setNonce(document.querySelector('meta[name="style-nonce"]')?.content);
createRoot(document.getElementById("root")).render(<App />);
