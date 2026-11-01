import React, { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';

export function PwaInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workerError, setWorkerError] = useState(false);
  const secure = window.isSecureContext;

  useEffect(() => {
    let active = true;
    const media = window.matchMedia('(display-mode: standalone)');
    const detect = () => setInstalled(media.matches || navigator.standalone === true);
    const ready = event => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const complete = () => { setInstalled(true); setInstallPrompt(null); setOpen(false); };
    detect();
    media.addEventListener('change', detect);
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', complete);
    if (secure && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
        if (active) setWorkerError(true);
      });
    }
    return () => {
      active = false;
      media.removeEventListener('change', detect);
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', complete);
    };
  }, [secure]);

  async function install() {
    if (!installPrompt) { setOpen(true); return; }
    setBusy(true);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } catch {
      setInstallPrompt(null);
      setOpen(true);
    } finally { setBusy(false); }
  }

  if (installed) return null;
  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={install}>
        <Download className="size-4" />安装应用
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Smartphone className="size-5 text-primary" />安装 Wallet Lab</DialogTitle>
            <DialogDescription>添加到手机桌面，下次直接从图标打开。</DialogDescription>
          </DialogHeader>
          {!secure && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">当前通过 HTTP 访问。手机完整安装 PWA 和启用断线页面需要受信任的 HTTPS 地址，普通局域网 IP 的 HTTP 地址无法启用这些功能。</p>}
          <div className="space-y-4 text-sm">
            <div><p className="font-medium">iPhone / iPad</p><p className="mt-1 text-muted-foreground">在 Safari 打开页面，点击“分享” → “添加到主屏幕” → “添加”。如果有“作为 Web App 打开”选项，请开启。</p></div>
            <div><p className="font-medium">Android</p><p className="mt-1 text-muted-foreground">在 Chrome 或 Edge 打开页面，点击浏览器菜单 → “安装应用”或“添加到主屏幕”。浏览器支持时，也可以直接点击本站的安装按钮。</p></div>
            <p className="text-xs text-muted-foreground">安装后，查询和历史记录仍需连接当前本地服务。请在与电脑可互通的网络中使用。</p>
            {workerError && <p className="text-xs text-amber-800">断线页面暂未准备好，联网功能可正常使用，请刷新后重试。</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
