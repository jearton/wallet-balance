import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addCommitEmoji } from "../scripts/lib/commit-convention.mjs";
import { generateChangelog } from "../scripts/lib/changelog.mjs";

test("commit icons are added to headers once, preserving scope, breaking marker and body", () => {
  assert.equal(
    addCommitEmoji("feat(history)!: new API\n\nBREAKING CHANGE: changed API"),
    "feat(history)!: ✨ new API\n\nBREAKING CHANGE: changed API",
  );
  assert.equal(addCommitEmoji("fix: 🐛 repair"), "fix: 🐛 repair");
  assert.equal(
    addCommitEmoji("legacy title\n\nfix: body example"),
    "legacy title\n\nfix: body example",
  );
});

test("commitlint accepts conventional emoji commits and rejects missing or incorrect icons", () => {
  const check = (message) =>
    spawnSync(process.execPath, ["node_modules/@commitlint/cli/cli.js"], {
      input: message,
      encoding: "utf8",
    });
  for (const message of [
    "feat(history): ✨ add history",
    "fix!: 🐛 replace API\n\nBREAKING CHANGE: new API",
    "docs: 📝 document setup",
  ]) {
    const result = check(message);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  for (const message of ["add history", "feat: no emoji", "fix: ✨ wrong icon", "feat: ✨ "]) {
    assert.notEqual(check(message).status, 0, message);
  }
});

test("release changelog uses only the selected version range, groups commits and keeps breaking notes", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "wallet-release-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init", "-b", "main");
  git("config", "user.name", "Release Test");
  git("config", "user.email", "release@example.test");
  const commit = (message) => git("commit", "--allow-empty", "-m", message);
  commit("feat: ✨ older feature");
  git("tag", "v1.0.0");
  commit("feat(history)!: ✨ add replacement API\n\nBREAKING CHANGE: old API removed");
  commit("fix(balances): 🐛 repair retry");
  commit("docs: 📝 explain setup");
  const options = { cwd, version: "1.1.0", repository: "https://github.com/example/wallet.git" };
  const preview = await generateChangelog(options);
  assert.match(preview, /Features/);
  assert.match(preview, /Bug Fixes/);
  assert.match(preview, /Documentation/);
  assert.match(preview, /BREAKING CHANGE/);
  assert.match(preview, /old API removed/);
  assert.match(preview, /compare\/v1\.0\.0\.\.\.v1\.1\.0/);
  assert.doesNotMatch(preview, /older feature/);
  assert.equal(preview.match(/^## /gm)?.length, 1, preview);
  git("tag", "v1.1.0");
  commit("feat: ✨ future feature");
  const released = await generateChangelog(options);
  assert.match(released, /repair retry/);
  assert.doesNotMatch(released, /future feature|older feature/);
  assert.equal(released.match(/^## /gm)?.length, 1, released);
});
