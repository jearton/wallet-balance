import { readFileSync, writeFileSync } from "node:fs";
import { addCommitEmoji } from "./lib/commit-convention.mjs";

const path = process.argv[2];
if (!path) throw new Error("Commit message file is required");
const message = readFileSync(path, "utf8");
const updated = addCommitEmoji(message);
if (updated !== message) writeFileSync(path, updated);
