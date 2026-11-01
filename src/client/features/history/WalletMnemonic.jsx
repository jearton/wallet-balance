import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { api } from "../../lib/history-client.js";
import { Button } from "../../components/ui/button";
import { Hint, Status, busyIcon } from "../../components/common.jsx";
import { copyText } from "../../lib/clipboard.js";
export function WalletMnemonic({ wallet }) {
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
