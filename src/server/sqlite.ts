import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { Source } from "../shared/types.ts";

// Shape of the persisted schema and the scalar projections used by this store.
// Each SQL statement reads only the columns it selects; raw SQLite values stop here.
export interface DatabaseRow {
  id: string;
  owner: string;
  seq: number;
  created_at: string;
  address: string;
  secret: string | null;
  source: Source;
  networks: string;
  token: string | null;
  results: string;
  mnemonic_secret: string | null;
  key_fingerprint: string | null;
  query_version: string;
  address_fingerprint: string | null;
  trigger_type: string;
  wallet_group: string;
  created_browser: string | null;
  last_browser: string | null;
  balance_started_at: string | null;
  identity: string;
  ticket: string;
  target_id: string | null;
  browser: string;
  started_at: string;
  name: string;
  user_version: number;
  count: number;
  cursor: number;
  wallet_id: string;
  value: string;
}
export function openDatabase(path: string) {
  const database = new DatabaseSync(path);
  return {
    exec: (sql: string) => database.exec(sql),
    close: () => database.close(),
    prepare(sql: string) {
      const statement = database.prepare(sql);
      return {
        all: (...params: SQLInputValue[]) => statement.all(...params) as unknown as DatabaseRow[],
        get: (...params: SQLInputValue[]) =>
          statement.get(...params) as unknown as DatabaseRow | undefined,
        run: (...params: SQLInputValue[]) => statement.run(...params),
      };
    },
  };
}
