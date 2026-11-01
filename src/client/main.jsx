import { rpcCapabilities } from "../shared/rpc-capabilities.mjs";
import { setNonce } from "get-nonce";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
rpcCapabilities.useStorage({
  read: () => JSON.parse(localStorage.getItem("wallet-lab-rpc-capabilities-v1") ?? "[]"),
  write: entries => localStorage.setItem("wallet-lab-rpc-capabilities-v1", JSON.stringify(entries)),
});
setNonce(document.querySelector('meta[name="style-nonce"]')?.content);
createRoot(document.getElementById("root")).render(<App />);
