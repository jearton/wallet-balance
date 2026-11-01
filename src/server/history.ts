import type { CapabilityEntry, GenerationStatus } from "../shared/types.ts";
type GenerationSnapshot = Pick<
  GenerationStatus,
  "paused" | "generatedCount" | "lastCreatedAt" | "lastError"
>;
import type {
  HistoryRecord,
  WalletHistoryRecord,
  HistoryInput,
  QueryResult,
  BrowserInfo,
} from "../shared/types.ts";
import { successfulResults } from "../shared/query-results.ts";
import { privateKeyIdentity } from "../shared/non-evm.ts";
import { summarizeWalletRecords } from "../shared/wallet-history.ts";
import { isPublicTestWallet } from "../shared/public-test-wallets.ts";
import { HISTORY_FILTERS, matchesHistoryFilter } from "../shared/history-summary.ts";
import { openDatabase } from "./sqlite.ts";
import type { DatabaseRow } from "./sqlite.ts";
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { getAddress } from "ethers";
import { validateMnemonic } from "../shared/mnemonic.ts";
import { createQueryPlan } from "../shared/query-plan.ts";
import { CHAINS, CHAIN_ORDER, validateAddress, walletFromPrivateKey } from "../shared/wallet.ts";

export function ownerId(token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("历史记录凭据无效。");
  return createHash("sha256").update(token).digest("hex");
}

export function openHistory(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const keyPath = join(directory, "history.key");
  const databasePath = join(directory, "history.sqlite");
  if (!existsSync(keyPath)) {
    if (existsSync(databasePath)) throw new Error("历史记录加密密钥缺失，请恢复原密钥文件。");
    writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
  }
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error("历史记录加密密钥格式无效。");
  const db = openDatabase(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS history (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, created_at TEXT NOT NULL,
      address TEXT NOT NULL, secret TEXT, source TEXT NOT NULL,
      networks TEXT NOT NULL, token TEXT, results TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS history_owner_seq ON history(owner, seq DESC);`);

  if (
    !db
      .prepare("PRAGMA table_info(history)")
      .all()
      .some((column) => column.name === "mnemonic_secret")
  ) {
    db.exec("ALTER TABLE history ADD COLUMN mnemonic_secret TEXT");
  }

  function encrypt(value: string | null | undefined, aad: string) {
    if (!value) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: ciphertext.toString("base64"),
    });
  }
  function publicRecord(row: DatabaseRow | undefined): HistoryRecord {
    if (!row) throw new Error("历史记录不存在。");
    const publicTestWallet = isPublicTestWallet({
      networks: JSON.parse(row.networks),
      address: row.address,
    });
    return {
      id: row.id,
      cursor: row.seq,
      createdAt: row.created_at,
      address: row.address,
      queryVersion: row.query_version,
      publicTestWallet,
      walletId: row.wallet_group ?? row.id,
      triggerType: row.trigger_type ?? "unknown",
      hasPrivateKey: Boolean(row.secret),
      hasMnemonic: Boolean(row.mnemonic_secret),
      source: row.source,
      networks: JSON.parse(row.networks),
      createdBrowser: row.created_browser ? JSON.parse(row.created_browser) : null,
      lastBrowser: row.last_browser ? JSON.parse(row.last_browser) : null,
      token: row.token,
      results: JSON.parse(row.results),
    };
  }
  function decrypt(secret: string | null | undefined, aad: string) {
    if (!secret) return null;
    const payload = JSON.parse(secret);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
  function fingerprint(secret: string, networks: string[]) {
    const family = CHAINS[networks[0]].family ?? "evm";
    return createHmac("sha256", key)
      .update(
        JSON.stringify([
          "wallet-history-v1",
          family,
          ["evm", "tron"].includes(family) ? secret.toLowerCase() : secret,
        ]),
      )
      .digest("hex");
  }
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(history)")
      .all()
      .map((column) => column.name),
  );
  if (
    db.prepare("PRAGMA user_version").get()!.user_version < 2 ||
    !columns.has("key_fingerprint")
  ) {
    const backup = join(directory, "history-before-shared.sqlite");
    if (!existsSync(backup)) {
      db.prepare("VACUUM INTO ?").run(backup);
      chmodSync(backup, 0o600);
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const name of ["key_fingerprint", "query_version", "created_browser", "last_browser"]) {
        if (!columns.has(name)) db.exec(`ALTER TABLE history ADD COLUMN ${name} TEXT`);
      }
      db.exec(
        "DROP INDEX IF EXISTS history_owner_private_key; DROP INDEX IF EXISTS history_private_key",
      );
      const seen = new Map();
      for (const row of db.prepare("SELECT * FROM history ORDER BY seq DESC").all()) {
        const networks = JSON.parse(row.networks);
        const secret = decrypt(row.secret, row.owner + row.id);
        const hash = secret ? fingerprint(secret, networks) : null;
        const latest = hash ? seen.get(hash) : null;
        if (latest) {
          if (!latest.mnemonic_secret && row.mnemonic_secret) {
            latest.mnemonic_secret = encrypt(
              decrypt(row.mnemonic_secret, row.owner + row.id + ":mnemonic"),
              latest.owner + latest.id + ":mnemonic",
            );
            db.prepare("UPDATE history SET mnemonic_secret=? WHERE id=?").run(
              latest.mnemonic_secret,
              latest.id,
            );
          }
          db.prepare("DELETE FROM history WHERE id=?").run(row.id);
        } else {
          db.prepare("UPDATE history SET key_fingerprint=?,query_version=? WHERE id=?").run(
            hash,
            row.query_version ?? randomUUID(),
            row.id,
          );
          if (hash) seen.set(hash, row);
        }
      }
      db.exec(
        "CREATE UNIQUE INDEX history_private_key ON history(key_fingerprint) WHERE key_fingerprint IS NOT NULL; PRAGMA user_version=2; COMMIT",
      );
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      key.fill(0);
      throw error;
    }
  }
  // Public-address lookups have a separate identity from records containing keys.
  function addressFingerprint(address: string, networks: string[]) {
    const chain = CHAINS[networks[0]];
    const normalized = validateAddress(chain, address);
    return createHmac("sha256", key)
      .update(
        JSON.stringify([
          "wallet-address-v1",
          chain.family ?? "evm",
          chain.family ? normalized : normalized.toLowerCase(),
        ]),
      )
      .digest("hex");
  }
  const addressColumns = new Set(
    db
      .prepare("PRAGMA table_info(history)")
      .all()
      .map((column) => column.name),
  );
  if (
    db.prepare("PRAGMA user_version").get()!.user_version < 3 ||
    !addressColumns.has("address_fingerprint")
  ) {
    const backup = join(directory, "history-before-address-dedup.sqlite");
    if (!existsSync(backup)) {
      db.prepare("VACUUM INTO ?").run(backup);
      chmodSync(backup, 0o600);
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!addressColumns.has("address_fingerprint"))
        db.exec("ALTER TABLE history ADD COLUMN address_fingerprint TEXT");
      db.exec("DROP INDEX IF EXISTS history_public_address");
      const seen = new Map();
      for (const row of db
        .prepare("SELECT * FROM history WHERE secret IS NULL ORDER BY seq DESC")
        .all()) {
        const hash = addressFingerprint(row.address, JSON.parse(row.networks));
        const latest = seen.get(hash);
        if (latest) {
          if (row.created_browser)
            db.prepare("UPDATE history SET created_browser=? WHERE id=?").run(
              row.created_browser,
              latest.id,
            );
          db.prepare("DELETE FROM history WHERE id=?").run(row.id);
        } else {
          db.prepare(
            "UPDATE history SET address_fingerprint=?,query_version=COALESCE(query_version,?) WHERE id=?",
          ).run(hash, randomUUID(), row.id);
          seen.set(hash, row);
        }
      }
      db.exec(
        "CREATE UNIQUE INDEX history_public_address ON history(address_fingerprint) WHERE address_fingerprint IS NOT NULL AND secret IS NULL; PRAGMA user_version=3; COMMIT",
      );
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      key.fill(0);
      throw error;
    }
  }
  if (
    !db
      .prepare("PRAGMA table_info(history)")
      .all()
      .some((column) => column.name === "trigger_type")
  ) {
    db.exec(
      "ALTER TABLE history ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'unknown' CHECK(trigger_type IN ('manual','automatic','unknown'))",
    );
  }
  db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  function mnemonicGroup(phrase: string) {
    return createHmac("sha256", key)
      .update(JSON.stringify(["wallet-mnemonic-v1", phrase]))
      .digest("hex");
  }
  if (
    !db
      .prepare("PRAGMA table_info(history)")
      .all()
      .some((column) => column.name === "wallet_group")
  ) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("ALTER TABLE history ADD COLUMN wallet_group TEXT");
      for (const row of db.prepare("SELECT id,owner,mnemonic_secret FROM history").all()) {
        const group = row.mnemonic_secret
          ? mnemonicGroup(decrypt(row.mnemonic_secret, row.owner + row.id + ":mnemonic")!)
          : row.id;
        db.prepare("UPDATE history SET wallet_group=? WHERE id=?").run(group, row.id);
      }
      db.exec("CREATE INDEX history_wallet_group ON history(wallet_group,seq DESC); COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      key.fill(0);
      throw error;
    }
  }
  if (
    !db
      .prepare("PRAGMA table_info(history)")
      .all()
      .some((column) => column.name === "balance_started_at")
  ) {
    db.exec("ALTER TABLE history ADD COLUMN balance_started_at TEXT");
  }
  function privateGroup(secret: string, networks: string[]) {
    const identity = privateKeyIdentity(CHAINS[networks[0]].family ?? "evm", secret);
    return createHmac("sha256", key)
      .update(JSON.stringify(["wallet-private-input-v1", identity]))
      .digest("hex");
  }
  if (db.prepare("PRAGMA user_version").get()!.user_version < 9) {
    const backup = join(directory, "history-before-input-grouping.sqlite");
    if (!existsSync(backup)) {
      db.prepare("VACUUM INTO ?").run(backup);
      chmodSync(backup, 0o600);
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of db.prepare("SELECT * FROM history").all()) {
        const group = row.mnemonic_secret
          ? (row.wallet_group ??
            mnemonicGroup(decrypt(row.mnemonic_secret, row.owner + row.id + ":mnemonic")!))
          : row.secret
            ? privateGroup(decrypt(row.secret, row.owner + row.id)!, JSON.parse(row.networks))
            : row.id;
        db.prepare("UPDATE history SET wallet_group=? WHERE id=?").run(group, row.id);
      }
      db.exec(
        "DROP INDEX IF EXISTS history_private_key; CREATE UNIQUE INDEX history_private_key ON history(wallet_group,key_fingerprint) WHERE key_fingerprint IS NOT NULL; PRAGMA user_version=9; COMMIT",
      );
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      key.fill(0);
      throw error;
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS query_reservations (
    identity TEXT PRIMARY KEY, ticket TEXT NOT NULL UNIQUE, started_at TEXT NOT NULL,
    target_id TEXT, networks TEXT NOT NULL, token TEXT, browser TEXT, trigger_type TEXT NOT NULL
  )`);
  if (db.prepare("PRAGMA user_version").get()!.user_version < 10) db.exec("PRAGMA user_version=10");
  function queryIdentity(group: string | null, hash: string | null) {
    return createHmac("sha256", key)
      .update(JSON.stringify(["query-reservation-v1", group, hash]))
      .digest("hex");
  }
  function identityForInput({
    secret,
    mnemonic,
    networks,
    address,
  }: ReturnType<typeof validateInput>) {
    return secret
      ? queryIdentity(
          mnemonic ? mnemonicGroup(mnemonic) : privateGroup(secret, networks),
          fingerprint(secret, networks),
        )
      : queryIdentity(null, addressFingerprint(address, networks));
  }
  function identityForRow(row: DatabaseRow) {
    return row.secret
      ? queryIdentity(row.wallet_group, row.key_fingerprint)
      : queryIdentity(null, row.address_fingerprint);
  }
  function reserve(
    identity: string,
    networks: string[],
    contract: string | null,
    browser: BrowserInfo | undefined,
    trigger: string,
    targetId: string | null = null,
  ) {
    const ticket = randomUUID();
    db.prepare("DELETE FROM query_reservations WHERE started_at < ?").run(
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    );
    db.prepare(
      `INSERT INTO query_reservations (identity,ticket,started_at,target_id,networks,token,browser,trigger_type)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(identity) DO UPDATE SET ticket=excluded.ticket,started_at=excluded.started_at,
      target_id=excluded.target_id,networks=excluded.networks,token=excluded.token,browser=excluded.browser,trigger_type=excluded.trigger_type`,
    ).run(
      identity,
      ticket,
      new Date().toISOString(),
      targetId,
      JSON.stringify(networks),
      contract,
      browserInfo(browser),
      trigger,
    );
    return ticket;
  }
  function triggerType(value: unknown) {
    const trigger = value ?? "manual";
    if (typeof trigger !== "string" || !["manual", "automatic"].includes(trigger))
      throw new Error("触发方式无效。");
    return trigger;
  }
  function browserInfo(value: BrowserInfo | undefined) {
    return JSON.stringify({
      userAgent: typeof value?.userAgent === "string" ? value.userAgent.slice(0, 512) : "未记录",
      platform: typeof value?.platform === "string" ? value.platform.slice(0, 80) : "",
    });
  }
  function bumpSequence() {
    return (
      Number(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='history'").get()?.seq ?? 0) + 1
    );
  }
  function updateRecord(
    row: DatabaseRow,
    values: {
      createdAt: string;
      queryVersion: string;
      address: string;
      networks: string;
      token: string | null;
      results: string;
      mnemonicSecret: string | null;
      source: string;
    },
  ) {
    const seq = bumpSequence();
    db.prepare(
      "UPDATE history SET balance_started_at=NULL,seq=?,created_at=?,query_version=?,address=?,networks=?,token=?,results=?,mnemonic_secret=?,source=? WHERE id=?",
    ).run(
      seq,
      values.createdAt,
      values.queryVersion,
      values.address,
      values.networks,
      values.token,
      values.results,
      values.mnemonicSecret,
      values.source,
      row.id,
    );
    db.prepare("UPDATE sqlite_sequence SET seq=? WHERE name='history'").run(seq);
  }
  function resultsFor(results: QueryResult[], networks: string[]): QueryResult[] {
    if (!Array.isArray(results) || results.length !== networks.length)
      throw new Error("查询结果格式无效。");
    return networks.map((network) => {
      const row = results.find((result) => result?.network === network);
      if (!row || !["pending", "success", "error", "unqueried"].includes(row.status))
        throw new Error("查询结果格式无效。");
      const output: QueryResult = { network, status: row.status };
      for (const field of [
        "native",
        "symbol",
        "block",
        "tokenBalance",
        "tokenError",
        "error",
        "note",
        "path",
      ] as const) {
        if (row[field] !== undefined) {
          if (typeof row[field] !== "string" || row[field].length > 500)
            throw new Error("查询结果格式无效。");
          output[field] = row[field];
        }
      }
      if (row.assets !== undefined) {
        if (!Array.isArray(row.assets) || row.assets.length > 30) throw new Error("代币结果无效。");
        const seen = new Set();
        output.assets = row.assets.map((asset) => {
          if (
            !asset ||
            !["success", "error"].includes(asset.status) ||
            typeof asset.address !== "string" ||
            asset.address.length > 100 ||
            typeof asset.symbol !== "string" ||
            asset.symbol.length > 60 ||
            seen.has(asset.address)
          )
            throw new Error("代币结果无效。");
          seen.add(asset.address);
          if (
            asset.status === "success" &&
            (typeof asset.balance !== "string" ||
              !/^\d+(?:\.\d+)?$/.test(asset.balance) ||
              asset.balance.length > 150)
          )
            throw new Error("代币余额无效。");
          return {
            address: asset.address,
            symbol: asset.symbol,
            status: asset.status,
            ...(asset.scope === "associated" ? { scope: "associated" } : {}),
            ...(asset.reason === "authority-mismatch" ? { reason: "authority-mismatch" } : {}),
            ...(asset.status === "success"
              ? { balance: asset.balance }
              : {
                  error:
                    asset.reason === "authority-mismatch"
                      ? "关联代币账户的控制权限与钱包地址不匹配。"
                      : "代币查询失败或节点限流，请重试。",
                }),
          };
        });
      }
      return output;
    });
  }
  function validateInput(input: HistoryInput) {
    const trigger = triggerType(input.triggerType);
    const networks = input.networks;
    if (
      !Array.isArray(networks) ||
      !networks.length ||
      networks.length > Object.keys(CHAINS).length ||
      new Set(networks).size !== networks.length ||
      networks.some((name) => !CHAIN_ORDER.includes(name))
    ) {
      throw new Error("查询网络无效。");
    }
    const chain = CHAINS[networks[0]];
    if (networks.some((network) => CHAINS[network].family !== chain.family))
      throw new Error("不同地址体系需分别保存查询记录。");
    const address = validateAddress(chain, input.address);
    if (!["mnemonic", "private", "address"].includes(input.source))
      throw new Error("钱包来源无效。");
    let secret: string | null = null;
    if (input.source !== "address") {
      if (typeof input.privateKey !== "string") throw new Error("需要对应网络的私钥。");
      const wallet = walletFromPrivateKey(chain, input.privateKey);
      if (wallet.address !== address) throw new Error("私钥与钱包地址不匹配。");
      secret = wallet.privateKey;
    } else if (input.privateKey != null) throw new Error("公开地址查询不能附带私钥。");
    let mnemonic: string | null = null;
    if (input.mnemonic != null) {
      if (input.source !== "mnemonic") throw new Error("只有助记词查询可以保存助记词。");
      mnemonic = validateMnemonic(input.mnemonic);
      const derived = createQueryPlan({ mode: "mnemonic", selected: networks[0], phrase: mnemonic })
        .groups[0];
      if (derived.address !== address || derived.privateKey !== secret)
        throw new Error("助记词与钱包不匹配。");
    }
    let contract: string | null = null;
    if (input.token) {
      if (chain.family) throw new Error("该网络暂不支持 ERC-20 查询。");
      try {
        contract = getAddress(input.token);
      } catch {
        throw new Error("代币合约格式无效。");
      }
      if (networks.length !== 1) throw new Error("代币查询必须指定单个网络。");
    }
    return { trigger, networks, address, secret, mnemonic, contract };
  }
  return {
    create(
      token: unknown,
      input: HistoryInput,
      browser?: BrowserInfo,
      {
        unqueried = false,
        completedResults,
        queryTicket,
      }: { unqueried?: boolean; completedResults?: QueryResult[]; queryTicket?: string } = {},
    ) {
      const validated = validateInput(input);
      const { trigger, address, secret, mnemonic, contract } = validated;
      let { networks } = validated;
      let owner = "shared";
      const cleaned =
        completedResults === undefined
          ? null
          : successfulResults(resultsFor(completedResults, networks));
      db.exec("BEGIN IMMEDIATE");
      try {
        const hash = secret ? fingerprint(secret, networks) : null;
        const addressHash = secret ? null : addressFingerprint(address, networks);
        const inputGroup = mnemonic
          ? mnemonicGroup(mnemonic)
          : secret
            ? privateGroup(secret, networks)
            : null;
        const legacyMnemonic =
          !mnemonic && input.source === "mnemonic"
            ? db
                .prepare(
                  "SELECT * FROM history WHERE key_fingerprint=? AND mnemonic_secret IS NOT NULL ORDER BY seq DESC LIMIT 1",
                )
                .get(hash)
            : null;
        const existing = hash
          ? (legacyMnemonic ??
            db
              .prepare("SELECT * FROM history WHERE wallet_group=? AND key_fingerprint=?")
              .get(inputGroup, hash))
          : db
              .prepare("SELECT * FROM history WHERE address_fingerprint=? AND secret IS NULL")
              .get(addressHash);
        if (completedResults !== undefined) {
          const reservation = db
            .prepare("SELECT * FROM query_reservations WHERE identity=? AND ticket=?")
            .get(identityForInput(validated), queryTicket ?? null);
          if (
            !reservation ||
            (reservation.target_id && reservation.target_id !== existing?.id) ||
            reservation.networks !== JSON.stringify(networks) ||
            reservation.token !== contract
          )
            throw new Error("查询已被更新的请求取代。");
          if (!cleaned!.length) {
            db.exec("COMMIT");
            return { saved: false };
          }
          networks = cleaned!.map((row) => row.network);
        }
        owner = existing?.owner ?? owner;
        const id = existing?.id ?? randomUUID();
        const createdAt = new Date().toISOString();
        const queryVersion = queryTicket ?? randomUUID();
        const pending = JSON.stringify(
          cleaned ??
            networks.map((network) => ({
              network,
              status: unqueried ? "unqueried" : "pending",
              ...(unqueried && input.path ? { path: input.path } : {}),
            })),
        );
        const mnemonicSecret = mnemonic
          ? encrypt(mnemonic, owner + id + ":mnemonic")
          : (existing?.mnemonic_secret ?? null);
        if (existing) {
          updateRecord(existing, {
            createdAt,
            queryVersion,
            address,
            networks: JSON.stringify(networks),
            token: contract,
            results: pending,
            mnemonicSecret,
            source: mnemonicSecret ? "mnemonic" : input.source,
          });
        } else {
          db.prepare(
            "INSERT INTO history (id,owner,created_at,address,secret,source,networks,token,results,mnemonic_secret,key_fingerprint,query_version,address_fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          ).run(
            id,
            owner,
            createdAt,
            address,
            encrypt(secret, owner + id),
            input.source,
            JSON.stringify(networks),
            contract,
            pending,
            mnemonicSecret,
            hash,
            queryVersion,
            addressHash,
          );
        }
        db.prepare(
          "UPDATE history SET created_browser=COALESCE(created_browser,?),last_browser=?,trigger_type=? WHERE id=?",
        ).run(browserInfo(browser), browserInfo(browser), trigger, id);
        db.prepare("UPDATE history SET wallet_group=? WHERE id=?").run(
          legacyMnemonic?.wallet_group ?? inputGroup ?? id,
          id,
        );
        db.exec("COMMIT");
        return {
          id,
          createdAt,
          queryVersion,
          triggerType: trigger,
          ...(cleaned ? { saved: true } : {}),
        };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    reserveQuery(input: HistoryInput, browser?: BrowserInfo) {
      const value = validateInput(input);
      if (input.source === "mnemonic" && !value.mnemonic) throw new Error("需要助记词。");
      const group = value.mnemonic
        ? mnemonicGroup(value.mnemonic)
        : value.secret
          ? privateGroup(value.secret, value.networks)
          : null;
      const existing = value.secret
        ? db
            .prepare("SELECT id FROM history WHERE wallet_group=? AND key_fingerprint=?")
            .get(group, fingerprint(value.secret, value.networks))
        : db
            .prepare("SELECT id FROM history WHERE address_fingerprint=? AND secret IS NULL")
            .get(addressFingerprint(value.address, value.networks));
      const queryTicket = reserve(
        identityForInput(value),
        value.networks,
        value.contract,
        browser,
        value.trigger,
        existing?.id ?? null,
      );
      // Nothing in this table contains a mnemonic, private key, or raw wallet input.
      return { queryTicket };
    },
    prepareRequery(
      token: unknown,
      id: string,
      input: { networks?: string[]; triggerType?: string } = {},
      browser?: BrowserInfo,
    ) {
      const row = db.prepare("SELECT * FROM history WHERE id=?").get(id);
      if (!row) return undefined;
      const oldNetworks = JSON.parse(row.networks) as string[];
      const family = CHAINS[oldNetworks[0]].family;
      const active = oldNetworks.filter((name) => CHAIN_ORDER.includes(name));
      const networks =
        input.networks ??
        (active.length ? active : CHAIN_ORDER.filter((name) => CHAINS[name].family === family));
      if (
        !Array.isArray(networks) ||
        !networks.length ||
        new Set(networks).size !== networks.length ||
        networks.some((name) => !CHAIN_ORDER.includes(name) || CHAINS[name].family !== family)
      )
        throw new Error("重查网络无效。");
      const contract = JSON.stringify(networks) === row.networks ? row.token : null;
      const ticket = reserve(
        identityForRow(row),
        networks,
        contract,
        browser,
        triggerType(input.triggerType),
        id,
      );
      db.prepare("UPDATE history SET query_version=? WHERE id=?").run(ticket, id);
      const previous = JSON.parse(row.results) as QueryResult[];
      return {
        ...publicRecord(row),
        networks,
        token: contract,
        queryVersion: ticket,
        results: networks.map((network) => ({
          network,
          status: "pending",
          ...(previous.find((result) => result.network === network)?.path
            ? { path: previous.find((result) => result.network === network)!.path }
            : {}),
        })),
      };
    },
    commitRequery(token: unknown, id: string, results: QueryResult[], queryVersion: string) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db.prepare("SELECT * FROM history WHERE id=?").get(id);
        const reservation = db
          .prepare("SELECT * FROM query_reservations WHERE target_id=? AND ticket=?")
          .get(id, queryVersion);
        if (
          !row ||
          !reservation ||
          row.query_version !== queryVersion ||
          identityForRow(row) !== reservation.identity
        ) {
          db.exec("COMMIT");
          return null;
        }
        const cleaned = successfulResults(resultsFor(results, JSON.parse(reservation.networks)));
        if (!cleaned!.length) {
          db.exec("COMMIT");
          return { saved: false, record: publicRecord(row) };
        }
        updateRecord(row, {
          createdAt: new Date().toISOString(),
          queryVersion,
          address: row.address,
          networks: JSON.stringify(cleaned.map((result) => result.network)),
          token: reservation.token,
          results: JSON.stringify(cleaned),
          mnemonicSecret: row.mnemonic_secret,
          source: row.source,
        });
        db.prepare("UPDATE history SET last_browser=?,trigger_type=? WHERE id=?").run(
          reservation.browser,
          reservation.trigger_type,
          id,
        );
        const record = publicRecord(db.prepare("SELECT * FROM history WHERE id=?").get(id));
        db.exec("COMMIT");
        return { saved: true, record };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    requery(
      token: unknown,
      previousId: string,
      input: { triggerType?: string; networks?: string[] } = {},
      browser?: BrowserInfo,
    ) {
      const trigger = triggerType(input.triggerType);
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db.prepare("SELECT * FROM history WHERE id=?").get(previousId);
        if (!row) {
          db.exec("COMMIT");
          return undefined;
        }
        const priorNetworks = JSON.parse(row.networks) as string[];
        const activeNetworks = priorNetworks.filter((name) => CHAIN_ORDER.includes(name));
        const networks =
          input.networks ??
          (activeNetworks.length
            ? activeNetworks
            : CHAIN_ORDER.filter(
                (name) => CHAINS[name].family === CHAINS[priorNetworks[0]].family,
              ));
        const family = CHAINS[JSON.parse(row.networks)[0]].family;
        if (
          !Array.isArray(networks) ||
          !networks.length ||
          networks.length > Object.keys(CHAINS).length ||
          new Set(networks).size !== networks.length ||
          networks.some((name) => !CHAIN_ORDER.includes(name) || CHAINS[name].family !== family)
        )
          throw new Error("重查网络与钱包地址体系不匹配。");
        const changed = JSON.stringify(networks) !== row.networks;
        const priorResults = JSON.parse(row.results) as QueryResult[];
        const pending = networks.map((network) => {
          const path = priorResults.find((result) => result.network === network)?.path;
          return { network, status: "pending", ...(path ? { path } : {}) };
        });
        updateRecord(row, {
          createdAt: new Date().toISOString(),
          queryVersion: randomUUID(),
          address: row.address,
          networks: JSON.stringify(networks),
          token: changed ? null : row.token,
          results: JSON.stringify(pending),
          mnemonicSecret: row.mnemonic_secret,
          source: row.source,
        });
        db.prepare("UPDATE history SET last_browser=?,trigger_type=? WHERE id=?").run(
          browserInfo(browser),
          trigger,
          previousId,
        );
        const record = publicRecord(db.prepare("SELECT * FROM history WHERE id=?").get(previousId));
        db.exec("COMMIT");
        return record;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    update(token: unknown, id: string, results: QueryResult[], queryVersion: string) {
      const row = db.prepare("SELECT networks,query_version FROM history WHERE id=?").get(id);
      if (!row || (queryVersion !== undefined && row.query_version !== queryVersion)) return false;
      const cleaned = resultsFor(results, JSON.parse(row.networks));
      db.prepare("UPDATE history SET results=? WHERE id=?").run(JSON.stringify(cleaned), id);
      return true;
    },
    completeBackfill(id: string, results: QueryResult[], queryVersion: string) {
      const row = db.prepare("SELECT networks,query_version FROM history WHERE id=?").get(id);
      if (!row || row.query_version !== queryVersion) return false;
      const cleaned = successfulResults(resultsFor(results, JSON.parse(row.networks)));
      if (!cleaned!.length) return false;
      db.prepare("UPDATE history SET results=?,networks=? WHERE id=? AND query_version=?").run(
        JSON.stringify(cleaned),
        JSON.stringify(cleaned.map((result) => result.network)),
        id,
        queryVersion,
      );
      return true;
    },
    list(token: unknown, before = Number.MAX_SAFE_INTEGER, filter = "all") {
      if (!Number.isSafeInteger(before) || before < 1) throw new Error("分页参数无效。");
      if (!HISTORY_FILTERS.includes(filter)) throw new Error("历史筛选条件无效。");
      const matches: HistoryRecord[] = [];
      let cursor = before;
      // Apply filters across all history, not just the currently loaded page.
      while (matches.length < 21) {
        const rows = db
          .prepare("SELECT * FROM history WHERE seq<? ORDER BY seq DESC LIMIT 100")
          .all(cursor);
        for (const row of rows) {
          const record = publicRecord(row);
          if (matchesHistoryFilter(record, filter)) matches.push(record);
          if (matches.length === 21) break;
        }
        if (rows.length < 100 || matches.length === 21) break;
        cursor = rows.at(-1)!.seq;
      }
      const records = matches.slice(0, 20);
      return { records, nextCursor: matches.length > 20 ? records.at(-1)!.cursor : null };
    },
    listWallets(token: unknown, before = Number.MAX_SAFE_INTEGER, filter = "all") {
      if (!Number.isSafeInteger(before) || before < 1 || !HISTORY_FILTERS.includes(filter))
        throw new Error("分页或筛选参数无效。");
      const totalWalletCount = db
        .prepare("SELECT COUNT(DISTINCT COALESCE(wallet_group,id)) AS count FROM history")
        .get()!.count;
      if (filter !== "all") {
        const grouped = new Map<string, HistoryRecord[]>();
        for (const row of db.prepare("SELECT * FROM history ORDER BY seq DESC").all()) {
          const id = row.wallet_group ?? row.id;
          if (!grouped.has(id)) grouped.set(id, []);
          grouped.get(id)!.push(publicRecord(row));
        }
        const matching = [...grouped]
          .map(([id, rows]) => summarizeWalletRecords(rows, id))
          .filter((wallet) => matchesHistoryFilter(wallet, filter));
        const candidates = matching.filter((wallet) => wallet.cursor < before).slice(0, 21);
        const records = candidates.slice(0, 20);
        return {
          records,
          nextCursor: candidates.length > 20 ? records.at(-1)!.cursor : null,
          totalCount: matching.length,
          totalWalletCount,
        };
      }
      const matches: WalletHistoryRecord[] = [];
      let cursor = before;
      while (matches.length < 21) {
        const groups = db
          .prepare(
            "SELECT COALESCE(wallet_group,id) AS wallet_id,MAX(seq) AS cursor FROM history GROUP BY COALESCE(wallet_group,id) HAVING MAX(seq)<? ORDER BY cursor DESC LIMIT 100",
          )
          .all(cursor);
        for (const group of groups) {
          const rows = db
            .prepare("SELECT * FROM history WHERE COALESCE(wallet_group,id)=? ORDER BY seq DESC")
            .all(group.wallet_id);
          const wallet = summarizeWalletRecords(rows.map(publicRecord), group.wallet_id);
          if (matchesHistoryFilter(wallet, filter)) matches.push(wallet);
          if (matches.length === 21) break;
        }
        if (groups.length < 100 || matches.length === 21) break;
        cursor = groups.at(-1)!.cursor;
      }
      const records = matches.slice(0, 20);
      return {
        records,
        nextCursor: matches.length > 20 ? records.at(-1)!.cursor : null,
        totalCount: totalWalletCount,
        totalWalletCount,
      };
    },
    mnemonic(token: unknown, id: string) {
      const row = db.prepare("SELECT owner,mnemonic_secret FROM history WHERE id=?").get(id);
      return row ? decrypt(row.mnemonic_secret, row.owner + id + ":mnemonic") : undefined;
    },
    privateKey(token: unknown, id: string) {
      const row = db.prepare("SELECT owner,secret FROM history WHERE id=?").get(id);
      if (!row) return undefined;
      if (!row.secret) return null;
      return decrypt(row.secret, row.owner + id);
    },
    get(token: unknown, id: string) {
      const row = db.prepare("SELECT * FROM history WHERE id=?").get(id);
      return row ? publicRecord(row) : undefined;
    },
    // Claim without moving the history row or decrypting any wallet secrets.
    claimBalance(now = Date.now()) {
      const stale = new Date(now - 10 * 60 * 1000).toISOString();
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db
          .prepare(
            `SELECT * FROM history WHERE
          (balance_started_at IS NULL OR balance_started_at < ?)
          AND NOT EXISTS (SELECT 1 FROM query_reservations q WHERE q.target_id=history.id AND q.started_at >= ?) AND EXISTS (
            SELECT 1 FROM json_each(history.results) result
            WHERE json_extract(result.value, '$.network') IN (SELECT value FROM json_each(?))
              AND (json_extract(result.value, '$.status') = 'unqueried'
              OR (json_extract(result.value, '$.status') = 'pending' AND history.created_at < ?))
          ) ORDER BY seq ASC LIMIT 1`,
          )
          .get(stale, stale, JSON.stringify(CHAIN_ORDER), stale);
        if (!row) {
          db.exec("COMMIT");
          return null;
        }
        const results = (JSON.parse(row.results) as QueryResult[]).map((result) =>
          result.status === "unqueried" ? { ...result, status: "pending" } : result,
        );
        db.prepare(
          "UPDATE history SET query_version=?,results=?,balance_started_at=?,trigger_type='automatic' WHERE id=?",
        ).run(randomUUID(), JSON.stringify(results), new Date(now).toISOString(), row.id);
        const record = publicRecord(db.prepare("SELECT * FROM history WHERE id=?").get(row.id));
        db.exec("COMMIT");
        return record;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    balanceQueueStatus() {
      return {
        remainingRecords: db
          .prepare(
            `SELECT COUNT(*) AS count FROM history WHERE EXISTS (
        SELECT 1 FROM json_each(history.results) result WHERE json_extract(result.value, '$.status') IN ('unqueried','pending')
          AND json_extract(result.value, '$.network') IN (SELECT value FROM json_each(?))
      )`,
          )
          .get(JSON.stringify(CHAIN_ORDER))!.count,
      };
    },
    rpcCapabilities(): CapabilityEntry[] {
      const value = db
        .prepare("SELECT value FROM app_settings WHERE key='rpc-capabilities'")
        .get()?.value;
      return value ? JSON.parse(value) : [];
    },
    saveRpcCapabilities(value: CapabilityEntry[]) {
      db.prepare(
        "INSERT INTO app_settings (key,value) VALUES ('rpc-capabilities',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(JSON.stringify(value));
    },
    generationState(): GenerationSnapshot | null {
      const value = db
        .prepare("SELECT value FROM app_settings WHERE key='wallet-generation'")
        .get()?.value;
      return value ? JSON.parse(value) : null;
    },
    saveGenerationState(state: GenerationSnapshot) {
      db.prepare(
        "INSERT INTO app_settings (key,value) VALUES ('wallet-generation',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(JSON.stringify(state));
    },
    close() {
      db.close();
      key.fill(0);
    },
  };
}
