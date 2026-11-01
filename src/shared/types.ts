export type Source = "mnemonic" | "private" | "address";
export type QueryStatus = "unqueried" | "pending" | "success" | "error";
export interface Chain {
  name: string;
  symbol: string;
  rpc: string;
  id?: number;
  family?: "bitcoin" | "solana" | "tron";
  path?: string;
  disabled?: boolean;
}
export interface TokenDefinition {
  address: string;
  symbol: string;
  decimals: number;
  source?: string;
  program?: string;
}
export interface AssetBalance {
  address: string;
  symbol: string;
  status: QueryStatus;
  balance?: string;
  scope?: string;
  reason?: string;
  error?: string;
}
export interface QueryResult {
  network: string;
  status: QueryStatus;
  native?: string;
  symbol?: string;
  block?: string;
  path?: string;
  address?: string;
  note?: string;
  error?: string;
  assets?: AssetBalance[];
  tokenBalance?: string;
  tokenError?: string;
}
export interface BalanceResponse {
  native: string;
  symbol: string;
  block: string;
  note?: string;
  token?: { balance: string; decimals?: number; symbol?: string; address?: string };
  tokenError?: string;
  assets?: AssetBalance[];
}
export interface DerivedWallet {
  address: string;
  privateKey: string | null;
  path?: string;
}
export interface QueryGroup extends DerivedWallet {
  source: Source;
  networks: string[];
}
export interface QueryPlan {
  names: string[];
  wallets: Record<string, DerivedWallet>;
  groups: QueryGroup[];
}
export interface QueryInput {
  mode: string;
  selected?: string;
  phrase?: string;
  wordCount?: number;
  privateKey?: string;
  address?: string;
}
export interface HistoryInput extends QueryGroup {
  mnemonic?: string | null;
  token?: string | null;
  triggerType?: string;
}
export interface BrowserInfo {
  userAgent?: string;
  platform?: string;
}
export interface HistoryRecord {
  id: string;
  cursor: number;
  createdAt: string;
  address: string;
  queryVersion: string;
  walletId: string;
  triggerType: string;
  source: Source;
  networks: string[];
  results: QueryResult[];
  publicTestWallet: boolean;
  hasPrivateKey: boolean;
  hasMnemonic: boolean;
  token: string | null;
  createdBrowser: BrowserInfo | null;
  lastBrowser: BrowserInfo | null;
}
export interface WalletHistoryRecord {
  id: string;
  cursor: number;
  createdAt: string;
  triggerType: string;
  source: Source;
  hasPrivateKey: boolean;
  hasMnemonic: boolean;
  publicTestWallet: boolean;
  networks: string[];
  results: QueryResult[];
  records: HistoryRecord[];
}
export interface GenerationStatus {
  paused: boolean;
  generatedCount: number;
  lastCreatedAt: string | null;
  lastError: string | null;
  intervalMs: number;
  wordCount: number;
  running: boolean;
  nextRunAt: string | null;
  balances?: { remainingRecords: number; activeRecords: number; lastError: string | null };
}
export interface AssetEntry {
  network: string;
  symbol: string;
  balance: string;
  status: string;
  contract?: string | null;
  scope?: string | null;
  error?: string;
  row: QueryResult;
}
export interface AssetGroup {
  id: string;
  label: string;
  rank: number;
  entries: AssetEntry[];
  totals: { symbol: string; balance: string | null }[];
  positive: boolean;
  incomplete: boolean;
  networks: number;
}
export interface CapabilityEntry {
  key: string;
  reason: string;
  expires: number;
}
export class RpcError extends Error {
  retryable?: boolean;
  probeContract?: boolean;
  code?: string;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}
