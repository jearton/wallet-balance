import test from "node:test";
import assert from "node:assert/strict";
import { withNodeRetries } from "../src/shared/node-retry.ts";
test("read succeeds on the third retry and stops without repeating a success", async () => {
  let calls = 0;
  const result = await withNodeRetries(
    async () => {
      if (++calls < 4) throw new Error("rate limited");
      return "balance";
    },
    { delay: 0 },
  );
  assert.equal(result, "balance");
  assert.equal(calls, 4);
});
test("failed reads stop after the initial attempt and at most three retries", async () => {
  let calls = 0;
  await assert.rejects(
    withNodeRetries(
      async () => {
        calls++;
        throw new Error("offline");
      },
      { delay: 0 },
    ),
    /offline/,
  );
  assert.equal(calls, 4);
});

test("explicitly unsupported operations stop immediately without spending retry attempts", async () => {
  let calls = 0;
  await assert.rejects(
    withNodeRetries(
      async () => {
        calls++;
        const error = new Error("unsupported");
        error.retryable = false;
        throw error;
      },
      { delay: 0 },
    ),
    /unsupported/,
  );
  assert.equal(calls, 1);
});
