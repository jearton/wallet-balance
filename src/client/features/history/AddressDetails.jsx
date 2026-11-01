import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { CHAINS } from "../../../shared/wallet.mjs";
import { api } from "../../lib/history-client.js";
import { Button } from "../../components/ui/button";
import { Hint, Status, busyIcon } from "../../components/common.jsx";
export function AddressDetails({ record }) {
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
