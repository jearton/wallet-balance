import { readHistoryBalances } from "../../../shared/history-query.mjs";
import { useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { groupAssets, assetGroupSummary } from "../../../shared/asset-groups.mjs";
import { CHAINS, CHAIN_ORDER } from "../../../shared/wallet.mjs";
import { summarizeHistoryBalance } from "../../../shared/history-summary.mjs";
import { api, saveResults } from "../../lib/history-client.js";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../components/ui/select";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../../components/ui/collapsible";
import { Hint, Status, IconBadge, busyIcon } from "../../components/common.jsx";
import { WalletMnemonic } from "./WalletMnemonic.jsx";
import { AddressDetails } from "./AddressDetails.jsx";
import { AssetBalances } from "../balances/AssetBalances.jsx";
export function WalletHistory({ wallet, onUpdated }) {
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
