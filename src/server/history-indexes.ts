import type { openDatabase } from "./sqlite.ts";
import type { QueryResult } from "../shared/types.ts";
import { summarizeHistoryBalance } from "../shared/history-summary.ts";
import { CHAIN_ORDER } from "../shared/wallet.ts";

export function openHistoryIndexes(db: ReturnType<typeof openDatabase>) {
  const group = "COALESCE(wallet_group,id)";
  const groupFor = (row: string) => `COALESCE(${row}.wallet_group,${row}.id)`;
  const networks = CHAIN_ORDER.map((name) => "'" + name.replaceAll("'", "''") + "'").join(",");
  const queue = (row: string) => `SELECT ${row}.id,${row}.seq,
    MAX(CASE WHEN json_extract(r.value,'$.status')='unqueried' THEN 1 ELSE 0 END)
    FROM json_each(${row}.results) r
    WHERE json_extract(r.value,'$.status') IN ('pending','unqueried')
      AND json_extract(r.value,'$.network') IN (${networks})
    HAVING COUNT(*) > 0`;
  if (db.prepare("PRAGMA user_version").get()!.user_version < 11) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`
        DROP TRIGGER IF EXISTS history_index_insert;
        DROP TRIGGER IF EXISTS history_index_update;
        DROP TRIGGER IF EXISTS history_index_delete;
        DROP TABLE IF EXISTS balance_pending;
        DROP TABLE IF EXISTS wallet_dirty;
        DROP TABLE IF EXISTS wallet_summary;
        CREATE INDEX IF NOT EXISTS history_group_cursor ON history(${group},seq DESC);
        CREATE TABLE balance_pending (id TEXT PRIMARY KEY, seq INTEGER NOT NULL UNIQUE, unqueried INTEGER NOT NULL);
        CREATE TABLE wallet_dirty (id TEXT PRIMARY KEY);
        CREATE TABLE wallet_summary (
          wallet_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL, state TEXT NOT NULL, has_key INTEGER NOT NULL
        );
        CREATE INDEX wallet_summary_cursor ON wallet_summary(cursor DESC);
        CREATE INDEX wallet_summary_state_cursor ON wallet_summary(state,cursor DESC);
        CREATE INDEX wallet_summary_key_cursor ON wallet_summary(has_key,cursor DESC);
        CREATE INDEX wallet_summary_key_state_cursor ON wallet_summary(has_key,state,cursor DESC);
        INSERT INTO wallet_dirty SELECT DISTINCT ${group} FROM history;
        INSERT INTO balance_pending
          SELECT h.id,h.seq,MAX(CASE WHEN json_extract(r.value,'$.status')='unqueried' THEN 1 ELSE 0 END)
          FROM history h, json_each(h.results) r WHERE json_extract(r.value,'$.status') IN ('pending','unqueried')
            AND json_extract(r.value,'$.network') IN (${networks}) GROUP BY h.id,h.seq;
        CREATE TRIGGER history_index_insert AFTER INSERT ON history BEGIN
          INSERT OR IGNORE INTO wallet_dirty VALUES (${groupFor("NEW")});
          INSERT INTO balance_pending ${queue("NEW")};
        END;
        CREATE TRIGGER history_index_update AFTER UPDATE OF wallet_group,seq,results,secret,token ON history BEGIN
          INSERT OR IGNORE INTO wallet_dirty VALUES (${groupFor("OLD")});
          INSERT OR IGNORE INTO wallet_dirty VALUES (${groupFor("NEW")});
          DELETE FROM balance_pending WHERE id=OLD.id;
          INSERT INTO balance_pending ${queue("NEW")};
        END;
        CREATE TRIGGER history_index_delete AFTER DELETE ON history BEGIN
          INSERT OR IGNORE INTO wallet_dirty VALUES (${groupFor("OLD")});
          DELETE FROM balance_pending WHERE id=OLD.id;
        END;
        PRAGMA user_version=11;
        COMMIT;
      `);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const nextDirty = db.prepare("SELECT id FROM wallet_dirty LIMIT ?");
  const groupRows = db.prepare(`SELECT seq,results,token,secret IS NOT NULL AS has_key
    FROM history WHERE ${group}=? ORDER BY seq DESC`);
  const upsert = db.prepare(`INSERT INTO wallet_summary VALUES (?,?,?,?)
    ON CONFLICT(wallet_id) DO UPDATE SET cursor=excluded.cursor,state=excluded.state,has_key=excluded.has_key`);
  const removeSummary = db.prepare("DELETE FROM wallet_summary WHERE wallet_id=?");
  const clean = db.prepare("DELETE FROM wallet_dirty WHERE id=?");
  function refresh(limit: number) {
    if (!nextDirty.get(1)) return 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      const dirty = nextDirty.all(limit);
      for (const { id } of dirty) {
        const rows = groupRows.all(id);
        if (!rows.length) removeSummary.run(id);
        else {
          const results = rows.map(
            (row) =>
              summarizeHistoryBalance({
                results: JSON.parse(row.results) as QueryResult[],
                token: row.token,
              }).state,
          );
          const state = results.includes("positive")
            ? "positive"
            : results.includes("zero")
              ? "zero"
              : "unknown";
          upsert.run(id, rows[0].seq, state, rows.some((row) => Boolean(row.has_key)) ? 1 : 0);
        }
        clean.run(id);
      }
      db.exec("COMMIT");
      return dirty.length;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return { refresh };
}
