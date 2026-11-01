import { rpcCapabilities } from "../shared/rpc-capabilities.ts";
import { setNonce } from "get-nonce";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
rpcCapabilities.useStorage({
  read: () => JSON.parse(localStorage.getItem("wallet-lab-rpc-capabilities-v1") ?? "[]"),
  write: (entries) =>
    localStorage.setItem("wallet-lab-rpc-capabilities-v1", JSON.stringify(entries)),
});
setNonce(document.querySelector<HTMLMetaElement>('meta[name="style-nonce"]')?.content ?? "");
createRoot(document.getElementById("root")!).render(<App />);
