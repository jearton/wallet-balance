import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedHost } from "../src/server/server-config.ts";

test("loopback remains default; LAN hosts require explicit LAN mode", () => {
  assert.equal(isAllowedHost("localhost:4173"), true);
  assert.equal(isAllowedHost("127.0.0.1:4173"), true);
  assert.equal(isAllowedHost("[::1]:4173"), true);
  assert.equal(isAllowedHost("192.168.159.156:4173"), false);
  for (const host of [
    "192.168.159.156:4173",
    "10.0.1.1:4173",
    "172.16.0.1:4173",
    "172.31.255.1:4173",
  ]) {
    assert.equal(isAllowedHost(host, { allowLan: true }), true);
  }
});

test("arbitrary domains and public addresses stay blocked in LAN mode", () => {
  for (const host of [
    undefined,
    "",
    "evil.example:4173",
    "192.168.1.1.evil.example",
    "8.8.8.8:4173",
    "172.32.1.1",
    "localhost@evil.example",
    "localhost/path",
    "localhost:bad",
  ]) {
    assert.equal(isAllowedHost(host, { allowLan: true }), false);
  }
  assert.equal(
    isAllowedHost("wallet-balance.orb.local", { extraHosts: ["wallet-balance.orb.local"] }),
    true,
  );
  assert.equal(
    isAllowedHost("wallet-balance.orb.local.evil.example", {
      extraHosts: ["wallet-balance.orb.local"],
    }),
    false,
  );
});
