import { readFileSync, writeFileSync } from "node:fs";
import { generateChangelog } from "./lib/changelog.mjs";

const { version, repository } = JSON.parse(readFileSync("package.json", "utf8"));
const section = await generateChangelog({ version, repository: repository.url });
if (process.argv.includes("--stdout")) {
  console.log(section);
} else {
  const previous = readFileSync("CHANGELOG.md", "utf8");
  if (new RegExp(`^##? .*${version.replaceAll(".", "\\.")}\\b`, "m").test(previous))
    throw new Error("Version already exists in CHANGELOG.md; bump package version first");
  writeFileSync(
    "CHANGELOG.md",
    `# Changelog\n\n${section}\n\n${previous.replace(/^# Changelog\s*/, "")}`,
  );
}
